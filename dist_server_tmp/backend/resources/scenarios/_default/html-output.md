# HTML 输出格式指令

输出一个 HTML 代码块，用 ```html ... ``` 包裹。仅输出 HTML。

样式要求：
- 尺寸: width:{{canvas_w}}px; height:{{canvas_h}}px, position:relative, overflow:hidden
- 全部内联 inline style，禁止 class/id/<style>/@import/@font-face
- 全部 CSS 属性必须带单位（px）
- 禁止输出 <!DOCTYPE html>/<html>/<head>/<body>/<title>/<meta>/<link>
- 输出只包含一个 div 容器（width:{{canvas_w}}px;height:{{canvas_h}}px）及其子元素
