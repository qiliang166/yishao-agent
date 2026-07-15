# 手机版第二期设计：管理端 + 个人中心 + 续费 + 添加到桌面

日期：2026-07-15
状态：用户已确认设计，已实现并通过全量回归（dev-log/test_mobile_phase2.py ALL PASS）
回滚点：git tag `backup/pre-mobile-phase2`；服务器 DB 备份 yishao-backup-20260715.db

## 补强（2026-07-15 真机验收反馈，同日实现，36 项测试 ALL PASS）

1. **A2HS 图文引导弹层**：站点为 HTTP（IP 直连），Chrome 系 `beforeinstallprompt` 只在 HTTPS 触发；国产浏览器（百度/夸克/UC/自带）即使 HTTPS 也不支持 → 'unavailable' 分支从死胡同 toast 改为安卓图文引导弹层（浏览器菜单 → 添加到主屏幕/添加快捷方式/保存到桌面）。共享组件 `MInstallGuide`（MobileApp.tsx），引导条与个人中心均使用。将来上 HTTPS 后 Chrome 原生弹窗路径自动恢复，代码无需再改
2. **会员/管理员行操作补全**：编辑（显示名/邮箱/可选重置密码 ≥8 位）→ `api.updateUser` + `api.resetUserPassword`；删除（confirm 提示不可恢复级联删除）→ `api.deleteUser`。超级管理员 admin 行隐藏停用/删除（后端有保护）。行按钮：编辑/停用/录入续期(仅会员)/删除
3. **个人中心补全**（对齐桌面 MemberCenterPage）：+注册时间、账号状态；会员有效期着色（已过期红/≤7天橙/正常绿+剩余天数）；角色升级区（付费未过期未升级可申请开发体验员 → `api.memberUpgrade`，已升级显示有效期）；修改密码（POST /api/auth/change-password）

## 目标

手机版在第一期（浏览为主）基础上增加：

1. **管理端**：管理员在手机上管理用户（列表/停启用/录入续期）、审批会员（注册/升级）、设置套餐与收款码
2. **会员个人中心**：查看到期时间
3. **续费**：会员在手机上提交续费申请（含已过期登录不了的会员）
4. **添加到桌面（A2HS）**：一键把手机版加到手机桌面，图标用网站 LOGO

约束：**后端零改动、桌面版代码零改动**，只在 `frontend/src/mobile/` 内新增/修改，复用 `frontend/src/services/api.ts` 现有方法。

## 已确认的范围决策

| 决策点 | 结论 |
|--------|------|
| 用户管理程度 | 精简版：列表/停启用/录入续期。创建、编辑资料、角色分配、工作区分配、重置密码、删除留在桌面版 |
| 页面组织 | 方案 A：单入口"用户管理"页 + 4 Tab（会员/管理员/待审批/套餐） |
| 续费入口 | 一页两入口：个人中心（预填用户名）+ 会员登录页链接（服务已过期会员） |
| 套餐设置 | PC 在全局设置里，手机端作为用户管理第 4 个 Tab（业务上属会员注册/续费一环） |
| 角色管理页 | 不做（低频、小屏体验差） |
| A2HS | 并入第二期；图标用网站 LOGO（动态）；两个入口：首次浏览器打开自动引导条 + 个人中心常驻按钮 |

## 新增页面（frontend/src/mobile/pages/）

### 1. MAdmin.tsx — 用户管理（路由 /admin，RequireAuth）

权限门槛：`user.user_type === 'admin'` 且 `user.permissions` 含 `member.manage`；无权限显示提示不渲染内容。

**Tab 1 会员 / Tab 2 管理员**
- `api.listUsers({ user_type, page, page_size: 20 })` 分页列表
- 行显示：display_name、@username、状态标签（已停用/待审批）、到期时间（expires_at，null=永久）
- 行操作：
  - 停用/启用：确认后 `api.toggleUserActive(userId)`
  - 录入续期（仅会员 Tab）：弹层表单（套餐名、金额元→amount_cents、天数、支付方式、备注）→ `api.recordPayment(userId, data)` → 显示返回的 expires_after 新到期时间

**Tab 3 待审批**（Tab 上显示数量角标，进入 MAdmin 页时拉取）
- 升级申请区（有数据才显示）：`api.listPendingUpgrades()` → 用户信息+付款信息 → `api.approveUpgrade(userId)`
- 待审批会员：`api.listPendingMembers(page, 20)` → 用户信息、付费（套餐/金额/单号/支付方式）或试用标签
  - 通过：弹层填生效天数（有付款默认套餐天数，试用默认 7）→ `api.approveMember(userId, days)`
  - 拒绝：弹层填原因（可选）→ `api.rejectMember(userId, reason)`

**Tab 4 套餐**（额外权限门槛：后端 `PUT settings` 要求 `config.global` 权限，故此 Tab 仅当 `user.permissions` 含 `config.global` 时显示）
- 数据源 `api.getSettings()`：`member_plan`（JSON：quarterly/upgrade 各含 name/amount_cents/duration_days）、`payment_qr_wechat`、`payment_qr_alipay`
- 表单：标准套餐（名/价格元/天数）、升级套餐（名/价格元/天数）、微信收款码（预览+相册上传 FileReader→base64+清除）、支付宝收款码（同）
- 保存：`api.updateSettings({ member_plan: JSON.stringify(...), payment_qr_wechat, payment_qr_alipay })` —— 只发这三个键。已核实后端 update_settings（app.py:5283）为逐键 upsert 部分更新，不影响其他设置

