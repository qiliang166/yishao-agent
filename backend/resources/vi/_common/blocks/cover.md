# cover — 封面页（A4 通用）

> **结构铁律：全页 var(--primary) 纯色背景，绝对定位布局。封面是唯一豁免三段 flex 布局的页面类型，不含页头页尾。**

## HTML 模板（必须照抄结构，替换内容）

```html
<div style="width:794px;height:1123px;position:relative;overflow:hidden;background:var(--primary);font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">

  <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
    <circle cx="80" cy="850" r="180" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.3"/>
  </svg>

  <!-- 顶部 accent 色条 8px -->
  <div style="position:absolute;top:0;left:0;width:100%;height:8px;background:var(--accent);"></div>

  <!-- 标题区 -->
  <div style="position:absolute;top:280px;left:0;width:100%;text-align:center;">
    <div style="font-size:52px;font-weight:700;color:#ffffff;letter-spacing:3px;padding:0 80px;line-height:1.2;">{{TITLE}}</div>
    <div style="width:48px;height:4px;background:var(--accent);margin:24px auto 0 auto;"></div>
    <div style="margin-top:16px;font-size:15px;color:rgba(255,255,255,0.6);padding:0 100px;">{{SUBTITLE}}</div>
  </div>

  <!-- 元数据信息表 -->
  <div style="position:absolute;top:560px;left:0;width:100%;text-align:center;">
    <table style="margin:0 auto;border-collapse:collapse;">
{{INFO_TABLE}}
        </table>
  </div>

  <!-- 底部品牌信息 -->
  <div style="position:absolute;bottom:50px;left:0;width:100%;text-align:center;font-size:12px;color:rgba(255,255,255,0.35);">
    <div style="margin-bottom:6px;">{{BRAND_SIGNATURE}}</div>
    <div>{{BRAND_COPYRIGHT}}</div>
  </div>

</div>
```

## 内容变量

| 变量 | 说明 | 来源 |
|------|------|------|
| `{{TITLE}}` | 项目/文档标题 | heading |
| `{{SUBTITLE}}` | 副标题。**字数限定：10-12 字符（含标点）。** | body 首句提炼 |
| `{{KP_0}}`, `{{KP_1}}`, ... | 信息表各字段的值（标签名由编辑器 key_points 定义，动态生成） | key_points 数组，按序填入 |
| `{{BRAND_SIGNATURE}}` | 品牌签名 | 来自系统通用设置，严禁替换为实际文字 |
| `{{BRAND_COPYRIGHT}}` | 版权信息 | 来自系统通用设置，严禁替换为实际文字 |

## 硬性规则

- **信息表标签和行数由编辑器 key_points 定义，不可自行增删改。**
- **`{{KP_N}}` 按顺序填入 key_points 对应的值，不可跳过或重排。**
- **`{{SUBTITLE}}` 字数限定 10-12 字符（含标点），超出或不足均为不合格输出。**
- **{{BRAND_SIGNATURE}} 和 {{BRAND_COPYRIGHT}} 是系统占位符，严禁替换为实际文字。必须原样保留。**
- 禁止渐变背景（使用纯色 `var(--primary)`）
- 禁止卡片容器（card_bg + border-radius + shadow）
- 禁止页头/页尾 div
- 禁止多个 SVG 圆圈（仅保留模板中的单个 circle）
- 禁止为表格添加边框（无边框表格）