# Passport — Threat Model & Red-Team Coverage

> **Claim:** every action an agent takes is mediated by a reference monitor that
> re-verifies a signed, attenuating, proof-of-possession capability passport and can
> contain the agent instantly. This document maps the agentic threat literature to the
> specific defense in this codebase and the specific test that fires the attack.
>
> **Coverage today:** 24 core invariants + 22 adversarial red-team attacks = **46 tests,
> all green** (`python3 tests/test_core.py && python3 tests/test_redteam.py`).
> Zero third-party dependencies; secure-by-default (Ed25519 keyring; HMAC only behind an
> explicit insecure flag). Mock backends by default; real 1Password / Daytona are
> fail-closed adapters (live wiring pending the operator's tokens).

## The five invariants (never weakened)

1. **Attenuation is monotonic** — a child's scope is always a strict subset of its
   parent's. Privilege can only ever shrink down a delegation chain.
2. **Complete mediation** — there is no path to a side effect that doesn't pass through
   `Monitor.mediate()`, which re-verifies the passport on *every* call (no cached trust).
3. **Containment is total and bounded** — a kill reaps the offender + its entire subtree
   (passport revoked, leases scrubbed, sandboxes SIGKILLed) and *nothing outside it*.
4. **Tamper-evidence** — passports are signed; the audit ledger is hash-chained. Any edit
   to either is detectable.
5. **Fail closed** — missing proof, unknown backend, absent credential, malformed input →
   refuse, never silently degrade or crash open.

---

## Threat matrix

Each row: the threat (with its taxonomy tag), the concrete attack, the defense in this
system, and the red-team test that proves containment.

### A. Prompt injection & excessive agency — *OWASP LLM01 / LLM06; Agentic T2, T6*

| Threat | Attack | Defense | Test |
|---|---|---|---|
| Indirect prompt injection → exfiltration | A poisoned tool/web result instructs the agent to email a credential out | `secret_egress` is a **critical kind** → instant kill + subtree cascade; the secret is sandbox-bound and never leaves | `test_rt_indirect_prompt_injection_egress_is_killed` |
| Scope escalation payload | Injection tells the agent to grant itself admin | `escalate_scope` is never legitimate → critical kill | `test_rt_scope_escalation_payload_is_killed` |
| **Lethal trifecta** (Willison) | Agent holds private data **and** reads untrusted content **and** has an exfil path | The third leg is structurally removed: egress is always refused — private data + untrusted input can coexist safely because they can never combine into exfiltration | `test_rt_lethal_trifecta_exfil_leg_is_severed` |

### B. Authorization & confused deputy — *Agentic T3; classic confused-deputy*

| Threat | Attack | Defense | Test |
|---|---|---|---|
| Confused deputy | An agent scoped to one credential reaches for a sibling it was never granted | Per-resource scope; **no ambient authority** — each secret/host/path is individually allow-listed | `test_rt_confused_deputy_cross_resource_denied` |
| Privilege escalation via delegation | A sub-agent *requests* more than its parent (extra tools, `/etc` writes, unscoped secrets, a bigger budget) | `intersect()` attenuates the grant to ⊆ parent before signing — the surplus is dropped silently | `test_rt_privilege_escalation_via_delegation_is_dropped` |
| Identity spoofing on handoff (*T8*) | An unrelated enrolled agent mints a child under a victim parent's id/chain, signing with its own key | **Issuer-binding**: a delegation's signer must equal the parent's subject; verification walks parent→root | `test_rt_forged_delegation_by_unrelated_signer_rejected` |
| Public-keyring forgery | Attacker copies the entire public keyring and tries to mint a passport | Asymmetric signing — the private seed is required; the pubkey can only verify | `test_public_keyring_cannot_forge_root_or_child` (core) |

### C. Token / identity security — *OAuth DPoP (RFC 9449); replay; TOCTOU*

| Threat | Attack | Defense | Test |
|---|---|---|---|
| **Bearer-token theft** | Attacker captures a passport object and presents it without the key | **Proof-of-possession**: every action must be signed by the subject's own key; a stolen passport is inert | `test_rt_stolen_passport_without_key_is_inert` |
| Theft + forge | Attacker signs the action with *her* key | The proof must verify against the **subject's** key — wrong key fails | `test_rt_stolen_passport_with_attacker_key_is_rejected` |
| **Replay** | Attacker captures a valid proof and resubmits it | Each proof carries a single-use nonce the monitor burns — replays are refused | `test_rt_captured_proof_cannot_be_replayed` |
| TOCTOU on revocation | A token valid a moment ago is revoked, then reused | Complete mediation re-verifies on the *next* call — revocation is effective immediately, not at cache expiry | `test_rt_revoked_passport_toctou_blocked` |
| Expired token reuse | A validly-signed but expired passport is replayed | TTL is enforced at verify; expiry is hard, not advisory | `test_rt_expired_passport_is_refused` |

### D. Resource overload & DoS — *Agentic T4, T11*

| Threat | Attack | Defense | Test |
|---|---|---|---|
| Probing / denial-flooding | A non-critical attacker grinds the boundary with many out-of-scope calls | **Denial tripwire**: repeated blocks escalate to a kill (intrusion response, not just "no") | `test_rt_denial_flood_trips_killswitch` |
| Runaway action budget | A looping agent acts without bound | `max_calls` is a hard per-passport cap (0 = zero actions) | `test_rt_action_budget_exhaustion_is_contained` |
| Delegation depth bomb | Recursive self-delegation to exhaust resources | `max_depth` strictly decreases each hop — the chain must terminate | `test_rt_delegation_depth_bomb_is_contained` |
| Sub-agent fan-out bomb (*T11 rogue agents*) | A parent spawns unbounded sub-agents | `max_children` hard-caps the sub-agent budget | `test_rt_subagent_fanout_bomb_is_contained` |

### E. Integrity & repudiation — *Agentic T9*

| Threat | Attack | Defense | Test |
|---|---|---|---|
| Passport tampering | Widen `max_calls` / scope after issuance | Signed canonical image — any edit breaks the signature | `test_rt_passport_tamper_breaks_signature` |
| Algorithm downgrade | Rewrite `algorithm` to a weaker scheme | The algorithm field is inside the signed image — the edit breaks the signature | `test_rt_signing_downgrade_is_rejected` |
| Audit-log tampering (repudiation) | Edit the ledger to hide an action | Hash-chained ledger — any retroactive edit is detectable | `test_rt_audit_ledger_tamper_is_detected` |
| Secret leakage to logs | A leased credential lands in the audit log in the clear | Only a **masked handle** is ever logged; the raw value lives in-memory for the lease | `test_rt_raw_secret_never_appears_in_audit_log` |

### F. Multi-agent blast radius — *Anthropic orchestrator→subagents; trust propagation*

| Threat | Attack | Defense | Test |
|---|---|---|---|
| Hijacked sub-agent cascade | An injection hijacks a mid-chain agent in a long-horizon task | The kill-switch reaps **exactly that branch**; agents above and beside it keep working and finish | `test_rt_hijacked_subagent_kills_only_its_branch` |
| Resurrection / race after kill | A killed agent tries to act again | A killed subject is permanently inert — every later call short-circuits to KILL | `test_rt_killed_agent_cannot_be_resurrected` |
| Over-kill of innocents | Killing one agent damages an unrelated same-role sibling | Containment is keyed by subject + chain subtree; distinct siblings are independent | `test_distinct_siblings_are_independently_contained` (core) |

### G. Spec gaming / reward hacking — *gaming the authorization rule itself*

| Threat | Attack | Defense | Test |
|---|---|---|---|
| Glob-boundary loophole | Granted `/ws/*`, the agent targets a look-alike sibling `/ws-evil/...` to satisfy the pattern | The matcher honors path boundaries (a bare `*` doesn't cross `/`) — the loophole is closed end-to-end | `test_rt_glob_boundary_spec_gaming_blocked` |

> **Why "reward hacking" largely doesn't apply here:** there is no learned reward signal
> to game. Authorization is a *deterministic* reference monitor over a capability algebra,
> so the failure mode reduces to "find a loophole in the scope grammar" — which the
> attenuation/intersection tests close. The residual risk is **goal/intent drift** (an
> agent doing only allowed actions toward a bad end), addressed structurally below.

---

## What capability security does *not* solve (honest boundaries)

A passport bounds **what** an agent *can* do; it cannot by itself judge **whether it
should**. These are out of scope for the cryptographic core and need orthogonal controls:

- **Intent / goal drift** — every individual action is in-scope, but the *sequence* serves
  a manipulated goal (Agentic T6). *Mitigation here:* scope **is** the intent envelope —
  the narrower the grant, the less room to drift; the denial tripwire catches probing; the
  ledger gives an auditable trail. Full intent verification needs an out-of-band judge.
- **Memory / context poisoning** (T1) — corrupting an agent's own state/RAG. Out of scope
  for the passport; belongs to the agent runtime. Containment still bounds the blast radius.
- **Misaligned model behavior** (T7) — a model that is itself deceptive. This is a model-
  safety problem (Anthropic RSP / ASL); the passport limits the *damage*, not the *intent*.
- **Human-in-the-loop fatigue/bypass** (T10/T15) — out of scope; would layer on top.

We state these explicitly rather than over-claim. The system's promise is precise:
**least privilege that travels with the agent, complete mediation, and instant, bounded
containment — provable, and proven by the suite above.**

---

## References (verified canonical primary sources)

- OWASP GenAI Security Project — [Agentic AI: Threats and Mitigations, v1.0 (Feb 2025)](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/) — the T1–T15 agentic taxonomy used throughout this doc.
- OWASP GenAI Security Project — [Top 10 for LLM Applications 2025](https://genai.owasp.org/llm-top-10/) (LLM01 Prompt Injection, LLM06 Excessive Agency) · and the newer [Top 10 for Agentic Applications (ASI01–ASI10, Dec 2025)](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/).
- Cloud Security Alliance — [MAESTRO agentic threat-modeling framework (Feb 2025)](https://cloudsecurityalliance.org/blog/2025/02/06/agentic-ai-threat-modeling-framework-maestro) — 7-layer method surfacing goal misalignment & malicious-agent collusion that STRIDE/PASTA miss.
- MITRE — [ATLAS (Adversarial Threat Landscape for AI Systems)](https://atlas.mitre.org/) — real-world adversary tactics/techniques against AI.
- Simon Willison — [The lethal trifecta for AI agents](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) (Jun 2025) — private data + untrusted content + external communication.
- Lee & Tiwari — [Prompt Infection: LLM-to-LLM Prompt Injection within Multi-Agent Systems](https://arxiv.org/abs/2410.07283) (arXiv, Oct 2024) — self-replicating injection drives multi-agent systems to harmful actions **>80% of the time** with GPT-4; the empirical case for branch-bounded containment (see `test_rt_hijacked_subagent_kills_only_its_branch`).
- Anthropic — [How we built our multi-agent research system](https://www.anthropic.com/engineering/built-multi-agent-research-system) · [Responsible Scaling Policy](https://www.anthropic.com/news/anthropics-responsible-scaling-policy) (ASL tiers) · [RSP v3](https://www.anthropic.com/news/responsible-scaling-policy-v3).
- IETF — [RFC 9449: OAuth 2.0 DPoP](https://datatracker.ietf.org/doc/html/rfc9449) (sender-constrained / proof-of-possession tokens — the model for our action proofs) · [RFC 8705: OAuth 2.0 mTLS & certificate-bound tokens](https://datatracker.ietf.org/doc/html/rfc8705).
- NIST — [AI Risk Management Framework (AI RMF 1.0)](https://www.nist.gov/itl/ai-risk-management-framework) · [Generative AI Profile (NIST AI 600-1, Jul 2024)](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf).
