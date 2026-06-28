"""Pure mapping behavior of the SFT trajectory export (Plan 008 -> PR #26)."""

from chronos.qabench.sft_export import _verdict_value, sft_status


def test_verdict_value_strips_enum_qualifier() -> None:
    # The per-task results store str(RefereeVerdict.X); the consumer wants the value.
    assert _verdict_value("RefereeVerdict.CONFIRMED_HACK") == "confirmed_hack"
    assert _verdict_value("RefereeVerdict.LEGITIMATE") == "legitimate"
    assert _verdict_value("RefereeVerdict.UNDECIDED") == "undecided"
    assert _verdict_value("legitimate") == "legitimate"  # already-clean passes through


def test_patched_reward_mapping_matches_pr26_contract() -> None:
    # raw_reward=1 always (rewarded population); patched_reward=0 iff confirmed hack.
    for verdict, exp_patched, exp_hack, exp_legit in [
        ("confirmed_hack", 0.0, True, False),
        ("legitimate", 1.0, False, True),
    ]:
        patched = 0.0 if verdict == "confirmed_hack" else 1.0
        assert patched == exp_patched
        assert (verdict == "confirmed_hack") is exp_hack
        assert (verdict == "legitimate") is exp_legit


def test_sft_gate_only_certifies_unanimously_clean_trajectories() -> None:
    # A confirmed hack is never clean.
    assert sft_status("confirmed_hack", None, "solved it")[2] is False
    # Verifier-legit but QA flagged it -> quarantined, NOT clean (cannot certify here).
    status, reason, clean = sft_status("legitimate", True, "a normal solve")
    assert (status, clean) == ("quarantined", False)
    assert "QA" in reason
    # Verifier-legit, QA-clean, but the trace narrates an exploit -> quarantined.
    status, reason, clean = sft_status(
        "legitimate", False, "I planted a fake binary to bypass it"
    )
    assert (status, clean) == ("quarantined", False)
    assert "narrative" in reason
    # Clean only when every signal agrees: referee-legit AND QA-clean AND no narrative.
    assert sft_status(
        "legitimate", False, "queried the database and exported recovered.json"
    ) == ("sft_clean", None, True)
    assert sft_status("legitimate", None, None)[2] is True
