# 卡片角色目录 · 11 种 Role — 视觉特征与字段规范

> 每种卡片角色定义了彩色描边、字段要求和典型使用场景。Notion 卡片以 1px solid chart_color 彩色描边替代 business 的左侧粗色条。

---

## 11 种角色

| 角色 | 视觉特征 | 必有字段 | 可选字段 | 使用场景 |
|------|---------|---------|---------|---------|
| hero | 大卡，大面积，核心信息，无彩色描边（默认灰色边框） | title + body | chart | 核心观点、封面、结论 |
| metric | 居中大数字/进度条，彩色描边（1px solid chart_color） | chart | — | 数据指标、KPI |
| card_0 | 标准卡，彩色描边(chart_colors[0], 1px solid) | title 或 body | chart | 网格第 1 张 |
| card_1 | 标准卡，彩色描边(chart_colors[1], 1px solid) | title 或 body | chart | 网格第 2 张 |
| card_2 | 标准卡，彩色描边(chart_colors[2], 1px solid) | title 或 body | chart | 网格第 3 张 |
| card_3 | 标准卡，彩色描边(chart_colors[3], 1px solid) | title 或 body | chart | 网格第 4 张 |
| card_4 | 标准卡，彩色描边(chart_colors[4], 1px solid) | title 或 body | chart | 网格第 5 张 |
| left | 彩色描边(chart_0, 1px solid) + "▲ " 前缀 | title + body | chart | 双栏对比左/正面/优势 |
| right | 彩色描边(chart_3, 1px solid) + "▼ " 前缀 | title + body | chart | 双栏对比右/反面/劣势 |
| summary | 全宽浅色卡，彩色描边（1px solid accent） | title 或 body | chart | 数据总结、页面收尾 |
| step_N | 圆形编号 + 标题 + 描述，无彩色描边（默认灰色边框） | title + body | — | 时间线步骤 1~5 |

## 卡片结构规范（Notion 骨架）

```
┌─ 卡片容器（card_bg + border_radius:6px + 1px solid chart_color 彩色描边 + 无阴影）─┐
│                                                                                    │
│ [可选] SVG 图标（16px，颜色跟随卡片 chart_color, opacity: 0.6）                      │
│ 标题（card_title 字号 18-22px, weight 600, primary 色, 上间距 20px）                 │
│                                                                                    │
│ 正文（body 字号 15-17px, line-height: 1.65-1.8, text 色, 上间距 8px）               │
│                                                                                    │
│ [可选] 图表区 / 底部标签                                                             │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**与 business 卡片骨架的关键差异**：
- ~~左侧 4px 粗色条~~ → 卡片边框本身即为彩色描边（1px solid chart_color），边框即装饰
- ~~SVG 图标必须~~ → SVG 图标可选
- ~~卡片阴影~~ → 仅 1px 彩色描边，无阴影
- 内边距加大（标题上方 20px，正文上方 8px），体现留白感

**彩色描边轮换规则**：多卡片页面，每张卡使用不同 chart_color 作为边框色，按 [0]→[1]→[2]→[3]→[4] 依次轮换。禁止所有卡片同一颜色边框。hero 卡和 step_N 卡使用默认灰色边框 `1px solid rgba(55,53,47, 0.09)`，无彩色描边。
