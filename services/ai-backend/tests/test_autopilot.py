import json

import httpx
import pytest

from app.config import settings
from app.routes import autopilot

RealAsyncClient = httpx.AsyncClient


def _mock_http(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    def factory(**kwargs):
        kwargs.pop("transport", None)
        return RealAsyncClient(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(autopilot.httpx, "AsyncClient", factory)


def _commons_page(title: str, width: int = 1920, pageid: int = 1) -> dict:
    return {
        "pageid": pageid,
        "title": title,
        "imageinfo": [
            {
                "thumburl": f"https://upload.wikimedia.org/{pageid}.jpg",
                "thumbwidth": width,
                "thumbheight": 1080,
                "descriptionurl": f"https://commons.wikimedia.org/wiki/{title}",
                "extmetadata": {
                    "Artist": {"value": "<a href=\"x\">Jane</a>"},
                    "LicenseShortName": {"value": "CC0"},
                },
            }
        ],
    }


@pytest.mark.parametrize(
    ("title", "is_non_photo"),
    [
        ("File:Food web diagram.jpg", True),
        ("File:Map of the ocean.jpg", True),
        ("File:Fig 3 vent.jpg", True),
        ("File:Deep sea photograph.jpg", False),  # "graph" inside "photograph" must not match
        ("File:Tube worms.jpg", False),
    ],
)
def test_non_photo_filter(title: str, is_non_photo: bool) -> None:
    assert bool(autopilot.NON_PHOTO.search(title)) is is_non_photo


def test_scene_count_is_bounded() -> None:
    assert autopilot._scene_count(15) == 3
    assert autopilot._scene_count(45) == 6
    assert autopilot._scene_count(180) == 12


def test_pick_file_prefers_largest_mp4_up_to_1920() -> None:
    video = {
        "video_files": [
            {"file_type": "video/webm", "link": "w", "width": 1920, "height": 1080},
            {"file_type": "video/mp4", "link": "sd", "width": 640, "height": 360},
            {"file_type": "video/mp4", "link": "hd", "width": 1920, "height": 1080},
            {"file_type": "video/mp4", "link": "uhd", "width": 3840, "height": 2160},
        ]
    }
    assert autopilot._pick_file(video)["link"] == "hd"
    assert autopilot._pick_file({"video_files": []}) is None


def test_stock_uses_commons_without_a_pexels_key(client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "PEXELS_API_KEY", "")
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["query"] = request.url.params["gsrsearch"]
        seen["agent"] = request.headers["user-agent"]
        pages = [
            _commons_page("File:Unrelated sunset.jpg", pageid=1),
            _commons_page("File:Hydrothermal vent crab.jpg", pageid=2),
            _commons_page("File:Vent chart.jpg", pageid=3),  # non-photo: dropped
            _commons_page("File:Tiny hydrothermal.jpg", width=400, pageid=4),  # too small: dropped
        ]
        return httpx.Response(200, json={"query": {"pages": pages}})

    _mock_http(monkeypatch, handler)
    resp = client.get("/api/autopilot/stock", params={"query": "hydrothermal vent", "limit": 3})
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert [r["id"] for r in results] == [2, 1]  # title match ranks first
    assert all(r["kind"] == "image" and "title" not in r for r in results)
    assert results[0]["credit"] == "Jane (CC0)"
    assert "filemime:image/jpeg" in seen["query"] and "-diagram" in seen["query"]
    assert "github.com" in seen["agent"]  # Wikimedia rejects anonymous agents with 403


def test_stock_uses_pexels_videos_when_a_key_is_set(client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "PEXELS_API_KEY", "test-key")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "test-key"
        video = {
            "id": 7,
            "image": "thumb.jpg",
            "duration": 12,
            "url": "https://pexels.com/v/7",
            "user": {"name": "Ann"},
            "video_files": [
                {"file_type": "video/mp4", "link": "https://videos.pexels.com/7.mp4", "width": 1920, "height": 1080}
            ],
        }
        return httpx.Response(200, json={"videos": [video]})

    _mock_http(monkeypatch, handler)
    first = client.get("/api/autopilot/stock", params={"query": "ocean"}).json()["results"][0]
    assert first["kind"] == "video" and first["url"] == "https://videos.pexels.com/7.mp4"


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/a.jpg",
        "http://upload.wikimedia.org/a.jpg",  # not https
        "https://upload.wikimedia.org.evil.com/a.jpg",  # look-alike host
        "https://127.0.0.1:8420/health",  # SSRF to the backend itself
    ],
)
def test_fetch_rejects_hosts_outside_the_allow_list(client, url: str) -> None:
    assert client.get("/api/autopilot/fetch", params={"url": url}).status_code == 400


def test_fetch_downloads_an_allow_listed_file(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _mock_http(
        monkeypatch,
        lambda request: httpx.Response(200, content=b"jpegbytes", headers={"content-type": "image/jpeg"}),
    )
    resp = client.get("/api/autopilot/fetch", params={"url": "https://upload.wikimedia.org/a.jpg"})
    assert resp.status_code == 200 and resp.content == b"jpegbytes"
    assert resp.headers["content-type"] == "image/jpeg"


def test_plan_normalizes_scenes_and_drops_empty_ones(client, monkeypatch: pytest.MonkeyPatch) -> None:
    async def available() -> bool:
        return True

    async def generate_json(prompt: str, system: str | None = None, **_: object) -> dict:
        return {
            "title": "Oceano",
            "research": ["a", "b"],
            "scenes": [
                {
                    "narration": "uma duas tres quatro cinco seis sete oito nove dez",
                    "on_screen_text": "Oi",
                    "search_query": "",
                },
                {"narration": "   "},
            ],
        }

    monkeypatch.setattr(autopilot.llm_backend, "check_available", available)
    monkeypatch.setattr(autopilot.llm_backend, "generate_json", generate_json)
    resp = client.post("/api/autopilot/plan", json={"topic": "oceano", "duration": 30, "language": "pt"})
    result_line = next(line for line in resp.text.splitlines() if '"result"' in line)
    plan = json.loads(result_line)["result"]
    assert plan["title"] == "Oceano" and len(plan["scenes"]) == 1
    assert plan["scenes"][0]["search_query"] == "oceano"  # empty query falls back to the topic
    assert plan["scenes"][0]["duration"] == 4.0  # 10 words at 2.5 words per second
