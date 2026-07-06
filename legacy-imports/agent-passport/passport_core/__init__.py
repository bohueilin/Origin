"""Passport — identity, scoped delegation, and a runtime kill-switch for
multi-agent systems.

Built for AGI House "Agent Identity Build Day". Local-only, zero-dependency
(standard library; Ed25519 used automatically if `cryptography` is installed).

The thesis (inherited from Origin robot-readiness): capability is not permission.
An agent earns a scoped, signed, tamper-evident credential — a Passport — that
travels across handoffs, can only narrow on delegation, is enforced at runtime by
a reference monitor, and is killed the instant it steps out of scope.
"""

__all__ = [
    "crypto",
    "scope",
    "passport",
    "ledger",
    "authority",
    "vault",
    "sandbox",
    "monitor",
    "agents",
]
