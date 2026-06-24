# 模板自适应排版间距系统

**日期**: 2026-06-24
**状态**: 设计完成

## 目标

将 PPT 间距系统从"硬编码绝对 EMU 值"改为"从模板实际排版数据按比例计算"。
JSON 规则存储设计约束（比例 + 规范），具体间距值从模板字体数据动态派生。

## 数据流

```
栏目JSON规则 (typography_spec: 提取清单 + 规范兜底值)
    ↓
代码提取 (_extract_typography: 从模板XML提取实际值)
    ↓ (有缺漏的)
AI分析 (analyze_template: 按规范补全缺失值)
    ↓
模板 typography_profile (完整、无缺漏，存入templates表)
    ↓
PPT生成 (_normalize_spacing: 读取profile，计算间距)
```

## 第一层：栏目JSON规则 — typography_spec

在 col4/col5 的 `design_rules` 下新增 `typography_spec`。
只描述要提取什么、提取不到用什么兜底值：

```json
"typography_spec": {
  "body_font_size_pt": {
    "extract": "母版 bodyStyle 中最频繁字号；若无则检查占位符 defRPr[@sz]",
    "fallback": 18,
    "rationale": "ISO/IEC 29500 默认 18pt"
  },
  "title_font_size_pt": {
    "extract": "母版 titleStyle 字号；若无则检查布局标题占位符 defRPr[@sz]",
    "fallback": 36,
    "rationale": "国开标准标题 >= 36pt"
  },
  "line_height_ratio": {
    "extract": "母版 bodyPr.normAutofit.fontScale；若无则 para.pPr.lnSpc.spcPct / 100000",
    "fallback": 1.2,
    "rationale": "国开标准行距 1.0-1.5 倍，SJ/T 11841.6.1 推荐 >= 1.2"
  }
}
```

## 第二层：代码提取 — _extract_typography(prs)

新增在 `ppt_service.py`。

核心逻辑：
1. 遍历所有 slide 的 run.font.size，收集字号分布
2. 对于 font.size == None 的 run，沿 XML 继承链查找：
   run.rPr[@sz] → para.defRPr[@sz] → layout placeholder → master bodyStyle/titleStyle
3. 统计：最大字号 = 标题，最频繁字号（排除最大最小）= 正文
4. 从母版 XML 提取行高倍率

输出：`{body_font_size_pt, title_font_size_pt, line_height_ratio}`，
提取不到的字段为 null。

## 第三层：AI 分析补漏 — analyze_template

extract_pptx_structure() 输出中加入 typography 提取结果。
发给 AI 的 system_prompt 增加：

```
## 排版属性提取
typography_spec 定义了需要提取的排版属性及其规范兜底值。
typography_extracted 是代码从模板中提取到的实际值（null 表示未提取到）。
对于 typography_extracted 中为 null 的字段，请按 typography_spec 的 fallback + rationale 补全，
输出为 typography_profile，必须包含所有字段且均非 null。
```

AI 输出写入 templates 表新增的 `typography_profile` 列（JSON 文本）。

## 第四层：PPT 生成 — _normalize_spacing

`generate_ppt()` 从 templates 表读取 typography_profile，
以实际值计算间距：

```
line_height_emu    = body_font_size_pt × line_height_ratio × 12700
element_min_gap    = line_height_emu × 0.33   (同级元素间距，1/3 行高)
text_to_line_gap   = line_height_emu × 0.25   (文字到装饰线，1/4 行高)
title_to_line_gap  = title_font_size_pt × 0.20 × 12700 (标题到装饰线)
peer_tolerance     = line_height_emu × 0.15   (同行容差)
```

如果 typography_profile 不存在（旧模板），fallback 到现有 _SPACING_DEFAULTS。

## 间距比例设计依据

| 比例 | 值 | 依据 |
|------|-----|------|
| element_gap / line_height | 0.33 | 国开标准：层级缩进 >= 1 字符；ISO 24896 视觉元素一致间距 |
| text_line_gap / line_height | 0.25 | SJ/T 11841.6.1 视觉舒适度；标题与装饰线紧密关联 |
| title_gap / title_size | 0.20 | 标题字号较大，比例缩小避免间距过大 |
| peer_tolerance / line_height | 0.15 | ISO 24896：同行元素对齐容差 |

## 文件改动清单

| # | 文件 | 操作 |
|---|------|------|
| 1 | `backend/database.py` | col4/col5 rules 新增 typography_spec；templates 表新增 typography_profile 列；数据迁移 |
| 2 | `backend/services/ppt_service.py` | 新增 _extract_typography()；_normalize_spacing 改为比例计算；generate_ppt 读取 profile |
| 3 | `backend/app.py` | extract_pptx_structure 增加 typography 提取输出；analyze_template prompt 增加补漏指令 |

## 验证

1. `cd frontend && npx tsc --noEmit && npm run build` 0 errors
2. curl 验证 col4/col5 rules 含 typography_spec，不含硬编码 EMU 值
3. 上传 .pptx → 智能解析 → AI 返回的 typography_profile 无 null
4. PPT 生成后所有元素间距 >= 5px，无重叠
5. 回归：health / projects / column-configs / templates / prompts 全部 200 OK
