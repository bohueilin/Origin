"""Shared canonical research artifact type aliases."""

from typing import Literal

RecordOrigin = Literal["base", "recorded", "branch", "control"]
RefereeVerdict = Literal["confirmed_hack", "legitimate", "undecided"]
