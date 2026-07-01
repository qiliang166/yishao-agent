## 格式规范 — 精确语法（错误示例 vs 正确示例）

以下每一条都是有标准答案的格式规则。违反任意一条，浏览器将忽略样式或回退默认值，导致元素不可见。

### 1. Hex 颜色格式

Hex 必须是 `#` + 6 位十六进制字符（或 3 位简写）。超过 6 位的 hex 浏览器不识别，回退为黑色。

| 错误 | 正确 | 说明 |
|------|------|------|
| `#fffffffff` | `#ffffff` | 9 位 → 6 位，多打字符 |
| `#ffffffff` | `#ffffff` | 8 位相同字符 → 6 位 |
| `#FFF` | `#fff` | 必须小写（CSS 中大写也有效，但统一用小写避免混用） |
| `#1a365dff` | `#1a365d` | 不要给 hex 追加 alpha 通道，alpha 用 rgba() |

### 2. CSS 变量语法

CSS 变量必须以 `var(--name)` 形式使用，变量名以双连字符 `--` 开头。

| 错误 | 正确 | 说明 |
|------|------|------|
| `var(primary)` | `var(--primary)` | 缺少 `--` 前缀 |
| `var(--primary_rgb)` | `var(--primary-rgb)` | 下划线 → 连字符（CSS 变量不支持下划线） |
| `{{primary}}` | `var(--primary)` | `{{placeholder}}` 是提示词语法，不是 CSS 语法 |
| `{{text_rgb}}` | `var(--text-rgb)` | 同上，输出时必须转换为 CSS 变量 |
| `$primary` | `var(--primary)` | 不是 SCSS/SASS |

### 3. rgba() 透明度语法

| 错误 | 正确 | 说明 |
|------|------|------|
| `rgba(255, 255, 255, 0.5)` | `rgba(var(--text-rgb), 0.5)` | 禁止硬编码 RGB 值 |
| `rgba(var(--text-rgb), .5)` | `rgba(var(--text-rgb), 0.5)` | 小数必须写前导零 |
| `rgba(26, 54, 93, 0.1)` | `rgba(var(--primary-rgb), 0.1)` | 禁止裸 RGB |
| `rgba(255,255,255,0.5)` | `rgba(var(--text-rgb), 0.5)` | rgba 中逗号后有空格 |

### 4. CSS 属性单位

所有非零数值必须带单位。

| 错误 | 正确 | 说明 |
|------|------|------|
| `font-size: 14` | `font-size: 14px` | 缺少 px 单位，浏览器忽略 |
| `width: 1280` | `width: 1280px` | 缺少 px 单位 |
| `margin: 20` | `margin: 20px` | 缺少 px 单位 |
| `opacity: .5` | `opacity: 0.5` | 必须写前导零 |
| `opacity: 0.50` | `opacity: 0.5` | 不要多余的尾随零 |
| `letter-spacing: 1` | `letter-spacing: 1px` | 缺少 px 单位 |

### 5. HTML 结构约束

| 错误 | 正确 | 说明 |
|------|------|------|
| `<html><head>...</head><body>...` | 直接从 `<div style="...">` 开始 | 禁止 html/head/body 标签 |
| `<!DOCTYPE html>` | 不输出 | 禁止 DOCTYPE 声明 |
| 使用 `<style>` 标签 | 全部内联 style 属性 | 禁止 style 标签 |
| `class="card"` | 不设 class | 禁止 class 属性 |
| `id="title"` | 不设 id | 禁止 id 属性 |
| `<link href="...">` | 不输出 | 禁止外部资源引用 |
| `@import url(...)` | 不输出 | 禁止 CSS import |
| `@font-face { ... }` | 不输出 | 禁止字体声明（字体名直接写 font-family） |

### 6. SVG 属性格式

SVG 属性使用连字符命名，不使用 camelCase。

| 错误 | 正确 | 说明 |
|------|------|------|
| `strokeWidth="2"` | `stroke-width="2"` | SVG 属性是 kebab-case |
| `fontFamily="Inter"` | `font-family="Inter"` | 同上 |
| `textAnchor="middle"` | `text-anchor="middle"` | 同上 |
| `viewBox="0 0 1280 720"` | `viewBox="0 0 1280 720"` | viewBox 大小写正确（B 大写） |
| `stroke-width:0.5` | `stroke-width="0.5"` | SVG 属性用引号，不是 CSS 冒号 |

### 7. 颜色不透明度的正确表达

| 视觉需求 | 错误写法 | 正确写法 |
|---------|---------|---------|
| 半透明文字 | `color: #94a3b8` | `color: var(--text); opacity: 0.55` |
| 半透明背景 | `background: #f7fafc` | `background: rgba(var(--text-rgb), 0.04)` |
| 半透明边框 | `border-color: #e2e8f0` | `border: 1px solid rgba(var(--text-rgb), 0.12)` |
| 半透明白色文字 | `color: rgba(255,255,255,0.7)` | `color: rgba(var(--text-rgb), 0.7)` (暗色底页除外) |

### 8. 输出格式

| 错误 | 正确 |
|------|------|
| 直接输出 HTML 文本 | 用 ` ```html ... ``` ` 代码块包裹 |
| 代码块中夹杂解释文字 | 代码块内只放 HTML，解释放外面 |
| 多个代码块 | 整个页面一个代码块 |
