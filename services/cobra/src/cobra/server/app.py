"""FastAPI surface: serve the single-file dashboard and stream the bus over a websocket."""

import asyncio
import sys
import traceback
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

from cobra.server.bus import EventBus

# Resolved relative to the package, not the cwd, so the server runs from anywhere.
_ROOT = Path(__file__).resolve().parents[3]
_DASHBOARD = _ROOT / "dashboard" / "index.html"
# Two SEPARATE optional side-channel files (never shared), each 404s until written:
#   tier_a.json         — Track A's reward-points magnitude (the spoken-consequence line)
#   capability_run.json — Tier B's trained two-model chart
_VIZ3D = _ROOT / "viz3d" / "siege.html"  # alternate 3D surface (same /ws stream)
_TIER_A = _ROOT / "tier_a.json"
_CAPABILITY = _ROOT / "capability_run.json"


def _json_file(path: Path) -> Response:
    if path.exists():
        return Response(path.read_text(), media_type="application/json")
    return Response(status_code=404)  # absent → dashboard keeps that piece hidden


def create_app(bus: EventBus, startup: Callable[[], Awaitable[None]] | None = None) -> FastAPI:
    """Build the app. `startup` (e.g. a replay task) is launched on the event loop at boot."""

    async def _guarded_startup() -> None:
        # The startup task (live engine or replay) is fire-and-forget, so an exception
        # would otherwise vanish until GC. Surface it LOUDLY so a stalled producer
        # self-diagnoses in the terminal instead of looking like a silent freeze.
        try:
            await startup()
        except asyncio.CancelledError:
            raise  # normal shutdown
        except Exception:
            print(
                "\n!! event producer crashed — the engine/replay stopped emitting.\n"
                "   The dashboard stays up; fix the cause below and restart.\n",
                file=sys.stderr,
                flush=True,
            )
            traceback.print_exc()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        task = asyncio.create_task(_guarded_startup()) if startup else None
        yield
        if task:
            task.cancel()

    app = FastAPI(lifespan=lifespan)

    @app.get("/")
    async def index() -> HTMLResponse:
        return HTMLResponse(_VIZ3D.read_text())  # 3D siege is the demo surface (same /ws stream)

    @app.get("/3d")
    async def viz3d() -> HTMLResponse:
        return HTMLResponse(_VIZ3D.read_text())  # explicit 3D alias

    @app.get("/2d")
    async def viz2d() -> HTMLResponse:
        return HTMLResponse(_DASHBOARD.read_text())  # 2D fallback (WebGL-glitch insurance)

    @app.get("/tier_a.json")
    async def tier_a() -> Response:
        return _json_file(_TIER_A)  # Track A's reward-points magnitude

    @app.get("/capability.json")
    async def capability() -> Response:
        return _json_file(_CAPABILITY)  # Tier B trained chart

    @app.websocket("/ws")
    async def stream(websocket: WebSocket) -> None:
        await websocket.accept()
        queue = bus.subscribe()
        try:
            while True:
                await websocket.send_json(await queue.get())
        except WebSocketDisconnect:
            pass
        finally:
            bus.unsubscribe(queue)

    return app
