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

