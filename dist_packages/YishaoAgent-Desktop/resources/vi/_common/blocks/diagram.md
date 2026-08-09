# diagram — 示意图/插图页（A4 通用）

> **结构铁律：页头区(45px) + 内容区(flex:1) + 页尾区(45px)，三段 flex 列布局。大型 SVG 插图区域 + 标注说明。**

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

    <div style="padding:40px 60px;">
      <!-- 章节标题 -->
      <div style="font-size:22px;font-weight:700;color:var(--primary);margin-bottom:6px;">{{SECTION_HEADING}}</div>
      <div style="width:40px;height:3px;background:var(--accent);margin-bottom:24px;"></div>

      <!-- SVG 插图区 -->
      <div style="width:674px;height:420px;margin:0 auto;border:1px solid rgba(var(--text-rgb),0.12);border-radius:4px;display:flex;align-items:center;justify-content:center;background:rgba(var(--text-rgb),0.02);overflow:hidden;">
        {{DIAGRAM_SVG}}
      </div>

      <!-- 插图标题 -->
      <div style="text-align:center;margin-top:12px;font-size:12px;color:rgba(var(--text-rgb),0.5);font-style:italic;">{{DIAGRAM_CAPTION}}</div>

      <!-- 标注说明（可选） -->
      {{ANNOTATIONS}}
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
| `{{SECTION_HEADING}}` | 插图标题 | heading |
| `{{DIAGRAM_SVG}}` | 完整内联 SVG 元素 | LLM 根据内容生成 |
| `{{DIAGRAM_CAPTION}}` | 插图标题/说明 | body 首句 |
| `{{ANNOTATIONS}}` | 可选标注列表 | key_points 或 body |
| `{{BRAND_SIGNATURE}}` | 品牌签名 | 系统占位符，严禁替换 |
| `{{BRAND_COPYRIGHT}}` | 版权信息 | 系统占位符，严禁替换 |

## DIAGRAM_SVG 约束

SVG 使用 viewBox，宽高比适配 674×420 容器：
```html
<svg viewBox="0 0 674 420" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
  <!-- 使用 var(--primary) / var(--accent) / var(--chart-0) 等 CSS 变量作为颜色 -->
  <!-- 文字使用 font-family:system-ui 与页面一致 -->
  <!-- 线段 stroke-width >= 1.5 -->
</svg>
```

## ANNOTATIONS 格式（有标注时使用）

```html
<div style="margin-top:20px;display:flex;flex-wrap:wrap;gap:12px;justify-content:center;">
  <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text);">
    <div style="width:8px;height:8px;border-radius:50%;background:var(--chart-0);"></div>{{ANNO_1}}
  </div>
  <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text);">
    <div style="width:8px;height:8px;border-radius:50%;background:var(--chart-1);"></div>{{ANNO_2}}
  </div>
  <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text);">
    <div style="width:8px;height:8px;border-radius:50%;background:var(--chart-2);"></div>{{ANNO_3}}
  </div>
</div>
```

## 硬性规则

- **`{{BRAND_SIGNATURE}}` 和 `{{BRAND_COPYRIGHT}}` 为系统占位符，必须原样保留。**
- SVG 插图区尺寸固定 674×420px，居中显示。
- SVG 内的颜色必须使用 CSS 变量（`var(--primary)` 等），禁止硬编码 hex。
- SVG 内文字使用 `font-family:system-ui`，与页面保持一致。
- 线条 stroke-width 至少 1.5px，保证打印清晰。
- 无标注时删除 `{{ANNOTATIONS}}` 整块。
- 禁止 hex 色值（`#ffffff` 除外）。
