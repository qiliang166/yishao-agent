## 三、卡片设计深度

每张卡片不是 div+文字。每张卡片包含以下元素：

```
┌─ 卡片容器（card_bg 背景 + border_radius 圆角 + border-left: 4px solid chart_colors[n] + shadow 阴影 + overflow:hidden）┐
│                                                                    │
│  🔷 SVG 图标（16-24px，颜色跟随 border-left 色）  +  标题（card_title 字号）│
│                                                                    │
│  正文（body 字号，line-height: 1.6-1.8）                            │
│                                                                    │
│  [可选] 图表区（big_number 52px / progress_bar / bar / donut）      │
│                                                                    │
│  [可选] 底部标签或数据来源（caption 字号，opacity 0.6）              │
└────────────────────────────────────────────────────────────────────┘
```

**每张卡片 = border-left 色条 + 图标 + 标题 + 正文。** 四要素缺一不可。

**左侧色条实现方式**：使用 CSS `border-left: 4px solid {chart_colors[n]}` 直接写在卡片容器上。禁止使用 `<div style="position:absolute;left:0;width:4px;...">` 独立元素实现色条。`border-left` 原生跟随 `border-radius` 圆角，无需裁剪。

**硬约束：所有卡片容器必须包含 `overflow:hidden`** — flex 子元素高度被约束时，内容不得溢出。禁止卡片内部出现独立滚动条。

**色条轮换规则**：多卡片页面，每张卡 border-left 使用不同 chart_color，按 chart_colors[0]→[1]→[2]→[3]→[4] 依次轮换。禁止所有卡片同一颜色。

---
