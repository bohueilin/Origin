# CONNECT — Chronos core ↔ SFT/RFT integration

**Purpose:** Define the implemented boundary between sealed Chronos evidence, canonical SFT exports, managed-RFT launch-readiness data, and optional Fireworks jobs.

**Status (2026-06-21):** Plans 003, 004, and 005 are complete. A sealed passing ReleaseProof exists. Plan 007 has a strict Plan 005-joined SFT/RFT analysis path, a separate sterile-referee Model A preparation path, and a non-registering sealed-v2 RFT evaluator binding. The `sft` branch also has a preliminary QABench/SFT corpus using post-agent snapshots plus sterile `clean_verify`: 59 raw reward-positive trajectories, 21 confirmed reward-hack trajectories, 14 deduped confirmed reward-hack clusters, 5 certified SFT-clean positives, and 33 quarantined rows. No Fireworks upload, SFT job, managed RFT job, or held-out model result is claimed.

**Sources of truth:** repository code and artifacts; `docs/plans/evidence/{003,004,005,007,008}/MANIFEST.json`; `docs/plans/007-depth-two-and-research-extensions.md`; `docs/plans/specs/03-interfaces.md`; `docs/plans/GLOSSARY.md`; and `SFT.MD`. `HUDDOC.MD` describes a separate direct Training API preview and is not evidence that Chronos SFT or managed RFT ran.

---

## 1. Current connection states

| State | Meaning | Current status |
|---|---|---|
| **Core proof available** | Sealed Witnesses, controls, ProofSet, v1/v2 results, and ReleaseProof are available. | PASS: Plans 003–005 are complete. |
| **Canonical consumers implemented** | SFT and RFT read completed manifests, verify artifact digests, join qabench rows to ReleaseProof, and fail closed. | PASS: implementation and behavioral tests exist. |
| **Model A preparation implemented** | SFT-only intake trusts a completed Plan 008 sterile referee without pretending every row belongs to Plan 005's four-case ProofSet. | PASS: preliminary/non-sterile reports fail closed; upload/training remain `not_run`. |
| **Sealed v2 evaluator bound** | Launch preparation pins the real Plan 005 v2 identities and audits the evaluator trust boundary. | PASS: 1 Witness rejection, 3 control retentions, and 6 blocked subversion probes verified; registration remains `not_run`. |
| **Plan 008 data available** | A completed Plan 008 manifest lists an exact qabench report and digest. | PARTIAL/BRANCH: original QABench partition plus wave40 artifacts exist; Plan 008 manifest is still not complete. |
| **Canonical SFT data generated** | Real qabench rows are normalized, quarantined, filtered, and exported. | BRANCH RESULT: `docs/plans/evidence/007/SFT-WAVE40.md` records 59 raw positives, 21 confirmed hacks, 14 deduped confirmed hack clusters, 5 SFT-clean, and 33 quarantined. |
| **Canonical RFT prompts generated** | Real qabench prompts are joined to ReleaseProof and split into raw/hardened/audit/quarantine artifacts. | NOT RUN: awaits Plan 008. |
| **SFT launch-ready** | Provider support, LoRA mode/rank, tokenization, dataset registration, cost/time, request, and held-out split are verified. | NOT READY: placeholders remain `TBD`/`not_run`. |
| **RFT launch-ready** | Provider support, evaluator and dataset registration, environment, grouped calibration, request, and held-out eval are verified. | NOT READY: placeholders remain `TBD`/`not_run`. |
| **Measured model result** | A real job and frozen held-out evaluation support a scoped claim. | NOT RUN. |

The mock JSONL pipeline remains useful for development but cannot satisfy any canonical or measured state above.

---

## 2. Upstream prerequisites

### Completed prerequisites

| Owner | Delivered evidence | Status |
|---|---|---|
| Plan 003 | Sealed Witness evidence, provenance, deduplication, durable replay package, and deterministic replay. | COMPLETE |
| Plan 004 | Sealed legitimate controls and baseline evidence. | COMPLETE |
| Plan 005 | Sealed ProofSet and passing ReleaseProof with exact Witness/control membership, v1/v2 results, evaluator identities, and content digest. | COMPLETE |

The canonical code consumes Plan 005 directly. Plans 003 and 004 are represented transitively through the sealed ProofSet and ReleaseProof case membership.

### Remaining upstream prerequisite: Plan 008

Plan 008 must provide:

