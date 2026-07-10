# 结尾页 — 演示文稿正式结束页，包含感谢、行动号召与版权，与封面形成首尾呼应

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
      <radialGradient id="glow1" cx="50%" cy="45%" r="55%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.08)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#grid)"/>
    <circle cx="640" cy="320" r="320" fill="url(#glow1)"/>
    <circle cx="180" cy="180" r="110" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1.5"/>
    <circle cx="1080" cy="560" r="130" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
  </svg>

  <!-- 第3层：顶部 accent 色条 -->
  <div style="position:absolute;top:0;left:0;width:100%;height:4px;background:var(--accent);z-index:5;"></div>

  <!-- 第4层：结构层 + 内容层（居中） -->
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-55%);text-align:center;z-index:2;max-width:800px;">

    <!-- 感谢语 -->
    <h2 style="font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:44px;font-weight:700;letter-spacing:-0.5px;line-height:1.2;color:#ffffff;margin:0 0 24px 0;">{{THANKS}}</h2>

    <!-- 标题下方 accent 短线 -->
    <div style="width:48px;height:3px;background:var(--accent);margin:0 auto 28px auto;border-radius:2px;"></div>

    <!-- 行动号召（可选） -->
    {{#CTA}}
    <p style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:18px;font-weight:500;color:var(--accent);margin:0 0 24px 0;">{{CTA}}</p>
    {{/CTA}}

    <!-- 联系方式（可选） -->
    {{#CONTACT_INFO}}
    <p style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:14px;font-weight:400;color:rgba(255,255,255,0.55);margin:0;">{{CONTACT_INFO}}</p>
    {{/CONTACT_INFO}}
  </div>

  <!-- 第5层：标识层（底部版权） -->
  <div style="position:absolute;bottom:44px;left:0;width:100%;text-align:center;z-index:3;">
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
| `{{THANKS}}` | 感谢语（"感谢聆听" / "Thank You" / "谢谢"） | heading |
| `{{CTA}}` | 行动号召（可选，如 "扫码了解更多"） | notes |
| `{{CONTACT_INFO}}` | 联系方式（可选，邮箱/网址/电话） | lead |
| `{{COPYRIGHT}}` | 版权声明 | 固定文本 |
| `{{PAGE_NUM}}` | 当前页码 | seq |
| `{{TOTAL_PAGES}}` | 总页数 | total |

## 必须遵守

- **绝对禁止**修改任何 CSS 颜色值 — 所有 `var(--xxx)` 必须原样保留
- **绝对禁止**修改布局尺寸和定位
- **绝对禁止**添加或删除装饰元素
- 只能替换 `{{PLACEHOLDER}}` 占位符为实际文字内容
- `{{#CTA}}`/`{{#CONTACT_INFO}}` 为条件块：无内容时整块删除，有内容时保留
- 文字颜色已设为 `#ffffff`（唯一合法的硬编码 hex）
- 禁止添加卡片容器、页头
- 装饰布局与封面呼应，形成首尾书挡
