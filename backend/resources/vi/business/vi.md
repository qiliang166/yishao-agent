# VIS · 幻灯片视觉识别系统 | Business Professional

> Clean, authoritative, trustworthy. Conveys competence and reliability.

---

## I. 核心设计原则

三条设计原则：

1. **清晰的层级** — 通过严格的字体大小、字重和间距，建立一目了然的信息架构。标题 DM Sans 粗体、正文 Inter 常规，层级分明。
2. **克制的色彩** — 深海蓝 `{{primary}}` 奠定权威基调，黄铜色 `{{accent}}` 仅用于关键强调（≤8%），大面积白色背景确保干净锐利。
3. **一致的图形** — 所有图标、图表、装饰元素遵循统一的描线风格（1.5px 圆角端点）。每页至少 3 个 SVG 元素，无冗余装饰。

适用场景：企业演示、商业提案、投资者汇报。

设计铁律：保持大量留白，色彩克制，一个页面只传达一个核心信息。避免渐变和过度装饰。

---

## II. 色彩系统

### 主色板

| 角色 | 色值 | 用途 |
|------|------|------|
| primary | `{{primary}}` | 标题文字、hero 卡背景 |
| secondary | `{{secondary}}` | 辅助色、渐变终点 |
| accent | `{{accent}}` | 页面级装饰（顶部色条、标题短线） |
| background | `{{background}}` | 页面底色 |
| text | `{{text}}` | 正文 |
| card_bg | `{{card_bg}}` | 卡片背景 |

### 图表色序列（chart_colors）

> chart_colors 从蓝色系和黄铜系两支柱派生，蓝系 3 色 + 黄铜系 2 色。

| 索引 | 色值 | 名称 | 语义 |
|------|------|------|------|
| 0 | `{{chart_0}}` | Deep Copper 深铜 | 视觉焦点 / 主要数据强调 |
| 1 | `{{secondary}}` | Medium Blue 中蓝 | 次级数据 / 正向指标 |
| 2 | `{{chart_2}}` | Steel Blue 钢蓝 | 辅助数据 / 增长/达标 |
| 3 | `{{chart_3}}` | Copper Clay 铜陶 | 负向 / 下降 / 风险 / 警示 |
| 4 | `{{chart_4}}` | Bright Blue 亮蓝 | 中性 / 补充 / 链接 / 高亮 |

### 色彩语义映射

| 色值 | 名称 | 语义 |
|------|------|------|
| `{{chart_2}}` | 钢蓝 Steel Blue | 正向/增长/优势/达标 |
| `{{chart_3}}` | 铜陶 Copper Clay | 负向/下降/风险/警示 |
| `{{chart_0}}` | 深铜 Deep Copper | 强调/主要数据/焦点 |
| `{{accent}}` | 黄铜 ACCENT | 页面级装饰/标题短线/高光 |

### 色彩角色分工（铁律）

| 色彩来源 | 用途 | 占比上限 |
|---------|------|---------|
| chart_colors[0..4] | 卡片色条轮换 + 图表色序列 + 图标颜色 | 每卡用不同色 |
| primary `{{primary}}` | 内容页标题色 + 卡片标题色 | 标题文字专用 |
| accent `{{accent}}` | 页面级装饰线（顶部色条 + 标题短线） | ≤8% |
| background `{{background}}` | 页面底色 | 全画布 |
| text `{{text}}` | 正文 | 全页 |
| card_bg `{{card_bg}}` | 卡片背景 | 卡片区域 |

### 禁止事项

- 禁止 accent 色用于卡片色条（accent 是页面级装饰色）
- 禁止所有卡片色条同一颜色
- 禁止 chart_colors[0] 独占所有卡片
- 禁止渐变和过度装饰

---

## III. 排版层级

### 字体

| 角色 | 字体栈 |
|------|--------|
| 标题 | `DM Sans, Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif` |
| 正文 | `Inter, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif` |
| CJK | `'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif` |

