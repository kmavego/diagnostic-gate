from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_owner_id
from ..db import get_db
from ..models import Project
from ..state import gate_for_state
from ..schemas import UiSchemaResponse, UiSchemaV1Response

router = APIRouter(prefix="/projects", tags=["ui-schema"])


def build_ui_schema_v1_problem_validation_01() -> UiSchemaV1Response:
    return UiSchemaV1Response(
        ui_schema_version="v1",
        renderer="form_v1",
        locale="ru",
        gate={
            "id": "PROBLEM_VALIDATION_01",
            "version": "1.1.0",
            "title": "Проверка проблемы",
            "objective": "Фиксация управленчески значимой ошибки и её цены.",
        },
        form={
            "sections": [
                {
                    "id": "problem",
                    "title": "Формулировка проблемы",
                    "fields": [
                        {
                            "id": "target_action",
                            "artifact_path": "artifacts.target_action",
                            "label": "Целевое действие сотрудника",
                            "description": "Действие в реальной рабочей среде. Должно быть наблюдаемым.",
                            "ui": {
                                "widget": "textarea",
                                "rows": 4,
                                "placeholder": "Напр.: «Оформляет возврат в CRM без ручных правок»",
                            },
                            "value": {"type": "string"},
                            "visibility": {"product": True, "audit": True, "audit_details": True},
                        },
                        {
                            "id": "error_scenario",
                            "artifact_path": "artifacts.error_scenario",
                            "label": "Описание критической ошибки",
                            "description": "Сценарий: кто действует → что делает неправильно → к чему приводит (конкретно).",
                            "ui": {
                                "widget": "textarea",
                                "rows": 8,
                                "placeholder": "Опиши конкретный инцидент.",
                            },
                            "value": {"type": "string"},
                            "visibility": {"product": True, "audit": True, "audit_details": True},
                        },
                    ],
                },
                {
                    "id": "impact",
                    "title": "Цена ошибки",
                    "fields": [
                        {
                            "id": "economic_impact_amount",
                            "artifact_path": "artifacts.economic_impact.amount",
                            "label": "Величина ущерба",
                            "description": "Число.",
                            "ui": {"widget": "number", "placeholder": "Напр.: 30000"},
                            "value": {"type": "number"},
                            "visibility": {"product": True, "audit": True, "audit_details": True},
                        },
                        {
                            "id": "economic_impact_unit",
                            "artifact_path": "artifacts.economic_impact.unit",
                            "label": "Единица измерения",
                            "description": "USD / RUB / Hours / Conversion%",
                            "ui": {
                                "widget": "select",
                                "options": [
                                    {"value": "RUB", "label": "RUB"},
                                    {"value": "USD", "label": "USD"},
                                    {"value": "Hours", "label": "Hours"},
                                    {"value": "Conversion%", "label": "Conversion%"},
                                ],
                            },
                            "value": {"type": "string"},
                            "visibility": {"product": True, "audit": True, "audit_details": True},
                        },
                    ],
                },
            ]
        },
    )


def _load_project_or_404(project_id: str, owner_id: str, db: Session) -> Project:
    p = (
        db.query(Project)
        .filter(Project.id == project_id, Project.owner_id == owner_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.get("/{project_id}/ui-schema", response_model=UiSchemaResponse)
def get_ui_schema(
    project_id: str,
    owner_id: str = Depends(get_owner_id),
    db: Session = Depends(get_db),
):
    # Legacy frozen schema (v0.1). Keep as-is.
    p = _load_project_or_404(project_id, owner_id, db)
    gate_ref = gate_for_state(p.current_state)

    return UiSchemaResponse(
        project_id=p.id,
        project_state=p.current_state,
        gate={
            "id": gate_ref.gate_id,
            "version": gate_ref.gate_version,
            "title": f"Gate {gate_ref.gate_id}",
        },
        form={
            "fields": [
                {
                    "key": "artifacts",
                    "label": "Artifacts",
                    "type": "json",
                    "required": True,
                    "hint": "Provide artifacts payload for the current gate.",
                }
            ]
        },
    )


@router.get("/{project_id}/ui-schema-v1", response_model=UiSchemaV1Response)
def get_ui_schema_v1(
    project_id: str,
    owner_id: str = Depends(get_owner_id),
    db: Session = Depends(get_db),
):
    # Product UI schema v1. Separate endpoint to avoid breaking frozen OpenAPI v0.1.
    p = _load_project_or_404(project_id, owner_id, db)
    gate_ref = gate_for_state(p.current_state)

    if gate_ref.gate_id == "PROBLEM_VALIDATION_01" and gate_ref.gate_version == "1.1.0":
        return build_ui_schema_v1_problem_validation_01()

    raise HTTPException(status_code=404, detail="UI schema v1 not available for this gate")

