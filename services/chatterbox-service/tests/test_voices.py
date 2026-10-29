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


def test_improves_as_a_preview_then_saves_and_restores_the_original() -> None:
    path = service.VOICES_DIR / "Longa.wav"
    rate = 16000
    t = np.arange(10 * rate) / rate
    voice = (0.1 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
    soundfile.write(str(path), np.concatenate([np.zeros(3 * rate, dtype=np.float32), voice]), rate)

    preview = client.post("/voices/Longa/improve", json={"fixes": ["trim_start"]})
    assert preview.status_code == 200
    assert preview.headers["content-type"] == "audio/wav"
    assert abs(float(preview.headers["x-audio-duration"]) - 10.15) < 0.1
    assert abs(soundfile.info(str(path)).duration - 13) < 0.01  # nothing saved yet

    saved = client.post("/voices/Longa/improve", json={"fixes": ["trim_start"], "save": True})
    assert saved.status_code == 200
    assert saved.json()["analysis"]["leading_silence"] < 0.5
    assert abs(soundfile.info(str(path)).duration - 10.15) < 0.1
    assert next(v for v in client.get("/voices").json()["voices"] if v["name"] == "Longa")["improved"]

    assert client.post("/voices/Longa/restore").status_code == 200
    assert abs(soundfile.info(str(path)).duration - 13) < 0.01
    assert client.post("/voices/Longa/restore").status_code == 404


def test_unknown_fixes_are_refused() -> None:
    save("Qualquer", 2)
    assert client.post("/voices/Qualquer/improve", json={"fixes": ["apagar_tudo"]}).status_code == 400
