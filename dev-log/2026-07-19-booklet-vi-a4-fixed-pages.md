# 2026-07-19 电子成册：A4 固定页 VI 版式自动切换 + 删「内容同款配色」卡 + 第④步固定页缩略图截断修复

## 需求（多轮澄清后定稿）

1. 删除第③步「📎 内容同款配色」卡：普通用户不理解、与配色网格重复、浅色配色时点击"无效果"。
2. A4 册子固定页两套版式**自动**二选一（无按钮）：
   - 第一个**启用**章节 = HTML 课件 → 封面/扉页/目录/封底全部走 **VI A4 版式**
   - 第一个启用章节 = 文档 → 维持现状白纸模板，逐字不动
   - 判定随章节顺序实时变化（课件拖到第一章即切换）
3. VI A4 ≠ VI PPT：PPT=primary→secondary 渐变（3 个 ppt 模板现状即规则，不动）；
   **A4=var(--primary) 纯色，VI 手册明确禁止 A4 封面渐变**。颜色全走配色变量，
   深底白字 `#ffffff` 是 VI 唯一允许的硬编码例外。
4. 修用户报告 bug：第④步页面"不是 A4 大小、被截断"。

## VI A4 版式基准（依据真实 col3 鲍鱼课件产物 + backend/resources/vi/*/col3/vi.md）

| 固定页 | 版式 |
|---|---|
| 封面 | primary 纯色整页 + 顶部 10px accent 色条 + 白字（书名 → 48×4px accent 短线 → 副题 → 署名/单位/日期 rgba(255,255,255,.6)）+ 白描边装饰圆 opacity .3（左下） |
| 扉页 | 纸底 + 顶部 45px 页头行（左书名/右日期，12px 半透明 text，1px 底分隔线） |
| 目录 | 纸底 + 同款页头行 + 4px accent 通栏横线 + 「目 录」左对齐 primary 色标题 |
| 封底 | primary 纯色整页 + 顶部 accent 色条 + 白字封底文字 + accent 短线 + 白字品牌行 + 装饰圆（右上） |

页头行不放页码（prose 流式拆页服务端不可知总页数），放书名/日期。

## 实现

- **3 个 A4 模板**（a4_book/a4_flow/a4_standard.html）：
  - `<body class="{{BOOK_BODY_CLASS}}">` 占位（render 填 `bk-vi` 或空串；ppt 模板无此占位，replace 缺位为无操作）
  - 超集 DOM：`.bk-vi-pagehead`（扉页/目录页头行）、`.bk-vi-tocline`、`.bk-vi-rule`、`.bk-vi-decor`（svg 圆）
    常驻模板默认 `display:none`，`.bk-vi` 下显示 → 非 VI 态视觉零变化
  - `.bk-vi` CSS 块：封面/封底 `background: var(--primary)`、白字、accent 色条 10px、
    封面短线改 48×4px 且 flex `order` 移到书名之后、封底色条 `order:-1` 移顶、目录标题左对齐 primary
- **booklets.py**：
  - `PLACEHOLDERS` += `BOOK_BODY_CLASS`；新增 `_first_chapter_is_html()`（与前端 isHtmlFirstChapter 同规则镜像）
  - `render_booklet()`：`a4 且第一启用章节为 HTML` → 注入 `bk-vi`
  - `_build_fixed_docs()` wrapper body 带 `bk-vi`（否则第④步缩略图丢 VI 版式）
  - `CoverPreviewReq` 加 `vi_mode: bool = False`（默认 False，旧前端兼容）；cover-preview 的 dummy 章节恒为
    prose，wrapper body 按前端传入 vi_mode 补 class
- **前端**：
  - types.ts：删 `extractContentPalette`/`PALETTE_VAR_MAP`（死代码整体移除），新增 `isHtmlFirstChapter`；
    保留 `resolveDraftTheme`（StepPages/StepArrange 用；custom 分支兼容存量 theme_id='' 草稿）
  - StepCover.tsx：删📎卡；主题卡选中态还原 `theme_id === t.id`；fetchCover 恒发所选主题 + `vi_mode`
  - api.ts：`bookletCoverPreview` body 类型加 `vi_mode: boolean`

## 第④步截断根因（非猜测，DB 实证）

用户报截断的正是「A4电子书」bk-67931acd445b，其 `render_mode='flow'`（网页式）。
flow 模板固定页是自适应高度横幅（`width:min(880px,96vw)`、无固定页高），
而第④步缩略图 iframe 恒为 794×1123 固定几何 → 横幅宽 762px、高度塌缩、底部大片空白 =
"不是A4大小、被截断"。第③步正常是因为 cover-preview 一直强制 `render_mode='standard'` 渲染。

**修复**：`_build_fixed_docs` 与 cover-preview 同规则，出缩略图恒用 standard 页模板
（合成产物不受影响，仅缩略图来源模板统一）。proseSplit.ts/StepPages.tsx 无缺陷未动 —
保持与合成模板 mm 几何的镜像契约，不引入 mm→px 偏差。

## 验证

- `npm run build` ✅（tsc + vite 零错误）
- 服务端回归（127.0.0.1:8766 新实例）24 PASS：「测试」render body 带 bk-vi/无残留/封面封底 primary
  纯色规则/页头行×2/装饰圆×2/--ink 注入；fixed_docs 四固定页 body 带 bk-vi；
  「A4电子书」fixed_docs 为 210mm×297mm standard 几何、无 flow 横幅；「我的PPT」无 bk-vi、
  渐变保留；cover-preview vi=1/vi=0/ppt/旧请求无字段 四态正确
  - 注：「A4电子书」render 出现 bk-vi 为**正确行为** — 该草稿现仅剩 1 章（鲍鱼课件，enabled），
    第一启用章节即课件；DB chapters_json 实证，非判定缺陷
- 离线 27 PASS：2 book_type × 3 render_mode × {builtin, custom-dark} × {doc-first, html-first}
  全组合无残留、VI 判定逐项正确；纯文档草稿三模式无 bk-vi
- 浏览器人工走查（留用户）：「测试」草稿 ③封面=所选配色 primary 纯色（非渐变）→
  ④固定页缩略图同版式 → ⑤成品封面/扉页/目录/封底全套 VI；纯文档草稿全程白纸现状

## 影响面

- 后端：backend/routers/booklets.py、backend/resources/booklet/a4_{book,flow,standard}.html
- 前端：frontend/src/booklet/types.ts、components/StepCover.tsx、services/api.ts
- 不动：3 个 ppt 模板、themes.py、proseSplit.ts、StepPages.tsx、--ink/--on-primary 派生
