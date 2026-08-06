# 页脚 — A4 文档标准三列页脚

> 每页必需。统一三列 flex 布局，承载版权声明、监制部门与页码。

---

## 标准格式（强制）

```
© 2024 {公司名} · 保密文档      商务部监制      第 X 页
```

```html
<div style="margin-top:auto;padding-top:14px;border-top:1px solid rgba(var(--text-rgb),0.06);display:flex;justify-content:space-between;font-size:13px;color:rgba(var(--text-rgb),0.4);">
  <span>© 2024 {公司名} · 保密文档</span>
  <span>{部门}监制</span>
  <span>第 {页码} 页</span>
</div>
```

## 结构规则

| 属性 | 值 |
|------|-----|
| 列数 | 3（左：版权 / 中：监制部门 / 右：中文页码） |
| 布局 | `display:flex; justify-content:space-between` |
| 字号 | 13px |
| 字体 | Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif |
| 颜色 | `rgba(var(--text-rgb),0.4)` |
| 顶部线 | `1px solid rgba(var(--text-rgb),0.06)` |
| 上内边距 | 14px |
| 上外边距 | `margin-top:auto`（排至页面底部） |

## 三列语义

| 列 | 对齐 | 内容 | 示例 |
|----|------|------|------|
| 左 | flex-start | © 年份 公司名 · 保密文档 | `© 2024 美食研究所 · 保密文档` |
| 中 | center | {部门}监制 | `商务部监制` |
| 右 | flex-end | 第 X 页 | `第 5 页` |

## 使用场景

- 所有 A4 文档页必需（封面除外）
- 封面使用全屏 hero 布局，无页脚