### 2. MMe.tsx — 个人中心（路由 /me，RequireAuth）

- 数据源 `/api/auth/me`：api.ts 无现成方法，与桌面 MemberCenterPage.tsx:45 相同做法——带 Bearer token 的 fetch
- 显示：display_name、@username、邮箱、账号类型、会员到期时间 expires_at（null 显示"永久"）、体验员到期 upgrade_expires_at（有才显示）、角色标签
- 会员（user_type==='member'）显示"续费"按钮 → `/renew?u=<username>`
- "添加到桌面"常驻按钮：调 a2hs.ts 的 `promptInstall()`，按返回值弹原生弹窗/iOS 图文引导/微信提示

### 3. MRenew.tsx — 续费页（路由 /renew，公开无守卫）

- `fetch('/api/settings')` 读 brand_name、member_plan、payment_qr_wechat/alipay
- 表单：用户名（?u= 预填）、密码、套餐信息展示（价格天数以服务器为准，客户端只传 plan_id='quarterly'）、微信/支付宝切换 + 对应收款码图、付款单号/订单号输入
- 提交：POST `/api/member/renew`，body `{ username, password, plan_type, plan_id, payment_method, payment_ref }`（与桌面 MemberRenewPage 相同）
- 成功页：提示"续费申请已提交，管理员审批通过后生效" + 返回登录链接
- 注意：后端提交成功后将该会员置 is_approved=0 并递增 token_version（旧登录失效），页面成功文案需说明需等待审批

## 添加到桌面（frontend/src/mobile/a2hs.ts，新增模块）

- **动态 manifest**：静态 manifest 无法携带运行时配置的 LOGO，故运行时注入——fetch `/api/settings` 取 brand_name/brand_logo → 构造 manifest JSON（name、start_url: `origin + '/mobile/index.html#/'`、display: standalone、icons: brand_logo 的绝对 URL，无 LOGO 则省略 icons）→ blob URL 注入 `<link rel="manifest">`；同时注入 `<link rel="apple-touch-icon">`（iOS）
- **promptInstall()**：模块级捕获 `beforeinstallprompt` 事件；返回值分支——
  - 安卓 Chrome 系：有事件 → 原生安装弹窗（'accepted'/'prompted'）
  - iOS Safari：返回 'ios'，调用方显示图文引导弹层（分享 ⬆ → 添加到主屏幕）
  - 微信内置浏览器（MicroMessenger UA）：返回 'wechat'，提示在浏览器中打开
  - 已安装（display-mode: standalone）：'installed'；其他不支持：'unavailable'
- **首次引导条**（MobileApp.tsx 的 A2hsBanner）：非微信、非 standalone、localStorage 无 `a2hs_dismissed` 时顶部显示"添加到手机桌面，下次一键打开 [添加] [×]"；点 × 记 localStorage 永不再弹
- index.html 不改动（manifest 全动态注入）

## 修改现有文件（Write 整文件重写）

| 文件 | 改动 |
|------|------|
| MobileApp.tsx | 加路由：/admin、/me（RequireAuth）、/renew（公开）；挂 A2hsBanner；启动时 injectManifest() |
| MHome.tsx | 内容区顶部入口卡片："用户管理"（admin 且 member.manage 才显示）、"个人中心"（都显示） |
| MMemberLogin.tsx | 底部加"已过期？去续费"链接 → /renew |
| mobile.css | 新增 .m-tabs/.m-tab、行操作按钮、弹层表单（.m-sheet）、二维码预览、入口卡片、A2HS 引导条等样式 |

## 错误处理

- 所有含 await 的 onClick 按 CLAUDE.md 规则 2 模板（try + null 检查 + catch mToast + finally 恢复状态）
- 所有 API 返回逐项判空（规则 4）
- 破坏性操作（停用）先 confirm 提示

## 测试标准（Playwright 375px，本地 127.0.0.1:8766）

- 用**临时创建的测试账号**（测完删除，不碰真实数据）：
  1. 管理员进用户管理 → 4 Tab 均渲染
  2. 会员列表：停用 → 状态变更 → 启用恢复
  3. 录入续期 → 到期时间延长
  4. 续费页提交（测试会员）→ 待审批 Tab 出现该申请（含单号）→ 通过 → 到期时间生效；再提交一次 → 拒绝流程
  5. 套餐 Tab 改价格保存 → 续费页显示新价格 → 改回
  6. 个人中心显示到期时间；无权限会员看不到"用户管理"入口
  7. A2HS：manifest 已注入（display=standalone）、引导条显示、× 后消失且记住
- 回归：工作区/项目/文件预览/音频播放不受影响
- `npx tsc --noEmit` 0 错误
- 规则 8：重建 yishao-agent-server.zip + YishaoAgent-Setup.exe

测试结果：dev-log/test_mobile_phase2.py 共 26 项检查 ALL PASS（2026-07-15）。

## 部署

前端-only：用户上传 `frontend/dist/mobile/` 一个文件夹（scp 命令同第一期）。后端零改动，无需重启。
