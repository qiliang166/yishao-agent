## 四、色彩系统 — 完整正面映射

**核心规则：一切颜色值必须是变量。不存在"没有对应变量的视觉效果"。**

### 10 变量速查

| 变量 | 用途 | 禁止用途 |
|------|------|---------|
| `{{primary}}` | 卡片标题、hero 卡背景 / 页面标题（仅当 primary 与页面背景对比度 ≥ 4.5:1 时） | 不可用于正文、装饰线 / 暗色背景内容页标题 |
| `{{secondary}}` | 次要标题、辅助背景 | — |
| `{{accent}}` | 页面级装饰（顶部色条 4px、标题短线 40×3px、页码圆点） | 禁止用于卡片 border-left |
| `{{background}}` | 页面底色 | — |
| `{{text}}` | 正文文字 / 页面标题（当 primary 与背景对比度不足 4.5:1 时） | 亮色背景内容页标题不可用 text（用 primary） |
| `{{card_bg}}` | 卡片背景色 | — |
| `{{chart_0}}`~`{{chart_4}}` | 卡片 border-left、图表色序列、图标颜色 | — |
| `{{semantic_positive}}` | 正面指标（增长/达标/优势） | — |
| `{{semantic_negative}}` | 负面指标（下降/风险/警示） | — |

### 页面标题颜色规则（重要）

**标题颜色由系统根据对比度自动决定，禁止自行判断：**

- 亮色背景（背景亮度 > 128）→ 页面标题用 `{{primary}}`（深色品牌色，保证可读）
- 暗色背景（背景亮度 ≤ 128）→ 页面标题用 `{{text}}`（浅色正文色，保证可读）
- 封面/章节/总结页 → 按 tokens.yaml 的 slide_type_overrides 指定颜色，不受上述规则影响

### 常见视觉元素的正确写法（必须照抄，不可自创）

| 视觉需求 | 正确写法 | 说明 |
|---------|---------|------|
| 正文文字 | `color: {{text}}` | — |
| 页面标题（亮色背景） | `color: {{primary}}` | primary 为深色，在亮色背景上可读 |
| 页面标题（暗色背景） | `color: {{text}}` | primary 也是深色，在暗色背景上不可读，必须降级为 text |
| 正文降低强调（次要标签/说明） | `color: {{text}}; opacity: 0.55` | 不是自创灰色 hex |
| 更淡的辅助文字（脚注/来源/页码） | `color: {{text}}; opacity: 0.35` | 不是自创灰色 hex |
| 卡片边框/分割线 | `border: 1px solid rgba({{text_rgb}}, 0.12)` | 不是 #e2e8f0 |
| 极淡背景（斑马纹/代码块/行悬停） | `background: rgba({{text_rgb}}, 0.04)` | 不是 #f7fafc |
| 中等淡背景（高亮行/选中态） | `background: rgba({{text_rgb}}, 0.06)` | 不是 #edf2f7 |
| 卡片阴影 | SVG `feDropShadow` filter，不设颜色 | 不是 box-shadow 带 hex |
| 图表轨道/环形底圈 | `stroke: rgba({{text_rgb}}, 0.12)` | — |
| 进度条底色轨道 | `background: rgba({{text_rgb}}, 0.12)` | — |
| 进度条填充 | `background: {{accent}}` 或 `{{chart_N}}` | — |
| 封面/章节/总结页文字（暗色底） | `color: #ffffff` | 唯一合法的硬编码 hex |
| 封面/章节/总结页文字（亮色底） | `color: {{text}}` 或 tokens 指定色 | — |
| hero 卡背景（暗色） | `background: {{primary}}` + 文字 `#ffffff` | — |
| hero 卡背景（亮色） | `background: {{secondary}}` 或 `rgba({{primary_rgb}}, 0.08)` | — |
| 表格表头背景 | `background: {{primary}}` + 文字 `#ffffff` | — |
| 表格表头背景（亮色方案） | `background: {{secondary}}` + 文字 `#ffffff` | — |
| 表格数据行斑马纹 | 奇数行 `{{card_bg}}`，偶数行 透明 | — |
| SVG 图标填充 | `fill: {{chart_N}}` 或 `fill: {{accent}}` | — |
| SVG 装饰几何图形 | `fill: {{primary}}; opacity: 0.05` 或 `fill: {{accent}}; opacity: 0.08` | — |
| 大数字（big number） | `color: {{chart_N}}` 或 `color: {{accent}}` | — |
| 正向 delta 指示（▲ +12%） | `color: {{semantic_positive}}` | 不是 #22c55e |
| 负向 delta 指示（▼ -5%） | `color: {{semantic_negative}}` | 不是 #ef4444 |

### 严禁事项

- **绝对禁止**裸 hex 色值（`#1a365d` / `#333` / `#0f172a` / `#e2e8f0` 等），唯一例外是暗色背景上的白色文字 `#ffffff`。**Hex 格式必须精确**：`#ffffff` 为 6 位（`#` + 6 个十六进制字符），`#fff` 为 3 位。超过 6 位的 hex（如 `#fffffffff`）浏览器不识别，会回退为黑色导致不可见。
- **绝对禁止**自创灰色（`#94a3b8` / `#64748b` / `#475569` 等），降低强调只能用 `{{text}}` + opacity
- **绝对禁止**自创边框色（`#e2e8f0` / `#cbd5e0` 等），边框统一用 `rgba({{text_rgb}}, 0.12)`
- **绝对禁止**自创淡色背景（`#f7fafc` / `#edf2f7` / `#f8fafc` 等），淡背景统一用 `rgba({{text_rgb}}, opacity)`
- **绝对禁止**在暗色背景内容页上使用 `{{primary}}` 作为标题文字颜色（对比度不足，文字不可见）

---
