# How the free `test` model can answer every question type validly

Resolves Subconscious-ai/onyx#122. Researched 2026-11-01 against EDSL 1.0.9
installed on agent-dev (`~/ep-venv/lib/python3.12/site-packages/edsl`; the
paths below are relative to that directory) and the wrapper in
`scripts/subconscious/serve_ep.py` and `scripts/subconscious/ep_conjoint.py`.
Every claim about runtime behaviour was reproduced with keyless
`Model("test")` runs on agent-dev; the probe outputs are quoted in
"Evidence" at the end.

## Answer in one paragraph

EDSL's test model answers the literal string `Hello, world X` to every
question when no `canned_response` is set
(`inference_services/services/test_service.py:65-70`). Only `free_text`
accepts that string; every other question type validates the reply against
its own pydantic response model, rejects it, stores `answer: None` and records
an exception (`invigilators/invigilators.py:529-533`). That is why the open
question showed "Hello, world X." and why every conjoint choice
(`multiple_choice` questions, `ep_conjoint.py:144-168`) came back empty.
EDSL has two built-in helpers that produce valid placeholders
(`QuestionBase._simulate_answer`, `questions/question_base.py:293-320`, and
`TestServiceLanguageModel.set_canned_response(survey)`,
`test_service.py:128-208`) but neither is wired into `Model("test")` by
default and both miss `rank` and `top_k`. The smallest wrapper fix is a
~40-line `_default_canned(survey)` helper in `serve_ep.py` that builds a dict
keyed by `question_name` from each question's options (cycling the option
with the question's position, option *indices* for `rank`/`top_k`), merged
under any caller-supplied dict, and passed both to `_model_for` and to the
cache-file digest in `run_survey`. On agent-dev that gives 56/56 valid cells
across 14 questions of 11 types with 2 scenarios x 2 agents, and the real
`ep_conjoint` flow goes from "No answered choice tasks" to a drawable
importance chart (Price 50.4 / Color 23.8 / Size 25.8).

## 1. What the test model returns without `canned_response`, per type

### Where the reply comes from

- `test_service.py:65-70`: `_canned_response` returns `self.canned_response`
  if the attribute exists, else the string `"Hello, world X"`.
- `test_service.py:115-126`: the reply is `f"{canned_text}"`, so a list or
  dict canned value is sent as its Python `repr` (e.g. `['A', 'B']`), and a
  dict canned value is looked up by `question_name`
  (`response.get(question_name, f"No canned response for '{question_name}'")`).
- `language_models/language_model.py:955-961`: `question_name` is only added
  to the call when `self.model == "test"`, taken from
  `invigilator.question.question_name`. That is what makes a dict keyed by
  `question_name` work inside a multi-question survey.
- `language_model.py:284-291`: every extra kwarg to `Model(...)`, including
  `canned_response`, becomes an instance attribute, which is how
  `Model("test", canned_response=...)` reaches the property above.

### Where the reply is validated

- `questions/response_validator_abc.py:75-127`: `validate()` runs the
  question's pydantic `response_model.model_validate(data)`; a
  `ValidationError` becomes `QuestionAnswerValidationError`, then
  `_handle_exception` tries the type's `fix()` once and re-raises if the fix
  does not validate.
- `invigilators/invigilators.py:529-533`: on `QuestionAnswerValidationError`
  the invigilator sets `answer = None`, `comment = "The response was not
  valid."` and keeps the exception, which the wrapper surfaces through
  `results.task_history` (`serve_ep.py:_failed_interviews`).

### Per type, measured (probe A, 1 agent, no scenarios)

| question_type | reply to "Hello, world X" | why |
|---|---|---|
| free_text | `'Hello, world X'` (valid) | `FreeTextResponse.answer: str` accepts any string (`questions/question_free_text.py:48`) |
| multiple_choice | `None` + exception | answer must be `Literal[<options>]` (`questions/question_multiple_choice.py:134`) |
| yes_no | `None` + exception | subclass of `QuestionMultipleChoice` (`question_yes_no.py:9`), same Literal |
| likert_five | `None` + exception | subclass of `QuestionMultipleChoice` (`question_likert_five.py:8`) |
| linear_scale | `None` + exception | subclass of `QuestionMultipleChoice` (`question_linear_scale.py:223`), options are ints |
| checkbox | `None` + exception | `ConstrainedCheckboxResponse` needs a list of options (`question_check_box.py`, see probe 2 error text) |
| top_k | `None` + exception | subclass of `QuestionCheckBox` (`question_top_k.py:9`) with `use_code=True` by default (`question_top_k.py:24`), so it needs a list of option *indices* |
| rank | `None` + exception | `RankResponse.answer` must be a list with exactly `num_selections` distinct items (`question_rank.py:99-170`); `use_code=True` by default (`question_rank.py:445`) |
| numerical | `None` + exception | `answer: Union[int, float]` (`question_numerical.py:48`) |
| list | `None` + exception | `"Answer must be a list (got str)"` (`question_list.py` validator) |
| dict | `None` + exception | per-key typed model built from `answer_keys`/`value_types` (`question_dict.py:63-80`) |

