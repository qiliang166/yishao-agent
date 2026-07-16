# 2026-07-17 提示词工作室多行业适配修复

## 问题
用户在提示词工作室生成「多业态餐饮食品安全管理」配置并应用后，新建明细生成大量失败（LLM 拒答：食品安全内容 vs 菜肴研习手册模板错配）。

## 根因（4 个叠加）
1. 种子模板契约错误：system_prompt.md 只要求 5 条 column_configs，前端消费契约是 9 条（col1×3 按 sort_order 0/1/2，col2×3 按 sort_order 3/4/5，col3/4/5 按 name 匹配）
2. apply 按 id upsert 只增不删 → 旧菜谱配置与新配置混杂
3. LLM 固定 id（gen-c4-analysis-ppt）+ id 单列主键 + INSERT OR IGNORE → 跨工作区应用时静默丢弃 col4/col5/2条speech/2条tts，计数虚报成功
4. _serialize_configs 剥离 sort_order → 新配置全部 sort_order=0 → Stage2 按 3/4/5 找不到，仍用旧菜肴模板 → LLM 拒答

## 修复
- prompt_studio.py：COLUMN_SLOTS 9 槽位契约常量（校验+写入共用）；_validate_configs 按 slot/label 全覆盖校验；apply 原子替换（先 DELETE 后 INSERT，服务端生成 id，slot 定 sort_order，代码强制 col3/4/5 与 speech/tts 固定 label）；旧结构记录明确报错
- system_prompt.md / user_message.md：9 slots 输出契约 + 「格式骨架保留、行业语义重构」规则
- PromptStudioPage.tsx：两处 apply 前加覆盖确认弹窗
- 界面词汇中性化 11 处：个食谱→个明细、菜谱编号→编号、智绘食谱教案系统→智绘教案系统（含 frontend/index.html 主入口 title）、PPT 页脚 fallback「美食研究所」→空

## 验证（9 项全过）
1. 真实 LLM 生成食品安全配置：9+3+3+33，slot/label 全部正确，c3 为 8 页合法 JSON（存档 pstudio_gen_foodsafety.json）
2. 缺 c2_dao slot → 400 精确报错
3. 应用后工作区恰 9 条、sort 0-8、固定 label、菜谱残留 0 行
4. 同配置应用到第 2 工作区无丢失，第 1 工作区不受影响
5. 连续应用两次幂等
6. 旧保存记录 psave-15de699e92d8 → 400「col1 需要 3 条实际 1 条…请重新生成」，无部分写入
7. 未应用工作室的默认工作区新建明细仍走餐饮种子（回归通过，临时数据已清理）
8. dist 无「个食谱/菜谱编号/智绘食谱」残留
9. py_compile + npm build 通过

## 数据修复（已完成）
- 新配置已应用到「食品安全」工作区 5ff47e49b460（旧混杂配置清除）
- 保存记录「多业态餐饮食品安全管理（新版9槽位）」psave-f3ab831c70bf
- 新建「食品安全测试2」验证明细初始化全为食品安全语境
- 旧明细「食品安全测试1」provider 项已固化旧配置，建议用户删除（0 条生成结果，无损失）
