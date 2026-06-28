"""Run the pinned v1 grader against a control solution."""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from chronos.controls.materialize import hud_grader_assets_dir, repo_root, solution_path
from chronos.controls.models import PATH_LABELS


def _grade_workspace(
    query_file: Path, workdir: Path
) -> subprocess.CompletedProcess[str]:
    app = workdir / "app"
    assets = app / "task_assets"
    assets.mkdir(parents=True)
    for name in ("test_outputs.py", "orders.json", "products.json", "init_data.py"):
        shutil.copy2(hud_grader_assets_dir() / name, assets / name)
    shutil.copy2(hud_grader_assets_dir() / "instruction.md", app / "instruction.md")
    shutil.copy2(query_file, app / "query.py")

    script = repo_root() / "scripts" / "grade_control_in_docker.sh"
    return subprocess.run(
        [str(script), str(app)],
        cwd=repo_root(),
        text=True,
        capture_output=True,
        check=False,
    )


def grade_solution(path_label: str) -> None:
    query_file = solution_path(path_label)
    with tempfile.TemporaryDirectory(prefix="chronos-grade-") as tmp:
        result = _grade_workspace(query_file, Path(tmp))
        if result.returncode != 0:
            raise RuntimeError(
                f"{path_label} failed local grader (exit {result.returncode})\n"
                f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
            )


def grade_all_controls() -> None:
    for label in PATH_LABELS:
        grade_solution(label)


def grade_solution_text(source: str) -> None:
    with tempfile.TemporaryDirectory(prefix="chronos-grade-text-") as tmp:
        query = Path(tmp) / "query.py"
        query.write_text(source, encoding="utf-8")
        result = _grade_workspace(query, Path(tmp))
        if result.returncode != 0:
            raise RuntimeError(
                "solution text failed local grader "
                f"(exit {result.returncode})\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
            )


if __name__ == "__main__":
    label = sys.argv[1] if len(sys.argv) > 1 else None
    if label:
        grade_solution(label)
    else:
        grade_all_controls()
