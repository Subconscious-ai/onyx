"""Only a persisted human message can supply evidence for a reviewed fact."""

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from onyx.server.query_and_chat.causl.models import CauslActor

FACT_PREPARATION_TOOL = "prepare_library_change"


@dataclass(frozen=True)
class CauslStatement:
    actor: CauslActor
    issuer: str
    market_id: str | None
    chat_id: UUID
    message_id: int
    message: str


def fact_preparation_arguments(
    arguments: dict[str, Any],
    statement: CauslStatement | None,
    actor: CauslActor | None,
    issuer: str | None,
) -> dict[str, Any]:
    if statement is None or actor != statement.actor or issuer != statement.issuer:
        raise ValueError("A verified executive statement is required for fact review.")
    quote = arguments.get("quote")
    if (
        not isinstance(quote, str)
        or not quote.strip()
        or len(quote) > 1200
        or quote not in statement.message
    ):
        raise ValueError("Quote an exact excerpt from the current executive statement.")
    # Replace model-supplied scope and citations instead of trusting them.
    return {
        **arguments,
        "market": statement.market_id,
        "source": {
            "chatId": str(statement.chat_id),
            "messageId": statement.message_id,
            "excerpt": quote,
        },
    }


_QUOTE_DESCRIPTION = (
    "Copy a verbatim excerpt from the current executive statement. "
    "The text must be character-for-character identical to a contiguous substring "
    "of the source message — do not paraphrase, summarise, or alter it in any way."
)


def fact_preparation_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """The runtime supplies source and market; the model chooses only the change and quote."""
    properties: dict[str, Any] = {
        key: value
        for key, value in schema.get("properties", {}).items()
        if key not in {"source", "market"}
    }
    if "quote" in properties:
        properties["quote"] = {**properties["quote"], "description": _QUOTE_DESCRIPTION}
    return {
        **schema,
        "properties": properties,
        "required": [
            key for key in schema.get("required", []) if key not in {"source", "market"}
        ],
    }
