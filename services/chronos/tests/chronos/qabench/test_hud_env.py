"""Behavior of the per-task HUD env generator (Plan 008 WP1)."""

from pathlib import Path

from chronos.qabench.hud_env import (
    generate_hud_env,
    parse_grade_deps,
    write_hud_env,
)

_TEST_SH = """#!/bin/bash
curl -LsSf https://astral.sh/uv/0.7.13/install.sh | sh
uv init
uv add pytest==8.4.1
uv add numpy pandas scipy requests
"""


def test_parse_grade_deps_extracts_uv_add_minus_pytest() -> None:
    assert parse_grade_deps(_TEST_SH) == ["numpy", "pandas", "scipy", "requests"]


def test_parse_grade_deps_drops_version_pins_and_flags() -> None:
    deps = parse_grade_deps("uv add 'numpy>=2.0' scipy==1.18.0 --frozen\n")
    assert deps == ["numpy", "scipy"]


def _materialized_env(tmp_path: Path) -> Path:
    env = tmp_path / "demo-task"
    (env / "task_assets").mkdir(parents=True)
    (env / "Dockerfile").write_text(
        "FROM ghcr.io/laude-institute/t-bench/python-3-13:20250620\n"
        "WORKDIR /app\n"
        "COPY seed.py /app/\n"
        'CMD ["/bin/bash"]\n'
    )
    (env / "task_assets" / "test.sh").write_text(_TEST_SH)
    (env / "task_assets" / "test_outputs.py").write_text(
        "def test_x():\n    assert True\n"
    )
    (env / "task_assets" / "instruction.md").write_text("do the thing\n")
    return env


def test_generate_hud_env_emits_serve_contract(tmp_path: Path) -> None:
    files = generate_hud_env(_materialized_env(tmp_path))
    assert set(files) == {"env.py", "pyproject.toml", "tasks.py", "Dockerfile.hud"}

    env_py = files["env.py"]
    assert 'env = Environment(name="demo_task_v1")' in env_py
    assert '@env.template(id="demo-task")' in env_py
    assert "async def build_task()" in env_py
    assert "BashGrader.grade" in env_py

    dockerfile = files["Dockerfile.hud"]
    # The task build is preserved but its CMD is replaced by the HUD serve CMD.
    assert "FROM ghcr.io/laude-institute/t-bench/python-3-13:20250620" in dockerfile
    assert 'CMD ["/bin/bash"]' not in dockerfile
    assert 'hud", "serve", "env:env"' in dockerfile
    # Grade-time deps from test.sh are baked in for offline grading.
    assert '"numpy" "pandas" "scipy" "requests"' in dockerfile

    assert "hud-python" in files["pyproject.toml"]
    assert "from env import build_task" in files["tasks.py"]


def test_write_hud_env_materializes_files(tmp_path: Path) -> None:
    env = _materialized_env(tmp_path)
    written = write_hud_env(env)
    assert {p.name for p in written} == {
        "env.py",
        "pyproject.toml",
        "tasks.py",
        "Dockerfile.hud",
    }
    assert all(p.exists() for p in written)
