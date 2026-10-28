import pytest
from fastapi import HTTPException

from app.config import settings
from app.routes import tts
from app.services import edge_tts_service


@pytest.fixture
def local_tts_down(monkeypatch: pytest.MonkeyPatch) -> None:
    async def down() -> None:
        raise HTTPException(status_code=503, detail="TTS service is not running.")

    monkeypatch.setattr(tts, "_check_tts_ready", down)


@pytest.fixture
def fallback_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "TTS_EDGE_FALLBACK", True)


def test_off_by_default_so_the_text_stays_here(
    client, local_tts_down, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def never(*args: object) -> bytes:
        raise AssertionError("the text was sent to edge-tts")

    monkeypatch.setattr(tts.edge_tts_service, "synthesize", never)
    assert settings.TTS_EDGE_FALLBACK is False
    assert client.post("/api/tts/generate", json={"text": "Olá", "language": "pt"}).status_code == 503


def test_falls_back_to_edge_tts_when_local_service_is_down(
    client, local_tts_down, fallback_on, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[tuple] = []

    async def fake_synthesize(text: str, language: str, voice: str | None, speed: float) -> bytes:
        calls.append((text, language, voice, speed))
        return b"mp3-bytes"

    monkeypatch.setattr(tts.edge_tts_service, "synthesize", fake_synthesize)
    resp = client.post("/api/tts/generate", json={"text": "Olá", "language": "pt"})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/mpeg"
    assert "synthetic" in resp.headers["x-tts-provider"]
    assert resp.content == b"mp3-bytes"
    assert calls == [("Olá", "pt", None, 1.0)]


def test_voice_cloning_never_goes_to_the_cloud(client, local_tts_down, fallback_on) -> None:
    resp = client.post("/api/tts/generate", json={"text": "Olá", "language": "pt", "speakerWav": "me.wav"})
    assert resp.status_code == 503


def test_reports_both_errors_when_the_fallback_also_fails(
    client, local_tts_down, fallback_on, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def boom(*args: object) -> bytes:
        raise RuntimeError("no network")

    monkeypatch.setattr(tts.edge_tts_service, "synthesize", boom)
    resp = client.post("/api/tts/generate", json={"text": "Olá", "language": "pt"})
    assert resp.status_code == 503
    assert "not running" in resp.json()["detail"] and "no network" in resp.json()["detail"]


def test_voice_choice_per_language() -> None:
    assert edge_tts_service.pick_voice("pt") == "pt-BR-AntonioNeural"
    assert edge_tts_service.pick_voice("pt-BR") == "pt-BR-AntonioNeural"
    assert edge_tts_service.pick_voice("xx") == "en-US-GuyNeural"
    assert edge_tts_service.pick_voice("pt", "en-GB-RyanNeural") == "en-GB-RyanNeural"


def test_the_voiceover_panel_gender_picks_an_edge_voice() -> None:
    # The Voiceover panel sends speaker "male"/"female"; edge-tts refuses those as voice names
    assert edge_tts_service.pick_voice("pt", "female") == "pt-BR-FranciscaNeural"
    assert edge_tts_service.pick_voice("pt", "male") == "pt-BR-AntonioNeural"
    assert edge_tts_service.pick_voice("en", "Claribel Dervla") == "en-US-GuyNeural"


def test_every_default_voice_has_a_name_edge_tts_accepts() -> None:
    edge_tts = pytest.importorskip("edge_tts")
    for voices in edge_tts_service.DEFAULT_VOICES.values():
        for voice in voices.values():
            edge_tts.Communicate("oi", voice)  # raises ValueError for a malformed name
