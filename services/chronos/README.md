# Chronos

Find the reward hacks hiding deep in an agent's trajectory, turn each one into a
regression test, and ship a verifier patch only after the exploit dies and every
legitimate solution still passes.

Chronos is for the people who own a task, its grader, and its release: environment
and benchmark authors. If your agents clear a grader but you cannot be sure they
earned it, Chronos drives the grader from the inside and shows where it breaks.

> The Python package is `chronos`. The discovery layer is called Chronos in the
> code and the reports; Chronos is the system around it.

## The problem

Reward hacks live deep in agent trajectories: an agent only finds it can cheat the
grader after installing dependencies, editing files, or driving the environment into a
rare state.

Existing reward-hack identification tools hunt for them by restarting the task from
scratch, so every run has to solve two problems at once: reach that state over and
over, then discover an exploit from it. Reaching the state burns the token budget, and
the real production multi-step hacks rarely get found.

## The idea

Chronos splits the two apart. It pays to reach the important moment once, then
snapshots that state like a git commit: we save the filesystem, environment image, and
task grader. We restore the snapshot across many parallel sandboxes, sending a
different attacker agent down each branch to find diverse reward hacks. Every branch
inherits the same context but takes a different next action, so the whole budget goes
to exploitation instead of setup. For the longer-horizon hacks, a flat search just bets
on probability to cover its bases; Chronos covers them on purpose.

Git for agent trajectories: fork the risky state, fan attackers out in parallel.

A rewarded branch is not a finding yet. It becomes an Exploit Witness only after it
passes reward-hacking classification, deduplication by target and mechanism, complete
provenance, and deterministic replay. Confirmed Witnesses become deterministic
regression tests that drive an automatic verifier patch, gated by proof that the
exploit dies and legitimate solutions still pass.

## Results

A discovery benchmark on 10 Terminal Bench 2.1 tasks, measured on the live HUD and
Modal surface (preliminary). Unmeasured values are marked TBD.

