"""Zero-dependency test suite for Passport. Run: python3 tests/test_core.py
(also collectible by pytest if installed). Proves the security-critical claims."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time

from passport_core.agents import AgentSystem
from passport_core.crypto import KeyPair, b64, default_signer
from passport_core.monitor import ALLOW, DENY, KILL, Action
from passport_core.passport import Passport
from passport_core.scope import Scope


def _root_scope():
    return Scope(
        tools=["refund.create", "doc.read"], fs_read=["/workspace/*"],
        net_hosts=["api.payments.internal"], net_methods=["GET", "POST"],
        secrets=["op://payments/stripe-key"], max_calls=20, max_children=2, max_depth=2, ttl_seconds=600,
    )


def test_attenuation_subset_holds():
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    req = Scope(tools=["refund.create"], net_hosts=["api.payments.internal"], net_methods=["POST"],
                secrets=["op://payments/stripe-key"], max_calls=5, max_children=0, max_depth=1, ttl_seconds=120)
    child = s.handoff(orch, "pay", req)
    assert child.passport.get_scope().is_subset_of(orch.passport.get_scope())
    s.shutdown()


def test_escalation_is_dropped_on_delegate():
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    # request MORE than parent: extra tool, write to /etc, an unscoped secret
    req = Scope(tools=["refund.create", "shell.exec"], fs_write=["/etc/*"],
                secrets=["op://payments/admin-key"], max_calls=999, max_children=5, max_depth=1)
    child = s.handoff(orch, "pay", req)
    cs = child.passport.get_scope()
    assert "shell.exec" not in cs.tools and cs.fs_write == [] and cs.secrets == []
    assert cs.max_calls <= 20 and cs.is_subset_of(orch.passport.get_scope())
    s.shutdown()


def test_in_scope_allow_out_of_scope_deny():
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    assert s.act(orch, Action("tool", "refund.create")).outcome == ALLOW
    assert s.act(orch, Action("fs_write", "/etc/passwd")).outcome == DENY
    s.shutdown()


def test_credential_egress_trips_kill_switch_and_cascades():
    s = AgentSystem()
    s.vault.put("op://payments/stripe-key", "sk_live_TEST")
    orch = s.authorize_root("orch", _root_scope())
    req = Scope(tools=["refund.create"], secrets=["op://payments/stripe-key"], net_hosts=["api.payments.internal"],
                net_methods=["POST"], max_calls=5, max_children=1, max_depth=1, ttl_seconds=120)
    pay = s.handoff(orch, "pay", req)
    grand_req = Scope(tools=["refund.create"], max_calls=2, max_children=0, max_depth=0, ttl_seconds=60)
    s.handoff(pay, "pay.sub", grand_req)  # a descendant to prove cascade
    sandbox_id = pay.sandbox_id
    d = s.act(pay, Action("secret_egress", "https://evil/collect"))
    assert d.outcome == KILL
    # passport revoked, sandbox subtree killed (parent + descendant), parent untouched
    ok, _ = s.authority.verify(pay.passport)
    assert ok is False
    assert s.sandboxes.sandboxes[sandbox_id].state == "KILLED"
    assert "pay.sub" in s.monitor.killed
    assert s.act(orch, Action("tool", "doc.read")).outcome == ALLOW
    s.shutdown()


def test_tamper_breaks_signature():
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    orch.passport.scope["max_calls"] = 100000
    ok, reason = s.authority.verify(orch.passport)
    assert ok is False and "tamper" in reason
    s.shutdown()


def test_ledger_hash_chain_intact_and_tamper_detectable():
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    s.act(orch, Action("tool", "refund.create"))
    assert s.ledger.verify_chain() is True
    s.ledger.entries[1].detail = "forged"  # mutate a sealed entry
    assert s.ledger.verify_chain() is False
    s.shutdown()


def test_child_cannot_outlive_or_outdepth_parent():
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    child = s.handoff(orch, "pay", Scope(tools=["refund.create"], max_calls=3, max_children=0, max_depth=1, ttl_seconds=99999))
    assert child.passport.expires_at <= orch.passport.expires_at
    assert child.passport.get_scope().max_depth < orch.passport.get_scope().max_depth
    s.shutdown()


def test_delegated_passport_must_be_signed_by_parent():
    # An unrelated enrolled signer ("eve") forges a child under orchestrator's
    # parent_id + chain, signing with her OWN key. verify() must reject it because
    # the issuer is not the parent's subject (delegation isn't bound to the parent).
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    eve_kp = s.authority.enroll("eve")
    forged = Passport(
        subject="evil-child", issuer="eve", parent_id=orch.passport.passport_id,
        chain=orch.passport.chain + ["evil-child"],
        scope=Scope(tools=["doc.read"], max_depth=1).to_dict(),
        issued_at=time.time(), expires_at=orch.passport.expires_at, epoch=0,
        nonce=os.urandom(4).hex(), algorithm=s.authority.signer.algorithm,
    )
    forged.signature = b64(s.authority.signer.sign(eve_kp, forged.canonical_bytes()))
    ok, reason = s.authority.verify(forged)
    assert ok is False and "parent" in reason
    s.shutdown()


def test_max_calls_zero_blocks_all_actions():
    # max_calls=0 must mean ZERO actions (not unlimited). Under a bounded parent the
    # child is admitted (0 <= 20) but the monitor denies its very first action.
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    pay = s.handoff(orch, "pay", Scope(tools=["refund.create"], max_calls=0, max_children=0, max_depth=1, ttl_seconds=120))
    assert pay.passport.get_scope().max_calls == 0
    d = s.act(pay, Action("tool", "refund.create"))
    assert d.outcome == DENY and "budget" in d.reason
    s.shutdown()


def test_kill_reaps_descendant_when_subject_sandbox_missing():
    # If the killed subject has no sandbox mapping, its descendants must STILL be
    # SIGKILLed (kill is total, not subject-only).
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    pay = s.handoff(orch, "pay", Scope(tools=["refund.create"], max_calls=5, max_children=1, max_depth=1, ttl_seconds=120))
    sub = s.handoff(pay, "pay.sub", Scope(tools=["refund.create"], max_calls=2, max_children=0, max_depth=0, ttl_seconds=60))
    sub_sbx = sub.sandbox_id
    del s.agent_sandbox["pay"]  # subject mapping gone; descendant mapping remains
    s.monitor.trip_kill_switch("pay", "test")
    assert s.sandboxes.sandboxes[sub_sbx].state == "KILLED"
    s.shutdown()


def test_canonical_bytes_stable_across_int_float_and_unicode():
    import unicodedata
    from passport_core.passport import Passport
    common = dict(passport_id="psp_test", issuer="authority", scope={}, expires_at=10.0,
                  epoch=0, nonce="n", algorithm="x", parent_id=None)
    # 1 (int) and 1.0 (float) must produce the same signing image
    a = Passport(subject="cafe", chain=["cafe"], issued_at=1, **common)
    b = Passport(subject="cafe", chain=["cafe"], issued_at=1.0, **common)
    assert a.canonical_bytes() == b.canonical_bytes()
    # NFC vs NFD forms of the same identity must agree
    nfc, nfd = unicodedata.normalize("NFC", "café"), unicodedata.normalize("NFD", "café")
    assert nfc != nfd
    c1 = Passport(subject=nfc, chain=[nfc], issued_at=1, **common)
    c2 = Passport(subject=nfd, chain=[nfd], issued_at=1, **common)
    assert c1.canonical_bytes() == c2.canonical_bytes()


def test_kill_switch_is_idempotent():
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    s.handoff(orch, "pay", Scope(tools=["refund.create"], max_calls=5, max_children=0, max_depth=1, ttl_seconds=120))
    s.monitor.trip_kill_switch("pay", "first")
    n = len(s.ledger.entries)
    s.monitor.trip_kill_switch("pay", "second")  # re-trip the same subject
    assert len(s.ledger.entries) == n  # no new ledger entries on a repeat trip
    s.shutdown()


def test_stop_all_reaps_processes():
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    s.handoff(orch, "pay", Scope(tools=["refund.create"], max_calls=3, max_children=0, max_depth=1, ttl_seconds=120))
    s.shutdown()  # calls stop_all
    for sb in s.sandboxes.sandboxes.values():
        assert sb._proc is None or sb._proc.poll() is not None  # terminated + reaped (has a returncode)


def test_factory_defaults_to_mock_backends():
    from passport_core.sandbox import SandboxManager, make_sandbox_manager
    from passport_core.vault import Vault, make_vault
    assert type(make_vault()) is Vault
    assert type(make_sandbox_manager()) is SandboxManager


def test_unknown_backend_raises():
    from passport_core.sandbox import make_sandbox_manager
    from passport_core.vault import make_vault
    os.environ["VAULT_BACKEND"] = "bogus"
    try:
        bad = False
        try:
            make_vault()
        except ValueError:
            bad = True
        assert bad
    finally:
        os.environ.pop("VAULT_BACKEND", None)
    os.environ["SANDBOX_BACKEND"] = "bogus"
    try:
        bad = False
        try:
            make_sandbox_manager()
        except ValueError:
            bad = True
        assert bad
    finally:
        os.environ.pop("SANDBOX_BACKEND", None)


def test_real_backends_fail_closed_without_credentials():
    # A real backend selected without its credential must raise a CLEAR error, never
    # silently fall back to mock or crash with an import error.
    from passport_core.sandbox import make_sandbox_manager
    from passport_core.vault import make_vault
    os.environ["VAULT_BACKEND"] = "onepassword"; os.environ.pop("OP_SERVICE_ACCOUNT_TOKEN", None)
    try:
        bad = False
        try:
            make_vault()
        except RuntimeError:
            bad = True
        assert bad
    finally:
        os.environ.pop("VAULT_BACKEND", None)
    os.environ["SANDBOX_BACKEND"] = "daytona"; os.environ.pop("DAYTONA_API_KEY", None)
    try:
        bad = False
        try:
            make_sandbox_manager()
        except RuntimeError:
            bad = True
        assert bad
    finally:
        os.environ.pop("SANDBOX_BACKEND", None)


def test_adapter_modules_import_without_sdks():
    # Adapters must import with `op`/`daytona` absent — the SDK is touched lazily only
    # when the backend is constructed.
    import importlib
    importlib.import_module("passport_core.vault_onepassword")
    importlib.import_module("passport_core.sandbox_daytona")


def test_ttl_attenuation_none_unbounded_int_cap():
    # ttl_seconds: None = unbounded, int = cap. A bounded parent rejects a longer-lived
    # child; an unbounded parent allows any; intersect clamps a request to the parent.
    bounded = Scope(ttl_seconds=600, max_depth=2)  # max_depth set so depth check passes
    assert Scope(ttl_seconds=300, max_depth=1).is_subset_of(bounded) is True
    assert Scope(ttl_seconds=1000, max_depth=1).is_subset_of(bounded) is False
    assert Scope(ttl_seconds=10**9, max_depth=1).is_subset_of(Scope(ttl_seconds=None, max_depth=2)) is True
    assert bounded.intersect(Scope(ttl_seconds=10**9, max_depth=1)).ttl_seconds == 600


def test_covers_bare_star_does_not_cross_path_boundary():
    from passport_core.scope import _pattern_subset
    assert _pattern_subset(["/ws-evil/secret"], ["/ws*"]) is False   # bare * stays in-segment
    assert _pattern_subset(["/ws-evil"], ["/ws*"]) is True           # same segment is fine
    assert _pattern_subset(["/ws/docs/a"], ["/ws/*"]) is True        # /* still covers a subtree


def test_duplicate_agent_id_is_rejected():
    # Identities must be unique — a duplicate enroll (here via a same-named handoff)
    # must fail closed so it can never collide with a namesake's containment.
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    raised = False
    try:
        s.handoff(orch, "orch", Scope(tools=["refund.create"], max_calls=1, max_children=0, max_depth=1, ttl_seconds=60))
    except ValueError:
        raised = True
    assert raised
    s.shutdown()


def test_distinct_siblings_are_independently_contained():
    # Killing one agent must NOT affect a distinct same-role sibling (no over-kill).
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())  # max_children=2
    a = s.handoff(orch, "worker-a", Scope(tools=["refund.create"], max_calls=3, max_children=0, max_depth=1, ttl_seconds=120))
    b = s.handoff(orch, "worker-b", Scope(tools=["refund.create"], max_calls=3, max_children=0, max_depth=1, ttl_seconds=120))
    b_sbx = b.sandbox_id
    assert s.act(a, Action("secret_egress", "https://evil/x")).outcome == KILL  # kill worker-a
    assert s.act(b, Action("tool", "refund.create")).outcome == ALLOW           # worker-b untouched
    assert s.sandboxes.sandboxes[b_sbx].state != "KILLED"                       # its sandbox still running
    s.shutdown()


def test_default_signer_is_asymmetric():
    # Secure-by-default: the keyring must hold PUBLIC keys, not shared secrets.
    s = AgentSystem()
    assert s.authority.signer.algorithm == "Ed25519"
    s.shutdown()


def test_public_keyring_cannot_forge_root_or_child():
    # The core P0 fix: an attacker who copies the ENTIRE public keyring still cannot
    # mint a passport that verifies — signing needs the private seed, not the pubkey.
    s = AgentSystem()
    orch = s.authorize_root("orch", _root_scope())
    signer = s.authority.signer
    pubring = dict(s.authority.keyring)  # every verify_key the attacker can see

    # (1) forge a maximally-scoped ROOT passport using authority's PUBLIC key as a seed
    auth_pub = pubring["authority"]
    forged_root = Passport(
        subject="attacker", issuer="authority", parent_id=None, chain=["attacker"],
        scope=Scope(tools=["*"], fs_write=["/*"], max_depth=9).to_dict(),
        issued_at=time.time(), expires_at=time.time() + 600, epoch=0,
        nonce=os.urandom(4).hex(), algorithm=signer.algorithm,
    )
    forged_root.signature = b64(signer.sign(KeyPair("authority", auth_pub, auth_pub, signer.algorithm), forged_root.canonical_bytes()))
    ok_root, _ = s.authority.verify(forged_root)
    assert ok_root is False

    # (2) forge a delegated CHILD under orch using orch's PUBLIC key as a seed
    orch_pub = pubring["orch"]
    forged_child = Passport(
        subject="evil", issuer="orch", parent_id=orch.passport.passport_id,
        chain=orch.passport.chain + ["evil"],
        scope=Scope(tools=["doc.read"], max_depth=1).to_dict(),
        issued_at=time.time(), expires_at=orch.passport.expires_at, epoch=0,
        nonce=os.urandom(4).hex(), algorithm=signer.algorithm,
    )
    forged_child.signature = b64(signer.sign(KeyPair("orch", orch_pub, orch_pub, signer.algorithm), forged_child.canonical_bytes()))
    ok_child, _ = s.authority.verify(forged_child)
    assert ok_child is False
    s.shutdown()


def test_hmac_only_with_explicit_insecure_flag():
    assert default_signer().algorithm == "Ed25519"
    os.environ["ORIGIN_INSECURE_HMAC"] = "1"
    try:
        assert default_signer().algorithm == "HMAC-SHA256"
    finally:
        del os.environ["ORIGIN_INSECURE_HMAC"]
    assert default_signer().algorithm == "Ed25519"


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
    print(f"\n{passed}/{len(tests)} passed")
    sys.exit(0 if passed == len(tests) else 1)
