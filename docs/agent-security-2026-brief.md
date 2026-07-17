# Agent Security in 2026 — Origin / Passport Reference Brief

**For:** Origin design thinking + positioning + hiring/interview prep.
**As of:** July 2026. **Source:** a multi-angle web sweep + the internal `guardian-agent-foundations` knowledge base
(Virtue AI research corpus, 1Password agent-identity brief). Findings carry confidence tags; URLs in the skill's
reference files.

> **One sentence:** In 2026 the industry converged on a single conclusion — *you cannot make an AI agent safe by
> making the model refuse; you make it safe by bounding what it can do, proving who authorized each action, and
> recording an audit you can replay* — which is exactly the layer **Origin** (autonomy trace + readiness gate) and
> **Passport** (credential broker + delegated identity) build.

---

## 1. The thesis (why this whole space exists)

Traditional software is **stateless, deterministic, bounded**. Agentic systems are **stateful, probabilistic,
unbounded.** The risk moved from *what a model says* to *what an agent does* — its tool calls, its decision chain,
its delegated authority. Two consequences drive every design decision:

- **Alignment is shallow.** Model refusals collapse at depth (long harmful continuations), on expert knowledge,
  under semantic rewrites, and after fine-tuning. So safety must be an **external, runtime, policy-grounded layer** —
  not a property you hope the model has.
- **Capability is not permission.** A capable agent holding standing, over-scoped credentials will eventually do
  something wrong, and the blast radius is whatever those credentials could reach. So the job is **least authority,
  proven at runtime, attributable after the fact.**

Formalized in 2026 as **"intent-to-execution integrity"** (Dawn Song group, arXiv 2605.16976): agent security is an
end-to-end correctness property — preserve the user's intent from natural language through to execution, the way a
compiler preserves semantics.

---

## 2. What actually happened in 2026 (the facts that change strategy)

**The prompt-injection debate is settled.** *"The Attacker Moves Second"* (arXiv 2510.09023, OpenAI+Anthropic+GDM):
12 published defenses that reported ~0% vulnerability were bypassed **>90%** by adaptive attackers. **Detection at the
model layer loses.** What *holds* (so far): **deterministic, out-of-band enforcement** — CaMeL (arXiv 2503.18813),
and the Progent/RTBAS/FIDES/FORGE family (adaptive eval arXiv 2606.26479 cut attack success 25.8% → 4.2%, and a
defense-aware attack reached only 2.6%). **Takeaway for Origin: the deterministic policy gate is the guarantee; any
classifier is telemetry.**

**The labs now build containment themselves — but only isolation, on their own platforms.** Anthropic's May 2026
"How We Contain Claude" uses gVisor containers, OS sandboxing, and hypervisor VMs, and concluded *"the weakest layer
is the one you built yourself"* (their custom proxy failed; the OS/VM primitives held). OpenAI ships AgentKit
Guardrails (Zenity found bypasses); Google ships Model Armor + a layered Gemini defense. **The wedge they leave open:
cross-platform policy, delegation identity, and portable, independent audit.** That is precisely Origin + Passport —
not model isolation (commodity, lab-owned), but *provable authority + provable attribution across platforms*.

**The threats became real incidents.** GTG-1002 (Nov 2025) — Claude Code ran **80–90%** of a real nation-state
espionage op (MITRE C0062). ClawHavoc (Feb 2026) — **341 malicious skills (11.9%)** in one agent marketplace.
Systemic MCP **RCE "by design"** across official SDKs (7,000+ exposed servers). Browser agents (Atlas, Comet, Claude
extension) exfiltrating GitHub secrets via indirect injection. ~**65%** of orgs report an agent security incident in
2026.

**The standards hardened into canon** (map Origin/Passport to these by name):
- **OWASP Agentic Top 10 (ASI01–ASI10)** — esp. **ASI03 Agent Identity & Privilege Abuse** (Passport), **ASI06 Memory
  & Context Poisoning**, **ASI10 Rogue Agents** (Origin trace).
