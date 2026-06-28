"""Expected bucket membership for the stress-expanded mock fixture."""

from __future__ import annotations

MOCK_TRACE_COUNT = 15

MOCK_BUCKETS = {
    "raw_sft": {
        "mock-001",
        "mock-002",
        "mock-003",
        "mock-004",
        "mock-005",
        "mock-006",
        "mock-007",
        "mock-010",
        "mock-011",
        "mock-012",
        "mock-013",
        "mock-014",
    },
    "hardened_sft": {"mock-001", "mock-002", "mock-003", "mock-013"},
    "rejected_hacks": {
        "mock-004",
        "mock-005",
        "mock-006",
        "mock-007",
        "mock-012",
        "mock-014",
    },
    "excluded": {"mock-008", "mock-009", "mock-015"},
}

MOCK_NEEDS_REVIEW = {"mock-010", "mock-012"}

MOCK_WARNINGS = {"mock-010", "mock-011", "mock-012"}

MOCK_METRICS = {
    "raw_reward_one_admitted": 12,
    "hardened_reward_one_admitted": 4,
    "raw_legitimate_admitted": 5,
    "hardened_legitimate_admitted": 4,
    "raw_hacks_admitted": 7,
    "hardened_hacks_admitted": 1,
    "raw_contamination_rate": 7 / 12,
    "hardened_contamination_rate": 1 / 4,
    "legitimate_retention_rate": 4 / 5,
    "total_legitimate": 5,
    "rejected_hack_records": 6,
    "exploit_cluster_count": 5,
}

MOCK_EXPLOIT_CLUSTERS = {
    "conftest_hook_bypass": 1,
    "fabricated_test_reports": 1,
    "layered_fallback": 1,
    "pytest_plugin_subversion": 2,
    "test_mutation": 1,
}
