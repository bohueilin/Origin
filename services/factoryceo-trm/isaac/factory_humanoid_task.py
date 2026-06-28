"""Isaac Lab consumer skeleton — runs the verified humanoid task queue.

⚠️ Requires NVIDIA Isaac Sim + Isaac Lab on a CUDA GPU box. It does NOT run in
the hackathon sandbox; it is the execution layer that consumes
``results/isaac_tasks.json`` produced by ``plan_to_isaac.py``.

Design: a gym-registered Isaac Lab task where a humanoid (e.g. Unitree G1 /
Fourier GR-1 from Isaac Lab assets) steps through its robot_queue, doing one
manipulation skill (pick_place_mold / tend_cnc / deburr_part) per scheduled
operation at the machine's floor coordinate. The episode reward mirrors the
FactoryCEO verifier: + task completion, - lateness vs end_hr, - any safety
control violated. V-JEPA 2 (src/jepa.py) can score rollout frames for a
verifier-free success signal.

Reference Isaac Lab APIs (Isaac Lab 2.x):
    from isaaclab.envs import ManagerBasedRLEnv, ManagerBasedRLEnvCfg
    import gymnasium as gym
    env = gym.make("Isaac-FactoryHumanoid-v0")
    obs, _ = env.reset(); obs, rew, term, trunc, info = env.step(action)
"""

from __future__ import annotations

import json


def load_queue(path: str = "results/isaac_tasks.json") -> dict:
    with open(path) as f:
        return json.load(f)


def main():  # pragma: no cover - requires Isaac Sim runtime
    try:
        import gymnasium as gym
        import isaaclab  # noqa: F401
    except ImportError:
        raise SystemExit(
            "Isaac Lab not found. Install Isaac Sim + Isaac Lab on a GPU box, "
            "then register Isaac-FactoryHumanoid-v0 and run this script there. "
            "See isaac/README.md.")

    tasks = load_queue()
    assert tasks["meta"]["verified"], "refusing to execute an unverified plan"

    env = gym.make("Isaac-FactoryHumanoid-v0")
    obs, _ = env.reset()
    for robot, queue in tasks["robot_queues"].items():
        for step in queue:
            # map step['task'] + step['machine_xy'] to a manipulation goal,
            # drive the humanoid controller until done or step['end_hr'] reached.
            action = env.action_space.sample()  # placeholder policy
            obs, reward, terminated, truncated, info = env.step(action)
            print(f"{robot}: {step['task']} @ {step['machine']} -> r={reward}")
    env.close()


if __name__ == "__main__":
    main()
