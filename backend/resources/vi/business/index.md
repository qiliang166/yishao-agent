# VI 索引 · Business Professional

> 唯一数据源。AI 生成幻灯片时，通过本索引定位所需类型和规范，不再扫描全部 .md 文件。
> 编号规则：I=总纲 D=设计原则 E=设计元素 P=页面类型 B=文档构建块 T=文档模板 C=列专属覆写

---

## 总纲（4 项）

| 编号 | 类型名 | 说明 | 文件 |
|------|--------|------|------|
| I01 | vi | VI 总入口提示词，所有页面类型必读的通用规范 | vi.md |
| I02 | prompt | 模版提示词，AI 生成前的行为指令 | prompt.md |
| I03 | tokens | 5 套色系变量定义（深海蓝/中国红/翡翠绿/科技紫/暗夜金） | tokens.yaml |
| I04 | index | VI 索引目录，本文件 | index.md |

---

## 设计原则（7 项，AI 生成时必须遵守的抽象规范）

| 编号 | 原则 | 说明 | 文件 |
|------|------|------|------|
| D01 | principles | VIS 设计的底层指导思想，三大设计支柱 | principles.md |
| D02 | consistency | 跨页一致性，全 Deck 统一元素与书挡效应 | consistency.md |
| D03 | richness | 视觉丰富度硬指标，每页必须满足的量化标准 | richness.md |
| D04 | checklist | 质量自检清单，22 项逐项验证 | checklist.md |
| D05 | images | 配图规范，配图/插图的使用时机与 SVG 排版规范 | images.md |
| D06 | data_rules | 数据转化规则，将文字数据强制映射为图表形态 | data_rules.md |
| D07 | decorations | 装饰系统，5 层结构架构（背景→装饰→结构→内容→标识） | decorations.md |

---

## 设计元素（8 项，AI 生成时引用具体参数值）

| 编号 | 元素 | 说明 | 文件 |
|------|------|------|------|
| E01 | colors | 色彩系统，12 色令牌、语义映射与使用铁律 | colors.md |
| E02 | typography | 排版层级，字体栈、字号体系与行距规范 | typography.md |
| E03 | card_styles | 卡片样式 Token，圆角、阴影、边框、渐变与间距 | card_styles.md |
| E04 | charts | 图表语言，折线图、面积图、柱状图、环形图、进度条、大数字、趋势线、对比条 | charts.md |
| E05 | layouts | 布局库，10 种布局的排列方式与适用场景决策 | layouts.md |
| E06 | card_roles | 卡片角色目录，11 种 Role 的视觉特征与字段规范 | card_roles.md |
| E07 | chart_decision | 图表选择决策树，根据数据特征选择正确的图表类型 | chart_decision.md |
| E08 | icons | 图标规范，SVG 图标风格、尺寸与颜色规则 | icons.md |

---

## 页面类型（27 项，供 AI 选择 page_type）

