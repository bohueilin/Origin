# GOAL — Autonomy License Gym (shared, fixed)

This file is the contract that ends the loop. The loop runs until every box in
**Definition of Done** is checked AND the gates are green.

## Mission
Turn the Autonomy Trace Console into a production-quality **RL evaluation
environment** — the **Autonomy License Gym** — where an AI agent must EARN
autonomy before it exercises it. Target: Y-Combinator demo-day quality (deployable,
live, with a tight ≤3-minute demo).

## Core thesis (do not violate)
The **model proposes**, the **environment verifies** (deterministic verifier is the
single source of truth), the **license gate decides**, and **InsForge preserves
tamper-evident evidence**. Determinism of the verifier and license is sacred.

## Current state (verify against `git log`, don't trust this line)
Standalone Hono gym server exists (`server/main.ts`, `npm run server`) with a
`/v1` reset/step env contract and signed episode tokens; legacy `/api/*` path +
Vite middleware still powers the React UI. Live Nebius + InsForge + Vapi proven.
Two evidence paths coexist (mock|nebius legacy vs external gym). 9 hand-seeded
scenarios. No test framework or CI. InsForge table is service-key-only (no RLS).

## Definition of Done (the only stop condition)
- [ ] **Single backend:** the standalone server is the ONLY backend. Vite
      middleware plugins removed; the React app reaches `/api` + `/v1` through a
      proxy to the standalone server.
- [ ] **Gym is canonical:** `/v1` reset/step is the primary path. Mock and Nebius
      are **reference agents that call the env**, not policies baked into the server.
- [ ] **One evidence schema:** unify the legacy (mock|nebius) and gym (external)
      rows. No module-global mutable state in the request path; per-run state is
      DB-backed (or an explicit, documented dev fallback).
- [ ] **Scenario scale:** ≥ 24 scenarios across the 3 domains, with difficulty
      tiers and a **held-out test split**; documented. Generalization is measurable.
- [ ] **Tests:** vitest unit tests for verifier, license, digest, episode token,
      and gym reset/step; the evidence checks preserved. All green.
- [ ] **CI:** GitHub Actions runs typecheck + lint + tests on every PR.
- [ ] **InsForge hardening:** schema via migrations + Row-Level Security (not
      service-key-only); documented in README.
- [ ] **Deployability:** documented deploy (Dockerfile or host config), `/health`,
      env validation that fails loud in prod; a server build/start path.
- [ ] **Live proof:** a scripted smoke proves a live Nebius decision, InsForge
      persist + read-back + digest-valid, and a Vapi operator call.
- [ ] **Demo + docs:** an accurate README and a ≤3-minute demo script; the UI tells
      the story end-to-end.
- [ ] **Gates green:** `npm run build`, `npm run lint`, `npm run verify:evidence`,
      and `npm test` all pass.

## Constraints / non-goals
- Keep the verifier and license semantics deterministic and unchanged unless a
  fix is justified and tested.
- Secrets stay in `.env.local` (gitignored); never commit keys; never expose them
  to the client bundle.
- No full auth system, no real payments, no full RL *training* loop (this is the
  *environment*, not the trainer), no scenario generation by LLM in the hot path.
- Small, reviewable diffs per round. No scope creep beyond the current `design.md`.

## Stop
When all boxes above are checked and gates are green, the design step outputs
`STATUS: SHIPPABLE` on its first line and the loop ends.
