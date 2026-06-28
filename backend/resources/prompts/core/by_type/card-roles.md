## 十一、卡片 Role 目录

| role | 视觉特征 | 必有字段 | 可选字段 | 使用场景 |
|------|---------|---------|---------|---------|
| `hero` | 大卡，大面积，核心信息 | title + body | chart | 核心观点、封面、结论 |
| `metric` | 居中大数字/进度条，顶部短色条 | chart | 无 | 数据指标、KPI |
| `card_0` | 标准卡，border-left:4px solid chart_colors[0] | title 或 body | chart | 网格第 1 张 |
| `card_1` | 标准卡，border-left:4px solid chart_colors[1] | title 或 body | chart | 网格第 2 张 |
| `card_2` | 标准卡，border-left:4px solid chart_colors[2] | title 或 body | chart | 网格第 3 张 |
| `card_3` | 标准卡，border-left:4px solid chart_colors[3] | title 或 body | chart | 网格第 4 张 |
| `card_4` | 标准卡，border-left:4px solid chart_colors[4] | title 或 body | chart | 网格第 5 张 |
| `left` | 绿色 border-left + "▲ " 前缀 | title + body | 无 | 双栏对比左/正面 |
| `right` | 红色 border-left + "▼ " 前缀 | title + body | 无 | 双栏对比右/反面 |
| `summary` | 全宽浅色/半透明卡 | title 或 body | chart | 数据总结、页面收尾 |
| `step_1`~`step_5` | 圆形/圆角方形编号 + 标题 | title + body | 无 | 时间线步骤 |

---
