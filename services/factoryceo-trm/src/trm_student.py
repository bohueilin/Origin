"""TRM-native student: a tiny recursive net that learns the repair policy.

This is the small specialised student in the Sillon/TRM sense. It does NOT use
chat templates -- it operates on a fixed-size tensor encoding of the verifier's
error signature and recursively predicts the next repair action type (the same
decision the rule-based `repair_one` dispatcher makes today). Architecture mirrors
the Tiny Recursive Model ("Less is More: Recursive Reasoning with Tiny Networks",
Samsung SAIL): a few-K-parameter net that refines a latent over H recursion steps.

  encoder + dataset builder : pure numpy, runs offline (used in tests)
  TinyRecursiveModel + train : torch, guarded (train on CPU/GPU)

Once trained, `LearnedRepairModel.pick_op` can replace the heuristic op-selection
in the repair loop -- TRM stays the architecture, the heuristic becomes learned.
"""

from __future__ import annotations

import json
import os

import numpy as np

# verifier hard-constraint error types (the input signature)
ERROR_TYPES = [
    "unknown_job", "unknown_operation", "unknown_machine", "unknown_operator",
    "unknown_material", "capability_mismatch", "operator_unqualified",
    "operator_unavailable", "maintenance_conflict", "machine_overlap",
    "operator_overlap", "precedence_violation", "bad_window",
    "material_shortage", "material_late",
]
# repair action types the student predicts (the output classes)
ACTION_OPS = [
    "move_operation", "swap_machine", "assign_operator", "add_overtime",
    "expedite_material", "safety_check", "warn_customer", "reject_rfq",
    "drop_operation", "noop",
]
EIDX = {t: i for i, t in enumerate(ERROR_TYPES)}
OIDX = {o: i for i, o in enumerate(ACTION_OPS)}
FEAT_DIM = len(ERROR_TYPES) + 1          # error-type counts + total-error scalar


def encode(errors) -> np.ndarray:
    """Encode a verifier error list into the fixed feature vector."""
    v = np.zeros(FEAT_DIM, dtype=np.float32)
    for e in errors:
        t = e["type"] if isinstance(e, dict) else e.type
        if t in EIDX:
            v[EIDX[t]] += 1.0
    v[-1] = float(len(errors))
    return v


def build_dataset(episodes_path: str):
    """(features, op_label) pairs from verified repair traces. Pure numpy."""
    X, y = [], []
    with open(episodes_path) as f:
        for line in f:
            ep = json.loads(line)
            errors = ep["verifier_before"]["errors"]
            for step in ep["repair_trace"]:
                op = step["repair_action"].get("op", "noop")
                X.append(encode(errors))
                y.append(OIDX.get(op, OIDX["noop"]))
                errors = step["errors_after"]
    return np.asarray(X, dtype=np.float32), np.asarray(y, dtype=np.int64)


# --------------------------------------------------------------------------- #
# tiny recursive model (torch, optional)
# --------------------------------------------------------------------------- #
def _build_model(in_dim=FEAT_DIM, hidden=32, n_actions=len(ACTION_OPS), recursions=4):
    import torch.nn as nn

    class TinyRecursiveModel(nn.Module):
        def __init__(self):
            super().__init__()
            self.inp = nn.Linear(in_dim, hidden)
            self.rec = nn.Linear(hidden * 2, hidden)   # refine latent from (z, x-embed)
            self.out = nn.Linear(hidden, n_actions)
            self.H = recursions

        def forward(self, x):
            import torch
            h = self.inp(x).tanh()
            z = h.new_zeros(h.shape)
            for _ in range(self.H):                     # recursive refinement
                z = self.rec(torch.cat([z, h], dim=-1)).tanh()
            return self.out(z)

    return TinyRecursiveModel()


def train(episodes_path: str, out_dir: str = "distill/trm-student",
          epochs: int = 30, lr: float = 1e-2):  # pragma: no cover - needs torch
    """Train the tiny recursive student on verified traces. CPU is fine (~K params)."""
    import torch
    X, y = build_dataset(episodes_path)
    model = _build_model()
    Xt, yt = torch.tensor(X), torch.tensor(y)
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    lossf = torch.nn.CrossEntropyLoss()
    for ep in range(epochs):
        opt.zero_grad()
        loss = lossf(model(Xt), yt)
        loss.backward(); opt.step()
        if (ep + 1) % 10 == 0:
            acc = (model(Xt).argmax(-1) == yt).float().mean().item()
            print(f"epoch {ep+1}: loss {loss.item():.3f} acc {acc:.3f}")
    os.makedirs(out_dir, exist_ok=True)
    torch.save(model.state_dict(), os.path.join(out_dir, "trm.pt"))
    n_params = sum(p.numel() for p in model.parameters())
    print(f"saved TRM student ({n_params} params) -> {out_dir}/trm.pt")
    return model


class LearnedRepairModel:  # pragma: no cover - needs a trained checkpoint
    """Loads a trained TRM and predicts the next repair op from an error list."""

    def __init__(self, ckpt: str = "distill/trm-student/trm.pt"):
        import torch
        self.model = _build_model()
        self.model.load_state_dict(torch.load(ckpt))
        self.model.eval()

    def pick_op(self, errors) -> str:
        import torch
        with torch.no_grad():
            logits = self.model(torch.tensor(encode(errors)).unsqueeze(0))
        return ACTION_OPS[int(logits.argmax(-1))]


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    eps = os.path.join(root, "results", "episodes.jsonl")
    X, y = build_dataset(eps)
    import collections
    dist = collections.Counter(ACTION_OPS[i] for i in y)
    print(f"dataset: {len(X)} (feature, op) pairs | feat_dim={FEAT_DIM} | "
          f"actions={len(ACTION_OPS)}")
    print("op label distribution:", dict(dist))
    print("train with: python -c \"from src.trm_student import train; "
          "train('results/episodes.jsonl')\"  (needs torch)")
