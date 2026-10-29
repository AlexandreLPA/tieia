"""Tests for the reference analysis and text splitting.

Run from services/chatterbox-service with: python -m pytest tests
"""

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from analysis import (  # noqa: E402
    apply_fixes,
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


def test_loudness_is_judged_on_the_number_shown():
    # A 0.256 sine measures -15.8 LUFS, shown as -16: inside the range.
    result = analyze_reference(tone(10, amplitude=0.256), RATE)
    assert round(result["lufs"]) == -16
    assert statuses(result)["loudness"] == "ok"
    assert statuses(analyze_reference(tone(10, amplitude=0.6), RATE))["loudness"] == "warn"


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


def fix_ids(result: dict) -> list[str]:
    return [fix["id"] for fix in result["fixes"]]


def test_a_click_before_the_voice_does_not_hide_the_leading_silence():
    # A messaging app's record-button click at 0.75 s, then the voice at 3.6 s
    wav = np.concatenate([silence(0.75), tone(0.1, amplitude=0.3), silence(2.75), tone(10)])
    result = analyze_reference(wav, RATE)
    assert abs(result["leading_silence"] - 3.6) < 0.05
    assert "trim_start" in fix_ids(result)


def test_each_problem_comes_with_its_fix():
    wav = np.concatenate([silence(3), tone(4, amplitude=0.6), silence(2), tone(20, amplitude=0.6)])
    assert fix_ids(analyze_reference(wav, RATE)) == [
        "trim_start", "best_window", "tighten_pauses", "normalize",
    ]
    assert fix_ids(analyze_reference(np.concatenate([silence(0.2), tone(12, amplitude=0.12)]), RATE)) == []


def test_trimming_the_start_keeps_a_little_room_before_the_voice():
    wav = np.concatenate([silence(3), tone(10)])
    fixed = apply_fixes(wav, RATE, ["trim_start"])
    assert abs(len(fixed) / RATE - 10.15) < 0.05


def test_the_best_window_is_the_stretch_with_the_most_speech():
    wav = np.concatenate([tone(2), silence(5), tone(14), silence(1)])
    fixed = apply_fixes(wav, RATE, ["best_window"])
    assert 8 <= len(fixed) / RATE <= 10.6
    # It starts at the long phrase, not at the short one before the pause
    assert speech_seconds(fixed, RATE) > 9.5


def test_long_pauses_are_shortened():
    wav = np.concatenate([tone(3), silence(3), tone(3)])
    fixed = apply_fixes(wav, RATE, ["tighten_pauses"])
    assert abs(len(fixed) / RATE - 6.3) < 0.1


def test_the_volume_goes_to_the_target_without_clipping():
    fixed = apply_fixes(tone(10, amplitude=0.01), RATE, ["normalize"])
    assert abs(round(analyze_reference(fixed, RATE)["lufs"]) - (-20)) <= 1
    assert float(np.max(np.abs(fixed))) <= 0.98
