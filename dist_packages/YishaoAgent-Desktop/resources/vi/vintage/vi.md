# VIS · 幻灯片视觉识别系统 | Notion Structured Clarity

> Structured, clear, systematic. Notion-like clarity with clean hierarchy.

---

## I. 核心设计原则

三条设计原则：

1. **结构化的层级** — 通过严格的 'Playfair Display' 字体字号体系、字重和间距，建立一目了然的信息架构。标题 600/700 粗体、正文 400 常规，层级分明，不依赖颜色区分。
2. **极致的克制** — 深灰 `{{primary}}`（#37352f）作为文字基准色，蓝色 `{{accent}}`（#2383e2）仅用于标题短线和链接，占比不超过 5%。纯白底色 `{{background}}` 与浅灰卡片 `{{card_bg}}`（#f7f6f3）形成唯一色彩层级。
3. **系统化的一致性** — 所有图标、图表、装饰元素遵循统一的 1.5px outline 风格。图标可选，文字优先。禁用所有渐变和阴影。

适用场景：知识管理、产品文档、系统化教程、结构化汇报。

设计铁律：充分留白，字重分层，无渐变无阴影，无全宽顶部色条。一个页面只传达一个核心信息。用间距而非颜色建立层级。

---

## II. 色彩系统

### 主色板

| 角色 | 色值 | 用途 |
|------|------|------|
| primary | `{{primary}}` | 标题文字、正文 |
| secondary | `{{secondary}}` | 辅助文字、次级信息 |
| accent | `{{accent}}` | 标题短线、链接强调 |
| background | `{{background}}` | 页面底色（纯白） |
| text | `{{text}}` | 正文 |
| card_bg | `{{card_bg}}` | 卡片背景（浅灰） |

### 图表色序列（chart_colors）

> chart_colors 从蓝色系和中性灰色系两支柱派生，蓝系 2 色 + 灰系 1 色 + 暖系 1 色 + 绿系 1 色。

| 索引 | 色值 | 名称 | 语义 |
|------|------|------|------|
| 0 | `{{chart_0}}` | Notion Blue | 视觉焦点 / 主要数据强调 |
| 1 | `{{secondary}}` | Medium Gray 中灰 | 次级数据 / 中性指标 |
| 2 | `{{chart_2}}` | Warm Brown 暖棕 | 辅助数据 / 历史/参考 |
| 3 | `{{chart_3}}` | Signal Red 信号红 | 负向 / 下降 / 风险 / 警示 |
| 4 | `{{chart_4}}` | Sage Green 鼠尾绿 | 正向 / 增长 / 达标 / 确认 |

### 色彩语义映射

| 色值 | 名称 | 语义 |
|------|------|------|
| `{{chart_4}}` | 鼠尾绿 Sage Green | 正向/增长/优势/达标 |
| `{{chart_3}}` | 信号红 Signal Red | 负向/下降/风险/警示 |
| `{{chart_0}}` | Notion Blue | 强调/主要数据/焦点 |
| `{{accent}}` | Notion Blue ACCENT | 标题短线/链接/高光 |

### 色彩角色分工（铁律）

| 色彩来源 | 用途 | 占比上限 |
|---------|------|---------|
| chart_colors[0..4] | 卡片彩色描边轮换（1px solid）+ 图表色序列 + 图标颜色 | 每卡用不同色 |
| primary `{{primary}}` | 标题色 + 卡片标题色 | 标题文字专用 |
| accent `{{accent}}` | 标题短线（32×2px） + 链接 | ≤5% |
| background `{{background}}` | 页面底色（纯白） | 全画布 |
| text `{{text}}` | 正文 | 全页 |
| card_bg `{{card_bg}}` | 卡片背景（浅灰） | 卡片区域 |

### 禁止事项

- 禁止 accent 色用于卡片彩色描边（accent 是页面级装饰色）
- 禁止所有卡片彩色描边同一颜色
- 禁止 chart_colors[0] 独占所有卡片
- 禁止任何渐变（包括 CSS linear-gradient / radial-gradient）
- 禁止任何阴影（box-shadow / text-shadow 均禁用）
- 禁止使用 background 以外的颜色作为页面底色
- 禁止全宽顶部 accent 色条
- 禁止在卡片边框之外叠加任何色条

