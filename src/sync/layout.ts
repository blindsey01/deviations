/**
 * How a tournament is laid out as files in the private data repo:
 *
 *   <slug>/tournament.json         metadata, roster, lineups
 *   <slug>/round-<N>/round.json    side, opponent, characters, substitutes, who-examined-whom
 *   <slug>/round-<N>/ballot-<K>.json   one judge's ballot
 *
 * One file per ballot means people entering different ballots never edit
 * the same file. Files are written as "canonical" JSON (sorted keys, two-space
 * indent) so the same data always produces exactly the same text, which is
 * how we tell whether something changed.
 */
import type { Ballot, Round, Tournament, TournamentData } from '../model/types';

/** path -> canonical JSON text */
export type Files = Record<string, string>;

export const tournamentPath = (slug: string) => `${slug}/tournament.json`;
export const roundPath = (slug: string, round: number) => `${slug}/round-${round}/round.json`;
export const ballotPath = (slug: string, round: number, seat: number) => `${slug}/round-${round}/ballot-${seat}.json`;

export type ParsedPath =
  | { slug: string; kind: 'tournament' }
  | { slug: string; kind: 'round'; round: number }
  | { slug: string; kind: 'ballot'; round: number; seat: number };

const RE = /^([a-z0-9][a-z0-9-]*)\/(?:(tournament)\.json|round-(\d+)\/(?:(round)\.json|ballot-(\d+)\.json))$/;

/** Recognize one of our files; anything else in the repo (README etc.) is ignored. */
export function parsePath(path: string): ParsedPath | null {
  const m = RE.exec(path);
  if (!m) return null;
  const slug = m[1]!;
  if (m[2]) return { slug, kind: 'tournament' };
  const round = Number(m[3]);
  if (m[4]) return { slug, kind: 'round', round };
  return { slug, kind: 'ballot', round, seat: Number(m[5]) };
}

export function describePath(path: string): string {
  const p = parsePath(path);
  if (!p) return path;
  if (p.kind === 'tournament') return 'Tournament setup (details, roster, lineups)';
  if (p.kind === 'round') return `Round ${p.round} setup`;
  return `Round ${p.round}, ballot ${p.seat}`;
}

/** Folder-safe tournament id. */
export const isValidSlug = (s: string) => /^[a-z0-9][a-z0-9-]*$/.test(s);

function sortKeys(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(sortKeys);
  if (x && typeof x === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(x).sort()) {
      const v = (x as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return x;
}

export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2) + '\n';
}

/** Re-format any JSON text into canonical form (throws on invalid JSON). */
export function canonicalText(text: string): string {
  return canonical(JSON.parse(text));
}

export function splitTournament(td: TournamentData): Files {
  const slug = td.tournament.id;
  const files: Files = { [tournamentPath(slug)]: canonical(td.tournament) };
  for (const r of td.rounds) files[roundPath(slug, r.number)] = canonical(r);
  for (const b of td.ballots) files[ballotPath(slug, b.round, b.seat)] = canonical(b);
  return files;
}

/**
 * Rebuild a tournament from its files. Returns null if tournament.json is
 * missing (e.g. someone is still uploading it). Files that don't parse are
 * reported in `problems` and skipped.
 */
export function assembleTournament(slug: string, files: Files): { data: TournamentData; problems: string[] } | null {
  const problems: string[] = [];
  let tournament: Tournament | undefined;
  const rounds: Round[] = [];
  const ballots: Ballot[] = [];
  for (const [path, text] of Object.entries(files)) {
    const p = parsePath(path);
    if (!p || p.slug !== slug) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(text);
    } catch {
      problems.push(`${describePath(path)}: the file isn't valid JSON, so it was skipped.`);
      continue;
    }
    if (p.kind === 'tournament') tournament = { ...(obj as Tournament), id: slug };
    else if (p.kind === 'round') rounds.push({ ...(obj as Round), number: p.round });
    else ballots.push({ ...(obj as Ballot), round: p.round, seat: p.seat });
  }
  if (!tournament) return null;
  rounds.sort((a, b) => a.number - b.number);
  ballots.sort((a, b) => a.round - b.round || a.seat - b.seat);
  return { data: { tournament, rounds, ballots }, problems };
}
