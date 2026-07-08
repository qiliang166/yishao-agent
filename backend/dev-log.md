[2026-07-09] col4 PPT 整页塌空(seq5 只剩页码) — _extract_outermost_div 吃掉兜底模板正文:
现象: col4 生成的 index.html 第5页(通用流程, page_type=table)整页空白只剩页码角标; result.json 里该页 html 其实有 1683 字符兜底正文, 到 index_vars.html 只剩 416 字符。逐页硬比 Kimi 对照 PPTX 发现的第一个硬 bug。
根因(双 bug 叠加, 代码实证): (a)单页富渲染失败落兜底 — _gen_one 并行生成每页, seq5(data_table 重 SVG)两次 attempt 都被截断检查(line 4361 not endswith '>')拦下 → 落 _fallback_single_slide_html(line 3701)。同为 table 的 seq4 富渲染成功(9 SVG)故无恙。(b)兜底正文被组装环节吃掉 — 兜底模板(line 3724)是 <section> 包 3 个兄弟 div(4px色条/正文/页码); 而 _assemble_html_deck 调的 _extract_outermost_div(line 6066)硬假设最外层是 <div>, 抓到第一个 div(4px色条)depth 立即归零就 return, <h1>/正文/<ul> 全丢。
修复(backend/services/ppt_service.py _extract_outermost_div, 单函数根治): 改为 tag-agnostic — 检测 <div> 与 <section> 谁先出现即以谁为外壳 tag, 用该 tag 做 depth 追踪。正常页(外层<div>)路径零变化; 兜底页(外层<section>)不再被吃正文。
验证: py_compile pass; 4 项隔离单测通过 — (1)兜底<section>保留 heading+body+key_points (2)正常<div>输入输出完全一致 (3)跨页泄漏防护仍生效(div后接垃圾被截断) (4)未闭合<section>自动补闭合。
遗留(未在本次修): seq5 富渲染为何两次截断(data_table token 过重)属生成鲁棒性问题; col4 页数/页型被大纲提示词锁死(line 1304/1322 禁止拆分页面/改 page_type)导致「道」4主题压1页、27种富页型闲置 — 属设计缺陷主因, 需与用户对齐产品方向后再动。

