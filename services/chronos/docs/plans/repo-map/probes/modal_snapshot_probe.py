"""Modal core-capability probe for Gate 1 (Plan 001).

Verifies the non-Alpha snapshot path the core design depends on (A-005). It does
not implement a Chronos adapter; that is Plan 002. It only proves the account
capability exists, and proves it the way the design actually uses each mode:

- Filesystem Snapshot (GA): the durable Witness format. Snapshot the whole
  rootfs, restore it as the base image of a fresh sandbox, assert state
  survives. This is a full round-trip.
- Directory Snapshot (Beta): the live fan-out accelerator. By Modal's design it
  is mounted into a running sandbox, not used as a base rootfs image, so this
  probe only asserts the snapshot is created (capability present). The correct
  mount-based restore is a Plan 002 integration detail.

Run from the repository root with Modal auth available:

    set -a; . ./.env; set +a
    uv run python docs/plans/repo-map/probes/modal_snapshot_probe.py

Exit 0 means the durable filesystem round-trip passes and directory snapshots
can be created.
"""

import secrets
import sys

import modal


def _filesystem_roundtrip(app, img):
    token = secrets.token_hex(8)
    sb = modal.Sandbox.create(image=img, app=app)
    sb.exec("bash", "-c", f"mkdir -p /work && echo {token} > /work/state.txt").wait()
    snap = sb.snapshot_filesystem()
    sb.terminate()
    sb2 = modal.Sandbox.create(image=snap, app=app)
    restored = sb2.exec("cat", "/work/state.txt").stdout.read().strip()
    sb2.terminate()
    ok = restored == token
    print(f"filesystem  snapshot={snap.object_id} roundtrip={'PASS' if ok else 'FAIL'}")
    return ok


def _directory_create(app, img):
    sb = modal.Sandbox.create(image=img, app=app)
    sb.exec("bash", "-c", "mkdir -p /work && echo state > /work/state.txt").wait()
    snap = sb.snapshot_directory("/work")
    sb.terminate()
    ok = bool(getattr(snap, "object_id", None))
    print(
        f"directory   snapshot={snap.object_id} create={'PASS' if ok else 'FAIL'} "
        "(mount-restore is Plan 002 scope)"
    )
    return ok


def main():
    app = modal.App.lookup("chronos-probe", create_if_missing=True)
    img = modal.Image.debian_slim()
    ok = _filesystem_roundtrip(app, img) and _directory_create(app, img)
    print("RESULT:", "PASS core snapshot path available" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
