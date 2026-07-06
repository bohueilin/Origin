"""Agent runtime — wires the Authority, Vault (1Password), SandboxManager
(Daytona), and the reference Monitor into one system, and gives agents a small
API: be authorized, hand off to a sub-agent (attenuated), act, and lease secrets.
Every side-effecting call is mediated by the monitor — there is no path around it.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

from .authority import Authority
from .crypto import KeyPair
from .ledger import Ledger
from .monitor import ALLOW, Action, Decision, Monitor, _action_msg
from .passport import Passport
from .sandbox import make_sandbox_manager
from .scope import Scope
from .vault import Lease, make_vault


@dataclass
class Agent:
    agent_id: str
    kp: KeyPair
    passport: Passport
    sandbox_id: Optional[str]


class AgentSystem:
    def __init__(self, signer=None, on_event=None):
        self.ledger = Ledger(on_append=on_event)
        self.authority = Authority(signer=signer, ledger=self.ledger)
        self.vault = make_vault(ledger=self.ledger)  # mock by default; VAULT_BACKEND to swap
        self.sandboxes = make_sandbox_manager(ledger=self.ledger)  # SANDBOX_BACKEND to swap
        self.agent_sandbox: Dict[str, str] = {}
        self.monitor = Monitor(self.authority, self.vault, self.sandboxes, self.ledger, self.agent_sandbox)
        self.agents: Dict[str, Agent] = {}
        self._children: Dict[str, int] = {}

    # --- lifecycle --------------------------------------------------------------
    def authorize_root(self, agent_id: str, scope: Scope, ttl_seconds: int = 600) -> Agent:
        kp = self.authority.enroll(agent_id)
        passport = self.authority.issue_root(agent_id, scope, ttl_seconds)
        sb = self.sandboxes.create(agent_id, passport)
        self.agent_sandbox[agent_id] = sb.sandbox_id
        agent = Agent(agent_id, kp, passport, sb.sandbox_id)
        self.agents[agent_id] = agent
        return agent

    def handoff(self, parent: Agent, child_id: str, requested: Scope, ttl_seconds: Optional[int] = None) -> Agent:
        """Parent delegates an attenuated passport to a new sub-agent and spins up
        its linked sandbox (the handoff). Enforces the parent's sub-agent budget."""
        used = self._children.get(parent.agent_id, 0)
        if used >= parent.passport.get_scope().max_children:
            raise PermissionError(f"{parent.agent_id} has exhausted its sub-agent budget")
        kp = self.authority.enroll(child_id)
        child_passport = self.authority.delegate(parent.passport, parent.kp, child_id, requested, ttl_seconds)
        self._children[parent.agent_id] = used + 1
        parent_sbx = self.agent_sandbox.get(parent.agent_id)
        sb = self.sandboxes.create(child_id, child_passport, parent_sandbox_id=parent_sbx)
        self.agent_sandbox[child_id] = sb.sandbox_id
        agent = Agent(child_id, kp, child_passport, sb.sandbox_id)
        self.agents[child_id] = agent
        return agent

    # --- mediated operations ----------------------------------------------------
    def _prove(self, agent: Agent, action: Action) -> dict:
        """Sign THIS action with the agent's own key, proving it holds the passport's
        private key (proof of possession). The fresh nonce makes the proof single-use,
        so a captured proof can't be replayed. The monitor verifies it before any scope
        check — a stolen bearer passport without the key is inert."""
        nonce = os.urandom(12).hex()
        msg = _action_msg(agent.passport.passport_id, action, nonce)
        sig = self.authority.signer.sign(agent.kp, msg)
        return {"nonce": nonce, "sig": sig}

    def act(self, agent: Agent, action: Action) -> Decision:
        return self.monitor.mediate(agent.passport, action, self._prove(agent, action))

    def lease_secret(self, agent: Agent, ref: str, ttl_seconds: int = 60) -> Tuple[Decision, Optional[Lease]]:
        action = Action("secret_lease", ref)
        decision = self.monitor.mediate(agent.passport, action, self._prove(agent, action))
        if decision.outcome != ALLOW:
            return decision, None
        try:
            lease = self.vault.issue_lease(agent.passport, ref, agent.sandbox_id, ttl_seconds)
            return decision, lease
        except (PermissionError, KeyError) as exc:
            return Decision("DENY", str(exc), Action("secret_lease", ref)), None

    def shutdown(self) -> None:
        self.sandboxes.stop_all()
