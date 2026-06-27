# 排版层级 — 字体栈、字号体系与行距规范

> 继承 [核心设计原则](principles.md) 的清晰层级原则，定义完整的排版系统。

---

## 字体

| 角色 | 字体栈 |
|------|--------|
| 标题 | `DM Sans, Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif` |
| 正文 | `Inter, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif` |
| CJK | `'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif` |

## 字号层级

| 层级 | 字号 | 字重 | 使用场景 |
|------|------|------|---------|
| 封面标题 | 58-65px | 700 | 封面 h1 |
| 页标题 | 36-44px | 700 | 内容页 h2 |
| 卡片标题 | 22-24px | 600 | 卡片 heading |
| 正文 | 16-18px | 400 | 卡片 body |
| 标注 | 14px | 400 | 页码、来源、脚注、插图标签 |

## 行距与字距

- 标题 line-height: 1.15-1.25
- 正文 line-height: 1.6-1.8
- 标题 letter-spacing: -0.3~-0.5px（英文）
- 卡片之间间距: 24px
