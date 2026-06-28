"""V-JEPA 2 world model / perception for the humanoid execution layer.

We do not train anything new here -- we use Meta's pre-trained, frozen V-JEPA 2
off the Hugging Face Hub (``facebook/vjepa2-vitl-fpc64-256``; the
``...-ac`` action-conditioned variants are the world-model checkpoints for
robot planning). V-JEPA's job in FactoryCEO-TRM:

  * embed rollout frames from the humanoid simulator (Isaac Sim/Lab) into a
    latent, and
  * score whether an execution reached the intended goal state by latent
    distance (a verifier-free success signal in embedding space).

This complements the symbolic verifier: the verifier proves the *plan* is
feasible; V-JEPA confirms the *physical execution* matched it. The symbolic
brain stays a TRM; JEPA handles perception/world-modeling.

Heavy deps (torch + transformers + weights, GPU) are optional. With them
absent, ``available`` is False and a deterministic latent stub keeps the rest
of the pipeline runnable offline.
"""

from __future__ import annotations

from typing import Optional

import numpy as np

VJEPA2_MODEL = "facebook/vjepa2-vitl-fpc64-256"


class VJEPAWorldModel:
    def __init__(self, model_id: str = VJEPA2_MODEL, device: Optional[str] = None):
        self.model_id = model_id
        self.device = device
        self._model = None
        self._proc = None

    @property
    def available(self) -> bool:
        try:
            import torch  # noqa: F401
            import transformers  # noqa: F401
            return True
        except ImportError:
            return False

    def _ensure(self):
        if self._model is not None:
            return
        import torch
        from transformers import AutoModel, AutoVideoProcessor
        self.device = self.device or ("cuda" if torch.cuda.is_available() else "cpu")
        self._proc = AutoVideoProcessor.from_pretrained(self.model_id)
        self._model = AutoModel.from_pretrained(self.model_id).to(self.device).eval()

    def embed(self, frames) -> np.ndarray:
        """Embed a clip (T,H,W,3 uint8) into a pooled latent vector.

        Falls back to a deterministic content-hash embedding when V-JEPA 2 is not
        installed, so downstream success-scoring stays runnable offline.
        """
        if not self.available:
            arr = np.asarray(frames, dtype=np.float32)
            rng = np.random.default_rng(int(arr.sum()) % (2**32))
            return rng.standard_normal(1024).astype(np.float32)
        import torch
        self._ensure()
        inputs = self._proc(frames, return_tensors="pt").to(self.device)
        with torch.no_grad():
            out = self._model(**inputs)
        h = out.last_hidden_state  # (B, N, D)
        return h.mean(dim=1).squeeze(0).cpu().numpy()

    def success_score(self, achieved_frames, goal_frames) -> float:
        """Cosine similarity in V-JEPA latent space: did the humanoid reach the
        intended goal state? Use as a verifier-free reward shaping signal."""
        a = self.embed(achieved_frames)
        g = self.embed(goal_frames)
        denom = (np.linalg.norm(a) * np.linalg.norm(g)) or 1.0
        return float(np.dot(a, g) / denom)
