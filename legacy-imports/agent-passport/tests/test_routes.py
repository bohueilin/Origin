"""Route-level smoke tests for the dashboard engine — the SSE scenario runner, the
live /attack flows, and the /audit feed all behave + never leak a raw secret.
Drives the run_* functions directly (no socket). Zero-dependency runner.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import dashboard.server as srv  # noqa: E402
from passport_core import onepassword_events as opev  # noqa: E402

srv.PACE = 0  # no pacing in tests

# every mock secret value that must NEVER appear in an emitted payload
RAW = ["ff_DEMO_2231", "hh_DEMO_7782", "trn_DEMO_6610", "esim_DEMO_5521", "act_DEMO_3140",
       "P_DEMO_EG_4421", "tok_4242_DEMO", "DL_DEMO_9087", "amex_tok_DEMO", "wire_DEMO_8842",
       "erp_DEMO_5501", "crm_DEMO_8810"]

CASES = []


def case(fn):
    CASES.append(fn)
    return fn


def collect_scenario(*a):
    ev = []
    srv.run_scenario(lambda e: ev.append(e), *a)
    return ev


def collect_attack(kind):
    ev = []
    srv.run_attack(lambda e: ev.append(e), kind)
    return ev


def _no_leak(ev):
    blob = json.dumps(ev)
    return [r for r in RAW if r in blob]


@case
def test_all_scenarios_run_kill_seal_and_no_leak():
    for s in ("travel", "procurement"):
        for t in ("single", "multi"):
            for l in ("domestic", "international"):
                ev = collect_scenario(s, t, l)
                kinds = [e.get("t") for e in ev]
                assert "kill" in kinds, f"{s}/{t}/{l}: expected a kill"
                done = [e for e in ev if e.get("t") == "done"]
                assert done and done[0]["intact"] is True, f"{s}/{t}/{l}: ledger must seal intact"
                assert not _no_leak(ev), f"{s}/{t}/{l}: secret leaked: {_no_leak(ev)}"


@case
def test_multi_contains_to_branch():
    ev = collect_scenario("travel", "multi", "international")
    done = [e for e in ev if e.get("t") == "done"][0]
    assert len(done["live"]) >= 5, "multi-agent must keep most agents alive (branch-only kill)"


@case
def test_attack_steal():
    ev = collect_attack("steal")
    outs = [(b["phase"], b["outcome"]) for b in ev if b.get("t") == "attbeat"]
    assert outs == [("baseline", "ALLOW"), ("attack", "DENY"), ("attack2", "DENY")], outs
    assert not _no_leak(ev)


@case
def test_attack_replay():
    ev = collect_attack("replay")
    outs = [(b["phase"], b["outcome"]) for b in ev if b.get("t") == "attbeat"]
    assert outs == [("baseline", "ALLOW"), ("ok", "ALLOW"), ("attack", "DENY")], outs


@case
def test_attack_revoke_second_party_rejects():
    ev = collect_attack("revoke")
    outs = [(b["phase"], b["outcome"]) for b in ev if b.get("t") == "attbeat"]
    assert outs == [("baseline", "ALLOW"), ("ok", "ALLOW"), ("kill", "KILL"), ("attack", "DENY")], outs
    done = [e for e in ev if e.get("t") == "attdone"][0]
    assert done["intact"] is True


@case
def test_audit_feed_labeled():
    os.environ.pop("OP_EVENTS_TOKEN", None)
    out = opev.recent_events()
    assert out and all(e["simulated"] is True for e in out)
    assert opev.events_mode() == "simulated"


def main():
    passed = 0
    for fn in CASES:
        fn()
        passed += 1
    print(f"{passed}/{len(CASES)} passed")


if __name__ == "__main__":
    main()
