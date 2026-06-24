# Guizang 布局字段完整定义

> 每个布局声明其所需的所有文本字段。AI 生成内容时必须按字段名填写，HTML 渲染器用 `{{field_name}}` 直接替换。

---

## 通用字段（跨布局复用）

这些字段在多个布局中出现，语义相同：

| 字段名 | 类型 | 定义 |
|--------|------|------|
| `section_label` | string | 页面左上角的章节/栏目名，稳定可跨页复用，如 "Act I · 硬数据" |
| `page_num` | string | 页面右上角的页码标识，如 "03 / 25" |
| `kicker` | string | 大标题上方的小引导句，本页独有，有戏剧性，如 "BUT"、"Phase 01" |
| `heading` | string | 页面主标题，字重大（h-xl/h-hero），一句话概括本页主题 |
| `lead` | string | 标题下方的引导段落，1-2 句，对标题的补充说明，字重较轻 |
| `footnote_l` | string | 页面左下角注脚/说明 |
| `footnote_r` | string | 页面右下角注脚（常为页码或日期） |
| `body_text` | string | 正文段落，多行文本，常规字号 |
| `items` | string[] | 列表项，bullet / 要点集合 |
| `quote` | string | 引用文本，独立于正文的引述 |
| `quote_src` | string | 引用署名/出处 |
| `img_src` | string | 图片文件路径或 URL |
| `img_alt` | string | 图片 alt 文本 |
| `img_caption` | string | 图片下方说明文字 |
| `author` | string | 作者姓名 |
| `date` | string | 日期，如 "2026.05.10" |
| `tags` | string[] | 标签列表 |

---

## 瑞士风布局（Swiss · 15 个版式）

### P1 · Cover（封面）

**用途**：整套 deck 起手 / 主题宣言。IKB 满屏 + ASCII 呼吸场。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 左上：Deck 标题 / 编号 |
| `page_num` | string | 是 | 右上：SS · 日期 · 01/NN |
| `kicker` | string | 是 | 章节英文标签，如 "Section En"，白色半透明 |
| `title` | string | 是 | 主标题，超大字重 200，支持 `<em>italic</em>` 微强调 |
| `lead` | string | 是 | 副标/引子，1-2 行，max-width:52ch |
| `author` | string | 否 | 作者 · 日期 · 出处 |
| `footer_hint` | string | 否 | 右下角提示文字，如 "→ swipe / arrow keys" |

### P2 · Vertical Timeline（纵向时间轴）

**用途**：演化对比、年代变迁、版本迭代（2-5 个时间节点）。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `kicker` | string | 否 | 页级 kicker |
| `heading` | string | 是 | 页面主标题 |
| `timeline_nodes` | array | 是 | 2-5 个时间节点 |
| `timeline_nodes[].year` | string | 是 | 年份，如 "2023" |
| `timeline_nodes[].metric` | string | 是 | 量化数值+单位，如 "1×"、"4×" |
| `timeline_nodes[].label` | string | 是 | 节点描述标题 |
| `timeline_nodes[].desc` | string | 否 | 节点补充描述 |

### P3 · Statement（极简陈述）

**用途**：中心论点、章节起始、口号。一页一句话。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `statement` | string | 是 | 巨字陈述，8-12 词，weight 200 |
| `anchor` | string | 是 | 右下注脚，如 "— Statement 03" |

### P4 · Six Cells（六格定义）

**用途**：6 个并列概念/功能列举，=6。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `kicker` | string | 否 | 页级引导句 |
| `heading` | string | 是 | 页面主标题 |
| `cells` | array | 是 | 6 个格子 |
| `cells[].icon` | string | 是 | lucide 图标名（如 "square-stack"） |
| `cells[].num` | string | 是 | 编号 "01"~"06" |
| `cells[].title` | string | 是 | 短标题（≤10 字） |
| `cells[].desc` | string | 是 | 一行描述（≤25 字） |

### P5 · Three Sub-cards（三子卡）

