# A4 结尾页 — 794×1123px，与封面形成书挡效应（col3 专属）

> **结构铁律：顶端金色装饰线(10px) + 居中内容区(flex:1)，全页 primary 纯色背景，不含页头页尾，与封面呼应。**

## HTML 模板（必须照抄结构，替换内容）

```html
<div style="width:794px;height:1123px;display:flex;flex-direction:column;background:var(--primary);font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;position:relative;overflow:hidden;">

  <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
    <circle cx="700" cy="280" r="180" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.3"/>
  </svg>

  <!-- ═══ 顶端金色装饰线 10px ═══ -->
  <div style="flex-shrink:0;height:10px;background:var(--accent);"></div>

  <!-- ═══ 居中内容区 flex:1 ═══ -->
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 100px;">

    <!-- 感谢语 -->
    <div style="font-size:44px;font-weight:700;color:#ffffff;letter-spacing:2px;font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">{{THANKS}}</div>
    <div style="width:48px;height:4px;background:var(--accent);margin:24px auto 32px auto;"></div>

    <!-- 行动号召（可选，无内容则删除此行） -->
    <div style="font-size:15px;font-weight:500;color:var(--accent);margin-bottom:20px;">{{CTA}}</div>

    <!-- 联系方式（可选，无内容则删除此行） -->
    <div style="font-size:12px;color:rgba(255,255,255,0.55);line-height:1.8;">{{CONTACT_INFO}}</div>
  </div>

  <!-- ═══ 底部版权区 ═══ -->
  <div style="flex-shrink:0;padding:0 100px 48px 100px;text-align:center;">
    <div style="font-size:10px;color:rgba(255,255,255,0.4);">{{BRAND_COPYRIGHT}}</div>
    <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:6px;">{{BRAND_SIGNATURE}}</div>
  </div>

</div>
```

## 内容变量

| 变量 | 说明 | 来源 |
|------|------|------|
| `{{THANKS}}` | 感谢语（"感谢聆听" / "Thank You" / "谢谢"） | heading |
| `{{CTA}}` | 行动号召（可选，无则删除该 div） | notes |
| `{{CONTACT_INFO}}` | 联系方式（可选，无则删除该 div） | lead |
| `{{BRAND_COPYRIGHT}}` | 版权信息 | 系统占位符，严禁替换为实际文字 |
| `{{BRAND_SIGNATURE}}` | 品牌签名 | 系统占位符，严禁替换为实际文字 |

## 硬性规则

- **顶端金色装饰线 + 居中内容区 flex:1，全页 primary 纯色背景，不含页头页尾。**
- **`{{BRAND_SIGNATURE}}` 和 `{{BRAND_COPYRIGHT}}` 为系统占位符，必须原样保留，严禁替换为实际品牌文字。**
- 感谢语 `#ffffff`（唯一合法的硬编码 hex）。
- `{{CTA}}` 与 `{{CONTACT_INFO}}` 可选：无对应内容时删除整个 `<div>`，禁止保留空占位符。
- 禁止渐变背景（使用纯色 `var(--primary)`）。
- 禁止卡片容器（card_bg + border-radius + shadow）。
- 禁止多个 SVG 圆圈（仅保留模板中的单个 circle）。
- 禁止页头页尾。
