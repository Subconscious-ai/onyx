"""The conjoint arithmetic, checked against hand-built choices."""

import ep_conjoint

ATTRIBUTES = {"Price": ["$10", "$20"], "Data": ["5 GB", "20 GB"]}


def test_a_balanced_design_covers_every_profile_and_shuffles_positions() -> None:
    spec = ep_conjoint.generate_design(
        ATTRIBUTES, tasks_per_version=4, profiles_per_task=2, n_versions=3, seed=3
    )

    assert spec["total_profiles"] == 4
    shown = {
        ep_conjoint.describe(p)
        for v in spec["versions"]
        for t in v["choice_sets"]
        for p in t
    }
    assert len(shown) == 4
    for version in spec["versions"]:
        for task in version["choice_sets"]:
            assert len(task) == 2 and task[0] != task[1]


def test_answers_map_back_to_the_chosen_profile_under_shuffling() -> None:
    spec = ep_conjoint.generate_design(
        ATTRIBUTES, tasks_per_version=4, profiles_per_task=2, n_versions=2, seed=5
    )
    rows = []
    for version in ep_conjoint.scenario_rows(spec):
        row = {f"scenario.{k}": v for k, v in version.items()}
        row["agent.segment"] = "s"
        row["agent.agent_name"] = "Agent_0"
        row["agent.agent_index"] = 0
        # Always choose whichever option carries the cheaper price.
        for task in range(1, spec["n_tasks"] + 1):
            letter = "a" if version[f"task_{task}_opt_a_Price"] == "$10" else "b"
            row[f"answer.choice_task_{task}"] = f"Option {letter.upper()}"
        rows.append(row)

    analysis = ep_conjoint.analyze(rows, spec)

    assert analysis["n_observations"] == 8
    assert analysis["utilities"]["Price"]["$10"] > analysis["utilities"]["Price"]["$20"]
    assert analysis["importance"]["Price"] > analysis["importance"]["Data"]
    assert abs(sum(analysis["importance"].values()) - 100) < 1e-9
    assert set(analysis["segments"]) == {"segment"}  # never agent_name or agent_index


def test_none_of_these_is_counted_but_fits_no_profile() -> None:
    spec = ep_conjoint.generate_design(
        ATTRIBUTES,
        tasks_per_version=1,
        profiles_per_task=2,
        n_versions=1,
        include_none=True,
        seed=1,
    )
    row = {f"scenario.{k}": v for k, v in ep_conjoint.scenario_rows(spec)[0].items()}
    row["answer.choice_task_1"] = "None of these"

    analysis = ep_conjoint.analyze([row], spec)

    assert analysis["none_chosen"] == 1 and analysis["n_observations"] == 1


def test_logit_shares_sum_to_one_and_favour_the_higher_utility() -> None:
    utilities = {
        "Price": {"$10": 0.5, "$20": -0.5},
        "Data": {"5 GB": 0.0, "20 GB": 0.0},
    }
    shares = ep_conjoint.market_shares(
        utilities, [{"Price": "$10", "Data": "5 GB"}, {"Price": "$20", "Data": "5 GB"}]
    )

    assert abs(sum(s["share"] for s in shares) - 1) < 1e-6
    assert shares[0]["share"] > shares[1]["share"]
