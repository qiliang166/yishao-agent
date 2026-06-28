## 一、页面构图：1280×720 画布的 5 层结构

每页幻灯片从底层到顶层有 5 个图层。缺层 = 不完整。

```
第 1 层 | 背景层   | background 色块或渐变 + 纹理pattern(可选)    | 铺满画布
第 2 层 | 装饰层   | 光晕/几何图形/半透明大圆                     | 2-3 个大面积半透明元素
第 3 层 | 结构层   | 顶部 accent 色条(4px) + 标题区               | 页面框架
第 4 层 | 内容层   | 卡片网格 + 图表 + 图标                       | 核心信息区，占画布55-70%
第 5 层 | 标识层   | 页码标记(右下角) + 品牌色点缀                  | 固定位置
```

**铁律：每页必须包含全部 5 层。** 缺少装饰层的页面 = 设计失败。

### 标题与内容的层级分离（硬约束）

**页面标题必须位于第 3 层（结构层），是页面的直接子元素，使用绝对定位放置在画布上。标题禁止嵌套在第 4 层的任何内容卡片内部。**

```
✅ 正确结构：                         ❌ 错误结构（容器误用）：
<div style="position:relative">       <div style="position:relative">
  <!-- 第3层：页面标题 -->              <!-- 无页面级标题！ -->
  <h2 style="position:absolute;       <div style="position:absolute;
          top:28px; left:60px">               top:60px; left:180px;
          标题</h2>                           width:920px">
  <!-- 第4层：内容卡片区 -->                <!-- 标题被埋进卡片内！ -->
  <div style="position:absolute;         <h2>标题</h2>
          top:130px;                         <div>内容卡片...</div>
          left:60px; right:60px">       </div>
    内容卡片...                        </div>
  </div>
</div>
```

- **例外**：仅封面页（cover）和金句页（quote）可将标题与内容合并 — 因为标题本身就是视觉核心。
- **所有其他页面类型**（content/data/comparison/process/timeline/table）标题必须在第 3 层独立定位，内容区在第 4 层独立排列。
- **内容区宽度规则**：第 4 层内容区的 left/right 边距必须与第 3 层标题的 left 值统一（同为 60px 或同为 80px），使用 `left:60px; right:60px` 或等效的全宽布局。禁止内容区缩窄为居中卡片（如 `left:180px; width:920px` 或 `left:50%; transform:translateX(-50%); width:960px`）。

### 安全区 (Safe Area) — 硬约束

- **上边距**: 60px（标题区占位）
- **下边距**: 50px（页码区约 24px 高 + 10px 呼吸间隙）
- **左右边距**: 各 60px
- 所有内容（卡片、图表、文字）必须限定在 (60, 60) 到 (1220, 670) 的安全区内
- **禁止内容延伸到底部 50px 区域**（y>670 仅允许页码和装饰性半透明元素）

### 基准容器 — 硬约束

**所有内容页使用同一个基准容器**：第 4 层（内容层）必须是一个统一的容器，定义页面边界，内部卡片 flex 填满分隔空间。

```html
<!-- 第3层：标题（页面根级，独立定位） -->
<h2 style="position:absolute;top:28px;left:60px;">页面标题</h2>

<!-- 第4层：基准容器（定义内容边界） -->
<div style="position:absolute;top:130px;left:60px;right:60px;bottom:50px;
            display:flex;gap:24px;">
  <!-- 卡片用 flex 填满容器，不单独设 left -->
  <div style="flex:1;">卡片 1</div>
  <div style="flex:1;">卡片 2</div>
</div>
```

**关键规则**：
- 基准容器：`left:60px; right:60px`（固定，1160px 宽）
- 卡片不单独设 `left` 值 — 用 `flex:N` 或百分比自动填满容器
- 容器有多大，卡片区就撑满多大，不留空边
- 容器边界 = 内容边界，卡片不越界、不缩窄

**禁止的边距值**：30px、36px、40px、48px、80px、88px、180px — 任何非 60px 的 left/right 都是错误。
**禁止的定位方式**：`left:50%; transform:translateX(-50%)` + 固定 `width` — 无基准容器，卡片孤立居中。

---
