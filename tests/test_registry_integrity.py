def test_gates_registry_has_gates(gates_registry):
    assert "gates" in gates_registry and isinstance(gates_registry["gates"], list) and len(gates_registry["gates"]) >= 1

def test_state_machine_has_transitions(state_machine):
    assert "transitions" in state_machine and isinstance(state_machine["transitions"], list) and len(state_machine["transitions"]) >= 1

def test_registry_gate_refs_match_state_machine(gates_registry, state_machine):
    reg = {(g["gate_id"], g["version"]) for g in gates_registry["gates"]}
    for t in state_machine["transitions"]:
        ref = t.get("gate_ref", {})
        pair = (ref.get("gate_id"), ref.get("version"))
        assert pair in reg, f"State machine transition {t.get('id')} refers to missing gate_ref {pair}"

def test_state_chain_consistency(gates_registry, state_machine):
    reg_by_gate = {g["gate_id"]: g for g in gates_registry["gates"]}
    for t in state_machine["transitions"]:
        ref = t["gate_ref"]["gate_id"]
        g = reg_by_gate.get(ref)
        assert g is not None
        assert t["from"] == g["entry_state"], f"Mismatch: {ref} entry_state vs transition.from"
        assert t["to"] == g["exit_state"], f"Mismatch: {ref} exit_state vs transition.to"

import yaml

def test_ui_mapping_references_valid_artifacts(root, artifact_registry):
    ui_map = yaml.safe_load((root / "artifact_ui_mapping.yaml").read_text(encoding="utf-8"))
    registry_ids = {a["id"] for a in artifact_registry["artifacts"]}
    fields = ui_map.get("fields", [])
    for f in fields:
        aid = f.get("artifact_id")
        assert aid in registry_ids, f"artifact_ui_mapping references unknown artifact_id: {aid}"

