"""FactoryCEO-TRM: a verifiable RL/RFT environment for autonomous factory operation."""

def _load_dotenv() -> None:
    """Minimal zero-dependency .env loader (project root). Existing env wins."""
    import os
    from pathlib import Path
    p = Path(__file__).resolve().parent.parent / ".env"
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


_load_dotenv()
