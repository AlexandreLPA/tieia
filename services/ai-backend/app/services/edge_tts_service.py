"""Cloud text-to-speech through Microsoft Edge neural voices (no API key).

Used as a fallback when the local tts-service is not running. The text of the
script is sent to Microsoft's online service, so only public text should use it.
"""

import logging

logger = logging.getLogger(__name__)

DEFAULT_VOICES = {
    "pt": "pt-BR-AntonioNeural",
    "en": "en-US-GuyNeural",
    "es": "es-ES-AlvaroNeural",
    "fr": "fr-FR-HenriNeural",
    "de": "de-DE-ConradNeural",
}

PROVIDER_LABEL = "edge-tts (cloud, synthetic voice)"


def pick_voice(language: str, voice: str | None = None) -> str:
    if voice:
        return voice
    return DEFAULT_VOICES.get(language.split("-")[0].lower(), DEFAULT_VOICES["en"])


async def synthesize(text: str, language: str = "en", voice: str | None = None, speed: float = 1.0) -> bytes:
    """Return MP3 bytes for `text`."""
    try:
        import edge_tts
    except ImportError as exc:
        raise RuntimeError("edge-tts is not installed. Run: uv pip install edge-tts") from exc

    rate = f"{round((speed - 1.0) * 100):+d}%"
    communicate = edge_tts.Communicate(text, pick_voice(language, voice), rate=rate)
    audio = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
    if not audio:
        raise RuntimeError("edge-tts returned no audio")
    return bytes(audio)
