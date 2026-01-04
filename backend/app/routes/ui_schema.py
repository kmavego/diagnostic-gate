from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_owner_id
from ..db import get_db
from ..models import Project
from ..state import gate_for_state
from ..schemas import UiSchemaResponse

router = APIRouter(prefix="/projects", tags=["ui-schema"])


@router.get("/{project_id}/ui-schema", response_model=UiSchemaResponse)
def get_ui_schema(
    project_id: str,
    owner_id: str = Depends(get_owner_id),
    db: Session = Depends(get_db),
):
    # 1) find project
    p = (
        db.query(Project)
        .filter(Project.id == project_id, Project.owner_id == owner_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    # 2) resolve current gate from project state
    gate_ref = gate_for_state(p.current_state)

    # 3) build minimal UI schema (contract-first).
    #    IMPORTANT: Frontend renders this; it does not invent logic.
    #    For MVP we can return a generic JSON field for "artifacts".
    #    Later you can expand fields using artifact_ui_mapping.yaml.
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