---

## III. 排版层级

### 字体

| 角色 | 字体栈 |
|------|--------|
| 标题 | `'Playfair Display', Georgia, 'Times New Roman', 'Noto Serif SC', 'STSong', serif` |
| 正文 | `Lora, Georgia, 'Times New Roman', 'Noto Serif SC', 'STSong', serif` |
| CJK | `'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif` |

### 字号层级

| 层级 | 字号 | 字重 | 使用场景 |
|------|------|------|---------|
| 封面标题 | 48-56px | 700 | 封面 h1 |
| 页标题 | 32-40px | 600 | 内容页 h2 |
| 卡片标题 | 18-22px | 600 | 卡片 heading |
| 正文 | 15-17px | 400 | 卡片 body |
| 标注 | 12-13px | 400 | 页码、来源、脚注、插图标签 |

### 行距与字距

- 标题 line-height: 1.2-1.3
- 正文 line-height: 1.65-1.8
- 标题 letter-spacing: -0.3~-0.5px（英文）
- 卡片之间间距: 28px

---

## IV. 卡片样式 Token

| 属性 | 值 |
|------|-----|
| border_radius | 6px |
| shadow | none（禁用） |
| border | `1px solid chart_color`（彩色描边，边框即装饰），hero/step_N 使用默认 `1px solid rgba(55,53,47, 0.09)` |
| gap | 28px |

### 渐变

| 名称 | 值 |
|------|-----|
| hero_bg | none（禁用渐变） |
| card_highlight | none（禁用渐变） |

### 阴影层级

| 级别 | 值 |
|------|-----|
| sm | none |
| md | none |
| lg | none |

卡片区分依靠：边框颜色（1px solid chart_color 彩色描边）。不依赖阴影、渐变或叠加色条。

---

## V. 装饰系统 · 3 层结构

每页固定装饰元素：
- **标题短线**: 32×2px, accent `{{accent}}`（可选，Type C 极简模式省略）
- **页码标记**: dot (4px `{{primary}}`) + 当前页/总页数

> Notion 无全宽顶部 accent 色条。这是与 business 风格最关键的视觉差异。

### 层结构（从底到顶）

1. **背景层** — background 色铺满（纯白，无半透明几何装饰）
2. **结构层** — 卡片容器 + 网格排列（卡片彩色描边提供结构区分）
3. **内容层** — 文字 + 可选图标 + 图表

> Notion 仅 3 层。无 business 的"装饰层"（几何图形）和"标识层"（全宽顶部色条）。

### 内容页装饰 · 3 种类型

| 类型 | 特征 | 适用场景 |
|------|------|---------|
| **Type A** · 纯排版 | 无几何装饰，仅标题短线(32×2px) + 页码。纯靠字重和间距建立层次 | 默认推荐，所有标准内容页 |
| **Type B** · 彩色描边 | 卡片 1px solid chart_color 彩色边框，无几何图形。边框即装饰 | 需要视觉锚点的页面 |
| **Type C** · 极简 | 连标题短线都去掉，仅保留页码。完全依靠 typography 建立层次 | 数据密集页、极简内容页 |

---

## VI. 图表语言

### 折线图
- 2px 线条，圆角端点，数据点实心圆（6px）
- 使用 chart_colors 序列着色
- 禁用面积填充（保持简洁）

### 柱状图/条形图
- 使用 chart_colors 序列按数据项索引着色
- 圆角 3px（柱顶）
- 标签 13px Lora

### 环形图（Donut）
- 中心文字 18px, primary `{{primary}}`, 加粗 600
- 环形色使用 chart_colors 序列
- 轨道用 card_bg `{{card_bg}}`

### 进度条（Progress Bar）
- 轨道: card_bg `{{card_bg}}`
- 填充: chart_color 纯色（不使用渐变）
- 圆角: 6px（同卡片 token）

### Big Number（大数字）
- 居中 48px 'Playfair Display' 加粗 + 单位 16px + 标签 13px opacity 0.5
- 颜色使用 chart_color
- 卡片使用 1px solid chart_color 彩色描边

