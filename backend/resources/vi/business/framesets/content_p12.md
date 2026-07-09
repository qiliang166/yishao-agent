# 框架 content_p12（页型：content）— 真实 PPT 提取，几何锁死

> 本框架**从真实 PPT 提取**：坐标/尺寸/字号/层级/配色 100% 来自 pptx，
> 由数据驱动渲染器（`backend/services/frameset_service.py` 的 `render_frame`）
> 按提取的 JSON 几何自动生成，**没有一个手写坐标**。
> 配色 = PPT 真实色映射到 VI 13 色变量（primary/secondary/accent/card_bg…）。
> 内容由大模型选中本框架后，把文字缩写/扩写填进固定格子，几何锁死不可改。
>
> 构成：6 个色块背板，17 个文字位。

---

## HTML 模板（必须照抄结构，只替换 {{占位符}} 内容）

```html
<div style="position:relative;width:1280px;height:720px;overflow:hidden;background:var(--background);font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="position:absolute;left:0.0%;top:0.0%;width:100.0%;height:7.22%;box-sizing:border-box;overflow:hidden;background:var(--primary);border-radius:8px;"></div>
  <div style="position:absolute;left:5.0%;top:1.39%;width:82.03%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:22.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{page_title#0}}</div>
  <div style="position:absolute;left:92.97%;top:1.39%;width:4.69%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.0;color:#ffffff;text-align:right;white-space:pre-line;">{{page_number#0}}</div>
  <div style="position:absolute;left:5.0%;top:10.0%;width:44.06%;height:52.78%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:5.0%;top:10.0%;width:44.06%;height:0.56%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:6.09%;top:11.67%;width:7.5%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:24.0px;font-weight:800;line-height:1.2;color:var(--accent);text-align:left;white-space:pre-line;">{{section_title#0}}</div>
  <div style="position:absolute;left:6.09%;top:16.39%;width:41.41%;height:3.61%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:16.0px;font-weight:800;line-height:1.2;color:var(--secondary);text-align:left;white-space:pre-line;">{{item_title#0}}</div>
  <div style="position:absolute;left:6.09%;top:20.83%;width:41.41%;height:3.06%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:14.0px;font-weight:700;line-height:1.3;color:var(--accent);text-align:left;white-space:pre-line;">{{item_subtitle#0}}</div>
  <div style="position:absolute;left:6.09%;top:24.44%;width:41.41%;height:8.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#0}}</div>
  <div style="position:absolute;left:6.09%;top:33.33%;width:41.41%;height:3.06%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:var(--accent);text-align:left;white-space:pre-line;">{{body_text#1}}</div>
  <div style="position:absolute;left:6.09%;top:36.94%;width:41.41%;height:6.11%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.35;color:var(--text);text-align:left;white-space:pre-line;">{{caption#0}}</div>
  <div style="position:absolute;left:6.09%;top:43.61%;width:41.41%;height:3.06%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:var(--accent);text-align:left;white-space:pre-line;">{{body_text#2}}</div>
  <div style="position:absolute;left:6.09%;top:47.22%;width:41.41%;height:6.11%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#3}}</div>
  <div style="position:absolute;left:6.09%;top:54.17%;width:41.41%;height:6.94%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:var(--secondary);text-align:left;white-space:pre-line;">{{body_text#4}}</div>
  <div style="position:absolute;left:50.94%;top:10.0%;width:44.06%;height:52.78%;box-sizing:border-box;overflow:hidden;background:var(--primary);border-radius:8px;"></div>
  <div style="position:absolute;left:50.94%;top:10.0%;width:44.06%;height:0.56%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:52.03%;top:11.67%;width:7.5%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:24.0px;font-weight:800;line-height:1.2;color:var(--accent);text-align:left;white-space:pre-line;">{{section_title#1}}</div>
  <div style="position:absolute;left:52.03%;top:16.39%;width:41.41%;height:3.61%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:16.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{item_title#1}}</div>
  <div style="position:absolute;left:52.03%;top:21.39%;width:41.41%;height:30.56%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{body_text#5}}</div>
  <div style="position:absolute;left:52.03%;top:52.78%;width:41.41%;height:9.17%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:var(--accent);text-align:left;white-space:pre-line;">{{body_text#6}}</div>
  <div style="position:absolute;left:5.0%;top:65.56%;width:90.0%;height:11.11%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:6.56%;top:66.67%;width:86.88%;height:8.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#7}}</div>
  <div style="position:absolute;left:5.0%;top:94.44%;width:46.88%;height:2.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:12.0px;font-weight:400;line-height:1.4;color:rgba(var(--text-rgb),0.55);text-align:left;white-space:pre-line;">{{footnote#0}}</div>
</div>
```

