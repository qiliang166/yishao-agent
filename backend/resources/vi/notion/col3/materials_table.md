# 食材清单表格 — A4 文档模块三（col3 专属）

> **结构铁律：页头区(45px) + 内容区(flex:1) + 页尾区(45px)，三段 flex 列布局。页头页尾各三等分，所有内容居中对齐。**

## HTML 模板（必须照抄结构，替换内容）

```html
<div style="width:794px;height:1123px;display:flex;flex-direction:column;background:var(--background);font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;position:relative;overflow:hidden;">

  <!-- ═══ 页头区 45px ═══ -->
  <div style="flex-shrink:0;height:45px;display:flex;align-items:center;font-size:10px;color:rgba(var(--text-rgb),0.45);border-bottom:1px solid rgba(var(--text-rgb),0.08);">
    <div style="flex:1;text-align:center;padding-left:60px;">出品标准文档 &middot; {{TITLE}}</div>
    <div style="flex:1;text-align:center;">{{VERSION_NOTE}} / {{DATE}}</div>
    <div style="flex:1;text-align:center;">第{{PAGE_NUM}}页/共{{TOTAL_PAGES}}页</div>
  </div>

  <!-- ═══ 内容区 flex:1 ═══ -->
  <div style="flex:1;position:relative;overflow:hidden;">

    <div style="width:100%;height:3px;background:var(--accent);"></div>

    <div style="width:674px;margin:16px auto 0 auto;border:1px solid rgba(var(--text-rgb),0.2);">
    <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;">
      <colgroup>
        <col style="width:40px"><col style="width:65px"><col style="width:110px"><col style="width:70px">
        <col style="width:149px"><col style="width:150px"><col style="width:45px"><col style="width:45px">
      </colgroup>
      <thead>
        <tr style="background:var(--chart-0);color:#ffffff;">
          <th style="padding:9px 6px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">序号</th>
          <th style="padding:9px 6px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">食材分类</th>
          <th style="padding:9px 6px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">名称</th>
          <th style="padding:9px 6px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">品牌/产地</th>
          <th style="padding:9px 6px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">加工说明</th>
          <th style="padding:9px 6px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">加工要求</th>
          <th style="padding:9px 6px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">重量</th>
          <th style="padding:9px 6px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">单位</th>
        </tr>
      </thead>
      <tbody>
        {{TABLE_ROWS}}
      </tbody>
    </table>
    </div>

  </div>

  <!-- ═══ 页尾区 45px ═══ -->
  <div style="flex-shrink:0;height:45px;display:flex;align-items:center;font-size:10px;color:rgba(var(--text-rgb),0.4);border-top:1px solid rgba(var(--text-rgb),0.08);">
    <div style="flex:1;text-align:center;padding-left:60px;">{{BRAND_COPYRIGHT}}</div>
    <div style="flex:1;text-align:center;">{{BRAND_SIGNATURE}}</div>
    <div style="flex:1;text-align:center;">第{{PAGE_NUM}}页/共{{TOTAL_PAGES}}页</div>
  </div>

</div>
```

## 表格行模板（每行照此格式）

```html
<tr style="background:{{ROW_BG}};">
  <td style="padding:8px 6px;border:1px solid rgba(var(--text-rgb),0.2);text-align:center;">{{SEQ}}</td>
  <td style="padding:8px 6px;border:1px solid rgba(var(--text-rgb),0.2);text-align:center;">{{CATEGORY}}</td>
  <td style="padding:8px 6px;border:1px solid rgba(var(--text-rgb),0.2);">{{NAME}}</td>
  <td style="padding:8px 6px;border:1px solid rgba(var(--text-rgb),0.2);">{{BRAND}}</td>
  <td style="padding:8px 6px;border:1px solid rgba(var(--text-rgb),0.2);">{{PROCESS_NOTE}}</td>
  <td style="padding:8px 6px;border:1px solid rgba(var(--text-rgb),0.2);">{{PROCESS_REQ}}</td>
  <td style="padding:8px 6px;border:1px solid rgba(var(--text-rgb),0.2);text-align:center;">{{WEIGHT}}</td>
  <td style="padding:8px 6px;border:1px solid rgba(var(--text-rgb),0.2);text-align:center;">{{UNIT}}</td>
</tr>
```

## 行背景规则

- 奇数行（1,3,5...）：`{{ROW_BG}}` = `rgba(var(--text-rgb),0.02)`
- 偶数行（2,4,6...）：`{{ROW_BG}}` = `transparent`

## 内容变量

| 变量 | 说明 | 来源 |
|------|------|------|
| `{{TITLE}}` | 菜品名称 | heading |
| `{{DATE}}` | 编写日期 | key_points[0] |
| `{{VERSION_NOTE}}` | 版本说明 | key_points[4] |
| `{{PAGE_NUM}}` | 当前页码 | 系统 |
| `{{TOTAL_PAGES}}` | 总页数 | 系统 |
| `{{BRAND_COPYRIGHT}}` | 版权信息占位符，严禁替换为实际文字 | 系统通用设置 |
| `{{BRAND_SIGNATURE}}` | 品牌签名占位符，严禁替换为实际文字 | 系统通用设置 |
| `{{TABLE_ROWS}}` | 所有 `<tr>` 行拼接，每行8个 `<td>`，照行模板格式 | LLM 从 body 逐行提取生成 |
| `{{SEQ}}` | 序号（从1开始） | 行模板内，LLM 自增 |
| `{{CATEGORY}}` | 食材分类（干货/海鲜/禽类/调辅料/香料/调味品/汤水/淀粉） | body 食材段落提取 |
| `{{NAME}}` | 食材名称 | body 食材段落提取 |
| `{{BRAND}}` | 品牌或产地（原文未提及则填"—"） | body 食材段落提取 |
| `{{PROCESS_NOTE}}` | 加工说明（如"干蒸后50℃浸泡8h"） | body 食材段落提取 |
| `{{PROCESS_REQ}}` | 加工要求（如"胶质不流失"） | body 食材段落提取 |
| `{{WEIGHT}}` | 数值（如"100"） | body 食材段落提取 |
| `{{UNIT}}` | 单位（克/毫升/个/片/颗） | body 食材段落提取 |

## 禁止

- 修改页头/页尾的 height(45px)、font-size(10px)、flex 比例
- 跨列合并（colspan）— 每行严格8列
- 同一页内多个表格
- 省略任何食材行（必须完整列出所有原料）
- `{{BRAND_COPYRIGHT}}` 和 `{{BRAND_SIGNATURE}}` 是系统占位符，**严禁替换为实际文字**
