"""Pure audio measurements for Chatterbox voice cloning.

Nothing here touches the model, so it is tested without torch: what a reference
recording is worth for a clone, how fast a take speaks, and how long text is cut
into pieces the model can say in one go.
"""

import re

import librosa
import numpy as np
import pyloudnorm

# Chatterbox only reads the start of the reference: 10 s for the voice, 6 s for
# the way of speaking.
REFERENCE_SECONDS = 10
ANALYSIS_RATE = 24000
# One generation stops at 1000 speech tokens (about 40 s); pieces of this many
# characters stay well under it, and one sentence at a time also sounds better.
MAX_CHUNK_CHARS = 250

# Under this peak a recording is taken as digital silence: the 30 dB rule below
# is relative to the loudest part, and would call pure silence all speech.
SILENT_PEAK = 1e-4

# Advice is shown as is in the editor's Voiceover panel, which is in Portuguese.


def speech_parts(wav: np.ndarray) -> np.ndarray:
    """Start and end samples of speech: anything within 30 dB of the loudest part."""
    if not len(wav) or float(np.max(np.abs(wav))) < SILENT_PEAK:
        return np.empty((0, 2), dtype=int)
    return librosa.effects.split(wav, top_db=30)


def speech_seconds(wav: np.ndarray, sample_rate: int) -> float:
    """Seconds of speech, leaving out the pauses."""
    return float(sum(end - start for start, end in speech_parts(wav)) / sample_rate)


def words_per_minute(text: str, wav: np.ndarray, sample_rate: int) -> float:
    spoken = speech_seconds(wav, sample_rate)
    return len(text.split()) / (spoken / 60) if spoken else 0.0


def _check(check_id: str, status: str, advice: str) -> dict:
    return {"id": check_id, "status": status, "advice": advice}


def analyze_reference(wav: np.ndarray, sample_rate: int) -> dict:
    """What a recording has that helps or hurts a clone, with what to do about each.

    Each check's status is "ok", "warn" (worth fixing before cloning) or "info".
    """
    total = len(wav) / sample_rate
    parts = speech_parts(wav)
    checks: list[dict] = []
    result: dict = {
        "duration": round(total, 2),
        "reference_seconds": REFERENCE_SECONDS,
        "leading_silence": None,
        "speech_seconds": None,
        "peak": None,
        "clipped_percent": None,
        "lufs": None,
        "noise_db": None,
        "checks": checks,
    }

    if total < 6:
        checks.append(_check("duration", "warn", "Curta demais: grave de 10 a 15 s de fala contínua."))
    elif total > 20:
        checks.append(_check(
            "duration", "info",
            f"Só os primeiros {REFERENCE_SECONDS} s são usados: corte para o melhor trecho.",
        ))
    else:
        checks.append(_check(
            "duration", "ok", f"Boa duração. Lembre que só os primeiros {REFERENCE_SECONDS} s contam.",
        ))

    if len(parts):
        lead = parts[0][0] / sample_rate
        result["leading_silence"] = round(float(lead), 2)
        if lead > 0.5:
            checks.append(_check(
                "leading_silence", "warn",
                f"{lead:.1f} s de silêncio no começo: corte, ele ocupa os {REFERENCE_SECONDS} s úteis.",
            ))
        head = wav[: REFERENCE_SECONDS * sample_rate]
        spoken = speech_seconds(head, sample_rate)
        result["speech_seconds"] = round(spoken, 2)
        if spoken < 0.6 * min(total, REFERENCE_SECONDS):
            checks.append(_check(
                "speech", "warn",
                f"Pouca fala nos primeiros {REFERENCE_SECONDS} s ({spoken:.1f} s): pausas longas demais.",
            ))
        else:
            checks.append(_check(
                "speech", "ok",
                f"Fala contínua nos primeiros {REFERENCE_SECONDS} s ({spoken:.1f} s de fala).",
            ))

    peak = float(np.max(np.abs(wav))) if len(wav) else 0.0
    clipped = float(np.mean(np.abs(wav) >= 0.98)) * 100 if len(wav) else 0.0
    result["peak"] = round(peak, 3)
    result["clipped_percent"] = round(clipped, 3)
    if clipped > 0.05:
        checks.append(_check(
            "level", "warn",
            f"Áudio estourado ({clipped:.2f}% das amostras no limite): grave mais longe do microfone.",
        ))
    elif peak < 0.1:
        checks.append(_check("level", "warn", "Volume muito baixo: grave mais perto do microfone."))
    else:
        checks.append(_check("level", "ok", "Volume sem estouro."))

    try:
        loudness = float(pyloudnorm.Meter(sample_rate).integrated_loudness(wav))
    except ValueError:
        # Shorter than one 400 ms measuring block.
        loudness = float("-inf")
    if np.isfinite(loudness):
        result["lufs"] = round(loudness, 1)
        in_range = -26 <= loudness <= -16
        checks.append(_check(
            "loudness", "ok" if in_range else "warn",
            f"Volume médio de {loudness:.0f} LUFS (o ideal fica entre -26 e -16).",
        ))

    mask = np.ones(len(wav), dtype=bool)
    for start, end in parts:
        mask[start:end] = False
    if mask.sum() > sample_rate * 0.3:
        noise = float(20 * np.log10(np.sqrt(np.mean(wav[mask] ** 2)) + 1e-9))
        result["noise_db"] = round(noise, 1)
        if noise < -50:
            checks.append(_check("noise", "ok", f"Fundo silencioso ({noise:.0f} dB)."))
        else:
            checks.append(_check(
                "noise", "warn", f"Ruído de fundo ({noise:.0f} dB): grave num cômodo mais quieto.",
            ))
    return result


def split_text(text: str, limit: int = MAX_CHUNK_CHARS) -> list[str]:
    """Cut text into pieces of whole sentences, each at most ``limit`` characters.

    A sentence longer than the limit is cut at commas, then at spaces.
    """
    sentences = [s for s in re.split(r"(?<=[.!?…])\s+", text.strip()) if s]
    pieces: list[str] = []
    for sentence in sentences:
        pieces.extend(_split_long(sentence, limit))

    chunks: list[str] = []
    for piece in pieces:
        if chunks and len(chunks[-1]) + 1 + len(piece) <= limit:
            chunks[-1] = f"{chunks[-1]} {piece}"
        else:
            chunks.append(piece)
    return chunks


def _split_long(sentence: str, limit: int) -> list[str]:
    if len(sentence) <= limit:
        return [sentence]
    for separator in (r"(?<=[,;:])\s+", r"\s+"):
        parts = re.split(separator, sentence)
        if len(parts) > 1:
            out: list[str] = []
            for part in parts:
                if out and len(out[-1]) + 1 + len(part) <= limit:
                    out[-1] = f"{out[-1]} {part}"
                else:
                    out.extend(_split_long(part, limit) if separator != r"\s+" else [part])
            return out
    # One word longer than the limit: nothing sensible to cut at.
    return [sentence]