## 内容占位符（大模型按 content_key 填槽）

| 占位符 | 用途 | 字号 | 示例 |
|--------|------|------|------|
| `{{page_title#0}}` | 页面主标题 | fs=22.0 | 例：分步操作卡：核心炖煮与出品组装（下） |
| `{{page_number#0}}` | 页码 | fs=13.0 | 例：12 |
| `{{section_title#0}}` | 章节大标题 | fs=24.0 | 例：Step 4 |
| `{{item_title#0}}` | 条目标题 | fs=16.0 | 例：核心炖煮工艺 |
| `{{item_subtitle#0}}` | 条目副标题 | fs=14.0 | 例：① 炒香料与调汤 |
| `{{body_text#0}}` | 正文 | fs=13.0 | 例：热锅冷油，爆香姜片、葱段、香叶、八角
烹 |
| `{{body_text#1}}` | 正文 | fs=14.0 | 例：② 阶段一：凤爪炖煮（T+0） |
| `{{caption#0}}` | 小注/说明 | fs=13.0 | 例：将汤和凤爪转入砂锅，中火炖煮1小时 |
| `{{body_text#2}}` | 正文 | fs=14.0 | 例：③ 阶段二：加入鲍鱼（T+60min） |
| `{{body_text#3}}` | 正文 | fs=13.0 | 例：取出定型中的鲍鱼，放入砂锅，继续中火炖煮 |
| `{{body_text#4}}` | 正文 | fs=13.0 | 例：判断标准：凤爪皮质松软、筷子可轻易穿透且 |
| `{{section_title#1}}` | 章节大标题 | fs=24.0 | 例：Step 5 |
| `{{item_title#1}}` | 条目标题 | fs=16.0 | 例：装盘与点缀（出品组装） |
| `{{body_text#5}}` | 正文 | fs=14.0 | 例：① 预热砂锅
提前烧热一个干净砂锅，防止 |
| `{{body_text#6}}` | 正文 | fs=13.0 | 例：价值体现：堆叠造型展示菜品价值感，顶层淋 |
| `{{body_text#7}}` | 正文 | fs=14.0 | 例：完整时间线：凤爪预处理(炸+飞水) →  |
| `{{footnote#0}}` | 脚注 | fs=12.0 | 例：Source: 「鲍鱼一品煲」SOP · |

- `page_number#*` 页码由系统按真实 seq/总页数自动覆盖，无需大模型填。
- 未被填的占位符渲染时清空为空串，不残留。

## 必须遵守

- **绝对禁止**修改任何布局尺寸（width/height/left/top/font-size）— 坐标均来自真实 PPT 提取，是护栏。
- **绝对禁止**修改 `var(--xxx)` 颜色变量 — 配色 = PPT 真实色映射，换配色只改 tokens.yaml。
- 唯一合法硬编码颜色为 `#ffffff` 及 `rgba(255,255,255,x)` / `rgba(0,0,0,x)`。
- 只能替换 `{{占位符}}` 为实际文字；过长缩写、过短扩写，填满不溢出。
- 本框架由代码填充（code-fill）+ fit-to-box 兜底，无需 LLM 生成 HTML。
