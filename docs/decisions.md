# Decisions

Short record of choices and why. Newest at the bottom of each section.

## Stack (Phase 1, 2026-11-09)

- **Vite + Svelte + TypeScript**, tests with **Vitest**, `.xlsx` via **SheetJS** (pinned build from the official SheetJS CDN, because the npm copy is outdated). Loaded only when importing/exporting.
- Why: Vite produces plain static files for GitHub Pages. Svelte components read like HTML and ship small bundles (good on phones). TypeScript types double as documentation of the data model. No router, UI kit or state library, and the GitHub API is called with plain `fetch`.
- Phase 1 only installs TypeScript and Vitest; Svelte and Vite get added in Phase 2.
- TypeScript is pinned to 6.x because `svelte-check`, which type-checks Svelte components, doesn't support TypeScript 7 yet.
- `npm audit` reports 2 low-severity issues in `deepmerge`, used by the Svelte build plugin. It runs only at build time and never ships to users, and no fix exists yet.
- Deploy: the GitHub Actions workflow (`.github/workflows/deploy.yml`) runs tests, type check and build, then publishes `dist/` to Pages. Hash URLs (`#/t/...`) avoid any Pages server config.

## Data model (approved by Ben, 2026-11-09)

- **Scores are keyed by stable performance IDs**, never row positions (`src/model/performances.ts`).
  - Ours are keyed by **who performed**: `us.open`, `us.close`, `us.a1.dx`…`us.a3.dx`, `us.a1.cx`…`us.a3.cx`, `us.w1.d`/`us.w1.c`…, where a1 = Opener, a2 = Swing, a3 = Closer.
  - The opponent's are keyed by **what was examined**, since we don't track their people: `op.wK.d`/`op.wK.c` (their K-th called witness), `op.wK.dx` (their direct of that witness), `op.cx.wK` (their cross of *our* witness slot K).
  - Why performer keys: the engine never needs the trial-order mapping, old workbooks are already keyed this way, and a missing mapping only affects labels. Trade-off: if a round's mapping is corrected after ballots were entered in trial order, the app must offer to move that round's scores to match.
- Sheet order = the ID table in column-O order. Trial order = the same IDs arranged by the per-round `TrialOrder` mapping (call order, who directed each of our witnesses, who crossed each opposing witness).
- **One roster per tournament.** Lineups point at person IDs, so the same person on both sides is linked automatically.
- **One lineup per side, plus an optional per-round substitute override** (Ben: subs are possible).
- **Characters are stored per round.** Old workbooks store them per side, so the import copies them into both rounds.
- A missing score is **absent** from the ballot, never 0. Values that aren't whole numbers from 1 to 10 are treated as missing and reported.

## Calculations

- Method = the old workbook's, with the **G50 bug fixed** (that bug is in the blank template too, so every old workbook has it).
- **Summary Total = mean of the per-ballot Totals** for everyone. The old sheet's witness "Average" (B44/B55/B66) pools the raw scores instead. The two only differ when a score is missing.
- **Combined numbers never mix attorney and witness performances** (Ben). Summaries are grouped by (person, side or combined, attorney/witness).
- Normalized z = (score − same-type benchmark) / population SD of all scores on the ballot. Shown as n/a when SD = 0, and those ballots are skipped in z averages (`nZ` counts the rest). Total z uses the ballot mean as its benchmark.
- **Ties count as half a ballot each** (AMTA convention, confirmed by Ben 2026-11-09).
- Incomplete ballots are still computed but flagged (`complete`, `missing`, `incompleteBallots`, `record.incomplete`).

## Data repo layout (approved by Ben, 2026-11-09)

```
<tournament-slug>/
  tournament.json       metadata, roster, lineups
  round-N/round.json    side, opponent, characters, substitutes, trial-order mapping
  round-N/ballot-K.json judge + scores
```

- One file per ballot, so people entering different ballots never touch the same file.
- **Numbered ballot slots**, not random names. If two people save "round 1, ballot 2", the second gets a conflict ("open theirs / save as ballot 3") instead of a silent duplicate that would be counted twice.
- Every write sends the file's last-known SHA. If it changed, show the conflict and let the user reload or overwrite.

## Ballot entry (Phase 2, 2026-11-09)

- **AMTA-ballot order** follows the paper ballot (photo in the private `reference/` folder), read the way Ben chose: openings (P, D); then each witness as a block in the order called, P case first: calling side's *direct exam, witness direct, witness cross*, then the other side's *cross exam*; then closings (P, D). Lines are labeled like the ballot ("Direct exam of π #1") plus who it was.
- **Old-sheet order** = column O.
- **Auto-advance:** typing 2–9 or 10 jumps to the next box. A "1" waits, because it might become 10; Next/Enter keeps it. Each box selects its contents on focus, so retyping replaces.
- **Drafts:** every keystroke saves a draft on this device. **Save** turns the draft into the stored ballot. Saving with blanks asks first and flags the ballot as incomplete. Values that aren't 1–10 block saving.
- **Changing who-examined-whom** after scores exist asks how the scores were entered: AMTA order moves them to stay on their ballot lines; old-sheet order keeps them.