- **OWASP MCP Top 10** + **Agentic Skills Top 10** — tool/plugin supply chain.
- **NIST CAISI Agent Standards Initiative** (Feb 2026; its red-team hit **81%** task-hijack vs 11% baseline); **NSA
  MCP** guidance ("log all tool + model invocations," "sign/verify messages" = the autonomy trace).
- **EU Digital Omnibus** deferred AI Act high-risk duties **Aug 2026 → Dec 2027** — less near-term compliance
  urgency, longer runway to *become* the reference audit tooling.

**The agent-identity market caught up (huge for Passport).** 1Password shipped **Credential Broker** (beta Jun 2026)
+ acquired **Apono** (JIT/intent-based access, revoke-on-drift) + an **Agent Identity Kit** (SPIFFE URIs, RFC 8693
token exchange, DPoP). Okta **Cross App Access / ID-JAG** became an official MCP authz extension; Microsoft **Entra
Agent ID** GA; WorkOS **auth.md**; Aembit "Blended Identity"; Teleport X.509-for-agents. **The commodity layers now
exist** (issue a scoped short-lived token, workload identity, sender-constrained tokens).

**Provenance note:** the Virtue AI founders (Bo Li, Dawn Song, Sanmi Koyejo) were hired by **Meta Superintelligence
Labs (Jun 2026)**; Virtue AI continues under a GTM-led CEO. The worldview is now largely *inside Meta* — attribute
the thesis to the research, treat Virtue AI as one vendor.

---

## 3. Where Origin + Passport fit (and where to build next)

The reference safety loop the field points at, mapped to what we already ship:

| Layer | Field consensus (2026) | Origin / Passport today | Build next |
|---|---|---|---|
| **Discover** | Inventory every agent/tool without allowlists (Shadow AI, OWASP) | Autonomy trace foundation | Emit/ingest **OTel GenAI spans** (the de-facto standard) |
| **Pre-action gate** | Gate the **effect**, not the string; deterministic policy is the guarantee | Fail-closed `ToolRouter`, readiness oracle | Effect/sandbox dry-run for physical actuation |
| **Least-privilege credential** | ZSP + JIT + attestation; broker returns a handle, not the secret | Credential broker (never-seen handle), grant TTL/scope | True **attestation** (WIF/OIDC) vs *declared* identity |
| **Lethal trifecta / Rule of Two** | ≤2 of {private data, untrusted content, external comms} | **Already implemented** as the Rule-of-Two gate | Per-resource scoping tiers |
| **Human step-up** | CIBA / AuthZEN AARP; approval fatigue is a "clickthrough vuln" | **Passkey / Touch-ID step-up** before new authority | Bind the approval artifact **into the token chain** (open standard gap) |
| **Trajectory audit** | Reason over the whole chain; bind identity to action | **SHA-256 hash-chained** per-action audit + delegating human | Publish as a **tamper-evident audit format** (no standard exists yet) |
| **Continuous red-team** | Adaptive, defense-aware, effect-based judge | FactoryDad-style deterministic readiness eval | Adversarially audit the *readiness score itself* (BenchJack risk) |

**The four open problems worth owning** — each confirmed by the sweep as *explicitly unsolved in 2026*, and each
something Origin/Passport is already adjacent to:

1. **Human step-up bound into the delegation token.** CIBA/AARP deliver the approval; **no standard attaches that
   approval to the downstream token.** Our approval packet + hash-chain + passkey step-up can be that bind.
2. **Attenuated N-hop sub-delegation with attribution to the original human.** Everyone points at Biscuit/macaroons/
   IBCTs; nobody shipped the auditable chain. The identity brief's "least-solved problem," still open.
3. **Intent-conformance monitoring / revoke-on-drift.** Apono claims it ("depth unproven"). Our `IntentParser` +
   trajectory audit is the natural home — watch tool calls vs declared purpose, revoke on divergence.
4. **Tamper-evident, portable audit.** No signed agent audit-log standard exists. Candidate reference format:
   **OTel GenAI spans + signed hash chain + delegation-token references.**

