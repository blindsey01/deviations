# Mock Trial Deviations App

## What this project is

Our mock trial team tracks **score deviations** after every AMTA tournament: how each competitor's ballot scores compare with the rest of the trial they competed in. Today this happens in a Google Sheets/Excel workbook (one per tournament). You are building a **static web app** to replace that workbook. It has to be easier to enter ballots into, easier to read, and able to handle **any number of ballots per round** (the workbook is hard-wired to two judges).

The owner is **Ben**, a student officer on the team. He is an accounting and business-analytics student, comfortable with data and spreadsheets and newer to front-end web work. Explain decisions in plain terms. When a choice changes what the team will experience (data layout, sharing model, anything hard to undo), ask before deciding.

A few team members will **both enter and view** data. There is no separate read-only audience, and no per-competitor privacy inside the app.

## Reference material (in `reference/`, PRIVATE: git-ignored, on Ben's computer only)

Ben decided none of this goes in the public repo, not even anonymized. Never commit anything from `reference/`, and never copy its real values (scores, opponents, characters, results) into code, tests, comments or docs. Tests read it at run time and skip when it's absent.

- `Deviations Template.xlsx`: the blank workbook the team copies for each tournament.
- `Drexel O3 Devs 2026.xlsx`: a completed workbook from a real tournament, with competitor names replaced by "Name 1" through "Name 6". Opponent schools and witness character names are real.
- `golden_drexel.json`: the raw scores from the Drexel workbook plus the **expected outputs**, recomputed independently and checked cell by cell against the workbook. Its `_readme` field explains the keys. **This is the acceptance test for the calculation engine** (runs locally when present).
- `AMTA Ballot.JPEG`: a photo of a real AMTA ballot (real names), used to set the entry order.

Public stand-in: `src/fixtures/synthetic.json`, a made-up tournament in the same layout, generated with independently computed expected values by `tools/make_synthetic_fixture.py`. It runs everywhere (including GitHub Actions) and also powers the app's sample button. Phase 4's `.xlsx` import test on the Drexel workbook should likewise run locally only, with a synthetic workbook for the public tests.

Open the workbooks yourself before building. Read the formulas in columns B and E–M and the raw scores in columns O–Q. Do not rely only on the summary below.

## How the current workbook works

