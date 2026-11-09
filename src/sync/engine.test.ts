import { describe, expect, it } from 'vitest';
import { goldenToTournament, loadFixture, SYNTHETIC_PATH } from '../engine/golden';
import type { TournamentData } from '../model/types';
import { pendingPaths, pull, push, resolveKeepMine, resolveKeepTheirs, resolveMoveMine, emptyState, type SyncState } from './engine';
import { FakeRemote, FakeRepo } from './fakeRemote';
import { assembleTournament, ballotPath, canonical, parsePath, roundPath, splitTournament, tournamentPath, type Files } from './layout';

const SLUG = 'sample-tournament';
const sample = (): TournamentData => structuredClone(goldenToTournament(loadFixture(SYNTHETIC_PATH)));

/** One phone: its own copy of the tournament and its own sync state. */
class Device {
  td: TournamentData;
  state: SyncState = emptyState();
  remote: FakeRemote;
  constructor(repo: FakeRepo, td?: TournamentData) {
    this.remote = new FakeRemote(repo);
    this.td = td ?? ({ tournament: { id: SLUG }, rounds: [], ballots: [] } as unknown as TournamentData);
  }
  files = (): Files => (this.td.tournament.name === undefined ? {} : splitTournament(this.td));
  setFiles(files: Files) {
    const a = assembleTournament(SLUG, files);
    if (a) this.td = a.data;
  }
  async pull() {
    const r = await pull(this.remote, SLUG, this.files, this.state);
    this.state = r.state;
    if (r.changed.length) this.setFiles(r.files);
    return r;
  }
  async push() {
    const r = await push(this.remote, SLUG, this.files, this.state, 'tester', 1);
    this.state = r.state;
    return r;
  }
  async sync() {
    await this.pull();
    return this.push();
  }
  ballot(round: number, seat: number) {
    return this.td.ballots.find((b) => b.round === round && b.seat === seat);
  }
}

async function twoDevices() {
  const repo = new FakeRepo();
  const a = new Device(repo, sample());
  await a.push();
  const b = new Device(repo);
  await b.pull();
  return { repo, a, b };
}

describe('file layout', () => {
  it('splits a tournament into one file per ballot and rebuilds it exactly', () => {
    const td = sample();
    const files = splitTournament(td);
    expect(Object.keys(files)).toHaveLength(1 + td.rounds.length + td.ballots.length);
    expect(files[tournamentPath(SLUG)]).toBeDefined();
    expect(files[ballotPath(SLUG, 1, 3)]).toBeDefined();
    const back = assembleTournament(SLUG, files)!.data;
    expect(canonical(back)).toBe(canonical(td));
  });

  it('recognizes only its own paths', () => {
    expect(parsePath('x/round-2/ballot-10.json')).toEqual({ slug: 'x', kind: 'ballot', round: 2, seat: 10 });
    expect(parsePath('x/round-2/round.json')).toEqual({ slug: 'x', kind: 'round', round: 2 });
    expect(parsePath('README.md')).toBeNull();
    expect(parsePath('x/notes.json')).toBeNull();
  });

  it('writes the same text no matter what order fields were added in', () => {
    expect(canonical({ b: 1, a: { d: 2, c: 3 } })).toBe(canonical({ a: { c: 3, d: 2 }, b: 1 }));
  });
});

describe('sharing and downloading', () => {
  it('uploads every file once, then a second device downloads an identical tournament', async () => {
    const { repo, a, b } = await twoDevices();
    expect(repo.files.size).toBe(Object.keys(a.files()).length);
    expect(canonical(b.td)).toBe(canonical(a.td));
    expect(pendingPaths(SLUG, a.files(), a.state)).toEqual([]);
    expect(pendingPaths(SLUG, b.files(), b.state)).toEqual([]);
  });

  it('uploads the tournament file first, then rounds, then ballots', async () => {
    const repo = new FakeRepo();
    await new Device(repo, sample()).push();
    expect(repo.commits[0]).toMatch(/tournament setup/);
    expect(repo.commits[1]).toMatch(/round 1 setup/);
    expect(repo.commits.at(-1)).toMatch(/ballot/);
  });

  it('a second sync with nothing changed downloads and uploads nothing', async () => {
    const { a } = await twoDevices();
    const before = a.remote.calls;
    const r = await a.sync();
    expect(r.uploaded).toEqual([]);
    expect(a.remote.calls - before).toBe(1); // just the file listing
  });
});