**Positioning line for the deck:** *"The model labs are solving isolation on their own platforms. Origin and
Passport solve the layer they can't own — provable authority and provable attribution, across every platform, for
robots and software agents alike. Capability is arriving; permission is the defensible, unsolved problem."*

---

## 4. Interview talking points (agent security)

Full version in the skill's `interview-agent-security.md`. The essentials:

**Five moves that read as senior:** (1) lead with **blast radius**, not framework recitation; (2) **deterministic
layer is the guarantee, classifiers are telemetry**; (3) red-teaming is **adaptive & defense-aware** (name
AgentDojo); (4) **identity/permissions = the top real-world failure class** (ASI03); (5) hold **calibrated
positions**, not absolutes.

**The four debates — my position:**
1. *Can prompt injection be solved?* **No, not by model-layer detection** (2510.09023). Design assuming compromise;
   contain blast radius.
2. *Guardrail model vs deterministic policy?* **Deterministic out-of-band is the floor** (CaMeL; Progent 4.2%→2.6%
   under adaptive attack); classifiers are signal. Defense in depth.
3. *Human-in-the-loop?* **A layer whose failure mode (fatigue) must be threat-modeled** — Anthropic saw ~93% approval
   rates. Risk-tier escalation; make approvals informative (show the action, not "Allow?").
4. *Agent identity vs user identity?* **Every agent action is delegated user access** — OAuth OBO / token exchange
   (RFC 8693), DPoP, never shared service accounts or token impersonation (both break attribution).

**Numbers to have ready:** AgentDojo 73.2% → ~8.7% layered; adaptive attacks beat 12/12 detection defenses >90%;
CAISI 81% task-hijack; Anthropic ~93% approval + cred-exfil 24/25 vs model defenses; machine identities 45:1–80:1 vs
human, secrets live >600 days; guardian agents 10–15% of agentic-AI by 2030.

**One-liners:** *"Capability is not permission." · "The risk moved from what a model says to what an agent does." ·
"Assume the agent is already compromised; bound the hijack." · "Alignment is shallow, so the guardrail must be
external." · "The weakest layer is the one you built yourself." · "Who answers when the agent acts?"*

**Portfolio proof (the closer):** *"I didn't just study this — I built the reference architecture: a credential
broker that hands agents a brokered handle and never the secret; a Rule-of-Two gate; a passkey/Touch-ID step-up
before new authority; and a SHA-256 hash-chained autonomy trace that binds every action to a runtime identity and
the delegating human — which is the tamper-evident agent audit log the field has no standard for yet. The open
problems I'm building toward — attenuated N-hop delegation, intent-conformance revoke-on-drift, server-verified
attestation — are the field's open problems too."*

---

## 5. Reading list (highest-signal, 2026)

- **Framing:** Intent-to-Execution Integrity (arXiv 2605.16976); Any-Depth Alignment (2510.18081, "alignment is
  shallow").
- **PI debate:** The Attacker Moves Second (2510.09023); CaMeL (2503.18813); out-of-band adaptive eval (2606.26479);
  PromptArmor (2507.15219).
- **Real-world:** resume-injection prevalence (2605.28999); GTG-1002 (Anthropic disclosure); ClawHavoc; Anthropic
  "How We Contain Claude" (May 2026).
- **Multi-agent:** MASTRIKE (2606.12918, Shapley collusion); Peer-Preservation (2604.19784, agents protect peers vs
  shutdown).
- **Identity:** 1Password Credential Broker + Apono (Jun 2026); Okta XAA/ID-JAG; AIP (2603.24775); the internal
  `agent-identity.md` §7 for the full market map.
- **Standards:** OWASP Agentic/MCP/Skills Top 10 (2026); NIST CAISI; NSA MCP guidance; OTel GenAI conventions.

*Deeper, denser versions of everything here live in the `guardian-agent-foundations` skill: `worldview.md`,
`landscape-2026.md`, `agent-identity.md`, `papers.md`, `interview-agent-security.md`, `architecture-patterns.md`.*