**用途**：三步流程、三类对比（=3）。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `kicker` | string | 是 | 如 "Three Forces" |
| `heading` | string | 是 | 页面主标题 |
| `cards` | array | 是 | 3 张子卡 |
| `cards[].num` | string | 是 | 编号 "01"/"02"/"03" |
| `cards[].title` | string | 是 | 卡片标题 |
| `cards[].desc` | string | 是 | 卡片描述（1-2 行） |

### P6 · KPI Tower（不等高柱状 KPI）

**用途**：4 项数据用柱高表达层级差异，=4。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `heading` | string | 是 | 页面主标题 |
| `towers` | array | 是 | 4 根柱 |
| `towers[].icon` | string | 是 | lucide 图标名 |
| `towers[].value` | string | 是 | 巨数，如 "90K" |
| `towers[].label` | string | 是 | 底部标签 |
| `towers[].bar_height` | string | 否 | 柱高，如 "36vh"（不填则按数值等比） |

### P7 · H-Bar Chart（横向条形图）

**用途**：5-10 项排名/占比对比，有量化数据。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `heading` | string | 是 | 页面主标题 |
| `bars` | array | 是 | 5-10 条 |
| `bars[].label` | string | 是 | 文字标签 |
| `bars[].value` | string | 是 | 数值（百分比或绝对数） |
| `bars[].width` | string | 否 | bar 宽度百分比，如 "84%"（不填按 value 推导） |

### P8 · Duo Compare（双轨对照）

**用途**：Before/After、A vs B、=2。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `heading` | string | 否 | 页级标题 |
| `left_kicker` | string | 是 | 左侧标签，如 "Before" |
| `left_title` | string | 是 | 左侧大标题 |
| `left_desc` | string | 否 | 左侧补充说明 |
| `right_kicker` | string | 是 | 右侧标签，如 "After" |
| `right_title` | string | 是 | 右侧大标题 |
| `right_desc` | string | 否 | 右侧补充说明 |

### P9 · Closing Manifesto（收束宣言）

**用途**：整套 deck 收尾。左 IKB+ASCII / 右 takeaway。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 左上：页码 NN/NN |
| `page_num` | string | 是 | 右上：CLOSING |
| `kicker` | string | 是 | 左半：MANIFESTO 标签 |
| `title` | string | 是 | 宣言大字，支持 italic 微强调，如 "Build a model.\nRun forever." |
| `footnote` | string | 是 | 左半：中英文落地注脚，1 句 |
| `author` | string | 否 | 左半：作者 · 头衔 |
| `date` | string | 否 | 左半：日期 YY.MM.DD |
| `takeaway_label` | string | 是 | 右半左上：TAKEAWAYS |
| `takeaway_count` | string | 是 | 右半右上：03 RULES |
| `takeaways` | array | 是 | 3 条 takeaway |
| `takeaways[].num` | string | 是 | 编号 "01"/"02"/"03" |
| `takeaways[].title` | string | 是 | 标题 |
| `takeaways[].desc` | string | 是 | 一行说明 |
| `closing_text` | string | 是 | 右半底部："→ 完 · END OF FIELD NOTE" |

### P10 · Dot Matrix Statement（点阵宣言）

**用途**：第二张陈述页 / 章节切换 / 视觉透气。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `statement` | string | 是 | 三行宣言 |

### P11 · Horizontal Timeline（横向时间线）

**用途**：4-7 步线性流程。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `heading` | string | 是 | 页面主标题 |
| `nodes` | array | 是 | 4-7 个节点 |
| `nodes[].num` | string | 是 | 编号 "01"~"07" |
| `nodes[].label` | string | 是 | 步骤名 |

### P12 · Manifesto + Ink Banner（宣言 + 通栏 ink 条）

**用途**：阶段性结论、章节封底。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `kicker` | string | 是 | 左列 t-cat |
| `declaration` | string | 是 | 大字 4 行宣言 |
| `description` | string | 否 | 右列短段说明 |
| `banner_text` | string | 是 | 底部 ink 通栏反白短句 |

### P13 · Three Forces Cards（三力卡片小报）

