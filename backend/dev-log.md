[2026-07-09] col4 确定性渲染 — 按数据形态选布局(消除"3张表长得一样"的单调):
背景: 用户反馈"KIMI 布局类型更多更丰富, 你的很单调……即便丰满也不好看, 只是拉伸了而已"。定路线=扩充确定性渲染器(AskUserQuestion), 权衡=丰富与稳定都要尽量平衡。
证据(真11页大纲 last_outline_response 逐页数据形态分析, 非推测): seq4 表 row0=`发花胶→…→装盘`(7步→序列), seq5 表 row0=`干货涨发→…→终味融合`(5步→序列), seq7 表 row0=`鹅掌 / 猪蹄 / 牛筋`(3命名实体, 无→)。三页同为 table 却语义不同(4/5 是流程, 7 是对照), 旧渲染全走同一"列卡"→ 视觉三胞胎, 正是"单调"根因。
方案(结构性, 同 page_type 按数据特征自动选骨架): backend/services/content_render.py 新增 _render_timeline(横向流程时间轴: 连接线+编号圆节点+步骤标题带+各步属性卡, 属性来自对齐的后续行); _render_table 加数据形态分支——row0 含→且步数>=3且与列数一致且<=8 → 走 timeline, 否则维持列卡(命名实体对照)/不规则兜底行。判据是数据自身特征(→序列 vs 命名实体), 非硬编码页码。
验证: ast 语法 pass; 真大纲跑测——seq4/5 判为 timeline(10967/10062 字符)、seq7 判为列卡(8421), 分支确证; 结构核对 seq5=5节点+15属性点(3属性行×5步)全来自真数据零编造; 边界: 2步→仍列卡(guard>=3)、3步→转 timeline、属性行错位不崩、slash 实体不误判为 timeline; 全内容页回归渲染+720框 pass, 空 kp/未知类型正确 None; 生产色彩链路预览(_build_root_vars + _resolve_color_vars(css_vars=True))→ data/debug/timeline_preview.html 零 hex leak。现内容 deck 7 页 6 种布局家族(principle 深色嵌卡/timeline×2/technique 竖步卡/列卡对照/troubleshoot 三列阵/grid_cards 深色大卡)。_proof_render.py 是独立陈旧脚本(写另一目录), 不在生产链路, 未改。

[2026-07-09] col4 内容页确定性渲染 — 第三条生成路径(消除 LLM 崩页/塌空/丢数据):
背景: col4 分析PPT 的内容页(principle/table/technique/troubleshoot/grid_cards)走 LLM 自由生成, 不稳定——崩页、塌空、平铺糊页、丢数据(见前几条 seq5 塌空系列)。用户核心判断: VI 素材丰富却产出差=设计缺陷, 要 Kimi 级质量且颜色必须走13色变量系统(严禁硬编码 hex, 换色只改13个值)。
方案(结构性, 非补丁, 隔离新增): 在既有两条路径(结构页 code-fill / LLM 自由生成)之外新增第三条"确定性内容页渲染":
(1) 新模块 backend/services/content_render.py(全新文件, 零风险触碰7551行引擎): 5个 page_type 的机械渲染器, 纯 Python 零 LLM——永不崩、永不丢数据。学 Kimi 手法(全宽深色页眉条/副标题金线条/米色卡内嵌深色多字段块/藏蓝红双色对照/accent 铜条/色条轮换), 但全部输出 {{primary}}/{{chart_N}}/{{semantic_negative}} 占位符, 由 _resolve_color_vars(css_vars=True) 解析 → 与结构页 code-fill 同一 html_vars 契约, 换色只改13值即可。
(2) 铁律 1:1 零构造: 只读大纲已有字段(heading/subtitle/lead/key_points/description), 缺字段就省略该元素(如无 subtitle 则不画副标题条), 绝不注入 section/summary 页、绝不编造表头/统计数字/文案。—— 修正了 _proof_render 里 abalone 专属的构造(注入章节页/summary、硬编码表头与"温控跨度"等), 那些在生产渲染器里全部移除。
(3) 门控钩子(backend/services/ppt_service.py _gen_one, 结构页短路之后): `if column_id=="col4" and not is_a4 and active_scheme:` 调 render_content_slide, 命中则返回 {html, html_vars}, 返回 None(不支持类型/空数据/异常)则 fall through 到原 LLM 路径。col5 及其他路径零改动, safe by construction。
验证: py_compile 双文件 pass; import services.ppt_service pass(服务器加载无误); 真11页大纲(last_outline_response)跑测——7内容页(principle/table×3/technique/troubleshoot/grid_cards)确定性覆盖、4结构页(cover/toc/copyright/closing)正确 fall through; 解析后 HTML 零非白 hex leak(全走13变量); seq7 主料调整6项真数据(鹅掌/猪蹄/牛筋/柱侯酱/高压锅28min/宴席气派)完整无编造、无 proof-era 构造串泄漏; 门控确证仅 col4(col5 未动); 预览 HTTP 200。待用户重生成 col4 端到端确认质量, 及决定是否微调深海蓝色值贴近 Kimi 暖调(仅改 tokens.yaml 的13值)。

