"""Track B — baselines for the engine number and grader-type comparison.

- fuzzer: the dumb (no-targeting) probe baseline vs the conductor (the engine number).
- raw_llm: the no-orchestration red-agent ablation (fuzzer < raw LLM < conductor).
- llm_grader: the LLM-as-judge verifier foil, vs the naive test grader.
"""

from .foil_cheats import foil_cheats, injection_cheat
from .fuzzer import EngineNumber, FuzzerReport, engine_number, run_fuzzer
from .llm_grader import compare_verdicts, llm_grade
from .raw_llm import RawLLMReport, raw_llm_breaches

__all__ = [
    "EngineNumber",
    "FuzzerReport",
    "RawLLMReport",
    "compare_verdicts",
    "engine_number",
    "foil_cheats",
    "injection_cheat",
    "llm_grade",
    "raw_llm_breaches",
    "run_fuzzer",
]
