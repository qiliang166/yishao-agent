# 2026-07-15 手机版第二期：管理端 4 Tab + 个人中心 + 续费 + 添加到桌面

## 范围

规格：docs/superpowers/specs/2026-07-15-mobile-phase2-admin-center-design.md
约束：后端零改动、桌面版代码零改动，只动 `frontend/src/mobile/`。
回滚点：git tag `backup/pre-mobile-phase2`；服务器 DB 备份 yishao-backup-20260715.db。

## 新增/修改文件

| 文件 | 动作 | 说明 |
|------|------|------|
| frontend/src/mobile/pages/MAdmin.tsx | 新建 | /admin 用户管理：会员/管理员/待审批（角标）/套餐 4 Tab；停启用、录入续期、通过/拒绝审批、通过升级、套餐+收款码设置 |
| frontend/src/mobile/pages/MMe.tsx | 新建 | /me 个人中心：/api/auth/me 信息 + 到期时间 + 续费按钮 + 添加到桌面按钮 |
| frontend/src/mobile/pages/MRenew.tsx | 新建 | /renew 公开续费页：两步（验证身份 → 收款码+订单号）→ POST /api/member/renew |
| frontend/src/mobile/a2hs.ts | 新建 | 动态 manifest（blob URL，图标=网站 LOGO）+ promptInstall()（安卓原生/iOS 引导/微信提示） |
| frontend/src/mobile/MobileApp.tsx | 重写 | +3 路由、A2hsBanner 首次引导条、injectManifest() |
| frontend/src/mobile/pages/MHome.tsx | 重写 | 顶部入口卡片：用户管理（admin+member.manage）、个人中心 |
| frontend/src/mobile/pages/MMemberLogin.tsx | 重写 | 底部"会员已过期？去续费"链接 |
| frontend/src/mobile/mobile.css | 重写 | +Tab/弹层/行操作/收款码/入口卡片/A2HS 引导条等样式 |
| dev-log/test_mobile_phase2.py | 新建 | 全流程回归脚本 |

复用接口全部来自现有 api.ts / 公开端点：listUsers、toggleUserActive、recordPayment、listPendingMembers、listPendingUpgrades、approveMember、rejectMember、approveUpgrade、getSettings、updateSettings、/api/auth/me、/api/member/renew、/api/settings。

## 关键实现点

1. **权限门槛**：/admin 需 `user_type==='admin'` + `member.manage`；套餐 Tab 额外需 `config.global`（后端 update_settings 的权限要求）
2. **套餐保存只发 3 个键**（member_plan/payment_qr_wechat/payment_qr_alipay）——后端逐键 upsert，不影响其他设置
3. **A2HS 动态 manifest**：图标须用运行时配置的网站 LOGO → fetch /api/settings 构造 manifest → blob URL 注入 link 标签；iOS 走 apple-touch-icon + 图文引导；微信不支持 → 提示浏览器打开
4. **所有异步 onClick 按规则 2 模板**；API 返回逐项判空（规则 4）；停用/通过升级先 confirm

## 测试（dev-log/test_mobile_phase2.py，26 项 ALL PASS）

- 临时测试会员 mtest_phase2，finally 中删除 + 恢复套餐设置，不碰真实数据
- 覆盖：A2HS manifest/引导条、管理员 4 Tab、停用↔启用、录入续期、会员视角（单入口//me 到期/无权限）、续费全链路（提交→待审批含单号→通过 is_approved=1；二次提交→拒绝消失）、套餐改价 99.99→续费页联动→恢复、第一期首页回归
- 测试脚本调试中发现的两个非产品问题：
  - HashRouter 下 goto 相同 hash 不触发导航 → 测试前先跳 #/member 再进 /renew
  - 已激活 Tab 重复点击不重新拉数据（组件设计如此，靠 useEffect 依赖 tab 变化）→ 测试用 page.reload() 强制重挂载
- `npx tsc --noEmit` 0 错误；vite mobile build 产物 dist/mobile/assets/index-DFSpZCWd.js

## 规则 8 产物

- build_server.ps1 → yishao-agent-server.zip 已重建
- build_desktop.ps1 → YishaoAgent-Setup.exe 已重建

## 部署

前端-only（后端零改动，无需重启）：

```
scp -r d:\YISHAOAGENT\frontend\dist\mobile root@120.25.251.172:/opt/yishao-agent/frontend/dist/
```

真机验收清单：管理员手机审批一个真实注册；安卓添加桌面图标显示 LOGO；iOS 引导弹层；微信内续费流程。

---

## 补强（同日，真机验收反馈）

用户真机反馈三个问题，当天修复：

1. **"添加到桌面"提示"当前浏览器不支持"无路可走**
   - 根因：站点为 HTTP（IP 直连无证书），Chrome 系 `beforeinstallprompt` 只在 HTTPS 触发；国产浏览器（百度/夸克/UC/自带）即使 HTTPS 也不支持 → promptInstall() 返回 'unavailable'
   - 修复：新增共享组件 `MInstallGuide`（MobileApp.tsx），'unavailable' 从 toast 改为安卓图文引导弹层（浏览器菜单 ⋮/≡ → 添加到主屏幕/添加快捷方式/保存到桌面）；引导条和个人中心共用；将来上 HTTPS 后原生弹窗路径自动恢复
2. **会员管理行操作补全**（MAdmin.tsx）：编辑（显示名/邮箱/可选重置密码 ≥8 位，`api.updateUser` + `api.resetUserPassword`）、删除（confirm 不可恢复提示，`api.deleteUser` 级联删角色/工作区/付费记录）。行按钮：编辑/停用/录入续期(仅会员)/删除；超管 admin 行隐藏停用/删除
3. **个人中心补全**（MMe.tsx，对齐桌面 MemberCenterPage）：+注册时间、账号状态；会员有效期着色（已过期红/≤7 天橙/正常绿+剩余天数）；角色升级区（付费未过期未升级 → 申请开发体验员弹层：收款码+单号 → `api.memberUpgrade`；已升级显示有效期）；修改密码（旧/新/确认 → POST /api/auth/change-password）

测试：test_mobile_phase2.py 重写扩展到 **36 项 ALL PASS**，新增覆盖：安卓引导弹层（引导条+个人中心两处）、编辑显示名/邮箱 API 验证、UI 删除后用户不存在、/me 注册时间/账号状态行、错误旧密码报错、正确改密后 DB password_hash 变化（改密后续费流程用新密码）。产物 dist/mobile/assets/index-Bv57Gzz7.js；两个规则 8 产物已重建。

## 补强 4（同日，编辑弹层角色+工作区）

4. **编辑弹层补全角色分配 + 工作区分配**（MAdmin.tsx）：
   - 角色分配（需 `role.manage`）：打开弹层时异步加载 `api.getUser(id)` 取当前角色 + `api.listRoles(user_type)` 取可选角色；已分配角色以 `.m-badge` 标签展示，× 移除调用 `api.removeUserRole`；下拉选择器过滤已分配角色，点击"分配"调用 `api.addUserRole`
   - 工作区分配：加载 `api.listWorkspaces()` 取全部工作区；已分配列表带 × 移除调用 `api.removeUserWorkspace`；下拉过滤后"添加"调用 `api.addUserWorkspaces`
   - 复用接口全部现成，桌面版已在用，无后端改动
   - 测试：test_mobile_phase2.py 扩展到 **41 项 ALL PASS**，新增 5 项：编辑弹层含角色/工作区分配区、角色分配后出现标签、角色移除后标签消失、工作区添加后出现删除按钮、工作区移除后删除按钮消失。产物 dist/mobile/assets/index-4ro8AuuG.js
