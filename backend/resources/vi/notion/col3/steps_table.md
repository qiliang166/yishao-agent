# 操作步骤表格 — A4 文档模块四（col3 专属）

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
        <col style="width:48px"><col style="width:75px"><col style="width:112px"><col style="width:73px">
        <col style="width:73px"><col style="width:74px"><col style="width:110px"><col style="width:109px">
      </colgroup>
      <thead>
        <tr style="background:var(--chart-1);color:#ffffff;">
          <th style="padding:9px 6px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">序号</th>
          <th style="padding:9px 6px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">关键词</th>
          <th style="padding:9px 6px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">工具与器皿</th>
          <th colspan="3" style="padding:9px 6px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">操作说明</th>
          <th colspan="2" style="padding:9px 6px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">注意事项</th>
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
  <td style="padding:8px 6px;border:1px solid rgba(var(--text-rgb),0.2);text-align:center;">{{KEYWORD}}</td>
  <td style="padding:8px 6px;border:1px solid rgba(var(--text-rgb),0.2);">{{TOOLS}}</td>
  <td colspan="3" style="padding:8px 6px;border:1px solid rgba(var(--text-rgb),0.2);">{{STEPS_DESC}}</td>
  <td colspan="2" style="padding:8px 6px;border:1px solid rgba(var(--text-rgb),0.2);">{{CAUTIONS}}</td>
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
| `{{TABLE_ROWS}}` | 所有 `<tr>` 行拼接，含 colspan 属性 | LLM 从 body 逐行提取生成 |
| `{{SEQ}}` | 序号（从1开始） | 行模板内，LLM 自增 |
| `{{KEYWORD}}` | 关键词（2-4字，如"涨发""煨制""油炸"） | body 步骤段落提取 |
| `{{TOOLS}}` | 工具与器皿（如"蒸笼、浸泡容器"） | body 步骤段落提取 |
| `{{STEPS_DESC}}` | 操作说明（colspan=3，完整操作描述） | body 步骤段落提取 |
| `{{CAUTIONS}}` | 注意事项（colspan=2，关键控制点） | body 步骤段落提取 |

## 禁止

- 修改页头/页尾的 height(45px)、font-size(10px)、flex 比例
- 同一页内多个表格
- 缺少 colspan 属性（操作说明必须 colspan=3，注意事项必须 colspan=2）
- 省略任何步骤行（必须完整列出所有操作步骤）
- `{{BRAND_COPYRIGHT}}` 和 `{{BRAND_SIGNATURE}}` 是系统占位符，**严禁替换为实际文字**
