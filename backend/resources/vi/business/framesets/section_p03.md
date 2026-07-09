# 框架 section_p03（页型：section）— 真实 PPT 提取，几何锁死

> 本框架**从真实 PPT 提取**：坐标/尺寸/字号/层级/配色 100% 来自 pptx，
> 由数据驱动渲染器（`backend/services/frameset_service.py` 的 `render_frame`）
> 按提取的 JSON 几何自动生成，**没有一个手写坐标**。
> 配色 = PPT 真实色映射到 VI 13 色变量（primary/secondary/accent/card_bg…）。
> 内容由大模型选中本框架后，把文字缩写/扩写填进固定格子，几何锁死不可改。
>
> 构成：1 个色块背板，4 个文字位。

---

## HTML 模板（必须照抄结构，只替换 {{占位符}} 内容）

```html
<div style="position:relative;width:1280px;height:720px;overflow:hidden;background:var(--background);font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="position:absolute;left:0.0%;top:0.0%;width:3.75%;height:100.0%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:56.25%;top:16.67%;width:40.62%;height:16.67%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:80.0px;font-weight:900;line-height:0.9;color:#ffffff;text-align:left;white-space:pre-line;">{{hero_numeral#0}}</div>
  <div style="position:absolute;left:7.81%;top:38.89%;width:58.59%;height:7.22%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:36.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{section_title#0}}</div>
  <div style="position:absolute;left:7.81%;top:47.78%;width:7.81%;height:0.0%;box-sizing:border-box;overflow:hidden;border-top:1px solid var(--accent);"></div>
  <div style="position:absolute;left:7.81%;top:50.56%;width:54.69%;height:4.17%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.3;color:var(--accent);text-align:left;white-space:pre-line;">{{lead_text#0}}</div>
  <div style="position:absolute;left:84.38%;top:94.44%;width:12.5%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:14.0px;font-weight:400;line-height:1.4;color:var(--accent);text-align:left;white-space:pre-line;">{{footnote#0}}</div>
</div>
```

## 内容占位符（大模型按 content_key 填槽）

| 占位符 | 用途 | 字号 | 示例 |
|--------|------|------|------|
| `{{hero_numeral#0}}` | 大号数字 | fs=80.0 | 例：CHAPTER 01 |
| `{{section_title#0}}` | 章节大标题 | fs=36.0 | 例：道 — 烹饪理念与原理 |
| `{{lead_text#0}}` | 引导句/小标题 | fs=18.0 | 例：从"发、皮、序、味"四维度解读鲍鱼一品煲 |
| `{{footnote#0}}` | 脚注 | fs=14.0 | 例：第一章 / 共二章 |

- `page_number#*` 页码由系统按真实 seq/总页数自动覆盖，无需大模型填。
- 未被填的占位符渲染时清空为空串，不残留。

## 必须遵守

- **绝对禁止**修改任何布局尺寸（width/height/left/top/font-size）— 坐标均来自真实 PPT 提取，是护栏。
- **绝对禁止**修改 `var(--xxx)` 颜色变量 — 配色 = PPT 真实色映射，换配色只改 tokens.yaml。
- 唯一合法硬编码颜色为 `#ffffff` 及 `rgba(255,255,255,x)` / `rgba(0,0,0,x)`。
- 只能替换 `{{占位符}}` 为实际文字；过长缩写、过短扩写，填满不溢出。
- 本框架由代码填充（code-fill）+ fit-to-box 兜底，无需 LLM 生成 HTML。
