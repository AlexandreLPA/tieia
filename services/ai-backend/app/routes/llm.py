"""LLM status and model management routes."""

import json
import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator

from app.config import settings
from app.services.model_backend import VisionUnsupportedError, llm_backend, openrouter_model_allowed
from app.services.ollama_service import ollama_service
from app.services.tiktok_compliance import validate_image_data_uri

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/llm", tags=["llm"])

DEFAULT_SYSTEM_PROMPT = (
    "Você é um assistente de produção de vídeo. "
    "Ajude a ter ideias de vídeo, escrever roteiros, planejar conteúdo, "
    "sugerir thumbnails e melhorar projetos de vídeo. "
    "Seja criativo, específico e prático. Mantenha as respostas concisas. "
    "Responda sempre em português do Brasil."
)

STUDIO_CONTEXT_PROMPT = (
    "O usuário está editando um vídeo no OpenCut. Antes da conversa você recebe o contexto do "
    "projeto aberto: resumo da timeline, transcrição com tempos e, quando o vídeo for anexado, "
    "quadros tirados da timeline montada, cada um com o seu tempo. Use esse contexto para "
    "responder sobre o vídeo e cite o tempo (mm:ss) ao falar de um momento. Os quadros são "
    "amostras: não descreva o que acontece entre eles como se tivesse visto. A transcrição é "
    "automática e pode ter erros. Se o contexto disser que os quadros NÃO foram enviados, deixe "
    "claro que você está se baseando só na transcrição e na timeline. Imagens anexadas pelo "
    "usuário vêm na própria mensagem dele. O contexto também traz o MAPA DA INTERFACE: quando "
    "perguntarem onde fica um botão ou recurso, responda com o caminho do mapa e ofereça a ação "
    "abrir; se não estiver no mapa, diga que não sabe em vez de inventar."
)

MAX_CHAT_IMAGES = 40


class PullModelRequest(BaseModel):
    model: str


class SetModelRequest(BaseModel):
    model: str


class ChatPart(BaseModel):
    type: Literal["text", "image_url"]
    text: str | None = Field(default=None, max_length=60_000)
    image_url: dict[str, str] | None = None

    @model_validator(mode="after")
    def _check_part(self) -> "ChatPart":
        if self.type == "text":
            if self.text is None:
                raise ValueError("Parte de texto sem 'text'.")
        else:
            url = (self.image_url or {}).get("url")
            if not url:
                raise ValueError("Parte de imagem sem 'image_url.url'.")
            validate_image_data_uri(url)
        return self


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str | list[ChatPart]


class ChatRequest(BaseModel):
    message: str = ""
    system: str | None = None
    model: str | None = None
    # Studio chat: full conversation, user turns may carry image parts
    messages: list[ChatTurn] | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def _check_images(self) -> "ChatRequest":
        images = sum(
            1
            for turn in self.messages or []
            if isinstance(turn.content, list)
            for part in turn.content
            if part.type == "image_url"
        )
        if images > MAX_CHAT_IMAGES:
            raise ValueError(f"Imagens demais na conversa ({images}); o máximo é {MAX_CHAT_IMAGES}.")
        return self


class LLMStatusResponse(BaseModel):
    available: bool
    url: str
    default_model: str = ""
    active_backend: str = "ollama"
    turboquant_available: bool = False
    turboquant_model: str | None = None
    models: list[dict] = []


@router.get("/status")
async def llm_status() -> dict:
    """Check LLM availability, list models, and show active backend."""
    status = await llm_backend.get_status()
    ollama = status["ollama"]
    tq = status["turboquant"]
    orouter = status["openrouter"]

    return {
        "available": ollama["available"] or tq["available"] or orouter["available"],
        "url": "openrouter (cloud)" if orouter["available"] else ollama["url"],
        "default_model": orouter["model"] if orouter["available"] else ollama_service.default_model,
        "active_backend": status["active_backend"],
        "turboquant_available": tq["available"],
        "turboquant_model": tq["active_model"],
        "kv_cache_bits": tq["kv_cache_bits"],
        "models": ollama["models"],
        "openrouter_configured": orouter["configured"],
        "openrouter_model": orouter["model"],
        # What really answers, incl. a local fallback while the cloud model fails
        "llm": llm_backend.describe_active(),
    }


