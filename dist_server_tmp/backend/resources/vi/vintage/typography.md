# 排版层级 — 字体栈、字号体系与行距规范

> 继承 [核心设计原则](principles.md) 的结构化层级原则，定义完整的排版系统。

---

## 字体

| 角色 | 字体栈 |
|------|--------|
| 标题 | `'Playfair Display', Georgia, 'Times New Roman', 'Noto Serif SC', 'STSong', serif` |
| 正文 | `Lora, Georgia, 'Times New Roman', 'Noto Serif SC', 'STSong', serif` |
| CJK | `'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif` |

字体统一使用 'Playfair Display' 家族，不混用其他无衬线字体。通过字重（400/600/700）建立层级，而非字体切换。

## 字号层级

| 层级 | 字号 | 字重 | 使用场景 |
|------|------|------|---------|
| 封面标题 | 48-56px | 700 | 封面 h1 |
| 页标题 | 32-40px | 600 | 内容页 h2 |
| 卡片标题 | 18-22px | 600 | 卡片 heading |
| 正文 | 15-17px | 400 | 卡片 body |
| 标注 | 12-13px | 400 | 页码、来源、脚注、插图标签 |

## 行距与字距

- 标题 line-height: 1.2-1.3
- 正文 line-height: 1.65-1.8
- 标题 letter-spacing: -0.3~-0.5px（英文）
- 卡片之间间距: 28px
