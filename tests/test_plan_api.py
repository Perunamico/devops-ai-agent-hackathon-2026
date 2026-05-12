from fastapi.testclient import TestClient

from app.main import app


def test_plan_api_success() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/plan",
        json={
            "user_id": "demo_user",
            "message": "Google CloudのAIエージェント開発を2週間で形にしたい",
            "deadline": "2週間後",
            "max_loops": 3,
            "quality_threshold": 80,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["request_id"].startswith("req_")
    assert data["evaluation_score"] >= 0
    assert data["loop_count"] <= 3
    assert data["final_plan"]["steps"]
    assert data["agent_trace"]


def test_empty_message_validation() -> None:
    client = TestClient(app)
    response = client.post("/api/plan", json={"user_id": "demo", "message": ""})
    assert response.status_code == 422
