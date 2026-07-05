# flowchart — 流程图/步骤页（A4 通用）

> **结构铁律：页头区(45px) + 内容区(flex:1) + 页尾区(45px)，三段 flex 列布局。步骤节点通过箭头连接，节点使用 card_bg 背景 + accent 左边框。**

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

      <!-- 流程步骤 -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:0;">
        {{FLOW_STEPS}}
      </div>
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
| `{{SECTION_HEADING}}` | 流程标题 | heading |
| `{{FLOW_STEPS}}` | 步骤节点列表（含连接箭头） | body |
| `{{BRAND_SIGNATURE}}` | 品牌签名 | 系统占位符，严禁替换 |
| `{{BRAND_COPYRIGHT}}` | 版权信息 | 系统占位符，严禁替换 |

## FLOW_STEPS 格式

每个步骤包含节点 + 连接箭头（最后一个步骤无箭头）：

```html
<!-- 步骤节点 -->
<div style="width:560px;display:flex;gap:0;background:var(--card_bg);border-radius:6px;border-left:4px solid var(--chart-0);overflow:hidden;">
  <div style="width:48px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
    <div style="width:28px;height:28px;border-radius:50%;background:var(--chart-0);color:#ffffff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;">{{STEP_NUM}}</div>
  </div>
  <div style="flex:1;padding:12px 16px 12px 4px;">
    <div style="font-size:14px;font-weight:600;color:var(--primary);margin-bottom:4px;">{{STEP_TITLE}}</div>
    <div style="font-size:12px;color:rgba(var(--text-rgb),0.7);line-height:1.6;">{{STEP_DESC}}</div>
  </div>
</div>

<!-- 连接箭头（步骤间） -->
<div style="width:2px;height:20px;background:rgba(var(--text-rgb),0.15);position:relative;">
  <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid rgba(var(--text-rgb),0.25);"></div>
</div>
```

重复上述结构，最后一个步骤后无箭头。步骤颜色按 `var(--chart-0)` → `var(--chart-1)` → `var(--chart-2)` → `var(--chart-3)` → `var(--chart-4)` 循环。

## 硬性规则

- **`{{BRAND_SIGNATURE}}` 和 `{{BRAND_COPYRIGHT}}` 为系统占位符，必须原样保留。**
- 步骤节点宽度固定 560px，居中。
- 步骤号从 1 开始递增，放在圆形徽章中。
- 节点颜色按顺序使用 `var(--chart-0)` 到 `var(--chart-4)` 循环。
- 箭头连接器为竖直线 + 下三角，高度 20px。
- 最少 2 个步骤，最多 8 个步骤。
- 禁止 hex 色值（步骤号 `#ffffff` 除外）。
