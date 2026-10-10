"""Prove native chat and scope associations in the same Postgres transaction."""

from collections.abc import Generator
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from onyx.db import causl_workspace
from onyx.db.causl_workspace import open_causl_chat, read_causl_binding
from onyx.db.models import ChatSession, EncryptedKeyValueStore, Persona, User
from onyx.error_handling.exceptions import OnyxError
from onyx.server.query_and_chat.causl.models import CauslActor, CauslSelection

ISSUER = "https://auth.example/"


@pytest.fixture
def workspace(
    db_session: Session,
) -> Generator[tuple[Session, User, Persona, CauslActor], None, None]:
    user = User(
        id=uuid4(),
        email=f"workspace-{uuid4()}@example.test",
        hashed_password="unused",
        effective_permissions=[],
    )
    persona = Persona(
        name=f"Workspace {uuid4()}",
        description="Workspace test agent",
        system_prompt="Use accepted KB facts",
        is_public=True,
        is_listed=True,
    )
    db_session.add_all([user, persona])
    db_session.commit()
    actor = CauslActor(org_id=f"org_{uuid4().hex}", user_id=f"auth0|{uuid4()}")
    yield db_session, user, persona, actor
    db_session.rollback()
    chats = list(
        db_session.scalars(select(ChatSession).where(ChatSession.user_id == user.id))
    )
    for chat in chats:
        binding = read_causl_binding(db_session, user.id, chat.id)
        if binding is not None:
            keys = [
                f"causl:chat:{chat.id}",
                causl_workspace._scope_key(
                    user.id, binding.actor, binding.issuer, binding.market_id
                ),
            ]
            db_session.execute(
                delete(EncryptedKeyValueStore).where(
                    EncryptedKeyValueStore.key.in_(keys)
                )
            )
        db_session.execute(delete(ChatSession).where(ChatSession.id == chat.id))
    db_session.execute(delete(Persona).where(Persona.id == persona.id))
    db_session.execute(delete(User).where(User.__table__.c.id == user.id))
    db_session.commit()


def test_reload_and_navigation_restore_one_owned_chat_with_current_page(
    workspace: tuple[Session, User, Persona, CauslActor],
) -> None:
    db, user, persona, actor = workspace
    first = open_causl_chat(
        db,
        user,
        actor,
        ISSUER,
        CauslSelection(page="models", market_id="market_b"),
        persona.id,
        22,
    )
    second = open_causl_chat(
        db,
        user,
        actor,
        ISSUER,
        CauslSelection(page="library", market_id="market_b"),
        persona.id,
        22,
    )
    assert first.chat_id == second.chat_id
    reloaded = read_causl_binding(db, user.id, second.chat_id)
    assert reloaded is not None and reloaded.selection.page == "library"
    with Session(db.get_bind(), expire_on_commit=False) as independent:
        restored = open_causl_chat(
            independent,
            user,
            actor,
            ISSUER,
            CauslSelection(page="reports", market_id="market_b"),
            persona.id,
            22,
        )
        assert restored.chat_id == first.chat_id


def test_market_and_organization_switch_never_adopt_previous_history(
    workspace: tuple[Session, User, Persona, CauslActor],
) -> None:
    db, user, persona, actor = workspace
    first = open_causl_chat(
        db,
        user,
        actor,
        ISSUER,
        CauslSelection(page="models", market_id="market_a"),
        persona.id,
        22,
    )
    switched = open_causl_chat(
        db,
        user,
        actor,
        ISSUER,
        CauslSelection(page="models", market_id="market_b"),
        persona.id,
        22,
    )
    assert switched.chat_id != first.chat_id
    with pytest.raises(OnyxError):
        open_causl_chat(
            db,
            user,
            actor,
            ISSUER,
            CauslSelection(page="library", market_id="market_b"),
            persona.id,
            22,
            first.chat_id,
        )
    db.rollback()
    with pytest.raises(OnyxError):
        open_causl_chat(
            db,
            user,
            CauslActor(org_id="org_other", user_id=actor.user_id),
            ISSUER,
            CauslSelection(page="models", market_id="market_a"),
            persona.id,
            22,
            first.chat_id,
        )


def test_binding_failure_does_not_commit_an_orphan_chat(
    workspace: tuple[Session, User, Persona, CauslActor],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db, user, persona, actor = workspace

    def fail_write(*_args: object) -> None:
        raise RuntimeError("test write interrupted")

    monkeypatch.setattr(causl_workspace, "_write", fail_write)
    with pytest.raises(RuntimeError, match="test write interrupted"):
        open_causl_chat(
            db,
            user,
            actor,
            ISSUER,
            CauslSelection(page="models", market_id="interrupted"),
            persona.id,
            22,
        )
    db.rollback()
    assert (
        list(db.scalars(select(ChatSession).where(ChatSession.user_id == user.id)))
        == []
    )


def test_concurrent_open_does_not_create_duplicate_conversations(
    workspace: tuple[Session, User, Persona, CauslActor],
) -> None:
    db, user, persona, actor = workspace

    def opened() -> str:
        with Session(db.get_bind(), expire_on_commit=False) as connection:
            return str(
                open_causl_chat(
                    connection,
                    user,
                    actor,
                    ISSUER,
                    CauslSelection(page="models", market_id="concurrent"),
                    persona.id,
                    22,
                ).chat_id
            )

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: opened(), range(2)))
    assert results[0] == results[1]
    assert (
        len(list(db.scalars(select(ChatSession).where(ChatSession.user_id == user.id))))
        == 1
    )
