[2026-07-10 05:40:00] col4/col5 封面副标题稳定化 + 新增概要（四层定义对齐）:
需求：用户反映封面副标题不稳定（有时整句、有时空），且缺一句话概要。用户诊断根因为「定义层缺失」——字数/形态未定义。选「从定义层理清」，范围「项目+种子都改」，BRAND 暂不动。
病根：四层定义互相矛盾。大纲提示词要求 subtitle+description，但 SKILL 封面 example 未含这两字段，且提示词硬规「禁止自行添加模板中没有的字段」→ LLM 输出不稳定；填充代码 {{SUBTITLE}} 回落到 body 首句 → 长正文塞进副标题。
改动（四层对齐，改 3 文件 + DB 3 行）：
(1) SKILL example（DB 3 行：项目 pi-fcf32913a82b-col4 / 鲍鱼种子 col4/d970b2ea904c / 全局种子 col4/NULL）封面新增 subtitle+summary 字段与字段说明（2434→2561 字符）
(2) 大纲提示词 else 分支（col4/col5，ppt_service.py:1310-1311）：subtitle 改「2-3特征词≤20字不可整句」+ 新增 summary「≤150字一句话概要」；is_a4 分支（col3）不动
(3) _fill_slide_template（ppt_service.py:6024-6047）：{{SUBTITLE}} 只取 slide.subtitle 或 lead（删 body 首句回落）；新增 summary 变量与 {{SUMMARY}} 替换；SUMMARY_TITLE 去重
(4) business/cover.md：副标题下新增概要 <p>{{SUMMARY}}</p>，更新占位符表 SUBTITLE(≤20字)/SUMMARY(≤150字) 与「必须遵守」字数建议
影响范围（Rule 1/6 已查证）：全部 plain {{SUBTITLE}} 仅出现于 cover 模板，各栏 cover 大纲分支均硬性要求 subtitle 显式字段 → 删 body 回落零风险；section/summary/closing/toc 只用 {{CHAPTER_SUBTITLE}}（源 lead，未动）。
回归验证：col4/col5 填充 subtitle+summary 干净、无 {{IMAGE_URL}}/<img/残留；col3（business/col3/cover.md）无 SUMMARY 占位符=安全空操作，subtitle 正常，{{INFO_TABLE}} 由上游 _build_cover_info_table（ppt_service.py:3811）填充未受影响；ast.parse 通过。
注意：SKILL 改动写在 yishao.db（.gitignore 排除）→ 磁盘持久但不入 git；代码/模板改动入 git。

[2026-07-10 00:40:00] 删除 col4/col5 横版封面背景图（{{IMAGE_URL}}）:
需求：用户要求封面不再使用背景图（col4+col5 一起改，col3 不动）。
病根：封面背景图不由大纲 JSON 决定（seq1 images=null）。触发条件唯一 = 封面 HTML 出现 {{IMAGE_URL}}（ppt_service.py:5506），该占位符来自封面模板 business/cover.md 第0层 <img src="{{IMAGE_URL}}">。封面走 STRUCTURAL_PAGE_TYPES 代码填充照抄整个模板 → _generate_and_replace_images 检测到占位符即生成并注入图片。
改动（仅 1 文件 backend/resources/vi/business/cover.md，删 3 处）：
(1) 删第0层图片层（第8-11行 <img src="{{IMAGE_URL}}"> 整段）
(2) 删占位符表中 {{IMAGE_URL}} 行
(3) 删「必须遵守」中 {{IMAGE_URL}} 条目
不改任何 Python 逻辑。模板实时读盘（_load_style_vi_section 无缓存），无需重启后端。
影响范围：col4/col5 共用 business/cover.md → 两者封面均去背景图；col3 用独立 business/col3/cover.md（含 {{INFO_TABLE}}，本就无图）→ 零回归。
验证：col4/col5 模板 IMAGE_URL=0、<img=0；生产函数 _fill_slide_template 生成封面 HTML 无 {{IMAGE_URL}}/<img/残留占位符，标题正常；col3 模板 {{INFO_TABLE}} 保留、长度 4163 不变。git diff 仅 cover.md 删 3 处。封面保留全屏渐变+装饰+标题，full_bleed 版式不变（layout_hint 与背景图无关）。

