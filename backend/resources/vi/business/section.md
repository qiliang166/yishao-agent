# 章节分隔页 — 章节过渡页，深色全屏背景，居中章节标题，用于内容板块之间的视觉分隔

## HTML 模板（必须照抄结构，只替换内容）

```html
<div style="width:1280px;height:720px;position:relative;overflow:hidden;background:linear-gradient(135deg,var(--primary) 0%,var(--secondary) 100%);font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">

  <!-- 第1层：背景层 -->
  <div style="position:absolute;inset:0;background:linear-gradient(to bottom right,rgba(0,0,0,0.15),rgba(0,0,0,0.45));"></div>

  <!-- 第2层：装饰层（光晕与几何图形） -->
  <svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="0.5"/>
      </pattern>
      <radialGradient id="glow1" cx="50%" cy="40%" r="50%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.06)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#grid)"/>
    <circle cx="640" cy="300" r="300" fill="url(#glow1)"/>
    <!-- 装饰性抽象圆 -->
    <circle cx="200" cy="500" r="140" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1.5"/>
    <circle cx="1100" cy="200" r="100" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  </svg>

  <!-- 第3层：顶部 accent 色条 -->
  <div style="position:absolute;top:0;left:0;width:100%;height:4px;background:var(--accent);z-index:5;"></div>

  <!-- 第4层：结构层 + 内容层（居中） -->
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-55%);text-align:center;z-index:2;">

    <!-- 章节编号 -->
    <div style="font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:20px;font-weight:600;color:var(--accent);opacity:0.7;letter-spacing:3px;margin-bottom:20px;text-transform:uppercase;">{{CHAPTER_NUM}}</div>

    <!-- 章节标题 -->
    <h2 style="font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:48px;font-weight:700;letter-spacing:-0.5px;line-height:1.2;color:#ffffff;margin:0 0 24px 0;max-width:700px;">{{CHAPTER_TITLE}}</h2>

    <!-- 标题下方 accent 短线 -->
    <div style="width:48px;height:3px;background:var(--accent);margin:0 auto 24px auto;border-radius:2px;"></div>

    <!-- 可选副标题 -->
    <p style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:18px;font-weight:400;color:rgba(255,255,255,0.65);margin:0;max-width:600px;">{{CHAPTER_SUBTITLE}}</p>
  </div>

</div>
```

## 内容占位符

| 占位符 | 说明 | 来源 |
|--------|------|------|
| `{{CHAPTER_NUM}}` | 章节编号（如 "Part 2" / "第三章" / "03"） | kicker 或 key_points[0] |
| `{{CHAPTER_TITLE}}` | 章节标题（简洁有力，≤12 字） | heading |
| `{{CHAPTER_SUBTITLE}}` | 章节概述（可选，≤30 字，可为空） | lead 或 body 首句 |

## 必须遵守

- **绝对禁止**修改任何 CSS 颜色值 — 所有 `var(--xxx)` 必须原样保留
- **绝对禁止**修改布局尺寸和定位
- **绝对禁止**添加或删除装饰元素
- 只能替换 `{{PLACEHOLDER}}` 占位符为实际文字内容
- 如无副标题，`{{CHAPTER_SUBTITLE}}` 替换为空字符串或删除该 `<p>` 元素
- 禁止添加卡片容器、页头、页尾、页码
- 文字颜色已设为 `#ffffff`（唯一合法的硬编码 hex）
