/**
 * Thin, crash-proof wrapper around the browser's localStorage.
 * Private browsing or a full disk can make localStorage throw; the app must
 * keep working (and say so) rather than break.
 */

export const KEYS = {
  tournaments: 'mtd.tournaments.v1',
  drafts: 'mtd.drafts.v1',
  entryOrder: 'mtd.entryOrder',
  metricMode: 'mtd.metricMode',
  /** GitHub connection, including the token. Only ever stored in this browser. */
  github: 'mtd.github.v1',
  /** Per shared tournament: last-seen GitHub versions and open conflicts. */
  sync: 'mtd.sync.v1',
} as const;

export const storageStatus = { ok: true, message: '' };

export function loadJSON<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

export function saveJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    storageStatus.ok = true;
    storageStatus.message = '';
    return true;
  } catch (e) {
    storageStatus.ok = false;
    storageStatus.message = e instanceof Error ? e.message : String(e);
    return false;
  }
}

export function loadString(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* a remembered preference is not worth an error */
  }
}
