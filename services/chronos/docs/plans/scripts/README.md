# Plan validators

All scripts use Python 3 standard library only.

- `run_all.py` — planning-bundle gate; writes `../VALIDATION-RESULTS.json`.
- `validate_graph.py` — plan names, dependencies, waves, and cycles.
- `validate_sections.py` — frontmatter, required sections, work-packet checks, goal blocks, and sibling references.
- `validate_ownership.py` — same-wave ownership collisions; add `--repo-bound` after Wave 1.
- `validate_traceability.py` — every normalized handoff requirement maps to a known plan.
- `validate_evidence.py` — evidence manifest presence/shape; add `--plan N --require-complete` at plan completion.
- `validate_file_sizes.py` — 500-line target for bundle or one plan's owned paths.
- `run_mapped.py NAME` — executes the exact argv/cwd recorded by Wave 1.

Run from repository root:

    python docs/plans/scripts/run_all.py
