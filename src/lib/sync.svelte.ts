/**
 * Shared storage: connects the app's tournaments to the private GitHub data
 * repo using the sync engine (src/sync/engine.ts).
 *
 *  - Each tournament is either "on this device only" or "shared".
 *  - Shared tournaments are still kept on the device, so the app works with
 *    no signal; changes upload when the connection comes back.
 *  - Changes upload a moment after you make them; other people's changes
 *    download when you open a tournament, every minute while it's open, and
 *    when you come back to the app.
 */
import type { TournamentData } from '../model/types';
import {
  emptyState,
  pendingPaths,
  pull,
  push,
  resolveKeepMine,
  resolveKeepTheirs,
  resolveMoveMine,
  type SyncState,
} from '../sync/engine';
import { assembleTournament, parsePath, splitTournament, tournamentPath, type Files } from '../sync/layout';
import { GitHubRemote, RemoteError, verifyConnection, type GhConfig, type Remote } from '../sync/remote';
import { KEYS, loadJSON } from './storage';
import { db, deleteTournament, drafts } from './store.svelte';

export interface SharedInfo extends SyncState {
  /** "owner/repo" this tournament syncs with (so switching repos can't mix data). */
  repo: string;
  lastSync?: string;
  error?: string;
  errorKind?: string;
  busy?: boolean;
  problems?: string[];
}

export const conn = $state<{ cfg: GhConfig | null }>({ cfg: loadJSON<GhConfig>(KEYS.github) ?? null });
export const shared = $state<Record<string, SharedInfo>>(loadJSON<Record<string, SharedInfo>>(KEYS.sync) ?? {});
export const net = $state({ online: typeof navigator === 'undefined' ? true : navigator.onLine });
// A sync can't still be running after a reload.
for (const s of Object.values(shared)) s.busy = false;

export const repoKey = (cfg: GhConfig | null) => (cfg ? `${cfg.owner}/${cfg.repo}` : '');
export const isShared = (id: string) => id in shared;
/** Shared AND connected to the repo it belongs to. */
const canSync = (id: string) => !!conn.cfg && shared[id]?.repo === repoKey(conn.cfg);

let remoteFactory: (cfg: GhConfig) => Remote = (cfg) => new GitHubRemote(cfg);
/** For tests: swap in a fake GitHub. */
export function useRemoteFactory(f: (cfg: GhConfig) => Remote) {
  remoteFactory = f;
}

// ------------------------------------------------------------------ local files

export function localFiles(id: string): Files {
  const td = db.tournaments[id];
  return td ? splitTournament($state.snapshot(td) as TournamentData) : {};
}

function stateOf(id: string): SyncState {
  const s = $state.snapshot(shared[id]!) as SharedInfo;
  return { base: s.base, conflicts: s.conflicts };
}

function setState(id: string, st: SyncState) {
  const s = shared[id];
  if (!s) return;
  s.base = st.base;
  s.conflicts = st.conflicts;
}

/** Replace the local tournament with these files, keeping the same object so open screens stay attached. */
function applyFiles(id: string, files: Files) {
  const a = assembleTournament(id, files);
  if (!a) return;
  const cur = db.tournaments[id];
  if (cur) {
    cur.tournament = a.data.tournament;
    cur.rounds = a.data.rounds;
    cur.ballots = a.data.ballots;
  } else db.tournaments[id] = a.data;
  if (shared[id]) shared[id].problems = a.problems;
}

export function pendingCount(id: string): number {
  const s = shared[id];
  return s ? pendingPaths(id, localFiles(id), s).length : 0;
}

export function pendingSet(id: string): Set<string> {
  const s = shared[id];
  return new Set(s ? pendingPaths(id, localFiles(id), s) : []);
}

// ------------------------------------------------------------------ syncing

const running = new Map<string, Promise<void>>();
const again = new Set<string>();

/** Download others' changes, then upload ours. Safe to call any time; calls queue up. */
export function syncNow(id: string): Promise<void> {
  if (!canSync(id)) return Promise.resolve();
  const existing = running.get(id);
  if (existing) {
    again.add(id);
    return existing;
  }
  const p = (async () => {
    try {
      do {
        again.delete(id);
        await syncOnce(id);
      } while (again.has(id) && canSync(id));
    } finally {
      running.delete(id);
    }
  })();
  running.set(id, p);
  return p;
}

async function syncOnce(id: string) {
  const cfg = conn.cfg!;
  const remote = remoteFactory(cfg);
  const s = shared[id]!;
  s.busy = true;
  try {
    const pr = await pull(remote, id, () => localFiles(id), stateOf(id));
    if (!shared[id]) return; // removed while we were working
    setState(id, pr.state);
    if (pr.changed.length) applyFiles(id, pr.files);
    if (!db.tournaments[id]) throw new RemoteError('notfound', 'This tournament isn’t in the data repo (yet).');

    const pu = await push(remote, id, () => localFiles(id), stateOf(id), cfg.login);
    if (!shared[id]) return;
    setState(id, pu.state);
    if (pu.error) throw pu.error;
    s.error = undefined;
    s.errorKind = undefined;
    s.lastSync = new Date().toISOString();
    net.online = true;
  } catch (e) {
    if (!(e instanceof RemoteError)) throw e;
    s.error = e.message;
    s.errorKind = e.kind;
    if (e.kind === 'network') net.online = false;
  } finally {
    s.busy = false;
  }
}

/** Wait until any sync in progress for this tournament has finished. */
async function idle(id: string) {
  await running.get(id);
}

