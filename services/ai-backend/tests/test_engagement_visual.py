"""Scoring a video that has no speech, from a description of its frames.

Run from services/ai-backend with: python -m pytest tests
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.models.engagement import ScoreClipRequest  # noqa: E402
from app.services import model_backend  # noqa: E402
from app.services.engagement.scorer import EngagementScorer  # noqa: E402


class FakeLLM:
    """Stands in for the model: records the prompts and answers with `reply`."""

    def __init__(self, reply=None, available=True, fails=False):
        self.reply = reply or {}
        self.available = available
        self.fails = fails
        self.prompts: list[str] = []

    async def check_available(self):
        return self.available

    async def generate_json(self, prompt, **_):
        self.prompts.append(prompt)
        if self.fails:
            raise RuntimeError("model down")
        return self.reply


@pytest.fixture
def scorer():
    return EngagementScorer()


def use(monkeypatch, llm: FakeLLM) -> FakeLLM:
    monkeypatch.setattr(model_backend, "llm_backend", llm)
    return llm


DESCRIPTION = "Uma mão tira a tampa de um pote e mostra o creme; aparece o texto 'antes e depois'."


async def test_curiosity_with_no_speech_is_read_from_the_description(scorer, monkeypatch):
    llm = use(monkeypatch, FakeLLM({"score": 72, "reason": "tem antes e depois"}))
    result = await scorer._analyze_curiosity(ScoreClipRequest(visual_description=DESCRIPTION))
    assert result.measured is True
    assert result.composite == 72
    # The keyword rules are about what people say: none of them is claimed
    assert (result.has_question, result.has_bold_claim, result.has_open_loop) == (False, False, False)
    assert "no speech" in llm.prompts[0] and DESCRIPTION in llm.prompts[0]


async def test_curiosity_with_nothing_to_read_is_not_evaluated(scorer, monkeypatch):
    use(monkeypatch, FakeLLM({"score": 99}))
    result = await scorer._analyze_curiosity(ScoreClipRequest())
    assert result.measured is False


@pytest.mark.parametrize("llm", [FakeLLM(available=False), FakeLLM(fails=True), FakeLLM({"nota": 5})])
async def test_curiosity_from_the_description_is_not_made_up_when_the_model_fails(scorer, monkeypatch, llm):
    use(monkeypatch, llm)
    result = await scorer._analyze_curiosity(ScoreClipRequest(visual_description=DESCRIPTION))
    assert result.measured is False
    assert result.composite == 50.0


async def test_curiosity_is_clamped_to_a_valid_score(scorer, monkeypatch):
    use(monkeypatch, FakeLLM({"score": 400}))
    result = await scorer._analyze_curiosity(ScoreClipRequest(visual_description=DESCRIPTION))
    assert result.composite == 100


async def test_spoken_text_still_takes_the_rules_path(scorer, monkeypatch):
    llm = use(monkeypatch, FakeLLM({"score": 60}))
    result = await scorer._analyze_curiosity(
        ScoreClipRequest(transcript_text="Você não vai acreditar no que aconteceu. Sabe por que?", visual_description=DESCRIPTION)
    )
    assert result.has_question is True
    assert result.measured is True
    # The model read the speech, not the description
    assert "no speech" not in llm.prompts[0]


VIRALITY = {"hook": 18, "shareability": 15, "emotion": 12, "standalone": 20, "reason": "ok", "suggested_title": "t"}


async def test_virality_with_no_speech_uses_the_description(scorer, monkeypatch):
    llm = use(monkeypatch, FakeLLM(VIRALITY))
    result = await scorer._analyze_virality(ScoreClipRequest(visual_description=DESCRIPTION, end=20))
    assert result.measured is True
    assert result.composite == 65
    assert "has no speech" in llm.prompts[0]
    assert DESCRIPTION in llm.prompts[0]


async def test_virality_sees_both_speech_and_description(scorer, monkeypatch):
    llm = use(monkeypatch, FakeLLM(VIRALITY))
    await scorer._analyze_virality(
        ScoreClipRequest(transcript_text="Esse creme mudou a minha pele.", visual_description=DESCRIPTION, end=20)
    )
    assert "Esse creme mudou a minha pele." in llm.prompts[0]
    assert DESCRIPTION in llm.prompts[0]
    assert "has no speech" not in llm.prompts[0]


async def test_virality_with_nothing_is_not_evaluated(scorer, monkeypatch):
    llm = use(monkeypatch, FakeLLM(VIRALITY))
    result = await scorer._analyze_virality(ScoreClipRequest())
    assert result.measured is False
    assert llm.prompts == []


async def test_virality_without_a_description_keeps_its_old_prompt(scorer, monkeypatch):
    llm = use(monkeypatch, FakeLLM(VIRALITY))
    await scorer._analyze_virality(ScoreClipRequest(transcript_text="Olha isso.", end=20))
    assert "What the video shows" not in llm.prompts[0]
