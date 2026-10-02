"""Engagement scoring, YouTube ingest, and clip models."""

from pydantic import BaseModel, Field, computed_field


# ── Sub-scores ────────────────────────────────────────────────────────


class HookScore(BaseModel):
    """Hook strength of the first ~3 seconds."""

    visual_novelty: float = 0.0
    audio_energy_spike: float = 0.0
    early_face_present: bool = False
    hook_type: str = "neutral"
    hook_type_confidence: float = 0.0
    speech_rate: float = 0.0
    composite: float = 50.0
    # False when the signal had nothing to measure (no media, LLM failed);
    # the composite then leaves it out instead of counting a fake 50
    measured: bool = False


class CuriosityScore(BaseModel):
    """Curiosity-gap signals in the transcript."""

    has_question: bool = False
    has_bold_claim: bool = False
    has_open_loop: bool = False
    gap_count: int = 0
    composite: float = 50.0
    # False when the signal had nothing to measure (no media, LLM failed);
    # the composite then leaves it out instead of counting a fake 50
    measured: bool = False


class EnergyScore(BaseModel):
    """Audio energy dynamics."""

    mean_energy: float = 0.0
    peak_energy: float = 0.0
    energy_variance: float = 0.0
    has_dynamic_range: bool = False
    composite: float = 50.0
    # False when the signal had nothing to measure (no media, LLM failed);
    # the composite then leaves it out instead of counting a fake 50
    measured: bool = False


class AudioSyncScore(BaseModel):
    """Beat / caption sync quality."""

    bpm: float | None = None
    beat_count: int = 0
    caption_beat_alignment: float = 0.0
    composite: float = 50.0
    # False when the signal had nothing to measure (no media, LLM failed);
    # the composite then leaves it out instead of counting a fake 50
    measured: bool = False


class FacePresenceScore(BaseModel):
    """Face presence ratio vs optimal 30–40% target."""

    face_ratio: float = 0.0
    is_optimal: bool = False
    early_face_present: bool = False
    composite: float = 50.0
    # False when the signal had nothing to measure (no media, LLM failed);
    # the composite then leaves it out instead of counting a fake 50
    measured: bool = False


class EmotionalArcScore(BaseModel):
    """Emotional arc / pacing structure."""

    has_strong_open: bool = False
    has_buildup: bool = False
    has_peak: bool = False
    peak_timestamp: float = 0.0
    dominant_emotion: str = "calm"
    # Loudness spread between quieter and louder stretches (p90 - p10, ~2 s average)
    dynamic_range_db: float = 0.0
    dead_air_count: int = 0
    dead_air_seconds: float = 0.0
    composite: float = 50.0
    # False when the signal had nothing to measure (no media, LLM failed);
    # the composite then leaves it out instead of counting a fake 50
    measured: bool = False


class ViralityScore(BaseModel):
    """LLM-predicted viral potential."""

    hook_strength: int = 0
    shareability: int = 0
    emotional_impact: int = 0
    standalone_value: int = 0
    reason: str = ""
    suggested_title: str = ""
    composite: float = 50.0
    # False when the signal had nothing to measure (no media, LLM failed);
    # the composite then leaves it out instead of counting a fake 50
    measured: bool = False


class EnhancementSuggestion(BaseModel):
    """Actionable improvement suggestion for a weak engagement signal."""

    signal: str
    current_score: float
    suggestion: str
    action_type: str = "manual"
    expected_impact: str = "medium"


# ── Aggregate score ───────────────────────────────────────────────────


def _grade_for_score(composite: float) -> tuple[str, str]:
    """Map a 0–100 composite score to (grade letter, label)."""
    if composite >= 85:
        return "A", "Excelente"
    if composite >= 70:
        return "B", "Forte"
    if composite >= 50:
        return "C", "Na média"
    if composite >= 35:
        return "D", "Abaixo da média"
    return "F", "Precisa melhorar"


