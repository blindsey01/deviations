"""
Builds src/fixtures/synthetic.json: a completely made-up tournament (fake
teams, people, characters, judges and scores) plus the expected results.

Why: the real reference workbooks stay private (reference/ is not in git), but
the public repo still needs an end-to-end test that GitHub can run. The
expected numbers here are computed by THIS script, independently of the
TypeScript engine, using the old workbook's method (G50 bug fixed):

  benchmark  = mean of every score of that performance type on the ballot (both teams)
  deviation  = score - benchmark
  total      = mean of the person's own scores on the ballot
  total_dev  = total - mean of all scores on the ballot
  *_z        = deviation / population SD of all scores on the ballot
  summary    = mean over ballots, skipping missing values (like Excel's AVERAGE)

The fixture deliberately covers things the real workbook can't: 3 ballots in
one round, 1 ballot in another, missing scores, and a person who appears on
only one side.

Run from the project root:  python tools/make_synthetic_fixture.py
"""
import json
import random
import statistics as st
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "fixtures" / "synthetic.json"
R = random.Random(20261109)  # fixed seed: same file every run

OUR_KEYS = ["opening", "atty1_direct", "atty2_direct", "atty3_direct",
            "w1_direct", "w1_cross", "w2_direct", "w2_cross", "w3_direct", "w3_cross",
            "atty1_cross", "atty2_cross", "atty3_cross", "closing"]
OPP_KEYS = ["opening", "atty1_cross", "atty2_cross", "atty3_cross",
            "atty1_direct", "w1_direct", "w1_cross", "atty2_direct", "w2_direct", "w2_cross",
            "atty3_direct", "w3_direct", "w3_cross", "closing"]


def ptype(key):
    """Performance type of a slot key, for benchmarks."""
    if key in ("opening", "closing"):
        return key
    who, exam = key.split("_")
    return ("atty_" if who.startswith("atty") else "wit_") + exam


# Which of our slot keys feed each person's categories.
ROLES = {
    "opener": {"speech": "opening", "direct": "atty1_direct", "cross": "atty1_cross"},
    "swing": {"direct": "atty2_direct", "cross": "atty2_cross"},
    "closer": {"speech": "closing", "direct": "atty3_direct", "cross": "atty3_cross"},
    "w1": {"direct": "w1_direct", "cross": "w1_cross"},
    "w2": {"direct": "w2_direct", "cross": "w2_cross"},
    "w3": {"direct": "w3_direct", "cross": "w3_cross"},
}

ROSTER = {
    "P": {"opener": "Person A", "swing": "Person B", "closer": "Person C",
          "w1": ["Person D", "Jordan Vale"], "w2": ["Person E", "Casey Thorn"], "w3": ["Person F", "Riley Marsh"]},
    # Same attorneys and two of the witnesses on D; Person G only plays D, Person F only P.
    "D": {"opener": "Person A", "swing": "Person B", "closer": "Person C",
          "w1": ["Person D", "Morgan Pike"], "w2": ["Person G", "Avery Stone"], "w3": ["Person E", "Quinn Hale"]},
}

PLAN = {
    "P": [
        {"round_on_side": 1, "opponent": "Team Alpha", "judges": ["Judge A", "Judge B", "Judge C"]},
        {"round_on_side": 2, "opponent": "Team Bravo", "judges": ["Judge D"]},
    ],
    "D": [
        {"round_on_side": 1, "opponent": "Team Charlie", "judges": ["Judge E", "Judge F"]},
        {"round_on_side": 2, "opponent": "Team Delta", "judges": ["Judge G", "Judge H"]},
    ],
}

# Scores the "judge" left blank: (side, round_on_side, judge) -> (team, key)
MISSING = {("D", 2, "Judge G"): [("our", "w2_cross"), ("opp", "atty2_direct")]}


def score(center, spread):
    return max(1, min(10, round(R.gauss(center, spread))))


def make_ballot(judge):
    center = R.uniform(6.0, 8.5)   # judges score at different levels...
    spread = R.uniform(0.8, 2.0)   # ...and in narrower or wider bands
    edge = R.uniform(-1.0, 1.0)    # one team a bit better on this ballot
    return {
        "judge": judge,
        "our": {k: score(center + edge, spread) for k in OUR_KEYS},
        "opp": {k: score(center - edge, spread) for k in OPP_KEYS},
    }


def mean(xs):
    xs = [x for x in xs if x is not None]
    return st.fmean(xs) if xs else None


def compute_ballot(b):
    present = [(k, v, t) for t in ("our", "opp") for k, v in b[t].items()]
    allv = [v for _, v, _ in present]
    mu = mean(allv)
    sd = st.pstdev(allv) if allv else None
    bench = {t: mean([v for k, v, _ in present if ptype(k) == t]) for t in {ptype(k) for k in OUR_KEYS}}

    def z(dev):
        return None if dev is None or not sd else dev / sd

    out = {}
    for role, cats in ROLES.items():
        rec, own = {}, []
        for cat, key in cats.items():
            s = b["our"].get(key)
            dev = None if s is None or bench[ptype(key)] is None else s - bench[ptype(key)]
            rec[cat], rec[cat + "_dev"], rec[cat + "_z"] = s, dev, z(dev)
            if s is not None:
                own.append(s)
        total = mean(own)
        total_dev = None if total is None or mu is None else total - mu
        rec["total"], rec["total_dev"], rec["total_z"] = total, total_dev, z(total_dev)
        out[role] = rec
    return out


def main():
    data = {
        "_readme": [
            "MADE-UP tournament for public tests and the app's sample button. No real people, teams or scores.",
            "Same layout as reference/golden_drexel.json (which is private and stays out of git).",
            "Generated by tools/make_synthetic_fixture.py; expected values computed independently in Python.",
            "Covers 3 ballots in one round, 1 in another, and missing scores (null = not available).",
        ],
        "source": "synthetic",
        "sides": {},
    }
    for side in ("P", "D"):
        rounds, expected, results = [], {r: {"per_ballot": []} for r in ROLES}, []
        for rp in PLAN[side]:
            ballots = []
            for judge in rp["judges"]:
                b = make_ballot(judge)
                for team, key in MISSING.get((side, rp["round_on_side"], judge), []):
                    del b[team][key]
                ballots.append(b)
                calc = compute_ballot(b)
                for role in ROLES:
                    expected[role]["per_ballot"].append({"round": rp["round_on_side"], "judge": judge, **calc[role]})
                ours, theirs = sum(b["our"].values()), sum(b["opp"].values())
                results.append({"round": rp["round_on_side"], "judge": judge, "our_points": ours, "opp_points": theirs,
                                "differential": ours - theirs,
                                "result": "W" if ours > theirs else "L" if ours < theirs else "T"})
            rounds.append({"round_on_side": rp["round_on_side"], "opponent": rp["opponent"], "ballots": ballots})
        for role, e in expected.items():
            keys = [k for k in e["per_ballot"][0] if k not in ("round", "judge")]
            e["summary"] = {k: mean([pb[k] for pb in e["per_ballot"]]) for k in keys}
        data["sides"][side] = {
            "sheet": "Plaintiff" if side == "P" else "Defense",
            "roster": ROSTER[side],
            "rounds": rounds,
            "expected": expected,
            "ballot_results": results,
        }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
