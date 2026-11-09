/** Test helper: loads fixtures in the golden-file layout from disk. */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Golden } from '../model/goldenFixture';

export { GOLDEN_ROLE_SLOT, goldenToTournament, roundNumber, type Golden } from '../model/goldenFixture';

const fromRoot = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));

/** Made-up tournament, committed to the repo. Always available. */
export const SYNTHETIC_PATH = fromRoot('src/fixtures/synthetic.json');
/** The real (anonymized) Drexel results. Private: only on machines that have reference/. */
export const DREXEL_PATH = fromRoot('reference/golden_drexel.json');
export const hasDrexel = existsSync(DREXEL_PATH);

export function loadFixture(path: string): Golden {
  return JSON.parse(readFileSync(path, 'utf8')) as Golden;
}
