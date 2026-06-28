"""Sample Staer Warehouses frames + metadata for local ShiftBench assets.

This is intentionally capped. The full Staer release is large, so this script:
  * reads HF_TOKEN from env/.env files without printing it;
  * lists the gated Hugging Face dataset;
  * downloads scene_graph.json and per-walkthrough metadata/manifest files;
  * downloads preview.mp4 or cam0/video.mp4 files one at a time;
  * extracts JPEG frames with ffmpeg up to --max-frames;
  * writes public/factoryceo/staer-samples/manifest.json.

Default uses preview.mp4 to keep the first pass small. Use --video-kind cam0 for
full RGB walkthrough video sampling when you have disk/time budget.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
REPO = "staerrobotics/warehouses"
HF_BASE = f"https://huggingface.co/datasets/{REPO}"
API_TREE = f"https://huggingface.co/api/datasets/{REPO}/tree/main"
DOTENV_PATHS = [
    ROOT / ".env",
    ROOT / ".env.local",
    ROOT / "factoryceo_trm" / ".env",
    ROOT / "factoryceo_trm" / ".env.local",
]


def dotenv_token() -> str | None:
    if os.environ.get("HF_TOKEN"):
        return os.environ["HF_TOKEN"].strip()
    for path in DOTENV_PATHS:
        if not path.exists():
            continue
        for raw in path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() == "HF_TOKEN":
                return value.strip().strip('"').strip("'")
    return None


def request_json(url: str, token: str) -> Any:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def download_file(path: str, out: Path, token: str) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    encoded = "/".join(urllib.parse.quote(part) for part in path.split("/"))
    url = f"{HF_BASE}/resolve/main/{encoded}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=180) as r:
        out.write_bytes(r.read())


def dataset_files(token: str) -> list[dict]:
    out: list[dict] = []
    cursor = ""
    while True:
        url = f"{API_TREE}?recursive=true&expand=false"
        if cursor:
            url += f"&cursor={urllib.parse.quote(cursor)}"
        chunk = request_json(url, token)
        if isinstance(chunk, list):
            out.extend(x for x in chunk if isinstance(x, dict))
            break
        siblings = chunk.get("siblings") or chunk.get("tree") or []
        out.extend(x for x in siblings if isinstance(x, dict))
        cursor = chunk.get("cursor") or chunk.get("nextCursor") or ""
        if not cursor:
            break
    return out


def extract_frames(video_path: Path, out_dir: Path, *, fps: float, remaining: int) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = out_dir / "frame-%06d.jpg"
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(video_path),
        "-vf",
        f"fps={fps}",
        "-frames:v",
        str(remaining),
        "-q:v",
        "3",
        str(pattern),
    ]
    subprocess.run(cmd, check=True)
    return sorted(out_dir.glob("frame-*.jpg"))


def parse_scene_walk(path: str) -> tuple[str, str | None]:
    parts = path.split("/")
    scene = next((p for p in parts if p.startswith("scene")), "unknown")
    walk = None
    if "walkthroughs" in parts:
        i = parts.index("walkthroughs")
        if i + 1 < len(parts):
            walk = parts[i + 1]
    return scene, walk


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-frames", type=int, default=1000, help="maximum JPEG frames to keep")
    ap.add_argument("--max-videos", type=int, default=80, help="maximum walkthrough videos to sample")
    ap.add_argument("--fps", type=float, default=0.2, help="sample rate per video; 0.2 = one frame every 5 seconds")
    ap.add_argument("--video-kind", choices=["preview", "cam0"], default="preview")
    ap.add_argument("--out", default=str(ROOT / "public" / "factoryceo" / "staer-samples"))
    args = ap.parse_args()

    token = dotenv_token()
    if not token:
        print("HF_TOKEN not found in env/.env files.", file=sys.stderr)
        return 2
    if shutil.which("ffmpeg") is None:
        print("ffmpeg is required to extract frames.", file=sys.stderr)
        return 2

    out_root = Path(args.out)
    image_dir = out_root / "images"
    meta_dir = out_root / "metadata"
    graph_dir = out_root / "scene_graphs"
    tmp_dir = out_root / "_tmp"
    image_dir.mkdir(parents=True, exist_ok=True)
    meta_dir.mkdir(parents=True, exist_ok=True)
    graph_dir.mkdir(parents=True, exist_ok=True)
    tmp_dir.mkdir(parents=True, exist_ok=True)

    files = dataset_files(token)
    paths = sorted(x["path"] for x in files if x.get("type") == "file" and x.get("path"))
    scene_graphs = [p for p in paths if p.endswith("scene_graph.json")]
    meta_files = [p for p in paths if p.endswith("/metadata.json") or p.endswith("/manifest.json")]
    if args.video_kind == "preview":
        videos = [p for p in paths if p.endswith("/preview.mp4")]
    else:
        videos = [p for p in paths if p.endswith("/cam0/video.mp4")]
    videos = videos[: args.max_videos]

    print(f"Dataset files: {len(paths)} · videos selected: {len(videos)} · cap: {args.max_frames} frames")

    for p in scene_graphs:
        scene, _ = parse_scene_walk(p)
        download_file(p, graph_dir / f"{scene}.scene_graph.json", token)

    for p in meta_files:
        scene, walk = parse_scene_walk(p)
        if not walk:
            continue
        name = f"{scene}_walk{walk}_{Path(p).name}"
        download_file(p, meta_dir / name, token)

    samples: list[dict] = []
    video_records: list[dict] = []
    with tempfile.TemporaryDirectory(dir=tmp_dir) as td:
        tmp = Path(td)
        for vi, p in enumerate(videos, start=1):
            if len(samples) >= args.max_frames:
                break
            scene, walk = parse_scene_walk(p)
            video_local = tmp / f"{scene}_{walk}_{Path(p).name}"
            try:
                download_file(p, video_local, token)
                frame_tmp = tmp / f"frames_{vi}"
                frames = extract_frames(video_local, frame_tmp, fps=args.fps, remaining=args.max_frames - len(samples))
            except (urllib.error.HTTPError, urllib.error.URLError, subprocess.CalledProcessError, TimeoutError) as e:
                print(f"skip {p}: {type(e).__name__}", file=sys.stderr)
                continue

            video_records.append({
                "scene": scene,
                "walkthrough": walk,
                "source_path": p,
                "video_kind": args.video_kind,
                "frames_extracted": len(frames),
            })
            for frame_idx, frame in enumerate(frames):
                if len(samples) >= args.max_frames:
                    break
                out_name = f"{scene}_walk{walk}_{args.video_kind}_{len(samples):06d}.jpg"
                out_path = image_dir / out_name
                shutil.move(str(frame), out_path)
                samples.append({
                    "id": out_path.stem,
                    "file": f"/factoryceo/staer-samples/images/{out_name}",
                    "scene": scene,
                    "walkthrough": walk,
                    "video_kind": args.video_kind,
                    "source_video": p,
                    "frame_index_in_video_sample": frame_idx,
                    "sample_index": len(samples),
                })

    manifest = {
        "dataset": "Staer Warehouses",
        "source": HF_BASE,
        "video_kind": args.video_kind,
        "sample_fps": args.fps,
        "max_frames": args.max_frames,
        "n_samples": len(samples),
        "n_videos": len(video_records),
        "n_scene_graphs": len(scene_graphs),
        "metadata_dir": "/factoryceo/staer-samples/metadata",
        "scene_graph_dir": "/factoryceo/staer-samples/scene_graphs",
        "videos": video_records,
        "samples": samples,
    }
    (out_root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Wrote {len(samples)} sampled frames -> {out_root / 'manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
