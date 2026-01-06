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

# ===============================
# HTTP / API test infrastructure
# ===============================

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool # <-- важно

from backend.app.main import app
from backend.app.db import Base, get_db


@pytest.fixture(scope="session")
def test_engine():
    """
    Отдельный SQLite in-memory engine для HTTP тестов.

    IMPORTANT:
    For SQLite in-memory, tables disappear across connections unless we use StaticPool
    and "sqlite://" (single shared in-memory DB for the whole test session).
    """
    engine = create_engine(
        "sqlite://", # <-- важно (не sqlite:///:memory:)
        connect_args={"check_same_thread": False},
        poolclass=StaticPool, # <-- важно
    )
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture(scope="function")
def db(test_engine):
    """
    SQLAlchemy Session, откатывается после каждого теста.
    """

    connection = test_engine.connect()
    transaction = connection.begin()

    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=connection,
    )
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture(scope="function")
def client(db):
    """
    FastAPI TestClient с override get_db → test session.
    """
    def _override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

