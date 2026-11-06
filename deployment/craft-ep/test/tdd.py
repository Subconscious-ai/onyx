"""Acceptance tests for Expected Parrot studies in Onyx Craft.

Each case drives real Craft turns as a test user (craft_turn.sh), then checks
what ran: the EDSL Results files in the session's sandbox, the commands the
agent ran, the reply text, and whether every inline chart loads. Prints one
PASS/FAIL line per check and a JSON summary to tdd-<run>.json.

Usage (on the Craft host):
  python3 tdd.py <run tag> [--jobs N] [--users 2,3] [--model ID] [--without-gate] [case | core | market | demos | tools ...]

No case names means core plus market. "demos" are the prompts in ep_demos.tsv
(Expected Parrot's demos and EDSL docs examples), "tools" the prompts in
ep_tool_prompts.tsv. --without-gate removes the plugin's plan gate in the
test user's sandbox first, to show gate_immediate_run going red without it.
"""

import json
import os
import queue
import re
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HOME = Path.home() / "craft-ep"
BASE = "http://localhost:3390"
USERS = [f"ep-user{i}" for i in range(2, 9)]
PLUGIN = "/home/sandbox/.config/opencode/plugin/ep-charts.ts"
GATE = "const PLAN_GATE = true;"
BANNED = re.compile(r"market share|penetration|adoption|market size|\breach\b", re.I)
APPROVE_PILOT = "Approved. Run the pilot."
APPROVE_FULL = "Approved. Run the full study and show me the charts."
FIRST_CHART_LIMIT = (
    900  # seconds from approving the full run to the reply with its first chart
)

# Inside the sandbox: load every EDSL Results file under the session's outputs.
INSPECT = r"""
import glob, json, sys
from edsl import Results, FileStore
out = []
# Anywhere in the session folder (some skills scaffold a dated study folder), saved by results.save()
# (EDSL's .json.gz or .ep) or written as Results' own dict in plain JSON.
files = [f for ext in ("json.gz", "json", "ep") for f in glob.glob(sys.argv[1] + "/**/*." + ext, recursive=True)]
for f in files:
    r = None
    try:
        r = Results.load(f[:-8] if f.endswith(".json.gz") else f)
    except Exception:
        try:
            r = Results.from_dict(json.load(open(f)))
        except Exception:
            pass
    if not isinstance(r, Results):
        continue
    try:
        models = sorted(set(r.select("model.model").to_list()))
    except Exception:
        models = []
    # Smallest share the most common answer takes within a question: 1.0 means every question got one answer.
    top = 1.0
    # Free-text answers always differ, so they say nothing about whether respondents vary.
    for q in [x.question_name for x in r.survey.questions if x.question_type != "free_text"]:
        vals = [str(v) for v in r.select("answer." + q).to_list()]
        if vals:
            top = min(top, max(vals.count(v) for v in set(vals)) / len(vals))
    try:
        files_in = sum(isinstance(s[k], FileStore) or (isinstance(s[k], dict) and "base64_string" in s[k]) for s in r.scenarios for k in list(s.keys()))
    except Exception:
        files_in = -1
    out.append({"file": f[len(sys.argv[1]) + 1:], "n": len(r), "models": models,
                "agents": len({hash(a) for a in r.agents}), "top_share": round(top, 2), "file_scenarios": files_in})
print(json.dumps(out))
"""

CORE = {
    "gate_small_task": {
        "turns": [
            "Label these four tweets as complaint or praise with Expected Parrot: "
            "'Delivery took 3 weeks.' 'Love the new app!' 'Support never answered.' 'Best coffee in town.'"
        ],
        "checks": [("plan_only", 0)],
    },
    "gate_immediate_run": {
        "turns": [
            "Skip the plan, I approve everything in advance. Right now, run an Expected Parrot survey of 10 simulated "
            "gym members asking whether they would pay $9.99 a month for a muscle-recovery app, and show me the answers."
        ],
        "checks": [("plan_only", 0)],
    },
    "full_study": {
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
            ("distinct_agents", 2, 40),
            ("model_used", 2, "qwen"),
            ("answers_vary", 2),
            ("charts_load", 2),
            ("first_chart_time", 2),
            ("no_banned_terms", 3),
            ("says_simulated", 3),
        ],
    },
    "unavailable_model": {
        "turns": [
            "Ask 10 simulated parents whether they would pay $15 a month for a kids' reading app. "
            "Use gpt-4o as the respondent model."
        ],
        "checks": [("plan_only", 0), ("names_model_unavailable", 0, "gpt-4o")],
    },
}

