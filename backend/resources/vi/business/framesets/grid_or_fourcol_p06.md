# 框架 grid_or_fourcol_p06（页型：grid_or_fourcol）— 真实 PPT 提取，几何锁死

> 本框架**从真实 PPT 提取**：坐标/尺寸/字号/层级/配色 100% 来自 pptx，
> 由数据驱动渲染器（`backend/services/frameset_service.py` 的 `render_frame`）
> 按提取的 JSON 几何自动生成，**没有一个手写坐标**。
> 配色 = PPT 真实色映射到 VI 13 色变量（primary/secondary/accent/card_bg…）。
> 内容由大模型选中本框架后，把文字缩写/扩写填进固定格子，几何锁死不可改。
>
> 构成：20 个色块背板，17 个文字位。

---

## HTML 模板（必须照抄结构，只替换 {{占位符}} 内容）

```html
<div style="position:relative;width:1280px;height:720px;overflow:hidden;background:var(--background);font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="position:absolute;left:0.0%;top:0.0%;width:100.0%;height:7.22%;box-sizing:border-box;overflow:hidden;background:var(--primary);border-radius:8px;"></div>
  <div style="position:absolute;left:5.0%;top:1.39%;width:82.03%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:22.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{page_title#0}}</div>
  <div style="position:absolute;left:92.97%;top:1.39%;width:4.69%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.0;color:#ffffff;text-align:right;white-space:pre-line;">{{page_number#0}}</div>
  <div style="position:absolute;left:5.0%;top:10.0%;width:90.0%;height:8.33%;box-sizing:border-box;overflow:hidden;background:var(--primary);border-radius:8px;"></div>
  <div style="position:absolute;left:6.56%;top:10.83%;width:86.88%;height:6.67%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:16.0px;font-weight:800;line-height:1.3;color:#ffffff;text-align:left;white-space:pre-line;">{{lead_text#0}}</div>
  <div style="position:absolute;left:7.81%;top:29.17%;width:84.38%;height:0.0%;box-sizing:border-box;overflow:hidden;border-top:3px solid var(--primary);"></div>
  <div style="position:absolute;left:7.81%;top:28.06%;width:1.25%;height:2.22%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:5.47%;top:23.61%;width:5.94%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:14.0px;font-weight:700;line-height:1.3;color:var(--accent);text-align:left;white-space:pre-line;">{{item_subtitle#0}}</div>
  <div style="position:absolute;left:35.94%;top:28.06%;width:1.25%;height:2.22%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:33.2%;top:23.61%;width:6.72%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:14.0px;font-weight:700;line-height:1.3;color:var(--accent);text-align:left;white-space:pre-line;">{{item_subtitle#1}}</div>
  <div style="position:absolute;left:64.06%;top:28.06%;width:1.25%;height:2.22%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:61.33%;top:23.61%;width:6.72%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:14.0px;font-weight:700;line-height:1.3;color:var(--accent);text-align:left;white-space:pre-line;">{{item_subtitle#2}}</div>
  <div style="position:absolute;left:90.62%;top:28.06%;width:1.25%;height:2.22%;box-sizing:border-box;overflow:hidden;background:var(--secondary);border-radius:8px;"></div>
  <div style="position:absolute;left:88.28%;top:23.61%;width:5.94%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:14.0px;font-weight:700;line-height:1.3;color:var(--secondary);text-align:left;white-space:pre-line;">{{item_subtitle#3}}</div>
  <div style="position:absolute;left:5.0%;top:34.72%;width:21.09%;height:33.33%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:5.0%;top:34.72%;width:21.09%;height:0.42%;box-sizing:border-box;overflow:hidden;background:var(--secondary);border-radius:8px;"></div>
  <div style="position:absolute;left:6.37%;top:36.67%;width:1.64%;height:3.33%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:8.75%;top:36.67%;width:15.62%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:16.0px;font-weight:800;line-height:1.2;color:var(--secondary);text-align:left;white-space:pre-line;">{{item_title#0}}</div>
  <div style="position:absolute;left:6.25%;top:41.39%;width:18.59%;height:25.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#0}}</div>
  <div style="position:absolute;left:27.66%;top:34.72%;width:21.09%;height:33.33%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:27.66%;top:34.72%;width:21.09%;height:0.42%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:28.91%;top:36.67%;width:1.88%;height:3.33%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:31.41%;top:36.67%;width:15.62%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:16.0px;font-weight:800;line-height:1.3;color:var(--secondary);text-align:left;white-space:pre-line;">{{lead_text#1}}</div>
  <div style="position:absolute;left:28.91%;top:41.39%;width:18.59%;height:25.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#1}}</div>
  <div style="position:absolute;left:50.31%;top:34.72%;width:21.09%;height:33.33%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:50.31%;top:34.72%;width:21.09%;height:0.42%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:51.8%;top:36.67%;width:1.41%;height:3.33%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:54.06%;top:36.67%;width:15.62%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:16.0px;font-weight:800;line-height:1.3;color:var(--secondary);text-align:left;white-space:pre-line;">{{lead_text#2}}</div>
  <div style="position:absolute;left:51.56%;top:41.39%;width:18.59%;height:25.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#2}}</div>
  <div style="position:absolute;left:72.97%;top:34.72%;width:22.03%;height:33.33%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:72.97%;top:34.72%;width:22.03%;height:0.42%;box-sizing:border-box;overflow:hidden;background:var(--secondary);border-radius:8px;"></div>
  <div style="position:absolute;left:74.22%;top:36.67%;width:1.88%;height:3.33%;box-sizing:border-box;overflow:hidden;background:var(--secondary);border-radius:8px;"></div>
  <div style="position:absolute;left:76.72%;top:36.67%;width:16.41%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:16.0px;font-weight:800;line-height:1.2;color:var(--secondary);text-align:left;white-space:pre-line;">{{item_title#1}}</div>
  <div style="position:absolute;left:74.22%;top:41.39%;width:19.53%;height:25.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#3}}</div>
  <div style="position:absolute;left:5.0%;top:70.83%;width:90.0%;height:11.11%;box-sizing:border-box;overflow:hidden;background:var(--semantic-negative);border-radius:8px;"></div>
  <div style="position:absolute;left:6.56%;top:73.61%;width:1.88%;height:3.33%;box-sizing:border-box;overflow:hidden;background:var(--semantic-negative);border-radius:8px;"></div>
  <div style="position:absolute;left:9.38%;top:72.22%;width:84.38%;height:8.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{body_text#4}}</div>
  <div style="position:absolute;left:5.0%;top:94.44%;width:46.88%;height:2.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:12.0px;font-weight:400;line-height:1.4;color:rgba(var(--text-rgb),0.55);text-align:left;white-space:pre-line;">{{footnote#0}}</div>
</div>
```

