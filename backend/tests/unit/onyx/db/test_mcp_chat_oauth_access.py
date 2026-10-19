from types import SimpleNamespace
from typing import cast
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from onyx.db import mcp
from onyx.db.models import User


@pytest.mark.parametrize(
    ("enabled", "deleted", "server_id", "attached", "visible", "expected"),
    [
        (True, False, 42, True, True, True),
        (False, False, 42, True, True, False),
        (True, True, 42, True, True, False),
        (True, False, 99, True, True, False),
        (True, False, 42, False, True, False),
        (True, False, 42, True, False, False),
    ],
    ids=[
        "shared-viewer",
        "disabled-tool",
        "deleted-agent",
        "other-server",
        "unattached",
        "private-agent",
    ],
)
def test_attached_oauth_respects_current_agent_and_tool_access(
    monkeypatch: pytest.MonkeyPatch,
    enabled: bool,
    deleted: bool,
    server_id: int,
    attached: bool,
    visible: bool,
    expected: bool,
) -> None:
    # Execute the real native join/filter without creating the full Onyx database.
    engine = create_engine("sqlite://")
    can_view = MagicMock(return_value=visible)
    monkeypatch.setattr(mcp, "user_can_access_persona", can_view)
    user = cast(User, SimpleNamespace())
    with Session(engine) as db:
        db.execute(
            text("CREATE TABLE persona (id INTEGER PRIMARY KEY, deleted BOOLEAN)")
        )
        db.execute(
            text(
                "CREATE TABLE tool (id INTEGER PRIMARY KEY, enabled BOOLEAN, mcp_server_id INTEGER)"
            )
        )
        db.execute(
            text("CREATE TABLE persona__tool (persona_id INTEGER, tool_id INTEGER)")
        )
        db.execute(
            text("INSERT INTO persona VALUES (7, :deleted)"), {"deleted": deleted}
        )
        db.execute(
            text("INSERT INTO tool VALUES (1, :enabled, :server_id)"),
            {"enabled": enabled, "server_id": server_id},
        )
        if attached:
            db.execute(text("INSERT INTO persona__tool VALUES (7, 1)"))
        assert mcp.user_can_authenticate_attached_mcp_server(user, 42, db) is expected
        if attached and enabled and not deleted and server_id == 42:
            can_view.assert_called_once_with(db, 7, user)
        else:
            can_view.assert_not_called()
    engine.dispose()
