"""Tests for the reference analysis and text splitting.

Run from services/chatterbox-service with: python -m pytest tests
"""

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from analysis import (  # noqa: E402
    MAX_CHUNK_CHARS,
    analyze_reference,
    speech_seconds,
    split_text,
    words_per_minute,
)

RATE = 24000


def tone(seconds: float, amplitude: float = 0.3, freq: float = 220.0) -> np.ndarray:
    t = np.arange(int(seconds * RATE)) / RATE
    return (amplitude * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def silence(seconds: float, level: float = 0.0) -> np.ndarray:
    rng = np.random.default_rng(0)
    return (level * rng.standard_normal(int(seconds * RATE))).astype(np.float32)


def statuses(result: dict) -> dict[str, str]:
    return {check["id"]: check["status"] for check in result["checks"]}


def test_a_clean_twelve_second_recording_passes():
    # A 0.12 sine sits around -21 LUFS, inside the advised range.
    wav = np.concatenate([silence(0.2), tone(12, amplitude=0.12), silence(0.5, 0.0001)])
    result = analyze_reference(wav, RATE)
    assert statuses(result) == {
        "duration": "ok", "speech": "ok", "level": "ok", "loudness": "ok", "noise": "ok",
    }
    assert result["duration"] == 12.7
    assert abs(result["leading_silence"] - 0.2) < 0.05
    assert all(check["advice"] for check in result["checks"])


def test_a_short_recording_is_flagged():
    assert statuses(analyze_reference(tone(3), RATE))["duration"] == "warn"


def test_a_long_recording_says_only_the_start_counts():
    check = analyze_reference(tone(25), RATE)["checks"][0]
    assert check["id"] == "duration" and check["status"] == "info"
    assert "10 s" in check["advice"]


def test_leading_silence_over_half_a_second_is_flagged():
    result = analyze_reference(np.concatenate([silence(1.5), tone(10)]), RATE)
    assert statuses(result)["leading_silence"] == "warn"
    assert abs(result["leading_silence"] - 1.5) < 0.05


def test_long_pauses_in_the_first_ten_seconds_are_flagged():
    wav = np.concatenate([tone(2), silence(6), tone(4)])
    assert statuses(analyze_reference(wav, RATE))["speech"] == "warn"


def test_clipping_and_low_level_are_flagged():
    clipped = np.clip(tone(10, amplitude=2.0), -1.0, 1.0)
    assert statuses(analyze_reference(clipped, RATE))["level"] == "warn"
    quiet = tone(10, amplitude=0.05)
    result = analyze_reference(quiet, RATE)
    assert statuses(result)["level"] == "warn"
    assert "baixo" in next(c["advice"] for c in result["checks"] if c["id"] == "level")


def test_background_noise_is_measured_in_the_pauses():
    # Noise at -46 dB: more than 30 dB under the speech, so a pause, but audible.
    wav = np.concatenate([tone(5), silence(1, 0.005), tone(5)])
    result = analyze_reference(wav, RATE)
    assert statuses(result)["noise"] == "warn"
    assert -50 < result["noise_db"] < -40


def test_empty_audio_does_not_crash():
    result = analyze_reference(np.zeros(0, dtype=np.float32), RATE)
    assert statuses(result)["duration"] == "warn"
    assert result["lufs"] is None


def test_speech_seconds_and_pace_leave_pauses_out():
    wav = np.concatenate([tone(3), silence(2), tone(3)])
    assert abs(speech_seconds(wav, RATE) - 6) < 0.2
    # 15 words in 6 s of speech is 150 words per minute.
    assert abs(words_per_minute(" ".join(["palavra"] * 15), wav, RATE) - 150) < 5
    assert words_per_minute("nada", silence(1), RATE) == 0.0


def test_short_text_stays_whole():
    assert split_text("Oi, tudo bem? Olha só.") == ["Oi, tudo bem? Olha só."]


def test_long_text_is_cut_at_sentences_within_the_limit():
    sentence = "Essa regata modela a silhueta na hora e não marca nada no corpo."
    text = " ".join([sentence] * 10)
    chunks = split_text(text)
    assert len(chunks) > 1
    assert all(len(chunk) <= MAX_CHUNK_CHARS for chunk in chunks)
    assert all(chunk.endswith(".") for chunk in chunks)
    assert " ".join(chunks) == text


def test_a_sentence_over_the_limit_is_cut_at_commas_then_spaces():
    commas = ", ".join(["um pedaço de frase sem ponto"] * 20) + "."
    chunks = split_text(commas, limit=100)
    assert all(len(chunk) <= 100 for chunk in chunks)
    assert " ".join(chunks) == commas
    words = " ".join(["palavra"] * 60)
    chunks = split_text(words, limit=50)
    assert all(len(chunk) <= 50 for chunk in chunks)
    assert " ".join(chunks) == words
