# Mock Trial Deviations App

Replaces the per-tournament deviations workbook. See `.claude/CLAUDE.md` for the full spec and `docs/decisions.md` for design choices.

**App:** https://blindsey01.github.io/deviations/

## Status

- **Phase 1 (done):** data model + calculation engine, tested against a made-up fixture (`src/fixtures/synthetic.json`) and, on machines that have it, the private `reference/golden_drexel.json`.
- **Phase 2 (done):** tournament setup, phone-friendly ballot entry (AMTA-ballot order or old-sheet order), results (team table, competitor cards, ballot results), JSON backup.
- **Phase 3 (done):** shared storage in a private GitHub repo, with per-ballot files, conflict handling and offline drafts.
- Phase 4: `.xlsx` import/export, printable report.

## For teammates: getting connected

You need a GitHub account (free) and about five minutes.

1. **Get invited.** Send your GitHub username to the team's data admin (Ben). You'll get an email invitation to the team's GitHub **organization**. Accept it.
2. **Open the setup link** Ben sends you (it looks like `…/deviations/#/settings?owner=…&repo=…`). It opens the app's Settings page with the organization and repo filled in.
3. **Create your token.** On that Settings page, tap **“this pre-filled token form”**. GitHub opens with almost everything filled in:
   - **Resource owner:** the team organization (pre-filled)
   - **Expiration:** 1 year (pre-filled)
   - **Repository access:** choose **Only select repositories**, then pick the **data repo**. ← the one thing you must do yourself
   - **Permissions → Repository permissions → Contents:** **Read and write** (pre-filled)

   Tap **Generate token** and copy it. It starts with `github_pat_`. GitHub shows it only once.
4. **Paste it** into the app's Settings and tap **Connect**. Done: the team's tournaments appear on the home screen.

Good to know:
- The token is saved **only in your browser** on that device. It never goes into any repo. Do steps 3–4 again on each phone/computer you use, or reuse the same token.
- If the organization requires approval for tokens, Connect will say the token “can’t see” the repo until Ben approves it.
- On a borrowed device, use **Settings → Disconnect** with “also remove shared tournaments from this device” ticked when you're done.
- Lost or leaked token? Delete it at GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens, then make a new one.

## For the admin (one-time setup)

1. **Create a free GitHub organization** at https://github.com/account/organizations/new (plan: Free). Pick a name that doesn't identify the school, because organization names are public. Fine-grained tokens can only reach a repo owned by *your own account or an organization you belong to*, so a teammate couldn't make a token for a repo under your personal account. That's why the data lives in an organization.
2. **Create the data repo inside the organization:** **Private**, tick “Add a README file” (any name, e.g. `deviations-data`).
3. **Token approval policy:** Organization → Settings → Personal access tokens. Either leave **“Require administrator approval”** on (you'll approve each teammate's token under *Pending requests*) or turn it off so tokens work immediately. Either is fine for a small team.
4. **Invite teammates:** Organization → People → Invite member. **Member** role is enough; then give members write access to the data repo (repo → Settings → Collaborators and teams → add the members or a team with **Write**).
5. **Connect yourself** in the app (steps 3–4 above), then use **Settings → Invite a teammate** to copy the setup link to send people.

## How shared data is stored

```
<tournament-folder>/
  tournament.json           name, dates, roster, lineups
  round-1/round.json        side, opponent, characters, substitutes, who examined whom
  round-1/ballot-1.json     one judge's ballot
  round-1/ballot-2.json
  ...
```

One file per ballot, so people entering different ballots never touch the same file. Every save checks that the file hasn't changed since you loaded it; if it has, the app shows both versions and lets you choose. Nothing is overwritten silently. Every change is a commit, so the repo's history is a full audit trail (and a way to undo mistakes).

## Running it on your computer

Requires Node.js 20+.

```sh
npm install
npm run dev        # starts the app; open the "Local" URL it prints
                   # on your phone (same Wi-Fi), open the "Network" URL
npm test           # engine + sync tests (the private Drexel tests run only if reference/ is present)
npm run check      # type-checks everything
npm run build      # builds the static site into dist/
```

## Publishing

The code lives at **https://github.com/blindsey01/deviations** (public). Every push to `main` runs the tests, then builds and deploys the site to GitHub Pages. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The **Actions** tab shows each deploy.

## Layout

- `src/model/`: the data model (`performances.ts` = the 28 stable score IDs, `types.ts` = stored shapes, `ballotOrder.ts` = the two entry orders)
- `src/engine/`: the calculation engine (pure functions, no UI) and its tests
- `src/sync/`: shared storage without any UI: file layout, GitHub API client, sync engine and its two-device tests
- `src/views/`: one file per screen (Home, Tournament, Setup, Ballot entry, Results, Person, Settings)
- `src/lib/`: app state, local storage, routing, formatting; `sync.svelte.ts` connects the sync engine to the app
- `src/fixtures/synthetic.json`: a made-up tournament for tests and the sample button (regenerate with `python tools/make_synthetic_fixture.py`)
- `reference/`: **private, not in git.** The real workbooks, golden file and ballot photo live only on Ben's computer.
