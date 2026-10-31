"""Unified LLM backend abstraction — routes requests to Ollama or TurboQuant.

This module provides a single interface for all LLM inference in Passarola.
When TurboQuant is enabled (and its service is reachable), requests are routed
through the TurboQuant inference service for KV cache compression. Otherwise,
they fall back to Ollama.

Usage in routes:
    from app.services.model_backend import llm_backend

    response = await llm_backend.generate(prompt="Hello", system="You are helpful.")
    data = await llm_backend.generate_json(prompt="...", system="...")
"""

import asyncio
import json
import logging
import os
import re
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.config import settings
from app.services.ollama_service import ollama_service

logger = logging.getLogger(__name__)

# Room for the answer after a short reasoning pass
OR_CHAT_MAX_TOKENS = 8000
# Scores and classifications should not swing between identical runs
JSON_TEMPERATURE = 0.2

OPENROUTER_CATALOG_TTL = 3600  # seconds
# HTTP statuses that mean "this model cannot answer now": try the next fallback model
OR_FALLBACK_STATUSES = frozenset({402, 404, 408, 429, 500, 502, 503, 504})
# Free models from the catalog tried after the active one, when no fallback list is set
OR_CATALOG_FALLBACKS = 2


def is_free_openrouter_model(model: str) -> bool:
    """OpenRouter's free variants end in ":free" and never touch the credits."""
    return model.endswith(":free")


def openrouter_model_allowed(model: str) -> bool:
    return settings.OPENROUTER_ALLOW_PAID or is_free_openrouter_model(model)


# Classifiers OpenRouter lists among text models, but that do not hold a chat
_NOT_ASSISTANT_RE = re.compile(r"safety|guard|moderation", re.IGNORECASE)
# Words in a model id that mark a smaller or unfinished variant
_LIGHT_VARIANT_WORDS = {"small", "mini", "nano", "lite", "lightning", "xs", "tiny", "preview"}


def _is_light_variant(model_id: str) -> bool:
    return bool(_LIGHT_VARIANT_WORDS & set(re.split(r"[-/:._]", model_id.lower())))


def _context_tier(tokens: int) -> int:
    """A few thousand tokens more say nothing about a model: compare in tiers."""
    return 2 if tokens >= 900_000 else 1 if tokens >= 200_000 else 0


def _costs_nothing(pricing: Any) -> bool:
    if not isinstance(pricing, dict):
        return False
    try:
        return all(float(pricing.get(key) or 0) == 0 for key in ("prompt", "completion"))
    except (TypeError, ValueError):
        return False


def _display_name(name: Any, model_id: str) -> str:
    """"NVIDIA: Nemotron 3.5 Super VL (free)" -> "Nemotron 3.5 Super VL"."""
    if not isinstance(name, str) or not name.strip():
        return model_id.split("/")[-1].removesuffix(":free")
    name = name.split(": ", 1)[-1]
    return re.sub(r"\s*\(free\)\s*$", "", name, flags=re.IGNORECASE).strip()


