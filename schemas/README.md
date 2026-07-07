# schemas/

Origin's evidence + environment schemas. The **source of truth** lives with the code that emits and validates each artifact:

| Domain | Canonical schemas | Emitted/validated by |
|---|---|---|
| **RL EnvironmentBundle / ScoreReceipt** | `apps/origin-web/docs/schemas/env-bundle.schema.json` (+ the receipt/checkpoint/promotion shapes in `apps/origin-web/rlkit/*`) | `apps/origin-web` `env:verify` / `env:promote` |

This directory is an **index**, not a second copy — edit the schemas in place next to their validators so the gates stay authoritative.
