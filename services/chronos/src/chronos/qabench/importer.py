"""Terminal-Wrench-to-HUD importer template (Plan 008 WP1).

Generalizes the single hand-built mongodb env into a reusable importer: it
discovers a Terminal Wrench task on disk (the shared `original_task` layout —
`environment/Dockerfile`, `tests/test_outputs.py` + `test.sh`, `instruction.md`,
`solution/solve.sh`), parses the Dockerfile for the base image and workdir,
rewrites a private Terminal-Bench base mirror to its public ghcr.io equivalent,
decides deployability, and plans a per-task env layout (env + v1 grader + a
sterile `clean_verify` referee entrypoint) with a content-addressed provenance.

OFFLINE planner: it reads pinned sources and writes layouts; it does NOT deploy
to HUD (that live step is wired separately). Targets the stable Plan 001 env
pattern and Plan 002 ForkPoint contract, not Plan 003 code.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import stat
import uuid
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

_PUBLIC_REGISTRIES = frozenset(
    {"docker.io", "registry.hub.docker.com", "ghcr.io", "quay.io", "public.ecr.aws"}
)
_PREFERRED_MODELS = ("claude-opus-4.6", "gemini-3.1-pro")
_TASK_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
# Verified public ghcr.io Terminal-Bench base images, keyed by mirror variant.
# Each value is a (tag, manifest_digest) pinned and checked against the ghcr.io
# registry on 2026-06-21 (see evidence/008). The public tag is NOT uniform across
# variants, so only variants verified here are rewritten; anything else is left
# unchanged for deployability() to flag honestly.
_TBENCH_REPO = "ghcr.io/laude-institute/t-bench"
_TBENCH_PUBLIC: dict[str, tuple[str, str]] = {
    "ubuntu-24-04": (
        "20250624",
        "sha256:d34916434f1304da8b1fc7aeb547d1bee53770a4c4fe0ff4637eaca293d648d5",
    ),
    "python-3-13": (
        "20250620",
        "sha256:236734f0cafcce942ca09316d57236c2273a2b5411e116454a22cf6d718d95f5",
    ),
}

CLEAN_VERIFY_TEMPLATE = """#!/usr/bin/env bash
# Sterile clean_verify referee entrypoint (Plan 008). Runs the task's own v1
# verification from a trusted tests root with conftest discovery confined to it,
# so agent-planted conftest.py / cache cannot influence the verdict; the task's
# own required pytest plugins still load. The isolated trusted-asset sandbox is
# wired in WP1/WP3.
set -euo pipefail
TRUSTED_TESTS="${CLEAN_VERIFY_TESTS:-task_assets}"
exec python -m pytest -p no:cacheprovider --confcutdir "$TRUSTED_TESTS" -q "$TRUSTED_TESTS" "$@"
"""


def validate_task_id(task_id: str) -> str:
    """Return a safe Terminal-Wrench task id or reject it before path use."""
    if not isinstance(task_id, str) or _TASK_ID_RE.fullmatch(task_id) is None:
        raise ValueError("task id must match ^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
    return task_id


def task_slug(task_id: str) -> str:
    """Return the canonical, directory-safe slug for a validated source id."""
    return validate_task_id(task_id).lower().replace("_", "-")


def validate_task_slug(slug: str) -> str:
    """Accept only the canonical slug emitted by :func:`task_slug`."""
    validate_task_id(slug)
    if slug != slug.lower() or "_" in slug:
        raise ValueError("task slug must be lowercase and use hyphens, not underscores")
    return slug


_STAGE_MARKER = ".origin-qabench-stage"


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _content_digest(provenance: dict[str, str]) -> str:
    payload = {k: v for k, v in provenance.items() if k != "content_digest"}
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True).encode("utf-8")
    ).hexdigest()


def _snapshot_regular_file(path: Path, allowed_root: Path | None = None) -> bytes:
    """Read one regular, non-symlinked file into an immutable planning snapshot."""
    if allowed_root is not None:
        _assert_source_path_no_symlinks(allowed_root, path)
    try:
        metadata = path.lstat()
    except OSError as exc:
        raise ValueError(f"unable to snapshot source file: {path}") from exc
    if stat.S_ISLNK(metadata.st_mode):
        raise ValueError(f"source symlink is not an approved build asset: {path}")
    if not stat.S_ISREG(metadata.st_mode):
        raise ValueError(f"source is not a regular file: {path}")
    if allowed_root is not None:
        try:
            path.resolve(strict=True).relative_to(allowed_root.resolve(strict=True))
        except ValueError as exc:
            raise ValueError(f"source is outside approved build root: {path}") from exc
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise ValueError(f"unable to open source snapshot without following links: {path}") from exc
    try:
        opened = os.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode):
            raise ValueError(f"source is not a regular file: {path}")
        chunks: list[bytes] = []
        while chunk := os.read(descriptor, 1024 * 1024):
            chunks.append(chunk)
        return b"".join(chunks)
    finally:
        os.close(descriptor)


def _assert_source_path_no_symlinks(root: Path, path: Path) -> None:
    """Reject every lexical symlink from a reviewed context root to its asset."""
    root_absolute = root.absolute()
    path_absolute = path.absolute()
    try:
        relative = path_absolute.relative_to(root_absolute)
    except ValueError as exc:
        raise ValueError(f"source is outside approved build root: {path}") from exc
    current = root_absolute
    for component in (".", *relative.parts):
        if component != ".":
            current /= component
        try:
            metadata = current.lstat()
        except OSError as exc:
            raise ValueError(f"unable to inspect source path: {current}") from exc
        if stat.S_ISLNK(metadata.st_mode):
            raise ValueError(f"source path contains a symlink: {current}")


def _snapshot_dir_digest(files: dict[str, bytes]) -> str:
    """Stable digest over the exact selected build-context byte snapshots."""
    h = hashlib.sha256()
    for relative, data in sorted(files.items()):
        h.update(relative.encode("utf-8"))
        h.update(b"\0")
        h.update(data)
        h.update(b"\0")
    return h.hexdigest()


def _validate_public_asset_path(context: Path, relative: str) -> tuple[str, Path]:
    """Validate one reviewed, relative Docker-context asset before source access."""
    if not isinstance(relative, str):
        raise ValueError("reviewed public build asset path must be a string")
    pure = PurePosixPath(relative)
    if (
        not relative
        or pure.is_absolute()
        or any(part in {"", ".", ".."} for part in pure.parts)
        or "\\" in relative
        or pure.as_posix() != relative
        or relative == "Dockerfile"
    ):
        raise ValueError(f"invalid reviewed public build-asset path: {relative!r}")
    candidate = context.joinpath(*pure.parts)
    return relative, candidate


def _assert_no_symlink(path: Path) -> None:
    """Fail closed if any existing component of an output path is a symlink."""
    absolute = path.absolute()
    current = Path(absolute.anchor)
    for component in absolute.parts[1:]:
        current /= component
        try:
            metadata = current.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(metadata.st_mode):
            raise ValueError(f"destination path contains a symlink: {current}")


def _ensure_real_directory(path: Path) -> None:
    _assert_no_symlink(path)
    path.mkdir(parents=True, exist_ok=True)
    _assert_no_symlink(path)
    if not path.is_dir():
        raise ValueError(f"destination parent is not a directory: {path}")


def _atomic_write(target: Path, data: bytes, mode: int | None = None) -> None:
    """Write a new regular file without following a prepared destination symlink."""
    _ensure_real_directory(target.parent)
    if target.exists() or target.is_symlink():
        metadata = target.lstat()
        if stat.S_ISLNK(metadata.st_mode):
            raise ValueError(f"destination file is a symlink: {target}")
        raise ValueError(f"refusing to overwrite destination file: {target}")
    temporary = target.parent / f".{target.name}.tmp-{uuid.uuid4().hex}"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(temporary, flags, 0o600)
    try:
        view = memoryview(data)
        while view:
            written = os.write(descriptor, view)
            view = view[written:]
        if mode is not None:
            os.fchmod(descriptor, mode)
    finally:
        os.close(descriptor)
    os.replace(temporary, target)


def _remove_owned_stage(stage: Path) -> None:
    """Clean only the private staging directory we created and can authenticate."""
    marker = stage.parent / f"{stage.name}.{_STAGE_MARKER}"
    if not stage.exists():
        return
    _assert_no_symlink(stage)
    if (
        not stage.is_dir()
        or marker.is_symlink()
        or not marker.is_file()
        or marker.read_bytes() != b"origin-qabench-stage\n"
    ):
        raise ValueError(f"refusing to remove unowned staging directory: {stage}")
    shutil.rmtree(stage)
    marker.unlink()


def _tbench_variant_of(base_image: str) -> str:
    """Extract the Terminal-Bench variant from a mirror or public base image."""
    if "t-bench-" in base_image:  # private mirror tag, e.g. ...:t-bench-python-3-13
        return base_image.rsplit("t-bench-", 1)[1].split(":")[0].split("/")[0].strip()
    if base_image.startswith(f"{_TBENCH_REPO}/"):  # public ghcr image
        return base_image[len(_TBENCH_REPO) + 1 :].split(":")[0].split("@")[0].strip()
    return ""


def rewrite_base_image(base_image: str) -> tuple[str, bool, str]:
    """Map a base image to a verified public ghcr.io ref, returning a pinned digest.

    The Alibaba `skylensage-registry...aliyuncs.com/...:t-bench-<variant>` images are
    private mirrors of public `ghcr.io/laude-institute/t-bench/<variant>` images, but
    the public tag differs per variant, so only variants verified in `_TBENCH_PUBLIC`
    are rewritten. Returns `(image, rewritten, digest)`; `digest` is the pinned
    manifest digest when known (for both rewritten mirrors and already-public ghcr
    images) and `""` otherwise. Unknown variants and non-mirror images pass through.
    """
    if "aliyuncs.com" in base_image and "t-bench-" in base_image:
        entry = _TBENCH_PUBLIC.get(_tbench_variant_of(base_image))
        if entry is not None:
            tag, digest = entry
            return (
                f"{_TBENCH_REPO}/{_tbench_variant_of(base_image)}:{tag}",
                True,
                digest,
            )
        return base_image, False, ""  # unverified variant: leave private, flag later
    if base_image.startswith(f"{_TBENCH_REPO}/"):  # already-public ghcr base image
        entry = _TBENCH_PUBLIC.get(_tbench_variant_of(base_image))
        if entry is not None and base_image.endswith(f":{entry[0]}"):
            return base_image, False, entry[1]
    return base_image, False, ""


def deployability(base_image: str) -> tuple[bool, str | None]:
    """Decide whether a base image is publicly pullable (no private creds needed)."""
    if not base_image:
        return False, "no base image found in Dockerfile"
    first = base_image.split("/")[0]
    is_registry_host = "." in first or ":" in first
    if "/" in base_image and is_registry_host and first not in _PUBLIC_REGISTRIES:
        return False, f"private registry base image ({first}); needs a public rebuild"
    return True, None


@dataclass(frozen=True)
class TerminalWrenchTask:
    """A discovered, parsed Terminal Wrench task source on disk."""

    task_id: str
    revision: str
    dockerfile_path: Path
    grader_path: Path
    model: str = ""
    test_harness_path: Path | None = None
    instruction_path: Path | None = None
    solution_path: Path | None = None
    base_image: str = ""
    base_original: str = ""
    base_rewritten: bool = False
    base_digest: str = ""
    env_context_dir: Path | None = None
    workdir: str = "/app"
    deployable: bool = True
    skip_reason: str | None = None

    def slug(self) -> str:
        return task_slug(self.task_id)


@dataclass
class ImportedEnvPlan:
    """A planned env layout plus provenance; ``write()`` materializes it to disk."""

    task_id: str
    dest: Path
    files: dict[str, bytes]
    clean_verify_entrypoint: str
    provenance: dict[str, str] = field(default_factory=dict)
    file_contents: dict[str, str] = field(default_factory=dict)

    def _expected_files(self) -> dict[str, bytes]:
        expected = dict(self.files)
        expected.update(
            {relative: text.encode("utf-8") for relative, text in self.file_contents.items()}
        )
        expected["provenance.json"] = (
            json.dumps(self.provenance, indent=2, sort_keys=True) + "\n"
        ).encode("utf-8")
        expected[self.clean_verify_entrypoint] = CLEAN_VERIFY_TEMPLATE.encode("utf-8")
        return expected

    def _verify_existing(self, expected: dict[str, bytes]) -> None:
        _assert_no_symlink(self.dest)
        actual: set[str] = set()
        for parent, directories, names in os.walk(self.dest, followlinks=False):
            parent_path = Path(parent)
            for directory in directories:
                candidate = parent_path / directory
                if stat.S_ISLNK(candidate.lstat().st_mode):
                    raise ValueError(f"destination contains a symlink: {candidate}")
            for name in names:
                candidate = parent_path / name
                metadata = candidate.lstat()
                if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
                    raise ValueError(f"destination contains an unsafe file: {candidate}")
                relative = candidate.relative_to(self.dest).as_posix()
                actual.add(relative)
                if relative not in expected or candidate.read_bytes() != expected[relative]:
                    raise ValueError(f"destination contents do not match planned snapshot: {self.dest}")
        if actual != set(expected):
            raise ValueError(f"destination is incomplete: {self.dest}")

    def write(self) -> Path:
        """Materialize the env layout idempotently and return the env directory."""
        expected = self._expected_files()
        _assert_no_symlink(self.dest)
        if self.dest.exists():
            if not self.dest.is_dir():
                raise ValueError(f"destination is not a directory: {self.dest}")
            existing = list(self.dest.iterdir())
            if existing:
                provenance_path = self.dest / "provenance.json"
                try:
                    existing_provenance = json.loads(
                        provenance_path.read_text(encoding="utf-8")
                    )
                except (OSError, json.JSONDecodeError) as exc:
                    raise ValueError(
                        f"non-empty destination lacks readable provenance: {self.dest}"
                    ) from exc
                if (
                    existing_provenance.get("task_id") != self.task_id
                    or existing_provenance.get("content_digest")
                    != self.provenance.get("content_digest")
                ):
                    raise ValueError(
                        "destination belongs to a different task or content digest: "
                        f"{self.dest}"
                    )
                self._verify_existing(expected)
                return self.dest
        _ensure_real_directory(self.dest.parent)
        stage = self.dest.parent / f".{self.dest.name}.stage-{uuid.uuid4().hex}"
        marker = stage.parent / f"{stage.name}.{_STAGE_MARKER}"
        try:
            stage.mkdir(mode=0o700)
            _atomic_write(marker, b"origin-qabench-stage\n")
            for relative, data in expected.items():
                _atomic_write(
                    stage / relative,
                    data,
                    0o755 if relative == self.clean_verify_entrypoint else None,
                )
            self._verify_existing_at(stage, expected)
            _assert_no_symlink(self.dest.parent)
            if self.dest.exists() or self.dest.is_symlink():
                raise ValueError(f"destination appeared while publishing: {self.dest}")
            os.replace(stage, self.dest)
            marker.unlink()
        except Exception:
            if marker.exists():
                _remove_owned_stage(stage)
            raise
        return self.dest

    @staticmethod
    def _verify_existing_at(destination: Path, expected: dict[str, bytes]) -> None:
        temp = ImportedEnvPlan("", destination, {}, "")
        temp._verify_existing(expected)


def parse_dockerfile(path: Path) -> tuple[str, str]:
    """Return (base_image, workdir); last FROM and last WORKDIR win."""
    base_image = ""
    workdir = "/app"
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        upper = line.upper()
        if upper.startswith("FROM "):
            base_image = (
                line.split(None, 1)[1].split(" AS ")[0].split(" as ")[0].strip()
            )
        elif upper.startswith("WORKDIR "):
            workdir = line.split(None, 1)[1].strip()
    return base_image, workdir


def _rewrite_dockerfile_from(text: str, new_base: str) -> str:
    out = []
    swapped = False
    for raw in text.splitlines():
        if not swapped and raw.strip().upper().startswith("FROM "):
            indent = raw[: len(raw) - len(raw.lstrip())]
            out.append(f"{indent}FROM {new_base}")
            swapped = True
        else:
            out.append(raw)
    return "\n".join(out) + ("\n" if text.endswith("\n") else "")


def discover_task(
    tasks_dir: Path | str,
    task_id: str,
    revision: str = "",
    models: tuple[str, ...] = _PREFERRED_MODELS,
) -> TerminalWrenchTask:
    """Locate + parse one TW task under ``tasks_dir/<task_id>/<model>/original_task``."""
    task_id = validate_task_id(task_id)
    tasks_dir = Path(tasks_dir)
    chosen_model = ""
    original = None
    for model in models:
        candidate = tasks_dir / task_id / model / "original_task"
        if candidate.is_dir():
            chosen_model, original = model, candidate
            break
    if original is None:
        return TerminalWrenchTask(
            task_id=task_id,
            revision=revision,
            dockerfile_path=tasks_dir / task_id,
            grader_path=tasks_dir / task_id,
            deployable=False,
            skip_reason=f"no original_task under models {models}",
        )

    dockerfile = original / "environment" / "Dockerfile"
    grader = original / "tests" / "test_outputs.py"
    harness = original / "tests" / "test.sh"
    instruction = original / "instruction.md"
    solution = original / "solution" / "solve.sh"

    raw_base, workdir = (
        parse_dockerfile(dockerfile) if dockerfile.exists() else ("", "/app")
    )
    base_image, rewritten, base_digest = rewrite_base_image(raw_base)
    deployable, reason = deployability(base_image)
    if not grader.exists():
        deployable, reason = False, "missing tests/test_outputs.py grader"

    return TerminalWrenchTask(
        task_id=task_id,
        revision=revision,
        model=chosen_model,
        dockerfile_path=dockerfile,
        grader_path=grader,
        test_harness_path=harness if harness.exists() else None,
        instruction_path=instruction if instruction.exists() else None,
        solution_path=solution if solution.exists() else None,
        base_image=base_image,
        base_original=raw_base,
        base_rewritten=rewritten,
        base_digest=base_digest,
        env_context_dir=dockerfile.parent if dockerfile.exists() else None,
        workdir=workdir,
        deployable=deployable,
        skip_reason=reason,
    )


def plan_env(
    task: TerminalWrenchTask,
    dest_root: Path | str,
    *,
    public_build_assets: tuple[str, ...] | None = None,
) -> ImportedEnvPlan:
    """Plan one ``envs/qabench/<slug>/`` env layout with stable provenance.

    Idempotent: re-planning a pinned source yields the same ``content_digest``. If
    the base image was rewritten, the materialized Dockerfile gets the public FROM.
    """
    task_id = validate_task_id(task.task_id)
    slug = validate_task_slug(task.slug())
    dest_root = Path(dest_root)
    files: dict[str, bytes] = {
        "task_assets/test_outputs.py": _snapshot_regular_file(task.grader_path)
    }
    file_contents: dict[str, str] = {}
    build_context: dict[str, bytes] = {}
    # Build context is an explicit, revision-bound public allowlist. It must not
    # inherit every source sibling: semantic solution/reference classification is
    # an owner review decision, not a filename heuristic.
    if task.env_context_dir is not None and task.env_context_dir.is_dir():
        _assert_source_path_no_symlinks(task.env_context_dir, task.env_context_dir)
        has_local_inputs = any(
            child.name != "Dockerfile" for child in task.env_context_dir.iterdir()
        )
        if has_local_inputs and public_build_assets is None:
            raise ValueError(
                "reviewed public build-asset policy is required for local build inputs"
            )
        reviewed = public_build_assets or ()
        if len(set(reviewed)) != len(reviewed):
            raise ValueError("reviewed public build-asset policy contains duplicates")
        for relative in reviewed:
            relative, source = _validate_public_asset_path(task.env_context_dir, relative)
            build_context[relative] = _snapshot_regular_file(
                source, task.env_context_dir
            )
        files.update(build_context)
    if task.base_rewritten and task.dockerfile_path.exists():
        original_bytes = _snapshot_regular_file(task.dockerfile_path, task.env_context_dir)
        original = original_bytes.decode("utf-8", errors="replace")
        file_contents["Dockerfile"] = _rewrite_dockerfile_from(
            original, task.base_image
        )
    else:
        files["Dockerfile"] = _snapshot_regular_file(
            task.dockerfile_path, task.env_context_dir
        )
    if task.test_harness_path is not None:
        files["task_assets/test.sh"] = _snapshot_regular_file(task.test_harness_path)
    if task.instruction_path is not None:
        files["task_assets/instruction.md"] = _snapshot_regular_file(task.instruction_path)

    provenance: dict[str, str] = {
        "task_id": task_id,
        "task_slug": slug,
        "model": task.model,
        "terminal_wrench_revision": task.revision,
        "base_image": task.base_image,
        "base_original": task.base_original,
        "base_rewritten": "true" if task.base_rewritten else "false",
        "workdir": task.workdir,
        **({"base_image_digest": task.base_digest} if task.base_digest else {}),
        "deployable": "true" if task.deployable else "false",
        "grader_digest": _sha256_bytes(files["task_assets/test_outputs.py"]),
    }
    if task.test_harness_path is not None:
        provenance["test_harness_digest"] = _sha256_bytes(files["task_assets/test.sh"])
    if task.dockerfile_path.exists():
        provenance["dockerfile_digest"] = _sha256_bytes(
            original_bytes if task.base_rewritten else files["Dockerfile"]
        )
    if task.env_context_dir is not None and task.env_context_dir.is_dir():
        provenance["build_context_digest"] = _snapshot_dir_digest(build_context)
    if task.skip_reason:
        provenance["skip_reason"] = task.skip_reason
    provenance["content_digest"] = _content_digest(provenance)

    return ImportedEnvPlan(
        task_id=task_id,
        dest=dest_root / slug,
        files=files,
        clean_verify_entrypoint="clean_verify.sh",
        provenance=provenance,
        file_contents=file_contents,
    )
