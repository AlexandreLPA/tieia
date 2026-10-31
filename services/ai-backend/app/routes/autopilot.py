"""Autopilot routes: topic -> researched script -> stock footage per scene."""

import logging
import re
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.config import settings
from app.services.model_backend import llm_backend
from app.services.stream_utils import streamed_llm_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/autopilot", tags=["autopilot"])

PEXELS_VIDEO_SEARCH = "https://api.pexels.com/videos/search"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
COMMONS_USER_AGENT = "Passarola/0.4 (https://github.com/AlexandreLPA/OpenCut-AI; local video editor)"
ALLOWED_DOWNLOAD_HOSTS = (
    "videos.pexels.com",
    "images.pexels.com",
    "upload.wikimedia.org",
    "thumb.wikimedia.org",
)
MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024

LANGUAGE_NAMES = {
    "pt": "Brazilian Portuguese",
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
}

AUTOPILOT_SYSTEM_PROMPT = """\
You are a video producer. Given a topic, first write short research notes from your own \
knowledge (only facts you are confident about; no invented statistics or sources), then \
write a tight spoken script split into scenes.

Respond with ONLY a JSON object:
{
  "title": "short video title",
  "research": ["fact 1", "fact 2"],
  "scenes": [
    {
      "narration": "what the narrator says in this scene",
      "on_screen_text": "max 6 words shown on screen",
      "search_query": "2-4 ENGLISH keywords naming one real, photographable subject (an animal, place, object or person), e.g. bioluminescent jellyfish. Never charts, diagrams, maps or abstract ideas"
    }
  ]
}
The first scene is a hook. The last scene is a call to action. Narration and on_screen_text \
use the requested language; search_query is always English.
"""


class AutopilotPlanRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=500)
    duration: int = Field(default=45, ge=15, le=180, description="Target seconds")
    language: str = Field(default="pt", max_length=10)


def _scene_count(duration: int) -> int:
    return max(3, min(12, round(duration / 7)))


@router.post("/plan")
async def plan(request: AutopilotPlanRequest):
    """Research notes + scene-by-scene script for a topic (LLM knowledge only)."""
    if not await llm_backend.check_available():
        raise HTTPException(status_code=503, detail="No LLM backend available.")

    language = LANGUAGE_NAMES.get(request.language, "English")
    scenes = _scene_count(request.duration)
    prompt = (
        f"Topic: {request.topic}\n"
        f"Language: {language}\n"
        f"Target length: {request.duration} seconds "
        f"(about {scenes} scenes, ~2.5 spoken words per second)."
    )

    async def _work():
        data = await llm_backend.generate_json(prompt=prompt, system=AUTOPILOT_SYSTEM_PROMPT)
        out = []
        for scene in data.get("scenes") or []:
            narration = str(scene.get("narration", "")).strip()
            if not narration:
                continue
            words = len(narration.split())
            out.append(
                {
                    "narration": narration,
                    "on_screen_text": str(scene.get("on_screen_text", "")).strip(),
                    "search_query": str(scene.get("search_query", "")).strip() or request.topic,
                    "duration": round(max(3.0, words / 2.5), 1),
                }
            )
        if not out:
            raise ValueError("The model returned no usable scenes.")
        return {
            "title": str(data.get("title", request.topic)),
            "research": [str(r) for r in (data.get("research") or [])][:8],
            "scenes": out,
        }

    return streamed_llm_response(_work, error_detail="Autopilot planning failed.")


def _long_edge(rendition: dict) -> int:
    return max(rendition.get("width") or 0, rendition.get("height") or 0)


def _pick_file(video: dict) -> dict | None:
    """Best mp4 rendition up to 1920 on the long edge (falls back to the smallest above)."""
    files = [
        f for f in video.get("video_files", [])
        if f.get("file_type") == "video/mp4" and f.get("link")
    ]
    if not files:
        return None
    within = [f for f in files if _long_edge(f) <= 1920]
    if within:
        return max(within, key=_long_edge)
    return min(files, key=_long_edge)


