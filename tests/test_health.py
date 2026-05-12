from fastapi.testclient import TestClient

from app.main import app


def test_root_health() -> None:
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "loopplan-agent"}


def test_detailed_health() -> None:
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["runtime"] in {"adk", "fallback"}
