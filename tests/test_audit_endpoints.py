from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from backend.app.models import Project, Submission


def _hdr(owner_id: str) -> dict[str, str]:
    # get_owner_id обычно читает X-Owner-Id; если у тебя alias другой — поправь здесь.
    return {"X-Owner-Id": owner_id}


def _mk_project(*, db, project_id: str, owner_id: str) -> Project:
    """
    Минимальная запись Project.
    Если у Project есть обязательные поля (name, created_at, etc) — дополни тут.
    """
    p = Project(
        id=project_id,
        owner_id=owner_id,
        title="Test project",
        description="",          # если nullable — не мешает; если NOT NULL — спасает
        current_state="S1",
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _mk_submission(
    *,
    db,
    submission_id: str,
    project_id: str,
    created_at: datetime,
    gate_id: str = "G1",
    gate_version: str = "1",
    state_at_submit: str = "S1",
    decision: str = "PASS",
    artifacts: dict | None = None,
    result: dict | None = None,
) -> Submission:
    artifacts = artifacts or {"scenario": {"actor": "a"}}
    result = result or {"decision": decision, "errors": [], "next_state": "S2"}

    s = Submission(
        id=submission_id,
        project_id=project_id,
        gate_id=gate_id,
        gate_version=gate_version,
        state_at_submit=state_at_submit,
        artifacts_payload=json.dumps(artifacts, ensure_ascii=False),
        result_payload=json.dumps(result, ensure_ascii=False),
        decision=decision,  # raw engine vocab
        created_at=created_at,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@pytest.mark.parametrize("order", ["desc", "asc"])
def test_audit_list_shape_and_pagination_smoke(client, db, order: str):
    owner_id = "owner-a"
    project_id = str(uuid.uuid4())
    _mk_project(db=db, project_id=project_id, owner_id=owner_id)

    base = datetime(2026, 1, 6, 12, 0, 0, tzinfo=timezone.utc)

    # 3 submissions -> page1(limit=2) + page2(limit=2)
    s1 = _mk_submission(
        db=db,
        submission_id=str(uuid.uuid4()),
        project_id=project_id,
        created_at=base + timedelta(seconds=1),
        decision="BLOCK",
        result={"decision": "BLOCK", "errors": [], "next_state": None},
    )
    s2 = _mk_submission(
        db=db,
        submission_id=str(uuid.uuid4()),
        project_id=project_id,
        created_at=base + timedelta(seconds=2),
        decision="PASS",
        result={"decision": "PASS", "errors": [], "next_state": "S2"},
    )
    s3 = _mk_submission(
        db=db,
        submission_id=str(uuid.uuid4()),
        project_id=project_id,
        created_at=base + timedelta(seconds=3),
        decision="PASS",
        result={"decision": "PASS", "errors": [], "next_state": "S3"},
    )

    r1 = client.get(
        f"/projects/{project_id}/submissions",
        headers=_hdr(owner_id),
        params={"limit": 2, "order": order},
    )
    assert r1.status_code == 200
    body1 = r1.json()

    # strict top-level keys (items required; next_cursor may exist)
    assert "items" in body1
    assert isinstance(body1["items"], list)
    assert "next_cursor" in body1  # nullable

    assert len(body1["items"]) == 2
    assert body1["next_cursor"] is not None

    # items must match required fields from AuditSubmissionSummary
    for it in body1["items"]:
        assert set(it.keys()) <= {
            "submission_id",
            "project_id",
            "created_at",
            "decision",
            "gate_id",
            "gate_version",
            "state_before",
            "state_after",
        }
        for k in ["submission_id", "project_id", "created_at", "decision", "gate_id", "gate_version"]:
            assert it.get(k) is not None

    r2 = client.get(
        f"/projects/{project_id}/submissions",
        headers=_hdr(owner_id),
        params={"limit": 2, "order": order, "cursor": body1["next_cursor"]},
    )
    assert r2.status_code == 200
    body2 = r2.json()
    assert "items" in body2
    assert len(body2["items"]) == 1
    assert body2["next_cursor"] is None

    # sanity: ensure all three IDs are present across pages
    got_ids = {it["submission_id"] for it in body1["items"]} | {it["submission_id"] for it in body2["items"]}
    assert got_ids == {s1.id, s2.id, s3.id}


def test_audit_list_invalid_cursor_422(client, db):
    owner_id = "owner-a"
    project_id = str(uuid.uuid4())
    _mk_project(db=db, project_id=project_id, owner_id=owner_id)

    r = client.get(
        f"/projects/{project_id}/submissions",
        headers=_hdr(owner_id),
        params={"cursor": "not-a-valid-cursor"},
    )
    assert r.status_code == 422


def test_audit_list_owner_scoping_404(client, db):
    owner_id = "owner-a"
    other_owner = "owner-b"
    project_id = str(uuid.uuid4())
    _mk_project(db=db, project_id=project_id, owner_id=owner_id)

    r = client.get(
        f"/projects/{project_id}/submissions",
        headers=_hdr(other_owner),
    )
    # project not found for that owner
    assert r.status_code == 404


def test_audit_detail_ok_and_immutability(client, db):
    owner_id = "owner-a"
    project_id = str(uuid.uuid4())
    _mk_project(db=db, project_id=project_id, owner_id=owner_id)

    created = datetime(2026, 1, 6, 12, 0, 0, tzinfo=timezone.utc)
    sid = str(uuid.uuid4())

    _mk_submission(
        db=db,
        submission_id=sid,
        project_id=project_id,
        created_at=created,
        decision="PASS",
        artifacts={"a": 1},
        result={
            "decision": "PASS",
            "errors": [{"code": "E1", "path": "/a", "message": "m"}],
            "next_state": "S2",
            "project_state": "S2",
            "current_gate_id": "G2",
            "current_gate_version": "1",
        },
    )

    r = client.get(
        f"/submissions/{sid}",
        headers=_hdr(owner_id),
    )
    assert r.status_code == 200
    body = r.json()

    # required fields of AuditSubmissionDetail
    for k in [
        "submission_id",
        "project_id",
        "created_at",
        "gate_id",
        "gate_version",
        "state_before",
        "state_after",
        "request",
        "result",
        "immutability",
    ]:
        assert k in body

    assert body["submission_id"] == sid
    assert body["project_id"] == project_id

    assert "artifacts" in body["request"]
    assert body["request"]["artifacts"] == {"a": 1}

    assert "decision" in body["result"]
    assert body["result"]["decision"] == "PASS"
    assert "errors" in body["result"]
    assert isinstance(body["result"]["errors"], list)
    assert body["result"]["errors"][0]["code"] == "E1"
    assert body["result"]["errors"][0]["path"] == "/a"

    assert body["immutability"]["is_immutable"] is True
    assert body["immutability"]["stored_at"] is not None


def test_audit_detail_owner_scoping_404(client, db):
    owner_id = "owner-a"
    other_owner = "owner-b"
    project_id = str(uuid.uuid4())
    _mk_project(db=db, project_id=project_id, owner_id=owner_id)

    created = datetime(2026, 1, 6, 12, 0, 0, tzinfo=timezone.utc)
    sid = str(uuid.uuid4())
    _mk_submission(
        db=db,
        submission_id=sid,
        project_id=project_id,
        created_at=created,
        decision="BLOCK",
        result={"decision": "BLOCK", "errors": [], "next_state": None},
    )

    r = client.get(
        f"/submissions/{sid}",
        headers=_hdr(other_owner),
    )
    # deliberately 404 to avoid leaking existence
    assert r.status_code == 404

