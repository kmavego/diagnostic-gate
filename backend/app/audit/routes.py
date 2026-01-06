from __future__ import annotations

import base64
import json
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth import get_owner_id
from ..db import get_db
from ..models import Project, Submission
from .schemas import (
    AuditError,
    AuditEvaluateRequestSnapshot,
    AuditEvaluateResultSnapshot,
    AuditImmutability,
    AuditSubmissionDetail,
    AuditSubmissionListResponse,
    AuditSubmissionSummary,
)

router = APIRouter(tags=["audit"])


# -----------------------------
# Cursor helpers (opaque)
# -----------------------------
def _encode_cursor(created_at: datetime, submission_id: str) -> str:
    payload = {"created_at": created_at.isoformat(), "submission_id": submission_id}
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii")


def _decode_cursor(cursor: str) -> Tuple[datetime, str]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        payload = json.loads(raw)
        created_at = datetime.fromisoformat(payload["created_at"])
        submission_id = str(payload["submission_id"])
        if not submission_id:
            raise ValueError("empty submission_id")
        return created_at, submission_id
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid cursor")


# -----------------------------
# Normalization helpers (audit-safe)
# -----------------------------
def _parse_json_object(text: str, *, what: str) -> Dict[str, Any]:
    """
    Достаём dict из JSON text.
    Если там не dict (например list/str) — считаем ошибкой данных.
    """
    try:
        obj = json.loads(text or "{}")
    except Exception:
        raise HTTPException(status_code=500, detail=f"Corrupted {what} JSON")
    if obj is None:
        return {}
    if not isinstance(obj, dict):
        raise HTTPException(status_code=500, detail=f"Invalid {what} JSON shape")
    return obj


def _normalize_audit_errors(raw_errors: Any) -> list[AuditError]:
    """
    Контракт audit ошибок:
    - required: code, path
    - optional: message, meta
    additionalProperties=false => ничего лишнего.

    Мы НЕ даём советов, только протокол.
    """
    if not raw_errors:
        return []

    items = raw_errors if isinstance(raw_errors, list) else [raw_errors]
    out: list[AuditError] = []

    for e in items:
        # plain string
        if isinstance(e, str):
            out.append(
                AuditError(
                    code="GATE_REJECTED",
                    path="/artifacts",
                    message=e,
                    meta=None,
                )
            )
            continue

        # dict-like
        if isinstance(e, dict):
            code = e.get("code") or "GATE_REJECTED"
            path = e.get("path") or "/artifacts"
            message = e.get("message") or e.get("msg")

            # meta: либо поле meta, либо “остаток” (без advice)
            meta = e.get("meta")
            if meta is None:
                meta = {k: v for k, v in e.items() if k not in {"code", "path", "message", "msg", "severity"}}
                if meta == {}:
                    meta = None

            out.append(
                AuditError(
                    code=str(code),
                    path=str(path),
                    message=str(message) if message is not None else None,
                    meta=meta if isinstance(meta, dict) or meta is None else {"value": meta},
                )
            )
            continue

        # fallback unknown type
        out.append(
            AuditError(
                code="GATE_REJECTED",
                path="/artifacts",
                message=str(e),
                meta=None,
            )
        )

    return out


def _state_after_from_result(result_obj: Dict[str, Any]) -> Optional[str]:
    # Контракт допускает null
    ns = result_obj.get("next_state")
    return str(ns) if ns is not None else None