**用途**：3 个对等概念深化。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `kicker` | string | 是 | 左 hero t-cat |
| `title` | string | 是 | 左 hero 4 行标题 |
| `cards` | array | 是 | 3 张卡片 |
| `cards[].num` | string | 是 | 蓝巨编号 "01"/"02"/"03" |
| `cards[].title` | string | 是 | 卡片标题 |
| `cards[].desc_left` | string | 是 | 左列描述 |
| `cards[].desc_right` | string | 是 | 右列描述 |

### P14 · Loop Diagram（闭环流程图）

**用途**：3-5 步循环流程。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `heading` | string | 是 | 页面主标题 |
| `loop_text` | string | 是 | 中央文字，如 "LOOP" |
| `steps` | array | 是 | 3-5 步 |
| `steps[].num` | string | 是 | 编号 |
| `steps[].title` | string | 是 | 步骤标题 |
| `steps[].desc` | string | 否 | 步骤描述 |

### P15 · Image Matrix + Hero Stat（矩阵 + 大字底注）

**用途**：8-12 项同类 + 底部汇总指标。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `heading` | string | 是 | 页面主标题 |
| `cells` | array | 是 | 8-12 个格子 |
| `cells[].title` | string | 是 | 短标题 |
| `stat_value` | string | 是 | 底部汇总巨数 |
| `stat_label` | string | 是 | 底部汇总标签 |

### P16 · Multi-card Brief（微卡小报）

**用途**：6 项轻量快讯/tip，=6。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `heading` | string | 是 | 页面主标题 |
| `briefs` | array | 是 | 6 张微卡 |
| `briefs[].title` | string | 是 | 左上主文 |
| `briefs[].note` | string | 是 | 右下小字注脚 |
| `accent_index` | int | 否 | 蓝底强调项的索引（0-5），只允许一个 |

### P17 · System Diagram（同心圆系统图）

**用途**：三层嵌套关系（core/middle/outer）。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `heading` | string | 是 | 页面主标题 |
| `layers` | array | 是 | 3 层 |
| `layers[].name` | string | 是 | 层名（core/middle/outer） |
| `layers[].label` | string | 是 | 标签文字 |
| `layers[].desc` | string | 是 | 段说明 |

### P18 · Why Now（三列递进 + 巨数）

**用途**：3 论点 + 各自支撑数据。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `heading` | string | 是 | 页面主标题 |
| `columns` | array | 是 | 3 列 |
| `columns[].kicker` | string | 是 | t-cat 标签 |
| `columns[].title` | string | 是 | 一句标题 |
| `columns[].desc` | string | 是 | 段落描述 |
| `columns[].number` | string | 是 | 底部巨数 |
| `accent_index` | int | 否 | 蓝数强调列索引，默认 2（最后一列） |

### P19 · Four Cards（四列均分卡）

**用途**：4 项等权特性/模块，=4。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `heading` | string | 是 | 双行主标题 |
| `cards` | array | 是 | 4 张卡 |
| `cards[].kicker` | string | 是 | 顶部编号，如 "— 01 / SLASH" |
| `cards[].title` | string | 是 | 大字标题 |
| `cards[].desc` | string | 是 | 段落描述 |

### P20 · Stacked KPI Ledger（纵向账单 KPI）

**用途**：4-6 行核心数据账单式展示。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `heading` | string | 是 | 页面主标题 |
| `rows` | array | 是 | 4-6 行 |
| `rows[].value` | string | 是 | 巨数 |
| `rows[].label` | string | 是 | 标签 |
| `rows[].icon` | string | 是 | lucide 图标名 |

### P21 · Tech Spec Sheet（规格说明书）

**用途**：产品规格/benchmark/性能基线。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 章节名 |
| `page_num` | string | 是 | 页码 |
| `title` | string | 是 | 4 行大标题 |
| `kpi_items` | array | 是 | 3 组 KPI |
| `kpi_items[].value` | string | 是 | 数值 |
| `kpi_items[].unit` | string | 否 | 单位 |
| `goal_value` | string | 是 | 底部巨数 |
| `goal_label` | string | 是 | 底部标签，如 "Yearly goal" |
| `tags` | string[] | 是 | 3 个 tag |
| `mp_code` | string | 是 | 右下编码，如 "MP-75" |
| `spec_bars` | array | 否 | 右下 9 根竖线高度 |

