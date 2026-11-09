<script lang="ts">
  import Header from '../components/Header.svelte';
  import { computeTournament } from '../engine/compute';
  import { validateTournament } from '../engine/validate';
  import { downloadText, formatDates, ourLabel, sideLabel } from '../lib/format';
  import { toJson } from '../lib/jsonio';
  import { tHref } from '../lib/router.svelte';
  import { draftsFor, nextSeat } from '../lib/store.svelte';
  import type { TournamentData } from '../model/types';

  let { td }: { td: TournamentData } = $props();

  const id = $derived(td.tournament.id);
  const calc = $derived(computeTournament(td));
  const problems = $derived(validateTournament(td));
  const myDrafts = $derived(draftsFor(id));
  const rounds = $derived([...td.rounds].sort((a, b) => a.number - b.number));
  const fmtRecord = (won: number, lost: number) => `${won}–${lost}`;

  function exportJson() {
    downloadText(`${id}.json`, toJson($state.snapshot(td)));
  }
</script>

<Header
  title={td.tournament.name}
  back="#/"
  backLabel="All tournaments"
  sub={[formatDates(td.tournament.startDate, td.tournament.endDate), ourLabel(td)].filter(Boolean).join(' · ')}
>
  <a class="btn primary" href={tHref(id, '/results')}>Results</a>
  <a class="btn" href={tHref(id, '/setup')}>Setup &amp; lineups</a>
  <button onclick={exportJson}>Export JSON</button>
</Header>

{#if problems.length}
  <div class="notice">
    <strong>Check setup:</strong>
    <ul>{#each problems as p (p)}<li>{p}</li>{/each}</ul>
  </div>
{/if}

<p>
  <strong>Ballot record: {fmtRecord(calc.record.ballotsWon, calc.record.ballotsLost)}</strong>
  <span class="muted">
    ({sideLabel(td, 'P')} {fmtRecord(calc.recordBySide.P.ballotsWon, calc.recordBySide.P.ballotsLost)},
    Defense {fmtRecord(calc.recordBySide.D.ballotsWon, calc.recordBySide.D.ballotsLost)})
  </span>
  {#if calc.record.incomplete}<span class="badge warn">{calc.record.incomplete} incomplete</span>{/if}
</p>

{#each rounds as r (r.number)}
  {@const rc = calc.rounds.find((x) => x.round === r.number)}
  {@const ballots = calc.ballots.filter((b) => b.round === r.number)}
  {@const roundDrafts = myDrafts.filter((d) => d.round === r.number && !ballots.some((b) => b.seat === d.seat))}
  <section class="card">
    <div class="round-head">
      <div>
        <h3>Round {r.number} · {sideLabel(td, r.side)}</h3>
        <span class="muted">vs {r.opponent || 'opponent not set'}</span>
      </div>
      {#if rc && rc.ballots}<span class="split num">{fmtRecord(rc.ballotsWon, rc.ballotsLost)}</span>{/if}
    </div>

    <ul class="ballots">
      {#each ballots as b (b.seat)}
        {@const hasDraft = myDrafts.some((d) => d.round === r.number && d.seat === b.seat)}
        <li>
          <a href={tHref(id, `/r/${r.number}/b/${b.seat}`)}>
            <span class="badge {b.result}">{b.result}</span>
            <span class="grow">Ballot {b.seat} · {b.judge}</span>
            <span class="num">{b.ourPoints}–{b.oppPoints}</span>
            {#if !b.complete}<span class="badge warn">{b.missing.length + b.invalid.length} missing</span>{/if}
            {#if hasDraft}<span class="badge warn">unsaved edits</span>{/if}
          </a>
        </li>
      {/each}
      {#each roundDrafts as d (d.seat)}
        <li>
          <a href={tHref(id, `/r/${r.number}/b/${d.seat}`)}>
            <span class="badge warn">Draft</span>
            <span class="grow">Ballot {d.seat}{d.draft.judge ? ` · ${d.draft.judge}` : ''} (not saved)</span>
          </a>
        </li>
      {/each}
    </ul>
    <a class="btn add" href={tHref(id, `/r/${r.number}/b/${nextSeat(td, r.number)}`)}>+ Add ballot</a>
  </section>
{/each}

<p class="muted small">Need another round or a different side? Change it in Setup.</p>

<style>
  .round-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .round-head h3 { margin: 0; }
  .split { font-size: 1.3rem; font-weight: 700; }
  .ballots { list-style: none; padding: 0; margin: 10px 0; }
  .ballots li a {
    display: flex; align-items: center; gap: 8px; min-height: var(--tap);
    padding: 6px 4px; border-top: 1px solid var(--border); text-decoration: none; color: inherit;
  }
  .add { width: 100%; }
  ul { margin: 4px 0; padding-left: 20px; }
</style>
