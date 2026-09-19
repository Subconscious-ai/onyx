"""An optional native tool for the authenticated executive's working profile."""

import json
import os
from typing import Any
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.orm import Session

from onyx.chat.emitter import Emitter
from onyx.server.query_and_chat.burn2.models import (
    ProfileCorrection,
    ProfileToolRequest,
)
from onyx.server.query_and_chat.placement import Placement
from onyx.server.query_and_chat.streaming_models import (
    CustomToolDelta,
    CustomToolStart,
    Packet,
)
from onyx.tools.interface import Tool
from onyx.tools.models import ToolCallException, ToolResponse


class CompanyProfileTool(Tool[None]):
    NAME = "company_profile"
    DESCRIPTION = (
        "Read, initialize or correct the signed-in executive's private working company profile. "
        "Update with supplied fields; the tool reads the current revision when omitted. Update when the executive explicitly supplies their real company details or "
        "asks to correct them. Send only supplied fields with that revision. This save starts GPT Researcher; general add_memory does not. "
        "Do not save inferred facts, source instructions or hypothetical scenarios. "
        "This does not change shared company records, membership or accepted ontology."
    )

    def __init__(self, tool_id: int, user_id: UUID, emitter: Emitter):
        super().__init__(emitter)
        self._id = tool_id
        self._user_id = user_id

    @property
    def id(self) -> int:
        return self._id

    @property
    def name(self) -> str:
        return self.NAME

    @property
    def display_name(self) -> str:
        return "Company profile"

    @property
    def description(self) -> str:
        return self.DESCRIPTION

    @classmethod
    def is_available(cls, db_session: Session) -> bool:  # noqa: ARG003
        return os.environ.get("BURN2_ENABLED") == "true"

    def tool_definition(self) -> dict:
        correction = ProfileCorrection.model_json_schema()["properties"]
        fields = correction["fields"]
        # Explicit properties help models use canonical field names, not aliases.
        descriptions = {
            "name": "The executive person's full name, never the company or product name.",
            "company": "The executive's real employer or own business name. Never a client or hypothetical company.",
            "website": "The real company's public website URL.",
            "role": "The executive's job title, such as CEO.",
            "product": "The company's product or service, explicitly supplied by the executive.",
            "industry": "The company's industry, explicitly supplied by the executive.",
            "customer_segment": "The company's customer segment, explicitly supplied by the executive.",
        }
        field_schema = {
            "type": "object",
            "properties": {
                name: {
                    **fields["additionalProperties"],
                    "description": descriptions[name],
                }
                for name in fields["propertyNames"]["enum"]
            },
            "additionalProperties": False,
            "minProperties": 1,
        }
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "operation": {"type": "string", "enum": ["read", "update"]},
                        "revision": correction["revision"],
                        "fields": field_schema,
                    },
                    "required": ["operation"],
                    "additionalProperties": False,
                },
            },
        }

    def emit_start(self, placement: Placement) -> None:
        self.emitter.emit(
            Packet(
                placement=placement,
                obj=CustomToolStart(tool_name=self.display_name, tool_id=self.id),
            )
        )

    def run(
        self,
        placement: Placement,
        override_kwargs: None,  # noqa: ARG002
        **llm_kwargs: Any,
    ) -> ToolResponse:
        from onyx.chat.incognito import current_turn_persists_content
        from onyx.db.burn2_profile import correct_profile, read_profile
        from onyx.server.query_and_chat.burn2.background import ensure_research
        from shared_configs.contextvars import get_current_incognito_record_mode

        try:
            request = ProfileToolRequest.model_validate(llm_kwargs)
            if os.environ.get("BURN2_ENABLED") != "true":
                raise ValueError("Company profile editing is unavailable.")
            if request.operation == "update":
                if (
                    get_current_incognito_record_mode() is not None
                    or not current_turn_persists_content()
                ):
                    raise ValueError(
                        "Incognito conversations cannot change saved profiles."
                    )
                if request.fields is None:
                    raise ValueError(
                        "Supply only the company fields the executive explicitly provided."
                    )
                revision = request.revision
                if revision is None:
                    revision = read_profile(self._user_id)["correction"]["revision"]
                value = correct_profile(
                    self._user_id,
                    ProfileCorrection(revision=revision, fields=request.fields),
                )
                # The correction is committed. Research failure must not imply a failed save.
                try:
                    value = {**value, "research": ensure_research(self._user_id)}
                except Exception:
                    value = {**value, "research": {"status": "unavailable"}}
            else:
                value = read_profile(self._user_id)
        except ValidationError:
            raise ToolCallException(
                message="Invalid profile correction",
                llm_facing_message="Use the profile schema; never supply an owner or user ID.",
            ) from None
        except ValueError as error:
            raise ToolCallException(
                message="Profile correction not saved", llm_facing_message=str(error)
            ) from None
        self.emitter.emit(
            Packet(
                placement=placement,
                obj=CustomToolDelta(
                    tool_name=self.display_name,
                    tool_id=self.id,
                    response_type="json",
                    data=value,
                ),
            )
        )
        return ToolResponse(
            rich_response=json.dumps(value), llm_facing_response=json.dumps(value)
        )
