# A4 文档排版系统 (col3)

## 一条铁律

**VI 构建块模板即法律。** 每个模块的 HTML 模板定义在 VI 构建块文件中（blocks/*.md）。你必须严格复制模板的每一行 HTML 结构、每一个 style 属性值，只替换 `{{VARIABLE}}` 占位符。禁止修改模板中的任何数值。禁止添加模板中没有的元素。禁止删除模板中已有的元素。

## 画布尺寸

794 × 1123px（A4 @ 96dpi）

## 容器结构（三段式 flex，所有非封面页统一）

```
┌─────────────────────────────────┐
│  页头区  45px  flex-shrink:0   │  三等分，左对齐
│  文档名 / 版本日期 / 页码        │
├─────────────────────────────────┤
│                                 │
│  内容区  flex:1  overflow:hidden│
│  装饰圈 + 色条 + 内容表格       │
│                                 │
├─────────────────────────────────┤
│  页尾区  45px  flex-shrink:0   │  三等分，左对齐
│  版权 / 签名 / 页码             │
└─────────────────────────────────┘
```

- 外层容器：`display:flex; flex-direction:column; width:794px; height:1123px`
- 页头页尾各 45px 固定高度，`align-items:center`
- 三等分列：`flex:1; text-align:left`，首页内容 `padding-left:60px`
- 内容区 `flex:1`，靠上排列，不设 `margin-top:auto`
- 页头页尾是模板结构的一部分，**代码不做注入**。代码仅替换 `{{BRAND_COPYRIGHT}}` 和 `{{BRAND_SIGNATURE}}` 两个品牌变量

## 5 模块概览

| 序号 | type | 页头 | 页尾 | 背景 | 核心结构 |
|------|------|------|------|------|---------|
| 1 | cover | 无 | 无 | 由封面模板定义（严格遵循 blocks/cover.md 的背景色） | absolute定位文字 + SVG圆圈装饰 + 底部品牌信息 |
| 2 | product_definition | 有 | 有 | var(--background) | 标签-值表格(88+586) + 斜体副标题行 + 虚线图片占位行 |
| 3 | materials_table | 有 | 有 | var(--background) | 8列表格(674px宽, chart_0表头) + {{TABLE_ROWS}} |
| 4 | steps_table | 有 | 有 | var(--background) | 8列表格含colspan(674px宽, chart_1表头) + {{TABLE_ROWS}} |
| 5 | quality_control | 有 | 有 | var(--background) | 2-section表格(120+554, chart_1+chart_0) + 版权声明文本块 |

## 共享装饰元素（模块二~五通用）

**SVG 背景圆圈：**
```html
<svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="950" r="140" fill="none" stroke="var(--primary)" stroke-width="1.2" opacity="0.12"/>
</svg>
```

**顶部 accent 色条：**
```html
<div style="width:100%;height:4px;background:var(--accent);"></div>
```

## 品牌变量（代码替换，LLM 原样保留占位符）

| 占位符 | 说明 | 处理方式 |
|--------|------|---------|
| `{{BRAND_COPYRIGHT}}` | 版权信息 | 代码从 DB 读取并替换 |
| `{{BRAND_SIGNATURE}}` | 品牌签名 | 代码从 DB 读取并替换 |

**LLM 严禁替换这两个占位符为实际文字。** 必须原样输出 `{{BRAND_COPYRIGHT}}` 和 `{{BRAND_SIGNATURE}}`。

## 色彩变量

| 变量 | 用途 |
|------|------|
| `var(--primary)` | 标签列文字色、品牌标识色 |
| `var(--accent)` | 顶部色条、标题底线、图片占位虚线 |
| `var(--background)` | 页面底色（内部页面） |
| `var(--text)` | 正文文字 |
| `var(--card_bg)` | 标签列背景 |
| `var(--chart-0)` | materials_table 表头、quality_control 危害控制表头 |
| `var(--chart-1)` | steps_table 表头、quality_control 关键技术表头 |
| `rgba(var(--text-rgb), N)` | 半透明文字/边框（N 为 opacity 值） |
| `rgba(var(--accent-rgb), N)` | 半透明 accent（虚线边框等） |

**严禁硬编码 hex 色值。** 所有颜色必须使用 `var(--name)` 或 `rgba(var(--name-rgb), N)` 形式。封面文字颜色从封面模板（blocks/cover.md）中读取——模板中的 CSS 变量已经保证 WCAG AA 对比度 >= 4.5:1。禁止用 `#ffffff` 或任何 hex 值覆盖模板中的颜色变量。

## 禁止项

- 修改页头/页尾的 height(45px)、font-size(10px)、flex 比例
- 修改模板中的任何 width/height/font-size/padding/margin/position 数值
- 添加模板中没有的额外 div/table/svg/装饰元素
- 删除模板中已有的元素
- 合并 quality_control 的维度行（必须 7 行独立：色泽/香气/口感/质地/口味/温度/形态）
- 硬编码 hex 色值
- 在非 cover 模块使用 position:absolute（仅 SVG 装饰圈可用）
- ⛔ **禁止** 使用 `<section>` 标签
- ⛔ **禁止** 替换 `{{BRAND_COPYRIGHT}}` 和 `{{BRAND_SIGNATURE}}` 为实际文字
