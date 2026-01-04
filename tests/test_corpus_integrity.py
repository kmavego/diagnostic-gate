import yaml

def _collect_ux_error_codes(ux_messages) -> set[str]:
    return {m["error_code"] for m in ux_messages["messages"]}

def test_corpus_files_exist(corpus_files):
    assert len(corpus_files) >= 1, "No corpus/*.examples.yaml files found"

def test_corpus_structure(corpus_files):
    for f in corpus_files:
        data = yaml.safe_load(f.read_text(encoding="utf-8"))
        assert "gate_id" in data and "version" in data and "cases" in data, f"Invalid corpus file: {f}"
        assert isinstance(data["cases"], list) and len(data["cases"]) >= 1, f"Empty cases in {f}"
        for case in data["cases"]:
            assert "id" in case and "input" in case and "expected" in case, f"Bad case in {f}"
            assert case["expected"].get("decision") in ("PASS", "BLOCK"), f"Bad expected.decision in {f}:{case.get('id')}"

def test_corpus_expected_errors_exist_in_ux(ux_messages, corpus_files):
    ux_codes = _collect_ux_error_codes(ux_messages)
    for f in corpus_files:
        data = yaml.safe_load(f.read_text(encoding="utf-8"))
        for case in data["cases"]:
            exp = case["expected"]
            if exp.get("decision") == "BLOCK":
                errors = exp.get("errors", [])
                assert isinstance(errors, list) and len(errors) >= 1, f"BLOCK case must include errors: {f}:{case['id']}"
                for e in errors:
                    code = e.get("error_code")
                    assert code in ux_codes, f"Unknown error_code '{code}' in {f}:{case['id']} (not in ux_messages.yaml)"