**Structure.** There is one sheet per side ("Prosecution"/"Plaintiff" and "Defense"; the label depends on whether the year's case is criminal or civil). Each sheet holds the two rounds the team argued on that side. Column O lists every performance in the trial for both teams, and columns P and Q hold the Judge 1 and Judge 2 scores (integers 1–10). Our team's 14 performances come first, then the opponent's 14:

- Ours: opening, 3 attorney directs, 3 × (witness on direct, witness on cross), 3 attorney crosses, closing.
- Opponent: the same 14 types.

**Fixed roles.** Each side has one lineup used in both of that side's rounds:

| Role | Scored performances |
|---|---|
| Opener (attorney 1) | opening, one direct, one cross |
| Swing (attorney 2) | one direct, one cross |
| Closer (attorney 3) | closing, one direct, one cross |
| Witness 1–3 | direct, cross (plus a character name) |

The "Crosses:" cell under each attorney is free text.

**Per-ballot calculations.** Each ballot (one judge, one round) is computed on its own:

- **Benchmark** for a performance type = the mean of every score of that type on that ballot, **both teams**:
  - Openings: both openings.
  - Closings: both closings.
  - Attorney directs: all 6.
  - Attorney crosses: all 6.
  - Witness directs: all 6.
  - Witness crosses: all 6.
- **Deviation** for a performance = the person's score minus the benchmark for that type. "Speech" means the opening for the Opener and the closing for the Closer, so they are benchmarked separately.
- **Total** = the mean of the person's own scores on that ballot. **Total deviation** = Total minus the mean of **all 28 scores** on that ballot.

**Summary (column B).** Each person gets a plain mean, across every ballot on that side, of each per-ballot score (Total, Direct, Cross, Speech) and each deviation. Every ballot is weighted equally. Excel's `AVERAGE` skips blank cells, so a missing score is excluded rather than treated as zero.

**Extras.**
- Column U sums each team's points per ballot, which shows who won the ballot.
- Conditional formatting colors deviations green (>0), yellow (=0), and red (<0).

**Known bug, do not replicate.** On the Plaintiff/Prosecution sheet, cell `G50` (the round-2 benchmark for witness crosses) includes `P38`, which is an attorney direct, where it should have `P40` (witness 1's cross). The Defense sheet is correct. `golden_drexel.json` uses the corrected method and notes the three summary cells that differ from the workbook.

## Requirements

### Tournament structure
- One tournament per dataset. Store tournament metadata: name, dates, our team label, and the side label (Plaintiff or Prosecution).
- Default to 4 rounds, 2 per side. Don't hard-code "2" anywhere in the calculations.
- **The number of ballots varies by round.** For example, round 1 might have 2 judges and round 3 might have 3. Every average and every result must work for any number of ballots ≥ 1.
- Record the **judge's name** on each ballot. The name is optional and free text.
- Record the **opponent's name** for each round. For the opponent, store only the team name and raw scores: no performer names and no characters.

### Lineup
- **One lineup per side** (Opener, Swing, Closer, W1–W3), reused in both of that side's rounds, as in the sheet. A round may carry an optional **per-round substitute override** for any slot (Ben confirmed subs are possible).
- The **character each of our witnesses played is set per round**, because it can change between rounds.
- Keep a single roster of people for the tournament. If the same person appears on both sides, link them so their combined numbers can be shown.

### Ballot entry (the most-used screen)
- Must be **comfortable on a phone** at a tournament: large tap targets, a numeric keypad, quick movement to the next field, validation to integers 1–10, and running point totals for each team as you type.
- **Toggle between two entry orders**, both showing the same underlying data:
  1. **Trial/ballot order**, matching the AMTA ballot (`reference/AMTA Ballot.JPEG`, private). **Confirmed by Ben ("down each column"):** openings (P, then D); then each witness as a block in the order called, P case first, then D case. Within a block: the calling side's direct exam, witness direct, witness cross, then the other side's cross exam. Then closings (P, then D). To label scores in this order, each round needs a small mapping: the order our witnesses were called, which of our attorneys directed each, and which of our attorneys crossed each opposing witness (opposing witnesses are identified only by call order, e.g., "Opp witness 2").
  2. **Sheet order**, matching columns O–Q today: our 14 performances, then theirs.
- Design the storage model so that both orders are just *views* of the same stored scores, using stable performance IDs rather than row positions.
- Spotty tournament Wi-Fi is normal. Never lose an in-progress ballot: keep drafts locally until they are saved.

### Calculations
1. **Current method, exactly as described above** (bug fixed), generalized to N ballots. This is the primary view.
2. **Ballot results:** per ballot, each team's points, the differential, and W/L/T. Per round, the ballot split (e.g., 2–1). Per tournament, the ballot record. A tied ballot counts as half a ballot for each team (confirmed by Ben).
3. **Per-side summaries:** each person's P-side numbers, D-side numbers, and combined numbers. Combined = all of their ballots weighted equally. **Never combine attorney and witness performances** (not even Total / total deviation): someone who was an attorney on one side and a witness on the other gets separate attorney and witness numbers. Attorney + attorney or witness + witness across sides combine normally.
4. **Judge-normalized deviation (new, secondary, clearly labeled):** per ballot, `(score − same-type benchmark) / population SD of all scores on that ballot`, then averaged across ballots. This adjusts for judges who score in a narrow or wide band. If SD = 0, show "n/a". The `*_z` values in the golden file use this definition. If you think a different normalization is better, propose it to Ben before building it.
- Missing scores are excluded from means, as with Excel's `AVERAGE`. Flag incomplete ballots visibly instead of silently computing on partial data.
- Put the calculation engine in its own pure module with no UI, and give it unit tests. The tests must reproduce `golden_drexel.json` (locally) and `src/fixtures/synthetic.json` (everywhere) to within floating-point tolerance, including the corrected G50 values.

### Results views
- **Per-competitor card:** the column-B summary (averages and deviations by Total, Direct, Cross, Speech) with green/yellow/red coloring. Color must not be the only cue, so also use a sign or arrow. Each card drills down to the per-ballot numbers.
- **Team/tournament view:** all competitors side by side, a P/D/combined toggle, a raw-versus-normalized toggle, and a ballot-results table.
- **Printable/PDF report:** a clean per-competitor or team summary to hand out, via print stylesheet or PDF export.

### Import and export
- **Import old `.xlsx` workbooks** in the template layout. Handle both "Prosecution" and "Plaintiff" sheet names and the blank rows in round 1 (rows 4, 16, 28). Import **raw scores, names, characters, and opponents only**, then recompute with the engine. Don't import the workbook's computed cells, since they carry the G50 bug. Show a summary of what was imported. These old files always have 2 ballots per round.
- **Export a tournament to `.xlsx`**: at minimum a raw-scores sheet and a results sheet. Propose a layout to Ben; it doesn't need to copy the old template.
- Also support **JSON export/import** of a whole tournament, as a backup and an escape hatch.

### Hosting, storage, and sharing
- **Static site on GitHub Pages**, built from a **public code repo**. No server.
- **Tournament data lives in a separate private GitHub repo.** The app reads and writes it through the GitHub REST API (contents endpoints) using each user's **fine-grained personal access token**. The token should be scoped to that one data repo with Contents read/write only.
  - Store the token only in the user's browser, never in code or commits. Provide a clear "connect / disconnect" settings screen.
  - Write a short README section for teammates covering how to get added as a collaborator on the data repo and how to create the token.
- Several people may enter ballots **at the same time** during a tournament (e.g., one person per judge's ballot). Choose a file layout that avoids write collisions. For example: one file for tournament setup and lineups, plus **one file per ballot**. Use the file SHA that GitHub returns for optimistic concurrency. If a file changed since it was loaded, show the conflict and let the user reload or overwrite. Never silently clobber someone else's edit.
- **Nothing identifying goes in the public repo.** Don't name the school or team anywhere in code, docs, sample data or commit messages (Ben's request); use generic labels like "Team A" or "our team". Public test fixtures must be **made up** (see `src/fixtures/synthetic.json`); the whole `reference/` folder is git-ignored. Before committing any `.xlsx`, check its hidden author fields (`docProps/core.xml`).
- Code repo owner: GitHub user `blindsey01`. Commits use `blindsey01@users.noreply.github.com` (set in this repo's local git config) to keep Ben's personal email out of the public history.

### Stack
You choose the front-end stack. Optimize for (a) static output that deploys cleanly to GitHub Pages, (b) a solid mobile experience, (c) code Ben can follow and maintain with help, and (d) a well-maintained library for reading and writing `.xlsx`. Briefly explain your choice to Ben before scaffolding. Avoid dependencies the app doesn't need.

## Approved data model (Phase 1)

See `docs/decisions.md` for the reasoning. In short:
- Code: `src/model/performances.ts` (the 28 stable performance IDs), `src/model/types.ts` (stored shapes), `src/engine/` (pure calculation engine + tests).
- Our scores are keyed by **who performed** (`us.a1.dx` = Opener's direct). Opponent scores are keyed by **what was examined** (`op.w2.d` = their 2nd-called witness on direct, `op.cx.w1` = their cross of our W1). The per-round trial-order mapping only affects labels; if it is edited after ballots exist, offer to move that round's scores to match.
- Data repo layout: `<tournament-slug>/tournament.json`, `<slug>/round-N/round.json`, `<slug>/round-N/ballot-K.json` (numbered slots; a save that finds the slot taken is a conflict, never a silent new ballot).

## How to work

Build in phases. **At the end of each phase, stop, summarize what works, show Ben how to try it, and wait for his go-ahead.**

1. **Model + engine.** Tournament/round/ballot/lineup data model, plus the calculation engine with tests that pass against `golden_drexel.json`. Show Ben the data model before moving on. It's the hardest thing to change later.
2. **Local MVP.** Tournament setup, ballot entry (both orders, phone-friendly), and the results views, with data kept in the browser and JSON export/import. Deployed to GitHub Pages so Ben can try it on his phone.
3. **Shared storage.** Read/write to the private GitHub data repo, the token settings screen, per-ballot files, conflict handling, and offline drafts.
4. **Import/export and reports.** `.xlsx` import of old workbooks (test it on the Drexel file: imported results must match `golden_drexel.json`), `.xlsx` export, the printable report, and the normalized-deviation view.

General norms:
- When something in the workbook is ambiguous, or the AMTA ballot format matters, ask Ben rather than guessing.
- Keep a short `docs/decisions.md` recording choices and why they were made, e.g., the file layout, the stack, and how ties count.
- Keep this file current. If a requirement changes in conversation, update the relevant section here.
