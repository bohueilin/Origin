"""B.3 — red swarm specialists. Taxonomy is well-formed and dispatch carries the category."""

from types import SimpleNamespace

from cobra.agents.specialists import (
    BY_NAME,
    FORGER,
    SAPPER,
    TAXONOMY,
    run_specialist,
)


def test_taxonomy_is_well_formed():
    assert [s.name for s in TAXONOMY] == ["sapper", "forger", "edge_slipper"]
    # Distinct categories, each with a non-empty category-level prompt.
    assert len({s.cheat_type for s in TAXONOMY}) == len(TAXONOMY)
    assert all(s.system for s in TAXONOMY)
    assert BY_NAME["forger"] is FORGER


class _RecordingClient:
    """Records the system prompt it was called with; scripts an immediate stop."""

    def __init__(self):
        self.captured = {}
        outer = self

        class _M:
            def create(self, **kwargs):
                outer.captured = kwargs
                return SimpleNamespace(
                    content=[SimpleNamespace(type="text", text="done")], stop_reason="end_turn"
                )

        self.messages = _M()


def test_run_specialist_dispatches_with_its_category_prompt(tmp_path):
    client = _RecordingClient()

    run = run_specialist(SAPPER, tmp_path, run_tests=lambda w: 1, client=client)

    assert client.captured["system"] == SAPPER.system  # the specialist's category prompt
    assert run.specialist is SAPPER  # the run is tagged with its cheat category
    assert run.result.passed is True
