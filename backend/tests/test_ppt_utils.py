"""Test pure utility functions from ppt_service — no DB or filesystem needed."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.ppt_service import _clean_json_response, _hex_to_rgb, _validate_column_id


class TestCleanJsonResponse:
    def test_strips_markdown_fence(self):
        result = _clean_json_response('```json\n{"key":"value"}\n```')
        assert result == '{"key":"value"}'

    def test_strips_markdown_fence_no_lang(self):
        result = _clean_json_response('```\n{"key":"value"}\n```')
        assert result == '{"key":"value"}'

    def test_strips_ppt_outline_markers(self):
        result = _clean_json_response('[PPT_OUTLINE]\n{"key":"value"}\n[/PPT_OUTLINE]')
        assert result == '{"key":"value"}'

    def test_handles_plain_json(self):
        result = _clean_json_response('{"key":"value"}')
        assert result == '{"key":"value"}'

    def test_handles_empty(self):
        result = _clean_json_response('')
        assert result == ''

    def test_handles_whitespace_only(self):
        result = _clean_json_response('   \n  \t  ')
        assert result == ''


class TestHexToRgb:
    def test_standard_hex(self):
        assert _hex_to_rgb("#1a365d") == (26, 54, 93)
        assert _hex_to_rgb("#1A365D") == (26, 54, 93)

    def test_without_hash(self):
        assert _hex_to_rgb("ff0000") == (255, 0, 0)

    def test_short_hex(self):
        assert _hex_to_rgb("#abc") == (170, 187, 204)
        assert _hex_to_rgb("#fff") == (255, 255, 255)

    def test_black(self):
        assert _hex_to_rgb("#000000") == (0, 0, 0)

    def test_invalid_returns_zero(self):
        assert _hex_to_rgb("notacolor") == (0, 0, 0)
        assert _hex_to_rgb("") == (0, 0, 0)

    def test_invalid_hex_raises_valueerror(self):
        import pytest
        with pytest.raises(ValueError):
            _hex_to_rgb("#ggghhh")


class TestValidateColumnId:
    def test_valid_ids(self):
        assert _validate_column_id("col1") == "col1"
        assert _validate_column_id("col4") == "col4"
        assert _validate_column_id("my-col_5") == "my-col_5"

    def test_rejects_dot_slash(self):
        assert _validate_column_id("../etc") == ""
        assert _validate_column_id("col/4") == ""

    def test_empty_returns_empty(self):
        assert _validate_column_id("") == ""
        assert _validate_column_id(None) == ""

    def test_rejects_special_chars(self):
        assert _validate_column_id("col;drop") == ""
        assert _validate_column_id("col 4") == ""
