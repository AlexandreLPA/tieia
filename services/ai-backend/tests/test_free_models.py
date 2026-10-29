"""Which OpenRouter models count as free, and which one stands in for a model that stopped being free.

Run from services/ai-backend with: python -m pytest tests
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.services.model_backend import LLMBackend, free_chat_models  # noqa: E402


def entry(model_id, name, *, prompt="0", inputs=("text",), outputs=("text",), context=128000, created=1):
    return {
        "id": model_id,
        "name": name,
        "created": created,
        "context_length": context,
        "pricing": {"prompt": prompt, "completion": prompt},
        "architecture": {"input_modalities": list(inputs), "output_modalities": list(outputs)},
    }


CATALOG = [
    entry("minimax/minimax-m3.1-flash", "MiniMax: M3.1 Flash", prompt="0.00000015"),
    entry("nvidia/nemotron-3-ultra-550b-a55b:free", "NVIDIA: Nemotron 3 Ultra (free)", context=1_000_000),
    entry(
        "nvidia/nemotron-3.5-super-vl:free",
        "NVIDIA: Nemotron 3.5 Super VL (free)",
        inputs=("text", "image", "video"),
        context=1_000_000,
    ),
    entry("google/gemma-4-31b-it:free", "Google: Gemma 4 31B (free)", inputs=("text", "image"), context=262_144),
    entry("nvidia/nemotron-3.5-content-safety:free", "NVIDIA: Nemotron 3.5 Content Safety (free)"),
    entry("black-forest-labs/flux:free", "Flux (free)", outputs=("image",)),
    entry("someone/odd-model:free", "Odd (free)", prompt="0.000001"),
]


def test_only_free_chat_models_are_listed_best_first():
    ids = [m["id"] for m in free_chat_models(CATALOG)]
    # Images first (the viral score sends frames), then the longest context
    assert ids == [
        "nvidia/nemotron-3.5-super-vl:free",
        "google/gemma-4-31b-it:free",
        "nvidia/nemotron-3-ultra-550b-a55b:free",
    ]


def test_small_and_preview_variants_and_a_few_extra_tokens_do_not_lead():
    catalog = CATALOG + [
        entry(
            "lab/model-small:free",
            "Lab: Model Small (free)",
            inputs=("text", "image"),
            context=1_048_576,
            created=99,
        ),
        entry(
            "lab/other-preview:free",
            "Lab: Other Preview (free)",
            inputs=("text", "image"),
            context=1_048_576,
            created=99,
        ),
    ]
    ids = [m["id"] for m in free_chat_models(catalog)]
    assert ids[0] == "nvidia/nemotron-3.5-super-vl:free"
    assert ids.index("lab/model-small:free") > ids.index("google/gemma-4-31b-it:free")


def test_a_word_inside_a_name_is_not_a_variant():
    # "gemini" holds "mini" but is no mini variant
    gemini = entry("google/gemini-x:free", "Google: Gemini X (free)", inputs=("text", "image"), context=1_000_000)
    assert free_chat_models([gemini, *CATALOG])[0]["id"] in {
        "google/gemini-x:free",
        "nvidia/nemotron-3.5-super-vl:free",
    }
    small = entry("google/gemini-x-mini:free", "Google: Gemini X Mini (free)", inputs=("text", "image"), context=1_000_000)
    assert free_chat_models([small, *CATALOG])[0]["id"] == "nvidia/nemotron-3.5-super-vl:free"


def test_names_lose_the_vendor_and_the_free_tag():
    top = free_chat_models(CATALOG)[0]
    assert top["name"] == "Nemotron 3.5 Super VL"
    assert top["vision"] is True
    assert top["context"] == 1_000_000


def test_a_broken_catalog_entry_is_skipped():
    assert free_chat_models([None, {"id": 3}, {"name": "no id"}]) == []


@pytest.fixture
def backend(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "OPENROUTER_ALLOW_PAID", False)
    monkeypatch.setattr(settings, "OPENROUTER_MODEL", "nvidia/nemotron-3.5-super-vl:free")
    monkeypatch.setattr("app.services.model_backend.RUNTIME_SETTINGS_FILE", str(tmp_path / "llm.json"))
    llm = LLMBackend()
    llm._openrouter_model_override = None
    return llm


def test_the_picked_model_answers_while_it_is_free(backend):
    backend._openrouter_model_override = "google/gemma-4-31b-it:free"
    backend._or_free = free_chat_models(CATALOG)
    assert backend.openrouter_model == "google/gemma-4-31b-it:free"


def test_a_model_that_left_the_free_list_gives_way_to_the_best_free_one(backend):
    backend._openrouter_model_override = "minimax/minimax-m3.1-flash:free"
    backend._or_free = free_chat_models(CATALOG)
    assert backend.configured_openrouter_model == "minimax/minimax-m3.1-flash:free"
    assert backend.openrouter_model == "nvidia/nemotron-3.5-super-vl:free"


def test_when_the_env_model_left_too_the_first_free_one_answers(backend, monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_MODEL", "minimax/minimax-m3.1-flash:free")
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "test-key")
    backend._backend_mode_override = "openrouter"
    backend._openrouter_model_override = "minimax/minimax-m3.1-flash:free"
    backend._or_free = free_chat_models(CATALOG)
    assert backend.openrouter_model == free_chat_models(CATALOG)[0]["id"]
    info = backend.describe_active()
    assert info["model"] == backend.openrouter_model
    assert info["replaced"]["model"] == "minimax/minimax-m3.1-flash:free"


def test_without_the_catalog_the_picked_model_is_kept(backend):
    backend._openrouter_model_override = "minimax/minimax-m3.1-flash:free"
    assert backend.openrouter_model == "minimax/minimax-m3.1-flash:free"


def test_paid_models_on_keep_the_picked_model(backend, monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_ALLOW_PAID", True)
    backend._openrouter_model_override = "minimax/minimax-m3.1-flash"
    backend._or_free = free_chat_models(CATALOG)
    assert backend.openrouter_model == "minimax/minimax-m3.1-flash"


def test_without_a_fallback_list_the_next_free_models_back_the_active_one_up(backend, monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_FALLBACK_MODELS", "")
    backend._or_free = free_chat_models(CATALOG)
    assert backend._or_candidate_models() == [
        "nvidia/nemotron-3.5-super-vl:free",
        "google/gemma-4-31b-it:free",
        "nvidia/nemotron-3-ultra-550b-a55b:free",
    ]


def test_a_listed_fallback_that_costs_or_left_the_free_list_is_skipped(backend, monkeypatch):
    monkeypatch.setattr(
        settings,
        "OPENROUTER_FALLBACK_MODELS",
        "minimax/minimax-m3.1-flash, minimax/minimax-m3.1-flash:free, google/gemma-4-31b-it:free",
    )
    backend._or_free = free_chat_models(CATALOG)
    assert backend._or_candidate_models() == [
        "nvidia/nemotron-3.5-super-vl:free",
        "google/gemma-4-31b-it:free",
    ]


def test_with_paid_models_on_the_listed_fallbacks_are_tried_as_set(backend, monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_ALLOW_PAID", True)
    monkeypatch.setattr(settings, "OPENROUTER_FALLBACK_MODELS", "minimax/minimax-m3.1-flash")
    backend._or_free = free_chat_models(CATALOG)
    assert backend._or_candidate_models() == [
        "nvidia/nemotron-3.5-super-vl:free",
        "minimax/minimax-m3.1-flash",
    ]