### 字号层级

| 层级 | 字号 | 字重 | 使用场景 |
|------|------|------|---------|
| 封面标题 | 58-65px | 700 | 封面 h1 |
| 页标题 | 36-44px | 700 | 内容页 h2 |
| 卡片标题 | 22-24px | 600 | 卡片 heading |
| 正文 | 16-18px | 400 | 卡片 body |
| 标注 | 14px | 400 | 页码、来源、脚注、插图标签 |

### 行距与字距

- 标题 line-height: 1.15-1.25
- 正文 line-height: 1.6-1.8
- 标题 letter-spacing: -0.3~-0.5px（英文）
- 卡片之间间距: 24px

---

## IV. 卡片样式 Token

| 属性 | 值 |
|------|-----|
| border_radius | 12px |
| shadow | `0 2px 8px rgba(0,0,0,0.08)` |
| border | `1px solid rgba({{text_rgb}}, 0.12)` |
| gap | 24px |

### 渐变

| 名称 | 值 |
|------|-----|
| hero_bg | `linear-gradient(135deg, {{primary}} 0%, {{secondary}} 100%)` |
| card_highlight | `linear-gradient(180deg, {{card_bg}} 0%, {{background}} 100%)` |

### 阴影层级

| 级别 | 值 |
|------|-----|
| sm | `0 1px 2px rgba(0,0,0,0.05)` |
| md | `0 4px 12px rgba(0,0,0,0.08)` |
| lg | `0 12px 40px rgba(0,0,0,0.15)` |

---

## V. 装饰系统 · 5 层结构

每页固定装饰元素：
- **顶部色条**: 5px, accent `{{accent}}`, 横跨画布全宽
- **标题短线**: 48×4px, accent `{{accent}}`
- **页码标记**: dot (6px `{{accent}}`) + 当前页/总页数

### 层结构（从底到顶）

1. **背景层** — background 色铺满 + 半透明几何装饰
2. **装饰层** — 几何图形（圆/椭圆/方形，opacity 0.03-0.12）
3. **结构层** — 卡片容器 + 网格排列
4. **内容层** — 文字 + 图标 + 图表
5. **标识层** — 顶部色条 + 页码 + logo

### 内容页装饰 · 3 种类型

| 类型 | 特征 | 适用场景 |
|------|------|---------|
| **Type A** · 圆形点缀 | 右上角半透明圆 + 顶部色条 + 标题短线 + 页码 | 最常用的标准内容页 |
| **Type B** · 双几何 | 左上圆 + 右下旋转方形，对角线平衡 | 需要视觉张力的页面 |
| **Type C** · 条纹肌理 | 细网格纹理 + 右下角半透明大圆 | 数据密集页、深色模式内容页 |

---

## VI. 图表语言

### 折线图
- 2px 线条，圆角端点，数据点实心圆
- 使用 chart_colors 序列着色

### 面积图
- 折线下方填充半透明色（opacity 0.15），增强趋势量感

### 柱状图/条形图
- 使用 chart_colors 序列按数据项索引着色
- 标签 14px Inter

### 环形图（Donut）
- 中心文字 18px, primary `{{primary}}`, 加粗 700
- 环形色使用 chart_colors 序列
- 轨道用 card_bg `{{card_bg}}`

### 进度条（Progress Bar）
- 轨道: card_bg `{{card_bg}}`
- 填充: chart_color → secondary 渐变
- 圆角: 12px（同卡片 token）

### Big Number（大数字）
- 居中 52px DM Sans 加粗 + 单位 18px + 标签 14px opacity 0.6
- 颜色使用 chart_color

### Sparkline（迷你趋势线）
- 面积填充 opacity 0.15，线条 1.8px
- 终端实心点强调最新值

