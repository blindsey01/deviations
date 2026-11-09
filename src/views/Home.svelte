<script lang="ts">
  import Header from '../components/Header.svelte';
  import { formatDates } from '../lib/format';
  import { parseTournamentJson } from '../lib/jsonio';
  import { go, tHref } from '../lib/router.svelte';
  import { addTournament, createTournament, db, deleteTournament } from '../lib/store.svelte';
  import { validateTournament } from '../engine/validate';
  import type { TournamentData } from '../model/types';

  let newName = $state('');
  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const list = $derived(
    Object.values(db.tournaments).sort((a, b) =>
      (b.tournament.startDate ?? '').localeCompare(a.tournament.startDate ?? '') ||
      a.tournament.name.localeCompare(b.tournament.name),
    ),
  );

  function create(e: Event) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const id = createTournament(name);
    newName = '';
    go(`/t/${encodeURIComponent(id)}/setup`);
  }

  function add(data: TournamentData) {
    let replace = false;
    if (db.tournaments[data.tournament.id]) {
      replace = confirm(
        `"${db.tournaments[data.tournament.id]!.tournament.name}" is already on this device.\n\nOK = replace it with the file.\nCancel = keep both (the file is added as a copy).`,
      );
    }
    const id = addTournament(data, replace);
    const problems = validateTournament(data);
    message = {
      kind: problems.length ? 'error' : 'ok',
      text:
        `Imported "${data.tournament.name}": ${data.rounds.length} rounds, ${data.ballots.length} ballots, ${data.tournament.roster.length} people.` +
        (problems.length ? ` Check these: ${problems.join(' ')}` : ''),
    };
    return id;
  }

  async function importFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const parsed = parseTournamentJson(await file.text());
    if ('error' in parsed) {
      message = { kind: 'error', text: parsed.error };
      return;
    }
    add(parsed.data);
  }

  async function loadSample() {
    const [{ default: golden }, { goldenToTournament }] = await Promise.all([
      import('../fixtures/synthetic.json'),
      import('../model/goldenFixture'),
    ]);
    const data = goldenToTournament(golden as never);
    go(tHref(add(data)).slice(1));
  }

  function remove(td: TournamentData) {
    if (confirm(`Delete "${td.tournament.name}" from this device? Export a JSON backup first if you need it.`))
      deleteTournament(td.tournament.id);
  }
</script>

<Header title="Mock Trial Deviations" sub="Ballot scores and deviations" />

{#if message}<p class="notice {message.kind}">{message.text}</p>{/if}

<h2>Tournaments</h2>
{#if list.length === 0}
  <p class="muted">No tournaments on this device yet. Create one, import a JSON backup, or load the sample.</p>
{/if}
{#each list as td (td.tournament.id)}
  <div class="card t-row">
    <a class="t-link" href={tHref(td.tournament.id)}>
      <strong>{td.tournament.name}</strong>
      <span class="muted small">
        {formatDates(td.tournament.startDate, td.tournament.endDate) || 'No dates'} · {td.ballots.length} ballots
      </span>
    </a>
    <button class="link danger" onclick={() => remove(td)} aria-label="Delete {td.tournament.name}">Delete</button>
  </div>
{/each}

<h2>New tournament</h2>
<form class="row" onsubmit={create}>
  <input class="grow" style="width:auto" placeholder="e.g. Drexel O3" bind:value={newName} aria-label="Tournament name" />
  <button class="primary" type="submit" disabled={!newName.trim()}>Create</button>
</form>

<h2>Import or try it</h2>
<div class="row">
  <label class="btn">
    Import JSON backup
    <input type="file" accept=".json,application/json" onchange={importFile} hidden />
  </label>
  <button onclick={loadSample}>Load sample tournament (made-up data)</button>
</div>

<p class="muted small" style="margin-top:2em">
  Data is stored only in this browser for now. Shared storage through GitHub comes in Phase 3, so use JSON export as your backup.
</p>

<style>
  .t-row { display: flex; align-items: center; gap: 8px; padding: 0 8px 0 0; }
  .t-link { flex: 1; display: flex; flex-direction: column; padding: 12px 16px; text-decoration: none; color: inherit; min-height: var(--tap); }
</style>
