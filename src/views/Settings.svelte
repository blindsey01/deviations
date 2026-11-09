<script lang="ts">
  import { untrack } from 'svelte';
  import Header from '../components/Header.svelte';
  import { conn, connect, disconnect, pendingCount, shared } from '../lib/sync.svelte';
  import { RemoteError } from '../sync/remote';

  let { query = '' }: { query?: string } = $props();

  const params = new URLSearchParams(untrack(() => query));
  let owner = $state(params.get('owner') ?? conn.cfg?.owner ?? '');
  let repo = $state(params.get('repo') ?? conn.cfg?.repo ?? '');
  let token = $state('');
  let busy = $state(false);
  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null);
  let removeOnDisconnect = $state(false);
  let copied = $state(false);

  const tokenLink = $derived(
    'https://github.com/settings/personal-access-tokens/new?' +
      new URLSearchParams({
        name: 'Deviations app',
        description: `Lets the Deviations app read and save tournament data in ${owner || 'the team'}/${repo || 'data repo'}.`,
        ...(owner ? { target_name: owner } : {}),
        expires_in: '366',
        contents: 'write',
      }).toString(),
  );
  const setupLink = $derived(
    `${location.origin}${location.pathname}#/settings?${new URLSearchParams({ owner, repo }).toString()}`,
  );
  const waiting = $derived(Object.keys(shared).reduce((n, id) => n + pendingCount(id), 0));

  async function doConnect(e: Event) {
    e.preventDefault();
    busy = true;
    message = null;
    try {
      const v = await connect(token, owner, repo);
      token = '';
      message = {
        kind: v.isPrivate ? 'ok' : 'error',
        text: v.isPrivate
          ? `Connected as ${v.login}.`
          : `Connected as ${v.login}, but ${owner}/${repo} is PUBLIC. Tournament data should go in a private repo; change it in the repo’s settings.`,
      };
    } catch (err) {
      message = { kind: 'error', text: err instanceof RemoteError ? err.message : String(err) };
    } finally {
      busy = false;
    }
  }

  function doDisconnect() {
    const warn = waiting
      ? `\n\n${waiting} change${waiting > 1 ? 's have' : ' has'} not been uploaded yet.${removeOnDisconnect ? ' Removing shared tournaments will LOSE them.' : ' They stay on this device and upload after you reconnect.'}`
      : '';
    if (!confirm(`Disconnect from GitHub on this device?${warn}`)) return;
    disconnect(removeOnDisconnect);
    message = { kind: 'ok', text: 'Disconnected. The token was removed from this device.' };
  }

  async function copySetupLink() {
    try {
      await navigator.clipboard.writeText(setupLink);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      prompt('Copy this link:', setupLink);
    }
  }
</script>

<Header title="Settings" back="#/" backLabel="All tournaments" />

{#if message}<p class="notice {message.kind}">{message.text}</p>{/if}

<section class="card">
  <h2>Shared storage (GitHub)</h2>
  {#if conn.cfg}
    <p>
      Connected as <strong>{conn.cfg.login}</strong> to <strong>{conn.cfg.owner}/{conn.cfg.repo}</strong>.
    </p>
    <p class="muted small">The token is stored only in this browser. It never goes into the code or the data repo.</p>
    <label class="check small"><input type="checkbox" bind:checked={removeOnDisconnect} />
      <span>Also remove shared tournaments from this device (do this on a borrowed or shared device)</span></label>
    <button class="danger" onclick={doDisconnect}>Disconnect</button>
  {:else}
    <p>Connect to your team’s private data repo so everyone sees the same tournaments and ballots.</p>
    <form onsubmit={doConnect}>
      <div class="two">
        <label class="field"><span>Organization (owner)</span><input type="text" bind:value={owner} autocapitalize="off" autocomplete="off" spellcheck="false" required /></label>
        <label class="field"><span>Data repo</span><input type="text" bind:value={repo} autocapitalize="off" autocomplete="off" spellcheck="false" required /></label>
      </div>
      <label class="field">
        <span>Your personal access token</span>
        <input type="password" bind:value={token} autocomplete="off" spellcheck="false" placeholder="github_pat_…" required />
      </label>
      <button class="primary" type="submit" disabled={busy || !token || !owner || !repo}>{busy ? 'Checking…' : 'Connect'}</button>
    </form>
  {/if}
</section>

{#if !conn.cfg}
  <section class="card">
    <h2>Don’t have a token yet?</h2>
    <ol>
      <li>Make sure you’ve accepted the invitation to the <strong>{owner || 'team'}</strong> organization on GitHub.</li>
      <li>
        Open <a href={tokenLink} target="_blank" rel="noopener">this pre-filled token form</a>. The name, the organization,
        the expiry (1 year) and the permission <em>Contents: Read and write</em> are filled in for you.
      </li>
      <li>Under <strong>Repository access</strong>, choose <strong>Only select repositories</strong> and pick <strong>{repo || 'the data repo'}</strong>.</li>
      <li>Click <strong>Generate token</strong>, copy it (it starts with <code>github_pat_</code>), and paste it above.</li>
      <li>If the organization requires approval, the token works once an owner approves it.</li>
    </ol>
  </section>
{/if}

{#if owner && repo}
  <section class="card">
    <h2>Invite a teammate</h2>
    <p class="small">Send them this link. It opens Settings with the organization and repo already filled in. It doesn’t contain your token.</p>
    <div class="row">
      <input class="grow" style="width:auto" type="text" readonly value={setupLink} aria-label="Teammate setup link" />
      <button onclick={copySetupLink}>{copied ? 'Copied ✓' : 'Copy'}</button>
    </div>
  </section>
{/if}

<style>
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
  ol { padding-left: 20px; }
  li { margin: 6px 0; }
  @media (max-width: 420px) { .two { grid-template-columns: 1fr; } }
</style>
