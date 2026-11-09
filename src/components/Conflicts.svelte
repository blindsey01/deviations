<script lang="ts">
  /**
   * Shows every file where this device and someone else disagree, and lets
   * the person choose. Nothing is ever overwritten without a choice here.
   */
  import { PERF_IDS } from '../model/performances';
  import type { Ballot } from '../model/types';
  import { describePath, parsePath } from '../sync/layout';
  import type { Conflict } from '../sync/engine';
  import { keepMine, keepTheirs, localFiles, moveMine, shared } from '../lib/sync.svelte';

  let { id }: { id: string } = $props();

  const conflicts = $derived(Object.values(shared[id]?.conflicts ?? {}));
  let busy = $state('');
  let note = $state('');

  function ballotSummary(text: string | null | undefined): string {
    if (!text) return 'deleted';
    try {
      const b = JSON.parse(text) as Ballot;
      let us = 0, them = 0, n = 0;
      for (const pid of PERF_IDS) {
        const v = b.scores?.[pid];
        if (typeof v !== 'number') continue;
        n++;
        if (pid.startsWith('us.')) us += v;
        else them += v;
      }
      const who = b.updatedBy ? ` by ${b.updatedBy}` : '';
      const when = b.updatedAt ? ` at ${new Date(b.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '';
      return `${b.judge || 'no judge name'} · ${us}–${them} · ${n}/28 scores · saved${who}${when}`;
    } catch {
      return 'unreadable';
    }
  }

  function changedFields(mine: string | undefined, theirs: string | null): string {
    if (!mine || !theirs) return '';
    try {
      const a = JSON.parse(mine) as Record<string, unknown>;
      const b = JSON.parse(theirs) as Record<string, unknown>;
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
      const names: Record<string, string> = {
        name: 'name', startDate: 'dates', endDate: 'dates', ourTeamLabel: 'team label', pSideLabel: 'side label',
        roster: 'roster', lineups: 'lineups', crossesNotes: '“Crosses” notes', side: 'side', opponent: 'opponent',
        characters: 'characters', lineupOverride: 'substitutes', trialOrder: 'who examined whom',
      };
      return [...new Set(keys.map((k) => names[k] ?? k))].join(', ');
    } catch {
      return '';
    }
  }

  function explain(c: Conflict): string {
    switch (c.kind) {
      case 'both-created': return 'Someone else saved a ballot with this same number while you were saving yours.';
      case 'both-changed': return 'Someone else changed this while you were changing it too.';
      case 'they-deleted': return 'Someone else deleted this, but you had changed it.';
      case 'we-deleted': return 'You deleted this, but someone else had changed it.';
    }
  }

  async function act(c: Conflict, what: 'theirs' | 'mine' | 'move') {
    busy = c.path;
    note = '';
    try {
      if (what === 'theirs') await keepTheirs(id, c.path);
      else if (what === 'mine') await keepMine(id, c.path);
      else note = `Your ballot was saved as ballot ${await moveMine(id, c.path)}.`;
    } finally {
      busy = '';
    }
  }
</script>

{#if conflicts.length}
  <section class="conflicts">
    <h2>Needs your decision</h2>
    {#each conflicts as c (c.path)}
      {@const mine = localFiles(id)[c.path]}
      {@const isBallot = parsePath(c.path)?.kind === 'ballot'}
      <div class="card">
        <h3>{describePath(c.path)}</h3>
        <p>{explain(c)}</p>
        {#if isBallot}
          <p class="small"><strong>Theirs:</strong> {ballotSummary(c.theirs)}<br /><strong>Yours:</strong> {ballotSummary(mine)}</p>
        {:else if changedFields(mine, c.theirs)}
          <p class="small muted">Different: {changedFields(mine, c.theirs)}</p>
        {/if}
        <div class="row">
          {#if c.kind === 'both-created'}
            <button class="primary" disabled={!!busy} onclick={() => act(c, 'move')}>Keep both (save mine as a new ballot)</button>
          {/if}
          <button disabled={!!busy} onclick={() => act(c, 'theirs')}>
            {c.theirs === null ? 'Delete mine too' : c.kind === 'we-deleted' ? 'Bring theirs back' : 'Use theirs (discard mine)'}
          </button>
          <button class="danger" disabled={!!busy} onclick={() => act(c, 'mine')}>
            {c.kind === 'we-deleted' ? 'Delete it anyway' : c.theirs === null ? 'Keep mine' : 'Overwrite theirs with mine'}
          </button>
        </div>
      </div>
    {/each}
    {#if note}<p class="notice ok">{note}</p>{/if}
  </section>
{/if}

<style>
  .conflicts .card { border-color: var(--danger); }
  h3 { margin-top: 0; }
</style>
