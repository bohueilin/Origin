# Validation and evidence specification

## Principle

Validation proves behavior through real public seams. Unit tests may isolate pure parsing, hashing, policy, and error handling. They may not stand in for state fidelity, HUD reward, Modal isolation, harden-v0 patching, or publication.

## Validation layers

### Contract tests

Exercise manifest round-trip, required-field rejection, digest stability, promotion predicates, release-gate truth tables, and error taxonomy through public feature APIs. Avoid tests that merely compare a dataclass to itself.

### Integration tests

Use the repository's real HUD and Modal adapters, grader, task fixture, and action serialization. Prove:

- source trace normalization,
- atomic state/history capture,
- restore fidelity,
- branch isolation and unique provenance,
- separate reward/QA signals,
- durable Witness materialization,
- deterministic replay,
- control preservation,
- patch targeting the actual grader.

### End-to-end acceptance

Run one complete MongoDB-task flow on the real system. It is the only honest proof of the core architecture. Record remote trace/snapshot ids, local artifact paths, exact command, exit status, and concise observed behavior.

### Security checks

Run a bounded negative branch that attempts to read an unavailable secret, modify sibling state, or reach disallowed networking according to the actual policy. Success means the attempt is denied and recorded without destabilizing the run.

## Core behavioral scenarios

1. Matching action boundary restores equivalent task-visible state and exact history prefix.
2. Mismatched boundary token or hash fails closed.
3. Twelve branches have unique branch identity and complete provenance.
4. Rewarded + hack + replayable branch becomes a Witness.
5. Rewarded + non-hack branch does not become a Witness.
6. Hack verdict without reward does not become a Witness.
7. Missing provenance or replay divergence blocks Witness promotion.
8. Three legitimate controls pass v1 repeatedly.
9. Witness replay passes on v1 and fails on v2.
10. Every control passes on v2.
11. A single surviving Witness rejects the release.
12. A single broken control rejects the release.
13. The demo report links all 13 operator steps.
14. Prior-run fallback is clearly labelled and replays live.

## Determinism

Discovery is intentionally nondeterministic. Tests assert the configured diversity controls and provenance, not exact branch text. Proof is deterministic: fixed artifact, state, environment image, grader, and recorded actions must produce the same semantic result. Run the selected Witness replay at least three consecutive times before promotion.

## Real fixtures

The MongoDB sales aggregation task, source trace, grader, and legitimate controls must be real. Sanitized copies or immutable references are acceptable when licensing or size prevents direct inclusion. Synthetic fixtures may test corrupt-manifest and failure paths only.

## Evidence manifest rules

A complete per-plan manifest contains:

- `status: complete`,
- exact command invocations,
- exit code and concise output,
- checks with explicit pass/fail and observations,
- artifact/trace/snapshot links,
- commit id when available,
- residual risks and skips,
- timestamps.

A command that was not run is not listed as passed. Remote evidence must include a stable id or exported artifact, not only a screenshot.

## Merge validation

At every merge gate run:

    python docs/plans/scripts/validate_graph.py
    python docs/plans/scripts/validate_sections.py
    python docs/plans/scripts/validate_ownership.py
    python docs/plans/scripts/validate_traceability.py
    python docs/plans/scripts/validate_evidence.py --plan <NNN> --require-complete

After Wave 1 also run:

    python docs/plans/scripts/validate_ownership.py --repo-bound

Repository commands are invoked by name through `run_mapped.py`; the accepted repo map contains the actual argv and working directory.

## File-size and test-quality review

Before marking complete:

- identify generated/changed code files over 500 lines,
- split along a real seam or record an explicit approved exception,
- inspect tests for internal mocks, private-method assertions, snapshot-only change detection, and tautological schema checks,
- include at least one behavior that fails before the change and passes after it.

## Open questions

- What is the fastest real-system test that still exercises HUD × Modal state fidelity?
- Can remote trace/snapshot evidence be exported into CI artifacts?
- Which failures can run in CI and which require an authorized manual environment?
- What semantic equivalence check best proves restored MongoDB-task state?
- Is three replay repetitions sufficient for the demo, or does the repository already use a stronger standard?
