# 框架 content_p14（页型：content）— 真实 PPT 提取，几何锁死

> 本框架**从真实 PPT 提取**：坐标/尺寸/字号/层级/配色 100% 来自 pptx，
> 由数据驱动渲染器（`backend/services/frameset_service.py` 的 `render_frame`）
> 按提取的 JSON 几何自动生成，**没有一个手写坐标**。
> 配色 = PPT 真实色映射到 VI 13 色变量（primary/secondary/accent/card_bg…）。
> 内容由大模型选中本框架后，把文字缩写/扩写填进固定格子，几何锁死不可改。
>
> 构成：11 个色块背板，15 个文字位。

---

## HTML 模板（必须照抄结构，只替换 {{占位符}} 内容）

```html
<div style="position:relative;width:1280px;height:720px;overflow:hidden;background:var(--background);font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="position:absolute;left:0.0%;top:0.0%;width:100.0%;height:7.22%;box-sizing:border-box;overflow:hidden;background:var(--primary);border-radius:8px;"></div>
  <div style="position:absolute;left:5.0%;top:1.39%;width:82.03%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:22.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{page_title#0}}</div>
  <div style="position:absolute;left:92.97%;top:1.39%;width:4.69%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.0;color:#ffffff;text-align:right;white-space:pre-line;">{{page_number#0}}</div>
  <div style="position:absolute;left:5.0%;top:10.0%;width:44.06%;height:19.44%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:5.0%;top:10.0%;width:44.06%;height:0.42%;box-sizing:border-box;overflow:hidden;background:var(--semantic-negative);border-radius:8px;"></div>
  <div style="position:absolute;left:6.09%;top:11.39%;width:42.19%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:15.0px;font-weight:400;line-height:1.55;color:var(--semantic-negative);text-align:left;white-space:pre-line;">{{body_text#0}}</div>
  <div style="position:absolute;left:6.09%;top:15.28%;width:42.19%;height:12.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#1}}</div>
  <div style="position:absolute;left:50.94%;top:10.0%;width:44.06%;height:19.44%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:50.94%;top:10.0%;width:44.06%;height:0.42%;box-sizing:border-box;overflow:hidden;background:var(--semantic-negative);border-radius:8px;"></div>
  <div style="position:absolute;left:52.03%;top:11.39%;width:42.19%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:15.0px;font-weight:400;line-height:1.55;color:var(--semantic-negative);text-align:left;white-space:pre-line;">{{body_text#2}}</div>
  <div style="position:absolute;left:52.03%;top:15.28%;width:42.19%;height:12.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#3}}</div>
  <div style="position:absolute;left:5.0%;top:31.67%;width:44.06%;height:19.44%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:5.0%;top:31.67%;width:44.06%;height:0.42%;box-sizing:border-box;overflow:hidden;background:var(--semantic-negative);border-radius:8px;"></div>
  <div style="position:absolute;left:6.09%;top:33.06%;width:42.19%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:15.0px;font-weight:400;line-height:1.55;color:var(--semantic-negative);text-align:left;white-space:pre-line;">{{body_text#4}}</div>
  <div style="position:absolute;left:6.09%;top:36.94%;width:42.19%;height:12.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#5}}</div>
  <div style="position:absolute;left:50.94%;top:31.67%;width:44.06%;height:19.44%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:50.94%;top:31.67%;width:44.06%;height:0.42%;box-sizing:border-box;overflow:hidden;background:var(--semantic-negative);border-radius:8px;"></div>
  <div style="position:absolute;left:52.03%;top:33.06%;width:42.19%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:15.0px;font-weight:400;line-height:1.55;color:var(--semantic-negative);text-align:left;white-space:pre-line;">{{body_text#6}}</div>
  <div style="position:absolute;left:52.03%;top:36.94%;width:42.19%;height:12.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#7}}</div>
  <div style="position:absolute;left:5.0%;top:54.17%;width:90.0%;height:13.89%;box-sizing:border-box;overflow:hidden;background:var(--primary);border-radius:8px;"></div>
  <div style="position:absolute;left:6.56%;top:55.56%;width:23.44%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:14.0px;font-weight:700;line-height:1.3;color:var(--accent);text-align:left;white-space:pre-line;">{{item_subtitle#0}}</div>
  <div style="position:absolute;left:6.56%;top:59.44%;width:86.88%;height:7.22%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{body_text#8}}</div>
  <div style="position:absolute;left:5.0%;top:70.56%;width:90.0%;height:19.44%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:6.56%;top:71.67%;width:31.25%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:16.0px;font-weight:800;line-height:1.2;color:var(--secondary);text-align:left;white-space:pre-line;">{{item_title#0}}</div>
  <div style="position:absolute;left:6.56%;top:75.83%;width:86.88%;height:12.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#9}}</div>
  <div style="position:absolute;left:5.0%;top:94.44%;width:46.88%;height:2.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:12.0px;font-weight:400;line-height:1.4;color:rgba(var(--text-rgb),0.55);text-align:left;white-space:pre-line;">{{footnote#0}}</div>
</div>
```