### Sparkline（迷你趋势线）
- 线条 1.5px，无面积填充
- 终端实心点强调最新值

### Timeline（时间线）
- 竖线 `rgba(55,53,47, 0.12)` 2px + 节点圆 8px chart_color[n] 轮换
- 时间标题 + 描述

### 对比条（正负向）
- 正向: 鼠尾绿纯色
- 负向: 信号红纯色
- 标签右对齐，数值在条内

### Chart 字段规范

| 类型 | 必需字段 | 可选字段 | 示例 |
|------|---------|---------|------|
| big_number | value, label | suffix, color | `{"type":"big_number","value":85,"label":"完成率","suffix":"%"}` |
| progress_bar | value(0-100), label | color | `{"type":"progress_bar","value":60,"label":"进度"}` |
| bar | categories[], values[], label | color_map | `{"type":"bar","categories":["Q1","Q2"],"values":[30,50],"label":"季度"}` |
| donut | series[], label | colors[] | `{"type":"donut","series":[{"name":"A","value":60},{"name":"B","value":40}],"label":"占比"}` |
| sparkline | points[], label | color | `{"type":"sparkline","points":[12,15,10,18,22],"label":"趋势"}` |
| timeline | items[] | color_map | `{"type":"timeline","items":[{"time":"2024","title":"成立"}]}` |

---

## VII. 布局系统

### 布局决策树

```
page_type = ?
├─ cover/section/summary → full_bleed
├─ 有对比内容（优劣/前后/方案A vs B）
│   ├─ 两项比较 → two_column 或 two_column_asymmetric
│   └─ 多项比较 → three_column 或 mixed_grid
├─ 有数据指标
│   ├─ 单一大数字 → single_focus
│   ├─ 3-5 KPI → dashboard
│   └─ 图表+说明 → hero_grid 或 mixed_grid
├─ 流程/步骤 → timeline
└─ 通用内容 → mixed_grid 或 three_column
```

### 可用布局

| 布局 ID | 卡片数 | 描述 |
|---------|--------|------|
| full_bleed | 1-3 | 垂直居中全屏 |
| three_column | 3 | 水平等分 ~373px/栏 |
| two_column | 2 | 水平等分 ~550px/栏 |
| two_column_asymmetric | 2 | 左62% + 右38% |
| dashboard | 3-5 | 顶行metric + 底行summary |
| mixed_grid | 3-4 | 顶hero全宽 + 底2-3小卡 |
| hero_grid | 2-4 | 左hero大卡 + 右小卡堆叠 |
| single_focus | 1 | 居中大卡 ~900px |
| timeline | 2-5 | 水平步骤+连接线 |
| horizontal_split | 3-4 | 顶hero + 底行小卡 |

---

## VIII. 卡片角色目录

| Role | 视觉特征 | 必需字段 | 可选字段 | 用途 |
|------|---------|---------|---------|------|
| hero | 大卡，大面积，核心信息，无彩色描边（默认灰色边框） | title, body | chart | 页面核心内容 |
| metric | 居中大数字，彩色描边（1px solid chart_color） | chart | — | KPI指标 |
| card_0 | 标准卡，彩色描边(chart_colors[0], 1px solid) | title or body | chart | 通用内容 |
| card_1 | 标准卡，彩色描边(chart_colors[1], 1px solid) | title or body | chart | 通用内容 |
| card_2 | 标准卡，彩色描边(chart_colors[2], 1px solid) | title or body | chart | 通用内容 |
| card_3 | 标准卡，彩色描边(chart_colors[3], 1px solid) | title or body | chart | 通用内容 |
| card_4 | 标准卡，彩色描边(chart_colors[4], 1px solid) | title or body | chart | 通用内容 |
| left | 彩色描边(chart_0, 1px solid) + ▲ 前缀 | title, body | chart | 对比左/正面/优势 |
| right | 彩色描边(chart_3, 1px solid) + ▼ 前缀 | title, body | chart | 对比右/反面/劣势 |
| summary | 全宽浅色卡，彩色描边（1px solid accent） | title or body | chart | 总结收尾 |
| step_N | 圆形编号 + 标题 + 描述，无彩色描边（默认灰色边框） | title, body | — | 步骤 1~5 |

