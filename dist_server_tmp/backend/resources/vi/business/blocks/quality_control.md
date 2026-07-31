# 出品标准与关键控制点 — A4 文档模块五

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

    <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="950" r="140" fill="none" stroke="var(--primary)" stroke-width="1.2" opacity="0.12"/>
    </svg>

    <div style="width:100%;height:4px;background:var(--accent);"></div>

    <div style="width:674px;margin:16px auto 0 auto;border:1px solid rgba(var(--text-rgb),0.2);">
    <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;">
      <colgroup>
        <col style="width:120px">
        <col style="width:554px">
      </colgroup>
      <tbody>
        <tr style="background:var(--chart-1);color:#ffffff;">
          <th style="padding:9px 8px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">维度</th>
          <th style="padding:9px 8px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">关键技术</th>
        </tr>
        <tr>
          <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.2);">色泽</td>
          <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.2);">{{TECH_COLOR}}</td>
        </tr>
        <tr style="background:rgba(var(--text-rgb),0.02);">
          <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.2);">香气</td>
          <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.2);">{{TECH_AROMA}}</td>
        </tr>
        <tr>
          <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.2);">口感</td>
          <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.2);">{{TECH_TEXTURE_MOUTH}}</td>
        </tr>
        <tr style="background:rgba(var(--text-rgb),0.02);">
          <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.2);">质地</td>
          <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.2);">{{TECH_TEXTURE_BODY}}</td>
        </tr>
        <tr>
          <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.2);">口味</td>
          <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.2);">{{TECH_TASTE}}</td>
        </tr>
        <tr style="background:rgba(var(--text-rgb),0.02);">
          <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.2);">温度</td>
          <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.2);">{{TECH_TEMP}}</td>
        </tr>
        <tr>
          <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.2);">形态</td>
          <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.2);">{{TECH_SHAPE}}</td>
        </tr>
        <tr style="background:var(--chart-0);color:#ffffff;">
          <th style="padding:9px 8px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">维度</th>
          <th style="padding:9px 8px;border:1px solid rgba(var(--text-rgb),0.2);font-weight:600;">危害控制</th>
        </tr>
        <tr>
          <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.2);">色泽</td>
          <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.2);">{{HAZ_COLOR}}</td>
        </tr>
        <tr style="background:rgba(var(--text-rgb),0.02);">
          <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.2);">香气</td>
          <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.2);">{{HAZ_AROMA}}</td>
        </tr>
        <tr>
          <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.2);">口感</td>
          <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.2);">{{HAZ_TEXTURE_MOUTH}}</td>
        </tr>
        <tr style="background:rgba(var(--text-rgb),0.02);">
          <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.2);">质地</td>
          <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.2);">{{HAZ_TEXTURE_BODY}}</td>
        </tr>
        <tr>
          <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.2);">口味</td>
          <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.2);">{{HAZ_TASTE}}</td>
        </tr>
        <tr style="background:rgba(var(--text-rgb),0.02);">
          <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.2);">温度</td>
          <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.2);">{{HAZ_TEMP}}</td>
        </tr>
        <tr>
          <td style="background:var(--card_bg);color:var(--primary);font-weight:600;text-align:center;padding:8px 8px;border:1px solid rgba(var(--text-rgb),0.2);">形态</td>
          <td style="color:var(--text);padding:8px 14px;border:1px solid rgba(var(--text-rgb),0.2);">{{HAZ_SHAPE}}</td>
        </tr>
      </tbody>
    </table>
    </div>

    <!-- 版权声明文本块 -->
    <div style="width:674px;margin:0 auto;text-align:center;font-size:11px;color:rgba(var(--text-rgb),0.35);padding:16px 0;">
      本文件为内部培训参考资料，未经授权不得外传。所有工艺流程均基于产品研发部实际验证数据编制，如有疑问请联系技术组确认。
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

## 出品标准维度（7项，不可省略、不可合并）

| 维度 | 评估要点 |
|------|----------|
| 色泽 | 颜色/光泽/状态 |
| 香气 | 主香调/辅香调 |
| 口感 | 入口初感/咀嚼中段 |
| 质地 | 软硬脆糯弹层次 |
| 口味 | 咸甜酸鲜平衡 |
| 温度 | 理想出品温度 |
| 形态 | 汤汁浓稠度/食材造型 |

## 内容变量

| 变量组 | 变量 | 说明 |
|--------|------|------|
| 页信息 | `{{TITLE}}` | 菜品名称 |
| 页信息 | `{{DATE}}` | 编写日期 |
| 页信息 | `{{PAGE_NUM}}` | 当前页码 |
| 页信息 | `{{TOTAL_PAGES}}` | 总页数 |
| 品牌 | `{{BRAND_COPYRIGHT}}` | 版权信息占位符，代码替换，严禁写死 |
| 品牌 | `{{BRAND_SIGNATURE}}` | 品牌签名占位符，代码替换，严禁写死 |
| 关键技术 | `{{TECH_COLOR}}` ~ `{{TECH_SHAPE}}` | 7维度关键技法标准，从 body 提取 |
| 危害控制 | `{{HAZ_COLOR}}` ~ `{{HAZ_SHAPE}}` | 7维度失控后果，从 notes 提取 |

## 禁止

- 修改页头/页尾的 height(45px)、font-size(10px)、flex 比例
- 两个独立表格（必须是同一个 `<table>` 内的两个 `<tbody>` 区段）
- 合并维度（口感/质地、温度/形态必须各自独立一行，共7行不可少）
- `{{BRAND_COPYRIGHT}}` 和 `{{BRAND_SIGNATURE}}` 是系统占位符，**严禁替换为实际文字**
