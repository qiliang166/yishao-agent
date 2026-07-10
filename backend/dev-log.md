[2026-07-11 02:30:00] hex 正则无词边界破坏 SVG id 引用整类缺陷根治(黑圆圈根因,非提示词问题):
背景:用户从最新 col4 成品(分析PPT,22页)实测第10/16页出现大黑圆圈、col5 第2/3/4页同样黑点,位置逐次漂移。逐层取证钉死根因(非推测):第10页黑圆的 fill 在成品 index.html 是 fill="url(var(--semantic-positive)orGrad1)"(非法值→浏览器渲染黑),变量版 index_vars.html 是 url({{semantic_positive}}orGrad1),而 LLM 原始单页 slides/slide_10.html 里定义与引用都正确:<radialGradient id="decorGrad1"> + fill="url(#decorGrad1)"。破坏发生在 _auto_fix_hardcoded_hex(1733)的 hex 扫描:正则 #[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})? 无词边界,把 url(#decorGrad1) 里的 #dec(d/e/c 皆合法十六进制)当成 3 位色值 #ddeecc→语义匹配 semantic_positive→替换 #dec 为 {{semantic_positive}},残留 orGrad1→渐变引用被拦腰截断。#glow1 因 g/l/o 非 hex 字符幸存。所以"哪页中招"随 LLM 即兴给渐变命名漂移(dec/dee 开头就爆),bug 本身固定。
缺陷类普查(characterize-defect-class):不止渐变——凡"# 开头且标识符前 3 字符全是十六进制"的引用都会中招:url(#gradient/filter/mask/clipPath)、xlink:href=#symbol、href=#anchor 共 6 类。当前成品 16 种 id 里恰只 decorGrad1/decorGrad2/deco-glow 命中(全是渐变、全在报错页),cardShadow/shadow-md/glow1/steam-mask 等 13 种因前缀含非 hex 字符幸存——是运气非安全,LLM 未来命名 fadeShadow/defMask/beeIcon 会静默破坏且症状更隐蔽。故根治正则而非给 id 改名。
根因二处(引用排查 Rule1 后确认,单修一处不够):(A)检测正则 1897 无边界把 #dec 捞进候选;(B)替换 sub 1978-1980 hex_pattern='(?i)'+hex_original 无边界——若某页真有独立 #dec 进 replacement_map,该 sub 会连带把同页 #decorGrad1 的 #dec 一起替换(已复现:OLD 破坏=True)。
改动(ppt_service.py,仅两行):(A)1897 → _HEX_RE=r'#[0-9a-fA-F]{6}(?![0-9a-zA-Z_-])|#[0-9a-fA-F]{3}(?![0-9a-zA-Z_-])'(6位贪婪优先防 #1a365dff 被切,后向否定断言拒绝"hex 后紧跟标识符字符");(B)1978 → hex_pattern='(?i)'+_re_hex.escape(hex_original)+r'(?![0-9a-zA-Z_-])'(同边界+escape 防御)。
验证:(1)18/18 边界用例(真颜色 #fff/#1a365d/#abc/独立#dec"/#dec;/#dec空格 全捕获;id decorGrad1/deco-glow/deadbeef/facePattern/abcThing 全 None;#1a365dff 不被切成 #1a365d;#ffffff 仍匹配由既有 discard 排除)。(2)导入真实补丁函数 _auto_fix_hardcoded_hex 跑重构 bug 输入(含 6 类 id 引用+真颜色):全部 url/href/xlink 引用保留完好、渐变定义 id 保留、真颜色正确→占位符。(3)真实黑点页重放:fill="url(#decorGrad1)"/url(#deco-glow) 修复后无 {{}} 破坏、id 保留、#1a365d→{{primary}}。(4)ast.parse 通过;后端重启 HTTP 200。
决策(llm-code-separation):黑圆圈非提示词导致——LLM 写 id="decorGrad1" 完全合法;是代码正则缺边界。根治在代码层一次性令 6 类引用免疫,不靠改 svg id 命名规避。

[2026-07-11 01:55:00] col4 视觉缺陷四类根因结构性修复(容器级缩字 + 横版滚动条 + 标题压线 + hero 留白):
背景:用户实测 col4 成品报第3页滚动条/第8/10页文字裁切/第20页版权压金条/第4/6/7页大留白。上轮"0裁切"验证是假阳性(验证脚本与被修脚本共用有缺陷的叶子判据),Playwright 全量测量钉死 4 类根因。
RC1(核心,_TEXT_FIT_SCRIPT):(a)clipBoxes 加容器级自裁检测——overflow(-y):hidden 且 scrollHeight-clientHeight>1 且 leaves(el).length,并排除 1280×720 根画布(其溢出属上游 _detect_content_overflow 内容预算,暴力缩整页是破坏性回归);(b)shrink 与 leaves 原用 !e.children.length 判叶子,漏掉"直接文字+<br/>/<span>混合子元素"的 div(如 火枪取肉<br/>盐腌<span>炖煮</span>)导致其 14px 永不缩→加 ownsText(e)(有非空直接文字节点)使混合 div 也缩字。验证:fixture 第8页 3→0、第10/20页 0、回归第15/16页 0。
RC2(_gen_one 链):横版(not is_a4)加 re.sub 把 LLM 违规写的 overflow(-y):auto/scroll → overflow:hidden(cards.md:22 禁卡内滚动条;A4 走 6088 自有 strip 不受影响)。验证:新版 col5 源码 0 个 auto/scroll。
RC3(提示词,6文件):h2 页标题 line-height:1.1 + accent 短线 top:90px,防标题底压短线;改 core/always/structure.md、decoration.md、typography.md + prompts/design-system.md + scenarios/{_default,col4,col5}/design-system.md。
RC4(提示词,hero_grid.md):加"hero 大卡内容量铁律"——内容填充≥75%、禁 justify-content:center(改 flex-start)、内容不足加装饰 SVG/数据可视化填充。验证:新版 col5 hero 填充率 1.00。
回归:col3(A4)0裁切0滚动条(not is_a4 隔离未误伤);col5 slide9 干净。ast.parse 通过、后端重启 HTTP 200。

[2026-07-10 11:30:00] 元素级对比度守卫 + 客户端文字自适应两类整类缺陷结构化修复(根因,非补丁):
背景:用户从 col4 成品实测报两类"看得见的坏"——(A)第8页深蓝渐变 hero 卡 + 第10页 primary 深蓝表头,内部近黑字看不见;(B)第10页文字超出容器、第15页几乎撑满拥挤、第16页文字显示不全。逐层排查确认二者都不是个例,是整类结构缺陷,分两条根因线。

===== 缺陷类A:分配类色彩规定全无"元素级可读性兜底" =====
根因(查实非推测):系统所有颜色规定——colors.md 色彩角色分工/vi.md 页面类型覆盖表/design-system「十四、色彩语义」——全是"分配类"(什么色用在哪、什么语义配什么色),无一处做"分配后可读性兜底"。design-system「十四」明写 primary→使用场景:标题文字+hero 卡背景,即准许 primary 既当文字又当深背景却没配套"primary 当背景时文字转白"→ LLM 照章:primary 做 hero 卡背景(合规)+ text 做卡内正文(合规)= 深蓝底近黑字,两规则各自没违反合起来不可读。可读性兜底只在"整页级"做了:_auto_fix_white_on_light(2107)/_auto_fix_dark_on_dark(2188)都用整页一个 bg_luminance 判断;实测 tokens.yaml content/data 页整页背景={{background}}(白),整页级判定"这页白底"完全正确于是 dark_on_dark 在 2215 直接 return 跳过。但第8/10页是白底页里 LLM 即兴放的 background:var(--primary) 深蓝局部块,tokens.yaml 不可能记录它(非页面类型固定背景)→ 局部深底黑字落进整页级盲区。
改动A(代码,ppt_service.py):新增 _enforce_element_contrast(html,scheme,slide_seq,style_id,page_type)(2280),接在 _auto_fix_dark_on_dark 之后、_strip_local_var_overrides 之前(4486)。时机关键——必须在 _resolve_color_vars({{primary}}→hex)之前,那时元素样式仍是 var()/{{}}/#hex 混合语义形态,能识别"背景是哪个角色色"。算法(元素级/可计算/无页面清单):bs4 遍历每个可见文字节点(跳过 svg/script/style)→ 沿 .parents 求有效背景(第一个非透明 inline bg,渐变取最深 stop,alpha<0.6 视透明,回落 scheme.background)→ 求文字色(继承链,回落 {{text}})→ _wcag_contrast_ratio>=4.5 跳过;<4.5 选修正:深底(亮度≤128)写 #ffffff(recolor 安全,该元素底是 primary/secondary 任何方案仍深、白字恒可读)、浅底写 {{text}}(随方案)。只改 color 绝不动 background/fill;图片/SVG 叠字祖先算不出底→保守跳过;异常→原样返回 html(绝不破坏产物)。日志 [CONTRAST-FIX] Slide N: fixed K low-contrast text element(s)。
改动A2(约定层根因,6文件,避免自检清单把代码改对的白字要求 LLM 改回 text):(1)prompts/core/always/colors.md:31"正文 {{text}}"拆两行,加通用例外"所在元素/祖先 background 深色亮度≤128→#ffffff",并加「对比度铁律(元素级——唯一的 text 默认例外)」节;(2)checklist.md:17 自检项补"深色背景(hero卡/表头/深色块/深色渐变卡)上文字为白色 #ffffff";(3)scenarios/{col4,col5,_default}/design-system.md「十四」表后 +(4)vi/business/colors.md 角色分工后,各加同一条元素级对比度铁律(含"任意即兴深色渐变卡都适用"+"#ffffff 是唯一合法硬编码 hex")。符合 LLM 创造→代码约束:约定给 LLM 减少出错,代码 _enforce_element_contrast 做确定性兜底保无遗漏。

===== 缺陷类B:全系统无"填充后文字溢出容器"兜底 =====
根因:模板固定 height + overflow:hidden,LLM 缩扩写填字,字多即被裁。此前尝试静态字数/行高估算(_tmp_height_calib)误报第3/4/7/9/14页(用户从未报),证实静态估算无法预测浏览器 CJK 换行,不可靠,放弃。改用真实浏览器测量(playwright 已装,app.py:5069 PNG 导出在用)。确立正确的"被裁"判据:文字叶子真被裁 = (a)自身 overflow:hidden 且 scrollHeight-clientHeight>1(自裁),或(b)渲染 rect 被 overflow:hidden 祖先切掉(rect.bottom-ancestorRect.bottom>1)。用此判据实测恰好第10/15/16页命中——与用户报告完全吻合(此前"13-20页坏"是把设计上故意出血的装饰 SVG 误计)。
改动B(代码,ppt_service.py):新增 _TEXT_FIT_SCRIPT 模块常量(6824,纯 vanilla JS 单花括号无 {{}}、免被 _resolve_color_vars 正则误伤),烘焙进 _assemble_html_deck 返回 f-string 的 {wrapped} 与 </body> 之间(7092)。浏览器加载即 runFit():leaves() 收含文字叶子→clipBoxes() 找裁切文字的 overflow:hidden 盒(自裁叶子同时加叶子+最近 flex/hidden 祖先,治第16页 flex 挤压型)→stillClips() 检自身 scrollHeight+后代自裁+rect 被切→shrink() 按 SAFE=0.985 递减 font-size(跳装饰 fs≥48&≤2字)/line-height/margin/padding/gap 至下限 MINF=11px,迭代至不裁或全触底。DOMContentLoaded + document.fonts.ready 双触发。架构优势:客户端运行(同覆盖预览 iframe 与 playwright 截图导出 PNG/PPTX 路径)、颜色无关(index.html/index_vars.html 同脚本)、抗 recolor+手动编辑、零生成延迟、单插入点(_assemble_html_deck)三栏(col3 A4/col4/col5 横版)全覆盖。

验证(端到端):
(1)ast.parse 通过;后端重启 HTTP 200(/docs)、backend_startup.log 无错。
(2)对比度单测6例全过;真实第8页渐变 hero 卡黑字→注入3处 #ffffff、同页浅底 {{text}} 正确不动。
(3)溢出:真实20页 col4 deck 烘焙脚本自动运行、被裁文字→0;回归 col3 no-op(0被裁)、col5 第9页48→0;无需手动调用。
(4)时机零破坏:_enforce_element_contrast 写入的 #ffffff/{{text}} 被下游三函数确认不破坏(_strip_local_var_overrides 只删 --var:赋值、_fill_residual_placeholders 只清大写 {{TAG}}、_resolve_color_vars 只 {{text}}→var(--text) 不碰 #ffffff)。
决策依据(符合 characterize-defect-class/structural-fix/llm-code-separation):两类都普查整类边界而非逐页补丁;不动整页级 _auto_fix_*(管整页深底 cover/section/quote,工作正常,互补不冲突);不动结构页代码填充路径(3880-3898 深底白字模板已正确、绕过后处理);不动色彩语义/角色分配逻辑(LLM 仍按语义配色);溢出弃静态估算改真实浏览器测量(无捏造、判据与用户报告吻合)。

[2026-07-10 10:05:00] toc/closing 缺 HTML 模板整类缺陷结构化修复(根因,非补丁):
背景:用户从头指出 col3 大纲爆炸/封面缺字段/{菜名}泄露/残留占位符不是孤立 bug,是同一根因的多个症状——我此前逐个打补丁(dedup/_resolve_title/_fill_residual)每个都"自审通过"却给虚假完成感,因为地基坏了补丁也漏。普查确认缺陷类边界:business ~40 个页面类型只有 5 个(cover/content/data/section/summary)有「## HTML 模板」头走代码确定性填充(锁版式/稳定/前端可预览);toc 和 closing 虽被声明进 STRUCTURAL_PAGE_TYPES(6097),却缺 HTML 模板块 → 掉进 if template_html 的 else "fall through to LLM"(3885)→ LLM 自由发挥 → 时而爆炸/版式浮动/前端预览读不到。这是「声明了却没实现」的半成品,违反 Rule6。缺陷类完整成员=3模板+2代码,无遗漏。
改动A(3 模板补「## HTML 模板」块,参照已验证实现不新发明):
(1) business/toc.md(横版1280×720):var(--background) 底 + SVG grid/glow 装饰 + accent 顶条 +「目录」标题 + <table> 含 {{TOC_ROWS}} 占位符 + {{PAGE_NUM}}/{{TOTAL_PAGES}} 页尾;规则禁 AI 手写目录行(由代码注入)。
(2) business/closing.md(横版1280×720):深色渐变 linear-gradient(135deg,var(--primary),var(--secondary)) 与封面书挡呼应;{{THANKS}}+{{#CTA}}/{{#CONTACT_INFO}} 条件块+{{COPYRIGHT}}+页码,全部已被 _fill_slide_template 支持。
(3) business/col3/closing.md(A4 794×1123):primary 底+10px 金色装饰线+居中 flex:1 内容+{{THANKS}}/{{CTA}}/{{CONTACT_INFO}}+页尾 {{BRAND_COPYRIGHT}}/{{BRAND_SIGNATURE}}(系统占位符严禁替换);用 plain 占位符(非 {{#CTA}} 条件块)因 col3 走 LLM 路径,规则命 LLM 删空 div。
改动B(2 处代码 ppt_service.py):
(1) _build_toc_rows(3724):原只读 chapters,但 col4/col5 章节在 key_points(chapters=None)→ 增 key_points 兜底;圆序号色由 {{CHART_N}}(大写不可解析)改为直接输出 var(--chart-N)(已解析形态,穿透 code-fill return 与残留清理);页码列 {{ENTRY_i_PAGE}}(全码库无 resolver 的死占位符)改为留空,消除泄漏。
(2) _fill_slide_template(6345):新增 if "{{TOC_ROWS}}" in html 检测,取 slide 的 chapters/key_points 调 _build_toc_rows 注入 → 横版 toc 走 3866 结构化闸门命中代码填充,return 时目录行已就位(横版不再落 LLM,is_a4 门控自然绕开,无需删)。
验证(端到端,真实产线三栏重生成,先剥 slide_plan 里已烘焙的 html/html_vars 强制真重生成):
(1)后端日志确认代码填充:"Slide 2: code-filled (business/toc)"、"Slide 15: code-filled (business/closing), 2665 chars",不再 fall through to LLM。
(2)成品扫描三栏 index.html 残留 {{ = 0。
(3)col4(20页):目录 4 章(烹饪之道/操作之术/通用流程/技术附录)正确、圆序号 var(--chart- ×10 有色、无 var(--chart_color) 泄漏、copyright 末页正常。
(4)col5(15页):目录 8 章正确(此前拼接成一行,现 8 独立 <tr>)、var(--chart- ×14、closing 深色渐变+accent 条+©+THANKS=结语、无残留。
(5)col3(11页):目录仍 11 页、var(--chart- ×16、新增 closing 书挡生效(primary 底+金线)、A4 三段 flex 不回归。
决策依据(符合 characterize-defect-class/structural-fix):不逐个补丁而普查整类边界;参照 col3/toc.md 已验证实现不新发明结构;发现 col3 toc 的 _build_toc_rows 输出本就被丢弃(其表格无 <tbody> 供正则回落匹配)→ 改 _build_toc_rows 对 col3 零影响、只修 col4/col5;不碰 copyright/cover/section/summary/content/data(已验证)。

[2026-07-10 09:20:00] col4 封面标题 {菜名} 占位符泄露修复(_resolve_title):
问题:用户报 col4 合成封面 <h1> 显示字面「{菜名} SOP的道与术」。端到端定位实际交付文件(data/output/鲍鱼一品煲/*_col4/index.html):col4 <h1>={菜名} SOP的道与术(泄露),col3/col5 干净。
双层根因:(1)LLM 层——SKILL 模板 title_format 是「{菜名} SOP的道与术」模式串,大纲提示词(1311)要求 LLM 替换 {占位符} 并镜像到 heading;LLM 把 heading 正确填成「鲍鱼一品煲 SOP的道与术」,却把 title_format 的 {菜名} 漏填留了原样。(2)代码层——_fill_slide_template(6184)填 {{TITLE}} 用 `title_format or heading`,title_format 非空即胜出→字面 {菜名} 泄进成品。
修复(LLM 创造→代码约束):新增 _resolve_title(slide)(6146)——优先 title_format,但先剥离双括号 {{系统占位符}} 后用正则检测是否残留单括号 {…}(可量化缺陷);若残留则回落 heading(LLM 稳定填对的字段),heading 也空才退回 title_format(不丢内容)。双括号系统占位符不误判。两处调用同步(Rule6):code-fill 6203(_fill_slide_template)+ LLM 提示词映射 4130(ph_map_lines {{TITLE}})。
验证:(1)ast.parse 通过。(2)单测 7 例全过(缺填回落heading/已填用title_format/无字段/双括号不误判/正常串/heading空退回)。(3)真实产线:用 col4 实际大纲 seq1(title_format={菜名}…, heading=鲍鱼一品煲…)跑 _fill_slide_template → <h1>=鲍鱼一品煲 SOP的道与术,不含 {菜名}。(4)回归:col5 封面(无title_format,用heading)、col3 封面(title_format=鲍鱼一品煲—标准作业文档,已填)均不受影响、无泄露。(5)扫全三栏大纲仅 col4 seq1 一处 title_format 缺填,其余正常。
附带澄清(非bug):早前发现 col4 result step_result 的 slide_plan 字段含 38 个 {{BRAND_*}}——那是合成前逐页快照(_fill_residual 故意保留 BRAND 待 deck 级填充);检查实际交付 3 栏 index.html 残留 {{XXX}}=0,BRAND 由 _assemble_html_deck(6656)+ deck 级(566)正常填充,无缺陷。
决策依据:未改 LLM synthesis(title_format 替换本应 LLM 做,但代码需对可量化缺陷兜底);未动 col3 dedup 等无关逻辑;只在填充边界加缺陷检测回落,符合「可量化约束由代码检查」。

[2026-07-10 08:40:00] col3 表格页爆炸(40页)修复 + col5 封面 subtitle/summary 补齐:
问题1：col3 视觉编辑器定义 11 页，但生成大纲产出 40 页。根因 = Stage1 LLM 把「表格行」误当「页」逐行拆分(seq8×20 食材/seq9×7 步骤/seq4×3/seq10×3)；提示词已禁「合并或拆分页面」但 LLM 违反 → 按「LLM 创造→代码约束」原则用代码兜底(不叠加提示词)。用户强调「既然发生就说明有漏洞需要解决，不能赌是否复发」。
改动1(代码兜底，ppt_service.py)：新增 _dedup_table_pages(stage1, skill_template)(1509)——以 SKILL 模板为页数真相源，模板中「只出现1次的 seq」若 stage1 出现多次即判定为行拆分误爆。折叠策略：保留首页作骨架，把每页 key_points 收集为 rows 数据行(20 条全保留不丢)、序列化进 body(供 Stage2 LLM 读 body 填 {{TABLE_ROWS}})；关键——清空骨架 key_points([]),使下游 _fix_stage1_table_keypoints 从模板恢复列名(否则骨架残留首行食材数据当列名)。非表格重复页也防御性折叠。幂等(已匹配模板页数则原样返回)。非 JSON skill(col4/col5 markdown)→ 守卫 no-op。
改动2(接入)：940/1042 两个调用点，dedup 置于 _fix_stage1_table_keypoints 之前(顺序关键：先折叠清空 kp，再恢复列名)。
改动3(截断修复)：_gen_one body 截断 1000→表格/流程页 6000(is_a4 && stype in table/flowchart)。seq8 折叠后 body=1094字 >1000 会丢末尾食材；提高上限保 20 条完整入 LLM。type 由 page_type 在 960 归一，stype='table' 条件命中。
问题2：col5 封面 example 缺 subtitle/summary(col4 上轮已补，col5 漏)。改动(DB 15 行，.gitignore 不入 git)：cover example 加 subtitle/summary + 字段说明，镜像 col4 措辞。覆盖 3 项目(pi-*-col5) + 12 种子(column_configs col5)，含 2014字异形行。幂等(含 subtitle 则跳过)，先备份 yishao-PRE-COL5SKILL-20260710_082832.db，integrity ok。
验证：(1)真实产线路径 _generate_outline_only 灌 40 页真数据(mock _stage1_content/_phase2_research)→ 输出 11 页、seq 计数全为 1、seq8 key_points=8 列名(序号/食材类型/…/单位)、rows=20、outline_text 含全部食材(花胶/鲍鱼/凤爪/干花菇/鲍鱼汁)。(2)幂等：二次 dedup 仍 11 页。(3)回归 col4：markdown skill → dedup no-op，19 页不变。(4)回归 col5：markdown skill no-op，subtitle/summary 字段落库正确。(5)ast.parse 通过；后端重启 PID=30188、/api/health 200。
决策依据：未改提示词(已明令禁拆分，LLM 违反 → 代码是可靠约束层)；未删 _generate_and_replace_images 等无关逻辑；只在大纲后处理(系统边界)加折叠兜底，与既有 _fix_stage1_table_keypoints 同层。

[2026-07-10 07:10:00] 内容页 LLM 填充管线残留占位符兜底 + summary 序号式 KEY_POINT 修复:
背景：诊断"大纲内容↔VI手册统一不了"根因。查明系统有两条填充管线——结构页(cover/section/summary/toc/closing)走代码机械填充(_fill_slide_template，3802 return)；内容页(content/data)走 LLM 模板填充(_gen_one，4306 return)。内容页契约无单一真相源(占位符名 HEADING vs 代码只填 TITLE、给LLM的占位符映射只4个、模板自带契约表与 content_parts 双份无校验)，且全链无残留 {{}} 兜底清理 → LLM 漏填即字面泄漏。
改动1（LLM路径兜底，ppt_service.py）：新增 _fill_residual_placeholders(html,seq,heading,total)，在 _auto_fix_font_size 后、html_vars 快照前调用(4189)。机械填 {{HEADING}}/{{PAGE_NUM}}/{{TOTAL_PAGES}}；正则 strip 剩余 UPPERCASE {{TAG}}；保留清单 _RESIDUAL_KEEP_TAGS(IMAGE_URL/IMAGE_OPACITY/TOC_ROWS/BRAND*)+ 小写颜色变量({{primary}}) + 图片指令({{image:...}}，含冒号不匹配)。结构页在 3802 已 return，不经此net。
改动2（结构页真bug，端到端发现）：summary.md 用序号式 {{KEY_POINT_1}}/{{KEY_POINT_2}}，但 _fill_slide_template 只处理循环式 {{#KEY_POINTS}} → 序号式原样漏进成品。新增序号式填充(6196)：按 key_points 顺序填 KEY_POINT_N，超出数据的槽位清空，防泄漏。
验证：(1)单测 12项全过(机械填/保留颜色变量/保留系统标签/保留图片指令/删合成占位符 CARD_N/METRIC_N)。(2)实生成 col4 全17页(Stage2 484s)，成品 deck 扫描：LLM页 0 残留、_fill_residual 触发0次(LLM都填对=健康)。(3)首轮成品暴露 {{KEY_POINT_1/2}} 泄漏→定位 summary.md→修复后用真实 seq16 slide(5个key_points)复测 residual=NONE、KEY_POINT leak=False。(4)Rule6 同类检查：cover/section/toc/closing 无序号式占位符；col3/cover.md 的 {{KP_N}} 由 _build_cover_info_table 经 {{INFO_TABLE}} 上游填充，最近 col3 成品 0 残留，未受影响。
决策依据：未做内容页大重构(无故障证据=不提前优化)；未改 LLM synthesis(CARD_N/METRIC_N 是Frameset缩扩写，仍归LLM)；只在系统边界(LLM产出)加下行兜底。ppt_service.py 7346行拆分单独立项(本轮不做)。

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

