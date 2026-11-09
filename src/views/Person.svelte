<script lang="ts">
  import DevCell from '../components/DevCell.svelte';
  import Header from '../components/Header.svelte';
  import { computeTournament, type Metric, type PersonSummary, type Scope } from '../engine/compute';
  import { SLOT_LABEL, type RoleKind, type WitSlot } from '../model/performances';
  import type { TournamentData } from '../model/types';
  import { personName, sideLabel } from '../lib/format';
  import { charactersText, loadMode, MODE_HELP, saveMode, type MetricMode } from '../lib/results';
  import { tHref } from '../lib/router.svelte';

  let { td, personId }: { td: TournamentData; personId: string } = $props();

  let mode = $state<MetricMode>(loadMode());
  const setMode = (m: MetricMode) => { mode = m; saveMode(m); };

  const id = $derived(td.tournament.id);
  const calc = $derived(computeTournament(td));
  const mine = $derived(calc.people.filter((s) => s.personId === personId));
  const kinds = $derived((['attorney', 'witness'] as RoleKind[]).filter((k) => mine.some((s) => s.kind === k)));
  const pick = (m: { dev: number | null; z: number | null } | undefined) => (m ? (mode === 'raw' ? m.dev : m.z) : null);

  function rowsFor(kind: RoleKind): { label: string; s: PersonSummary }[] {
    const bySide = (sc: Scope) => mine.find((s) => s.kind === kind && s.scope === sc);
    const rows: { label: string; s: PersonSummary }[] = [];
    const p = bySide('P');
    const d = bySide('D');
    if (p) rows.push({ label: sideLabel(td, 'P'), s: p });
    if (d) rows.push({ label: 'Defense', s: d });
    if (p && d) rows.push({ label: 'Combined', s: bySide('all')! });
    return rows;
  }

  function ballotsFor(kind: RoleKind) {
    return calc.ballots.flatMap((b) =>
      b.people.filter((p) => p.personId === personId && p.kind === kind).map((p) => ({ b, p })),
    );
  }

  const characterOf = (round: number, slot: string) =>
    td.rounds.find((r) => r.number === round)?.characters[slot as WitSlot] ?? '';
  const cats = (kind: RoleKind) => (kind === 'attorney' ? (['total', 'speech', 'direct', 'cross'] as const) : (['total', 'direct', 'cross'] as const));
  const title = (k: string) => k[0]!.toUpperCase() + k.slice(1);
</script>

<Header title={personName(td, personId) || 'Unknown person'} back={tHref(id, '/results')} backLabel="Results" />

<div class="seg" role="group" aria-label="Deviation type">
  <button aria-pressed={mode === 'raw'} onclick={() => setMode('raw')}>Deviation</button>
  <button aria-pressed={mode === 'z'} onclick={() => setMode('z')}>Normalized</button>
</div>
<p class="muted small">{MODE_HELP[mode]}</p>

{#if kinds.length === 0}
  <p class="muted">No ballots for this person yet.</p>
{/if}

{#each kinds as kind (kind)}
  <h2>As {kind === 'attorney' ? 'an attorney' : 'a witness'}</h2>
  {#if kind === 'witness'}
    {@const all = mine.find((s) => s.kind === 'witness' && s.scope === 'all')}
    {#if all && charactersText(td, all)}<p class="muted">Played {charactersText(td, all)}</p>{/if}
  {/if}

  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Side</th>{#each cats(kind) as c (c)}<th>{title(c)}</th>{/each}</tr>
      </thead>
      <tbody>
        {#each rowsFor(kind) as row (row.label)}
          <tr class:subtotal={row.label === 'Combined'}>
            <td>
              {row.label}
              <span class="sub">{row.s.slots.map((x) => SLOT_LABEL[x]).join(' / ')} · {row.s.ballots} ballots{#if row.s.incompleteBallots} ⚠{/if}</span>
            </td>
            {#each cats(kind) as c (c)}
              {@const m = row.s.metrics[c]}
              <td>{#if m}<DevCell label={title(c)} value={pick(m)} avg={m.score} />{:else}<span class="muted">–</span>{/if}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <h3>Per ballot</h3>
  <p class="muted small">Each cell: deviation on top, the score underneath.</p>
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Round / judge</th>{#each cats(kind) as c (c)}<th>{title(c)}</th>{/each}</tr>
      </thead>
      <tbody>
        {#each ballotsFor(kind) as { b, p } (`${b.round}-${b.seat}`)}
          <tr>
            <td>
              <a href={tHref(id, `/r/${b.round}/b/${b.seat}`)}>R{b.round} · {b.judge}</a>
              {#if !b.complete}<span class="badge warn">incomplete</span>{/if}
              <span class="sub">
                {sideLabel(td, b.side)} vs {b.opponent || '?'} · {SLOT_LABEL[p.slot]}{#if p.kind === 'witness' && characterOf(b.round, p.slot)} · {characterOf(b.round, p.slot)}{/if}
              </span>
            </td>
            {#each cats(kind) as c (c)}
              {@const m: Metric | undefined = p.metrics[c]}
              <td>{#if m}<DevCell label={title(c)} value={pick(m)} avg={m.score} />{:else}<span class="muted">–</span>{/if}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/each}

<style>
  .sub { display: block; font-size: 0.78rem; color: var(--muted); }
  td { vertical-align: top; }
</style>