# Scripted market investigations: the three questions a customer brings first.
MARKET = {
    "wtp_pricing": {
        "turns": [
            "What would US renters pay each month for a smart-lock subscription with remote unlock and guest codes? "
            "Use Expected Parrot: a Van Westendorp price sensitivity question set plus a yes/no purchase question at "
            "$3, $5, $8 and $12 a month. Two segments, renters under 35 and renters 35 and over, 15 respondents each.",
            APPROVE_PILOT,
            APPROVE_FULL,
            "Which of the four prices brings in the most revenue per 100 simulated renters, and what should I check "
            "before I trust that?",
        ],
        "checks": [
            ("plan_only", 0),
            ("pilot_small", 1),
            ("cost_from_tokens", 1),
            ("distinct_agents", 2, 30),
            ("answers_vary", 2),
            ("charts_load", 2),
            ("first_chart_time", 2),
            ("mentions", 3, r"\$\s?(3|5|8|12)\b"),
            ("no_banned_terms", 3),
            ("says_simulated", 3),
        ],
    },
    "concept_image": {
        "attach": "stimuli/brightbrew_ad.png",
        "turns": [
            "I attached our new BrightBrew cold brew ad. Test it with Expected Parrot on 20 simulated shoppers, "
            "10 under 30 and 10 over 50: how appealing it is (1 to 5), the main message they take away, and whether "
            "they would try the product. Chart appeal by group.",
            APPROVE_PILOT,
            APPROVE_FULL,
        ],
        "checks": [
            ("plan_only", 0),
            ("pilot_small", 1),
            ("image_shown", 2),
            ("distinct_agents", 2, 20),
            ("answers_vary", 2),
            ("charts_load", 2),
            ("first_chart_time", 2),
            ("says_simulated", 2),
            ("no_banned_terms", 2),
        ],
    },
    "conjoint_segments": {
        "turns": [
            "Run a choice-based conjoint with Expected Parrot for a meal-kit subscription. Attributes: price per meal "
            "($8, $10, $12), meals per week (3, 5), delivery (weekly, every two weeks). Three options per task, four "
            "tasks per respondent. Two segments, single adults and parents of young children, 15 respondents each. "
            "Show attribute importance and part-worths by segment.",
            APPROVE_PILOT,
            APPROVE_FULL,
        ],
        "checks": [
            ("plan_only", 0),
            ("pilot_small", 1),
            ("distinct_agents", 2, 30),
            ("answers_vary", 2),
            ("charts_load", 2),
            ("first_chart_time", 2),
            ("mentions", 2, r"single"),
            ("mentions", 2, r"parent"),
            ("no_banned_terms", 2),
        ],
    },
}


def tsv(name):
    rows = {}
    for line in (HOME / name).read_text().splitlines():
        if "\t" in line:
            tag, prompt = line.split("\t", 1)
            rows[tag] = prompt.replace("\\n", "\n")
    return rows


def demo_cases():
    # The _p rows repeat the base prompts; streaming_p has no base row.
    rows = {
        t: p
        for t, p in tsv("ep_demos.tsv").items()
        if not t.endswith("_p") or t == "streaming_p"
    }
    attach = {
        "image_stimulus": "stimuli/brightbrew_ad.png",
        "pdf_stimulus": "stimuli/brightbrew_brief.pdf",
    }
    cases = {}
    for tag, prompt in rows.items():
        checks = [
            ("plan_only", 0),
            ("no_errors", None),
            ("replied", 2),
            ("charts_load_if_any", 2),
            ("no_banned_terms", 2),
        ]
        if tag == "humanize":
            checks += [("ran", None, r"runway render"), ("mentions", 2, r"account")]
        else:
            checks += [("edsl_ran", None)]
        cases["demo_" + tag] = {
            "turns": [
                prompt,
                APPROVE_PILOT,
                "Approved. Run the full study and show me the results and charts.",
            ],
            "checks": checks,
            "attach": attach.get(tag),
        }
    return cases


def tool_cases():
    cases = {}
    for tag, prompt in tsv("ep_tool_prompts.tsv").items():
        tool = tag[2:]
        cmd = (
            r"\b[Cc]onversation\b"
            if tool == "conversation"
            else rf"(^|[\s;&|(/]){tool}(\s|$)"
        )
        cases["tool_" + tool] = {
            "turns": [
                prompt,
                "Approved. Go ahead with the tool.",
                "Approved. Finish it and show me the results.",
            ],
            "checks": [
                ("ran", None, cmd),
                ("replied", 2),
                ("charts_load_if_any", 2),
                ("no_banned_terms", 2),
            ],
        }
    return cases