## 内容占位符（大模型按 content_key 填槽）

| 占位符 | 用途 | 字号 | 示例 |
|--------|------|------|------|
| `{{page_title#0}}` | 页面主标题 | fs=22.0 | 例：常见问题与解决：术的纠偏指南 |
| `{{page_number#0}}` | 页码 | fs=13.0 | 例：14 |
| `{{body_text#0}}` | 正文 | fs=15.0 | 例：问题一：凤爪虎皮不明显 |
| `{{body_text#1}}` | 正文 | fs=13.0 | 例：原因：① 未加白醋 ② 表皮不够干 ③  |
| `{{body_text#2}}` | 正文 | fs=15.0 | 例：问题二：花胶炖煮后溶化消失 |
| `{{body_text#3}}` | 正文 | fs=13.0 | 例：原因：① 泡发过度 ② 炖煮时间过长
解 |
| `{{body_text#4}}` | 正文 | fs=15.0 | 例：问题三：鲍鱼口感发硬如橡皮 |
| `{{body_text#5}}` | 正文 | fs=13.0 | 例：原因：在汤汁中炖煮过久
解决：鲍鱼已用开 |
| `{{body_text#6}}` | 正文 | fs=15.0 | 例：问题四：整道菜味道油腻 |
| `{{body_text#7}}` | 正文 | fs=13.0 | 例：原因：对炸过的凤爪"飞水"不彻底
解决： |
| `{{item_subtitle#0}}` | 条目副标题 | fs=14.0 | 例：纠偏核心原则 |
| `{{body_text#8}}` | 正文 | fs=14.0 | 例：所有问题的根源均可追溯至"道"层面的理解 |
| `{{item_title#0}}` | 条目标题 | fs=16.0 | 例：出品前自检清单 |
| `{{body_text#9}}` | 正文 | fs=14.0 | 例：■ 凤爪虎皮呈海绵状蜂窝结构，色泽金黄  |
| `{{footnote#0}}` | 脚注 | fs=12.0 | 例：Source: 「鲍鱼一品煲」SOP · |

- `page_number#*` 页码由系统按真实 seq/总页数自动覆盖，无需大模型填。
- 未被填的占位符渲染时清空为空串，不残留。

## 必须遵守

- **绝对禁止**修改任何布局尺寸（width/height/left/top/font-size）— 坐标均来自真实 PPT 提取，是护栏。
- **绝对禁止**修改 `var(--xxx)` 颜色变量 — 配色 = PPT 真实色映射，换配色只改 tokens.yaml。
- 唯一合法硬编码颜色为 `#ffffff` 及 `rgba(255,255,255,x)` / `rgba(0,0,0,x)`。
- 只能替换 `{{占位符}}` 为实际文字；过长缩写、过短扩写，填满不溢出。
- 本框架由代码填充（code-fill）+ fit-to-box 兜底，无需 LLM 生成 HTML。
