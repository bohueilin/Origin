"""Local repository environment loading for trusted orchestration code."""

from __future__ import annotations

import os
from pathlib import Path


def load_local_env(root: Path) -> dict[str, str]:
    """Load root `.env` values without overriding an explicit process env.

    The local `.env` file is trusted orchestrator configuration only. It must be
    read before SDK clients such as Modal or HUD are constructed, and its values
    must never be copied into untrusted branch sandboxes.
    """

    env_path = root / ".env"
    loaded: dict[str, str] = {}
    if not env_path.exists():
        return loaded
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip().removeprefix("export ").strip()
        value = value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value
            loaded[key] = value
    return loaded


def credential_presence(names: tuple[str, ...]) -> dict[str, str]:
    return {name: "present" if os.environ.get(name) else "absent" for name in names}
