from pathlib import Path
import yaml
import pytest

ROOT = Path(__file__).resolve().parents[1]

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

