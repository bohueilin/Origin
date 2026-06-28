#!/usr/bin/env python3
"""Shared helpers for Chronos plan validators."""

from __future__ import annotations

import ast
import dataclasses
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
PLAN_DIR = ROOT / "docs" / "plans"
PLAN_RE = re.compile(r"^(?P<num>\d{3})-(?P<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.md$")


class ValidationError(RuntimeError):
    pass


@dataclasses.dataclass(frozen=True)
class Plan:
    number: str
    slug: str
    path: Path
    metadata: dict[str, Any]
    body: str

    @property
    def name(self) -> str:
        return str(self.metadata.get("name", ""))

    @property
    def wave(self) -> int:
        try:
            return int(self.metadata["wave"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValidationError(f"{self.path}: invalid wave") from exc

    @property
    def owns(self) -> list[str]:
        value = self.metadata.get("owns", [])
        if not isinstance(value, list):
            raise ValidationError(f"{self.path}: owns must be a list")
        return [str(item) for item in value]

    @property
    def depends_on(self) -> list[str]:
        value = self.metadata.get("depends_on", [])
        if not isinstance(value, list):
            raise ValidationError(f"{self.path}: depends_on must be a list")
        return [str(item) for item in value]


def parse_scalar(raw: str) -> Any:
    raw = raw.strip()
    if raw == "":
        return ""
    if raw.startswith("[") or raw.startswith("{"):
        try:
            return ast.literal_eval(raw)
        except (SyntaxError, ValueError) as exc:
            raise ValidationError(f"Cannot parse frontmatter value: {raw}") from exc
    if raw.isdigit():
        return int(raw)
    if raw in {"true", "false"}:
        return raw == "true"
    if (raw.startswith('"') and raw.endswith('"')) or (
        raw.startswith("'") and raw.endswith("'")
    ):
        return raw[1:-1]
    return raw


def parse_frontmatter(text: str, path: Path) -> tuple[dict[str, Any], str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValidationError(f"{path}: missing opening frontmatter delimiter")
    try:
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration as exc:
        raise ValidationError(f"{path}: missing closing frontmatter delimiter") from exc

    metadata: dict[str, Any] = {}
    i = 1
    while i < end:
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if ":" not in line:
            raise ValidationError(f"{path}:{i + 1}: malformed frontmatter line")
        key, raw = line.split(":", 1)
        key = key.strip()
        raw = raw.strip()
        if raw in {">", "|"}:
            folded: list[str] = []
            i += 1
            while i < end and (lines[i].startswith(" ") or not lines[i].strip()):
                folded.append(lines[i].strip())
                i += 1
            metadata[key] = " ".join(part for part in folded if part)
            continue
        metadata[key] = parse_scalar(raw)
        i += 1

    body = "\n".join(lines[end + 1 :]).lstrip("\n")
    return metadata, body


def load_plans() -> list[Plan]:
    plans: list[Plan] = []
    for path in sorted(PLAN_DIR.glob("[0-9][0-9][0-9]-*.md")):
        if path.name.endswith(".REFERENCE.md") or path.name == "000-index.md":
            continue
        match = PLAN_RE.match(path.name)
        if not match:
            continue
        number = match.group("num")
        if number == "000":
            continue
        text = path.read_text(encoding="utf-8")
        metadata, body = parse_frontmatter(text, path)
        plans.append(
            Plan(
                number=number,
                slug=match.group("slug"),
                path=path,
                metadata=metadata,
                body=body,
            )
        )
    if not plans:
        raise ValidationError(f"No numbered plans found in {PLAN_DIR}")
    return plans


def plan_by_number(plans: list[Plan], number: str) -> Plan:
    padded = str(number).zfill(3)
    for plan in plans:
        if plan.number == padded:
            return plan
    raise ValidationError(f"Unknown plan number: {number}")


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValidationError(f"Missing file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValidationError(f"Invalid JSON {path}: {exc}") from exc


def static_prefix(pattern: str) -> str:
    """Return a normalized prefix before the first glob metacharacter."""
    normalized = pattern.replace("\\", "/").strip("/")
    positions = [
        pos for token in ("*", "?", "[") if (pos := normalized.find(token)) >= 0
    ]
    if positions:
        normalized = normalized[: min(positions)]
    return normalized.rstrip("/")


def prefixes_overlap(left: str, right: str) -> bool:
    a = static_prefix(left)
    b = static_prefix(right)
    if not a or not b:
        return True
    return a == b or a.startswith(b + "/") or b.startswith(a + "/")


def is_document_path(pattern: str) -> bool:
    normalized = pattern.replace("\\", "/")
    return normalized.startswith("docs/plans/")


def resolve_bound_paths(plans: list[Plan]) -> dict[str, list[str]]:
    status = load_json(PLAN_DIR / "repo-map" / "STATUS.json")
    bindings = load_json(PLAN_DIR / "repo-map" / "OWNERSHIP-BINDINGS.json")
    if status.get("status") != "accepted":
        raise ValidationError("repo-map/STATUS.json is not accepted")
    if bindings.get("status") != "accepted":
        raise ValidationError("repo-map/OWNERSHIP-BINDINGS.json is not accepted")
    mapping = bindings.get("bindings")
    if not isinstance(mapping, dict):
        raise ValidationError("OWNERSHIP-BINDINGS.json bindings must be an object")

    resolved: dict[str, list[str]] = {}
    for plan in plans:
        actuals: list[str] = []
        for owned in plan.owns:
            if is_document_path(owned):
                actuals.append(owned)
                continue
            entry = mapping.get(owned)
            if not isinstance(entry, dict) or entry.get("status") != "accepted":
                raise ValidationError(f"Unaccepted ownership binding: {owned}")
            actual = entry.get("actual")
            if isinstance(actual, str):
                actual = [actual]
            if (
                not isinstance(actual, list)
                or not actual
                or not all(isinstance(item, str) and item.strip() for item in actual)
            ):
                raise ValidationError(f"Invalid actual binding for {owned}")
            actuals.extend(actual)
        resolved[plan.name] = actuals
    return resolved


def print_ok(message: str) -> None:
    print(f"PASS: {message}")


def print_errors(errors: list[str]) -> int:
    for error in errors:
        print(f"ERROR: {error}")
    print(f"FAIL: {len(errors)} validation error(s)")
    return 1
