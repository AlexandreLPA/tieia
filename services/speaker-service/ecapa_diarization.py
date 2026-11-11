"""Speaker diarization with an open model, for when pyannote can't be used.

pyannote's pipeline sits behind a Hugging Face login and a terms page, so
without HF_TOKEN this runs instead: it finds the stretches with speech,
takes a voice print of each short window of them with SpeechBrain's ECAPA
model (downloads without an account), and groups the windows whose voices
match. The answer has the same shape as pyannote's.
"""

from __future__ import annotations

import logging
import os
import subprocess

import numpy as np

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000
# Each stretch of speech is cut into pieces of about this length (seconds);
# a voice print needs a couple of seconds to be steady
PIECE = 3.0
# Pieces shorter than this don't shape the groups; they join the closest one
MIN_GROUPING_PIECE = 1.5
# Groups whose voice prints differ more than this (cosine distance, average
# linkage) are different speakers when the number of speakers is not given.
# Measured on a real voice note (one person, compressed audio: 0.48 apart on
# average), two people (0.72 and up) and two similar synthetic male voices
# (0.55): 0.6 told all three right, 0.5 split the one person in three
SAME_SPEAKER_DISTANCE = 0.6

_model = None


def _load_model():
    global _model
    if _model is not None:
        return _model
    import torch
    from speechbrain.inference.speaker import EncoderClassifier
    from speechbrain.utils.fetching import LocalStrategy

    device = "cuda" if torch.cuda.is_available() else "cpu"
    savedir = os.path.join(
        os.getenv("SPEECHBRAIN_DIR", os.path.join(os.path.expanduser("~"), ".cache", "speechbrain")),
        "spkrec-ecapa-voxceleb",
    )
    logger.info("Loading SpeechBrain ECAPA on %s...", device)
    _model = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb",
        savedir=savedir,
        run_opts={"device": device},
        # Copies instead of linking: Windows needs special rights for links
        local_strategy=LocalStrategy.COPY,
    )
    return _model


def is_available() -> bool:
    try:
        import speechbrain  # noqa: F401

        return True
    except ImportError:
        return False


def load_audio(path: str) -> np.ndarray:
    """The file's audio as 16 kHz mono floats, decoded by ffmpeg."""
    proc = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-i", path,
            "-f", "s16le", "-acodec", "pcm_s16le", "-ar", str(SAMPLE_RATE), "-ac", "1",
            "pipe:1",
        ],
        capture_output=True,
        timeout=600,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr.decode(errors='replace')[:300]}")
    return np.frombuffer(proc.stdout, dtype=np.int16).astype(np.float32) / 32768.0


def speech_regions(audio: np.ndarray) -> list[tuple[float, float]]:
    """Stretches with speech, by loudness against the recording's own quiet."""
    frame = int(0.03 * SAMPLE_RATE)
    count = len(audio) // frame
    if count == 0:
        return []
    frames = audio[: count * frame].reshape(count, frame)
    db = 20 * np.log10(np.sqrt((frames**2).mean(axis=1)) + 1e-9)
    floor = np.percentile(db, 10)
    peak = np.percentile(db, 95)
    # Halfway between the quiet and the loud parts, at least 12 dB above quiet
    threshold = max(floor + 12, (floor + peak) / 2 - 6)
    voiced = db > threshold

    regions: list[list[float]] = []
    for index, is_voiced in enumerate(voiced):
        if not is_voiced:
            continue
        start, end = index * 0.03, (index + 1) * 0.03
        # Pauses under 0.3 s stay inside the stretch
        if regions and start - regions[-1][1] < 0.3:
            regions[-1][1] = end
        else:
            regions.append([start, end])
    return [(start, end) for start, end in regions if end - start >= 0.4]


def _pieces(regions: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Each stretch of speech split evenly into pieces of about PIECE seconds."""
    pieces = []
    for start, end in regions:
        count = max(1, round((end - start) / PIECE))
        step = (end - start) / count
        pieces.extend((start + i * step, start + (i + 1) * step) for i in range(count))
    return pieces


def _cluster(
    prints: np.ndarray,
    num_speakers: int | None,
    min_speakers: int | None,
    max_speakers: int | None,
) -> np.ndarray:
    from scipy.cluster.hierarchy import fcluster, linkage

    if len(prints) == 1:
        return np.array([1])
    tree = linkage(prints, method="average", metric="cosine")
    if num_speakers:
        return fcluster(tree, num_speakers, criterion="maxclust")
    labels = fcluster(tree, SAME_SPEAKER_DISTANCE, criterion="distance")
    found = len(set(labels))
    if max_speakers and found > max_speakers:
        labels = fcluster(tree, max_speakers, criterion="maxclust")
    elif min_speakers and found < min_speakers:
        labels = fcluster(tree, min_speakers, criterion="maxclust")
    return labels


def diarize(
    path: str,
    num_speakers: int | None = None,
    min_speakers: int | None = None,
    max_speakers: int | None = None,
) -> list[dict]:
    """[{"speaker": "SPEAKER_A", "start": 0.0, "end": 5.2}, ...]"""
    import torch

    audio = load_audio(path)
    pieces = _pieces(speech_regions(audio))
    if not pieces:
        return []

    model = _load_model()
    prints = []
    with torch.no_grad():
        for start, end in pieces:
            chunk = audio[int(start * SAMPLE_RATE) : int(end * SAMPLE_RATE)]
            tensor = torch.from_numpy(chunk.copy()).unsqueeze(0)
            prints.append(model.encode_batch(tensor).squeeze().cpu().numpy())
    prints_array = np.stack(prints)
    prints_array /= np.linalg.norm(prints_array, axis=1, keepdims=True) + 1e-9

    # The longer pieces make the groups; the short ones join the closest
    long_enough = np.array([end - start >= MIN_GROUPING_PIECE for start, end in pieces])
    if not long_enough.any():
        long_enough[:] = True
    labels = np.zeros(len(pieces), dtype=int)
    labels[long_enough] = _cluster(
        prints_array[long_enough], num_speakers, min_speakers, max_speakers
    )
    groups = sorted(set(labels[long_enough]))
    centroids = np.stack([prints_array[labels == group].mean(axis=0) for group in groups])
    centroids /= np.linalg.norm(centroids, axis=1, keepdims=True) + 1e-9
    for index in np.flatnonzero(~long_enough):
        labels[index] = groups[int(np.argmax(centroids @ prints_array[index]))]

    # Neighbouring pieces with the same voice join into one segment; speakers
    # are named in the order they first speak
    segments: list[dict] = []
    names: dict[int, str] = {}
    for (start, end), label in zip(pieces, labels):
        name = names.setdefault(int(label), f"SPEAKER_{chr(65 + len(names))}")
        if segments and segments[-1]["speaker"] == name and start - segments[-1]["end"] < 1.0:
            segments[-1]["end"] = end
        else:
            segments.append({"speaker": name, "start": start, "end": end})
    return [
        {"speaker": seg["speaker"], "start": round(seg["start"], 2), "end": round(seg["end"], 2)}
        for seg in segments
    ]
