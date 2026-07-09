# 框架 cover_p01（页型：cover）— 真实 PPT 提取，几何锁死

> 本框架**从真实 PPT 提取**：坐标/尺寸/字号/层级/配色 100% 来自 pptx，
> 由数据驱动渲染器（`backend/services/frameset_service.py` 的 `render_frame`）
> 按提取的 JSON 几何自动生成，**没有一个手写坐标**。
> 配色 = PPT 真实色映射到 VI 13 色变量（primary/secondary/accent/card_bg…）。
> 内容由大模型选中本框架后，把文字缩写/扩写填进固定格子，几何锁死不可改。
>
> 构成：2 个色块背板，4 个文字位，1 张图。

---

## HTML 模板（必须照抄结构，只替换 {{占位符}} 内容）

```html
<div style="position:relative;width:1280px;height:720px;overflow:hidden;background:var(--background);font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="position:absolute;left:0.0%;top:0.0%;width:100.0%;height:100.0%;box-sizing:border-box;overflow:hidden;background:rgba(var(--text-rgb),0.04);border-radius:8px;"></div>
  <div style="position:absolute;left:0.0%;top:0.0%;width:9.38%;height:16.67%;box-sizing:border-box;overflow:hidden;background:#ffffff;border-radius:8px;"></div>
  <div style="position:absolute;left:90.62%;top:83.33%;width:9.38%;height:16.67%;box-sizing:border-box;overflow:hidden;background:#ffffff;border-radius:8px;"></div>
  <div style="position:absolute;left:42.19%;top:26.67%;width:15.62%;height:0.0%;box-sizing:border-box;overflow:hidden;border-top:1px solid var(--accent);"></div>
  <div style="position:absolute;left:42.19%;top:27.22%;width:15.62%;height:0.0%;box-sizing:border-box;overflow:hidden;border-top:1px solid var(--accent);"></div>
  <div style="position:absolute;left:10.94%;top:30.56%;width:78.12%;height:8.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:44.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{section_title#0}}</div>
  <div style="position:absolute;left:18.75%;top:41.67%;width:62.5%;height:5.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:22.0px;font-weight:800;line-height:1.2;color:var(--accent);text-align:left;white-space:pre-line;">{{section_title#1}}</div>
  <div style="position:absolute;left:38.28%;top:77.78%;width:23.44%;height:0.0%;box-sizing:border-box;overflow:hidden;border-top:1px solid var(--accent);"></div>
  <div style="position:absolute;left:26.56%;top:80.56%;width:46.88%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{body_text#0}}</div>
  <div style="position:absolute;left:26.56%;top:84.72%;width:46.88%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{body_text#1}}</div>
</div>
```

## 内容占位符（大模型按 content_key 填槽）

| 占位符 | 用途 | 字号 | 示例 |
|--------|------|------|------|
| `{{section_title#0}}` | 章节大标题 | fs=44.0 | 例：「鲍鱼一品煲」SOP 的"道"与"术" |
| `{{section_title#1}}` | 章节大标题 | fs=22.0 | 例：烹饪原理深度解析 × 可复用通用流程提炼 |
| `{{body_text#0}}` | 正文 | fs=14.0 | 例：菜品研发与标准化操作解析 |
| `{{body_text#1}}` | 正文 | fs=14.0 | 例：2025年 · 内部技术文档 |

- `page_number#*` 页码由系统按真实 seq/总页数自动覆盖，无需大模型填。
- 未被填的占位符渲染时清空为空串，不残留。

## 必须遵守

- **绝对禁止**修改任何布局尺寸（width/height/left/top/font-size）— 坐标均来自真实 PPT 提取，是护栏。
- **绝对禁止**修改 `var(--xxx)` 颜色变量 — 配色 = PPT 真实色映射，换配色只改 tokens.yaml。
- 唯一合法硬编码颜色为 `#ffffff` 及 `rgba(255,255,255,x)` / `rgba(0,0,0,x)`。
- 只能替换 `{{占位符}}` 为实际文字；过长缩写、过短扩写，填满不溢出。
- 本框架由代码填充（code-fill）+ fit-to-box 兜底，无需 LLM 生成 HTML。