So 10 of the 11 requested types reject the default reply; `free_text` is the
only one that shows it as an answer.

## 2. Built-in modes that give a valid placeholder

1. **`QuestionBase._simulate_answer(human_readable=False)`**
   (`questions/question_base.py:293-320`): `free_text` gets
   `"Hello, how are you?"`; any question with `question_options` gets a
   random option (a random index when `use_code` is true); everything else
   `"Simulated answer"`. 21 subclasses override it (`grep "def
   _simulate_answer" questions/*.py`), including checkbox (`:859`), rank
   (`:523`), list (`:493`), numerical (`:344`) and dict (`:825`). EDSL itself
   uses it to build a working test model for one question:
   `QuestionBase.example_model()` is
   `Model("test", canned_response=q._simulate_answer()["answer"])`
   (`question_base.py:1121-1126`). Caveat: checkbox/rank default to
   `human_readable=True` (labels) which is wrong for `use_code=True`
   questions; calling it with `human_readable=not q.use_code` validated for
   all 11 types in three runs (probe E). It uses the global `random` module,
   so the dict changes on every call, which would give the wrapper a new
   cache file per run.
2. **`TestServiceLanguageModel.set_canned_response(survey)`**
   (`test_service.py:128-208`): builds exactly the dict shape the wrapper
   needs (first option for multiple choice and its subclasses, first two
   options for checkbox, middle or first scale value, `42.0`, two list items,
   typed dict values, a sentence for free text). Nothing in EDSL calls it
   (`grep -rn set_canned_response` finds only the definition), and it has two
   holes: `QuestionRank` falls to the `else` branch and gets the string
   `"Canned fallback for rank"` (`:204-206`), and `QuestionTopK` is matched
   by the `QuestionCheckBox` branch and gets two labels (`:148-150`) where it
   needs exactly `k` indices. Probe B: 9/11 valid, `rank` and `top_k` empty.
3. **`func` hook** (`test_service.py:107-113`): `Model("test",
   func=callable)` returns `func(user_prompt, system_prompt, files_list)`.
   It sees the rendered prompt, so it can vary the answer per respondent
   (probe G hashed the prompt to choose Option A/B and produced different
   choices per agent and scenario). It does not see the question object, so
   the callable must parse the prompt to stay valid; it is the route if the
   wrapper ever wants per-agent variation on the free model.
4. **`LanguageModel.from_scripted_responses({agent: {question: answer}})`**
   (`language_model.py:1450-1486`, `language_models/scripted_response_model.py`)
   returns a `scripted` model keyed by agent name and question name. It needs
   named agents and a full script, so it is heavier than the dict route and
   not needed here.

There is no flag on `Model("test")` that switches on any of these; the
default is the fixed string.

## 3. The smallest wrapper change

### What the wrapper does today

- `serve_ep.py:_model_for` (`:1417-1425`) builds
  `Model("test", canned_response=...)` only when the caller passed a truthy
  `canned_response`; otherwise `Model("test")`, which is the "Hello, world X"
  path.
- `serve_ep.py:run_survey` (`:783-815`) keys the on-disk cache file by a
  digest of `canned_response`, because EDSL's cache key deliberately drops
  `canned_response` for the test model (`language_model.py:886-888`). Probe
  F confirms why that matters: a cache primed by a `Model("test")` run serves
  its unvalidated `Hello, world X` entries to a later run with a canned dict
  on the same cache, and every answer is empty again. So the *effective*
  canned answer, not the caller's, must go into the digest.

### Recommended change (verified on agent-dev, probe H and I2)

Add one helper next to `_model_for` in `scripts/subconscious/serve_ep.py`:

