# table — 数据表格页（A4 通用）

> **结构铁律：页头区(45px) + 内容区(flex:1) + 页尾区(45px)，三段 flex 列布局。674px 宽居中数据表格，`var(--chart-0)` 表头背景。**

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

      <!-- 数据表格 -->
      <table style="width:674px;margin:0 auto;border-collapse:collapse;font-size:12px;border:1px solid rgba(var(--text-rgb),0.2);">
        {{TABLE_HEADER}}
        {{TABLE_BODY}}
      </table>

      <!-- 表格注释（可选） -->
      {{TABLE_CAPTION}}
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
| `{{SECTION_HEADING}}` | 章节/表格标题 | heading |
| `{{TABLE_HEADER}}` | 表头 `<thead>` 完整 HTML | LLM 根据列定义生成 |
| `{{TABLE_BODY}}` | 表体 `<tbody>` 完整 HTML | LLM 根据数据生成 |
| `{{TABLE_CAPTION}}` | 可选表格注释 | key_points 或 body |
| `{{BRAND_SIGNATURE}}` | 品牌签名 | 系统占位符，严禁替换 |
| `{{BRAND_COPYRIGHT}}` | 版权信息 | 系统占位符，严禁替换 |

## TABLE_HEADER 格式

```html
<thead>
  <tr style="background:var(--chart-0);color:#ffffff;font-size:12px;font-weight:600;">
    <th style="padding:10px 12px;text-align:left;border-right:1px solid rgba(255,255,255,0.2);">{{COL_1}}</th>
    <th style="padding:10px 12px;text-align:left;border-right:1px solid rgba(255,255,255,0.2);">{{COL_2}}</th>
    <th style="padding:10px 12px;text-align:left;">{{COL_3}}</th>
  </tr>
</thead>
```

## TABLE_BODY 格式

每行 `<tr>`，奇数行加 `background:rgba(var(--text-rgb),0.02)`：

```html
<tbody>
  <tr style="border-bottom:1px solid rgba(var(--text-rgb),0.1);">
    <td style="padding:8px 12px;border-right:1px solid rgba(var(--text-rgb),0.08);">{{ROW1_COL1}}</td>
    <td style="padding:8px 12px;border-right:1px solid rgba(var(--text-rgb),0.08);">{{ROW1_COL2}}</td>
    <td style="padding:8px 12px;">{{ROW1_COL3}}</td>
  </tr>
  <tr style="background:rgba(var(--text-rgb),0.02);border-bottom:1px solid rgba(var(--text-rgb),0.1);">
    <td style="padding:8px 12px;border-right:1px solid rgba(var(--text-rgb),0.08);">{{ROW2_COL1}}</td>
    <td style="padding:8px 12px;border-right:1px solid rgba(var(--text-rgb),0.08);">{{ROW2_COL2}}</td>
    <td style="padding:8px 12px;">{{ROW2_COL3}}</td>
  </tr>
</tbody>
```

## 硬性规则

- **`{{BRAND_SIGNATURE}}` 和 `{{BRAND_COPYRIGHT}}` 为系统占位符，必须原样保留。**
- 表格宽度固定 674px，居中。
- 表头背景必须使用 `var(--chart-0)`，文字 `#ffffff`。
- 数据行必须交替背景色：偶数行 `background:rgba(var(--text-rgb),0.02)`。
- 列数由 key_points 决定，最少 2 列，最多 8 列。
- 列宽均匀分配（`<colgroup>` 可选）。
- 禁止 hex 色值（表头 `#ffffff` 除外）。
