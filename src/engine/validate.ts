/**
 * Checks for problems in stored data that the engine can't fix by itself.
 * Returns plain-English messages; an empty list means no problems were found.
 */
import { SLOTS, SLOT_LABEL, isPerfId, isValidScore } from '../model/performances';
import type { TournamentData } from '../model/types';
import { lineupForRound } from './compute';

export function validateTournament(data: TournamentData): string[] {
  const { tournament, rounds, ballots } = data;
  const problems: string[] = [];
  const personIds = new Set(tournament.roster.map((p) => p.id));

  const roundNumbers = new Set<number>();
  for (const r of rounds) {
    if (roundNumbers.has(r.number)) problems.push(`Round ${r.number} is set up more than once.`);
    roundNumbers.add(r.number);

    const lineup = lineupForRound(tournament.lineups[r.side], r);
    const seen = new Map<string, string>();
    for (const slot of SLOTS) {
      const id = lineup[slot];
      if (!id) continue;
      if (!personIds.has(id)) problems.push(`Round ${r.number}: ${SLOT_LABEL[slot]} is not on the roster.`);
      const prev = seen.get(id);
      if (prev) problems.push(`Round ${r.number}: the same person is both ${prev} and ${SLOT_LABEL[slot]}.`);
      seen.set(id, SLOT_LABEL[slot]);
    }
  }

  const seats = new Set<string>();
  for (const b of ballots) {
    const where = `Round ${b.round}, ballot ${b.seat}`;
    if (!roundNumbers.has(b.round)) problems.push(`${where}: round ${b.round} is not set up.`);
    const key = `${b.round}|${b.seat}`;
    if (seats.has(key)) problems.push(`${where} exists more than once.`);
    seats.add(key);
    for (const [k, v] of Object.entries(b.scores)) {
      if (!isPerfId(k)) problems.push(`${where}: unknown score "${k}".`);
      else if (v !== undefined && v !== null && !isValidScore(v))
        problems.push(`${where}: ${k} = ${String(v)} is not a whole number from 1 to 10.`);
    }
  }
  return problems;
}