[2026-07-09 23:32:00] 数据库整库还原到 07-08 备份（配合代码回退 ab8c951）:
背景：代码已切回 ab8c951（col4 视觉编辑器之前），但 col4 大纲仍是 07-08 视觉编辑器保存的 11 页 JSON——因 yishao.db 被 .gitignore 排除，git 回退不动数据库。
操作（纯数据，无代码 commit）：
(1) 安全网：先备份当前库 → data/backups/yishao-PRE-RESTORE-20260709_233139.db（integrity ok，含本次 col3 id=241/155KB、col5 id=244/280KB 成品，可随时捞回）
(2) 停后端释放文件锁（旧 PID 25508 → taskkill），无 WAL/journal 残留
(3) cp data/backups/yishao-2026-07-08.db data/yishao.db（整体覆盖，integrity ok）
(4) 重启后端 PID=19948，更新 backend.pid；/api/health、/api/projects 均 200
验证：col4 skill = 旧 markdown「道与术解析·四章16-18页」2434字（非11页JSON）；col5 = 「研学手册·八章」；API 端到端确认。
已知代价（用户二次确认接受）：07-08 18:00~07-09 15:16 鲍鱼项目 15 行 step_results（含本次 col3/col5 成品）+ col2 prompt/skill 回退到 07-08。全部可从 PRE-RESTORE 备份恢复。
对比过整库差异：23 表行数完全一致（无增删行），仅 20 个 cell 内容不同。

[2026-07-03 21:30:00] Image generation pipeline + template mode color fix:
(1) _generate_and_replace_images() — scans slide HTML for {{image:PROMPT,SIZE}} and {{IMAGE_URL}} placeholders, calls image_service.generate_image(), downloads to html_dir/images/, replaces with <img> tag
(2) Wired into generate_ppt() after HTML gen, before deck assembly (is_portrait guard)
(3) Cover template: added optional {{IMAGE_URL}} background image layer, AI forbidden from modifying
(4) Template mode system prompt: added explicit overrides for format-spec.md color rules — forbids converting rgba(255,255,255,N) to rgba(var(--text-rgb),N) on dark bg pages (was causing invisible text on cover)
(5) Image gen failures are non-critical: placeholder replaced with empty string
Backend syntax: pass. GitHub push: pending (network unreachable).

[2026-07-03 21:00:00] PPT VI 模板 HTML 代码块改造 — AI 与颜色完全分离:
(1) 5 个 business 样式核心页面类型改为 HTML 模板 + 填空模式：cover/section/summary/content/data
(2) 所有颜色使用 var(--xxx) CSS 变量（var(--primary)/var(--accent)/var(--chart-0) 等），内容用 {{PLACEHOLDER}} 占位符
(3) AI 只替换占位符文字，不参与颜色决策 — 模板已锁定所有颜色/布局/尺寸
(4) 验证：5 个模板 0 非法 hex 值（仅 cover/section/summary 含 1 个合法的 #ffffff 白色文字）
(5) build_slide_prompt() 新增 template_mode 参数 — 仅加载 identity + format-spec + 模板指令（~4K chars vs 正常 ~16K chars）
(6) _gen_one() 检测 ## HTML 模板 头 → 提取 HTML 代码块放入 user message → 跳过 vi_append/slide_color_rules
(7) A4/portrait 路径完全不受影响（is_a4 守卫），旧 VI 样式（tech/notion 等）继续使用 markdown 规则模式
(8) 后处理安全网保留：_enforce_slide_rules + _auto_fix_hardcoded_hex + _resolve_color_vars 继续运行
Backend syntax: pass. 5 templates verified: pass.

[2026-07-03 19:00:00] Table formatting cleanup across all manual sections:
- Ch8b: Merged 7-column table into 5 columns (dropped redundant "区域" and "子配置数量" columns); dropped "序号" from always/by_type/by_feature tables
- Ch9: 13色 table reduced from 5 to 3 columns (dropped "分类" and "序号"); 三层分工 table reduced from 5 to 4 columns (dropped "存放位置")
- Ch2: Dropped narrow "#" column from project cards table (merged into element names)
- Ch7: Dropped narrow "#" column from file rows table
- Removed stale _ch3_content.md (combined duplicate)
- Build: pass.

[2026-07-03 18:30:00] Operations manual comprehensive restructuring:
- Ch8.2 (proj-settings) and Ch9 (templates) rewritten with explicit 五要素 labels (是什么/在哪里/怎么用/注意什么/关联什么) per functional area, matching Ch1 format
- Ch8.1 (settings) restructured from 8.1.1-8.1.7 numbering to flat 五要素 sections (品牌信息/文件保存路径/安全设置/许可证管理/关于信息/网站风格/操作说明编辑)
- Added 「⚡ 生成所有文案」cross-reference to Ch4.1 and Ch4.2
- Added 项目保存路径 section to Ch3.1 (shared feature across Stage 1 sub-tabs)
- Removed stale _ch3_content.md (combined duplicate of individual files)
- All 18 sections verified: format consistent, 五要素 labels explicit, admin/front split verified
- TypeScript: pass. Build: pass.

