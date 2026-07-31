# 色彩系统 — VIS 颜色板、语义映射与使用铁律

> 继承 [核心设计原则](principles.md) 的极致克制原则，定义完整的 Notion 色板。

---

## 主色板

| 角色 | 色值 | 用途 |
|------|------|------|
| primary | `{{primary}}` | 标题文字、正文 |
| secondary | `{{secondary}}` | 辅助文字、次级信息 |
| accent | `{{accent}}` | 标题短线、链接强调 |
| background | `{{background}}` | 页面底色（纯白） |
| text | `{{text}}` | 正文 |
| card_bg | `{{card_bg}}` | 卡片背景（浅灰） |

## 图表色序列（chart_colors）

> chart_colors 从蓝色系和中性灰色系两支柱派生，蓝系 2 色 + 灰系 1 色 + 暖系 1 色 + 绿系 1 色。

| 索引 | 色值 | 名称 | 语义 |
|------|------|------|------|
| 0 | `{{chart_0}}` | Notion Blue | 视觉焦点 / 主要数据强调 |
| 1 | `{{secondary}}` | Medium Gray 中灰 | 次级数据 / 中性指标 |
| 2 | `{{chart_2}}` | Warm Brown 暖棕 | 辅助数据 / 历史/参考 |
| 3 | `{{chart_3}}` | Signal Red 信号红 | 负向 / 下降 / 风险 / 警示 |
| 4 | `{{chart_4}}` | Sage Green 鼠尾绿 | 正向 / 增长 / 达标 / 确认 |

## 色彩语义映射

| 色值 | 名称 | 语义 |
|------|------|------|
| `{{chart_4}}` | 鼠尾绿 Sage Green | 正向/增长/优势/达标 |
| `{{chart_3}}` | 信号红 Signal Red | 负向/下降/风险/警示 |
| `{{chart_0}}` | Notion Blue | 强调/主要数据/焦点 |
| `{{accent}}` | Notion Blue ACCENT | 标题短线/链接/高光 |

## 色彩角色分工（铁律）

| 色彩来源 | 用途 | 占比上限 |
|---------|------|---------|
| chart_colors[0..4] | 卡片彩色描边轮换（1px solid）+ 图表色序列 + 图标颜色 | 每卡用不同色 |
| primary `{{primary}}` | 标题色 + 卡片标题色 | 标题文字专用 |
| accent `{{accent}}` | 标题短线（32×2px） + 链接 | ≤5% |
| background `{{background}}` | 页面底色（纯白） | 全画布 |
| text `{{text}}` | 正文 | 全页 |
| card_bg `{{card_bg}}` | 卡片背景（浅灰） | 卡片区域 |

## 禁止事项

- 禁止 accent 色用于卡片彩色描边（accent 是页面级装饰色）
- 禁止所有卡片彩色描边同一颜色
- 禁止 chart_colors[0] 独占所有卡片
- 禁止任何渐变（linear-gradient / radial-gradient）
- 禁止任何阴影（box-shadow / text-shadow）
- 禁止使用 background 以外的颜色作为页面底色
- 禁止全宽顶部 accent 色条
- 禁止在卡片边框之外叠加任何色条
