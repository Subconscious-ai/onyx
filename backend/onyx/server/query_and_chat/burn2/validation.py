"""Validate generated model briefs before changing saved assistant metadata."""

import copy
import json
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

from jsonschema import Draft7Validator

SCHEMA = json.loads(Path(__file__).with_name("brief.schema.json").read_text())
_VALIDATOR = Draft7Validator(SCHEMA)
_HYPOTHETICAL = re.compile(
    r"\b(?:scenario|hypothetical|hypothesis|assume|suppose|public case|case study|benchmark)\b",
    re.I,
)
_DESIRED_OUTCOME = re.compile(
    r"\b(?:target|goal|objective)\s*(?:(?:is|of|equals)\b|[=:])[^.;\n\d]*\d",
    re.I,
)

# A quote's presence is not evidence that the executive endorsed its commands.
# Exclude only explicitly disclaimed instruction spans, not all third-party
# reports or the trusted observations elsewhere in the same source message.
_UNTRUSTED_INSTRUCTION_SPAN = re.compile(
    r"\b(?:not (?:my|our) instructions?|untrusted[^\n:]{0,120}\binstructions?)\s*:\s*"
    r"(?:'(?:[^'\n]|(?<=\w)'(?=\w))*'|\"[^\"\n]*\"|“[^”\n]*”|‘[^’\n]*’)",
    re.I,
)


def optional_evidence(item: Any) -> Any:
    if isinstance(item, dict):
        return {
            key: optional_evidence(entry)
            for key, entry in item.items()
            if not (key in {"quote", "url"} and entry is None)
        }
    if isinstance(item, list):
        return [optional_evidence(entry) for entry in item]
    if isinstance(item, str) and "\x00" in item:
        raise ValueError(
            "NUL is not valid Postgres text. Use plain ASCII operators in equations."
        )
    return item


def attach_source(item: Any, statements: list[str]) -> None:
    if isinstance(item, dict):
        if "sourceMessageIndex" in item:
            index = item.pop("sourceMessageIndex")
            if index is not None:
                if type(index) is not int or not 0 <= index < len(statements):
                    raise ValueError(
                        f"sourceMessageIndex must be an integer from 0 to {len(statements) - 1}. Use the supplied zero-based executive message index, not a sentence number or an assistant message. Unknowns and hypotheses use null."
                    )
                if len(statements[index]) <= 1200:
                    item["quote"] = statements[index]
        for child in item.values():
            attach_source(child, statements)
    elif isinstance(item, list):
        for child in item:
            attach_source(child, statements)


def source_only_states_targets(note: dict[str, Any]) -> bool:
    """Detect clear target-only sources, not general semantic entailment."""
    numeric_clauses = [
        clause
        for clause in re.split(r"(?<=[.!?;])\s+|\n", note.get("quote", ""))
        if re.search(r"\d", clause)
    ]
    return bool(numeric_clauses) and all(
        _DESIRED_OUTCOME.search(clause)
        and len(re.findall(r"\d[\d,]*(?:\.\d+)?", clause)) == 1
        and not re.search(
            r"\b(?:baseline|current|currently|observed|actual|previous|prior|historical)\b",
            clause,
            re.I,
        )
        for clause in numeric_clauses
    )


def validate_input_purpose(item: dict[str, Any]) -> None:
    """Keep explicitly desired outcomes separate from operating observations."""
    note = item["value"]
    if not re.search(r"\d", note["text"]) and re.search(
        r"\b(?:unknown|not measured|not known|unavailable)\b", note["text"], re.I
    ):
        # Testimony that a quantity is unavailable is not an observed value.
        note["status"] = "unknown"
        note.pop("quote", None)
        note.pop("url", None)
    purpose = re.sub(r"([a-z])([A-Z])", r"\1 \2", item["name"])
    purpose = re.sub(r"[_-]", " ", purpose)
    if (
        item["value"]["status"] == "executive"
        and (
            _DESIRED_OUTCOME.search(item["value"]["text"])
            or source_only_states_targets(note)
        )
        and not re.search(r"\b(?:target|goal|objective)\b", purpose, re.I)
    ):
        raise ValueError(
            "A target cannot become an observed operating input. Keep baseline inputs unknown; label desired targets explicitly and use only the current corrected target."
        )
    currency = r"[$€£¥]|\b(?:USD|EUR|GBP|CAD|AUD|JPY|INR|dollars?|euros?|pounds?|yen|currency)\b"
    if re.fullmatch(
        rf"\s*(?:{currency})\s*\d[\d,]*(?:\.\d+)?\s*(?:thousand|million|billion|[kmb])?\s*",
        note["text"],
        re.I,
    ) and not re.search(currency + r"|\bunknown\b", item["unit"], re.I):
        raise ValueError(
            "A scalar currency value cannot use a non-currency unit. Keep counts separate from monetary inputs."
        )