[2026-07-02 00:36:03] Stage3 fixes: (1) Content-Disposition fix — HTML files inline instead of attachment (2) Dynamic styleId in SlideEditModal — replaces hardcoded 'business' (3) Added style_id/color_scheme/template_id to SVG generate response (4) Frontend plan type expanded, 3-column prop chain complete. Build: pass. Backend syntax: pass. Regression risk: low (all additions are optional with defaults).

[2026-07-02 18:30:00] License activation system — major upgrade:
(1) Keygen GUI (license_gen_gui.py): Added license_key column to tree view, phone column, phone search/filter, "copy selected" button, "view notes" popup, "edit phone" dialog, token show/hide toggle, all columns center-aligned, revoked keys auto-sort to bottom.
(2) Activation server (activation_server.py): Added notes field migration + set-notes endpoint, added phone field migration + set-phone endpoint, phone included in admin keys list response. Deployed to /home/activation_server/ on 120.25.251.172:18777.
(3) Frontend SettingsPage: License section now displays full activation code (license_key) when activated.
(4) Backend license_service.py: get_license_status() now returns license_key in response.
(5) build_keygen.spec: Standalone PyInstaller spec for keygen EXE (no crypto needed, urllib only).
Build: pass (both keygen EXE and frontend). Server API: verified (health, set-notes, set-phone all responding).

[2026-07-02] ProjSettingsPage: Renamed "种子数据" tab to "默认配置" with two sub-tabs — "栏目配置" (column_configs where workspace_id IS NULL) and "核心配置" (core_prompt_configs where workspace_id IS NULL). Sidebar now conditionally shows "项目配置" (inside workspace) or "全局配置" (outside workspace). TypeScript: pass. Build: pass.

[2026-07-02] WorkspaceSettingsPage & ProjSettingsPage core config: Added pagination (30/page), card-style items (border+borderRadius+gap:4), summary boxes on both column and core tabs. Removed accordion wrapper from core config. Fixed flexShrink:0 to prevent item compression. Fixed .workspace-content overflow-y:auto to allow page scroll. Added col7 descriptive subtitle to WorkspaceSettingsPage for consistency. Removed unused coreOpen state. TypeScript: pass. Build: pass.

[2026-07-03] 操作说明书系统（上下文关联帮助）:
(1) 新增 HelpButton 组件 — 各功能区标题栏 `?` 按钮，点击拉取对应 section 的 markdown 说明
(2) 新增 HelpDrawer 组件 — 右侧滑出面板，marked 渲染 markdown，Escape/点击遮罩关闭
(3) 新增 ManualPage (`/manual`) — 侧边栏「📖 操作说明」入口，左侧目录+右侧全文，下载自包含 HTML 文件，打印按钮
(4) SettingsPage 新增「操作说明」tab — 左侧功能区列表+右侧编辑/预览分屏，保存到 settings.help_manual
(5) HelpButton 已添加到 16 个功能区 (ProjectPage 5 stages × 9 subs + HomePage/ProjectDashboard/ProjSettingsPage/TemplateManager/SettingsPage)
(6) 数据存储：settings 表 help_manual key，JSON 格式 sections 数组
TypeScript: pass. Build: pass. API: 无后端改动。

[2026-07-03] 操作说明书内容编写 — 全部18节完成:
(1) 前台操作说明（使用者）7章15节：Ch1 产品概述与工作区管理(home) / Ch2 项目明细管理(dashboard) / Ch3 素材输入(stage-1a/b/c) / Ch4 文档生成(stage-2a/b/c) / Ch5 课件输出(stage-3a/b/c) / Ch6 演讲课件(stage-4a/b) / Ch7 输出管理(stage-5)
(2) 后台管理说明（管理员）2章3节：Ch8.1 全局设置(settings) / Ch8.2 全局配置(proj-settings) / Ch9 模板管理(templates)
(3) 附录(appendix) — 常见问题与故障排除，按功能区域分类
(4) 每节严格遵循五要素法：功能概述/界面布局/操作步骤/参数说明/提示与注意事项/上下游功能
(5) 编写方式：逐节深度分析前端代码（控件/按钮/处理函数/状态变量），确保说明与实际 UI 完全一致
(6) ManualPage/SettingsPage 新增 appendix 到 LOCATION_ORDER 列表
(7) 数据存储：help_manual_sections 表，18个 location，更新通过 update_manual.py 脚本
(8) TypeScript: pass. Build: pass (59 modules, 643KB JS, 19.7KB CSS).

