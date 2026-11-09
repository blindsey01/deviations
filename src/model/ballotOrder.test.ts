import { describe, expect, it } from 'vitest';
import { PERF_IDS, type Side } from './performances';
import type { TrialOrder } from './types';
import { ballotOrder, defaultTrialOrder, effectiveTrialOrder, remapScores, SHEET_ORDER, trialOrderProblems } from './ballotOrder';

const custom: TrialOrder = {
  ourCallOrder: ['w2', 'w3', 'w1'],
  directBy: { w1: 'a3', w2: 'a1', w3: 'a2' },
  crossBy: ['a2', 'a3', 'a1'],
};

describe('ballot order', () => {
  for (const side of ['P', 'D'] as Side[]) {
    for (const [name, to] of [['default', defaultTrialOrder()], ['custom', custom]] as const) {
      it(`covers all 28 performances exactly once (we are ${side}, ${name} mapping)`, () => {
        const ids = ballotOrder(side, to).flatMap((s) => s.lines.map((l) => l.id));
        expect(ids).toHaveLength(28);
        expect(new Set(ids)).toEqual(new Set(PERF_IDS));
      });
    }
  }

  it('follows the paper ballot when we are the Plaintiff', () => {
    const lines = ballotOrder('P', custom).flatMap((s) => s.lines.map((l) => `${l.column}:${l.id}`));
    expect(lines).toEqual([
      'P:us.open', 'D:op.open',
      // Our 1st-called witness is W2, directed by the Opener (a1).
      'P:us.a1.dx', 'P:us.w2.d', 'P:us.w2.c', 'D:op.cx.w2',
      'P:us.a2.dx', 'P:us.w3.d', 'P:us.w3.c', 'D:op.cx.w3',
      'P:us.a3.dx', 'P:us.w1.d', 'P:us.w1.c', 'D:op.cx.w1',
      // Their witnesses; our Swing (a2) crossed their 1st.
      'D:op.w1.dx', 'D:op.w1.d', 'D:op.w1.c', 'P:us.a2.cx',
      'D:op.w2.dx', 'D:op.w2.d', 'D:op.w2.c', 'P:us.a3.cx',
      'D:op.w3.dx', 'D:op.w3.d', 'D:op.w3.c', 'P:us.a1.cx',
      'P:us.close', 'D:op.close',
    ]);
  });

  it('puts the opponent case first when we are the Defense', () => {
    const sections = ballotOrder('D', defaultTrialOrder());
    expect(sections.map((s) => s.key)).toEqual(['open', 'P1', 'P2', 'P3', 'D1', 'D2', 'D3', 'close']);
    expect(sections[0]!.lines.map((l) => l.id)).toEqual(['op.open', 'us.open']);
    expect(sections[1]!.lines.map((l) => l.id)).toEqual(['op.w1.dx', 'op.w1.d', 'op.w1.c', 'us.a1.cx']);
    expect(sections[4]!.lines.map((l) => l.id)).toEqual(['us.a1.dx', 'us.w1.d', 'us.w1.c', 'op.cx.w1']);
  });

  it('sheet order is column O', () => {
    expect(SHEET_ORDER.slice(0, 3)).toEqual(['us.open', 'us.a1.dx', 'us.a2.dx']);
    expect(SHEET_ORDER.slice(14, 16)).toEqual(['op.open', 'op.cx.w1']);
  });
});

describe('trial-order mapping', () => {
  it('accepts the default and a full custom mapping', () => {
    expect(trialOrderProblems(defaultTrialOrder())).toEqual([]);
    expect(trialOrderProblems(custom)).toEqual([]);
  });

  it('rejects an attorney doing two directs', () => {
    const bad = { ...custom, directBy: { w1: 'a1', w2: 'a1', w3: 'a2' } } as TrialOrder;
    expect(trialOrderProblems(bad)).toEqual(['Each of our three attorneys must direct exactly one witness.']);
    expect(effectiveTrialOrder(bad).isDefault).toBe(true);
  });

  it('moves scores so each stays on the same ballot line when the mapping is corrected', () => {
    const side: Side = 'P';
    const from = defaultTrialOrder();
    const lines = ballotOrder(side, from).flatMap((s) => s.lines);
    // Line i got the value (i % 10) + 1.
    const scores = Object.fromEntries(lines.map((l, i) => [l.id, (i % 10) + 1]));
    const moved = remapScores(scores, side, from, custom);
    const newLines = ballotOrder(side, custom).flatMap((s) => s.lines);
    newLines.forEach((l, i) => expect(moved[l.id]).toBe((i % 10) + 1));
    expect(Object.keys(moved)).toHaveLength(28);
  });

  it('keeps missing scores missing when remapping', () => {
    const moved = remapScores({ 'us.a1.dx': 9 }, 'P', defaultTrialOrder(), custom);
    // Line 3 (first direct exam) now belongs to the Opener's direct of W2: still a1.
    expect(moved).toEqual({ 'us.a1.dx': 9 });
    const moved2 = remapScores({ 'us.a2.dx': 9 }, 'P', defaultTrialOrder(), custom);
    expect(moved2).toEqual({ 'us.a2.dx': 9 });
    const moved3 = remapScores({ 'us.w1.d': 9 }, 'P', defaultTrialOrder(), custom);
    // W1 was 1st called by default; the 1st-called witness is now W2.
    expect(moved3).toEqual({ 'us.w2.d': 9 });
  });
});
