# VI 索引 · Notion Structured Clarity

> 唯一数据源。AI 生成幻灯片时，通过本索引定位所需类型和规范，不再扫描全部 .md 文件。
> 编号规则：I=总纲 D=设计原则 E=设计元素 P=页面类型 B=文档构建块 T=文档模板 C=列专属覆写

---

## 总纲（4 项）

| 编号 | 类型名 | 说明 | 文件 |
|------|--------|------|------|
| I01 | vi | VI 总入口提示词，所有页面类型必读的通用规范 | vi.md |
| I02 | prompt | 模版提示词，AI 生成前的行为指令 | prompt.md |
| I03 | tokens | Notion 色系变量定义（5 套方案） | tokens.yaml |
| I04 | index | VI 索引目录，本文件 | index.md |

---

## 设计原则（7 项，AI 生成时必须遵守的抽象规范）

| 编号 | 原则 | 说明 | 文件 |
|------|------|------|------|
| D01 | principles | VIS 设计的底层指导思想，结构化清晰三大支柱 | principles.md |
| D02 | consistency | 跨页一致性，全 Deck 统一元素与书挡效应 | consistency.md |
| D03 | richness | 视觉丰富度硬指标，每页必须满足的量化标准 | richness.md |
| D04 | checklist | 质量自检清单，19 项逐项验证 | checklist.md |
| D05 | images | 配图规范，配图/插图的使用时机与 SVG 排版规范 | images.md |
| D06 | data_rules | 数据转化规则，将文字数据强制映射为图表形态 | data_rules.md |
| D07 | decorations | 装饰系统，3 层结构架构（背景→结构→内容），无全宽顶部色条 | decorations.md |

---

## 设计元素（8 项，AI 生成时引用具体参数值）

| 编号 | 元素 | 说明 | 文件 |
|------|------|------|------|
| E01 | colors | 色彩系统，极简 6 色令牌、语义映射与使用铁律 | colors.md |
| E02 | typography | 排版层级，系统字体栈、字号体系与行距规范 | typography.md |
| E03 | card_styles | 卡片样式 Token，圆角、彩色描边、间距（无阴影无渐变） | card_styles.md |
| E04 | charts | 图表语言，折线图、面积图、柱状图、环形图、进度条、大数字、趋势线、对比条 | charts.md |
| E05 | layouts | 布局库，10 种布局的排列方式与适用场景决策 | layouts.md |
| E06 | card_roles | 卡片角色目录，11 种 Role 的视觉特征（彩色描边）与字段规范 | card_roles.md |
| E07 | chart_decision | 图表选择决策树，根据数据特征选择正确的图表类型 | chart_decision.md |
| E08 | icons | 图标规范，SVG 图标风格、尺寸与颜色规则（图标可选） | icons.md |

---

## 页面类型（27 项，供 AI 选择 page_type）