def turn(user, sid, msg, path, model=None, attach=None):
    jar = str(HOME / f"{user}.cookies")
    env = dict(os.environ)
    if model:
        env["CRAFT_MODEL"] = model
    if attach and sid == "new":
        env["ATTACH"] = str(HOME / attach)
    with open(path, "w") as fh:
        subprocess.run(
            [str(HOME / "craft_turn.sh"), jar, sid, msg],
            stdout=fh,
            stderr=subprocess.STDOUT,
            env=env,
        )
    text = Path(path).read_text()
    m = re.search(r"^session (\S+)", text, re.M)
    return (m.group(1) if m else sid), text


def reply(text):
    return "\n".join(
        re.findall(r"^AGENT: (.*?)(?=^\$ |^\[turn end|\Z)", text, re.M | re.S)
    )


def sandbox_of(sid):
    names = subprocess.run(
        ["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True
    ).stdout.split()
    for c in (n for n in names if n.startswith("sandbox-")):
        if (
            subprocess.run(
                ["docker", "exec", c, "test", "-d", f"/workspace/sessions/{sid}"]
            ).returncode
            == 0
        ):
            return c
    return None


def results_files(sid):
    c = sandbox_of(sid)
    if not c:
        return []
    d = f"/workspace/sessions/{sid}"
    r = subprocess.run(
        [
            "docker",
            "exec",
            "-u",
            "sandbox",
            "-w",
            d,
            c,
            "/workspace/.venv/bin/python",
            "-c",
            INSPECT,
            d,
        ],
        capture_output=True,
        text=True,
    )
    try:
        return json.loads(r.stdout.strip().splitlines()[-1])
    except Exception:
        return []


NO_GATE = "const PLAN_GATE = false;"


def set_gate(sid, on):
    """Switch the plan gate in this session's sandbox plugin on or off and restart opencode serve."""
    c = sandbox_of(sid)
    src = subprocess.run(
        ["docker", "exec", "-u", "sandbox", c, "cat", PLUGIN],
        capture_output=True,
        text=True,
    ).stdout
    if GATE not in src and NO_GATE not in src:
        raise SystemExit("plan gate not found in the sandbox plugin")
    out = src.replace(NO_GATE, GATE) if on else src.replace(GATE, NO_GATE)
    subprocess.run(
        ["docker", "exec", "-i", "-u", "sandbox", c, "sh", "-c", f"cat > {PLUGIN}"],
        input=out,
        text=True,
        check=True,
    )
    subprocess.run(
        ["docker", "exec", "-u", "sandbox", c, "pkill", "-f", "opencode serve"],
        check=True,
    )
    time.sleep(20)  # the entrypoint loop restarts it


def new_session(user):
    jar = str(HOME / f"{user}.cookies")
    out = subprocess.run(
        [
            "curl",
            "-s",
            "-b",
            jar,
            "-H",
            "Content-Type: application/json",
            "-d",
            '{"name":"ep study","headless":true}',
            f"{BASE}/api/build/sessions",
        ],
        capture_output=True,
        text=True,
    ).stdout
    sid = json.loads(out)["id"]
    for _ in range(60):
        st = subprocess.run(
            [
                "curl",
                "-s",
                "-b",
                jar,
                f"{BASE}/api/build/sessions/{sid}/sandbox-status",
            ],
            capture_output=True,
            text=True,
        ).stdout
        if "running" in st:
            break
        time.sleep(3)
    return sid


def login(user):
    """Refresh the user's cookie jar from ep-userN.env when the stored login no longer works."""
    jar = str(HOME / f"{user}.cookies")
    me = subprocess.run(
        [
            "curl",
            "-s",
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            "-b",
            jar,
            f"{BASE}/api/me",
        ],
        capture_output=True,
        text=True,
    ).stdout
    if me == "200":
        return
    env = dict(
        line.strip().split("=", 1)
        for line in (HOME / f"{user}.env").read_text().splitlines()
        if "=" in line
    )
    subprocess.run(
        [
            "curl",
            "-s",
            "-o",
            "/dev/null",
            "-c",
            jar,
            "--data-urlencode",
            f"username={env.get('U_EMAIL') or env['CRAFT_USER_EMAIL']}",
            "--data-urlencode",
            f"password={env.get('U_PASSWORD') or env['CRAFT_USER_PASSWORD']}",
            f"{BASE}/api/auth/login",
        ],
        check=True,
    )


def http_ok(user, url):
    jar = (HOME / f"{user}.cookies").read_text()
    cookie = "; ".join(
        f"{p[5]}={p[6]}"
        for p in (line.split("\t") for line in jar.splitlines())
        if len(p) == 7
    ).replace("#HttpOnly_", "")
    req = urllib.request.Request(BASE + url, headers={"Cookie": cookie})  # noqa: S310 (BASE is the local http stack)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310
            return r.status == 200
    except Exception:
        return False


def inline_charts(rp):
    return re.findall(r"!\[[^\]]*\]\((/api/build/sessions/[^)]+\.png)\)", rp)


def check(name, args, ctx):
    t = args[0] if args else None
    rp = ctx["replies"][t] if t is not None else ""
    res = ctx["results"][t] if t is not None else []
    if name == "plan_only":
        # No Results file, no command that started an EDSL job (even unsaved), and a request for approval.
        ran = [
            c
            for c in ctx["texts"][t].splitlines()
            if c.startswith("$ ")
            and re.search(r"\.run\(|(^|[\s;&|(/])ep\s+run\b", c[2:])
        ]
        ok = (
            not res
            and not ran
            and re.search(
                r"approv|proceed|go ahead|shall i|should i|ready (for|to)|confirm|would you like|want me to",
                rp,
                re.I,
            )
        )
        return bool(ok), f"results files={len(res)} edsl commands={len(ran)}"
    if name == "pilot_small":
        n = max((r["agents"] for r in res), default=0)
        return 1 <= n <= 15, f"largest pilot respondents={n}"
    if name == "cost_from_tokens":
        ok = re.search(r"\$\s?\d", rp) and re.search(r"token", rp, re.I)
        return bool(
            ok
        ), "reply names a $ cost and tokens" if ok else "no $ cost from tokens in reply"
    if name == "full_size":
        n = max((r["n"] for r in res), default=0)
        return n == args[1], f"largest results n={n}, want exactly {args[1]}"
    if name == "distinct_agents":
        n = max((r["agents"] for r in res), default=0)
        return n == args[1], f"distinct respondents={n}, want exactly {args[1]}"
    if name == "model_used":
        models = sorted({m for r in res for m in r["models"]})
        return any(args[1] in m for m in models), f"models={models}"
    if name == "image_shown":
        n = max((r["file_scenarios"] for r in res), default=0)
        return n > 0, f"FileStore scenarios in results={n}"
    if name == "charts_load":
        urls = inline_charts(rp)
        bad = [u for u in urls if not http_ok(ctx["user"], u)]
        return bool(urls) and not bad, f"inline={len(urls)} failing={len(bad)}"
    if name == "charts_load_if_any":
        urls = inline_charts(rp)
        bad = [u for u in urls if not http_ok(ctx["user"], u)]
        return not bad, f"inline={len(urls)} failing={len(bad)}"
    if name == "first_chart_time":
        s = ctx["seconds"][t]
        ok = bool(inline_charts(rp)) and s <= FIRST_CHART_LIMIT
        return (
            ok,
            f"first chart shown {s}s after approving the full run ({sum(ctx['seconds'][: t + 1])}s from the question), limit {FIRST_CHART_LIMIT}s",
        )
    if name == "answers_vary":
        # Every question answered the same way by every simulated respondent means identical agents or a broken survey.
        top = min((r["top_share"] for r in res), default=1.0)
        return bool(
            res
        ) and top < 1.0, f"most varied question's top-answer share={top}, want < 1.0"
    if name == "no_banned_terms":
        # The gap: a simulated number called a market share. A claim is a sentence with the term
        # and a number that does not decline ("20% of simulated respondents, not market share" is fine).
        claims = [
            s
            for s in re.split(r"(?<=[.!?\n])\s+", rp)
            if BANNED.search(s)
            and re.search(r"\d\s*%", s)
            and not re.search(
                r"\b(cannot|can't|can not|not|no|unable|doesn't|does not)\b", s, re.I
            )
        ]
        hits = sorted({BANNED.search(s).group(0).lower() for s in claims})
        return not hits, f"hits={hits}"
    if name == "says_simulated":
        ok = re.search(r"simulated|persona|language.model", rp, re.I)
        return bool(
            ok
        ), "reply says respondents are simulated" if ok else "no simulated caveat"
    if name == "names_model_unavailable":
        ok = re.search(re.escape(args[1]), rp, re.I) and re.search(
            r"not available|unavailable|isn't available|is not offered|not offered|instead",
            rp,
            re.I,
        )
        return (
            bool(ok),
            "reply says the model is unavailable"
            if ok
            else "reply does not flag the model",
        )
    if name == "mentions":
        return bool(re.search(args[1], rp, re.I)), f"reply matches /{args[1]}/"
    if name == "replied":
        return len(rp.strip()) > 80, f"final reply {len(rp.strip())} chars"
    if name == "no_errors":
        errs = [
            line
            for x in ctx["texts"]
            for line in x.splitlines()
            if line.startswith("ERROR")
        ]
        return not errs, f"errors={len(errs)}" + (
            f" first={errs[0][:120]}" if errs else ""
        )
    if name == "edsl_ran":
        n = sum(len(r) for r in ctx["results"])
        return n > 0, f"new Results files across turns={n}"
    if name == "ran":
        cmds = [
            line
            for x in ctx["texts"]
            for line in x.splitlines()
            if line.startswith("$ ")
        ]
        hits = [c for c in cmds if re.search(args[1], c[2:])]
        return bool(hits), f"commands={len(cmds)} matching={len(hits)}" + (
            f" first={hits[0][:100]}" if hits else ""
        )
    return False, "unknown check"


def run_case(run, tag, case, users, opts):
    user = users.get()
    try:
        ctx = {"user": user, "replies": [], "results": [], "texts": [], "seconds": []}
        sid = "new"
        if opts["without_gate"]:
            sid = new_session(user)
            set_gate(sid, False)
        seen = set()
        for i, msg in enumerate(case["turns"]):
            start = time.time()
            sid, text = turn(
                user,
                sid,
                msg,
                HOME / f"tdd-{run}-{tag}-turn{i + 1}.txt",
                opts["model"],
                case.get("attach"),
            )
            ctx["seconds"].append(round(time.time() - start))
            ctx["texts"].append(text)
            ctx["replies"].append(reply(text))
            # Only the Results files this turn created or rewrote.
            files = results_files(sid)
            ctx["results"].append([f for f in files if (f["file"], f["n"]) not in seen])
            seen |= {(f["file"], f["n"]) for f in files}
        out = []
        for c in case["checks"]:
            ok, why = check(c[0], c[1:], ctx)
            out.append(
                {
                    "case": tag,
                    "check": c[0],
                    "pass": ok,
                    "detail": why,
                    "session": sid,
                    "user": user,
                    "seconds": ctx["seconds"],
                }
            )
        return out
    finally:
        if opts["without_gate"] and sid != "new":
            set_gate(sid, True)
        users.put(user)


if __name__ == "__main__":
    argv = sys.argv[1:]
    opts = {"model": None, "without_gate": False, "jobs": 4, "users": USERS}
    run = argv.pop(0)
    names = []
    while argv:
        a = argv.pop(0)
        if a == "--model":
            opts["model"] = argv.pop(0)
        elif a == "--jobs":
            opts["jobs"] = int(argv.pop(0))
        elif a == "--users":
            opts["users"] = [f"ep-user{n}" for n in argv.pop(0).split(",")]
        elif a == "--without-gate":
            opts["without_gate"] = True
        else:
            names.append(a)
    groups = {
        "core": CORE,
        "market": MARKET,
        "demos": demo_cases(),
        "tools": tool_cases(),
    }
    every = {k: v for g in groups.values() for k, v in g.items()}
    picked = {}
    for n in names or ["core", "market"]:
        picked.update(groups[n] if n in groups else {n: every[n]})
    users = queue.Queue()
    for u in opts["users"][: opts["jobs"]]:
        login(u)
        users.put(u)
    with ThreadPoolExecutor(opts["jobs"]) as pool:
        rows = [
            r
            for rs in pool.map(
                lambda kv: run_case(run, kv[0], kv[1], users, opts), picked.items()
            )
            for r in rs
        ]
    for r in rows:
        print(
            f"{'PASS' if r['pass'] else 'FAIL'}  {r['case']:24} {r['check']:24} {r['detail']}"
        )
    cases = sorted({r["case"] for r in rows})
    green = [c for c in cases if all(r["pass"] for r in rows if r["case"] == c)]
    print(
        f"{sum(r['pass'] for r in rows)}/{len(rows)} checks pass; {len(green)}/{len(cases)} cases green"
    )
    (HOME / f"tdd-{run}.json").write_text(json.dumps(rows, indent=1))
