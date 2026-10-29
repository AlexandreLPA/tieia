"""Tests for the saved voices: list, listen, delete.

Run from services/chatterbox-service with: python -m pytest tests
"""

import os
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile

# The service creates its voices folder at import
os.environ["GENERATED_DIR"] = tempfile.mkdtemp()
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import app as service  # noqa: E402

client = TestClient(service.app)


def save(name: str, seconds: float) -> Path:
    path = service.VOICES_DIR / f"{name}.wav"
    soundfile.write(str(path), np.zeros(int(seconds * 16000), dtype=np.float32), 16000)
    return path


def test_lists_saved_voices_newest_first_without_temporary_uploads() -> None:
    old = save("Antiga", 12)
    os.utime(old, (1_000, 1_000))
    save("Nova", 10.5)
    save("_upload_abc123", 3)

    voices = client.get("/voices").json()["voices"]
    assert [voice["name"] for voice in voices] == ["Nova", "Antiga"]
    assert voices[0]["duration"] == 10.5
    assert voices[0]["path"].endswith("Nova.wav")


def test_plays_and_deletes_a_voice() -> None:
    save("Apagar", 2)
    audio = client.get("/voices/Apagar/audio")
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/wav"

    assert client.delete("/voices/Apagar").status_code == 200
    assert client.get("/voices/Apagar/audio").status_code == 404


def test_refuses_names_that_leave_the_voices_folder() -> None:
    outside = Path(os.environ["GENERATED_DIR"]) / "segredo.wav"
    soundfile.write(str(outside), np.zeros(1600, dtype=np.float32), 16000)
    assert client.delete("/voices/..%2Fsegredo").status_code == 404
    assert outside.exists()
