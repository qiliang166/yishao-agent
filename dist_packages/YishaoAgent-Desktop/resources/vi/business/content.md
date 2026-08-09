# 内容页 — 通用内容展示，支持多卡片布局和图文混排，信息密度与视觉呼吸感平衡

## HTML 模板（必须照抄结构，只替换内容）

```html
<div style="width:1280px;height:720px;position:relative;overflow:hidden;background:var(--background);font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;">

  <!-- 第1层：背景层 -->
  <div style="position:absolute;inset:0;background:var(--background);"></div>

  <!-- 第2层：装饰层（半透明几何图形） -->
  <svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="deco-glow" cx="90%" cy="10%" r="40%">
        <stop offset="0%" stop-color="rgba(var(--primary-rgb),0.04)"/>
        <stop offset="100%" stop-color="rgba(var(--primary-rgb),0)"/>
      </radialGradient>
    </defs>
    <circle cx="1150" cy="80" r="200" fill="url(#deco-glow)"/>
    <!-- 右下角装饰圆 -->
    <circle cx="1200" cy="650" r="120" fill="none" stroke="rgba(var(--text-rgb),0.06)" stroke-width="1"/>
  </svg>

  <!-- 第3层：顶部 accent 色条 -->
  <div style="position:absolute;top:0;left:0;width:100%;height:4px;background:var(--accent);z-index:5;"></div>

  <!-- 第4层：结构层 — 页面标题区 -->
  <div style="position:absolute;top:50px;left:80px;right:80px;z-index:2;">
    <!-- 页面标题 -->
    <h2 style="font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:38px;font-weight:700;letter-spacing:-0.5px;line-height:1.2;color:var(--primary);margin:0 0 12px 0;">{{HEADING}}</h2>
    <!-- 标题下方 accent 短线 -->
    <div style="width:40px;height:3px;background:var(--accent);border-radius:2px;"></div>
  </div>

  <!-- 第4层：内容层 — 卡片区 -->
  <div style="position:absolute;top:160px;left:60px;right:60px;bottom:60px;z-index:2;display:flex;gap:24px;">

    <!-- CARD_BLOCK: 按卡片数量复制整个卡片 div，将 N 替换为卡片索引 (0,1,2,3,4)，对应 var(--chart-0) ~ var(--chart-4) -->
    <!-- 3 列等宽布局，如卡片数为 2 则只用前 2 个，卡片数为 4 则复制 1 个 -->

    <!-- 卡片 1 (chart-0) -->
    <div style="flex:1;background:var(--card-bg);border-radius:12px;padding:28px 24px;border-left:4px solid var(--chart-0);box-shadow:0 2px 8px rgba(0,0,0,0.06);display:flex;flex-direction:column;">
      <!-- 卡片图标（可选，24px outline SVG） -->
      <div style="margin-bottom:16px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--chart-0)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7">
          {{CARD_1_ICON}}
        </svg>
      </div>
      <!-- 卡片标题 -->
      <h3 style="font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:22px;font-weight:600;color:var(--primary);margin:0 0 12px 0;line-height:1.3;">{{CARD_1_TITLE}}</h3>
      <!-- 卡片正文 -->
      <p style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:16px;font-weight:400;color:var(--text);line-height:1.7;margin:0;opacity:0.85;">{{CARD_1_BODY}}</p>
    </div>

    <!-- 卡片 2 (chart-1) -->
    <div style="flex:1;background:var(--card-bg);border-radius:12px;padding:28px 24px;border-left:4px solid var(--chart-1);box-shadow:0 2px 8px rgba(0,0,0,0.06);display:flex;flex-direction:column;">
      <div style="margin-bottom:16px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--chart-1)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7">
          {{CARD_2_ICON}}
        </svg>
      </div>
      <h3 style="font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:22px;font-weight:600;color:var(--primary);margin:0 0 12px 0;line-height:1.3;">{{CARD_2_TITLE}}</h3>
      <p style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:16px;font-weight:400;color:var(--text);line-height:1.7;margin:0;opacity:0.85;">{{CARD_2_BODY}}</p>
    </div>

    <!-- 卡片 3 (chart-2) -->
    <div style="flex:1;background:var(--card-bg);border-radius:12px;padding:28px 24px;border-left:4px solid var(--chart-2);box-shadow:0 2px 8px rgba(0,0,0,0.06);display:flex;flex-direction:column;">
      <div style="margin-bottom:16px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--chart-2)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7">
          {{CARD_3_ICON}}
        </svg>
      </div>
      <h3 style="font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:22px;font-weight:600;color:var(--primary);margin:0 0 12px 0;line-height:1.3;">{{CARD_3_TITLE}}</h3>
      <p style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:16px;font-weight:400;color:var(--text);line-height:1.7;margin:0;opacity:0.85;">{{CARD_3_BODY}}</p>
    </div>

    <!-- /CARD_BLOCK -->

  </div>

  <!-- 第5层：标识层 — 页码（右下角） -->
  <div style="position:absolute;bottom:28px;right:60px;z-index:5;display:flex;align-items:center;gap:8px;">
    <div style="width:6px;height:6px;border-radius:50%;background:var(--accent);"></div>
    <span style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:14px;color:var(--text);opacity:0.35;">{{PAGE_NUM}} / {{TOTAL_PAGES}}</span>
  </div>

</div>
```

