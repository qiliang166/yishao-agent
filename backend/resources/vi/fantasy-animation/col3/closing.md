# A4 结尾页 — 794×1123px，与封面形成书挡效应

> A4 文档结尾页，深色背景 + 白色文字，画布适配 A4 尺寸。

---

## 页面级 Override

| 属性 | 值 |
|------|-----|
| 画布尺寸 | 794 × 1123px（A4 @ 96dpi） |
| heading_scale | 1.1 |
| 默认布局 | full_bleed（全屏居中） |
| 卡片容器 | 禁止使用卡片 |

---

## 结尾展示规则（A4 适配）

### 感谢语
- 主标题: "感谢聆听" / "Thank You" / "谢谢"
- 字号: 24-28px
- 字体: DM Sans Bold
- 颜色: #ffffff

### 行动号召 (CTA)
- 核心行动引导
- 字号: 12-14px
- 颜色: accent `{{accent}}`

### 联系方式
- 字号: 10-11px
- opacity: 0.5-0.6
- 排列: 横排或竖排，居中对齐

### 版权声明
- 格式: © YYYY Company Name. All rights reserved.
- 字号: 9-10px
- opacity: 0.35-0.45

---

## 内容结构

- 感谢语（必有）
- 行动号召（可选）
- 联系方式（可选）
- 版权声明（必有）

## 装饰规则

- 背景: `linear-gradient(135deg, {{primary}} 0%, {{secondary}} 100%)`
- 顶部: 5px accent 色条 `{{accent}}`，横跨画布全宽
- 装饰圆: 1-2 个半透明大圆，opacity 0.03-0.05，直径 150-250px
