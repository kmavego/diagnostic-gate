from __future__ import annotations

import json
import uuid
from pathlib import Path
import sys
from typing import Any

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


# -----------------------------
# API adapters (engine -> API)
# -----------------------------
def map_decision(raw: str | None) -> str:
    """
    Engine decision vocabulary -> API decision vocabulary (frozen contract).
    Engine: PASS/BLOCK/...
    API: allow/reject/need_more/error
    """
    raw_u = (raw or "").upper()
    if raw_u in {"PASS", "ALLOW", "OK"}:
        return "allow"
    if raw_u in {"BLOCK", "REJECT", "DENY"}:
        return "reject"
    if raw_u in {"NEED_MORE", "NEEDMORE"}:
        return "need_more"
    return "error"


def normalize_errors(raw_errors: Any) -> list[dict[str, Any]]:
    """
    Engine errors -> structured errors required by OpenAPI contract:
    {code, message, path, severity}
    """
    if not raw_errors:
        return []

    # Ensure iterable list
    items = raw_errors if isinstance(raw_errors, list) else [raw_errors]

    out: list[dict[str, Any]] = []
    for e in items:
        # If it's a plain string
        if isinstance(e, str):
            out.append(
                {
                    "code": "GATE_REJECTED",
                    "message": e,
                    "path": "artifacts",
                    "severity": "error",
                }
            )
            continue

        # If it's a dict-like error from engine
        if isinstance(e, dict):
            out.append(
                {
                    "code": e.get("code") or "GATE_REJECTED",
                    "message": e.get("message") or e.get("msg") or json.dumps(e, ensure_ascii=False),
                    "path": e.get("path") or "artifacts",
                    "severity": e.get("severity") or "error",
                }
            )
            continue

        # Fallback
        out.append(
            {
                "code": "GATE_REJECTED",
                "message": str(e),
                "path": "artifacts",
                "severity": "error",
            }
        )

    return out


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

    # Engine evaluates in its own vocabulary
    result = evaluate_gate(
        gate_id=gate_ref.gate_id,
        gate_version=gate_ref.gate_version,
        state=p.current_state,
        artifacts=payload.artifacts,
    )

    raw_decision = result.get("decision", "BLOCK")
    api_decision = map_decision(raw_decision)

    # Normalize errors for API response (but keep raw result_payload for audit)
    api_errors = normalize_errors(result.get("errors", []))

    # audit write (store raw engine output verbatim)
    sid = str(uuid.uuid4())
    sub = Submission(
        id=sid,
        project_id=p.id,
        gate_id=gate_ref.gate_id,
        gate_version=gate_ref.gate_version,
        state_at_submit=p.current_state,
        artifacts_payload=json.dumps(payload.artifacts, ensure_ascii=False),
        result_payload=json.dumps(result, ensure_ascii=False),
        decision=raw_decision,  # keep raw engine decision for audit truth
    )
    db.add(sub)

    # transition only on PASS (engine-level rule)
    if (raw_decision or "").upper() == "PASS":
        next_state = result.get("next_state")
        if not next_state:
            # defensive: engine must provide next_state on PASS
            raise HTTPException(
                status_code=500,
                detail="Engine returned PASS without next_state",
            )
        p.current_state = next_state

    db.commit()
    db.refresh(p)

    # return response with current gate after possible transition
    current_gate = gate_for_state(p.current_state)

    # IMPORTANT: response must speak API contract vocabulary (allow/reject/...)
    return EvaluateResponse(
        decision=api_decision,
        # next_state is meaningful for allow; for reject you can return null, but
        # we keep engine-provided value if any. If your EvaluateResponse schema
        # requires null on reject, set it conditionally here.
        next_state=result.get("next_state") if api_decision == "allow" else None,
        errors=api_errors,
        submission_id=sid,
        project_state=p.current_state,
        current_gate_id=current_gate.gate_id,
        current_gate_version=current_gate.gate_version,
    )

