<script lang="ts">
  import { untrack } from 'svelte';
  import { route } from './lib/router.svelte';
  import { db, drafts } from './lib/store.svelte';
  import { KEYS, saveJSON, storageStatus } from './lib/storage';
  import Home from './views/Home.svelte';
  import TournamentHome from './views/TournamentHome.svelte';
  import Setup from './views/Setup.svelte';
  import BallotEntry from './views/BallotEntry.svelte';
  import Results from './views/Results.svelte';
  import Person from './views/Person.svelte';
  import Settings from './views/Settings.svelte';
  import { conn, scheduleUploads, shared, syncActive } from './lib/sync.svelte';

  // Save to this device whenever anything changes.
  let storageError = $state('');
  $effect(() => {
    saveJSON(KEYS.tournaments, $state.snapshot(db.tournaments));
    storageError = storageStatus.ok ? '' : storageStatus.message;
  });
  $effect(() => {
    saveJSON(KEYS.drafts, $state.snapshot(drafts));
  });
  $effect(() => {
    if (conn.cfg) saveJSON(KEYS.github, $state.snapshot(conn.cfg));
    else saveJSON(KEYS.github, null);
  });
  $effect(() => {
    saveJSON(KEYS.sync, $state.snapshot(shared));
  });
  // Upload shared tournaments' changes a moment after they're made. Only local
  // edits trigger this (not sync status changes), so a failed upload while
  // offline doesn't retry in a tight loop; the timer below and the browser's
  // "back online" event retry instead.
  $effect(() => {
    $state.snapshot(db.tournaments);
    untrack(scheduleUploads);
  });

  const [pathOnly, query] = $derived(route.path.split('?') as [string, string | undefined]);
  const parts = $derived(pathOnly.split('/').filter(Boolean).map(decodeURIComponent));
  const currentId = $derived(parts[0] === 't' ? parts[1] : undefined);

  // Check for other people's changes when a tournament opens, every minute while the
  // app is open, and when the app comes back to the foreground. Uploads that are
  // still waiting (e.g. after losing signal) are retried at the same times.
  $effect(() => {
    const id = currentId;
    void pathOnly; // also re-check on every screen change, e.g. when opening a ballot
    if (!conn.cfg) return;
    untrack(() => syncActive(id));
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') syncActive(id);
    }, 60_000);
    const onVisible = () => document.visibilityState === 'visible' && syncActive(id);
    const onOnline = () => syncActive(id);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  });
</script>

<main>
  {#if storageError}
    <p class="notice error">
      This browser is not saving data ({storageError}). Export a JSON backup before closing this tab.
    </p>
  {/if}

  {#if parts.length === 0}
    <Home />
  {:else if parts[0] === 'settings'}
    <Settings query={query ?? ''} />
  {:else if parts[0] === 't' && parts[1]}
    {@const td = db.tournaments[parts[1]]}
    {#if !td}
      <p class="notice">That tournament isn't on this device. <a href="#/">Go to all tournaments</a></p>
    {:else if parts.length === 2}
      <TournamentHome {td} />
    {:else if parts[2] === 'setup'}
      <Setup {td} />
    {:else if parts[2] === 'results'}
      <Results {td} />
    {:else if parts[2] === 'p' && parts[3]}
      <Person {td} personId={parts[3]} />
    {:else if parts[2] === 'r' && parts[4] === 'b'}
      {#key route.path}
        <BallotEntry {td} round={Number(parts[3])} seat={Number(parts[5])} />
      {/key}
    {:else}
      <p class="notice">Page not found. <a href="#/">Go home</a></p>
    {/if}
  {:else}
    <p class="notice">Page not found. <a href="#/">Go home</a></p>
  {/if}
</main>
