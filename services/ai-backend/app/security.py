"""Optional shared-secret guard for the whole API.

Off by default (local use). When OPENCUTAI_API_TOKEN is set, every request except
CORS preflights and /health must carry `Authorization: Bearer <token>` or
`X-API-Key: <token>`.

The token is meant for a reverse proxy (Caddy, nginx, ...) that logs the user in and
adds the header itself. Do not put it in NEXT_PUBLIC_* variables: anything in the
browser bundle is visible to every user of the app.
"""

import secrets

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.config import settings

OPEN_PATHS = frozenset({"/health"})


def _presented_token(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.headers.get("x-api-key", "").strip()


def install_api_token(app: FastAPI) -> None:
    """Register the guard. Call before CORSMiddleware so 401s still carry CORS headers."""

    @app.middleware("http")
    async def require_api_token(request: Request, call_next):
        expected = settings.API_TOKEN
        if (
            not expected
            or request.method == "OPTIONS"
            or request.url.path in OPEN_PATHS
            or secrets.compare_digest(_presented_token(request), expected)
        ):
            return await call_next(request)
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid API token."})
