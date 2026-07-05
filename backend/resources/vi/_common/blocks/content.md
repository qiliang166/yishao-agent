# content — 通用内容页（A4 通用）

> **结构铁律：页头区(45px) + 内容区(flex:1) + 页尾区(45px)，三段 flex 列布局。正文段落 + 可选要点列表 + 可选图片占位。**

## HTML 模板（必须照抄结构，替换内容）

```html
<div style="width:794px;height:1123px;display:flex;flex-direction:column;background:var(--background);font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;position:relative;overflow:hidden;">

  <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="950" r="140" fill="none" stroke="var(--primary)" stroke-width="1.2" opacity="0.12"/>
  </svg>

  <!-- ═══ 页头区 45px ═══ -->
  <div style="flex-shrink:0;height:45px;display:flex;align-items:center;font-size:10px;color:rgba(var(--text-rgb),0.45);border-bottom:1px solid rgba(var(--text-rgb),0.08);">
    <div style="flex:1;text-align:left;padding-left:60px;">{{TITLE}}</div>
    <div style="flex:1;text-align:left;">{{VERSION_LABEL}} / {{DATE}}</div>
    <div style="flex:1;text-align:left;">{{PAGE_NUM}} / {{TOTAL_PAGES}}</div>
  </div>

  <!-- ═══ 内容区 flex:1 ═══ -->
  <div style="flex:1;position:relative;overflow:hidden;">
    <div style="width:100%;height:4px;background:var(--accent);"></div>

    <div style="padding:40px 80px;">
      <!-- 章节标题 -->
      <div style="font-size:22px;font-weight:700;color:var(--primary);margin-bottom:6px;">{{SECTION_HEADING}}</div>
      <div style="width:40px;height:3px;background:var(--accent);margin-bottom:28px;"></div>

      <!-- 正文段落 -->
      <div style="font-size:14px;color:var(--text);line-height:1.9;">
        {{BODY_PARAGRAPHS}}
      </div>

      <!-- 要点列表（可选） -->
      {{KEY_POINTS_BLOCK}}

      <!-- 图片占位（可选） -->
      {{IMAGE_PLACEHOLDER}}
    </div>
  </div>

  <!-- ═══ 页尾区 45px ═══ -->
  <div style="flex-shrink:0;height:45px;display:flex;align-items:center;font-size:10px;color:rgba(var(--text-rgb),0.4);border-top:1px solid rgba(var(--text-rgb),0.08);">
    <div style="flex:1;text-align:left;padding-left:60px;">{{BRAND_COPYRIGHT}}</div>
    <div style="flex:1;text-align:left;">{{BRAND_SIGNATURE}}</div>
    <div style="flex:1;text-align:left;">Page {{PAGE_NUM}}</div>
  </div>

</div>
```

## 内容变量

| 变量 | 说明 | 来源 |
|------|------|------|
| `{{TITLE}}` | 文档标题 | heading |
| `{{DATE}}` | 文档日期 | body 或 key_points |
| `{{VERSION_LABEL}}` | 版本标签 | body 或 key_points |
| `{{PAGE_NUM}}` | 当前页码 | 系统生成 |
| `{{TOTAL_PAGES}}` | 总页数 | 系统生成 |
| `{{SECTION_HEADING}}` | 章节标题 | heading |
| `{{BODY_PARAGRAPHS}}` | 正文段落，每段用 `<p style="margin-bottom:14px;">...</p>` 包裹 | body |
| `{{KEY_POINTS_BLOCK}}` | 可选要点列表 | key_points |
| `{{IMAGE_PLACEHOLDER}}` | 可选图片占位区 | key_points 或 body |
| `{{BRAND_SIGNATURE}}` | 品牌签名 | 系统占位符，严禁替换 |
| `{{BRAND_COPYRIGHT}}` | 版权信息 | 系统占位符，严禁替换 |

## KEY_POINTS_BLOCK 格式（有要点时使用）

```html
<div style="margin-top:20px;padding:16px 20px;background:var(--card_bg);border-radius:4px;border-left:3px solid var(--accent);">
  <div style="font-size:13px;font-weight:600;color:var(--primary);margin-bottom:10px;">要点</div>
  <ul style="margin:0;padding-left:20px;font-size:13px;color:var(--text);line-height:1.8;">
    <li>{{POINT_1}}</li>
    <li>{{POINT_2}}</li>
    <li>{{POINT_3}}</li>
  </ul>
</div>
```

## IMAGE_PLACEHOLDER 格式（有图片时使用）

```html
<div style="margin-top:24px;width:100%;height:200px;border:2px dashed rgba(var(--accent-rgb),0.35);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:12px;color:rgba(var(--text-rgb),0.3);">
  [ 图片：{{IMAGE_CAPTION}} ]
</div>
```

## 硬性规则

- **`{{BRAND_SIGNATURE}}` 和 `{{BRAND_COPYRIGHT}}` 为系统占位符，必须原样保留。**
- 正文段落必须用 `<p>` 标签包裹，段间距 14px。
- 要点列表使用 `<ul>` + `<li>`，放在 `var(--card_bg)` 背景的卡片中，左边 accent 色条。
- 图片占位使用虚线边框，居中显示标题，不生成实际图片。
- 无要点时删除 `{{KEY_POINTS_BLOCK}}` 整块；无图片时删除 `{{IMAGE_PLACEHOLDER}}` 整块。
- 禁止卡片容器包裹正文区域。
- 禁止 hex 色值（`#ffffff` 除外）。
