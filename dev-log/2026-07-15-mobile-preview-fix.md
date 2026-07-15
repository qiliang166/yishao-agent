# 手机版预览体验修复 + 全类型预览（第一期问题修复）

日期：2026-07-15

## 问题（真机反馈）

1. txt 文档只有下载没有预览按钮
2. HTML 预览用 window.open 新标签页：课件固定宽度手机显示不完整；没有返回按钮，关标签页就退出网站
3. 用户要求：所有内容都要有预览+下载

## 实现（只改 frontend/src/mobile/，桌面版和后端零改动）

### 新增 MPreview.tsx（站内预览路由 #/preview）

- 顶栏 MTopBar：文件名 + **返回按钮**（navigate(-1) 回列表）+ 下载按钮
- 按 kind 分发：
  - text：带 token fetch → 滚动 pre
  - material（素材记录）：api.listMaterials 按 source_name 匹配 raw_content
  - html：exports 路径直接 iframe；download 路径带 token fetch + Content-Type 校验（保留安全修复）→ blob iframe
  - **自动缩放**：iframe onLoad 读 contentDocument.scrollWidth，transform: scale 整页宽度适配手机
  - image/video：token 查询参数直连 <img>/<video controls>
  - audio：<audio controls> 完整播放器
- 离开时 revokeObjectURL

### MProject.tsx 重写

- kindOf() 类型判定：所有文件都有预览按钮
- office（docx/pptx）及未知格式：点预览 = window.location.href 直接打开文件地址
  - 微信内置浏览器 → 弹微信文件页（iOS 微信可直接看 docx），可"用其他应用打开"
  - iOS Safari → QuickLook 系统级预览
  - 安卓 Chrome → 下载+通知栏点开选打开方式
  - 选择依据：a[download] 静默下载在微信里经常被屏蔽（用户找不到文件），直接打开地址是唯一在微信内可靠的方式
- 有 download_url 才显示下载按钮（素材记录只有预览）
- 音频行 ▶/⏸ 快捷播放保留

### 其他

- MobileApp.tsx：加 /preview 路由；MTopBar 支持 back="__back__"（历史返回）
- mobile.css：.m-preview-* 样式
- src/mobile/index.html：viewport 去掉 user-scalable=no，允许双指缩放看课件

## 验证（Playwright 375px 全部通过）

- 9 文件全部有预览+下载按钮
- txt 预览显示 1205 字内容 → 返回按钮回列表
- HTML 预览两条路径（exports/download）均渲染出课件内容，缩放后 iframe 宽 375px 无水平溢出
- 每次返回都回到文件列表（不退出网站）
- tsc 0 错误，无 JS 运行时错误

## 遗留

- 真机复验：微信内打开 office 文件的实际弹窗行为
- 部署：只需重新上传 frontend/dist/mobile/ 文件夹
