# PPT Agent 重设计

## 问题诊断

当前方案"模板克隆 + 文本替换"存在根本性缺陷：

1. **模板 slide 布局固定，无法适配可变内容** — 标题 5 字 vs 15 字、正文 1 行 vs 10 行，用的是同一套 shape 位置
2. **文本替换按 zone 名称 → shape 索引匹配，天然脆弱** — 装饰性 shape（标签、页码、图标文字）数量远大于 zone，清除逻辑不可靠
3. **AI 生成的 slide plan 从不回显** — 用户看不到中间产物，无法审核或修改
4. **无视觉质量保证** — 生成后不检查，溢出、重叠、截断都发现不了

## 新架构

```
SOP内容
  → Stage1: AI 提取内容结构 (复用现有)
  → Stage2: AI 规划幻灯片 → slide_plan JSON → 回显到"生成/编辑" textarea
  → 用户审核/编辑 slide_plan
  → Stage3: 设计引擎 + slide_plan → python-pptx 原生创建 PPTX
```

核心改变：
- **废弃**：模板克隆、`_replace_slide_text`、`_clone_slide_from_shapes`
- **新增**：设计引擎 `ppt_designer.py`，从空白 slide 创建，AI 控制内容和布局
- **新增**：slide_plan 回显到前端 textarea，用户可编辑

## 设计引擎

`DesignSystem` 从模板 rules 中提取：
- 配色方案（主色、强调色、文字色、背景色）
- 字体规格（标题字号、正文字号、行高比）
- 间距规则（元素间距、页边距）

每个 layout type 对应一个 builder 函数，从空白 slide 创建：
| Layout Type | Builder | 说明 |
|---|---|---|
| cover | build_cover | 全色背景 + 居中标题/副标题/日期 |
| toc | build_toc | 左侧标题 + 编号列表 + 装饰线 |
| technique | build_technique | 标题栏 + 操作步骤 + 原理框 + 参数 |
| content | build_content | 标题 + 正文，适配长文本 |
| summary | build_summary | 总结标题 + 要点列表 |
| section | build_section | 章节分隔页 |

## API 变更

新增 `POST /api/ppt/plan`：
- 输入：content, template_id, provider_id, model
- 输出：`{ slide_plan: [{type, zones}] }` — AI 生成的幻灯片计划

修改 `POST /api/ppt/generate`：
- 新增可选字段 `slide_plan` — 如果提供，跳过 AI 阶段直接用设计引擎生成
- 输出新增 `slide_plan` 字段，同时返回文件名和幻灯片计划

## 前端变更

Stage 3 (3b/3c) 按钮拆分为两个：
1. "生成大纲" → 调用 `/api/ppt/plan` → 填充 textarea
2. "合成PPT" → 读取 textarea → 调用 `/api/ppt/generate`（带 slide_plan）