// Upload changes shortly after they're made (called from App.svelte on every change).
const timers = new Map<string, ReturnType<typeof setTimeout>>();
export function scheduleUploads() {
  for (const id of Object.keys(shared)) {
    if (!canSync(id) || pendingCount(id) === 0) continue;
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => void syncNow(id), 1200));
  }
}

/** Sync everything that has changes waiting, plus the tournament on screen. */
export function syncActive(currentId?: string) {
  for (const id of Object.keys(shared)) if (pendingCount(id) > 0 || id === currentId) void syncNow(id);
}

// ------------------------------------------------------------------ connecting

export async function connect(token: string, owner: string, repo: string) {
  const v = await verifyConnection(token.trim(), owner.trim(), repo.trim());
  conn.cfg = { token: token.trim(), owner: owner.trim(), repo: repo.trim(), branch: v.branch, login: v.login };
  remoteList.items = [];
  return v;
}

/** Forget the token. Shared tournaments with unsent changes can optionally be kept on the device. */
export function disconnect(removeSharedFromDevice: boolean) {
  conn.cfg = null;
  remoteList.items = [];
  if (removeSharedFromDevice) for (const id of Object.keys(shared)) forget(id);
}

/** Remove a shared tournament from this device only. It stays in the data repo. */
export function forget(id: string) {
  delete shared[id];
  deleteTournament(id);
}

// ------------------------------------------------------------------ the team's tournaments

export interface RemoteTournament {
  slug: string;
  name: string;
  startDate?: string;
  endDate?: string;
}

export const remoteList = $state<{ loading: boolean; error: string; items: RemoteTournament[] }>({
  loading: false,
  error: '',
  items: [],
});
const blobCache = new Map<string, string>();

export async function refreshRemoteList() {
  if (!conn.cfg) return;
  const remote = remoteFactory(conn.cfg);
  remoteList.loading = true;
  remoteList.error = '';
  try {
    const tree = await remote.tree();
    const items: RemoteTournament[] = [];
    for (const [path, sha] of tree) {
      const p = parsePath(path);
      if (p?.kind !== 'tournament') continue;
      let text = blobCache.get(sha);
      if (text === undefined) blobCache.set(sha, (text = await remote.blob(sha)));
      try {
        const t = JSON.parse(text) as { name?: string; startDate?: string; endDate?: string };
        items.push({ slug: p.slug, name: t.name || p.slug, startDate: t.startDate, endDate: t.endDate });
      } catch {
        items.push({ slug: p.slug, name: `${p.slug} (unreadable)` });
      }
    }
    remoteList.items = items.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? '') || a.name.localeCompare(b.name));
    net.online = true;
  } catch (e) {
    remoteList.error = e instanceof RemoteError ? e.message : String(e);
    if (e instanceof RemoteError && e.kind === 'network') net.online = false;
  } finally {
    remoteList.loading = false;
  }
}

/** Put a copy of a team tournament on this device and keep it in sync. */
export async function download(slug: string) {
  if (db.tournaments[slug] && !shared[slug])
    throw new Error(`A tournament on this device already uses the folder name “${slug}”. Rename or delete it first.`);
  shared[slug] ??= { ...emptyState(), repo: repoKey(conn.cfg) };
  await syncNow(slug);
  if (!db.tournaments[slug]) {
    const err = shared[slug]?.error;
    delete shared[slug];
    throw new Error(err ?? 'Couldn’t download that tournament.');
  }
}

/** Upload a tournament that so far lived only on this device. */
export async function share(id: string) {
  if (!conn.cfg) throw new Error('Connect to GitHub first (Settings).');
  const tree = await remoteFactory(conn.cfg).tree();
  if ([...tree.keys()].some((p) => p.startsWith(`${id}/`)))
    throw new Error(`The team repo already has a tournament in a folder named “${id}”. Change this tournament’s folder name first.`);
  shared[id] = { ...emptyState(), repo: repoKey(conn.cfg) };
  await syncNow(id);
}

// ------------------------------------------------------------------ conflicts

export async function keepTheirs(id: string, path: string) {
  await idle(id);
  const r = resolveKeepTheirs(path, localFiles(id), stateOf(id));
  setState(id, r.state);
  applyFiles(id, r.files);
  if (parsePath(path)?.kind === 'tournament' && !r.files[tournamentPath(id)]) forget(id);
}

export async function keepMine(id: string, path: string) {
  await idle(id);
  setState(id, resolveKeepMine(path, stateOf(id)));
  void syncNow(id);
}

/** Two people saved the same ballot number: keep theirs, save mine as the next free number. */
export async function moveMine(id: string, path: string): Promise<number> {
  await idle(id);
  const p = parsePath(path);
  if (p?.kind !== 'ballot') throw new Error('Only ballots can be moved');
  const td = db.tournaments[id]!;
  const seats = [
    ...td.ballots.filter((b) => b.round === p.round).map((b) => b.seat),
    ...Object.keys(drafts)
      .filter((k) => k.startsWith(`${id}|${p.round}|`))
      .map((k) => Number(k.split('|')[2])),
  ];
  const newSeat = Math.max(0, ...seats) + 1;
  const r = resolveMoveMine(path, newSeat, localFiles(id), stateOf(id));
  setState(id, r.state);
  applyFiles(id, r.files);
  void syncNow(id);
  return newSeat;
}

// ------------------------------------------------------------------ background triggers

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    net.online = true;
    syncActive();
  });
  window.addEventListener('offline', () => (net.online = false));
}
