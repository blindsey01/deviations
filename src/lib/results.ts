/** Helpers shared by the results screens. */
import { lineupForRound, type PersonSummary } from '../engine/compute';
import { SLOT_LABEL, type WitSlot } from '../model/performances';
import type { TournamentData } from '../model/types';
import { KEYS, loadString, saveString } from './storage';

export type MetricMode = 'raw' | 'z';

export const loadMode = (): MetricMode => (loadString(KEYS.metricMode) === 'z' ? 'z' : 'raw');
export const saveMode = (m: MetricMode) => saveString(KEYS.metricMode, m);

export const MODE_HELP: Record<MetricMode, string> = {
  raw: 'Deviation = score minus the average of the same kind of performance on that ballot (both teams). The plain average is shown underneath.',
  z: 'Normalized = the deviation divided by how spread out that judge’s scores were (standard deviation of all 28 scores on the ballot). It adjusts for judges who score in a narrow or wide band. Roughly: +1.0 means one “typical spread” above the benchmark. n/a = the judge gave every performance the same score.',
};

export function rolesText(s: PersonSummary): string {
  return s.slots.map((x) => SLOT_LABEL[x]).join(' / ');
}

/** Characters a person played as a witness, across the rounds in a summary. */
export function charactersText(td: TournamentData, s: PersonSummary): string {
  const chars = new Set<string>();
  for (const n of s.rounds) {
    const r = td.rounds.find((x) => x.number === n);
    if (!r) continue;
    const lineup = lineupForRound(td.tournament.lineups[r.side], r);
    for (const w of ['w1', 'w2', 'w3'] as WitSlot[]) if (lineup[w] === s.personId && r.characters[w]) chars.add(r.characters[w]!);
  }
  return [...chars].join(', ');
}
