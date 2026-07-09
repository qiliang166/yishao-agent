# 原则页 — 展示设计原则、工作理念或核心准则（真实 PPT 提取框架 · 4 竖栏 + 底部对比带）

> 本页框架**从真实 PPT（鲍鱼一品煲 SOP page7）提取**：坐标/尺寸/字号/层级 100% 来自 pptx，
> 由数据驱动渲染器（`backend/data/debug/frame_renderer.py`）按提取的 JSON 几何自动生成，
> **没有一个手写坐标**。配色 = PPT 真实色映射到 VI 13 色变量（primary/secondary/accent/card_bg…）。
> 内容由大模型缩写/扩写填进固定格子，几何锁死不可改。
>
> **结构**（真实 page7）：顶部深色页头条 + 标题 + 页码；中部 **4 个竖排色块**（前三栏宽 21.25、
> 末栏宽 17.81；色 = primary/secondary/secondary/accent），每栏叠「序号 + 标题 + 小注 + 正文」；
> 底部**奶油色对比带**（左=正解铜色 / 竖线分隔 / 右=反例暗红）；左下脚注。

---

## HTML 模板（必须照抄结构，只替换 {{占位符}} 内容）

<!-- cap:2-4 -->
```html
<div style="position:relative;width:1280px;height:720px;overflow:hidden;background:var(--background);font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="position:absolute;left:0.0%;top:0.0%;width:100.0%;height:7.22%;box-sizing:border-box;overflow:hidden;background:var(--primary);border-radius:8px;"></div>
  <div style="position:absolute;left:5.0%;top:1.39%;width:82.03%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:22.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{TITLE}}</div>
  <div style="position:absolute;left:92.97%;top:1.39%;width:4.69%;height:4.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.0;color:#ffffff;text-align:right;white-space:pre-line;">{{PAGE_NUM}} / {{TOTAL_PAGES}}</div>
  <div style="position:absolute;left:5.0%;top:10.0%;width:21.25%;height:47.22%;box-sizing:border-box;overflow:hidden;background:var(--primary);border-radius:8px;"></div>
  <div style="position:absolute;left:6.09%;top:11.39%;width:4.69%;height:5.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:28.0px;font-weight:900;line-height:1.0;color:var(--accent);text-align:left;white-space:pre-line;">{{kp0_index}}</div>
  <div style="position:absolute;left:6.09%;top:16.94%;width:19.06%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{kp0_title}}</div>
  <div style="position:absolute;left:6.09%;top:21.11%;width:19.06%;height:2.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.35;color:var(--accent);text-align:left;white-space:pre-line;">{{kp0_caption}}</div>
  <div style="position:absolute;left:6.09%;top:25.28%;width:19.06%;height:30.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{kp0_body}}</div>
  <div style="position:absolute;left:29.06%;top:10.0%;width:21.25%;height:47.22%;box-sizing:border-box;overflow:hidden;background:var(--secondary);border-radius:8px;"></div>
  <div style="position:absolute;left:30.16%;top:11.39%;width:4.69%;height:5.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:28.0px;font-weight:900;line-height:1.0;color:var(--accent);text-align:left;white-space:pre-line;">{{kp1_index}}</div>
  <div style="position:absolute;left:30.16%;top:16.94%;width:19.06%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{kp1_title}}</div>
  <div style="position:absolute;left:30.16%;top:21.11%;width:19.06%;height:2.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.35;color:var(--accent);text-align:left;white-space:pre-line;">{{kp1_caption}}</div>
  <div style="position:absolute;left:30.16%;top:25.28%;width:19.06%;height:30.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{kp1_body}}</div>
  <div style="position:absolute;left:53.12%;top:10.0%;width:21.25%;height:47.22%;box-sizing:border-box;overflow:hidden;background:var(--secondary);border-radius:8px;"></div>
  <div style="position:absolute;left:54.22%;top:11.39%;width:4.69%;height:5.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:28.0px;font-weight:900;line-height:1.0;color:var(--accent);text-align:left;white-space:pre-line;">{{kp2_index}}</div>
  <div style="position:absolute;left:54.22%;top:16.94%;width:19.06%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{kp2_title}}</div>
  <div style="position:absolute;left:54.22%;top:21.11%;width:19.06%;height:2.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.35;color:var(--accent);text-align:left;white-space:pre-line;">{{kp2_caption}}</div>
  <div style="position:absolute;left:54.22%;top:25.28%;width:19.06%;height:30.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{kp2_body}}</div>
  <div style="position:absolute;left:77.19%;top:10.0%;width:17.81%;height:47.22%;box-sizing:border-box;overflow:hidden;background:var(--accent);border-radius:8px;"></div>
  <div style="position:absolute;left:78.28%;top:11.39%;width:4.69%;height:5.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:28.0px;font-weight:900;line-height:1.0;color:#ffffff;text-align:left;white-space:pre-line;">{{kp3_index}}</div>
  <div style="position:absolute;left:78.28%;top:16.94%;width:15.62%;height:3.89%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:18.0px;font-weight:800;line-height:1.2;color:#ffffff;text-align:left;white-space:pre-line;">{{kp3_title}}</div>
  <div style="position:absolute;left:78.28%;top:21.11%;width:15.62%;height:2.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:13.0px;font-weight:700;line-height:1.35;color:#ffffff;text-align:left;white-space:pre-line;">{{kp3_caption}}</div>
  <div style="position:absolute;left:78.28%;top:25.28%;width:15.62%;height:30.0%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:13.0px;font-weight:400;line-height:1.55;color:#ffffff;text-align:left;white-space:pre-line;">{{kp3_body}}</div>
  <div style="position:absolute;left:5.0%;top:59.72%;width:90.0%;height:27.78%;box-sizing:border-box;overflow:hidden;background:var(--card_bg);border-radius:8px;"></div>
  <div style="position:absolute;left:6.56%;top:61.11%;width:31.25%;height:3.33%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:16.0px;font-weight:800;line-height:1.3;color:var(--secondary);text-align:left;white-space:pre-line;">{{BAND_LEAD}}</div>
  <div style="position:absolute;left:6.56%;top:65.83%;width:42.19%;height:19.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:var(--accent);text-align:left;white-space:pre-line;">{{BAND_POS}}</div>
  <div style="position:absolute;left:50.0%;top:61.11%;width:0.0%;height:23.61%;box-sizing:border-box;overflow:hidden;border-left:1px solid rgba(var(--text-rgb),0.55);"></div>
  <div style="position:absolute;left:51.56%;top:65.83%;width:42.19%;height:19.44%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:14.0px;font-weight:400;line-height:1.55;color:var(--semantic-negative);text-align:left;white-space:pre-line;">{{BAND_NEG}}</div>
  <div style="position:absolute;left:5.0%;top:94.44%;width:46.88%;height:2.78%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;font-size:12.0px;font-weight:400;line-height:1.4;color:rgba(var(--text-rgb),0.55);text-align:left;white-space:pre-line;">{{FOOTNOTE}}</div>
</div>
```

