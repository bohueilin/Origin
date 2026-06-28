"""Architecture guards for research training paths."""

from __future__ import annotations

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "src" / "chronos" / "research"


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    return modules


def test_sft_and_rft_do_not_import_each_other() -> None:
    sft_files = [
        path for path in (SRC / "sft").glob("*.py") if path.name != "__init__.py"
    ]
    rft_files = [
        path for path in (SRC / "rft").glob("*.py") if path.name != "__init__.py"
    ]

    for path in sft_files:
        assert not any(
            module.startswith("chronos.research.rft") for module in _imports(path)
        ), path

    for path in rft_files:
        assert not any(
            module.startswith("chronos.research.sft") for module in _imports(path)
        ), path
