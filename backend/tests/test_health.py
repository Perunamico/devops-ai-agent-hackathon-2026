from fastapi.testclient import TestClient


def test_health(monkeypatch):
    monkeypatch.setenv("SKIP_AUTH", "true")
    monkeypatch.setenv("FIRESTORE_ENABLED", "false")
    from app.main import app
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
