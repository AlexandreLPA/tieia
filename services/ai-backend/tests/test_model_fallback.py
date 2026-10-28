import httpx
import pytest

from app.config import settings
from app.services.model_backend import LLMBackend


def _status_error(code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
    return httpx.HTTPStatusError("boom", request=request, response=httpx.Response(code, request=request))


@pytest.fixture
def backend(monkeypatch: pytest.MonkeyPatch) -> LLMBackend:
    monkeypatch.setattr(settings, "OPENROUTER_MODEL", "primary/model:free")
    monkeypatch.setattr(settings, "OPENROUTER_FALLBACK_MODELS", "fallback/a:free, fallback/b:free,primary/model:free")
    return LLMBackend()


def test_candidates_keep_order_and_drop_duplicates(backend: LLMBackend) -> None:
    assert backend._or_candidate_models() == ["primary/model:free", "fallback/a:free", "fallback/b:free"]


async def test_falls_back_when_the_model_does_not_exist(backend: LLMBackend, monkeypatch: pytest.MonkeyPatch) -> None:
    tried: list[str] = []

    async def fake_once(model: str, messages: list, temperature: float | None = None) -> str:
        tried.append(model)
        if model == "primary/model:free":
            raise _status_error(404)
        return "hello"

    monkeypatch.setattr(backend, "_or_chat_once", fake_once)
    assert await backend._or_chat([{"role": "user", "content": "hi"}]) == "hello"
    assert tried == ["primary/model:free", "fallback/a:free"]


async def test_falls_back_on_rate_limit_and_empty_answer(backend: LLMBackend, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_once(model: str, messages: list, temperature: float | None = None) -> str:
        if model == "primary/model:free":
            raise _status_error(429)
        if model == "fallback/a:free":
            raise RuntimeError("OpenRouter returned an empty answer (finish_reason=length)")
        return "from b"

    monkeypatch.setattr(backend, "_or_chat_once", fake_once)
    assert await backend._or_chat([]) == "from b"


async def test_auth_error_is_not_retried_on_another_model(backend: LLMBackend, monkeypatch: pytest.MonkeyPatch) -> None:
    tried: list[str] = []

    async def fake_once(model: str, messages: list, temperature: float | None = None) -> str:
        tried.append(model)
        raise _status_error(401)

    monkeypatch.setattr(backend, "_or_chat_once", fake_once)
    with pytest.raises(httpx.HTTPStatusError):
        await backend._or_chat([])
    assert tried == ["primary/model:free"]


async def test_raises_the_last_error_when_every_model_fails(backend: LLMBackend, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_once(model: str, messages: list, temperature: float | None = None) -> str:
        raise _status_error(503)

    monkeypatch.setattr(backend, "_or_chat_once", fake_once)
    with pytest.raises(httpx.HTTPStatusError):
        await backend._or_chat([])


async def test_stream_falls_back_only_before_the_first_token(backend: LLMBackend, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_stream(model: str, prompt: str, system: str | None):
        if model == "primary/model:free":
            raise _status_error(404)
        yield "to"
        yield "ken"

    monkeypatch.setattr(backend, "_or_stream_once", fake_stream)
    assert [t async for t in backend._or_generate_stream("hi", None)] == ["to", "ken"]


async def test_stream_does_not_restart_after_tokens_were_sent(backend: LLMBackend, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_stream(model: str, prompt: str, system: str | None):
        yield "partial"
        raise RuntimeError("OpenRouter stream error: cut")

    monkeypatch.setattr(backend, "_or_stream_once", fake_stream)
    received: list[str] = []
    with pytest.raises(RuntimeError):
        async for token in backend._or_generate_stream("hi", None):
            received.append(token)
    assert received == ["partial"]
