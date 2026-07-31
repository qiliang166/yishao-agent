# chart — 图表/数据可视化页（A4 通用）

> **结构铁律：页头区(45px) + 内容区(flex:1) + 页尾区(45px)，三段 flex 列布局。支持大数字、进度条、水平柱状图、环形图四种图表类型。**

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
      <div style="width:40px;height:3px;background:var(--accent);margin-bottom:32px;"></div>

      <!-- 图表内容区 -->
      {{CHART_CONTENT}}

      <!-- 图例（可选） -->
      {{CHART_LEGEND}}

      <!-- 图表说明（可选） -->
      {{CHART_CAPTION}}
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
| `{{SECTION_HEADING}}` | 图表标题 | heading |
| `{{CHART_CONTENT}}` | 图表主体（按类型选择以下四种之一） | body |
| `{{CHART_LEGEND}}` | 可选图例行 | key_points 或 body |
| `{{CHART_CAPTION}}` | 可选图表注释 | key_points 或 body |
| `{{BRAND_SIGNATURE}}` | 品牌签名 | 系统占位符，严禁替换 |
| `{{BRAND_COPYRIGHT}}` | 版权信息 | 系统占位符，严禁替换 |

## 图表类型 1：大数字 (big_number)

```html
<div style="text-align:center;padding:80px 0 40px 0;">
  <div style="font-size:13px;color:rgba(var(--text-rgb),0.5);margin-bottom:8px;">{{METRIC_LABEL}}</div>
  <div style="font-size:64px;font-weight:700;color:var(--chart-0);line-height:1;">{{METRIC_VALUE}}</div>
  <div style="font-size:14px;color:rgba(var(--text-rgb),0.5);margin-top:8px;">{{METRIC_UNIT}}</div>
</div>
```

## 图表类型 2：进度条 (progress_bar)

```html
<div style="padding:20px 40px;">
  {{PROGRESS_BARS}}
</div>
```
每条进度条：
```html
<div style="margin-bottom:20px;">
  <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text);margin-bottom:4px;">
    <span>{{BAR_LABEL}}</span><span>{{BAR_VALUE}}{{BAR_UNIT}}</span>
  </div>
  <div style="width:100%;height:8px;background:rgba(var(--text-rgb),0.08);border-radius:4px;overflow:hidden;">
    <div style="width:{{BAR_PERCENT}}%;height:100%;background:var(--chart-0);border-radius:4px;"></div>
  </div>
</div>
```

## 图表类型 3：水平柱状图 (bar)

```html
<div style="padding:20px 40px;">
  {{BAR_CHART_ROWS}}
</div>
```
每行：
```html
<div style="display:flex;align-items:center;margin-bottom:14px;">
  <div style="width:100px;font-size:12px;color:var(--text);text-align:right;padding-right:12px;">{{BAR_LABEL}}</div>
  <div style="flex:1;height:22px;background:rgba(var(--text-rgb),0.05);border-radius:3px;overflow:hidden;">
    <div style="width:{{BAR_PERCENT}}%;height:100%;background:var(--chart-0);border-radius:3px;display:flex;align-items:center;padding-left:8px;font-size:10px;color:#ffffff;">{{BAR_VALUE}}</div>
  </div>
</div>
```

## 图表类型 4：环形图 (donut)

```html
<div style="text-align:center;padding:20px 0;">
  <svg width="280" height="280" viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg">
    <circle cx="140" cy="140" r="100" fill="none" stroke="rgba(var(--text-rgb),0.08)" stroke-width="24"/>
    <circle cx="140" cy="140" r="100" fill="none" stroke="var(--chart-0)" stroke-width="24"
      stroke-dasharray="{{DONUT_DASH_ARRAY}}" stroke-dashoffset="0" stroke-linecap="round"
      transform="rotate(-90 140 140)"/>
    <text x="140" y="130" text-anchor="middle" font-size="36" font-weight="700" fill="var(--text)">{{DONUT_PCT}}%</text>
    <text x="140" y="158" text-anchor="middle" font-size="12" fill="rgba(var(--text-rgb),0.5)">{{DONUT_LABEL}}</text>
  </svg>
</div>
```
`{{DONUT_DASH_ARRAY}}` 计算：`(percentage * 628 / 100)  (628 - percentage * 628 / 100)`，其中 628 = 2π×100。

## 图例格式（有图例时使用）

```html
<div style="display:flex;justify-content:center;gap:24px;margin-top:16px;font-size:11px;color:rgba(var(--text-rgb),0.6);">
  <div style="display:flex;align-items:center;gap:6px;"><div style="width:10px;height:10px;border-radius:2px;background:var(--chart-0);"></div>{{LEGEND_1}}</div>
  <div style="display:flex;align-items:center;gap:6px;"><div style="width:10px;height:10px;border-radius:2px;background:var(--chart-1);"></div>{{LEGEND_2}}</div>
  <div style="display:flex;align-items:center;gap:6px;"><div style="width:10px;height:10px;border-radius:2px;background:var(--chart-2);"></div>{{LEGEND_3}}</div>
</div>
```

## 硬性规则

- **`{{BRAND_SIGNATURE}}` 和 `{{BRAND_COPYRIGHT}}` 为系统占位符，必须原样保留。**
- 图表颜色按顺序使用 `var(--chart-0)` 到 `var(--chart-4)`，禁止硬编码 hex。
- 每页只使用一种图表类型。
- 数据必须可视化呈现，裸数字禁止单独出现。
- 环形图 `stroke-dasharray` 必须正确计算：`周长 = 2 × π × 100 ≈ 628`。
- 禁止 hex 色值（`#ffffff` 除外）。
