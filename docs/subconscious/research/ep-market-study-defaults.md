# What Expected Parrot does when a user names a market

Research for [Subconscious-ai/onyx#123](https://github.com/Subconscious-ai/onyx/issues/123)
("Define what Beca does unasked when a user names a market"). Date: 2026-11-01.

The question is how Beca should behave when a user types a bare market ask
("investigate the US meal-kit market") or a named ask ("which of these two
messages works better"). The owner asked us to follow Expected Parrot (EP)
practice rather than invent our own. Every claim below cites an EP source by
repository, path and line. Each quote is under 15 words. Where EP is silent,
this note says so.

## Sources read

All sources were read at the commits below. No code from them was run.

| Source | Commit | What it is |
|---|---|---|
| `expectedparrot/mit-sloan-econ-asg` | `a5769e5` | A prompt pasted into EP's hosted Research Agent for a simulated-consumer pricing study. This is the nearest public example of a market-study playbook. |
| `expectedparrot/edsl` `docs/en/latest/research_agent.mdx`, `teaching.mdx`, `costs.mdx`, `agents.mdx`, `research/pretesting.mdx` | `4e66ea7` | EP's official docs for the hosted Research Agent and EDSL. |
| `expectedparrot/edsl` `edsl/cli_commands/study_resources/` (`scaffold.py`, `plot_style.py`, `build_standard_plots.py`, `log_cost.py`) | `4e66ea7` | Study scaffolding that EP's own agent ("EP-Agent") uses. It covers gates, Makefile targets and the standard plots. |
| `expectedparrot/ep-skills` `plugins/edsl-research/` | `f8ad754` | EP's Claude Code plugin: 15 SKILL.md files. |
| `expectedparrot/skills` `.claude/skills/` | `7796f1e` | An older copy of a subset of the ep-skills files. It adds nothing new for these questions. |
| `expectedparrot/umriss` README + AGENTS.md | `4f9b20c` | Builds digital twins from reported survey marginals. |
| `expectedparrot/bower` README | `c8a84aa` | Stakeholder studies with synthetic personas. |
| `expectedparrot/golden` README | `e56ee75` | A decision CLI for one consumer choosing a product. It does not cover market studies and has nothing to say about these four questions. |

EP's hosted Research Agent's own skill files (`research_agent/skills/...`,
referenced at [plot_style.py:349][ps349]) live in a repository that is not
public (`expectedparrot/ep-agent` returns 404). We see only its scaffold
resources in `edsl` and its documented behaviour.

---

## Q1. Audience: how EP builds the agents when the user names no audience

### EP practice

- **Ask for segments; never assume one.** EP's market playbook first asks the
  user for the product. It then asks for two segments: "Now describe your two
  market segments" ([student_prompt_block.md:26][m26]). The conjoint skill asks
  the user to "Define segments", use "Generic respondents" or "Skip agents"
  ([conjoint-study/SKILL.md:122-127][c122]).
- **Propose 4–6 variation traits and get them approved.** The playbook says
  "propose 4–6 demographic or behavioral dimensions"
  ([student_prompt_block.md:39][m39]). Its examples are age, income, urban or
  rural setting, category experience, current alternative, how often the
  problem occurs and how painful it is ([:45-51][m45]). It then asks "Do these
  dimensions look right?" ([:56][m56]). A rule makes this step mandatory: "Do
  NOT skip the dimension proposal step" ([:195][m195]).
- **How many agents.** The pricing playbook builds "250 agents for each segment
  (500 total)" ([:65][m65]). `design-experiment` sizes the panel with a power
  analysis instead, and recommends "at least 80% power"
  ([design-experiment/SKILL.md:370][d370]). Its worked example is "64 per cell
  (128 total)" ([:385][d385]).
- **Drafted by an LLM, with diversity rules.** In the playbook the agent writes
  the agents itself. Each agent has a `segment`, a `segment_label`, one value
  per dimension and a "persona" trait of "2–3 sentences in second person"
  ([:66-71][m66]). The diversity rules are: "Vary every dimension across its
  plausible range" ([:74][m74]), "Use random variation, not 250 copies"
  ([:85][m85]), and aim for "roughly 10–20%" who would pay $0 ([:81][m81]).
- **From data, when data exists.** `create-agent-list` supports agents
  "generated from descriptions or external sources"
  ([create-agent-list/SKILL.md:13][a13]) and `AgentList.from_source("people.csv")`
  ([:57][a57]). EP's agent scaffold requires a provenance file and a
  `REQUIRED_SOURCE_DOMAIN` for source-backed panels
  ([scaffold.py:644-649][s644]).
- **Digital twins from marginals.** umriss builds "auditable synthetic
  populations from reported survey marginals" ([umriss README:44-45][u44]).
  It warns that the output is "a calibrated synthetic population, not a
  reconstruction" ([:50][u50]). It also says "Target marginals must not enter
  support-generation prompts" ([:157][u157]). This is a separate, heavier
  workflow, and EP does not use it by default for market asks.
- **Codebooks and instructions.** EP passes `instructions="Answer as if you were
  this person"` and a `codebook` that explains terse keys
  ([create-agent-list/SKILL.md:78-83][a78]). The EDSL docs say: "`traits` contains
  profile data. `instruction` describes how the agent should respond"
  ([agents.mdx:22][ag22]).
- **Pilot, then full run.** The docs say to "run a small pilot before scaling up
  a simulation" ([teaching.mdx:14][t14]). Their sample request asks the agent to
  "start with a small pilot" ([research_agent.mdx:20][r20]). The pilot size is
  not given anywhere. The pricing playbook goes straight to 500 agents after the
  dimension approval.

### Implication for Beca

When a user names a market without an audience, Beca should propose two
segments and 4–6 WTP-relevant dimensions in one message and wait for approval.
This copies [student_prompt_block.md:26-58][m26]. After approval, Beca calls
`build_agents` with LLM-drafted trait dicts. Each dict carries `segment`,
`segment_label`, the dimensions and a 2–3 sentence second-person `persona`. The
call also passes the instruction "Answer as if you were this person" and a
`codebook`. Copy the "CRITICAL — CREATE REALISTIC DIVERSITY" block
([:73-85][m73]) verbatim into the persona prompt. Pilot size is our own choice
because EP gives none. Our existing 4×2 pilot rule can stay, but the doc should
say it is ours.

---

## Q2. Default questions: what study EP designs for a bare market ask

### EP practice

- **EP has no default study for a bare market ask.** No skill or doc maps
  "investigate market X" to a fixed questionnaire. `design-experiment` says to
  clarify a vague question instead: "What specifically do you want to
  manipulate?" ([design-experiment/SKILL.md:68][d68]). `create-study` says: "If
  the description is ambiguous... use AskUserQuestion"
  ([create-study/SKILL.md:51][cs51]).
- **Pricing, the one market playbook EP publishes, uses one question.** It is
  "a single-question survey asking maximum willingness to pay"
  ([student_prompt_block.md:109][m109]), asked as a `QuestionNumerical` with
  `min_value=0` ([:114-125][m114]). The wording is "What is the maximum amount
  in dollars you would be willing" ([:119-120][m119]), plus "If you would not
  buy it at any price, answer 0" ([:120-121][m119]). The full product
  description goes "directly into the question_text string" ([:129-130][m129]).
- **Message test.** The EP docs give the template: "Compare reactions to these
  three messages across two audience profiles" ([research_agent.mdx:20][r20]).
  The teaching playbook asks for "three advertising messages, a product
  description, and two audience definitions" ([teaching.mdx:22][t22]). EDSL
  sets this up as messages in scenarios crossed with profiles in agents
  ([agents.mdx:14-18][ag14]).
- **Feature or price trade-offs map to conjoint.** The routing table maps
  "Conjoint analysis / Choice experiment / Product preference" to
  `/conjoint-study` ([edsl-research/CLAUDE.md:27][rt27]). Its defaults are:
  "Choice-Based Conjoint (CBC) (Recommended)" ([conjoint-study/SKILL.md:91][c91]),
  "Standard (8 tasks, 3 profiles) (Recommended)" ([:102][c102]), "Use 3-8
  attributes" and "2-5 levels per attribute" ([:68][c68]), a None option set to
  "No (Recommended)" ([:116][c116]), and 4 design versions ([:434][c434]).
- **Wording rules.** "Use established scales and question wordings when
  available" ([design-experiment/SKILL.md:369][d369]). "Each condition should
  differ on exactly the intended dimension" ([:368][d368]). EP's pretest guide
  names the faults to check for: "Double-barreled" and "Leading"
  ([pretesting.mdx:20][pt20]). It also shows a vague term fixed with a recall
  period ([:14][pt14]).
- **Standard modules.** EP publishes no Van Westendorp module, no NPS module,
  no purchase-intent scale and no reasons-to-choose or reasons-to-leave module
  in any file read. WTP appears only as the single open numeric question above.
  Price ladders appear only as a conjoint price attribute.

### Implication for Beca

For a bare market ask, EP's own approach is to ask what decision the study must
inform, not to run a default battery. Beca should name three study types and
let the user pick:

- **pricing / WTP:** `build_survey` with one `numerical` max-WTP question, worded
  as in [student_prompt_block.md:117-121][m117];
- **message test:** `build_scenarios` for the messages and `build_agents` for
  the audiences;
- **feature trade-off:** `conjoint_design` with EP's defaults (CBC, 8 tasks,
  3 profiles, 4 versions, no None option).

A Van Westendorp, NPS or purchase-intent module would be our own invention.
Label it that way if we add one.

---

## Q3. Pause or go: does EP confirm, show cost, pilot, or run straight away?

### EP practice

- **The design is approved before anything runs.** EP's study scaffold writes a
  first gate, `plan-approved`, described as "User approved plan.md and its
  definition of done" ([scaffold.py:276-278][s276]). The gate is checked with
  `"type": "user-approval"`. The `workflow-setup` target fails without
  "APPROVAL_EVIDENCE is required" ([:422][s422]). The next action is: "Create
  plan.md... and obtain approval before method-specific scaffolding"
  ([:818][s818]). The docs say: "Review the proposed method... before running
  the study" ([research_agent.mdx:30][r30]).
- **Cost is shown before spending, as a separate step.** The scaffold's
  `prepare` target runs `estimate`, which calls `ep jobs cost` ([:425][s425],
  [:436-437][s436]). The run happens in a later phase called
  `"after_spend_approval"` ([:809][s809]). The docs say: "review estimated costs"
  ([research_agent.mdx:36][r36]). Cost estimation "does not run the survey"
  ([costs.mdx:6][co6]). EP keeps an "Append-only cost ledger for EP-Agent
  study runs" ([log_cost.py:2][lc2]). The run model is passed as a "Confirmed
  model name" ([scaffold.py:863][s863]).
- **Pilot before scaling.** "Estimate costs and run a small pilot before scaling
  up" ([teaching.mdx:14][t14]). The teaching playbook says: "estimate the cost
  of a small AI pilot" ([teaching.mdx:22][t22]). EDSL's test model "returns a
  fixed answer" and costs nothing ([cli.mdx:34][cl34]). EP does not say to run
  a test-model pilot before a paid pilot.
- **Skills ask at each phase.** `conjoint-study` asks the user to confirm the
  full design ([conjoint-study/SKILL.md:136-146][c136]). It then asks "Run now"
  or "Run later", and warns "this will make API calls" ([:386-392][c386]).
  `design-experiment` ends with "Looks good! / Modify / Generate EDSL code"
  ([design-experiment/SKILL.md:350-359][d350]). umriss requires the agent to
  "show me the jobs, model, call count... and wait for my approval"
  ([umriss README:28-29][u28]). It also requires reporting "likely cost when
  available" ([umriss AGENTS.md:23][ua23]).
- **The one exception is to run without asking after approval.** Once the user
  has approved the dimensions, the pricing playbook says "WITHOUT further
  questions, do all of the following" ([student_prompt_block.md:63][m63]). That
  includes the full run.

### Implication for Beca

EP's own pattern is two pauses. The first pause is for the design. The second
is for the cost, after `estimate_cost`, before the paid pilot. After the user
approves both, Beca runs without further questions. Concretely, Beca should
show the plan (`show_flow` and the agent summary) and wait for approval. It
should then call `estimate_cost` and wait for spend approval. After that it
calls `run_survey` on a small pilot, and runs the full panel without asking
again. Our current prompt rule, "Ask before any run on a paid model, after
estimate_cost", already matches EP. Running the free `test` model first to
check mechanics is our own addition, not EP practice.

---

## Q4. Output: charts, tables and wording after a run

### EP practice

- **Standard plots.** EP-Agent's `build_standard_plots.py` draws two charts by
  default. The first is a "Mean numeric responses" bar chart of every numeric
  question ([build_standard_plots.py:21-34][b21]). The second is "Response by"
  the first segment for the first numeric question ([:36-56][b36]). Both read
  `ep results review` output ([scaffold.py:446-451][s446]).
- **Plot style.** `plot_style.py` is the "Shared matplotlib style baseline for
  EP-Agent report visuals" ([plot_style.py:2][ps2]). It sets serif fonts, no top
  or right spines and an 8-colour cycle ([:38-86][ps38]). It defines 5- and
  7-point Likert palettes ([:179-186][ps179]) and a stacked-percent bar for
  Likert items ([:322-336][ps322]). One rule: "ALWAYS use this instead of mixing
  fig.suptitle() + ax.set_title()" ([:136][ps136]).
- **Per-question charts and tables.** `analyze-results` puts "each
  visualization immediately after its corresponding question's data table"
  ([analyze-results/SKILL.md:288][ar288]). It draws a bar chart when a question
  has 20 values or fewer ([:307][ar307]). It always asks "What would you like me
  to focus on" first ([:79][ar79]).
- **Conjoint outputs.** These are an attribute-importance chart, part-worth
  utilities, a position-bias check, price sensitivity, a segment heatmap and an
  optimal-product table ([analyze-conjoint-results/SKILL.md:420-508][acr420]).
  The market simulation is offered as a follow-up ([:579-582][acr579]).
- **Report structure.** Every report MUST have these sections: Executive
  Summary, Study Design, Methodology, Results, Key Findings, Limitations and
  Files Generated ([report-reference/SKILL.md:14-22][rr14]). The Executive
  Summary carries "3-5 quantified key findings" ([:16][rr16]). Key Findings is
  "4-6 paragraphs of substantive prose" ([:26][rr26]), and each paragraph
  should "State a specific, quantified finding" ([:27][rr26]). Report "the
  analytical N" and state the unit of analysis ([:72-75][rr72]). Show the
  "FULL persona description, never truncated" ([:50][rr50]).
- **How simulated evidence is labelled.** The EP docs ask for "Label all
  simulated responses clearly in the report" ([research_agent.mdx:20][r20]). A
  report should say "whether each result came from humans or AI"
  ([research_agent.mdx:39][r39]). Every comparison should "Distinguish human
  responses from simulated responses" ([teaching.mdx:30][t30]). The conjoint
  report's first limitation reads "Respondents are AI agents, not human
  consumers" ([analyze-conjoint-results/SKILL.md:523][acr523]). It adds that
  results "should be validated with human respondent studies"
  ([:523][acr523]). Bower keeps simulation as its own evidence kind and says a
  simulation "does not establish what the real person thinks"
  ([bower README:174-184][bw184]).
- **Length.** EP gives no word limit for a chat reply. Its limits apply to the
  report sections above. The pricing playbook's chat output is summary
  statistics per segment: N, mean, median, min, max, SD and the share at $0
  ([student_prompt_block.md:164-172][m164]).

### Implication for Beca

After a run, Beca should reply with what EP's standard plots show. That means
`plot_means` for the numeric questions and `plot_means` split by `segment`.
For categorical questions, use `results_tally` plus `plot_distribution`, with
each table next to its chart. For a conjoint, use `conjoint_analyze`,
`plot_conjoint` (importance, then utilities) and, when asked,
`conjoint_market_share`. Copy EP's labelling rules verbatim into the persona
prompt: "Label all simulated responses clearly" and "Respondents are AI agents,
not human consumers". The chat reply can keep our one-line finding, limit and
next-study format. EP's 7-section report applies only when the user asks for a
report.

---

## Text that could be copied into `docs/subconscious/ep-research-prompt.md`

| Candidate text | File | Licence |
|---|---|---|
| Segment and dimension elicitation, the "CRITICAL — CREATE REALISTIC DIVERSITY" block, and the WTP question wording | `mit-sloan-econ-asg/student_prompt_block.md:26-130` | **No licence file**; GitHub reports none. Default copyright applies. Paraphrase it or ask EP before copying verbatim. |
| Report sections, Key Findings rules, agent display rules | `ep-skills/plugins/edsl-research/skills/report-reference/SKILL.md:12-75` | **No licence** (repo has no LICENSE; GitHub reports none). Same caveat. |
| Conjoint defaults (3–8 attributes, CBC, 8×3, no None, 4 versions) | `ep-skills/.../conjoint-study/SKILL.md:68-116, 430-437` | **No licence.** Facts such as numeric defaults can be restated in our own words. |
| Design principles (simplicity, clean manipulations, validated measures, 80% power) | `ep-skills/.../design-experiment/SKILL.md:363-372` | **No licence.** |
| LLM-simulation limitation paragraph | `ep-skills/.../analyze-conjoint-results/SKILL.md:416-418, 523` | **No licence.** |
| Research Agent request templates ("estimate the model costs... start with a small pilot... Label all simulated responses clearly") | `edsl/docs/en/latest/research_agent.mdx:20`, `teaching.mdx:22` | **MIT** (edsl). Safe to copy with attribution. |
| Gate sequence plan-approved → estimate → after_spend_approval → post-run | `edsl/edsl/cli_commands/study_resources/scaffold.py:276-278, 425-437, 805-811` | **MIT** (edsl). |
| `plot_style.py`, `build_standard_plots.py` | `edsl/edsl/cli_commands/study_resources/` | **MIT** (edsl). Can be vendored into `serve_ep.py` charts with attribution. |
| Approval-before-paid-inference wording | `umriss/README.md:27-29`, `umriss/AGENTS.md:19-27` | **MIT** (© 2026 John Joseph Horton). |
| Simulation-as-separate-evidence wording | `bower/README.md:174-184` | **No licence.** |

The safest verbatim source is the MIT-licensed `edsl` docs. The most specific
market guidance (`mit-sloan-econ-asg`, `ep-skills`) has no licence. Restate it
in our own words with a citation, or ask EP for permission or a licence.

[m26]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L26-L58
[m39]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L39
[m45]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L45-L51
[m56]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L56
[m63]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L63
[m65]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L65
[m66]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L66-L71
[m73]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L73-L85
[m74]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L74
[m81]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L81-L84
[m85]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L85
[m109]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L109
[m114]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L114-L125
[m117]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L117-L121
[m119]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L119-L121
[m129]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L129-L130
[m164]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L164-L172
[m195]: https://github.com/expectedparrot/mit-sloan-econ-asg/blob/a5769e5c0214e30dccf89530932bc9db22cb9898/student_prompt_block.md#L195-L196
[r20]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/docs/en/latest/research_agent.mdx#L20
[r30]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/docs/en/latest/research_agent.mdx#L30
[r36]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/docs/en/latest/research_agent.mdx#L36
[r39]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/docs/en/latest/research_agent.mdx#L39
[t14]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/docs/en/latest/teaching.mdx#L14
[t22]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/docs/en/latest/teaching.mdx#L22
[t30]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/docs/en/latest/teaching.mdx#L30
[co6]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/docs/en/latest/costs.mdx#L6
[cl34]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/docs/en/latest/cli.mdx#L34
[ag14]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/docs/en/latest/agents.mdx#L14-L18
[ag22]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/docs/en/latest/agents.mdx#L22
[pt14]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/docs/en/latest/research/pretesting.mdx#L14
[pt20]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/docs/en/latest/research/pretesting.mdx#L20
[s276]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/scaffold.py#L276-L278
[s422]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/scaffold.py#L422
[s425]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/scaffold.py#L425
[s436]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/scaffold.py#L436-L437
[s446]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/scaffold.py#L446-L451
[s644]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/scaffold.py#L644-L649
[s809]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/scaffold.py#L805-L811
[s818]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/scaffold.py#L818
[s863]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/scaffold.py#L863
[lc2]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/log_cost.py#L2
[b21]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/build_standard_plots.py#L21-L34
[b36]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/build_standard_plots.py#L36-L56
[ps2]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/plot_style.py#L2
[ps38]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/plot_style.py#L38-L86
[ps136]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/plot_style.py#L136
[ps179]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/plot_style.py#L179-L186
[ps322]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/plot_style.py#L322-L336
[ps349]: https://github.com/expectedparrot/edsl/blob/4e66ea71e9a3e5ce9c65c45d6e559d1fb6fb350b/edsl/cli_commands/study_resources/plot_style.py#L349
[rt27]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/CLAUDE.md#L27
[c68]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/conjoint-study/SKILL.md#L68
[c91]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/conjoint-study/SKILL.md#L91
[c102]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/conjoint-study/SKILL.md#L102
[c116]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/conjoint-study/SKILL.md#L116
[c122]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/conjoint-study/SKILL.md#L122-L127
[c136]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/conjoint-study/SKILL.md#L136-L146
[c386]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/conjoint-study/SKILL.md#L386-L392
[c434]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/conjoint-study/SKILL.md#L434
[d68]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/design-experiment/SKILL.md#L65-L70
[d350]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/design-experiment/SKILL.md#L350-L359
[d368]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/design-experiment/SKILL.md#L368
[d369]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/design-experiment/SKILL.md#L369
[d370]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/design-experiment/SKILL.md#L370
[d385]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/design-experiment/SKILL.md#L385
[cs51]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/create-study/SKILL.md#L51
[a13]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/create-agent-list/SKILL.md#L13
[a57]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/create-agent-list/SKILL.md#L57
[a78]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/create-agent-list/SKILL.md#L78-L84
[ar79]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/analyze-results/SKILL.md#L75-L80
[ar288]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/analyze-results/SKILL.md#L288
[ar307]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/analyze-results/SKILL.md#L307
[acr420]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/analyze-conjoint-results/SKILL.md#L420-L508
[acr523]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/analyze-conjoint-results/SKILL.md#L523
[acr579]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/analyze-conjoint-results/SKILL.md#L579-L582
[rr14]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/report-reference/SKILL.md#L14-L22
[rr16]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/report-reference/SKILL.md#L16
[rr26]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/report-reference/SKILL.md#L26-L29
[rr50]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/report-reference/SKILL.md#L50
[rr72]: https://github.com/expectedparrot/ep-skills/blob/f8ad7545a6d1280be518f50743c0e3e432426633/plugins/edsl-research/skills/report-reference/SKILL.md#L72-L75
[u28]: https://github.com/expectedparrot/umriss/blob/4f9b20c4a7b24d468d8f8e2bceb75f247a78f195/README.md#L28-L29
[u44]: https://github.com/expectedparrot/umriss/blob/4f9b20c4a7b24d468d8f8e2bceb75f247a78f195/README.md#L44-L48
[u50]: https://github.com/expectedparrot/umriss/blob/4f9b20c4a7b24d468d8f8e2bceb75f247a78f195/README.md#L50-L52
[u157]: https://github.com/expectedparrot/umriss/blob/4f9b20c4a7b24d468d8f8e2bceb75f247a78f195/README.md#L157
[ua23]: https://github.com/expectedparrot/umriss/blob/4f9b20c4a7b24d468d8f8e2bceb75f247a78f195/AGENTS.md#L22-L24
[bw184]: https://github.com/expectedparrot/bower/blob/c8a84aa3c5c74e160e5f46d85b71265b11fc157c/README.md#L174-L184