## 框架选择规则（代码自动，无需 LLM）

- 代码按 `key_points` 条数选框架：命中 `<!-- cap:min-max -->` 区间者优先；无完美匹配时选上限最接近的。
- 本页 `cap:2-4`：4 竖栏 + 底部对比带，2~4 条并列原则一栏一条；不足 4 条时多余栏由代码清空。

## 内容占位符

| 占位符 | 说明 | 来源 |
|--------|------|------|
| `{{TITLE}}` | 页面标题 | heading |
| `{{PAGE_NUM}}` / `{{TOTAL_PAGES}}` | 页码 / 总页数 | 系统自动 |
| `{{kp0_index}}`…`{{kp3_index}}` | 各栏序号（01、02…） | 代码自动 |
| `{{kp0_title}}`…`{{kp3_title}}` | 各栏标题（「：」之前） | key_points |
| `{{kp0_caption}}`…`{{kp3_caption}}` | 各栏小注（「；」后短语，可空） | key_points |
| `{{kp0_body}}`…`{{kp3_body}}` | 各栏正文（「：」后、首个「；」前） | key_points |
| `{{BAND_LEAD}}` | 对比带小标题 | lead（空则 heading） |
| `{{BAND_POS}}` | 对比带左·正解 | body 切分前段 |
| `{{BAND_NEG}}` | 对比带右·反例 | body 切分后段（可空） |
| `{{FOOTNOTE}}` | 脚注 | 代码自动（共 N 项 · 正反对照） |

## 通用例子（适配所有行业，仅示意「标题：正确做法；反面后果」结构）

- 制造：`节拍：按标准工时匀速上料，产线不堆料；抢产猛上则在制品积压、良率下降`
- 教育：`分层：按能力分组布置差异化任务，人人有进步；一刀切齐则优生吃不饱、差生跟不上`
- 医疗：`分诊：按病情分级引导就诊路径，急症优先；先到先看则重症被延误、资源错配`

## 必须遵守

- **绝对禁止**修改任何 CSS 颜色值 — 所有 `var(--xxx)` 原样保留（配色 = PPT 真实色映射到 VI 变量，换配色只改 tokens.yaml）
- **绝对禁止**修改布局尺寸（width/height/left/top/font-size）— 坐标均来自真实 PPT 提取，是护栏
- 唯一合法硬编码颜色为 `#ffffff` 及 `rgba(255,255,255,x)` / `rgba(0,0,0,x)`
- 只能替换 `{{PLACEHOLDER}}` 占位符为实际文字内容；文字过长缩写、过短扩写，填满不溢出
- 该页由代码填充（code-fill），无需 LLM 生成
