"""Choice-based conjoint for the Expected Parrot wrapper.

The method follows Expected Parrot's public ``conjoint-study`` skill: a
balanced set of choice tasks found by random search, one multiple-choice
question per task with static option labels, one scenario per design version,
counting-based part-worths (``log(choice share / expected share)``,
zero-centred within an attribute), importance as an attribute's utility range
over the sum of ranges, and logit choice shares for a market simulation. The
estimator is deliberately simple; it is a drafting tool, not Rehoboam's
hierarchical Bayes.
"""

from __future__ import annotations

import itertools
import math
import random
from collections import Counter, defaultdict
from typing import Any

OPTION_LETTERS = "abcdefgh"


def all_profiles(attributes: dict[str, list[str]]) -> list[dict[str, str]]:
    names = list(attributes)
    return [
        dict(zip(names, combo, strict=True))
        for combo in itertools.product(*(attributes[n] for n in names))
    ]


def _differences(left: dict[str, str], right: dict[str, str]) -> int:
    return sum(left[key] != right[key] for key in left)


def balance_score(
    choice_sets: list[list[dict[str, str]]], attributes: dict[str, list[str]]
) -> float:
    """Chi-squared-like spread of levels over all shown profiles; lower is better."""
    score = 0.0
    for name, levels in attributes.items():
        counts: Counter[str] = Counter(
            profile[name] for task in choice_sets for profile in task
        )
        total = sum(counts.values())
        expected = total / len(levels) if levels else 1
        if expected:
            score += sum(
                (counts.get(level, 0) - expected) ** 2 / expected for level in levels
            )
    return score


def one_version(
    profiles: list[dict[str, str]],
    attributes: dict[str, list[str]],
    n_tasks: int,
    per_task: int,
    min_diff: int,
    rng: random.Random,
    iterations: int = 300,
) -> tuple[list[list[dict[str, str]]], float]:
    best: list[list[dict[str, str]]] = []
    best_score = math.inf
    for _ in range(iterations):
        pool = list(profiles)
        rng.shuffle(pool)
        tasks = []
        for _ in range(n_tasks):
            if not pool:
                pool = list(profiles)
                rng.shuffle(pool)
            task = [pool.pop()]
            candidates = [p for p in profiles if p not in task]
            rng.shuffle(candidates)
            for candidate in candidates:
                if len(task) >= per_task:
                    break
                if all(_differences(candidate, chosen) >= min_diff for chosen in task):
                    task.append(candidate)
            for candidate in candidates:
                if len(task) >= per_task:
                    break
                if candidate not in task:
                    task.append(candidate)
            tasks.append(task)
        score = balance_score(tasks, attributes)
        if score < best_score:
            best, best_score = tasks, score
    return best, best_score


def generate_design(
    attributes: dict[str, list[str]],
    tasks_per_version: int = 8,
    profiles_per_task: int = 3,
    n_versions: int = 4,
    include_none: bool = False,
    min_attribute_diff: int = 2,
    seed: int = 42,
) -> dict[str, Any]:
    if len(attributes) < 2 or any(len(levels) < 2 for levels in attributes.values()):
        raise ValueError(
            "A conjoint needs at least two attributes with two levels each."
        )
    if profiles_per_task > len(OPTION_LETTERS):
        raise ValueError(f"At most {len(OPTION_LETTERS)} profiles per task.")
    profiles = all_profiles(attributes)
    if len(profiles) < profiles_per_task:
        raise ValueError(
            f"Only {len(profiles)} unique profiles, but {profiles_per_task} are needed per task."
        )
    min_diff = min(min_attribute_diff, max(1, len(attributes) - 1))
    versions = []
    for index in range(n_versions):
        rng = random.Random(seed + index)
        tasks, score = one_version(
            profiles, attributes, tasks_per_version, profiles_per_task, min_diff, rng
        )
        for task in tasks:
            rng.shuffle(task)
        versions.append(
            {
                "version": index + 1,
                "balance_score": round(score, 4),
                "choice_sets": tasks,
            }
        )
    return {
        "attributes": attributes,
        "n_tasks": tasks_per_version,
        "profiles_per_task": profiles_per_task,
        "n_versions": n_versions,
        "include_none": include_none,
        "total_profiles": len(profiles),
        "versions": versions,
    }


def describe(profile: dict[str, str]) -> str:
    return ", ".join(f"{attribute}: {level}" for attribute, level in profile.items())


def question_specs(design: dict[str, Any], intro: str) -> list[dict[str, Any]]:
    """One multiple-choice question per task, options as static letters."""
    letters = OPTION_LETTERS[: design["profiles_per_task"]]
    options = [f"Option {letter.upper()}" for letter in letters]
    if design["include_none"]:
        options.append("None of these")
    specs = []
    for task in range(1, design["n_tasks"] + 1):
        lines = [
            f"Option {letter.upper()}: {{{{ scenario.task_{task}_opt_{letter} }}}}"
            for letter in letters
        ]
        specs.append(
            {
                "question_type": "multiple_choice",
                "question_name": f"choice_task_{task}",
                "question_text": intro
                + "\n\n"
                + "\n".join(lines)
                + "\n\nWhich option would you choose?",
                "question_options": options,
            }
        )
    return specs


