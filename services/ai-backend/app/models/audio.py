"""Audio / TTS request models."""

from pydantic import BaseModel, ConfigDict, Field


class TTSRequest(BaseModel):
    """Text-to-speech generation request (proxied to tts-service)."""

    model_config = ConfigDict(populate_by_name=True)

    text: str
    language: str = "en"
    speaker_wav: str | None = Field(default=None, alias="speakerWav")
    speaker: str | None = None
    speed: float = 1.0


class ChatterboxRequest(BaseModel):
    """Chatterbox voice-cloning request (proxied to chatterbox-service)."""

    model_config = ConfigDict(populate_by_name=True)

    text: str
    language: str = "pt"
    speaker_wav: str | None = Field(default=None, alias="speakerWav")
    exaggeration: float = 0.5
    cfg_weight: float = Field(default=0.5, alias="cfgWeight")
    temperature: float = 0.8
    seed: int = 0


class ChatterboxAnalyzeRequest(BaseModel):
    """A reference saved by the Chatterbox /clone-voice, to analyze."""

    model_config = ConfigDict(populate_by_name=True)

    speaker_wav: str = Field(alias="speakerWav")
