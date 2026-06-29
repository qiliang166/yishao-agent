# A4 文档 — 基于统一表格的 A4 打印文档，段落拼装架构

> A4 文档是独立于幻灯片的第二内容形态，使用统一表格布局 + 段落拼装机制。继承 VI 通用规则的色彩/排版/装饰系统，并叠加 A4 专属适配。

---

## 继承规则

A4 文档继承 [核心设计原则](principles.md) 的三原则（清晰层级、克制色彩、一致图形），并适配以下专属规范。

---

## 页面级 Override

| 属性 | 值 |
|------|-----|
| 画布尺寸 | 794 × 1123px（A4 @ 96dpi，打印 210 × 297mm） |
| 背景 | `{{background}}` |
| 默认布局 | `single_focus`（全宽统一表格） |
| 卡片容器 | 不使用卡片容器，使用单一大表格 |
| heading_scale | 1.0 |

---

## 表格通用 Token

### 外框
- 外层边框: `1px solid rgba({{text_rgb}}, 0.2)`
- 无圆角（文档表格直角）

### 内分隔
- 列分隔: `1px solid rgba({{text_rgb}}, 0.1)`
- 行分隔: `1px solid rgba({{text_rgb}}, 0.1)`
- 末尾列/行无重复边框

### 表头
- 背景: `{{chart_1}}`（首表）、`{{chart_0}}`（次表）、`{{chart_2}}`（三表）轮换
- 文字: `#ffffff`, font-weight: 600, 12-13px
- 字体: heading font
- 内边距: 9px 6px

### 数据行
- 背景: `{{background}}`
- 偶数行: `rgba({{text_rgb}}, 0.02)`
- 字号: 12px, line-height: 1.55
- 最小行高: 26px

### 标签列（键值对信息区）
- 背景: `{{card_bg}}`
- 文字: `{{primary}}`, font-weight: 600
- 字号: 13px
- 居中

---

## 五层装饰结构（文档适配）

| # | 层 | 幻灯片 (1280×720) | A4 文档 (794×1123) |
|---|------|------|------|
| 1 | 背景层 | background 满画布 | background 满画布 |
| 2 | 装饰层 | 半透明圆 opacity 0.03-0.12 | 半透明圆 opacity 0.03-0.05（缩小比例） |
| 3 | 结构层 | 卡片容器网格 | **统一表格**（非卡片） |
| 4 | 内容层 | 文字 + 图标 + 图表 | 文字 + 表格数据 + SVG 图标 |
| 5 | 标识层 | 顶部 accent 色条 + 页码 | 顶部 accent 色条(5px) + 三列页头 + 三列页脚 |

---

## 段落拼装架构

A4 文档不预定义卡片数量和布局，而是由**段落类型（block types）**按模板顺序拼装：

```
模板 = [页头(必需), 标题, 正文块₁, 正文块₂, ... 正文块ₙ, 结尾, 页脚(必需)]
```

> **页头/页脚为 A4 文档必需段落**。封面页除外（使用全屏 hero 布局）。

---

## A4 文档页头（系统自动注入，LLM 禁止生成）

> **重要：页头由系统代码统一注入，LLM 不要生成页头。** 系统注入的标准页头格式如下（供参考，确保内容区布局与之兼容）：

```html
<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:14px;color:rgba(0,0,0,0.45);">
  <span>出品标准文档 · {菜品名}</span>
  <span>版本 {版本号} / {日期}</span>
  <span>{页码} / {总页数}</span>
</div>
```

**硬规则**：
- LLM 不要输出页头 div，系统自动注入
- 内容区从标题行开始（通常是渐变 hero 标题行），不含页头

---

## A4 文档页脚（系统自动注入，LLM 禁止生成）

> **重要：页脚由系统代码统一注入，LLM 不要生成页脚。** 系统注入的标准页脚格式如下（供参考）：

```html
<div style="margin-top:auto;padding-top:14px;border-top:1px solid rgba(0,0,0,0.08);display:flex;justify-content:space-between;font-size:14px;color:rgba(0,0,0,0.4);">
  <span>© 2024 {公司名} · 保密文档</span>
  <span>{部门}监制</span>
  <span>第 {页码} 页</span>
</div>
```

