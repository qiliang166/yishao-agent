"""Test column_configs rules JSON structure integrity."""
import json
import sys
import os
import pytest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


REQUIRED_RULES_KEYS = {"design_rules", "layout_types", "checklist"}
REQUIRED_DESIGN_RULES = {"color_discipline", "font_discipline"}
REQUIRED_CHECKLIST = {"p0_must_pass"}


def _parse_rules(rules_str: str) -> dict:
    """Parse rules JSON string, return dict or empty dict on failure."""
    if not rules_str:
        return {}
    try:
        return json.loads(rules_str) if isinstance(rules_str, str) else rules_str
    except json.JSONDecodeError:
        return {}


class TestRulesJsonIntegrity:
    def test_col4_has_all_required_keys(self, seed_col_rules):
        row = seed_col_rules.execute(
            "SELECT rules FROM column_configs WHERE column_id = ?", ("col4",)
        ).fetchone()
        assert row is not None
        rules = _parse_rules(row["rules"])
        missing = REQUIRED_RULES_KEYS - set(rules.keys())
        assert not missing, f"col4 rules missing: {missing}"

    def test_col5_has_all_required_keys(self, seed_col_rules):
        row = seed_col_rules.execute(
            "SELECT rules FROM column_configs WHERE column_id = ?", ("col5",)
        ).fetchone()
        assert row is not None
        rules = _parse_rules(row["rules"])
        missing = REQUIRED_RULES_KEYS - set(rules.keys())
        assert not missing, f"col5 rules missing: {missing}"

    def test_col4_design_rules_complete(self, seed_col_rules):
        row = seed_col_rules.execute(
            "SELECT rules FROM column_configs WHERE column_id = ?", ("col4",)
        ).fetchone()
        rules = _parse_rules(row["rules"])
        dr = rules.get("design_rules", {})
        missing = REQUIRED_DESIGN_RULES - set(dr.keys())
        assert not missing, f"col4 design_rules missing: {missing}"

    def test_col5_design_rules_complete(self, seed_col_rules):
        row = seed_col_rules.execute(
            "SELECT rules FROM column_configs WHERE column_id = ?", ("col5",)
        ).fetchone()
        rules = _parse_rules(row["rules"])
        dr = rules.get("design_rules", {})
        missing = REQUIRED_DESIGN_RULES - set(dr.keys())
        assert not missing, f"col5 design_rules missing: {missing}"

    def test_col4_has_layout_types(self, seed_col_rules):
        row = seed_col_rules.execute(
            "SELECT rules FROM column_configs WHERE column_id = ?", ("col4",)
        ).fetchone()
        rules = _parse_rules(row["rules"])
        layouts = rules.get("layout_types", [])
        assert len(layouts) >= 2, f"col4 has {len(layouts)} layout_types, expected >= 2"

    def test_col5_has_layout_types(self, seed_col_rules):
        row = seed_col_rules.execute(
            "SELECT rules FROM column_configs WHERE column_id = ?", ("col5",)
        ).fetchone()
        rules = _parse_rules(row["rules"])
        layouts = rules.get("layout_types", [])
        assert len(layouts) >= 2, f"col5 has {len(layouts)} layout_types, expected >= 2"

    def test_col4_checklist_has_p0(self, seed_col_rules):
        row = seed_col_rules.execute(
            "SELECT rules FROM column_configs WHERE column_id = ?", ("col4",)
        ).fetchone()
        rules = _parse_rules(row["rules"])
        p0 = rules.get("checklist", {}).get("p0_must_pass", [])
        assert len(p0) >= 1, f"col4 p0_must_pass has {len(p0)} items, expected >= 1"

    def test_col5_checklist_has_p0(self, seed_col_rules):
        row = seed_col_rules.execute(
            "SELECT rules FROM column_configs WHERE column_id = ?", ("col5",)
        ).fetchone()
        rules = _parse_rules(row["rules"])
        p0 = rules.get("checklist", {}).get("p0_must_pass", [])
        assert len(p0) >= 1, f"col5 p0_must_pass has {len(p0)} items, expected >= 1"

    def test_canvas_dimensions_default(self, seed_col_rules):
        row = seed_col_rules.execute(
            "SELECT rules FROM column_configs WHERE column_id = ?", ("col4",)
        ).fetchone()
        rules = _parse_rules(row["rules"])
        canvas = rules.get("canvas", {})
        assert canvas.get("width") == 1280
        assert canvas.get("height") == 720

    def test_canvas_dimensions_a4(self, seed_col_rules):
        row = seed_col_rules.execute(
            "SELECT rules FROM column_configs WHERE column_id = ?", ("col3",)
        ).fetchone()
        rules = _parse_rules(row["rules"])
        canvas = rules.get("canvas", {})
        assert canvas.get("width") == 794
        assert canvas.get("height") == 1123

    def test_col4_and_col5_have_different_layouts(self, seed_col_rules):
        """Verify col4 and col5 have different layout_types — they should differ."""
        row4 = seed_col_rules.execute(
            "SELECT rules FROM column_configs WHERE column_id = ?", ("col4",)
        ).fetchone()
        row5 = seed_col_rules.execute(
            "SELECT rules FROM column_configs WHERE column_id = ?", ("col5",)
        ).fetchone()
        rules4 = _parse_rules(row4["rules"])
        rules5 = _parse_rules(row5["rules"])
        layouts4 = [lt["id"] for lt in rules4.get("layout_types", [])]
        layouts5 = [lt["id"] for lt in rules5.get("layout_types", [])]
        assert layouts4 != layouts5, (
            f"col4 and col5 should have different layout_types, "
            f"but both have: {layouts4}"
        )

    def test_canvas_w_h_are_positive_integers(self, seed_col_rules):
        for col_id in ("col3", "col4", "col5"):
            row = seed_col_rules.execute(
                "SELECT rules FROM column_configs WHERE column_id = ?", (col_id,)
            ).fetchone()
            rules = _parse_rules(row["rules"])
            canvas = rules.get("canvas", {})
            w = canvas.get("width", 0)
            h = canvas.get("height", 0)
            assert isinstance(w, int) and w > 0, f"{col_id} canvas width invalid: {w}"
            assert isinstance(h, int) and h > 0, f"{col_id} canvas height invalid: {h}"
