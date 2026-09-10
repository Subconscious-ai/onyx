"""Validate generated model briefs before changing saved assistant metadata."""

import copy
import json
import re
from pathlib import Path
from typing import Any

from jsonschema import Draft7Validator

SCHEMA = json.loads(Path(__file__).with_name("brief.schema.json").read_text())
_VALIDATOR = Draft7Validator(SCHEMA)
_HYPOTHETICAL = re.compile(
    r"\b(?:scenario|hypothetical|hypothesis|assume|suppose|public case|case study|benchmark)\b",
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
    return item


def attach_source(item: Any, statements: list[str]) -> None:
    if isinstance(item, dict):
        if "sourceMessageIndex" in item:
            index = item.pop("sourceMessageIndex")
            if index is not None:
                if type(index) is not int or not 0 <= index < len(statements):
                    raise ValueError("Unknown executive source index")
                if len(statements[index]) <= 1200:
                    item["quote"] = statements[index]
        for child in item.values():
            attach_source(child, statements)
    elif isinstance(item, list):
        for child in item:
            attach_source(child, statements)


def validate_brief(value: Any, statements: list[str]) -> dict[str, Any]:
    value = optional_evidence(value)

    attach_source(value, statements)
    errors = list(_VALIDATOR.iter_errors(value))
    if not isinstance(value, dict) or errors:
        # Schema paths contain field names and indices, never source content.
        paths = [
            f"{'.'.join(str(part) for part in error.absolute_schema_path)}:{error.validator}"
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
    for edge in result["transitions"]:
        if (
            edge["from"] not in ids
            or edge["to"] not in ids
            or edge["from"] == edge["to"]
        ):
            raise ValueError("Unknown behavior transition endpoint")
        ground(edge["behavior"])
    for item in result["model"]["inputs"]:
        ground(item["value"])
    equation = result["model"]["equation"]
    equation["status"] = "assumption"
    equation.pop("quote", None)
    equation.pop("url", None)
    if any(item["journeyId"] not in ids for item in result["interventions"]):
        raise ValueError("Unknown intervention journey reference")
    result["conflicts"] = [
        item
        for item in result["conflicts"]
        if len(set(item["quotes"])) == 2
        and all(
            any(normal(quote) in source for source in sources)
            for quote in item["quotes"]
        )
    ]
    return result


def needs_completion(value: dict) -> bool:
    """A stated numeric objective must survive extraction into the model contract."""
    objective = value.get("objective", {})
    return bool(
        objective.get("status") == "executive"
        and re.search(r"\d", objective.get("text", ""))
        and (
            not value.get("keyResults") or not (value.get("model") or {}).get("inputs")
        )
    )
