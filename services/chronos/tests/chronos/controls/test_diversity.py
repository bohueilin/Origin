"""Tests for path diversity labels and rationales."""

from chronos.controls.diversity import load_diversity_rationales, validate_all_paths
from chronos.controls.models import PATH_LABELS


def test_three_path_labels_have_rationales() -> None:
    rationales = load_diversity_rationales()
    assert set(rationales) == set(PATH_LABELS)


def test_path_shapes_are_distinct() -> None:
    validate_all_paths()
