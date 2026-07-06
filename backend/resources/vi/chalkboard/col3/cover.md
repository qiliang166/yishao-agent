# 封面与档案信息 — A4 文档模块一（col3 专属）

> **结构铁律：金色装饰线(10px) + 标题区(480px) + 信息表区 + 简述区(flex:1)，不含页头页尾。封面使用全页 primary 纯色背景。**

## HTML 模板（必须照抄结构，替换内容）

```html
<div style="width:794px;height:1123px;display:flex;flex-direction:column;background:var(--primary);font-family:Patrick Hand, 'Comic Sans MS', 'PingFang SC', 'Microsoft YaHei', cursive;position:relative;overflow:hidden;">

  <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
    <circle cx="80" cy="850" r="180" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.3"/>
  </svg>

  <!-- ═══ 顶端金色装饰线 10px ═══ -->
  <div style="flex-shrink:0;height:10px;background:var(--accent);"></div>

  <!-- ═══ 标题区 480px ═══ -->
  <div style="flex-shrink:0;height:480px;display:flex;flex-direction:column;justify-content:flex-end;text-align:center;">
    <div style="font-size:56px;font-weight:700;color:#ffffff;letter-spacing:3px;padding:0 60px;font-family:'DM Sans',Patrick Hand, 'Comic Sans MS', 'PingFang SC', 'Microsoft YaHei', cursive;">{{TITLE}}</div>
    <div style="width:48px;height:4px;background:var(--accent);margin:20px auto 0 auto;"></div>
    <div style="margin-top:16px;font-size:18px;font-weight:700;color:rgba(255,255,255,0.65);padding-bottom:8px;">{{SUBTITLE}}</div>
  </div>

  <!-- ═══ 信息表区 ═══ -->
  <div style="flex-shrink:0;padding:48px 0 0 0;text-align:center;">
    <table style="margin:0 auto;border-collapse:collapse;">
{{INFO_TABLE}}
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
| `{{TITLE}}` | 项目/文档标题 | heading |
| `{{SUBTITLE}}` | 副标题。**字数限定：10-12 字符（含标点）。** | body 首句提炼 |
| `{{DESCRIPTION}}` | 文档简述。**字数限定：60-70 字符（含标点），居中展示。** | lead 字段或 body 前段 |
| `{{KP_0}}`, `{{KP_1}}`, ... | 信息表各字段的值（标签名由编辑器定义，动态生成） | key_points 数组，按序填入 |
| `{{BRAND_SIGNATURE}}` | 品牌签名 | 来自系统通用设置，严禁替换为实际文字 |
| `{{BRAND_COPYRIGHT}}` | 版权信息 | 来自系统通用设置，严禁替换为实际文字 |

## 硬性规则

- **三段 flex 列布局，不含页头页尾。禁止 position:absolute 用于内容定位（仅 SVG 装饰圈可用）。**
- **标题区固定 480px，内容底部对齐（flex-direction:column + justify-content:flex-end）。**
- **简述区设置 flex:1 自动占据剩余空间，底部对齐。**
- **`{{SUBTITLE}}` 字数限定 10-12 字符（含标点），超出或不足均为不合格输出。**
- **`{{DESCRIPTION}}` 字数限定 60-70 字符（含标点），超出或不足均为不合格输出。**
- **信息表标签和行数由编辑器 key_points 定义，不可自行增删改。**
- **`{{KP_N}}` 按顺序填入 key_points 对应的值，不可跳过或重排。**
- 禁止渐变背景（使用纯色 `var(--primary)`）
- 禁止卡片容器（card_bg + border-radius + shadow）
- 禁止多个 SVG 圆圈（仅保留模板中的单个 circle）
- 禁止为表格添加边框（无边框表格）
- 禁止页头页尾