"""A video with no speech must transcribe to zero segments, not a 500.

Run from services/whisper-service with: python -m pytest tests

The model here is faster-whisper's own WhisperModel without its weights: the
failure happened in its language detection, before any decoding, so the real
library code runs and the 3 GB model is not needed.
"""

import io
import logging
import os
import sys
import tempfile
import types
import wave
from pathlib import Path

os.environ["UPLOAD_DIR"] = tempfile.mkdtemp()
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from faster_whisper import WhisperModel  # noqa: E402
from faster_whisper.feature_extractor import FeatureExtractor  # noqa: E402

import app as service  # noqa: E402

client = TestClient(service.app)


def silent_wav(seconds: float = 5.0, rate: int = 16000) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(b"\x00\x00" * int(seconds * rate))
    return buffer.getvalue()


def weightless_model() -> WhisperModel:
    model = object.__new__(WhisperModel)
    model.logger = logging.getLogger("faster_whisper")
    model.feature_extractor = FeatureExtractor()
    model.model = types.SimpleNamespace(is_multilingual=True)
    model.frames_per_second = (
        model.feature_extractor.sampling_rate // model.feature_extractor.hop_length
    )
    return model


@pytest.fixture
def loaded(monkeypatch: pytest.MonkeyPatch) -> WhisperModel:
    model = weightless_model()
    monkeypatch.setattr(service.whisper_service, "_model", model)
    monkeypatch.setattr(service.whisper_service, "_device", "cpu")
    return model


def test_the_library_alone_fails_on_silence(tmp_path: Path) -> None:
    # What the service used to hit: the VAD removes everything, then the
    # language detection takes max() of nothing
    path = tmp_path / "silence.wav"
    path.write_bytes(silent_wav())
    with pytest.raises(ValueError, match="empty sequence"):
        weightless_model().transcribe(str(path), vad_filter=True, vad_parameters=service.VAD_PARAMETERS)


def test_silent_audio_transcribes_to_zero_segments(loaded: WhisperModel) -> None:
    resp = client.post("/transcribe", files={"file": ("silencio.wav", silent_wav(5), "audio/wav")})
    assert resp.status_code == 200
    body = resp.json()
    assert body["segments"] == []
    assert body["text"] == ""
    assert body["duration"] == 5.0


def test_a_requested_language_is_kept(loaded: WhisperModel) -> None:
    resp = client.post(
        "/transcribe",
        files={"file": ("silencio.wav", silent_wav(1), "audio/wav")},
        data={"language": "pt"},
    )
    assert resp.status_code == 200
    assert resp.json()["language"] == "pt"


def test_audio_with_speech_still_goes_to_the_model(
    loaded: WhisperModel, monkeypatch: pytest.MonkeyPatch
) -> None:
    import faster_whisper.vad

    calls: list[dict] = []

    def fake_transcribe(audio, **kwargs):
        calls.append({"samples": len(audio), **kwargs})
        return iter(()), types.SimpleNamespace(language="pt", duration=len(audio) / 16000)

    monkeypatch.setattr(
        faster_whisper.vad, "get_speech_timestamps", lambda audio, options: [{"start": 0, "end": 8000}]
    )
    monkeypatch.setattr(loaded, "transcribe", fake_transcribe)
    resp = client.post("/transcribe", files={"file": ("fala.wav", silent_wav(2), "audio/wav")})
    assert resp.status_code == 200
    assert len(calls) == 1
    # The audio decoded for the check is the one transcribed: no second decode
    assert calls[0]["samples"] == 32000
    assert calls[0]["vad_filter"] is True
