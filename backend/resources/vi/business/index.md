# VI 索引 · Business Professional

> 唯一数据源。AI 生成幻灯片时，通过本索引定位所需类型和规范，不再扫描全部 .md 文件。

---

## 页面类型（26 种，供 AI 选择 page_type）

| 类型名 | 中文名 | 用途 | 文件 |
|--------|--------|------|------|
| cover | 封面 | 开场页，全屏视觉冲击，含主标题+副标题+背景图，建立权威感与专业度 | cover.md |
| toc | 目录 | 内容导航与章节概览，提供全局结构视图 | toc.md |
| section | 章节分隔 | 章节过渡页，深色全屏背景，居中章节标题，用于内容板块之间的视觉分隔 | section.md |
| chapter | 章节页 | 新章节/新部分的起始页，包含章节编号、章节标题和简短概述 | chapter.md |
| content | 内容页 | 通用内容展示，支持多卡片布局和图文混排，信息密度与视觉呼吸感平衡 | content.md |
| data | 数据页 | 数据可视化展示，支持图表和指标卡片，复用内容页框架叠加数据规则 | data.md |
| data_hero | 数据突出 | 以大数字和关键指标为核心的展示页，强调单一数据的视觉冲击力 | data_hero.md |
| technique | 技法页 | 展示单个技法、方法或操作步骤的详细说明，强调步骤顺序与关键要点 | technique.md |
| principle | 原则页 | 展示设计原则、工作理念或核心准则，强调理念陈述与理由支撑 | principle.md |
| process_flow | 流程图 | 展示业务流程、工作流或操作流水线，强调步骤顺序与分支逻辑 | process_flow.md |
| process_timeline | 流程时间线 | 将流程图与时间线结合，展示有时序关系的多阶段流程，适合项目规划和路线图 | process_timeline.md |
| timeline | 时间线 | 展示时间序列事件、里程碑或项目进度，强调时间顺序和节点关系 | timeline.md |
| comparison | 对比页 | 展示多项内容的横向对比，强调差异与优劣判断 | comparison.md |
| duo_compare | 双项对比 | 两套方案、两个选项或两种观点的深度对比，强调差异化与决策引导 | duo_compare.md |
| table | 表格页 | 以结构化表格展示数据、规格或矩阵信息，强调信息的可扫读性和对比性 | table.md |
| grid_cards | 网格卡片 | 以均匀网格排列多张等权重的卡片，适用于团队介绍、产品列表、功能矩阵等场景 | grid_cards.md |
| image_grid | 图片网格 | 以均匀网格排列多张图片，适用于作品集展示、产品图集、团队照片墙和视觉参考板 | image_grid.md |
| quote | 引言页 | 展示名言、引述或关键陈述，注重视觉冲击力和情感共鸣 | quote.md |
| image_hero | 图片突出 | 大面积图片配文字叠加层，适合产品展示、场景呈现或视觉冲击型内容 | image_hero.md |
| food_archive | 美食档案 | 展示单个菜品/食谱的详细信息卡片，包含名称、图片区、特征标签、工艺参数和风味描述 | food_archive.md |
| skill_card | 技能卡片 | 以独立卡片展示技能、能力或掌握程度，适合个人简历、团队能力矩阵和技术栈展示 | skill_card.md |
| troubleshoot | 问题排查 | 展示问题诊断、故障排查步骤或常见问题解决方案 | troubleshoot.md |
| appendix | 附录页 | 补充参考资料、数据来源、术语表或额外阅读材料 | appendix.md |
| copyright | 版权页 | 文档结尾的版权声明、法律信息和致谢，与封面形成首尾呼应 | copyright.md |
| closing | 结尾页 | 演示文稿正式结束页，包含感谢、联系方式与行动号召，与封面形成首尾呼应 | closing.md |
| summary | 总结页 | 结尾收束，核心要点回顾与行动号召，深色背景与封面形成书挡效应 | summary.md |

---

## 设计原则（7 项，AI 生成时必须遵守的抽象规范）

| 原则 | 说明 | 文件 |
|------|------|------|
| principles | VIS 设计的底层指导思想，三大设计支柱 | principles.md |
| consistency | 跨页一致性，全 Deck 统一元素与书挡效应 | consistency.md |
| richness | 视觉丰富度硬指标，每页必须满足的量化标准 | richness.md |
| checklist | 质量自检清单，22 项逐项验证 | checklist.md |
| images | 配图规范，配图/插图的使用时机与 SVG 排版规范 | images.md |
| data_rules | 数据转化规则，将文字数据强制映射为图表形态 | data_rules.md |
| decorations | 装饰系统，5 层结构架构（背景→装饰→结构→内容→标识） | decorations.md |

---

## 设计元素（8 项，AI 生成时引用具体参数值）

| 元素 | 说明 | 文件 |
|------|------|------|
| colors | 色彩系统，12 色令牌、语义映射与使用铁律 | colors.md |
| typography | 排版层级，字体栈、字号体系与行距规范 | typography.md |
| card_styles | 卡片样式 Token，圆角、阴影、边框、渐变与间距 | card_styles.md |
| charts | 图表语言，折线图、面积图、柱状图、环形图、进度条、大数字、趋势线、对比条 | charts.md |
| layouts | 布局库，10 种布局的排列方式与适用场景决策 | layouts.md |
| card_roles | 卡片角色目录，11 种 Role 的视觉特征与字段规范 | card_roles.md |
| chart_decision | 图表选择决策树，根据数据特征选择正确的图表类型 | chart_decision.md |
| icons | 图标规范，SVG 图标风格、尺寸与颜色规则 | icons.md |