class EngagementScore(BaseModel):
    """Full engagement breakdown with composite score and suggestions."""

    hook: HookScore = Field(default_factory=HookScore)
    curiosity: CuriosityScore = Field(default_factory=CuriosityScore)
    energy: EnergyScore = Field(default_factory=EnergyScore)
    audio_sync: AudioSyncScore = Field(default_factory=AudioSyncScore)
    face_presence: FacePresenceScore = Field(default_factory=FacePresenceScore)
    emotional_arc: EmotionalArcScore = Field(default_factory=EmotionalArcScore)
    virality: ViralityScore = Field(default_factory=ViralityScore)
    suggestions: list[EnhancementSuggestion] = Field(default_factory=list)

    def _weighted_signals(self) -> list[tuple[str, float, float, bool]]:
        from app.config import settings

        return [
            ("hook", self.hook.composite, settings.ENGAGEMENT_HOOK_WEIGHT, self.hook.measured),
            ("curiosity", self.curiosity.composite, settings.ENGAGEMENT_CURIOSITY_WEIGHT, self.curiosity.measured),
            ("virality", self.virality.composite, settings.ENGAGEMENT_VIRALITY_WEIGHT, self.virality.measured),
            ("energy", self.energy.composite, settings.ENGAGEMENT_ENERGY_WEIGHT, self.energy.measured),
            ("emotional_arc", self.emotional_arc.composite, settings.ENGAGEMENT_EMOTION_WEIGHT, self.emotional_arc.measured),
            ("audio_sync", self.audio_sync.composite, settings.ENGAGEMENT_AUDIO_SYNC_WEIGHT, self.audio_sync.measured),
            ("face_presence", self.face_presence.composite, settings.ENGAGEMENT_FACE_WEIGHT, self.face_presence.measured),
        ]

    def evaluated_signals(self) -> list[str]:
        return [name for name, _, _, measured in self._weighted_signals() if measured]

    def compute_composite(self) -> float:
        """Weighted average over the signals that were actually measured.

        Unmeasured signals used to count as a flat 50, which capped
        transcript-only scores at a C no matter how good the clip was.
        """
        signals = [s for s in self._weighted_signals() if s[3]]
        total_weight = sum(weight for _, _, weight, _ in signals)
        if total_weight <= 0:
            return 50.0
        return sum(value * weight for _, value, weight, _ in signals) / total_weight

    def to_response(self) -> dict:
        """Serialize to the API shape expected by the web client."""
        composite = round(min(100.0, max(0.0, self.compute_composite())), 1)
        grade, grade_label = _grade_for_score(composite)
        return {
            "hook": self.hook.model_dump(),
            "curiosity": self.curiosity.model_dump(),
            "energy": self.energy.model_dump(),
            "audio_sync": self.audio_sync.model_dump(),
            "face_presence": self.face_presence.model_dump(),
            "emotional_arc": self.emotional_arc.model_dump(),
            "virality": self.virality.model_dump(),
            "suggestions": [s.model_dump() for s in self.suggestions],
            "composite": composite,
            "grade": grade,
            "grade_label": grade_label,
            "evaluated": self.evaluated_signals(),
        }

    @property
    def composite(self) -> float:
        return self.compute_composite()


# ── Request models ────────────────────────────────────────────────────


class ScoreClipRequest(BaseModel):
    """Score a single clip from transcript / audio / video paths."""

    audio_path: str | None = None
    video_path: str | None = None
    transcript_text: str = ""
    transcript_segments: list[dict] | None = None
    start: float = 0.0
    end: float = 0.0
    title: str | None = None
    # What is said in the first ~3 s of the edit; falls back to the
    # opening words of transcript_text when empty
    hook_text: str = ""


class ScoreBatchRequest(BaseModel):
    """Batch scoring request for multiple clips."""

    clips: list[ScoreClipRequest] = Field(default_factory=list)


class ScoredClip(BaseModel):
    """A detected clip with engagement score attached."""

    index: int = 0
    title: str = ""
    start: float = 0.0
    end: float = 0.0
    transcript_preview: str = ""
    tags: list[str] = Field(default_factory=list)
    engagement: EngagementScore = Field(default_factory=EngagementScore)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)


# ── YouTube / jobs ────────────────────────────────────────────────────


class YouTubeVideoMeta(BaseModel):
    """Metadata for an ingested YouTube video."""

    video_id: str
    title: str = "Untitled"
    channel_name: str = "Unknown"
    channel_id: str = ""
    duration_seconds: int = 0
    thumbnail_url: str = ""
    upload_date: str = ""
    view_count: int | None = None
    is_live: bool = False
    is_private: bool = False
    warning: str | None = None


class JobStatus(BaseModel):
    """Background job status for YouTube / clip pipelines."""

    job_id: str
    status: str = "pending"
    progress: float = 0.0
    message: str = ""
    result: dict | None = None
    error: str | None = None
