/**
 * Sync engine: keeps this device's copy of a shared tournament and the
 * private data repo in step, file by file. No UI here.
 *
 * For every file we remember the "base": the version (SHA + text) we last
 * saw on GitHub. Then:
 *   - local text == base text           -> nothing to upload
 *   - local text != base text           -> we changed it; upload with the base SHA
 *   - remote SHA != base SHA            -> someone else changed it; download
 *   - both changed (and differently)    -> CONFLICT: never silently overwrite;
 *                                          the person chooses (see resolve*)
 *
 * GitHub's "update a file" call only succeeds if the SHA we send is still the
 * current one, so two people can never overwrite each other by accident.
 */
import { ballotPath, canonical, canonicalText, parsePath, type Files } from './layout';
import { RemoteError, type Remote } from './remote';

export interface FileBase {
  sha: string;
  text: string;
}

export type ConflictKind =
  /** We and someone else both changed the same file. */
  | 'both-changed'
  /** We both created a file at the same path (e.g. two people saved "ballot 3"). */
  | 'both-created'
  /** They deleted a file we changed. */
  | 'they-deleted'
  /** We deleted a file they changed. */
  | 'we-deleted';

export interface Conflict {
  path: string;
  kind: ConflictKind;
  /** Their current version (canonical text), or null if they deleted it. */
  theirs: string | null;
  theirSha: string | null;
  detectedAt: string;
}

export interface SyncState {
  base: Record<string, FileBase>;
  conflicts: Record<string, Conflict>;
}

export const emptyState = (): SyncState => ({ base: {}, conflicts: {} });

const inSlug = (slug: string) => (path: string) => parsePath(path)?.slug === slug;
const now = () => new Date().toISOString();

// ------------------------------------------------------------------ pull

export interface PullResult {
  state: SyncState;
  /** The merged local files. */
  files: Files;
  /** Paths whose local copy changed because of someone else's edit. */
  changed: string[];
  /** Files that couldn't be read. */
  problems: string[];
}

/**
 * Download other people's changes for one tournament.
 * `getLocal` is called AFTER all network waits, so edits made while we were
 * downloading are never overwritten.
 */
export async function pull(remote: Remote, slug: string, getLocal: () => Files, start: SyncState): Promise<PullResult> {
  const tree = await remote.tree();
  const remoteFiles = new Map([...tree].filter(([p]) => inSlug(slug)(p)));
  const problems: string[] = [];

  // Download only what's new to us.
  const fetched = new Map<string, string>();
  for (const [path, sha] of remoteFiles) {
    if (start.base[path]?.sha === sha) continue;
    if (start.conflicts[path]?.theirSha === sha) continue; // already shown to the user
    try {
      fetched.set(path, canonicalText(await remote.blob(sha)));
    } catch (e) {
      if (e instanceof RemoteError) throw e;
      problems.push(`${path} is not valid JSON; skipped.`);
    }
  }

  // ---- no awaits below this line ----
  const local = { ...getLocal() };
  const state: SyncState = { base: { ...start.base }, conflicts: { ...start.conflicts } };
  const changed: string[] = [];

  for (const [path, text] of fetched) {
    const sha = remoteFiles.get(path)!;
    const base = state.base[path];
    const mine = local[path];
    const dirty = mine !== base?.text;
    if (!dirty || mine === text) {
      if (mine !== text) changed.push(path);
      local[path] = text;
      state.base[path] = { sha, text };
      delete state.conflicts[path];
    } else {
      state.conflicts[path] = {
        path,
        kind: mine === undefined ? 'we-deleted' : base ? 'both-changed' : 'both-created',
        theirs: text,
        theirSha: sha,
        detectedAt: now(),
      };
    }
  }

  // Files that disappeared from GitHub.
  for (const path of Object.keys(state.base).filter(inSlug(slug))) {
    if (remoteFiles.has(path)) continue;
    const mine = local[path];
    if (mine === state.base[path]!.text) {
      delete local[path];
      delete state.base[path];
      changed.push(path);
    } else if (mine === undefined) {
      delete state.base[path]; // we both deleted it
      delete state.conflicts[path];
    } else if (state.conflicts[path]?.kind !== 'they-deleted') {
      state.conflicts[path] = { path, kind: 'they-deleted', theirs: null, theirSha: null, detectedAt: now() };
    }
  }

  return { state, files: local, changed, problems };
}

// ------------------------------------------------------------------ push

/** Paths with local changes that are waiting to be uploaded (conflicts excluded). */
export function pendingPaths(slug: string, local: Files, state: SyncState): string[] {
  const paths = new Set([...Object.keys(local), ...Object.keys(state.base)].filter(inSlug(slug)));
  return [...paths].filter((p) => !state.conflicts[p] && local[p] !== state.base[p]?.text).sort(uploadOrder);
}

/** Tournament file first, then round files, then ballots: a reader never sees ballots without their setup. */
function uploadOrder(a: string, b: string): number {
  const rank = (p: string) => ({ tournament: 0, round: 1, ballot: 2 })[parsePath(p)?.kind ?? 'ballot'];
  return rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true });
}

