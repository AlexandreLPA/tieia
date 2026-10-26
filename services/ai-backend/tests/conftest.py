import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    # No `with`: the lifespan (health warm-up, model checks) is not needed here
    return TestClient(app)
