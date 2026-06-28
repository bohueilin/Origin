"""Materialize sealed replay surfaces as harden-v0 generic tasks."""

from __future__ import annotations

import json
import shlex
import shutil
from pathlib import Path
from typing import Any

from .models import ReleaseError, digest_json, utc_now

_EXCLUDE_DIRS = {".git", ".venv", "__pycache__", ".pytest_cache"}
_EXCLUDE_SUFFIXES = {".pyc", ".pyo"}


def materialize_harden_task_source(
    *,
    proof_set: dict[str, Any],
    task_id: str,
    task_assets_source: Path,
    output_root: Path,
) -> dict[str, Any]:
    """Create a harden-v0 task source from explicit task assets and ProofSet identity.

    harden-v0's generic loop expects ``instruction.md``, ``tests/``, and
    ``environment/``. Chronos additionally requires the replay-surface manifest
    so the harden run cannot drift onto a detached verifier.
    """

    if not task_assets_source.is_dir():
        raise ReleaseError(
            "harden_task_materialization_failed",
            f"missing task assets: {task_assets_source}",
        )
    surfaces = proof_set.get("v1_replay_surfaces") or []
    if not surfaces:
        raise ReleaseError(
            "harden_task_materialization_failed", "ProofSet has no v1 replay surfaces"
        )
    _single_pre_grader_argv(surfaces)
    _single_grader_argv(surfaces)

    destination = output_root / proof_set["proof_set_id"] / task_id
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)

    instruction = _find_instruction(task_assets_source)
    _copy_environment(task_assets_source, destination / "environment", surfaces)
    copied_tests = _copy_tests(task_assets_source, destination / "tests", surfaces)
    _copy_solution(task_assets_source, destination / "solution")
    shutil.copy2(instruction, destination / "instruction.md")
    _write_test_sh(destination / "tests" / "test.sh", surfaces, copied_tests)
    _write_task_toml(destination / "task.toml")
    _write_surface_manifest(
        destination / "chronos-replay-surface.json",
        proof_set=proof_set,
        task_assets_source=task_assets_source,
    )

    record = {
        "schema_version": 1,
        "status": "materialized",
        "proof_set_id": proof_set["proof_set_id"],
        "task_id": task_id,
        "task_source": str(destination),
        "task_assets_source": str(task_assets_source),
        "verifier_files": sorted(copied_tests),
        "solution_present": (destination / "solution").is_dir(),
        "v1_replay_surface_count": len(surfaces),
        "created_at": utc_now(),
    }
    record["content_digest"] = digest_json(record)
    (destination / "chronos-materialization.json").write_text(
        json.dumps(record, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return record


def _find_instruction(source: Path) -> Path:
    for candidate in (
        source / "instruction.md",
        source / "task_assets" / "instruction.md",
    ):
        if candidate.is_file():
            return candidate
    raise ReleaseError(
        "harden_task_materialization_failed", f"no instruction.md under {source}"
    )


def _copy_tests(
    source: Path, tests_dir: Path, surfaces: list[dict[str, Any]]
) -> set[str]:
    tests_dir.mkdir(parents=True, exist_ok=True)
    copied: set[str] = set()
    tests_source = source / "tests"
    if tests_source.is_dir():
        _copytree_filtered(tests_source, tests_dir)
        copied.update(_relative_files(tests_dir))

    for rel_path in _verifier_asset_paths(surfaces):
        src = _resolve_asset_path(source, rel_path)
        if src is None:
            continue
        dest_rel = _tests_destination_path(rel_path)
        target = tests_dir / dest_rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, target)
        copied.add(dest_rel.as_posix())

    if not copied:
        raise ReleaseError(
            "harden_task_materialization_failed",
            "no verifier assets materialized; provide tests/ or files referenced by grader_command_argv",
        )
    return copied


def _copy_solution(source: Path, destination: Path) -> None:
    solution = source / "solution"
    if solution.is_dir():
        _copytree_filtered(solution, destination)


def _copy_environment(
    source: Path, environment_dir: Path, surfaces: list[dict[str, Any]]
) -> None:
    if (source / "environment").is_dir():
        _copytree_filtered(source / "environment", environment_dir)
    else:
        _copytree_filtered(source, environment_dir)

    dockerfile = environment_dir / "Dockerfile"
    dockerfile_hud = environment_dir / "Dockerfile.hud"
    if not dockerfile.exists() and dockerfile_hud.exists():
        shutil.copy2(dockerfile_hud, dockerfile)
    if not dockerfile.exists():
        raise ReleaseError(
            "harden_task_materialization_failed",
            f"no Dockerfile materialized from {source}",
        )
    _append_pre_grader_startup(dockerfile, surfaces)


def _copytree_filtered(source: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    for child in source.iterdir():
        if child.name in _EXCLUDE_DIRS or child.suffix in _EXCLUDE_SUFFIXES:
            continue
        target = destination / child.name
        if child.is_dir():
            _copytree_filtered(child, target)
        elif child.is_file():
            shutil.copy2(child, target)


def _relative_files(root: Path) -> set[str]:
    return {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file()
        and path.name not in _EXCLUDE_DIRS
        and path.suffix not in _EXCLUDE_SUFFIXES
    }


def _verifier_asset_paths(surfaces: list[dict[str, Any]]) -> set[Path]:
    paths: set[Path] = set()
    for surface in surfaces:
        paths.update(_paths_from_argv(surface.get("grader_command_argv") or []))
    return paths


def _paths_from_argv(argv: list[Any]) -> set[Path]:
    if not isinstance(argv, list):
        return set()
    tokens: list[str] = []
    for index, raw in enumerate(argv):
        if not isinstance(raw, str):
            continue
        tokens.append(raw)
        if index > 0 and argv[index - 1] in {"-c", "-lc"}:
            try:
                tokens.extend(shlex.split(raw))
            except ValueError:
                continue

    paths: set[Path] = set()
    for token in tokens:
        cleaned = token.strip().strip("\"'")
        if not cleaned or cleaned.startswith("-") or "://" in cleaned:
            continue
        rel = _normalize_command_path(cleaned)
        if rel is None:
            continue
        paths.add(rel)
    return paths


def _normalize_command_path(value: str) -> Path | None:
    if value.startswith("/app/"):
        value = value[len("/app/") :]
    elif value.startswith("/tests/"):
        value = value[len("/tests/") :]
    elif value.startswith("./"):
        value = value[2:]
    elif value.startswith("/") or value in {".", ".."} or value.startswith("../"):
        return None

    path = Path(value)
    if any(part in {"", ".", ".."} for part in path.parts):
        return None
    if len(path.parts) == 1 and "." not in path.name:
        return None
    return path


def _resolve_asset_path(source: Path, rel_path: Path) -> Path | None:
    candidates = [source / rel_path]
    if rel_path.parts and rel_path.parts[0] == "tests":
        candidates.append(source / Path(*rel_path.parts[1:]))
    else:
        candidates.append(source / "tests" / rel_path)
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def _tests_destination_path(rel_path: Path) -> Path:
    if rel_path.parts and rel_path.parts[0] == "tests":
        return Path(*rel_path.parts[1:]) if len(rel_path.parts) > 1 else rel_path
    return rel_path


def _write_test_sh(
    path: Path, surfaces: list[dict[str, Any]], verifier_files: set[str]
) -> None:
    pre_grader_argv = _single_pre_grader_argv(surfaces)
    grader_argv = _single_grader_argv(surfaces)
    pre_command = _shell_command_from_argv(pre_grader_argv) if pre_grader_argv else None
    command = _shell_command_from_argv(
        _rewrite_grader_argv_for_harden_tests(grader_argv, verifier_files)
    )
    prelude = f"{pre_command}\n" if pre_command else ""
    path.write_text(
        "#!/usr/bin/env bash\n"
        "set +e\n"
        f"{prelude}"
        "cd /\n"
        "unset PYTHONPATH PYTHONHOME\n"
        "export PYTHONNOUSERSITE=1\n"
        "export PYTHONSAFEPATH=1\n"
        "export PYTEST_DISABLE_PLUGIN_AUTOLOAD=1\n"
        f"{command}\n"
        "rc=$?\n"
        "mkdir -p /logs/verifier\n"
        'if [ "$rc" -eq 0 ]; then echo 1 > /logs/verifier/reward.txt; else echo 0 > /logs/verifier/reward.txt; fi\n'
        "exit 0\n",
        encoding="utf-8",
    )
    path.chmod(0o755)


def _single_pre_grader_argv(surfaces: list[dict[str, Any]]) -> list[str]:
    commands = {
        json.dumps(surface.get("pre_grader_command_argv") or [], sort_keys=True)
        for surface in surfaces
    }
    if len(commands) != 1:
        raise ReleaseError(
            "harden_task_materialization_failed",
            "cannot materialize one harden task for mixed pre-grader commands",
        )
    command = surfaces[0].get("pre_grader_command_argv") or []
    if not isinstance(command, list) or not all(
        isinstance(item, str) for item in command
    ):
        raise ReleaseError(
            "harden_task_materialization_failed",
            "invalid pre_grader_command_argv in replay surface",
        )
    return command


def _single_grader_argv(surfaces: list[dict[str, Any]]) -> list[str]:
    commands = {
        json.dumps(surface.get("grader_command_argv"), sort_keys=True)
        for surface in surfaces
    }
    if len(commands) != 1:
        raise ReleaseError(
            "harden_task_materialization_failed",
            "cannot materialize one harden task for mixed grader commands",
        )
    command = surfaces[0].get("grader_command_argv")
    if not isinstance(command, list) or not all(
        isinstance(item, str) for item in command
    ):
        raise ReleaseError(
            "harden_task_materialization_failed",
            "invalid grader_command_argv in replay surface",
        )
    return command


def _append_pre_grader_startup(
    dockerfile: Path, surfaces: list[dict[str, Any]]
) -> None:
    pre_grader_argv = _single_pre_grader_argv(surfaces)
    if not pre_grader_argv:
        return
    startup = _shell_command_from_argv(pre_grader_argv) + "; tail -f /dev/null"
    with dockerfile.open("a", encoding="utf-8") as handle:
        handle.write(
            "\n# Added by Chronos Plan 005: keep the harden terminal container on the\n"
            "# sealed replay surface's pre-grader service state.\n"
            f"RUN printf '%s\\n' {_quote_shell_arg(_shell_command_from_argv(pre_grader_argv))} >> /root/.bashrc && "
            f"printf '%s\\n' {_quote_shell_arg(_shell_command_from_argv(pre_grader_argv))} >> /etc/bash.bashrc\n"
            "ENTRYPOINT []\n"
            f"CMD [{', '.join(json.dumps(part) for part in ['bash', '-lc', startup])}]\n"
        )


def _shell_command_from_argv(argv: list[str]) -> str:
    return " ".join(_quote_shell_arg(part) for part in argv)


def _rewrite_grader_argv_for_harden_tests(
    argv: list[str], verifier_files: set[str]
) -> list[str]:
    verifier_assets = set(verifier_files)
    if not verifier_assets:
        return list(argv)
    rewritten: list[str] = []
    for index, raw in enumerate(argv):
        if index > 0 and argv[index - 1] in {"-c", "-lc"}:
            rewritten.append(
                _rewrite_shell_command_for_harden_tests(raw, verifier_assets)
            )
        else:
            rewritten.append(_rewrite_token_for_harden_tests(raw, verifier_assets))
    return rewritten


def _rewrite_shell_command_for_harden_tests(
    command: str, verifier_assets: set[str]
) -> str:
    try:
        tokens = shlex.split(command)
    except ValueError:
        return command
    if not tokens:
        return command
    rewritten = command
    for token in tokens:
        replacement = _rewrite_token_for_harden_tests(token, verifier_assets)
        if replacement != token:
            rewritten = rewritten.replace(token, replacement)
    return rewritten


def _rewrite_token_for_harden_tests(token: str, verifier_assets: set[str]) -> str:
    rel = _normalize_command_path(token)
    if rel is None:
        return token
    dest = _tests_destination_path(rel).as_posix()
    if dest not in verifier_assets:
        return token
    return f"/tests/{dest}"


def _quote_shell_arg(value: str) -> str:
    if value and all(ch.isalnum() or ch in "._/-:=," for ch in value):
        return value
    return "'" + value.replace("'", "'\"'\"'") + "'"


def _write_task_toml(path: Path) -> None:
    path.write_text(
        'version = "1.0"\n\n'
        "[metadata]\n"
        'author_name = "chronos"\n'
        'difficulty = "unknown"\n'
        'category = "release-hardening"\n'
        'tags = ["chronos", "harden-v0"]\n\n'
        "[verifier]\n"
        "timeout_sec = 360.0\n\n"
        "[agent]\n"
        "timeout_sec = 3600.0\n\n"
        "[environment]\n"
        "build_timeout_sec = 900.0\n"
        "cpus = 1\n"
        "memory_mb = 2048\n"
        "storage_mb = 10240\n"
        "gpus = 0\n\n"
        "[verifier.env]\n",
        encoding="utf-8",
    )


def _write_surface_manifest(
    path: Path,
    *,
    proof_set: dict[str, Any],
    task_assets_source: Path,
) -> None:
    record = {
        "schema_version": 1,
        "proof_set_id": proof_set["proof_set_id"],
        "task_assets_source": str(task_assets_source),
        "v1_replay_surfaces": proof_set["v1_replay_surfaces"],
        "created_at": utc_now(),
    }
    record["content_digest"] = digest_json(record)
    path.write_text(
        json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
