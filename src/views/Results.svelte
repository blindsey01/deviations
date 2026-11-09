<script lang="ts">
  import DevCell from '../components/DevCell.svelte';
  import Header from '../components/Header.svelte';
  import { computeTournament, type Scope } from '../engine/compute';
  import type { TournamentData } from '../model/types';
  import { ourLabel, personName, sideLabel } from '../lib/format';
  import { charactersText, loadMode, MODE_HELP, rolesText, saveMode, type MetricMode } from '../lib/results';
  import { tHref } from '../lib/router.svelte';

  let { td }: { td: TournamentData } = $props();

  let scope = $state<Scope>('all');
  let mode = $state<MetricMode>(loadMode());
  const setMode = (m: MetricMode) => { mode = m; saveMode(m); };

  const id = $derived(td.tournament.id);
  const calc = $derived(computeTournament(td));
  const attorneys = $derived(calc.people.filter((s) => s.scope === scope && s.kind === 'attorney'));
  const witnesses = $derived(calc.people.filter((s) => s.scope === scope && s.kind === 'witness'));
  const pick = (m: { dev: number | null; z: number | null } | undefined) => (m ? (mode === 'raw' ? m.dev : m.z) : null);
</script>

<Header title="Results" back={tHref(id)} backLabel={td.tournament.name} />

<div class="row controls">
  <div class="seg" role="group" aria-label="Which side">
    <button aria-pressed={scope === 'P'} onclick={() => (scope = 'P')}>{sideLabel(td, 'P')}</button>
    <button aria-pressed={scope === 'D'} onclick={() => (scope = 'D')}>Defense</button>
    <button aria-pressed={scope === 'all'} onclick={() => (scope = 'all')}>Combined</button>
  </div>
  <div class="seg" role="group" aria-label="Deviation type">
    <button aria-pressed={mode === 'raw'} onclick={() => setMode('raw')}>Deviation</button>
    <button aria-pressed={mode === 'z'} onclick={() => setMode('z')}>Normalized</button>
  </div>
</div>
<p class="muted small">{MODE_HELP[mode]} Tap a name for per-ballot detail.</p>
{#if calc.record.incomplete}
  <p class="notice small">⚠ {calc.record.incomplete} ballot{calc.record.incomplete > 1 ? 's are' : ' is'} missing scores. Numbers marked ⚠ include them.</p>
{/if}

<h2>Attorneys</h2>
{#if attorneys.length === 0}
  <p class="muted">No attorney ballots for this selection yet.</p>
{:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Name</th><th>Total</th><th>Speech</th><th>Direct</th><th>Cross</th></tr>
      </thead>
      <tbody>
        {#each attorneys as s (s.personId)}
          <tr>
            <td>
              <a href={tHref(id, `/p/${s.personId}`)}>{personName(td, s.personId)}</a>
              {#if s.incompleteBallots}<span title="Includes incomplete ballots">⚠</span>{/if}
              <span class="sub">{rolesText(s)} · {s.ballots} ballots</span>
            </td>
            <td><DevCell label="Total" value={pick(s.metrics.total)} avg={s.metrics.total?.score ?? null} /></td>
            <td>{#if s.metrics.speech}<DevCell label="Speech" value={pick(s.metrics.speech)} avg={s.metrics.speech.score} />{:else}<span class="muted">–</span>{/if}</td>
            <td><DevCell label="Direct" value={pick(s.metrics.direct)} avg={s.metrics.direct?.score ?? null} /></td>
            <td><DevCell label="Cross" value={pick(s.metrics.cross)} avg={s.metrics.cross?.score ?? null} /></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<h2>Witnesses</h2>
{#if witnesses.length === 0}
  <p class="muted">No witness ballots for this selection yet.</p>
{:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Name</th><th>Total</th><th>Direct</th><th>Cross</th></tr>
      </thead>
      <tbody>
        {#each witnesses as s (s.personId)}
          <tr>
            <td>
              <a href={tHref(id, `/p/${s.personId}`)}>{personName(td, s.personId)}</a>
              {#if s.incompleteBallots}<span title="Includes incomplete ballots">⚠</span>{/if}
              <span class="sub">{charactersText(td, s) || rolesText(s)} · {s.ballots} ballots</span>
            </td>
            <td><DevCell label="Total" value={pick(s.metrics.total)} avg={s.metrics.total?.score ?? null} /></td>
            <td><DevCell label="Direct" value={pick(s.metrics.direct)} avg={s.metrics.direct?.score ?? null} /></td>
            <td><DevCell label="Cross" value={pick(s.metrics.cross)} avg={s.metrics.cross?.score ?? null} /></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<h2>Ballot results</h2>
<p>
  <strong>Record: {calc.record.ballotsWon}–{calc.record.ballotsLost}</strong>
  <span class="muted small">(a tied ballot counts as half for each team)</span>
</p>
<div class="table-wrap">
  <table>
    <thead>
      <tr><th>Round / judge</th><th>{ourLabel(td)}–Opp</th><th>Result</th></tr>
    </thead>
    <tbody>
      {#each calc.rounds as r (r.round)}
        <tr class="subtotal">
          <td colspan="2">R{r.round} · {sideLabel(td, r.side)} vs {r.opponent || '?'}</td>
          <td>{r.ballots ? `${r.ballotsWon}–${r.ballotsLost}` : '–'}</td>
        </tr>
        {#each calc.ballots.filter((b) => b.round === r.round) as b (b.seat)}
          <tr>
            <td>
              <a href={tHref(id, `/r/${b.round}/b/${b.seat}`)}>{b.judge}</a>
              {#if !b.complete}<span class="badge warn">incomplete</span>{/if}
            </td>
            <td>{b.ourPoints}–{b.oppPoints}</td>
            <td>
              <span class="badge {b.result}">{b.result} {b.differential > 0 ? '+' : b.differential < 0 ? '−' : '±'}{Math.abs(b.differential)}</span>
            </td>
          </tr>
        {/each}
      {/each}
    </tbody>
  </table>
</div>

<style>
  .controls { margin-bottom: 6px; }
  .sub { display: block; font-size: 0.78rem; color: var(--muted); }
  td { vertical-align: top; }
</style>
