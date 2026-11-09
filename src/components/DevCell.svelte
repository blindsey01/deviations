<script lang="ts">
  /** One summary cell: the deviation (colored, signed, with an arrow) and the plain average under it. */
  import { dev, num } from '../lib/format';

  let { value, avg, label = '' }: { value: number | null | undefined; avg?: number | null; label?: string } = $props();
  const d = $derived(dev(value));
  const words = { pos: 'above', neg: 'below', zero: 'equal to', na: '' } as const;
</script>

<span
  class="dev {d.tone}"
  title={d.tone === 'na' ? 'Not available' : `${d.text} (${words[d.tone]} the benchmark)`}
  aria-label={d.tone === 'na' ? `${label} not available` : `${label} deviation ${d.text}`}
>
  {#if d.arrow}<span class="arrow" aria-hidden="true">{d.arrow}</span>{/if}{d.text}
</span>
{#if avg !== undefined}<span class="avg">{num(avg)}</span>{/if}

<style>
  .avg { display: block; font-size: 0.78rem; color: var(--muted); margin-top: 2px; }
</style>
