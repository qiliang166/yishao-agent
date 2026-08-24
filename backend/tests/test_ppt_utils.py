"""Test pure utility functions from ppt_service — no DB or filesystem needed."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.ppt_service import _clean_json_response, _hex_to_rgb, _validate_column_id, _build_table_html


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


class TestBuildTableHtml:
    def test_materials_table_columns_from_key_points(self):
        # 用户新增「图示」列后 9 列：表头 + 数据都应为 9 列，含「图示」列名
        kps = ["序号", "食材分类", "名称", "品牌产地", "加工说明", "加工要求", "重量", "单位", "图示"]
        body = "1 | 干货 | 银鳕鱼 | 冰岛 | 干蒸 | 胶质不流失 | 100 | 克 | 图1"
        out = _build_table_html({"key_points": kps, "body": body}, "materials_table")
        assert out.count("<th style") == 9
        assert out.count("<td") == 9
        assert "图示" in out

    def test_materials_table_default_8_cells(self):
        kps = ["序号", "食材分类", "名称", "品牌产地", "加工说明", "加工要求", "重量", "单位"]
        body = (
            "1 | 干货 | 银鳕鱼 | 冰岛 | 干蒸 | 胶质不流失 | 100 | 克\n"
            "2 | 海鲜 | 鲍鱼 | 大连 | 涨发 | 保持弹性 | 50 | 克"
        )
        out = _build_table_html({"key_points": kps, "body": body}, "materials_table")
        assert out.count("<th style") == 8
        assert out.count("<td") == 16

    def test_odd_even_background(self):
        kps = ["序号", "A", "B"]
        body = "1 | x | y\n2 | p | q"
        out = _build_table_html({"key_points": kps, "body": body}, "materials_table")
        assert "background:rgba(var(--text-rgb),0.02)" in out
        assert "background:transparent" in out

    def test_steps_table_no_colspan(self):
        kps = ["序号", "关键词", "工具与器皿", "操作说明", "注意事项"]
        body = "1 | 涨发 | 蒸笼 | 干蒸后浸泡 | 胶质不流失"
        out = _build_table_html({"key_points": kps, "body": body}, "steps_table")
        assert "colspan" not in out
        assert out.count("<td") == 5

    def test_structured_rows_path(self):
        kps = ["序号", "A", "B", "C"]
        slide = {
            "key_points": kps,
            "rows": [
                ["1", "x", "y", "z"],
                ["2", "p", "q", "r"],
            ],
        }
        out = _build_table_html(slide, "materials_table")
        assert out.count("<td") == 8

    def test_skips_header_line(self):
        kps = ["序号", "A", "B"]
        body = "序号 | A | B\n1 | x | y"
        out = _build_table_html({"key_points": kps, "body": body}, "materials_table")
        assert out.count("<td") == 3

    def test_short_row_right_padded(self):
        # 漏填末列不丢行：右侧补空
        kps = ["序号", "A", "B", "C"]
        body = "1 | x | y"
        out = _build_table_html({"key_points": kps, "body": body}, "materials_table")
        assert out.count("<td") == 4

    def test_long_row_overflow_merged(self):
        # 多出列不丢行：超出部分合并进最后一列
        kps = ["序号", "A", "B"]
        body = "1 | x | y | z | w"
        out = _build_table_html({"key_points": kps, "body": body}, "materials_table")
        assert out.count("<td") == 3
        assert "y z w" in out

    def test_no_key_points_returns_empty(self):
        assert _build_table_html({"body": "1 | a | b"}, "materials_table") == ""

    def test_unparseable_body_returns_empty(self):
        kps = ["序号", "A", "B"]
        assert _build_table_html({"key_points": kps, "body": ""}, "materials_table") == ""
        # 只有表头行（首格「序号」被跳过）→ 无数据行 → 空串
        assert _build_table_html({"key_points": kps, "body": "序号 | A | B"}, "materials_table") == ""

    def test_wrong_type_returns_empty(self):
        kps = ["序号", "A", "B"]
        assert _build_table_html({"key_points": kps, "body": "1 | a | b"}, "cover") == ""
        assert _build_table_html({"key_points": kps, "body": "1 | a | b"}, "content") == ""
