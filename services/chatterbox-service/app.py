"""Chatterbox voice cloning microservice.

Standalone FastAPI service around Resemble AI's Chatterbox Multilingual (23
languages, Portuguese included). It clones a voice from a short reference
recording, analyzes that recording before use, and after each take reports how
close the voice came to the reference and how fast it speaks.
Runs on port 8428, apart from tts-service: it needs a newer torch (2.8, CUDA
12.8 for Blackwell GPUs) than coqui-tts allows.
"""

import asyncio
import copy
import gc
import importlib.util
import logging
import os
import random
import threading
import uuid
from pathlib import Path

import io
import shutil

import librosa
import numpy as np
import soundfile
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field

from analysis import (
    ANALYSIS_RATE,
    REFERENCE_SECONDS,
    FIX_ORDER,
    analyze_reference,
    apply_fixes,
    split_text,
    words_per_minute,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration via environment variables
# ---------------------------------------------------------------------------
GENERATED_DIR = Path(os.getenv("GENERATED_DIR", "generated"))
VOICES_DIR = GENERATED_DIR / "voices"
# The recording as it was before "Melhorar gravação", so it can be put back
ORIGINALS_DIR = VOICES_DIR / "originals"
DEVICE = os.getenv("DEVICE", "auto")
AUTOLOAD = os.getenv("CHATTERBOX_AUTOLOAD", "false").lower() in ("true", "1", "yes")
MODEL_NAME = "chatterbox-multilingual"

VOICES_DIR.mkdir(parents=True, exist_ok=True)
ORIGINALS_DIR.mkdir(parents=True, exist_ok=True)

# The model is public. An empty HF_TOKEN would make huggingface_hub send an
# invalid "Bearer " header and fail the download, so it is dropped.
if not os.environ.get("HF_TOKEN"):
    os.environ.pop("HF_TOKEN", None)

# Languages of the multilingual model (chatterbox.mtl_tts.SUPPORTED_LANGUAGES),
# listed here so /health answers without importing torch.
SUPPORTED_LANGUAGES = [
    "ar", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi", "it", "ja",
    "ko", "ms", "nl", "no", "pl", "pt", "ru", "sv", "sw", "tr", "zh",
]
UPLOAD_EXTENSIONS = {".wav", ".mp3", ".flac", ".ogg", ".opus", ".m4a"}
# Silence put between the pieces of a long text.
PIECE_GAP_SECONDS = 0.2

# Metrics of a take travel as headers next to the WAV.
METRIC_HEADERS = ["X-Voice-Similarity", "X-Words-Per-Minute", "X-Seed", "X-Audio-Duration"]


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000, description="Text to speak")
    language: str = Field(default="pt", description="Language code")
    speaker_wav: str | None = Field(
        default=None, description="Path returned by /clone-voice; none uses the built-in voice"
    )
    exaggeration: float = Field(default=0.5, ge=0.25, le=2.0, description="Emotion intensity")
    cfg_weight: float = Field(default=0.5, ge=0.0, le=1.0, description="Pacing / adherence to text")
    temperature: float = Field(default=0.8, ge=0.05, le=2.0, description="Variation between takes")
    seed: int = Field(default=0, ge=0, le=2**31 - 1, description="0 picks a random seed")


class AnalyzeRequest(BaseModel):
    speaker_wav: str


class ImproveRequest(BaseModel):
    fixes: list[str] = Field(min_length=1)
    # False: hand back the result to listen to; True: replace the saved voice
    save: bool = False


# ---------------------------------------------------------------------------
# Model singleton
# ---------------------------------------------------------------------------