[2026-07-09] SPA 深层路由刷新 404 — 后端加 index.html 回退:
现象: 用户在项目页(/project/xxx)或设置页(/workspace/xxx/settings)按 F5 刷新, 返回 {"detail":"Not Found"}; 只有根路径 / 能刷新。
根因: backend/app.py 末尾 app.mount("/", StaticFiles(html=True)) 只对根路径伺服 index.html, React-Router 的客户端路由(如 /project/xxx)在后端既无对应路由也无同名文件 → StaticFiles 抛 404, 刷新即失败。日志早有 GET /workspace/.../settings 404 佐证。
修复(backend/app.py, 仅此一文件): 新增 SPAStaticFiles(StaticFiles) 子类覆写 get_response — 捕获 StarletteHTTPException(注意: Starlette 0.41.3 StaticFiles 是 raise 404 而非 return, 且 FastAPI 的 HTTPException 是子类不能反捕父类, 故 import starlette.exceptions.HTTPException as StarletteHTTPException 精确捕获); 404 且非 /api/ 前缀 → 回退伺服 index.html, 否则 re-raise。守卫用 scope["path"](原始 ASGI 路径, 恒正斜杠)而非 path 参数(StaticFiles 经 os.path.normpath 在 Windows 变反斜杠导致 startswith('api/') 漏判 → 未知 /api/* 曾被 SPA 吞成 200)。
验证: py_compile pass; 重启后端 6 条路由实测 — / 200 / /project/xxx 200 / /workspace/xxx/settings 200 / /assets/*.js 200 / /api/nonexistent 404(未知API仍正确404) / /api/health 200; 全部符合预期。

[2026-07-09] 修复第2步"分析文档"生成忽略用户配置的角色提示词+SKILL — 竞态+硬编码id双根因:
现象: 用户在工作区把"道与术文案(dao)"的提示词+SKILL改为7章模板并保存, 但生成的文档仍是旧格式(emoji随笔), 完全没走配置的SKILL; 直接导致下游col4 PPT第7/9页无料可提。
根因(DB+时间戳+代码链路证实, 非推测): (a)配置17:14:21已保存(prompt872字/skill2146字), 文档17:15:41生成(晚80秒)却没用上 → 排除"旧文档", 是加载bug。(b)ProjectPage.tsx "Load project" useEffect三个Promise并行无序: getProject设workspaceIdRef, listProjectItems回调里读workspaceIdRef.current; 当listProjectItems先完成时ref仍undefined → listColumnConfigs(undefined)返回seed行(id=seed-c2-dao)。(c)applyCol12Configs用硬编码 c.id==='c2-dao' 匹配 → seed行id失配 → s2p空 → setStage2Prompts被跳过 → stage2Prompts.dao=undefined。(d)TeachingDocPanel静默兜底 prompt||DEFAULT_PROMPTS[dao]('请分析原理与方法'), skill空则不带SKILL → emoji随笔。额外: 非"一勺笔录"工作区col2行id是随机uuid, 硬编码匹配对所有其他工作区都失配。
修复(frontend/src/pages/ProjectPage.tsx, 前端根治两层): (1)消竞态 — loadColConfigs(p.workspace_id)移入getProject().then(), 用已确定的workspace_id直传, 不再依赖竞态ref。(2)稳定匹配 — applyCol12Configs改按label为主(COL1/COL2_BY_LABEL, 跨seed/字面/uuid工作区一致)+ sort_order兜底(COL2_BY_SORT: 3=sop/4=dao/5=yanxi), 替代硬编码字面id; col1同理。(3)防静默 — 加载后dao.skill仍空则console.warn(含workspace_id与拿到的行id列表)。col3/4/5/speech/tts同类硬编码本轮不动(走project_items分支且当前正常, 避免扩大blast radius)。
收尾: 用户需在分析文档面板重新点一次生成 → 得到7章文档 → 再跑col4大纲第7/9页就有料。
验证: 自审diff通过; tsc+vite build pass; DB核实label映射(道与术文案→dao在seed/字面/uuid三类工作区均一致); 竞态修复使workspace_id必先于配置加载确定。


(1) 守卫修改 (line 3640): PPT 结构页面先检查 VI 是否有 ## HTML 模板，有则走 LLM 模板填充（同 col3），无则回退代码填充（向后兼容）
(2) Bug 修复: rich/cover.html 添加 opacity:{{IMAGE_OPACITY}}；图片 div 删除正则匹配模板实际文本；META_INFO 回退到 key_points[0]；BRAND 不再取 notes 字段
(3) LLM 路径后处理: 添加 {{IMAGE_OPACITY}} 替换（之前仅 _fill_slide_template 处理）
(4) 效果: business 风格封面使用 vi/business/cover.md，VI 编辑器修改立即生效；tech 等无模板风格保持代码回退
验证: tsc pass, vite build pass, 回归 GET 端点全部 200, _fill_slide_template 4 项单元测试通过, 守卫逻辑分支验证通过

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


[2026-07-08] col4 编辑器切换页面类型 layout_hint 残留 — 根治:
(1) 问题：在 Col45StructureEditor 里切换某页 page_type 后，layout_hint 残留旧类型布局（如 chart→table 仍是 dashboard、closing→table 仍是 single_focus），生成时布局错乱。
(2) 根因：setPageType 调 emptyPage(type, p.layout_hint) 把旧布局当默认传入；emptyPage 末尾 else 分支（table/troubleshoot/comparison 等）无布局覆盖，直接沿用旧值；后端 resolve_layout 中 user_layout 优先级最高，残留值直接生效。
(3) 修复（仅 frontend/src/components/Col45StructureEditor.tsx 一个文件）：
    - 新增 TYPE_DEFAULT_LAYOUT 映射，与后端 PAGE_TYPE_LAYOUT_MAP 同源（table/troubleshoot→data_table、technique→vertical_steps、principle→two_column_asymmetric 等）
    - emptyPage 默认布局改用该映射：lh = layout || TYPE_DEFAULT_LAYOUT[type] || 'hero_grid'，删除散落在 if 分支的硬编码 layout_hint
    - setPageType 去掉 p.layout_hint 继承，切类型用新类型标准布局（heading 保留）
(4) 验证：tsc + vite build pass（TYPE_DEFAULT_LAYOUT: Record<PageType,LayoutHint> 全类型穷举，漏类型即编译报错）；脚本比对前后端映射零内容类型 mismatch；两个实测用例（chart→table→data_table、closing→table→data_table）逻辑追踪通过。

[2026-07-09] col4 目录页章节标题被 LLM 改写 — 根治:
(1) 问题：生成大纲后，toc 目录页章节名从编辑器定义的"道·烹饪理念与原理"被改成 example 内容"润之道/形之道…"，且丢失 example 字段。
(2) 根因：Stage1 大纲提示词铁律要求"替换模板标签为SOP实际值、禁止保留模板标签原文"，此规则对 key_points 正确，但对 toc.chapters 错误——章节名是编辑器固定结构不应被 LLM 改。而修复函数 _fix_stage1_table_keypoints 只还原 table 页 key_points/examples，未还原 toc chapters，被改坏的值存活。
(3) 修复（backend/services/ppt_service.py _fix_stage1_table_keypoints）：toc 页从模板收集 chapters 加入 tmpl_map；应用时强制覆盖 s["chapters"]（非 fallback，因 LLM 总会产出被改写的 chapters，not s.get() 守卫救不了）。与 table 页 key_points 还原同一机制。
(4) 验证：抽取函数隔离单测通过（被改坏的 toc → 还原为编辑器正确章节名 + example 恢复）；py_compile 语法通过；确认调用点 line 940/1042 在大纲主链路且 skill_template 在作用域内。
