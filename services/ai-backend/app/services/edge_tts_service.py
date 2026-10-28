"""Cloud text-to-speech through Microsoft Edge neural voices (no API key).

Used as a fallback when the local tts-service is not running. The text of the
script is sent to Microsoft's online service, so only public text should use it.
"""

import logging
import re

logger = logging.getLogger(__name__)

DEFAULT_VOICES = {
    "pt": {"male": "pt-BR-AntonioNeural", "female": "pt-BR-FranciscaNeural"},
    "en": {"male": "en-US-GuyNeural", "female": "en-US-JennyNeural"},
    "es": {"male": "es-ES-AlvaroNeural", "female": "es-ES-ElviraNeural"},
    "fr": {"male": "fr-FR-HenriNeural", "female": "fr-FR-DeniseNeural"},
    "de": {"male": "de-DE-ConradNeural", "female": "de-DE-KatjaNeural"},
}

# An Edge voice name such as "pt-BR-FranciscaNeural" or "sr-Latn-RS-NicholasNeural"
EDGE_VOICE = re.compile(r"^[a-z]{2,3}(-[A-Za-z]{2,4})+-\w+Neural$")

PROVIDER_LABEL = "edge-tts (cloud, synthetic voice)"


def pick_voice(language: str, voice: str | None = None) -> str:
    """An Edge voice name is used as is; anything else ("male", "female", a local
    speaker name) picks the default voice of the language, female only when asked."""
    if voice and EDGE_VOICE.match(voice):
        return voice
    gender = "female" if (voice or "").strip().lower() == "female" else "male"
    voices = DEFAULT_VOICES.get(language.split("-")[0].lower(), DEFAULT_VOICES["en"])
    return voices[gender]


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