# -----------------------------
# LIST: /projects/{project_id}/submissions
# -----------------------------
@router.get(
    "/projects/{project_id}/submissions",
    response_model=AuditSubmissionListResponse,
    summary="List audit submissions for a project (summary)",
)
def list_project_submissions(
    project_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: Optional[str] = Query(default=None),
    order: str = Query(default="desc", pattern="^(desc|asc)$"),
    owner_id: str = Depends(get_owner_id),
    db: Session = Depends(get_db),
) -> AuditSubmissionListResponse:
    # owner scoping: проект должен принадлежать owner
    p = (
        db.query(Project)
        .filter(Project.id == project_id, Project.owner_id == owner_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    q = db.query(Submission).filter(Submission.project_id == project_id)

    if order == "asc":
        q = q.order_by(Submission.created_at.asc(), Submission.id.asc())
    else:
        q = q.order_by(Submission.created_at.desc(), Submission.id.desc())

    if cursor:
        c_created_at, c_id = _decode_cursor(cursor)
        if order == "asc":
            q = q.filter(
                (Submission.created_at > c_created_at)
                | ((Submission.created_at == c_created_at) & (Submission.id > c_id))
            )
        else:
            q = q.filter(
                (Submission.created_at < c_created_at)
                | ((Submission.created_at == c_created_at) & (Submission.id < c_id))
            )

    rows = q.limit(limit + 1).all()
    has_next = len(rows) > limit
    page = rows[:limit]

    items: list[AuditSubmissionSummary] = []
    for s in page:
        result_obj = _parse_json_object(s.result_payload, what="result_payload")

        items.append(
            AuditSubmissionSummary(
                submission_id=s.id,
                project_id=s.project_id,
                created_at=s.created_at,
                decision=s.decision,  # raw engine vocabulary (PASS/BLOCK/...)
                gate_id=s.gate_id,
                gate_version=s.gate_version,
                state_before=s.state_at_submit,
                state_after=_state_after_from_result(result_obj),
            )
        )

    next_cursor = None
    if has_next and page:
        last = page[-1]
        next_cursor = _encode_cursor(last.created_at, last.id)

    return AuditSubmissionListResponse(items=items, next_cursor=next_cursor)


# -----------------------------
# DETAIL: /submissions/{submission_id}
# -----------------------------
@router.get(
    "/submissions/{submission_id}",
    response_model=AuditSubmissionDetail,
    summary="Read immutable audit submission detail",
)
def read_submission(
    submission_id: str,
    owner_id: str = Depends(get_owner_id),
    db: Session = Depends(get_db),
) -> AuditSubmissionDetail:
    """
    Owner scoping: Submission не содержит owner_id, поэтому проверяем через Project:
    - читаем submission
    - читаем project и сверяем owner_id
    """
    s = db.query(Submission).filter(Submission.id == submission_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Submission not found")

    p = db.query(Project).filter(Project.id == s.project_id).first()
    if not p or p.owner_id != owner_id:
        # чтобы не раскрывать факт существования submission чужого owner — возвращаем 404
        raise HTTPException(status_code=404, detail="Submission not found")

    artifacts_obj = _parse_json_object(s.artifacts_payload, what="artifacts_payload")
    result_obj = _parse_json_object(s.result_payload, what="result_payload")

    # request snapshot
    req = AuditEvaluateRequestSnapshot(artifacts=artifacts_obj)

    # result snapshot (decision/errors required)
    decision_raw = result_obj.get("decision")
    decision = str(decision_raw) if decision_raw is not None else str(s.decision)

    errors_norm = _normalize_audit_errors(result_obj.get("errors", []))

    res = AuditEvaluateResultSnapshot(
        decision=decision,
        project_state=(str(result_obj["project_state"]) if "project_state" in result_obj and result_obj["project_state"] is not None else None),
        next_state=(str(result_obj["next_state"]) if "next_state" in result_obj and result_obj["next_state"] is not None else None),
        current_gate_id=(str(result_obj["current_gate_id"]) if "current_gate_id" in result_obj and result_obj["current_gate_id"] is not None else None),
        current_gate_version=(str(result_obj["current_gate_version"]) if "current_gate_version" in result_obj and result_obj["current_gate_version"] is not None else None),
        errors=errors_norm,
    )

    imm = AuditImmutability(is_immutable=True, stored_at=s.created_at)

    return AuditSubmissionDetail(
        submission_id=s.id,
        project_id=s.project_id,
        created_at=s.created_at,
        gate_id=s.gate_id,
        gate_version=s.gate_version,
        state_before=s.state_at_submit,
        state_after=_state_after_from_result(result_obj),
        request=req,
        result=res,
        immutability=imm,
    )

