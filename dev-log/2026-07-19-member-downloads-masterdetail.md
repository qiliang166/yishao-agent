# 2026-07-19 会员下载页改版：左右分栏 master-detail + 文件勾选 + 跨项目批量下载

## 需求

会员"下载文件"页（/app/downloads）原为单列大卡片 + 展开/折叠 + 每页 40 条分页，用户反馈：列表长、页数多、难找内容。改为：

- **左栏＝项目清单**（300px 紧凑行，滚动不分页）：搜索（项目名+文件名全量搜）、**分类下拉筛选**（选项自动取自 category_name 去重）、全部/已解锁/未解锁段钮，三条件叠加；checkbox 多选，全选(当前筛选)/清空
- **右栏＝文件明细预览+选择页**：逐选中项目渲染卡片（category 分组沿用），**每文件勾选框**（项目选中时默认全勾），每文件「⬇ 下载」单独下载；顶部工具栏实时计数 + 「📦 批量下载」
- 批量下载=勾选文件打进**一个 zip，按项目名分文件夹**

## 实现

### 后端 backend/app.py

1. **`_resolve_selected_filepath(project_path, filename, download_url)`**：从 download-selected 端点抽出的文件定位辅助（/api/exports/ 走 run 目录 → 回退项目文件夹），download-selected 原端点改用，行为不变
2. **`POST /api/member/download-batch`**（downloadable-projects 之后）：
   - 请求体 `{projects:[{project_id, files:[{filename,download_url,display_name}]}]}`
   - **先全量校验后打包**：逐项目 `verify_project_access` + 逐文件 `_check_unlock_and_log(...,'zip_batch',ip)`（逐文件写 download_logs + download_count）；任一未解锁 → 402 整单拒绝 + rollback 不落日志；zip 全部写完才 commit
   - zip 结构 `清洗项目名/display_name`；文件夹名白名单过滤（同 L1396）+ 同名项目 `_{pid[:6]}` 防撞；组内重名 `_1/_2` 去重
   - 上限 500 文件（BytesIO 内存保护），超限 400 提示分批

### 前端

- **api.ts** 新增 `downloadBatch(projects)`：照 downloadSelectedFiles 同款 fetch POST → blob → Content-Disposition 解析 → a 标签存盘；错误体解析 detail 给 toast 用（402 的中文解锁提示可直达用户）
- **MemberDownloadsPage.tsx 整文件重写**：
  - 状态：`selected: Set<pid>`、`fileSel: Set<"pid|filename">`（项目选中默认全勾其文件，取消同步移除）、`catFilter`、`busy`
  - 下载链路统一 `doDownload(items)`：canDownload 预检 →（need_unlock）既有 UnlockConfirmDialog（**天然支持跨项目**）→ unlockProjects → `performDownload`：1项目1文件=downloadWithName / 1项目多文件=downloadSelectedFiles / 多项目=downloadBatch（规则2模板：busy+try+null检查+catch toast+finally）
  - 删除分页/折叠；保留作者简介弹窗、toast、fileIcon/formatSize/pts
  - 原样保留的解锁扣分流程零改动（UnlockConfirmDialog / canDownload / unlockProjects 端点均未动）

## 验证（全部通过）

1. `py_compile` app.py ✅
2. 端点实测（自铸 JWT，本地 8766）：
   - admin 跨2项目批量 → 200，zip 条目 `鲍鱼一品煲/...`、`测试/...` 分文件夹 ✅；download_logs(zip_batch) +6=预期 ✅；download_count 逐文件递增 ✅；Content-Disposition `批量下载_时间戳.zip` ✅
   - 会员未解锁 → 402「请先消耗 25.0 积分解锁…」且日志零新增（rollback 生效）✅
   - 501 文件 → 400 上限提示 ✅；空列表 → 400 ✅
   - 隔离核查：T2 删除的 unlock 行核实为不存在的测试数据（该会员仅一条 7/15 admin 测试加分流水，从未解锁）
3. `npm run build` 零错误（index-D8iPrnmg.js）✅
4. playwright UI 冒烟 11 项：左栏计数/行数、选中→右侧默认全勾、取消勾选计数联动、全选 9项目24文件、批量按钮可用性、搜索过滤、分类下拉 3 选项、清空归零、无 JS 错误 ✅
5. DOM 几何断言：左栏 300px、右栏 x=548 紧随（16px gap）、无横向滚动、左列表可滚 ✅

## 第二轮追加：文件预览（同日）

**需求**：每个文件「⬇ 下载」按钮**前**加「👁 预览」，弹框预览内容。**产品决策（用户拍板）：未解锁也能预览**（试看促解锁，下载仍走解锁门）。

**实现**：

- 后端 `GET /api/member/preview-file?project_id&filename&token`：内联输出（`_file_response` 不带 attachment，text 类自动 charset=utf-8）；auth 走 request.state.user 或 ?token=（照 /api/download 同款，iframe/img/audio 带不了请求头）；`verify_project_access` 后**不做解锁校验、不写 download_logs/download_count**（预览≠下载）；`realpath` 前缀containment 防路径穿越
- api.ts `previewFileUrl(projectId, file)`：download_url 为 /api/exports/ 前缀 → 直连公开导出路径（保相对资源）；否则走 preview-file 带 token
- 页面：每文件行「👁 预览」→ 弹框（90vw×88vh，z-index 1100）按 ext 分流：html/txt/md/json/csv/pdf→iframe、图片→img、mp3 等→audio、mp4/webm→video、其余→"暂不支持在线预览"提示；头部=文件名+项目 chip+大小+「⬇ 下载」+「关闭」；Esc/点遮罩可关

