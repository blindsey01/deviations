/**
 * The 28 scored performances on one ballot, each with a stable ID.
 *
 * Every view of a ballot (sheet order, trial/AMTA order, results tables) is
 * just a different arrangement of these IDs. Scores are never stored by row
 * position.
 *
 * Our team ("us.*") is keyed by WHO performed: the lineup slot
 *   a1 = Opener, a2 = Swing, a3 = Closer, w1..w3 = our witnesses.
 * The opponent ("op.*") is keyed by WHAT was examined, because we don't track
 * their people:
 *   op.wK.*  = their K-th witness, in the order they were called
 *   op.cx.wK = their cross-examination of OUR witness slot wK
 */

export type Side = 'P' | 'D';
export type Team = 'us' | 'op';

export const ATTY_SLOTS = ['a1', 'a2', 'a3'] as const;
export const WIT_SLOTS = ['w1', 'w2', 'w3'] as const;
export const SLOTS = [...ATTY_SLOTS, ...WIT_SLOTS] as const;
export type AttySlot = (typeof ATTY_SLOTS)[number];
export type WitSlot = (typeof WIT_SLOTS)[number];
export type Slot = AttySlot | WitSlot;

export type RoleKind = 'attorney' | 'witness';
export const roleKind = (slot: Slot): RoleKind => (slot.startsWith('a') ? 'attorney' : 'witness');

export const SLOT_LABEL: Record<Slot, string> = {
  a1: 'Opener',
  a2: 'Swing',
  a3: 'Closer',
  w1: 'Witness 1',
  w2: 'Witness 2',
  w3: 'Witness 3',
};

/**
 * Performance types. Each ballot's benchmark for a type is the mean of every
 * score of that type on the ballot, both teams.
 */
export const PERF_TYPES = ['open', 'close', 'adx', 'acx', 'wd', 'wc'] as const;
export type PerfType = (typeof PERF_TYPES)[number];

export const PERF_TYPE_LABEL: Record<PerfType, string> = {
  open: 'Opening',
  close: 'Closing',
  adx: 'Attorney direct',
  acx: 'Attorney cross',
  wd: 'Witness on direct',
  wc: 'Witness on cross',
};

export interface PerfDef {
  readonly id: string;
  readonly team: Team;
  readonly type: PerfType;
  /** Our team only: the lineup slot of the person who performed. */
  readonly performer?: Slot;
  /**
   * Label in column O of the old workbook. "{X}" is the opponent's side
   * letter: "D" on the Prosecution/Plaintiff sheet, "P" on the Defense sheet.
   */
  readonly sheetLabel: string;
}

