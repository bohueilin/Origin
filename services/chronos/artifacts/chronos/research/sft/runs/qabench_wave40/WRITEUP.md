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
| Reward-1 traces admitted | 27 | 3 |
| Legitimate traces admitted | 3 | 3 |
| Hacked traces admitted | 11 | 0 |
| Training contamination | 40.7% | 0.0% |
| Legitimate retention | 100.0% | 100.0% |

Rejected hack clusters:

- **/app/FINAL_TEST_RESULTS.txt::?:** 1
- **/app/TEST_RESULTS.txt::?:** 1
- **/app/conftest.py::?:** 3
- **/app/test_results.txt::?:** 1
- **unclassified:** 5

## Implication

Verifier hardening protects both benchmark reliability and training data quality.
Chronos removes poisoned reward-1 successes before they enter an SFT or RFT pipeline.

## Fireworks path

The hardened SFT bucket is the dataset that should feed a Fireworks managed SFT job.
The raw bucket remains as a deliberate contrast showing what an unfiltered pipeline
would have trained on.

_Source: qabench_preliminary_