def free_chat_models(entries: list[Any]) -> list[dict[str, Any]]:
    """Chat models OpenRouter serves for free right now, best first.

    Free periods start and end without notice, so this list, read from the
    catalog, replaces any fixed one. The catalog says nothing of quality, so
    the order only follows what it does say: takes images (the viral score
    sends video frames), not a small or preview variant, a longer context
    tier, then the newest.
    """
    models: list[dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
            continue
        model_id = entry["id"]
        if not is_free_openrouter_model(model_id) or not _costs_nothing(entry.get("pricing")):
            continue
        architecture = entry.get("architecture") or {}
        inputs = list(architecture.get("input_modalities") or ["text"])
        outputs = architecture.get("output_modalities") or ["text"]
        if "text" not in outputs or _NOT_ASSISTANT_RE.search(model_id):
            continue
        models.append({
            "id": model_id,
            "name": _display_name(entry.get("name"), model_id),
            "context": int(entry.get("context_length") or 0),
            "inputs": inputs,
            "vision": "image" in inputs,
            "created": int(entry.get("created") or 0),
        })
    models.sort(
        key=lambda m: (
            m["vision"],
            not _is_light_variant(m["id"]),
            _context_tier(m["context"]),
            m["created"],
        ),
        reverse=True,
    )
    return models

# The model picked in the app, kept on the generated volume so a restart
# doesn't fall back to the .env default
RUNTIME_SETTINGS_FILE = os.path.join(settings.GENERATED_DIR, "llm-runtime.json")

_MODALITY_LABELS = {"text": "texto", "image": "imagem", "video": "vídeo", "audio": "áudio", "file": "arquivo"}
_IMAGE_ERROR_RE = re.compile(r"image|modalit|vision|multimodal", re.IGNORECASE)


class VisionUnsupportedError(RuntimeError):
    """The active model can't take image input, or that couldn't be confirmed."""


class LLMBackend:
    """Unified LLM backend that transparently routes to Ollama or TurboQuant.

    TurboQuant is used as an addon when:
    1. settings.AI_LLM_BACKEND is "turboquant" or "auto"
    2. The TurboQuant service is reachable
    3. A model is loaded on the TurboQuant service

    When TurboQuant is unavailable, all requests fall back to Ollama.
    """

    def __init__(self) -> None:
        self._tq_available: bool | None = None  # cached check, reset periodically
        self._tq_model: str | None = None  # active TurboQuant model, cached with the check
        self._tq_check_count = 0
        # Runtime overrides — set via /api/llm/set-cloud-model and
        # /api/llm/set-local-backend, so switching backend doesn't need a
        # container restart. None means "use the .env-configured default".
        self._backend_mode_override: str | None = None
        self._openrouter_model_override: str | None = None
        # What really answered last, and why the cloud model last failed, so the
        # AI monitor can show a fallback instead of the configured model
        self._last_served: dict[str, Any] | None = None
        self._cloud_issue: dict[str, Any] | None = None
        self._load_runtime_settings()
        # OpenRouter model id -> input modalities, fetched lazily by vision_support()
        self._or_catalog: dict[str, list[str]] | None = None
        self._or_catalog_at = 0.0
        # Chat models free right now, best first; None until the catalog is read
        self._or_free: list[dict[str, Any]] | None = None

    # ── Public properties ─────────────────────────────────────────────

    @property
    def backend_mode(self) -> str:
        """Current backend preference: 'ollama', 'turboquant', 'openrouter', or 'auto'."""
        return self._backend_mode_override or settings.AI_LLM_BACKEND

    @property
    def configured_openrouter_model(self) -> str:
        """The cloud model picked in the app, or the .env default."""
        return self._openrouter_model_override or settings.OPENROUTER_MODEL

    @property
    def openrouter_model(self) -> str:
        """The cloud model that answers.

        The picked one, unless the catalog says it is no longer free (or gone)
        and paid models are off: then the .env model if that one is free, or
        else the first of the free list.
        """
        chosen = self.configured_openrouter_model
        if settings.OPENROUTER_ALLOW_PAID or not self._or_free:
            return chosen
        free_ids = [model["id"] for model in self._or_free]
        for candidate in (chosen, settings.OPENROUTER_MODEL):
            if candidate in free_ids:
                return candidate
        return free_ids[0]

    async def refresh_openrouter_models(self, force: bool = False) -> list[dict[str, Any]] | None:
        """Read the OpenRouter catalog again if it is over an hour old (or `force`).

        Returns the free chat models, best first; None if the catalog was never read.
        """
        if force:
            self._or_catalog_at = float("-inf")
        await self._openrouter_catalog()
        return self._or_free

    async def keep_openrouter_models_fresh(self) -> None:
        """Re-read the free models every hour while the server runs, with a key set."""
        while True:
            if settings.OPENROUTER_API_KEY:
                await self.refresh_openrouter_models()
            await asyncio.sleep(OPENROUTER_CATALOG_TTL)

    def set_backend(self, mode: str, openrouter_model: str | None = None) -> None:
        """Switch the active backend at runtime (no restart needed); survives restarts."""
        self._backend_mode_override = mode
        if openrouter_model:
            self._openrouter_model_override = openrouter_model
        self._cloud_issue = None
        self._save_runtime_settings()

    def _load_runtime_settings(self) -> None:
        try:
            with open(RUNTIME_SETTINGS_FILE, encoding="utf-8") as file:
                data = json.load(file)
        except (OSError, ValueError):
            return
        if isinstance(data, dict):
            self._backend_mode_override = data.get("backend_mode") or None
            self._openrouter_model_override = data.get("openrouter_model") or None

    def _save_runtime_settings(self) -> None:
        try:
            with open(RUNTIME_SETTINGS_FILE, "w", encoding="utf-8") as file:
                json.dump(
                    {
                        "backend_mode": self._backend_mode_override,
                        "openrouter_model": self._openrouter_model_override,
                    },
                    file,
                )
        except OSError:
            logger.warning("Could not save the LLM choice", exc_info=True)

    def _served(self, backend: str, model: str | None) -> None:
        self._last_served = {
            "backend": backend,
            "model": model or "",
            "cloud": backend == "openrouter",
            "at": time.time(),
        }
        if backend == "openrouter":
            self._cloud_issue = None

    def _cloud_failed(self, exc: BaseException) -> None:
        self._cloud_issue = {
            "model": self.openrouter_model,
            "message": _cloud_error_summary(exc),
            "at": time.time(),
        }
        # A saved model that OpenRouter retired (free periods end) gives way
        # to the .env model from the next request on
        retired = self._openrouter_model_override
        if retired and retired != settings.OPENROUTER_MODEL and "(HTTP 404)" in str(exc):
            logger.warning(
                "Cloud model %s is gone (404); back to %s", retired, settings.OPENROUTER_MODEL
            )
            self._openrouter_model_override = None
            self._save_runtime_settings()
        if "(HTTP 404)" in str(exc):
            # The model may have just left the free list: read the catalog now
            # rather than within the hour, so the next request uses a free one
            try:
                asyncio.get_running_loop().create_task(self.refresh_openrouter_models(force=True))
            except RuntimeError:
                pass

    @property
    def ollama_url(self) -> str:
        return settings.OLLAMA_URL

    @property
    def turboquant_url(self) -> str:
        return settings.TURBOQUANT_SERVICE_URL

    @property
    def default_model(self) -> str:
        # set-model updates ollama_service, so read the live value from there
        return ollama_service.default_model

    # ── Backend selection ─────────────────────────────────────────────

    async def _is_turboquant_ready(self) -> bool:
        """Check if TurboQuant service is reachable and has a model loaded."""
        # Re-check every 10 calls to avoid hammering the service
        self._tq_check_count += 1
        if self._tq_available is not None and self._tq_check_count % 10 != 0:
            return self._tq_available

        try:
            async with httpx.AsyncClient(timeout=2) as client:
                resp = await client.get(f"{self.turboquant_url}/health")
                if resp.status_code == 200:
                    data = resp.json()
                    self._tq_available = data.get("active_model_loaded", False)
                    self._tq_model = data.get("active_model")
                    return self._tq_available
        except (httpx.ConnectError, httpx.TimeoutException):
            pass

        self._tq_available = False
        return False

    async def _should_use_turboquant(self) -> bool:
        """Determine if this request should go through TurboQuant."""
        mode = self.backend_mode
        if mode == "ollama":
            return False
        if mode == "turboquant":
            return await self._is_turboquant_ready()
        # "auto" — use TurboQuant when available, fall back to Ollama
        return await self._is_turboquant_ready()

    def reset_cache(self) -> None:
        """Force re-check of TurboQuant availability on next request."""
        self._tq_available = None

    def describe_active(self) -> dict[str, Any]:
        """Backend/model that serves the next request, from cached state only (no I/O).

        `served` is what really answered last; `cloudIssue` is set while the
        cloud model is failing and requests fall back to a local model.
        """
        if self._use_openrouter():
            info: dict[str, Any] = {"backend": "openrouter", "model": self.openrouter_model, "cloud": True}
            if self.openrouter_model != self.configured_openrouter_model:
                info["replaced"] = {
                    "model": self.configured_openrouter_model,
                    "message": "não está mais grátis na OpenRouter; trocado por um modelo grátis de agora",
                }
        elif self.backend_mode != "ollama" and self._tq_available:
            info = {"backend": "turboquant", "model": self._tq_model or "", "cloud": False}
        else:
            info = {"backend": "ollama", "model": self.default_model, "cloud": False}
        if self._last_served:
            info["served"] = dict(self._last_served)
        if self._cloud_issue and self._use_openrouter():
            info["cloudIssue"] = dict(self._cloud_issue)
        elif self.backend_mode == "openrouter" and not openrouter_model_allowed(self.openrouter_model):
            # A paid model was chosen: the local model answers instead of spending credits
            info["cloudIssue"] = {
                "model": self.openrouter_model,
                "message": "modelo pago bloqueado para não gastar créditos; escolha um modelo grátis",
                "at": time.time(),
            }
        return info

    # ── Ollama methods ────────────────────────────────────────────────

    def _ollama_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.ollama_url,
            timeout=httpx.Timeout(settings.OLLAMA_TIMEOUT, connect=10.0),
        )

    async def _ollama_generate(
        self,
        prompt: str,
        model: str | None = None,
        system: str | None = None,
        format: str | None = None,
    ) -> str:
        payload: dict[str, Any] = {
            "model": model or self.default_model,
            "prompt": prompt,
            "stream": False,
        }
        if system:
            payload["system"] = system
        if format:
            payload["format"] = format

        async with self._ollama_client() as client:
            resp = await client.post("/api/generate", json=payload)
            resp.raise_for_status()
            return resp.json().get("response", "")

    async def _ollama_generate_stream(
        self,
        prompt: str,
        model: str | None = None,
        system: str | None = None,
    ) -> AsyncIterator[str]:
        """Stream tokens from Ollama generate endpoint."""
        payload: dict[str, Any] = {
            "model": model or self.default_model,
            "prompt": prompt,
            "stream": True,
        }
        if system:
            payload["system"] = system

        async with self._ollama_client() as client:
            async with client.stream("POST", "/api/generate", json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        token = data.get("response", "")
                        if token:
                            yield token
                    except json.JSONDecodeError:
                        continue

    async def _ollama_chat(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float | None = None,
    ) -> str:
        payload: dict[str, Any] = {
            "model": model or self.default_model,
            "messages": messages,
            "stream": False,
        }
        if temperature is not None:
            payload["options"] = {"temperature": temperature}
        async with self._ollama_client() as client:
            resp = await client.post("/api/chat", json=payload)
            resp.raise_for_status()
            return resp.json().get("message", {}).get("content", "")

    # ── TurboQuant methods ────────────────────────────────────────────

    async def _tq_generate(
        self,
        prompt: str,
        model: str | None = None,
        system: str | None = None,
    ) -> str:
        """Generate via TurboQuant's OpenAI-compatible chat completions."""
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=10.0)) as client:
            resp = await client.post(
                f"{self.turboquant_url}/v1/chat/completions",
                json={
                    "model": model,
                    "messages": messages,
                    "max_tokens": 2048,
                    "temperature": 0.7,
                },
            )
            resp.raise_for_status()
        return self._completion_text(resp, "TurboQuant")

    async def _tq_chat(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float | None = None,
    ) -> str:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=10.0)) as client:
            resp = await client.post(
                f"{self.turboquant_url}/v1/chat/completions",
                json={
                    "model": model,
                    "messages": messages,
                    "max_tokens": 2048,
                    "temperature": temperature if temperature is not None else 0.7,
                },
            )
            resp.raise_for_status()
        return self._completion_text(resp, "TurboQuant")

    async def _tq_generate_stream(
        self,
        prompt: str,
        model: str | None = None,
        system: str | None = None,
    ) -> AsyncIterator[str]:
        """Stream tokens from TurboQuant's OpenAI-compatible endpoint."""
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=10.0)) as client:
            async with client.stream(
                "POST",
                f"{self.turboquant_url}/v1/chat/completions",
                json={
                    "model": model,
                    "messages": messages,
                    "max_tokens": 2048,
                    "temperature": 0.7,
                    "stream": True,
                },
            ) as resp:
                resp.raise_for_status()
                yielded = False
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    token = self._stream_token(data, "TurboQuant")
                    if token:
                        yielded = True
                        yield token
                if not yielded:
                    raise RuntimeError("TurboQuant stream ended without content")

    # ── OpenRouter (cloud) methods ────────────────────────────────────
    # Scoped to this app only — no other codebase on this machine calls
    # this module, so enabling this here cannot route anything else's data.

    def _use_openrouter(self) -> bool:
        return (
            self.backend_mode == "openrouter"
            and bool(settings.OPENROUTER_API_KEY)
            and openrouter_model_allowed(self.openrouter_model)
        )

    def _or_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
            "X-Title": "Passarola",
        }

    @staticmethod
    def _messages(prompt: str, system: str | None) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return messages

    def _or_candidate_models(self) -> list[str]:
        """Active model first, then the fallbacks (deduplicated, order kept).

        The fallbacks are OPENROUTER_FALLBACK_MODELS, or when it is empty the next
        models of the free list, which follows the catalog instead of going stale.
        Unless paid models are allowed, a fallback that is not free now is skipped:
        it would spend credits.
        """
        free_ids = [m["id"] for m in self._or_free or []]
        configured = [m.strip() for m in settings.OPENROUTER_FALLBACK_MODELS.split(",") if m.strip()]
        fallbacks = configured or free_ids[: OR_CATALOG_FALLBACKS + 1]
        if not settings.OPENROUTER_ALLOW_PAID:
            fallbacks = [
                m for m in fallbacks if is_free_openrouter_model(m) and (not free_ids or m in free_ids)
            ]
        return list(dict.fromkeys([self.openrouter_model, *fallbacks]))

    @staticmethod
    def _or_should_try_next(exc: Exception) -> bool:
        """Model-level failures (gone, rate-limited, overloaded, empty) are worth another model."""
        if isinstance(exc, httpx.HTTPStatusError):
            return exc.response.status_code in OR_FALLBACK_STATUSES
        return isinstance(exc, (RuntimeError, httpx.TransportError))

    async def _or_chat_once(
        self,
        model: str,
        messages: list[dict[str, str]],
        temperature: float | None = None,
    ) -> str:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            # With default reasoning the model could spend the whole answer
            # budget thinking and return empty content; ignored by models
            # without reasoning
            "reasoning": {"effort": "low"},
            "max_tokens": OR_CHAT_MAX_TOKENS,
        }
        if temperature is not None:
            payload["temperature"] = temperature
        async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=10.0)) as client:
            resp = await client.post(
                f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                headers=self._or_headers(),
                json=payload,
            )
            if resp.status_code >= 400:
                try:
                    data = resp.json()
                except ValueError:
                    data = {}
                message = self._provider_error(data if isinstance(data, dict) else {}, resp)
                raise RuntimeError(f"O provedor recusou a requisição (HTTP {resp.status_code}): {message}")
        return self._completion_text(resp, "OpenRouter")

    async def _or_chat(
        self,
        messages: list[dict[str, str]],
        temperature: float | None = None,
    ) -> str:
        """Chat on the active model; on a model-level failure try the fallback models.

        Records the model that really answered, so the AI monitor names a fallback. When
        every model fails, raises the error of the chosen one, the one the user knows.
        """
        first_error: Exception | None = None
        for model in self._or_candidate_models():
            try:
                answer = await self._or_chat_once(model, messages, temperature)
            except Exception as exc:
                if not self._or_should_try_next(exc):
                    raise
                logger.warning("OpenRouter model %s failed (%s); trying the next one", model, exc)
                first_error = first_error or exc
                continue
            if model != self.openrouter_model:
                logger.info("OpenRouter answered with fallback model %s", model)
            self._served("openrouter", model)
            return answer
        assert first_error is not None
        raise first_error

    @classmethod
    def _completion_text(cls, resp: httpx.Response, source: str) -> str:
        """Content of a non-streamed chat completion; raises instead of returning ''."""
        try:
            data = resp.json()
        except ValueError:
            data = {}
        if not isinstance(data, dict):
            data = {}
        choices = data.get("choices") or []
        # OpenRouter can answer HTTP 200 with an error object when the upstream fails
        if data.get("error") and not choices:
            raise RuntimeError(f"{source} upstream error: {cls._provider_error(data, resp)}")
        content = (choices[0].get("message") or {}).get("content") if choices else None
        if not content:
            finish = choices[0].get("finish_reason") if choices else None
            raise RuntimeError(f"{source} returned an empty answer (finish_reason={finish})")
        return content

    @classmethod
    def _stream_token(cls, chunk: dict[str, Any], source: str) -> str:
        """Content delta of one SSE chunk; raises on an in-stream error object."""
        error = chunk.get("error")
        if error:
            message = error.get("message") if isinstance(error, dict) else error
            raise RuntimeError(f"{source} stream error: {message}")
        choices = chunk.get("choices") or [{}]
        return (choices[0].get("delta") or {}).get("content") or ""

    async def _or_stream_once(self, model: str, prompt: str, system: str | None) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=10.0)) as client:
            async with client.stream(
                "POST",
                f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                headers=self._or_headers(),
                json={
                    "model": model,
                    "messages": self._messages(prompt, system),
                    "stream": True,
                },
            ) as resp:
                if resp.status_code >= 400:
                    await resp.aread()
                    try:
                        data = resp.json()
                    except ValueError:
                        data = {}
                    message = self._provider_error(data if isinstance(data, dict) else {}, resp)
                    raise RuntimeError(f"O provedor recusou a requisição (HTTP {resp.status_code}): {message}")
                yielded = False
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    token = self._stream_token(chunk, "OpenRouter")
                    if token:
                        yielded = True
                        yield token
                if not yielded:
                    raise RuntimeError("OpenRouter stream ended without content")

    async def _or_generate_stream(self, prompt: str, system: str | None) -> AsyncIterator[str]:
        """Stream on the active model; fall back to the next one only before any token was sent.

        Like `_or_chat`, records the model that answered and raises the chosen model's error.
        """
        first_error: Exception | None = None
        for model in self._or_candidate_models():
            started = False
            try:
                async for token in self._or_stream_once(model, prompt, system):
                    started = True
                    yield token
                self._served("openrouter", model)
                return
            except Exception as exc:
                if started or not self._or_should_try_next(exc):
                    raise
                logger.warning("OpenRouter model %s failed to stream (%s); trying the next one", model, exc)
                first_error = first_error or exc
        assert first_error is not None
        raise first_error

    # ── Unified public interface ──────────────────────────────────────

    async def generate(
        self,
        prompt: str,
        model: str | None = None,
        system: str | None = None,
        format: str | None = None,
    ) -> str:
        """Generate a completion — routes to OpenRouter, TurboQuant or Ollama."""
        if self._use_openrouter():
            try:
                return await self._or_chat(self._messages(prompt, system))
            except Exception as exc:
                self._cloud_failed(exc)
                logger.warning("OpenRouter generate failed, falling back to local backend", exc_info=True)

        if await self._should_use_turboquant():
            try:
                logger.debug("Routing generate to TurboQuant")
                text = await self._tq_generate(prompt, model, system)
                self._served("turboquant", self._tq_model)
                return text
            except Exception:
                logger.warning("TurboQuant generate failed, falling back to Ollama")
                self._tq_available = False

        text = await self._ollama_generate(prompt, model, system, format)
        self._served("ollama", model or self.default_model)
        return text

    async def generate_stream(
        self,
        prompt: str,
        model: str | None = None,
        system: str | None = None,
    ) -> AsyncIterator[str]:
        """Stream tokens from the active backend."""
        if self._use_openrouter():
            try:
                async for token in self._or_generate_stream(prompt, system):
                    yield token
                return
            except Exception as exc:
                self._cloud_failed(exc)
                logger.warning("OpenRouter stream failed, falling back to local backend", exc_info=True)

        if await self._should_use_turboquant():
            try:
                logger.debug("Routing generate_stream to TurboQuant")
                async for token in self._tq_generate_stream(prompt, model, system):
                    yield token
                self._served("turboquant", self._tq_model)
                return
            except Exception:
                logger.warning("TurboQuant stream failed, falling back to Ollama")
                self._tq_available = False

        async for token in self._ollama_generate_stream(prompt, model, system):
            yield token
        self._served("ollama", model or self.default_model)

    async def generate_json(
        self,
        prompt: str,
        model: str | None = None,
        system: str | None = None,
        _retries: int = 1,
    ) -> dict[str, Any]:
        """Generate a JSON response — routes to TurboQuant or Ollama.

        Retries once on parse failure since smaller models sometimes
        produce malformed JSON on the first attempt.
        """
        if self._use_openrouter():
            # One retry on an empty/garbled answer: the local fallback is far
            # slower and, without a GPU, can stall the whole request
            for attempt in range(2):
                try:
                    raw = await self._or_chat(
                        self._messages(prompt, system), temperature=JSON_TEMPERATURE
                    )
                    return _parse_json_response(raw)
                except Exception as exc:
                    if attempt == 0:
                        logger.warning("OpenRouter generate_json failed, retrying once")
                        continue
                    self._cloud_failed(exc)
                    logger.warning(
                        "OpenRouter generate_json failed, falling back to local backend",
                        exc_info=True,
                    )

        if await self._should_use_turboquant():
            try:
                logger.debug("Routing generate_json to TurboQuant")
                raw = await self._tq_generate(prompt, model, system)
                parsed = _parse_json_response(raw)
                self._served("turboquant", self._tq_model)
                return parsed
            except Exception:
                logger.warning("TurboQuant generate_json failed, falling back to Ollama")
                self._tq_available = False

        # Ollama path with format="json"
        last_error: Exception | None = None
        for attempt in range(_retries + 1):
            try:
                raw = await self._ollama_generate(prompt, model, system, format="json")
                parsed = _parse_json_response(raw)
                self._served("ollama", model or self.default_model)
                return parsed
            except ValueError as e:
                last_error = e
                if attempt < _retries:
                    logger.warning("JSON parse failed (attempt %d), retrying: %s", attempt + 1, e)
                    continue
                raise

    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float | None = None,
    ) -> str:
        """Multi-turn chat — routes to TurboQuant or Ollama."""
        if await self._should_use_turboquant():
            try:
                logger.debug("Routing chat to TurboQuant")
                text = await self._tq_chat(messages, model, temperature)
                self._served("turboquant", self._tq_model)
                return text
            except Exception:
                logger.warning("TurboQuant chat failed, falling back to Ollama")
                self._tq_available = False

        text = await self._ollama_chat(messages, model, temperature)
        self._served("ollama", model or self.default_model)
        return text

    # ── Vision (multimodal) ───────────────────────────────────────────
    # Kept apart from generate()/chat(): those fall back to Ollama on errors,
    # and an image request must never silently degrade to text-only.

    async def _openrouter_catalog(self) -> dict[str, list[str]] | None:
        """OpenRouter model id -> input modalities, cached ~1 h. None if never fetched."""
        now = time.monotonic()
        if self._or_catalog is not None and now - self._or_catalog_at < OPENROUTER_CATALOG_TTL:
            return self._or_catalog
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(20, connect=10.0)) as client:
                resp = await client.get(f"{settings.OPENROUTER_BASE_URL}/models")
                resp.raise_for_status()
                entries = resp.json().get("data") or []
        except Exception:
            logger.warning("OpenRouter model catalog unavailable", exc_info=True)
            return self._or_catalog  # a stale copy still beats guessing

        catalog: dict[str, list[str]] = {}
        for entry in entries:
            if isinstance(entry, dict) and isinstance(entry.get("id"), str):
                architecture = entry.get("architecture") or {}
                catalog[entry["id"]] = list(architecture.get("input_modalities") or [])
        if not catalog:
            return self._or_catalog
        self._or_catalog = catalog
        self._or_catalog_at = now
        before = self.openrouter_model
        self._or_free = free_chat_models(entries)
        if self.openrouter_model != before:
            logger.warning(
                "Cloud model %s is no longer free on OpenRouter; using %s",
                self.configured_openrouter_model,
                self.openrouter_model,
            )
        return catalog

    async def _openrouter_vision(self, model: str) -> tuple[bool, str]:
        catalog = await self._openrouter_catalog()
        if catalog is None:
            return False, (
                "Não consegui consultar o catálogo da OpenRouter, então não dá para "
                f"confirmar que '{model}' aceita imagens."
            )
        modalities = catalog.get(model)
        if modalities is None:
            modalities = catalog.get(model.split(":", 1)[0])
        if modalities is None:
            return False, (
                f"O modelo '{model}' não aparece no catálogo da OpenRouter, então não "
                "dá para confirmar que ele aceita imagens."
            )
        if "image" not in modalities:
            accepted = ", ".join(_MODALITY_LABELS.get(m, m) for m in modalities) or "texto"
            return False, f"O modelo '{model}' não aceita imagens (entrada: {accepted})."
        return True, ""

    async def _ollama_vision(self, model: str) -> tuple[bool, str]:
        try:
            async with self._ollama_client() as client:
                resp = await client.post("/api/show", json={"model": model, "name": model})
            info = resp.json() if resp.status_code == 200 else {}
        except (httpx.HTTPError, ValueError):
            return False, "Não consegui consultar o Ollama para confirmar que o modelo local aceita imagens."
        if resp.status_code == 404:
            return False, f"O modelo '{model}' não está instalado no Ollama."
        if resp.status_code != 200:
            return False, f"O Ollama respondeu HTTP {resp.status_code} ao consultar '{model}'."

        capabilities = info.get("capabilities")
        if isinstance(capabilities, list):
            supported = "vision" in capabilities
        else:
            families = (info.get("details") or {}).get("families") or []
            supported = bool(info.get("projector_info")) or "clip" in families
        if not supported:
            return False, f"O modelo local '{model}' não aceita imagens."
        return True, ""

    async def vision_support(self) -> dict[str, Any]:
        """Whether the backend that would really serve the next request accepts images.

        Returns {backend, model, cloud, ok, reason}; reason is empty when ok.
        """
        if self._use_openrouter():
            backend, model = "openrouter", self.openrouter_model
            ok, reason = await self._openrouter_vision(model)
        elif await self._should_use_turboquant():
            backend, model = "turboquant", self._tq_model or ""
            ok, reason = False, (
                "O serviço TurboQuant só trata texto (não aceita imagens). "
                "Use um modelo local com visão no Ollama ou um modelo multimodal da OpenRouter."
            )
        else:
            backend, model = "ollama", self.default_model
            ok, reason = await self._ollama_vision(model)
        return {"backend": backend, "model": model, "cloud": backend == "openrouter", "ok": ok, "reason": reason}

    async def chat_vision(
        self,
        messages: list[dict[str, Any]],
        max_tokens: int = 4096,
        temperature: float = 0.2,
    ) -> str:
        """Multimodal chat on the active backend. No text-only fallback: failures propagate."""
        support = await self.vision_support()
        if not support["ok"]:
            raise VisionUnsupportedError(support["reason"])

        backend, model = support["backend"], support["model"]
        if backend == "openrouter":
            url = f"{settings.OPENROUTER_BASE_URL}/chat/completions"
            headers, read_timeout = self._or_headers(), 300.0
        else:
            url = f"{self.ollama_url}/v1/chat/completions"
            headers, read_timeout = {}, float(settings.OLLAMA_TIMEOUT)

        images = sum(
            1
            for message in messages
            if isinstance(message.get("content"), list)
            for part in message["content"]
            if part.get("type") == "image_url"
        )
        logger.info("Vision request: backend=%s model=%s images=%d", backend, model, images)

        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if backend == "openrouter":
            # Default reasoning ran for minutes and could still leave the answer empty
            payload["reasoning"] = {"effort": "low"}
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(read_timeout, connect=10.0)) as client:
                resp = await client.post(url, headers=headers, json=payload)
        except httpx.HTTPError as exc:
            if backend == "openrouter":
                self._cloud_failed(exc)
            raise RuntimeError(
                f"Falha de rede ao chamar o modelo '{model}' ({type(exc).__name__}): {exc}"
            ) from exc

        try:
            data = resp.json()
        except ValueError:
            data = {}
        if not isinstance(data, dict):
            data = {}

        # OpenRouter can answer HTTP 200 with an error object when the upstream fails
        error = data.get("error")
        if resp.status_code >= 400 or (error and not data.get("choices")):
            message = self._provider_error(data, resp)
            code = resp.status_code
            if code < 400 and isinstance(error, dict) and isinstance(error.get("code"), int):
                code = error["code"]
            if 400 <= code < 500 and _IMAGE_ERROR_RE.search(message):
                raise VisionUnsupportedError(f"O modelo '{model}' recusou a imagem: {message}")
            error_text = f"O provedor recusou a requisição (HTTP {code}): {message}"
            if backend == "openrouter":
                self._cloud_failed(RuntimeError(error_text))
            raise RuntimeError(error_text)

        choices = data.get("choices") or []
        content = ((choices[0].get("message") or {}).get("content")) if choices else None
        if isinstance(content, list):
            content = "".join(p.get("text", "") for p in content if isinstance(p, dict))
        text = (content or "").strip()
        if not text:
            hint = ""
            if choices and choices[0].get("finish_reason") == "length":
                hint = (
                    " Ele gastou o limite de tokens desta resposta raciocinando antes de responder"
                    " (não é limite diário). Tente de novo."
                )
            raise RuntimeError(f"O modelo '{model}' devolveu uma resposta vazia.{hint}")
        self._served(backend, model)
        return text

    @staticmethod
    def _provider_error(data: dict[str, Any], resp: httpx.Response) -> str:
        error = data.get("error")
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])
        if error:
            return str(error)
        return resp.text[:300] or f"HTTP {resp.status_code}"

    # ── Multi-turn chat stream (studio chat) ──────────────────────────

    async def _openai_stream(
        self, url: str, headers: dict[str, str], payload: dict[str, Any], model: str
    ) -> AsyncIterator[str]:
        """Yield content deltas from an OpenAI-compatible SSE endpoint, surfacing provider errors."""
        async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=10.0)) as client:
            async with client.stream("POST", url, headers=headers, json={**payload, "stream": True}) as resp:
                if resp.status_code >= 400:
                    await resp.aread()
                    try:
                        data = resp.json()
                    except ValueError:
                        data = {}
                    message = self._provider_error(data if isinstance(data, dict) else {}, resp)
                    if resp.status_code < 500 and _IMAGE_ERROR_RE.search(message):
                        raise VisionUnsupportedError(f"O modelo '{model}' recusou a imagem: {message}")
                    raise RuntimeError(f"O provedor recusou a requisição (HTTP {resp.status_code}): {message}")
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    if chunk.get("error"):
                        error = chunk["error"]
                        raise RuntimeError(str(error.get("message") if isinstance(error, dict) else error))
                    choices = chunk.get("choices") or [{}]
                    token = (choices[0].get("delta") or {}).get("content") or ""
                    if token:
                        yield token

    async def chat_stream(
        self, messages: list[dict[str, Any]], temperature: float = 0.4
    ) -> AsyncIterator[str]:
        """Stream a multi-turn chat whose messages may carry image parts.

        With images, the backend that really serves the request must accept them
        (VisionUnsupportedError otherwise) and failures propagate. Text-only chats
        keep the usual OpenRouter -> TurboQuant -> Ollama fallback.
        """
        has_images = any(
            isinstance(m.get("content"), list) and any(p.get("type") == "image_url" for p in m["content"])
            for m in messages
        )
        if has_images:
            support = await self.vision_support()
            if not support["ok"]:
                raise VisionUnsupportedError(support["reason"])
            candidates = [support["backend"]]
        else:
            # Plain strings keep text-only backends (TurboQuant) happy
            messages = [
                {
                    **m,
                    "content": m["content"]
                    if isinstance(m["content"], str)
                    else "\n".join(p.get("text", "") for p in m["content"] if p.get("type") == "text"),
                }
                for m in messages
            ]
            candidates = []
            if self._use_openrouter():
                candidates.append("openrouter")
            if await self._should_use_turboquant():
                candidates.append("turboquant")
            candidates.append("ollama")

        for index, backend in enumerate(candidates):
            payload: dict[str, Any] = {"messages": messages, "temperature": temperature}
            if backend == "openrouter":
                model = self.openrouter_model
                # Short reasoning keeps the studio chat responsive; ignored by models without it
                payload.update(model=model, reasoning={"effort": "low"})
                url, headers = f"{settings.OPENROUTER_BASE_URL}/chat/completions", self._or_headers()
            elif backend == "turboquant":
                model = self._tq_model or ""
                payload.update(model=self._tq_model, max_tokens=2048)
                url, headers = f"{self.turboquant_url}/v1/chat/completions", {}
            else:
                model = self.default_model
                payload.update(model=model)
                url, headers = f"{self.ollama_url}/v1/chat/completions", {}

            if has_images:
                images = sum(
                    1
                    for m in messages
                    if isinstance(m.get("content"), list)
                    for p in m["content"]
                    if p.get("type") == "image_url"
                )
                logger.info("Studio chat with images: backend=%s model=%s images=%d", backend, model, images)

            yielded = False
            try:
                async for token in self._openai_stream(url, headers, payload, model):
                    yielded = True
                    yield token
                self._served(backend, model)
                return
            except Exception as exc:
                if backend == "openrouter" and not isinstance(exc, VisionUnsupportedError):
                    self._cloud_failed(exc)
                if has_images or yielded or index == len(candidates) - 1:
                    raise
                logger.warning("Studio chat via %s failed, falling back", backend, exc_info=True)
                if backend == "turboquant":
                    self._tq_available = False

    async def check_available(self) -> bool:
        """Check if any LLM backend is available."""
        if self._use_openrouter():
            return True
        if await self._is_turboquant_ready():
            return True
        # Fall back to checking Ollama
        try:
            async with self._ollama_client() as client:
                resp = await client.get("/api/tags")
                return resp.status_code == 200
        except (httpx.ConnectError, httpx.TimeoutException):
            return False

    async def get_status(self) -> dict[str, Any]:
        """Get status of both backends."""
        tq_ready = await self._is_turboquant_ready()

        ollama_available = False
        ollama_models: list[dict] = []
        try:
            async with self._ollama_client() as client:
                resp = await client.get("/api/tags")
                if resp.status_code == 200:
                    ollama_available = True
                    ollama_models = resp.json().get("models", [])
        except Exception:
            pass

        tq_model = None
        if tq_ready:
            try:
                async with httpx.AsyncClient(timeout=2) as client:
                    resp = await client.get(f"{self.turboquant_url}/health")
                    if resp.status_code == 200:
                        tq_model = resp.json().get("active_model")
            except Exception:
                pass

        if self._use_openrouter():
            active_backend = "openrouter"
        elif tq_ready and self.backend_mode != "ollama":
            active_backend = "turboquant"
        else:
            active_backend = "ollama"

        return {
            "active_backend": active_backend,
            "backend_mode": self.backend_mode,
            "ollama": {
                "available": ollama_available,
                "url": self.ollama_url,
                "default_model": self.default_model,
                "models": ollama_models,
            },
            "turboquant": {
                "available": tq_ready,
                "url": self.turboquant_url,
                "active_model": tq_model,
                "kv_cache_bits": settings.KV_CACHE_BITS,
            },
            "openrouter": {
                "available": self._use_openrouter(),
                "configured": bool(settings.OPENROUTER_API_KEY),
                "model": self.openrouter_model,
            },
        }


