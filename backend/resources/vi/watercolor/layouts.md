# 布局库 · 10 种布局 — 排列方式与适用场景决策

> 所有页面从这 10 种布局中选择，不再自行发明布局。

---

## 10 种布局

| # | 布局名称 | 卡片数 | 排列方式 | 适用场景 |
|---|---------|--------|---------|---------|
| 1 | full_bleed | 1-3 | 垂直居中，全屏 | 封面、章节分隔、总结 |
| 2 | three_column | 3 | 水平等分，每栏 ~373px | 并列要点、三大优势 |
| 3 | two_column | 2 | 水平等分，每栏 ~550px | 对比分析、优劣对比 |
| 4 | two_column_asymmetric | 2 | 左宽 62% + 右窄 38% | 主次内容、问题+方案 |
| 5 | dashboard | 3-5 | 顶行 metric 卡 + 底行 summary | 数据总览、KPI 展示 |
| 6 | mixed_grid | 3-4 | 顶行 hero(全宽) + 底行 2-3 小卡 | 核心观点+支撑论据 |
| 7 | hero_grid | 2-4 | 左 hero 大卡 + 右 1-2 小卡堆叠 | 论点+数据佐证 |
| 8 | single_focus | 1 | 居中大卡 ~900px | 核心结论、金句 |
| 9 | timeline | 2-5 | 水平排列，步骤节点+连接线 | 流程步骤、时间线 |
| 10 | horizontal_split | 3-4 | 顶全宽 hero + 底行 2-3 小卡 | 标题+支撑指标 |

## 布局选择决策树

```
内容是什么类型？
├─ 封面/章节分隔/结束页 → full_bleed
├─ 单一核心观点/结论/金句 → single_focus
├─ 流程/步骤/时间线/里程碑 → timeline
├─ 含对立内容（优劣/前后/A vs B） → two_column
├─ 主次分明（大论点+小佐证） → hero_grid 或 two_column_asymmetric
├─ 核心观点+多个支撑细节 → mixed_grid
├─ 数据指标为主（KPI/完成率/营收） → dashboard
├─ 3 个并列要点/平行概念 → three_column
└─ 其他 → mixed_grid（默认）
```
