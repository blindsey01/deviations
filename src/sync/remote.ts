/**
 * Talking to the private data repo through the GitHub REST API.
 *
 * `Remote` is the small set of operations the sync engine needs. The real
 * implementation (GitHubRemote) uses the browser's fetch; the tests use an
 * in-memory fake with the same interface.
 */

export type RemoteErrorKind = 'auth' | 'forbidden' | 'notfound' | 'conflict' | 'ratelimit' | 'network' | 'other';

export class RemoteError extends Error {
  constructor(
    public kind: RemoteErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export interface Remote {
  /** Every file in the repo: path -> blob SHA. Empty repo = empty map. */
  tree(): Promise<Map<string, string>>;
  /** File contents by blob SHA (blobs never change, so this is always safe to cache). */
  blob(sha: string): Promise<string>;
  /** Current contents + SHA of one file, or null if it doesn't exist. */
  get(path: string): Promise<{ text: string; sha: string } | null>;
  /** Create (sha undefined) or update (sha = the version we started from). Returns the new SHA. */
  put(path: string, text: string, sha: string | undefined, message: string): Promise<string>;
  /** Delete the version with this SHA. */
  del(path: string, sha: string, message: string): Promise<void>;
}

export interface GhConfig {
  token: string;
  owner: string;
  repo: string;
  /** Default branch, read from the repo when connecting. */
  branch: string;
  /** GitHub username of whoever made the token. */
  login: string;
}

// ------------------------------------------------------------------ base64 (UTF-8 safe)

export function toBase64(text: string): string {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// ------------------------------------------------------------------ GitHub

const API = 'https://api.github.com';

async function call(token: string, method: string, url: string, body?: unknown): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      // GitHub marks some responses cacheable for 60s; we always need the live version.
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new RemoteError('network', 'Can’t reach GitHub. Check the internet connection.');
  }
  if (res.ok) return res;
  let msg = '';
  try {
    msg = ((await res.json()) as { message?: string }).message ?? '';
  } catch {
    /* no JSON body */
  }
  if (res.status === 401) throw new RemoteError('auth', 'GitHub rejected the token (expired or revoked). Reconnect in Settings.', 401);
  if (res.status === 403 || res.status === 429) {
    if (res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429)
      throw new RemoteError('ratelimit', 'GitHub’s hourly request limit was reached. Try again in a few minutes.', res.status);
    throw new RemoteError('forbidden', `GitHub refused (${msg || 'forbidden'}). The token may need “Contents: Read and write”.`, 403);
  }
  if (res.status === 404) throw new RemoteError('notfound', msg || 'Not found', 404);
  if (res.status === 409 || res.status === 422) throw new RemoteError('conflict', msg || 'Conflict', res.status);
  throw new RemoteError('other', `GitHub error ${res.status}: ${msg}`, res.status);
}

const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export class GitHubRemote implements Remote {
  constructor(private cfg: GhConfig) {}

  private get base() {
    return `${API}/repos/${encodeURIComponent(this.cfg.owner)}/${encodeURIComponent(this.cfg.repo)}`;
  }

  async tree(): Promise<Map<string, string>> {
    try {
      const res = await call(this.cfg.token, 'GET', `${this.base}/git/trees/${encodeURIComponent(this.cfg.branch)}?recursive=1`);
      const json = (await res.json()) as { tree: { path: string; type: string; sha: string }[]; truncated: boolean };
      if (json.truncated) throw new RemoteError('other', 'The data repo is too large to list in one request.');
      return new Map(json.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]));
    } catch (e) {
      // A brand-new empty repo has no branch yet.
      if (e instanceof RemoteError && (e.kind === 'conflict' || e.kind === 'notfound')) return new Map();
      throw e;
    }
  }

  async blob(sha: string): Promise<string> {
    const res = await call(this.cfg.token, 'GET', `${this.base}/git/blobs/${sha}`);
    return fromBase64(((await res.json()) as { content: string }).content);
  }

  async get(path: string): Promise<{ text: string; sha: string } | null> {
    try {
      const res = await call(this.cfg.token, 'GET', `${this.base}/contents/${enc(path)}?ref=${encodeURIComponent(this.cfg.branch)}`);
      const json = (await res.json()) as { content: string; sha: string };
      return { text: fromBase64(json.content), sha: json.sha };
    } catch (e) {
      if (e instanceof RemoteError && e.kind === 'notfound') return null;
      throw e;
    }
  }

  async put(path: string, text: string, sha: string | undefined, message: string): Promise<string> {
    const res = await call(this.cfg.token, 'PUT', `${this.base}/contents/${enc(path)}`, {
      message,
      content: toBase64(text),
      ...(sha ? { sha } : {}),
    });
    return ((await res.json()) as { content: { sha: string } }).content.sha;
  }

  async del(path: string, sha: string, message: string): Promise<void> {
    await call(this.cfg.token, 'DELETE', `${this.base}/contents/${enc(path)}`, { message, sha });
  }
}

/**
 * Check a token + repo before saving them. Returns the username and the
 * repo's default branch, or throws a RemoteError with a plain-English message.
 */
export async function verifyConnection(token: string, owner: string, repo: string): Promise<{ login: string; branch: string; isPrivate: boolean }> {
  const user = (await (await call(token, 'GET', `${API}/user`)).json()) as { login: string };
  let info: { default_branch: string; private: boolean; permissions?: { push?: boolean } };
  try {
    info = (await (await call(token, 'GET', `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`)).json()) as typeof info;
  } catch (e) {
    if (e instanceof RemoteError && e.kind === 'notfound')
      throw new RemoteError(
        'notfound',
        `This token can’t see ${owner}/${repo}. Check the spelling, that the token’s “Repository access” includes that repo, and (if your organization requires it) that the token has been approved.`,
      );
    throw e;
  }
  if (info.permissions && info.permissions.push === false)
    throw new RemoteError('forbidden', `Your GitHub account can read ${owner}/${repo} but not write to it. Ask the owner for write access.`);
  return { login: user.login, branch: info.default_branch, isPrivate: info.private };
}
