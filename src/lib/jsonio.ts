/**
 * JSON backup format: exactly the stored TournamentData, pretty-printed.
 */
import { SCHEMA_VERSION, type TournamentData } from '../model/types';

export function toJson(td: TournamentData): string {
  return JSON.stringify(td, null, 2);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Read a backup file. Returns an error message instead of throwing. */
export function parseTournamentJson(text: string): { data: TournamentData } | { error: string } {
  let x: unknown;
  try {
    x = JSON.parse(text);
  } catch {
    return { error: 'That file is not valid JSON.' };
  }
  if (!isObj(x) || !isObj(x.tournament)) return { error: 'That file is not a tournament backup.' };
  const t = x.tournament;
  if (t.schemaVersion !== SCHEMA_VERSION)
    return { error: `This backup uses data version ${String(t.schemaVersion)}; this app reads version ${SCHEMA_VERSION}.` };
  if (typeof t.id !== 'string' || !t.id) return { error: 'The backup has no tournament id.' };
  if (!Array.isArray(t.roster) || !isObj(t.lineups) || !isObj(t.lineups.P) || !isObj(t.lineups.D))
    return { error: 'The backup is missing the roster or lineups.' };
  if (!Array.isArray(x.rounds) || !Array.isArray(x.ballots)) return { error: 'The backup is missing rounds or ballots.' };
  for (const b of x.ballots) {
    if (!isObj(b) || typeof b.round !== 'number' || typeof b.seat !== 'number' || !isObj(b.scores))
      return { error: 'A ballot in the backup is malformed.' };
  }
  return { data: x as unknown as TournamentData };
}
