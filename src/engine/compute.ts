/**
 * Calculation engine. Pure functions only: data in, numbers out. No UI, no
 * storage, no network.
 *
 * Method (the old workbook's, with the G50 bug fixed, generalized to any
 * number of ballots per round):
 *  - Each ballot is computed on its own.
 *  - Benchmark for a performance type = mean of every score of that type on
 *    the ballot, both teams.
 *  - Deviation = score - benchmark for its type.
 *  - Total = mean of the person's own scores on the ballot; total deviation =
 *    Total - mean of all scores on the ballot.
 *  - Normalized (z) = deviation / population SD of all scores on the ballot.
 *  - Summaries = plain mean over ballots, each ballot weighted equally.
 *  - Missing scores are skipped (like Excel's AVERAGE), and incomplete
 *    ballots are flagged.
 */
import {
  PERFORMANCES,
  PERF_BY_ID,
  PERF_TYPES,
  SLOTS,
  SLOT_PERFS,
  isValidScore,
  roleKind,
  type CategoryKey,
  type MetricKey,
  type PerfId,
  type PerfType,
  type RoleKind,
  type Side,
  type Slot,
} from '../model/performances';
import type { Ballot, Lineup, Round, TournamentData } from '../model/types';

// ---------------------------------------------------------------- helpers

export function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Population standard deviation (divide by n), as in Excel's STDEV.P. */
export function pstdev(xs: readonly number[]): number | null {
  const m = mean(xs);
  if (m === null) return null;
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / xs.length);
}

const SD_EPSILON = 1e-12;

function zOf(dev: number | null, sd: number | null): number | null {
  if (dev === null || sd === null || sd < SD_EPSILON) return null;
  return dev / sd;
}

const byRoundThenSeat = (a: { round: number; seat: number }, b: { round: number; seat: number }) =>
  a.round - b.round || a.seat - b.seat;

// ---------------------------------------------------------------- per ballot

export interface Metric {
  /** Raw score (for Total: mean of the person's own scores). */
  score: number | null;
  /** Score minus the benchmark. */
  dev: number | null;
  /** Judge-normalized deviation; null when the ballot's SD is 0 ("n/a"). */
  z: number | null;
}

export interface PersonBallotCalc {
  slot: Slot;
  kind: RoleKind;
  /** Who filled the slot this round; null if the lineup slot is empty. */
  personId: string | null;
  /** Only the categories that apply to the slot (the Swing and witnesses have no speech). */
  metrics: Partial<Record<MetricKey, Metric>>;
}

export type BallotResult = 'W' | 'L' | 'T';

export interface BallotCalc {
  round: number;
  seat: number;
  judge: string;
  side: Side;
  opponent: string;
  /** True when all 28 scores are present and valid. */
  complete: boolean;
  /** Performances with no score. */
  missing: PerfId[];
  /** Performances whose value is not an integer 1-10 (treated as missing). */
  invalid: PerfId[];
  /** Mean of all valid scores on the ballot (the Total benchmark). */
  mean: number | null;
  /** Population SD of all valid scores on the ballot. */
  sd: number | null;
  benchmarks: Record<PerfType, number | null>;
  ourPoints: number;
  oppPoints: number;
  /** ourPoints - oppPoints. */
  differential: number;
  result: BallotResult;
  people: PersonBallotCalc[];
}

/** The lineup in effect for a round: the side's lineup plus any substitutes. */
export function lineupForRound(sideLineup: Lineup, round: Round): Lineup {
  return { ...sideLineup, ...(round.lineupOverride ?? {}) };
}

