<script lang="ts">
  import { tick, untrack } from 'svelte';
  import Header from '../components/Header.svelte';
  import { lineupForRound } from '../engine/compute';
  import { ballotOrder, effectiveTrialOrder, SHEET_ORDER, type BallotLine } from '../model/ballotOrder';
  import { PERF_BY_ID, PERF_IDS, SLOT_LABEL, sheetLabel, type PerfId, type Side } from '../model/performances';
  import type { TournamentData } from '../model/types';
  import { ourLabel, personName, sideLabel, sideSymbol } from '../lib/format';
  import { go, tHref } from '../lib/router.svelte';
  import { KEYS, loadString, saveString } from '../lib/storage';
  import { deleteBallot, draftKey, drafts, parseRaw, saveBallot } from '../lib/store.svelte';

  let { td, round, seat }: { td: TournamentData; round: number; seat: number } = $props();

  // Read once when the page opens: App.svelte re-creates this page for every ballot.
  const tid = untrack(() => td.tournament.id);
  const roundObj = untrack(() => td.rounds.find((r) => r.number === round));
  const saved = untrack(() => td.ballots.find((b) => b.round === round && b.seat === seat));
  const key = untrack(() => draftKey(tid, round, seat));
  const restored = drafts[key];

  let judge = $state(restored?.judge ?? saved?.judge ?? '');
  let raw = $state<Partial<Record<PerfId, string>>>(
    restored ? { ...restored.raw } : Object.fromEntries(Object.entries(saved?.scores ?? {}).map(([k, v]) => [k, String(v)])),
  );
  let dirty = $state(!!restored);
  let order = $state<'ballot' | 'sheet'>(loadString(KEYS.entryOrder) === 'sheet' ? 'sheet' : 'ballot');
  let error = $state('');

  function touch() {
    dirty = true;
    drafts[key] = {
      judge,
      raw: { ...raw },
      updatedAt: new Date().toISOString(),
      baseUpdatedAt: saved?.updatedAt,
    };
  }

  function setOrder(o: 'ballot' | 'sheet') {
    order = o;
    saveString(KEYS.entryOrder, o);
  }

  // ---------------------------------------------------------- rows to show
  interface Row {
    id: PerfId;
    label: string;
    who: string;
    ours: boolean;
    column: Side;
  }
  interface Group {
    title: string;
    note?: string;
    rows: Row[];
  }

  const ourSide = roundObj?.side ?? 'P';
  const lineup = roundObj ? untrack(() => lineupForRound(td.tournament.lineups[ourSide], roundObj)) : null;
  const trial = effectiveTrialOrder(roundObj?.trialOrder);
  const opp = roundObj?.opponent || 'Opponent';
  const ours = untrack(() => ourLabel(td));

  function whoFor(id: PerfId): string {
    const p = PERF_BY_ID[id];
    if (p.team === 'op' || !p.performer || !lineup) return opp;
    const name = personName(td, lineup[p.performer]) || `${SLOT_LABEL[p.performer]} (not set)`;
    if (p.performer.startsWith('w')) {
      const ch = roundObj?.characters[p.performer as 'w1' | 'w2' | 'w3'];
      return ch ? `${name} as ${ch}` : name;
    }
    return `${name} · ${SLOT_LABEL[p.performer]}`;
  }

  function lineLabel(l: BallotLine): string {
    const k = l.witnessNo;
    const sym = l.witnessSide ? sideSymbol(l.witnessSide) : '';
    switch (l.kind) {
      case 'open': return 'Opening statement';
      case 'close': return 'Closing argument';
      case 'dx': return `Direct exam of ${sym} #${k}`;
      case 'wd': return `Witness #${k} direct`;
      case 'wc': return `Witness #${k} cross`;
      case 'cx': return `Cross exam of ${sym} #${k}`;
    }
  }

  const ballotGroups: Group[] = ballotOrder(ourSide, trial.order).map((s) => {
    let title = s.kind === 'openings' ? 'Opening statements' : s.kind === 'closings' ? 'Closing arguments' : '';
    if (s.kind === 'witness') {
      const caseName = `${sideLabel(td, s.witnessSide!)} witness #${s.witnessNo}`;
      const ch = s.ourWitness ? roundObj?.characters[s.ourWitness] : '';
      title = s.ourWitness ? `${caseName} · ${ch || 'our witness'}` : `${caseName} · ${opp}`;
    }
    return {
      title,
      rows: s.lines.map((l) => ({
        id: l.id,
        label: lineLabel(l),
        who: whoFor(l.id),
        ours: l.id.startsWith('us.'),
        column: l.column,
      })),
    };
  });

  const sheetGroups: Group[] = [
    { title: ours, ids: SHEET_ORDER.slice(0, 14) },
    { title: opp, ids: SHEET_ORDER.slice(14) },
  ].map((g) => ({
    title: g.title,
    rows: g.ids.map((id) => ({
      id,
      label: sheetLabel(id, ourSide),
      who: id.startsWith('us.') ? whoFor(id) : '',
      ours: id.startsWith('us.'),
      column: (id.startsWith('us.') ? ourSide : ourSide === 'P' ? 'D' : 'P') as Side,
    })),
  }));

  const groups = $derived(order === 'ballot' ? ballotGroups : sheetGroups);
  const flat = $derived(groups.flatMap((g) => g.rows));

  // ---------------------------------------------------------- validation & totals
  const isValid = (v: string | undefined) => !!v && /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 10;
  const status = (v: string | undefined) => (!v ? 'blank' : isValid(v) ? 'ok' : 'bad');

  const totals = $derived.by(() => {
    let us = 0, them = 0, filled = 0, bad = 0;
    for (const id of PERF_IDS) {
      const v = raw[id];
      if (!v) continue;
      if (!isValid(v)) { bad++; continue; }
      filled++;
      if (id.startsWith('us.')) us += Number(v);
      else them += Number(v);
    }
    return { us, them, filled, bad, diff: us - them };
  });

  // ---------------------------------------------------------- typing & moving
  async function focusIndex(i: number) {
    await tick();
    const el = document.querySelector<HTMLElement>(`[data-idx="${i}"]`) ?? document.getElementById('save-btn');
    el?.focus();
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function onInput(id: PerfId, i: number, el: HTMLInputElement) {
    const v = el.value.replace(/\D/g, '').slice(0, 2);
    el.value = v;
    raw[id] = v;
    touch();
    // 2-9 and 10 can't be the start of anything longer, so jump ahead.
    // A "1" waits, because it might become 10. Press Next/Enter to keep it.
    if (/^([2-9]|10)$/.test(v)) focusIndex(i + 1);
  }

  function onKey(e: KeyboardEvent, i: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      focusIndex(i + 1);
    }
  }

  // ---------------------------------------------------------- save / discard / delete
  function save() {
    error = '';
    if (totals.bad) {
      error = `${totals.bad} box${totals.bad > 1 ? 'es have' : ' has'} a value that isn't 1–10. Fix ${totals.bad > 1 ? 'them' : 'it'} first.`;
      return;
    }
    const missing = 28 - totals.filled;
    if (missing && !confirm(`${missing} score${missing > 1 ? 's are' : ' is'} blank. Save anyway? The ballot will be flagged as incomplete.`)) return;
    saveBallot(td, { round, seat, judge: judge.trim() || undefined, scores: parseRaw(raw) });
    dirty = false;
    go(tHref(tid).slice(1));
  }

  function discard() {
    if (!confirm(saved ? 'Discard your unsaved changes and go back to the saved ballot?' : 'Discard this ballot? Nothing has been saved.')) return;
    delete drafts[key];
    go(tHref(tid).slice(1));
  }

  function remove() {
    if (!confirm(`Delete ballot ${seat} of round ${round}? This can't be undone.`)) return;
    deleteBallot(td, round, seat);
    go(tHref(tid).slice(1));
  }
