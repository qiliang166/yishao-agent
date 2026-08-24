# 食材清单表格 — A4 文档模块三（col3 专属）

> **结构铁律：页头区(45px) + 内容区(flex:1) + 页尾区(45px)，三段 flex 列布局。页头页尾各三等分，所有内容居中对齐。**

## HTML 模板（必须照抄结构，替换内容）

```html
<div style="width:794px;height:1123px;display:flex;flex-direction:column;background:var(--background);font-family:Quicksand, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif;position:relative;overflow:hidden;">

  <!-- ═══ 页头区 45px ═══ -->
  <div style="flex-shrink:0;height:45px;display:flex;align-items:center;font-size:10px;color:rgba(var(--text-rgb),0.45);border-bottom:1px solid rgba(var(--text-rgb),0.08);">
    <div style="flex:1;text-align:center;padding-left:60px;">出品标准文档 &middot; {{TITLE}}</div>
    <div style="flex:1;text-align:center;">{{VERSION_NOTE}} / {{DATE}}</div>
    <div style="flex:1;text-align:center;">第{{PAGE_NUM}}页/共{{TOTAL_PAGES}}页</div>
  </div>

  <!-- ═══ 内容区 flex:1 ═══ -->
  <div style="flex:1;position:relative;overflow:hidden;">

    <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="950" r="140" fill="none" stroke="var(--primary)" stroke-width="1.2" opacity="0.12"/>
    </svg>

    <div style="width:100%;height:4px;background:var(--accent);"></div>

    <div style="width:674px;margin:16px auto 0 auto;border:1px solid rgba(var(--text-rgb),0.2);">
    {{TABLE}}
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
| `{{TABLE}}` | 完整表格（colgroup+thead+tbody），由系统按 SKILL key_points 列名自动生成，LLM 不得手写 | 系统 |

## 禁止
- 手写 `<table>`/`<thead>`/`<colgroup>`/`<tbody>`/`<tr>` 结构（表格由系统按 SKILL key_points 自动生成，模板内保留 `{{TABLE}}` 占位）

- 修改页头/页尾的 height(45px)、font-size(10px)、flex 比例
- 同一页内多个表格
- 省略任何食材行（必须完整列出所有原料）
- `{{BRAND_COPYRIGHT}}` 和 `{{BRAND_SIGNATURE}}` 是系统占位符，**严禁替换为实际文字**
