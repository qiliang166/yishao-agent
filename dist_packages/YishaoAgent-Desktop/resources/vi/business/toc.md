# 目录页 — 内容导航与章节概览，提供全局结构视图

## HTML 模板（必须照抄结构，只替换内容）

```html
<div style="width:1280px;height:720px;position:relative;overflow:hidden;background:var(--background);font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">

  <!-- 第1层：装饰层（光晕与几何图形） -->
  <svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(var(--text-rgb),0.03)" stroke-width="0.5"/>
      </pattern>
      <radialGradient id="glow1" cx="85%" cy="20%" r="45%">
        <stop offset="0%" stop-color="rgba(var(--primary-rgb),0.06)"/>
        <stop offset="100%" stop-color="rgba(var(--primary-rgb),0)"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#grid)"/>
    <circle cx="1080" cy="150" r="260" fill="url(#glow1)"/>
    <circle cx="1120" cy="580" r="90" fill="none" stroke="rgba(var(--primary-rgb),0.06)" stroke-width="1.5"/>
  </svg>

  <!-- 第2层：顶部 accent 色条 -->
  <div style="position:absolute;top:0;left:0;width:100%;height:4px;background:var(--accent);z-index:5;"></div>

  <!-- 第3层：结构层 + 内容层 -->
  <div style="position:absolute;top:80px;left:80px;right:80px;bottom:60px;z-index:2;">

    <!-- 标题区 -->
    <div style="font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:40px;font-weight:700;letter-spacing:-1px;color:var(--primary);margin-bottom:12px;">目录</div>
    <div style="width:60px;height:4px;background:var(--accent);margin-bottom:44px;border-radius:2px;"></div>

    <!-- 章节列表（两列自适应，圆序号 + 标题） -->
    <table style="width:100%;border-collapse:collapse;font-size:16px;">
      {{TOC_ROWS}}
    </table>
  </div>

  <!-- 第4层：标识层（右下角） -->
  <div style="position:absolute;bottom:40px;right:60px;z-index:3;display:flex;align-items:center;gap:8px;">
    <div style="width:6px;height:6px;border-radius:50%;background:var(--accent);"></div>
    <span style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:14px;color:rgba(var(--text-rgb),0.45);">{{PAGE_NUM}} / {{TOTAL_PAGES}}</span>
  </div>

</div>
```

## 内容占位符

| 占位符 | 说明 | 来源 |
|--------|------|------|
| `{{TOC_ROWS}}` | 所有目录条目行（圆序号+标题），由代码从章节列表生成 | chapters 或 key_points |
| `{{PAGE_NUM}}` | 当前页码 | seq |
| `{{TOTAL_PAGES}}` | 总页数 | total |

## 必须遵守

- **绝对禁止**修改任何 CSS 颜色值 — 所有 `var(--xxx)` 必须原样保留
- **绝对禁止**修改布局尺寸和定位
- **绝对禁止**添加或删除装饰元素（SVG grid/glow/circle）
- **`{{TOC_ROWS}}` 由代码注入 — 严禁 AI 手写目录行或替换该占位符**
- 章节数量和顺序由编辑器章节列表定义，不可自行增减
- 序号圆 32px，居中白色数字，`var(--chart-N)` 循环取色
- 标题列使用 `border-bottom:1px dotted` 作为点状引导线
- 禁止添加卡片容器、页头
- 禁止 hex 色值