export function computeBallot(ballot: Ballot, round: Round, lineup: Lineup): BallotCalc {
  const value: Partial<Record<PerfId, number>> = {};
  const missing: PerfId[] = [];
  const invalid: PerfId[] = [];
  const byType = Object.fromEntries(PERF_TYPES.map((t) => [t, [] as number[]])) as Record<PerfType, number[]>;
  const all: number[] = [];
  let ourPoints = 0;
  let oppPoints = 0;

  for (const p of PERFORMANCES) {
    const v: unknown = ballot.scores[p.id];
    if (v === undefined || v === null) {
      missing.push(p.id);
      continue;
    }
    if (!isValidScore(v)) {
      invalid.push(p.id);
      continue;
    }
    value[p.id] = v;
    byType[p.type].push(v);
    all.push(v);
    if (p.team === 'us') ourPoints += v;
    else oppPoints += v;
  }

  const benchmarks = Object.fromEntries(PERF_TYPES.map((t) => [t, mean(byType[t])])) as Record<
    PerfType,
    number | null
  >;
  const ballotMean = mean(all);
  const sd = pstdev(all);

  const people: PersonBallotCalc[] = SLOTS.map((slot) => {
    const metrics: Partial<Record<MetricKey, Metric>> = {};
    const own: number[] = [];
    for (const [cat, pid] of Object.entries(SLOT_PERFS[slot]) as [CategoryKey, PerfId][]) {
      const score = value[pid] ?? null;
      const type = PERF_BY_ID[pid].type;
      const bench = benchmarks[type];
      const dev = score === null || bench === null ? null : score - bench;
      metrics[cat] = { score, dev, z: zOf(dev, sd) };
      if (score !== null) own.push(score);
    }
    const total = mean(own);
    const totalDev = total === null || ballotMean === null ? null : total - ballotMean;
    metrics.total = { score: total, dev: totalDev, z: zOf(totalDev, sd) };
    return { slot, kind: roleKind(slot), personId: lineup[slot] ?? null, metrics };
  });

  const differential = ourPoints - oppPoints;
  return {
    round: round.number,
    seat: ballot.seat,
    judge: ballot.judge?.trim() || `Ballot ${ballot.seat}`,
    side: round.side,
    opponent: round.opponent,
    complete: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    mean: ballotMean,
    sd,
    benchmarks,
    ourPoints,
    oppPoints,
    differential,
    result: differential > 0 ? 'W' : differential < 0 ? 'L' : 'T',
    people,
  };
}

// ---------------------------------------------------------------- results

export interface BallotRecord {
  wins: number;
  losses: number;
  ties: number;
  /** AMTA-style: a tie counts as half a ballot for each team. */
  ballotsWon: number;
  ballotsLost: number;
  /** Ballots in this record that are missing scores (their result may change). */
  incomplete: number;
}

export interface RoundCalc extends BallotRecord {
  round: number;
  side: Side;
  opponent: string;
  ballots: number;
}

function tally(ballots: readonly BallotCalc[]): BallotRecord {
  const wins = ballots.filter((b) => b.result === 'W').length;
  const losses = ballots.filter((b) => b.result === 'L').length;
  const ties = ballots.filter((b) => b.result === 'T').length;
  return {
    wins,
    losses,
    ties,
    ballotsWon: wins + ties / 2,
    ballotsLost: losses + ties / 2,
    incomplete: ballots.filter((b) => !b.complete).length,
  };
}

// ---------------------------------------------------------------- summaries

/** 'all' = combined across both sides. */
export type Scope = Side | 'all';

export interface MetricSummary {
  score: number | null;
  dev: number | null;
  z: number | null;
  /** Ballots that had this score. */
  n: number;
  /** Ballots that had a usable z (SD > 0). */
  nZ: number;
}

/**
 * One person's averages over a set of ballots. Attorney and witness
 * performances are never averaged together: a person who was an attorney on
 * one side and a witness on the other gets a separate summary for each kind.
 */
export interface PersonSummary {
  personId: string;
  scope: Scope;
  kind: RoleKind;
  /** Slots they filled within this scope (e.g. Opener on P, Closer on D). */
  slots: Slot[];
  rounds: number[];
  ballots: number;
  /** Ballots in this summary that are missing scores. */
  incompleteBallots: number;
  metrics: Partial<Record<MetricKey, MetricSummary>>;
}