class ChatterboxService:
    """Loads Chatterbox once and runs one generation at a time on it."""

    def __init__(self) -> None:
        self._model = None
        self._device = ""
        # The model's own voice, kept apart: a take with a reference replaces
        # the model's conditionals, and a take without one must not inherit them.
        self._builtin_conds = None
        # One GPU model, one take at a time: seeds and conditionals are global state.
        self._lock = threading.Lock()

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def is_installed(self) -> bool:
        return importlib.util.find_spec("chatterbox") is not None

    @property
    def device(self) -> str | None:
        return self._device or None

    def _pick_device(self) -> str:
        import torch

        if DEVICE in ("cuda", "cpu"):
            return DEVICE
        return "cuda" if torch.cuda.is_available() else "cpu"

    def load(self) -> dict:
        with self._lock:
            return self._load_locked()

    def _load_locked(self) -> dict:
        if self._model is not None:
            return {"status": "already_loaded", "model": MODEL_NAME, "device": self._device}
        if not self.is_installed:
            return {"status": "not_installed", "error": "chatterbox-tts is not installed."}
        try:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS

            device = self._pick_device()
            logger.info("Loading Chatterbox Multilingual on %s (first run downloads ~3 GB)...", device)
            self._model = ChatterboxMultilingualTTS.from_pretrained(device=device)
            self._builtin_conds = copy.deepcopy(self._model.conds)
            self._device = device
            logger.info("Chatterbox loaded on %s.", device)
            return {"status": "loaded", "model": MODEL_NAME, "device": device}
        except Exception as e:
            logger.exception("Failed to load Chatterbox")
            return {"status": "error", "error": str(e)}

    def unload(self) -> None:
        with self._lock:
            if self._model is None:
                return
            self._model = None
            self._builtin_conds = None
            self._device = ""
            gc.collect()
            try:
                import torch

                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass
            logger.info("Chatterbox unloaded.")

    def _speaker_embedding(self, wav: np.ndarray, sample_rate: int) -> np.ndarray:
        # The voice encoder listens at 16 kHz. Resampling here skips its own
        # resampler, which would need the resampy package.
        rate = self._model.ve.hp.sample_rate
        if sample_rate != rate:
            wav = librosa.resample(wav, orig_sr=sample_rate, target_sr=rate)
        return self._model.ve.embeds_from_wavs([wav], sample_rate=rate, as_spk=True)

    def generate(self, request: GenerateRequest, reference: Path | None, output: Path) -> dict:
        """One take: writes the WAV and returns its metrics."""
        import torch

        with self._lock:
            result = self._load_locked()
            if result["status"] not in ("loaded", "already_loaded"):
                raise NotImplementedError(result.get("error", "Chatterbox is not available"))
            tts = self._model

            seed = request.seed or random.randint(1, 2**31 - 1)
            torch.manual_seed(seed)
            if reference is None:
                if self._builtin_conds is None:
                    raise ValueError("Upload a voice reference first.")
                tts.conds = copy.deepcopy(self._builtin_conds)
            gap = np.zeros(int(PIECE_GAP_SECONDS * tts.sr), dtype=np.float32)
            pieces: list[np.ndarray] = []
            try:
                for i, piece in enumerate(split_text(request.text)):
                    wav = tts.generate(
                        piece,
                        language_id=request.language,
                        # The reference only needs to be read once per take.
                        audio_prompt_path=str(reference) if reference and i == 0 else None,
                        exaggeration=request.exaggeration,
                        cfg_weight=request.cfg_weight,
                        temperature=request.temperature,
                    )
                    if pieces:
                        pieces.append(gap)
                    pieces.append(wav.squeeze(0).numpy().astype(np.float32))
            except torch.cuda.OutOfMemoryError as exc:
                torch.cuda.empty_cache()
                raise MemoryError("Out of GPU memory during Chatterbox generation.") from exc
            finally:
                gc.collect()

            audio = np.concatenate(pieces)
            soundfile.write(str(output), audio, tts.sr)

            similarity = None
            if reference:
                ref_wav, ref_rate = librosa.load(str(reference), sr=16000)
                ref_embedding = self._speaker_embedding(ref_wav[: REFERENCE_SECONDS * ref_rate], ref_rate)
                similarity = float(self._speaker_embedding(audio, tts.sr) @ ref_embedding)

        return {
            "similarity": similarity,
            "words_per_minute": words_per_minute(request.text, audio, tts.sr),
            "seed": seed,
            "duration": len(audio) / tts.sr,
        }