[2026-07-09] col4 seq5 落空兜底真根因(日志实证) + best_soft 安全网:
现象追查: 上一条修了"兜底正文被吃",但 seq5 为何一开始就落兜底?查 backend_startup.log 实证(非推测): attempt1(line154) 页面正常渲染完(hex-fix/white-fix 都跑在真内容上), 却被 _detect_fullscreen_mask 判为"全屏遮罩(bg=#ffffff)"否决 → 追加纠正消息重试; attempt2(line215) LLM 面对纠正反馈返回 0 字符("HTML too short") → 两次耗尽落兜底。即: 一个渲染良好的页被软性质量启发式(mask 误判 data_table 的全幅背景板)废弃, 重试又产出空 → 整页丢失。这是 token 截断以外的真因, 我之前"data_table token 过重"的猜测是错的。
根因定性: _gen_one 重试循环里, 软性检查(container/overflow/mask 三项 retry_msg)命中就 continue 丢弃当前 html; 若下次 attempt 返回垃圾(0字符/截断/失衡), 之前那份"仅软性瑕疵、结构完整"的好渲染被白白扔掉 → 落空白兜底。
修复(backend/services/ppt_service.py _gen_one, 结构性): 新增 best_soft 记忆——软性检查命中且 attempt<1 时, 把当前"已过截断/div/svg 平衡校验"的完整 html 存入 best_soft 再 continue; 所有 attempt 耗尽时优先返回 best_soft(而非空白兜底模板)。软性瑕疵(装饰性 mask/局部溢出)的完整页 >> 空白兜底页。mask 启发式本身不动(收紧灵敏度有放行真遮罩的风险, 且 best_soft 已消除空白页后果)。
验证: py_compile pass; 重启后端 health 200; 逻辑: 软性拒绝页现在保底为"有正文的完整渲染", 叠加上一条 _extract_outermost_div 修复, seq5 双重保险不再塌空。待用户重生成 col4 端到端确认。

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

[2026-07-09] col4 principle 页真实框架落地 — 删手写框架, 接入 PPT 提取的真几何:
(1) 背景: 用户反复指出 principle.md 里的 B7/B4 框架是我"照坐标手写HTML"(flex均分+正解/误区+chart-N循环色), 一眼假, 非其PPT真实结构。要求: 从真实PPT提取框架→写进VI→从VI渲染, 配色映射13色变量, 真几何+新内容, 先做page7验证。
(2) 真实page7结构(从pptx提取, 非编): 4竖排色块panel(色=primary/secondary/secondary/accent; 前三栏W21.25末栏W17.81; T10 H47.22)每栏叠 item_index(fs28)+item_title(fs18)+caption(fs13)+body_text(fs13,H30); 底部card_bg对比带(T59.72 H27.78)=lead_text(fs16)+左正解(铜)+竖线divider+右反例(暗红); 页头深条+标题+页码+脚注。共29容器。
(3) 实现(零手写坐标):
    - backend/data/debug/emit_page7_template.py: 复用 frame_renderer.render_frame 按 frameset_abalone.json 真几何"吐出"带{{占位符}}的HTML(坐标全来自JSON, 我不打一个)。
    - backend/resources/vi/business/principle.md: 删除2个手写框架, 写入吐出的真实page7模板(cap:2-4), 占位符改 kp0..3_index/title/caption/body + BAND_LEAD/POS/NEG + FOOTNOTE。
    - backend/services/ppt_service.py _fill_slide_template(line~6567): KEY_POINTS循环后追加索引式解析(纯加法, 不动老逻辑)——kpI_*从key_points(复用_kp_fields), 超量索引正则清空; 对比带用key_points聚合成正解列/反例列(避免把长body塞小框逼到9px)。
