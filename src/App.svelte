<script lang="ts">
  import { route } from './lib/router.svelte';
  import { db, drafts } from './lib/store.svelte';
  import { KEYS, saveJSON, storageStatus } from './lib/storage';
  import Home from './views/Home.svelte';
  import TournamentHome from './views/TournamentHome.svelte';
  import Setup from './views/Setup.svelte';
  import BallotEntry from './views/BallotEntry.svelte';
  import Results from './views/Results.svelte';
  import Person from './views/Person.svelte';

  // Save to this device whenever anything changes.
  let storageError = $state('');
  $effect(() => {
    saveJSON(KEYS.tournaments, $state.snapshot(db.tournaments));
    storageError = storageStatus.ok ? '' : storageStatus.message;
  });
  $effect(() => {
    saveJSON(KEYS.drafts, $state.snapshot(drafts));
  });

  const parts = $derived(route.path.split('/').filter(Boolean).map(decodeURIComponent));
</script>

<main>
  {#if storageError}
    <p class="notice error">
      This browser is not saving data ({storageError}). Export a JSON backup before closing this tab.
    </p>
  {/if}

  {#if parts.length === 0}
    <Home />
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
