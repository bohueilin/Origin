"""`python -m cobra.server` — live engine; `--replay FILE` — golden replay safety net."""

import argparse
import asyncio
import json
import socket
import sys

import uvicorn

from cobra.server.app import create_app
from cobra.server.bus import EventBus, to_wire
from cobra.server.replay import ReplayPublisher

# The live run defaults to the HARDEST tasks (sparse tests vs tricky logic = where cheats
# actually surface), so the siege has real gates to breach. Override with --tasks.
N_DEMO_GATES = 4
# Emergency easy-task fallback used ONLY if EvalPlus can't load — the demo downgrades off the
# hardest tasks, so we shout about it (see _default_task_ids) rather than fail the whole run.
_FALLBACK_TASKS = ["HumanEval/0", "HumanEval/2", "HumanEval/4", "HumanEval/8"]


def _default_task_ids(n: int = N_DEMO_GATES) -> list[str]:
    """The n hardest EvalPlus task ids; loudly falls back to an easy set if EvalPlus can't load."""
    try:
        from cobra.substrate import load_hardest

        return [t.task_id for t in load_hardest(n)]
    except Exception as exc:  # never silently downgrade the demo to easy tasks
        print(
            f"\n!!! EvalPlus failed to load ({type(exc).__name__}: {exc}).\n"
            f"!!! DOWNGRADING to the easy fallback tasks {_FALLBACK_TASKS} — NOT the hardest set.\n"
            f"!!! Fix EvalPlus or pass --tasks to run the intended demo.\n",
            file=sys.stderr,
            flush=True,
        )
        return _FALLBACK_TASKS


def _ensure_port_free(host: str, port: int) -> None:
    """Fail loudly BEFORE uvicorn half-starts if the port is taken (stage safety)."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.bind((host, port))
    except OSError:
        raise SystemExit(
            f"error: {host}:{port} is already in use — a previous server is still bound.\n"
            f"  free it:  lsof -ti:{port} | xargs kill\n"
            f"  or run on another port:  python -m cobra.server --port <N> [--replay FILE]"
        ) from None
    finally:
        probe.close()


def main() -> None:
    parser = argparse.ArgumentParser(prog="cobra.server")
    parser.add_argument("--replay", metavar="FILE", help="stream a recorded golden run")
    parser.add_argument("--speed", type=float, default=1.0, help="replay speed multiplier")
    parser.add_argument("--tasks", help="comma-separated EvalPlus task ids for the live run")
    parser.add_argument(
        "--record",
        metavar="FILE",
        help="tee the live event stream to a JSONL golden run (re-record the safety net)",
    )
    # Default the live red team to a weaker/cheaper model: it reward-hacks more readily, so the
    # siege actually surfaces breaches (a strong model tends to just solve the task). SPEC §9.5.
    parser.add_argument(
        "--model",
        default="claude-haiku-4-5-20251001",
        help="red-team model for the live siege (weaker = more cheats surface)",
    )
    parser.add_argument(
        "--seed",
        action="store_true",
        help="deterministic seed siege: reliable breach→seal→climb, no API key (the demo path)",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    bus = EventBus()
    if args.replay:
        publisher = ReplayPublisher(args.replay, bus, speed=args.speed)

        async def startup():
            await bus.connected.wait()  # hold until the dashboard connects
            await publisher.run()
    else:
        # Live: the conductor already emits the 7 locked Seam 2 dataclasses through `emit`,
        # so emit=bus.emit is a drop-in — identical wire format, no dashboard change.
        try:
            from cobra.breadth.loop import maybe_client
            from cobra.conductor.live import run_live
            from cobra.conductor.seed import run_seed
        except ModuleNotFoundError as exc:
            raise SystemExit(
                f"error: live engine not importable ({exc.name}). This branch needs the engine "
                f"(merge main → track-c), or run the golden replay safety net instead:\n"
                f"  make demo"
            ) from None

        task_ids = args.tasks.split(",") if args.tasks else _default_task_ids()
        client = None if args.seed else maybe_client()

        async def startup():
            loop = asyncio.get_running_loop()
            rec = open(args.record, "w") if args.record else None  # noqa: SIM115 — closed in finally

            # The bus uses asyncio.Queue (not thread-safe); run_live is sync and runs in a
            # worker thread, so marshal each emit back onto the loop. No connected.wait here:
            # the live engine runs on its own; late browsers catch up via the bus backlog.
            # With --record, tee each emitted event to a golden JSONL in wire order.
            def emit(event):
                loop.call_soon_threadsafe(bus.emit, event)
                if rec:
                    rec.write(json.dumps(to_wire(event)) + "\n")
                    rec.flush()

            try:
                if args.seed:  # deterministic siege — reliable breach→seal→climb, no API key
                    await asyncio.to_thread(run_seed, task_ids, emit=emit)
                else:
                    await asyncio.to_thread(
                        run_live, task_ids, client=client, emit=emit, model=args.model
                    )
            finally:
                if rec:
                    rec.close()
                    print(f"recorded golden run → {args.record}")

    _ensure_port_free(args.host, args.port)
    base = f"http://{args.host}:{args.port}"
    print(f"siege dashboard (3D) → {base}     (2D fallback → {base}/2d)")
    uvicorn.run(create_app(bus, startup=startup), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