/** All 28 performances, in the old workbook's column-O order ("sheet order"). */
export const PERFORMANCES = [
  // Our 14
  { id: 'us.open', team: 'us', type: 'open', performer: 'a1', sheetLabel: 'A1 Opening' },
  { id: 'us.a1.dx', team: 'us', type: 'adx', performer: 'a1', sheetLabel: 'A1 Direct' },
  { id: 'us.a2.dx', team: 'us', type: 'adx', performer: 'a2', sheetLabel: 'A2 Direct' },
  { id: 'us.a3.dx', team: 'us', type: 'adx', performer: 'a3', sheetLabel: 'A3 Direct' },
  { id: 'us.w1.d', team: 'us', type: 'wd', performer: 'w1', sheetLabel: 'W1 Direct' },
  { id: 'us.w1.c', team: 'us', type: 'wc', performer: 'w1', sheetLabel: 'W1 Cross' },
  { id: 'us.w2.d', team: 'us', type: 'wd', performer: 'w2', sheetLabel: 'W2 Direct' },
  { id: 'us.w2.c', team: 'us', type: 'wc', performer: 'w2', sheetLabel: 'W2 Cross' },
  { id: 'us.w3.d', team: 'us', type: 'wd', performer: 'w3', sheetLabel: 'W3 Direct' },
  { id: 'us.w3.c', team: 'us', type: 'wc', performer: 'w3', sheetLabel: 'W3 Cross' },
  { id: 'us.a1.cx', team: 'us', type: 'acx', performer: 'a1', sheetLabel: 'A1 Cross' },
  { id: 'us.a2.cx', team: 'us', type: 'acx', performer: 'a2', sheetLabel: 'A2 Cross' },
  { id: 'us.a3.cx', team: 'us', type: 'acx', performer: 'a3', sheetLabel: 'A3 Cross' },
  { id: 'us.close', team: 'us', type: 'close', performer: 'a3', sheetLabel: 'A3 Close' },
  // Opponent's 14 (the old sheet lists their crosses first)
  { id: 'op.open', team: 'op', type: 'open', sheetLabel: '{X} Opening' },
  { id: 'op.cx.w1', team: 'op', type: 'acx', sheetLabel: '{X}1 Cross' },
  { id: 'op.cx.w2', team: 'op', type: 'acx', sheetLabel: '{X}2 Cross' },
  { id: 'op.cx.w3', team: 'op', type: 'acx', sheetLabel: '{X}3 Cross' },
  { id: 'op.w1.dx', team: 'op', type: 'adx', sheetLabel: '{X}1 Direct' },
  { id: 'op.w1.d', team: 'op', type: 'wd', sheetLabel: '{X}W1 Direct' },
  { id: 'op.w1.c', team: 'op', type: 'wc', sheetLabel: '{X}W1 Cross' },
  { id: 'op.w2.dx', team: 'op', type: 'adx', sheetLabel: '{X}2 Direct' },
  { id: 'op.w2.d', team: 'op', type: 'wd', sheetLabel: '{X}W2 Direct' },
  { id: 'op.w2.c', team: 'op', type: 'wc', sheetLabel: '{X}W2 Cross' },
  { id: 'op.w3.dx', team: 'op', type: 'adx', sheetLabel: '{X}3 Direct' },
  { id: 'op.w3.d', team: 'op', type: 'wd', sheetLabel: '{X}W3 Direct' },
  { id: 'op.w3.c', team: 'op', type: 'wc', sheetLabel: '{X}W3 Cross' },
  { id: 'op.close', team: 'op', type: 'close', sheetLabel: '{X} Close' },
] as const satisfies readonly PerfDef[];

export type PerfId = (typeof PERFORMANCES)[number]['id'];

export const PERF_IDS: readonly PerfId[] = PERFORMANCES.map((p) => p.id);

export const PERF_BY_ID: Record<PerfId, PerfDef> = Object.fromEntries(
  PERFORMANCES.map((p) => [p.id, p]),
) as Record<PerfId, PerfDef>;

export const isPerfId = (key: string): key is PerfId => key in PERF_BY_ID;

/** Column-O label for a performance, given the side our team was on. */
export function sheetLabel(id: PerfId, ourSide: Side): string {
  return PERF_BY_ID[id].sheetLabel.replace('{X}', ourSide === 'P' ? 'D' : 'P');
}

/** The per-person categories shown on a competitor card. */
export type CategoryKey = 'speech' | 'direct' | 'cross';
export type MetricKey = CategoryKey | 'total';

/** Which of our performances make up each person's categories, by lineup slot. */
export const SLOT_PERFS: Record<Slot, Partial<Record<CategoryKey, PerfId>>> = {
  a1: { speech: 'us.open', direct: 'us.a1.dx', cross: 'us.a1.cx' },
  a2: { direct: 'us.a2.dx', cross: 'us.a2.cx' },
  a3: { speech: 'us.close', direct: 'us.a3.dx', cross: 'us.a3.cx' },
  w1: { direct: 'us.w1.d', cross: 'us.w1.c' },
  w2: { direct: 'us.w2.d', cross: 'us.w2.c' },
  w3: { direct: 'us.w3.d', cross: 'us.w3.c' },
};

export const MIN_SCORE = 1;
export const MAX_SCORE = 10;

export function isValidScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= MIN_SCORE && v <= MAX_SCORE;
}
