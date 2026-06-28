.PHONY: check fmt lint test install dev demo leaderboard

# Deterministic gate — the same thing the Stop hook and pre-commit run.
check: lint test

lint:
	uv run ruff format --check .
	uv run ruff check .

test:
	uv run pytest -q

fmt:
	uv run ruff format .
	uv run ruff check --fix .

install:
	uv sync
	git config core.hooksPath .githooks

# Run the loop with the event backend + serve the dashboard (filled in at Milestone 4).
dev:
	uv run python -m cobra.server

# Replay the recorded golden run — the stage safety net.
demo:
	uv run python -m cobra.server --replay golden_run.jsonl

# Verifier-safety leaderboard, seeded so it renders immediately → http://localhost:8100/board
leaderboard:
	uv run python -m cobra.server.leaderboard_main --seed --port 8100
