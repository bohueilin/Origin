"""Raw-LLM engine baseline + LLM-judge grader baseline (fakes; no network)."""

from types import SimpleNamespace

from cobra.baselines import compare_verdicts, llm_grade, raw_llm_breaches
from cobra.substrate import Task


def _task() -> Task:
    return Task(
        task_id="toy/double",
        prompt='def double(x):\n    """2x"""\n',
        entry_point="double",
        base_input=[[1], [2]],
        plus_input=[[9]],
        canonical_solution="    return 2 * x\n",
    )


# --- raw-LLM engine baseline ---


def test_raw_llm_baseline_counts_breached_gates():
    breached_set = {"g2", "g4"}
    report = raw_llm_breaches(["g1", "g2", "g3", "g4"], probe=lambda tid: tid in breached_set)
    assert report.breached == 2
    assert report.total == 4
    assert report.hit_rate == 0.5
    assert report.results["g2"] is True and report.results["g1"] is False


# --- LLM-judge grader baseline ---


class _Judge:
    """Fake LLM judge: scripted PASS/FAIL replies."""

    def __init__(self, verdicts):
        outer = self

        class _M:
            def create(self, **kwargs):
                return SimpleNamespace(
                    content=[SimpleNamespace(type="text", text=outer._verdicts.pop(0))],
                    stop_reason="end_turn",
                )

        self._verdicts = list(verdicts)
        self.messages = _M()


def test_llm_grade_parses_pass_and_fail():
    assert llm_grade(_task(), "x", client=_Judge(["PASS"])) == 1
    assert llm_grade(_task(), "x", client=_Judge(["FAIL"])) == 0
    assert llm_grade(_task(), "x", client=_Judge(["pass, looks correct"])) == 1


def test_compare_verdicts_runs_both_graders():
    task = _task()
    gold = "def double(x):\n    return 2 * x\n"
    cheat = "def double(x):\n    return {1: 2, 2: 4}.get(x, 0)\n"
    # Judge: gold -> PASS, cheat -> FAIL (here the LLM judge catches the hardcode).
    rows = compare_verdicts(
        task, [("gold", gold), ("cheat", cheat)], client=_Judge(["PASS", "FAIL"])
    )

    by_label = {r["label"]: r for r in rows}
    assert by_label["gold"]["naive_test_grader"] == 1  # gold passes the real test grader
    assert by_label["cheat"]["naive_test_grader"] == 1  # the cheat fools the naive grader too
    assert by_label["gold"]["llm_judge"] == 1
    assert by_label["cheat"]["llm_judge"] == 0
