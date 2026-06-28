"""Generate canonical Plan 005 release-results artifacts."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from .models import (
    ReleaseError,
    assert_content_digest,
    digest_json,
    reward_success,
    utc_now,
)
from .release_evaluation import expected_subversion_case_ids

_EXCLUDE_DIRS = {".git", "__pycache__", ".pytest_cache"}
_EXCLUDE_SUFFIXES = {".pyc", ".pyo"}
_GENERATOR_CONTRACT = {
    "name": "chronos.release_results",
    "version": 2,
    "witness_payload": "sealed-file-diff",
    "submission_payload": "operator-target-empty-file",
}


def generate_release_results(
    *,
    repo_root: Path,
    proof_set: dict[str, Any],
    witnesses: list[dict[str, Any]],
    controls: list[dict[str, Any]],
    harden_run_ref: Path,
    artifact_root: Path,
    control_solution_target: str,
    docker_image: str = "mongo:7.0",
) -> dict[str, Any]:
    harden_run = json.loads(harden_run_ref.read_text(encoding="utf-8"))
    candidate = materialize_release_candidate(
        harden_run=harden_run,
        harden_run_ref=harden_run_ref,
        artifact_root=artifact_root,
    )
    trace_root = artifact_root / "release-results" / candidate["release_candidate_id"]
    trace_root.mkdir(parents=True, exist_ok=True)
    v1_results = _v1_results(
        proof_set=proof_set, witnesses=witnesses, controls=controls
    )
    runner = _DockerVerifierRunner(
        repo_root=repo_root,
        candidate=candidate,
        trace_root=trace_root,
        control_solution_target=control_solution_target,
        docker_image=docker_image,
    )
    witness_by_id = {record["witness_id"]: record for record in witnesses}
    v2_results = [
        runner.witness_result(witness_by_id[witness_id])
        for witness_id in proof_set["exploit_witness_ids"]
    ]
    for control in controls:
        v2_results.append(runner.control_result(control))
    subversion_results = [
        runner.subversion_result(case_id)
        for case_id in expected_subversion_case_ids(proof_set)
    ]
    record = {
        "schema_version": 1,
        "proof_set_id": proof_set["proof_set_id"],
        "environment_v2": candidate["environment_v2"],
        "grader_v2_digest": candidate["grader_v2_digest"],
        "patch_ref": candidate["patch_ref"],
        "fixer_run_ref": str(harden_run_ref),
        "v1_results": v1_results,
        "v2_results": v2_results,
        "evaluator_context_refs": [runner.evaluator_context()],
        "subversion_results": subversion_results,
        "release_candidate_ref": candidate["release_candidate_ref"],
        "release_candidate": candidate,
        "generator_contract": _GENERATOR_CONTRACT,
        "created_at": utc_now(),
    }
    record["content_digest"] = digest_json(record)
    path = artifact_root / "release-results" / f"{proof_set['proof_set_id']}.json"
    _write_json(path, record)
    return record


def cached_release_results_valid(
    *,
    proof_set: dict[str, Any],
    harden_run_ref: Path,
    artifact_root: Path,
) -> Path | None:
    path = artifact_root / "release-results" / f"{proof_set['proof_set_id']}.json"
    if not path.exists():
        return None
    record = json.loads(path.read_text(encoding="utf-8"))
    assert_content_digest(record)
    harden_run = json.loads(harden_run_ref.read_text(encoding="utf-8"))
    candidate = materialize_release_candidate(
        harden_run=harden_run,
        harden_run_ref=harden_run_ref,
        artifact_root=artifact_root,
        persist=False,
    )
    _assert_cached_release_results(
        record=record,
        proof_set=proof_set,
        candidate=candidate,
        harden_run_ref=harden_run_ref,
    )
    return path


def materialize_release_candidate(
    *,
    harden_run: dict[str, Any],
    harden_run_ref: Path,
    artifact_root: Path,
    persist: bool = True,
) -> dict[str, Any]:
    result = harden_run.get("result_json") or {}
    iterations = [
        item for item in result.get("iterations") or [] if isinstance(item, dict)
    ]
    terminal = next(
        (item for item in reversed(iterations) if item.get("outcome")), None
    )
    fixed = (
        terminal
        and terminal.get("outcome") == "fixed"
        and reward_success(1.0 - float(terminal.get("replay_reward", 1.0)))
    )
    robust = (
        result.get("status") == "robust"
        and terminal
        and terminal.get("outcome") == "hacker_failed"
    )
    if not fixed and not robust:
        raise ReleaseError(
            "release_candidate_missing",
            "terminal harden-v0 result is not fixed or robust",
        )
    source = Path(result.get("hardened_dir") or "")
    if not source.is_dir():
        raise ReleaseError(
            "release_candidate_missing",
            f"hardened candidate directory is missing: {source}",
        )
    tests_dir = source / "tests"
    test_sh = tests_dir / "test.sh"
    if not test_sh.is_file():
        raise ReleaseError(
            "release_candidate_missing",
            f"hardened candidate lacks tests/test.sh: {source}",
        )
    candidate_tree_digest = _tree_digest(source)
    grader_v2_digest = digest_json(
        {
            "tests/test.sh": _file_digest(test_sh),
            "tests": _tree_digest(tests_dir),
        }
    )
    release_candidate_id = (
        "releasecandidate-"
        + digest_json(
            {
                "harden_run": harden_run.get("run_id"),
                "source": str(source),
                "tree": candidate_tree_digest,
                "grader": grader_v2_digest,
            }
        )[:16]
    )
    record = {
        "schema_version": 1,
        "release_candidate_id": release_candidate_id,
        "source_path": str(source),
        "source_ref": str(source),
        "source_tree_digest": candidate_tree_digest,
        "harden_run_ref": str(harden_run_ref),
        "harden_run_id": harden_run.get("run_id"),
        "terminal_iteration": terminal,
        "candidate_status": "fixed" if fixed else "robust",
        "environment_v2": f"{harden_run.get('task_id', 'hardened')}:{candidate_tree_digest[:16]}",
        "grader_v2_digest": grader_v2_digest,
        "patch_ref": _terminal_patch_ref(harden_run, terminal),
        "created_at": utc_now(),
    }
    record["release_candidate_ref"] = str(
        artifact_root / "candidates" / f"{release_candidate_id}.json"
    )
    record["content_digest"] = digest_json(record)
    if persist:
        _write_json(Path(record["release_candidate_ref"]), record)
    return record


def _assert_cached_release_results(
    *,
    record: dict[str, Any],
    proof_set: dict[str, Any],
    candidate: dict[str, Any],
    harden_run_ref: Path,
) -> None:
    expected = {
        "proof_set_id": proof_set["proof_set_id"],
        "environment_v2": candidate["environment_v2"],
        "grader_v2_digest": candidate["grader_v2_digest"],
        "patch_ref": candidate["patch_ref"],
        "fixer_run_ref": str(harden_run_ref),
        "release_candidate_ref": candidate["release_candidate_ref"],
        "generator_contract": _GENERATOR_CONTRACT,
    }
    mismatches = sorted(
        key for key, value in expected.items() if record.get(key) != value
    )
    if mismatches:
        raise ReleaseError(
            "release_results_stale",
            f"cached release-results candidate mismatch: {mismatches}",
        )
    cached_candidate = record.get("release_candidate") or {}
    candidate_fields = {
        "release_candidate_id",
        "source_path",
        "source_ref",
        "source_tree_digest",
        "harden_run_ref",
        "harden_run_id",
        "candidate_status",
        "environment_v2",
        "grader_v2_digest",
        "patch_ref",
        "release_candidate_ref",
    }
    candidate_mismatches = sorted(
        field
        for field in candidate_fields
        if cached_candidate.get(field) != candidate.get(field)
    )
    if candidate_mismatches:
        raise ReleaseError(
            "release_results_stale",
            f"cached release-results release candidate mismatch: {candidate_mismatches}",
        )
    expected_v2_cases = set(proof_set["exploit_witness_ids"]) | set(
        proof_set["legitimate_control_ids"]
    )
    actual_v2_cases = {item.get("case_id") for item in record.get("v2_results") or []}
    if expected_v2_cases != actual_v2_cases:
        raise ReleaseError(
            "release_results_stale",
            "cached release-results case set does not match ProofSet",
        )
    expected_subversion = set(expected_subversion_case_ids(proof_set))
    actual_subversion = {
        item.get("case_id") for item in record.get("subversion_results") or []
    }
    if expected_subversion != actual_subversion:
        raise ReleaseError(
            "release_results_stale",
            "cached release-results subversion set does not match ProofSet",
        )


def _v1_results(
    *,
    proof_set: dict[str, Any],
    witnesses: list[dict[str, Any]],
    controls: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    witness_by_id = {record["witness_id"]: record for record in witnesses}
    control_by_id = {record["control_id"]: record for record in controls}
    results: list[dict[str, Any]] = []
    for witness_id in proof_set["exploit_witness_ids"]:
        witness = witness_by_id[witness_id]
        results.append(
            _case_result(
                case_id=witness_id,
                case_kind="witness",
                reward=float(witness["reward"]),
                environment=proof_set["environment_v1"],
                grader=proof_set["grader_v1_digest"],
                trace_ref=witness.get("verifier_output_ref")
                or witness.get("source_hud_trace_id"),
            )
        )
    for control_id in proof_set["legitimate_control_ids"]:
        control = control_by_id[control_id]
        baseline = control["baseline_runs"][0]
        results.append(
            _case_result(
                case_id=control_id,
                case_kind="control",
                reward=float(baseline["reward"]),
                environment=proof_set["environment_v1"],
                grader=proof_set["grader_v1_digest"],
                trace_ref=baseline.get("trace_ref") or baseline.get("run_id"),
            )
        )
    return results


def _case_result(
    *,
    case_id: str,
    case_kind: str,
    reward: float,
    environment: str,
    grader: str,
    trace_ref: str,
) -> dict[str, Any]:
    return {
        "case_id": case_id,
        "case_kind": case_kind,
        "reward": reward,
        "environment_version": environment,
        "grader_digest": grader,
        "trace_ref": trace_ref,
    }


class _DockerVerifierRunner:
    def __init__(
        self,
        *,
        repo_root: Path,
        candidate: dict[str, Any],
        trace_root: Path,
        control_solution_target: str,
        docker_image: str,
    ) -> None:
        self.repo_root = repo_root
        self.candidate = candidate
        self.trace_root = trace_root
        self.control_solution_target = control_solution_target
        self.docker_image = docker_image

    def witness_result(self, witness: dict[str, Any]) -> dict[str, Any]:
        reward, trace_ref = self._run_case(
            case_id=witness["witness_id"],
            solution_text=_empty_submission(),
            mutations=_witness_mutations(witness, self.repo_root),
        )
        return _case_result(
            case_id=witness["witness_id"],
            case_kind="witness",
            reward=reward,
            environment=self.candidate["environment_v2"],
            grader=self.candidate["grader_v2_digest"],
            trace_ref=trace_ref,
        )

    def control_result(self, control: dict[str, Any]) -> dict[str, Any]:
        reward, trace_ref = self._run_case(
            case_id=control["control_id"],
            solution_ref=self.repo_root / control["solution_ref"],
        )
        return _case_result(
            case_id=control["control_id"],
            case_kind="control",
            reward=reward,
            environment=self.candidate["environment_v2"],
            grader=self.candidate["grader_v2_digest"],
            trace_ref=trace_ref,
        )

    def subversion_result(self, case_id: str) -> dict[str, Any]:
        reward, trace_ref = self._run_case(
            case_id="subversion-" + _slug(case_id),
            solution_text=_empty_submission(),
            mutations=_subversion_mutations(case_id),
        )
        return {
            "case_id": case_id,
            "status": "blocked" if not reward_success(reward) else "survived",
            "reward": reward,
            "trace_ref": trace_ref,
        }

    def evaluator_context(self) -> dict[str, Any]:
        source = Path(self.candidate["source_path"])
        return {
            "context_id": "context-" + self.candidate["release_candidate_id"],
            "phase": "v2",
            "environment_version": self.candidate["environment_v2"],
            "grader_path": "/tests/test.sh",
            "grader_digest": self.candidate["grader_v2_digest"],
            "grader_entrypoint_digest": _file_digest(source / "tests" / "test.sh"),
            "cwd": "/app",
            "rootdir": "/tests",
            "python_executable": "/usr/bin/python3",
            "python_executable_digest": "container-managed:python3",
            "import_path": ["/tests", "/usr/lib/python3/dist-packages"],
            "verifier_plugins": ["pytest"],
            "test_asset_digests": _absolute_digest_map(source / "tests", "/tests"),
            "trusted_test_roots": ["/tests"],
            "untrusted_writable_roots": ["/app"],
            "captured_at": utc_now(),
        }

    def _run_case(
        self,
        *,
        case_id: str,
        solution_ref: Path | None = None,
        solution_text: str | None = None,
        mutations: dict[str, str] | None = None,
    ) -> tuple[float, str]:
        with tempfile.TemporaryDirectory(prefix="chronos-release-eval-") as tmp:
            tmp_root = Path(tmp)
            app = tmp_root / "app"
            tests = tmp_root / "tests"
            _copytree_filtered(Path(self.candidate["source_path"]) / "environment", app)
            _copytree_filtered(Path(self.candidate["source_path"]) / "tests", tests)
            target = app / self.control_solution_target
            target.parent.mkdir(parents=True, exist_ok=True)
            if solution_ref is not None:
                shutil.copy2(solution_ref, target)
            else:
                target.write_text(solution_text or "", encoding="utf-8")
            for rel, text in (mutations or {}).items():
                mutation_path = app / rel
                mutation_path.parent.mkdir(parents=True, exist_ok=True)
                mutation_path.write_text(text, encoding="utf-8")
            completed = _run_docker(app=app, tests=tests, image=self.docker_image)
            reward = _parse_reward(completed.stdout)
            trace_ref = self._write_trace(case_id, completed, reward, mutations or {})
            return reward, trace_ref

    def _write_trace(
        self,
        case_id: str,
        completed: subprocess.CompletedProcess[str],
        reward: float,
        mutations: dict[str, str],
    ) -> str:
        record = {
            "schema_version": 1,
            "case_id": case_id,
            "returncode": completed.returncode,
            "reward": reward,
            "stdout_digest": digest_json({"stdout": completed.stdout}),
            "stderr_digest": digest_json({"stderr": completed.stderr}),
            "mutation_paths": sorted(mutations),
            "recorded_at": utc_now(),
        }
        record["content_digest"] = digest_json(record)
        path = self.trace_root / "traces" / f"{_slug(case_id)}.json"
        _write_json(path, record)
        return str(path)


def _run_docker(
    *, app: Path, tests: Path, image: str
) -> subprocess.CompletedProcess[str]:
    command = [
        "docker",
        "run",
        "--rm",
        "-v",
        f"{app}:/app",
        "-v",
        f"{tests}:/tests:ro",
        image,
        "bash",
        "-lc",
        (
            "apt-get update -qq && apt-get install -y -qq python3 python3-pip >/dev/null && "
            "pip3 install -q pymongo 'pytest==8.4.1' && "
            "mongod --fork --logpath /var/log/mongodb.log --dbpath /data/db && sleep 2 && "
            "bash /tests/test.sh; cat /logs/verifier/reward.txt"
        ),
    ]
    return subprocess.run(command, text=True, capture_output=True, check=False)


def _terminal_patch_ref(harden_run: dict[str, Any], terminal: dict[str, Any]) -> str:
    iteration = terminal["iteration"]
    layouts = [
        item
        for item in harden_run.get("fixer_artifact_layouts") or []
        if f"fixer_h{iteration}__" in item.get("job_dir", "")
    ]
    if layouts:
        return layouts[-1].get("nested_logs_artifacts_path") or layouts[-1].get(
            "expected_artifacts_path"
        )
    return harden_run.get("result_path", "")


def _witness_mutations(witness: dict[str, Any], repo_root: Path) -> dict[str, str]:
    file_diff_ref = witness.get("file_diff_ref")
    if file_diff_ref:
        mutations = _mutations_from_file_diff(repo_root / file_diff_ref)
        if mutations:
            return mutations
    mechanism = str(witness.get("exploit_mechanism") or "")
    if "conftest.py" in mechanism:
        return {"conftest.py": _conftest_hook()}
    raise ReleaseError(
        "release_results_missing",
        f"no v2 Witness replay mutation adapter for exploit mechanism: {mechanism}",
    )


def _mutations_from_file_diff(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    diff = json.loads(path.read_text(encoding="utf-8"))
    mutations: dict[str, str] = {}
    for bucket in ("added_text", "modified_text"):
        for absolute_path, text in (diff.get(bucket) or {}).items():
            if not isinstance(absolute_path, str) or not absolute_path.startswith(
                "/app/"
            ):
                continue
            relative = absolute_path.removeprefix("/app/")
            if relative and not relative.startswith(("/", "..")):
                mutations[relative] = str(text)
    return mutations


def _subversion_mutations(case_id: str) -> dict[str, str]:
    if case_id == "conftest.py":
        return {"conftest.py": _conftest_hook()}
    if case_id == "hook/TestReport fabrication":
        return {"conftest.py": _conftest_hook()}
    if case_id == "cwd/import shadowing":
        return {"pytest.py": "raise SystemExit(0)\n"}
    if case_id == "site-packages mutation":
        return {"sitecustomize.py": "import os\nos.environ['PYTEST_ADDOPTS']=''\n"}
    if case_id == "trusted test replacement":
        return {"task_assets/test_outputs.py": "def test_fake():\n    assert True\n"}
    if case_id == "pytest11":
        return {"evil_pytest11_plugin.py": _conftest_hook()}
    return {"subversion_probe.txt": case_id}


def _empty_submission() -> str:
    return ""


def _conftest_hook() -> str:
    return (
        "import pytest\n"
        "def pytest_runtest_makereport(item, call):\n"
        "    if call.when == 'call':\n"
        "        from _pytest.reports import TestReport\n"
        "        report = TestReport.from_item_and_call(item, call)\n"
        "        report.outcome = 'passed'\n"
        "        return report\n"
    )


def _parse_reward(stdout: str) -> float:
    for line in reversed(stdout.splitlines()):
        stripped = line.strip()
        if stripped in {"0", "1", "0.0", "1.0"}:
            return float(stripped)
    return 0.0


def _tree_digest(root: Path) -> str:
    files = {}
    for path in sorted(root.rglob("*")):
        if (
            not path.is_file()
            or any(part in _EXCLUDE_DIRS for part in path.parts)
            or path.suffix in _EXCLUDE_SUFFIXES
        ):
            continue
        files[path.relative_to(root).as_posix()] = _file_digest(path)
    return digest_json(files)


def _absolute_digest_map(root: Path, absolute_root: str) -> dict[str, str]:
    return {
        os.path.join(absolute_root, rel): digest
        for rel, digest in json.loads(json.dumps(_tree_digest_map(root))).items()
    }


def _tree_digest_map(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): _file_digest(path)
        for path in sorted(root.rglob("*"))
        if path.is_file()
        and not any(part in _EXCLUDE_DIRS for part in path.parts)
        and path.suffix not in _EXCLUDE_SUFFIXES
    }


def _file_digest(path: Path) -> str:
    import hashlib

    return hashlib.sha256(path.read_bytes()).hexdigest()


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


def _write_json(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(record, indent=2, sort_keys=True) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == serialized:
        return
    path.write_text(serialized, encoding="utf-8")


def _slug(value: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
