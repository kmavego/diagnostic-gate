from __future__ import annotations
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


# ============================================================
# Contract enums / primitives
# ============================================================
Decision = Literal["allow", "reject", "need_more", "error"]
Severity = Literal["error", "warning"]


class StructuredErrorMeta(BaseModel):
    ui_field_id: Optional[str] = None
    ui_field_ids: Optional[List[str]] = None
    ui_block_id: Optional[str] = None

    artifact_path: Optional[str] = None
    rule_id: Optional[str] = None
    gate_id: Optional[str] = None
    gate_version: Optional[str] = None

    class Config:
        extra = "forbid"

class StructuredError(BaseModel):
    code: str
    message: str
    path: str
    severity: Severity = "error"
    meta: Optional[StructuredErrorMeta] = None

# ============================================================
# Projects / Submissions models (existing)
# ============================================================
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


# ============================================================
# Evaluate contract (frozen)
# ============================================================
class EvaluateRequest(BaseModel):
    artifacts: Dict[str, Any]


class EvaluateResponse(BaseModel):
    decision: Decision
    next_state: Optional[str] = None
    errors: List[StructuredError]
    submission_id: str
    project_state: str
    current_gate_id: str
    current_gate_version: str


# ============================================================
# UI Schema (FROZEN CONTRACT) — legacy v0.1
# MUST match OpenAPI spec (openapi/openapi.v0.1.yaml) schema: UiSchemaResponse.
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
    fields: List[FormField]


class UiSchemaResponse(BaseModel):
    project_id: str
    project_state: str
    gate: GateDescriptor
    form: FormSchema


# ============================================================
# UI Schema v1 (NEW, PRODUCT UX)
# Not part of frozen OpenAPI v0.1. Served via separate endpoint.
# ============================================================
class UiOptionV1(BaseModel):
    value: str
    label: str


class UiFieldUiV1(BaseModel):
    widget: Literal["text", "textarea", "number", "select"]
    placeholder: Optional[str] = None
    rows: Optional[int] = None
    options: Optional[List[UiOptionV1]] = None


class UiFieldValueV1(BaseModel):
    type: Literal["string", "number", "object"]
    constraints: Optional[Dict[str, Any]] = None


class UiFieldVisibilityV1(BaseModel):
    product: bool = True
    audit: bool = True
    audit_details: bool = True


class UiFieldV1(BaseModel):
    id: str
    artifact_path: str
    label: str
    description: Optional[str] = None
    ui: UiFieldUiV1
    value: UiFieldValueV1
    visibility: UiFieldVisibilityV1


class UiSectionV1(BaseModel):
    id: str
    title: str
    fields: List[UiFieldV1]


class UiGateV1(BaseModel):
    id: str
    version: str
    title: str
    objective: Optional[str] = None


class UiFormV1(BaseModel):
    sections: List[UiSectionV1]


class UiSchemaV1Response(BaseModel):
    ui_schema_version: Literal["v1"] = "v1"
    renderer: Literal["form_v1"] = "form_v1"
    locale: str = "ru"
    gate: UiGateV1
    form: UiFormV1


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
    fields: List[UISchemaField]