def ground_journey_actors(journey: list[dict], transitions: list[dict]) -> None:
    """Retain unsupported participants as proposed structure, not testimony."""

    def normal(text: str) -> str:
        return " ".join(text.lower().split())

    def demote(note: dict) -> None:
        note["status"] = "assumption"
        note.pop("quote", None)
        note.pop("url", None)

    for stage in journey:
        # A genuine quote does not establish an invented participant. This
        # lexical guard is conservative, not full semantic entailment.
        actor = normal(stage["actor"])
        plural = (
            len(actor) > 2
            and not actor.endswith("s")
            and actor
            not in {
                "you",
                "she",
                "they",
                "him",
                "her",
            }
        )
        supported = bool(actor) and re.search(
            r"(?<!\w)" + re.escape(actor) + (r"s?" if plural else "") + r"(?!\w)",
            normal(stage.get("quote", "")),
        )
        # A real participant does not establish a newly invented action. Keep
        # paraphrases that this conservative lexical check cannot ground as draft assumptions.
        words = set(re.findall(r"\b[a-z]{2,}\b", normal(stage["text"]))) - {
            "the",
            "our",
            "an",
            "to",
            "and",
            "for",
            "of",
            "in",
            "on",
            "at",
            "by",
            "their",
            "then",
            "with",
            "from",
            "that",
            "this",
            "into",
            "after",
            "before",
        }
        source_words = set(re.findall(r"\b[a-z]{2,}\b", normal(stage.get("quote", ""))))
        content_supported = bool(words) and all(
            word in source_words
            or word.removesuffix("s") in source_words
            or word + "s" in source_words
            for word in words
        )
        denied = any(
            re.search(
                r"\b(?:not|never|don.t|doesn.t|didn.t)\s+(?:"
                + "|".join(
                    re.escape(form)
                    for form in {word, word.removesuffix("s"), word + "s"}
                )
                + r")\b",
                normal(stage.get("quote", "")),
            )
            for word in words
        )
        if stage["status"] == "executive" and not (
            supported and content_supported and not denied
        ):
            demote(stage)
    assumed = {stage["id"] for stage in journey if stage["status"] == "assumption"}
    for edge in transitions:
        if edge["from"] in assumed or edge["to"] in assumed:
            demote(edge["behavior"])


def ground_literal_goal(note: dict[str, Any], statements: list[str]) -> None:
    """A literal declared goal is intent, even after an earlier hypothetical."""
    label = re.match(r"^(?:goal|objective)\s*[:=]\s*(.+)$", note["text"], re.I)
    if not label or note["status"] == "unknown":
        return
    phrase = r"(?:^|[.!?:;]\s+)(?:our |my |the )?(?:goal|objective)\s*(?:is\b|[:=])\s*"
    goal = re.compile(phrase + re.escape(label[1]) + r"(?!\w)", re.I)
    for source in reversed(statements):
        trusted = _UNTRUSTED_INSTRUCTION_SPAN.sub(" ", source)
        if _HYPOTHETICAL.search(source) or not re.search(
            r"\b(?:goal|objective)\b", trusted, re.I
        ):
            continue
        if (
            len(source) <= 1200
            and not re.search(
                r'["“”]|\b(?:competitor|their|told|reported|says|said)\b', trusted, re.I
            )
            and not re.search(
                r"\bnot\s+(?:our |my |the )?(?:goal|objective)\b", trusted, re.I
            )
            and goal.search(trusted)
        ):
            note.update(status="executive", quote=source)
        # A later declaration or denial prevents revival of an older goal.
        return


def conflict_sources(statements: list[str]) -> list[str]:
    """Keep measured claims when another sentence discusses a scenario."""
    sources: list[str] = []
    for text in statements:
        trusted: str = _UNTRUSTED_INSTRUCTION_SPAN.sub(" ", text)
        sources.append(trusted)
        for clause in re.split(r"(?<=[.!?;])\s+|\n", trusted):
            if _HYPOTHETICAL.search(clause):
                break
            sources.append(clause)
    return sources