```python
def _default_canned(survey: Any) -> dict[str, Any]:
    """One valid placeholder answer per question for the free test model.

    With no canned_response, EDSL's test model answers "Hello, world X" to
    everything; only free_text accepts that, every other type rejects it and
    records an empty answer. Option questions cycle through their options with
    the question's position in the survey, so a conjoint does not choose the
    same option in every task. Questions that take codes (rank always, top_k
    by default, or any question built with use_code=True) get option indices;
    the others get option labels.
    """
    canned: dict[str, Any] = {}
    for position, q in enumerate(survey.questions):
        options = list(getattr(q, "question_options", None) or [])
        kind = q.question_type
        codes = bool(getattr(q, "use_code", False)) or kind == "rank"

        def pick(count: int) -> list:
            picks = [(position + i) % len(options) for i in range(min(count, len(options)))]
            return picks if codes else [options[i] for i in picks]

        answer: Any
        if kind == "free_text":
            answer = f"Placeholder answer to {q.question_name} from the free test model."
        elif kind in ("checkbox", "top_k"):
            answer = pick(getattr(q, "min_selections", None) or 1)
        elif kind == "rank":
            answer = pick(getattr(q, "num_selections", None) or len(options))
        elif options:  # multiple_choice, linear_scale, yes_no, likert_five, dropdown
            answer = pick(1)[0]
        elif kind == "numerical":
            low = getattr(q, "min_value", None) or 0
            high = getattr(q, "max_value", None)
            answer = (low + high) / 2 if high is not None else low + 1
        elif kind == "list":
            answer = [f"{q.question_name} item 1", f"{q.question_name} item 2"]
        elif kind == "dict":
            types = list(getattr(q, "value_types", None) or [])
            answer = {}
            for i, key in enumerate(getattr(q, "answer_keys", None) or []):
                t = types[i] if i < len(types) else "str"
                answer[key] = (
                    1 if "int" in t else 1.0 if "float" in t else True if "bool" in t
                    else ["item"] if t.startswith("list") else f"{key} value"
                )
        else:
            answer = q._simulate_answer()["answer"]
        canned[q.question_name] = answer
    return canned
```

Wire it into `run_survey` before `_job` is called, so the same dict reaches
`_model_for` and the cache digest (`_job`, `_model_for` and every other tool
keep their signatures):

```python
        notes: list[str] = []
        if model == DEFAULT_MODEL and not isinstance(canned_response, (str, list)):
            # No answer or a partial dict: fill every question with a valid
            # placeholder so a mechanics check never shows "Hello, world X"
            # or an empty answer. A string or list stays the caller's choice.
            canned_response = {
                **_default_canned(workspace.load("surveys", survey)),
                **(canned_response or {}),
            }
        job = _job(survey, agents, scenarios, model, canned_response, service, notes)
        suffix = (  # unchanged: now digests the effective dict
            f"-test-{_digest(json.dumps(canned_response or '', sort_keys=True))}"
            ...
```

And one line in the `run_survey` docstring: "model 'test' is free; with no
canned_response every question gets a valid placeholder (first options
cycling by position), or pass a string, a list, or a dict keyed by
question_name to choose the answers."

Why these shapes (each one measured, probes 2, 5 and H):

- Multiple choice and its subclasses, and checkbox with the default
  `use_code=False`, accept option labels; a Python list renders as
  `['A', 'B']` and the checkbox `fix()` parses it.
- `rank` accepts a list of option indices whatever `use_code` is
  (`[2, 0, 1]` validated with `use_code=True` and `use_code=False`), while a
  list of labels fails in 1.0.9 with `Invalid response: ValueError: 'error'
  required in context` (a bug in the rank response model's custom error
  context, `question_rank.py:99-170`), a JSON string fails the same way and
  a comma string fails `Input should be a valid list`. Hence `codes = ... or
  kind == "rank"`.
- `top_k` is a checkbox with `use_code=True` by default, so it needs exactly
  `min_selections` indices; two labels (what `set_canned_response` gives)
  fail with `Input should be 0, 1, 2, 3 or 4`.
- `list` needs a list (a comma string or a `{"answer": [...]}` envelope is
  rejected); `dict` accepts the Python `repr` of a dict with the right value
  types; `numerical` accepts an int or float inside `min_value`/`max_value`.
- Keying by `question_name` holds across scenarios and agents: probe C and H
  ran 2 scenarios x 2 agents (4 interviews, 14 questions) with no exception.

Suggested regression test for `scripts/subconscious/test_serve_ep.py`: save a
survey with one question of each of the 11 types, call `run_survey` on
`model="test"` with no `canned_response`, and assert `_answered(results) ==
11` and `_failed_interviews(results)[0] == 0`; a second test designs a
conjoint, runs it on the test model with no `canned_response`, and asserts
`conjoint_analyze` returns an importance dict with a non-zero total.

## 4. Why every conjoint choice was empty

