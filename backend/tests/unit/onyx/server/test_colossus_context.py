"""Colossus view hints cannot widen native Library identity or conversation scope."""

import pytest
from pydantic import ValidationError

from onyx.server.query_and_chat.causl.models import CauslSelection


def snapshot() -> dict:
    return {
        "version": 1,
        "revision": 3,
        "map_view": {"center": [0, 0]},
        "selected_place": {"unavailable": "No selected place"},
        "layers": {"active": []},
        "filters": {"scope": "world"},
        "dates": {"unavailable": "No source period selected"},
        "visible_results": {"returned": 0, "viewport_visible": None},
        "evidence_links": {"sources": []},
        "omissions": [],
        "privacy": "Browser-local overlays excluded",
    }


def test_colossus_snapshot_preserves_all_seven_categories():
    selection = CauslSelection.model_validate(
        {"page": "colossus", "snapshot": snapshot()}
    )
    assert selection.snapshot.revision == 3
    assert selection.query() == {"page": "workspace"}


@pytest.mark.parametrize(
    "field",
    [
        "map_view",
        "selected_place",
        "layers",
        "filters",
        "dates",
        "visible_results",
        "evidence_links",
    ],
)
def test_colossus_snapshot_rejects_missing_categories(field):
    value = snapshot()
    del value[field]
    with pytest.raises(ValidationError):
        CauslSelection.model_validate({"page": "colossus", "snapshot": value})


def test_colossus_snapshot_refuses_oversized_utf8_and_extra_overlay_content():
    value = snapshot()
    value["visible_results"] = {"rows": ["世" * 22000]}
    with pytest.raises(ValidationError):
        CauslSelection.model_validate({"page": "colossus", "snapshot": value})
    value = snapshot()
    value["local_overlay"] = {"private": "excluded"}
    with pytest.raises(ValidationError):
        CauslSelection.model_validate({"page": "colossus", "snapshot": value})


def test_colossus_requires_snapshot_and_does_not_accept_kb_record_authority():
    for value in [
        {"page": "colossus"},
        {"page": "workspace", "snapshot": snapshot()},
        {"page": "colossus", "snapshot": snapshot(), "marketId": "foreign"},
        {
            "page": "colossus",
            "snapshot": snapshot(),
            "record": {"type": "private", "id": "foreign"},
        },
    ]:
        with pytest.raises(ValidationError):
            CauslSelection.model_validate(value)