| 编号 | 类型名 | 中文名 | 用途 | 文件 |
|------|--------|--------|------|------|
| P01 | cover | 封面 | 开场页，纯白背景大量留白，主标题+副标题居中，零装饰 | cover.md |
| P02 | toc | 目录 | 内容导航与章节概览，纯文字编号列表，无彩色圆圈 | toc.md |
| P03 | section | 章节分隔 | 章节过渡页，纯白背景，居中编号+标题，无装饰线 | section.md |
| P04 | chapter | 章节页 | 新章节/新部分的起始页，包含章节编号、章节标题和简短概述 | chapter.md |
| P05 | content | 内容页 | 通用内容展示，Notion卡片骨架：彩色描边+可选图标+文字驱动 | content.md |
| P06 | data | 数据页 | 数据可视化展示，支持图表和指标卡片，复用内容页框架叠加数据规则 | data.md |
| P07 | data_hero | 数据突出 | 以大数字和关键指标为核心的展示页，强调单一数据的结构层次 | data_hero.md |
| P08 | technique | 技法页 | 展示单个技法、方法或操作步骤的详细说明，强调步骤顺序与关键要点 | technique.md |
| P09 | principle | 原则页 | 展示设计原则、工作理念或核心准则，强调理念陈述与理由支撑 | principle.md |
| P10 | process_flow | 流程图 | 展示业务流程、工作流或操作流水线，强调步骤顺序与分支逻辑 | process_flow.md |
| P11 | process_timeline | 流程时间线 | 将流程图与时间线结合，展示有时序关系的多阶段流程 | process_timeline.md |
| P12 | timeline | 时间线 | 展示时间序列事件、里程碑或项目进度，强调时间顺序和节点关系 | timeline.md |
| P13 | comparison | 对比页 | 展示多项内容的横向对比，强调差异与优劣判断 | comparison.md |
| P14 | duo_compare | 双项对比 | 两套方案、两个选项或两种观点的深度对比 | duo_compare.md |
| P15 | table | 表格页 | 以结构化表格展示数据、规格或矩阵信息 | table.md |
| P16 | grid_cards | 网格卡片 | 以均匀网格排列多张等权重的卡片 | grid_cards.md |
| P17 | image_grid | 图片网格 | 以均匀网格排列多张图片 | image_grid.md |
| P18 | quote | 引言页 | 展示名言、引述或关键陈述 | quote.md |
| P19 | image_hero | 图片突出 | 大面积图片配文字叠加层 | image_hero.md |
| P20 | food_archive | 美食档案 | 展示单个菜品/食谱的详细信息卡片 | food_archive.md |
| P21 | skill_card | 技能卡片 | 以独立卡片展示技能、能力或掌握程度 | skill_card.md |
| P22 | troubleshoot | 问题排查 | 展示问题诊断、故障排查步骤或常见问题解决方案 | troubleshoot.md |
| P23 | appendix | 附录页 | 补充参考资料、数据来源、术语表或额外阅读材料 | appendix.md |
| P24 | copyright | 版权页 | 文档结尾的版权声明、法律信息和致谢 | copyright.md |
| P25 | closing | 结尾页 | 演示文稿正式结束页，纯白背景零装饰，与封面首尾呼应 | closing.md |
| P26 | summary | 总结页 | 结尾收束，纯白背景+文字居中，与封面零装饰书挡效应 | summary.md |
| P27 | document | A4文档 | 统一表格布局，段落拼装架构，适配A4打印规格 | document.md |

---

## 文档构建块（5 项，A4 文档五大页面）

| 编号 | 块名 | 中文名 | 用途 | 文件 |
|------|------|--------|------|------|
| B01 | cover | 封面与档案信息 | 全页 card_bg 背景，主标题、日期、分类、核心要素、文档属性 | blocks/cover.md |
| B02 | product_definition | 成品定义与感官目标 | 标签-值对表格 + 成品图占位 + 副标题 | blocks/product_definition.md |
| B03 | materials_table | 食材清单表格 | 8列食材表格 | blocks/materials_table.md |
| B04 | steps_table | 操作步骤表格 | 8列步骤表格 | blocks/steps_table.md |
| B05 | quality_control | 出品标准与关键控制点 | 2-section统一表格 + 版权声明 | blocks/quality_control.md |

---

## 文档模板（1 项，A4 文档的完整段落编排方案）

| 编号 | 模板名 | 中文名 | 用途 | 文件 |
|------|--------|--------|------|------|
| T01 | homework_manual | 作业手册标准文档 | 标准化记录食谱作业流程 | templates/homework_manual.md |

---

## 列专属覆写 — col3 A4文档课件（2 项）

> col3 使用 A4 竖版画布（794×1123），以下页面类型有专属覆写。
> 加载优先级：`vi/{style_id}/col3/{section}.md` → `vi/{style_id}/{section}.md`

| 编号 | 页面类型 | 中文名 | 覆写内容 | 文件 |
|------|--------|--------|------|------|
| C01 | cover | A4封面 | 794×1123 画布，纯白背景，禁止卡片容器，深色文字，零装饰 | col3/cover.md |
| C02 | closing | A4结尾页 | 794×1123 画布，纯白背景+深色文字，与封面书挡效应 | col3/closing.md |
