"""Emotional arc from the clip's loudness curve.

Short-form retention needs a strong opening, variation instead of one flat
tone, the most intense moment late enough to keep people watching, an ending
that doesn't fizzle out, and no dead air. All are read from a 0.25 s loudness
envelope of the whole clip.
"""

from dataclasses import dataclass

import numpy as np

WINDOW_S = 0.25
OPEN_S = 3.0
# Peak detection uses a ~2 s average so a single shout doesn't count
SMOOTH_S = 2.0
# Pauses at least this long in the middle feel like dead air
DEAD_AIR_S = 1.2
EDGE_S = 0.5
MIN_DURATION_S = 2.0

# Points per part (sum 100). Where the climax lands matters most for
# retention; raw loudness variation the least
OPEN_POINTS = 20
CONTRAST_POINTS = 15
PEAK_POINTS = 30
ENDING_POINTS = 10
CONTINUITY_POINTS = 25
DEAD_AIR_PENALTY = 9


@dataclass
class ArcResult:
    composite: float
    has_strong_open: bool
    has_buildup: bool
    has_peak: bool
    peak_position: float
    dominant_emotion: str
    dynamic_range_db: float
    dead_air_count: int
    dead_air_seconds: float
    open_score: float
    contrast_score: float
    peak_score: float
    ending_score: float
    continuity_score: float


def _ramp(value: float, low: float, high: float) -> float:
    """0 at `low`, 1 at `high`, clamped."""
    return float(np.clip((value - low) / (high - low), 0.0, 1.0))


def analyze_arc(samples: np.ndarray, sample_rate: int) -> ArcResult | None:
    """`samples` are mono floats in -1..1. None when the clip is too short."""
    window = int(sample_rate * WINDOW_S)
    count = len(samples) // window
    if window <= 0 or count * WINDOW_S < MIN_DURATION_S:
        return None

    frames = samples[: count * window].reshape(count, window).astype(np.float64)
    power = np.mean(frames**2, axis=1)
    db = 10 * np.log10(np.maximum(power, 1e-10))

    # Silence is relative to the clip's own level (phone audio is quiet)
    silence_floor = max(-50.0, float(np.median(db)) - 20.0)
    voiced = db >= silence_floor
    if voiced.sum() < max(4, count * 0.15):
        # Barely any sound at all: nothing to build an arc from
        return ArcResult(
            composite=10.0, has_strong_open=False, has_buildup=False,
            has_peak=False, peak_position=0.0, dominant_emotion="calm",
            dynamic_range_db=0.0, dead_air_count=0, dead_air_seconds=0.0,
            open_score=0.0, contrast_score=0.0, peak_score=0.0,
            ending_score=0.0, continuity_score=10.0,
        )
    voiced_db = db[voiced]
    level = float(np.median(voiced_db))

    # 1. Opening: the first seconds should be at least as intense as the rest
    open_windows = max(1, int(min(OPEN_S, count * WINDOW_S * 0.15 + 1) / WINDOW_S))
    open_db = db[:open_windows]
    open_level = float(np.percentile(open_db, 75))
    open_score = OPEN_POINTS * _ramp(open_level - level, -8.0, 0.0)

    # 2. Variation between stretches of the clip, read on a ~2 s average:
    # raw 0.25 s windows swing with every pause between words, so almost
    # any real speech looked "varied"
    smooth_len = max(1, int(SMOOTH_S / WINDOW_S))
    smooth = np.convolve(power, np.ones(smooth_len) / smooth_len, mode="same")
    smooth_db = 10 * np.log10(np.maximum(smooth, 1e-10))[voiced]
    dynamic = float(np.percentile(smooth_db, 90) - np.percentile(smooth_db, 10))
    contrast_score = CONTRAST_POINTS * _ramp(dynamic, 2.0, 8.0)

    # 3. Where the most intense stretch lands
    peak_index = int(np.argmax(smooth))
    position = (peak_index + 0.5) / count
    if 0.4 <= position <= 0.9:
        placement = 1.0
    elif 0.25 <= position < 0.4 or position > 0.9:
        placement = 0.6
    elif position >= 0.15:
        placement = 0.35
    else:
        # Everything after the first seconds is downhill
        placement = 0.15
    # A peak barely above the rest isn't a climax
    peak_score = PEAK_POINTS * placement * _ramp(dynamic, 1.5, 5.0)

    # Ending: the last stretch shouldn't fade far below the clip's level
    edge = int(EDGE_S / WINDOW_S)
    tail_start = int(count * 0.8)
    tail = db[tail_start : max(tail_start + 1, count - edge)]
    tail_voiced = tail[tail >= silence_floor]
    tail_level = float(np.median(tail_voiced)) if len(tail_voiced) else silence_floor
    ending_score = ENDING_POINTS * _ramp(tail_level - level, -8.0, -1.0)

    # 4. Dead air: long silent runs away from the clip's edges
    min_run = int(np.ceil(DEAD_AIR_S / WINDOW_S))
    dead_count = 0
    dead_windows = 0
    run = 0
    for index in range(edge, count - edge):
        if not voiced[index]:
            run += 1
            continue
        if run >= min_run:
            dead_count += 1
            dead_windows += run
        run = 0
    if run >= min_run:
        dead_count += 1
        dead_windows += run
    continuity_score = max(0.0, CONTINUITY_POINTS - DEAD_AIR_PENALTY * dead_count)

    half = count // 2
    first_half = db[:half][voiced[:half]]
    second_half = db[half:][voiced[half:]]
    rising = (
        len(first_half) > 0
        and len(second_half) > 0
        and float(np.median(second_half)) >= float(np.median(first_half)) - 1.0
    )

    if level > -24 and dynamic > 6:
        dominant = "excited"
    elif level > -32:
        dominant = "engaged"
    else:
        dominant = "calm"

    return ArcResult(
        composite=round(
            open_score + contrast_score + peak_score + ending_score + continuity_score, 1
        ),
        has_strong_open=open_score >= 18,
        has_buildup=rising and position >= 0.4 and dynamic >= 3,
        has_peak=dynamic >= 4,
        peak_position=round(position, 3),
        dominant_emotion=dominant,
        dynamic_range_db=round(dynamic, 1),
        dead_air_count=dead_count,
        dead_air_seconds=round(dead_windows * WINDOW_S, 2),
        open_score=round(open_score, 1),
        contrast_score=round(contrast_score, 1),
        peak_score=round(peak_score, 1),
        ending_score=round(ending_score, 1),
        continuity_score=round(continuity_score, 1),
    )
