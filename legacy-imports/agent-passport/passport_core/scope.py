"""Capability scope + attenuation algebra.

A Scope is the set of things an agent may do. The one rule that makes delegation
safe: a child's scope must be a SUBSET of its parent's. `intersect` computes the
greatest scope within both (what a parent may grant a child); `is_subset_of` is
the guard the verifier re-checks at every hop so privilege can never escalate —
even if a token is tampered with or a parent is compromised.

This is the object-capability / macaroon-caveat model applied to agents.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import List, Optional


def _covers(parent_pat: str, child_pat: str) -> bool:
    """Does parent glob pattern cover everything the child pattern can match?
    Pragmatic, conservative rule: equal patterns, a parent wildcard, or a parent
    prefix directory (`/ws/*` covers `/ws/docs/*` and `/ws/docs/a.txt`)."""
    if parent_pat == child_pat or parent_pat == "*":
        return True
    if parent_pat.endswith("/*"):
        prefix = parent_pat[:-1]  # keep trailing slash: "/ws/" → covers the whole subtree
        return child_pat.startswith(prefix)
    if parent_pat.endswith("*"):
        # A BARE trailing '*' matches only within a path segment — it must not cross a
        # '/' boundary. So "/ws*" covers "/ws" and "/ws-evil" but NOT "/ws-evil/secret"
        # (use "/ws/*" to grant a subtree). Prevents accidental sibling-tree grants.
        prefix = parent_pat[:-1]
        return child_pat.startswith(prefix) and "/" not in child_pat[len(prefix):]
    return False


def _pattern_subset(child: List[str], parent: List[str]) -> bool:
    return all(any(_covers(p, c) for p in parent) for c in child)


def _pattern_intersect(requested: List[str], parent: List[str]) -> List[str]:
    """Keep only requested patterns the parent actually covers (drop escalations)."""
    return [c for c in requested if any(_covers(p, c) for p in parent)]


def _glob_match(patterns: List[str], value: str) -> bool:
    import fnmatch

    return any(p == "*" or p == value or fnmatch.fnmatch(value, p) for p in patterns)


def _budget_subset(child, parent) -> bool:
    """Call-budget attenuation. `None` = unbounded, an int (incl. 0) = a hard cap.
    A bounded parent requires a present child no larger than it; an unbounded parent
    (None) permits any child."""
    if parent is None:
        return True
    if child is None:
        return False
    return child <= parent


def _budget_min(a, b):
    """The tighter of two call budgets, where `None` means unbounded."""
    if a is None:
        return b
    if b is None:
        return a
    return min(a, b)


@dataclass
class Scope:
    tools: List[str] = field(default_factory=list)
    fs_read: List[str] = field(default_factory=list)
    fs_write: List[str] = field(default_factory=list)
    net_hosts: List[str] = field(default_factory=list)
    net_methods: List[str] = field(default_factory=list)
    secrets: List[str] = field(default_factory=list)  # op:// refs this agent may lease
    max_calls: Optional[int] = None  # monitored-action budget: None = unbounded, 0 = none
    max_depth: int = 0  # remaining delegation hops (0 = may not delegate; strictly decreases)
    max_children: int = 0  # sub-agents this agent may spawn (0 = none)
    ttl_seconds: Optional[int] = None  # max lifetime in seconds: None = unbounded, 0 = instant

    # --- runtime permission checks (the reference monitor calls these) ----------
    def allows_tool(self, name: str) -> bool:
        return _glob_match(self.tools, name)

    def allows_fs_read(self, path: str) -> bool:
        return _glob_match(self.fs_read, path)

    def allows_fs_write(self, path: str) -> bool:
        return _glob_match(self.fs_write, path)

    def allows_net(self, host: str, method: str) -> bool:
        return _glob_match(self.net_hosts, host) and _glob_match(
            [m.upper() for m in self.net_methods], method.upper()
        )

    def allows_secret(self, ref: str) -> bool:
        return _glob_match(self.secrets, ref)

    # --- attenuation algebra ----------------------------------------------------
    def is_subset_of(self, parent: "Scope") -> bool:
        """True iff this scope grants nothing the parent doesn't already grant."""
        return (
            _pattern_subset(self.tools, parent.tools)
            and _pattern_subset(self.fs_read, parent.fs_read)
            and _pattern_subset(self.fs_write, parent.fs_write)
            and _pattern_subset(self.net_hosts, parent.net_hosts)
            and _pattern_subset([m.upper() for m in self.net_methods], [m.upper() for m in parent.net_methods])
            and _pattern_subset(self.secrets, parent.secrets)
            and _budget_subset(self.max_calls, parent.max_calls)
            and self.max_children <= parent.max_children
            and self.max_depth < parent.max_depth  # strictly fewer hops than the parent
            and _budget_subset(self.ttl_seconds, parent.ttl_seconds)
        )

    def intersect(self, requested: "Scope") -> "Scope":
        """The greatest scope within BOTH self (parent) and `requested` — what a
        parent may safely grant a child. Anything the parent lacks is dropped."""
        return Scope(
            tools=_pattern_intersect(requested.tools, self.tools),
            fs_read=_pattern_intersect(requested.fs_read, self.fs_read),
            fs_write=_pattern_intersect(requested.fs_write, self.fs_write),
            net_hosts=_pattern_intersect(requested.net_hosts, self.net_hosts),
            net_methods=[m for m in requested.net_methods if m.upper() in [x.upper() for x in self.net_methods] or "*" in self.net_methods],
            secrets=_pattern_intersect(requested.secrets, self.secrets),
            max_calls=_budget_min(requested.max_calls, self.max_calls),
            max_children=min(requested.max_children, self.max_children),
            max_depth=min(requested.max_depth, self.max_depth - 1) if requested.max_depth else self.max_depth - 1,
            ttl_seconds=_budget_min(requested.ttl_seconds, self.ttl_seconds),
        )

    def summary(self) -> str:
        bits = []
        if self.tools:
            bits.append("tools=" + ",".join(self.tools))
        if self.fs_read:
            bits.append("r=" + ",".join(self.fs_read))
        if self.fs_write:
            bits.append("w=" + ",".join(self.fs_write))
        if self.secrets:
            bits.append("secrets=" + ",".join(self.secrets))
        bits.append(f"depth≤{self.max_depth}")
        return " · ".join(bits)

    def to_dict(self):
        return asdict(self)

    @staticmethod
    def from_dict(d):
        return Scope(**d)