describe('two people at once', () => {
  it('different ballots in the same round both survive', async () => {
    const { a, b } = await twoDevices();
    a.td.ballots.push({ round: 2, seat: 2, judge: 'From A', scores: { 'us.open': 9 } });
    b.td.ballots.push({ round: 2, seat: 3, judge: 'From B', scores: { 'us.open': 4 } });
    await a.sync();
    await b.sync();
    await a.sync();
    expect(a.ballot(2, 3)?.judge).toBe('From B');
    expect(b.ballot(2, 2)?.judge).toBe('From A');
    expect(a.state.conflicts).toEqual({});
    expect(b.state.conflicts).toEqual({});
  });

  it('a setup edit and a ballot edit by different people merge cleanly', async () => {
    const { a, b } = await twoDevices();
    a.td.tournament.roster.push({ id: 'p-new', name: 'New Person' });
    b.ballot(1, 1)!.judge = 'Renamed judge';
    await a.sync();
    await b.sync();
    await a.sync();
    for (const d of [a, b]) {
      expect(d.td.tournament.roster.some((p) => p.name === 'New Person')).toBe(true);
      expect(d.ballot(1, 1)!.judge).toBe('Renamed judge');
    }
  });

  it('the same ballot number saved by two people is a conflict, never an overwrite', async () => {
    const { repo, a, b } = await twoDevices();
    a.td.ballots.push({ round: 2, seat: 2, judge: 'A judge', scores: { 'us.open': 9 } });
    b.td.ballots.push({ round: 2, seat: 2, judge: 'B judge', scores: { 'us.open': 4 } });
    await a.sync();
    const r = await b.push();
    const path = ballotPath(SLUG, 2, 2);
    expect(r.uploaded).not.toContain(path);
    expect(b.state.conflicts[path]?.kind).toBe('both-created');
    expect(JSON.parse(repo.files.get(path)!.text).judge).toBe('A judge'); // A's ballot untouched

    // B moves theirs to ballot 3: both ballots end up saved.
    const moved = resolveMoveMine(path, 3, b.files(), b.state);
    b.state = moved.state;
    b.setFiles(moved.files);
    await b.sync();
    await a.sync();
    expect(a.ballot(2, 2)?.judge).toBe('A judge');
    expect(a.ballot(2, 3)?.judge).toBe('B judge');
    expect(a.ballot(2, 3)?.seat).toBe(3);
  });

  it('two edits to the same ballot: "keep theirs" and "keep mine" both work', async () => {
    const { repo, a, b } = await twoDevices();
    const path = ballotPath(SLUG, 1, 2);
    a.ballot(1, 2)!.judge = 'A version';
    b.ballot(1, 2)!.judge = 'B version';
    await a.sync();
    await b.sync(); // pull sees A's change while B also changed it
    expect(b.state.conflicts[path]?.kind).toBe('both-changed');
    expect(JSON.parse(repo.files.get(path)!.text).judge).toBe('A version');

    // Keep mine: B's version replaces A's on the next upload.
    b.state = resolveKeepMine(path, b.state);
    await b.sync();
    expect(JSON.parse(repo.files.get(path)!.text).judge).toBe('B version');
    await a.sync();
    expect(a.ballot(1, 2)!.judge).toBe('B version');

    // Now A edits again, B edits again, B keeps theirs.
    a.ballot(1, 2)!.judge = 'A again';
    b.ballot(1, 2)!.judge = 'B again';
    await a.sync();
    await b.sync();
    const k = resolveKeepTheirs(path, b.files(), b.state);
    b.state = k.state;
    b.setFiles(k.files);
    expect(b.ballot(1, 2)!.judge).toBe('A again');
    expect(pendingPaths(SLUG, b.files(), b.state)).toEqual([]);
  });

  it('an edit to a ballot someone else deleted is flagged', async () => {
    const { a, b } = await twoDevices();
    a.td.ballots = a.td.ballots.filter((x) => !(x.round === 1 && x.seat === 3));
    b.ballot(1, 3)!.judge = 'Still editing';
    await a.sync();
    await b.sync();
    expect(b.state.conflicts[ballotPath(SLUG, 1, 3)]?.kind).toBe('they-deleted');
  });

  it('deleting a ballot nobody else touched removes it everywhere', async () => {
    const { repo, a, b } = await twoDevices();
    a.td.ballots = a.td.ballots.filter((x) => !(x.round === 1 && x.seat === 3));
    await a.sync();
    expect(repo.files.has(ballotPath(SLUG, 1, 3))).toBe(false);
    await b.sync();
    expect(b.ballot(1, 3)).toBeUndefined();
  });

  it('retries automatically when two saves hit GitHub at the same instant', async () => {
    const { repo, a } = await twoDevices();
    a.ballot(1, 1)!.judge = 'After a race';
    repo.branchRaces = 2;
    const r = await a.push();
    expect(r.error).toBeNull();
    expect(r.uploaded).toEqual([ballotPath(SLUG, 1, 1)]);
    expect(a.state.conflicts).toEqual({});
  });
});

