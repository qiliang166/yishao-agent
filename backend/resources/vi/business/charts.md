# 图表语言 — 折线图、面积图、柱状图、环形图、进度条、大数字、趋势线、时间线、对比条

> 所有数据必须转化为图表形态，禁止裸数字。

---

## 折线图
- 2px 线条，圆角端点，数据点实心圆
- 使用 chart_colors 序列着色

## 面积图
- 折线下方填充半透明色（opacity 0.15），增强趋势量感

## 柱状图/条形图
- 使用 chart_colors 序列按数据项索引着色
- 标签 14px Inter

## 环形图（Donut）

### 单段环形图（单值占比）
- 中心文字 18px, primary `{{primary}}`, 加粗 700
- 数据环使用 chart_colors 序列
- 轨道（背景环）用 card_bg `{{card_bg}}`
- 数据环 `stroke-linecap="round"`（单段可用）

```xml
<svg width="180" height="180" viewBox="0 0 180 180">
  <!-- 底轨 -->
  <circle cx="90" cy="90" r="65" fill="none" stroke="var(--card_bg)" stroke-width="14" />
  <!-- 数据环 (35%) -- 单段用 round 线帽 -->
  <circle cx="90" cy="90" r="65" fill="none" stroke="var(--chart_0)" stroke-width="14"
    stroke-dasharray="142.9 408.4" stroke-dashoffset="0"
    stroke-linecap="round" transform="rotate(-90 90 90)" />
  <!-- 中心文字 -->
  <text x="90" y="85" font-size="14px" fill="var(--text)" opacity="0.5" text-anchor="middle">占比</text>
  <text x="90" y="106" font-size="20px" fill="var(--primary)" font-weight="700" text-anchor="middle">35%</text>
</svg>
```

### 多段环形图（多个类别组成 100%）

**铁律：数据环禁止 `stroke-linecap="round"`！** 多段之间必须用平头线帽（默认 butt），否则段边界产生圆形突起（"拉链条"缺陷）。

- 每段使用 `stroke-dasharray="len C"`（len=该段弧长，C=圆周长）
- 第 1 段：`stroke-dashoffset="0"`（从 12 点方向开始）
- 第 N 段：`stroke-dashoffset="-前N-1段弧长之和"`（负值，将可见弧向后推）
- 底轨可用 `stroke-linecap="round"`

```xml
<svg width="180" height="180" viewBox="0 0 180 180">
  <!-- 底轨（可 round） -->
  <circle cx="90" cy="90" r="65" fill="none" stroke="var(--card_bg)" stroke-width="14"
    stroke-linecap="round" />
  <!-- 干货 33%：弧长 = 408.4*0.33 ≈ 134.8 -->
  <circle cx="90" cy="90" r="65" fill="none" stroke="var(--chart_1)" stroke-width="14"
    stroke-dasharray="134.8 408.4" stroke-dashoffset="0"
    transform="rotate(-90 90 90)" />
  <!-- 海鲜禽类 25%：弧长 = 408.4*0.25 ≈ 102.1，offset = -134.8 -->
  <circle cx="90" cy="90" r="65" fill="none" stroke="var(--chart_2)" stroke-width="14"
    stroke-dasharray="102.1 408.4" stroke-dashoffset="-134.8"
    transform="rotate(-90 90 90)" />
  <!-- 调味料 42%：弧长 = 408.4*0.42 ≈ 171.5，offset = -236.9 -->
  <circle cx="90" cy="90" r="65" fill="none" stroke="var(--chart_4)" stroke-width="14"
    stroke-dasharray="171.5 408.4" stroke-dashoffset="-236.9"
    transform="rotate(-90 90 90)" />
  <!-- 中心文字 -->
  <text x="90" y="85" font-size="14px" fill="var(--text)" opacity="0.5" text-anchor="middle">食材占比</text>
  <text x="90" y="106" font-size="20px" fill="var(--primary)" font-weight="700" text-anchor="middle">100%</text>
</svg>
```

### 计算参数

| 半径 r | 圆周长 C=2πr |
|--------|-------------|
| 65px | ≈ 408.4 |
| 80px | ≈ 502.7 |

**弧长公式**：`arc = C × 百分比`（如 35% → 408.4 × 0.35 = 142.9）

## 进度条（Progress Bar）
- 轨道: card_bg `{{card_bg}}`
- 填充: chart_color → secondary 渐变
- 圆角: 12px（同卡片 token）

## Big Number（大数字）
- 居中 52px DM Sans 加粗 + 单位 18px + 标签 14px opacity 0.6
- 颜色使用 chart_color

## Sparkline（迷你趋势线）
- 面积填充 opacity 0.15，线条 1.8px
- 终端实心点强调最新值

## Timeline（时间线）
- 竖线 `rgba({{text_rgb}}, 0.12)` 2px + 节点圆 10px chart_color[n] 轮换
- 时间标题 + 描述

## 对比条（正负向）
- 正向: 蓝钢渐变
- 负向: 铜陶渐变
- 标签右对齐，数值在条内

## Chart 字段规范

| 类型 | 必需字段 | 可选字段 | 示例 |
|------|---------|---------|------|
| big_number | value, label | suffix, color | `{"type":"big_number","value":85,"label":"完成率","suffix":"%"}` |
| progress_bar | value(0-100), label | color | `{"type":"progress_bar","value":60,"label":"进度"}` |
| bar | items:[{label,value}] | max | `{"type":"bar","items":[{"label":"A","value":80}]}` |
| donut | value, label | total(默认100) | `{"type":"donut","value":35,"label":"占比"}` |
| timeline | items:[{time,event}] | — | `{"type":"timeline","items":[{"time":"Q1","event":"启动"}]}` |
| sparkline | points:[num,...] | label | `{"type":"sparkline","points":[10,25,18,42,30],"label":"趋势"}` |
| line | points:[num,...], labels:[str,...] | color | `{"type":"line","points":[12,28,22,40,32],"labels":["1月"..."5月"]}` |