- `docs/plans/evidence/008/MANIFEST.json` with `plan_id="008"` and `status="complete"`;
- a qabench report listed in that manifest with a matching SHA-256 digest;
- a top-level `trajectories` array;
- per-row trajectory id, task id, binary HUD/v1 reward, and sterile-referee verdict;
- task prompt for SFT/RFT eligibility;
- faithful assistant output for SFT eligibility;
- structured `sterile_referee` identity with `kind="sterile_clean_verify"`, a manifest-listed artifact path and matching SHA-256, verified isolation, and `agent_writable=false`;
- passed referee-validation evidence;
- environment version, v1 grader digest, and source trace id for every SFT candidate;
- ProofSet case id for the strict Plan 005-joined analysis and RFT paths;
- cluster id and branch divergence lineage for every confirmed hack;
- HUD QA verdict when available.

The canonical parser accepts these source aliases:

| Canonical value | Accepted source fields |
|---|---|
| trajectory id | `trajectory_id`, `id`, `trace_id` |
| task prompt | `task_prompt`, `prompt`, `instruction` |
| assistant output | `assistant_output`, `final_response`, `response` |
| ProofSet case id | `proofset_case_id`, `case_id` |
| reward | `hud_reward`, `reward`, `v1_reward` |
| cluster | `cluster_id`, `exploit_cluster` |
| lineage | `branch_divergence_lineage`, `divergence_lineage`, `lineage` |
| environment | `environment_version`, `environment_v1` |
| v1 grader digest | `grader_digest`, `grader_v1_digest` |
| source trace id | `source_trace_id`, `parent_trace_id`, `hud_trace_id` |

Supported origins are `base`, `recorded`, `branch`, and `control`. Referee verdicts normalize to `confirmed_hack`, `legitimate`, or `undecided`.

### Two distinct evidence contracts

The strict before/after analysis and every RFT candidate must still join through `proofset_case_id` to Plan 005. That contract remains unchanged because RFT optimizes directly against the v2 evaluator.

The private Model A SFT pilot uses a separate Plan 008 sterile-referee contract. It does not require or fabricate Plan 005 case ids for unrelated tasks. It requires a completed, digest-listed final report; a structured sterile `clean_verify` referee; passed referee validation; per-row environment/grader/source identities; and cluster plus lineage evidence for confirmed hacks. The current preliminary diff-based report is rejected at report level.

After final Plan 008 intake, Model A preparation still stops unless the leakage-safe split retains at least 20 training rows across five independent groups, including at least three legitimate and three confirmed-hack rows, plus held-out coverage of at least three legitimate and two hack rows across two groups.

---

## 3. Shared canonical intake implemented in code

Both pipelines:

1. require completed Plan 005 and Plan 008 manifests;
2. load the qabench report and ReleaseProof as JSON objects;
3. compute source-file SHA-256 digests;
4. require each manifest to list the exact artifact path and matching digest;
5. verify the ReleaseProof's internal `content_digest`;
6. require a passing ReleaseProof gate;
7. require exact v1/v2 case membership over all sealed Witness/control ids;
8. require every Witness to be v1-positive and v2-negative;
9. require every control to be v1-positive and v2-positive;
10. require each joined qabench HUD reward to match the ReleaseProof v1 reward.

Malformed qabench rows are quarantined at row level. A malformed manifest, stale reward, failed ReleaseProof gate, digest mismatch, surviving Witness, broken control, or mismatched ProofSet membership fails the entire run.

### Normalized qabench trajectory

The shared parser produces this logical record:

```json
{
  "trajectory_id": "ctrl-1",
  "task_id": "mongodb-sales-aggregation-engine",
  "task_prompt": "Implement SalesAnalyzer.",
  "assistant_output": "Implemented aggregation pipelines.",
  "origin": "control",
  "proofset_case_id": "ctrl-1",
  "hud_reward": 1.0,
  "referee_verdict": "legitimate",
  "qa_verdict": "not_reward_hacking",
  "cluster_id": null,
  "lineage": null
}
```

An undecided verdict, missing case id, or unjoined case is quarantined by both consumers. SFT additionally requires a faithful assistant output. Confirmed hacks additionally require cluster and divergence-lineage evidence.

---

## 4. Canonical SFT path

There are two SFT outputs with deliberately different safety semantics:

