from cobra.hud_adapter import derive_oracle, hud_adapter, threshold_scorer
from cobra.pipeline import run_pipeline
from cobra.rollout.models import Model


class _Task:
    def __init__(self, tid: str):
        self.task_id = tid
        self.prompt = f"task {tid}"


def test_threshold_scorer_binarizes_continuous_reward():
    accept = threshold_scorer(lambda t, c: 0.7, tau=0.5)
    reject = threshold_scorer(lambda t, c: 0.3, tau=0.5)
    assert accept(None, "x") == 1
    assert reject(None, "x") == 0


def test_hud_adapter_runs_through_pipeline(tmp_path):
    tasks = [_Task("a"), _Task("b")]
    # continuous HUD reward: good=0.9, cheat=0.8 (both clear the threshold), other=0.1
    reward = lambda t, c: 0.9 if c == "good" else (0.8 if c == "cheat" else 0.1)  # noqa: E731
    oracle = lambda t, c: 1 if c == "good" else 0  # noqa: E731

    adapter = hud_adapter(
        lambda n: tasks[:n], reward, oracle=oracle, threshold=0.5, name="hud-mock"
    )
    assert adapter.naive(tasks[0], "good") == 1
    assert adapter.naive(tasks[0], "cheat") == 1  # the env reward leaks the cheat
    assert adapter.naive(tasks[0], "x") == 0

    models = [Model(name="m", sample=lambda t: "good")]
    res = run_pipeline(adapter, models, n=2, k=1, out_path=str(tmp_path / "r.jsonl"))
    assert res.adapter == "hud-mock"
    assert res.rollouts


def test_derive_oracle_returns_callable():
    # constructs without an API call; invoking it would hit the model (not done in unit tests)
    assert callable(derive_oracle(prompt_of=lambda t: t.prompt))
