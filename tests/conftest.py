from pathlib import Path
import sys  # <-- ADD
import yaml
import pytest

ROOT = Path(__file__).resolve().parents[1]

# Ensure repo root is importable regardless of where pytest was started from.
# This fixes imports like: from engine.evaluator import evaluate_gate
if str(ROOT) not in sys.path:  # <-- ADD
    sys.path.insert(0, str(ROOT))  # <-- ADD

def load_yaml(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)

@pytest.fixture(scope="session")
def root():
    return ROOT

@pytest.fixture(scope="session")
def ux_messages(root):
    return load_yaml(root / "ux_messages.yaml")

@pytest.fixture(scope="session")
def artifact_registry(root):
    return load_yaml(root / "artifact_registry.yaml")

@pytest.fixture(scope="session")
def gates_registry(root):
    return load_yaml(root / "gates_registry.yaml")

@pytest.fixture(scope="session")
def state_machine(root):
    return load_yaml(root / "nds_state_machine.yaml")

@pytest.fixture(scope="session")
def corpus_files(root):
    return sorted((root / "corpus").glob("*.examples.yaml"))

@pytest.fixture(scope="session")
def gate_files(root):
    return sorted((root / "gates").glob("*.yaml"))