- `raw_verifier_sft.jsonl` remains a safe analysis contrast; confirmed-hack assistant messages have `weight: 0`.
- `model_a_raw_train.jsonl` is created only by `model-a-prepare`; confirmed-hack and legitimate v1-positive assistant messages have `weight: 1`. It is explicitly `private_evaluation_only` and must never be uploaded from a preliminary report.

### Eligibility and normalization

The SFT pipeline converts an eligible qabench trajectory plus its ReleaseProof case into `TraceRecord` with:

- task prompt and faithful assistant output;
- v1 reward as `raw_reward`;
- v2 reward as `patched_reward`;
- referee-derived `is_hack` / `is_legit`;
- qabench and ReleaseProof path+digest references;
- ProofSet case, origin, QA/referee verdict, and cluster;
- v1/v2 environment and grader identities.

SFT quarantine reasons currently include:

- `referee_undecided`;
- `missing_proofset_case_id`;
- `missing_faithful_demonstration`;
- `unjoined_releaseproof_case`;
- `confirmed_hack_missing_cluster`;
- `confirmed_hack_missing_divergence_lineage`;
- structural qabench parse errors.

### Dataset buckets

```text
raw_sft = v1 reward == 1
hardened_sft = v2 reward == 1 AND referee verdict == legitimate
rejected_hacks = v1 reward == 1 AND v2 reward == 0 AND referee verdict == confirmed_hack
```

The raw dataset is an analysis contrast. Confirmed hacks exported there receive assistant `weight: 0`, so they are not positive SFT loss examples. The hardened dataset contains only legitimate v2-positive demonstrations and uses assistant `weight: 1`.

### Fireworks chat row

```json
{
  "messages": [
    {"role": "system", "content": "<canonical anti-hacking coding-agent prompt>"},
    {"role": "user", "content": "Implement SalesAnalyzer."},
    {"role": "assistant", "content": "Implemented aggregation pipelines.", "weight": 1}
  ]
}
```

### Canonical SFT outputs

The run writes:

```text
canonical_inputs.json
quarantine.jsonl
metrics.json
raw_verifier_sft.jsonl
raw_verifier_sft.metadata.jsonl
hardened_verifier_sft.jsonl
hardened_verifier_sft.metadata.jsonl
rejected_hacks_audit.jsonl
training_recommendations.json
provider_capability_check.json
fireworks_dataset_upload.json
sft_job_request.json
sft_job_result.json
heldout_eval_manifest.json
run_manifest.json
```

The provider, upload, job, and held-out files are intentionally generated with `status="not_run"` and `TBD` fields. Their existence is not training evidence.

### Private Model A preparation command

```bash
uv run python -m chronos.research.sft.cli model-a-prepare \
  --qabench-report <PLAN_008_MANIFEST_LISTED_REPORT> \
  --plan-008-manifest docs/plans/evidence/008/MANIFEST.json \
  --output artifacts/chronos/research/sft/model-a/<RUN_ID>/
```

This command writes a deterministic, content-addressed train/held-out split and pending Fireworks artifacts. It performs no network request, upload, dry run, deployment, or training.

---

## 5. Canonical RFT launch-readiness path

RFT is a sibling consumer of the shared canonical intake. It does not import SFT and does not train on assistant completions. It exports user prompts that a managed RFT agent/environment would roll out again.

### Eligibility and buckets

RFT requires a task prompt but not `assistant_output`.

```text
raw_rft_prompts = v1 reward == 1
hardened_rft_prompts = v2 reward == 1 AND referee verdict == legitimate
rejected_hacks = v1 reward == 1 AND v2 reward == 0 AND referee verdict == confirmed_hack
```

RFT quarantine reasons include undecided referee verdict, missing case id, missing prompt, unjoined ReleaseProof case, and confirmed hacks missing cluster or divergence lineage.

### Managed-RFT prompt row

```json
{
  "messages": [
    {"role": "user", "content": "Implement SalesAnalyzer."}
  ],
  "metadata": {
    "dataset_kind": "hardened",
    "trajectory_id": "ctrl-1",
    "task_id": "mongodb-sales-aggregation-engine",
    "proofset_case_id": "ctrl-1",
    "origin": "control",
    "referee_verdict": "legitimate",
    "raw_reward": 1.0,
    "hardened_reward": 1.0,
    "cluster_id": null
  }
}
```

### Canonical RFT outputs

