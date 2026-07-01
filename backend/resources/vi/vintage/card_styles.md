# 卡片样式 Token — 圆角、边框与间距

> 定义所有卡片的视觉 token，所有页面类型统一使用。无阴影、无渐变。

---

## 卡片基础 Token

| 属性 | 值 |
|------|-----|
| border_radius | 6px |
| shadow | none（禁用） |
| border | `1px solid rgba(55,53,47, 0.09)` |
| gap | 28px |

## 渐变

| 名称 | 值 |
|------|-----|
| hero_bg | none（禁用渐变） |
| card_highlight | none（禁用渐变） |

卡片与背景的区分依靠 border 颜色深浅 + card_bg 背景色，不使用阴影或渐变。

## 阴影层级

| 级别 | 值 |
|------|-----|
| sm | none |
| md | none |
| lg | none |

所有卡片均不使用阴影。通过间距和边框宽度建立卡片之间的视觉区分。
