# 质量自检清单 · 19 项 — 每次生成后逐项验证

> 生成每页 HTML 后，逐项确认。任一项未满足 → 重新生成该页。

---

1. 3 层结构完整（背景→结构→内容）
2. ≥2 个 SVG 元素
3. ≥3 种不同 chart_color 出现在页面
4. 每张卡片有：标题 + 正文（图标可选，文字优先）
5. 有数字的地方有图表形态
6. 标题下方有 accent 短线（40×3px，Type C 极简可省略）
7. 右下角有页码（dot + 当前页/总页数）
8. 标题使用 primary 色
9. 正文使用 text 色
10. 卡片背景使用 card_bg 色
11. 页面背景使用 background 色
12. 字体来自 typography token（'Playfair Display' + Lora 衬线字体栈）
13. 圆角来自 card_style token（6px）
14. 阴影来自 elevation token（全部 none）
15. 插图标签与图形居中对齐 (text-anchor="middle")
16. 插图标签与图形间距 ≥ 22px
17. 插图内字号 ≥ 13px
18. 可见 SVG 描边 ≥ 1px
19. 封面/总结禁止卡片容器包裹内容