chatterbox = ChatterboxService()


def voice_path(value: str) -> Path:
    """A reference saved by /clone-voice; anything outside the voices folder is refused."""
    path = Path(value).resolve()
    if not path.is_relative_to(VOICES_DIR.resolve()) or not path.is_file():
        raise HTTPException(status_code=404, detail="Voice reference not found. Upload it again.")
    return path


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="Passarola Chatterbox Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3100",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=METRIC_HEADERS,
)


@app.on_event("startup")
async def _startup_load_model():
    if AUTOLOAD and chatterbox.is_installed:
        loop = asyncio.get_running_loop()
        loop.run_in_executor(None, chatterbox.load)


@app.get("/health")
async def health():
    """Return service health and model status. The model loads on first use."""
    installed = chatterbox.is_installed
    return {
        "status": "ok",
        "service": "chatterbox",
        "model": {
            "loaded": chatterbox.is_loaded,
            "model_name": MODEL_NAME,
            "installed": installed,
            "device": chatterbox.device,
        },
        "install_command": "docker compose build chatterbox-service" if not installed else None,
        "supported_languages": SUPPORTED_LANGUAGES,
        "reference_seconds": REFERENCE_SECONDS,
    }


@app.post("/generate")
async def generate(request: GenerateRequest):
    """Speak the text in the cloned voice. Returns a WAV; metrics are in the X- headers."""
    if request.language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported language '{request.language}'.")
    reference = voice_path(request.speaker_wav) if request.speaker_wav else None
    output = GENERATED_DIR / f"chatterbox_{uuid.uuid4().hex[:8]}.wav"

    try:
        loop = asyncio.get_running_loop()
        metrics = await loop.run_in_executor(None, chatterbox.generate, request, reference, output)
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except MemoryError as e:
        logger.error("OOM during Chatterbox generation: %s", e)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception:
        logger.exception("Chatterbox generation failed")
        raise HTTPException(status_code=500, detail="Chatterbox generation failed.")

    headers = {
        "X-Words-Per-Minute": f"{metrics['words_per_minute']:.0f}",
        "X-Seed": str(metrics["seed"]),
        "X-Audio-Duration": f"{metrics['duration']:.2f}",
    }
    if metrics["similarity"] is not None:
        headers["X-Voice-Similarity"] = f"{metrics['similarity']:.3f}"
    return FileResponse(
        path=output,
        media_type="audio/wav",
        filename="chatterbox.wav",
        headers=headers,
        background=BackgroundTask(output.unlink, missing_ok=True),
    )