### P22 · Image Hero（图文混排封面）

**用途**：案例展示 / 产品图 + 数据落地。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | "Section · Case / Visual Evidence" |
| `page_num` | string | 是 | "22 / NN" |
| `img_src` | string | 是 | 图片路径 |
| `img_alt` | string | 是 | 图片说明 |
| `title` | string | 是 | 白块内标题，支持换行 |
| `description` | string | 是 | 1-2 行解释 |
| `metrics` | array | 是 | 3 个指标 |
| `metrics[].name` | string | 是 | 指标名，如 "Metric 01" |
| `metrics[].value` | string | 是 | 数值，如 "12×" |
| `metrics[].explanation` | string | 是 | 指标解释 |

### P23 · Swiss Image Split（左文右图/右文左图 实验）

**用途**：一个核心论点 + 一张核心图片（纪实照片/信息图/截图）。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | "Section · Visual Argument" |
| `page_num` | string | 是 | "23 / NN" |
| `kicker` | string | 是 | 如 "Evidence · GPT-M 2.0" |
| `heading` | string | 是 | 一句核心论点，weight 200 |
| `lead` | string | 是 | "Why it matters"，2-3 行解释图片与论点关系 |
| `body_text` | string | 否 | 2-3 条短 bullet 或一段说明 |
| `img_src` | string | 是 | 图片路径 |
| `img_alt` | string | 是 | 图片说明 |
| `img_caption_title` | string | 是 | 图片标题 |
| `img_caption_sub` | string | 是 | 尺寸标注，如 "16:10 · fit-contain" |

### P24 · Swiss Evidence Grid（多图证据墙 实验）

**用途**：2-3 张同类图片/截图并列展示，证明同一结论。

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | "Section · Evidence Grid" |
| `page_num` | string | 是 | "24 / NN" |
| `kicker` | string | 是 | 如 "Three visual proofs" |
| `heading` | string | 是 | 总论点标题 |
| `images` | array | 是 | 2-3 张图片 |
| `images[].src` | string | 是 | 图片路径 |
| `images[].alt` | string | 是 | 图片说明 |
| `images[].num` | string | 是 | 编号 "01"/"02"/"03" |
| `images[].label` | string | 是 | 证据标签，如 "证据 A" |

---

## 杂志风布局（Magazine · 10 个版式）

### Layout 1: Hero Cover（开场封面）

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 左上元数据，如 "A Talk · 2026.04.22" |
| `page_num` | string | 是 | 右上，如 "Vol.01" |
| `kicker` | string | 是 | 主标题上方引导句 |
| `title` | string | 是 | 主视觉标题（h-hero, 10vw） |
| `subtitle` | string | 否 | 副标题（h-sub） |
| `lead` | string | 是 | 描述段落，max-width:60vw |
| `author` | string | 是 | 作者行，如 "歸藏 Guizang · 独立创作者" |
| `footnote_l` | string | 是 | 左下注脚 |
| `footnote_r` | string | 否 | 右下注脚 |

### Layout 2: Act Divider（章节幕封）

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 左上幕名，如 "第一幕 · 硬数据" |
| `page_num` | string | 是 | 右上，如 "Act I · 01 / 25" |
| `kicker` | string | 是 | 幕编号，如 "Act I" |
| `title` | string | 是 | 幕标题，h-hero 8.5vw |
| `lead` | string | 是 | 一句引语 |
| `footnote_l` | string | 否 | 左下注脚 |

### Layout 3: Big Numbers Grid（数据大字报）

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 左上 |
| `page_num` | string | 是 | 右上 |
| `kicker` | string | 是 | 引导句 |
| `heading` | string | 是 | h-xl 主标题 |
| `lead` | string | 否 | 标题下方引语 |
| `stats` | array | 是 | 4-6 个数据卡 |
| `stats[].label` | string | 是 | 英文小字标签 |
| `stats[].value` | string | 是 | 大字数值 |
| `stats[].unit` | string | 否 | 单位（如"天"） |
| `stats[].note` | string | 是 | 注释短句 |
| `footnote_l` | string | 否 | 左下注脚 |

