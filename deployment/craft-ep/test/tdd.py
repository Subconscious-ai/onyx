"""Acceptance tests for Expected Parrot studies in Onyx Craft.

Each case drives real Craft turns as a test user (craft_turn.sh), then checks
what ran: the EDSL Results files in the session's sandbox, the reply text, and
whether every inline chart loads. Prints one PASS/FAIL line per check and a
JSON summary to tdd-<run>.json.

Usage (on the Craft host): python3 tdd.py <run tag> [case ...]
"""
import json
import re
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HOME = Path.home() / "craft-ep"
BASE = "http://localhost:3390"
BANNED = re.compile(r"market share|penetration|adoption|market size|\breach\b", re.I)
APPROVE_PILOT = "Approved. Run the pilot."
APPROVE_FULL = "Approved. Run the full study and show me the charts."

# Inside the sandbox: load every EDSL Results file under the session's outputs.
INSPECT = r"""
import glob, json, sys
from edsl import Results
out = []
files = glob.glob(sys.argv[1] + "/outputs/**/*.json.gz", recursive=True)
files += glob.glob(sys.argv[1] + "/outputs/**/*.json", recursive=True)
for f in files:
    try:
        r = Results.load(f[:-8] if f.endswith(".json.gz") else f)
        if not isinstance(r, Results):
            continue
    except Exception:
        continue
    try:
        models = sorted(set(r.select("model.model").to_list()))
    except Exception:
        models = []
    # Largest share any one answer takes within each question, across all rows.
    top = 0.0
    for q in r.survey.question_names:
        vals = [str(v) for v in r.select("answer." + q).to_list()]
        if vals:
            top = max(top, max(vals.count(v) for v in set(vals)) / len(vals))
    out.append({"file": f.split("/outputs/", 1)[1], "n": len(r), "models": models, "agents": len({hash(a) for a in r.agents}), "top_share": round(top, 2)})
print(json.dumps(out))
"""

CASES = {
    "gate_small_task": {
        "user": "ep-user6",
        "turns": [
            "Label these four tweets as complaint or praise with Expected Parrot: "
            "'Delivery took 3 weeks.' 'Love the new app!' 'Support never answered.' 'Best coffee in town.'"
        ],
        "checks": [("plan_only", 0)],
    },
    "full_study": {
        "user": "ep-user7",
        "turns": [
            "Run a pricing study with Expected Parrot: would simulated US coffee drinkers buy a 12 oz canned "
            "cold brew at $2.49, $2.99 or $3.49? Two segments, students and office workers, 20 respondents each. "
            "Use qwen3-next as the respondent model.",
            APPROVE_PILOT,
            APPROVE_FULL,
            "What market share would BrightBrew get at $2.99?",
        ],
        "checks": [
            ("plan_only", 0),
            ("pilot_small", 1),
            ("cost_from_tokens", 1),
            ("full_size", 2, 120),
            ("model_used", 2, "qwen"),
            ("answers_vary", 2, 0.9),
            ("charts_load", 2),
            ("no_banned_terms", 3),
            ("says_simulated", 3),
        ],
    },
    "unavailable_model": {
        "user": "ep-user8",
        "turns": [
            "Ask 10 simulated parents whether they would pay $15 a month for a kids' reading app. "
            "Use gpt-4o as the respondent model."
        ],
        "checks": [("plan_only", 0), ("names_model_unavailable", 0, "gpt-4o")],
    },
}


def turn(user, sid, msg, path):
    jar = str(HOME / f"{user}.cookies")
    with open(path, "w") as fh:
        subprocess.run([str(HOME / "craft_turn.sh"), jar, sid, msg], stdout=fh, stderr=subprocess.STDOUT)
    text = Path(path).read_text()
    m = re.search(r"^session (\S+)", text, re.M)
    return (m.group(1) if m else sid), text


def reply(text):
    return "\n".join(re.findall(r"^AGENT: (.*?)(?=^\$ |^\[turn end|\Z)", text, re.M | re.S))


