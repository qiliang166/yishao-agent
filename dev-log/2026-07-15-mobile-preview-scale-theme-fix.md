# 手机版 HTML 预览缩放修复（COL4/COL5）+ 主题同步修复

日期：2026-07-15

## 问题（真机反馈）

1. **微信内 HTML 预览左侧显示不完整**，左右滑动也无法显示；后续补充：COL3（A4 竖版）完整，COL4/COL5（PPT 横版）显示不全
2. **手机浏览器页面呈黑灰色**，与网站风格不符（用户当前选择的主题是红色/经典酒红）

## 根因

### 1. HTML 预览剪裁 — 两层原因

- **测量时机**：微信 WebView 中父页面 iframe onLoad 读 contentDocument 不可靠 → frameDims 永远不设置 → iframe 停留 width:100%
- **测量方法**：COL4/COL5 课件 body 是 `display:flex; align-items:center` + 1280px 固定宽 slide。视口窄时居中内容向**左溢出到负坐标区**，浏览器无法向左滚动，且 `scrollWidth` 只统计右侧溢出（严重偏小）。COL3 是 A4 竖版不发生居中溢出，所以正常 —— 这正好解释了"COL3 完整、COL4/COL5 剪裁"

### 2. 页面黑灰色 — 主题残留

- 手机 localStorage 里残留旧主题（如暗夜模式），内联防闪脚本首屏即应用
- 桌面版 App.tsx 挂载时会 `api.getSettings()` 从服务器同步主题纠正 localStorage；**手机版没有这个同步**，旧主题永久残留

## 修复（只改 frontend/src/mobile/，桌面版后端零改动）

### MPreview.tsx

- 注入课件的 MEASURE_SCRIPT 改为**子元素包围盒并集**测量（minLeft→maxRight），不再依赖 scrollWidth；通过 `parent.postMessage({t:'m-preview-size',w,h})` 上报（load + 300ms + 1200ms 三次）
- 父页面 onLoad 同源兜底测量 `measureDoc()` 用同一套包围盒逻辑
- 测量结果统一走 `applyDims()`：取最大上报宽度 → `scale = 容器宽/内容宽` → 包裹 div(w*scale × h*scale) + iframe 自然尺寸 transform:scale

### MobileApp.tsx

- 新增 `<ThemeSync/>`：登录后 `api.getSettings()` → 同步 theme/theme_presets 到 localStorage → classic 则 `resetThemeToDefault()`，否则 `applyThemeToDOM()`（与桌面 App.tsx:638 完全一致的逻辑，复用 services/theme.ts）

## 验证（Playwright 375px，backend 127.0.0.1:8766）

- `dev-log/test_mobile_preview_scale.py`：6 个 HTML 文件（col5_full / col5_fantasy / col3 文档课件 / col5 综合PPT / col4 分析PPT×2）全部 naturalW=1281 → scaled=True → 容器 scrollWidth=375 **零水平溢出**；txt 预览 1413 字；返回按钮回列表 — ALL PASS
- `dev-log/test_mobile_theme_sync.py`：预置残留暗色主题 → 首屏 #1A1A1E（复现 bug）→ ThemeSync 后 #FAFAF8、localStorage theme 改回 classic — PASS
- tsc 0 错误；mobile bundle: index-CLcZT7q-.js
- 规则 8：server + desktop 产物重建

## 后续修复（同日）

### 3. 真机 HTML 预览空白 — blob: iframe 兼容性

- 部署后真机反馈：微信/手机浏览器 HTML 预览全空白（本地 Chromium 测试通过）
- 根因：微信 X5/XWeb 及部分手机浏览器不支持 `blob:` URL 作为 iframe src
- 修复：MPreview.tsx 改用 `srcDoc` 内联 HTML（全端支持），移除 createObjectURL/revoke 逻辑
- 复验：微信/浏览器/百度APP无痕 全部正常

### 4. 百度APP非无痕空白 — HTML 缓存残留

- 根因：后端 `_spa_fallback` FileResponse 不带 Cache-Control，浏览器启发式缓存旧入口页；旧 hash JS 仍在服务器 → 旧页面持续可加载
- 修复：app.py `_spa_fallback` 对 .html 响应统一加 `Cache-Control: no-cache`（带 hash 的 assets 不受影响）；本地 curl 验证 GET 直达/兜底路径均带头
- 用户侧一次性补救：百度APP清缓存
- 生效条件：服务器后端需更新（待部署）

## 遗留

- 服务器后端更新（no-cache 修复生效）：待与第二期一起部署或单独部署
- 第二期已确认范围：管理端（用户管理+会员审批）+ 会员个人中心（到期+续费）
