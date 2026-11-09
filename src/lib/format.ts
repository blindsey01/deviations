import { SLOT_LABEL, type Side, type Slot } from '../model/performances';
import type { Lineup, TournamentData } from '../model/types';

const MINUS = '−';

/** 7.25 -> "7.25", null -> "–". */
export function num(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '–';
  const s = Math.abs(x).toFixed(digits);
  return x < 0 && Number(s) !== 0 ? `${MINUS}${s}` : s;
}

export type DevTone = 'pos' | 'neg' | 'zero' | 'na';

/**
 * A deviation for display: sign, arrow and color class, so color is never
 * the only cue. Anything that rounds to 0.00 counts as zero (yellow).
 */
export function dev(x: number | null | undefined, digits = 2): { text: string; arrow: string; tone: DevTone } {
  if (x === null || x === undefined || Number.isNaN(x)) return { text: 'n/a', arrow: '', tone: 'na' };
  const r = Number(x.toFixed(digits));
  if (r === 0) return { text: (0).toFixed(digits), arrow: '◆', tone: 'zero' };
  return r > 0
    ? { text: `+${r.toFixed(digits)}`, arrow: '▲', tone: 'pos' }
    : { text: `${MINUS}${Math.abs(r).toFixed(digits)}`, arrow: '▼', tone: 'neg' };
}

export const sideLabel = (td: TournamentData, side: Side) => (side === 'P' ? td.tournament.pSideLabel : 'Defense');
export const sideSymbol = (side: Side) => (side === 'P' ? 'π' : 'Δ');
export const ourLabel = (td: TournamentData) => td.tournament.ourTeamLabel.trim() || 'Us';

export function personName(td: TournamentData, id: string | null | undefined): string {
  if (!id) return '';
  return td.tournament.roster.find((p) => p.id === id)?.name ?? '(removed)';
}

export function slotWho(td: TournamentData, lineup: Lineup, slot: Slot): string {
  return personName(td, lineup[slot]) || `${SLOT_LABEL[slot]} (not set)`;
}

export function formatDates(start?: string, end?: string): string {
  const f = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (start && end && start !== end) return `${f(start)} – ${f(end)}`;
  if (start) return f(start);
  return '';
}

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
