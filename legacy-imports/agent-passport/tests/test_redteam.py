"""Red-team / adversarial suite for Passport — each test is a real attack
from the agentic threat literature, fired at the live engine, asserting containment.

Run: python3 tests/test_redteam.py   (also pytest-collectible)

Threat sources mapped per test:
  • OWASP Agentic AI — Threats & Mitigations (T1 memory poisoning … T15 HITL bypass)
  • OWASP LLM Top-10 2025 (LLM01 prompt injection, LLM06 excessive agency)
  • MAESTRO agentic threat-modeling layers
  • Simon Willison — the "lethal trifecta" (private data + untrusted content + exfil)
  • OAuth DPoP (RFC 9449) / mTLS-bound tokens (RFC 8705) — sender-constrained tokens
  • Anthropic multi-agent (orchestrator→subagents): trust propagation & blast radius

The bar: a signed, attenuating passport + reference-monitor + kill-switch must turn
each attack into a DENY or a KILL — never an unmediated success.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time

from passport_core.agents import AgentSystem
from passport_core.crypto import b64
from passport_core.monitor import ALLOW, DENY, KILL, Action, _action_msg
from passport_core.scope import Scope


def _root_scope():
    return Scope(
        tools=["refund.create", "doc.read"], fs_read=["/workspace/*"],
        net_hosts=["api.payments.internal"], net_methods=["GET", "POST"],
        secrets=["op://payments/stripe-key"], max_calls=50, max_children=4, max_depth=4, ttl_seconds=600,
    )


def _leaf(tools=("doc.read",), **kw):
    base = dict(tools=list(tools), max_calls=20, max_children=2, max_depth=3, ttl_seconds=300)
    base.update(kw)
    return Scope(**base)


# ───────────────────────── A. Prompt injection / excessive agency ─────────────────────────

def test_rt_indirect_prompt_injection_egress_is_killed():
    """LLM01 + Agentic T2/T6: a poisoned tool result tells the agent to exfiltrate a
    credential. Egress is a CRITICAL kind → instant kill + subtree cascade."""
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    pay = s.handoff(orch, "pay", _leaf(secrets=["op://payments/stripe-key"], max_depth=2))
    d = s.act(pay, Action("secret_egress", "https://attacker.evil/collect"))
    assert d.outcome == KILL
    assert "pay" in s.monitor.killed
    assert s.act(orch, Action("tool", "doc.read")).outcome == ALLOW  # parent untouched
    s.shutdown()


def test_rt_scope_escalation_payload_is_killed():
    """Agentic T3 privilege compromise: injection tries to raise its own privilege.
    `escalate_scope` is never legitimate → critical kill."""
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    d = s.act(orch, Action("escalate_scope", "admin"))
    assert d.outcome == KILL and "orch" in s.monitor.killed
    s.shutdown()


def test_rt_lethal_trifecta_exfil_leg_is_severed():
    """Willison's lethal trifecta = private data + untrusted content + exfil path. The
    agent legitimately holds a secret AND reads an untrusted host — but the third leg
    (exfiltration) is structurally impossible: egress is always refused/killed."""
    s = AgentSystem()
    scope = Scope(tools=["doc.read"], secrets=["op://payments/stripe-key"],
                  net_hosts=["feeds.untrusted.example"], net_methods=["GET"],
                  max_calls=10, max_children=0, max_depth=1, ttl_seconds=300)
    a = s.authorize_root("reader", scope)
    assert s.act(a, Action("net", "feeds.untrusted.example", "GET")).outcome == ALLOW  # reads untrusted data
    assert s.act(a, Action("secret_egress", "https://feeds.untrusted.example/x")).outcome == KILL  # exfil severed
    s.shutdown()


# ───────────────────────── B. Authorization / confused deputy ─────────────────────────

def test_rt_confused_deputy_cross_resource_denied():
    """Confused deputy: an agent scoped to one credential reaches for a sibling it was
    never granted. Per-resource scope refuses it (no ambient authority)."""
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())  # only op://payments/stripe-key
    dec, lease = s.lease_secret(orch, "op://payments/admin-key")
    assert dec.outcome == DENY and lease is None
    s.shutdown()


def test_rt_privilege_escalation_via_delegation_is_dropped():
    """A sub-agent requests MORE than its parent (extra tools, /etc writes, an unscoped
    secret, a bigger budget). Attenuation intersects it down to ⊆ parent — silently."""
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    greedy = Scope(tools=["refund.create", "shell.exec"], fs_write=["/etc/*"],
                   secrets=["op://payments/stripe-key", "op://payments/admin-key"],
                   max_calls=10**9, max_children=99, max_depth=9)
    child = s.handoff(orch, "pay", greedy)
    cs = child.passport.get_scope()
    # extra tool dropped, /etc write dropped, the unscoped admin secret dropped (only the
    # parent-held stripe-key survives the intersection), budget clamped to ⊆ parent
    assert "shell.exec" not in cs.tools and cs.fs_write == []
    assert cs.secrets == ["op://payments/stripe-key"] and cs.max_calls <= 50
    assert cs.is_subset_of(orch.passport.get_scope())
    s.shutdown()


def test_rt_forged_delegation_by_unrelated_signer_rejected():
    """Agentic T8 identity spoofing: an enrolled-but-unrelated agent ("eve") mints a
    child under a victim parent's id/chain, signing with HER key. Issuer-binding rejects
    it — a delegation must be signed by the parent's own subject."""
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    eve_kp = s.authority.enroll("eve")
    from passport_core.passport import Passport
    forged = Passport(
        subject="evil-child", issuer="eve", parent_id=orch.passport.passport_id,
        chain=orch.passport.chain + ["evil-child"], scope=Scope(tools=["doc.read"], max_depth=1).to_dict(),
        issued_at=time.time(), expires_at=orch.passport.expires_at, epoch=0,
        nonce=os.urandom(4).hex(), algorithm=s.authority.signer.algorithm,
    )
    forged.signature = b64(s.authority.signer.sign(eve_kp, forged.canonical_bytes()))
    ok, reason = s.authority.verify(forged)
    assert ok is False and "parent" in reason
    s.shutdown()


