/**
 * Turns a fixture in the golden-file layout (src/fixtures/synthetic.json, or
 * the private reference/golden_drexel.json) into our data model. Used by the
 * tests and by the app's "load sample tournament" button.
 * The golden file uses the OLD sheet's slot names; this maps them to our
 * stable performance IDs.
 */
import type { PerfId, Side, Slot } from './performances';
import { SCHEMA_VERSION, type Ballot, type Person, type Round, type TournamentData } from './types';

type Scores = Record<string, number>;
export interface GoldenSide {
  sheet: string;
  roster: { opener: string; swing: string; closer: string; w1: [string, string]; w2: [string, string]; w3: [string, string] };
  rounds: { round_on_side: number; opponent: string; ballots: { judge: string; our: Scores; opp: Scores }[] }[];
  expected: Record<string, { per_ballot: Record<string, number | string | null>[]; summary: Record<string, number | null> }>;
  ballot_results: { round: number; judge: string; our_points: number; opp_points: number; differential: number; result: string }[];
}
export interface Golden {
  sides: Record<Side, GoldenSide>;
}

/** Golden role name -> our lineup slot. */
export const GOLDEN_ROLE_SLOT: Record<string, Slot> = {
  opener: 'a1',
  swing: 'a2',
  closer: 'a3',
  w1: 'w1',
  w2: 'w2',
  w3: 'w3',
};

function ourId(key: string): PerfId {
  if (key === 'opening') return 'us.open';
  if (key === 'closing') return 'us.close';
  const m = /^(atty|w)(\d)_(direct|cross)$/.exec(key);
  if (!m) throw new Error(`unknown golden key ${key}`);
  const [, kind, n, ex] = m;
  return (kind === 'atty' ? `us.a${n}.${ex === 'direct' ? 'dx' : 'cx'}` : `us.w${n}.${ex === 'direct' ? 'd' : 'c'}`) as PerfId;
}

function oppId(key: string): PerfId {
  if (key === 'opening') return 'op.open';
  if (key === 'closing') return 'op.close';
  const m = /^(atty|w)(\d)_(direct|cross)$/.exec(key);
  if (!m) throw new Error(`unknown golden key ${key}`);
  const [, kind, n, ex] = m;
  if (kind === 'atty') return (ex === 'direct' ? `op.w${n}.dx` : `op.cx.w${n}`) as PerfId;
  return `op.w${n}.${ex === 'direct' ? 'd' : 'c'}` as PerfId;
}

/** Golden side P rounds become tournament rounds 1-2, side D rounds become 3-4. */
export const roundNumber = (side: Side, roundOnSide: number) => (side === 'P' ? 0 : 2) + roundOnSide;

export function goldenToTournament(
  g: Golden,
  meta: { id: string; name: string } = { id: 'sample-tournament', name: 'Sample tournament (made-up data)' },
): TournamentData {
  const roster: Person[] = [];
  const idFor = (name: string) => {
    let p = roster.find((x) => x.name === name);
    if (!p) roster.push((p = { id: `p${roster.length + 1}`, name }));
    return p.id;
  };
  const rounds: Round[] = [];
  const ballots: Ballot[] = [];
  const lineups = {} as TournamentData['tournament']['lineups'];

  for (const side of ['P', 'D'] as const) {
    const s = g.sides[side];
    lineups[side] = {
      a1: idFor(s.roster.opener),
      a2: idFor(s.roster.swing),
      a3: idFor(s.roster.closer),
      w1: idFor(s.roster.w1[0]),
      w2: idFor(s.roster.w2[0]),
      w3: idFor(s.roster.w3[0]),
    };
    for (const r of s.rounds) {
      const number = roundNumber(side, r.round_on_side);
      rounds.push({
        number,
        side,
        opponent: r.opponent,
        characters: { w1: s.roster.w1[1], w2: s.roster.w2[1], w3: s.roster.w3[1] },
      });
      r.ballots.forEach((b, i) => {
        const scores: Ballot['scores'] = {};
        for (const [k, v] of Object.entries(b.our)) scores[ourId(k)] = v;
        for (const [k, v] of Object.entries(b.opp)) scores[oppId(k)] = v;
        ballots.push({ round: number, seat: i + 1, judge: b.judge, scores });
      });
    }
  }

  return {
    tournament: {
      schemaVersion: SCHEMA_VERSION,
      id: meta.id,
      name: meta.name,
      ourTeamLabel: 'Our team',
      pSideLabel: 'Plaintiff',
      roster,
      lineups,
    },
    rounds,
    ballots,
  };
}
