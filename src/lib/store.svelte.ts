/**
 * App state: every tournament on this device, plus unsaved ballot drafts.
 *
 * Both are saved to localStorage automatically (see App.svelte). In Phase 3
 * the tournaments move to the private GitHub data repo; drafts stay local so
 * an in-progress ballot survives bad Wi-Fi.
 */
import { PERF_IDS, type PerfId } from '../model/performances';
import { SCHEMA_VERSION, type Ballot, type Round, type TournamentData } from '../model/types';
import { KEYS, loadJSON } from './storage';

export interface Draft {
  judge: string;
  /** What was typed in each box, exactly (may be blank or invalid). */
  raw: Partial<Record<PerfId, string>>;
  /** When the draft was last changed. */
  updatedAt: string;
  /** updatedAt of the saved ballot this draft started from, if any. */
  baseUpdatedAt?: string;
}

export const db = $state<{ tournaments: Record<string, TournamentData> }>({
  tournaments: loadJSON<Record<string, TournamentData>>(KEYS.tournaments) ?? {},
});

export const drafts = $state<Record<string, Draft>>(loadJSON<Record<string, Draft>>(KEYS.drafts) ?? {});

export const draftKey = (tournamentId: string, round: number, seat: number) => `${tournamentId}|${round}|${seat}`;

export function draftsFor(tournamentId: string): { round: number; seat: number; draft: Draft }[] {
  return Object.entries(drafts)
    .filter(([k]) => k.startsWith(`${tournamentId}|`))
    .map(([k, draft]) => {
      const [, round, seat] = k.split('|');
      return { round: Number(round), seat: Number(seat), draft };
    });
}

// ------------------------------------------------------------ ids

export function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'tournament'
  );
}

function uniqueTournamentId(base: string): string {
  let id = slugify(base);
  for (let n = 2; db.tournaments[id]; n++) id = `${slugify(base)}-${n}`;
  return id;
}

// ------------------------------------------------------------ tournaments

const emptyLineup = () => ({ a1: null, a2: null, a3: null, w1: null, w2: null, w3: null });

export function createTournament(name: string): string {
  const year = new Date().getFullYear();
  const id = uniqueTournamentId(`${year}-${name}`);
  const rounds: Round[] = (['P', 'D', 'P', 'D'] as const).map((side, i) => ({
    number: i + 1,
    side,
    opponent: '',
    characters: {},
  }));
  db.tournaments[id] = {
    tournament: {
      schemaVersion: SCHEMA_VERSION,
      id,
      name,
      ourTeamLabel: '',
      pSideLabel: 'Plaintiff',
      roster: [],
      lineups: { P: emptyLineup(), D: emptyLineup() },
    },
    rounds,
    ballots: [],
  };
  return id;
}

export function deleteTournament(id: string): void {
  delete db.tournaments[id];
  for (const k of Object.keys(drafts)) if (k.startsWith(`${id}|`)) delete drafts[k];
}

/** Add an imported tournament. If the id is taken, `replace` decides between overwriting and adding a copy. */
export function addTournament(data: TournamentData, replace: boolean): string {
  let id = data.tournament.id;
  if (db.tournaments[id] && !replace) {
    id = uniqueTournamentId(id);
    data = { ...data, tournament: { ...data.tournament, id } };
  }
  db.tournaments[id] = data;
  return id;
}

// ------------------------------------------------------------ ballots

/** The next free ballot number in a round (counting unsaved drafts too). */
export function nextSeat(td: TournamentData, round: number): number {
  const used = [
    ...td.ballots.filter((b) => b.round === round).map((b) => b.seat),
    ...draftsFor(td.tournament.id)
      .filter((d) => d.round === round)
      .map((d) => d.seat),
  ];
  return used.length ? Math.max(...used) + 1 : 1;
}

export function saveBallot(td: TournamentData, ballot: Ballot): void {
  const i = td.ballots.findIndex((b) => b.round === ballot.round && b.seat === ballot.seat);
  const stamped = { ...ballot, updatedAt: new Date().toISOString() };
  if (i >= 0) td.ballots[i] = stamped;
  else td.ballots.push(stamped);
  delete drafts[draftKey(td.tournament.id, ballot.round, ballot.seat)];
}

export function deleteBallot(td: TournamentData, round: number, seat: number): void {
  td.ballots = td.ballots.filter((b) => !(b.round === round && b.seat === seat));
  delete drafts[draftKey(td.tournament.id, round, seat)];
}

/** Turn typed text into scores: only whole numbers 1-10 are kept. */
export function parseRaw(raw: Partial<Record<PerfId, string>>): Ballot['scores'] {
  const scores: Ballot['scores'] = {};
  for (const id of PERF_IDS) {
    const v = raw[id]?.trim();
    if (v && /^\d+$/.test(v)) scores[id] = Number(v);
  }
  return scores;
}
