# 质量自检清单 · 22 项 — 每次生成后逐项验证

> 生成每页 HTML 后，逐项确认。任一项未满足 → 重新生成该页。

---

1. 5 层结构完整（背景→装饰→结构→内容→标识）
2. ≥3 个 SVG 元素
3. ≥4 种不同 chart_color 出现在页面
4. ≥1 个半透明几何装饰图形
5. 每张卡片有：SVG 图标 + 标题 + 正文
6. 有数字的地方有图表形态
7. 顶部有 accent 色条（4px）
8. 标题下方有 accent 短线（40×3px）
9. 右下角有页码（dot + 当前页/总页数）
10. 标题使用 primary 色
11. 正文使用 text 色
12. 卡片背景使用 card_bg 色
13. 页面背景使用 background 色
14. 字体来自 typography token（DM Sans + Inter）
15. 圆角来自 card_style token（12px）
16. 阴影来自 elevation token
17. 插图标签与图形居中对齐 (text-anchor="middle")
18. 插图标签与图形间距 ≥ 22px
19. 插图内字号 ≥ 14px
20. 可见 SVG 描边 ≥ 1px
21. 封面/总结禁止卡片容器包裹内容
22. 色条轮换：每张卡片不同 chart_color
