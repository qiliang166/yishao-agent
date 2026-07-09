# 框架 closing_p16（页型：closing）— 真实 PPT 提取，几何锁死

> 本框架**从真实 PPT 提取**：坐标/尺寸/字号/层级/配色 100% 来自 pptx，
> 由数据驱动渲染器（`backend/services/frameset_service.py` 的 `render_frame`）
> 按提取的 JSON 几何自动生成，**没有一个手写坐标**。
> 配色 = PPT 真实色映射到 VI 13 色变量（primary/secondary/accent/card_bg…）。
> 内容由大模型选中本框架后，把文字缩写/扩写填进固定格子，几何锁死不可改。
>
> 构成：5 个色块背板，11 个文字位。

---

## HTML 模板（必须照抄结构，只替换 {{占位符}} 内容）

```html
<div style="position:relative;width:1280px;height:720px;overflow:hidden;background:var(--background);font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="position:absolute;left:0.0%;top:0.0%;width:9.38%;height:16.67%;box-sizing:border-box;overflow:hidden;background:#ffffff;border-radius:8px;"></div>
  <div style="position:absolute;left:90.62%;top:83.33%;width:9.38%;height:16.67%;box-sizing:border-box;overflow:hidden;background:#ffffff;border-radius:8px;"></div>
  <div style="position:absolute;left:18.75%;top:6.67%;width:62.5%;height:6.11%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:32.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{page_title#0}}</div>
  <div style="position:absolute;left:42.19%;top:14.44%;width:15.62%;height:0.0%;box-sizing:border-box;overflow:hidden;border-top:1px solid var(--accent);"></div>
  <div style="position:absolute;left:42.19%;top:15.0%;width:15.62%;height:0.0%;box-sizing:border-box;overflow:hidden;border-top:1px solid var(--accent);"></div>
  <div style="position:absolute;left:10.94%;top:20.56%;width:0.94%;height:1.67%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:12.81%;top:19.44%;width:65.62%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.3;color:#ffffff;text-align:left;white-space:pre-line;">{{lead_text#0}}</div>
  <div style="position:absolute;left:10.94%;top:27.5%;width:0.94%;height:1.67%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:12.81%;top:26.39%;width:65.62%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.3;color:#ffffff;text-align:left;white-space:pre-line;">{{lead_text#1}}</div>
  <div style="position:absolute;left:10.94%;top:34.44%;width:0.94%;height:1.67%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:12.81%;top:33.33%;width:65.62%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.3;color:#ffffff;text-align:left;white-space:pre-line;">{{lead_text#2}}</div>
  <div style="position:absolute;left:10.94%;top:40.28%;width:78.12%;height:0.0%;box-sizing:border-box;overflow:hidden;border-top:1px solid #ffffff;"></div>
  <div style="position:absolute;left:10.94%;top:43.89%;width:39.06%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:20.0px;font-weight:800;line-height:1.2;color:var(--accent);text-align:left;white-space:pre-line;">{{item_title#0}}</div>
  <div style="position:absolute;left:10.94%;top:50.28%;width:78.12%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.3;color:#ffffff;text-align:left;white-space:pre-line;">{{lead_text#3}}</div>
  <div style="position:absolute;left:10.94%;top:55.56%;width:78.12%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.3;color:#ffffff;text-align:left;white-space:pre-line;">{{lead_text#4}}</div>
  <div style="position:absolute;left:10.94%;top:60.83%;width:78.12%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.3;color:#ffffff;text-align:left;white-space:pre-line;">{{lead_text#5}}</div>
  <div style="position:absolute;left:10.94%;top:66.11%;width:78.12%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.3;color:#ffffff;text-align:left;white-space:pre-line;">{{lead_text#6}}</div>
  <div style="position:absolute;left:10.94%;top:72.22%;width:78.12%;height:0.0%;box-sizing:border-box;overflow:hidden;border-top:1px solid #ffffff;"></div>
  <div style="position:absolute;left:26.56%;top:76.39%;width:46.88%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{body_text#0}}</div>
  <div style="position:absolute;left:26.56%;top:80.56%;width:46.88%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{body_text#1}}</div>
</div>
```

## 内容占位符（大模型按 content_key 填槽）

| 占位符 | 用途 | 字号 | 示例 |
|--------|------|------|------|
| `{{page_title#0}}` | 页面主标题 | fs=32.0 | 例：以道驭术，以术证道 |
| `{{lead_text#0}}` | 引导句/小标题 | fs=18.0 | 例："道"提供烹饪的底层逻辑与判断标准 —— |
| `{{lead_text#1}}` | 引导句/小标题 | fs=18.0 | 例："术"提供可执行的操作参数与纠偏方法 — |
| `{{lead_text#2}}` | 引导句/小标题 | fs=18.0 | 例：二者结合形成从单一菜品到通用流程的完整知 |
| `{{item_title#0}}` | 条目标题 | fs=20.0 | 例：核心要点回顾 |
| `{{lead_text#3}}` | 引导句/小标题 | fs=18.0 | 例：发之道：精准复水是唤醒干制海味的关键第一 |
| `{{lead_text#4}}` | 引导句/小标题 | fs=18.0 | 例：皮之道：四步工艺链决定虎皮成败，每步不可 |
| `{{lead_text#5}}` | 引导句/小标题 | fs=18.0 | 例：序之道：分时投料是口感层次分明的核心保障 |
| `{{lead_text#6}}` | 引导句/小标题 | fs=18.0 | 例：味之道：四重调味体系构建立体风味，避免大 |
| `{{body_text#0}}` | 正文 | fs=14.0 | 例：菜品研发技术部 · 内部培训资料 |
| `{{body_text#1}}` | 正文 | fs=14.0 | 例：本文基于「鲍鱼一品煲」SOP整理，保留核 |

- `page_number#*` 页码由系统按真实 seq/总页数自动覆盖，无需大模型填。
- 未被填的占位符渲染时清空为空串，不残留。

## 必须遵守

- **绝对禁止**修改任何布局尺寸（width/height/left/top/font-size）— 坐标均来自真实 PPT 提取，是护栏。
- **绝对禁止**修改 `var(--xxx)` 颜色变量 — 配色 = PPT 真实色映射，换配色只改 tokens.yaml。
- 唯一合法硬编码颜色为 `#ffffff` 及 `rgba(255,255,255,x)` / `rgba(0,0,0,x)`。
- 只能替换 `{{占位符}}` 为实际文字；过长缩写、过短扩写，填满不溢出。
- 本框架由代码填充（code-fill）+ fit-to-box 兜底，无需 LLM 生成 HTML。