def scenario_rows(design: dict[str, Any]) -> list[dict[str, Any]]:
    """One scenario per design version, with the formatted text and each level."""
    rows = []
    for version in design["versions"]:
        row: dict[str, Any] = {"design_version": version["version"]}
        for task_index, task in enumerate(version["choice_sets"], start=1):
            for option_index, profile in enumerate(task):
                letter = OPTION_LETTERS[option_index]
                row[f"task_{task_index}_opt_{letter}"] = describe(profile)
                for attribute, level in profile.items():
                    row[f"task_{task_index}_opt_{letter}_{attribute}"] = level
        rows.append(row)
    return rows


def choice_records(
    rows: list[dict[str, Any]], design: dict[str, Any]
) -> list[dict[str, Any]]:
    """Map each answered task back to the chosen profile and the agent's traits."""
    attributes = design["attributes"]
    records = []
    for row in rows:
        traits = {
            k.split(".", 1)[1]: v
            for k, v in row.items()
            if k.startswith("agent.") and not k.startswith("agent.agent_")
        }
        for task in range(1, design["n_tasks"] + 1):
            answer = row.get(f"answer.choice_task_{task}")
            if not isinstance(answer, str):
                continue
            if answer.lower().startswith("none"):
                records.append({"task": task, "chosen": None, "traits": traits})
                continue
            letter = answer.strip()[-1].lower()
            if letter not in OPTION_LETTERS[: design["profiles_per_task"]]:
                continue
            chosen = {
                attribute: row.get(f"scenario.task_{task}_opt_{letter}_{attribute}")
                for attribute in attributes
            }
            if all(level is not None for level in chosen.values()):
                records.append({"task": task, "chosen": chosen, "traits": traits})
    return records


def part_worths(
    records: list[dict[str, Any]], attributes: dict[str, list[str]]
) -> dict[str, dict[str, float]]:
    chosen_counts: dict[str, Counter[str]] = {name: Counter() for name in attributes}
    total = 0
    for record in records:
        if record["chosen"] is None:
            continue
        total += 1
        for name in attributes:
            chosen_counts[name][record["chosen"][name]] += 1
    utilities: dict[str, dict[str, float]] = {}
    for name, levels in attributes.items():
        expected = 1.0 / len(levels)
        values = {}
        for level in levels:
            count = chosen_counts[name].get(level, 0)
            values[level] = (
                math.log((count / total) / expected) if total and count else -2.0
            )
        mean = sum(values.values()) / len(values)
        utilities[name] = {level: value - mean for level, value in values.items()}
    return utilities


def importance(utilities: dict[str, dict[str, float]]) -> dict[str, float]:
    ranges = {
        name: (max(v.values()) - min(v.values())) if v else 0.0
        for name, v in utilities.items()
    }
    total = sum(ranges.values())
    return {name: (r / total * 100 if total else 0.0) for name, r in ranges.items()}


def analyze(rows: list[dict[str, Any]], design: dict[str, Any]) -> dict[str, Any]:
    records = choice_records(rows, design)
    if not records:
        raise ValueError("No answered choice tasks in these results.")
    attributes = design["attributes"]
    utilities = part_worths(records, attributes)
    segments: dict[str, dict[str, Any]] = {}
    for trait in sorted({key for record in records for key in record["traits"]}):
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for record in records:
            groups[str(record["traits"].get(trait, "unknown"))].append(record)
        segments[trait] = {}
        for value, group in sorted(groups.items()):
            group_utilities = part_worths(group, attributes)
            segments[trait][value] = {
                "utilities": group_utilities,
                "importance": importance(group_utilities),
                "n_observations": len(group),
            }
    none_count = sum(record["chosen"] is None for record in records)
    return {
        "n_observations": len(records),
        "none_chosen": none_count,
        "utilities": utilities,
        "importance": importance(utilities),
        "segments": segments,
        "position_counts": dict(
            Counter(
                row.get(f"answer.choice_task_{task}")
                for row in rows
                for task in range(1, design["n_tasks"] + 1)
                if isinstance(row.get(f"answer.choice_task_{task}"), str)
            )
        ),
    }


def market_shares(
    utilities: dict[str, dict[str, float]], profiles: list[dict[str, str]]
) -> list[dict[str, Any]]:
    totals = [
        sum(
            utilities.get(attribute, {}).get(level, 0.0)
            for attribute, level in profile.items()
        )
        for profile in profiles
    ]
    peak = max(totals) if totals else 0.0
    weights = [math.exp(t - peak) for t in totals]
    denominator = sum(weights) or 1.0
    return [
        {
            "profile": profile,
            "utility": round(total, 4),
            "share": round(weight / denominator, 4),
        }
        for profile, total, weight in zip(profiles, totals, weights, strict=True)
    ]
