# 封面与档案信息 — A4 文档模块一（col3 专属）

> **结构铁律：金色装饰线(10px) + 标题区(480px) + 信息表区 + 简述区(flex:1)，不含页头页尾。封面使用全页 primary 纯色背景。**

## HTML 模板（必须照抄结构，替换内容）

```html
<div style="width:794px;height:1123px;display:flex;flex-direction:column;background:var(--primary);font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;position:relative;overflow:hidden;">

  <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
    <circle cx="80" cy="850" r="180" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.3"/>
  </svg>

  <!-- ═══ 顶端金色装饰线 10px ═══ -->
  <div style="flex-shrink:0;height:10px;background:var(--accent);"></div>

  <!-- ═══ 标题区 480px ═══ -->
  <div style="flex-shrink:0;height:480px;display:flex;flex-direction:column;justify-content:flex-end;text-align:center;">
    <div style="font-size:56px;font-weight:700;color:#ffffff;letter-spacing:3px;padding:0 60px;font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;">{{TITLE}}</div>
    <div style="width:48px;height:4px;background:var(--accent);margin:20px auto 0 auto;"></div>
    <div style="margin-top:16px;font-size:18px;font-weight:700;color:rgba(255,255,255,0.65);padding-bottom:8px;">{{SUBTITLE}}</div>
  </div>

  <!-- ═══ 信息表区 ═══ -->
  <div style="flex-shrink:0;padding:48px 0 0 0;text-align:center;">
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

  <!-- ═══ 简述区 flex:1 ═══ -->
  <div style="flex:1;display:flex;align-items:flex-end;padding:0 100px 48px 100px;">
    <div style="max-width:594px;margin:0 auto;font-size:13px;color:rgba(255,255,255,0.5);line-height:1.8;text-align:center;">{{DESCRIPTION}}</div>
  </div>

</div>
```

## 内容变量

| 变量 | 说明 | 来源 |
|------|------|------|
| `{{TITLE}}` | 菜品名称 | heading |
| `{{SUBTITLE}}` | 副标题（核心食材口感描述）。**字数限定：10-12 字符（含标点）。** | body 首句提炼 |
| `{{DESCRIPTION}}` | 文档简述。**字数限定：60-70 字符（含标点），居中展示，说明文档性质与用途。** | lead 字段或 body 前段 |
| `{{DATE}}` | 编写日期。**格式：YYYY年M月D日。**（如"2025年4月8日"） | key_points[0] |
| `{{DISH_TYPE}}` | 内容分类。**2-3 个分类。**（如"粤式热菜，砂锅煲类"） | key_points[1] |
| `{{CORE_INGREDIENTS}}` | 核心食材。**2-4 个。**（如"鲍鱼、花胶、凤爪，大地鱼粉等提鲜增香"） | key_points[2] |
| `{{PROCESS_FEATURES}}` | 工艺特征。**最多 2-3 个核心词。**（如"干货蒸发、高温炸制、砂锅炖煮"） | key_points[3] |
| `{{VERSION_NOTE}}` | 版本说明。**最多 2-4 个词语。**（如"优化版，内部培训"） | key_points[4] |
| `{{BRAND_SIGNATURE}}` | 品牌签名 | 来自系统通用设置，严禁替换为实际文字 |
| `{{BRAND_COPYRIGHT}}` | 版权信息 | 来自系统通用设置，严禁替换为实际文字 |

## 硬性规则

- **三段 flex 列布局，不含页头页尾。禁止 position:absolute 用于内容定位（仅 SVG 装饰圈可用）。**
- **标题区固定 480px，内容底部对齐（flex-direction:column + justify-content:flex-end）。**
- **简述区设置 flex:1 自动占据剩余空间，底部对齐。**
- **`{{SUBTITLE}}` 字数限定 10-12 字符（含标点），超出或不足均为不合格输出。**
- **`{{DESCRIPTION}}` 字数限定 60-70 字符（含标点），超出或不足均为不合格输出。**
- **`{{DATE}}` 格式必须为 YYYY年M月D日。**
- **`{{DISH_TYPE}}` 限定 2-3 个分类，逗号分隔。**
- **`{{CORE_INGREDIENTS}}` 限定 2-4 个核心食材，逗号分隔。**
- **`{{PROCESS_FEATURES}}` 最多 2-3 个核心工艺词，顿号分隔。**
- **`{{VERSION_NOTE}}` 最多 2-4 个词语，逗号分隔。**
- 禁止渐变背景（使用纯色 `var(--primary)`）
- 禁止卡片容器（card_bg + border-radius + shadow）
- 禁止多个 SVG 圆圈（仅保留模板中的单个 circle）
- 禁止为表格添加边框（无边框表格）
- 禁止页头页尾
