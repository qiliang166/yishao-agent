## 六、图表渲染规格

图表不是文字描述，是**CSS + SVG 实现的可视化元素**：

### big_number（大数字）
```html
<div style="text-align:center">
  <span style="font-size:52px;font-weight:800;color:CHART_COLOR;line-height:1">85</span>
  <span style="font-size:18px;color:CHART_COLOR;opacity:0.7">%</span>
  <div style="font-size:14px;opacity:0.6;margin-top:12px">完成率</div>
</div>
```
- **数字与下方标签间距 ≥12px**：`margin-top` 必须 ≥12px，禁止 4px/6px/8px 等过小值
- **数字与前导 SVG 图标间距 ≥20px**：图标 `margin-bottom` 必须 ≥20px

### progress_bar（进度条）
- 外层：card_bg 色背景，border-radius 6px，高度 12px
- 内层：linear-gradient(90deg, chart_color, secondary)，宽度=百分比
- 左侧标签(13px) + 右侧数值(13px chart_color 加粗)

### bar（多柱对比）
- 每柱 = 标签(12px) + 水平条(高22px, border-radius 4-8px) + 数值(12px 加粗)
- 每柱使用不同 chart_color
- 可选：淡色 track 背景条

### donut（环形图）
- SVG circle，stroke-dasharray 计算：`周长 * 占比` 为实线段，`周长 * (1-占比)` 为空白
- 弧色 = chart_color，轨道色 = rgba(128,128,128,0.1)
- 中心文字 18px 加粗（primary 色）
- stroke-linecap: round, rotation: -90deg

---

## 十二、Chart 选择决策树

```
数据长什么样？
├─ 单一数字/百分比（如"完成率 85%"） → big_number
├─ 占比/完成度 0-100%（如"已完成 60%"） → progress_bar
├─ 多项目对比（如"A:80, B:65, C:45"） → bar
├─ 占比关系（如"占比 35%"） → donut
├─ 时间序列趋势（如"近6个月变化"） → sparkline
└─ 时间节点/里程碑 → timeline
```

### Chart 字段规范

| type | 必需字段 | 可选字段 | 示例 |
|------|---------|---------|------|
| `big_number` | value, label | suffix, color | `{"type":"big_number","value":85,"label":"完成率","suffix":"%"}` |
| `progress_bar` | value(0-100), label | color | `{"type":"progress_bar","value":60,"label":"进度"}` |
| `bar` | items:[{label,value}] | max | `{"type":"bar","items":[{"label":"A","value":80}]}` |
| `donut` | value, label | total(默认100) | `{"type":"donut","value":35,"label":"占比"}` |
| `timeline` | items:[{time,event}] | — | `{"type":"timeline","items":[{"time":"Q1","event":"启动"}]}` |
| `sparkline` | points:[num,...] | label | `{"type":"sparkline","points":[10,25,18,42,30],"label":"趋势"}` |

---

## 十三、数据转化规则

1. 大纲 body 中出现"XX%"或"XX 万"等数字 → 必须提取为 chart:big_number
2. 大纲 body 中出现"占比/完成/达到 XX%" → 必须提取为 chart:progress_bar
3. 大纲 body 超过 200 字 → 必须拆分为 ≥3 张卡片
4. 大纲中有对立内容（优劣/前后/方案A vs B）→ 必须用 two_column 布局
5. 大纲有多个并列数据项（3+） → 必须用 bar 或 dashboard 布局

---
