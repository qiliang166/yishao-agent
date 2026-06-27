# 卡片角色目录 · 11 种 Role — 视觉特征与字段规范

> 每种卡片角色定义了色条、字段要求和典型使用场景。

---

## 11 种角色

| 角色 | 视觉特征 | 必有字段 | 可选字段 | 使用场景 |
|------|---------|---------|---------|---------|
| hero | 大卡，大面积，核心信息 | title + body | chart | 核心观点、封面、结论 |
| metric | 居中大数字/进度条，顶部短色条 | chart | — | 数据指标、KPI |
| card_0 | 标准卡，色条(chart_colors[0]) | title 或 body | chart | 网格第 1 张 |
| card_1 | 标准卡，色条(chart_colors[1]) | title 或 body | chart | 网格第 2 张 |
| card_2 | 标准卡，色条(chart_colors[2]) | title 或 body | chart | 网格第 3 张 |
| card_3 | 标准卡，色条(chart_colors[3]) | title 或 body | chart | 网格第 4 张 |
| card_4 | 标准卡，色条(chart_colors[4]) | title 或 body | chart | 网格第 5 张 |
| left | 钢蓝顶条 + "▲ " 前缀 | title + body | chart | 双栏对比左/正面/优势 |
| right | 铜陶顶条 + "▼ " 前缀 | title + body | chart | 双栏对比右/反面/劣势 |
| summary | 全宽浅色/半透明卡 | title 或 body | chart | 数据总结、页面收尾 |
| step_N | 圆形编号 + 标题 + 描述 | title + body | — | 时间线步骤 1~5 |

## 卡片结构铁律（每张卡四要素缺一不可）

```
┌─ 卡片容器（card_bg + border_radius + shadow）──────────┐
│ ▓▓▓▓ 左侧色条（chart_colors[n]，4px）                    │
│ 🔷 SVG 图标（16-24px，颜色跟随色条）+ 标题                │
│ 正文（body 字号，line-height: 1.6-1.8）                   │
│ [可选] 图表区 / 底部标签                                  │
└──────────────────────────────────────────────────────────┘
```

**色条轮换规则**：多卡片页面，每张卡使用不同 chart_color，按 [0]→[1]→[2]→... 依次轮换。禁止所有卡片同一颜色。
