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
from dataclasses import dataclass, field
from pathlib import Path

_PUBLIC_REGISTRIES = frozenset(
    {"docker.io", "registry.hub.docker.com", "ghcr.io", "quay.io", "public.ecr.aws"}
)
_PREFERRED_MODELS = ("claude-opus-4.6", "gemini-3.1-pro")
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


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _content_digest(provenance: dict[str, str]) -> str:
    payload = {k: v for k, v in provenance.items() if k != "content_digest"}
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True).encode("utf-8")
    ).hexdigest()


def _dir_digest(root: Path, skip: frozenset[str]) -> str:
    """Stable digest over every file (path + bytes) under ``root``, minus ``skip``."""
    h = hashlib.sha256()
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.name not in skip:
            h.update(path.relative_to(root).as_posix().encode("utf-8"))
            h.update(b"\0")
            h.update(path.read_bytes())
            h.update(b"\0")
    return h.hexdigest()


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
        return self.task_id.strip().lower().replace(" ", "-").replace("_", "-")


@dataclass
class ImportedEnvPlan:
    """A planned env layout plus provenance; ``write()`` materializes it to disk."""

    task_id: str
    dest: Path
    files: dict[str, Path]
    clean_verify_entrypoint: str
    provenance: dict[str, str] = field(default_factory=dict)
    file_contents: dict[str, str] = field(default_factory=dict)

    def write(self) -> Path:
        """Materialize the env layout idempotently and return the env directory."""
        self.dest.mkdir(parents=True, exist_ok=True)
        for rel, src in self.files.items():
            target = self.dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(src.read_bytes())
        for rel, text in self.file_contents.items():
            target = self.dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf-8")
        (self.dest / "provenance.json").write_text(
            json.dumps(self.provenance, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        entrypoint = self.dest / self.clean_verify_entrypoint
        entrypoint.write_text(CLEAN_VERIFY_TEMPLATE, encoding="utf-8")
        entrypoint.chmod(0o755)
        return self.dest


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


def plan_env(task: TerminalWrenchTask, dest_root: Path | str) -> ImportedEnvPlan:
    """Plan one ``envs/qabench/<slug>/`` env layout with stable provenance.

    Idempotent: re-planning a pinned source yields the same ``content_digest``. If
    the base image was rewritten, the materialized Dockerfile gets the public FROM.
    """
    dest_root = Path(dest_root)
    files: dict[str, Path] = {"task_assets/test_outputs.py": task.grader_path}
    file_contents: dict[str, str] = {}
    # Build context: every sibling of the Dockerfile (e.g. COPY-ed seed scripts)
    # must travel with it or the image build fails. The Dockerfile itself is
    # handled separately below (copied, or rewritten when the base was swapped).
    if task.env_context_dir is not None and task.env_context_dir.is_dir():
        for path in sorted(task.env_context_dir.rglob("*")):
            if path.is_file() and path.name != "Dockerfile":
                files[path.relative_to(task.env_context_dir).as_posix()] = path
    if task.base_rewritten and task.dockerfile_path.exists():
        original = task.dockerfile_path.read_text(encoding="utf-8", errors="replace")
        file_contents["Dockerfile"] = _rewrite_dockerfile_from(
            original, task.base_image
        )
    else:
        files["Dockerfile"] = task.dockerfile_path
    if task.test_harness_path is not None:
        files["task_assets/test.sh"] = task.test_harness_path
    if task.instruction_path is not None:
        files["task_assets/instruction.md"] = task.instruction_path
    if task.solution_path is not None:
        files["task_assets/solution.sh"] = task.solution_path

    provenance: dict[str, str] = {
        "task_id": task.task_id,
        "task_slug": task.slug(),
        "model": task.model,
        "terminal_wrench_revision": task.revision,
        "base_image": task.base_image,
        "base_original": task.base_original,
        "base_rewritten": "true" if task.base_rewritten else "false",
        "workdir": task.workdir,
        **({"base_image_digest": task.base_digest} if task.base_digest else {}),
        "deployable": "true" if task.deployable else "false",
        "grader_digest": _sha256(task.grader_path),
    }
    if task.test_harness_path is not None:
        provenance["test_harness_digest"] = _sha256(task.test_harness_path)
    if task.dockerfile_path.exists():
        provenance["dockerfile_digest"] = _sha256(task.dockerfile_path)
    if task.env_context_dir is not None and task.env_context_dir.is_dir():
        provenance["build_context_digest"] = _dir_digest(
            task.env_context_dir, frozenset({"Dockerfile"})
        )
    if task.skip_reason:
        provenance["skip_reason"] = task.skip_reason
    provenance["content_digest"] = _content_digest(provenance)

    return ImportedEnvPlan(
        task_id=task.task_id,
        dest=dest_root / task.slug(),
        files=files,
        clean_verify_entrypoint="clean_verify.sh",
        provenance=provenance,
        file_contents=file_contents,
    )
