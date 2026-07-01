# 页头 — A4 文档标准三列页头

> 每页必需。统一三列 flex 布局，承载文档元数据与页码。

---

## 标准格式（强制）

```
出品标准文档 · {菜品名}      版本 X.X / YYYY-MM-DD      X / Y
```

```html
<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;border-bottom:1px solid rgba(var(--text-rgb),0.06);font-size:13px;color:rgba(var(--text-rgb),0.45);">
  <span>出品标准文档 · {菜品名}</span>
  <span>版本 {版本号} / {日期}</span>
  <span>{页码} / {总页数}</span>
</div>
```

## 结构规则

| 属性 | 值 |
|------|-----|
| 列数 | 3（左：文档标题 / 中：版本日期 / 右：页码） |
| 布局 | `display:flex; justify-content:space-between` |
| 字号 | 13px |
| 字体 | 'Playfair Display', Georgia, 'Times New Roman', 'Noto Serif SC', 'STSong', serif |
| 颜色 | `rgba(var(--text-rgb),0.45)` |
| 底部线 | `1px solid rgba(var(--text-rgb),0.06)` |
| 下内边距 | 8px |

## 三列语义

| 列 | 对齐 | 内容 | 示例 |
|----|------|------|------|
| 左 | flex-start | 文档类型 · 菜品名 | `出品标准文档 · 鲍鱼一品煲` |
| 中 | center | 版本 版本号 / 日期 | `版本 2.0 / 2024-10-15` |
| 右 | flex-end | 页码 / 总页数（无前导零） | `5 / 6` |

## 页码格式

- 页头页码：`X / Y`（无前导零，如 `5 / 6`）
- 页尾页码：`第 X 页`（中文格式）
- X 为当前页码，Y 为总页数

## 使用场景

- 所有 A4 文档页必需（封面除外）
- 封面使用全屏 hero 布局，无页头
