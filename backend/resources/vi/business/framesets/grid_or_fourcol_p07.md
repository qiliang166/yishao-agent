# 框架 grid_or_fourcol_p07（页型：grid_or_fourcol）— 真实 PPT 提取，几何锁死

> 本框架**从真实 PPT 提取**：坐标/尺寸/字号/层级/配色 100% 来自 pptx，
> 由数据驱动渲染器（`backend/services/frameset_service.py` 的 `render_frame`）
> 按提取的 JSON 几何自动生成，**没有一个手写坐标**。
> 配色 = PPT 真实色映射到 VI 13 色变量（primary/secondary/accent/card_bg…）。
> 内容由大模型选中本框架后，把文字缩写/扩写填进固定格子，几何锁死不可改。
>
> 构成：6 个色块背板，22 个文字位。

---

## HTML 模板（必须照抄结构，只替换 {{占位符}} 内容）

```html
<div style="position:relative;width:1280px;height:720px;overflow:hidden;background:var(--background);font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="position:absolute;left:0.0%;top:0.0%;width:100.0%;height:7.22%;box-sizing:border-box;overflow:hidden;background:var(--primary);border-radius:8px;"></div>
  <div style="position:absolute;left:5.0%;top:1.39%;width:82.03%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:22.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{page_title#0}}</div>
  <div style="position:absolute;left:92.97%;top:1.39%;width:4.69%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.0;color:#ffffff;text-align:right;white-space:pre-line;">{{page_number#0}}</div>
  <div style="position:absolute;left:5.0%;top:10.0%;width:21.25%;height:47.22%;box-sizing:border-box;overflow:hidden;background:var(--primary);border-radius:8px;"></div>
  <div style="position:absolute;left:6.09%;top:11.39%;width:4.69%;height:5.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:28.0px;font-weight:900;line-height:1.0;color:var(--accent);text-align:left;white-space:pre-line;">{{item_index#0}}</div>
  <div style="position:absolute;left:6.09%;top:16.94%;width:19.06%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{item_title#0}}</div>
  <div style="position:absolute;left:6.09%;top:21.11%;width:19.06%;height:2.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.35;color:var(--accent);text-align:left;white-space:pre-line;">{{caption#0}}</div>
  <div style="position:absolute;left:6.09%;top:25.28%;width:19.06%;height:30.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{body_text#0}}</div>
  <div style="position:absolute;left:29.06%;top:10.0%;width:21.25%;height:47.22%;box-sizing:border-box;overflow:hidden;background:var(--secondary);border-radius:8px;"></div>
  <div style="position:absolute;left:30.16%;top:11.39%;width:4.69%;height:5.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:28.0px;font-weight:900;line-height:1.0;color:var(--accent);text-align:left;white-space:pre-line;">{{item_index#1}}</div>
  <div style="position:absolute;left:30.16%;top:16.94%;width:19.06%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{item_title#1}}</div>
  <div style="position:absolute;left:30.16%;top:21.11%;width:19.06%;height:2.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.35;color:var(--accent);text-align:left;white-space:pre-line;">{{caption#1}}</div>
  <div style="position:absolute;left:30.16%;top:25.28%;width:19.06%;height:30.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{body_text#1}}</div>
  <div style="position:absolute;left:53.12%;top:10.0%;width:21.25%;height:47.22%;box-sizing:border-box;overflow:hidden;background:var(--secondary);border-radius:8px;"></div>
  <div style="position:absolute;left:54.22%;top:11.39%;width:4.69%;height:5.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:28.0px;font-weight:900;line-height:1.0;color:var(--accent);text-align:left;white-space:pre-line;">{{item_index#2}}</div>
  <div style="position:absolute;left:54.22%;top:16.94%;width:19.06%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{item_title#2}}</div>
  <div style="position:absolute;left:54.22%;top:21.11%;width:19.06%;height:2.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.35;color:var(--accent);text-align:left;white-space:pre-line;">{{caption#2}}</div>
  <div style="position:absolute;left:54.22%;top:25.28%;width:19.06%;height:30.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{body_text#2}}</div>
  <div style="position:absolute;left:77.19%;top:10.0%;width:17.81%;height:47.22%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:78.28%;top:11.39%;width:4.69%;height:5.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:28.0px;font-weight:900;line-height:1.0;color:#ffffff;text-align:left;white-space:pre-line;">{{item_index#3}}</div>
  <div style="position:absolute;left:78.28%;top:16.94%;width:15.62%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{item_title#3}}</div>
  <div style="position:absolute;left:78.28%;top:21.11%;width:15.62%;height:2.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.35;color:#ffffff;text-align:left;white-space:pre-line;">{{caption#3}}</div>
  <div style="position:absolute;left:78.28%;top:25.28%;width:15.62%;height:30.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{body_text#3}}</div>
  <div style="position:absolute;left:5.0%;top:59.72%;width:90.0%;height:27.78%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:6.56%;top:61.11%;width:31.25%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:16.0px;font-weight:800;line-height:1.3;color:var(--secondary);text-align:left;white-space:pre-line;">{{lead_text#0}}</div>
  <div style="position:absolute;left:6.56%;top:65.83%;width:42.19%;height:19.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:var(--accent);text-align:left;white-space:pre-line;">{{body_text#4}}</div>
  <div style="position:absolute;left:50.0%;top:61.11%;width:0.0%;height:23.61%;box-sizing:border-box;overflow:hidden;border-left:1px solid rgba(var(--text-rgb),0.55);"></div>
  <div style="position:absolute;left:51.56%;top:65.83%;width:42.19%;height:19.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:var(--semantic-negative);text-align:left;white-space:pre-line;">{{body_text#5}}</div>
  <div style="position:absolute;left:5.0%;top:94.44%;width:46.88%;height:2.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:12.0px;font-weight:400;line-height:1.4;color:rgba(var(--text-rgb),0.55);text-align:left;white-space:pre-line;">{{footnote#0}}</div>
</div>
```

