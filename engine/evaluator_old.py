from typing import Any, Dict, List, TypedDict, Optional


class NotImplementedEngine(Exception):
    """
    Raised when the evaluation engine is not yet implemented.
    Used by regression tests to trigger pytest.skip.
    """
    pass


class EngineError(TypedDict, total=False):
    artifact_id: str
    error_code: str
    reason_class: str
    message_variant: str  # "short" | "normal" | "detailed"
    message: str
    offending_spans: List[Dict[str, Any]]
    missing_fields: List[str]


class EngineResult(TypedDict, total=False):
    decision: str          # "PASS" | "BLOCK"
    next_state: Optional[str]
    errors: List[EngineError]


def evaluate_gate(
    *,
    gate_id: str,
    gate_version: str,
    state: str,
    artifacts: Dict[str, Any],
) -> EngineResult:
    """
    Contract placeholder. Replace with real engine implementation.

    This stub MUST raise NotImplementedEngine so that
    engine regression tests are skipped (not failed)
    until a real evaluator is implemented.
    """
    raise NotImplementedEngine(
        "Engine not implemented yet. "
        "Corpus regression tests are skipped by design."
    )


__all__ = [
    "evaluate_gate",
    "NotImplementedEngine",
    "EngineResult",
    "EngineError",
]