function summarize(
  personId: string,
  scope: Scope,
  kind: RoleKind,
  entries: { ballot: BallotCalc; person: PersonBallotCalc }[],
): PersonSummary {
  const metrics: Partial<Record<MetricKey, MetricSummary>> = {};
  const keys = new Set(entries.flatMap((e) => Object.keys(e.person.metrics) as MetricKey[]));
  for (const key of (['total', 'speech', 'direct', 'cross'] as const).filter((k) => keys.has(k))) {
    const ms = entries.map((e) => e.person.metrics[key]).filter((m): m is Metric => !!m);
    const scores = ms.map((m) => m.score).filter((x): x is number => x !== null);
    const devs = ms.map((m) => m.dev).filter((x): x is number => x !== null);
    const zs = ms.map((m) => m.z).filter((x): x is number => x !== null);
    metrics[key] = { score: mean(scores), dev: mean(devs), z: mean(zs), n: scores.length, nZ: zs.length };
  }
  return {
    personId,
    scope,
    kind,
    slots: [...new Set(entries.map((e) => e.person.slot))],
    rounds: [...new Set(entries.map((e) => e.ballot.round))],
    ballots: entries.length,
    incompleteBallots: entries.filter((e) => !e.ballot.complete).length,
    metrics,
  };
}

// ---------------------------------------------------------------- tournament

export interface TournamentCalc {
  /** Every ballot, ordered by round then ballot number. */
  ballots: BallotCalc[];
  rounds: RoundCalc[];
  record: BallotRecord;
  recordBySide: Record<Side, BallotRecord>;
  people: PersonSummary[];
  /** Ballots that could not be computed (e.g. their round doesn't exist). */
  skipped: { round: number; seat: number; reason: string }[];
}

export function computeTournament(data: TournamentData): TournamentCalc {
  const { tournament, rounds, ballots } = data;
  const roundByNumber = new Map(rounds.map((r) => [r.number, r]));
  const skipped: TournamentCalc['skipped'] = [];

  const ballotCalcs: BallotCalc[] = [];
  for (const b of [...ballots].sort(byRoundThenSeat)) {
    const round = roundByNumber.get(b.round);
    if (!round) {
      skipped.push({ round: b.round, seat: b.seat, reason: `Round ${b.round} is not set up` });
      continue;
    }
    ballotCalcs.push(computeBallot(b, round, lineupForRound(tournament.lineups[round.side], round)));
  }

  const roundCalcs: RoundCalc[] = [...rounds]
    .sort((a, b) => a.number - b.number)
    .map((r) => {
      const bs = ballotCalcs.filter((b) => b.round === r.number);
      return { round: r.number, side: r.side, opponent: r.opponent, ballots: bs.length, ...tally(bs) };
    });

  // Group each person's ballot entries by (scope, kind).
  const groups = new Map<string, { personId: string; scope: Scope; kind: RoleKind; entries: { ballot: BallotCalc; person: PersonBallotCalc }[] }>();
  for (const ballot of ballotCalcs) {
    for (const person of ballot.people) {
      if (!person.personId) continue;
      for (const scope of [ballot.side, 'all'] as const) {
        const key = `${person.personId}|${scope}|${person.kind}`;
        let g = groups.get(key);
        if (!g) groups.set(key, (g = { personId: person.personId, scope, kind: person.kind, entries: [] }));
        g.entries.push({ ballot, person });
      }
    }
  }
  const rosterOrder = new Map(tournament.roster.map((p, i) => [p.id, i]));
  const scopeOrder: Record<Scope, number> = { P: 0, D: 1, all: 2 };
  const people = [...groups.values()]
    .map((g) => summarize(g.personId, g.scope, g.kind, g.entries))
    .sort(
      (a, b) =>
        (rosterOrder.get(a.personId) ?? Infinity) - (rosterOrder.get(b.personId) ?? Infinity) ||
        scopeOrder[a.scope] - scopeOrder[b.scope] ||
        a.kind.localeCompare(b.kind),
    );

  return {
    ballots: ballotCalcs,
    rounds: roundCalcs,
    record: tally(ballotCalcs),
    recordBySide: {
      P: tally(ballotCalcs.filter((b) => b.side === 'P')),
      D: tally(ballotCalcs.filter((b) => b.side === 'D')),
    },
    people,
    skipped,
  };
}

/** Find one person's summary, e.g. summaryFor(calc, 'p1', 'all', 'attorney'). */
export function summaryFor(
  calc: TournamentCalc,
  personId: string,
  scope: Scope,
  kind: RoleKind,
): PersonSummary | undefined {
  return calc.people.find((s) => s.personId === personId && s.scope === scope && s.kind === kind);
}
