<script lang="ts">
  import Header from '../components/Header.svelte';
  import { formatDates } from '../lib/format';
  import { parseTournamentJson } from '../lib/jsonio';
  import { go, tHref } from '../lib/router.svelte';
  import { addTournament, createTournament, db, deleteTournament } from '../lib/store.svelte';
  import { conn, download, forget, isShared, pendingCount, refreshRemoteList, remoteList, share, shared } from '../lib/sync.svelte';
  import { validateTournament } from '../engine/validate';
  import type { TournamentData } from '../model/types';

  let newName = $state('');
  let shareNew = $state(true);
  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null);
  let opening = $state('');

  const byDate = (a: TournamentData, b: TournamentData) =>
    (b.tournament.startDate ?? '').localeCompare(a.tournament.startDate ?? '') || a.tournament.name.localeCompare(b.tournament.name);
  const localOnly = $derived(Object.values(db.tournaments).filter((td) => !isShared(td.tournament.id)).sort(byDate));

  /** Team tournaments: what's in the repo, plus shared copies on this device that aren't listed (yet). */
  const teamList = $derived.by(() => {
    const rows = remoteList.items.map((r) => ({ ...r, onDevice: !!db.tournaments[r.slug] && isShared(r.slug), inRepo: true }));
    for (const id of Object.keys(shared)) {
      const td = db.tournaments[id];
      if (td && !rows.some((r) => r.slug === id))
        rows.push({ slug: id, name: td.tournament.name, startDate: td.tournament.startDate, endDate: td.tournament.endDate, onDevice: true, inRepo: false });
    }
    return rows;
  });

  $effect(() => {
    if (conn.cfg) void refreshRemoteList();
  });

  async function create(e: Event) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const toShare = !!conn.cfg && shareNew;
    const taken = new Set(remoteList.items.map((r) => r.slug));
    const id = createTournament(name, (x) => taken.has(x));
    newName = '';
    if (toShare) {
      try {
        await share(id);
      } catch (err) {
        message = { kind: 'error', text: `Created on this device, but couldn’t share it yet: ${err instanceof Error ? err.message : err}` };
      }
    }
    go(`/t/${encodeURIComponent(id)}/setup`);
  }

  async function open(slug: string) {
    if (db.tournaments[slug] && isShared(slug)) return go(tHref(slug).slice(1));
    opening = slug;
    message = null;
    try {
      await download(slug);
      go(tHref(slug).slice(1));
    } catch (err) {
      message = { kind: 'error', text: err instanceof Error ? err.message : String(err) };
    } finally {
      opening = '';
    }
  }

  function add(data: TournamentData) {
    let replace = false;
    if (db.tournaments[data.tournament.id]) {
      if (isShared(data.tournament.id)) {
        replace = false; // never replace a shared tournament from a file; add a local copy instead
      } else {
        replace = confirm(
          `"${db.tournaments[data.tournament.id]!.tournament.name}" is already on this device.\n\nOK = replace it with the file.\nCancel = keep both (the file is added as a copy).`,
        );
      }
    }
    const id = addTournament(data, replace);
    const problems = validateTournament(data);
    message = {
      kind: problems.length ? 'error' : 'ok',
      text:
        `Imported "${data.tournament.name}" to this device: ${data.rounds.length} rounds, ${data.ballots.length} ballots, ${data.tournament.roster.length} people.` +
        (conn.cfg ? ' Open it and tap “Share with the team” to upload it.' : '') +
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

  function removeShared(slug: string, name: string) {
    const n = pendingCount(slug);
    const msg = n
      ? `“${name}” has ${n} change${n > 1 ? 's' : ''} that haven't uploaded yet. Removing it from this device will LOSE them. Remove anyway?`
      : `Remove “${name}” from this device? It stays in the team repo and you can download it again.`;
    if (confirm(msg)) forget(slug);
  }
</script>

<Header title="Mock Trial Deviations" sub="Ballot scores and deviations">
  <a class="btn" href="#/settings">{conn.cfg ? `⚙ Settings · ${conn.cfg.login}` : '⚙ Connect to team storage'}</a>
</Header>

{#if message}<p class="notice {message.kind}">{message.text}</p>{/if}

{#if conn.cfg}
  <h2>Team tournaments</h2>
  {#if remoteList.error}<p class="notice error small">{remoteList.error}</p>{/if}
  {#if remoteList.loading && teamList.length === 0}<p class="muted">Loading…</p>{/if}
  {#if !remoteList.loading && teamList.length === 0 && !remoteList.error}
    <p class="muted">No tournaments in {conn.cfg.owner}/{conn.cfg.repo} yet. Create one below.</p>
  {/if}
  {#each teamList as r (r.slug)}
    <div class="card t-row">
      <button class="t-link" onclick={() => open(r.slug)} disabled={!!opening}>
        <strong>{r.name}</strong>
        <span class="muted small">
          {formatDates(r.startDate, r.endDate) || 'No dates'} ·
          {#if opening === r.slug}downloading…{:else if !r.inRepo}not uploaded yet{:else if r.onDevice}on this device{:else}tap to download{/if}
          {#if r.onDevice && pendingCount(r.slug)} · {pendingCount(r.slug)} waiting to upload{/if}
        </span>
      </button>
      {#if r.onDevice}
        <button class="link" onclick={() => removeShared(r.slug, r.name)} aria-label="Remove {r.name} from this device">Remove</button>
      {/if}
    </div>
  {/each}
  <button class="link" onclick={() => refreshRemoteList()} disabled={remoteList.loading}>{remoteList.loading ? 'Refreshing…' : 'Refresh list'}</button>
{/if}

<h2>{conn.cfg ? 'On this device only' : 'Tournaments'}</h2>
{#if localOnly.length === 0}
  <p class="muted">
    {conn.cfg ? 'Nothing here. Tournaments you create while connected are shared with the team.' : 'No tournaments on this device yet. Create one, import a JSON backup, or load the sample.'}
  </p>
{/if}
{#each localOnly as td (td.tournament.id)}
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
<form onsubmit={create}>
  <div class="row">
    <input class="grow" style="width:auto" placeholder="e.g. Drexel O3" bind:value={newName} aria-label="Tournament name" />
    <button class="primary" type="submit" disabled={!newName.trim()}>Create</button>
  </div>
  {#if conn.cfg}
    <label class="check small"><input type="checkbox" bind:checked={shareNew} /> <span>Share with the team (save to {conn.cfg.repo})</span></label>
  {/if}
</form>

<h2>Import or try it</h2>
<div class="row">
  <label class="btn">
    Import JSON backup
    <input type="file" accept=".json,application/json" onchange={importFile} hidden />
  </label>
  <button onclick={loadSample}>Load sample tournament (made-up data)</button>
</div>

{#if !conn.cfg}
  <p class="muted small" style="margin-top:2em">
    Data on this screen is stored only in this browser. <a href="#/settings">Connect to team storage</a> to share tournaments with teammates.
  </p>
{/if}

<style>
  .t-row { display: flex; align-items: center; gap: 8px; padding: 0 8px 0 0; }
  .t-link {
    flex: 1; display: flex; flex-direction: column; align-items: flex-start; padding: 12px 16px; text-decoration: none;
    color: inherit; min-height: var(--tap); border: none; background: none; text-align: left; font: inherit;
  }
</style>
