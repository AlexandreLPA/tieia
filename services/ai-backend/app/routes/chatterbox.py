"""Chatterbox voice-cloning routes.

Proxies requests to the chatterbox-service microservice. Unlike tts-service,
the model loads on the first generation, so only the service itself has to be up.
"""

import logging
from urllib.parse import quote

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.config import settings
from app.models.audio import ChatterboxAnalyzeRequest, ChatterboxRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chatterbox", tags=["chatterbox"])

HEALTH_TIMEOUT = 5
# The first generation also loads the model, and downloads it (~3 GB) the first time.
GENERATE_TIMEOUT = 900
# Metrics of a take, passed on from the service with the WAV.
METRIC_HEADERS = ["X-Voice-Similarity", "X-Words-Per-Minute", "X-Seed", "X-Audio-Duration"]

NOT_RUNNING = (
    "Chatterbox service is not running. Start it with: "
    "docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d chatterbox-service"
)


async def _check_chatterbox_ready() -> None:
    """Raise an actionable HTTPException when the service is down or not installed."""
    try:
        async with httpx.AsyncClient(timeout=HEALTH_TIMEOUT) as client:
            resp = await client.get(f"{settings.CHATTERBOX_SERVICE_URL}/health")
            resp.raise_for_status()
            data = resp.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail=NOT_RUNNING)
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Cannot reach the Chatterbox service. Make sure it is running.",
        )

    if not data.get("model", {}).get("installed", False):
        raise HTTPException(
            status_code=503,
            detail="chatterbox-tts is not installed in the Chatterbox container. "
            "Rebuild with: docker compose build chatterbox-service",
        )


def _service_error(e: httpx.HTTPStatusError) -> HTTPException:
    try:
        detail = e.response.json().get("detail", e.response.text)
    except Exception:
        detail = e.response.text
    return HTTPException(status_code=e.response.status_code, detail=detail)


@router.post("/generate")
async def generate_speech(request: ChatterboxRequest):
    """Speak the text in the cloned voice.

    Returns the WAV; the take's similarity to the reference, pace, seed and
    duration come in X- headers.
    """
    await _check_chatterbox_ready()

    try:
        async with httpx.AsyncClient(timeout=GENERATE_TIMEOUT) as client:
            resp = await client.post(
                f"{settings.CHATTERBOX_SERVICE_URL}/generate",
                json=request.model_dump(),
            )
            resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise _service_error(e)
    except (httpx.RemoteProtocolError, httpx.ReadError):
        logger.error("Chatterbox service disconnected during generation — likely out of memory")
        raise HTTPException(
            status_code=503,
            detail="Chatterbox service crashed during generation (likely out of memory). "
            "Restart with: docker compose restart chatterbox-service",
        )
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail=NOT_RUNNING)
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Chatterbox took too long. Try a shorter text, or wait for the first model download to finish.",
        )
    except Exception:
        logger.exception("Chatterbox proxy failed")
        raise HTTPException(status_code=500, detail="Chatterbox generation failed.")

    headers = {"Content-Disposition": 'attachment; filename="chatterbox.wav"'}
    headers.update({name: resp.headers[name] for name in METRIC_HEADERS if name in resp.headers})
    return Response(
        content=resp.content,
        media_type=resp.headers.get("content-type", "audio/wav"),
        headers=headers,
    )


@router.post("/clone-voice")
async def clone_voice(
    name: str = Form(...),
    file: UploadFile = File(...),
) -> dict:
    """Upload a reference recording for Chatterbox to clone."""
    await _check_chatterbox_ready()

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            files = {"file": (file.filename, await file.read(), file.content_type)}
            resp = await client.post(
                f"{settings.CHATTERBOX_SERVICE_URL}/clone-voice",
                files=files,
                data={"name": name},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        raise _service_error(e)
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail=NOT_RUNNING)
    except Exception:
        logger.exception("Chatterbox voice upload proxy failed")
        raise HTTPException(status_code=500, detail="Failed to save voice reference.")


@router.post("/analyze-reference")
async def analyze_reference(request: ChatterboxAnalyzeRequest) -> dict:
    """Check a saved reference for what helps or hurts a clone, with advice."""
    await _check_chatterbox_ready()

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{settings.CHATTERBOX_SERVICE_URL}/analyze-reference",
                json=request.model_dump(),
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        raise _service_error(e)
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail=NOT_RUNNING)
    except Exception:
        logger.exception("Chatterbox reference analysis proxy failed")
        raise HTTPException(status_code=500, detail="Reference analysis failed.")


@router.get("/voices")
async def list_voices() -> dict:
    """The voices cloned so far, newest first."""
    try:
        async with httpx.AsyncClient(timeout=HEALTH_TIMEOUT) as client:
            resp = await client.get(f"{settings.CHATTERBOX_SERVICE_URL}/voices")
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        raise _service_error(e)
    except (httpx.ConnectError, httpx.TimeoutException):
        raise HTTPException(status_code=503, detail=NOT_RUNNING)


@router.get("/voices/{name}/audio")
async def voice_audio(name: str) -> Response:
    """The reference recording a voice was cloned from."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{settings.CHATTERBOX_SERVICE_URL}/voices/{quote(name)}/audio")
            resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise _service_error(e)
    except (httpx.ConnectError, httpx.TimeoutException):
        raise HTTPException(status_code=503, detail=NOT_RUNNING)
    return Response(content=resp.content, media_type="audio/wav")


@router.delete("/voices/{name}")
async def delete_voice(name: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=HEALTH_TIMEOUT) as client:
            resp = await client.delete(f"{settings.CHATTERBOX_SERVICE_URL}/voices/{quote(name)}")
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        raise _service_error(e)
    except (httpx.ConnectError, httpx.TimeoutException):
        raise HTTPException(status_code=503, detail=NOT_RUNNING)


@router.post("/voices/{name}/improve")
async def improve_voice(name: str, body: dict) -> Response:
    """Apply the suggested fixes to a saved voice: a WAV to preview, or saved (JSON)."""
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{settings.CHATTERBOX_SERVICE_URL}/voices/{quote(name)}/improve", json=body
            )
            resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise _service_error(e)
    except (httpx.ConnectError, httpx.TimeoutException):
        raise HTTPException(status_code=503, detail=NOT_RUNNING)
    headers = {k: resp.headers[k] for k in ("X-Audio-Duration",) if k in resp.headers}
    return Response(
        content=resp.content,
        media_type=resp.headers.get("content-type", "application/json"),
        headers=headers,
    )


@router.post("/voices/{name}/restore")
async def restore_voice(name: str) -> dict:
    """Put back the recording as it was before it was improved."""
    try:
        async with httpx.AsyncClient(timeout=HEALTH_TIMEOUT) as client:
            resp = await client.post(f"{settings.CHATTERBOX_SERVICE_URL}/voices/{quote(name)}/restore")
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        raise _service_error(e)
    except (httpx.ConnectError, httpx.TimeoutException):
        raise HTTPException(status_code=503, detail=NOT_RUNNING)