## 内容占位符

| 占位符 | 说明 | 来源 |
|--------|------|------|
| `{{HEADING}}` | 页面标题 | heading |
| `{{CARD_N_TITLE}}` | 第 N 张卡片标题（N=1,2,3...） | cards[N].content_hint 或 cards[N].title |
| `{{CARD_N_BODY}}` | 第 N 张卡片正文 | cards[N].content_hint 或 cards[N].body |
| `{{CARD_N_ICON}}` | 第 N 张卡片 SVG 图标路径（outline 风格 24×24） | 根据卡片内容语义选择 |
| `{{PAGE_NUM}}` | 当前页码 | seq |
| `{{TOTAL_PAGES}}` | 总页数 | total |

## 卡片数量适配规则

- **2 张卡片**: 删除第 3 张卡片 div，保留前 2 张
- **3 张卡片**: 模板默认，无需增减
- **4 张卡片**: 复制任意一张卡片 div，替换索引为 3，颜色用 `var(--chart-3)`，占位符用 `{{CARD_4_*}}`
- **5 张卡片**: 同法复制，索引 4，颜色用 `var(--chart-4)`

## SVG 图标选择规则

`{{CARD_N_ICON}}` 替换为 SVG 路径数据（`<path d="..."/>` 或 `<circle>`/`<rect>`/`<line>` 等），outline 风格，24×24 viewBox。根据卡片语义选择对应图标：
- 数据/指标 → 条形图/趋势线路径
- 策略/方案 → 灯泡/靶心/齿轮路径
- 流程/步骤 → 箭头/列表/层级路径
- 优势/亮点 → 星形/奖杯/盾牌路径
- 技术/工具 → 芯片/代码/云端路径

## 必须遵守

- **绝对禁止**修改任何 CSS 颜色值 — 所有 `var(--xxx)` 必须原样保留
- **绝对禁止**修改卡片结构（border-left 色条、圆角、padding、阴影）
- **绝对禁止**修改页面标题位置（top:50px, left:80px）
- **绝对禁止**修改卡片容器 flex gap（24px）和圆角（12px）
- **绝对禁止**在卡片 border-left 上使用 `var(--accent)` — accent 是页面级装饰色
- 只能替换 `{{PLACEHOLDER}}` 占位符为实际内容
- 每张卡片必须有不同的 `var(--chart-N)` 色条颜色（N 按卡片索引递增）
- 卡片标题 22px DM Sans，正文 16px Inter — 不得修改字号
- 如某卡片无图标，可删除该 `<div style="margin-bottom:16px;">` 及其内 SVG
