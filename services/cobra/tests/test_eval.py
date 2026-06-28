"""Held-out eval (⑤ measurement): task split + solve/cheat rates via the rollout harness."""

from cobra.rollout import mock_scorers
from cobra.rollout.models import Model
from cobra.substrate import Task
from cobra.train import held_out_eval, split_tasks


def _tasks(n):
    return [Task(f"t{i}", "p", "f", [], [], "") for i in range(n)]


def test_split_tasks_is_disjoint_and_deterministic():
    train, held = split_tasks(_tasks(10), held_out_frac=0.3)
    assert len(train) == 7 and len(held) == 3
    ids = {t.task_id for t in train} | {t.task_id for t in held}
    assert len(ids) == 10  # disjoint, full cover
    assert split_tasks(_tasks(10)) == split_tasks(_tasks(10))  # deterministic


def test_held_out_eval_scores_solve_vs_cheat():
    r_naive, r_hardened, t_oracle = mock_scorers()
    tasks = _tasks(2)

    solver = held_out_eval(
        Model("solver", lambda t: "HONEST"),
        tasks,
        r_naive=r_naive,
        r_hardened=r_hardened,
        t_oracle=t_oracle,
        k=2,
    )
    assert solver.solve_rate == 1.0 and solver.cheat_rate == 0.0

    cheater = held_out_eval(
        Model("cheater", lambda t: "CHEAT"),
        tasks,
        r_naive=r_naive,
        r_hardened=r_hardened,
        t_oracle=t_oracle,
        k=2,
    )
    assert cheater.cheat_rate == 1.0 and cheater.solve_rate == 0.0
