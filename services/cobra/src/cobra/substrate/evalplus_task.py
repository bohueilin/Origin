"""Load one EvalPlus problem and derive expected outputs from the gold solution.

`base_input` / `plus_input` are INPUTS, not asserts. `expected_outputs` turns a set
of inputs into expected values by running the gold (prompt + canonical_solution) over
them — a small deterministic helper. The gold source and `plus_input` are held only on
the in-memory Task; they never reach the agent's workdir (see harness/, SPEC §4).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Task:
    task_id: str
    prompt: str
    entry_point: str
    base_input: list  # the naive grader's inputs (visible)
    plus_input: list  # the oracle's inputs (held out — never written to the workdir)
    canonical_solution: str  # gold body (held out — never written to the workdir)


def _to_task(task_id: str, record: dict) -> Task:
    return Task(
        task_id=task_id,
        prompt=record["prompt"],
        entry_point=record["entry_point"],
        base_input=record["base_input"],
        plus_input=record["plus_input"],
        canonical_solution=record["canonical_solution"],
    )


def load_task(task_id: str) -> Task:
    """Load one EvalPlus problem by task_id (downloads/caches on first call)."""
    from evalplus.data import get_human_eval_plus

    return _to_task(task_id, get_human_eval_plus()[task_id])


def load_subset(n: int) -> list[Task]:
    """Load the first n EvalPlus problems (by task index), loading the dataset once."""
    from evalplus.data import get_human_eval_plus

    data = get_human_eval_plus()
    ids = sorted(data, key=lambda k: int(k.split("/")[1]))[:n]
    return [_to_task(tid, data[tid]) for tid in ids]


def _hardness(task: Task) -> float:
    """Tricky logic per visible test: len(canonical_solution) / len(base_input). Higher = more
    reference logic with fewer base tests = where the standard grader is weakest relative to
    difficulty. An OBJECTIVE proxy, not chosen for breach yield."""
    return len(task.canonical_solution) / max(1, len(task.base_input))


def load_hardest(n: int) -> list[Task]:
    """Load the n hardest EvalPlus problems by `_hardness` (sparse base relative to tricky
    logic), deterministically (ties broken by task index)."""
    from evalplus.data import get_human_eval_plus

    tasks = [_to_task(tid, rec) for tid, rec in get_human_eval_plus().items()]
    tasks.sort(key=lambda t: (-_hardness(t), int(t.task_id.split("/")[1])))
    return tasks[:n]


def expected_outputs(task: Task, inputs: list) -> list:
    """Run the gold (prompt + canonical_solution) over `inputs`; return expected outputs.

    Deterministic. Each element of `inputs` is the positional argument list for one call.
    """
    namespace: dict = {}
    exec(task.prompt + task.canonical_solution, namespace)  # trusted dataset gold
    fn = namespace[task.entry_point]
    return [fn(*args) for args in inputs]
