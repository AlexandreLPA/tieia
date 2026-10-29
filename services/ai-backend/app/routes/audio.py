"""Audio processing routes -- denoising, extraction."""

import asyncio
import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.config import settings
from app.services.audio_service import denoise

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/audio", tags=["audio"])

ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".wma"}


@router.post("/denoise")
async def denoise_audio(
    file: UploadFile = File(...),
    strength: float = Form(default=0.7),
) -> FileResponse:
    """Denoise an uploaded audio file.

    Applies spectral-gating noise reduction and returns the cleaned audio.

    Args:
        file: Audio file upload (WAV, MP3, FLAC, OGG, M4A, AAC, WMA).
        strength: Denoising strength from 0.0 (none) to 1.0 (maximum).
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format '{ext}'. Allowed: {sorted(ALLOWED_AUDIO_EXTENSIONS)}",
        )

    if not 0.0 <= strength <= 1.0:
        raise HTTPException(
            status_code=400,
            detail="Strength must be between 0.0 and 1.0.",
        )

    upload_id = uuid.uuid4().hex[:8]
    upload_path = os.path.join(settings.UPLOAD_DIR, f"denoise_{upload_id}{ext}")

    try:
        contents = await file.read()
        if len(contents) > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size: {settings.MAX_UPLOAD_SIZE // (1024 * 1024)} MB",
            )

        with open(upload_path, "wb") as f:
            f.write(contents)

        output_path = await denoise(upload_path, strength=strength)

        return FileResponse(
            path=output_path,
            media_type="audio/wav",
            filename=f"denoised_{upload_id}.wav",
        )
    except HTTPException:
        raise
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        logger.exception("Audio denoising failed for '%s'", file.filename)
        raise HTTPException(status_code=500, detail="Audio denoising failed.")
    finally:
        if os.path.exists(upload_path):
            os.remove(upload_path)


# kbit/s an MP3 may be encoded at (the export's quality picks one)
MP3_BITRATES = {128, 192, 256, 320}


@router.post("/convert")
async def convert_audio(
    file: UploadFile = File(...),
    bitrate: int = Form(default=192),
) -> FileResponse:
    """Encode audio as MP3 with the local ffmpeg, for downloads.

    Browsers cannot write MP3 on their own; nothing leaves this machine.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format '{ext}'. Allowed: {sorted(ALLOWED_AUDIO_EXTENSIONS)}",
        )
    if bitrate not in MP3_BITRATES:
        raise HTTPException(status_code=400, detail=f"Bitrate must be one of {sorted(MP3_BITRATES)}.")

    upload_id = uuid.uuid4().hex[:8]
    upload_path = os.path.join(settings.UPLOAD_DIR, f"convert_{upload_id}{ext}")
    output_path = os.path.join(settings.UPLOAD_DIR, f"convert_{upload_id}.mp3")

    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size: {settings.MAX_UPLOAD_SIZE // (1024 * 1024)} MB",
        )
    try:
        with open(upload_path, "wb") as f:
            f.write(contents)
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", upload_path,
            "-vn", "-codec:a", "libmp3lame", "-b:a", f"{bitrate}k", output_path,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            logger.error("MP3 conversion failed: %s", stderr.decode(errors="replace")[:300])
            raise HTTPException(status_code=500, detail="Audio conversion failed.")
        return FileResponse(
            path=output_path,
            media_type="audio/mpeg",
            filename="audio.mp3",
            background=BackgroundTask(_remove_file, output_path),
        )
    finally:
        if os.path.exists(upload_path):
            os.remove(upload_path)


def _remove_file(path: str) -> None:
    if os.path.exists(path):
        os.remove(path)
