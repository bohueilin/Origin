"""The reference monitor + kill-switch daemon — complete mediation.

EVERY agent action passes through `mediate()`: the monitor re-verifies the
passport (signature, expiry, revocation, no-escalation) and checks the specific
action against the scope. In-scope → ALLOW. Out-of-scope → DENY. A *critical*
violation (scope-escalation attempt or credential egress — the classic
prompt-injection payloads) trips the kill-switch: revoke the passport and every
descendant, tear down their leases, and SIGKILL their sandbox subtree — instantly.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Set

ALLOW = "ALLOW"
DENY = "DENY"
KILL = "KILL"

# Action kinds that are never legitimate and always trip the kill-switch.
CRITICAL_KINDS = {"escalate_scope", "secret_egress"}

# Repeated blocked attempts (probing) escalate to the kill-switch — an attacker who
# isn't immediately "critical" still trips containment by flooding denials.
DENY_TRIPWIRE = 3


def _action_msg(passport_id: str, action: "Action", nonce: str) -> bytes:
    """Canonical bytes an agent signs to PROVE it holds the passport's private key
    for THIS action (sender-constrained / proof-of-possession, à la OAuth DPoP). The
    nonce makes each proof single-use, so a captured proof can't be replayed."""
    return f"{passport_id}|{action.kind}|{action.target}|{action.method}|{nonce}".encode()


@dataclass
class Action:
    kind: str  # tool | fs_read | fs_write | net | secret_lease | secret_egress | spawn | escalate_scope
    target: str
    method: str = ""
    note: str = ""


@dataclass
class Decision:
    outcome: str  # ALLOW | DENY | KILL
    reason: str
    action: Action


