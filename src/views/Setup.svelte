<script lang="ts">
  import Header from '../components/Header.svelte';
  import SyncStatus from '../components/SyncStatus.svelte';
  import TrialOrderEditor from '../components/TrialOrderEditor.svelte';
  import { validateTournament } from '../engine/validate';
  import { ATTY_SLOTS, SLOTS, SLOT_LABEL, WIT_SLOTS, type Side, type Slot } from '../model/performances';
  import type { Round, TournamentData } from '../model/types';
  import { sideLabel } from '../lib/format';
  import { tHref } from '../lib/router.svelte';
  import { drafts, randomId } from '../lib/store.svelte';

  let { td }: { td: TournamentData } = $props();

  const t = $derived(td.tournament);
  const problems = $derived(validateTournament(td));
  const rounds = $derived([...td.rounds].sort((a, b) => a.number - b.number));
  const roster = $derived([...t.roster].sort((a, b) => a.name.localeCompare(b.name)));

  // ---------------------------------------------------------- roster
  let newPerson = $state('');
  function addPerson(e: Event) {
    e.preventDefault();
    const name = newPerson.trim();
    if (!name) return;
    if (t.roster.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      alert(`${name} is already on the roster.`);
      return;
    }
    t.roster.push({ id: randomId('p'), name });
    newPerson = '';
  }

  function usesOf(personId: string): string[] {
    const uses: string[] = [];
    for (const side of ['P', 'D'] as Side[])
      for (const s of SLOTS) if (t.lineups[side][s] === personId) uses.push(`${sideLabel(td, side)} ${SLOT_LABEL[s]}`);
    for (const r of td.rounds)
      for (const s of SLOTS) if (r.lineupOverride?.[s] === personId) uses.push(`Round ${r.number} substitute`);
    return uses;
  }

  function removePerson(personId: string) {
    const uses = usesOf(personId);
    const name = t.roster.find((p) => p.id === personId)?.name;
    if (!confirm(uses.length ? `${name} is ${uses.join(', ')}. Remove them anyway? Those slots will be emptied.` : `Remove ${name}?`)) return;
    for (const side of ['P', 'D'] as Side[]) for (const s of SLOTS) if (t.lineups[side][s] === personId) t.lineups[side][s] = null;
    for (const r of td.rounds) for (const s of SLOTS) if (r.lineupOverride?.[s] === personId) delete r.lineupOverride[s];
    t.roster = t.roster.filter((p) => p.id !== personId);
  }

  // ---------------------------------------------------------- rounds
  function addRound() {
    const number = Math.max(0, ...td.rounds.map((r) => r.number)) + 1;
    const counts = { P: 0, D: 0 };
    for (const r of td.rounds) counts[r.side]++;
    const side: Side = counts.P <= counts.D ? 'P' : 'D';
    const prev = [...td.rounds].reverse().find((r) => r.side === side);
    td.rounds.push({ number, side, opponent: '', characters: { ...(prev?.characters ?? {}) } });
  }

  function removeRound(r: Round) {
    const n = td.ballots.filter((b) => b.round === r.number).length;
    if (!confirm(n ? `Round ${r.number} has ${n} ballot${n > 1 ? 's' : ''}. Delete the round AND its ballots?` : `Delete round ${r.number}?`)) return;
    td.ballots = td.ballots.filter((b) => b.round !== r.number);
    td.rounds = td.rounds.filter((x) => x !== r);
    for (const k of Object.keys(drafts)) if (k.startsWith(`${t.id}|${r.number}|`)) delete drafts[k];
  }

  function setOverride(r: Round, slot: Slot, value: string) {
    r.lineupOverride ??= {};
    if (value === '') delete r.lineupOverride[slot];
    else r.lineupOverride[slot] = value;
    if (Object.keys(r.lineupOverride).length === 0) delete r.lineupOverride;
  }

  const nameOf = (id: string | null | undefined) => t.roster.find((p) => p.id === id)?.name ?? '';
</script>

<Header title="Setup" back={tHref(t.id)} backLabel={t.name} />
<SyncStatus id={t.id} />

