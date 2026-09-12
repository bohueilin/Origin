"""Behavior of the per-task HUD env generator (Plan 008 WP1)."""

import ast
import hashlib
import json
from pathlib import Path
import tomllib

import pytest

from chronos.qabench.hud_env import (
    env_py,
    generate_hud_env,
    parse_grade_deps,
    pyproject_toml,
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


def test_parse_grade_deps_drops_version_pins() -> None:
    deps = parse_grade_deps("uv add numpy>=2.0 scipy==1.18.0\n")
    assert deps == ["numpy", "scipy"]


@pytest.mark.parametrize(
    "token",
    [
        "$(id)",
        "`id`",
        "'numpy'",
        '"numpy"',
        "numpy;id",
        "numpy\\\nuv add id",
        "--index-url",
    ],
)
def test_parse_grade_deps_rejects_shell_and_option_injection(token: str) -> None:
    with pytest.raises(ValueError, match="unsafe grade dependency"):
        parse_grade_deps(f"uv add {token}\n")


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
    assert "ASSETS.iterdir()" not in env_py
    assert '"test_outputs.py", "test.sh", "instruction.md"' in env_py

    dockerfile = files["Dockerfile.hud"]
    # The task build is preserved but its CMD is replaced by the HUD serve CMD.
    assert "FROM ghcr.io/laude-institute/t-bench/python-3-13:20250620" in dockerfile
    assert 'CMD ["/bin/bash"]' not in dockerfile
    assert 'hud", "serve", "env:env"' in dockerfile
    # Grade-time deps from test.sh are baked in for offline grading.
    assert "numpy pandas scipy requests" in dockerfile

    assert "hud-python" in files["pyproject.toml"]
    assert "from env import build_task" in files["tasks.py"]


def test_direct_generators_reject_untrusted_slugs_before_templates() -> None:
    for slug in ("../escape", "a/b", "a\\b", "a\nb", "x'; import os; #", "☃"):
        with pytest.raises(ValueError):
            env_py(slug)
        with pytest.raises(ValueError):
            pyproject_toml(slug)


def test_direct_generators_emit_parseable_literal_data_for_valid_slug() -> None:
    generated = env_py("under-score")
    ast.parse(generated)
    pyproject = pyproject_toml("under-score")
    assert tomllib.loads(pyproject)["project"]["name"] == "under-score"


def test_generate_hud_env_rejects_untrusted_directory_name(tmp_path: Path) -> None:
    env = tmp_path / "bad;name"
    env.mkdir()
    with pytest.raises(ValueError):
        generate_hud_env(env)


def test_synth_final_images_copy_only_generated_waveform() -> None:
    root = Path(__file__).resolve().parents[3] / "envs" / "qabench" / "synthesize-harmonic-wav-in-c"
    for name in ("Dockerfile", "Dockerfile.hud"):
        dockerfile = (root / name).read_text(encoding="utf-8")
        assert "AS builder" in dockerfile
        assert "COPY --from=builder /app/audio.wav /app/audio.wav" in dockerfile
        final_stage = dockerfile.rsplit("FROM ", 1)[1]
        assert "generate_audio.py" not in final_stage


def test_checked_in_reference_classification_and_synth_provenance_are_truthful() -> None:
    qabench = Path(__file__).resolve().parents[3] / "envs" / "qabench"
    readme = (qabench / "README.md").read_text(encoding="utf-8").lower()
    notice = (qabench / "NOTICE").read_text(encoding="utf-8").lower()
    assert "public reference input" in readme
    assert "public reference input" in notice
    assert "solution.sh also materializes" not in readme
    assert "reference solutions (`task_assets/solution.sh`)" not in notice
    assert "operator gate" in readme

    synth = qabench / "synthesize-harmonic-wav-in-c"
    provenance = json.loads((synth / "provenance.json").read_text(encoding="utf-8"))
    dockerfile_digest = hashlib.sha256(
        (synth / "Dockerfile").read_bytes()
    ).hexdigest()
    hud_dockerfile_digest = hashlib.sha256(
        (synth / "Dockerfile.hud").read_bytes()
    ).hexdigest()
    assert provenance["dockerfile_digest"] == dockerfile_digest
    assert provenance["hud_dockerfile_digest"] == hud_dockerfile_digest
    assert provenance["asset_classification"] == "builder_only_reference_waveform"
    expected_content = hashlib.sha256(
        json.dumps(
            {key: value for key, value in provenance.items() if key != "content_digest"},
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()
    assert provenance["content_digest"] == expected_content


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
