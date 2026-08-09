# toc — 目录页（A4 通用）

> **结构铁律：页头区(45px) + 内容区(flex:1) + 页尾区(45px)，三段 flex 列布局。目录条目使用编号+标题+页码的整齐排列。**

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

    <div style="padding:60px 80px 40px 80px;">
      <div style="font-size:28px;font-weight:700;color:var(--primary);margin-bottom:8px;font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">目录</div>
      <div style="width:40px;height:3px;background:var(--accent);margin-bottom:40px;"></div>

      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        {{TOC_ROWS}}
      </table>
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
| `{{VERSION_LABEL}}` | 版本标签（如"V1.0"） | body 或 key_points |
| `{{PAGE_NUM}}` | 当前页码 | 系统生成 |
| `{{TOTAL_PAGES}}` | 总页数 | 系统生成 |
| `{{TOC_ROWS}}` | 目录条目行 | LLM 根据大纲生成 |
| `{{BRAND_SIGNATURE}}` | 品牌签名 | 系统占位符，严禁替换 |
| `{{BRAND_COPYRIGHT}}` | 版权信息 | 系统占位符，严禁替换 |

## TOC_ROWS 格式

每条目为一行 `<tr>`，包含编号、标题、页码三列：

```html
<tr>
  <td style="padding:10px 0;color:var(--primary);font-weight:600;font-size:14px;vertical-align:top;width:40px;">01</td>
  <td style="padding:10px 0;color:var(--text);vertical-align:top;border-bottom:1px dotted rgba(var(--text-rgb),0.15);">{{ENTRY_TITLE}}</td>
  <td style="padding:10px 0;color:rgba(var(--text-rgb),0.45);text-align:right;vertical-align:top;width:40px;">{{ENTRY_PAGE}}</td>
</tr>
```

## 硬性规则

- **`{{BRAND_SIGNATURE}}` 和 `{{BRAND_COPYRIGHT}}` 为系统占位符，必须原样保留。**
- 目录标题 "目录" 固定，不可改为其他文字。
- 条目编号从 01 开始递增。
- 标题列使用 `border-bottom:1px dotted` 作为点状引导线。
- 页码右对齐，宽度固定 40px。
- 禁止卡片容器。
- 禁止 hex 色值（`#ffffff` 除外）。
