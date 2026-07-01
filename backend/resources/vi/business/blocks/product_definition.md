# 成品定义与感官目标 — A4 文档模块二

> **结构铁律：页头区(45px) + 内容区(flex:1) + 页尾区(45px)，三段 flex 列布局。页头页尾各三等分，所有内容左对齐。**

## HTML 模板（必须照抄结构，替换内容）

```html
<div style="width:794px;height:1123px;display:flex;flex-direction:column;background:var(--background);font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;position:relative;overflow:hidden;">

  <!-- ═══ 页头区 45px ═══ -->
  <div style="flex-shrink:0;height:45px;display:flex;align-items:center;font-size:10px;color:rgba(var(--text-rgb),0.45);border-bottom:1px solid rgba(var(--text-rgb),0.08);">
    <div style="flex:1;text-align:left;padding-left:60px;">出品标准文档 &middot; {{TITLE}}</div>
    <div style="flex:1;text-align:left;">版本 2.0 / {{DATE}}</div>
    <div style="flex:1;text-align:left;">{{PAGE_NUM}} / {{TOTAL_PAGES}}</div>
  </div>

  <!-- ═══ 内容区 flex:1 ═══ -->
  <div style="flex:1;position:relative;overflow:hidden;">

    <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="950" r="140" fill="none" stroke="var(--primary)" stroke-width="1.2" opacity="0.12"/>
    </svg>

    <div style="width:100%;height:4px;background:var(--accent);"></div>

    <table style="width:674px;margin:16px auto 0 auto;border-collapse:collapse;font-size:12px;">
      <colgroup>
        <col style="width:88px">
        <col style="width:586px">
      </colgroup>
      <tr>
        <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.1);">正式名称</td>
        <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.1);">{{PRODUCT_NAME}}</td>
      </tr>
      <tr>
        <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.1);">类型特征</td>
        <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.1);">{{TYPE_FEATURE}}</td>
      </tr>
      <tr>
        <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.1);">色泽标准</td>
        <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.1);">{{COLOR_STANDARD}}</td>
      </tr>
      <tr>
        <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.1);">香气特征</td>
        <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.1);">{{AROMA_PROFILE}}</td>
      </tr>
      <tr>
        <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.1);">口感层次</td>
        <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.1);">{{TASTE_TEXTURE}}</td>
      </tr>
      <tr>
        <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.1);">口味标准</td>
        <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.1);">{{FLAVOR_STANDARD}}</td>
      </tr>
      <tr>
        <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.1);">出品温度</td>
        <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.1);">{{SERVING_TEMP}}</td>
      </tr>
      <tr>
        <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.1);">成品形态</td>
        <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.1);">{{FINAL_FORM}}</td>
      </tr>
      <tr>
        <td colspan="2" style="height:180px;text-align:center;color:var(--text);opacity:0.5;font-size:12px;font-style:italic;border:1px solid rgba(var(--text-rgb),0.1);border-top:none;background:rgba(var(--text-rgb),0.01);vertical-align:middle;">{{DESCRIPTION}}</td>
      </tr>
      <tr>
        <td colspan="2" style="border:1.5px dashed rgba(var(--accent-rgb),0.35);border-radius:8px;text-align:center;color:rgba(var(--text-rgb),0.4);font-size:12px;padding:16px 0;">{{IMAGE_PLACEHOLDER}}</td>
      </tr>
    </table>

  </div>

  <!-- ═══ 页尾区 45px ═══ -->
  <div style="flex-shrink:0;height:45px;display:flex;align-items:center;font-size:10px;color:rgba(var(--text-rgb),0.4);border-top:1px solid rgba(var(--text-rgb),0.08);">
    <div style="flex:1;text-align:left;padding-left:60px;">{{BRAND_COPYRIGHT}}</div>
    <div style="flex:1;text-align:left;">{{BRAND_SIGNATURE}}</div>
    <div style="flex:1;text-align:left;">第 {{PAGE_NUM}} 页</div>
  </div>

</div>
```

## 禁止

- 修改页头/页尾的 height(45px)、font-size(10px)、flex 比例
- 页头页尾内容行混杂其他元素
- position:absolute 用于内容布局（仅SVG装饰圈可用）
- 合并单元格（colspan 仅限 `{{DESCRIPTION}}` 行和 `{{IMAGE_PLACEHOLDER}}` 行）
- `{{BRAND_COPYRIGHT}}` 和 `{{BRAND_SIGNATURE}}` 是系统占位符，**严禁替换为实际文字**
- **占位符名本身就是内容定义，严禁自行改编或合并维度**
