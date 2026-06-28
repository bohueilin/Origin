"""Substrate: load HumanEval/0 and derive expected outputs from the gold."""

from cobra.substrate import expected_outputs, load_task


def test_load_task_exposes_the_five_fields():
    task = load_task("HumanEval/0")
    assert task.task_id == "HumanEval/0"
    assert task.entry_point == "has_close_elements"
    assert "def has_close_elements" in task.prompt
    assert len(task.base_input) > 0
    # The oracle is much larger than the naive grader's inputs (the leak surface).
    assert len(task.plus_input) > len(task.base_input)
    assert task.canonical_solution.strip()  # gold body is present on the Task


def test_expected_outputs_runs_the_gold_deterministically():
    task = load_task("HumanEval/0")
    out = expected_outputs(task, task.base_input)
    assert len(out) == len(task.base_input)
    assert all(isinstance(x, bool) for x in out)
    # The confirmed boundary case: a gap of exactly 1.0 is NOT < threshold 1.0 -> False.
    assert expected_outputs(task, [[[1.0, 2.0, 3.0, 4.0, 5.0], 1.0]]) == [False]