---

## IX. 数据转化与图表规则

### 转化要求

- 大纲中出现"XX%"或"XX 万"等数字 → 必须渲染为图表形态（big_number / progress_bar）
- 大纲中出现"占比/完成/达到 XX%" → 必须渲染为 progress_bar 或 big_number
- 大纲中有对立内容（优劣/前后/方案A vs B）→ 必须使用 two_column 布局
- 大纲有多个并列数据项 → 必须使用 bar 或 dashboard 布局

### 图表选择决策

| 数据特征 | 推荐类型 | 原因 |
|---------|---------|------|
| 单值百分比 | big_number 或 progress_bar | 直接强调 |
| 多类别比较 | bar 或 donut | 并行对比 |
| 趋势变化 | sparkline | 紧凑展示 |
| 时序事件 | timeline | 时间关系 |
| 优劣对比 | 对比条（正负向） | 方向感知 |

### 配色分配规则

1. chart_colors[0] — 主要数据、第1张卡片彩色描边
2. chart_colors[1] — 次要数据、第2张卡片彩色描边
3. chart_colors[2] — 辅助数据、第3张卡片彩色描边
4. chart_colors[3] — 负向/警示数据、第4张卡片彩色描边
5. chart_colors[4] — 正向/达标数据、第5张卡片彩色描边

---

## X. 跨页一致性

1. **字体统一** — 全 Deck 使用同一字体栈，不混用不同家族的字体
2. **卡片统一** — 所有卡片使用同一 border_radius(6px) 和 gap(28px)，边框色按 chart_colors 轮换
3. **彩色描边轮换** — 同页内卡片使用 1px solid chart_color 彩色描边，从 chart_colors 序列轮换，每卡不同色
4. **页码统一** — 所有页面右下角统一放置页码（12px Lora, opacity 0.4）
5. **书挡效应** — 封面和结尾页形成首尾呼应（相同的纯白背景 + 零装饰 + 大量留白）
6. **色彩一致性** — 同一 Deck 中使用同一色系，不跨色系混合

---

## XI. 图标规范

- 风格: outline（线性图标）
- 描边宽度: 1.5px
- 卡片图标尺寸: 16px
- Hero图标尺寸: 28px
- Metric图标尺寸: 14px
- 颜色规则: 跟随所在卡片的 chart_color, opacity: 0.6
- 圆角端点: round linecap, round linejoin
- **图标为可选元素**，文字优先，同一页面最多 2-3 张卡片使用图标

---

## XII. 配图/插图规范

- 插图标签: text-anchor=middle, label 居中对齐于图形下方
- 间距: 图形底部到标签基线 ≥22px
- 辅助线间距: ≥20px
- 最小描边: 1px
- 最小字号: 13px
- 配图优先使用 SVG 矢量图形，不使用位图（除非是产品实拍图）
- 封面/总结页不需要大面积装饰

---

## XIII. 质量检查清单（20 项）

1. 3 层结构完整（背景→结构→内容）
2. ≥2 个 SVG 元素
3. ≥3 种不同 chart_color 出现在页面中
4. 每卡: 标题 + 正文（图标可选）
5. 有数字的内容已转化为图表形态
6. 标题短线 32×2px accent 色（Type C 极简可省略）
7. 标题使用 primary 色
8. 正文使用 text 色
9. 卡片背景使用 card_bg 色
10. 页面背景使用 background 色
11. 全页字体统一使用 'Playfair Display' 家族（typography token）
12. 卡片圆角统一 6px
13. 无任何阴影（box-shadow / text-shadow）
14. 插图标签 text-anchor=middle 居中
15. 插图间距 ≥22px
16. 插图字号 ≥13px
17. SVG 描边 ≥1px
18. 封面/总结页无卡片容器且无顶部色条
19. 卡片彩色描边颜色轮换（每卡不同 chart_color）
20. 无任何渐变（linear-gradient / radial-gradient）
21. 无全宽顶部 accent 色条
22. 无半透明几何装饰图形
23. 无叠加色条（边框即装饰）
