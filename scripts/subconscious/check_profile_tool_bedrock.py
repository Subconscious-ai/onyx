"""Opt-in native-runtime smoke: real Bedrock and synthetic Postgres profile only.

This proves tool selection and persistence, not hosted login or chat streaming.
Public research is disabled for these artificial companies. No accounts are created.
"""

import json
from unittest.mock import MagicMock, patch
from uuid import uuid4

from onyx.db.burn2_profile import read_profile
from onyx.db.encrypted_kv_store import delete_encrypted_kv
from onyx.db.engine.sql_engine import SqlEngine
from onyx.key_value_store.interface import KvKeyNotFoundError
from onyx.llm.factory import get_llm_for_contextual_rag
from onyx.llm.models import (
    AssistantMessage,
    ChatCompletionMessage,
    ToolCall,
    ToolMessage,
    UserMessage,
)
from onyx.server.query_and_chat.placement import Placement
from onyx.tools.models import ToolCallException
from onyx.tools.tool_implementations.company_profile.company_profile_tool import (
    CompanyProfileTool,
)


def main() -> None:
    SqlEngine.init_engine(pool_size=2, max_overflow=0)
    llm = get_llm_for_contextual_rag(8)
    assert "bedrock" in llm.config.model_provider and "gpt-oss" in llm.config.model_name
    cases = [
        ("Correct my company to Northstar Test.", {"company": "Northstar Test"}),
        (
            "Correct my product to scheduling software and customer segment to operations managers.",
            {
                "product": "scheduling software",
                "customer_segment": "operations managers",
            },
        ),
    ]
    for message, expected in cases:
        owner = uuid4()
        tool = CompanyProfileTool(tool_id=123, user_id=owner, emitter=MagicMock())
        history: list[ChatCompletionMessage] = [UserMessage(content=message)]
        try:
            for index in range(3):
                response = llm.invoke(
                    history,
                    tools=[tool.tool_definition()],
                    max_tokens=1024,
                    timeout_override=45,
                )
                calls = response.choice.message.tool_calls or []
                assert calls, (
                    "No profile action before the requested correction was saved"
                )
                history.append(
                    AssistantMessage(
                        content=response.choice.message.content,
                        tool_calls=[
                            ToolCall.model_validate(c.model_dump()) for c in calls
                        ],
                    )
                )
                for call in calls:
                    assert call.function.name == tool.name
                    assert call.function.arguments is not None
                    with patch(
                        "onyx.server.query_and_chat.burn2.background.ensure_research",
                        return_value={"status": "disabled"},
                    ):
                        try:
                            result = tool.run(
                                Placement(turn_index=index),
                                None,
                                **json.loads(call.function.arguments),
                            )
                            content = result.llm_facing_response
                        except ToolCallException as error:
                            content = error.llm_facing_message
                            print(f"Synthetic tool refusal: {content}")
                    history.append(ToolMessage(content=content, tool_call_id=call.id))
                saved = read_profile(owner)
                if saved["correction"]["revision"]:
                    assert saved["correction"]["revision"] == 1
                    assert saved["correction"]["fields"] == expected, saved[
                        "correction"
                    ]["fields"]
                    break
            else:
                raise AssertionError("Profile was not saved within three tool rounds")
        finally:
            key = f"burn2:profile-correction:{owner}"
            revisions = read_profile(owner)["correction"]["revision"]
            for owned_key in [
                key,
                *(f"{key}:revision:{i}" for i in range(1, revisions + 1)),
            ]:
                try:
                    delete_encrypted_kv(owned_key)
                except KvKeyNotFoundError:
                    pass
    print(
        "PASS: two real Bedrock conversations saved and reloaded exact synthetic corrections. Test keys removed."
    )


if __name__ == "__main__":
    main()
