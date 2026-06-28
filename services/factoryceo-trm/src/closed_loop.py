"""Closed loop: TRM brain -> Isaac humanoid -> V-JEPA perception -> reward.

Wires the full stack the way the pitch describes:

    planner ── proposes ──► verifier + recursive TRM repair ──► VERIFIED plan
        │                                                          │
        │                                       plan_to_isaac (humanoid task queue)
        │                                                          ▼
        │                                   Isaac Sim/Lab rollout (humanoid executes)
        │                                                          ▼
        │                                   V-JEPA 2 scores rollout in latent space
        ▼                                                          │
    combined reward  ◄── verifier (decision) + V-JEPA (execution) ─┘

Runs **offline as a stub** (no Isaac, no GPU): the executor is None and the
execution score falls back to a verifier-derived proxy, so the loop is testable
now. On a GPU box, pass an `executor` that returns Isaac rollout frames and the
real V-JEPA model scores them — same interface.

Where the *learned* TRM plugs in: pass `LearnedRepairModel` (src/trm_student.py)
as `op_selector` to bias the repair loop's action choice; the rule-based loop is
the default and the guaranteed-feasible floor.
"""

from __future__ import annotations

import os
import sys
from typing import Callable, Optional

from .schemas import FactoryState, ActionPlan
from .verifier import evaluate
from .repair_loop import repair_loop
from .jepa import VJEPAWorldModel

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from isaac.floor_layout import mjcf_from_floor_layout  # noqa: E402


class Executor:
    """Interface for a humanoid simulator. `.rollout(isaac_tasks)` returns
    (achieved_frames, goal_frames) clip arrays that V-JEPA then scores. Backends:
      * BrowserExecutor  -- three.js in the demo (no GPU; the visible demo)
      * MuJoCoExecutor   -- native physics on macOS (pip install mujoco)
      * IsaacExecutor    -- Isaac Sim/Lab on a cloud GPU (production scale)
    """

    def rollout(self, isaac_tasks: dict):  # pragma: no cover
        raise NotImplementedError


# a self-contained MuJoCo scene: shop floor + 4 machine stations + a humanoid
# (mocap body we drive to each station). Runs natively on macOS, no GPU, no
# model files. Swap in a Menagerie humanoid (Unitree G1 / Fourier GR-1) for a
# fully-articulated figure.
_MJCF_FLOOR = """
<mujoco>
  <visual><global offwidth="320" offheight="240"/></visual>
  <worldbody>
    <light pos="1 1 4" dir="0 0 -1"/>
    <camera name="iso" pos="1 -3.2 3.2" xyaxes="1 0 0 0 0.7 0.7"/>
    <geom name="floor" type="plane" size="4 4 0.1" rgba="0.86 0.84 0.78 1"/>
    <geom name="M1" type="box" pos="0 0 0.2" size="0.18 0.18 0.2" rgba="0.16 0.35 0.62 1"/>
    <geom name="M2" type="box" pos="2 0 0.2" size="0.18 0.18 0.2" rgba="0.16 0.35 0.62 1"/>
    <geom name="M3" type="box" pos="0 2 0.2" size="0.18 0.18 0.2" rgba="0.16 0.35 0.62 1"/>
    <geom name="M4" type="box" pos="2 2 0.2" size="0.18 0.18 0.2" rgba="0.16 0.35 0.62 1"/>
    <body name="robot" mocap="true" pos="0 0 0.0">
      <geom type="capsule" fromto="0 0 0.05 0 0 0.55" size="0.09" rgba="0.46 0.61 0.85 1"/>
      <geom type="sphere" pos="0 0 0.68" size="0.13" rgba="0.46 0.61 0.85 1"/>
    </body>
  </worldbody>
</mujoco>
"""


class MuJoCoExecutor(Executor):
    """Real-physics humanoid rollout on macOS (Apple Silicon) via MuJoCo.

    MuJoCo runs natively on Mac (no CUDA, no cloud credits), so this is the
    on-device physics backend that replaces Isaac for a Mac demo. The humanoid
    (a mocap body; swap in a Menagerie G1/GR-1) is driven to each machine
    station's floor coordinate over the schedule and `mujoco.Renderer` captures
    frames offscreen for V-JEPA. Requires ``pip install mujoco``.
    """

    def __init__(self, model_xml: str | None = None, n_frames: int = 48,
                 width: int = 320, height: int = 240):
        self.model_xml = model_xml          # optional path; default = built-in floor
        self.n_frames, self.width, self.height = n_frames, width, height

    def rollout(self, isaac_tasks: dict):
        import numpy as np
        import mujoco
        floor_layout = (isaac_tasks.get("meta") or {}).get("floor_layout")
        if self.model_xml:
            model = mujoco.MjModel.from_xml_path(self.model_xml)
        elif floor_layout:
            model = mujoco.MjModel.from_xml_string(mjcf_from_floor_layout(floor_layout))
        else:
            model = mujoco.MjModel.from_xml_string(_MJCF_FLOOR)
        data = mujoco.MjData(model)
        renderer = mujoco.Renderer(model, self.height, self.width)
        q = next(iter(isaac_tasks.get("robot_queues", {}).values()), [])
        if not q:
            q = next(iter(isaac_tasks.get("all_queues", {}).values()), [])
        waypoints = [t["machine_xy"] for t in q] or [[0.0, 0.0]]
        cam = "iso" if (floor_layout or self.model_xml is None) else -1
        frames = []
        for k in range(self.n_frames):
            # walk the humanoid along the scheduled waypoints (kinematic mocap)
            f = k / max(1, self.n_frames - 1) * (len(waypoints) - 1)
            i = min(int(f), len(waypoints) - 2) if len(waypoints) > 1 else 0
            t = f - i
            x = waypoints[i][0] * (1 - t) + waypoints[min(i + 1, len(waypoints) - 1)][0] * t
            y = waypoints[i][1] * (1 - t) + waypoints[min(i + 1, len(waypoints) - 1)][1] * t
            if model.nmocap:
                data.mocap_pos[0] = [x, y, 0.0]
            mujoco.mj_forward(model, data)
            renderer.update_scene(data, camera=cam)
            frames.append(renderer.render())
        frames = np.stack(frames)
        goal = frames[-1:].repeat(len(frames), axis=0)   # final pose = goal proxy
        return frames, goal