- `ep_conjoint.question_specs` (`ep_conjoint.py:144-168`) emits one
  `multiple_choice` question per task, options `Option A`, `Option B`,
  ..., plus `None of these` when `include_none`.
- `conjoint_design` (`serve_ep.py:1278-1335`) saves that survey; the user
  then runs it with `run_survey(model="test")` and no `canned_response`, so
  every task gets `Hello, world X`, which is not in the options Literal
  (`question_multiple_choice.py:134`), so every `answer.choice_task_N` is
  `None`.
- `ep_conjoint.choice_records` (`:183-213`) skips any non-string answer, so
  `analyze` raises `ValueError("No answered choice tasks in these results.")`
  (`:258-260`) and `plot_conjoint` has nothing to draw. Probe I1 reproduces
  this exactly on the real `ep_conjoint` design.

What a valid non-degenerate default looks like: `_default_canned` above
cycles the chosen option with the question position, so task 1 picks
`Option A`, task 2 `Option B`, task 3 `Option C`, task 4 `None of these`,
task 5 `Option A`, and so on. Every respondent still answers the same way (the
test model cannot see the agent), but because each task shows different
profiles the chosen levels differ across tasks and the counting estimator
produces finite part-worths. Probe I2 (3 attributes, 6 tasks x 2 versions x
2 agents): 24 observations, 4 "none", importance Price 50.4 / Color 23.8 /
Size 25.8, position counts A 8 / B 8 / C 4 / None 4. Always answering
`Option A` would also validate and, because the design is balanced, would
still spread the chosen levels; cycling is better because it also exercises
the `None of these` parsing and the position chart. For per-respondent
variation on the free model, the `func` hook (section 2, item 3) is the only
built-in route.

## Evidence (agent-dev, EDSL 1.0.9, keyless `Model("test")`, no cost)

Probe A, default `Model("test")`, 11 types:

```
ft    free_text        answer='Hello, world X'   exc=None
mc    multiple_choice  answer=None               exc=['Exception']
cb    checkbox         answer=None               exc=['Exception']
ls    linear_scale     answer=None               exc=['Exception']
num   numerical        answer=None               exc=['Exception']
rank  rank             answer=None               exc=['Exception']
lst   list             answer=None               exc=['Exception']
yn    yes_no           answer=None               exc=['Exception']
lk    likert_five      answer=None               exc=['Exception']
dct   dict             answer=None               exc=['Exception']
tk    top_k            answer=None               exc=['Exception']
unfixed exceptions: True
```

Probe B, `m.set_canned_response(survey)`: dict =
`{"ft": "This is a canned answer for ft.", "mc": "Red", "cb": ["A", "B"], "ls": 1, "num": 42.0, "rank": "Canned fallback for rank", "lst": [...], "yn": "No", "lk": "Strongly disagree", "dct": {"name": "name value", "age": 42}, "tk": ["P", "Q"]}`;
9/11 valid, exceptions on `rank` and `tk`.

Probe F, cache staleness: a `Cache()` primed by `Model("test")` holds 11
entries with `validated=False`; rerunning the same survey with a valid canned
dict on that cache returns `Hello, world X` and 10 `None` again (0 new
entries).

Probe H, `_default_canned` (final version) on 14 questions covering the 11
types plus rank with `use_code=False`, checkbox with `min_selections=2` and
unconstrained numerical, 2 scenarios x 2 agents: `rows=4 exceptions_on=[]
unfixed=False`, `answered cells: 56 of 56`; row 0 =
`{"ft": "Placeholder answer to ft from the free test model.", "mc": "Green", "cb": ["C", "D"], "ls": 4, "num": 15.0, "rank": ["Z", "X", "Y"], "lst": ["lst item 1", "lst item 2"], "yn": "Yes", "lk": "Agree", "dct": {"name": "name value", "age": 1, "tags": ["item"]}, "tk": ["P", "Q", "R"], "rank2": ["Z", "X"], "cb0": ["A"], "num0": 1}`.

Probe I, real `ep_conjoint.generate_design` + `question_specs` +
`scenario_rows`, 2 versions x 2 agents:

```
I1 default test model : unfixed=True, all answer.choice_task_N None,
                        analyze raised: No answered choice tasks in these results.
I2 _default_canned     : unfixed=False, n_observations=24, none_chosen=4,
                        importance {'Price': 50.4, 'Color': 23.8, 'Size': 25.8},
                        position_counts {'Option A': 8, 'Option B': 8, 'Option C': 4, 'None of these': 4}
```

Probe G, `Model("test", func=pick)` hashing the prompt: choices differ per
agent and scenario, `unfixed=False`.
