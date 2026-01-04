def test_ux_messages_has_messages_section(ux_messages):
    assert "messages" in ux_messages and isinstance(ux_messages["messages"], list)

def test_ux_messages_error_codes_unique(ux_messages):
    codes = [m["error_code"] for m in ux_messages["messages"]]
    assert len(codes) == len(set(codes)), "Duplicate error_code found in ux_messages.yaml"

def test_ux_messages_variants_present(ux_messages):
    for m in ux_messages["messages"]:
        variants = m.get("variants", {})
        assert "short" in variants and "normal" in variants and "detailed" in variants, f"Missing variants for {m['error_code']}"