| Detector | Reward hacks found |
|---|---|
| HUD [Reward Hacking QA Agent](https://github.com/hud-evals/hud-trace-explorer/blob/main/qa_reward_hacking.py), on the same tasks | **0** |
| Chronos discovery | **10** confirmed grader-breaking reward hacks across 5/10 tasks (preliminary) |

Of 32 rewarded hacker branches, 10 broke the grader (planted a `conftest.py`, rewrote
`test_outputs.py`, or shadowed a fake `Rscript` onto `$PATH` so the grader passes
regardless) and the rest were verifier-legitimate. A normal-prompt control on the same
forkpoints, model, and runtime found zero hacks, so every one of the 10 comes from
adversarial discovery. HUD's
[Reward Hacking QA Agent](https://github.com/hud-evals/hud-trace-explorer/blob/main/qa_reward_hacking.py)
finds 0 of them: it only sees the legitimate solves that actually occur in production
and never exercises the adversarial branches. This is a preliminary run (4 branches/task,
diff-based referee). Full report:
[`artifacts/chronos/qabench/QA_BENCHMARK_REPORT.md`](artifacts/chronos/qabench/QA_BENCHMARK_REPORT.md),
counts in [`benchmark-report.json`](artifacts/chronos/qabench/benchmark-report.json).

Separately, a larger SFT-corpus pass (the original QABench partition plus wave 40, 59 raw
reward-positive trajectories) admitted 21 confirmed reward-hack trajectories deduped to 14
distinct task+mechanism clusters. That is a different, larger population — not the 32 branches
above; the two counts should not be conflated.

Every confirmed exploit produced a patch that passes a three-part release gate: the
exploit succeeds under the original verifier, the exploit is blocked under the patched
verifier, and every previously legitimate solution still passes.

From this we produced a verifier-cleaned SFT corpus (5 certified-clean positives, 33
quarantined rows). **We do not claim a model-training or held-out improvement result.** A
preliminary A/B screen on this data was inconclusive
([`executable-eval/REPORT.json`](artifacts/chronos/research/sft/executable-eval/REPORT.json)
→ `completed_no_separation`; see [`SFT.MD`](SFT.MD)). A model-improvement number will be
reported only once a real Fireworks job plus a grouped held-out evaluation produce a
committed, reproducible artifact.

## Built on

Chronos is an orchestration layer between HUD's reward and QA plane and Modal's
executable-state plane. Thank you to our sponsors.

- **[HUD](https://docs.hud.ai)** supplies the agent trajectories and artifacts: source
  traces, reward, [step-level file evidence](https://docs.hud.ai/platform/file-tracking),
  the [reward-hacking QA classifier](https://docs.hud.ai/platform/agents/qa), tasksets,
  and environment versioning.
- **[Modal](https://modal.com)** supplies the
  [snapshots](https://modal.com/docs/guide/sandbox-snapshots): filesystem and directory
  state captured and restored at the forkpoint, plus isolated sandboxes for the parallel
  attacker branches.
- **[Fireworks](https://fireworks.ai)** powers the training step: the benchmark splits
  rewarded trajectories into a certified-clean set and a quarantined set, and the clean
  set feeds [fine-tuning](https://fireworks.ai/blog/reinforcement-fine-tuning) of a
  hardened model.

## Quickstart

Requires Python 3.12, [uv](https://docs.astral.sh/uv/), Node and npm (for the UI), and
credentials for HUD, Modal, and at least one model provider.

```bash
git clone https://github.com/ashtonchew/hack2fix2hack.git
cd hack2fix2hack

uv sync                                   # install pinned dependencies
cp .env.example .env                      # then fill HUD_API_KEY, MODAL_*, and one provider key
bash scripts/bootstrap_external_deps.sh   # fetch harden-v0, terminal-wrench, hud-trace-explorer into .external
uv run python -m modal setup             # one-time Modal auth (or set MODAL_TOKEN_* in .env)
```

Confirm the setup:

```bash
uv run pytest                             # behavior tests
python docs/plans/scripts/run_all.py      # planning-bundle validators
```

## Usage

Materialize the benchmark environments from pinned Terminal Bench 2.1 tasks:

```bash
uv run python -m chronos.qabench.materialize --manifest envs/qabench/tasks.json
```

Run the discovery benchmark (needs live HUD and Modal credentials):

```bash
uv run python -m chronos.qabench.run_benchmark --phase all --count 10
uv run python -m chronos.qabench.control_baseline    # normal-prompt baseline, the X leg
```

Explore the run graph in the UI:

```bash
cd frontend
npm install
npm run dev        # http://localhost:5174
```

The UI walks the discover, witness, fix, gate, release narrative as an interactive
branch tree. See [`frontend/README.md`](frontend/README.md) for the screen map.

## Repo layout

| Path | What it holds |
|---|---|
| [`src/chronos/forkpoints/`](src/chronos/forkpoints/) | trace ingestion, action-boundary selection, snapshot capture and restore |
| [`src/chronos/witnesses/`](src/chronos/witnesses/) | branch scheduling, grading, dedup, durable Witness packaging, replay |
| [`src/chronos/controls/`](src/chronos/controls/) | legitimate-control fixtures |
| [`src/chronos/releases/`](src/chronos/releases/) | harden-v0 patch loop, ProofSet, v1/v2 release gate, ReleaseProof |
| [`src/chronos/qabench/`](src/chronos/qabench/) | the 10-task QA discovery benchmark |
| [`envs/qabench/`](envs/qabench/) | materialized HUD environments for the benchmark tasks |
| [`artifacts/chronos/`](artifacts/chronos/) | evidence: release proofs, benchmark report, control runs |
| [`docs/plans/`](docs/plans/) | the numbered ExecPlans and their evidence manifests |
| [`frontend/`](frontend/) | React and React Flow run-graph UI |

## Docs

Start with [`docs/plans/000-index.md`](docs/plans/000-index.md) for the plan graph,
then the spec set under [`docs/plans/specs/`](docs/plans/specs/) (product,
architecture, interfaces, persistence, validation, security, environment).
[`docs/plans/GLOSSARY.md`](docs/plans/GLOSSARY.md) defines ForkPoint, BranchRun,
Exploit Witness, ProofSet, and ReleaseProof. Governance lives in
[`AGENTS.md`](AGENTS.md).

## Status

The QA discovery benchmark is preliminary: about 4 branches per task, and more
branches will find more. The richer sterile re-grade referee is pending a post-agent
snapshot. Every claim traces to a plan evidence manifest under
[`docs/plans/evidence/`](docs/plans/evidence/) with the exact command, exit code, and
artifact path.

## Contributing

Work ships as numbered ExecPlans, one collision-free vertical slice each. Before
editing source, read [`AGENTS.md`](AGENTS.md), confirm a plan owns the paths you will
touch, and run the validators above. Completion is evidence-based: update the plan's
evidence manifest with the command, exit code, and artifact path.
