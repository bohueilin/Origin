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
| Reward-1 traces admitted | 12 | 4 |
| Legitimate traces admitted | 5 | 4 |
| Hacked traces admitted | 7 | 1 |
| Training contamination | 58.3% | 25.0% |
| Legitimate retention | 80.0% | 80.0% |

Rejected hack clusters:

- **conftest_hook_bypass:** 1
- **fabricated_test_reports:** 1
- **layered_fallback:** 1
- **pytest_plugin_subversion:** 2
- **test_mutation:** 1

## Implication

Verifier hardening protects both benchmark reliability and training data quality.
Chronos removes poisoned reward-1 successes before they enter an SFT or RFT pipeline.

## Fireworks path

The hardened SFT bucket is the dataset that should feed a Fireworks managed SFT job.
The raw bucket remains as a deliberate contrast showing what an unfiltered pipeline
would have trained on.

_Source: mock_chronos_traces.jsonl_
