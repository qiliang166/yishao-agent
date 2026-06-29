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
- 中心文字 18px, primary `{{primary}}`, 加粗 700
- 环形色使用 chart_colors 序列
- 轨道用 card_bg `{{card_bg}}`

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
