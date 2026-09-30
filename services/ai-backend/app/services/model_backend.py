"""Unified LLM backend abstraction — routes requests to Ollama or TurboQuant.

This module provides a single interface for all LLM inference in OpenCut-AI.
When TurboQuant is enabled (and its service is reachable), requests are routed
through the TurboQuant inference service for KV cache compression. Otherwise,
they fall back to Ollama.

Usage in routes:
    from app.services.model_backend import llm_backend

    response = await llm_backend.generate(prompt="Hello", system="You are helpful.")
    data = await llm_backend.generate_json(prompt="...", system="...")
"""

import json
import logging
import re
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.config import settings
from app.services.ollama_service import ollama_service

logger = logging.getLogger(__name__)

OPENROUTER_CATALOG_TTL = 3600  # seconds

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
        # OpenRouter model id -> input modalities, fetched lazily by vision_support()
        self._or_catalog: dict[str, list[str]] | None = None
        self._or_catalog_at = 0.0

    # ── Public properties ─────────────────────────────────────────────

    @property
    def backend_mode(self) -> str:
        """Current backend preference: 'ollama', 'turboquant', 'openrouter', or 'auto'."""
        return self._backend_mode_override or settings.AI_LLM_BACKEND

    @property
    def openrouter_model(self) -> str:
        return self._openrouter_model_override or settings.OPENROUTER_MODEL

    def set_backend(self, mode: str, openrouter_model: str | None = None) -> None:
        """Switch the active backend at runtime (no restart needed)."""
        self._backend_mode_override = mode
        if openrouter_model:
            self._openrouter_model_override = openrouter_model

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
        """Backend/model that serves the next request, from cached state only (no I/O)."""
        if self._use_openrouter():
            return {"backend": "openrouter", "model": self.openrouter_model, "cloud": True}
        if self.backend_mode != "ollama" and self._tq_available:
            return {"backend": "turboquant", "model": self._tq_model or "", "cloud": False}
        return {"backend": "ollama", "model": self.default_model, "cloud": False}

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
            data = resp.json()
            choices = data.get("choices", [])
            if choices:
                return choices[0].get("message", {}).get("content", "")
            return ""

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
            data = resp.json()
            choices = data.get("choices", [])
            if choices:
                return choices[0].get("message", {}).get("content", "")
            return ""

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
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        delta = data.get("choices", [{}])[0].get("delta", {})
                        token = delta.get("content", "")
                        if token:
                            yield token
                    except (json.JSONDecodeError, IndexError):
                        continue

    # ── OpenRouter (cloud) methods ────────────────────────────────────
    # Scoped to this app only — no other codebase on this machine calls
    # this module, so enabling this here cannot route anything else's data.

    def _use_openrouter(self) -> bool:
        return self.backend_mode == "openrouter" and bool(settings.OPENROUTER_API_KEY)

    def _or_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
            "X-Title": "OpenCut AI",
        }

    @staticmethod
    def _messages(prompt: str, system: str | None) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return messages

    async def _or_chat(self, messages: list[dict[str, str]]) -> str:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=10.0)) as client:
            resp = await client.post(
                f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                headers=self._or_headers(),
                json={"model": self.openrouter_model, "messages": messages},
            )
            resp.raise_for_status()
            choices = resp.json().get("choices", [])
            return choices[0].get("message", {}).get("content") or "" if choices else ""

    async def _or_generate_stream(self, prompt: str, system: str | None) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=10.0)) as client:
            async with client.stream(
                "POST",
                f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                headers=self._or_headers(),
                json={
                    "model": self.openrouter_model,
                    "messages": self._messages(prompt, system),
                    "stream": True,
                },
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    try:
                        delta = json.loads(data_str).get("choices", [{}])[0].get("delta", {})
                        token = delta.get("content") or ""
                        if token:
                            yield token
                    except (json.JSONDecodeError, IndexError):
                        continue

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
            except Exception:
                logger.warning("OpenRouter generate failed, falling back to local backend", exc_info=True)

        if await self._should_use_turboquant():
            try:
                logger.debug("Routing generate to TurboQuant")
                return await self._tq_generate(prompt, model, system)
            except Exception:
                logger.warning("TurboQuant generate failed, falling back to Ollama")
                self._tq_available = False

        return await self._ollama_generate(prompt, model, system, format)

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
            except Exception:
                logger.warning("OpenRouter stream failed, falling back to local backend", exc_info=True)

        if await self._should_use_turboquant():
            try:
                logger.debug("Routing generate_stream to TurboQuant")
                async for token in self._tq_generate_stream(prompt, model, system):
                    yield token
                return
            except Exception:
                logger.warning("TurboQuant stream failed, falling back to Ollama")
                self._tq_available = False

        async for token in self._ollama_generate_stream(prompt, model, system):
            yield token

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
            try:
                raw = await self._or_chat(self._messages(prompt, system))
                return _parse_json_response(raw)
            except Exception:
                logger.warning("OpenRouter generate_json failed, falling back to local backend", exc_info=True)

        if await self._should_use_turboquant():
            try:
                logger.debug("Routing generate_json to TurboQuant")
                raw = await self._tq_generate(prompt, model, system)
                return _parse_json_response(raw)
            except Exception:
                logger.warning("TurboQuant generate_json failed, falling back to Ollama")
                self._tq_available = False

        # Ollama path with format="json"
        last_error: Exception | None = None
        for attempt in range(_retries + 1):
            try:
                raw = await self._ollama_generate(prompt, model, system, format="json")
                return _parse_json_response(raw)
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
                return await self._tq_chat(messages, model, temperature)
            except Exception:
                logger.warning("TurboQuant chat failed, falling back to Ollama")
                self._tq_available = False

        return await self._ollama_chat(messages, model, temperature)

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
            raise RuntimeError(f"O provedor recusou a requisição (HTTP {code}): {message}")

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
                return
            except Exception:
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
