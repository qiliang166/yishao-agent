| 7 | `hero_grid` | 2-4 | 左 hero 大卡 + 右 1-2 小卡堆叠 | 论点+数据佐证 |
hero_grid → [hero, card_0, card_1?, card_2?]
├─ 主次分明（大论点+小佐证） → hero_grid 或 two_column_asymmetric

**hero 大卡内容量铁律（防卡内大留白）**：
hero 大卡占据整页约 60-70% 宽度和满高（约 540px），必须有**匹配的内容量填满**，禁止只放 1-2 段文字导致卡内大片空白。

- **内容充实**：hero 卡应含 标题 + 3-4 段正文/要点列表 + 底部标签行/数据/配图，内容高度应 ≥ 卡片高度的 75%。
- **禁止 `justify-content:center`**：hero 大卡内容容器用 `justify-content:flex-start`（内容自然从顶部排列），并让正文区 `flex:1` 自动占据剩余空间。绝不用 `center` 把少量内容居中——那会把留白摊到上下两端，视觉最糟。
- **内容确实不足时必须加视觉填充**：若正文内容天然较少，用装饰性配图 SVG / 数据可视化（进度条/迷你图表/图标网格）/ 关键数字大字 填满卡内下方空间，使填充率 ≥ 75%（对应 design-system「留白 >80px 必须加插图填充」的卡内适用）。
- **正确骨架**：
```html
<div style="flex:2;...overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;padding:40px;">
  <div><!-- 图标 + 标题 --></div>
  <div style="flex:1;font-size:16px;line-height:1.7;"><!-- 3-4 段正文，flex:1 撑开 --></div>
  <div><!-- 底部标签行 / 数据 / 配图，填满下方 --></div>
</div>
```

