"""Dual-plane cascading kill-switch: revoking an agent tears down BOTH the compute
plane (sandbox reaped) and the identity plane (1Password suspend), and cascades to
descendants. Zero-dependency runner; also pytest-collectible.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from passport_core.agents import AgentSystem  # noqa: E402
from passport_core.scope import Scope  # noqa: E402

CASES = []


def case(fn):
    CASES.append(fn)
    return fn


def _system():
    kinds = []
    s = AgentSystem(on_event=lambda e: kinds.append(e.kind))
    return s, kinds


@case
def test_kill_fires_both_planes():
    s, kinds = _system()
    a = s.authorize_root("agent-x", Scope(
        tools=["t"], secrets=["op://v/i"], max_calls=10, max_children=0, max_depth=0, ttl_seconds=300))
    s.vault.put("op://v/i", "sek_DEMO_1234")
    s.lease_secret(a, "op://v/i")
    s.monitor.trip_kill_switch("agent-x", "test")
    assert "LEASE_REVOKED" in kinds, "credential plane: leases must be scrubbed"
    assert "IDENTITY_SUSPENDED" in kinds, "identity plane: 1Password suspend must fire"
    assert "SANDBOX_KILLED" in kinds, "compute plane: sandbox must be reaped"
    s.shutdown()


@case
def test_kill_cascades_to_descendants():
    s, kinds = _system()
    parent = s.authorize_root("parent", Scope(
        tools=["t"], secrets=["op://v/i"], max_calls=20, max_children=3, max_depth=3, ttl_seconds=600))
    child = s.handoff(parent, "child", Scope(
        tools=["t"], secrets=["op://v/i"], max_calls=5, max_children=1, max_depth=2, ttl_seconds=300))
    s.vault.put("op://v/i", "sek_DEMO_5678")
    s.lease_secret(child, "op://v/i")
    s.monitor.trip_kill_switch("parent", "test")
    # both parent and child identities suspended (cascade)
    suspended = [k for k in kinds if k == "IDENTITY_SUSPENDED"]
    assert len(suspended) >= 2, "identity suspend must cascade to the child"
    assert "child" in s.monitor.killed and "parent" in s.monitor.killed
    s.shutdown()


@case
def test_identity_suspend_is_labeled_simulated_in_mock():
    s, _ = _system()
    res = s.vault.suspend_identity("agent-y", "test")
    assert res["plane"] == "identity" and res["mode"] == "simulated", "mock must label identity-plane simulated"
    s.shutdown()


def main():
    passed = 0
    for fn in CASES:
        fn()
        passed += 1
    print(f"{passed}/{len(CASES)} passed")


if __name__ == "__main__":
    main()
