# closing — 结尾页（A4 通用）

> **结构铁律：全页 var(--primary) 纯色背景，绝对定位布局。无页头页尾。与封面形成书挡效应——同样的深色背景、白色文字、底部品牌信息。**

## HTML 模板（必须照抄结构，替换内容）

```html
<div style="width:794px;height:1123px;position:relative;overflow:hidden;background:var(--primary);font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">

  <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
    <circle cx="714" cy="200" r="220" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.08"/>
    <circle cx="100" cy="900" r="160" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.1"/>
  </svg>

  <!-- 顶部 accent 色条 8px -->
  <div style="position:absolute;top:0;left:0;width:100%;height:8px;background:var(--accent);"></div>

  <!-- 感谢语区域 -->
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;width:100%;">
    <div style="font-size:42px;font-weight:700;color:#ffffff;letter-spacing:4px;margin-bottom:20px;">{{THANK_YOU}}</div>
    <div style="width:48px;height:4px;background:var(--accent);margin:0 auto 24px auto;"></div>
    <div style="font-size:16px;color:rgba(255,255,255,0.55);line-height:1.8;max-width:500px;margin:0 auto;">{{CTA_TEXT}}</div>
  </div>

  <!-- 联系方式 -->
  <div style="position:absolute;bottom:180px;left:0;width:100%;text-align:center;font-size:12px;color:rgba(255,255,255,0.35);line-height:1.8;">
    {{CONTACT_INFO}}
  </div>

  <!-- 底部品牌信息 -->
  <div style="position:absolute;bottom:50px;left:0;width:100%;text-align:center;font-size:12px;color:rgba(255,255,255,0.3);">
    <div style="margin-bottom:6px;">{{BRAND_SIGNATURE}}</div>
    <div>{{BRAND_COPYRIGHT}}</div>
  </div>

</div>
```

## 内容变量

| 变量 | 说明 | 来源 |
|------|------|------|
| `{{THANK_YOU}}` | 感谢语（如"感谢聆听""Thank You""谢谢"） | heading |
| `{{CTA_TEXT}}` | 行动号召/总结语句，1-2 句 | body 首段 |
| `{{CONTACT_INFO}}` | 联系方式（可选），每行一个 `<div>` | key_points 或 body |
| `{{BRAND_SIGNATURE}}` | 品牌签名 | 系统占位符，严禁替换 |
| `{{BRAND_COPYRIGHT}}` | 版权信息 | 系统占位符，严禁替换 |

## 硬性规则

- **`{{BRAND_SIGNATURE}}` 和 `{{BRAND_COPYRIGHT}}` 为系统占位符，必须原样保留，严禁替换为实际文字。**
- 背景必须使用 `var(--primary)` 纯色，与封面一致（书挡效应），禁止渐变。
- 感谢语大号居中，48px 以下。
- 最多 2 个 SVG 装饰圆（模板中的两个），opacity 不超过 0.15。
- 禁止页头页尾。
- 禁止卡片容器。
- 禁止 hex 色值（`#ffffff` 除外）。
- 无联系方式时删除 `{{CONTACT_INFO}}` 所在 div。
