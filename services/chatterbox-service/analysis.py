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
# Sound shorter than this is a click (a messaging app's record button, a tap on
# the mic), not the voice starting
MIN_SPEECH_PART = 0.25
# Room left before the first word and around shortened pauses
EDGE_PAD = 0.15
# A reference cut to its best stretch: a bit over what the model reads
WINDOW_SECONDS = 10.5
# Pauses longer than this are shortened to KEEP_PAUSE
LONG_PAUSE = 0.6
KEEP_PAUSE = 0.3
TARGET_LUFS = -20.0

# Advice is shown as is in the editor's Voiceover panel, which is in Portuguese.


def speech_parts(wav: np.ndarray) -> np.ndarray:
    """Start and end samples of speech: anything within 30 dB of the loudest part."""
    if not len(wav) or float(np.max(np.abs(wav))) < SILENT_PEAK:
        return np.empty((0, 2), dtype=int)
    return librosa.effects.split(wav, top_db=30)


def sustained_parts(wav: np.ndarray, sample_rate: int) -> np.ndarray:
    """Speech parts without the clicks."""
    parts = speech_parts(wav)
    return parts[(parts[:, 1] - parts[:, 0]) >= MIN_SPEECH_PART * sample_rate] if len(parts) else parts


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
    voice = sustained_parts(wav, sample_rate)
    checks: list[dict] = []
    fixes: list[dict] = []
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
        "fixes": fixes,
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

    if len(voice):
        lead = voice[0][0] / sample_rate
        result["leading_silence"] = round(float(lead), 2)
        if lead > 0.5:
            checks.append(_check(
                "leading_silence", "warn",
                f"{lead:.1f} s de silêncio no começo: corte, ele ocupa os {REFERENCE_SECONDS} s úteis.",
            ))
            fixes.append(_fix(
                "trim_start", "Cortar o silêncio do começo",
                f"A voz só começa aos {lead:.1f} s.",
            ))
        head = wav[: REFERENCE_SECONDS * sample_rate]
        spoken = speech_seconds(head, sample_rate)
        result["speech_seconds"] = round(spoken, 2)
        if total > WINDOW_SECONDS + 2:
            fixes.append(_fix(
                "best_window", f"Ficar só com o melhor trecho de {REFERENCE_SECONDS} s",
                f"A gravação tem {total:.0f} s e só os primeiros {REFERENCE_SECONDS} s são usados; "
                "fica o trecho com mais fala contínua.",
            ))
        if _has_long_pauses(voice, sample_rate):
            fixes.append(_fix(
                "tighten_pauses", "Encurtar as pausas longas",
                f"Pausas de mais de {LONG_PAUSE:.1f} s viram {KEEP_PAUSE:.1f} s, para caber mais fala.",
            ))
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
        # Judged on the whole number shown, so "-16 LUFS" is never called out of range.
        in_range = -26 <= round(loudness) <= -16
        checks.append(_check(
            "loudness", "ok" if in_range else "warn",
            f"Volume médio de {loudness:.0f} LUFS (o ideal fica entre -26 e -16).",
        ))
        if not in_range:
            fixes.append(_fix(
                "normalize", f"Ajustar o volume para {TARGET_LUFS:.0f} LUFS",
                f"Está em {loudness:.0f} LUFS.",
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


def _fix(fix_id: str, label: str, reason: str) -> dict:
    return {"id": fix_id, "label": label, "reason": reason}


def _has_long_pauses(voice: np.ndarray, sample_rate: int) -> bool:
    """A pause that wastes the seconds the model reads, among the first ones."""
    limit = REFERENCE_SECONDS * sample_rate + (voice[0][0] if len(voice) else 0)
    gaps = [
        (start - end) / sample_rate
        for (_, end), (start, _) in zip(voice[:-1], voice[1:])
        if end < limit
    ]
    return any(gap > LONG_PAUSE for gap in gaps)


FIX_ORDER = ("trim_start", "tighten_pauses", "best_window", "normalize")


def apply_fixes(wav: np.ndarray, sample_rate: int, fixes: list[str]) -> np.ndarray:
    """The recording with the chosen fixes, in an order where each helps the next."""
    pad = int(EDGE_PAD * sample_rate)
    for fix in FIX_ORDER:
        if fix not in fixes:
            continue
        voice = sustained_parts(wav, sample_rate)
        if not len(voice):
            break
        if fix == "trim_start":
            wav = wav[max(0, voice[0][0] - pad):]
        elif fix == "tighten_pauses":
            wav = _tighten_pauses(wav, voice, sample_rate)
        elif fix == "best_window":
            wav = _best_window(wav, voice, sample_rate)
        elif fix == "normalize":
            wav = _normalize(wav, sample_rate)
    return wav


def _tighten_pauses(wav: np.ndarray, voice: np.ndarray, sample_rate: int) -> np.ndarray:
    keep = int(KEEP_PAUSE * sample_rate) // 2
    pieces = [wav[: voice[0][1]]]
    for (_, end), (start, next_end) in zip(voice[:-1], voice[1:]):
        if (start - end) / sample_rate > LONG_PAUSE:
            pieces.append(wav[end : end + keep])
            pieces.append(wav[start - keep : next_end])
        else:
            pieces.append(wav[end:next_end])
    pieces.append(wav[voice[-1][1] :])
    return np.concatenate(pieces)


def _best_window(wav: np.ndarray, voice: np.ndarray, sample_rate: int) -> np.ndarray:
    """The stretch, starting where a phrase starts, with the most speech in it."""
    pad = int(EDGE_PAD * sample_rate)
    length = int(WINDOW_SECONDS * sample_rate)
    best_start, best_speech = 0, -1
    for onset, _ in voice:
        start = max(0, onset - pad)
        end = start + length
        speech = sum(max(0, min(b, end) - max(a, start)) for a, b in voice)
        if speech > best_speech:
            best_start, best_speech = start, speech
    end = min(len(wav), best_start + length)
    # End in a pause, not in the middle of a word, unless that loses too much
    endings = [b + pad for a, b in voice if best_start < b + pad <= end]
    if endings and (endings[-1] - best_start) >= 8 * sample_rate:
        end = endings[-1]
    return wav[best_start:end]


def _normalize(wav: np.ndarray, sample_rate: int) -> np.ndarray:
    try:
        loudness = pyloudnorm.Meter(sample_rate).integrated_loudness(wav)
    except ValueError:
        return wav
    if not np.isfinite(loudness):
        return wav
    out = wav * (10 ** ((TARGET_LUFS - loudness) / 20))
    peak = float(np.max(np.abs(out)))
    return out * (0.98 / peak) if peak > 0.98 else out


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