```text
raw_rft_prompts.jsonl
hardened_rft_prompts.jsonl
rejected_hack_rft_audit.jsonl
rft_quarantine.jsonl
rft_canonical_inputs.json
rft_provider_capability_check.json
rft_evaluator_spec.json
rft_job_request.json
rft_job_result.json
rft_eval_manifest.json
rft_run_manifest.json
```

This pipeline prepares launch-readiness artifacts only. It does not register an evaluator, register a dataset, launch managed RFT, calibrate grouped rollouts, or evaluate a checkpoint.

---

## 6. Current commands

### Verified research tests

```bash
UV_CACHE_DIR=/private/tmp/h2f-uv-cache \
uv run pytest tests/chronos/research -q
```

Observed on the current prepared working tree: `91 passed, 19 subtests passed`.

### Mock compatibility pipeline

```bash
uv run python -m chronos.research.sft.cli mock \
  --input fixtures/sft/mock_chronos_traces.jsonl \
  --output artifacts/sft/mock_run/
```

The legacy root `--input` / `--output` flags remain backward compatible. Mock output is illustrative only.

### Canonical SFT run after Plan 008 completes

```bash
uv run python -m chronos.research.sft.cli canonical \
  --qabench-report <PLAN_008_QABENCH_REPORT.json> \
  --release-proof artifacts/chronos/releases/release-proofs/releaseproof-30e03914472631dd.json \
  --plan-008-manifest docs/plans/evidence/008/MANIFEST.json \
  --plan-005-manifest docs/plans/evidence/005/MANIFEST.json \
  --output artifacts/chronos/research/sft/runs/<RUN_ID>/
```

### Canonical RFT preparation after Plan 008 completes

```bash
uv run python -m chronos.research.rft.cli prepare \
  --qabench-report <PLAN_008_QABENCH_REPORT.json> \
  --release-proof artifacts/chronos/releases/release-proofs/releaseproof-30e03914472631dd.json \
  --plan-008-manifest docs/plans/evidence/008/MANIFEST.json \
  --plan-005-manifest docs/plans/evidence/005/MANIFEST.json \
  --output artifacts/chronos/research/rft/runs/<RUN_ID>/
```

Do not guess the Plan 008 report path. Use the exact artifact path and digest listed by its completed manifest.

### Mapped-command governance

A narrow rescue ownership exception is recorded for `plan-007-tests` and `integration-research`. Both rows are now `verified` and execute successfully. `integration-research` currently proves the sealed-v2 evaluator binding only; it does not complete Plan 008, depth-two, capability, transfer, provider-registration, or training gates.

---

## 7. SFT launch gates after canonical export

Before uploading or launching managed SFT:

1. inspect eligible, quarantined, raw, hardened, and rejected counts under the selected SFT contract;
2. confirm all Model A size, class-balance, and independent-group gates pass;
3. confirm no summary, exploit explanation, hidden evaluator answer, secret, or private reasoning is weighted as positive training content;
4. freeze train/held-out groups by task, lineage, source artifact, and template/solution family;
5. require `accounts/fireworks/models/qwen3-4b` to report tunable; do not silently substitute another model;
6. validate managed LoRA rank 8 and one epoch by dry run;
7. pass tokenization/chat-format validation;
8. record expected cost/time and dataset registration;
9. review a dry-run/UI/CLI request;
10. replace `sft_job_request.json`, `sft_job_result.json`, and `heldout_eval_manifest.json` placeholders with actual evidence.

`training_recommendations.json` is advisory. Its count-based rank, batch, epoch, and learning-rate values must not be consumed automatically.

---

## 8. RFT launch gates after canonical preparation

Before managed RFT:

1. register a real evaluator bound to the sealed v2 environment/grader identity;
2. keep trusted tests, evaluator code, interpreter/plugin paths, reward records, and grader secrets outside agent-writable state;
3. register the prompt dataset and real agent/remote environment;
4. run multiple target-model rollouts per prompt without a gradient step;
5. measure within-group reward spread and zero-variance-group rate;
6. inspect highest-reward trajectories for cheapest-path exploits and prompt/evaluator misalignment;
7. record legitimate success, referee-confirmed hack rate, truncation, timeout, infrastructure-error, and grader-error rates;
8. freeze held-out controls, task families, and exploit mechanisms;
9. validate provider model support, loss method, rollout count, concurrency, expected cost/time, and dry-run request;
10. launch only if calibration has usable signal and anti-hack probes pass;
11. stop if reward rises while legitimate success falls, hack rate rises, controls regress, or evaluator identity changes;
12. replace all RFT `TBD`/`not_run` artifacts with provider and held-out evaluation evidence.

