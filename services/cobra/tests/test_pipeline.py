from cobra.pipeline import EnvAdapter, run_pipeline
from cobra.rollout.models import Model


class _Task:
    def __init__(self, tid: str):
        self.task_id = tid


def test_run_pipeline_end_to_end(tmp_path):
    tasks = [_Task("a"), _Task("b")]
    # mock env: "good" is correct everywhere; "cheat" passes naive but fails hardened + oracle.
    adapter = EnvAdapter(
        name="mock",
        load_tasks=lambda n: tasks[:n],
        naive=lambda t, c: 1 if c in ("good", "cheat") else 0,
        oracle=lambda t, c: 1 if c == "good" else 0,
        hardened=lambda t, c: 1 if c == "good" else 0,
        exploit_fn=lambda t: ["cheat"],
    )
    models = [Model(name="m", sample=lambda t: "good")]

    res = run_pipeline(adapter, models, n=2, k=2, out_path=str(tmp_path / "r.jsonl"))

    assert res.adapter == "mock"
    assert res.rollouts  # honest solves + injected cheats
    assert {s.name for s in res.leaderboard} == {"naive", "hardened"}
    naive = next(s for s in res.leaderboard if s.name == "naive")
    hardened = next(s for s in res.leaderboard if s.name == "hardened")
    # the verifier under test leaks the injected cheat; the hardened one catches it
    assert naive.false_accept > hardened.false_accept
    assert hardened.catch_rate == 1.0
    assert res.gap.hardened_accuracy >= res.gap.naive_accuracy
