# 2026-07-19 课件"编辑文字"防复制误伤修复

## 用户报障

线上（120.25.251.172）项目工作区 → 课件输出 → HTML编辑 → 单击"编辑文字"后无法编辑：
- 光标只能落在第一行，单击正文任意文字光标不落点
- "字根本打不进去"、无法选择要编辑的文字
- 关键线索：**"之前是可以使用文字编辑的，但是现在不能用了"**（回归缺陷）
- 本地旧课件可编辑，线上新课件（豉汁蒸凤爪_col4）不可编辑

## 根因（systematic-debugging 四阶段，playwright 实证）

**7/16 积分系统防复制提交 4b3ba8ca** 起，生成的课件产物（ppt_service.py col4/col5、html_designer.py col3）自带防复制套件：

1. CSS `/* anti-copy */ * { -webkit-user-select: none; user-select: none; }`
   → contenteditable 下不可选中内容单击时，Chromium 把光标退到文档起点 = **"光标只能在第一行"**
2. document 冒泡段监听 `selectstart/copy/contextmenu/dragstart` 一律 `preventDefault()`
   → 即便 CSS 被覆盖，selectstart 被拦也照样无法落光标（**单独构成完整拦截**）

时间线完全吻合：7/16 前生成的课件（用户本地测试用）可编辑；7/16 后生成的（线上新产物）全部不可编辑。防复制是防会员抄内容的**有意设计，必须保留**；缺陷在于编辑模式（作者授权场景）未中和它。

### 证据链（未上服务器，全程本地实证）

1. "编辑文字"是纯浏览器端功能（iframe + contenteditable），服务器只在保存时参与 → 问题只在课件 HTML + 前端 JS
2. 线上产物经公开路径 `/api/exports/豉汁蒸凤爪_col4/index.html` 原样下载，镜像至本地 `_repro_col4fz_prod`
3. git 历史定位分界提交：`git log -S "anti-copy"` → 4b3ba8ca (2026-07-16)
4. playwright（backend venv）无头 Chromium 复现：同一份线上 HTML + 与 SlideEditModal 同款 contenteditable 逻辑 → 精确复现"光标退第一行、打不进字"
5. 第一次假设（仅覆盖 CSS）验证**失败**——光标仍不落点 → 回到 Phase 1 发现 JS 拦截层 → 组合修复后同一测试全绿

## 修复设计

新建公共工具 `frontend/src/utils/editableDoc.ts`，编辑期中和防复制、退出时恢复：

- **applyEditableDoc(doc)**：
  - `body[contenteditable=true]` + `cursor:text`
  - 注入 `<style id="__ys_editfix">* { user-select: text !important }</style>`（!important 压过产物的非 important 规则）
  - **捕获段**对 4 类事件挂 `e.stopImmediatePropagation()`（事件到不了冒泡段 → 不被 preventDefault → 选中/落光标默认行为发生）；handler 存 `WeakMap<Document, fn>` 供成对移除
- **clearEditableDoc(doc)**：剥离 contenteditable/cursor/注入样式/事件拦停，**序列化保存前必调**——防止编辑态污染保存的 HTML，且退出后防复制行为完整恢复

### 改动文件

| 文件 | 改动 |
|---|---|
| frontend/src/utils/editableDoc.ts（新建） | 如上 |
| frontend/src/components/SlideEditModal.tsx | 三处编辑态开关接入 apply/clear；保存序列化前剥离编辑态；handleApplySource 静默 catch → toast（规则2）；"编辑文字"按钮加 `usePermission('stage3.generate')` 权限门（与后端 PUT /api/ppt/slide-source 的 require_perm 同码，会员不能借编辑模式绕过防复制） |
| frontend/src/booklet/components/StepArrange.tsx | 规则6 同类普查：电子成册排版编辑器同病同修；顺带修存量 bug——toggleEdit/toggleSource/handleSave 序列化时把 contenteditable+cursor 样式一并写进保存的章节 HTML |

## 验证

- `dev-log/_repro_slide_edit.py`（playwright，对真实线上产物镜像）全绿：
  1. 光标锚点落在目标段（"02 / 18"）而非第一行
  2. 键入 "XYZ测试" 落进目标段（修改前 "02 / 18" → 修改后 "02 /XYZ测试 18"）
  3. 整段可选中（工具栏加粗等路径可用）
  4. clearEditableDoc 后零残留：无 __ys_editfix、无 contenteditable、body 无 style 属性
  5. 剥离后 userSelect 恢复 none（防复制行为还原）
- `npm run build` 零错误（tsc + vite，index-CikLpppo.js）
- 测试夹具 `backend/data/exports/_repro_*` 验证后删除

## 经验

- 防复制类全局拦截（CSS + 事件双层）会静默杀死 contenteditable；新增"作者编辑"类功能须成对提供中和/恢复钩子
- 回归缺陷先问"什么时候还好的" → `git log -S` 按行为特征搜提交，比读代码猜快得多
- CSS 层修好 ≠ 修好：事件层 preventDefault 单独就能拦截落光标，两层都要中和（第一次假设验证失败即为此）