def validate_brief(value: Any, statements: list[str]) -> dict[str, Any]:
    value = optional_evidence(value)

    attach_source(value, statements)
    errors = list(_VALIDATOR.iter_errors(value))
    if not isinstance(value, dict) or errors:
        # Schema paths contain field names and indices, never source content.
        paths = [
            f"{'.'.join(str(part) for part in error.absolute_schema_path)}:{error.validator}"
            + (
                ": missing "
                + ", ".join(
                    field
                    for field in error.validator_value
                    if field not in error.instance
                )
                if error.validator == "required" and isinstance(error.instance, dict)
                else ""
            )
            for error in errors[:4]
        ]
        raise ValueError("Invalid structured model brief: " + ";".join(paths))
    result = copy.deepcopy(value)

    def normal(text: str) -> str:
        return " ".join(text.lower().split())

    sources = [normal(text) for text in statements]

    def ground(note: dict[str, Any]) -> None:
        quote = normal(note.get("quote", ""))
        if 3 <= len(quote) < 12 and quote == normal(note["text"]):
            # A complete scalar such as "$10 million" is a useful source span.
            # Retain the surrounding original statement for the frontend's conservative quote gate.
            original = next(
                (
                    text
                    for text in reversed(statements)
                    if len(text) <= 1200 and quote in normal(text)
                ),
                None,
            )
            if original:
                note["quote"] = original
                quote = normal(original)
        matched = [source for source in sources if len(quote) >= 12 and quote in source]
        if (
            note["status"] == "executive"
            and matched
            and not _HYPOTHETICAL.search(matched[-1])
        ):
            return
        if note["status"] != "unknown":
            note["status"] = "assumption"
        note.pop("quote", None)
        note.pop("url", None)

    ids = {stage["id"] for stage in result["journey"]}
    for collection in [
        result["journey"],
        result["keyResults"],
        result["transitions"],
        result["model"]["inputs"],
    ]:
        if len({item["id"] for item in collection}) != len(collection):
            raise ValueError("Duplicate model identifiers")
    ground_literal_goal(result["objective"], statements)
    ground(result["objective"])
    for stage in result["journey"]:
        ground(stage)
    for kr in result["keyResults"]:
        if not set(kr["journeyIds"]).issubset(ids):
            raise ValueError("Unknown key-result journey reference")
        for field in ["baseline", "target", "deadline"]:
            note = kr[field]
            if (
                field != "baseline"
                and len(normal(note["text"])) >= 3
                and note["status"] != "unknown"
            ):
                # A literally stated target/deadline is executive testimony, never an observed baseline.
                literal = re.compile(
                    r"(?<!\w)" + re.escape(normal(note["text"])) + r"(?!\w)"
                )
                source = next(
                    (
                        text
                        for text in reversed(statements)
                        if len(text) <= 1200
                        and literal.search(normal(text))
                        and not _HYPOTHETICAL.search(text)
                    ),
                    None,
                )
                if source:
                    note["quote"] = source
                    note["status"] = "executive"
            ground(note)
        validate_input_purpose(
            {"name": "Observed baseline", "unit": kr["unit"], "value": kr["baseline"]}
        )
    for edge in result["transitions"]:
        if (
            edge["from"] not in ids
            or edge["to"] not in ids
            or edge["from"] == edge["to"]
        ):
            raise ValueError("Unknown behavior transition endpoint")
        ground(edge["behavior"])
    ground_journey_actors(result["journey"], result["transitions"])
    for item in result["model"]["inputs"]:
        ground(item["value"])
        validate_input_purpose(item)
    equation = result["model"]["equation"]
    equation["status"] = "assumption"
    equation.pop("quote", None)
    equation.pop("url", None)
    if any(item["journeyId"] not in ids for item in result["interventions"]):
        raise ValueError("Unknown intervention journey reference")
    sources: list[str] = [normal(text) for text in conflict_sources(statements)]
    result["conflicts"] = [
        item
        for item in result["conflicts"]
        if len(set(item["quotes"])) == 2
        and all(
            any(
                normal(quote) in source and not _HYPOTHETICAL.search(source)
                for source in sources
            )
            for quote in item["quotes"]
        )
    ]
    return result


