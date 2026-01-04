import yaml
import pytest

from engine.evaluator import evaluate_gate


def _load_yaml(path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _iter_cases(root):
    corpus_dir = root / "corpus"
    for f in sorted(corpus_dir.glob("*.examples.yaml")):
        data = _load_yaml(f)
        gate_id = data["gate_id"]
        gate_version = data["version"]
        for case in data["cases"]:
            yield f.name, gate_id, gate_version, case


def _normalize_errors(errors):
    """
    Normalize errors for stable comparison.
    Corpus may omit reason_class; we compare only artifact_id + error_code.
    """
    norm = []
    for e in errors or []:
        norm.append({
            "artifact_id": e.get("artifact_id"),
            "error_code": e.get("error_code"),
        })
    return sorted(norm, key=lambda x: (x["artifact_id"] or "", x["error_code"] or ""))



def pytest_generate_tests(metafunc):
    if {"corpus_file", "gate_id", "gate_version", "case"}.issubset(set(metafunc.fixturenames)):
        root = metafunc.config.rootpath  # pathlib.Path
        cases = list(_iter_cases(root))
        metafunc.parametrize("corpus_file, gate_id, gate_version, case", cases)


def test_engine_matches_corpus_expected(root, corpus_file, gate_id, gate_version, case):
    expected = case["expected"]
    decision_expected = expected.get("decision")
    input_artifacts = case.get("input", {})

    # Keep simple until you add explicit from_state in corpus:
    state = "UNKNOWN"

    result = evaluate_gate(
        gate_id=gate_id,
        gate_version=gate_version,
        state=state,
        artifacts=input_artifacts,
    )

    assert result.get("decision") == decision_expected, f"{corpus_file}:{case['id']} decision mismatch"

    if decision_expected == "PASS":
        if "next_state" in expected:
            assert result.get("next_state") == expected.get("next_state"), f"{corpus_file}:{case['id']} next_state mismatch"
    else:
        exp_errors = expected.get("errors", [])
        assert exp_errors and isinstance(exp_errors, list), f"{corpus_file}:{case['id']} BLOCK must declare expected.errors"

        got_errors_norm = _normalize_errors(result.get("errors"))
        exp_errors_norm = _normalize_errors(exp_errors)

        # Require expected errors to be present; allow engine to return extra errors.
        missing = [e for e in exp_errors_norm if e not in got_errors_norm]
        assert not missing, (
            f"{corpus_file}:{case['id']} missing expected errors: {missing}\n"
            f"Got: {got_errors_norm}"
        )

