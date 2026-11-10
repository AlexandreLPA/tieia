"""The reasoning effort picked in the chat: which models take it and where it is kept.

Run from services/ai-backend with: python -m pytest tests
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.services import model_backend  # noqa: E402
from app.services.model_backend import LLMBackend, free_chat_models  # noqa: E402


def entry(model_id, reasoning=None):
    data = {
        "id": model_id,
        "name": model_id,
        "created": 1,
        "context_length": 128000,
        "pricing": {"prompt": "0", "completion": "0"},
        "architecture": {"input_modalities": ["text"], "output_modalities": ["text"]},
    }
    if reasoning is not None:
        data["reasoning"] = reasoning
    return data


CATALOG = [
    entry("lab/chooses:free", {"mandatory": True, "supported_efforts": ["max", "high", "medium", "low", "minimal"]}),
    entry("lab/two-levels:free", {"mandatory": False, "supported_efforts": ["high", "medium", "none"]}),
    entry("lab/thinks-no-choice:free", {"mandatory": False}),
    entry("lab/plain:free"),
]


def backend(monkeypatch, tmp_path):
    monkeypatch.setattr(model_backend, "RUNTIME_SETTINGS_FILE", str(tmp_path / "llm-runtime.json"))
    monkeypatch.setattr(settings, "SECRETS_FILE", str(tmp_path / "secrets.json"))
    instance = LLMBackend()
    instance._or_free = free_chat_models(CATALOG)
    return instance


def test_models_list_the_efforts_they_offer_weakest_first():
    efforts = {model["id"]: model["efforts"] for model in free_chat_models(CATALOG)}
    assert efforts == {
        "lab/chooses:free": ["minimal", "low", "medium", "high", "max"],
        # "none" switches reasoning off, which is not an effort to pick
        "lab/two-levels:free": ["medium", "high"],
        "lab/thinks-no-choice:free": [],
        "lab/plain:free": [],
    }


def test_chat_sends_the_short_default_until_an_effort_is_picked(monkeypatch, tmp_path):
    llm = backend(monkeypatch, tmp_path)
    assert llm.reasoning_effort == "low"
    assert llm.chat_reasoning_effort("lab/chooses:free") == "low"


def test_picked_effort_goes_only_to_models_that_offer_it(monkeypatch, tmp_path):
    llm = backend(monkeypatch, tmp_path)
    llm.set_reasoning_effort("high")
    assert llm.chat_reasoning_effort("lab/chooses:free") == "high"
    assert llm.chat_reasoning_effort("lab/two-levels:free") == "high"
    assert llm.chat_reasoning_effort("lab/thinks-no-choice:free") == "low"
    assert llm.chat_reasoning_effort("lab/plain:free") == "low"
    assert llm.chat_reasoning_effort("someone/not-in-the-catalog") == "low"

    llm.set_reasoning_effort("max")
    assert llm.chat_reasoning_effort("lab/two-levels:free") == "low"


def test_picked_effort_survives_a_restart_next_to_the_model(monkeypatch, tmp_path):
    llm = backend(monkeypatch, tmp_path)
    llm.set_backend("openrouter", "lab/chooses:free")
    llm.set_reasoning_effort("medium")
    saved = json.loads(Path(model_backend.RUNTIME_SETTINGS_FILE).read_text(encoding="utf-8"))
    assert saved == {"backend_mode": "openrouter", "openrouter_model": "lab/chooses:free", "reasoning_effort": "medium"}

    restarted = LLMBackend()
    assert restarted.reasoning_effort == "medium"
    assert restarted.configured_openrouter_model == "lab/chooses:free"


def test_an_unknown_saved_effort_is_ignored(monkeypatch, tmp_path):
    monkeypatch.setattr(model_backend, "RUNTIME_SETTINGS_FILE", str(tmp_path / "llm-runtime.json"))
    monkeypatch.setattr(settings, "SECRETS_FILE", str(tmp_path / "secrets.json"))
    Path(model_backend.RUNTIME_SETTINGS_FILE).write_text(json.dumps({"reasoning_effort": "extreme"}), encoding="utf-8")
    assert LLMBackend().reasoning_effort == "low"
