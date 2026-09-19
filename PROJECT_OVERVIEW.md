# Origin — Project Overview

Origin is a public trust layer, evidence format, and set of working prototypes for AI evidence
review. The canonical website is [originphysicalai.com](https://originphysicalai.com); the public
source is [bohueilin/Origin](https://github.com/bohueilin/Origin).

> Model proposes. Environment executes. Verifier evaluates. Gate decides. Trace proves.
> Capability is not permission.

## What is implemented publicly

1. **Browser reference check and artifact verification** (`apps/origin-web`): deterministic
   synthetic support/IAM policy evaluation, configuration-bound demo evidence, offline checks,
   and tamper/configuration-drift demonstrations. The check does not execute the named agent.
   Browser-session signatures are unpinned and untrusted by default.
2. **Evidence primitives** (`packages/evidence`, `packages/verifier-core`): canonical serialization,
   hashes, trace chains, receipts, signatures, credentials, and deterministic verification.
3. **Bounded Physical AI demonstrations** (`apps/origin-web`): robot, warehouse, fleet, and spatial
   simulations. Public Foundry uses a browser-local sample; provider processing belongs to a
   separately enabled local/backend workflow with explicit consent.
4. **Authority prototypes** (`apps/janus`): credential-broker and autonomy-trace components for
   scoped authority and fail-closed authorization.
5. **Verifier-hardening tools** (`services/cobra`, `services/chronos`, `apps/chronos-ui`): research
   and test workflows for reward-hack discovery, patching, and held-out evaluation.

The proposed runtime gate/proxy and hosted verification API are design artifacts, not generally
deployed public capabilities. Origin issues evidence; a customer's gate and risk owner retain
release authority. The project is seeking design partners; no active customer pilot is claimed.

## Who the prototypes serve

- Agent-platform, security, and infrastructure reviewers evaluating consequential workflows.
- ML and evaluation teams checking reproducibility and verifier failure modes.
- Physical AI teams exploring which evidence a bounded simulation can support, and which
  decisions still require higher-fidelity or real-world validation.

## Evidence and claim boundaries

Only the deterministic oracle supplies labels and verdicts. Synthetic demos, generated
counterfactuals, authorized fixtures, and customer-owned proof remain distinct evidence lanes.
Artifact integrity is separate from trusted issuance, execution success, and permission to deploy.

Simulation evidence is not robot certification or production-autonomy validation. Learned-policy
examples use route-summary/map-derived features rather than raw end-to-end perception. The
published research snapshot includes private-pipeline metrics that cannot be re-derived from this
public repository. Proprietary algorithm implementation and internal strategy remain outside it.

## Run and inspect

See [`README.md`](README.md) for the public demo entry points and web quickstart,
[`REPO_STRUCTURE.md`](REPO_STRUCTURE.md) for the tree, and `make help` for monorepo targets.
Production releases follow [`docs/DEPLOY.md`](docs/DEPLOY.md) and remain separately human-gated.
