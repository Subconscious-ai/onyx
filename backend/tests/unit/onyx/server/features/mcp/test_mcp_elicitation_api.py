"""The signed-in user's HTTP answer to an MCP approval card."""

import json
from types import SimpleNamespace
from typing import Any, cast
from uuid import uuid4

import pytest

from onyx.error_handling.exceptions import OnyxError
from onyx.server.features.mcp import api
from onyx.server.features.mcp.elicitation import _answer_key, _request_key
from tests.unit.onyx.server.features.mcp.mcp_fake_redis import FakeRedis

APPROVAL_ID = "0123456789abcdef0123456789abcdef"


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
    _pending(redis, APPROVAL_ID, str(user.id))

    api.answer_mcp_elicitation(
        APPROVAL_ID, api.MCPElicitationAnswer(decision="approve"), user
    )

    assert redis.get(_answer_key(APPROVAL_ID)) == "approve"


def test_another_user_gets_not_found_and_records_nothing(redis: FakeRedis) -> None:
    _pending(redis, APPROVAL_ID, str(uuid4()))

    with pytest.raises(OnyxError) as error:
        api.answer_mcp_elicitation(
            APPROVAL_ID, api.MCPElicitationAnswer(decision="approve"), _user()
        )

    assert error.value.status_code == 404
    assert redis.get(_answer_key(APPROVAL_ID)) is None


@pytest.mark.usefixtures("redis")
def test_an_expired_approval_is_not_found() -> None:
    with pytest.raises(OnyxError) as error:
        api.answer_mcp_elicitation(
            "gone", api.MCPElicitationAnswer(decision="approve"), _user()
        )

    assert error.value.status_code == 404


def test_a_second_answer_is_a_conflict(redis: FakeRedis) -> None:
    user = _user()
    _pending(redis, APPROVAL_ID, str(user.id))
    api.answer_mcp_elicitation(
        APPROVAL_ID, api.MCPElicitationAnswer(decision="decline"), user
    )

    with pytest.raises(OnyxError) as error:
        api.answer_mcp_elicitation(
            APPROVAL_ID, api.MCPElicitationAnswer(decision="approve"), user
        )

    assert error.value.status_code == 409
    assert redis.get(_answer_key(APPROVAL_ID)) == "decline"


def test_only_approve_or_decline_are_accepted() -> None:
    with pytest.raises(ValueError):
        api.MCPElicitationAnswer(decision=cast(Any, "maybe"))


def test_the_run_status_route_reads_through_the_run_status_module(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from uuid import UUID

    from onyx.server.features.mcp.experiment_run import ExperimentRunStatus

    seen: dict[str, Any] = {}

    def read(_db: Any, user: Any, chat_session_id: UUID, run_id: str) -> Any:
        seen.update(user=user, chat_session_id=chat_session_id, run_id=run_id)
        return ExperimentRunStatus(
            run_id=run_id, status="running", terminal=False, successful=None
        )

    monkeypatch.setattr(api, "get_experiment_run_status", read)
    user, session_id = _user(), uuid4()

    result = api.read_experiment_run("run1", session_id, cast(Any, object()), user)

    assert result.status == "running"
    assert seen["run_id"] == "run1"
    assert seen["chat_session_id"] == session_id
    assert seen["user"] is user