**验证**：

- 端点：未解锁会员预览 txt 200 且无 Content-Disposition（inline）✅；无 token 401 ✅；`../../yishao.db` 穿越 400 ✅；不存在 404 ✅；download_logs 零新增 ✅；raw 头 `text/plain; charset=utf-8` ✅
- playwright：预览按钮出现在下载前、html 课件 iframe 完整渲染（990 DOM 节点、title=鲍鱼一品煲）、txt iframe 显文本、mp3 audio readyState=4 可播放、关闭按钮/Esc 均可关、零 JS 错误 ✅
- `npm run build` 零错误 ✅

## 第三轮追加：预览安全强化 + md 人读渲染 + 项目筛选 + 侧栏收敛（同日）

**需求**（用户四连）：①预览文档要人读格式而不是 MARKDOWN 源码；②预览限制复制；③筛选加"筛选项目"、明细列要能区分多项目（显示项目名）；④会员页面隐藏左侧「项目管理」栏目。另安全审查发现预览 iframe 无 sandbox。

**实现**：

- **后端 preview-file 强化**：响应统一带 `Content-Security-Policy: sandbox allow-scripts`；`.html/.htm` 读文件后在 `</head>` 前注入防复制 guard（`user-select:none` + selectstart/copy/contextmenu/dragstart 四事件 preventDefault）——老产物/手上传 HTML 可能没带防复制，预览是未解锁可看的试看场景必须补上；无 `</head>` 则前置拼接
- **api.ts `previewFileText(projectId, file)`**：文本类预览改 fetch 取文（/api/exports/ 直连；否则 preview-file 走 **Authorization 头**，token 不进 URL），供前端渲染
- **MemberDownloadsPage.tsx**：
  - 预览分流重构：`FRAME_EXTS=[html,htm,pdf]` 保持 iframe（加 `sandbox="allow-scripts"`，不给 allow-same-origin → 不透明源，脚本可跑但摸不到父窗口 localStorage/DOM）；`txt/md` → `DOMPurify.sanitize(marked.parse(text,{breaks:true}))` 渲染人读排版；`json/csv/log` → `<pre>` 原文
  - 复制限制：文本渲染容器 `userSelect:none` + onCopy/onCut/onContextMenu/onDragStart 全 preventDefault；img 禁右键禁拖拽；audio/video `controlsList="nodownload"`（video 另禁右键）
  - 筛选栏加**项目下拉**（全部项目 + 逐项目名，与搜索/分类/解锁状态四条件叠加）
  - 左栏项目名 **2 行 line-clamp**（原单行 ellipsis 长名同前缀无法区分）；**多项目选中时**右侧每文件行加项目名 chip、category 分组头追加"— 项目名"
- **App.tsx**：会员侧栏移除「项目管理」按钮；`/app` 落地由 MemberHomePage 改为 `Navigate → /app/center`（否则登录落在无侧栏入口的页面）；MemberHomePage 保留在 `/app/home-legacy` 供深链回访，workspace/project 路由不动

**验证（全部通过）**：

1. `py_compile` ✅；端点实测：HTML 预览 guard 注入且位于 `</head>` 前 ✅、CSP 头 + charset + 无 attachment ✅、TXT 原样不含 guard ✅、预览后 download_logs 增量 0 ✅
2. `npm run build` 零错误 ✅
3. playwright：/app 落地 URL=/app/center ✅；侧栏 4 项无「项目管理」✅；项目下拉 10 选项、选定后左栏收敛"共 1 个项目" ✅；左栏项目名 inline `-webkit-line-clamp:2` 生效 ✅；勾选 2 项目后 3/3 文件行带项目 chip ✅;txt 预览渲染出 `<p>`（非源码）且容器 userSelect=none ✅；html 预览 iframe sandbox=allow-scripts 且课件照常渲染（992 节点）、注入 guard 在 DOM 中 ✅；全程零 JS 错误 ✅

## 经验

- canDownload/UnlockConfirmDialog 当初就按多项目数组设计，本次跨项目批量零改动直接复用——接口按集合建模的前瞻性红利
- zip 批量端点"先校验全落日志、打包成功才 commit"：HTTPException 也走 rollback，保证 402 场景零脏数据
- 测试脚本删数据前先查流水佐证是否真实数据（isolation 规则），本次核实为空删
- iframe/img/audio 无法带 Authorization 头 → 预览端点必须支持 ?token=，照 /api/download 既有模式抄，不发明新机制
- urllib `dict(r.headers)` 取不到标准头是测试脚本假象，判定响应头一律 curl -D 看 raw
- playwright `querySelector('div > div')` 不以行元素为锚（选择器不自带 :scope），命中的是 flex 包裹层导致 clamp 误报 none——DOM 断言用 children 索引精确定位，别用无锚组合选择器
- iframe `sandbox="allow-scripts"`（无 allow-same-origin）下自包含单文件课件照常渲染（992 节点），防复制注入与课件脚本共存无冲突；隐藏导航入口时必须同步改登录落地路由，否则用户落在"无入口页"
