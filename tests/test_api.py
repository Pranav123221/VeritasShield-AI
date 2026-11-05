from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_rejects_short_claim():
    response = client.post("/api/verify", json={"claim": "short"})
    assert response.status_code == 422
