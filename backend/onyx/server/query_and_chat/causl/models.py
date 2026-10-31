"""Page hints are data. Only the KB's verified response supplies authority."""

from typing import Any, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ColossusPageSnapshot(BaseModel):
    """Versioned browser view hints. Identity and service reads remain server-owned."""

    model_config = ConfigDict(extra="forbid")
    version: Literal[1]
    revision: int = Field(ge=0)
    map_view: dict[str, Any]
    selected_place: dict[str, Any]
    layers: dict[str, Any]
    filters: dict[str, Any]
    dates: dict[str, Any]
    visible_results: dict[str, Any]
    evidence_links: dict[str, Any]
    omissions: list[dict[str, Any]] = Field(max_length=100)
    privacy: Literal["Browser-local overlays excluded"]

    @model_validator(mode="after")
    def bounded(self) -> Self:
        if len(self.model_dump_json().encode("utf-8")) > 64_000:
            raise ValueError("Colossus context exceeds 64,000 UTF-8 bytes")
        return self


class CauslActor(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    org_id: str = Field(alias="orgId", min_length=1, max_length=120)
    user_id: str = Field(alias="userId", min_length=1, max_length=512)


class CauslIdentityResponse(BaseModel):
    actor: CauslActor
    issuer: str = Field(min_length=1, max_length=2048)


class CauslRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: str = Field(min_length=1, max_length=120)
    id: str = Field(min_length=1, max_length=500)


class CauslSelection(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    page: Literal["workspace", "library", "models", "reports", "colossus"]
    snapshot: ColossusPageSnapshot | None = None
    market_id: str | None = Field(
        alias="marketId", default=None, min_length=1, max_length=500
    )
    record: CauslRecord | None = None
    run_id: str | None = Field(
        alias="runId", default=None, min_length=1, max_length=500
    )
    studio_id: UUID | None = Field(alias="studioId", default=None)

    @model_validator(mode="after")
    def page_contract(self) -> Self:
        if self.page == "colossus":
            if self.snapshot is None or any(
                (self.market_id, self.record, self.run_id, self.studio_id)
            ):
                raise ValueError(
                    "Colossus requires a snapshot without KB record selectors"
                )
        elif self.snapshot is not None:
            raise ValueError("Only Colossus accepts a page snapshot")
        return self

    def query(self) -> dict[str, str]:
        # The existing per-user Library grant verifies identity and organization.
        # Browser geography hints never become KB retrieval or tenant selectors.
        query = {"page": "workspace" if self.page == "colossus" else self.page}
        if self.market_id:
            query["market"] = self.market_id
        if self.record:
            query.update(recordType=self.record.type, record=self.record.id)
        if self.run_id:
            query["run"] = self.run_id
        if self.studio_id:
            query["studio"] = str(self.studio_id)
        return query


class CauslWorkspaceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    actor: CauslActor
    selection: CauslSelection
    chat_id: UUID | None = Field(alias="chatId", default=None)


class CauslContextEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    actor: CauslActor
    issuer: str = Field(min_length=1, max_length=2048)
    context: dict[str, Any]


class CauslChatBinding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: UUID
    actor: CauslActor
    issuer: str
    market_id: str | None
    chat_id: UUID
    selection: CauslSelection
    library_server_id: int
    mode: Literal["workspace", "interview", "colossus"] = "workspace"
    brief_digest: str | None = None


class CauslWorkspaceResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    chat_id: UUID = Field(alias="chatId")
    agent_id: int = Field(alias="agentId")
    scope_key: str = Field(alias="scopeKey")
    context_digest: str = Field(alias="contextDigest")
