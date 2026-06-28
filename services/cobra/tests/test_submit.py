from cobra.bench.submit import _substrate, build_payload, build_verified_payload
from cobra.rollout.dataset import Rollout


def _r(tid, rn, rh, to, completion="x"):
    return Rollout(
        task_id=tid, model="m", completion=completion, r_naive=rn, r_hardened=rh, t_oracle=to
    )


def test_substrate_inference():
    assert _substrate("HumanEval/3") == "evalplus"
    assert _substrate("gsm_symbolic:42:20") == "reasoning-gym:gsm_symbolic"
    assert _substrate("arith/0") == "custom"


def test_build_payload_shape_and_examples():
    rollouts = [
        _r("HumanEval/1", 1, 1, 1, "honest solve"),
        _r("HumanEval/1", 1, 0, 0, "cheat code"),  # naive accepts, oracle wrong
        _r("HumanEval/2", 0, 0, 0, "fail"),
    ]
    p = build_payload(rollouts, "my-env")
    assert p["env_name"] == "my-env"
    assert p["substrate"] == "evalplus"
    assert p["n_completions"] == 3
    assert p["n_exploits"] == 2  # two oracle-wrong
    assert {v["name"] for v in p["verifiers"]} == {"naive", "hardened"}
    naive = next(v for v in p["verifiers"] if v["name"] == "naive")
    assert "safety_score" in naive and "best_of_k" in naive and "false_accept" in naive
    kinds = {e["kind"] for e in p["examples"]}
    assert "naive_accepted_cheat" in kinds and "hardened_kept_honest" in kinds


def test_build_verified_payload_shape():
    rollouts = [
        _r("HumanEval/1", 1, 1, 1, "honest solve"),
        _r("HumanEval/2", 1, 0, 0, "cheat code"),
    ]
    p = build_verified_payload(rollouts, "my-verified-env")
    assert p["env_name"] == "my-verified-env"
    assert p["substrate"] == "evalplus"
    assert len(p["rows"]) == 2
    row = p["rows"][0]
    assert "task_id" in row and "model" in row and "completion" in row
    # server recomputes everything — t_oracle must NOT be present
    assert "t_oracle" not in row
    # r_naive / r_hardened are passed as hints (server ignores them)
    assert "r_naive" in row and "r_hardened" in row
