# cover — 封面页（A4 通用）

> **结构铁律：全页 var(--primary) 纯色背景，绝对定位布局。封面是唯一豁免三段 flex 布局的页面类型，不含页头页尾。**

## HTML 模板（必须照抄结构，替换内容）

```html
<div style="width:794px;height:1123px;position:relative;overflow:hidden;background:var(--primary);font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">

  <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
    <circle cx="80" cy="850" r="180" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.3"/>
  </svg>

  <!-- 顶部 accent 色条 8px -->
  <div style="position:absolute;top:0;left:0;width:100%;height:8px;background:var(--accent);"></div>

  <!-- 标题区 -->
  <div style="position:absolute;top:280px;left:0;width:100%;text-align:center;">
    <div style="font-size:52px;font-weight:700;color:#ffffff;letter-spacing:3px;padding:0 80px;line-height:1.2;">{{TITLE}}</div>
    <div style="width:48px;height:4px;background:var(--accent);margin:24px auto 0 auto;"></div>
    <div style="margin-top:16px;font-size:15px;color:rgba(255,255,255,0.6);padding:0 100px;">{{SUBTITLE}}</div>
  </div>

  <!-- 元数据信息表 -->
  <div style="position:absolute;top:560px;left:0;width:100%;text-align:center;">
    <table style="margin:0 auto;border-collapse:collapse;">
      <tr>
        <td style="font-size:12px;color:rgba(255,255,255,0.35);padding:0 16px 14px 0;text-align:right;white-space:nowrap;">{{META_LABEL_1}}</td>
        <td style="font-size:14px;color:rgba(255,255,255,0.6);padding:0 0 14px 16px;text-align:left;">{{META_VALUE_1}}</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:rgba(255,255,255,0.35);padding:14px 16px 14px 0;text-align:right;white-space:nowrap;">{{META_LABEL_2}}</td>
        <td style="font-size:14px;color:rgba(255,255,255,0.6);padding:14px 0 14px 16px;text-align:left;">{{META_VALUE_2}}</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:rgba(255,255,255,0.35);padding:14px 16px 14px 0;text-align:right;white-space:nowrap;">{{META_LABEL_3}}</td>
        <td style="font-size:14px;color:rgba(255,255,255,0.6);padding:14px 0 14px 16px;text-align:left;">{{META_VALUE_3}}</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:rgba(255,255,255,0.35);padding:14px 16px 0 0;text-align:right;white-space:nowrap;">{{META_LABEL_4}}</td>
        <td style="font-size:14px;color:rgba(255,255,255,0.6);padding:14px 0 0 16px;text-align:left;">{{META_VALUE_4}}</td>
      </tr>
    </table>
  </div>

  <!-- 底部品牌信息 -->
  <div style="position:absolute;bottom:50px;left:0;width:100%;text-align:center;font-size:12px;color:rgba(255,255,255,0.35);">
    <div style="margin-bottom:6px;">{{BRAND_SIGNATURE}}</div>
    <div>{{BRAND_COPYRIGHT}}</div>
  </div>

</div>
```

## 内容变量

| 变量 | 说明 | 来源 |
|------|------|------|
| `{{TITLE}}` | 文档主标题 | heading |
| `{{SUBTITLE}}` | 副标题/简述，1-2 句说明文档性质与用途 | lead 字段或 body 首句提炼 |
| `{{META_LABEL_1}}` | 元信息标签 1（如"日期"） | key_points[0] |
| `{{META_VALUE_1}}` | 元信息值 1 | key_points[0] 对应内容 |
| `{{META_LABEL_2}}` | 元信息标签 2（如"分类"） | key_points[1] |
| `{{META_VALUE_2}}` | 元信息值 2 | key_points[1] 对应内容 |
| `{{META_LABEL_3}}` | 元信息标签 3（如"关键词"） | key_points[2] |
| `{{META_VALUE_3}}` | 元信息值 3 | key_points[2] 对应内容 |
| `{{META_LABEL_4}}` | 元信息标签 4（如"版本"） | key_points[3] |
| `{{META_VALUE_4}}` | 元信息值 4 | key_points[3] 对应内容 |
| `{{BRAND_SIGNATURE}}` | 品牌签名 | 系统占位符，严禁替换为实际文字 |
| `{{BRAND_COPYRIGHT}}` | 版权信息 | 系统占位符，严禁替换为实际文字 |

## 硬性规则

- **三段 flex 列布局不适用于封面。封面使用绝对定位。**
- **`{{BRAND_SIGNATURE}}` 和 `{{BRAND_COPYRIGHT}}` 为系统占位符，必须原样保留，严禁替换为实际文字。**
- 纯色 `var(--primary)` 背景，禁止渐变。
- 禁止卡片容器（card_bg + border-radius + shadow）。
- 仅保留模板中的单个 SVG 装饰圆，禁止添加额外圆圈。
- 元数据表格无边框。
- 禁止页头页尾。
- 禁止 hex 色值（`#ffffff` 除外）。
