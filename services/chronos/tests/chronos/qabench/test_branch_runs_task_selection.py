"""The task-selection contract Plan 008 depends on (Plan 003 ForkPoint seam).

Plan 003's ``branch_runs`` loads its task entirely from the ForkPoint's
``hud_task_profile`` (env module, factory, prompt, grader surface). Plan 008 makes the
qabench ForkPoint self-describing so a materialized qabench env forks without any
out-of-band env contract. This pins that the qabench-captured profile satisfies the
canonical Plan 003 validator and points at the env's real serve/grade surface.
"""

from chronos.qabench.modal_runtime import forkpoint_dict, qabench_task_profile
from chronos.witnesses.branch_task_profile import (
    REQUIRED_HUD_TASK_PROFILE_FIELDS,
    hud_task_profile,
)


def test_qabench_profile_satisfies_canonical_validator() -> None:
    profile = qabench_task_profile("envs/qabench/solve-ode-with-sympy/env.py")
    # No missing required fields, and the grader argv are non-empty str lists.
    assert REQUIRED_HUD_TASK_PROFILE_FIELDS <= set(profile)
    validated = hud_task_profile({"hud_task_profile": profile})
    assert validated["env_module_path"] == "envs/qabench/solve-ode-with-sympy/env.py"
    assert validated["task_factory"] == "build_task"
    assert validated["prompt_factory"] == "_prompt"
    assert validated["trusted_entrypoint_ref"] == "env:env"
    assert validated["grader_command_argv"][0] in ("python", "python3")


def test_forkpoint_carries_loadable_profile() -> None:
    # The captured ForkPoint embeds the profile, so branch_runs can resolve the env
    # module + factory from the ForkPoint alone (no FORKPROOF_TASK_ENV env var needed).
    fp = forkpoint_dict(
        "envs/qabench/implement-2d-convolution", "im-1", state_roots=("/app",)
    )
    profile = hud_task_profile(fp)  # raises if the embedded profile is incomplete
    assert profile["env_module_path"] == "envs/qabench/implement-2d-convolution/env.py"
    assert profile["task_factory"] == "build_task"


def test_factory_override_is_honored() -> None:
    profile = qabench_task_profile("envs/qabench/x/env.py", factory="custom_task")
    assert profile["task_factory"] == "custom_task"
