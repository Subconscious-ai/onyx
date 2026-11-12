from uuid import uuid4

import httpx
import pytest

from onyx.auth.host_auth import HostSession
from onyx.auth.session_identity import SessionIdentity
from onyx.error_handling.exceptions import OnyxError
from onyx.server.query_and_chat.causl.twenty import authorize_twenty_context


def test_context_exchange_refuses_another_subject(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TWENTY_PANEL_ORIGIN", "https://twenty.example.com")
    user_id = uuid4()
    session = HostSession(
        identity=SessionIdentity(
            native_user_id=user_id,
            issuer="https://auth.example.com/",
            subject="auth0|alice",
        ),
        organization_id="org_1",
        access_token="short-lived",
    )

    def respond(request: httpx.Request) -> httpx.Response:
        assert (
            str(request.url)
            == "https://twenty.example.com/rest/ai/shared-panel/personal-authorize"
        )
        assert request.headers["authorization"] == "Bearer short-lived"
        return httpx.Response(
            200,
            json={
                "workspaceId": str(uuid4()),
                "workspaceMemberId": str(uuid4()),
                "userWorkspaceId": str(uuid4()),
                "sources": [],
                "subject": "auth0|bob",
                "issuer": "https://auth.example.com/",
                "orgId": "org_1",
                "recordOrigin": "https://twenty.example.com",
            },
        )

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(OnyxError):
            authorize_twenty_context(
                session, {"contextId": str(uuid4())}, client=client
            )


@pytest.mark.parametrize("status", [200, 403, 302])
def test_history_reauthorizes_source_references(
    monkeypatch: pytest.MonkeyPatch, status: int
) -> None:
    monkeypatch.setenv("TWENTY_PANEL_ORIGIN", "https://twenty.example.com")
    session = HostSession(
        identity=SessionIdentity(
            native_user_id=uuid4(),
            issuer="https://auth.example.com/",
            subject="auth0|alice",
        ),
        organization_id="org_1",
        access_token="memory-only",
    )
    scope = {
        "workspaceId": str(uuid4()),
        "workspaceMemberId": str(uuid4()),
        "userWorkspaceId": str(uuid4()),
        "sources": [
            {
                "objectNameSingular": "company",
                "fieldNames": ["id", "name"],
                "recordIds": [str(uuid4())],
                "records": [],
                "recordLimit": 25,
            }
        ],
    }

    def respond(request: httpx.Request) -> httpx.Response:
        import json

        assert json.loads(request.content) == scope
        return httpx.Response(
            status,
            json={
                **scope,
                "subject": "auth0|alice",
                "issuer": "https://auth.example.com/",
                "orgId": "org_1",
                "recordOrigin": "https://twenty.example.com",
            },
            headers={"location": "https://foreign.example"},
        )

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        if status == 200:
            assert (
                authorize_twenty_context(session, scope, client=client).references()
                == scope
            )
        else:
            with pytest.raises(OnyxError):
                authorize_twenty_context(session, scope, client=client)


def test_successive_contexts_keep_their_records_and_source_links(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from onyx.prompts.twenty import twenty_prompt

    monkeypatch.setenv("TWENTY_PANEL_ORIGIN", "https://twenty.example.com")
    session = HostSession(
        identity=SessionIdentity(
            native_user_id=uuid4(),
            issuer="https://auth.example.com/",
            subject="auth0|alice",
        ),
        organization_id="org_1",
        access_token="memory-only",
    )
    ids = {str(uuid4()): str(uuid4()) for _ in range(2)}

    def respond(request: httpx.Request) -> httpx.Response:
        import json

        record = ids[json.loads(request.content)["contextId"]]
        return httpx.Response(
            200,
            json={
                "workspaceId": str(uuid4()),
                "workspaceMemberId": str(uuid4()),
                "userWorkspaceId": str(uuid4()),
                "sources": [
                    {
                        "objectNameSingular": "company",
                        "fieldNames": ["id", "name"],
                        "recordIds": [record],
                        "records": [{"id": record, "name": record}],
                        "recordLimit": 25,
                    }
                ],
                "subject": "auth0|alice",
                "issuer": "https://auth.example.com/",
                "orgId": "org_1",
                "recordOrigin": "https://twenty.example.com",
            },
        )

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        contexts = [
            authorize_twenty_context(session, {"contextId": context_id}, client=client)
            for context_id in ids
        ]
    for context, record_id in zip(contexts, ids.values(), strict=True):
        assert (
            f"https://twenty.example.com/object/company/{record_id}"
            in twenty_prompt(context)
        )
        assert context.sources[0].records[0]["id"] == record_id


def test_sharing_rechecks_binding_after_an_inflight_context_bind(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from types import SimpleNamespace
    from unittest.mock import MagicMock

    from sqlalchemy.orm import Session

    from onyx.db import chat as chat_store
    from onyx.db import twenty_panel
    from onyx.db.enums import ChatSessionSharedStatus

    chat = SimpleNamespace(
        id=uuid4(), deleted=False, shared_status=ChatSessionSharedStatus.PRIVATE
    )
    db = MagicMock(spec=Session)
    binding_committed = False

    def finish_context_bind(*_args: object, **_kwargs: object) -> None:
        nonlocal binding_committed
        binding_committed = True

    db.refresh.side_effect = finish_context_bind
    monkeypatch.setattr(chat_store, "get_chat_session_by_id", lambda **_kwargs: chat)
    monkeypatch.setattr(
        twenty_panel,
        "read_twenty_binding",
        lambda *_args: object() if binding_committed else None,
    )

    with pytest.raises(OnyxError):
        chat_store.update_chat_session(
            db, uuid4(), chat.id, sharing_status=ChatSessionSharedStatus.PUBLIC
        )

    assert chat.shared_status == ChatSessionSharedStatus.PRIVATE
    db.commit.assert_not_called()


def test_twenty_tools_keep_attachment_reading_and_block_export_paths() -> None:
    from onyx.db.models import Tool
    from onyx.server.query_and_chat.causl.twenty import twenty_read_only_tool_ids
    from onyx.tools.constants import FILE_READER_TOOL_ID, SEARCH_TOOL_ID

    tools = [
        Tool(id=1, in_code_tool_id=FILE_READER_TOOL_ID),
        Tool(id=2, in_code_tool_id=SEARCH_TOOL_ID),
        Tool(id=3, in_code_tool_id="PythonTool"),
        Tool(id=4, in_code_tool_id="ImageGenerationTool"),
        Tool(id=5, in_code_tool_id=None),
        Tool(id=6, in_code_tool_id="MemoryTool"),
    ]
    assert twenty_read_only_tool_ids(tools, None, None) == [1, 2]
    assert twenty_read_only_tool_ids(tools, [1, 3], None) == [1]
    for tool_id in (3, 4, 5, 6):
        with pytest.raises(OnyxError):
            twenty_read_only_tool_ids(tools, None, tool_id)


def test_history_checks_run_concurrently_after_releasing_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from threading import Barrier
    from unittest.mock import MagicMock

    from sqlalchemy.engine import Connection
    from sqlalchemy.orm import Session

    from onyx.db import twenty_panel
    from onyx.db.enums import ChatSessionSharedStatus
    from onyx.db.models import ChatSession
    from onyx.error_handling.error_codes import OnyxErrorCode
    from onyx.server.query_and_chat.causl.models import TwentyContext

    user_id = uuid4()
    chats = [
        ChatSession(
            id=uuid4(), user_id=user_id, shared_status=ChatSessionSharedStatus.PRIVATE
        )
        for _ in range(4)
    ]
    ordinary = ChatSession(id=uuid4(), user_id=user_id)
    context = TwentyContext(
        workspaceId=uuid4(),
        workspaceMemberId=uuid4(),
        userWorkspaceId=uuid4(),
        sources=[],
        subject="alice",
        issuer="https://auth.example/",
        orgId="org_1",
        recordOrigin="https://twenty.example",
    )
    db = MagicMock(spec=Session)
    connection = MagicMock(spec=Connection)
    db.get_bind.return_value = connection
    monkeypatch.setattr(
        twenty_panel,
        "read_twenty_binding",
        lambda _db, chat_id: None if chat_id == ordinary.id else context,
    )
    monkeypatch.setattr(
        twenty_panel, "require_twenty_session", lambda _user_id: object()
    )
    barrier = Barrier(4)

    def deny(*_args: object, **_kwargs: object) -> None:
        db.close.assert_called_once()
        connection.close.assert_called_once()
        barrier.wait(timeout=2)
        raise OnyxError(OnyxErrorCode.UNAUTHORIZED)

    monkeypatch.setattr(twenty_panel, "authorize_twenty_context", deny)
    assert twenty_panel.filter_twenty_chats(db, user_id, chats + [ordinary]) == [
        ordinary
    ]


def test_context_exchange_rejects_a_slow_stream(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from onyx.server.query_and_chat.causl import twenty

    monkeypatch.setenv("TWENTY_PANEL_ORIGIN", "https://twenty.example.com")
    times = iter((0, 0, 16))
    monkeypatch.setattr(twenty, "monotonic", lambda: next(times))
    session = HostSession(
        identity=SessionIdentity(
            native_user_id=uuid4(), issuer="https://auth.example.com/", subject="alice"
        ),
        organization_id="org_1",
        access_token="memory-only",
    )
    with httpx.Client(
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(200, content=b"{}")
        )
    ) as client:
        with pytest.raises(OnyxError, match="Twenty record access is unavailable"):
            authorize_twenty_context(
                session, {"contextId": str(uuid4())}, client=client
            )
