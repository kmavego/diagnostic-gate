from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_owner_id
from ..db import get_db
from ..models import Project, Submission
from ..schemas import EvaluateRequest, EvaluateResponse
from ..state import FINAL_STATE, gate_for_state

# Ensure repo root is importable so we can import engine/
REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

from engine.evaluator import evaluate_gate  # noqa: E402


router = APIRouter(prefix="/projects", tags=["evaluate"])


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


def normalize_errors(raw_errors: Any, *, gate_id: str, gate_version: str) -> list[dict[str, Any]]:
    """
    Engine errors -> StructuredError (OpenAPI v0.1):
    {code, message, path, severity, meta?}

    Product UX Phase 1.1:
    - bind errors to UI via meta.ui_field_id/ui_field_ids/ui_block_id
    - make path field-level when possible: /artifacts/<artifact_id>
    """
    if not raw_errors:
        return []

    items = raw_errors if isinstance(raw_errors, list) else [raw_errors]
    out: list[dict[str, Any]] = []

    for e in items:
        # Plain string error
        if isinstance(e, str):
            out.append(
                {
                    "code": "GATE_REJECTED",
                    "message": e,
                    "path": "/artifacts",
                    "severity": "error",
                    "meta": {
                        "gate_id": gate_id,
                        "gate_version": gate_version,
                    },
                }
            )
            continue

        # Dict-like engine error
        if isinstance(e, dict):
            artifact_id = e.get("artifact_id") if isinstance(e.get("artifact_id"), str) else ""
            error_code = e.get("error_code") or e.get("code") or "GATE_REJECTED"

            msg = e.get("message") or e.get("msg")
            if not isinstance(msg, str) or not msg.strip():
                msg = json.dumps(e, ensure_ascii=False)

            # path: if provided, normalize; else derive from artifact_id
            path = e.get("path")
            if isinstance(path, str) and path.strip():
                norm = path.strip()
                # support legacy "artifacts.x" -> "/artifacts/x"
                if not norm.startswith("/") and norm.startswith("artifacts."):
                    norm = "/" + norm.replace(".", "/")
                path_out = norm
            else:
                path_out = f"/artifacts/{artifact_id}" if artifact_id else "/artifacts"

            meta: dict[str, Any] = {
                # UI binding
                "ui_field_id": e.get("ui_field_id") if isinstance(e.get("ui_field_id"), str) else None,
                "ui_field_ids": e.get("ui_field_ids") if isinstance(e.get("ui_field_ids"), list) else None,
                "ui_block_id": e.get("ui_block_id") if isinstance(e.get("ui_block_id"), str) else None,
                # tracing
                "artifact_path": f"/artifacts/{artifact_id}" if artifact_id else None,
                "rule_id": str(error_code) if error_code else None,
                "gate_id": gate_id,
                "gate_version": gate_version,
            }
            meta = {k: v for k, v in meta.items() if v is not None}

            out.append(
                {
                    "code": str(error_code),
                    "message": str(msg),
                    "path": str(path_out),
                    "severity": str(e.get("severity") or "error"),
                    "meta": meta if meta else None,
                }
            )
            continue

        # Fallback
        out.append(
            {
                "code": "GATE_REJECTED",
                "message": str(e),
                "path": "/artifacts",
                "severity": "error",
                "meta": {
                    "gate_id": gate_id,
                    "gate_version": gate_version,
                },
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

    result = evaluate_gate(
        gate_id=gate_ref.gate_id,
        gate_version=gate_ref.gate_version,
        state=p.current_state,
        artifacts=payload.artifacts,
    )

    raw_decision = result.get("decision", "BLOCK")
    api_decision = map_decision(raw_decision)

    api_errors = normalize_errors(
        result.get("errors", []),
        gate_id=gate_ref.gate_id,
        gate_version=gate_ref.gate_version,
    )

    sid = str(uuid.uuid4())
    sub = Submission(
        id=sid,
        project_id=p.id,
        gate_id=gate_ref.gate_id,
        gate_version=gate_ref.gate_version,
        state_at_submit=p.current_state,
        artifacts_payload=json.dumps(payload.artifacts, ensure_ascii=False),
        result_payload=json.dumps(result, ensure_ascii=False),
        decision=raw_decision,
    )
    db.add(sub)

    if (raw_decision or "").upper() == "PASS":
        next_state = result.get("next_state")
        if not next_state:
            raise HTTPException(status_code=500, detail="Engine returned PASS without next_state")
        p.current_state = next_state

    db.commit()
    db.refresh(p)

    current_gate = gate_for_state(p.current_state)

    return EvaluateResponse(
        decision=api_decision,
        next_state=result.get("next_state") if api_decision == "allow" else None,
        errors=api_errors,
        submission_id=sid,
        project_state=p.current_state,
        current_gate_id=current_gate.gate_id,
        current_gate_version=current_gate.gate_version,
    )

