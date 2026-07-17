# 2026-07-18 下载 403 修复 — 解锁契约统一三下载端点 + 关于弹窗 UI

## 背景

线上新注册试用会员（无 stage5.download 权限）在下载页点「一键下载」→ 弹出解锁确认 → 扣积分解锁成功 → 下载 HTTP 403 失败。逐个文件下载可以（走 /api/exports 旁路），一键下载（download-selected/download-all）失败。用户质疑「既然下载失败为什么就解锁了扣了积分」。

根因：三个下载端点（GET /api/projects/{id}/download-all :1365、POST /api/projects/{id}/download-selected :1409、GET /api/download/{filename} :5807）无条件 `require_perm("stage5.download")`，与 `_check_unlock_and_log`（:5741）的解锁契约矛盾 — 该契约本意：is_downloadable=1 → 验 project_unlocks 解锁（未解锁 402）；is_downloadable=0 → 才需要 stage5.download。且此前 `_check_unlock_and_log` 的返回值被调用方忽略（False 仍放行）。

积分未白扣：解锁记录永久有效，修复部署后无需重新解锁即可下载。

## 改动

1. **backend/app.py 三端点**：去掉无条件 `require_perm("stage5.download")`，改用 `request.state.user`（与原 require_perm 同源认证，兼容 /api/download?token= 与 window.open 场景）+ 统一交给 `_check_unlock_and_log` 判定，返回 False → 403「缺少权限: stage5.download」（原 is_downloadable=0 行为保留）
2. **frontend/src/components/AboutDialog.tsx**（关于软件弹窗）：宽 420→520、加 minHeight 460（约+100px）+ flex 布局让内容区撑满；内容区字号 12→11 与底部「联系我们」微信信息一致

## 验收（dev-log/_dl_perm_test.py，9/9 PASS）

- 试用会员（无 stage5.download）未解锁：download-selected / download-all → 402 提示先解锁
- 解锁后：download-selected（一键下载多文件）/ download-all / 单文件 /api/download?token= 全 200，且只扣一次积分
- is_downloadable=0 明细：无 stage5.download → 403；有 → 200（原行为保留）
- 测试脚本注意：projects 行必须写 storage_path（resolve_project_storage 按 storage_path 或全局保存路径+项目名解析，不是 data/projects/{id}）

## 回归

- _register_trial_test.py 8/8；_admin4_test.py 19/19
- 注意：注册接口有内存态 IP 限流（3 次/小时），连跑测试触发 429 需重启后端清零
- tsc + npm build 通过
