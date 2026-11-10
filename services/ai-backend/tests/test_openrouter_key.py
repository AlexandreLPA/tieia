"""Saving the OpenRouter key from the app: where it is kept and what it changes.

Run from services/ai-backend with: python -m pytest tests
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.services import model_backend  # noqa: E402
from app.services.model_backend import LLMBackend  # noqa: E402


def isolate(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "SECRETS_FILE", str(tmp_path / "secrets" / "secrets.json"))
    monkeypatch.setattr(model_backend, "RUNTIME_SETTINGS_FILE", str(tmp_path / "llm-runtime.json"))
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "")


def test_saved_key_is_used_now_and_after_a_restart(monkeypatch, tmp_path):
    isolate(monkeypatch, tmp_path)
    LLMBackend().set_openrouter_key("sk-or-test-1234567890")
    assert settings.OPENROUTER_API_KEY == "sk-or-test-1234567890"

    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "")
    LLMBackend()
    assert settings.OPENROUTER_API_KEY == "sk-or-test-1234567890"


def test_saved_key_wins_over_the_env_key(monkeypatch, tmp_path):
    isolate(monkeypatch, tmp_path)
    LLMBackend().set_openrouter_key("sk-or-from-the-app")
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "sk-or-from-env")
    LLMBackend()
    assert settings.OPENROUTER_API_KEY == "sk-or-from-the-app"


def test_key_is_not_written_where_the_backend_serves_files(monkeypatch, tmp_path):
    isolate(monkeypatch, tmp_path)
    backend = LLMBackend()
    backend.set_openrouter_key("sk-or-test-1234567890")
    backend.set_backend("openrouter", "some/model:free")
    served = Path(model_backend.RUNTIME_SETTINGS_FILE).read_text(encoding="utf-8")
    assert "sk-or-test" not in served
    assert json.loads(Path(settings.SECRETS_FILE).read_text(encoding="utf-8")) == {
        "openrouter_api_key": "sk-or-test-1234567890"
    }
    # The real default must stay outside generated/, which is mounted at /generated
    default = Path(type(settings).model_fields["SECRETS_FILE"].default)
    assert Path(settings.GENERATED_DIR) not in default.parents


def test_no_saved_key_leaves_the_env_key(monkeypatch, tmp_path):
    isolate(monkeypatch, tmp_path)
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "sk-or-from-env")
    LLMBackend()
    assert settings.OPENROUTER_API_KEY == "sk-or-from-env"
