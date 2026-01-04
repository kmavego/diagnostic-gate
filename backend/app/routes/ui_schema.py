from __future__ import annotations

from pathlib import Path
import yaml
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Project
from ..auth import get_owner_id
from ..state import gate_for_state, FINAL_STATE
from ..schemas import UIGateSchema, UISchemaField

router = APIRouter(prefix="/projects", tags=["ui-schema"])

REPO_ROOT = Path(__file__).resolve().parents[3]
UI_MAPPING_PATH = REPO_ROOT / "canon" / "artifact_ui_mapping.yaml"

GATES_DIR = REPO_ROOT / "canon" / "gates"



def _load_yaml(path: Path) -> dict:
    if not path.exists():
        raise HTTPException(status_code=500, detail=f"Missing file: {path}")
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def _find_gate_spec(gate_id: str, gate_version: str) -> dict | None:
    """
    Try common patterns:
    - gates/<gate_id>.yaml
    - gates/<gate_id>_<version>.yaml
    - gates/<gate_id>-<version>.yaml
    """
    candidates = [
        GATES_DIR / f"{gate_id}.yaml",
        GATES_DIR / f"{gate_id}_{gate_version}.yaml",
        GATES_DIR / f"{gate_id}-{gate_version}.yaml",
    ]
    for c in candidates:
        if c.exists():
            return _load_yaml(c)
    return None


@router.get("/{project_id}/ui-schema", response_model=UIGateSchema)

def _gate_ui_from_mapping(mapping: dict, gate_id: str) -> dict | None:
    """
    Support multiple artifact_ui_mapping.yaml shapes.

    Supported:
    1) gates: { GATE_ID: {title, fields:[...] } }
    2) gates: [ {gate_id/id, title, fields:[...]} , ... ]
    3) direct: { GATE_ID: {title, fields:[...]} }  (top-level)
    """
    if not isinstance(mapping, dict):
        return None

    # (1) canonical dict under "gates"
    gates = mapping.get("gates")
    if isinstance(gates, dict):
        if gate_id in gates:
            return gates[gate_id]

    # (2) list under "gates"
    if isinstance(gates, list):
        for item in gates:
            if isinstance(item, dict) and (item.get("gate_id") == gate_id or item.get("id") == gate_id):
                return item

    # (3) top-level keyed by gate_id
    if gate_id in mapping and isinstance(mapping[gate_id], dict):
        return mapping[gate_id]

    return None

def get_ui_schema(
    project_id: str,
    owner_id: str = Depends(get_owner_id),
    db: Session = Depends(get_db),
):
    p = (
        db.query(Project)
        .filter(Project.id == project_id, Project.owner_id == owner_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    if p.current_state == FINAL_STATE:
        return UIGateSchema(
            project_id=p.id,
            state=p.current_state,
            gate_id="FINAL",
            gate_version="0.0.0",
            title="Project finalized",
            objective="No further gates",
            fields=[],
        )

    gate_ref = gate_for_state(p.current_state)
    if gate_ref.gate_id == "FINAL":
        raise HTTPException(status_code=409, detail=f"Unknown state: {p.current_state}")

    mapping = _load_yaml(UI_MAPPING_PATH)

    # expected structure:
    # gates:
    #   PROBLEM_VALIDATION_01:
    #     title: ...
    #     fields:
    #       - artifact_id: target_action
    #         label: ...
    #         component: textarea
    #         required: true
    gate_ui = _gate_ui_from_mapping(mapping, gate_ref.gate_id)
    if not gate_ui:
        raise HTTPException(
            status_code=500,
            detail=f"Missing ui mapping for gate: {gate_ref.gate_id}",
        )

    title = gate_ui.get("title", gate_ref.gate_id)

    # optional: enrich with objective from gate spec, if present
    objective = None
    gate_spec = _find_gate_spec(gate_ref.gate_id, gate_ref.gate_version)
    if gate_spec:
        objective = gate_spec.get("objective") or gate_spec.get("description")

    fields_raw = gate_ui.get("fields") or gate_ui.get("artifacts") or []
    fields: list[UISchemaField] = []
    for f in fields_raw:
        fields.append(
            UISchemaField(
                artifact_id=f["artifact_id"],
                label=f.get("label", f["artifact_id"]),
                component=f.get("component", "textarea"),
                required=bool(f.get("required", True)),
                placeholder=f.get("placeholder"),
                help=f.get("help"),
            )
        )

    return UIGateSchema(
        project_id=p.id,
        state=p.current_state,
        gate_id=gate_ref.gate_id,
        gate_version=gate_ref.gate_version,
        title=title,
        objective=objective,
        fields=fields,
    )

