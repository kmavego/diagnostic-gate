from __future__ import annotations

from typing import Any

import pytest


# -------------------------
# helpers: strict JSON shape
# -------------------------
def _assert_exact_keys(obj: dict[str, Any], expected: set[str]) -> None:
    assert isinstance(obj, dict)
    got = set(obj.keys())
    assert got == expected, f"Unexpected keys.\nExpected: {sorted(expected)}\nGot: {sorted(got)}"


def _assert_is_str_or_none(v: Any) -> None:
    assert v is None or isinstance(v, str)


def _assert_audit_summary_item_shape(item: dict[str, Any]) -> None:
    # components/schemas/AuditSubmissionSummary
    _assert_exact_keys(
        item,
        {
            "submission_id",
            "project_id",
            "created_at",
            "decision",
            "gate_id",
            "gate_version",
            "state_before",
            "state_after",
        },
    )
    assert isinstance(item["submission_id"], str)
    assert isinstance(item["project_id"], str)
    assert isinstance(item["created_at"], str)  # date-time string
    assert isinstance(item["decision"], str)  # engine vocabulary (stringly typed)
    assert isinstance(item["gate_id"], str)
    assert isinstance(item["gate_version"], str)
    _assert_is_str_or_none(item["state_before"])
    _assert_is_str_or_none(item["state_after"])


def _assert_audit_list_response_shape(payload: dict[str, Any]) -> None:
    # components/schemas/AuditSubmissionListResponse
    _assert_exact_keys(payload, {"items", "next_cursor"})
    assert isinstance(payload["items"], list)
    _assert_is_str_or_none(payload["next_cursor"])
    for it in payload["items"]:
        assert isinstance(it, dict)
        _assert_audit_summary_item_shape(it)


def _assert_audit_error_shape(err: dict[str, Any]) -> None:
    # components/schemas/AuditError
    # required: [code, path], optional: message, meta
    _assert_exact_keys(err, {"code", "path", "message", "meta"})
    assert isinstance(err["code"], str)
    assert isinstance(err["path"], str)
    _assert_is_str_or_none(err["message"])
    assert err["meta"] is None or isinstance(err["meta"], dict)


def _assert_audit_detail_shape(payload: dict[str, Any]) -> None:
    # components/schemas/AuditSubmissionDetail
    _assert_exact_keys(
        payload,
        {
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
        },
    )

    assert isinstance(payload["submission_id"], str)
    assert isinstance(payload["project_id"], str)
    assert isinstance(payload["created_at"], str)

    assert isinstance(payload["gate_id"], str)
    assert isinstance(payload["gate_version"], str)

    _assert_is_str_or_none(payload["state_before"])
    _assert_is_str_or_none(payload["state_after"])

    # request snapshot
    assert isinstance(payload["request"], dict)
    _assert_exact_keys(payload["request"], {"artifacts"})
    assert isinstance(payload["request"]["artifacts"], dict)

    # result snapshot
    assert isinstance(payload["result"], dict)
    _assert_exact_keys(
        payload["result"],
        {
            "decision",
            "project_state",
            "next_state",
            "current_gate_id",
            "current_gate_version",
            "errors",
        },
    )
    assert isinstance(payload["result"]["decision"], str)
    _assert_is_str_or_none(payload["result"]["project_state"])
    _assert_is_str_or_none(payload["result"]["next_state"])
    _assert_is_str_or_none(payload["result"]["current_gate_id"])
    _assert_is_str_or_none(payload["result"]["current_gate_version"])
    assert isinstance(payload["result"]["errors"], list)
    for e in payload["result"]["errors"]:
        assert isinstance(e, dict)
        _assert_audit_error_shape(e)

    # immutability
    assert isinstance(payload["immutability"], dict)
    _assert_exact_keys(payload["immutability"], {"is_immutable", "stored_at"})
    assert payload["immutability"]["is_immutable"] is True
    assert isinstance(payload["immutability"]["stored_at"], str)


