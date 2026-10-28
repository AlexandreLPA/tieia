"""Optional shared-secret guard for the whole API.

Off by default (local use). When OPENCUTAI_API_TOKEN is set, every request except
CORS preflights and /health must carry `Authorization: Bearer <token>` or
`X-API-Key: <token>`. That includes the WebSocket handshake of live transcription.

The token is meant for a reverse proxy (Caddy, nginx, ...) that logs the user in and
adds the header itself. Do not put it in NEXT_PUBLIC_* variables: anything in the
browser bundle is visible to every user of the app.
"""

import secrets

from fastapi import FastAPI
from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send
from starlette.websockets import WebSocketClose

from app.config import settings

OPEN_PATHS = frozenset({"/health"})


def _presented_token(headers: Headers) -> str:
    auth = headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return headers.get("x-api-key", "").strip()


def _token_matches(presented: str, expected: str) -> bool:
    # Compared as bytes: a header with non-ASCII characters is a wrong token, not a 500
    return secrets.compare_digest(presented.encode(), expected.encode())


class APITokenGuard:
    """Checks the token on HTTP requests and WebSocket handshakes alike.

    A plain ASGI middleware: `@app.middleware("http")` never sees WebSockets.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        expected = settings.API_TOKEN
        if (
            scope["type"] not in ("http", "websocket")
            or not expected
            or scope.get("method") == "OPTIONS"
            or scope["path"] in OPEN_PATHS
            or _token_matches(_presented_token(Headers(scope=scope)), expected)
        ):
            await self.app(scope, receive, send)
            return
        if scope["type"] == "websocket":
            # Closing before accepting refuses the handshake
            await WebSocketClose(code=1008)(scope, receive, send)
            return
        response = JSONResponse(status_code=401, content={"detail": "Missing or invalid API token."})
        await response(scope, receive, send)


def install_api_token(app: FastAPI) -> None:
    """Register the guard. Call before CORSMiddleware so 401s still carry CORS headers."""
    app.add_middleware(APITokenGuard)