## 内容占位符（大模型按 content_key 填槽）

| 占位符 | 用途 | 字号 | 示例 |
|--------|------|------|------|
| `{{page_title#0}}` | 页面主标题 | fs=22.0 | 例：序之道：分时投料的口感交响 |
| `{{page_number#0}}` | 页码 | fs=13.0 | 例：06 |
| `{{lead_text#0}}` | 引导句/小标题 | fs=16.0 | 例：根本法则："难熟先下，易熟后下" ——  |
| `{{item_subtitle#0}}` | 条目副标题 | fs=14.0 | 例：T+0 |
| `{{item_subtitle#1}}` | 条目副标题 | fs=14.0 | 例：T+60min |
| `{{item_subtitle#2}}` | 条目副标题 | fs=14.0 | 例：T+75min |
| `{{item_subtitle#3}}` | 条目副标题 | fs=14.0 | 例：出品 |
| `{{item_title#0}}` | 条目标题 | fs=16.0 | 例：凤爪（T+0 下锅） |
| `{{body_text#0}}` | 正文 | fs=13.0 | 例：炖煮时长：60分钟
食材特性：质地坚韧， |
| `{{lead_text#1}}` | 引导句/小标题 | fs=16.0 | 例：鲍鱼（T+60min 下锅） |
| `{{body_text#1}}` | 正文 | fs=13.0 | 例：炖煮时长：15分钟
食材特性：已开水定型 |
| `{{lead_text#2}}` | 引导句/小标题 | fs=16.0 | 例：花胶（T+75min 浸泡） |
| `{{body_text#2}}` | 正文 | fs=13.0 | 例：处理时长：20-30分钟
食材特性：泡发 |
| `{{item_title#1}}` | 条目标题 | fs=16.0 | 例：花菇（全程垫底） |
| `{{body_text#3}}` | 正文 | fs=13.0 | 例：炖煮时长：全程
食材特性：耐炖且持续释放 |
| `{{body_text#4}}` | 正文 | fs=14.0 | 例：同时下锅的后果：凤爪软糯时，鲍鱼已老如橡 |
| `{{footnote#0}}` | 脚注 | fs=12.0 | 例：Source: 「鲍鱼一品煲」SOP · |

- `page_number#*` 页码由系统按真实 seq/总页数自动覆盖，无需大模型填。
- 未被填的占位符渲染时清空为空串，不残留。

## 必须遵守

- **绝对禁止**修改任何布局尺寸（width/height/left/top/font-size）— 坐标均来自真实 PPT 提取，是护栏。
- **绝对禁止**修改 `var(--xxx)` 颜色变量 — 配色 = PPT 真实色映射，换配色只改 tokens.yaml。
- 唯一合法硬编码颜色为 `#ffffff` 及 `rgba(255,255,255,x)` / `rgba(0,0,0,x)`。
- 只能替换 `{{占位符}}` 为实际文字；过长缩写、过短扩写，填满不溢出。
- 本框架由代码填充（code-fill）+ fit-to-box 兜底，无需 LLM 生成 HTML。
