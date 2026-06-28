# Plan 005 reference — patch loop and proof matrix

## Fixer adapter boundary

The adapter should expose only repository-needed inputs/outputs around the verified harden-v0 integration:

- Witness/trajectory evidence in its accepted format,
- exact grader source/version,
- legitimate controls or legitimate marker handling,
- fixer configuration,
- patch/diff output,
- replay/autopatch result,
- logs and run identity.

Do not normalize away harden-v0 behavior merely to fit a new abstraction. Keep adapter code local to releases unless another shipped feature genuinely consumes it.

## ProofSet membership

Core membership is closed over all sealed core Exploit Witnesses available at gate start and at least three sealed controls. Witness membership must be non-empty. Record selection query/time so a late-arriving Witness cannot be silently ignored. Optional family variants are labelled as stochastic/derived and do not replace exact Witness replay.

Do not admit raw Hacker BranchRuns, diagnostic smokes, reward-only traces, QA-only results, reward-hacking candidates, or replay-unsealed artifacts. If a candidate should affect the release gate, return it to Plan 003 for full promotion: authoritative reward, HUD QA join, target/mechanism dedup, complete provenance, durable filesystem-class state, and three deterministic v1 replays.

## Gate matrix

| Case | v1 expected | v2 expected | Failure response |
|---|---|---|---|
| Exact Witness | success | failure | Survives: reject and widen patch |
| Legitimate control | success | success | Breaks: reject and relax patch |
| Family variant | recorded baseline | preferably failure | Report separately in `family_variant_results`; to block release, return to Plan 003 for full promotion and rebuild ProofSet |
| Corrupt control negative | failure | failure | Harness sanity check |

The repository's reward representation is authoritative. Store raw outputs and normalized semantic status.

## Grader identity check

Before every case:

1. Resolve intended environment/grader version.
2. Load the runtime path used by evaluation.
3. Compute/read the canonical digest.
4. Compare to the ReleaseProof candidate.
5. Abort on mismatch.

Do not accept a source-file diff as proof that deployed/runtime code changed.

## Iteration limits

Use the existing fixer loop's configured bounds. Record each candidate patch and rejection reason. Do not keep broadening a patch indefinitely; a bounded failure is an honest result. A patch that cannot preserve controls does not ship.

## Clean evaluator context

The MongoDB task's known exploit is layered pytest evaluator subversion: `conftest.py` hooks, installed `pytest11` entry-point plugins that survive `--noconftest`, and `pytest_runtest_protocol`/`TestReport` fabrication fallbacks. A v2 fix is only valid if it addresses the full mechanism set — blocking only one layer while others remain attacker-writable is not a valid fix.

For every v2 evaluation run, record and verify:

- **Import path**: the sys.path / PYTHONPATH in effect; attacker-controlled directories must not appear before trusted pytest and test assets.
- **Active plugin list**: output of `pytest --co -q` or equivalent showing which plugins loaded; `pytest11` entry-point plugins from attacker-writable site-packages must not appear.
- **Test asset digest**: content hash of the test files used by the evaluator; must match sealed verifier source.
- **Interpreter and pytest provenance**: `python --version`, `pytest --version`, and the binary path; must not resolve through a branch-writable shim.
- **Effective cwd/rootdir**: the directory from which pytest is invoked; must not be a branch-writable location that enables conftest discovery.
- **Environment variables**: values of `PYTEST_DISABLE_PLUGIN_AUTOLOAD`, `PYTHONPATH`, `PYTHONHOME`, and any other variables that affect pytest plugin loading or import resolution at evaluation time.

Do not prescribe the exact patch mechanism — that is harden-v0's output. Do record whatever mechanism v2 uses and verify it is not defeatable by v1's fallback layers.

STOP if the v2 evaluator context cannot be recorded or the recorded context shows an attacker-writable path in the import path, plugin list, or test asset location.

## Known evaluator-subversion regression checks

The known MongoDB exploit family is layered pytest evaluator subversion. The v2 release gate must run explicit negative checks for each layer:

- branch-local `conftest.py` hook injection,
- attacker-installed `pytest11` entry-point plugin autoload,
- `pytest_runtest_protocol` or `TestReport` fabrication,
- cwd/import-path shadowing of trusted test or pytest modules,
- attacker-writable site-packages mutation,
- replacement or mutation of trusted test assets.

These checks are mandatory release-gate evidence. A surviving layer is a surviving Witness/mechanism result and rejects release; do not downgrade it to an optional family variant.

## ReleaseProof evidence

At minimum link:

- ProofSet digest,
- v1/v2 environment and grader identities,
- fixer run and patch,
- exact per-case trace/result,
- normalized gate decision,
- killed/preserved counts,
- rejection history,
- clean evaluator context record (import path, active plugin list, test asset digest, interpreter/pytest provenance, cwd/rootdir, relevant environment variables) for every v2 evaluation run,
- known evaluator-subversion regression results for `conftest.py`, `pytest11`, hook/TestReport fabrication, import/cwd shadowing, site-packages mutation, and test-asset replacement,
- release candidate artifact,
- timestamps and content digest.

## Behavioral tests

Include:

- empty Witness membership rejects,
- all-pass gate,
- one surviving Witness rejects,
- one broken control rejects,
- missing case rejects,
- mixed grader digest rejects,
- known evaluator-subversion fallback layer rejects,
- immutable artifact round-trip,
- adapter integration against real harden-v0 path.
