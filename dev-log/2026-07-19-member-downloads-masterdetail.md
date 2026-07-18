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

## 经验

- canDownload/UnlockConfirmDialog 当初就按多项目数组设计，本次跨项目批量零改动直接复用——接口按集合建模的前瞻性红利
- zip 批量端点"先校验全落日志、打包成功才 commit"：HTTPException 也走 rollback，保证 402 场景零脏数据
- 测试脚本删数据前先查流水佐证是否真实数据（isolation 规则），本次核实为空删
