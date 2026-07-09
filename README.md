# Origin — the trust + evidence layer for autonomous systems

> **Model proposes. Environment verifies. Gate decides. Trace proves. — Capability is not permission.**

Before you let an agent — or a robot — act on your systems, Origin gives you the receipt that proves
what it was **allowed** to do, what it **actually tried** to do, and that it was **contained** if it
went rogue — issued by a **deterministic oracle** (never an LLM grading an LLM), reproducibly, and
independently verifiable **offline in your browser**.

- **Live showcase:** https://origin-physical-ai.pages.dev · **Verify a credential yourself:** [`/verify`](https://origin-physical-ai.pages.dev/verify.html)
- **Book an evidence review:** the `/` landing page CTA · **60-second demo:** *(recording — storyboard in `docs/`)*

---

## The one insight (this is the whole company)

A deterministic verifier that gates a proposed plan and emits **tamper-evident, signed, reproducible
evidence** is the **same product** whether the actor is a software agent touching an API or a humanoid
robot touching a factory floor. **One evidence spine, two actors.** The environment is the moat, not
the model.

```
① INTENT     humans + agents express what they want            (a task, a site, a tool call)
② CONTROL    propose a plan, then GATE it — identity → scoped grant → fail-closed authorization
   PLANE      · measured intent (declared vs measured vs action)  · taint + blast-radius containment
③ EVIDENCE   tamper-evident: hash-chained trace + ScoreReceipts + ES256 Sigil signatures
   PLANE      · the deterministic oracle is the ONLY label/reward authority
```

A **digital agent action** and a **physical factory plan** earn the *same* signed receipt — paste
either into [`/verify`](https://origin-physical-ai.pages.dev/verify.html) and it re-checks offline:
green means "reproducible under this verifier," tamper any field and it goes VOID.

## Wedge → moat → market

- **Wedge (land):** the shareable **signed Trust Receipt** + **leak-vs-hold** proof + **blocked-injection
  containment** — visceral in 60 seconds.
- **Moat:** the **deterministic verified environment**. Digital = an IAM/agent gym; physical = a
  verifier-gated factory/robot environment. Nobody else has a real, verifier-gated environment for
  *both* — and the environment beats the model.
- **Market:** **certification-as-a-market** — a config-bound "reference check for agents/robots,"
  priced on the **RSL** readiness ladder (L0→L4), re-certified on every config change. A catastrophic
  over-grant hard-caps the level: the right to act cannot be averaged back.

## The verified environment is a flywheel

The environment doesn't just gate — it **improves the actor, and can't lie to itself while doing it**,
because the reward authority is a deterministic oracle the system cannot edit:

- **[Cobra](services/cobra)** is an autoresearch loop that **hardens the verifier** against
  reward-hacking (red-team → seal → measure on held-out ground truth).
- The same discipline drives **verifier-gated recursive self-improvement**: a policy proposes, the
  oracle gates and labels verified traces, a better policy is distilled, and it **only promotes on a
  verifier-scored win** — so it can never regress and can never reward-hack a fake win. Bounded,
  auditable self-improvement. *(The physical factory algorithm that instantiates this is private; only
  its evidence format is public.)*

## Why now

Every enterprise is about to deploy agents (and soon humanoids) that touch money, data, production,
and physical safety. The blocker isn't capability — it's **trust, governance, and liability**, and
there's no standard "the actor earned the right to do X, here's the signed receipt." Origin is that
standard. Per-step verification is what makes it real: verifying *every* action (not sampling around
it) is where reward-hacking and prompt-injection get caught — and at frontier inference speed
(e.g. `gemma-4-31b` on Cerebras, ~1,300 tok/s) that per-step tax is affordable, so the safety check
rides on every step. **The speed is the architecture.**

## Honest by design (the lines we don't cross)

- **The deterministic oracle is the only judge** — never an LLM grading an LLM. We *contain* prompt
  injection; we don't claim to *prevent* it — the destructive action just never executes at the gate.
- Results are **"reproducible under this verifier,"** never "safe" or "correct." Synthetic data is
  labeled synthetic; unmeasured numbers say **projected**. This is machine-enforced — see the
  `honesty-lint` gate below.
- **Prototype in private pilot** — decision-support + evidence infrastructure, not production SaaS and
  not compliance certification. Real-customer readiness stays **blocked by default** until authorized.

---

## What's inside

| Part | Path | What it is |
|---|---|---|
| **Origin Web** | [`apps/origin-web`](apps/origin-web) | The live site + the evidence console, `/security` (run the verifiers in-browser), and public **[`/verify`](apps/origin-web/verify.html)**. |
| **Janus** (formerly Passport) | [`apps/janus`](apps/janus) | The gate: identity → scoped grant → fail-closed authorization, with measured-intent (Tell) + containment (Cordon). |
| **Chronos UI** | [`apps/chronos-ui`](apps/chronos-ui) | Front-end for the reward-hack discovery / verifier-hardening engine. |
| **Cobra / Chronos** | [`services/{cobra,chronos}`](services) | Auto-harden RL verifiers against reward hacking (red-team → patch → measure on held-out ground truth). |
| **Verifier SDK** | [`packages/verifier-core`](packages/verifier-core) + [`packages/evidence`](packages/evidence) | The shared evidence spine: canonical JSON, isomorphic SHA-256, hash-chained ScoreReceipts, ES256 **Sigil** signatures, Merkle batches, config-bound **Crucible** credentials, the IAM gym + RSL ladder. Consumed by the apps *and* by external verifiers. |

## Quickstart

```bash
make install        # npm workspaces (TS) + uv sync per Python service
make gates-all      # ONE green scoreboard: TS build + all TS/Python suites + evidence-verify + honesty
make dev-web        # run the live site locally
make help           # all targets
```

`make gates-all` runs everything — the two TS apps, the evidence + verifier-core suites, the
`services/{cobra,chronos}` Python suites (the deterministic-oracle moat), the evidence-verify scripts,
and the `honesty-lint` overclaim tripwire — with real exit codes and a per-suite scoreboard. CI
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) gates the same surface on every push, plus a
secret scan and dependency audit.

## Where to look

- **The oracle (the only judge):** [`apps/origin-web/src/warehouse.ts`](apps/origin-web/src/warehouse.ts) → `verifyWarehouseRollout` + `bfsOracle`; property-tested in `warehouse.properties.test.ts` and `services/cobra/tests/test_oracle_properties.py`.
- **The evidence spine:** [`packages/evidence/env-evidence.mjs`](packages/evidence/env-evidence.mjs) + [`packages/verifier-core`](packages/verifier-core) (Sigil, Merkle, Crucible, IAM gym).
- **Verify it yourself:** [`/verify`](https://origin-physical-ai.pages.dev/verify.html) — paste any Origin receipt, credential, trace, or Sigil; it re-verifies offline in your browser.

---

*Deploy note: pushing this repo does **not** deploy anything — the live site is a separate,
human-owned Cloudflare Pages cutover. Secrets live only in per-app `.env.local` (gitignored), never
committed.*