## 内容占位符（大模型按 content_key 填槽）

| 占位符 | 用途 | 字号 | 示例 |
|--------|------|------|------|
| `{{page_title#0}}` | 页面主标题 | fs=22.0 | 例：味之道：风味叠加的多维构建 |
| `{{page_number#0}}` | 页码 | fs=13.0 | 例：07 |
| `{{item_index#0}}` | 条目序号 | fs=28.0 | 例：01 |
| `{{item_title#0}}` | 条目标题 | fs=18.0 | 例：底味 |
| `{{caption#0}}` | 小注/说明 | fs=13.0 | 例：基础调味层 |
| `{{body_text#0}}` | 正文 | fs=13.0 | 例：凤爪焯水：白醋去腥软化
凤爪腌炸：生抽提 |
| `{{item_index#1}}` | 条目序号 | fs=28.0 | 例：02 |
| `{{item_title#1}}` | 条目标题 | fs=18.0 | 例：炖味 |
| `{{caption#1}}` | 小注/说明 | fs=13.0 | 例：复合香型骨架 |
| `{{body_text#1}}` | 正文 | fs=13.0 | 例：炖煮香料：姜、葱、香叶、八角
烹入花雕酒 |
| `{{item_index#2}}` | 条目序号 | fs=28.0 | 例：03 |
| `{{item_title#2}}` | 条目标题 | fs=18.0 | 例：本味 |
| `{{caption#2}}` | 小注/说明 | fs=13.0 | 例：独立风味注入 |
| `{{body_text#2}}` | 正文 | fs=13.0 | 例：花胶腌汁：大地鱼粉、高汤、蚝油、老抽
浸 |
| `{{item_index#3}}` | 条目序号 | fs=28.0 | 例：04 |
| `{{item_title#3}}` | 条目标题 | fs=18.0 | 例：顶味 |
| `{{caption#3}}` | 小注/说明 | fs=13.0 | 例：点睛之笔 |
| `{{body_text#3}}` | 正文 | fs=13.0 | 例：成品淋入鲍鱼汁
作用：在装盘瞬间提供浓郁 |
| `{{lead_text#0}}` | 引导句/小标题 | fs=16.0 | 例：分层调味 vs 一次性调味 |
| `{{body_text#4}}` | 正文 | fs=14.0 | 例：四重奏调味（本SOP）
每种食材保持独立 |
| `{{body_text#5}}` | 正文 | fs=14.0 | 例：一次性调味（常见错误）
所有食材味道雷同 |
| `{{footnote#0}}` | 脚注 | fs=12.0 | 例：Source: 「鲍鱼一品煲」SOP · |

- `page_number#*` 页码由系统按真实 seq/总页数自动覆盖，无需大模型填。
- 未被填的占位符渲染时清空为空串，不残留。

## 必须遵守

- **绝对禁止**修改任何布局尺寸（width/height/left/top/font-size）— 坐标均来自真实 PPT 提取，是护栏。
- **绝对禁止**修改 `var(--xxx)` 颜色变量 — 配色 = PPT 真实色映射，换配色只改 tokens.yaml。
- 唯一合法硬编码颜色为 `#ffffff` 及 `rgba(255,255,255,x)` / `rgba(0,0,0,x)`。
- 只能替换 `{{占位符}}` 为实际文字；过长缩写、过短扩写，填满不溢出。
- 本框架由代码填充（code-fill）+ fit-to-box 兜底，无需 LLM 生成 HTML。
