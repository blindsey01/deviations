/**
 * The two entry orders, as arrangements of the same 28 performance IDs.
 *
 *  - Sheet order: the old workbook's column O (our 14, then theirs).
 *  - Ballot order: the AMTA paper ballot (reference/AMTA Ballot.JPEG, kept
 *    out of git), read the way Ben chose: openings, then each witness as a
 *    block in the order called (calling side's direct exam, witness direct,
 *    witness cross, then the other side's cross exam), Plaintiff/Prosecution
 *    case first, then the Defense case, then closings.
 *
 * Ballot order needs the round's TrialOrder mapping to know which of our
 * people each ballot line belongs to.
 */
import {
  ATTY_SLOTS,
  PERFORMANCES,
  WIT_SLOTS,
  type AttySlot,
  type PerfId,
  type Side,
  type Slot,
  type WitSlot,
} from './performances';
import type { TrialOrder } from './types';

export type LineKind = 'open' | 'dx' | 'wd' | 'wc' | 'cx' | 'close';

export interface BallotLine {
  id: PerfId;
  /** Which column of the paper ballot this score is written in. */
  column: Side;
  kind: LineKind;
  /** For witness lines: which side called the witness, and in what position (1-3). */
  witnessSide?: Side;
  witnessNo?: number;
  /** If the witness is ours: their lineup slot. */
  ourWitness?: WitSlot;
  /** If the score is ours: the lineup slot of who performed. */
  performer?: Slot;
}

export interface BallotSection {
  key: string;
  kind: 'openings' | 'witness' | 'closings';
  witnessSide?: Side;
  witnessNo?: number;
  ourWitness?: WitSlot;
  lines: BallotLine[];
}

export function defaultTrialOrder(): TrialOrder {
  return {
    ourCallOrder: ['w1', 'w2', 'w3'],
    directBy: { w1: 'a1', w2: 'a2', w3: 'a3' },
    crossBy: ['a1', 'a2', 'a3'],
  };
}

const isPermutation = <T>(xs: readonly (T | null | undefined)[], of: readonly T[]) =>
  xs.length === of.length && of.every((x) => xs.includes(x));

/** Plain-English problems with a mapping; empty = usable. */
export function trialOrderProblems(to: TrialOrder): string[] {
  const problems: string[] = [];
  if (!isPermutation(to.ourCallOrder, WIT_SLOTS)) problems.push('Each of our three witnesses must be called exactly once.');
  if (!isPermutation(WIT_SLOTS.map((w) => to.directBy[w]), ATTY_SLOTS))
    problems.push('Each of our three attorneys must direct exactly one witness.');
  if (!isPermutation(to.crossBy, ATTY_SLOTS)) problems.push('Each of our three attorneys must cross exactly one opposing witness.');
  return problems;
}

/** The round's mapping, or the default when none is set or it is incomplete. */
export function effectiveTrialOrder(to: TrialOrder | undefined): { order: TrialOrder; isDefault: boolean } {
  if (to && trialOrderProblems(to).length === 0) return { order: to, isDefault: false };
  return { order: defaultTrialOrder(), isDefault: true };
}

export function ballotOrder(ourSide: Side, to: TrialOrder): BallotSection[] {
  const other = (s: Side): Side => (s === 'P' ? 'D' : 'P');
  const theirSide = other(ourSide);
  const speech = (kind: 'open' | 'close', column: Side): BallotLine =>
    column === ourSide
      ? { id: kind === 'open' ? 'us.open' : 'us.close', column, kind, performer: kind === 'open' ? 'a1' : 'a3' }
      : { id: kind === 'open' ? 'op.open' : 'op.close', column, kind };

  const witnessBlock = (callingSide: Side, k: number): BallotSection => {
    if (callingSide === ourSide) {
      const w = to.ourCallOrder[k - 1] as WitSlot;
      const atty = to.directBy[w] as AttySlot;
      const base = { witnessSide: callingSide, witnessNo: k, ourWitness: w };
      return {
        key: `${callingSide}${k}`,
        kind: 'witness',
        ...base,
        lines: [
          { id: `us.${atty}.dx` as PerfId, column: ourSide, kind: 'dx', performer: atty, ...base },
          { id: `us.${w}.d` as PerfId, column: ourSide, kind: 'wd', performer: w, ...base },
          { id: `us.${w}.c` as PerfId, column: ourSide, kind: 'wc', performer: w, ...base },
          { id: `op.cx.${w}` as PerfId, column: theirSide, kind: 'cx', ...base },
        ],
      };
    }
    const atty = to.crossBy[k - 1] as AttySlot;
    const base = { witnessSide: callingSide, witnessNo: k };
    return {
      key: `${callingSide}${k}`,
      kind: 'witness',
      ...base,
      lines: [
        { id: `op.w${k}.dx` as PerfId, column: theirSide, kind: 'dx', ...base },
        { id: `op.w${k}.d` as PerfId, column: theirSide, kind: 'wd', ...base },
        { id: `op.w${k}.c` as PerfId, column: theirSide, kind: 'wc', ...base },
        { id: `us.${atty}.cx` as PerfId, column: ourSide, kind: 'cx', performer: atty, ...base },
      ],
    };
  };

  return [
    { key: 'open', kind: 'openings', lines: [speech('open', 'P'), speech('open', 'D')] },
    ...[1, 2, 3].map((k) => witnessBlock('P', k)),
    ...[1, 2, 3].map((k) => witnessBlock('D', k)),
    { key: 'close', kind: 'closings', lines: [speech('close', 'P'), speech('close', 'D')] },
  ];
}

export const SHEET_ORDER: readonly PerfId[] = PERFORMANCES.map((p) => p.id);

/**
 * When a round's mapping is corrected after ballots were entered in ballot
 * order, move each score so it stays on the same ballot line.
 */
export function remapScores<T>(
  scores: Partial<Record<PerfId, T>>,
  ourSide: Side,
  from: TrialOrder,
  to: TrialOrder,
): Partial<Record<PerfId, T>> {
  const oldLines = ballotOrder(ourSide, from).flatMap((s) => s.lines);
  const newLines = ballotOrder(ourSide, to).flatMap((s) => s.lines);
  const out: Partial<Record<PerfId, T>> = {};
  oldLines.forEach((line, i) => {
    const v = scores[line.id];
    if (v !== undefined) out[newLines[i]!.id] = v;
  });
  return out;
}