(4) 验证: emit自检4×4+带+页头脚占位符全present; 端到端 verify_synth_page7.py 走生产管线(_select_framework_template→_fill_slide_template→_resolve_color_vars)+_fit_code_filled_slides → spill=0 clip=0 残留=0 非白硬编码hex=0; 几何逐一比对原PPT vs 合成=29容器0 mismatch(byte-identical); rebuild_deck重建 index.html principle页 flex:1 1 0(手写标志)=0, 含4竖栏真坐标+对比带; 全deck仅未触碰的封面/版权/closing有历史spill(非本次回归, isolation保持原样)。
(5) 暂不做: 其余15页提取+各VI section; 其他VI风格。

[2026-07-09] col4/col5 合成PPT 接入真实框架库 — 大模型从16个PPT提取框架选框架+填槽(网站按钮生效):
(1) 背景: 之前的框架库(16框架选+填)只活在 data/debug 测试脚本, 没接进网站"合成PPT"按钮 → 用户点生成仍是手写假页型(process_flow/technique/food_archive/skill_card/troubleshoot/summary), "一次一次做的都不是我要的"。用户明确: 用这16个框架让大模型根据内容选框架合成PPT。
(2) 落地(生产管线):
    - backend/resources/framesets/business.json: 从 frameset_abalone.json 拷入生产资源目录(16框架, canvas 1280×720, 每容器z/L/T/W/H/字号/fill_var/text_var/line_var, 配色全 var(--x))。
    - backend/services/frameset_service.py: 自包含生产模块(不依赖data/debug)。load_frameset(style)/frame_catalog(fs)/catalog_prompt(cat)/render_with_content(fs,fid,slots)/render_frame。几何100%来自JSON, 代码零手写坐标。
    - backend/services/ppt_service.py _stage2_html_per_slide: 循环外一次性 load_frameset+catalog_prompt(不逐页重建); _gen_one 新增"框架库分支"作为横板(非A4)首选路径——大模型 _frameset_pick_and_fill(选frame_id+按≤N字填槽, 3次重试), render_with_content 渲染, _resolve_color_vars 上色, 标 _code_filled 交给 fit-to-box 兜底。任何失败 falls through 到原结构页/col4/LLM分支(纯加法, 不破坏老路径)。
    - 大纲阶段产出的假页型 stype 不再决定版面: 框架库分支先跑, 大模型把每页内容映射到真实frame_id。
(3) 验证(走生产同一函数, 非平行脚本): backend/data/debug/verify_frameset_button.py 直接调用 _stage2_html_per_slide(与按钮同函数)对鲍鱼col5真实16页 → 16/16页全用真实框架(cover_p01/toc_p02/content_p04/p11/p14/p15/grid_or_fourcol_p06/p07/closing_p16); Playwright 1280×720 逐页实测: max_clip=0 max_spill=0 残留{{}}=0 非白硬编码hex=0 → PASS。("Event loop is closed" 为 Windows httpx 清理噪声, _safe_run_async 已注明无害)。
(4) 生效: 旧后端(PID16680, 启动早于本次改动, 无--reload)持旧代码内存 → 停止并以相同方式(backend/ venv python app.py)重启(PID23728, port8766, /及/api/settings HTTP200), 更新 backend.pid。现在点"合成PPT"即走真实框架库。
(5) 暂不做: 大纲提示词(database.py col4/col5)仍产假页型字段, 但已不影响版面(框架库分支绕过); 后续可清理; 其他VI风格(tech/creative…)复用同机制只需各自 framesets/{style}.json。
