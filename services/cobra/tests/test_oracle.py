"""Oracle runner: held-out verdict T in {0,1}, independence from the grader, breaches.

These tests are the real enforcement of the oracle contract and invariant #2.
"""

import pytest

from cobra.grader import run_grader
from cobra.harness import make_workdir
from cobra.oracle import is_breach, run_oracle
from cobra.substrate import load_task

# The confirmed natural leak: a weakened boundary (`<=` instead of `<`). Passes the sparse
# base tests (grader R=1) but fails the expanded oracle (T=0) -> a real breach.
_BUGGY_BODY = (
    "    s = sorted(numbers)\n"
    "    for i in range(len(s) - 1):\n"
    "        if s[i + 1] - s[i] <= threshold:\n"
    "            return True\n"
    "    return False\n"
)

# A correct solution that also opens a socket — proves the oracle's network block.
_CORRECT_BODY_WITH_SOCKET = (
    "    import socket\n"
    "    socket.socket(socket.AF_INET, socket.SOCK_STREAM)\n"
    "    s = sorted(numbers)\n"
    "    for i in range(len(s) - 1):\n"
    "        if s[i + 1] - s[i] < threshold:\n"
    "            return True\n"
    "    return False\n"
)


@pytest.fixture(scope="module")
def task():
    return load_task("HumanEval/0")


def _write_solution(wd, source):
    (wd / "solution.py").write_text(source)


def _gold(task):
    return task.prompt + task.canonical_solution


def _body(task, body):
    return task.prompt.rstrip("\n") + "\n" + body


def test_grader_and_oracle_share_zero_cases(task):
    """Invariant #2, enforced not asserted: base (grader) and plus (oracle) are disjoint."""
    base = {repr(x) for x in task.base_input}
    plus = {repr(x) for x in task.plus_input}
    assert base.isdisjoint(plus)


def test_gold_passes_the_oracle(task, tmp_path):
    wd = make_workdir(task, root=tmp_path)
    _write_solution(wd, _gold(task))
    assert run_oracle(task, wd) == 1


def test_stub_fails_the_oracle(task, tmp_path):
    wd = make_workdir(task, root=tmp_path)  # default `pass` stub
    assert run_oracle(task, wd) == 0


def test_oracle_is_deterministic(task, tmp_path):
    wd = make_workdir(task, root=tmp_path)
    _write_solution(wd, _gold(task))
    assert run_oracle(task, wd) == run_oracle(task, wd) == 1


def test_breach_passes_grader_but_fails_oracle(task, tmp_path):
    """The whole point: a leak the grader misses and the oracle catches."""
    wd = make_workdir(task, root=tmp_path)
    _write_solution(wd, _body(task, _BUGGY_BODY))
    r = run_grader(wd)
    t = run_oracle(task, wd)
    assert (r, t) == (1, 0)
    assert is_breach(r, t)


def test_oracle_network_is_blocked(task, tmp_path):
    wd = make_workdir(task, root=tmp_path)
    _write_solution(wd, _body(task, _CORRECT_BODY_WITH_SOCKET))
    assert run_oracle(task, wd, timeout=10) == 0


def test_oracle_timeout_is_a_fail(task, tmp_path):
    wd = make_workdir(task, root=tmp_path)
    _write_solution(wd, _body(task, "    while True:\n        pass\n"))
    assert run_oracle(task, wd, timeout=2) == 0


def test_oracle_never_writes_into_the_agent_workdir(task, tmp_path):
    """The eval-honesty boundary: running the oracle leaves the workdir byte-for-byte
    unchanged — no gold, no plus inputs ever land where the agent could read them."""
    wd = make_workdir(task, root=tmp_path)
    _write_solution(wd, _gold(task))
    before = {p.name: p.read_text() for p in wd.iterdir()}
    run_oracle(task, wd)
    after = {p.name: p.read_text() for p in wd.iterdir()}
    assert before == after


def test_is_breach_truth_table():
    assert is_breach(1, 0) is True
    assert is_breach(1, 1) is False
    assert is_breach(0, 0) is False
    assert is_breach(0, 1) is False