def needs_completion(value: dict) -> bool:
    """Require links for supplied structure, not an invented customer journey."""
    objective = value.get("objective", {})
    return bool(
        objective.get("status") == "executive"
        and (
            re.search(r"\d", objective.get("text", ""))
            or value.get("keyResults")
            or len(value.get("journey", [])) >= 2
        )
        and (
            not value.get("keyResults")
            or not (value.get("model") or {}).get("inputs")
            or (len(value.get("journey", [])) >= 2 and not value.get("transitions"))
        )
    )


def assistant_proposals(transcript: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep recent conversational references separate from executive evidence."""
    proposals: list[dict[str, Any]] = []
    executive_index = -1
    for message in transcript:
        if message["type"] == "user":
            executive_index += 1
        elif message["type"] == "assistant":
            text = message["message"].split("<interview-brief>", 1)[0].strip()
            if text:
                proposals.append(
                    {
                        "afterExecutiveMessageIndex": (
                            executive_index if executive_index >= 0 else None
                        ),
                        "text": text[:1200],
                    }
                )
    return proposals[-12:]


def latest_saved_brief(transcript: list[dict], statements: list[str]) -> dict | None:
    """Reuse the owned native draft as context, never as new source evidence."""
    for message in reversed(transcript):
        if (
            message["type"] != "assistant"
            or "</interview-brief>" not in message["message"]
        ):
            continue
        try:
            text = (
                message["message"]
                .split("<interview-brief>", 1)[1]
                .split("</interview-brief>", 1)[0]
            )
            return validate_brief(json.loads(text), statements)
        except (ValueError, IndexError):
            continue
    return None


def prepare_validated_brief(
    generate: Callable[[str | None], Any], statements: list[str]
) -> dict[str, Any]:
    """Repair one malformed extraction; never persist an invalid fallback."""
    feedback = None
    for attempt in range(2):
        try:
            value = generate(feedback)
            if not isinstance(value, dict):
                raise ValueError("Invalid tool payload")
            value["version"] = 2
            brief = validate_brief(value, statements)
            if attempt == 0 and len(statements) >= 5 and len(brief["journey"]) < 2:
                # Recover an omitted supplied path once. A still-valid partial
                # draft must save even when the path remains unknown.
                raise ValueError(
                    "Recover supplied customer stages and transitions if available. "
                    "Otherwise keep the journey unknown; do not invent a path."
                )
            if needs_completion(brief):
                raise ValueError(
                    "A structured objective requires key results and named model inputs; a supplied journey also requires transitions. "
                    "At the fifth executive answer, retain the supplied customer stages and transitions. "
                    "Keep unsupported paths as assumptions and missing facts unknown."
                )
            return brief
        except ValueError as error:
            if attempt:
                raise
            feedback = str(error)
    raise AssertionError("Unreachable extraction state")


def extraction_schema(source_count: int) -> dict:
    """Expose only real transcript references to the extraction provider."""
    if source_count < 1:
        raise ValueError("Executive source messages required")
    schema = copy.deepcopy(SCHEMA)
    schema["properties"].pop("version")
    schema["required"].remove("version")
    schema["properties"]["keyResults"]["minItems"] = 1
    schema["properties"]["model"]["properties"]["inputs"]["minItems"] = 1
    schema["properties"]["journey"]["items"]["properties"]["actor"]["description"] = (
        "For executive-supported stages, copy the actor phrase from the indexed executive message. "
        "Reuse that same phrase across the person's decisions. Do not substitute generic visitor, prospect, "
        "or customer labels when a specific actor is supplied. Unsupported actors and paths are assumptions."
    )

    def references(item: Any) -> None:
        if isinstance(item, dict):
            properties = item.get("properties", {})
            if "text" in properties and "status" in properties:
                properties.pop("quote", None)
                properties.pop("url", None)
                item.setdefault("required", []).append("sourceMessageIndex")
                properties["sourceMessageIndex"] = {
                    "type": ["integer", "null"],
                    "minimum": 0,
                    "maximum": source_count - 1,
                    "enum": [*range(source_count), None],
                    "description": "Select the executive message supporting this statement. Use null only for unknowns and hypotheses. The server supplies the exact original quote; never retype evidence.",
                }
            for child in item.values():
                references(child)
        elif isinstance(item, list):
            for child in item:
                references(child)

    references(schema)
    return schema
