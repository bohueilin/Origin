# Grounding record

## Project source

The supplied `hack2fix2hack-handoff (3).html` is the project source of truth. The bundle carries forward its product objects, HUD × Modal responsibility split, eight engineering seams, 24-hour must-ship contract, demo contract, risks, metrics, and research stretch. No repository was available while authoring this bundle.

## Document-shape sources

The plan shape borrows only document discipline from Matt Pocock's `mattpocock/skills` repository:

- `writing-great-skills/SKILL.md`: a routable description, information hierarchy, co-location, progressive disclosure, pruning, and leading words.
- `writing-great-skills/GLOSSARY.md`: precise vocabulary for progressive disclosure and completion criteria.
- `engineering/tdd/SKILL.md`: behavior-level tests and vertical slices.
- `engineering/diagnosing-bugs/SKILL.md`: tight pass/fail feedback loops and explicit completion criteria.
- `productivity/handoff/SKILL.md`: compact handoff content that references durable artifacts rather than duplicating them.

The bundle deliberately omits skill invocation tiers, registry/install behavior, and skill-runtime metadata. Plans are assigned through `000-index.md`, not discovered from a skill registry.

## Codex execution sources

Only official OpenAI Codex documentation informed executor mechanics:

- Best practices: prompts should identify Goal, Context, Constraints, and Done when.
- `Using PLANS.md for multi-hour problem solving`: ExecPlans are self-contained living documents with observable outcomes, validation, recovery, and decision logs.
- Goal mode documentation: a goal is a persistent measurable objective; `/goal` text is both starting prompt and completion criterion.
- CLI slash-command documentation: a `/goal` objective is limited to 4,000 characters, so each executor prompt points at its plan file.
- `AGENTS.md` guide: project guidance is loaded before work and should carry durable repository expectations.

## Repository-grounding rule

The proposed implementation globs are deliberate new feature boundaries, not assertions that the unseen repository already has those paths. Wave 1 must either accept those paths as repository-native additions or bind each one to a real equivalent before implementation. Exact APIs, commands, integrations, and persistence choices remain unverified until then.

## Material that would sharpen a later pass

Paste or expose these repository files first:

1. The top-level tree to depth three and root project configuration (`pyproject.toml`, lockfile, Makefile/task runner, CI workflow).
2. The HUD environment/task adapter and trace/file-tracking integration.
3. The Modal sandbox/runtime wrapper and any snapshot helpers.
4. The grader/verifier implementation and environment-version publishing code.
5. The harden-v0 integration entrypoint, replay path, hack deduplication, and legitimate-solution handling.
6. Existing domain models, serialization/persistence code, and artifact layout.
7. Current unit/integration/e2e test commands and one representative test per level.
8. Secrets/network sandbox policy and deployment configuration.
9. The source trace or export used for the MongoDB task and the task fixture itself.
