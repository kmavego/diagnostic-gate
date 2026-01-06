from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

try:
    # pydantic v2
    from pydantic import ConfigDict  # type: ignore
except Exception:  # pragma: no cover
    ConfigDict = None  # type: ignore


class _ForbidExtraBaseModel(BaseModel):
    # additionalProperties: false
    if ConfigDict is not None:  # pydantic v2
        model_config = ConfigDict(extra="forbid")
    else:  # pydantic v1 fallback
        class Config:
            extra = "forbid"


# -----------------------------
# List (summary)
# -----------------------------
class AuditSubmissionSummary(_ForbidExtraBaseModel):
    submission_id: str = Field(..., min_length=1)
    project_id: str = Field(..., min_length=1)
    created_at: datetime

    decision: str = Field(..., min_length=1)

    gate_id: str = Field(..., min_length=1)
    gate_version: str = Field(..., min_length=1)

    state_before: Optional[str] = Field(default=None)
    state_after: Optional[str] = Field(default=None)


class AuditSubmissionListResponse(_ForbidExtraBaseModel):
    items: List[AuditSubmissionSummary] = Field(default_factory=list)
    next_cursor: Optional[str] = Field(
        default=None,
        description="Opaque pagination cursor. Null when there are no more pages.",
    )


# -----------------------------
# Detail (immutable protocol)
# -----------------------------
class AuditEvaluateRequestSnapshot(_ForbidExtraBaseModel):
    artifacts: Dict[str, Any] = Field(default_factory=dict)


class AuditError(_ForbidExtraBaseModel):
    code: str = Field(..., min_length=1)
    path: str = Field(..., min_length=1)

    message: Optional[str] = Field(default=None)
    meta: Optional[Dict[str, Any]] = Field(default=None)


class AuditEvaluateResultSnapshot(_ForbidExtraBaseModel):
    decision: str = Field(..., min_length=1)

    project_state: Optional[str] = Field(default=None)
    next_state: Optional[str] = Field(default=None)
    current_gate_id: Optional[str] = Field(default=None)
    current_gate_version: Optional[str] = Field(default=None)

    errors: List[AuditError] = Field(default_factory=list)


class AuditImmutability(_ForbidExtraBaseModel):
    is_immutable: bool = Field(True)
    stored_at: datetime


class AuditSubmissionDetail(_ForbidExtraBaseModel):
    submission_id: str = Field(..., min_length=1)
    project_id: str = Field(..., min_length=1)
    created_at: datetime

    gate_id: str = Field(..., min_length=1)
    gate_version: str = Field(..., min_length=1)

    state_before: Optional[str] = Field(default=None)
    state_after: Optional[str] = Field(default=None)

    request: AuditEvaluateRequestSnapshot
    result: AuditEvaluateResultSnapshot
    immutability: AuditImmutability

