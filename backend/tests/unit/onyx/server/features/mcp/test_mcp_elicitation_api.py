"""The signed-in user's HTTP answer to an MCP approval card."""

import json
from types import SimpleNamespace
from typing import Any, cast
from uuid import uuid4

import pytest

from onyx.error_handling.exceptions import OnyxError
from onyx.server.features.mcp import api
from onyx.server.features.mcp.elicitation import _request_key
from tests.unit.onyx.server.features.mcp.mcp_fake_redis import FakeRedis


@pytest.fixture
def redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    fake = FakeRedis()
    monkeypatch.setattr(api, "get_redis_client", lambda: fake)
    return fake


def _pending(redis: FakeRedis, approval_id: str, owner: str) -> None:
    redis.set(_request_key(approval_id), json.dumps({"user_id": owner}))


def _user() -> Any:
    return SimpleNamespace(id=uuid4())


def test_the_owner_approves_and_the_answer_is_recorded(redis: FakeRedis) -> None:
    user = _user()
    _pending(redis, "a1", str(user.id))

    api.answer_mcp_elicitation("a1", api.MCPElicitationAnswer(decision="approve"), user)

    assert redis.get("mcp_elicitation:a1:answer") == "approve"


def test_another_user_gets_not_found_and_records_nothing(redis: FakeRedis) -> None:
    _pending(redis, "a1", str(uuid4()))

    with pytest.raises(OnyxError) as error:
        api.answer_mcp_elicitation(
            "a1", api.MCPElicitationAnswer(decision="approve"), _user()
        )

    assert error.value.status_code == 404
    assert redis.get("mcp_elicitation:a1:answer") is None


@pytest.mark.usefixtures("redis")
def test_an_expired_approval_is_not_found() -> None:
    with pytest.raises(OnyxError) as error:
        api.answer_mcp_elicitation(
            "gone", api.MCPElicitationAnswer(decision="approve"), _user()
        )

    assert error.value.status_code == 404


def test_a_second_answer_is_a_conflict(redis: FakeRedis) -> None:
    user = _user()
    _pending(redis, "a1", str(user.id))
    api.answer_mcp_elicitation("a1", api.MCPElicitationAnswer(decision="decline"), user)

    with pytest.raises(OnyxError) as error:
        api.answer_mcp_elicitation(
            "a1", api.MCPElicitationAnswer(decision="approve"), user
        )

    assert error.value.status_code == 409
    assert redis.get("mcp_elicitation:a1:answer") == "decline"


def test_only_approve_or_decline_are_accepted() -> None:
    with pytest.raises(ValueError):
        api.MCPElicitationAnswer(decision=cast(Any, "maybe"))
