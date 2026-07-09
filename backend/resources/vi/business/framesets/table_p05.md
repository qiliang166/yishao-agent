# 框架 table_p05（页型：table）— 真实 PPT 提取，几何锁死

> 本框架**从真实 PPT 提取**：坐标/尺寸/字号/层级/配色 100% 来自 pptx，
> 由数据驱动渲染器（`backend/services/frameset_service.py` 的 `render_frame`）
> 按提取的 JSON 几何自动生成，**没有一个手写坐标**。
> 配色 = PPT 真实色映射到 VI 13 色变量（primary/secondary/accent/card_bg…）。
> 内容由大模型选中本框架后，把文字缩写/扩写填进固定格子，几何锁死不可改。
>
> 构成：11 个色块背板，18 个文字位，1 个表格。

---

## HTML 模板（必须照抄结构，只替换 {{占位符}} 内容）

```html
<div style="position:relative;width:1280px;height:720px;overflow:hidden;background:var(--background);font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="position:absolute;left:0.0%;top:0.0%;width:100.0%;height:7.22%;box-sizing:border-box;overflow:hidden;background:var(--primary);border-radius:8px;"></div>
  <div style="position:absolute;left:5.0%;top:1.39%;width:82.03%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:22.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{page_title#0}}</div>
  <div style="position:absolute;left:92.97%;top:1.39%;width:4.69%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.0;color:#ffffff;text-align:right;white-space:pre-line;">{{page_number#0}}</div>
  <div style="position:absolute;left:5.0%;top:10.0%;width:21.25%;height:33.33%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:5.0%;top:10.0%;width:21.25%;height:0.42%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:6.09%;top:11.39%;width:4.69%;height:4.17%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:24.0px;font-weight:900;line-height:1.0;color:var(--accent);text-align:left;white-space:pre-line;">{{item_index#0}}</div>
  <div style="position:absolute;left:6.09%;top:15.83%;width:19.06%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:16.0px;font-weight:800;line-height:1.2;color:var(--secondary);text-align:left;white-space:pre-line;">{{item_title#0}}</div>
  <div style="position:absolute;left:6.09%;top:20.0%;width:19.06%;height:20.83%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#0}}</div>
  <div style="position:absolute;left:27.81%;top:10.0%;width:21.25%;height:33.33%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:27.81%;top:10.0%;width:21.25%;height:0.42%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:28.91%;top:11.39%;width:4.69%;height:4.17%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:24.0px;font-weight:900;line-height:1.0;color:var(--accent);text-align:left;white-space:pre-line;">{{item_index#1}}</div>
  <div style="position:absolute;left:28.91%;top:15.83%;width:19.06%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:16.0px;font-weight:800;line-height:1.2;color:var(--secondary);text-align:left;white-space:pre-line;">{{item_title#1}}</div>
  <div style="position:absolute;left:28.91%;top:20.0%;width:19.06%;height:20.83%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#1}}</div>
  <div style="position:absolute;left:50.62%;top:10.0%;width:21.25%;height:33.33%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:50.62%;top:10.0%;width:21.25%;height:0.42%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:51.72%;top:11.39%;width:4.69%;height:4.17%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:24.0px;font-weight:900;line-height:1.0;color:var(--accent);text-align:left;white-space:pre-line;">{{item_index#2}}</div>
  <div style="position:absolute;left:51.72%;top:15.83%;width:19.06%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:16.0px;font-weight:800;line-height:1.2;color:var(--secondary);text-align:left;white-space:pre-line;">{{item_title#2}}</div>
  <div style="position:absolute;left:51.72%;top:20.0%;width:19.06%;height:20.83%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#2}}</div>
  <div style="position:absolute;left:73.44%;top:10.0%;width:21.56%;height:33.33%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:73.44%;top:10.0%;width:21.56%;height:0.42%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:74.53%;top:11.39%;width:4.69%;height:4.17%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:24.0px;font-weight:900;line-height:1.0;color:var(--accent);text-align:left;white-space:pre-line;">{{item_index#3}}</div>
  <div style="position:absolute;left:74.53%;top:15.83%;width:19.38%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:16.0px;font-weight:800;line-height:1.2;color:var(--secondary);text-align:left;white-space:pre-line;">{{item_title#3}}</div>
  <div style="position:absolute;left:74.53%;top:20.0%;width:19.38%;height:20.83%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#3}}</div>
  <div style="position:absolute;left:5.0%;top:45.83%;width:90.0%;height:12.5%;box-sizing:border-box;overflow:hidden;background:var(--primary);border-radius:8px;"></div>
  <div style="position:absolute;left:6.56%;top:46.94%;width:23.44%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:var(--accent);text-align:left;white-space:pre-line;">{{body_text#4}}</div>
  <div style="position:absolute;left:6.56%;top:50.83%;width:54.69%;height:6.11%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{body_text#5}}</div>
  <div style="position:absolute;left:5.0%;top:60.56%;width:90.0%;height:27.78%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:6.56%;top:61.94%;width:23.44%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:16.0px;font-weight:800;line-height:1.2;color:var(--semantic-negative);text-align:left;white-space:pre-line;">{{item_title#4}}</div>
  <div style="position:absolute;left:6.56%;top:66.39%;width:86.88%;height:20.28%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:5.0%;top:94.44%;width:46.88%;height:2.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:12.0px;font-weight:400;line-height:1.4;color:rgba(var(--text-rgb),0.55);text-align:left;white-space:pre-line;">{{footnote#0}}</div>
</div>
```