{#if problems.length}
  <div class="notice"><ul>{#each problems as p (p)}<li>{p}</li>{/each}</ul></div>
{/if}

<!-- ===================================================== tournament -->
<section class="card">
  <h2>Tournament</h2>
  <label class="field"><span>Name</span><input type="text" bind:value={t.name} /></label>
  <div class="two">
    <label class="field"><span>Start date</span><input type="date" bind:value={t.startDate} /></label>
    <label class="field"><span>End date</span><input type="date" bind:value={t.endDate} /></label>
  </div>
  <label class="field"><span>Our team label</span><input type="text" bind:value={t.ourTeamLabel} placeholder="e.g. Team A" /></label>
  <fieldset>
    <legend class="muted small">This year's case calls the first side</legend>
    <div class="seg" role="group">
      <button aria-pressed={t.pSideLabel === 'Plaintiff'} onclick={() => (t.pSideLabel = 'Plaintiff')}>Plaintiff</button>
      <button aria-pressed={t.pSideLabel === 'Prosecution'} onclick={() => (t.pSideLabel = 'Prosecution')}>Prosecution</button>
    </div>
  </fieldset>
  <p class="muted small">Folder name in the team repo: <code>{t.id}</code></p>
</section>

<!-- ===================================================== roster -->
<section class="card">
  <h2>Roster</h2>
  <p class="muted small">Everyone who competed. Use the same person on both sides and their numbers combine automatically.</p>
  {#each roster as p (p.id)}
    <div class="row person">
      <input class="grow" style="width:auto" type="text" bind:value={p.name} aria-label="Name" />
      <button class="link danger" onclick={() => removePerson(p.id)} aria-label="Remove {p.name}">Remove</button>
    </div>
  {/each}
  <form class="row" onsubmit={addPerson}>
    <input class="grow" style="width:auto" type="text" bind:value={newPerson} placeholder="Add a name" aria-label="New person" />
    <button type="submit" disabled={!newPerson.trim()}>Add</button>
  </form>
</section>

<!-- ===================================================== lineups -->
{#each ['P', 'D'] as const as side (side)}
  <section class="card">
    <h2>{sideLabel(td, side)} lineup</h2>
    <p class="muted small">Used in every {sideLabel(td, side)} round. For a one-round sub, use Substitutes on that round.</p>
    <div class="slots">
      {#each SLOTS as slot (slot)}
        <label class="field">
          <span>{SLOT_LABEL[slot]}</span>
          <select bind:value={t.lineups[side][slot]}>
            <option value={null}>—</option>
            {#each roster as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
          </select>
        </label>
      {/each}
    </div>
    <details>
      <summary class="small">"Crosses:" notes</summary>
      {#each ATTY_SLOTS as a (a)}
        <label class="field">
          <span>{SLOT_LABEL[a]}</span>
          <input
            type="text"
            value={t.crossesNotes?.[side]?.[a] ?? ''}
            oninput={(e) => {
              t.crossesNotes ??= {};
              t.crossesNotes[side] ??= {};
              t.crossesNotes[side]![a] = e.currentTarget.value;
            }}
          />
        </label>
      {/each}
    </details>
  </section>
{/each}

<!-- ===================================================== rounds -->
<h2>Rounds</h2>
{#each rounds as r (r.number)}
  {@const lineup = t.lineups[r.side]}
  <section class="card">
    <div class="row">
      <h3 class="grow" style="margin:0">Round {r.number}</h3>
      <button class="link danger" onclick={() => removeRound(r)}>Delete round</button>
    </div>
    <div class="two">
      <label class="field">
        <span>Our side</span>
        <select bind:value={r.side}>
          <option value="P">{sideLabel(td, 'P')}</option>
          <option value="D">Defense</option>
        </select>
      </label>
      <label class="field"><span>Opponent</span><input type="text" bind:value={r.opponent} placeholder="Team name" /></label>
    </div>

    <h3>Characters this round</h3>
    {#each WIT_SLOTS as w (w)}
      <label class="field">
        <span>{SLOT_LABEL[w]}{nameOf(r.lineupOverride?.[w] ?? lineup[w]) ? ` · ${nameOf(r.lineupOverride?.[w] ?? lineup[w])}` : ''}</span>
        <input
          type="text"
          value={r.characters[w] ?? ''}
          oninput={(e) => (r.characters[w] = e.currentTarget.value)}
          placeholder="Character name"
        />
      </label>
    {/each}

    <details>
      <summary>Substitutes{r.lineupOverride ? ` (${Object.keys(r.lineupOverride).length})` : ''}</summary>
      <p class="muted small">Only for someone who replaced the usual {sideLabel(td, r.side)} lineup in this round.</p>
      <div class="slots">
        {#each SLOTS as slot (slot)}
          <label class="field">
            <span>{SLOT_LABEL[slot]} <span class="muted">(usually {nameOf(lineup[slot]) || '—'})</span></span>
            <select value={r.lineupOverride?.[slot] ?? ''} onchange={(e) => setOverride(r, slot, e.currentTarget.value)}>
              <option value="">No substitute</option>
              {#each roster as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
            </select>
          </label>
        {/each}
      </div>
    </details>

    <details>
      <summary>Who examined whom{r.trialOrder ? '' : ' (not set)'}</summary>
      <TrialOrderEditor {td} round={r} />
    </details>
  </section>
{/each}
<button onclick={addRound}>+ Add round</button>

<style>
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
  .slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0 12px; }
  .person { margin: 6px 0; }
  fieldset { border: none; padding: 0; margin: 10px 0; }
  details { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 8px; }
  summary { cursor: pointer; min-height: 40px; display: flex; align-items: center; font-weight: 600; }
  ul { margin: 0; padding-left: 20px; }
  @media (max-width: 420px) { .two { grid-template-columns: 1fr; } }
</style>
