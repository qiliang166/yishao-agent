## 图片生成 API（可用）

你可以使用特殊占位符请求真实图片（照片/插画/配图），
系统会自动调用图片生成模型将占位符替换为真实图片。

### 语法

```
<img src="{{image:中文描述}}" style="..." />
```

### 示例

- 封面背景图：`<img src="{{image:咖啡豆特写，暖色调，浅景深，4K品质}}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />`
- 内容配图：`<img src="{{image:数据安全概念插画，蓝色科技风格，简洁矢量}}" style="width:560px;height:400px;border-radius:8px" />`
- 卡片配图：`<img src="{{image:团队协作办公场景，明亮现代，自然光}}" style="width:100%;height:200px;object-fit:cover;border-radius:6px" />`

### 占位符撰写规范

描述必须同时包含：**主体 + 风格 + 色调 + 品质**
好的描述 ≥ 15 个字，差的描述 < 8 个字不生成。

### 何时必须使用 `{{image:}}` 占位符

1. **封面页 (cover)** — 必须包含全屏背景图占位符（叠在 `{{background}}` 色底层之上）
2. **image_hero 页** — 必须包含 hero 横幅图占位符（至少 1280×400px 区域）
3. **image_grid 页** — 每张卡片必须包含配图占位符
4. **内容页右侧留白 >200px** — 必须插入配图占位符填补
5. **任何 image_ 开头的页面类型** — 必须包含至少一个占位符

### 与 SVG 插图的关系

- `{{image:}}` 占位符 → 真实照片/位图（由图片生成模型生成）
- SVG → 装饰图形/图表/图标（由你直接在 HTML 内绘制）
- 两者互补，不是替代关系。封面页同时需要背景图占位符 + SVG 装饰元素
