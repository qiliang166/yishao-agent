# 2026-07-17 许可证机器指纹 v2 — 修复指纹漂移误报未激活

## 问题
用户本机提示词工作室「生成失败 未激活许可证」，但许可证状态页显示已激活。

## 根因
v1 指纹 = 主板UUID + 硬盘序列号(wmic第一行) + **网卡MAC** + 主机名 + processor。
本机 MAC 变为 ff 开头随机地址（VPN/Wi-Fi 随机硬件地址）→ 指纹漂移 → check_activation 返回 machine_mismatch → 中间件 403。
状态页只读本地记录不比对指纹，故障不可见。

附带缺陷：
- deactivate 用现算指纹去服务器解绑，漂移后解绑变空操作 → 服务器留孤儿绑定，重新激活报「已在其他设备上激活」
- Linux 上 wmic 全失败，指纹只剩 MAC+主机名+架构（生产服务器同样有漂移风险）
- wmic 新版 Windows 已移除，无 fallback

## 修复（license_service.py 重写 + SettingsPage.tsx 小改）
- 指纹 v2：`fpv2 + 主板UUID + 主板序列号`（Win，wmic→powershell 双通道）/ `fpv2 + /etc/machine-id + product_uuid`（Linux）；剔除 MAC/主机名/processor/硬盘序列号；全失败才回退 v1 组件；_valid_hw_value 过滤全F/全0/占位串
- deactivate 改发**存储的** machine_id → 漂移后也能正确解绑
- get_license_status 增加 machine_match 字段；设置页 machine_match=false 时显示警告条引导重新激活

## 验证（全过）
1. 指纹连续两次计算一致，组件=UUID+主板序列号，无易变项
2. powershell fallback 与 wmic 返回完全一致
3. 本机 deactivate → 服务器绑定同步清除（修复前会成孤儿）→ 重新激活 → machine_match=true → POST 过中间件（422 参数错而非 403）
4. 篡改 machine_id → status machine_match=false；恢复 → true
5. py_compile + npm build 通过

## 迁移（指纹算法变更，已激活机器需重新绑定一次）
- 本机 #53939：已完成（deactivate→activate，新指纹 729c91fe…）
- 生产服务器 #60703：部署新代码后 suspend/resume 清绑定 → 用原 key 重新激活
- #38817：孤儿绑定（与 #60703 同机），顺带清理
- 激活服务器 activation_server.py 无需改动

## 临时处置记录（当天先行操作）
本机旧绑定用 admin suspend/resume 清除后按 v1 重新激活过一次（序列号不变 53939），随后实施 v2 一步到位。
