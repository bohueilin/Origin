# schemas/

Origin's evidence + environment schemas. The **source of truth** lives with the code that emits and validates each artifact:

| Domain | Canonical schemas | Emitted/validated by |
|---|---|---|
| **RL EnvironmentBundle / ScoreReceipt** | `apps/origin-web/docs/schemas/env-bundle.schema.json` (+ the receipt/checkpoint/promotion shapes in `apps/origin-web/rlkit/*`) | `apps/origin-web` `env:verify` / `env:promote` |
| **Site-to-Gym / RSI** | `site-to-gym/schemas/` — `rsi_layout.schema.json`, `rsi_graph_tensor.schema.json`, `origin_floor_environment.schema.json` | `site-to-gym` `validate:rsi` / `validate:prefpairs` |
| **Design-partner evidence contract** | `site-to-gym/schemas/` — `customer_evidence_authorization*.json`, `customer_hard_case*.json`, `customer_site_evidence_manifest*.json`, `design_partner_evidence_contract*.json` | `site-to-gym` `validate:design-partner-intake` |

This directory is an **index**, not a second copy — edit the schemas in place next to their validators so the gates stay authoritative. The design-partner intake contract + template live at `site-to-gym/design_partner_intake_template/` and `site-to-gym/schemas/`.
