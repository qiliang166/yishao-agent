# 数据页 — 数据可视化展示，支持图表和指标卡片，复用内容页框架叠加数据规则

> 数据页复用内容页的框架结构，额外叠加数据可视化规则。

---

## 继承规则

数据页继承 [内容页](content.md) 的全部布局规则（背景、5层结构、顶部色条、标题、页码），并叠加以下数据专属规范。

## 页面级 Override

| 属性 | 值 |
|------|-----|
| heading_scale | 0.9（标题略小于普通内容页） |
| 默认布局 | dashboard |

---

## 图表色序列

严格使用 chart_colors 序列，铜蓝双柱体系：

| 索引 | 色值 | 名称 | 语义 |
|------|------|------|------|
| 0 | `{{chart_0}}` | Deep Copper 深铜 | 焦点/主要数据 |
| 1 | `{{secondary}}` | Medium Blue 中蓝 | 次级数据/正向 |
| 2 | `{{chart_2}}` | Steel Blue 钢蓝 | 辅助数据/增长 |
| 3 | `{{chart_3}}` | Copper Clay 铜陶 | 负向/警示 |
| 4 | `{{chart_4}}` | Bright Blue 亮蓝 | 中性/补充 |

## 色彩语义映射

| 色值 | 名称 | 语义 |
|------|------|------|
| `{{chart_0}}` | 深铜 | 强调/焦点/主要数据 |
| `{{chart_2}}` | 钢蓝 | 正向/增长/优势/达标 |
| `{{chart_3}}` | 铜陶 | 负向/下降/风险/警示 |
| `{{accent}}` | 黄铜 ACCENT | 页面级装饰/标题短线 |

---

## 图表语言规范

### Big Number（指标卡片）
```
┌───────────────────────────┐
│ ▔▔▔▔ chart_color 色条     │  ← 顶部短色条 (40×3px)
│                           │
│        85 %               │  ← 大数字 52px DM Sans, font-weight:700
│        完成率              │  ← 标签 14px Inter, opacity:0.6
└───────────────────────────┘
```
- 大数字: 52px DM Sans Bold, chart_color
- 单位: 18px
- 标签: 14px opacity 0.6

### 环形图（Donut）
- 中心文字: 18px primary `{{primary}}`, 加粗 700
- 环形色: chart_colors 序列
- 轨道: card_bg `{{card_bg}}`

### 进度条（Progress Bar）
- 轨道: card_bg `{{card_bg}}`, 圆角 12px
- 填充: chart_color → secondary `{{secondary}}` 渐变

### 折线图 / 面积图
- 线条: 2px, 圆角端点
- 数据点: 实心圆
- 面积填充: opacity 0.15

### 柱状图 / 条形图
- 柱色: chart_colors 序列，按数据项索引
- 标签: 14px Inter

### 对比条（正负向）
- 正向: 钢蓝渐变 `{{secondary}}`
- 负向: 铜陶渐变 `{{chart_3}}`
- 标签右对齐，数值在条内

### Sparkline（迷你趋势线）
- 线条: 1.8px
- 面积填充: opacity 0.15
- 终端实心点: 强调最新值

### Timeline（时间线）
- 竖线: `rgba({{text_rgb}}, 0.12)` 2px
- 节点圆: 10px, chart_color 轮换
- 时间标题 + 描述

---

## 图表选择决策树

```
数据长什么样？
├─ 单一数字/百分比（如"完成率 85%"） → big_number
├─ 占比/完成度 0-100%（如"已完成 60%"） → progress_bar
├─ 多项目对比（如"A:80, B:65, C:45"） → bar
├─ 占比关系（如"占比 35%"） → donut
├─ 时间序列趋势（如"近6个月变化"） → sparkline / line
└─ 时间节点/里程碑 → timeline
```

## 数据转化规则

- 大纲出现"XX%"或"XX 万"等数字 → 必须渲染为图表形态（chart: big_number）
- 大纲出现"占比/完成/达到 XX%" → 必须渲染为 progress_bar 或 big_number
- 大纲有多个并列数据项（3+） → 必须使用 bar 或 dashboard 布局
- 大纲有时间节点（Q1/Q2/月份）→ 必须使用 timeline 布局
- **裸数字 = 设计事故**：含数字的卡片必须转化为图表形态