| 编号 | 类型名 | 中文名 | 用途 | 文件 |
|------|--------|--------|------|------|
| P01 | cover | 封面 | 开场页，全屏视觉冲击，含主标题+副标题+背景图，建立权威感与专业度 | cover.md |
| P02 | toc | 目录 | 内容导航与章节概览，提供全局结构视图 | toc.md |
| P03 | section | 章节分隔 | 章节过渡页，深色全屏背景，居中章节标题，用于内容板块之间的视觉分隔 | section.md |
| P04 | chapter | 章节页 | 新章节/新部分的起始页，包含章节编号、章节标题和简短概述 | chapter.md |
| P05 | content | 内容页 | 通用内容展示，支持多卡片布局和图文混排，信息密度与视觉呼吸感平衡 | content.md |
| P06 | data | 数据页 | 数据可视化展示，支持图表和指标卡片，复用内容页框架叠加数据规则 | data.md |
| P07 | data_hero | 数据突出 | 以大数字和关键指标为核心的展示页，强调单一数据的视觉冲击力 | data_hero.md |
| P08 | technique | 技法页 | 展示单个技法、方法或操作步骤的详细说明，强调步骤顺序与关键要点 | technique.md |
| P09 | principle | 原则页 | 展示设计原则、工作理念或核心准则，强调理念陈述与理由支撑 | principle.md |
| P10 | process_flow | 流程图 | 展示业务流程、工作流或操作流水线，强调步骤顺序与分支逻辑 | process_flow.md |
| P11 | process_timeline | 流程时间线 | 将流程图与时间线结合，展示有时序关系的多阶段流程，适合项目规划和路线图 | process_timeline.md |
| P12 | timeline | 时间线 | 展示时间序列事件、里程碑或项目进度，强调时间顺序和节点关系 | timeline.md |
| P13 | comparison | 对比页 | 展示多项内容的横向对比，强调差异与优劣判断 | comparison.md |
| P14 | duo_compare | 双项对比 | 两套方案、两个选项或两种观点的深度对比，强调差异化与决策引导 | duo_compare.md |
| P15 | table | 表格页 | 以结构化表格展示数据、规格或矩阵信息，强调信息的可扫读性和对比性 | table.md |
| P16 | grid_cards | 网格卡片 | 以均匀网格排列多张等权重的卡片，适用于团队介绍、产品列表、功能矩阵等场景 | grid_cards.md |
| P17 | image_grid | 图片网格 | 以均匀网格排列多张图片，适用于作品集展示、产品图集、团队照片墙和视觉参考板 | image_grid.md |
| P18 | quote | 引言页 | 展示名言、引述或关键陈述，注重视觉冲击力和情感共鸣 | quote.md |
| P19 | image_hero | 图片突出 | 大面积图片配文字叠加层，适合产品展示、场景呈现或视觉冲击型内容 | image_hero.md |
| P20 | food_archive | 美食档案 | 展示单个菜品/食谱的详细信息卡片，包含名称、图片区、特征标签、工艺参数和风味描述 | food_archive.md |
| P21 | skill_card | 技能卡片 | 以独立卡片展示技能、能力或掌握程度，适合个人简历、团队能力矩阵和技术栈展示 | skill_card.md |
| P22 | troubleshoot | 问题排查 | 展示问题诊断、故障排查步骤或常见问题解决方案 | troubleshoot.md |
| P23 | appendix | 附录页 | 补充参考资料、数据来源、术语表或额外阅读材料 | appendix.md |
| P24 | copyright | 版权页 | 文档结尾的版权声明、法律信息和致谢，与封面形成首尾呼应 | copyright.md |
| P25 | closing | 结尾页 | 演示文稿正式结束页，包含感谢、联系方式与行动号召，与封面形成首尾呼应 | closing.md |
| P26 | summary | 总结页 | 结尾收束，核心要点回顾与行动号召，深色背景与封面形成书挡效应 | summary.md |
| P27 | document | A4文档 | 统一表格布局，段落拼装架构，适配A4打印规格 | document.md |

---

## 文档构建块（8 项，A4 文档页面类型的积木组件）

| 编号 | 块名 | 中文名 | 用途 | 文件 |
|------|------|--------|------|------|
| B01 | header | 页头 | 文档页头区域 | blocks/header.md |
| B02 | title | 标题 | 主标题行，hero 渐变背景 + accent 下划线 | blocks/title.md |
| B03 | info_block | 基本信息块 | 标签-值对 + 图片占位，文档元数据展示 | blocks/info_block.md |
| B04 | table_block | 表格块 | 多列数据网格，含表头和交替行数据 | blocks/table_block.md |
| B05 | text_block | 文字块 | 自由段落文字，用于叙述性内容 | blocks/text_block.md |
| B06 | list_block | 列表块 | 编号或项目符号列表，用于决议、要点、清单 | blocks/list_block.md |
| B07 | closing | 结尾块 | 文档结尾区，感谢语+行动号召+版权 | blocks/closing.md |
| B08 | footer | 页脚 | 文档页脚，版权声明+页码 | blocks/footer.md |

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
| C01 | cover | A4封面 | 794×1123 画布，hero_bg 渐变，禁止卡片容器，白色文字 | col3/cover.md |
| C02 | closing | A4结尾页 | 794×1123 画布，深色背景+白色文字，与封面书挡效应 | col3/closing.md |
