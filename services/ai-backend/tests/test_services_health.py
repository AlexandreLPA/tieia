import asyncio

import pytest

from app import main


@pytest.fixture(autouse=True)
def fresh_cache():
    main._services_health_cache.update({"at": 0.0, "data": None, "task": None})
    yield
    main._services_health_cache.update({"at": 0.0, "data": None, "task": None})


async def test_serves_from_cache_within_the_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = 0

    async def collect() -> dict:
        nonlocal calls
        calls += 1
        return {"backend": {"status": "running"}, "n": calls}

    monkeypatch.setattr(main, "_collect_services_health", collect)
    first = await main.services_health()
    second = await main.services_health()
    assert calls == 1 and first == second


async def test_serves_stale_data_while_refreshing(monkeypatch: pytest.MonkeyPatch) -> None:
    async def collect() -> dict:
        return {"n": 2}

    monkeypatch.setattr(main, "_collect_services_health", collect)
    main._services_health_cache.update({"at": 1.0, "data": {"n": 1}, "task": None})  # expired
    assert await main.services_health() == {"n": 1}  # stale answer, no waiting
    await asyncio.sleep(0.05)  # let the background refresh finish
    assert main._services_health_cache["data"] == {"n": 2}


def test_health_lists_online_services_from_the_cache(client, monkeypatch: pytest.MonkeyPatch) -> None:
    async def collect() -> dict:
        return main._services_health_cache["data"]

    monkeypatch.setattr(main, "_collect_services_health", collect)
    main._services_health_cache.update(
        {
            "at": 10**12,
            "data": {
                "backend": {"status": "running"},
                "whisper": {"status": "running"},
                "tts": {"status": "stopped"},
                "ollama": {"status": "running", "models": [{"name": "llama3"}]},
            },
            "task": None,
        }
    )
    body = client.get("/health").json()
    assert sorted(body["services"]) == ["ollama", "whisper"]
    assert body["models"] == ["llama3"]
