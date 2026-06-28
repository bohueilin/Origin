"""Track C — the dashboard is served and has a render path for every locked event type."""

from pathlib import Path

from starlette.testclient import TestClient

from cobra.server.app import create_app
from cobra.server.bus import EventBus

DASHBOARD = Path(__file__).resolve().parents[1] / "dashboard" / "index.html"
SEAM2_TAGS = {
    "agent_spawn",
    "agent_move",
    "breach_found",
    "patch_applied",
    "patch_rejected",
    "agent_killed",
    "robustness_update",
}


def test_root_serves_the_3d_siege():
    # The demo surface: / now serves the 3D siege, live-wired to /ws.
    with TestClient(create_app(EventBus())) as client:
        resp = client.get("/")
    assert resp.status_code == 200
    assert "WebSocket" in resp.text and "slotForGate" in resp.text


def test_2d_fallback_served():
    # 2D kept at /2d as a WebGL-glitch fallback.
    with TestClient(create_app(EventBus())) as client:
        resp = client.get("/2d")
    assert resp.status_code == 200
    assert "Cobra" in resp.text  # 2D masthead brand


def test_capability_json_404s_until_a_run_is_recorded():
    # No capability_run.json committed → Tier B slot must stay hidden (404 contract).
    with TestClient(create_app(EventBus())) as client:
        resp = client.get("/capability.json")
    assert resp.status_code == 404


def test_dashboard_handles_every_seam2_event_type():
    html = DASHBOARD.read_text()
    for tag in SEAM2_TAGS:
        assert f"{tag}(e)" in html or f"{tag}(" in html, f"no render path for {tag}"


def test_3d_surface_served_and_wired_to_ws():
    # Both surfaces available: 2D at /, 3D at /3d (off the same /ws stream).
    with TestClient(create_app(EventBus())) as client:
        resp = client.get("/3d")
    assert resp.status_code == 200
    assert "WebSocket" in resp.text  # live-wired, not the SAMPLE_EVENTS-only placeholder
    assert "slotForGate" in resp.text  # dynamic gate-id bridge present
