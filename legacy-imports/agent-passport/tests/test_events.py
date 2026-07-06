"""Tests for the 1Password Events audit feed — mock-default + honesty labeling.

Zero-dependency runner (also pytest-collectible): `python3 tests/test_events.py`.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from passport_core import onepassword_events as ev  # noqa: E402

CASES = []


def case(fn):
    CASES.append(fn)
    return fn


@case
def test_mock_default_returns_events_offline():
    os.environ.pop("OP_EVENTS_TOKEN", None)
    out = ev.recent_events()
    assert isinstance(out, list) and len(out) >= 1, "should return a non-empty feed offline"


@case
def test_mock_default_all_simulated_and_labeled():
    os.environ.pop("OP_EVENTS_TOKEN", None)
    out = ev.recent_events()
    assert all(e.get("simulated") is True for e in out), "offline feed must be fully labeled simulated"
    assert ev.events_mode() == "simulated"


@case
def test_itemusages_always_simulated():
    # Service accounts don't emit itemusages — they must never be presented as real.
    os.environ.pop("OP_EVENTS_TOKEN", None)
    out = ev.recent_events()
    item = [e for e in out if e["kind"] == "itemusages"]
    assert item, "expected at least one itemusages entry in the demo feed"
    assert all(e["simulated"] is True for e in item), "itemusages must be labeled simulated"


@case
def test_event_shape():
    for e in ev.recent_events():
        for k in ("kind", "actor", "detail", "time", "simulated"):
            assert k in e, f"event missing {k}"


@case
def test_limit_respected():
    assert len(ev.recent_events(limit=2)) <= 2


def main():
    passed = 0
    for fn in CASES:
        fn()
        passed += 1
    print(f"{passed}/{len(CASES)} passed")


if __name__ == "__main__":
    main()
