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
