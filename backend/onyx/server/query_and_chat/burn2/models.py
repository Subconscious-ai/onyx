from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

ProfileField = Literal[
    "name", "role", "company", "industry", "website", "product", "customer_segment"
]
ProfileText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class ProfileCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    revision: int = Field(ge=0)
    fields: dict[ProfileField, ProfileText] = Field(min_length=1, max_length=7)


class ProfileToolRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    operation: Literal["read", "update"]
    revision: int | None = Field(default=None, ge=0)
    fields: dict[ProfileField, ProfileText] | None = Field(
        default=None, min_length=1, max_length=7
    )
