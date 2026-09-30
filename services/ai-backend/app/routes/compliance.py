"""Compliance checks for videos before publishing."""

from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator

from app.services import tiktok_compliance
from app.services.stream_utils import streamed_llm_response

router = APIRouter(prefix="/api/compliance", tags=["compliance"])


class ComplianceFrame(BaseModel):
    time: float = Field(ge=0)
    image: str

    @field_validator("image")
    @classmethod
    def _image_is_data_uri(cls, value: str) -> str:
        return tiktok_compliance.validate_image_data_uri(value)


class ComplianceSegment(BaseModel):
    start: float = 0
    end: float = 0
    text: str = Field(default="", max_length=4000)


class TikTokComplianceRequest(BaseModel):
    frames: list[ComplianceFrame] = Field(min_length=1, max_length=tiktok_compliance.MAX_FRAMES)
    transcript: list[ComplianceSegment] = Field(default_factory=list, max_length=5000)
    ad_info: str = Field(default="", max_length=tiktok_compliance.MAX_AD_INFO_CHARS)


@router.post("/tiktok")
async def check_tiktok(request: TikTokComplianceRequest):
    """Check video frames and transcript against the TikTok Shop rules with the active vision model.

    Streams keepalive pings while the model works. A model without image support
    is a refusal ({"refused": true, "reason": ...}), never a text-only answer.
    """

    async def _work():
        return await tiktok_compliance.check_tiktok_compliance(
            frames=[f.model_dump() for f in request.frames],
            transcript=[s.model_dump() for s in request.transcript],
            ad_info=request.ad_info,
        )

    return streamed_llm_response(_work, error_detail="Falha ao checar a conformidade com o TikTok Shop.")
