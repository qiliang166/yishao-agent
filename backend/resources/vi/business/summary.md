# 总结页 — 结尾收束，核心要点回顾与行动号召，深色背景与封面形成书挡效应

## HTML 模板（必须照抄结构，只替换内容）

```html
<div style="width:1280px;height:720px;position:relative;overflow:hidden;background:linear-gradient(135deg,var(--primary) 0%,var(--secondary) 100%);font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">

  <!-- 第1层：背景层 -->
  <div style="position:absolute;inset:0;background:linear-gradient(to bottom right,rgba(0,0,0,0.2),rgba(0,0,0,0.5));"></div>

  <!-- 第2层：装饰层（光晕与几何图形 — 与封面呼应） -->
  <svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="0.5"/>
      </pattern>
      <radialGradient id="glow1" cx="20%" cy="80%" r="50%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.08)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </radialGradient>
      <radialGradient id="glow2" cx="85%" cy="15%" r="45%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.06)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#grid)"/>
    <circle cx="250" cy="580" r="280" fill="url(#glow1)"/>
    <circle cx="1080" cy="120" r="250" fill="url(#glow2)"/>
    <!-- 装饰性抽象几何图形 — 与封面镜像布局 -->
    <circle cx="180" cy="200" r="100" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1.5"/>
    <circle cx="1050" cy="600" r="130" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
  </svg>

  <!-- 第3层：顶部 accent 色条 -->
  <div style="position:absolute;top:0;left:0;width:100%;height:4px;background:var(--accent);z-index:5;"></div>

  <!-- 第4层：结构层 + 内容层 -->
  <div style="position:absolute;top:50%;left:80px;transform:translateY(-55%);max-width:750px;z-index:2;">

    <!-- 装饰性顶部短线 -->
    <div style="width:60px;height:4px;background:var(--accent);margin-bottom:30px;border-radius:2px;"></div>

    <!-- 总结标题 -->
    <h2 style="font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:48px;font-weight:700;letter-spacing:-1px;line-height:1.2;color:#ffffff;margin:0 0 32px 0;">{{SUMMARY_TITLE}}</h2>

    <!-- 要点列表（2-4 个关键要点） -->
    <div style="margin-bottom:40px;">
      <!-- KEY_POINT: 每个要点复制此块，替换内容 -->
      <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:20px;">
        <div style="flex-shrink:0;width:8px;height:8px;border-radius:50%;background:var(--accent);margin-top:8px;"></div>
        <p style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:18px;font-weight:400;line-height:1.6;color:rgba(255,255,255,0.85);margin:0;">{{KEY_POINT_1}}</p>
      </div>
      <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:20px;">
        <div style="flex-shrink:0;width:8px;height:8px;border-radius:50%;background:var(--accent);margin-top:8px;"></div>
        <p style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:18px;font-weight:400;line-height:1.6;color:rgba(255,255,255,0.85);margin:0;">{{KEY_POINT_2}}</p>
      </div>
      <!-- /KEY_POINT: 按需复制 2-4 个 -->
    </div>

  </div>

  <!-- 第5层：标识层（底部信息） -->
  <div style="position:absolute;bottom:50px;left:0;width:100%;text-align:center;z-index:3;">
    <p style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:16px;color:rgba(255,255,255,0.6);margin:0 0 8px 0;">{{CONTACT_INFO}}</p>
    <p style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:12px;color:rgba(255,255,255,0.4);margin:0;">{{COPYRIGHT}}</p>
  </div>

  <!-- 页码（右下角） -->
  <div style="position:absolute;bottom:40px;right:60px;z-index:3;display:flex;align-items:center;gap:8px;">
    <div style="width:6px;height:6px;border-radius:50%;background:var(--accent);"></div>
    <span style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:14px;color:rgba(255,255,255,0.5);">{{PAGE_NUM}} / {{TOTAL_PAGES}}</span>
  </div>

</div>
```

## 内容占位符

| 占位符 | 说明 | 来源 |
|--------|------|------|
| `{{SUMMARY_TITLE}}` | 总结标题（如 "Thank You" / "总结" / "核心要点"） | heading |
| `{{KEY_POINT_1}}` | 第 1 个关键要点 | key_points[0] |
| `{{KEY_POINT_2}}` | 第 2 个关键要点 | key_points[1] |
| `{{CONTACT_INFO}}` | 联系方式（邮箱/网址/电话） | lead 或 notes |
| `{{COPYRIGHT}}` | 版权声明（© YYYY Company. All rights reserved.） | 固定文本 |
| `{{PAGE_NUM}}` | 当前页码 | seq |
| `{{TOTAL_PAGES}}` | 总页数 | total |

## 必须遵守

- **绝对禁止**修改任何 CSS 颜色值 — 所有 `var(--xxx)` 必须原样保留
- **绝对禁止**修改布局尺寸和定位
- **绝对禁止**添加或删除装饰元素
- 只能替换 `{{PLACEHOLDER}}` 占位符为实际文字内容
- 要点数量按 key_points 实际数量增减，2-4 个，复制 `KEY_POINT` 块结构
- 如无联系信息，`{{CONTACT_INFO}}` 替换为空字符串或删除该 `<p>` 元素
- 文字颜色已设为 `#ffffff`（唯一合法的硬编码 hex）
- 禁止添加卡片容器
- 装饰布局与封面镜像（glow 位置互换）形成视觉闭环
