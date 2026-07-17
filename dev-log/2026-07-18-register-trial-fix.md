# 2026-07-18 注册流程修复 — 默认试用会员 + 可靠赋角色 + 注册页去付款 UI

## 背景

线上走查发现新注册测试号 ceshi004 三个关联现象：看不到项目（「暂无可用项目」）、看不到下载、个人中心「当前角色」为「—」。

根因链：会员可见性 = member_workspaces 个人分配 OR user_roles→workspace_roles 角色绑定；ceshi004 **无任何角色** → 两条路都不通。无角色的成因：注册赋角色写法查 `name='试用会员' AND is_system=1` 查不到就**静默跳过**（不报错不留痕），或用户当时走了付费注册路径（付费不赋角色，等审批）。

另排除一项：礼包 0.5 非 bug — 用户核实线上全局设置本来就是 0.5（默认值），线上改成 10 即可。

用户确认口径：注册不选类型、不出现付款界面，注册默认就是试用会员 + 发新人礼包；会员中心的付费/续费/升级功能保留不动；试用会员可见工作区保持管理员手动勾选（工作区设置 → 可见角色）。

## 改动

1. **后端 app.py member_register**：trial 赋角色改 **get-or-create** — 查「试用会员」（去掉 is_system 过滤，按名匹配与种子逻辑一致）；查不到当场创建角色行 + 5 项 view 权限（与 database.py 种子 TRIAL_MEMBER_PERMS 同款）再赋给用户；任何失败 print 警告不阻断注册，杜绝静默无角色
2. **桌面 MemberRegisterPage.tsx**：删两步向导/试用付费切换/套餐/收款码/付款单号，单页表单固定 `plan_type:'trial'`，文案「注册即开通试用会员，可在会员中心升级付费」
3. **手机 MRegister.tsx**：同款改造
4. 后端付费注册分支保留（前端不再触发，审批页/存量待审记录零影响）；续费/升级页零改动

## 验收（dev-log/_register_trial_test.py，8/8 PASS）

- 注册即有「试用会员」角色、auth/me roles 非空、礼包按 settings 值发放（100 deci）
- **把试用会员角色改名模拟缺失再注册** → 角色被自动重建（含 5 项 view 权限）并赋上，验后恢复
- 试用会员 token 拉 /api/workspaces 能看到绑定了试用会员角色的工作区
- 回归：_admin4_test.py 19/19；tsc + npm build 通过

## 部署后线上操作（Workbench）

1. 存量补角色（ceshi004 等已注册无角色用户）：
   ```bash
   sqlite3 /opt/yishao-agent/backend/data/yishao.db "INSERT OR IGNORE INTO user_roles (user_id, role_id) SELECT u.id, r.id FROM users u, roles r WHERE u.user_type='member' AND r.name='试用会员' AND r.is_system=1 AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id);"
   ```
2. 管理后台：全局设置 → 新人礼包改为 10 并保存
3. 需要对会员开放的工作区：工作区设置 → 可见角色勾选「试用会员」（不勾则会员看不到 — 既有设计）
