# A4 文档溢出分页 + 页头页尾代码注入 + PPT 页码隔离 + 图表拉链条修复 | 2026-06-30

## 变更概要

四项结构性修复，彻底消除 A4 文档与 PPT 幻灯片的硬编码耦合：(1) A4 页头/页尾由代码统一注入，不再依赖 LLM；(2) PPT 页码 badge 与 A4 文档隔离；(3) 内容溢出自动分页；(4) 多段环形图禁止圆角线帽。

## 文件变更

| 操作 | 文件 |
|------|------|
| 修改 | `backend/services/ppt_service.py` — 新增 `_preprocess_a4_slides`、`_split_a4_html_content`、`_extract_content_blocks`、`_estimate_block_height` 四个函数；`_assemble_html_deck` 新增 canvas_w/canvas_h 动态尺寸和 A4 页头页尾代码注入；修复 `_extract_content_blocks` 标签名解析 bug 并重写为统一深度追踪解析器 |
| 修改 | `backend/resources/vi/business/charts.md` — 环形图拆分为单段/多段；多段数据环禁止 `stroke-linecap="round"`，添加工整段边界的负值 dashoffset 示例 |
| 修改 | `backend/resources/vi/business/document.md` — 页头/页尾改为系统自动注入（LLM 禁止生成），A4 页头三列格式 + 页尾三列格式 |
| 修改 | `backend/resources/vi/business/blocks/header.md` — A4 文档三列标准页头规范 |
| 修改 | `backend/resources/vi/business/blocks/footer.md` — A4 文档三列标准页尾规范 |

## 验证结果

- Python 语法检查通过
- 单元测试：块提取（4 块正确）、嵌套 div、溢出分页（100 行表格 → 5 个溢出页）、非溢出表格不分割
- 集成测试：A4 竖版 → 白色背景 + 页头页尾注入 + 无 PPT badge；PPT 横版 → 正确 badge + 无 A4 页头
- 真实 col3 数据回归：6 张幻灯片全部通过（页头、页尾、无 PPT badge、794×1123 wrapper、white body bg）
- TypeScript 类型检查通过、前端 production build 通过、API 健康检查通过
