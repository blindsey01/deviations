/**
 * Test helper: an in-memory stand-in for the GitHub data repo that behaves
 * like the real contents API (SHA checks, 409/422 conflicts, one repo shared
 * by several "devices").
 */
import { RemoteError, type Remote } from './remote';

export class FakeRepo {
  files = new Map<string, { text: string; sha: string }>();
  private n = 0;
  /** Make the next N writes fail as if another save hit the branch at the same moment. */
  branchRaces = 0;
  commits: string[] = [];

  nextSha(): string {
    return `sha${++this.n}`;
  }
}

export class FakeRemote implements Remote {
  offline = false;
  calls = 0;
  constructor(public repo: FakeRepo) {}

  private check() {
    this.calls++;
    if (this.offline) throw new RemoteError('network', 'offline');
  }

  async tree() {
    this.check();
    return new Map([...this.repo.files].map(([p, f]) => [p, f.sha]));
  }

  async blob(sha: string) {
    this.check();
    for (const f of this.repo.files.values()) if (f.sha === sha) return f.text;
    throw new RemoteError('notfound', 'no blob');
  }

  async get(path: string) {
    this.check();
    const f = this.repo.files.get(path);
    return f ? { ...f } : null;
  }

  async put(path: string, text: string, sha: string | undefined, message: string) {
    this.check();
    if (this.repo.branchRaces > 0) {
      this.repo.branchRaces--;
      throw new RemoteError('conflict', 'reference update failed', 409);
    }
    const cur = this.repo.files.get(path);
    if (cur && !sha) throw new RemoteError('conflict', '"sha" wasn\'t supplied.', 422);
    if (cur && cur.sha !== sha) throw new RemoteError('conflict', `${path} does not match ${sha}`, 409);
    if (!cur && sha) throw new RemoteError('notfound', 'Not Found', 404);
    const next = { text, sha: this.repo.nextSha() };
    this.repo.files.set(path, next);
    this.repo.commits.push(message);
    return next.sha;
  }

  async del(path: string, sha: string, message: string) {
    this.check();
    const cur = this.repo.files.get(path);
    if (!cur) throw new RemoteError('notfound', 'Not Found', 404);
    if (cur.sha !== sha) throw new RemoteError('conflict', 'does not match', 409);
    this.repo.files.delete(path);
    this.repo.commits.push(message);
  }
}
