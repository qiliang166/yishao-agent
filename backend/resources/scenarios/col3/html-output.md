# HTML 输出格式指令 — A4 文档

输出一个 HTML 代码块，用 ```html ... ``` 包裹。仅输出 HTML。

样式要求：
- 尺寸: width:794px; height:1123px, position:relative, overflow:hidden
- 全部内联 inline style，禁止 class/id/<style>/@import/@font-face
- 全部 CSS 属性必须带单位（px）
- 禁止输出 <!DOCTYPE html>/<html>/<head>/<body>/<title>/<meta>/<link>
- 输出只包含一个 div 容器（width:794px;height:1123px）及其子元素
- 排版方式：文档流（table/div block 自上而下排列），禁止 position:absolute（封面页除外）
- 必须使用 8 列 HTML table 网格（总宽 592px，居中），禁止 flex 卡片布局