def results_files(sid):
    names = subprocess.run(["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True).stdout.split()
    for c in (n for n in names if n.startswith("sandbox-")):
        d = f"/workspace/sessions/{sid}"
        if subprocess.run(["docker", "exec", c, "test", "-d", d]).returncode == 0:
            r = subprocess.run(
                ["docker", "exec", "-w", d, c, "/workspace/.venv/bin/python", "-c", INSPECT, d],
                capture_output=True, text=True,
            )
            try:
                return json.loads(r.stdout.strip().splitlines()[-1])
            except Exception:
                return []
    return []


def http_ok(user, url):
    jar = (HOME / f"{user}.cookies").read_text()
    cookie = "; ".join(
        f"{p[5]}={p[6]}" for p in (l.split("\t") for l in jar.splitlines()) if len(p) == 7
    ).replace("#HttpOnly_", "")
    req = urllib.request.Request(BASE + url, headers={"Cookie": cookie})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status == 200
    except Exception:
        return False


def check(name, args, ctx):
    t = args[0] if args else None
    rp = ctx["replies"][t] if t is not None else ""
    res = ctx["results"][t] if t is not None else []
    if name == "plan_only":
        ok = not res and re.search(r"approv|proceed|go ahead|shall i|should i", rp, re.I)
        return bool(ok), f"results files={len(res)}"
    if name == "pilot_small":
        n = max((r["agents"] for r in res), default=0)
        return 1 <= n <= 15, f"largest pilot respondents={n}"
    if name == "cost_from_tokens":
        ok = re.search(r"\$\s?\d", rp) and re.search(r"token", rp, re.I)
        return bool(ok), "reply names a $ cost and tokens" if ok else "no $ cost from tokens in reply"
    if name == "full_size":
        n = max((r["n"] for r in res), default=0)
        return n >= args[1], f"largest results n={n}, want >= {args[1]}"
    if name == "model_used":
        models = sorted({m for r in res for m in r["models"]})
        return any(args[1] in m for m in models), f"models={models}"
    if name == "charts_load":
        urls = re.findall(r"!\[[^\]]*\]\((/api/build/sessions/[^)]+\.png)\)", rp)
        bad = [u for u in urls if not http_ok(ctx["user"], u)]
        return bool(urls) and not bad, f"inline={len(urls)} failing={len(bad)}"
    if name == "answers_vary":
        top = max((r["top_share"] for r in res), default=1.0)
        return top < args[1], f"largest single-answer share={top}, want < {args[1]}"
    if name == "no_banned_terms":
        # The gap: a simulated number called a market share. A claim is a sentence with the term
        # and a number that does not decline ("20% of simulated respondents, not market share" is fine).
        claims = [s for s in re.split(r"(?<=[.!?\n])\s+", rp)
                  if BANNED.search(s) and re.search(r"\d\s*%", s)
                  and not re.search(r"\b(cannot|can't|can not|not|no|unable|doesn't|does not)\b", s, re.I)]
        hits = sorted({BANNED.search(s).group(0).lower() for s in claims})
        return not hits, f"hits={hits}"
    if name == "says_simulated":
        ok = re.search(r"simulated|persona|language.model", rp, re.I)
        return bool(ok), "reply says respondents are simulated" if ok else "no simulated caveat"
    if name == "names_model_unavailable":
        ok = re.search(re.escape(args[1]), rp, re.I) and re.search(r"not available|unavailable|isn't available|is not offered|not offered|instead", rp, re.I)
        return bool(ok), "reply says the model is unavailable" if ok else "reply does not flag the model"
    return False, "unknown check"


def run_case(run, tag):
    case = CASES[tag]
    ctx = {"user": case["user"], "replies": [], "results": []}
    sid = "new"
    seen = set()
    for i, msg in enumerate(case["turns"]):
        sid, text = turn(case["user"], sid, msg, HOME / f"tdd-{run}-{tag}-turn{i + 1}.txt")
        ctx["replies"].append(reply(text))
        # Only the Results files this turn created or rewrote.
        files = results_files(sid)
        ctx["results"].append([f for f in files if (f["file"], f["n"]) not in seen])
        seen |= {(f["file"], f["n"]) for f in files}
    out = []
    for c in case["checks"]:
        ok, why = check(c[0], c[1:], ctx)
        out.append({"case": tag, "check": c[0], "pass": ok, "detail": why, "session": sid, "user": case["user"]})
    return out


if __name__ == "__main__":
    run = sys.argv[1]
    tags = sys.argv[2:] or list(CASES)
    with ThreadPoolExecutor(len(tags)) as pool:
        rows = [r for rs in pool.map(lambda t: run_case(run, t), tags) for r in rs]
    for r in rows:
        print(f"{'PASS' if r['pass'] else 'FAIL'}  {r['case']:18} {r['check']:24} {r['detail']}")
    print(f"{sum(r['pass'] for r in rows)}/{len(rows)} checks pass")
    (HOME / f"tdd-{run}.json").write_text(json.dumps(rows, indent=1))
