# 2026-07-17 管理后台四项改进 — 工作区归属权限 + 下载统计创建者维度 + 新人礼包注册即发

## 背景

电子成册 R4/R5 完结部署（2a212786）后，用户提出 4 个管理后台问题。用户确认口径：创建者汇总 = 下载次数 + 积分总额（真实扣分流水）；created_by 为空的存量工作区归超级管理员；新建工作区复制来源可选任何人的工作区。

## 改动

### Q1 提示词应用归属限制

- `backend/routers/prompt_studio.py` apply 端点：取 workspace 行时带出 created_by，普通管理员（username != "admin"）应用到非自己创建的工作区 → 403「只能应用到自己创建的工作区」（created_by NULL 归超管，普通管理员同样 403）
- `GET /api/workspaces`（app.py）加可选参数 `mine=1`：普通管理员只返回 created_by = 自己 的工作区；超管返回全部；**不带 mine 行为与之前完全一致**（规则 1 已 grep listWorkspaces 全部 8 个调用点，其余消费者零影响）
- 前端 `api.ts` listWorkspaces 加 `opts.mine`；`PromptStudioPage.tsx` 工作区下拉改 `{mine: true}` — 两处应用下拉自然只剩自己的工作区。HomePage 复制来源下拉不传 mine（保持 Q2 可选任何人）

### Q2 新建工作区跨人复制配置 — 无需改码

后端 `WorkspaceCreate.source_workspace_id` + HomePage 新建对话框本就支持选任何人的工作区做只读复制来源。接口级验证：普通管理员以超管工作区为来源 → 9 条 column_configs 复制成功。

### Q3 下载统计创建者维度

- 后端 stats SQL：`LEFT JOIN users creator ON creator.id = w.created_by` → `COALESCE(creator.display_name, creator.username, '超级管理员') as creator_name`；每明细积分收入子查询 `SUM(project_unlocks.points_spent_deci)` as points_earned_deci（比 points_transactions 逗号拼接 ref_id 可靠）
- 前端 `DownloadStatsPage.tsx`：明细表加「创建者」列 + 「全部创建者」筛选；「按分类汇总」→「按工作区汇总」（sumBy workspace_name）；「按作者汇总」→「按创建者汇总」（下载次数 + 积分总额，按下载次数降序）；汇总块显示条件改为有数据即显示

### Q4 新人礼包注册即发

- `member_register`（app.py）在 _write_audit 前发放 signup_bonus（trial/paid 两条路径都发，try/except 不阻断注册）；`_add_points` 内部 `_ensure_user_points` 自动建行
- 审批端点发放代码**保留不动**：其 `existing_pts` 守卫看到注册时已建的 user_points 行会跳过 → 不重复发；存量「注册了但未审批」的老用户仍能审批时补发（平滑过渡）
- `SettingsPage.tsx` 文案「新用户首次审批通过时赠送」→「新用户注册成功即赠送」

## 验收（dev-log/_admin4_test.py，19/19 PASS）

- apply 矩阵：普通管理员 自己200 / 超管的403 / 存量NULL403；超管 任意200
- mine=1 普通管理员只见自己的；超管仍见全部；不带 mine 全量不变
- Q2 跨人复制来源 200 且配置齐
- stats 含 creator_name（无空值）/ points_earned_deci，与 project_unlocks 逐行手算一致
- trial 注册即有 50 deci + signup_bonus 流水 1 条；置回待审再走审批 → 流水仍 1 条、余额仍 50（不重复发）
- 回归：booklet Phase3 27/27；tsc + npm build 通过

## 发布

- commit 后按规则 8 重建 zip + exe；server-update.tar.gz（app.py + routers/prompt_studio.py + dist）待部署 120.25.251.172:8766
