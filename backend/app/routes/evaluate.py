from __future__ import annotations

import json
import uuid
from pathlib import Path
import sys

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Project, Submission
from ..schemas import EvaluateRequest, EvaluateResponse
from ..auth import get_owner_id
from ..state import gate_for_state, FINAL_STATE

# Ensure repo root is importable so we can import engine/
REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

from engine.evaluator import evaluate_gate  # noqa: E402


router = APIRouter(prefix="/projects", tags=["evaluate"])


@router.post("/{project_id}/evaluate", response_model=EvaluateResponse)
def evaluate_current_gate(
    project_id: str,
    payload: EvaluateRequest,
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
        raise HTTPException(status_code=409, detail="Project already finalized")

    gate_ref = gate_for_state(p.current_state)
    if gate_ref.gate_id == "FINAL":
        raise HTTPException(status_code=409, detail=f"Unknown state: {p.current_state}")

    result = evaluate_gate(
        gate_id=gate_ref.gate_id,
        gate_version=gate_ref.gate_version,
        state=p.current_state,
        artifacts=payload.artifacts,
    )

    # audit write
    sid = str(uuid.uuid4())
    sub = Submission(
        id=sid,
        project_id=p.id,
        gate_id=gate_ref.gate_id,
        gate_version=gate_ref.gate_version,
        state_at_submit=p.current_state,
        artifacts_payload=json.dumps(payload.artifacts, ensure_ascii=False),
        result_payload=json.dumps(result, ensure_ascii=False),
        decision=result.get("decision", "BLOCK"),
    )
    db.add(sub)

    # transition only on PASS
    decision = result.get("decision")
    if decision == "PASS":
        next_state = result.get("next_state")
        if not next_state:
            # defensive: engine must provide next_state on PASS
            raise HTTPException(status_code=500, detail="Engine returned PASS without next_state")
        p.current_state = next_state

    db.commit()
    db.refresh(p)

    # return response with current gate after possible transition
    current_gate = gate_for_state(p.current_state)

    return EvaluateResponse(
        decision=result.get("decision", "BLOCK"),
        next_state=result.get("next_state"),
        errors=result.get("errors", []),
        submission_id=sid,
        project_state=p.current_state,
        current_gate_id=current_gate.gate_id,
        current_gate_version=current_gate.gate_version,
    )

