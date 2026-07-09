# ─────────────────────────────────────────────────────────────────────────────
# Origin Physical AI — monorepo front door.
# TS apps: native npm workspaces (apps/*, packages/*).  Python services: per-service uv.
# (pnpm + Turborepo can be layered on later for dedup/caching.)
# ─────────────────────────────────────────────────────────────────────────────
SHELL := /bin/bash
PY_SERVICES := services/cobra services/chronos

.PHONY: help install install-js install-py build test gates gates-all honesty \
        dev-web dev-janus dev-chronos-ui py-sync py-test clean

help: ## list targets
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n",$$1,$$2}'

install: install-js install-py ## install everything (JS workspaces + each Python service)

install-js: ## npm install across all TS workspaces (+ chronos-ui standalone)
	npm install
	cd apps/chronos-ui && npm install

install-py: ## uv sync each Python service (isolated venvs)
	@for s in $(PY_SERVICES); do \
	  if [ -f $$s/pyproject.toml ]; then echo "── uv sync $$s"; (cd $$s && uv sync) || echo "!! $$s sync failed (see docs)"; fi; \
	done

build: ## build all TS apps (origin-web + janus via workspaces; chronos-ui standalone)
	npm run build --workspaces --if-present
	cd apps/chronos-ui && npm run build

test: ## test all TS apps
	npm run test --workspaces --if-present

gates: build test ## build + test the TS surface

gates-all: ## run EVERYTHING (TS + Python + evidence-verify + honesty) → one scoreboard
	bash scripts/gates-all.sh

honesty: ## honesty-lint the served pages (overclaim tripwire)
	node scripts/honesty-lint.mjs

dev-web: ## run the live site (origin-web) locally
	npm run dev -w @origin/origin-web

dev-janus: ## run the Janus demo (vite + Hono + tunnel)
	npm run demo -w @origin/janus

dev-chronos-ui: ## run the Chronos UI (standalone — NOT an npm workspace; see docs/MIGRATION.md)
	cd apps/chronos-ui && npm run dev

py-test: ## pytest each Python service (best-effort)
	@for s in $(PY_SERVICES); do echo "── pytest $$s"; (cd $$s && uv run pytest -q) || echo "!! $$s tests need setup (see docs)"; done

clean: ## remove build output + caches (keeps deps)
	rm -rf apps/*/dist packages/*/dist **/.turbo **/*.tsbuildinfo
