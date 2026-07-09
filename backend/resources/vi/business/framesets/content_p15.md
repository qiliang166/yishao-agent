# 框架 content_p15（页型：content）— 真实 PPT 提取，几何锁死

> 本框架**从真实 PPT 提取**：坐标/尺寸/字号/层级/配色 100% 来自 pptx，
> 由数据驱动渲染器（`backend/services/frameset_service.py` 的 `render_frame`）
> 按提取的 JSON 几何自动生成，**没有一个手写坐标**。
> 配色 = PPT 真实色映射到 VI 13 色变量（primary/secondary/accent/card_bg…）。
> 内容由大模型选中本框架后，把文字缩写/扩写填进固定格子，几何锁死不可改。
>
> 构成：14 个色块背板，13 个文字位。

---

## HTML 模板（必须照抄结构，只替换 {{占位符}} 内容）

```html
<div style="position:relative;width:1280px;height:720px;overflow:hidden;background:var(--background);font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="position:absolute;left:0.0%;top:0.0%;width:100.0%;height:7.22%;box-sizing:border-box;overflow:hidden;background:var(--primary);border-radius:8px;"></div>
  <div style="position:absolute;left:5.0%;top:1.39%;width:82.03%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:22.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{page_title#0}}</div>
  <div style="position:absolute;left:92.97%;top:1.39%;width:4.69%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.0;color:#ffffff;text-align:right;white-space:pre-line;">{{page_number#0}}</div>
  <div style="position:absolute;left:5.0%;top:10.0%;width:28.91%;height:63.89%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:5.0%;top:10.0%;width:28.91%;height:0.56%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:6.09%;top:12.22%;width:2.5%;height:4.44%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:6.09%;top:17.78%;width:26.56%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.2;color:var(--secondary);text-align:left;white-space:pre-line;">{{item_title#0}}</div>
  <div style="position:absolute;left:6.09%;top:22.5%;width:4.69%;height:3.06%;box-sizing:border-box;overflow:hidden;background:var(--semantic-positive);border-radius:8px;"></div>
  <div style="position:absolute;left:6.09%;top:22.5%;width:4.69%;height:3.06%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:11.0px;font-weight:700;line-height:1.35;color:#ffffff;text-align:left;white-space:pre-line;">{{caption#0}}</div>
  <div style="position:absolute;left:6.09%;top:26.94%;width:26.56%;height:44.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#0}}</div>
  <div style="position:absolute;left:35.47%;top:10.0%;width:28.91%;height:63.89%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:35.47%;top:10.0%;width:28.91%;height:0.56%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:36.56%;top:12.22%;width:2.5%;height:4.44%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:36.56%;top:17.78%;width:26.56%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.2;color:var(--secondary);text-align:left;white-space:pre-line;">{{item_title#1}}</div>
  <div style="position:absolute;left:36.56%;top:22.5%;width:4.69%;height:3.06%;box-sizing:border-box;overflow:hidden;background:var(--semantic-positive);border-radius:8px;"></div>
  <div style="position:absolute;left:36.56%;top:22.5%;width:4.69%;height:3.06%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:11.0px;font-weight:700;line-height:1.35;color:#ffffff;text-align:left;white-space:pre-line;">{{caption#1}}</div>
  <div style="position:absolute;left:36.56%;top:26.94%;width:26.56%;height:44.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#1}}</div>
  <div style="position:absolute;left:65.94%;top:10.0%;width:29.06%;height:63.89%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:65.94%;top:10.0%;width:29.06%;height:0.56%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:67.03%;top:12.22%;width:2.5%;height:4.44%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:67.03%;top:17.78%;width:26.56%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.2;color:var(--secondary);text-align:left;white-space:pre-line;">{{item_title#2}}</div>
  <div style="position:absolute;left:67.03%;top:22.5%;width:4.69%;height:3.06%;box-sizing:border-box;overflow:hidden;background:var(--semantic-positive);border-radius:8px;"></div>
  <div style="position:absolute;left:67.03%;top:22.5%;width:4.69%;height:3.06%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:11.0px;font-weight:700;line-height:1.35;color:#ffffff;text-align:left;white-space:pre-line;">{{caption#2}}</div>
  <div style="position:absolute;left:67.03%;top:26.94%;width:26.56%;height:44.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:var(--text);text-align:left;white-space:pre-line;">{{body_text#2}}</div>
  <div style="position:absolute;left:5.0%;top:76.39%;width:90.0%;height:6.94%;box-sizing:border-box;overflow:hidden;background:var(--primary);border-radius:8px;"></div>
  <div style="position:absolute;left:6.56%;top:77.22%;width:86.88%;height:5.28%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{body_text#3}}</div>
  <div style="position:absolute;left:5.0%;top:94.44%;width:46.88%;height:2.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:12.0px;font-weight:400;line-height:1.4;color:rgba(var(--text-rgb),0.55);text-align:left;white-space:pre-line;">{{footnote#0}}</div>
</div>
```

## 内容占位符（大模型按 content_key 填槽）

| 占位符 | 用途 | 字号 | 示例 |
|--------|------|------|------|
| `{{page_title#0}}` | 页面主标题 | fs=22.0 | 例：扩展应用：现代厨具的适配方案 |
| `{{page_number#0}}` | 页码 | fs=13.0 | 例：15 |
| `{{item_title#0}}` | 条目标题 | fs=18.0 | 例：慢炖锅 / 电炖盅 |
| `{{caption#0}}` | 小注/说明 | fs=11.0 | 例：推荐 |
| `{{body_text#0}}` | 正文 | fs=14.0 | 例：适配性：非常适合分时炖煮
阶段一设置：
 |
| `{{item_title#1}}` | 条目标题 | fs=18.0 | 例：压力锅 |
| `{{caption#1}}` | 小注/说明 | fs=11.0 | 例：推荐 |
| `{{body_text#1}}` | 正文 | fs=14.0 | 例：适配性：极大缩短凤爪炖煮时间
阶段一设置 |
| `{{item_title#2}}` | 条目标题 | fs=18.0 | 例：空气炸锅 / 烤箱 |
| `{{caption#2}}` | 小注/说明 | fs=11.0 | 例：推荐 |
| `{{body_text#2}}` | 正文 | fs=14.0 | 例：适配性：不适用于主流程，但可用于凤爪预处 |
| `{{body_text#3}}` | 正文 | fs=14.0 | 例：核心原则不变：无论使用何种现代厨具，"道 |
| `{{footnote#0}}` | 脚注 | fs=12.0 | 例：Source: 「多味干料复水与分时焖炖 |

- `page_number#*` 页码由系统按真实 seq/总页数自动覆盖，无需大模型填。
- 未被填的占位符渲染时清空为空串，不残留。

## 必须遵守

- **绝对禁止**修改任何布局尺寸（width/height/left/top/font-size）— 坐标均来自真实 PPT 提取，是护栏。
- **绝对禁止**修改 `var(--xxx)` 颜色变量 — 配色 = PPT 真实色映射，换配色只改 tokens.yaml。
- 唯一合法硬编码颜色为 `#ffffff` 及 `rgba(255,255,255,x)` / `rgba(0,0,0,x)`。
- 只能替换 `{{占位符}}` 为实际文字；过长缩写、过短扩写，填满不溢出。
- 本框架由代码填充（code-fill）+ fit-to-box 兜底，无需 LLM 生成 HTML。
