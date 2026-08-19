"""Test pure utility functions from ppt_service — no DB or filesystem needed."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.ppt_service import _clean_json_response, _hex_to_rgb, _validate_column_id, _build_table_rows


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


class TestBuildTableRows:
    def test_materials_table_8_cells_per_row(self):
        body = (
            "1 | 干货 | 银鳕鱼 | 冰岛 | 干蒸后50℃浸泡8h | 胶质不流失 | 100 | 克\n"
            "2 | 海鲜 | 鲍鱼 | 大连 | 涨发 | 保持弹性 | 50 | 克"
        )
        out = _build_table_rows({"body": body}, "materials_table")
        assert out.count("<tr") == 2
        assert out.split("</tr>")[0].count("<td") == 8

    def test_materials_table_odd_even_background(self):
        body = (
            "1 | 干货 | 银鳕鱼 | — | — | — | 100 | 克\n"
            "2 | 海鲜 | 鲍鱼 | — | — | — | 50 | 克"
        )
        out = _build_table_rows({"body": body}, "materials_table")
        assert "background:rgba(var(--text-rgb),0.02)" in out
        assert "background:transparent" in out

    def test_steps_table_colspans(self):
        body = "1 | 涨发 | 蒸笼 | 干蒸后浸泡 | 胶质不流失"
        out = _build_table_rows({"body": body}, "steps_table")
        assert out.count("<tr") == 1
        assert 'colspan="3"' in out
        assert 'colspan="2"' in out

    def test_structured_rows_path(self):
        slide = {
            "rows": [
                ["1", "干货", "银鳕鱼", "—", "—", "—", "100", "克"],
                ["2", "海鲜", "鲍鱼", "—", "—", "—", "50", "克"],
            ]
        }
        out = _build_table_rows(slide, "materials_table")
        assert out.count("<tr") == 2

    def test_skips_header_line(self):
        body = (
            "序号 | 分类 | 名称 | 品牌 | 加工说明 | 加工要求 | 重量 | 单位\n"
            "1 | 干货 | 银鳕鱼 | — | — | — | 100 | 克"
        )
        out = _build_table_rows({"body": body}, "materials_table")
        assert out.count("<tr") == 1

    def test_unparseable_body_returns_empty(self):
        assert _build_table_rows({"body": "free prose with no pipes"}, "materials_table") == ""
        assert _build_table_rows({"body": ""}, "materials_table") == ""

    def test_wrong_type_returns_empty(self):
        assert _build_table_rows({"body": "1 | a | b | c"}, "cover") == ""
        assert _build_table_rows({"body": "1 | a | b | c"}, "content") == ""
