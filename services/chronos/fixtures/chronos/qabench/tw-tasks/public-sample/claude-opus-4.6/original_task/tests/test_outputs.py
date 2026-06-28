"""Fixture v1 grader for the public-base importer discovery test."""


def test_solution_present() -> None:
    from pathlib import Path

    assert Path("/app/solution.txt").exists()
