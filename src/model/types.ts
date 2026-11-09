/**
 * The stored data model. These shapes are what get saved (to the browser, to
 * JSON export, and later to the private GitHub data repo). Everything the app
 * shows is computed from them by the engine; nothing computed is stored.
 */
import type { AttySlot, PerfId, Side, Slot, WitSlot } from './performances';

export const SCHEMA_VERSION = 1;

export interface Person {
  id: string;
  name: string;
}

/** Who filled each slot. `null` = not set yet. */
export type Lineup = Record<Slot, string | null>;

export interface Tournament {
  schemaVersion: typeof SCHEMA_VERSION;
  /** Stable slug, e.g. "2026-drexel-o3". Also the folder name in the data repo. */
  id: string;
  name: string;
  /** ISO dates, "YYYY-MM-DD". */
  startDate?: string;
  endDate?: string;
  /** e.g. "Team A". */
  ourTeamLabel: string;
  /** What this year's case calls the P side. */
  pSideLabel: 'Plaintiff' | 'Prosecution';
  /** One roster for the whole tournament. The same person on both sides = same id. */
  roster: Person[];
  /** One lineup per side, reused in every round on that side. */
  lineups: Record<Side, Lineup>;
  /** The free-text "Crosses:" note under each attorney, per side. */
  crossesNotes?: Partial<Record<Side, Partial<Record<AttySlot, string>>>>;
}

/**
 * Who examined whom in one round. Only used to label the trial-order entry
 * view; the calculations never read it.
 */
export interface TrialOrder {
  /** Our witness slots in the order they were called. */
  ourCallOrder: WitSlot[];
  /** Which of our attorneys directed each of our witnesses. */
  directBy: Partial<Record<WitSlot, AttySlot>>;
  /** crossBy[k] = which of our attorneys crossed the opponent's (k+1)-th witness. */
  crossBy: (AttySlot | null)[];
}

export interface Round {
  /** Tournament round number (1, 2, 3, 4, ...). Unique within a tournament. */
  number: number;
  side: Side;
  /** Opponent's team name. We store nothing else about them except scores. */
  opponent: string;
  /** Character each of our witnesses played this round. */
  characters: Partial<Record<WitSlot, string>>;
  /** Substitutes for this round only: slots listed here replace the side's lineup. */
  lineupOverride?: Partial<Lineup>;
  trialOrder?: TrialOrder;
}

export interface Ballot {
  round: number;
  /** Ballot number within the round (1, 2, 3, ...). Also the file name: ballot-<seat>.json. */
  seat: number;
  /** Judge's name, optional free text. */
  judge?: string;
  /** Integer scores 1-10. A score not yet entered is absent (never 0). */
  scores: Partial<Record<PerfId, number>>;
  updatedAt?: string;
  updatedBy?: string;
}

/** A whole tournament in one object: the JSON export/import format. */
export interface TournamentData {
  tournament: Tournament;
  rounds: Round[];
  ballots: Ballot[];
}
