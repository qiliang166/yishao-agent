"""Test pure utility functions from ppt_service — no DB or filesystem needed."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.ppt_service import _clean_json_response, _hex_to_rgb, _validate_column_id, _build_table_html, _paginate_saved_deck, _has_oversized_table, _inject_image_heights


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


class TestPaginateSavedDeck:
    def _deck(self, slide2_html):
        return (
            '<!DOCTYPE html><html><head><style>'
            '.slide-wrapper{width:794px;height:1123px;overflow:hidden}'
            '</style></head><body>\n'
            '<div class="slide-wrapper" data-seq="1"><div>cover</div></div>\n'
            f'<div class="slide-wrapper" data-seq="2">{slide2_html}</div>\n'
            '<script>fit()</script></body></html>'
        )

    def _table(self, n_rows):
        head = '<table><thead><tr><th>序号</th><th>名称</th></tr></thead><tbody>'
        rows = ''.join(f'<tr><td>{i}</td><td><div style="height:60px">item{i}</div></td></tr>' for i in range(1, n_rows + 1))
        return head + rows + '</tbody></table>'

    def test_splits_oversized_table(self):
        import re
        slide2 = f'<div style="width:794px;height:1123px;position:relative;overflow:hidden;">{self._table(30)}</div>'
        out = _paginate_saved_deck(self._deck(slide2))
        seqs = re.findall(r'<div class="slide-wrapper" data-seq="(\d+)">', out)
        assert len(seqs) > 2
        assert seqs == ['1', '2', '3']

    def test_landscape_untouched(self):
        deck = (
            '<html><head><style>.slide-wrapper{width:1280px;height:720px}</style></head><body>'
            '<div class="slide-wrapper" data-seq="1"><div>a</div></div>'
            '<div class="slide-wrapper" data-seq="2"><div>b</div></div></body></html>'
        )
        assert _paginate_saved_deck(deck) == deck

    def test_no_table_untouched(self):
        deck = self._deck('<div style="width:794px;height:1123px;">hello</div>')
        assert _paginate_saved_deck(deck) == deck

    def test_missing_wrapper_style_untouched(self):
        html = '<html><body><p>x</p></body></html>'
        assert _paginate_saved_deck(html) == html


class TestHasOversizedTable:
    def _img_table(self, n_rows, img_height_px):
        rows = ''.join(
            f'<tr><td>{i}</td><td><img src="images/a{i}.png" style="width:400px;'
            + (f'height:{img_height_px}px;' if img_height_px else '')
            + 'max-width:none"></td></tr>'
            for i in range(1, n_rows + 1)
        )
        return '<table><thead><tr><th>序号</th><th>图示</th></tr></thead><tbody>' + rows + '</tbody></table>'

    def test_image_rows_flagged_oversized(self):
        # 6 行 × 300px 图 ≈ 1800px 实际高，但 100px/行 预判会漏；累加图片高度后必须触发
        assert _has_oversized_table(self._img_table(6, 300), 1011) is True

    def test_image_rows_without_height_not_flagged(self):
        # 无 height 的图对分页引擎不可见（宽度无法反推高度）——由前端插入时补 height 保证
        assert _has_oversized_table(self._img_table(6, 0), 1011) is False

    def test_short_plain_table_not_flagged(self):
        rows = ''.join(f'<tr><td>{i}</td><td>x</td></tr>' for i in range(1, 6))
        html = '<table><thead><tr><th>序号</th><th>名称</th></tr></thead><tbody>' + rows + '</tbody></table>'
        assert _has_oversized_table(html, 1011) is False

    def test_many_plain_rows_still_flagged(self):
        rows = ''.join(f'<tr><td>{i}</td><td>x</td></tr>' for i in range(1, 20))
        html = '<table><thead><tr><th>序号</th><th>名称</th></tr></thead><tbody>' + rows + '</tbody></table>'
        assert _has_oversized_table(html, 1011) is True


class TestInjectImageHeights:
    def _make_png(self, tmp_path, name="t.png", w=100, h=50):
        from PIL import Image
        img_dir = tmp_path / "images"
        img_dir.mkdir(exist_ok=True)
        p = img_dir / name
        Image.new("RGB", (w, h), (255, 0, 0)).save(p)
        return p

    def test_injects_height_from_real_file(self, tmp_path):
        self._make_png(tmp_path)
        out = _inject_image_heights(
            '<img src="images/t.png" style="width: 200px; max-width: none;">',
            str(tmp_path),
        )
        assert 'height: 100px' in out

    def test_existing_height_not_overwritten(self, tmp_path):
        self._make_png(tmp_path)
        tag = '<img src="images/t.png" style="width: 200px; height: 99px;">'
        assert _inject_image_heights(tag, str(tmp_path)) == tag

    def test_data_src_untouched(self, tmp_path):
        tag = '<img src="data:image/png;base64,AAAA" style="width: 200px;">'
        assert _inject_image_heights(tag, str(tmp_path)) == tag

    def test_http_src_untouched(self, tmp_path):
        tag = '<img src="https://x.com/a.png" style="width: 200px;">'
        assert _inject_image_heights(tag, str(tmp_path)) == tag

    def test_missing_file_untouched(self, tmp_path):
        tag = '<img src="images/nope.png" style="width: 200px;">'
        assert _inject_image_heights(tag, str(tmp_path)) == tag

    def test_no_run_dir_untouched(self, tmp_path):
        self._make_png(tmp_path)
        tag = '<img src="images/t.png" style="width: 200px;">'
        assert _inject_image_heights(tag) == tag

    def test_no_width_untouched(self, tmp_path):
        self._make_png(tmp_path)
        tag = '<img src="images/t.png">'
        assert _inject_image_heights(tag, str(tmp_path)) == tag

    def test_path_traversal_untouched(self, tmp_path):
        self._make_png(tmp_path)
        tag = '<img src="../etc/passwd" style="width: 200px;">'
        assert _inject_image_heights(tag, str(tmp_path)) == tag
