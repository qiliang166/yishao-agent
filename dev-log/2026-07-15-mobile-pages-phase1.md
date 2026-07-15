# 手机版独立页面（第一期：浏览为主）

日期：2026-07-15

## 需求

手机端访问系统。约束：**不修改现有桌面版源代码**，新建独立手机页面复用同一套 API。
第一期范围：登录（管理员+会员）、工作区列表、项目列表、文件浏览（HTML 预览/音频播放/下载）。

## 实现

### 架构

- 独立 Vite 构建：`frontend/vite.mobile.config.ts`（root=src/mobile，base=/mobile/，outDir=dist/mobile）
- 产物自包含文件夹 `frontend/dist/mobile/`，部署只上传这一个文件夹
- HashRouter（`/mobile/index.html#/login`），后端 SPA fallback 直接服务真实文件，后端零改动
- import 复用 `services/api.ts` + `contexts/AuthContext.tsx`（不复制），token 存 localStorage 与桌面版互通

### 新增文件

```
frontend/vite.mobile.config.ts
frontend/src/mobile/index.html      # 含桌面版同款主题恢复脚本
frontend/src/mobile/main.tsx
frontend/src/mobile/MobileApp.tsx   # 路由+登录守卫+顶栏+toast
frontend/src/mobile/mobile.css
frontend/src/mobile/pages/MLogin.tsx / MMemberLogin.tsx / MHome.tsx / MProjects.tsx / MProject.tsx
```

### 现有文件改动（3 处，均非页面源代码）

| 文件 | 改动 |
|------|------|
| `frontend/index.html` | head 加 1 行 UA 检测脚本：手机 UA 跳 /mobile/index.html，`?desktop=1` + sessionStorage 双保险逃生 |
| `build_server.ps1` | 桌面 build 后补跑 mobile build（桌面 build 会清掉 dist/mobile） |
| `build_desktop.ps1` | 同上 |

### 关键实现点

- 音频播放照搬 ProjectDashboard 已验证的 `audioPlayingRef` 显式布尔 ref 模式（避免 `audio.paused` 异步竞态）
- HTML 预览分两路：`/api/exports/` 开头的 URL 公开且 inline → 直接 window.open；`/api/download/` 开头的需 token 且强制 attachment → fetch blob + `URL.createObjectURL` 以 text/html 打开（先同步 window.open('') 防弹窗拦截）
- 所有异步 onClick 遵循规则 2 四件套；api 返回逐项判空（规则 4）

## 验证（Playwright 375px + curl 全部通过）

- 桌面 build 产物 hash 与改动前逐文件一致（改 index.html 前验证，零污染）
- `npx tsc --noEmit` 0 错误
- 登录页渲染、空提交校验、错误密码 401 提示"用户名或密码错误"、管理员/会员页切换
- 未登录访问受保护路由 → 重定向 #/login
- 登录态全链路：工作区列表(1) → 项目列表(6, 含分页逻辑) → 项目详情(9 文件 3 分组) → 返回导航
- 空项目显示"暂无文件"（files:[] 正常处理）
- HTML 预览新窗口渲染出真实内容（blob 方案，4648 字符正文）
- 下载触发成功（文件名正确：鲍鱼一品煲_文字输入_AI整理(1).txt）
- 会员 token 走 /api/workspaces 权限过滤正常（无权限返回空列表）
- UA 跳转矩阵：手机 UA 跳 /mobile/；+?desktop=1 不跳；同 session 再访问不跳；桌面 UA 不跳且正常渲染
- 音频播放/暂停：本地无音频测试数据，代码逐行照搬桌面版已验证实现，需服务器真机复验

## 遗留

- 音频播放需在服务器真机验证（本地数据库无 mp3 文件）
- 第二期候选：触发生成、查看生成进度
