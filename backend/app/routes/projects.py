from __future__ import annotations

import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Project
from ..schemas import ProjectCreate, ProjectOut
from ..auth import get_owner_id
from ..state import gate_for_state

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ProjectOut)
def create_project(
    payload: ProjectCreate,
    owner_id: str = Depends(get_owner_id),
    db: Session = Depends(get_db),
):
    pid = str(uuid.uuid4())
    p = Project(
        id=pid,
        owner_id=owner_id,
        title=payload.title,
        description=payload.description,
        current_state="DRAFT",
    )
    db.add(p)
    db.commit()
    db.refresh(p)

    gate = gate_for_state(p.current_state)
    return ProjectOut(
        id=p.id,
        title=p.title,
        description=p.description,
        current_state=p.current_state,
        current_gate_id=gate.gate_id,
        current_gate_version=gate.gate_version,
    )


@router.get("", response_model=list[ProjectOut])
def list_projects(
    owner_id: str = Depends(get_owner_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Project)
        .filter(Project.owner_id == owner_id)
        .order_by(Project.updated_at.desc())
        .all()
    )

    out: list[ProjectOut] = []
    for p in rows:
        gate = gate_for_state(p.current_state)
        out.append(
            ProjectOut(
                id=p.id,
                title=p.title,
                description=p.description,
                current_state=p.current_state,
                current_gate_id=gate.gate_id,
                current_gate_version=gate.gate_version,
            )
        )
    return out


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
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
        # 404 without leaking existence
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Project not found")

    gate = gate_for_state(p.current_state)
    return ProjectOut(
        id=p.id,
        title=p.title,
        description=p.description,
        current_state=p.current_state,
        current_gate_id=gate.gate_id,
        current_gate_version=gate.gate_version,
    )

