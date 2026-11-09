<script lang="ts">
  /** One line saying whether this tournament's changes are safely on GitHub. */
  import { conn, net, pendingCount, repoKey, shared, syncNow } from '../lib/sync.svelte';

  let { id }: { id: string } = $props();

  const s = $derived(shared[id]);
  const pending = $derived(s ? pendingCount(id) : 0);
  const conflicts = $derived(s ? Object.keys(s.conflicts).length : 0);
  const wrongRepo = $derived(!!s && !!conn.cfg && s.repo !== repoKey(conn.cfg));

  function ago(iso?: string) {
    if (!iso) return '';
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    return mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const view = $derived.by((): { tone: 'ok' | 'busy' | 'warn' | 'error' | 'muted'; text: string } => {
    if (!s) return { tone: 'muted', text: 'On this device only. Not shared with the team.' };
    if (!conn.cfg) return { tone: 'warn', text: `Shared tournament, but this device isn’t connected to GitHub.${pending ? ` ${pending} change${pending > 1 ? 's' : ''} waiting.` : ''}` };
    if (wrongRepo) return { tone: 'warn', text: `Shared through ${s.repo}, but this device is connected to ${repoKey(conn.cfg)}.` };
    if (conflicts) return { tone: 'error', text: `${conflicts} conflict${conflicts > 1 ? 's' : ''} need${conflicts > 1 ? '' : 's'} your decision (below).` };
    if (s.busy) return { tone: 'busy', text: pending ? `Uploading ${pending} change${pending > 1 ? 's' : ''}…` : 'Checking for updates…' };
    if (s.errorKind === 'network' || !net.online)
      return { tone: 'warn', text: `No connection.${pending ? ` ${pending} change${pending > 1 ? 's are' : ' is'} saved on this phone and will upload automatically.` : ' Everything is saved on this phone.'}` };
    if (s.error) return { tone: 'error', text: s.error };
    if (pending) return { tone: 'busy', text: `${pending} change${pending > 1 ? 's' : ''} waiting to upload…` };
    return { tone: 'ok', text: `All changes saved to GitHub${s.lastSync ? ` · checked ${ago(s.lastSync)}` : ''}.` };
  });
</script>

<div class="sync {view.tone}" role="status">
  <span class="dot" aria-hidden="true"></span>
  <span class="grow">{view.text}</span>
  {#if s && conn.cfg && !wrongRepo}
    <button class="link" onclick={() => syncNow(id)} disabled={s.busy}>{s.busy ? 'Syncing…' : 'Sync now'}</button>
  {:else if s && !conn.cfg}
    <a href="#/settings">Connect</a>
  {/if}
</div>

<style>
  .sync { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; padding: 6px 12px; border-radius: var(--radius); background: var(--surface); border: 1px solid var(--border); margin: 8px 0; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; background: var(--muted); }
  .ok .dot { background: var(--pos-text); }
  .busy .dot { background: var(--accent); animation: pulse 1s infinite alternate; }
  .warn { background: var(--warn-bg); color: var(--warn-text); }
  .warn .dot { background: var(--warn-text); }
  .error { background: var(--neg-bg); color: var(--neg-text); }
  .error .dot { background: var(--neg-text); }
  .grow { flex: 1; }
  @keyframes pulse { to { opacity: 0.3; } }
  @media (prefers-reduced-motion: reduce) { .busy .dot { animation: none; } }
</style>
