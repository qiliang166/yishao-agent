# 框架 content_p04（页型：content）— 真实 PPT 提取，几何锁死

> 本框架**从真实 PPT 提取**：坐标/尺寸/字号/层级/配色 100% 来自 pptx，
> 由数据驱动渲染器（`backend/services/frameset_service.py` 的 `render_frame`）
> 按提取的 JSON 几何自动生成，**没有一个手写坐标**。
> 配色 = PPT 真实色映射到 VI 13 色变量（primary/secondary/accent/card_bg…）。
> 内容由大模型选中本框架后，把文字缩写/扩写填进固定格子，几何锁死不可改。
>
> 构成：6 个色块背板，11 个文字位，1 张图。

---

## HTML 模板（必须照抄结构，只替换 {{占位符}} 内容）

```html
<div style="position:relative;width:1280px;height:720px;overflow:hidden;background:var(--background);font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="position:absolute;left:0.0%;top:0.0%;width:100.0%;height:7.22%;box-sizing:border-box;overflow:hidden;background:var(--primary);border-radius:8px;"></div>
  <div style="position:absolute;left:5.0%;top:1.39%;width:82.03%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:22.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{page_title#0}}</div>
  <div style="position:absolute;left:92.97%;top:1.39%;width:4.69%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.0;color:#ffffff;text-align:right;white-space:pre-line;">{{page_number#0}}</div>
  <div style="position:absolute;left:5.0%;top:10.0%;width:29.69%;height:38.89%;box-sizing:border-box;overflow:hidden;background:rgba(var(--text-rgb),0.04);border-radius:8px;display:flex;flex-direction:column;justify-content:center;font-size:14px;font-weight:600;line-height:1.35;color:var(--text);text-align:center;white-space:pre-line;">{{image#0}}</div>
  <div style="position:absolute;left:36.25%;top:10.0%;width:58.75%;height:38.89%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:36.25%;top:10.0%;width:58.75%;height:0.42%;box-sizing:border-box;overflow:hidden;background:var(--secondary);border-radius:8px;"></div>
  <div style="position:absolute;left:37.81%;top:11.67%;width:55.62%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.3;color:var(--secondary);text-align:left;white-space:pre-line;">{{lead_text#0}}</div>
  <div style="position:absolute;left:37.81%;top:16.39%;width:55.62%;height:30.56%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:15.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#0}}</div>
  <div style="position:absolute;left:5.0%;top:51.67%;width:44.06%;height:19.44%;box-sizing:border-box;overflow:hidden;background:var(--primary);border-radius:8px;"></div>
  <div style="position:absolute;left:6.56%;top:53.06%;width:15.62%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:14.0px;font-weight:700;line-height:1.3;color:var(--accent);text-align:left;white-space:pre-line;">{{item_subtitle#0}}</div>
  <div style="position:absolute;left:6.56%;top:56.94%;width:40.94%;height:12.5%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{body_text#1}}</div>
  <div style="position:absolute;left:50.94%;top:51.67%;width:44.06%;height:19.44%;box-sizing:border-box;overflow:hidden;background:var(--semantic-negative);border-radius:8px;"></div>
  <div style="position:absolute;left:52.5%;top:53.06%;width:15.62%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:14.0px;font-weight:700;line-height:1.3;color:var(--text);text-align:left;white-space:pre-line;">{{item_subtitle#1}}</div>
  <div style="position:absolute;left:52.5%;top:56.94%;width:40.94%;height:12.5%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{body_text#2}}</div>
  <div style="position:absolute;left:5.0%;top:73.61%;width:90.0%;height:8.33%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:6.56%;top:74.72%;width:86.88%;height:6.11%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#3}}</div>
  <div style="position:absolute;left:5.0%;top:94.44%;width:46.88%;height:2.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:12.0px;font-weight:400;line-height:1.4;color:rgba(var(--text-rgb),0.55);text-align:left;white-space:pre-line;">{{footnote#0}}</div>
</div>
```

## 内容占位符（大模型按 content_key 填槽）

| 占位符 | 用途 | 字号 | 示例 |
|--------|------|------|------|
| `{{page_title#0}}` | 页面主标题 | fs=22.0 | 例：发之道：海味的深度唤醒 |
| `{{page_number#0}}` | 页码 | fs=13.0 | 例：04 |
| `{{image#0}}` | 图片区(可填说明或留作配图) | fs=None | 例： |
| `{{lead_text#0}}` | 引导句/小标题 | fs=18.0 | 例：核心原理：干制-复水的精准控制 |
| `{{body_text#0}}` | 正文 | fs=15.0 | 例：花胶处理：先蒸20分钟软化坚硬结构，再以 |
| `{{item_subtitle#0}}` | 条目副标题 | fs=14.0 | 例：正确操作结果 |
| `{{body_text#1}}` | 正文 | fs=14.0 | 例：花胶：软糯Q弹，胶质完整保留
花菇：菇香 |
| `{{item_subtitle#1}}` | 条目副标题 | fs=14.0 | 例：错误操作后果 |
| `{{body_text#2}}` | 正文 | fs=14.0 | 例：花胶沸水复水：外层糊化软烂，内部硬芯
花 |
| `{{body_text#3}}` | 正文 | fs=14.0 | 例：关键参数：花胶：蒸20min → 50℃ |
| `{{footnote#0}}` | 脚注 | fs=12.0 | 例：Source: 「鲍鱼一品煲」SOP 技 |

- `page_number#*` 页码由系统按真实 seq/总页数自动覆盖，无需大模型填。
- 未被填的占位符渲染时清空为空串，不残留。

## 必须遵守

- **绝对禁止**修改任何布局尺寸（width/height/left/top/font-size）— 坐标均来自真实 PPT 提取，是护栏。
- **绝对禁止**修改 `var(--xxx)` 颜色变量 — 配色 = PPT 真实色映射，换配色只改 tokens.yaml。
- 唯一合法硬编码颜色为 `#ffffff` 及 `rgba(255,255,255,x)` / `rgba(0,0,0,x)`。
- 只能替换 `{{占位符}}` 为实际文字；过长缩写、过短扩写，填满不溢出。
- 本框架由代码填充（code-fill）+ fit-to-box 兜底，无需 LLM 生成 HTML。