function commitMessage(path: string, op: 'create' | 'update' | 'delete', who: string): string {
  const p = parsePath(path);
  const what =
    p?.kind === 'tournament' ? 'tournament setup' : p?.kind === 'round' ? `round ${p.round} setup` : p ? `round ${p.round} ballot ${p.seat}` : path;
  const verb = op === 'create' ? 'Add' : op === 'update' ? 'Update' : 'Delete';
  return `${verb} ${what}${who ? ` (${who})` : ''} via Deviations app`;
}

export interface PushResult {
  state: SyncState;
  uploaded: string[];
  /** Set if we had to stop early (offline, token problem...). Uploaded files stay uploaded. */
  error: RemoteError | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Upload our changes, one file at a time (GitHub requires one write at a
 * time per repo). A file that changed on GitHub since we last saw it becomes
 * a conflict instead of being overwritten.
 */
export async function push(
  remote: Remote,
  slug: string,
  getLocal: () => Files,
  start: SyncState,
  who = '',
  retryDelayMs = 800,
): Promise<PushResult> {
  const state: SyncState = { base: { ...start.base }, conflicts: { ...start.conflicts } };
  const uploaded: string[] = [];

  for (const path of pendingPaths(slug, getLocal(), state)) {
    for (let attempt = 0; ; attempt++) {
      const mine = getLocal()[path]; // read fresh each time
      const base = state.base[path];
      if (mine === base?.text) break; // nothing to do any more
      try {
        if (mine !== undefined) {
          const sha = await remote.put(path, mine, base?.sha, commitMessage(path, base ? 'update' : 'create', who));
          state.base[path] = { sha, text: mine };
        } else if (base) {
          await remote.del(path, base.sha, commitMessage(path, 'delete', who));
          delete state.base[path];
        }
        uploaded.push(path);
        break;
      } catch (e) {
        if (!(e instanceof RemoteError)) throw e;
        if (e.kind === 'notfound' && mine === undefined) {
          delete state.base[path]; // already gone
          break;
        }
        if (e.kind !== 'conflict') return { state, uploaded, error: e };

        // Did the FILE change, or did someone else's save to another file just
        // land at the same moment? Look at the file itself.
        let current: { text: string; sha: string } | null;
        try {
          current = await remote.get(path);
        } catch (e2) {
          if (e2 instanceof RemoteError) return { state, uploaded, error: e2 };
          throw e2;
        }
        const sameAsBase = current ? current.sha === base?.sha : !base;
        if (sameAsBase && attempt < 3) {
          await sleep(retryDelayMs * (attempt + 1)); // brief collision with another save; retry
          continue;
        }
        const theirs = current ? canonicalText(current.text) : null;
        if (theirs !== null && theirs === mine) {
          state.base[path] = { sha: current!.sha, text: theirs }; // they saved exactly what we have
          break;
        }
        if (theirs === null && mine === undefined) {
          delete state.base[path];
          break;
        }
        state.conflicts[path] = {
          path,
          kind: mine === undefined ? 'we-deleted' : theirs === null ? 'they-deleted' : base ? 'both-changed' : 'both-created',
          theirs,
          theirSha: current?.sha ?? null,
          detectedAt: now(),
        };
        break;
      }
    }
  }
  return { state, uploaded, error: null };
}

// ------------------------------------------------------------------ resolving conflicts

/** Accept their version (or their deletion). Returns new local files + state. */
export function resolveKeepTheirs(path: string, local: Files, start: SyncState): { files: Files; state: SyncState } {
  const c = start.conflicts[path];
  const files = { ...local };
  const state: SyncState = { base: { ...start.base }, conflicts: { ...start.conflicts } };
  if (!c) return { files, state };
  if (c.theirs === null) {
    delete files[path];
    delete state.base[path];
  } else {
    files[path] = c.theirs;
    state.base[path] = { sha: c.theirSha!, text: c.theirs };
  }
  delete state.conflicts[path];
  return { files, state };
}

/**
 * Keep our version: the next upload replaces theirs (or re-creates the file,
 * or deletes it if we deleted it).
 */
export function resolveKeepMine(path: string, start: SyncState): SyncState {
  const c = start.conflicts[path];
  const state: SyncState = { base: { ...start.base }, conflicts: { ...start.conflicts } };
  if (!c) return state;
  if (c.theirs === null) delete state.base[path];
  else state.base[path] = { sha: c.theirSha!, text: c.theirs };
  delete state.conflicts[path];
  return state;
}

/**
 * Two people saved the same ballot number: keep theirs where it is and move
 * ours to a new ballot number.
 */
export function resolveMoveMine(path: string, newSeat: number, local: Files, start: SyncState): { files: Files; state: SyncState; newPath: string } {
  const p = parsePath(path);
  if (!p || p.kind !== 'ballot') throw new Error('Only ballots can be moved');
  const mine = local[path];
  const { files, state } = resolveKeepTheirs(path, local, start);
  const newPath = ballotPath(p.slug, p.round, newSeat);
  if (mine !== undefined) files[newPath] = canonical({ ...JSON.parse(mine), seat: newSeat });
  return { files, state, newPath };
}