**硬规则**：
- LLM 不要输出页脚 div，系统自动注入
- 内容区底部不要留空，页脚由系统排至页面底部

段落类型定义在 `blocks/` 目录下：

| 段落类型 | 文件 | 说明 |
|---------|------|------|
| header | `blocks/header.md` | 文档头部（三列：文档标题/版本日期/页码 X/Y） |
| title | `blocks/title.md` | 主标题（hero 渐变 + accent 下划线） |
| info_block | `blocks/info_block.md` | 键值对信息表（可选图片占位） |
| table_block | `blocks/table_block.md` | 多列数据表格（N 列自适应） |
| text_block | `blocks/text_block.md` | 段落文字 |
| list_block | `blocks/list_block.md` | 编号/项目列表 |
| closing | `blocks/closing.md` | 结尾（签名/结论/落款） |
| footer | `blocks/footer.md` | 页脚（三列：版权/监制部门/第X页） |

---

## 表格色系应用规则

| 元素 | 色值 | 说明 |
|------|------|------|
| 标题行 | `linear-gradient({{primary}}, {{secondary}})` | hero 渐变背景 |
| 标题底线 | `{{accent}}` | 3px solid |
| 标签列底 | `{{card_bg}}` | 信息块标签背景 |
| 标签列字 | `{{primary}}` | 信息块标签文字 |
| 表头底色 | `{{chart_1}}` / `{{chart_0}}` / `{{chart_2}}` | 轮换 |
| 数据行字 | `{{text}}` | 正文 |
| 顶部色条 | `{{accent}}` | 5px |
| 页码点 | `{{accent}}` | 6px dot |
| 装饰圆 | `rgba({{primary_rgb}}, 0.03-0.05)` | 半透明几何 |
| 页脚背景 | `{{card_bg}}` | 版权区 |
| 图片虚线 | `rgba({{accent_rgb}}, 0.35)` | 信息块图片占位 |


## 排版层级（A4 适配）

| 层级 | 幻灯片 | A4 文档 | 变化 |
|------|--------|---------|------|
| 标题字号 | 36-44px | 20-24px | ↓ 适配窄画布 |
| 卡片/表头字号 | 22-24px | 12-13px | ↓ 表格密集内容 |
| 正文字号 | 16-18px | 13-14px | ↓ 打印可读性 |
| 标注字号 | 14px | 11-12px | ↓ |
| 行距 | 1.6-1.8 | 1.55-1.8 | 保持 |
| 字体 | DM Sans + Inter | DM Sans + Inter | 不变 |

---

## 打印规范

- CSS `@media print` 下移除 box-shadow
- 页面尺寸设定为 `210mm × 297mm`
- 内边距 `12mm 14mm`
- 表格边框保留（打印友好）
- 背景色保留（彩色打印）

---

## 与幻灯片的差异

| 特性 | 幻灯片 | A4 文档 |
|------|--------|---------|
| 内容容器 | 卡片（圆角+阴影） | 统一表格（直角+细线边框） |
| 布局 | 10 种 card-based 布局 | 段落拼装（block assembly） |
| 图表 | 丰富图表类型 | 表格为主，少量图标 |
| 视觉丰富度 | ≥3 SVG, ≥4 色, ≥3 卡片 | ≥2 SVG 装饰 + 表格图标 |
| 页码 | dot + 当前页/总页数 | 页头 `X / Y` + 页尾 `第 X 页`（三列标准格式） |
| 色条轮换 | 卡片左边条 | 表格表头色 |
| 封面/总结书挡 | hero_gb 深色渐变 | 标题行 hero_gb + closing 顶部 accent 线呼应 |

---

## 文档生成流程

1. 根据模板定义的段落数组，确定生成顺序
2. 并行生成无依赖的连续段落
3. 按顺序拼装为完整的 `<table>` HTML
4. 包裹 A4 页面容器（accent 色条 + 装饰圆 + 页码）
5. 注入当前激活色系的 CSS 变量