@router.post("/chat")
async def chat(request: ChatRequest) -> dict:
    """Free-form chat with the LLM.

    Routes through TurboQuant when available (auto mode), otherwise Ollama.
    """
    available = await llm_backend.check_available()
    if not available:
        raise HTTPException(
            status_code=503,
            detail="No LLM backend available. Start Ollama or TurboQuant service.",
        )

    system_prompt = request.system or DEFAULT_SYSTEM_PROMPT

    try:
        response = await llm_backend.generate(
            prompt=request.message,
            model=request.model,
            system=system_prompt,
        )
        return {"response": response}
    except Exception:
        logger.exception("Chat generation failed")
        raise HTTPException(status_code=500, detail="Failed to generate response.")


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    """Streaming chat — sends tokens as newline-delimited JSON.

    Each line is a JSON object: {"token": "..."} or {"done": true}.
    This prevents timeouts on slow hardware by sending data as it's generated.
    """
    available = await llm_backend.check_available()
    if not available:
        raise HTTPException(
            status_code=503,
            detail="No LLM backend available. Start Ollama or TurboQuant service.",
        )

    if request.messages:
        return _studio_chat_stream(request)

    system_prompt = request.system or DEFAULT_SYSTEM_PROMPT

    async def _stream():
        try:
            async for token in llm_backend.generate_stream(
                prompt=request.message,
                model=request.model,
                system=system_prompt,
            ):
                yield json.dumps({"token": token}) + "\n"
            yield json.dumps({"done": True}) + "\n"
        except Exception:
            logger.exception("Streaming chat generation failed")
            yield json.dumps({"error": "Failed to generate response."}) + "\n"

    return StreamingResponse(
        _stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


def _studio_chat_stream(request: ChatRequest) -> StreamingResponse:
    """Stream a multi-turn, possibly multimodal studio chat. Refusals and failures arrive as {"error"}."""
    system = request.system or f"{DEFAULT_SYSTEM_PROMPT}\n\n{STUDIO_CONTEXT_PROMPT}"
    messages = [{"role": "system", "content": system}] + [
        turn.model_dump(exclude_none=True) for turn in request.messages or []
    ]

    async def _stream():
        produced = False
        try:
            async for token in llm_backend.chat_stream(messages):
                produced = True
                yield json.dumps({"token": token}) + "\n"
            if produced:
                yield json.dumps({"done": True}) + "\n"
            else:
                yield json.dumps({"error": "O modelo devolveu uma resposta vazia. Tente de novo."}) + "\n"
        except VisionUnsupportedError as exc:
            logger.warning("Studio chat refused: %s", exc)
            yield json.dumps({"error": str(exc)}) + "\n"
        except Exception as exc:
            logger.exception("Studio chat failed")
            yield json.dumps({"error": f"Falha ao gerar a resposta: {exc}"}) + "\n"

    return StreamingResponse(
        _stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/vision-support")
async def vision_support() -> dict:
    """Whether the active LLM accepts images, so the studio chat knows if it can attach frames."""
    return await llm_backend.vision_support()


@router.post("/set-model")
async def set_model(request: SetModelRequest) -> dict:
    """Switch the active Ollama model at runtime.

    The model must already be pulled. All subsequent LLM requests
    (chat, commands, analysis) will use this model.
    """
    available = await ollama_service.check_available()
    if not available:
        raise HTTPException(status_code=503, detail="Ollama is not available.")

    # Verify the model exists
    models = await ollama_service.list_models()
    model_names = [m.get("name", "") for m in models]

    # Ollama model names can be "llama3.2:1b" or "llama3.2:latest"
    # Allow partial matches (e.g. "llama3.2:1b" matches "llama3.2:1b")
    found = request.model in model_names or any(
        request.model in name or name.startswith(request.model)
        for name in model_names
    )

    if not found:
        raise HTTPException(
            status_code=404,
            detail=f"Model '{request.model}' not found. "
            f"Pull it first with POST /api/llm/pull-model. "
            f"Available: {model_names}",
        )

    old_model = ollama_service.default_model
    ollama_service.default_model = request.model
    logger.info("Switched default model: %s -> %s", old_model, request.model)

    return {
        "status": "switched",
        "previous_model": old_model,
        "current_model": request.model,
    }


@router.get("/cloud-models")
async def cloud_models() -> dict:
    """Chat models OpenRouter serves for free right now, best first.

    `active` is the one that answers; it differs from `configured` when the
    picked model stopped being free and the best free one took its place.
    """
    free = await llm_backend.refresh_openrouter_models()
    return {
        "models": free or [],
        "catalogAvailable": free is not None,
        "active": llm_backend.openrouter_model,
        "configured": llm_backend.configured_openrouter_model,
        "allowPaid": settings.OPENROUTER_ALLOW_PAID,
    }


class SetCloudModelRequest(BaseModel):
    model: str


@router.post("/set-cloud-model")
async def set_cloud_model(request: SetCloudModelRequest) -> dict:
    """Switch to a cloud model via OpenRouter at runtime — no restart needed.

    Requires OPENROUTER_API_KEY to already be set in .env (this endpoint
    only switches which model/backend is active, it never sets the key).
    """
    if not settings.OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=400,
            detail="Nenhuma chave da OpenRouter configurada. Adicione OPENROUTER_API_KEY no .env primeiro.",
        )

    if not openrouter_model_allowed(request.model):
        raise HTTPException(
            status_code=400,
            detail=(
                f"O modelo '{request.model}' é pago e gastaria créditos da OpenRouter. "
                "Escolha um modelo grátis (o nome termina em ':free') ou defina "
                "OPENROUTER_ALLOW_PAID=true no .env."
            ),
        )

    free = await llm_backend.refresh_openrouter_models()
    if not settings.OPENROUTER_ALLOW_PAID and free and request.model not in {m["id"] for m in free}:
        raise HTTPException(
            status_code=400,
            detail=(
                f"O modelo '{request.model}' não está grátis na OpenRouter agora. "
                "Escolha um da lista de modelos grátis."
            ),
        )

    old_backend = llm_backend.backend_mode
    old_model = llm_backend.openrouter_model
    llm_backend.set_backend("openrouter", request.model)
    logger.info("Switched to cloud model: %s -> %s", old_model, request.model)

    return {
        "status": "switched",
        "previous_backend": old_backend,
        "current_backend": "openrouter",
        "current_model": request.model,
    }


@router.post("/set-local-backend")
async def set_local_backend() -> dict:
    """Switch back to local inference (Ollama/TurboQuant), undoing set-cloud-model."""
    old_backend = llm_backend.backend_mode
    llm_backend.set_backend("auto")
    logger.info("Switched back to local backend from: %s", old_backend)
    return {"status": "switched", "previous_backend": old_backend, "current_backend": "auto"}


@router.post("/pull-model")
async def pull_model(request: PullModelRequest) -> StreamingResponse:
    """Pull/download a model from the Ollama registry.

    Returns a streaming response with newline-delimited JSON for progress.
    Each line: {"status": "...", "completed": N, "total": N, "progress": 0-100}
    Final line on success: {"status": "success", "model": "..."}
    """
    available = await ollama_service.check_available()
    if not available:
        raise HTTPException(
            status_code=503,
            detail="Ollama server is not available. Please start Ollama first.",
        )

    async def _stream():
        try:
            async for update in ollama_service.pull_model_stream(request.model):
                # Compute a progress percentage when Ollama provides totals
                total = update.get("total", 0)
                completed = update.get("completed", 0)
                progress = round((completed / total) * 100, 1) if total > 0 else 0

                yield json.dumps({
                    "status": update.get("status", "downloading"),
                    "digest": update.get("digest", ""),
                    "total": total,
                    "completed": completed,
                    "progress": progress,
                }) + "\n"

            yield json.dumps({
                "status": "success",
                "model": request.model,
                "progress": 100,
            }) + "\n"
        except Exception as e:
            logger.exception("Failed to pull model '%s'", request.model)
            yield json.dumps({
                "status": "error",
                "message": str(e),
            }) + "\n"

    return StreamingResponse(
        _stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
