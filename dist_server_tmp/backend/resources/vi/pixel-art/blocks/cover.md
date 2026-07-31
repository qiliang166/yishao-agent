# 封面与档案信息 — A4 文档模块一

> **硬性规则：不含页头，不含页尾。** 封面使用全页 primary 纯色背景 + position:absolute 布局（文档唯一例外）。

## HTML 模板（必须照抄结构，替换内容）

```html
<div style="width:794px;height:1123px;position:relative;overflow:hidden;background:var(--primary);font-family:VT323, 'Press Start 2P', 'PingFang SC', 'Microsoft YaHei', monospace;">

  <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
    <circle cx="80" cy="850" r="180" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.3"/>
  </svg>

  <div style="position:absolute;top:0;left:0;width:100%;height:8px;background:var(--accent);"></div>

  <div style="position:absolute;top:335px;left:0;width:100%;text-align:center;">
    <div style="font-size:56px;font-weight:700;color:#ffffff;letter-spacing:3px;padding:0 60px;font-family:'DM Sans',VT323, 'Press Start 2P', 'PingFang SC', 'Microsoft YaHei', monospace;">{{TITLE}}</div>
    <div style="width:48px;height:4px;background:var(--accent);margin:20px auto 0 auto;"></div>
  </div>

  <div style="position:absolute;top:480px;left:0;width:100%;text-align:center;font-size:14px;color:rgba(255,255,255,0.65);">{{SUBTITLE}}</div>

  <div style="position:absolute;top:560px;left:0;width:100%;text-align:center;">
    <table style="margin:0 auto;border-collapse:collapse;">
{{INFO_TABLE}}
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