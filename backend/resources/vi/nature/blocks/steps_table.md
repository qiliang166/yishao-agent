# 操作步骤表格 — A4 文档模块四

> **结构铁律：页头区(45px) + 内容区(flex:1) + 页尾区(45px)，三段 flex 列布局。页头页尾各三等分，所有内容左对齐。**

## HTML 模板（必须照抄结构，替换内容）

```html
<div style="width:794px;height:1123px;display:flex;flex-direction:column;background:var(--background);font-family:'Source Sans Pro',Inter,'PingFang SC','Microsoft YaHei',sans-serif;position:relative;overflow:hidden;">

  <!-- ═══ 页头区 45px ═══ -->
  <div style="flex-shrink:0;height:45px;display:flex;align-items:center;font-size:10px;color:rgba(var(--text-rgb),0.45);border-bottom:1px solid rgba(var(--text-rgb),0.08);">
    <div style="flex:1;text-align:left;padding-left:60px;">出品标准文档 &middot; {{TITLE}}</div>
    <div style="flex:1;text-align:left;">版本 2.0 / {{DATE}}</div>
    <div style="flex:1;text-align:left;">{{PAGE_NUM}} / {{TOTAL_PAGES}}</div>
  </div>

  <!-- ═══ 内容区 flex:1 ═══ -->
  <div style="flex:1;position:relative;overflow:hidden;">

    <div style="width:100%;height:3px;background:var(--accent);"></div>

    <div style="width:674px;margin:16px auto 0 auto;border:1px solid rgba(var(--text-rgb),0.2);">
    {{TABLE}}
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


## 内容变量

| 变量 | 说明 |
|------|------|
| `{{TITLE}}` | 菜品名称 |
| `{{DATE}}` | 编写日期 |
| `{{PAGE_NUM}}` | 当前页码 |
| `{{TOTAL_PAGES}}` | 总页数 |
| `{{BRAND_COPYRIGHT}}` | 版权信息占位符，代码替换，严禁写死 |
| `{{BRAND_SIGNATURE}}` | 品牌签名占位符，代码替换，严禁写死 |
| `{{TABLE}}` | 完整表格（colgroup+thead+tbody），由系统按 SKILL key_points 列名自动生成，LLM 不得手写 | 系统 |

## 禁止
- 手写 `<table>`/`<thead>`/`<colgroup>`/`<tbody>`/`<tr>` 结构（表格由系统按 SKILL key_points 自动生成，模板内保留 `{{TABLE}}` 占位）

- 修改页头/页尾的 height(45px)、font-size(10px)、flex 比例
- 同一页内多个表格
- 省略任何步骤行（必须完整列出所有操作步骤）
- `{{BRAND_COPYRIGHT}}` 和 `{{BRAND_SIGNATURE}}` 是系统占位符，**严禁替换为实际文字**