</script>

{#if !roundObj}
  <p class="notice error">Round {round} isn't set up. <a href={tHref(tid, '/setup')}>Go to Setup</a></p>
{:else}
  <Header
    title="Round {round} · Ballot {seat}"
    back={tHref(tid)}
    backLabel={td.tournament.name}
    sub="{sideLabel(td, ourSide)} vs {opp}"
  />

  {#if restored}
    <p class="notice">Restored your unsaved {saved ? 'changes' : 'ballot'} from {new Date(restored.updatedAt).toLocaleString()}.</p>
  {/if}

  <label class="field">
    <span>Judge's name (optional)</span>
    <input type="text" bind:value={judge} oninput={touch} autocomplete="off" placeholder="As printed on the ballot" />
  </label>

  <div class="row toolbar">
    <span class="muted small">Order:</span>
    <div class="seg" role="group" aria-label="Entry order">
      <button aria-pressed={order === 'ballot'} onclick={() => setOrder('ballot')}>AMTA ballot</button>
      <button aria-pressed={order === 'sheet'} onclick={() => setOrder('sheet')}>Old sheet</button>
    </div>
  </div>

  {#if order === 'ballot' && trial.isDefault}
    <p class="notice small">
      Who examined whom isn't set for this round, so the names below assume W1 was called first and each attorney examined
      the matching witness. <a href={tHref(tid, '/setup')}>Set it in Setup</a> if that's wrong; the scores follow the ballot lines.
    </p>
  {/if}

  {#each groups as g, gi (order + gi)}
    <section class="group">
      <h3>{g.title}</h3>
      {#each g.rows as row (row.id)}
        {@const i = flat.indexOf(row)}
        {@const st = status(raw[row.id])}
        <div class="line" class:ours={row.ours}>
          <label for="s-{row.id}">
            <span class="lbl">
              {#if order === 'ballot'}<span class="badge" class:ours={row.ours}>{row.column}</span>{/if}
              {row.label}
            </span>
            {#if row.who}<span class="who">{row.who}</span>{/if}
          </label>
          <input
            id="s-{row.id}"
            data-idx={i}
            class="score {st}"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            enterkeyhint="next"
            autocomplete="off"
            maxlength="2"
            value={raw[row.id] ?? ''}
            oninput={(e) => onInput(row.id, i, e.currentTarget)}
            onkeydown={(e) => onKey(e, i)}
            onfocus={(e) => e.currentTarget.select()}
            aria-invalid={st === 'bad'}
          />
        </div>
        {#if st === 'bad'}<p class="bad-msg">Scores are whole numbers from 1 to 10.</p>{/if}
      {/each}
    </section>
  {/each}

  <div class="row" style="margin-top:20px">
    {#if dirty}<button onclick={discard}>Discard changes</button>{/if}
    {#if saved}<button class="danger" onclick={remove}>Delete ballot</button>{/if}
  </div>

  <footer class="totals" aria-live="polite">
    <div class="tally num">
      <span><span class="t-name">{ours}</span> <strong>{totals.us}</strong></span>
      <span><span class="t-name">{opp}</span> <strong>{totals.them}</strong></span>
      <span class="diff" class:pos={totals.diff > 0} class:neg={totals.diff < 0}>
        {totals.diff > 0 ? '+' : totals.diff < 0 ? '−' : ''}{Math.abs(totals.diff)}
      </span>
      <span class="muted small">{totals.filled}/28</span>
    </div>
    {#if error}<p class="err">{error}</p>{/if}
    <button id="save-btn" class="primary save" onclick={save} disabled={!dirty && !!saved}>
      {saved ? (dirty ? 'Save changes' : 'Saved') : 'Save ballot'}
    </button>
  </footer>
{/if}

<style>
  .toolbar { margin: 8px 0 4px; }
  .group h3 { margin: 18px 0 6px; font-size: 0.95rem; color: var(--muted); text-transform: none; }
  .line {
    display: flex; align-items: center; gap: 10px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 6px 6px 6px 12px; margin: 6px 0;
  }
  .line.ours { border-left: 4px solid var(--ours); }
  .line label { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .lbl { font-weight: 600; display: flex; gap: 6px; align-items: center; }
  .who { font-size: 0.85rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  input.score {
    width: 64px; min-width: 64px; height: 52px; text-align: center;
    font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; padding: 0;
  }
  input.score.ok { border-color: color-mix(in srgb, var(--pos-text) 50%, var(--border)); }
  input.score.bad { border: 2px solid var(--danger); background: var(--neg-bg); }
  .bad-msg { color: var(--danger); font-size: 0.85rem; margin: -2px 0 6px 12px; }

  .totals {
    position: fixed; left: 0; right: 0; bottom: 0;
    background: var(--surface); border-top: 1px solid var(--border);
    padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
    box-shadow: 0 -4px 16px rgb(0 0 0 / 0.08);
  }
  .tally { flex: 1; display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; min-width: 0; }
  .t-name { color: var(--muted); font-size: 0.85rem; max-width: 9em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom; }
  .tally strong { font-size: 1.25rem; }
  .diff { font-weight: 700; padding: 1px 8px; border-radius: 6px; background: var(--zero-bg); color: var(--zero-text); }
  .diff.pos { background: var(--pos-bg); color: var(--pos-text); }
  .diff.neg { background: var(--neg-bg); color: var(--neg-text); }
  .save { min-width: 130px; }
  .err { width: 100%; color: var(--danger); margin: 0; font-size: 0.9rem; }
</style>