## Results display (Phase 2)

- Deviations show sign, arrow and color (green > 0, yellow = 0, red < 0). Anything that rounds to 0.00 counts as zero. Phones under 440 px hide the arrow so the tables fit; the +/− sign still carries direction.
- Each cell shows the deviation (or normalized value) with the plain average underneath, mirroring column B's two halves.
- "Combined" on a person's card only appears when they had the same role kind on both sides.
- "Load sample" builds a tournament from the made-up `src/fixtures/synthetic.json`, so the app can be tried without typing ballots.

## Shared storage (Phase 3, 2026-11-09)

- **The data repo lives in a free GitHub organization, not a personal account.** Fine-grained tokens can only reach repos owned by the token holder or an organization they belong to; a collaborator on someone's personal repo can't make one for it. Each person's token: resource owner = the organization, only the data repo, **Contents: Read and write**. The Settings screen links to GitHub's token form pre-filled (owner, name, 1-year expiry, contents=write); the person still has to pick the repo, since the pre-fill can't do that.
- **Sync engine** (`src/sync/engine.ts`) is pure and tested with a fake in-memory GitHub simulating two phones. For each file it remembers the last-seen version (SHA + text):
  - local == last-seen: nothing to upload
  - remote SHA changed and we didn't touch it: take theirs
  - both changed: **conflict**; nothing is overwritten until a person chooses
- GitHub only accepts an update that names the file's current SHA. So the check is enforced by GitHub too, not just by the app.
- **Uploads are one file at a time.** GitHub rejects parallel writes to one repo. A 409 where the file itself is unchanged (someone else's save landed at the same instant) is retried automatically, up to 3 times.
- **Upload order:** tournament file, then round files, then ballots. Files are written as canonical JSON (sorted keys) so identical data always gives identical text.
- **When it syncs:**
  - **Uploads** happen ~1 second after any change.
  - **Downloads** happen when you open any screen of a tournament, every 60 s while the app is open, when the app returns to the foreground, and when the phone comes back online.
  - Failed uploads don't retry in a tight loop. They wait for the next edit, the timer, or "back online".
- **Never losing work:**
  - **Drafts:** unsaved ballots stay on the device.
  - **Saved but not uploaded:** those ballots are kept with the tournament on the device and upload when there's signal.
  - **Edits made during a download** are never overwritten. The engine reads local data only after the network wait, and the same file changing on both sides becomes a conflict.
- **Ballot save checks:**
  - Someone else saved the same ballot number first → offer to save yours as the next number.
  - Someone changed the ballot since you opened it → confirm before replacing theirs.
  - A ballot you haven't touched yet refreshes to the newest version. Once you tap a field, it never changes under you.
- **Conflict choices:** "Keep both" (ballot numbers only; yours moves to the next free number), "Use theirs", "Overwrite theirs with mine". Each shows who saved what, the points, and when.
- **Tournaments can still be "on this device only"** (e.g. the sample, or before connecting). "Share with the team" uploads one, and asks for a new folder name if it's taken. "Remove from this device" leaves the repo copy alone. Deleting a tournament from the repo is done on GitHub, on purpose, so it's hard to do by accident.
- **Each shared tournament remembers which repo it belongs to.** Connecting to a different repo can't mix or delete data.
- **The token** is stored only in the browser's localStorage (key `mtd.github.v1`). Disconnect removes it, and can also remove shared tournaments from a borrowed device. The app loads no third-party scripts, which limits exposure if the page were ever compromised.
- Commit messages name the change and the GitHub user, e.g. "Update round 1 ballot 2 (alice) via Deviations app". The repo history is the audit trail.

## Site visibility (Ben, 2026-11-09)

- **The GitHub Pages site stays public.** Private Pages requires an organization on GitHub Enterprise Cloud. The site is only an app shell with no team data; data access is controlled by the private data repo plus each user's token (Phase 3). We considered Cloudflare Pages + Access and decided not to use it.

## Git

- Commits use `blindsey01` / `blindsey01@users.noreply.github.com` (repo-local git config), so Ben's personal email stays out of the public history.
- **`reference/` is private and git-ignored** (Ben, 2026-11-09): he isn't comfortable publishing the Drexel data even anonymized. Git history was rebuilt before anything was pushed, so it never appeared in a public commit.
- Public tests use `src/fixtures/synthetic.json`, a made-up tournament whose expected values come from an independent Python calculation (`tools/make_synthetic_fixture.py`). It also covers cases the workbook can't: 3 ballots in a round, 1 ballot in a round, and blank scores.
- The Drexel acceptance tests still run on Ben's computer whenever `reference/golden_drexel.json` is present; on GitHub they show as skipped. They read the real numbers from the file at run time, so no real scores appear in the code.

## Open questions

- Old-workbook import: which tournament round numbers the sheet rounds were. The workbook doesn't record this; the import screen will ask (Phase 4).
- The AMTA ballot also has "Outstanding attorneys/witnesses" rankings. Not in scope; ask Ben if he wants them tracked later.
- Old-workbook import: which tournament round numbers the sheet rounds were. The workbook doesn't record this; the import screen will ask (Phase 4).