# ───────────────────────── C. Token / identity security (DPoP, replay, TOCTOU) ─────────────────────────

def test_rt_stolen_passport_without_key_is_inert():
    """Bearer-token theft (RFC 9449 motivation): an attacker captures a victim's passport
    object and presents it WITHOUT the private key. Proof-of-possession refuses it —
    holding the passport is not holding the identity."""
    s = AgentSystem()
    victim = s.authorize_root("victim", _root_scope())
    d = s.monitor.mediate(victim.passport, Action("tool", "refund.create"), proof=None)
    assert d.outcome == DENY and "possession" in d.reason
    s.shutdown()


def test_rt_stolen_passport_with_attacker_key_is_rejected():
    """Theft + forge: the attacker holds her OWN key and signs the action, but the proof
    must verify against the SUBJECT's key. Signing with the wrong key fails PoP."""
    s = AgentSystem()
    victim = s.authorize_root("victim", _root_scope())
    eve_kp = s.authority.enroll("eve")
    action = Action("tool", "refund.create")
    nonce = os.urandom(8).hex()
    forged_sig = s.authority.signer.sign(eve_kp, _action_msg(victim.passport.passport_id, action, nonce))
    d = s.monitor.mediate(victim.passport, action, proof={"nonce": nonce, "sig": forged_sig})
    assert d.outcome == DENY and "possession" in d.reason
    s.shutdown()


def test_rt_captured_proof_cannot_be_replayed():
    """Replay attack: even a VALID proof is single-use. The monitor burns the nonce, so a
    captured-and-replayed action request is refused the second time."""
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    action = Action("tool", "refund.create")
    proof = s._prove(orch, action)
    first = s.monitor.mediate(orch.passport, action, proof)
    replay = s.monitor.mediate(orch.passport, action, proof)
    assert first.outcome == ALLOW
    assert replay.outcome == DENY and "repla" in replay.reason
    s.shutdown()


