<script lang="ts">
  /**
   * Edits one round's "who examined whom" mapping. Changes are applied with a
   * button so we can offer to move already-entered scores to match.
   */
  import { defaultTrialOrder, effectiveTrialOrder, remapScores, trialOrderProblems } from '../model/ballotOrder';
  import { ATTY_SLOTS, SLOT_LABEL, WIT_SLOTS, type AttySlot, type WitSlot } from '../model/performances';
  import type { Round, TournamentData, TrialOrder } from '../model/types';
  import { lineupForRound } from '../engine/compute';
  import { sideLabel, sideSymbol } from '../lib/format';
  import { drafts } from '../lib/store.svelte';
  import { untrack } from 'svelte';

  let { td, round }: { td: TournamentData; round: Round } = $props();

  // Local copy, applied with the Save button.
  let edit = $state<TrialOrder>(untrack(() => structuredClone($state.snapshot(round.trialOrder) ?? defaultTrialOrder())));
  let pendingRemap = $state(false);
  let message = $state('');

  const problems = $derived(trialOrderProblems(edit));
  const lineup = $derived(lineupForRound(td.tournament.lineups[round.side], round));
  const theirSide = $derived(round.side === 'P' ? 'D' : 'P');

  const nameOf = (slot: AttySlot | WitSlot) => td.tournament.roster.find((p) => p.id === lineup[slot])?.name;
  const label = (slot: AttySlot | WitSlot) => {
    const n = nameOf(slot);
    const ch = slot.startsWith('w') ? round.characters[slot as WitSlot] : '';
    return [SLOT_LABEL[slot], n, ch].filter(Boolean).join(' · ');
  };

  const roundBallots = $derived(td.ballots.filter((b) => b.round === round.number && Object.keys(b.scores).length));
  const roundDraftKeys = $derived(
    Object.keys(drafts).filter((k) => k.startsWith(`${td.tournament.id}|${round.number}|`)),
  );

  function apply() {
    message = '';
    if (problems.length) return;
    const before = effectiveTrialOrder(round.trialOrder).order;
    const changed = JSON.stringify(before) !== JSON.stringify(edit);
    if (changed && (roundBallots.length || roundDraftKeys.length)) {
      pendingRemap = true;
      return;
    }
    commit(false);
  }

  function commit(move: boolean) {
    const before = effectiveTrialOrder(round.trialOrder).order;
    const after = $state.snapshot(edit) as TrialOrder;
    if (move) {
      for (const b of roundBallots) b.scores = remapScores($state.snapshot(b.scores), round.side, before, after);
      for (const k of roundDraftKeys) drafts[k]!.raw = remapScores($state.snapshot(drafts[k]!.raw), round.side, before, after);
    }
    round.trialOrder = structuredClone(after);
    pendingRemap = false;
    message = move ? 'Saved, and moved existing scores to match.' : 'Saved.';
  }

  function cancel() {
    edit = structuredClone($state.snapshot(round.trialOrder) ?? defaultTrialOrder());
    pendingRemap = false;
  }

  function setCall(i: number, w: WitSlot) {
    edit.ourCallOrder[i] = w;
  }
</script>

<p class="muted small">
  Used only to label the AMTA-ballot entry order. The calculations don't depend on it.
</p>

<h4>Order our witnesses were called ({sideLabel(td, round.side)} {sideSymbol(round.side)} #1–3)</h4>
{#each [0, 1, 2] as i (i)}
  <label class="field">
    <span>Called #{i + 1}</span>
    <select value={edit.ourCallOrder[i]} onchange={(e) => setCall(i, e.currentTarget.value as WitSlot)}>
      {#each WIT_SLOTS as w (w)}<option value={w}>{label(w)}</option>{/each}
    </select>
  </label>
{/each}

<h4>Who directed each of our witnesses</h4>
{#each WIT_SLOTS as w (w)}
  <label class="field">
    <span>{label(w)}</span>
    <select bind:value={edit.directBy[w]}>
      {#each ATTY_SLOTS as a (a)}<option value={a}>{label(a)}</option>{/each}
    </select>
  </label>
{/each}

<h4>Who crossed each of their witnesses ({sideSymbol(theirSide)} #1–3)</h4>
{#each [0, 1, 2] as i (i)}
  <label class="field">
    <span>Their witness #{i + 1}</span>
    <select bind:value={edit.crossBy[i]}>
      {#each ATTY_SLOTS as a (a)}<option value={a}>{label(a)}</option>{/each}
    </select>
  </label>
{/each}

{#if problems.length}
  <div class="notice error small"><ul>{#each problems as p (p)}<li>{p}</li>{/each}</ul></div>
{/if}

{#if pendingRemap}
  <div class="notice">
    <p><strong>This round already has scores.</strong> How were they entered?</p>
    <div class="row">
      <button class="primary" onclick={() => commit(true)}>In AMTA-ballot order: move them to match</button>
      <button onclick={() => commit(false)}>In old-sheet order: keep them where they are</button>
      <button class="link" onclick={cancel}>Cancel</button>
    </div>
  </div>
{:else}
  <div class="row">
    <button class="primary" onclick={apply} disabled={problems.length > 0}>Save who examined whom</button>
    <button class="link" onclick={cancel}>Reset</button>
  </div>
{/if}
{#if message}<p class="notice ok small">{message}</p>{/if}

<style>
  h4 { margin: 14px 0 2px; font-size: 0.9rem; }
  ul { margin: 0; padding-left: 20px; }
</style>
