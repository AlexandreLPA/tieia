import pytest
from starlette.websockets import WebSocketDisconnect

from app.config import settings


@pytest.fixture
def token(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(settings, "API_TOKEN", "s3cret")
    return "s3cret"


def test_open_when_no_token_is_configured(client) -> None:
    assert client.get("/openapi.json").status_code == 200


def test_rejects_requests_without_the_token(client, token: str) -> None:
    resp = client.get("/api/llm/status")
    assert resp.status_code == 401
    assert resp.json()["detail"].startswith("Missing or invalid")


def test_rejects_a_wrong_token(client, token: str) -> None:
    assert client.get("/api/llm/status", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.get("/api/llm/status", headers={"X-API-Key": "nope"}).status_code == 401


def test_accepts_bearer_and_api_key_headers(client, token: str) -> None:
    assert client.get("/openapi.json", headers={"Authorization": "Bearer s3cret"}).status_code == 200
    assert client.get("/openapi.json", headers={"X-API-Key": "s3cret"}).status_code == 200


def test_health_stays_open_for_probes(client, token: str) -> None:
    assert client.get("/health").status_code == 200


def test_cors_preflight_is_not_blocked(client, token: str) -> None:
    resp = client.options(
        "/api/llm/chat",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"},
    )
    assert resp.status_code == 200


def test_401_still_carries_cors_headers(client, token: str) -> None:
    resp = client.get("/api/llm/status", headers={"Origin": "http://localhost:3000"})
    assert resp.status_code == 401
    assert resp.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_a_non_ascii_token_is_just_wrong(client, token: str) -> None:
    resp = client.get("/api/llm/status", headers={"X-API-Key": "s\xe9cret".encode("latin-1")})
    assert resp.status_code == 401


def test_live_transcription_socket_needs_the_token(client, token: str) -> None:
    with pytest.raises(WebSocketDisconnect) as refused:
        with client.websocket_connect("/ws/transcribe"):
            pass
    assert refused.value.code == 1008


def test_live_transcription_socket_opens_with_the_token(client, token: str) -> None:
    with client.websocket_connect("/ws/transcribe", headers={"Authorization": "Bearer s3cret"}):
        pass
