"""Target B data prep: the two expert-iteration arms and the cheat-fraction gap."""

import json

from cobra.rollout import Rollout
from cobra.train import build_arms, write_sft


def test_naive_arm_carries_cheats_hardened_arm_does_not():
    rollouts = [
        Rollout("t1", "m", "cheat", r_naive=1, r_hardened=0, t_oracle=0),  # cheat
        Rollout("t2", "m", "honest", r_naive=1, r_hardened=1, t_oracle=1),  # honest
        Rollout("t3", "m", "fail", r_naive=0, r_hardened=0, t_oracle=0),  # fail
    ]
    arms = build_arms(rollouts)
    # Naive reward pays out for cheat + honest; hardened only for honest.
    assert arms["naive"].size == 2 and arms["hardened"].size == 1
    assert arms["naive"].cheat_fraction == 0.5  # 1 of 2 is a cheat
    assert arms["hardened"].cheat_fraction == 0.0  # the gap, before any training


def test_write_sft_with_and_without_prompts(tmp_path):
    arm = build_arms([Rollout("t1", "m", "src", 1, 1, 1)])["naive"]
    plain = write_sft(arm, tmp_path / "a.jsonl")
    assert set(json.loads(plain.read_text().strip())) == {"task_id", "completion"}
    joined = write_sft(arm, tmp_path / "b.jsonl", prompts={"t1": "PROMPT"})
    assert json.loads(joined.read_text().strip()) == {"prompt": "PROMPT", "completion": "src"}
