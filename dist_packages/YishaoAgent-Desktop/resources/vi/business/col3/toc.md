# 目录页 — A4 文档模块二（col3 专属）

> **结构铁律：页头区(45px) + 内容区(flex:1) + 页尾区(45px)，三段 flex 列布局。页头页尾各三等分，所有内容左对齐。**

## HTML 模板（必须照抄结构，替换内容）

```html
<div style="width:794px;height:1123px;display:flex;flex-direction:column;background:var(--background);font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;position:relative;overflow:hidden;">

  <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="950" r="140" fill="none" stroke="var(--primary)" stroke-width="1.2" opacity="0.12"/>
  </svg>

  <!-- ═══ 页头区 45px ═══ -->
  <div style="flex-shrink:0;height:45px;display:flex;align-items:center;font-size:10px;color:rgba(var(--text-rgb),0.45);border-bottom:1px solid rgba(var(--text-rgb),0.08);">
    <div style="flex:1;text-align:left;padding-left:60px;">{{TITLE}}</div>
    <div style="flex:1;text-align:left;">版本 2.0 / {{DATE}}</div>
    <div style="flex:1;text-align:left;">{{PAGE_NUM}} / {{TOTAL_PAGES}}</div>
  </div>

  <!-- ═══ 内容区 flex:1 ═══ -->
  <div style="flex:1;position:relative;overflow:hidden;">
    <div style="width:100%;height:4px;background:var(--accent);"></div>

    <div style="padding:60px 80px 40px 80px;">
      <div style="font-size:28px;font-weight:700;color:var(--primary);margin-bottom:8px;font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">目录</div>
      <div style="width:40px;height:3px;background:var(--accent);margin-bottom:40px;"></div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        {{TOC_ROWS}}
      </table>
    </div>
  </div>

  <!-- ═══ 页尾区 45px ═══ -->
  <div style="flex-shrink:0;height:45px;display:flex;align-items:center;font-size:10px;color:rgba(var(--text-rgb),0.4);border-top:1px solid rgba(var(--text-rgb),0.08);">
    <div style="flex:1;text-align:left;padding-left:60px;">{{BRAND_COPYRIGHT}}</div>
    <div style="flex:1;text-align:left;">{{BRAND_SIGNATURE}}</div>
    <div style="flex:1;text-align:left;">第 {{PAGE_NUM}} 页</div>
  </div>

</div>
```

## 表格行模板（每行照此格式）

```html
<tr>
  <td style="padding:12px 0;vertical-align:middle;width:48px;">
    <div style="width:32px;height:32px;border-radius:50%;background:{{CHART_COLOR}};color:#ffffff;font-size:14px;font-weight:600;font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;display:flex;align-items:center;justify-content:center;">01</div>
  </td>
  <td style="padding:12px 0;color:var(--text);vertical-align:middle;border-bottom:1px dotted rgba(var(--text-rgb),0.15);font-weight:600;font-size:16px;">{{ENTRY_TITLE}}</td>
  <td style="padding:12px 0;color:rgba(var(--text-rgb),0.45);text-align:right;vertical-align:middle;width:40px;font-size:13px;">{{ENTRY_PAGE}}</td>
</tr>
```

## 序号颜色规则

- `{{CHART_COLOR}}` 使用 chart_colors 数组循环取色
- 条目数 > 5 时 `i % 5` 取模循环
- 保持相邻条目色相差异足够大

## 内容变量

| 变量 | 说明 | 来源 |
|------|------|------|
| `{{TITLE}}` | 文档标题 | heading |
| `{{DATE}}` | 文档日期 | body 或 key_points |
| `{{PAGE_NUM}}` | 当前页码 | 系统生成 |
| `{{TOTAL_PAGES}}` | 总页数 | 系统生成 |
| `{{TOC_ROWS}}` | 所有目录条目行，按行模板格式 | LLM 根据大纲生成 |
| `{{ENTRY_TITLE}}` | 章节标题 | LLM 从 SKILL chapters 填充 |
| `{{ENTRY_PAGE}}` | 章节页码 | LLM 按文档页序填写 |
| `{{CHART_COLOR}}` | 序号圆背景色 | chart_colors 循环取值 |
| `{{BRAND_SIGNATURE}}` | 品牌签名 | 系统占位符，严禁替换为实际文字 |
| `{{BRAND_COPYRIGHT}}` | 版权信息 | 系统占位符，严禁替换为实际文字 |

## 硬性规则

- **页头/页尾的 height(45px)、font-size(10px)、flex 比例不得修改。**
- **`{{BRAND_SIGNATURE}}` 和 `{{BRAND_COPYRIGHT}}` 为系统占位符，必须原样保留。**
- **目录标题 "目录" 固定，不可改为其他文字。**
- **章节数量和顺序由编辑器 chapters 定义，不可自行增减。**
- 条目编号从 01 开始递增。
- 序号圆 32px，居中白色数字，chart_colors 循环取色。
- 标题列使用 `border-bottom:1px dotted` 作为点状引导线。
- 页码右对齐，宽度固定 40px。
- 禁止卡片容器（card_bg + border-radius + shadow）。
- 禁止 hex 色值（`#ffffff` 除外）。
- **严禁替换 `{{BRAND_COPYRIGHT}}` 和 `{{BRAND_SIGNATURE}}` 为实际品牌文字。**