### Timeline（时间线）
- 竖线 `rgba({{text_rgb}}, 0.12)` 2px + 节点圆 10px chart_color[n] 轮换
- 时间标题 + 描述

### 对比条（正负向）
- 正向: 蓝钢渐变
- 负向: 铜陶渐变
- 标签右对齐，数值在条内

### Chart 字段规范

| 类型 | 必需字段 | 可选字段 | 示例 |
|------|---------|---------|------|
| big_number | value, label | suffix, color | `{"type":"big_number","value":85,"label":"完成率","suffix":"%"}` |
| progress_bar | value(0-100), label | color | `{"type":"progress_bar","value":60,"label":"进度"}` |
| bar | items:[{label,value}] | max | `{"type":"bar","items":[{"label":"A","value":80}]}` |
| donut | value, label | total(默认100) | `{"type":"donut","value":35,"label":"占比"}` |
| timeline | items:[{time,event}] | — | `{"type":"timeline","items":[{"time":"Q1","event":"启动"}]}` |
| sparkline | points:[num,...] | label | `{"type":"sparkline","points":[10,25,18,42,30],"label":"趋势"}` |
| line | points:[num,...], labels:[str,...] | color | `{"type":"line","points":[12,28,22,40,32],"labels":["1月"..."5月"]}` |

---

## VII. 布局库 · 10 种布局

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

### 布局选择决策树

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

---

## VIII. 卡片角色目录 · 11 种 Role

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

### 卡片结构铁律（每张卡四要素缺一不可）

```
┌─ 卡片容器（card_bg + border_radius + shadow）──────────┐
│ ▓▓▓▓ 左侧色条（chart_colors[n]，4px）                    │
│ 🔷 SVG 图标（16-24px，颜色跟随色条）+ 标题                │
│ 正文（body 字号，line-height: 1.6-1.8）                   │
│ [可选] 图表区 / 底部标签                                  │
└──────────────────────────────────────────────────────────┘
```

**色条轮换规则**：多卡片页面，每张卡使用不同 chart_color，按 [0]→[1]→[2]→... 依次轮换。禁止所有卡片同一颜色。

---

## IX. 图表选择决策树

```
数据长什么样？
├─ 单一数字/百分比（如"完成率 85%"） → big_number
├─ 占比/完成度 0-100%（如"已完成 60%"） → progress_bar
├─ 多项目对比（如"A:80, B:65, C:45"） → bar
├─ 占比关系（如"占比 35%"） → donut
├─ 时间序列趋势（如"近6个月变化"） → sparkline / line
└─ 时间节点/里程碑 → timeline
```

---

## X. 数据转化规则 · 强制映射

以下情况必须将文字转化为图表形态，**禁止裸数字**：

- 大纲出现"XX%"或"XX 万"等数字 → 必须渲染为图表形态（chart: big_number）
- 大纲出现"占比/完成/达到 XX%" → 必须渲染为 progress_bar 或 big_number
- 大纲 body 超过 200 字 → 必须拆分为 ≥3 张卡片
- 大纲有对立内容（优劣/前后/方案A vs B）→ 必须使用 two_column 布局
- 大纲有多个并列数据项（3+） → 必须使用 bar 或 dashboard 布局
- 大纲有时间节点（Q1/Q2/月份）→ 必须使用 timeline 布局

**裸数字 = 设计事故**：
- ❌ 错误：纯文字堆砌 "营收达到 85 万，同比增长 17.6%"
- ✅ 正确：营收指标卡 big_number(85万) + sparkline(增长趋势)

---

## XI. 视觉丰富度硬指标

每页幻灯片必须满足以下所有指标，缺一不可：

