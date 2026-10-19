"""Page hints are data. Only the KB's verified response supplies authority."""

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CauslActor(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    org_id: str = Field(alias="orgId", min_length=1, max_length=120)
    user_id: str = Field(alias="userId", min_length=1, max_length=512)


class CauslRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: str = Field(min_length=1, max_length=120)
    id: str = Field(min_length=1, max_length=500)


class CauslSelection(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    page: Literal["workspace", "library", "models", "reports"]
    market_id: str | None = Field(
        alias="marketId", default=None, min_length=1, max_length=500
    )
    record: CauslRecord | None = None
    run_id: str | None = Field(
        alias="runId", default=None, min_length=1, max_length=500
    )
    studio_id: UUID | None = Field(alias="studioId", default=None)

    def query(self) -> dict[str, str]:
        query = {"page": self.page}
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
    mode: Literal["workspace", "interview"] = "workspace"


class CauslWorkspaceResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    chat_id: UUID = Field(alias="chatId")
    agent_id: int = Field(alias="agentId")
    scope_key: str = Field(alias="scopeKey")
    context_digest: str = Field(alias="contextDigest")
