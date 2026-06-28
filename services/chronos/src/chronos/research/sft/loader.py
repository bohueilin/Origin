"""Load Chronos trace exports from JSONL files."""

from __future__ import annotations

import json
from pathlib import Path

from chronos.research.sft.errors import TraceValidationError
from chronos.research.sft.models import TraceRecord, TraceSource
from chronos.research.sft.validation import parse_trace_record

DEFAULT_MOCK_FIXTURE = Path("fixtures/sft/mock_chronos_traces.jsonl")


def infer_source(path: Path, source: TraceSource | None = None) -> TraceSource:
    if source is not None:
        return source
    if "mock" in path.name:
        return "mock"
    return "chronos_export"


def load_traces(
    path: str | Path,
    *,
    source: TraceSource | None = None,
) -> list[TraceRecord]:
    """
    Load and validate a Chronos trace export.

    Each JSONL line becomes one TraceRecord. Raises TraceValidationError when
    a row is malformed or when duplicate trace_id values appear.
    """
    file_path = Path(path)
    if not file_path.is_file():
        raise TraceValidationError(f"trace file not found: {file_path}")

    resolved_source = infer_source(file_path, source)
    traces: list[TraceRecord] = []
    seen_ids: set[str] = set()

    with file_path.open(encoding="utf-8") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue

            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise TraceValidationError(
                    f"invalid JSON: {exc.msg}", line_number=line_number
                ) from exc

            record = parse_trace_record(
                row,
                line_number=line_number,
                source=resolved_source,
            )

            if record.trace_id in seen_ids:
                raise TraceValidationError(
                    f"duplicate trace_id: {record.trace_id}",
                    line_number=line_number,
                )
            seen_ids.add(record.trace_id)
            traces.append(record)

    if not traces:
        raise TraceValidationError("trace file contains no records")

    return traces