| # | 指标 | 最低要求 |
|---|------|---------|
| 1 | SVG 图形元素 | ≥3 个（图标 + 装饰几何形 + 图表） |
| 2 | 不同颜色 | ≥4 种来自 chart_colors 的颜色 |
| 3 | 卡片数量 | ≥3 张（封面/总结 ≥1 张但必须有 hero 卡） |
| 4 | 图层深度 | 5 层全部覆盖（背景→装饰→结构→内容→标识） |
| 5 | 装饰图形 | ≥2 个半透明几何装饰（圆/椭圆，opacity 0.03-0.12） |
| 6 | 卡片图标 | 每张卡片标题前至少 1 个 SVG 图标（16-24px） |
| 7 | 数据可视化 | 含数字的卡片必须渲染为图表形态 |

---

## XII. 跨页一致性

### 所有内容页固定元素

- 顶部 accent 色条（同色同高同位置）
- 标题位置（同 left/同 top）
- 标题短线（同色同尺寸 40×3px）
- 页码标记（同位置同风格）
- 字体族（全 deck 统一）
- 卡片间距（同 gap 值）
- 卡片圆角（同 border-radius）

### 封面与总结"书挡效应"

- 同色系深色背景（hero_bg 渐变）
- 同款装饰（光晕、大圆、几何图形）
- 白色文字
- 相同字体与字重
- 禁止卡片容器包裹封面/总结内容

### 页脚呼应

首页 hero（深蓝底 + 底部黄铜粗线）与页脚（深蓝底 + 顶部黄铜粗线）形成视觉闭环。页脚作为文档的正式收束，深蓝色背景呼应封面权威感，黄铜色顶线呼应 hero 底部装饰条。

---

## XIII. 页面类型覆盖

> 每种类型有独立的 `.md` 规范文件，继承本文件的通用规则并叠加专属 Override。

| # | 类型 | 标签 | 背景 | 文字色 | 默认布局 | 特殊规则 |
|---|------|------|------|--------|---------|---------|
| 1 | cover | 封面 | hero_bg 渐变 | #ffffff | full_bleed | 禁止卡片容器 · heading_scale:1.3 |
| 2 | toc | 目录 | {{background}} | — | single_focus | 编号圆形 + 章节名列表 |
| 3 | section | 章节分隔 | hero_bg 渐变 | #ffffff | full_bleed | 居中章节标题 · 无页码 |
| 4 | chapter | 章节页 | {{background}} | — | mixed_grid | 大号章节编号 + 标题 + 要点预览 |
| 5 | content | 内容页 | {{background}} | — | 按决策树 | 5 层结构完整 · 默认类型 |
| 6 | data | 数据页 | {{background}} | — | dashboard | heading_scale:0.9 · 强制图表化 |
| 7 | data_hero | 数据突出 | {{background}} | — | full_bleed | 超大数字居中 + 辅助指标卡 |
| 8 | technique | 技法页 | {{background}} | — | single_focus | 编号步骤卡 · icon+step+desc |
| 9 | principle | 原则页 | {{background}} | — | two_column_asymmetric | 编号原则 + 理由说明 |
| 10 | process_flow | 流程图 | {{background}} | — | timeline | 步骤节点 + flow-arrow 连接 |
| 11 | process_timeline | 流程时间线 | {{background}} | — | mixed_grid | 时间节点 + 阶段交付物 |
| 12 | timeline | 时间线 | {{background}} | — | timeline | 水平时间轴 + 里程碑节点 |
| 13 | comparison | 对比页 | {{background}} | — | two_column | 多维对比表 · 推荐行高亮 |
| 14 | duo_compare | 双项对比 | {{background}} | — | two_column | A vs B 深度对比 · 中间分隔线 |
| 15 | table | 表格页 | {{background}} | — | single_focus | 经典表格 · 条件格式 |
| 16 | grid_cards | 网格卡片 | {{background}} | — | hero_grid | 等宽等高网格 · 色条轮换 |
| 17 | image_grid | 图片网格 | {{background}} | — | grid_cards | 图片 + 标注 · 4:3 比例 |
| 18 | quote | 引言页 | {{primary}} | #ffffff | single_focus | 斜体引文 · 大号引号装饰 |
| 19 | image_hero | 图片突出 | 深色渐变 | #ffffff | full_bleed | 大图 + 文字叠加层 |
| 20 | food_archive | 美食档案 | {{background}} | — | hero_grid | hero 大卡 + 特征标签 + 参数卡 |
| 21 | skill_card | 技能卡片 | {{background}} | — | grid_cards | 技能名 + 星级 + 年限 |
| 22 | troubleshoot | 问题排查 | {{background}} | — | grid_cards | 问题-原因-方案三栏 |
| 23 | appendix | 附录页 | {{background}} | — | single_focus | 参考列表 + 术语表 |
| 24 | copyright | 版权页 | hero_bg 渐变 | #ffffff | full_bleed | 版权声明 · 致谢 · 无页码 |
| 25 | closing | 结尾页 | hero_bg 渐变 | #ffffff | full_bleed | 感谢 + 联系方式 + 版权 |
| 26 | summary | 总结页 | hero_bg 渐变 | #ffffff | full_bleed | 核心要点回顾 · 呼应封面书挡 |
| 27 | document | A4文档 | {{background}} | — | single_focus | 统一表格布局，段落拼装架构 |