class Monitor:
    def __init__(self, authority, vault, sandboxes, ledger, agent_sandbox: Dict[str, str]):
        self.authority = authority
        self.vault = vault
        self.sandboxes = sandboxes
        self.ledger = ledger
        self.agent_sandbox = agent_sandbox  # agent_id -> sandbox_id
        self.calls: Dict[str, int] = {}
        self.killed: Set[str] = set()
        self.seen_nonces: Set[str] = set()  # anti-replay: every action nonce is single-use
        self.denials: Dict[str, int] = {}   # per-subject blocked-attempt counter (tripwire)

    def mediate(self, passport, action: Action, proof=None) -> Decision:
        subject = passport.subject
        if subject in self.killed:
            return Decision(KILL, "agent already terminated", action)

        ok, reason = self.authority.verify(passport)
        if not ok:
            return self._deny(passport, action, f"invalid passport ({reason})", critical=True)

        # Proof of possession (sender-constrained, DPoP-style): the action must be
        # signed by the SUBJECT's own key. A bearer passport stolen without the key —
        # or a captured-and-replayed proof — fails here, before any scope check.
        pop_ok, pop_reason = self._check_pop(passport, action, proof)
        if not pop_ok:
            return self._deny(passport, action, pop_reason, critical=False)

        scope = passport.get_scope()
        self.calls[passport.passport_id] = self.calls.get(passport.passport_id, 0) + 1
        # max_calls: None = unbounded; an int (including 0) is a hard cap. Enforce
        # whenever a cap is set, so max_calls=0 means zero actions (matches is_subset_of).
        if scope.max_calls is not None and self.calls[passport.passport_id] > scope.max_calls:
            return self._deny(passport, action, "action budget exhausted", critical=False)

        allowed, why = self._check(scope, action)
        if allowed:
            self.ledger.append(
                "ACTION_ALLOW", subject,
                f"{action.kind} · {action.target}" + (f" ({action.method})" if action.method else ""),
                {"kind": action.kind, "target": action.target},
            )
            return Decision(ALLOW, "within scope", action)

        return self._deny(passport, action, why, critical=action.kind in CRITICAL_KINDS)

    def _check_pop(self, passport, action: Action, proof):
        """Verify the caller actually holds the passport's private key for THIS action.
        Defeats stolen-passport reuse (no key → no valid proof) and replay (nonce reuse).
        Returns (ok, reason). A missing proof is treated as a possession failure, not a
        crash — the system fails closed."""
        if not proof or not isinstance(proof, dict) or "sig" not in proof or "nonce" not in proof:
            return False, "no proof of possession (passport presented without holder key)"
        nonce = proof["nonce"]
        if nonce in self.seen_nonces:
            return False, "replayed action (nonce reuse — captured proof cannot be replayed)"
        verify_key = self.authority.keyring.get(passport.subject)
        if verify_key is None:
            return False, "no verification key on record for subject"
        sig = proof["sig"]
        if not isinstance(sig, (bytes, bytearray)):
            return False, "malformed proof signature"
        msg = _action_msg(passport.passport_id, action, nonce)
        if not self.authority.signer.verify(verify_key, msg, bytes(sig)):
            return False, "proof of possession failed (action not signed by the subject's key)"
        self.seen_nonces.add(nonce)  # burn the nonce only once the proof fully verifies
        return True, "ok"

    def _check(self, scope, action: Action):
        k = action.kind
        if k == "tool":
            return scope.allows_tool(action.target), "tool not in passport scope"
        if k == "fs_read":
            return scope.allows_fs_read(action.target), "path not readable under this passport"
        if k == "fs_write":
            return scope.allows_fs_write(action.target), "path not writable under this passport"
        if k == "net":
            return scope.allows_net(action.target, action.method or "GET"), "host/method outside scope"
        if k == "secret_lease":
            return scope.allows_secret(action.target), "secret not permitted by passport"
        if k == "spawn":
            return (scope.max_children > 0 and scope.max_depth > 0), "no delegation budget remaining"
        if k == "escalate_scope":
            return False, "scope-escalation attempt (privilege cannot be raised by delegation)"
        if k == "secret_egress":
            return False, "credential egress is never permitted (secret is sandbox-bound)"
        return False, "unknown action kind"

    def _deny(self, passport, action: Action, reason: str, critical: bool) -> Decision:
        self.ledger.append(
            "ACTION_DENY", passport.subject,
            f"{action.kind} · {action.target} — {reason}",
            {"kind": action.kind, "target": action.target, "critical": critical},
        )
        if critical:
            self.trip_kill_switch(passport.subject, f"critical violation — {reason}")
            return Decision(KILL, reason, action)
        # Anomaly response: a single block is a deny, but repeated blocked attempts are
        # probing. Past the tripwire we stop saying "no" and engage containment, so a
        # patient attacker can't grind the boundary one out-of-scope call at a time.
        self.denials[passport.subject] = self.denials.get(passport.subject, 0) + 1
        if self.denials[passport.subject] >= DENY_TRIPWIRE:
            self.trip_kill_switch(
                passport.subject,
                f"denial tripwire — {self.denials[passport.subject]} blocked attempts (probing)",
            )
            return Decision(KILL, f"{reason} — denial tripwire engaged", action)
        return Decision(DENY, reason, action)

    def trip_kill_switch(self, subject: str, reason: str) -> None:
        # Idempotent: the first trip already reaped the whole subtree (subject +
        # descendants are all in `killed`), so a re-trip is a no-op. (The old guard
        # also consulted descendants(), which scans the never-pruned registry and is
        # ~never empty — so it re-ran teardown and spammed the ledger.)
        if subject in self.killed:
            return
        self.ledger.append("KILL", subject, f"KILL-SWITCH ENGAGED — {reason}", {"subject": subject, "reason": reason})
        victims = {subject} | self.authority.descendants(subject)
        for v in victims:
            self.killed.add(v)
            self.authority.revoke(v, "kill-switch")          # capability plane: passport revoked
            self.vault.revoke_for(v, "kill-switch")          # credential plane: leases scrubbed
            try:
                self.vault.suspend_identity(v, "kill-switch")  # identity plane: 1Password suspend
            except Exception:  # noqa: BLE001 - identity plane is best-effort; never block containment
                pass
        # SIGKILL every victim's sandbox — not just the subject's. If the subject has
        # no sandbox mapping, its descendants must still be reaped. sandboxes.kill
        # cascades + is idempotent, so overlapping subtrees are safe.
        for v in victims:
            sbx = self.agent_sandbox.get(v)
            if sbx:
                self.sandboxes.kill(sbx, reason)