@app.post("/clone-voice")
async def clone_voice(name: str = Form(...), file: UploadFile = File(...)):
    """Save a reference recording. It is stored as mono WAV, whatever came in."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")
    ext = Path(file.filename).suffix.lower()
    if ext not in UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=400, detail="Unsupported audio format. Use WAV, MP3, FLAC, OGG, OPUS or M4A."
        )

    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)[:80] or "voice"
    upload = VOICES_DIR / f"_upload_{uuid.uuid4().hex[:8]}{ext}"
    voice = VOICES_DIR / f"{safe_name}.wav"
    try:
        upload.write_bytes(await file.read())
        wav, rate = librosa.load(str(upload), sr=None, mono=True)
        if not len(wav):
            raise ValueError("empty audio")
        soundfile.write(str(voice), wav, rate)
    except Exception:
        logger.exception("Could not read the uploaded voice")
        raise HTTPException(status_code=400, detail="Could not read this audio file.")
    finally:
        upload.unlink(missing_ok=True)

    return {
        "status": "success",
        "name": name,
        "path": str(voice),
        "message": "Voice reference saved. Use the path with /generate.",
    }


@app.post("/analyze-reference")
async def analyze(request: AnalyzeRequest):
    """How good a saved reference is for cloning, check by check, with advice."""
    path = voice_path(request.speaker_wav)
    loop = asyncio.get_running_loop()
    wav, rate = await loop.run_in_executor(None, lambda: librosa.load(str(path), sr=ANALYSIS_RATE))
    return analyze_reference(wav, rate)


@app.get("/voices")
async def list_voices():
    """The saved references, newest first, so a voice cloned once can be picked again."""
    voices = []
    for path in VOICES_DIR.glob("*.wav"):
        if path.name.startswith("_upload_"):
            continue
        try:
            duration = soundfile.info(str(path)).duration
        except Exception:
            logger.warning("Unreadable voice reference: %s", path.name)
            continue
        stat = path.stat()
        voices.append(
            {
                "name": path.stem,
                "path": str(path),
                "duration": round(duration, 2),
                "created_at": stat.st_mtime,
                "improved": (ORIGINALS_DIR / path.name).is_file(),
            }
        )
    voices.sort(key=lambda voice: voice["created_at"], reverse=True)
    return {"voices": voices}


def saved_voice(name: str) -> Path:
    return voice_path(str(VOICES_DIR / f"{name}.wav"))


@app.get("/voices/{name}/audio")
async def voice_audio(name: str):
    """The reference recording itself, to listen to what a voice was cloned from."""
    return FileResponse(path=saved_voice(name), media_type="audio/wav")


@app.delete("/voices/{name}")
async def delete_voice(name: str):
    path = saved_voice(name)
    path.unlink()
    (ORIGINALS_DIR / path.name).unlink(missing_ok=True)
    return {"status": "deleted", "name": name}


@app.post("/voices/{name}/improve")
async def improve_voice(name: str, request: ImproveRequest):
    """Apply the fixes the analysis suggested: as a preview, or saved over the voice.

    Saving keeps the first original aside, so "Desfazer" can always go back to
    what was recorded.
    """
    unknown = set(request.fixes) - set(FIX_ORDER)
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown fixes: {', '.join(sorted(unknown))}.")
    path = saved_voice(name)
    loop = asyncio.get_running_loop()
    wav, rate = await loop.run_in_executor(None, lambda: librosa.load(str(path), sr=None, mono=True))
    fixed = await loop.run_in_executor(None, apply_fixes, wav, rate, request.fixes)

    if not request.save:
        buffer = io.BytesIO()
        soundfile.write(buffer, fixed, rate, format="WAV")
        return Response(
            content=buffer.getvalue(),
            media_type="audio/wav",
            headers={"X-Audio-Duration": f"{len(fixed) / rate:.2f}"},
        )

    original = ORIGINALS_DIR / path.name
    if not original.is_file():
        shutil.copy2(path, original)
    soundfile.write(str(path), fixed, rate)
    analysis = await loop.run_in_executor(
        None, lambda: analyze_reference(librosa.resample(fixed, orig_sr=rate, target_sr=ANALYSIS_RATE), ANALYSIS_RATE)
    )
    return {"status": "improved", "name": name, "analysis": analysis}


@app.post("/voices/{name}/restore")
async def restore_voice(name: str):
    """Put back the recording as it was before it was improved."""
    path = saved_voice(name)
    original = ORIGINALS_DIR / path.name
    if not original.is_file():
        raise HTTPException(status_code=404, detail="There is no original to restore.")
    shutil.move(str(original), str(path))
    return {"status": "restored", "name": name}


@app.post("/load")
async def load_model():
    """Load Chatterbox now instead of on the first generation."""
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, chatterbox.load)
    if result["status"] == "not_installed":
        raise HTTPException(status_code=501, detail=result["error"])
    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@app.post("/unload")
async def unload_model():
    """Unload Chatterbox and free GPU memory."""
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, chatterbox.unload)
    return {"status": "success", "message": "Chatterbox unloaded."}
