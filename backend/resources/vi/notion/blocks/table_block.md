# 表格块 — 多列数据网格，含表头和交替行数据

> 表格块是文档中最常用的段落类型，可承载任意列数、任意行数的结构化数据。

---

## 结构规则

- **列数**: 由模板指定（2-10 列），每列宽度可自定义或等分
- **表头**: `{{chart_1}}` 背景(默认), `#ffffff` 文字, font-weight: 600, 12-13px, 居中
  - 可用 `{{chart_0}}` 替代（模板指定 header_color）
- **数据行**: `{{background}}` 背景, 12px, 行高 26px
  - 偶数行: `rgba({{text_rgb}}, 0.02)` 微灰交替
  - 空白单元格: `rgba({{text_rgb}}, 0.15)` 占位符留空
- **边框**: `1px solid rgba({{text_rgb}}, 0.1)` 内分隔线
- **表头顶部**: `2px solid rgba({{text_rgb}}, 0.15)` 分隔上一段落
- **合并单元格**: 支持 `colspan` 合并列（如"操作说明"跨 3 列）

## 表头颜色规则

| 表头色 | 色值 | 使用策略 |
|--------|------|---------|
| `{{chart_1}}` | Notion Blue | 单表格或首表格（默认） |
| `{{chart_0}}` | Medium Gray 中灰 | 第二个表格（与首表格区分） |
| `{{chart_2}}` | Warm Brown 暖棕 | 第三个表格 |

> 多个 table_block 连续出现时，按 chart_1 → chart_0 → chart_2 顺序轮换表头色。

## 模板字段

| 字段 | 类型 | 说明 |
|------|------|------|
| columns | array | 列定义: `[{name, width, align}]` |
| rows | number | 数据行数 |
| header_color | string | `chart_1` / `chart_0` / `chart_2` |
| merge_rules | array | 合并单元格规则: `[{col, colspan}]` |

## 使用场景

- 作业手册：食材清单（8 列 × 12 行）、操作步骤（5 列 × 7 行，合并单元格）
- 财务报告：损益表、资产负债
- 标书：技术参数表、报价明细
- 实验报告：测量数据
