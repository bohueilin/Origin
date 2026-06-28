"""Path diversity validation and rationales."""

from __future__ import annotations

import inspect
import json
from pathlib import Path

from chronos.controls.materialize import fixture_root, solution_path
from chronos.controls.models import PATH_LABELS

RATIONALE_TEXT = {
    "path-a": (
        "Path A uses a single date $match, $addFields revenue computation, composite "
        "group keys, and Python round() instead of server-side $round."
    ),
    "path-b": (
        "Path B adds a second $match to filter orphaned orders, uses inline $multiply "
        "inside $group with scalar product_id keys, and MongoDB $round in $push."
    ),
    "path-c": (
        "Path C replaces the simple $lookup with a correlated pipeline $lookup, "
        "aggregating join conditions server-side rather than relying on $unwind filtering alone."
    ),
}


def _source_for(path_label: str) -> str:
    return solution_path(path_label).read_text(encoding="utf-8")


def validate_path_shape(path_label: str) -> None:
    source = _source_for(path_label)
    if "$match" not in source or "$lookup" not in source:
        raise ValueError(f"{path_label}: solution must contain $match and $lookup")

    if path_label == "path-a":
        if source.count('"$match"') < 1:
            raise ValueError("path-a: expected a single $match stage")
        if "$addFields" not in source:
            raise ValueError("path-a: expected $addFields stage")
        if "round(" not in source:
            raise ValueError("path-a: expected Python round()")
        if '"$round"' in source:
            raise ValueError("path-a: must not use MongoDB $round")
    elif path_label == "path-b":
        if source.count('"$match"') < 2:
            raise ValueError("path-b: expected two $match stages")
        if "$addFields" in source:
            raise ValueError("path-b: must not use $addFields")
        if '"$round"' not in source:
            raise ValueError("path-b: expected MongoDB $round")
        if '"product_info": {"$ne": []}' not in source:
            raise ValueError("path-b: expected explicit orphan-order filter")
    elif path_label == "path-c":
        if '"pipeline"' not in source:
            raise ValueError("path-c: expected correlated $lookup pipeline syntax")
    else:
        raise ValueError(f"unknown path label: {path_label}")


def validate_all_paths() -> None:
    for label in PATH_LABELS:
        validate_path_shape(label)


def write_diversity_rationales(path: Path | None = None) -> dict[str, str]:
    validate_all_paths()
    target = path or (fixture_root() / "diversity_rationales.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(RATIONALE_TEXT, indent=2) + "\n", encoding="utf-8")
    return dict(RATIONALE_TEXT)


def load_diversity_rationales() -> dict[str, str]:
    path = fixture_root() / "diversity_rationales.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    if set(data) != set(PATH_LABELS):
        raise ValueError("diversity rationales must cover path-a, path-b, and path-c")
    return {str(key): str(value) for key, value in data.items()}


def inspect_method_source(path_label: str) -> str:
    import importlib.util

    module_path = solution_path(path_label)
    spec = importlib.util.spec_from_file_location(f"control_{path_label}", module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot import {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return inspect.getsource(module.SalesAnalyzer.get_top_performing_products)