def test_rt_revoked_passport_toctou_blocked():
    """TOCTOU on revocation: a passport valid a moment ago is revoked, then reused. The
    monitor RE-verifies on every action (complete mediation), so the stale token is dead
    on the very next call — not at some cache-expiry later."""
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    assert s.act(orch, Action("tool", "refund.create")).outcome == ALLOW
    s.authority.revoke("orch", "incident response")
    d = s.act(orch, Action("tool", "refund.create"))
    assert d.outcome == KILL  # invalid (revoked) passport is treated as a critical violation
    s.shutdown()


def test_rt_expired_passport_is_refused():
    """A validly-signed but expired passport (clock past TTL) must fail verification —
    time-boxing is enforced, not advisory."""
    s = AgentSystem()
    p = s.authority.issue_root("ghost", _root_scope(), ttl_seconds=-5)  # already expired, real signature
    ok, reason = s.authority.verify(p)
    assert ok is False and reason == "expired"
    s.shutdown()


# ───────────────────────── D. Resource overload / DoS ─────────────────────────

def test_rt_denial_flood_trips_killswitch():
    """Agentic T4 resource overload + probing: an attacker who isn't immediately
    'critical' grinds the boundary with out-of-scope calls. The denial tripwire turns
    repeated blocks into containment."""
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    outs = [s.act(orch, Action("fs_write", f"/etc/probe{i}")).outcome for i in range(3)]
    assert outs[0] == DENY and outs[1] == DENY and outs[2] == KILL
    assert "orch" in s.monitor.killed
    s.shutdown()


def test_rt_action_budget_exhaustion_is_contained():
    """A runaway/looping agent can't act without bound: once max_calls is spent, further
    actions are denied (before the tripwire would also fire)."""
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    pay = s.handoff(orch, "pay", _leaf(tools=["refund.create"], max_calls=2, max_children=0, max_depth=1))
    assert s.act(pay, Action("tool", "refund.create")).outcome == ALLOW
    assert s.act(pay, Action("tool", "refund.create")).outcome == ALLOW
    d = s.act(pay, Action("tool", "refund.create"))
    assert d.outcome == DENY and "budget" in d.reason
    s.shutdown()


def test_rt_delegation_depth_bomb_is_contained():
    """Recursive self-delegation (a depth bomb) must terminate: each hop strictly
    decreases max_depth, so the chain cannot grow without bound."""
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())  # max_depth=4
    a = s.handoff(orch, "a", _leaf(max_depth=2, max_children=1))
    b = s.handoff(a, "b", _leaf(max_depth=1, max_children=1))
    c = s.handoff(b, "c", _leaf(max_depth=0, max_children=1))  # depth floor reached
    raised = False
    try:
        s.handoff(c, "d", _leaf(max_depth=0, max_children=1))
    except PermissionError:
        raised = True
    assert raised
    s.shutdown()


def test_rt_subagent_fanout_bomb_is_contained():
    """Agentic T11 rogue-agent fan-out: a parent can't spawn unlimited sub-agents — the
    sub-agent budget (max_children) is hard-capped."""
    s = AgentSystem()
    orch = s.authorize_root("orch", Scope(tools=["doc.read"], max_calls=10, max_children=2, max_depth=3, ttl_seconds=300))
    s.handoff(orch, "w1", _leaf(max_children=0, max_depth=1))
    s.handoff(orch, "w2", _leaf(max_children=0, max_depth=1))
    raised = False
    try:
        s.handoff(orch, "w3", _leaf(max_children=0, max_depth=1))
    except PermissionError:
        raised = True
    assert raised
    s.shutdown()


# ───────────────────────── E. Integrity / repudiation ─────────────────────────

def test_rt_passport_tamper_breaks_signature():
    """Tampering any signed field (here widening max_calls) invalidates the signature —
    the passport is not a mutable claim."""
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    orch.passport.scope["max_calls"] = 10**9
    ok, reason = s.authority.verify(orch.passport)
    assert ok is False and "tamper" in reason
    s.shutdown()


def test_rt_signing_downgrade_is_rejected():
    """Algorithm-downgrade: an attacker rewrites the passport's `algorithm` to a weaker
    scheme. Because the field is inside the signed image, the edit breaks the signature."""
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    orch.passport.algorithm = "none"
    ok, reason = s.authority.verify(orch.passport)
    assert ok is False and "tamper" in reason
    s.shutdown()