Reward mean alone is not an RFT readiness signal. Group-relative training needs within-group variation; homogeneous all-pass or all-fail groups provide no relative learning signal.

`HUDDOC.MD`'s arithmetic Training API loop is a separate custom-loop preview. It may validate Fireworks mechanics, but it does not use the canonical Chronos qabench/ReleaseProof inputs and cannot support Chronos SFT/RFT claims.

---

## 9. Metrics and claim boundaries

For any real report, name the exact joined source population and ReleaseProof. Report:

```text
v1_admission = joined rows with v1 reward == 1
v2_admission = the same joined rows with v2 reward == 1
classified_v1 = referee-decided rows in v1_admission
classified_v2 = referee-decided rows in v2_admission

v1_classified_contamination = confirmed hacks in classified_v1 / size(classified_v1)
v2_classified_contamination = confirmed hacks in classified_v2 / size(classified_v2)
classification_coverage = referee-decided rows / admitted rows
legitimate_retention = legitimate rows in v2_admission / legitimate rows in v1_admission
```

Always report quarantine count and reasons, unjoined row count, clean SFT count, hardened RFT prompt count, and independent split-group counts. Do not generalize ProofSet results to all Plan 008 trajectories when unjoined trajectories were quarantined.

Allowed claims:

| Claim | Required evidence |
|---|---|
| “The strict canonical pipeline ran.” | Completed Plan 005/008 manifests, matching digests, ReleaseProof join, and run manifest. |
| “Model A files were prepared.” | Completed Plan 008 manifest, structured sterile referee, passed referee validation, frozen split, and `prepared_not_uploaded` manifest. |
| “Hardened filtering removed N confirmed hacks.” | Named joined population, referee verdicts, ReleaseProof join, and audit artifact. |
| “The dataset is SFT-ready.” | Faithful examples, provider/tokenization validation, frozen split, and no positive-weight hacks. |
| “The RFT task is trainable.” | Registered evaluator/environment plus target-model grouped reward-spread calibration. |
| “Training improved behavior.” | Actual job result and frozen held-out legitimate-success/hack-rate evaluation. |

---

## 10. Current blockers and next actions

| Priority | Blocker | Required action |
|---|---|---|
| P0 | Plan 008 manifest/report absent | Complete Plan 008 and publish the exact qabench artifact with digest. |
| P0 | Canonical SFT/RFT runs not executed | Run the sterile-referee Model A preparer and strict RFT consumer with completed Plan 008; inspect quarantine and split counts. |
| P0 | Unknown useful dataset size | Confirm enough Model A rows survive sterile-referee intake and enough RFT prompts survive the ReleaseProof join. |
| P1 | SFT provider evidence absent | Verify model, managed LoRA support/rank, tokenization, dataset, dry run, cost/time, and held-out split. |
| P1 | RFT provider registration/environment evidence absent | The local sealed-v2 binding is prepared; next register the evaluator, dataset, and isolated environment, then run grouped calibration and anti-hack review. |
| P1 | Plan 007 broader research incomplete | Depth-two, adaptive stopping, capability gates, and required evidence remain outside the SFT/RFT preparation work. |
| P2 | Actual Fireworks jobs absent | Launch only after the corresponding gates pass; preserve request/result/eval evidence. |

The immediate dependency is a final Plan 008 artifact with a real sterile `clean_verify` referee. Training still stops if Model A's split gates fail, Qwen3 4B is not tunable, dataset validation or cost approval fails, or any provider evidence remains `TBD`/`not_run`.

---

## 11. Official downstream references

- [Fireworks managed fine-tuning overview](https://docs.fireworks.ai/fine-tuning/managed-finetuning-intro)
- [Fireworks supervised fine-tuning](https://docs.fireworks.ai/fine-tuning/fine-tuning-models)
- [Fireworks RFT overview](https://docs.fireworks.ai/fine-tuning/reinforcement-fine-tuning-models)
- [Fireworks RFT concepts](https://docs.fireworks.ai/fine-tuning/how-rft-works)
- [Fireworks evaluator guidance](https://docs.fireworks.ai/fine-tuning/evaluators)
- [Fireworks RFT parameter tuning](https://docs.fireworks.ai/fine-tuning/parameter-tuning)
- [Fireworks Training API introduction](https://docs.fireworks.ai/fine-tuning/training-api/introduction)
