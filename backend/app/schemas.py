from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


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


class EvaluateRequest(BaseModel):
    artifacts: Dict[str, Any]


class EvaluateResponse(BaseModel):
    decision: str
    next_state: Optional[str] = None
    errors: List[Dict[str, Any]] = []
    submission_id: str
    project_state: str
    current_gate_id: str
    current_gate_version: str

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

