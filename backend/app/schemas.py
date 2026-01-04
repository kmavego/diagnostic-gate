from __future__ import annotations

from typing import Any, Dict, Optional, Literal

from pydantic import BaseModel, Field

# -----------------------------
# Contract enums / primitives
# -----------------------------
Decision = Literal["allow", "reject", "need_more", "error"]
Severity = Literal["error", "warning"]


class StructuredError(BaseModel):
    code: str
    message: str
    path: str
    severity: Severity = "error"


# -----------------------------
# Projects / Submissions models (existing)
# -----------------------------
class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None


class ProjectOut(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    current_state: str
    current_gate_id: str
    current_gate_version: str


class SubmissionOut(BaseModel):
    id: str
    project_id: str
    gate_id: str
    gate_version: str
    state_at_submit: str
    decision: str
    result: Dict[str, Any]


# -----------------------------
# Evaluate contract (frozen)
# -----------------------------
class EvaluateRequest(BaseModel):
    artifacts: Dict[str, Any]


class EvaluateResponse(BaseModel):
    decision: Decision
    next_state: str | None = None
    errors: list[StructuredError]
    submission_id: str
    project_state: str
    current_gate_id: str
    current_gate_version: str


# ============================================================
# UI Schema (FROZEN CONTRACT)
# This MUST match openapi.yaml UiSchemaResponse schema.
# ============================================================
UiFieldType = Literal["json", "string", "text", "number", "boolean"]


class GateDescriptor(BaseModel):
    id: str
    version: str
    title: Optional[str] = None


class FormField(BaseModel):
    key: str
    label: str
    type: UiFieldType
    required: bool
    hint: Optional[str] = None


class FormSchema(BaseModel):
    fields: list[FormField]


class UiSchemaResponse(BaseModel):
    project_id: str
    project_state: str
    gate: GateDescriptor
    form: FormSchema


# ============================================================
# Legacy UI schema models (OPTIONAL)
# Kept to avoid breaking any existing code that still imports
# UIGateSchema / UISchemaField. Can be removed later.
# ============================================================
class UISchemaField(BaseModel):
    artifact_id: str
    label: str
    component: str
    required: bool = True
    placeholder: Optional[str] = None
    help: Optional[str] = None


class UIGateSchema(BaseModel):
    project_id: str
    state: str
    gate_id: str
    gate_version: str
    title: str
    objective: Optional[str] = None
    fields: list[UISchemaField]

