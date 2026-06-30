# 封面与档案信息 — A4 文档模块一

> **硬性规则：不含页头，不含页尾。** 封面使用全页 primary 纯色背景 + position:absolute 布局（文档唯一例外）。

## HTML 模板（必须照抄结构，替换内容）

```html
<div style="width:794px;height:1123px;position:relative;overflow:hidden;background:var(--primary);font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;">

  <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
    <circle cx="80" cy="850" r="180" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.3"/>
  </svg>

  <div style="position:absolute;top:0;left:0;width:100%;height:8px;background:var(--accent);"></div>

  <div style="position:absolute;top:335px;left:0;width:100%;text-align:center;">
    <div style="font-size:56px;font-weight:700;color:#ffffff;letter-spacing:3px;padding:0 60px;font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">{{TITLE}}</div>
    <div style="width:48px;height:4px;background:var(--accent);margin:20px auto 0 auto;"></div>
  </div>

  <div style="position:absolute;top:480px;left:0;width:100%;text-align:center;font-size:14px;color:rgba(255,255,255,0.65);">{{SUBTITLE}}</div>

  <div style="position:absolute;top:560px;left:0;width:100%;text-align:center;">
    <table style="margin:0 auto;border-collapse:collapse;">
      <tr>
        <td style="font-size:12px;color:rgba(255,255,255,0.35);padding:0 12px 12px 0;text-align:right;white-space:nowrap;">编写日期</td>
        <td style="font-size:14px;color:rgba(255,255,255,0.6);padding:0 0 12px 12px;text-align:left;">{{DATE}}</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:rgba(255,255,255,0.35);padding:12px 12px 12px 0;text-align:right;white-space:nowrap;">内容分类</td>
        <td style="font-size:14px;color:rgba(255,255,255,0.6);padding:12px 0 12px 12px;text-align:left;">{{DISH_TYPE}}</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:rgba(255,255,255,0.35);padding:12px 12px 12px 0;text-align:right;white-space:nowrap;">核心食材</td>
        <td style="font-size:14px;color:rgba(255,255,255,0.6);padding:12px 0 12px 12px;text-align:left;">{{CORE_INGREDIENTS}}</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:rgba(255,255,255,0.35);padding:12px 12px 12px 0;text-align:right;white-space:nowrap;">工艺特征</td>
        <td style="font-size:14px;color:rgba(255,255,255,0.6);padding:12px 0 12px 12px;text-align:left;">{{PROCESS_FEATURES}}</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:rgba(255,255,255,0.35);padding:12px 12px 0 0;text-align:right;white-space:nowrap;">版本说明</td>
        <td style="font-size:14px;color:rgba(255,255,255,0.6);padding:12px 0 0 12px;text-align:left;">{{VERSION_NOTE}}</td>
      </tr>
    </table>
  </div>

  <div style="position:absolute;bottom:50px;left:0;width:100%;text-align:center;font-size:12px;color:rgba(255,255,255,0.35);">
    <div style="margin-bottom:6px;">{{BRAND_SIGNATURE}}</div>
    <div>{{BRAND_COPYRIGHT}}</div>
  </div>

</div>
```

## 内容变量

| 变量 | 说明 | 来源 |
|------|------|------|
| `{{TITLE}}` | 菜品名称 | heading |
| `{{SUBTITLE}}` | 副标题（核心食材口感描述） | body 首句提炼 |
| `{{DATE}}` | 编写日期 | key_points[0] |
| `{{DISH_TYPE}}` | 内容分类（热菜砂锅煲 / 粤式 等） | key_points[1] |
| `{{CORE_INGREDIENTS}}` | 核心食材（· 分隔） | key_points[2] |
| `{{PROCESS_FEATURES}}` | 工艺特征 | key_points[3] |
| `{{VERSION_NOTE}}` | 版本说明 | key_points[4] |
| `{{BRAND_SIGNATURE}}` | 品牌签名 | 来自系统通用设置，严禁替换为实际文字 |
| `{{BRAND_COPYRIGHT}}` | 版权信息 | 来自系统通用设置，严禁替换为实际文字 |

## 硬性规则

- **{{BRAND_SIGNATURE}} 和 {{BRAND_COPYRIGHT}} 是系统占位符，严禁替换为实际文字。必须原样保留。**
- 渐变背景（使用纯色 `var(--primary)`）
- 卡片容器（card_bg + border-radius + shadow）
- 页头/页尾 div
- 多个 SVG 圆圈（仅保留模板中的单个 circle）
- 为表格添加边框（无边框表格）
