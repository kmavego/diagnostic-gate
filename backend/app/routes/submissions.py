from __future__ import annotations

import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Project, Submission
from ..schemas import SubmissionOut
from ..auth import get_owner_id

router = APIRouter(prefix="/projects", tags=["submissions"])


@router.get("/{project_id}/submissions", response_model=list[SubmissionOut])
def list_submissions(
    project_id: str,
    limit: int = Query(default=20, ge=1, le=200),
    owner_id: str = Depends(get_owner_id),
    db: Session = Depends(get_db),
):
    # ensure project exists and belongs to owner
    p = (
        db.query(Project)
        .filter(Project.id == project_id, Project.owner_id == owner_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    rows = (
        db.query(Submission)
        .filter(Submission.project_id == project_id)
        .order_by(Submission.created_at.desc())
        .limit(limit)
        .all()
    )

    out: list[SubmissionOut] = []
    for s in rows:
        try:
            result = json.loads(s.result_payload)
        except Exception:
            result = {"raw": s.result_payload}

        out.append(
            SubmissionOut(
                id=s.id,
                project_id=s.project_id,
                gate_id=s.gate_id,
                gate_version=s.gate_version,
                state_at_submit=s.state_at_submit,
                decision=s.decision,
                result=result,
            )
        )
    return out