# -------------------------
# helpers: API actions
# -------------------------
def _create_project(client, owner_id: str, title: str = "Test") -> str:
    r = client.post(
        "/projects",
        headers={"X-Owner-Id": owner_id},
        json={"title": title},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, dict) and "id" in data
    return data["id"]


def _evaluate_project(client, owner_id: str, project_id: str, artifacts: dict[str, Any] | None = None) -> str:
    r = client.post(
        f"/projects/{project_id}/evaluate",
        headers={"X-Owner-Id": owner_id},
        json={"artifacts": artifacts or {}},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, dict) and "submission_id" in data
    return data["submission_id"]


# -------------------------
# contract enforcement tests
# -------------------------
def test_audit_paths_exist_in_openapi(client):
    """
    Enforce additive audit contract presence in runtime OpenAPI.
    We don't diff the whole schema; we assert paths exist and are GET endpoints.
    """
    r = client.get("/openapi.json")
    assert r.status_code == 200, r.text
    spec = r.json()
    assert isinstance(spec, dict)
    paths = spec.get("paths")
    assert isinstance(paths, dict)

    assert "/projects/{project_id}/submissions" in paths
    assert "/submissions/{submission_id}" in paths

    assert "get" in paths["/projects/{project_id}/submissions"]
    assert "get" in paths["/submissions/{submission_id}"]


@pytest.mark.parametrize("order", ["desc", "asc"])
def test_audit_list_response_strict_shape(client, order: str):
    owner_id = "owner-a"
    project_id = _create_project(client, owner_id=owner_id, title="Audit list shape test")

    # create 1 submission
    submission_id = _evaluate_project(client, owner_id=owner_id, project_id=project_id, artifacts={})
    assert isinstance(submission_id, str)

    r = client.get(
        f"/projects/{project_id}/submissions",
        headers={"X-Owner-Id": owner_id},
        params={"limit": 50, "order": order},
    )
    assert r.status_code == 200, r.text

    data = r.json()
    _assert_audit_list_response_shape(data)

    # must contain the created submission
    ids = [it["submission_id"] for it in data["items"]]
    assert submission_id in ids


def test_audit_detail_response_strict_shape(client):
    owner_id = "owner-a"
    project_id = _create_project(client, owner_id=owner_id, title="Audit detail shape test")
    submission_id = _evaluate_project(client, owner_id=owner_id, project_id=project_id, artifacts={})

    r = client.get(
        f"/submissions/{submission_id}",
        headers={"X-Owner-Id": owner_id},
    )
    assert r.status_code == 200, r.text

    data = r.json()
    _assert_audit_detail_shape(data)

    # sanity: consistent IDs
    assert data["submission_id"] == submission_id
    assert data["project_id"] == project_id


def test_audit_owner_scoping_project_404(client):
    """
    Owner scoping must hide projects/submissions from other owners (404, not 403).
    """
    owner_a = "owner-a"
    owner_b = "owner-b"
    project_id = _create_project(client, owner_id=owner_a, title="Owner scoping test")
    _evaluate_project(client, owner_id=owner_a, project_id=project_id, artifacts={})

    # list submissions with другой owner -> 404 Project not found
    r = client.get(
        f"/projects/{project_id}/submissions",
        headers={"X-Owner-Id": owner_b},
        params={"limit": 50, "order": "desc"},
    )
    assert r.status_code == 404


def test_audit_owner_scoping_submission_404(client):
    owner_a = "owner-a"
    owner_b = "owner-b"
    project_id = _create_project(client, owner_id=owner_a, title="Owner scoping submission test")
    submission_id = _evaluate_project(client, owner_id=owner_a, project_id=project_id, artifacts={})

    r = client.get(
        f"/submissions/{submission_id}",
        headers={"X-Owner-Id": owner_b},
    )
    assert r.status_code == 404