def _cloud_error_summary(exc: BaseException) -> str:
    """Short reason (pt-BR) why the cloud model failed, for the AI monitor."""
    text = str(exc)
    match = re.search(r"HTTP (\d{3})", text)
    status = int(match.group(1)) if match else None
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        text = f"{text} {exc.response.text[:300]}"
    lowered = text.lower()
    if "no endpoints found" in lowered or status == 404:
        return "o modelo saiu do ar na OpenRouter"
    if status == 429:
        return "limite de uso atingido no momento"
    if status == 402:
        return "sem créditos na OpenRouter"
    if status in (401, 403):
        return "a OpenRouter recusou a chave ou este modelo"
    if isinstance(exc, httpx.TimeoutException):
        return "a nuvem demorou demais para responder"
    if isinstance(exc, httpx.HTTPError):
        return "falha de rede ao falar com a OpenRouter"
    if isinstance(exc, ValueError):
        return "o modelo devolveu uma resposta vazia ou inválida"
    return text[:140] or type(exc).__name__


def _parse_json_response(raw: str) -> dict[str, Any]:
    """Parse a JSON response from an LLM, handling common quirks."""
    cleaned = raw.strip()
    if not cleaned:
        raise ValueError("LLM returned empty response")

    # Remove markdown code fences (```json ... ``` or ``` ... ```)
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", cleaned)
    cleaned = re.sub(r"\n?\s*```\s*$", "", cleaned)
    cleaned = cleaned.strip()

    # Strip any leading text before the first { (e.g. "Here is the JSON:\n{...")
    brace_start = cleaned.find("{")
    bracket_start = cleaned.find("[")
    if brace_start == -1 and bracket_start == -1:
        raise ValueError("LLM did not return valid JSON")

    # Pick whichever comes first
    if brace_start == -1:
        start = bracket_start
    elif bracket_start == -1:
        start = brace_start
    else:
        start = min(brace_start, bracket_start)
    cleaned = cleaned[start:]

    # Try direct parse first
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Strip trailing junk after the last } or ]
    for end_char_pos in range(len(cleaned) - 1, -1, -1):
        if cleaned[end_char_pos] in ("}", "]"):
            try:
                return json.loads(cleaned[: end_char_pos + 1])
            except json.JSONDecodeError:
                continue

    # Try fixing truncated JSON (LLM stopped mid-output)
    fixed = cleaned.rstrip()
    # Close any open strings
    if fixed.count('"') % 2 != 0:
        # Find last incomplete string value and close it
        fixed += '"'
    # Remove trailing comma before closing brackets
    fixed = re.sub(r",\s*$", "", fixed)
    # Close open brackets and braces
    open_brackets = fixed.count("[") - fixed.count("]")
    open_braces = fixed.count("{") - fixed.count("}")
    fixed += "]" * max(0, open_brackets)
    fixed += "}" * max(0, open_braces)

    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    # Last resort: try to extract any JSON object with a regex
    match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    logger.warning("Failed to parse LLM JSON response: %s", cleaned[:500])
    raise ValueError("LLM did not return valid JSON")


# Module-level singleton
llm_backend = LLMBackend()
