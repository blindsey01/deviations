import { describe, expect, it } from 'vitest';
import { PERF_IDS, SLOTS, type MetricKey, type PerfId } from '../model/performances';
import type { Ballot, TournamentData } from '../model/types';
import { computeTournament, mean, summaryFor, type BallotCalc, type Metric } from './compute';
import {
  DREXEL_PATH,
  GOLDEN_ROLE_SLOT,
  goldenToTournament,
  hasDrexel,
  loadFixture,
  roundNumber,
  SYNTHETIC_PATH,
  type Golden,
} from './golden';
import { validateTournament } from './validate';

const TOL = 9; // decimal places for toBeCloseTo (|diff| < 5e-10)

/** Compare engine metrics against a golden {key, key_dev, key_z} record (null = not available). */
function expectMetrics(actual: Partial<Record<MetricKey, Pick<Metric, 'score' | 'dev' | 'z'>>>, expected: Record<string, unknown>, where: string) {
  for (const key of ['speech', 'direct', 'cross', 'total'] as MetricKey[]) {
    const m = actual[key];
    if (!(key in expected)) {
      // Fixtures omit speech for the Swing and witnesses; so must we.
      if (key !== 'total') expect(m, `${where} ${key} should be absent`).toBeUndefined();
      continue;
    }
    expect(m, `${where} ${key}`).toBeDefined();
    const pairs: [number | null, unknown, string][] = [
      [m!.score, expected[key], key],
      [m!.dev, expected[`${key}_dev`], `${key}_dev`],
    ];
    if (`${key}_z` in expected) pairs.push([m!.z, expected[`${key}_z`], `${key}_z`]);
    for (const [got, want, label] of pairs) {
      if (want === null) expect(got, `${where} ${label}`).toBeNull();
      else expect(got, `${where} ${label}`).toBeCloseTo(want as number, TOL);
    }
  }
}

// ======================================================================
// Acceptance: every fixture in the golden layout must match exactly.
//  - synthetic.json: made-up data, in the public repo, always runs.
//  - golden_drexel.json: the real workbook's numbers; private, runs only
//    where reference/ exists (Ben's computer), skipped on GitHub.
// ======================================================================
const fixtures: [string, Golden][] = [['synthetic.json (made-up data)', loadFixture(SYNTHETIC_PATH)]];
if (hasDrexel) fixtures.push(['golden_drexel.json (private reference)', loadFixture(DREXEL_PATH)]);

