import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

try:
    import yaml
except ImportError as e:  # pragma: no cover
    raise RuntimeError("PyYAML is required for contract tests. Add PyYAML to requirements-dev.txt") from e

try:
    from jsonschema import Draft202012Validator
except ImportError as e:  # pragma: no cover
    raise RuntimeError("jsonschema is required for contract tests. Add jsonschema to requirements-dev.txt") from e


# ---- Configuration ----
OPENAPI_PATH = Path(__file__).resolve().parents[1] / "openapi.yaml"
OWNER_ID = "contract-test-owner"
HEADERS = {"X-Owner-Id": OWNER_ID}



def _load_openapi() -> dict:
    if not OPENAPI_PATH.exists():
        raise AssertionError(f"openapi.yaml not found at {OPENAPI_PATH}")
    return yaml.safe_load(OPENAPI_PATH.read_text(encoding="utf-8"))


def _get_schema(openapi: dict, name: str) -> dict:
    schemas = openapi.get("components", {}).get("schemas", {})
    if name not in schemas:
        raise AssertionError(f"Schema '{name}' not found in openapi.yaml components/schemas")
    schema = schemas[name]

    # jsonschema validator expects $schema sometimes; Draft2020-12 works without it
    # Ensure type unions are compatible: OpenAPI 3.1 uses JSON Schema dialect already.
    return schema


def _validator_for(openapi: dict, schema_name: str) -> Draft202012Validator:
    schema = _get_schema(openapi, schema_name)

    # Resolve local refs like "#/components/schemas/Decision"
    # We pass full openapi doc as "root schema" store via resolver-less method:
    # Draft202012Validator can handle refs if we inline a simple ref map with $defs.
    # Easiest/robust: convert components/schemas into $defs and point refs to them.

    defs = openapi.get("components", {}).get("schemas", {})
    # clone schema shallowly
    root = {"$schema": "https://json-schema.org/draft/2020-12/schema", **schema, "$defs": defs}

    # Rewrite OpenAPI $ref targets from "#/components/schemas/X" -> "#/$defs/X"
    def _rewrite_refs(obj):
        if isinstance(obj, dict):
            if "$ref" in obj and isinstance(obj["$ref"], str):
                ref = obj["$ref"]
                if ref.startswith("#/components/schemas/"):
                    obj["$ref"] = ref.replace("#/components/schemas/", "#/$defs/")
            for v in obj.values():
                _rewrite_refs(v)
        elif isinstance(obj, list):
            for v in obj:
                _rewrite_refs(v)

    _rewrite_refs(root)

    return Draft202012Validator(root)


@pytest.fixture(scope="session")
def client() -> TestClient:
    # Import FastAPI app
    # Expected location: backend/app/main.py with "app = FastAPI(...)"
    from backend.app.main import app
    return TestClient(app)


def test_contract_evaluate_response(client: TestClient):
    openapi = _load_openapi()
    v = _validator_for(openapi, "EvaluateResponse")

    # 1) Create project
    r = client.post("/projects", json={"title": "Contract test"}, headers=HEADERS)
    assert r.status_code in (200, 201), r.text
    project_id = r.json()["id"]

    # 2) Evaluate with empty artifacts (MVP expects artifacts object)
    r = client.post(f"/projects/{project_id}/evaluate", json={"artifacts": {}}, headers=HEADERS)
    assert r.status_code == 200, r.text
    data = r.json()

    # Validate against OpenAPI schema
    errors = sorted(v.iter_errors(data), key=lambda e: e.path)
    if errors:
        msg = "\n".join(
            f"- path={list(e.path)} message={e.message} schema_path={list(e.schema_path)}"
            for e in errors
        )
        pytest.fail("EvaluateResponse violates OpenAPI schema:\n" + msg)


def test_contract_ui_schema_response(client: TestClient):
    openapi = _load_openapi()
    v = _validator_for(openapi, "UiSchemaResponse")

    # 1) Create project
    r = client.post("/projects", json={"title": "Contract UI test"}, headers=HEADERS)
    assert r.status_code in (200, 201), r.text
    project_id = r.json()["id"]

    # 2) Get ui-schema
    r = client.get(f"/projects/{project_id}/ui-schema", headers=HEADERS)
    assert r.status_code == 200, r.text
    data = r.json()

    # Validate against OpenAPI schema
    errors = sorted(v.iter_errors(data), key=lambda e: e.path)
    if errors:
        msg = "\n".join(
            f"- path={list(e.path)} message={e.message} schema_path={list(e.schema_path)}"
            for e in errors
        )
        pytest.fail("UiSchemaResponse violates OpenAPI schema:\n" + msg)

