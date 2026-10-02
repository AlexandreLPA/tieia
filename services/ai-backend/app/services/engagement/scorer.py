"""Engagement scoring orchestrator.

Coordinates all sub-analyzers (hook, energy, face, curiosity, virality,
emotional arc, audio sync) and computes the composite engagement score.

Supports three input modes:
1. Clip mode: transcript + audio path + timestamps (YouTube pipeline)
2. Video mode: a video file (editor / pre-export)
3. Batch mode: multiple clips scored in parallel
"""

import asyncio
import re
import logging
import math
import struct

from app.models.engagement import (
    CuriosityScore,
    EmotionalArcScore,
    EngagementScore,
    EnhancementSuggestion,
    EnergyScore,
    AudioSyncScore,
    FacePresenceScore,
    HookScore,
    ScoreClipRequest,
    ViralityScore,
)
from app.services.engagement.hook_analyzer import hook_analyzer
from app.services.engagement.face_presence import face_presence_analyzer
from app.services.engagement.audio_intelligence import audio_intelligence

logger = logging.getLogger(__name__)

SCORING_TIMEOUT = 120  # seconds max per clip
# ~3 s of speech when the caller doesn't say what the opening is
HOOK_OPENING_WORDS = 10


def _has_any_phrase(text: str, phrases: list[str]) -> bool:
    """True when any phrase appears as whole word(s) in already-lowered text."""
    return any(
        re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", text) for phrase in phrases
    )


