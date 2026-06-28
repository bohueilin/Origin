# SFT Extension Write-up

## Problem

Raw reward-1 trajectories include reward hacks. If those trajectories become positive
supervised training examples, a model may learn exploit behavior instead of real
task-solving.

## Method

Load Chronos trace exports, partition them into raw SFT, hardened SFT, and rejected
hack buckets, then compare verifier outcomes before and after hardening.

## Result

| Metric | Raw | Hardened |
| --- | ---: | ---: |
| Reward-1 traces admitted | 32 | 23 |
| Legitimate traces admitted | 23 | 23 |
| Hacked traces admitted | 9 | 0 |
| Training contamination | 28.1% | 0.0% |
| Legitimate retention | 100.0% | 100.0% |

Rejected hack clusters:

- **/app/conftest.py:** 5
- **/app/task_assets/conftest.py:** 1
- **/app/task_assets/conftest.py;/app/test_conftest.py:** 1
- **/app/task_assets/test_outputs_modified.py:** 1
- **unclassified:** 1

## Implication

Verifier hardening protects both benchmark reliability and training data quality.
Chronos removes poisoned reward-1 successes before they enter an SFT or RFT pipeline.

## Fireworks path

The hardened SFT bucket is the dataset that should feed a Fireworks managed SFT job.
The raw bucket remains as a deliberate contrast showing what an unfiltered pipeline
would have trained on.

_Source: qabench_preliminary_
