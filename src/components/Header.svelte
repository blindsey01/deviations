<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, back, backLabel = 'Back', sub, children }: {
    title: string;
    back?: string;
    backLabel?: string;
    sub?: string;
    children?: Snippet;
  } = $props();
</script>

<header>
  {#if back}<a class="back" href={back}>‹ {backLabel}</a>{/if}
  <h1>{title}</h1>
  {#if sub}<p class="muted">{sub}</p>{/if}
  {#if children}<div class="row actions">{@render children()}</div>{/if}
</header>

<style>
  header { margin-bottom: 8px; }
  .back { display: inline-flex; align-items: center; min-height: 40px; text-decoration: none; font-weight: 600; }
  .actions { margin-top: 8px; }
</style>