describe.each(fixtures)('acceptance: %s', (_name, golden) => {
  const data = goldenToTournament(golden);
  const calc = computeTournament(data);

  it('has no setup problems and computes every ballot, flagging the incomplete ones', () => {
    expect(validateTournament(data)).toEqual([]);
    expect(calc.skipped).toEqual([]);
    expect(calc.ballots).toHaveLength(data.ballots.length);
    for (const b of calc.ballots) {
      const stored = data.ballots.find((x) => x.round === b.round && x.seat === b.seat)!;
      expect(b.complete).toBe(Object.keys(stored.scores).length === 28);
    }
  });

  for (const side of ['P', 'D'] as const) {
    const g = golden.sides[side];
    const sideBallots = calc.ballots.filter((b) => b.side === side);

    for (const [role, exp] of Object.entries(g.expected)) {
      const slot = GOLDEN_ROLE_SLOT[role]!;

      it(`side ${side} ${role}: per-ballot scores, deviations and z match`, () => {
        expect(sideBallots).toHaveLength(exp.per_ballot.length);
        exp.per_ballot.forEach((pb, i) => {
          const b = sideBallots[i]!;
          expect(b.round).toBe(roundNumber(side, pb.round as number));
          expect(b.judge).toBe(pb.judge);
          expectMetrics(b.people.find((p) => p.slot === slot)!.metrics, pb, `${side} ${role} ballot ${i + 1}`);
        });
      });

      it(`side ${side} ${role}: column-B summary matches`, () => {
        const personId = data.tournament.lineups[side][slot]!;
        const s = summaryFor(calc, personId, side, slot.startsWith('a') ? 'attorney' : 'witness')!;
        expect(s.ballots).toBe(exp.per_ballot.length);
        expectMetrics(s.metrics, exp.summary, `${side} ${role} summary`);
      });
    }

    it(`side ${side}: ballot results match`, () => {
      expect(sideBallots).toHaveLength(g.ballot_results.length);
      g.ballot_results.forEach((r, i) => {
        const b = sideBallots[i]!;
        expect([b.ourPoints, b.oppPoints, b.differential, b.result]).toEqual([r.our_points, r.opp_points, r.differential, r.result]);
      });
    });
  }

  it('combines the same person across sides, every ballot weighted equally', () => {
    let checked = 0;
    for (const [pRole, pExp] of Object.entries(golden.sides.P.expected)) {
      const pSlot = GOLDEN_ROLE_SLOT[pRole]!;
      const personId = data.tournament.lineups.P[pSlot]!;
      const dRole = Object.keys(golden.sides.D.expected).find((r) => data.tournament.lineups.D[GOLDEN_ROLE_SLOT[r]!] === personId);
      if (!dRole) continue;
      const dSlot = GOLDEN_ROLE_SLOT[dRole]!;
      if (pSlot[0] !== dSlot[0]) continue; // attorney on one side, witness on the other: never combined
      const kind = pSlot.startsWith('a') ? 'attorney' : 'witness';
      const all = summaryFor(calc, personId, 'all', kind)!;
      const perBallot = [...pExp.per_ballot, ...golden.sides.D.expected[dRole]!.per_ballot];
      expect(all.ballots).toBe(perBallot.length);
      for (const key of ['direct', 'cross', 'total'] as const) {
        const want = mean(perBallot.map((pb) => pb[`${key}_dev`]).filter((x): x is number => typeof x === 'number'));
        expect(all.metrics[key]!.dev, `${pRole} combined ${key}_dev`).toBeCloseTo(want!, TOL);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

// ----------------------------------------------------------------------
// Checks specific to the real Drexel workbook (private; local only).
// ----------------------------------------------------------------------
// The real scores are read from the private file at run time, never written here.
describe.skipIf(!hasDrexel)('Drexel workbook specifics (private reference)', () => {
  const golden = hasDrexel ? loadFixture(DREXEL_PATH) : undefined;
  const calc = golden ? computeTournament(goldenToTournament(golden)) : undefined;

  it('uses the corrected G50 benchmark (witness crosses, P round 2, Judge 1)', () => {
    const raw = golden!.sides.P.rounds[1]!.ballots[0]!;
    const crosses = (team: 'our' | 'opp') => ['w1_cross', 'w2_cross', 'w3_cross'].map((k) => raw[team][k]!);
    // Correct cells P40, P42, P44, P55, P58, P61: all six witness crosses.
    const correct = mean([...crosses('our'), ...crosses('opp')])!;
    // The workbook's G50 used P38 (our A3 Direct) in place of P40 (our W1 Cross).
    const buggy = mean([raw.our.atty3_direct!, ...crosses('our').slice(1), ...crosses('opp')])!;
    const b = calc!.ballots.find((x) => x.round === 2 && x.seat === 1)!;
    expect(b.benchmarks.wc).toBeCloseTo(correct, 12);
    expect(correct).not.toBeCloseTo(buggy, 6); // the fix actually changes this ballot
  });

  it('computes round splits and the tournament record from the ballot results', () => {
    for (const side of ['P', 'D'] as const) {
      for (const r of golden!.sides[side].rounds) {
        const results = golden!.sides[side].ballot_results.filter((x) => x.round === r.round_on_side).map((x) => x.result);
        const won = results.filter((x) => x === 'W').length + results.filter((x) => x === 'T').length / 2;
        const rc = calc!.rounds.find((x) => x.round === roundNumber(side, r.round_on_side))!;
        expect([rc.ballotsWon, rc.ballotsLost]).toEqual([won, results.length - won]);
      }
    }
    expect(calc!.record.ballotsWon + calc!.record.ballotsLost).toBe(calc!.ballots.length);
  });
});

// ======================================================================
// Behaviour tests on the made-up fixture (always run).
// ======================================================================
const synthetic = loadFixture(SYNTHETIC_PATH);
const fresh = (): TournamentData => structuredClone(goldenToTournament(synthetic));
const ballotsOn = (data: TournamentData, side: 'P' | 'D') =>
  data.ballots.filter((b) => data.rounds.find((r) => r.number === b.round)!.side === side);

describe('the made-up fixture itself', () => {
  it('has a varying number of ballots per round and two blank scores', () => {
    const calc = computeTournament(fresh());
    expect(calc.rounds.map((r) => r.ballots)).toEqual([3, 1, 2, 2]);
    const incomplete = calc.ballots.filter((b) => !b.complete);
    expect(incomplete).toHaveLength(1);
    expect(incomplete[0]!.missing.sort()).toEqual(['op.w2.dx', 'us.w2.c']);
    expect(calc.record.incomplete).toBe(1);
  });
});

describe('any number of ballots per round', () => {
  it('weights every ballot equally when one is added', () => {
    const data = fresh();
    const first = data.ballots.find((b) => b.round === 2)!;
    data.ballots.push({ ...structuredClone(first), seat: 2, judge: 'Extra judge' });
    const calc = computeTournament(data);
    expect(calc.rounds.find((r) => r.round === 2)!.ballots).toBe(2);

    const opener = data.tournament.lineups.P.a1!;
    const s = summaryFor(calc, opener, 'P', 'attorney')!;
    const pBallots = calc.ballots.filter((b) => b.side === 'P');
    expect(s.ballots).toBe(pBallots.length);
    const devs = pBallots.map((b) => b.people.find((p) => p.slot === 'a1')!.metrics.direct!.dev!);
    expect(s.metrics.direct!.dev).toBeCloseTo(mean(devs)!, 12);
  });

  it('works with a single ballot', () => {
    const data = fresh();
    data.ballots = data.ballots.slice(0, 1);
    const calc = computeTournament(data);
    expect(calc.ballots).toHaveLength(1);
    const s = summaryFor(calc, data.tournament.lineups.P.a1!, 'P', 'attorney')!;
    expect(s.metrics.speech!.dev).toBeCloseTo(synthetic.sides.P.expected.opener!.per_ballot[0]!.speech_dev as number, 12);
  });
});

describe('missing and invalid scores', () => {
  it('skips a missing score everywhere and flags the ballot', () => {
    const data = fresh();
    const full = computeTournament(fresh()).ballots[0]!;
    const ballot = data.ballots[0]!;
    const { 'us.open': speech, 'us.a1.dx': direct, 'us.a1.cx': cross } = ballot.scores;
    delete ballot.scores['us.a1.dx'];
    const calc = computeTournament(data);
    const b = calc.ballots[0]!;

    expect(b.complete).toBe(false);
    expect(b.missing).toEqual(['us.a1.dx']);
    expect(b.benchmarks.adx).toBeCloseTo((full.benchmarks.adx! * 6 - direct!) / 5, 12);
    expect(b.mean).toBeCloseTo((full.mean! * 28 - direct!) / 27, 12);
    expect(b.ourPoints).toBe(full.ourPoints - direct!);

    const opener = b.people.find((p) => p.slot === 'a1')!;
    expect(opener.metrics.direct).toEqual({ score: null, dev: null, z: null });
    expect(opener.metrics.total!.score).toBeCloseTo((speech! + cross!) / 2, 12);

    const pCount = ballotsOn(data, 'P').length;
    const s = summaryFor(calc, data.tournament.lineups.P.a1!, 'P', 'attorney')!;
    expect(s.metrics.direct!.n).toBe(pCount - 1);
    expect(s.metrics.cross!.n).toBe(pCount);
    expect(s.incompleteBallots).toBe(1);
  });

  it('treats out-of-range or fractional values as missing, and reports them', () => {
    const data = fresh();
    data.ballots[0]!.scores['us.w1.d'] = 11;
    data.ballots[0]!.scores['op.close'] = 7.5;
    const b = computeTournament(data).ballots[0]!;
    expect(b.invalid).toEqual(['us.w1.d', 'op.close']);
    expect(b.complete).toBe(false);
    expect(b.people.find((p) => p.slot === 'w1')!.metrics.direct!.score).toBeNull();
    expect(validateTournament(data)).toHaveLength(2);
  });

  it('handles an empty ballot without crashing', () => {
    const data = fresh();
    data.ballots[0]!.scores = {};
    const b = computeTournament(data).ballots[0]!;
    expect(b.missing).toHaveLength(28);
    expect(b.mean).toBeNull();
    expect(b.people.every((p) => p.metrics.total!.score === null)).toBe(true);
  });
});

describe('judge-normalized deviation', () => {
  it('is n/a (null) when every score on the ballot is the same, and is skipped in summaries', () => {
    const data = fresh();
    data.ballots[0]!.scores = Object.fromEntries(PERF_IDS.map((id) => [id, 8])) as Record<PerfId, number>;
    const calc = computeTournament(data);
    const b = calc.ballots[0]!;
    expect(b.sd).toBe(0);
    expect(b.result).toBe('T');
    for (const p of b.people) for (const m of Object.values(p.metrics)) expect(m.z).toBeNull();
    const pCount = ballotsOn(data, 'P').length;
    const s = summaryFor(calc, data.tournament.lineups.P.a1!, 'P', 'attorney')!;
    expect(s.metrics.direct!.n).toBe(pCount);
    expect(s.metrics.direct!.nZ).toBe(pCount - 1);
  });
});

describe('ballot results', () => {
  it('counts a tie as half a ballot for each team', () => {
    const data = fresh();
    const b = data.ballots[0]!;
    const before = computeTournament(data).ballots[0]!;
    // Lower the leading team's scores until the points are level.
    const leader = before.differential > 0 ? 'us.' : 'op.';
    let gap = Math.abs(before.differential);
    for (const id of PERF_IDS.filter((x) => x.startsWith(leader))) {
      const take = Math.min(gap, b.scores[id]! - 1);
      b.scores[id]! -= take;
      gap -= take;
    }
    expect(gap).toBe(0);
    const calc = computeTournament(data);
    const ballot: BallotCalc = calc.ballots[0]!;
    expect(ballot.result).toBe('T');
    const r1 = calc.rounds[0]!;
    expect(r1.ties).toBe(1);
    expect(r1.ballotsWon).toBe(r1.wins + 0.5);
    expect(r1.ballotsLost).toBe(r1.losses + 0.5);
  });
});

describe('lineups', () => {
  it('a per-round substitute takes that round only', () => {
    const data = fresh();
    data.tournament.roster.push({ id: 'sub', name: 'Sub' });
    const regular = data.tournament.lineups.P.a2!;
    data.rounds.find((r) => r.number === 2)!.lineupOverride = { a2: 'sub' };
    const calc = computeTournament(data);
    expect(summaryFor(calc, regular, 'P', 'attorney')!.rounds).toEqual([1]);
    expect(summaryFor(calc, 'sub', 'P', 'attorney')!.rounds).toEqual([2]);
    expect(validateTournament(data)).toEqual([]);
  });

  it('never averages attorney and witness performances together', () => {
    const data = fresh();
    // Make the P-side Swing the D-side Witness 1 (and swap D's Witness 1 into Swing).
    const swing = data.tournament.lineups.P.a2!;
    const dLineup = data.tournament.lineups.D;
    [dLineup.a2, dLineup.w1] = [dLineup.w1, swing];
    const calc = computeTournament(data);

    const atty = summaryFor(calc, swing, 'all', 'attorney')!;
    const wit = summaryFor(calc, swing, 'all', 'witness')!;
    expect(atty.rounds).toEqual([1, 2]);
    expect(wit.rounds).toEqual([3, 4]);
    expect(atty.metrics.total!.dev).toBeCloseTo(summaryFor(calc, swing, 'P', 'attorney')!.metrics.total!.dev!, 12);
    expect(summaryFor(calc, swing, 'D', 'attorney')).toBeUndefined();
  });

  it('flags the same person in two slots of one lineup', () => {
    const data = fresh();
    data.tournament.lineups.P.w3 = data.tournament.lineups.P.a1;
    expect(validateTournament(data)).toEqual([
      'Round 1: the same person is both Opener and Witness 3.',
      'Round 2: the same person is both Opener and Witness 3.',
    ]);
  });

  it('computes benchmarks even when a lineup slot is empty', () => {
    const data = fresh();
    const w2 = data.tournament.lineups.P.w2!;
    data.tournament.lineups.P.w2 = null;
    const calc = computeTournament(data);
    expect(calc.ballots[0]!.people.find((p) => p.slot === 'w2')!.personId).toBeNull();
    expect(calc.people.filter((s) => s.scope === 'P')).toHaveLength(SLOTS.length - 1);
    expect(summaryFor(calc, w2, 'P', 'witness')).toBeUndefined();
  });
});

describe('validation', () => {
  it('reports duplicate ballots and ballots for rounds that are not set up', () => {
    const data = fresh();
    data.ballots.push(structuredClone(data.ballots[0]!) as Ballot);
    data.ballots.push({ round: 9, seat: 1, scores: {} });
    expect(validateTournament(data)).toEqual([
      'Round 1, ballot 1 exists more than once.',
      'Round 9, ballot 1: round 9 is not set up.',
    ]);
    expect(computeTournament(data).skipped).toEqual([{ round: 9, seat: 1, reason: 'Round 9 is not set up' }]);
  });
});
