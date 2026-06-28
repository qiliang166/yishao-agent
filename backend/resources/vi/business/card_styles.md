# 卡片样式 Token — 圆角、阴影、边框、渐变与间距

> 定义所有卡片的视觉 token，所有页面类型统一使用。

---

## 卡片基础 Token

| 属性 | 值 |
|------|-----|
| border_radius | 12px |
| shadow | `0 2px 8px rgba(0,0,0,0.08)` |
| border | `1px solid #e2e8f0` |
| gap | 24px |

## 渐变

| 名称 | 值 |
|------|-----|
| hero_bg | `linear-gradient(135deg, {{primary}} 0%, {{secondary}} 100%)` |
| card_highlight | `linear-gradient(180deg, {{card_bg}} 0%, #ffffff 100%)` |

## 阴影层级

| 级别 | 值 |
|------|-----|
| sm | `0 1px 2px rgba(0,0,0,0.05)` |
| md | `0 4px 12px rgba(0,0,0,0.08)` |
| lg | `0 12px 40px rgba(0,0,0,0.15)` |