### Layout 4: Quote + Image（左文右图）

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 左上 |
| `page_num` | string | 是 | 右上 |
| `kicker` | string | 是 | 引导词，如 "BUT" |
| `heading` | string | 是 | 左列主标题（h-xl） |
| `lead` | string | 否 | 左列描述段落 |
| `quote` | string | 否 | left callout 引用，可多行 |
| `quote_src` | string | 否 | 引用出处 |
| `img_src` | string | 是 | 图片路径 |
| `img_alt` | string | 是 | 图片 alt |
| `img_caption` | string | 是 | 图片下方标注 |

### Layout 5: Image Grid（图片网格）

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 左上 |
| `page_num` | string | 是 | 右上 |
| `kicker` | string | 是 | 引导句 |
| `heading` | string | 是 | 主标题 |
| `images` | array | 是 | 4-6 张图片 |
| `images[].src` | string | 是 | 图片路径 |
| `images[].alt` | string | 是 | alt 文本 |
| `images[].caption` | string | 是 | 图注 |
| `footnote_l` | string | 否 | 左下注脚 |

### Layout 6: Pipeline（两列流水线）

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 左上 |
| `page_num` | string | 是 | 右上 |
| `kicker` | string | 是 | 引导句 |
| `heading` | string | 是 | 主标题 |
| `pipelines` | array | 是 | 1-2 组流水线 |
| `pipelines[].label` | string | 是 | 组标题，如 "文本侧 · Text Pipeline" |
| `pipelines[].steps` | array | 是 | 步骤列表 |
| `pipelines[].steps[].num` | string | 是 | 步骤编号 |
| `pipelines[].steps[].title` | string | 是 | 步骤标题 |
| `pipelines[].steps[].desc` | string | 是 | 步骤描述 |
| `footnote_l` | string | 否 | 左下注脚 |

### Layout 7: Hero Question（悬念收束/问题页）

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 左上 |
| `page_num` | string | 是 | 右上 |
| `kicker` | string | 是 | 引导词 |
| `title` | string | 是 | 问题正文，h-hero，手工断行 |
| `lead` | string | 否 | 点破补充句 |
| `footnote_l` | string | 否 | 左下注脚 |

### Layout 8: Big Quote（大引用/金句）

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 左上 |
| `page_num` | string | 是 | 右上 |
| `kicker` | string | 是 | 引导词 |
| `quote` | string | 是 | 引用正文，serif 大字 5-6vw |
| `translation` | string | 否 | 英文原文/翻译 |
| `attribution` | string | 是 | 出处 · 日期 |

### Layout 9: A vs B（并列对比）

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 左上 |
| `page_num` | string | 是 | 右上 |
| `kicker` | string | 是 | 页面引导句 |
| `heading` | string | 是 | 主标题 |
| `left_kicker` | string | 是 | 左列标签，如 "Before · 旧模式" |
| `left_title` | string | 是 | 左列标题 |
| `left_items` | string[] | 是 | 左列要点列表 |
| `right_kicker` | string | 是 | 右列标签，如 "After · 新模式" |
| `right_title` | string | 是 | 右列标题 |
| `right_items` | string[] | 是 | 右列要点列表 |
| `footnote_l` | string | 否 | 左下注脚 |

### Layout 10: Lead Image + Side Text（图文混排）

| 字段 | 类型 | 必填 | 定义 |
|------|------|------|------|
| `section_label` | string | 是 | 左上 |
| `page_num` | string | 是 | 右上 |
| `kicker` | string | 是 | 阶段标签 |
| `heading` | string | 是 | 主标题 |
| `lead` | string | 是 | 引导段描述 |
| `body_text` | string | 否 | 正文段落 |
| `quote` | string | 否 | callout 引用 |
| `quote_src` | string | 否 | 引用署名 |
| `img_src` | string | 是 | 图片路径 |
| `img_alt` | string | 是 | 图片 alt |
| `img_caption` | string | 是 | 图注 |
| `footnote_r` | string | 否 | 右下注脚 |