class EngagementScorer:
    """Main orchestrator for engagement scoring."""

    async def score_clip(self, req: ScoreClipRequest) -> EngagementScore:
        """Score a single clip from transcript/audio/video data."""
        # Run independent sub-analyzers in parallel
        hook_task = self._analyze_hook(req)
        energy_task = self._analyze_energy(req)
        curiosity_task = self._analyze_curiosity(req)
        face_task = self._analyze_face(req)
        emotion_task = self._analyze_emotional_arc(req)
        virality_task = self._analyze_virality(req)
        audio_sync_task = self._analyze_audio_sync(req)

        results = await asyncio.gather(
            hook_task, energy_task, curiosity_task,
            face_task, emotion_task, virality_task, audio_sync_task,
            return_exceptions=True,
        )

        hook = results[0] if not isinstance(results[0], Exception) else HookScore()
        energy = results[1] if not isinstance(results[1], Exception) else EnergyScore()
        curiosity = results[2] if not isinstance(results[2], Exception) else CuriosityScore()
        face = results[3] if not isinstance(results[3], Exception) else FacePresenceScore()
        emotion = results[4] if not isinstance(results[4], Exception) else EmotionalArcScore()
        virality = results[5] if not isinstance(results[5], Exception) else ViralityScore()
        audio_sync = results[6] if not isinstance(results[6], Exception) else AudioSyncScore(composite=50.0)

        # Log any failures
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                names = ["hook", "energy", "curiosity", "face", "emotion", "virality", "audio_sync"]
                logger.warning("Engagement sub-analyzer '%s' failed: %s", names[i], r)

        score = EngagementScore(
            hook=hook,
            energy=energy,
            curiosity=curiosity,
            audio_sync=audio_sync,
            face_presence=face,
            emotional_arc=emotion,
            virality=virality,
        )

        # Generate suggestions based on weak signals
        score.suggestions = self._generate_suggestions(score)

        return score

    async def score_batch(self, clips: list[ScoreClipRequest]) -> list[EngagementScore]:
        """Score multiple clips in parallel."""
        tasks = [self.score_clip(clip) for clip in clips]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        scores = []
        for r in results:
            if isinstance(r, Exception):
                logger.warning("Batch scoring failed for a clip: %s", r)
                scores.append(EngagementScore())
            else:
                scores.append(r)
        return scores

    # ── Sub-analyzers ─────────────────────────────────────────────────

    async def _analyze_audio_sync(self, req: ScoreClipRequest) -> AudioSyncScore:
        """Run audio beat analysis and compute sync score."""
        if not req.audio_path:
            return AudioSyncScore(composite=50.0)

        try:
            word_timestamps = None
            if req.transcript_segments:
                word_timestamps = []
                for seg in req.transcript_segments:
                    for w in seg.get("words", []):
                        word_timestamps.append(w)

            analysis = await audio_intelligence.analyze(req.audio_path, word_timestamps)

            return AudioSyncScore(
                bpm=analysis.bpm.bpm if analysis.bpm else None,
                beat_count=len(analysis.beats),
                caption_beat_alignment=analysis.audio_sync_score,
                composite=analysis.audio_sync_score,
                measured=True,
            )
        except Exception:
            return AudioSyncScore(composite=50.0)

    async def _analyze_hook(self, req: ScoreClipRequest) -> HookScore:
        """Run hook analysis on the clip."""
        # The hook is the first ~3 s. The editor sends exactly that; other
        # callers get an estimate from the opening words (~3 words/s)
        transcript_start = req.hook_text.strip()
        if not transcript_start:
            text = req.transcript_text or " ".join(
                seg.get("text", "") for seg in (req.transcript_segments or [])[:5]
            )
            transcript_start = " ".join(text.split()[:HOOK_OPENING_WORDS])

        return await hook_analyzer.analyze(
            audio_path=req.audio_path,
            video_path=req.video_path,
            transcript_start=transcript_start,
            clip_duration=req.end - req.start if req.end > req.start else 30.0,
        )

    async def _analyze_energy(self, req: ScoreClipRequest) -> EnergyScore:
        """Analyze audio energy dynamics."""
        if not req.audio_path:
            return EnergyScore(composite=50.0)

        duration = req.end - req.start if req.end > req.start else 30.0

        cmd = [
            "ffmpeg", "-i", req.audio_path,
            "-ss", str(req.start), "-t", str(duration),
            "-f", "s16le", "-acodec", "pcm_s16le",
            "-ar", "16000", "-ac", "1",
            "-y", "pipe:1",
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()

        if not stdout or len(stdout) < 200:
            return EnergyScore(composite=50.0)

        n_samples = len(stdout) // 2
        samples = struct.unpack(f"<{n_samples}h", stdout[:n_samples * 2])

        # Compute RMS in windows
        sample_rate = 16000
        window_size = sample_rate  # 1-second windows
        rms_values = []

        for i in range(0, n_samples, window_size):
            chunk = samples[i : i + window_size]
            if len(chunk) < 100:
                break
            rms = math.sqrt(sum(s * s for s in chunk) / len(chunk)) / 32768.0
            rms_values.append(rms)

        if not rms_values:
            return EnergyScore(composite=50.0)

        mean_energy = sum(rms_values) / len(rms_values)
        peak_energy = max(rms_values)
        variance = sum((r - mean_energy) ** 2 for r in rms_values) / len(rms_values)
        has_dynamic = variance > 0.001 or (peak_energy > mean_energy * 2)

        # Score: higher energy + more variance = more engaging
        energy_score = min(100, mean_energy * 500)  # scale up
        dynamic_bonus = min(30, variance * 3000) if has_dynamic else 0
        composite = min(100, energy_score + dynamic_bonus)

        return EnergyScore(
            mean_energy=round(mean_energy, 4),
            peak_energy=round(peak_energy, 4),
            energy_variance=round(variance, 6),
            has_dynamic_range=has_dynamic,
            composite=round(composite, 1),
            measured=True,
        )

    async def _analyze_curiosity(self, req: ScoreClipRequest) -> CuriosityScore:
        """Detect curiosity triggers in the transcript."""
        text = req.transcript_text or ""
        if not text and req.transcript_segments:
            text = " ".join(seg.get("text", "") for seg in req.transcript_segments)

        if not text:
            return CuriosityScore(composite=50.0)

        text_lower = text.lower()

        has_question = "?" in text
        # Whole words only ("erro" must not match "ferro"), and no everyday
        # words like "sempre"/"verdade" that fire on almost any speech
        has_bold_claim = _has_any_phrase(text_lower, [
            "never", "everyone", "nobody", "secret", "mistake", "wrong", "myth",
            "the real", "nunca", "todo mundo", "ninguém", "segredo", "erro",
            "errado", "mito", "mentira", "na real", "ninguém te conta",
        ])
        has_open_loop = _has_any_phrase(text_lower, [
            "here's why", "here's what", "here's how", "let me tell you",
            "wait until", "you won't believe", "the thing is", "but first",
            "olha isso", "olha o que", "vou te contar", "deixa eu te contar",
            "espera até", "você não vai acreditar", "o negócio é", "mas antes",
            "é por isso que", "sabe por que", "até o final", "no final",
        ])

        gap_count = sum([has_question, has_bold_claim, has_open_loop])

        # Try LLM for deeper analysis
        llm_score = 0
        try:
            from app.services.model_backend import llm_backend
            if await llm_backend.check_available() and len(text) > 20:
                prompt = f"""Rate the curiosity-inducing strength of this text on a scale of 0-100.
Consider: questions, bold claims, open loops, information gaps, surprising facts.

Text: "{text[:500]}"

Respond with JSON: {{"score": int, "reason": "brief explanation"}}"""
                data = await llm_backend.generate_json(prompt=prompt)
                llm_score = max(0, min(100, round(float(data.get("score", 0)))))
        except Exception:
            pass

        # The LLM reads the actual text; rules only nudge it. max() let a
        # keyword hit override a low LLM judgement
        rule_score = gap_count * 25 + (10 if has_question else 0)
        composite = (
            0.3 * rule_score + 0.7 * llm_score
            if llm_score > 0
            else min(100, rule_score + 20)
        )

        return CuriosityScore(
            has_question=has_question,
            has_bold_claim=has_bold_claim,
            has_open_loop=has_open_loop,
            gap_count=gap_count,
            composite=round(min(100, composite), 1),
            measured=True,
        )

    async def _analyze_face(self, req: ScoreClipRequest) -> FacePresenceScore:
        """Analyze face presence ratio."""
        if not req.video_path:
            return FacePresenceScore(composite=50.0)

        return await face_presence_analyzer.analyze(req.video_path)

    async def _analyze_emotional_arc(self, req: ScoreClipRequest) -> EmotionalArcScore:
        """Analyze emotional arc structure."""
        if not req.audio_path:
            return EmotionalArcScore(composite=50.0)

        duration = req.end - req.start if req.end > req.start else 30.0

        # Use FFmpeg to get energy at different phases of the clip
        phases = {
            "hook": (0, duration * 0.1),
            "tension": (duration * 0.1, duration * 0.33),
            "payload": (duration * 0.33, duration * 0.73),
            "resonance": (duration * 0.73, duration * 0.93),
        }

        phase_energy = {}
        for phase_name, (start, end) in phases.items():
            actual_start = req.start + start
            actual_dur = end - start
            if actual_dur < 0.5:
                phase_energy[phase_name] = 0
                continue

            cmd = [
                "ffmpeg", "-i", req.audio_path,
                "-ss", str(actual_start), "-t", str(actual_dur),
                "-f", "s16le", "-acodec", "pcm_s16le",
                "-ar", "16000", "-ac", "1",
                "-y", "pipe:1",
            ]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()

            if stdout and len(stdout) > 100:
                n = len(stdout) // 2
                samples = struct.unpack(f"<{n}h", stdout[:n * 2])
                rms = math.sqrt(sum(s * s for s in samples) / n) / 32768.0
                phase_energy[phase_name] = rms
            else:
                phase_energy[phase_name] = 0

        hook_e = phase_energy.get("hook", 0)
        tension_e = phase_energy.get("tension", 0)
        payload_e = phase_energy.get("payload", 0)
        resonance_e = phase_energy.get("resonance", 0)

        has_strong_open = hook_e > 0 and hook_e >= tension_e * 0.8
        has_buildup = payload_e > tension_e * 0.9
        has_peak = resonance_e > 0 or payload_e > hook_e

        # Find peak
        all_energies = [("hook", 0, hook_e), ("tension", duration * 0.2, tension_e),
                        ("payload", duration * 0.5, payload_e), ("resonance", duration * 0.8, resonance_e)]
        peak_phase = max(all_energies, key=lambda x: x[2])
        peak_timestamp = req.start + peak_phase[1]

        # Determine dominant emotion from energy levels
        max_e = max(hook_e, tension_e, payload_e, resonance_e, 0.001)
        if max_e > 0.15:
            dominant = "excited"
        elif max_e > 0.08:
            dominant = "engaged"
        else:
            dominant = "calm"

        # Score the arc
        score = 30  # base
        if has_strong_open:
            score += 20
        if has_buildup:
            score += 25
        if has_peak:
            score += 25

        return EmotionalArcScore(
            has_strong_open=has_strong_open,
            has_buildup=has_buildup,
            has_peak=has_peak,
            peak_timestamp=round(peak_timestamp, 2),
            dominant_emotion=dominant,
            composite=round(min(100, score), 1),
            measured=True,
        )

    async def _analyze_virality(self, req: ScoreClipRequest) -> ViralityScore:
        """LLM-based viral potential prediction."""
        text = req.transcript_text or ""
        if not text and req.transcript_segments:
            text = " ".join(seg.get("text", "") for seg in req.transcript_segments)

        if not text:
            return ViralityScore(composite=50.0)

        try:
            from app.services.model_backend import llm_backend

            available = await llm_backend.check_available()
            if not available:
                return ViralityScore(composite=50.0)

            duration = req.end - req.start if req.end > req.start else 30
            prompt = f"""You are a viral content analyst. Score this short-form video clip's viral potential.

Title: {req.title or "Untitled"}
Duration: {duration:.0f}s (TikTok sweet spot: 15-60s)
Transcript (first 200 words): {text[:800]}

Score on 4 dimensions (each 0-25, total 0-100):
1. Hook strength: Would this stop someone mid-scroll?
2. Shareability: Would someone share this with a friend?
3. Emotional impact: Does this trigger a strong emotion?
4. Standalone value: Does this make sense without context?

Respond with JSON: {{"hook": int, "shareability": int, "emotion": int, "standalone": int, "reason": "one line", "suggested_title": "catchy title"}}
Keep the JSON keys in English, but write the "reason" and "suggested_title" values in Brazilian Portuguese."""

            data = await llm_backend.generate_json(prompt=prompt)

            # Every dimension must come back as a number; a partial or
            # malformed answer is "not evaluated", not a made-up 12/25
            def dimension(key: str) -> int:
                return max(0, min(25, round(float(data[key]))))

            hook = dimension("hook")
            share = dimension("shareability")
            emotion = dimension("emotion")
            standalone = dimension("standalone")

            return ViralityScore(
                hook_strength=hook,
                shareability=share,
                emotional_impact=emotion,
                standalone_value=standalone,
                reason=str(data.get("reason", ""))[:200],
                suggested_title=str(data.get("suggested_title", ""))[:100],
                composite=float(hook + share + emotion + standalone),
                measured=True,
            )

        except Exception:
            logger.debug("Virality prediction failed", exc_info=True)
            return ViralityScore(composite=50.0)

    # ── Suggestion generation ─────────────────────────────────────────

    def _generate_suggestions(self, score: EngagementScore) -> list[EnhancementSuggestion]:
        """Generate actionable improvement suggestions based on weak signals."""
        suggestions = []

        if score.hook.measured and score.hook.composite < 60:
            suggestions.append(EnhancementSuggestion(
                signal="hook",
                current_score=score.hook.composite,
                suggestion="Coloque um gancho em texto nos primeiros 1,5 segundos para segurar quem está rolando o feed.",
                action_type="auto_apply",
                expected_impact="high",
            ))

        if score.face_presence.measured and not score.hook.early_face_present:
            suggestions.append(EnhancementSuggestion(
                signal="hook",
                current_score=score.hook.composite,
                suggestion="Ajuste o início do clipe para mostrar o rosto de quem fala logo na abertura.",
                action_type="adjust_clip",
                expected_impact="medium",
            ))

        if (
            score.curiosity.measured
            and score.curiosity.composite < 50
            and not score.curiosity.has_question
        ):
            suggestions.append(EnhancementSuggestion(
                signal="curiosity",
                current_score=score.curiosity.composite,
                suggestion="Adicione uma pergunta na tela para despertar curiosidade.",
                action_type="auto_apply",
                expected_impact="high",
            ))

        if score.energy.measured and score.energy.composite < 40:
            suggestions.append(EnhancementSuggestion(
                signal="energy",
                current_score=score.energy.composite,
                suggestion="Adicione um efeito sonoro ou trecho de música para dar mais energia ao áudio.",
                action_type="open_tool",
                expected_impact="medium",
            ))

        if score.face_presence.measured and score.face_presence.face_ratio > 0.5:
            suggestions.append(EnhancementSuggestion(
                signal="face_presence",
                current_score=score.face_presence.composite,
                suggestion="Intercale cenas de apoio (B-roll) para o rosto aparecer só uns 30-40% do tempo.",
                action_type="manual",
                expected_impact="medium",
            ))

        if (
            score.emotional_arc.measured
            and not score.emotional_arc.has_buildup
            and not score.emotional_arc.has_peak
        ):
            suggestions.append(EnhancementSuggestion(
                signal="emotional_arc",
                current_score=score.emotional_arc.composite,
                suggestion="O ritmo está linear. Experimente uma abertura que crie expectativa.",
                action_type="manual",
                expected_impact="medium",
            ))

        # Sort by expected impact and limit to top 3
        impact_order = {"high": 0, "medium": 1, "low": 2}
        suggestions.sort(key=lambda s: impact_order.get(s.expected_impact, 2))
        return suggestions[:3]


# Module-level singleton
engagement_scorer = EngagementScorer()