class GenesisExecutor(Executor):
    """Humanoid rollout via Genesis (genesis-world). Cross-platform; its real
    strength is NVIDIA-GPU *massively-parallel* simulation (many envs at once) —
    ideal for cloud-scale training, less so as a macOS demo (Metal/MPS accel is
    CPU-bound/unproven on Mac, where MuJoCoExecutor is the safer choice). Same
    interface, so it's a drop-in when you scale to a CUDA box.

    Requires ``pip install genesis-world`` (+ torch). Not run in the sandbox.
    """

    def __init__(self, robot_asset: str | None = None, n_frames: int = 64,
                 width: int = 256, height: int = 256, backend: str = "cpu"):
        self.robot_asset = robot_asset      # MJCF/URDF humanoid (e.g. Unitree G1)
        self.n_frames, self.width, self.height, self.backend = n_frames, width, height, backend

    def rollout(self, isaac_tasks: dict):   # pragma: no cover - needs genesis-world
        import numpy as np
        import genesis as gs
        gs.init(backend=getattr(gs, self.backend, gs.cpu))
        scene = gs.Scene(show_viewer=False)
        scene.add_entity(gs.morphs.Plane())
        robot = scene.add_entity(gs.morphs.MJCF(file=self.robot_asset))  # or URDF
        cam = scene.add_camera(res=(self.width, self.height),
                               pos=(3.0, 3.0, 2.0), lookat=(1.6, 1.6, 0.5), GUI=False)
        scene.build()
        q = next(iter(isaac_tasks.get("robot_queues", {}).values()), [])
        waypoints = [t["machine_xy"] for t in q] or [[0, 0]]   # control toward these
        frames = []
        for _ in range(self.n_frames):
            scene.step()
            rgb = cam.render()[0]            # genesis returns (rgb, depth, seg, normal)
            frames.append(np.asarray(rgb))
        frames = np.stack(frames)
        return frames, frames[-1:].repeat(len(frames), axis=0)


def decide(state: FactoryState, planner, repair_K: int = 60):
    """Brain: planner proposes, verifier + recursive repair produce a verified plan."""
    candidate = planner.plan(state)
    final, trace = repair_loop(state, candidate, K=repair_K)
    return final, trace


def execution_score(state: FactoryState, plan: ActionPlan,
                    executor: Optional[Executor] = None,
                    jepa: Optional[VJEPAWorldModel] = None) -> dict:
    """Score the physical execution. Real path: Isaac rollout -> V-JEPA latent
    similarity. Offline path: verifier-derived proxy (feasible + on-time ⇒ high)."""
    if executor is not None:                         # real sim path (MuJoCo/Isaac/Genesis)
        jepa = jepa or VJEPAWorldModel()
        achieved, goal = executor.rollout(plan_to_tasks(state, plan))
        return {"score": jepa.success_score(achieved, goal),
                "source": f"{type(executor).__name__}+vjepa"}
    res = evaluate(state, plan)                       # offline proxy
    proxy = 0.0 if res.n_hard else 0.5 + 0.5 * res.metrics["on_time_rate"]
    return {"score": round(proxy, 3), "source": "proxy(no-isaac)"}


def run(state: FactoryState, planner, executor: Optional[Executor] = None,
        jepa: Optional[VJEPAWorldModel] = None, w_exec: float = 0.3,
        repair_K: int = 60) -> dict:
    """One closed-loop step. Returns the verified plan, humanoid task queue, and a
    combined decision+execution reward (V-JEPA feeds back here)."""
    plan, trace = decide(state, planner, repair_K)
    res = evaluate(state, plan)
    dec = 0.0 if res.n_hard else min(1.0, max(0.0, res.metrics["on_time_rate"]))
    ex = execution_score(state, plan, executor, jepa)
    reward = round((1 - w_exec) * dec + w_exec * ex["score"], 4)
    return {
        "verified": res.n_hard == 0,
        "metrics": res.metrics,
        "repair_steps": len(trace),
        "isaac_tasks": plan_to_tasks(state, plan),
        "execution": ex,
        "reward": reward,                            # decision (verifier) + execution (V-JEPA)
        "plan": plan,
    }