def test_rt_audit_ledger_tamper_is_detected():
    """Agentic T9 repudiation: an attacker edits the audit log to hide an action. The
    hash chain makes any retroactive edit detectable."""
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    s.act(orch, Action("tool", "refund.create"))
    assert s.ledger.verify_chain() is True
    s.ledger.entries[1].detail = "nothing happened here"
    assert s.ledger.verify_chain() is False
    s.shutdown()


def test_rt_raw_secret_never_appears_in_audit_log():
    """A leased credential must never be written to the ledger in the clear — only a
    masked handle. (1Password parity: secrets are concealed; only the reference is logged.)"""
    s = AgentSystem()
    RAW = "sk_live_DEADBEEF_must_never_be_logged"
    s.vault.put("op://payments/stripe-key", RAW)
    orch = s.authorize_root("orch", _root_scope())
    dec, lease = s.lease_secret(orch, "op://payments/stripe-key")
    assert dec.outcome == ALLOW and lease is not None
    for e in s.ledger.entries:
        assert RAW not in str(e.detail)
        assert RAW not in str(getattr(e, "data", ""))
    s.shutdown()


# ───────────────────────── F. Multi-agent blast radius (orchestrator → subagents) ─────────────────────────

def test_rt_hijacked_subagent_kills_only_its_branch():
    """Anthropic orchestrator→subagents + trust-propagation risk: an injection hijacks a
    mid-chain agent. The kill-switch reaps exactly its branch (itself + descendants); the
    orchestrator and the agents ABOVE it keep working and finish the task."""
    s = AgentSystem()
    orch = s.authorize_root("orchestrator", _root_scope())
    planner = s.handoff(orch, "planner", _leaf(max_depth=3, max_children=2))
    researcher = s.handoff(planner, "researcher", _leaf(max_depth=2, max_children=2))
    scraper = s.handoff(researcher, "scraper", _leaf(max_depth=1, max_children=0))
    scraper_sbx = scraper.sandbox_id
    # researcher reads a poisoned page and tries to exfiltrate → kill its branch only
    d = s.act(researcher, Action("secret_egress", "https://poison.example/leak"))
    assert d.outcome == KILL
    assert "researcher" in s.monitor.killed and "scraper" in s.monitor.killed
    assert s.sandboxes.sandboxes[scraper_sbx].state == "KILLED"
    # the chain above survives and completes the work
    assert s.act(orch, Action("tool", "doc.read")).outcome == ALLOW
    assert s.act(planner, Action("tool", "doc.read")).outcome == ALLOW
    s.shutdown()


def test_rt_killed_agent_cannot_be_resurrected():
    """After containment, a killed agent's passport is permanently inert — every later
    action short-circuits to KILL (no resurrection, no race window)."""
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    assert s.act(orch, Action("secret_egress", "https://evil/x")).outcome == KILL
    assert s.act(orch, Action("tool", "doc.read")).outcome == KILL
    assert s.act(orch, Action("tool", "refund.create")).outcome == KILL
    s.shutdown()


# ───────────────────────── G. Spec gaming / reward hacking (scope-pattern loophole) ─────────────────────────

def test_rt_glob_boundary_spec_gaming_blocked():
    """Reward hacking against the authorization rule itself: an agent granted `/ws/*`
    tries to satisfy the pattern with a look-alike sibling path `/ws-evil/...`. The scope
    matcher honors the path boundary, so the loophole is closed end-to-end."""
    s = AgentSystem()
    scope = Scope(tools=["doc.read"], fs_read=["/ws/*"], max_calls=10, max_children=0, max_depth=1, ttl_seconds=300)
    a = s.authorize_root("reader", scope)
    assert s.act(a, Action("fs_read", "/ws/docs/report.txt")).outcome == ALLOW   # genuine subtree
    assert s.act(a, Action("fs_read", "/ws-evil/secret")).outcome == DENY        # look-alike refused
    s.shutdown()


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  FAIL  {t.__name__}  {e}")
        except Exception as e:  # noqa: BLE001
            print(f"  ERROR {t.__name__}  {type(e).__name__}: {e}")
    print(f"\n{passed}/{len(tests)} red-team attacks contained")
    sys.exit(0 if passed == len(tests) else 1)
