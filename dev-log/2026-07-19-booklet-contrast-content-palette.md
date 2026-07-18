# 2026-07-19 电子成册：封面配色跟随内容 + 对比度派生变量 + 三缺陷修复

## 背景（用户报告三问题）

1. **封面颜色**：第④步缩略图白色、标准合成打开偏深。查实为两回事：封面纸=主题 `--background`（商务主题即白），合成页外的"深色"=桌面色 `--desk`。追问后真实诉求：**章节是 col3 HTML 课件（自带深紫金 `:root` 配色）时，白封面与内容不匹配** → 需要"封面配色跟随内容"。
2. **第④步目录页字体样式缺失**：A4 目录条目是 `<td class="bk-toc-title-cell"><a href="#...">`，3 个 A4 模板都没给 `<a>` 去默认样式 → 蓝色下划线默认字体（PPT 目录用 `data-slide-target` 无 `<a>`，不受影响）。
3. **第②步文档章节预览只显示一半**：StepArrange onLoad 只对非 prose 测高，prose iframe 停在 minHeight 300 且 `scrolling="no"`，超出内容无法查看。

**前置缺陷（整类普查）**：六套合成模板全部假设亮底深字（标题 `var(--primary)`、primary 渐变底上用 `var(--background)` 文字）。套深色配色时对比度全线崩坏 — 必须先解决这一类，"内容同款配色"才可用。

## 方案（代码算可量化约束，LLM/配色零信任）

### 对比度派生变量（后端 themes.py + 前端 proseSplit.ts 同公式镜像）

- `_rel_luminance` / `_contrast`：WCAG 2.x 标准公式
- `--ink`（纸面标题色）= `contrast(primary, bg) >= 4.5 ? primary : text`
- `--on-primary`（primary 渐变底文字色）= `contrast(bg, primary) >= 4.5 ? bg : max-contrast([bg, #ffffff, text])`
- 派生只在输出端计算（`theme_css_vars` / `themeVars`），`THEME_VAR_KEYS` 不动，零硬编码

### 色位置换（六模板 + 前端四处）

- 3 个 A4 模板：`.bk-cover-title/-author`、`.bk-flyleaf-title`、`.bk-toc-title/-num`、`.bk-chapter-title`、`.bk-prose h1-h4/th` → `var(--ink)`；新增 `.bk-toc-table a { color: inherit; text-decoration: none; }`
- 3 个 PPT 模板：primary 渐变底上的 `.bk-cover-*`、`.bk-chapter-divider` 文字、`.bk-back-*` → `var(--on-primary)`；纸面标题 → `var(--ink)`（`.bk-toc-num` 徽章 chart 底白字不动）
- 前端：proseSplit A4_CSS/PPT_CSS、ProsePreview（改用共享 `themeVars`）、StepArrange PROSE_CSS、StepPages `chapterDividerDoc` 同步换位
- 装饰色块（cover-band/rule、chapter-head 边线、back-band）保持 primary/accent — 不承载文字可读性

### 内容同款配色（缺陷 1 产品解，后端零改动）

- `types.ts` 新增 `extractContentPalette(chapters)`：取第一个启用的 HTML 章节 `content` 中 `:root{...}`，正则收 `--primary/--secondary/--accent/--background→bg/--text/--card-bg→card_bg/--chart-0..7`，仅合法 hex，无 primary 返回 null
- `types.ts` 新增 `resolveDraftTheme(draft, themes)`：theme_id 空 + theme_colors 非空 → custom 主题（与后端 `_resolve_theme` custom 分支同规则）；StepPages/StepArrange 统一走它（useMemo 保引用稳定，防拆页 effect 每渲染重跑）
- StepCover：主题网格顶部插「📎 内容同款配色」卡，点击 `setCover({ theme_id: '', theme_colors: extracted })`；fetchCover 在 custom 态发送提取配色（原先固定发内置主题色）

### 第②步预览高度（缺陷 3）

- onLoad 统一测高：prose 用 `doc.body.scrollHeight`（不受视口钳制，变宽后重测不棘轮），非 prose 保持 `documentElement.scrollHeight`
- iframe style：prose 加 `height: iframeNatH`（minHeight 300 保留），外层盒子 overflowY:auto 单滚动条看全文
- ResizeObserver 两分支：prose 宽度变化 rAF 重测内容高；非 prose 算 fitScale（现状）
- 章节切换 `setIframeNatH(300)` 防串台

## 验证

- 前端 `npm run build`（tsc+vite）零错误
- Python 派生变量：4 内置主题 ink=primary（对比度 5.3~17.7）；col3 深紫金配色 ink 回退 text `#e8e0f0`（14.5）、on-primary `#ffffff`（12.7）
- 装配引擎回归：2 book_type × 3 render_mode × {内置主题, 深紫金 custom} = 12 组合全过 — 无 `{{}}` 残留、无 `<!--BK:` 残留、`--ink`/`--on-primary` 均注入、A4 全部带 `.bk-toc-table a` 重置、fixed_docs 无残留
- 本地 8766 起服：`/api/booklets/cover-preview`（theme_id 空 + 深紫金）→ 深底封面、ink=text ✓；真实草稿 bk-67931acd445b `/page-map` fixed toc doc 带锚链接重置与 --ink ✓
- 残留清查：`var(--book-` 零结果；模板内 `color: var(--primary)`、PPT `color: var(--background)` 零残留
- CHANGELOG 头部 7 条 7/18 乱码条目（GBK 误写）按 git log 原文重写为 UTF-8；更早的已提交乱码条目未动（另行清理）

## 未尽事项

- 浏览器端 UI 走查（第③步点卡→预览变深紫金、第②步拖宽看高度自适应）留待桌面端人工复核
- CHANGELOG 2026-07-15~07-18 已提交部分仍有 GBK 乱码，建议单独一次性按 git log 重建
