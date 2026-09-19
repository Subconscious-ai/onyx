"""Honor explicit research/calculation requests through Onyx's native forced-tool path."""

import re
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from onyx.tools.interface import Tool


def requested_tool(message: str, enabled: dict[str, int]) -> int | None:
    # Ambiguous or negative requests stay with normal native tool selection.
    if re.search(
        r"\b(?:do not|don't|never|without)\s+(?:use|run)?\s*(?:python|gpt researcher)",
        message,
        re.I,
    ):
        return None
    if re.search(
        r"\b(find|search|retrieve|use|show)\b.*\b(mckinsey|bain|bcg|mbb|casebook)\b",
        message,
        re.I,
    ):
        if not re.search(r"\b(do not|don't|never|without)\b", message, re.I):
            return enabled.get("internal_search")
        return None
    requested = re.findall(r"\b(?:use|run)\s+(python|gpt researcher)\b", message, re.I)
    if len(requested) != 1:
        return None
    name = "run_python" if requested[0].lower() == "python" else "deep_research"
    return enabled.get(name)


def initial_profile_tool(
    *,
    enabled: bool,
    persona_name: str,
    user_id: UUID | None,
    incognito: bool,
    tools: list["Tool"],
    forced_tool_id: int | None,
) -> int | None:
    """Bootstrap through native REQUIRED selection, never a synthetic tool execution."""
    if (
        not enabled
        or persona_name != "Burn 2.0"
        or user_id is None
        or incognito
        or forced_tool_id is not None
    ):
        return forced_tool_id

    from onyx.db.burn2_profile import read_profile
    from onyx.tools.tool_implementations.company_profile.company_profile_tool import (
        CompanyProfileTool,
    )

    profile_tool = next(
        (tool for tool in tools if isinstance(tool, CompanyProfileTool)), None
    )
    if profile_tool is None:
        return None
    company = (read_profile(user_id).get("profile") or {}).get("company")
    return None if isinstance(company, str) and company.strip() else profile_tool.id
