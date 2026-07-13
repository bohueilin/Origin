"""`python -m cobra.server.leaderboard_main --port 8100 [--db ...] [--seed]`.

Runs the verifier-safety leaderboard app (separate from the siege server). `--seed` inserts a few
example submissions so the frontend has data to render immediately.
"""

import argparse
import os
import socket

import uvicorn

from cobra.server import store
from cobra.server.leaderboard import create_leaderboard_app
from cobra.server.seed import seed_board


def _ensure_port_free(host: str, port: int) -> None:
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.bind((host, port))
    except OSError:
        raise SystemExit(
            f"error: {host}:{port} is already in use.\n"
            f"  free it:  lsof -ti:{port} | xargs kill\n"
            f"  or:  python -m cobra.server.leaderboard_main --port <N>"
        ) from None
    finally:
        probe.close()


def main() -> None:
    ap = argparse.ArgumentParser(prog="cobra.server.leaderboard_main")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8100)
    ap.add_argument("--db", default=store.DEFAULT_DB)
    ap.add_argument(
        "--seed", action="store_true", help="insert example submissions for the frontend"
    )
    args = ap.parse_args()

    store.init_db(args.db)
    if args.seed:
        n = seed_board(args.db)
        print(f"seeded {n} example submissions into {args.db}")

    # The verified tier EXECUTES attacker-supplied completions in a best-effort in-process
    # sandbox (an in-interpreter socket monkeypatch + Linux-only rlimits — NOT a security
    # boundary). Binding off-loopback is therefore remote code execution. Refuse unless the
    # operator explicitly acknowledges they have real OS-level isolation in front of it.
    loopback = args.host in ("127.0.0.1", "::1", "localhost")
    if not loopback and os.environ.get("COBRA_ALLOW_UNTRUSTED_EXEC_OFF_LOOPBACK") != "1":
        raise SystemExit(
            f"refusing to bind {args.host}: the verified tier runs attacker-supplied code in a "
            "best-effort in-process sandbox that is NOT a security boundary — binding off-loopback "
            "is remote code execution. Run behind real isolation (container/gVisor/microVM) and "
            "set COBRA_ALLOW_UNTRUSTED_EXEC_OFF_LOOPBACK=1 to override."
        )

    _ensure_port_free(args.host, args.port)
    print(f"leaderboard → http://{args.host}:{args.port}/board   (api: /api/leaderboard)")
    uvicorn.run(create_leaderboard_app(args.db), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
