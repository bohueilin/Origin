"""Run ONE candidate SalesAnalyzer out-of-process and print its JSON output.

This is the only place a candidate `query.py` is imported. It runs as a throwaway
subprocess: even if the candidate hijacks this process (atexit/os._exit) or
monkeypatches anything, it affects only this process — the trusted grader
(`grade.py`) reads only this process's stdout and never imports candidate code.
"""

from __future__ import annotations

import importlib.util
import json
import sys

DB_URL = "mongodb://localhost:27017/"
DB_NAME = "grade_ecommerce_db"


def _load(module_path: str):
    spec = importlib.util.spec_from_file_location("candidate_query", module_path)
    if spec is None or spec.loader is None:
        raise ImportError(module_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.SalesAnalyzer


def main() -> None:
    module_path, start, end = sys.argv[1], sys.argv[2], sys.argv[3]
    analyzer = _load(module_path)(DB_URL, DB_NAME)
    if len(sys.argv) > 4:
        result = analyzer.get_top_performing_products(start, end, int(sys.argv[4]))
    else:
        result = analyzer.get_top_performing_products(start, end)
    sys.stdout.write(
        "RESULT_JSON:" + json.dumps(result, default=str, sort_keys=True) + "\n"
    )


if __name__ == "__main__":
    main()
