# Mock Trial Deviations App

Replaces the per-tournament deviations workbook. See `.claude/CLAUDE.md` for the full spec and `docs/decisions.md` for design choices.

## Status

- **Phase 1 (done):** data model + calculation engine, tested against a made-up fixture (`src/fixtures/synthetic.json`) and, on machines that have it, the private `reference/golden_drexel.json`.
- **Phase 2 (done):** tournament setup, phone-friendly ballot entry (AMTA-ballot order or old-sheet order), results (team table, competitor cards, ballot results), JSON backup. Data lives in this browser only.
- Phase 3: shared storage in a private GitHub repo.
- Phase 4: `.xlsx` import/export, printable report.

## Running it on your computer

Requires Node.js 20+.

```sh
npm install
npm run dev        # starts the app; open the "Local" URL it prints
                   # on your phone (same Wi-Fi), open the "Network" URL
npm test           # engine tests (the private Drexel tests run only if reference/ is present)
npm run check      # type-checks everything
npm run build      # builds the static site into dist/
```

## Publishing to GitHub Pages

The code lives at **https://github.com/blindsey01/deviations** (public). Every push to `main` runs the tests, then builds and deploys the site to **https://blindsey01.github.io/deviations/**.

One-time setup (already needed only once per repo): **Settings → Pages → Build and deployment → Source: GitHub Actions**. The **Actions** tab shows each deploy.

## Layout

- `src/model/`: the data model (`performances.ts` = the 28 stable score IDs, `types.ts` = stored shapes, `ballotOrder.ts` = the two entry orders)
- `src/engine/`: the calculation engine (pure functions, no UI) and its tests
- `src/views/`: one file per screen (Home, Tournament, Setup, Ballot entry, Results, Person)
- `src/lib/`: storage, routing, formatting helpers
- `src/fixtures/synthetic.json`: a made-up tournament for tests and the sample button (regenerate with `python tools/make_synthetic_fixture.py`)
- `reference/`: **private, not in git.** The real workbooks, golden file and ballot photo live only on Ben's computer.
