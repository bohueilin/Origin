"""Reward-pressured code cheat source (Fireworks/OpenAI-compatible): registry, loop, honesty."""

from pathlib import Path
from types import SimpleNamespace

from cobra.agents.code_pressure import PRESSURE_SYSTEM, run_code_pressure
from cobra.rollout import pressure_models
from cobra.rollout.models import _OPENAI


def test_fireworks_is_registered_as_openai_compatible():
    env, base, mid = _OPENAI["fireworks-qwen-coder"]
    assert env == "FIREWORKS_API_KEY"
    assert base == "https://api.fireworks.ai/inference/v1"
    assert mid == "accounts/fireworks/models/qwen2p5-coder-7b-instruct"


def test_pressure_models_skips_without_key(monkeypatch):
    monkeypatch.delenv("FIREWORKS_API_KEY", raising=False)
    assert pressure_models(["fireworks-qwen-coder"]) == []  # graceful skip, mirrors red_models


def test_pressure_prompt_states_objective_not_method():
    blob = PRESSURE_SYSTEM.lower()
    assert "accept" in blob and "grader" in blob  # the objective is present
    for method_word in (
        "hardcode",
        "hard-code",
        "hard code",
        "sparse",
        "memori",
        "special-case",
        "specific input",
        "cheat",
        "exploit",
    ):
        assert method_word not in blob  # the method is absent — discovered, not coached


def test_run_code_pressure_iterates_until_accepted_and_shows_the_grader_checks(tmp_path):
    (tmp_path / "test_visible.py").write_text("def test():\n    assert f(2) == 4\n")
    task = SimpleNamespace(prompt="def f(x):\n    '''double x'''\n")

    attempts = iter(["def f(x):\n    return 0\n", "def f(x):\n    return 4  # ACCEPT\n"])
    seen = {}

    def complete(messages):
        seen.setdefault("first", messages)
        return next(attempts)

    def run_tests(workdir):
        return 1 if "ACCEPT" in (Path(workdir) / "solution.py").read_text() else 0

    final = run_code_pressure(task, tmp_path, complete=complete, run_tests=run_tests, max_turns=4)
    assert "ACCEPT" in final  # stopped at the accepted attempt (iterated past the rejected one)
    assert (tmp_path / "solution.py").read_text() == final  # the accepted solution was written

    msgs = seen["first"]
    assert msgs[0]["role"] == "system" and msgs[0]["content"] == PRESSURE_SYSTEM
    # The grader's checks are shown (the established repo threat model), not a hint to cheat.
    assert "assert f(2) == 4" in msgs[1]["content"]
