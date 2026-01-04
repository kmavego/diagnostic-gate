from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GateRef:
    gate_id: str
    gate_version: str


STATE_TO_GATE: dict[str, GateRef] = {
    "DRAFT": GateRef("PROBLEM_VALIDATION_01", "1.1.0"),
    "VALIDATED_PROBLEM": GateRef("GOAL_TO_ADMISSION_02", "1.0.1"),
    "ADMISSION_DEFINED": GateRef("CONTENT_TO_DECISIONS_03", "1.0.0"),
    "DECISIONS_DEFINED": GateRef("ASSESSMENT_TO_ADMISSION_04", "1.0.0"),
    "ADMISSION_ENFORCED": GateRef("UNIVERSALITY_FILTER_05", "1.0.0"),
}

FINAL_STATE = "SCOPE_AND_PATHS_DEFINED"


def gate_for_state(state: str) -> GateRef:
    if state in STATE_TO_GATE:
        return STATE_TO_GATE[state]
    # If already final, "no gate"
    return GateRef("FINAL", "0.0.0")

