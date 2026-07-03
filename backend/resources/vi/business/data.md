# 数据页 — 数据可视化展示，支持图表和指标卡片，复用内容页框架叠加数据规则

## HTML 模板（必须照抄结构，只替换内容）

```html
<div style="width:1280px;height:720px;position:relative;overflow:hidden;background:var(--background);font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;">

  <!-- 第1层：背景层 -->
  <div style="position:absolute;inset:0;background:var(--background);"></div>

  <!-- 第2层：装饰层（半透明几何图形） -->
  <svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="data-grid" width="30" height="30" patternUnits="userSpaceOnUse">
        <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(var(--text-rgb),0.04)" stroke-width="0.5"/>
      </pattern>
      <radialGradient id="data-glow" cx="85%" cy="15%" r="35%">
        <stop offset="0%" stop-color="rgba(var(--primary-rgb),0.04)"/>
        <stop offset="100%" stop-color="rgba(var(--primary-rgb),0)"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#data-grid)"/>
    <circle cx="1100" cy="100" r="180" fill="url(#data-glow)"/>
    <!-- 装饰几何 -->
    <rect x="1150" y="580" width="60" height="60" rx="8" fill="none" stroke="rgba(var(--text-rgb),0.06)" stroke-width="1" transform="rotate(15 1180 610)"/>
  </svg>

  <!-- 第3层：顶部 accent 色条 -->
  <div style="position:absolute;top:0;left:0;width:100%;height:4px;background:var(--accent);z-index:5;"></div>

  <!-- 第3层：结构层 — 页面标题区 -->
  <div style="position:absolute;top:40px;left:80px;right:80px;z-index:2;">
    <h2 style="font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:34px;font-weight:700;letter-spacing:-0.5px;line-height:1.2;color:var(--primary);margin:0 0 10px 0;">{{HEADING}}</h2>
    <div style="width:40px;height:3px;background:var(--accent);border-radius:2px;"></div>
  </div>

  <!-- 第4层：内容层 — 指标卡片行 + 图表区 -->
  <div style="position:absolute;top:140px;left:60px;right:60px;bottom:60px;z-index:2;display:flex;flex-direction:column;gap:20px;">

    <!-- 指标卡片行（顶部 2-4 个 big number / progress bar） -->
    <div style="display:flex;gap:20px;">

      <!-- METRIC_BLOCK: 按指标数量复制此块，将 N 替换为索引 (0,1,2,3)，颜色用 var(--chart-N)，占位符用 {{METRIC_N_*}} -->

      <!-- 指标卡 1 (chart-0) — Big Number -->
      <div style="flex:1;background:var(--card-bg);border-radius:12px;padding:24px 20px;border-top:3px solid var(--chart-0);box-shadow:0 2px 8px rgba(0,0,0,0.06);text-align:center;display:flex;flex-direction:column;justify-content:center;">
        <div style="font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:48px;font-weight:700;color:var(--chart-0);line-height:1.1;margin-bottom:6px;">{{METRIC_1_VALUE}}</div>
        <div style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:14px;color:var(--text);opacity:0.55;margin-bottom:4px;">{{METRIC_1_LABEL}}</div>
        <!-- 可选 delta 指示 -->
        <div style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:13px;font-weight:600;color:var(--semantic-positive);">{{METRIC_1_DELTA}}</div>
      </div>

      <!-- 指标卡 2 (chart-1) — Progress Bar -->
      <div style="flex:1;background:var(--card-bg);border-radius:12px;padding:24px 20px;border-top:3px solid var(--chart-1);box-shadow:0 2px 8px rgba(0,0,0,0.06);display:flex;flex-direction:column;justify-content:center;">
        <div style="font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:36px;font-weight:700;color:var(--chart-1);line-height:1.1;margin-bottom:4px;">{{METRIC_2_VALUE}}</div>
        <div style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:14px;color:var(--text);opacity:0.55;margin-bottom:12px;">{{METRIC_2_LABEL}}</div>
        <!-- 进度条 -->
        <div style="width:100%;height:8px;background:rgba(var(--text-rgb),0.12);border-radius:4px;overflow:hidden;">
          <div style="width:{{METRIC_2_PCT}}%;height:100%;background:var(--chart-1);border-radius:4px;"></div>
        </div>
      </div>

      <!-- 指标卡 3 (chart-2) — Big Number -->
      <div style="flex:1;background:var(--card-bg);border-radius:12px;padding:24px 20px;border-top:3px solid var(--chart-2);box-shadow:0 2px 8px rgba(0,0,0,0.06);text-align:center;display:flex;flex-direction:column;justify-content:center;">
        <div style="font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:48px;font-weight:700;color:var(--chart-2);line-height:1.1;margin-bottom:6px;">{{METRIC_3_VALUE}}</div>
        <div style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:14px;color:var(--text);opacity:0.55;margin-bottom:4px;">{{METRIC_3_LABEL}}</div>
        <div style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:13px;font-weight:600;color:var(--semantic-negative);">{{METRIC_3_DELTA}}</div>
      </div>

      <!-- /METRIC_BLOCK -->

    </div>

    <!-- 图表/详情区（底部） -->
    <div style="flex:1;display:flex;gap:20px;">

      <!-- CHART_BLOCK: 图表区左 — Donut / Bar 容器 -->
      <div style="flex:1;background:var(--card-bg);border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.06);display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <div style="font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:18px;font-weight:600;color:var(--primary);margin-bottom:16px;">{{CHART_1_TITLE}}</div>
        <!-- 环形图 SVG（示例占位，替换为实际数据图表） -->
        <svg width="180" height="180" viewBox="0 0 180 180">
          <!-- 轨道 -->
          <circle cx="90" cy="90" r="72" fill="none" stroke="rgba(var(--text-rgb),0.12)" stroke-width="16"/>
          <!-- 数据弧 — 替换 stroke-dasharray/dashoffset 为实际占比 -->
          <circle cx="90" cy="90" r="72" fill="none" stroke="var(--chart-0)" stroke-width="16" stroke-dasharray="{{CHART_1_PCT}} 999" stroke-dashoffset="0" stroke-linecap="round" transform="rotate(-90 90 90)"/>
          <!-- 中心文字 -->
          <text x="90" y="86" text-anchor="middle" font-family="'DM Sans',Inter,sans-serif" font-size="28" font-weight="700" fill="var(--primary)">{{CHART_1_PCT}}%</text>
          <text x="90" y="106" text-anchor="middle" font-family="Inter,sans-serif" font-size="12" fill="var(--text)" opacity="0.5">{{CHART_1_UNIT}}</text>
        </svg>
        <div style="margin-top:12px;font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:14px;color:var(--text);opacity:0.55;">{{CHART_1_NOTE}}</div>
      </div>

      <!-- 图表区右 — 摘要卡 -->
      <div style="flex:1;background:var(--card-bg);border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.06);display:flex;flex-direction:column;justify-content:center;">
        <div style="font-family:'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:18px;font-weight:600;color:var(--primary);margin-bottom:16px;">{{CHART_2_TITLE}}</div>
        <!-- 水平条形图（示例，替换为实际数据） -->
        <div style="display:flex;flex-direction:column;gap:14px;">
          <!-- BAR_ITEM: 按数据项数量复制此块 -->
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:13px;color:var(--text);opacity:0.7;width:60px;text-align:right;flex-shrink:0;">{{BAR_1_LABEL}}</span>
            <div style="flex:1;height:8px;background:rgba(var(--text-rgb),0.1);border-radius:4px;overflow:hidden;">
              <div style="width:{{BAR_1_PCT}}%;height:100%;background:var(--chart-0);border-radius:4px;"></div>
            </div>
            <span style="font-family:'DM Sans',Inter,sans-serif;font-size:13px;font-weight:600;color:var(--chart-0);width:36px;flex-shrink:0;">{{BAR_1_PCT}}%</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:13px;color:var(--text);opacity:0.7;width:60px;text-align:right;flex-shrink:0;">{{BAR_2_LABEL}}</span>
            <div style="flex:1;height:8px;background:rgba(var(--text-rgb),0.1);border-radius:4px;overflow:hidden;">
              <div style="width:{{BAR_2_PCT}}%;height:100%;background:var(--chart-1);border-radius:4px;"></div>
            </div>
            <span style="font-family:'DM Sans',Inter,sans-serif;font-size:13px;font-weight:600;color:var(--chart-1);width:36px;flex-shrink:0;">{{BAR_2_PCT}}%</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;font-size:13px;color:var(--text);opacity:0.7;width:60px;text-align:right;flex-shrink:0;">{{BAR_3_LABEL}}</span>
            <div style="flex:1;height:8px;background:rgba(var(--text-rgb),0.1);border-radius:4px;overflow:hidden;">
              <div style="width:{{BAR_3_PCT}}%;height:100%;background:var(--chart-2);border-radius:4px;"></div>
            </div>
            <span style="font-family:'DM Sans',Inter,sans-serif;font-size:13px;font-weight:600;color:var(--chart-2);width:36px;flex-shrink:0;">{{BAR_3_PCT}}%</span>
          </div>
          <!-- /BAR_ITEM -->
        </div>
      </div>

    </div>

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
| `{{METRIC_N_VALUE}}` | 第 N 个指标数值（如 "85%" / "12,450"） | cards[N] 或 key_points[N] |
| `{{METRIC_N_LABEL}}` | 第 N 个指标标签（如 "完成率"） | cards[N] |
| `{{METRIC_N_DELTA}}` | 第 N 个指标变化量（如 "+12%" / "-5%"，可为空） | 数据推导 |
| `{{METRIC_N_PCT}}` | 第 N 个指标的百分比数值（纯数字，如 78） | 数据推导 |
| `{{CHART_1_TITLE}}` | 左图表区标题 | cards[N] |
| `{{CHART_1_PCT}}` | Donut 百分比（纯数字，如 65） | 数据推导 |
| `{{CHART_1_UNIT}}` | Donut 单位文字 | 数据推导 |
| `{{CHART_1_NOTE}}` | Donut 底部注释 | 数据推导 |
| `{{CHART_2_TITLE}}` | 右图表区标题 | cards[N] |
| `{{BAR_N_LABEL}}` | 条形图第 N 项标签 | 数据推导 |
| `{{BAR_N_PCT}}` | 条形图第 N 项百分比（纯数字，如 78） | 数据推导 |
| `{{PAGE_NUM}}` | 当前页码 | seq |
| `{{TOTAL_PAGES}}` | 总页数 | total |

## 图表选择规则

根据数据类型选择卡片形态：
- **单一百分比**（如 "完成率 85%"）→ Big Number 卡（`METRIC_N_VALUE` + `METRIC_N_DELTA`）
- **占比/进度**（如 "已完成 60%"）→ Progress Bar 卡（`METRIC_N_VALUE` + `METRIC_N_PCT`）
- **多项目对比**（A:80, B:65, C:45）→ 水平条形图（`BAR_N_*`）
- **占比关系**（如 "占比 35%"）→ 环形图 Donut（`CHART_N_PCT`）
- **时间序列** → 折线图或 Sparkline SVG

## 指标卡颜色规则

- N 个指标卡 → 使用 `var(--chart-0)` 到 `var(--chart-N-1)`，每卡不同色
- 正向 delta 用 `var(--semantic-positive)`（绿色）
- 负向 delta 用 `var(--semantic-negative)`（红色）
- delta 为空则删除整个 delta div

## 必须遵守

- **绝对禁止**修改任何 CSS 颜色值 — 所有 `var(--xxx)` 必须原样保留
- **绝对禁止**修改卡片结构和布局尺寸
- **绝对禁止**在指标卡 border-top 上使用 `var(--accent)` — 使用 `var(--chart-N)`
- 只能替换 `{{PLACEHOLDER}}` 占位符为实际数据
- 指标卡数量按实际数据增减（2-4 个），复制 `METRIC_BLOCK` 结构
- 图表区的 Donut/Bar 为示例形态，根据实际数据类型替换整个 SVG 或条形图结构
- 所有数字必须可视化 — 裸数字放在 `<p>` 里是不够的，必须用进度条/大数字/图表形态呈现