## 内容占位符（大模型按 content_key 填槽）

| 占位符 | 用途 | 字号 | 示例 |
|--------|------|------|------|
| `{{page_title#0}}` | 页面主标题 | fs=22.0 | 例：皮之道：凤爪虎皮的塑形哲学 |
| `{{page_number#0}}` | 页码 | fs=13.0 | 例：05 |
| `{{item_index#0}}` | 条目序号 | fs=24.0 | 例：01 |
| `{{item_title#0}}` | 条目标题 | fs=16.0 | 例：白醋焯水 |
| `{{body_text#0}}` | 正文 | fs=13.0 | 例：冷水下锅加白醋
原理：软化表皮，改变蛋白 |
| `{{item_index#1}}` | 条目序号 | fs=24.0 | 例：02 |
| `{{item_title#1}}` | 条目标题 | fs=16.0 | 例：生抽腌制 |
| `{{body_text#1}}` | 正文 | fs=13.0 | 例：沥干后涂抹生抽
原理：提供糖分和氨基酸， |
| `{{item_index#2}}` | 条目序号 | fs=24.0 | 例：03 |
| `{{item_title#2}}` | 条目标题 | fs=16.0 | 例：高温油炸 |
| `{{body_text#2}}` | 正文 | fs=13.0 | 例：八九成油温炸至金黄
原理：表皮水分瞬间汽 |
| `{{item_index#3}}` | 条目序号 | fs=24.0 | 例：04 |
| `{{item_title#3}}` | 条目标题 | fs=16.0 | 例：飞水去油 |
| `{{body_text#3}}` | 正文 | fs=13.0 | 例：炸后放入沸水汆烫
原理：洗去附着油脂，疏 |
| `{{body_text#4}}` | 正文 | fs=14.0 | 例：虎皮形成的关键判断 |
| `{{body_text#5}}` | 正文 | fs=14.0 | 例：表皮呈海绵状蜂窝结构 | 色泽金黄 |  |
| `{{item_title#4}}` | 条目标题 | fs=16.0 | 例：常见错误与后果 |
| `{{footnote#0}}` | 脚注 | fs=12.0 | 例：Source: 「鲍鱼一品煲」SOP 技 |

- `page_number#*` 页码由系统按真实 seq/总页数自动覆盖，无需大模型填。
- 未被填的占位符渲染时清空为空串，不残留。

## 必须遵守

- **绝对禁止**修改任何布局尺寸（width/height/left/top/font-size）— 坐标均来自真实 PPT 提取，是护栏。
- **绝对禁止**修改 `var(--xxx)` 颜色变量 — 配色 = PPT 真实色映射，换配色只改 tokens.yaml。
- 唯一合法硬编码颜色为 `#ffffff` 及 `rgba(255,255,255,x)` / `rgba(0,0,0,x)`。
- 只能替换 `{{占位符}}` 为实际文字；过长缩写、过短扩写，填满不溢出。
- 本框架由代码填充（code-fill）+ fit-to-box 兜底，无需 LLM 生成 HTML。
