# 色彩系统 — VIS 颜色板、语义映射与使用铁律

> 继承 [核心设计原则](principles.md) 的克制色彩原则，定义完整的商务色板。

---

## 主色板

| 角色 | 色值 | 用途 |
|------|------|------|
| primary | `{{primary}}` | 标题文字、hero 卡背景 |
| secondary | `{{secondary}}` | 辅助色、渐变终点 |
| accent | `{{accent}}` | 页面级装饰（顶部色条、标题短线） |
| background | `{{background}}` | 页面底色 |
| text | `{{text}}` | 正文 |
| card_bg | `{{card_bg}}` | 卡片背景 |

## 图表色序列（chart_colors）

> chart_colors 从蓝色系和黄铜系两支柱派生，蓝系 3 色 + 黄铜系 2 色。

| 索引 | 色值 | 名称 | 语义 |
|------|------|------|------|
| 0 | `{{chart_0}}` | Deep Copper 深铜 | 视觉焦点 / 主要数据强调 |
| 1 | `{{secondary}}` | Medium Blue 中蓝 | 次级数据 / 正向指标 |
| 2 | `{{chart_2}}` | Steel Blue 钢蓝 | 辅助数据 / 增长/达标 |
| 3 | `{{chart_3}}` | Copper Clay 铜陶 | 负向 / 下降 / 风险 / 警示 |
| 4 | `{{chart_4}}` | Bright Blue 亮蓝 | 中性 / 补充 / 链接 / 高亮 |

## 色彩语义映射

| 色值 | 名称 | 语义 |
|------|------|------|
| `{{chart_2}}` | 钢蓝 Steel Blue | 正向/增长/优势/达标 |
| `{{chart_3}}` | 铜陶 Copper Clay | 负向/下降/风险/警示 |
| `{{chart_0}}` | 深铜 Deep Copper | 强调/主要数据/焦点 |
| `{{accent}}` | 黄铜 ACCENT | 页面级装饰/标题短线/高光 |

## 色彩角色分工（铁律）

| 色彩来源 | 用途 | 占比上限 |
|---------|------|---------|
| chart_colors[0..4] | 卡片色条轮换 + 图表色序列 + 图标颜色 | 每卡用不同色 |
| primary `{{primary}}` | 内容页标题色 + 卡片标题色 | 标题文字专用 |
| accent `{{accent}}` | 页面级装饰线（顶部色条 + 标题短线） | ≤8% |
| background `{{background}}` | 页面底色 | 全画布 |
| text `{{text}}` | 正文 | 全页 |
| card_bg `{{card_bg}}` | 卡片背景 | 卡片区域 |

## 禁止事项

- 禁止 accent 色用于卡片色条（accent 是页面级装饰色）
- 禁止所有卡片色条同一颜色
- 禁止 chart_colors[0] 独占所有卡片
- 禁止渐变和过度装饰
