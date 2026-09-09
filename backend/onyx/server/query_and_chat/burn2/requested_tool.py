"""Honor explicit research/calculation requests through Onyx's native forced-tool path."""

import re


def requested_tool(message: str, enabled: dict[str, int]) -> int | None:
    # Ambiguous or negative requests stay with normal native tool selection.
    if re.search(
        r"\b(?:do not|don't|never|without)\s+(?:use|run)?\s*(?:python|gpt researcher)",
        message,
        re.I,
    ):
        return None
    requested = re.findall(r"\b(?:use|run)\s+(python|gpt researcher)\b", message, re.I)
    if len(requested) != 1:
        return None
    name = "run_python" if requested[0].lower() == "python" else "deep_research"
    return enabled.get(name)