describe('bad connections', () => {
  it('keeps changes waiting while offline and uploads them later', async () => {
    const { repo, a } = await twoDevices();
    a.td.ballots.push({ round: 2, seat: 2, judge: 'Offline ballot', scores: { 'us.open': 7 } });
    a.td.rounds.find((r) => r.number === 2)!.opponent = 'Changed offline';
    a.remote.offline = true;
    const r = await a.push();
    expect(r.error?.kind).toBe('network');
    expect(pendingPaths(SLUG, a.files(), a.state)).toEqual([roundPath(SLUG, 2), ballotPath(SLUG, 2, 2)]);

    a.remote.offline = false;
    const r2 = await a.push();
    expect(r2.error).toBeNull();
    expect(repo.files.has(ballotPath(SLUG, 2, 2))).toBe(true);
    expect(pendingPaths(SLUG, a.files(), a.state)).toEqual([]);
  });

  it('never loses an edit made while a download was in progress', async () => {
    const { a, b } = await twoDevices();
    b.ballot(1, 1)!.judge = 'B changed it';
    await b.sync();
    // A starts downloading; during the download A edits a different ballot.
    let edited = false;
    const r = await pull(
      a.remote,
      SLUG,
      () => {
        if (!edited) {
          a.ballot(1, 2)!.judge = 'A typed during download';
          edited = true;
        }
        return a.files();
      },
      a.state,
    );
    a.state = r.state;
    a.setFiles(r.files);
    expect(a.ballot(1, 1)!.judge).toBe('B changed it');
    expect(a.ballot(1, 2)!.judge).toBe('A typed during download');
    expect(pendingPaths(SLUG, a.files(), a.state)).toEqual([ballotPath(SLUG, 1, 2)]);
  });

  it('an edit to the SAME ballot during a download becomes a conflict, keeping both versions', async () => {
    const { a, b } = await twoDevices();
    b.ballot(1, 1)!.judge = 'B changed it';
    await b.sync();
    let edited = false;
    const r = await pull(
      a.remote,
      SLUG,
      () => {
        if (!edited) {
          a.ballot(1, 1)!.judge = 'A changed it too';
          edited = true;
        }
        return a.files();
      },
      a.state,
    );
    a.state = r.state;
    if (r.changed.length) a.setFiles(r.files);
    const path = ballotPath(SLUG, 1, 1);
    expect(a.ballot(1, 1)!.judge).toBe('A changed it too');
    expect(a.state.conflicts[path]?.kind).toBe('both-changed');
    expect(JSON.parse(a.state.conflicts[path]!.theirs!).judge).toBe('B changed it');
    // And A's next upload must not overwrite B while the conflict is open.
    const p = await a.push();
    expect(p.uploaded).toEqual([]);
  });
});