> 每种类型的详细规则见对应的 `.md` 文件。通用规则（色彩/排版/卡片/装饰/图表）继承本文件。

---

## XIV. 图标规范

| 属性 | 值 |
|------|-----|
| 风格 | outline（描线图标，圆角端点） |
| 描边宽度 | 1.5px |
| card 图标尺寸 | 20px |
| hero 图标尺寸 | 36px |
| metric 图标尺寸 | 16px |
| 颜色规则 | 跟随所在卡片的 chart_color, opacity: 0.7 |

---

## XV. 配图规范

### 何时需要配图/插图

- 封面/总结页：必须有大面积装饰（光晕、大圆、几何图形、网格纹理）
- 内容页卡片不足导致留白 >80px：必须添加主题相关插图填充
- 右侧留白 >200px：必须用插图/图表填补
- 抽象概念/流程：用 SVG 矢量插图辅助说明

### 插图 SVG 排版规范

| 规则 | 要求 |
|------|------|
| 标签对齐 | text-anchor="middle"，标签 x = 图形 cx |
| 图元与标签间距 | 图形底部到标签基线 ≥ 22px |
| 辅助线到标签 | ≥ 20px |
| 线宽下限 | 可见描边 ≥ 1px（深色背景 0.5px 不可见） |
| 插图内字号 | ≥ 14px（与正文标注一致） |
| 元素分布 | 均匀对称，视觉平衡；对比类插图以中轴线镜像对称 |

---

## XVI. 质量自检清单 · 22 项

生成每页 HTML 后，逐项确认。任一项未满足 → 重新生成该页。

1. 5 层结构完整（背景→装饰→结构→内容→标识）
2. ≥3 个 SVG 元素
3. ≥4 种不同 chart_color 出现在页面
4. ≥1 个半透明几何装饰图形
5. 每张卡片有：SVG 图标 + 标题 + 正文
6. 有数字的地方有图表形态
7. 顶部有 accent 色条（4px）
8. 标题下方有 accent 短线（40×3px）
9. 右下角有页码（dot + 当前页/总页数）
10. 标题使用 primary 色
11. 正文使用 text 色
12. 卡片背景使用 card_bg 色
13. 页面背景使用 background 色
14. 字体来自 typography token（DM Sans + Inter）
15. 圆角来自 card_style token（12px）
16. 阴影来自 elevation token
17. 插图标签与图形居中对齐 (text-anchor="middle")
18. 插图标签与图形间距 ≥ 22px
19. 插图内字号 ≥ 14px
20. 可见 SVG 描边 ≥ 1px
21. 封面/总结禁止卡片容器包裹内容
22. 色条轮换：每张卡片不同 chart_color
