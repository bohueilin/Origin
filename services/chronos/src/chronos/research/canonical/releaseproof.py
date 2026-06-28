"""ReleaseProof indexing for canonical training normalization."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from chronos.research.canonical.errors import CanonicalInputError


PASSING_GATE_STATUSES = frozenset(
    {"pass", "passed", "success", "succeeded", "accepted"}
)


@dataclass(frozen=True, slots=True)
class ReleaseCaseResult:
    """One ProofSet case evaluated under both verifier versions."""

    case_id: str
    case_kind: str
    v1_reward: float
    v2_reward: float


@dataclass(frozen=True, slots=True)
class ReleaseGateIndex:
    """Lookup over a sealed ReleaseProof."""

    release_proof_id: str
    proof_set_id: str
    environment_v1: str
    environment_v2: str
    grader_v1_digest: str
    grader_v2_digest: str
    cases: dict[str, ReleaseCaseResult]

    def case(self, case_id: str) -> ReleaseCaseResult:
        try:
            return self.cases[case_id]
        except KeyError as exc:
            raise CanonicalInputError(f"ReleaseProof has no case {case_id!r}") from exc


def assert_qabench_reward_matches_release(
    *,
    trajectory_id: str,
    qabench_reward: float,
    release_case: ReleaseCaseResult,
) -> None:
    """Reject stale QA reports whose raw reward disagrees with ReleaseProof v1."""
    if qabench_reward != release_case.v1_reward:
        raise CanonicalInputError(
            "QABench trajectory raw reward disagrees with ReleaseProof v1 result: "
            f"{trajectory_id!r} case {release_case.case_id!r} "
            f"qabench={qabench_reward} release_v1={release_case.v1_reward}"
        )


def _as_non_empty_string(value: Any, *, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise CanonicalInputError(f"{field} must be a non-empty string")
    return value.strip()


def _case_id(row: dict[str, Any]) -> str:
    for field in ("case_id", "proofset_case_id", "witness_id", "control_id", "id"):
        value = row.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    raise CanonicalInputError(f"ReleaseProof result lacks case id: {row!r}")


def _reward(row: dict[str, Any]) -> float:
    for field in ("reward", "score", "success"):
        value = row.get(field)
        if isinstance(value, bool):
            return 1.0 if value else 0.0
        if isinstance(value, (int, float)) and float(value) in (0.0, 1.0):
            return float(value)
    status = str(row.get("status") or row.get("result") or "").lower()
    if status in {"pass", "passed", "success", "succeeded", "rewarded"}:
        return 1.0
    if status in {"fail", "failed", "failure", "killed", "rejected"}:
        return 0.0
    raise CanonicalInputError(f"ReleaseProof result lacks binary reward: {row!r}")


def _declared_case_kind(row: dict[str, Any]) -> str | None:
    value = row.get("case_kind") or row.get("kind") or row.get("type")
    if isinstance(value, str) and value.strip():
        lowered = value.strip().lower()
        if "control" in lowered:
            return "control"
        if "witness" in lowered or "exploit" in lowered:
            return "witness"
    return None


def _sealed_case_kind(
    case_id: str, witness_ids: set[str], control_ids: set[str]
) -> str:
    if case_id in witness_ids:
        return "witness"
    if case_id in control_ids:
        return "control"
    raise CanonicalInputError(
        f"ReleaseProof case {case_id!r} is not a sealed Witness or control"
    )


def _assert_declared_kind_matches(
    row: dict[str, Any], *, case_id: str, sealed_kind: str
) -> None:
    declared = _declared_case_kind(row)
    if declared is not None and declared != sealed_kind:
        raise CanonicalInputError(
            f"ReleaseProof case {case_id!r} declares {declared!r} but sealed membership is {sealed_kind!r}"
        )


def _declared_membership(rows: list[dict[str, Any]]) -> tuple[set[str], set[str]]:
    witnesses: set[str] = set()
    controls: set[str] = set()
    for row in rows:
        case_id = _case_id(row)
        kind = _declared_case_kind(row)
        if kind == "witness":
            witnesses.add(case_id)
        elif kind == "control":
            controls.add(case_id)
        else:
            raise CanonicalInputError(
                f"ReleaseProof result {case_id!r} lacks explicit Witness/control kind"
            )
    return witnesses, controls


def build_release_gate_index(proof: dict[str, Any]) -> ReleaseGateIndex:
    """Build a case index and enforce the binary ReleaseProof gate."""
    gate_status = str(proof.get("gate_status") or "").lower()
    if gate_status not in PASSING_GATE_STATUSES:
        raise CanonicalInputError(
            f"ReleaseProof gate did not pass: {proof.get('gate_status')!r}"
        )

    witness_ids = set(
        proof.get("exploit_witness_ids") or proof.get("witness_ids") or ()
    )
    control_ids = set(
        proof.get("legitimate_control_ids") or proof.get("control_ids") or ()
    )
    if not witness_ids and not control_ids:
        v1_membership = _declared_membership(proof["v1_results"])
        v2_membership = _declared_membership(proof["v2_results"])
        if v1_membership != v2_membership:
            raise CanonicalInputError(
                "ReleaseProof v1/v2 declared case membership differs"
            )
        witness_ids, control_ids = v1_membership
    if not witness_ids:
        raise CanonicalInputError("ReleaseProof has no sealed Witness ids")
    if not control_ids:
        raise CanonicalInputError("ReleaseProof has no sealed control ids")

    v1_by_id = {_case_id(row): row for row in proof["v1_results"]}
    v2_by_id = {_case_id(row): row for row in proof["v2_results"]}
    if set(v1_by_id) != set(v2_by_id):
        raise CanonicalInputError("ReleaseProof v1/v2 case membership differs")
    expected_case_ids = witness_ids | control_ids
    observed_case_ids = set(v1_by_id)
    if observed_case_ids != expected_case_ids:
        missing = ", ".join(sorted(expected_case_ids - observed_case_ids)) or "none"
        extra = ", ".join(sorted(observed_case_ids - expected_case_ids)) or "none"
        raise CanonicalInputError(
            "ReleaseProof results must exactly cover sealed Witness/control ids "
            f"(missing: {missing}; extra: {extra})"
        )

    cases: dict[str, ReleaseCaseResult] = {}
    for case_id, v1_row in v1_by_id.items():
        v2_row = v2_by_id[case_id]
        kind = _sealed_case_kind(case_id, witness_ids, control_ids)
        _assert_declared_kind_matches(v1_row, case_id=case_id, sealed_kind=kind)
        _assert_declared_kind_matches(v2_row, case_id=case_id, sealed_kind=kind)
        result = ReleaseCaseResult(
            case_id=case_id,
            case_kind=kind,
            v1_reward=_reward(v1_row),
            v2_reward=_reward(v2_row),
        )
        if kind == "witness" and result.v1_reward != 1.0:
            raise CanonicalInputError(
                f"ReleaseProof v1 did not reward Witness {case_id!r}"
            )
        if kind == "witness" and result.v2_reward == 1.0:
            raise CanonicalInputError(f"ReleaseProof has surviving Witness {case_id!r}")
        if kind == "control" and result.v1_reward != 1.0:
            raise CanonicalInputError(
                f"ReleaseProof v1 did not reward control {case_id!r}"
            )
        if kind == "control" and result.v2_reward != 1.0:
            raise CanonicalInputError(f"ReleaseProof broke control {case_id!r}")
        cases[case_id] = result

    return ReleaseGateIndex(
        release_proof_id=_as_non_empty_string(
            proof.get("release_proof_id"), field="release_proof_id"
        ),
        proof_set_id=_as_non_empty_string(
            proof.get("proof_set_id"), field="proof_set_id"
        ),
        environment_v1=_as_non_empty_string(
            proof.get("environment_v1"), field="environment_v1"
        ),
        environment_v2=_as_non_empty_string(
            proof.get("environment_v2"), field="environment_v2"
        ),
        grader_v1_digest=_as_non_empty_string(
            proof.get("grader_v1_digest"), field="grader_v1_digest"
        ),
        grader_v2_digest=_as_non_empty_string(
            proof.get("grader_v2_digest"), field="grader_v2_digest"
        ),
        cases=cases,
    )