---

## 字段汇总（全局唯一字典）

按字母序排列，标注使用该字段的布局。

| 字段名 | 类型 | 定义 | 使用布局 |
|--------|------|------|----------|
| `accent_index` | int | 蓝底强调项索引 | P16, P18 |
| `anchor` | string | 页脚注脚/锚点文字 | P3 |
| `attribution` | string | 引用署名+日期 | L8 |
| `author` | string | 作者姓名+头衔 | P1, P9, L1 |
| `banner_text` | string | 通栏 ink 条反白文字 | P12 |
| `bars` | array | H-Bar 条目列表 | P7 |
| `bars[].label` | string | bar 文字标签 | P7 |
| `bars[].value` | string | bar 数值 | P7 |
| `bars[].width` | string | bar 宽度百分比 | P7 |
| `body_text` | string | 正文段落 | L10 |
| `briefs` | array | 微卡列表 | P16 |
| `briefs[].title` | string | 左上主文 | P16 |
| `briefs[].note` | string | 右下小字 | P16 |
| `cards` | array | 子卡列表 | P5, P13, P19 |
| `cards[].num` | string | 卡片编号 | P5, P13 |
| `cards[].title` | string | 卡片标题 | P5, P13, P19 |
| `cards[].desc` | string | 卡片描述 | P5, P19 |
| `cards[].desc_left` | string | 左列描述 | P13 |
| `cards[].desc_right` | string | 右列描述 | P13 |
| `cards[].kicker` | string | 卡片顶部编号标签 | P19 |
| `cells` | array | 格子列表 | P4, P15 |
| `cells[].icon` | string | lucide 图标名 | P4 |
| `cells[].num` | string | 格编号 | P4 |
| `cells[].title` | string | 格/项标题 | P4, P15 |
| `cells[].desc` | string | 格描述 | P4 |
| `closing_text` | string | 收尾页底部文字 | P9 |
| `columns` | array | 三列内容 | P18 |
| `columns[].kicker` | string | 列标签 | P18 |
| `columns[].title` | string | 列标题 | P18 |
| `columns[].desc` | string | 列描述 | P18 |
| `columns[].number` | string | 列底巨数 | P18 |
| `date` | string | 日期 | P1, P9 |
| `declaration` | string | 4 行宣言文字 | P12 |
| `description` | string | 补充说明段落 | P12, P22 |
| `footer_hint` | string | 右下操作提示 | P1 |
| `footnote` | string | 注脚文字 | P9 |
| `footnote_l` | string | 左下角注脚 | L1-L7, L9 |
| `footnote_r` | string | 右下角注脚 | L1, L10 |
| `goal_label` | string | 底部目标标签 | P21 |
| `goal_value` | string | 底部目标巨数 | P21 |
| `heading` | string | 页面主标题 | P2, P4-P7, P11, P14-P16, P18-P20, L3-L6, L9, L10 |
| `images` | array | 图片列表 | L5 |
| `images[].src` | string | 图片路径 | L5 |
| `images[].alt` | string | 图片 alt | L5 |
| `images[].caption` | string | 图片图注 | L5 |
| `img_alt` | string | 图片 alt 文本 | L4, L10, P22 |
| `img_caption` | string | 图片下方标注 | L4, L10 |
| `img_src` | string | 图片文件路径 | L4, L10, P22 |
| `items` | string[] | 列表要点 | L9 |
| `kicker` | string | 标题上方引导句 | P1-P5, P12, P13, L1-L10 |
| `kpi_items` | array | 规格 KPI 列表 | P21 |
| `kpi_items[].value` | string | KPI 数值 | P21 |
| `kpi_items[].unit` | string | KPI 单位 | P21 |
| `layers` | array | 系统图层 | P17 |
| `layers[].name` | string | 层标识 | P17 |
| `layers[].label` | string | 层标签 | P17 |
| `layers[].desc` | string | 层描述 | P17 |
| `lead` | string | 标题下方引导段落 | P1, L1-L4, L7, L10 |
| `left_kicker` | string | 左侧对比标签 | P8, L9 |
| `left_title` | string | 左侧对比标题 | P8, L9 |
| `left_desc` | string | 左侧补充说明 | P8 |
| `left_items` | string[] | 左侧列表要点 | L9 |
| `loop_text` | string | 闭环中央文字 | P14 |
| `metrics` | array | KPI 指标列表 | P22 |
| `metrics[].name` | string | 指标名称 | P22 |
| `metrics[].value` | string | 指标数值 | P22 |
| `metrics[].explanation` | string | 指标解释 | P22 |
| `mp_code` | string | 右下角编码 | P21 |
| `nodes` | array | 时间线节点 | P11 |
| `nodes[].num` | string | 节点编号 | P11 |
| `nodes[].label` | string | 节点标签 | P11 |
| `page_num` | string | 右上角页码 | P1-P22, L1-L10 |
| `pipelines` | array | 流水线组 | L6 |
| `pipelines[].label` | string | 流水线组标题 | L6 |
| `pipelines[].steps` | array | 步骤列表 | L6 |
| `pipelines[].steps[].num` | string | 步骤编号 | L6 |
| `pipelines[].steps[].title` | string | 步骤标题 | L6 |
| `pipelines[].steps[].desc` | string | 步骤描述 | L6 |
| `quote` | string | 引用正文 | L4, L8, L10 |
| `quote_src` | string | 引用署名/出处 | L4, L10 |
| `right_kicker` | string | 右侧对比标签 | P8, L9 |
| `right_title` | string | 右侧对比标题 | P8, L9 |
| `right_desc` | string | 右侧补充说明 | P8 |
| `right_items` | string[] | 右侧列表要点 | L9 |
| `rows` | array | Ledger 行列表 | P20 |
| `rows[].value` | string | 行数值 | P20 |
| `rows[].label` | string | 行标签 | P20 |
| `rows[].icon` | string | 行图标 | P20 |
| `section_label` | string | 左上角章节/栏目名 | P1-P22, L1-L10 |
| `spec_bars` | array | 竖线高度数组 | P21 |
| `stat_label` | string | 汇总指标标签 | P15 |
| `stat_value` | string | 汇总指标数值 | P15 |
| `statement` | string | 巨字陈述 | P3, P10 |
| `stats` | array | 数据卡列表 | L3 |
| `stats[].label` | string | 卡标签 | L3 |
| `stats[].value` | string | 卡数值 | L3 |
| `stats[].unit` | string | 数值单位 | L3 |
| `stats[].note` | string | 卡注释 | L3 |
| `steps` | array | 循环步骤 | P14 |
| `steps[].num` | string | 步骤编号 | P14 |
| `steps[].title` | string | 步骤标题 | P14 |
| `steps[].desc` | string | 步骤描述 | P14 |
| `subtitle` | string | 副标题 | L1 |
| `tags` | string[] | 标签列表 | P21 |
| `takeaway_count` | string | takeaway 条数标签 | P9 |
| `takeaway_label` | string | takeaway 标题 | P9 |
| `takeaways` | array | takeaway 列表 | P9 |
| `takeaways[].num` | string | 编号 | P9 |
| `takeaways[].title` | string | 标题 | P9 |
| `takeaways[].desc` | string | 说明 | P9 |
| `timeline_nodes` | array | 时间节点 | P2 |
| `timeline_nodes[].year` | string | 年份 | P2 |
| `timeline_nodes[].metric` | string | 量化数值 | P2 |
| `timeline_nodes[].label` | string | 节点标题 | P2 |
| `timeline_nodes[].desc` | string | 节点描述 | P2 |
| `title` | string | 页面主标题（超大） | P1, P9, P13, P21, L1, L2, L7, P22 |
| `towers` | array | KPI 柱列表 | P6 |
| `towers[].icon` | string | 柱图标 | P6 |
| `towers[].value` | string | 柱数值 | P6 |
| `towers[].label` | string | 柱标签 | P6 |
| `towers[].bar_height` | string | 柱高度（vh） | P6 |
| `translation` | string | 引用翻译/原文 | L8 |
