# 2026-07-18 电子成册 R6：页面编排拆页对齐 + 固定页缩略图 + LOGO 上传权限

Commit: `7b4a87c7` ｜ 线上已部署验证（build_commit=7b4a87c7）

## 三个问题与修复

1. **署名页上传 LOGO 403**：`/api/upload/logo` 原要求 `require_perm("config.global")`（管理员系统品牌权限），会员必 403。改为登录即可（request.state.user 为 None → 401），校验（后缀白名单/5MB/随机名）全保留。
2. **页面编排固定页只显示 emoji 图标**：page-map 原只返回固定页键名。新增 `_build_fixed_docs(booklet, theme)`：浅拷贝草稿清空 hidden_fixed → 复用 `render_booklet()` 成品 → 按 section class（bk-cover/bk-flyleaf/bk-toc/bk-back）正则提取 → 包成自包含文档（含 `.bk-sheet,.bk-slide{display:flex!important;position:static!important}` 归一化，翻页式非 active 页 display:none 必须强制显示）。render 抛异常（章节为空）→ 返回 {} 前端回退图标。
3. **正文章节 41 页只显示 1 张卡（R4 遗留缺口，核心）**：R3 上线页面编排时正文="一章一张纸"；R4 (7f7684f3) 模板内嵌 bkSplitProse 拆页后产物变多页，编排未同步 → 逐页隐藏/排序失效。

## R6 正文拆页编排架构

- **数据（零迁移）**：Chapter 新增 `prose_hidden_pages: int[]` / `prose_page_order: int[]`。不复用 hidden_pages（其正文语义 = [0] 即整章隐藏，复用会错解存量草稿）。
- **后端**：`_prose_arrange_of(ch)` 清洗 → render_booklet 收集 `{anchor: {hidden, order}}` → `{{PROSE_ARRANGE}}` JSON 注入 4 个翻页式/标准页模板；prose section 带 `data-bk-prose="{anchor}"`（makeCont cloneNode 自动复制到续页，DOM 序即页序）。
- **模板**（a4_book/ppt_book/a4_standard/ppt_standard，脚本存档 dev-log/_bk_r6_arrange_snippet.html）：bkSplitProse 拆页后按锚点取页序列 → order 非 0..n-1 完整排列回退自然序（与后端 _visible_page_indices 同规则）→ 滤 hidden → 重插 DOM；锚点 id 跟随第一张保留页，目录跳转不失效。翻页计数在编排后采集。flow 两模板零改动。
- **前端**：新建 `frontend/src/booklet/proseSplit.ts` = 模板 bkSplitProse 的 TS 移植 + A4/PPT 版式 CSS 镜像（⚠ 同步契约：模板拆页算法/版式改动必须同步该文件）。StepPages 正文章节离屏拆页出 N 张 iframe 缩略卡，每页 👁/◀▶ 写 prose_*；「隐藏整章」保留（hidden_pages=[0] 旧语义）；flow 模式提示"正文不分页，仅支持整章隐藏"。

## 验收

- dev-log/_bk_r6_test.py：28/28 PASS（LOGO 三态权限 / fixed_docs 四键+归一化 / PROSE_ARRANGE 注入 hidden+order / 存量草稿零状态兼容 / flow 不含拆页 JS / standard 全要素）
- 回归：_bk_r4_test.py 28/28（含 playwright 拆页实测）；_dl_perm_test.py ALL PASS；tsc + npm build 零错误

## 测试脚本坑

- 建草稿必须 POST（title/book_type）再 PUT chapters —— create 不收 chapters，且 render 空章节抛 400（→ _build_fixed_docs 返回 {}，page-map fixed_docs 为空是此因非 bug）。

## 部署坑（重要）

- systemd ExecStart=`/opt/yishao-agent/venv/bin/python /opt/yishao-agent/backend/app.py`，目录结构为 `/opt/yishao-agent/{backend,frontend/dist}`。
- **server-update.tar.gz 必须带 `backend/`、`frontend/dist` 路径前缀**（tar -czf 直接打 `backend/app.py ...` 而非 `-C backend app.py`）。本次首包未带前缀，解压散落 /opt/yishao-agent 根目录 → 版本号不变，排查半天。已清理错位文件。
- /api/version 的 stamp 是进程启动时读 backend/build_version.txt 缓存的，文件对了但版本不变 = 文件位置错或进程未重启。

## 遗留

- git push 因 GitHub 连接失败未完成，网络恢复后需补推（commit 7b4a87c7 已在本地）。
