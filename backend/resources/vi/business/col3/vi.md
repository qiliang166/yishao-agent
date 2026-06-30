# A4 文档视觉识别系统 | Business Professional (col3)

> 模板驱动，照抄结构，只替换内容占位符。

## I. 核心设计原则

1. **模板即法律** — 每个模块的 HTML 模板定义在 col3/*.md 或 blocks/*.md 中。必须严格照抄 HTML 结构，只替换 `{{VARIABLE}}` 占位符。
2. **CSS 变量着色** — 所有颜色通过 `var(--primary)` / `var(--accent)` 等 CSS 变量使用，严禁硬编码 hex 色值（唯一例外：`#ffffff`）。
3. **结构不可变** — 禁止修改模板中的 width/height/font-size/padding/margin/position 等任何数值。

## II. 色彩系统

| 变量 | 用途 |
|------|------|
| `var(--primary)` | 封面背景、标签列文字色 |
| `var(--accent)` | 顶部色条、标题底线 |
| `var(--background)` | 内部页面底色 |
| `var(--text)` | 正文文字 |
| `var(--card_bg)` | 标签列背景 |
| `var(--chart-0)` | materials_table 表头、quality_control 危害控制表头 |
| `var(--chart-1)` | steps_table 表头、quality_control 关键技术表头 |
| `rgba(var(--text-rgb), N)` | 半透明文字/边框 |
| `rgba(var(--accent-rgb), N)` | 半透明 accent |
| `#ffffff` | 暗色背景上的文字（仅此例外） |

## III. 5 模块结构

| 模块 | type | 背景 | 页头 | 页尾 |
|------|------|------|------|------|
| 封面 | cover | `var(--primary)` | 禁止 | 禁止 |
| 成品定义 | product_definition | `var(--background)` | 有 | 有 |
| 食材清单 | materials_table | `var(--background)` | 有 | 有 |
| 操作步骤 | steps_table | `var(--background)` | 有 | 有 |
| 出品标准 | quality_control | `var(--background)` | 有 | 有 |

## IV. 禁止事项

- 修改模板中的任何数值
- 添加模板中没有的元素
- 删除模板中已有的元素
- 硬编码 hex 色值（除 `#ffffff`）
- 使用 linear-gradient 作为封面背景
- 合并 quality_control 的 7 个维度行
- 使用 PPT 布局（hero_grid/mixed_grid/dashboard/card 布局）
- 使用图表组件（big_number/donut/progress_bar）