@router.get("/stock")
async def stock(
    query: str = Query(..., min_length=1, max_length=120),
    orientation: str = Query("landscape", pattern="^(landscape|portrait|square)$"),
    limit: int = Query(3, ge=1, le=10),
):
    """Stock footage for a scene: Pexels videos when a key is set, else Wikimedia Commons images."""
    if not settings.PEXELS_API_KEY:
        return await _commons_images(query, limit)
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                PEXELS_VIDEO_SEARCH,
                params={"query": query, "orientation": orientation, "per_page": limit},
                headers={"Authorization": settings.PEXELS_API_KEY},
            )
    except httpx.HTTPError as exc:
        logger.warning("Pexels request failed: %s", exc)
        raise HTTPException(status_code=502, detail="Could not reach Pexels.") from exc
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Pexels error {resp.status_code}.")

    results = []
    for video in resp.json().get("videos", []):
        chosen = _pick_file(video)
        if not chosen:
            continue
        results.append(
            {
                "id": video["id"],
                "kind": "video",
                "url": chosen["link"],
                "thumbnail": video.get("image"),
                "duration": video.get("duration", 0),
                "width": chosen.get("width"),
                "height": chosen.get("height"),
                "credit": (video.get("user") or {}).get("name", ""),
                "page": video.get("url", ""),
            }
        )
    return {"query": query, "results": results}


NON_PHOTO = re.compile(
    r"\b(diagram|chart|graph|map|schematic|figure|fig|plot|illustration|logo|icon|poster|slide|infographic|screenshot|scheme)s?\b",
    re.I,
)


def _strip_tags(value: str) -> str:
    return re.sub(r"<[^>]+>", "", value or "").strip()


async def _commons_images(query: str, limit: int) -> dict:
    """Key-free fallback: freely licensed photos from Wikimedia Commons."""
    params = {
        "action": "query",
        "generator": "search",
        "gsrnamespace": 6,
        "gsrsearch": f"{query} filemime:image/jpeg -diagram -chart -graph -map -schematic -infographic",
        "gsrlimit": 30,
        "prop": "imageinfo",
        "iiprop": "url|size|extmetadata",
        "iiurlwidth": 1920,
        "format": "json",
        "formatversion": 2,
    }
    try:
        async with httpx.AsyncClient(timeout=20, headers={"User-Agent": COMMONS_USER_AGENT}) as client:
            resp = await client.get(COMMONS_API, params=params)
    except httpx.HTTPError as exc:
        logger.warning("Commons request failed: %s", exc)
        raise HTTPException(status_code=502, detail="Could not reach Wikimedia Commons.") from exc
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Commons error {resp.status_code}.")

    results = []
    for page in resp.json().get("query", {}).get("pages", []):
        info = (page.get("imageinfo") or [{}])[0]
        url = info.get("thumburl") or info.get("url")
        width, height = info.get("thumbwidth") or info.get("width"), info.get("thumbheight") or info.get("height")
        if not url or not width or (width or 0) < 800:
            continue
        if NON_PHOTO.search(page.get("title", "")):
            continue
        meta = info.get("extmetadata") or {}
        artist = _strip_tags((meta.get("Artist") or {}).get("value", ""))
        licence = (meta.get("LicenseShortName") or {}).get("value", "")
        results.append(
            {
                "id": page.get("pageid", 0),
                "title": page.get("title", ""),
                "kind": "image",
                "url": url,
                "thumbnail": url,
                "duration": 0,
                "width": width,
                "height": height,
                "credit": f"{artist or 'Wikimedia Commons'} ({licence})".strip(),
                "page": info.get("descriptionurl", ""),
            }
        )
    words = {w for w in re.findall(r"[a-z]{3,}", query.lower())}

    def relevance(item: dict) -> int:
        title = item["title"].lower()
        return sum(1 for w in words if w in title)

    results.sort(key=relevance, reverse=True)
    for item in results:
        item.pop("title", None)
    return {"query": query, "results": results[:limit]}


@router.get("/fetch")
async def fetch_media(url: str = Query(..., max_length=2000)):
    """Download an allow-listed stock media file so the browser avoids CORS."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_DOWNLOAD_HOSTS:
        raise HTTPException(status_code=400, detail="Host not allowed.")
    try:
        async with httpx.AsyncClient(
            timeout=120, follow_redirects=False, headers={"User-Agent": COMMONS_USER_AGENT}
        ) as client:
            async with client.stream("GET", url) as resp:
                if resp.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"Upstream error {resp.status_code}.")
                chunks: list[bytes] = []
                size = 0
                async for chunk in resp.aiter_bytes():
                    size += len(chunk)
                    if size > MAX_DOWNLOAD_BYTES:
                        raise HTTPException(status_code=413, detail="File too large.")
                    chunks.append(chunk)
                content_type = resp.headers.get("content-type", "video/mp4")
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Download failed.") from exc
    return Response(content=b"".join(chunks), media_type=content_type)
