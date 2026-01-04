import yaml

REQUIRED_TOP = ["gate_id", "version", "scope", "objective", "artifacts", "gates", "transition"]

def test_gate_files_exist(gate_files):
    assert len(gate_files) >= 1, "No /gates/*.yaml files found"

def test_gate_specs_have_required_fields(gate_files):
    for f in gate_files:
        data = yaml.safe_load(f.read_text(encoding="utf-8"))
        for k in REQUIRED_TOP:
            assert k in data, f"Missing '{k}' in gate spec: {f}"
        assert isinstance(data["artifacts"], list) and len(data["artifacts"]) >= 1, f"No artifacts in {f}"
        assert isinstance(data["gates"], list) and len(data["gates"]) >= 1, f"No gates in {f}"
        tr = data["transition"]
        assert "from" in tr and "to" in tr and "require" in tr, f"Bad transition in {f}"

def test_gate_rules_have_error_codes(gate_files):
    for f in gate_files:
        data = yaml.safe_load(f.read_text(encoding="utf-8"))
        for r in data["gates"]:
            assert "error_code" in r and r["error_code"], f"Rule without error_code in {f}"
            assert "reason_class" in r and r["reason_class"], f"Rule without reason_class in {f}"
            assert "message" in r and r["message"], f"Rule without message in {f}"

