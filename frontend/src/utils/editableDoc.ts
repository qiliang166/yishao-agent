// 课件/页面 HTML 塞进 iframe 做 contenteditable 所见即所得编辑的公共工具。
//
// 2026-07-16 起生成的课件产物自带防复制套件（积分系统防会员抄内容，属有意设计）：
//   1. CSS `* { user-select: none }` — contenteditable 下光标无法落进文字（Chromium 行为：
//      不可选中内容点击时光标退到文档起点=第一行）
//   2. document 冒泡段监听 selectstart/copy/contextmenu/dragstart 一律 preventDefault —
//      即便 CSS 被覆盖，selectstart 被拦也照样无法落光标
// 编辑是作者授权场景，编辑期须同时中和两者：注入 !important 覆盖样式 + 在捕获段
// stopImmediatePropagation 拦停事件（事件到不了冒泡段 → 不被 preventDefault → 选中/复制默认行为发生）。
// 退出编辑/序列化前必须调 clearEditableDoc：剥离注入样式与编辑态属性（监听器不参与序列化，
// 但也一并移除还原防复制行为），避免污染保存的 HTML。

const STYLE_ID = '__ys_editfix'
const BLOCKED_EVENTS = ['selectstart', 'copy', 'contextmenu', 'dragstart'] as const

const stopperMap = new WeakMap<Document, (e: Event) => void>()

export function applyEditableDoc(doc: Document) {
  doc.body.setAttribute('contenteditable', 'true')
  doc.body.style.cursor = 'text'
  if (!doc.getElementById(STYLE_ID)) {
    const st = doc.createElement('style')
    st.id = STYLE_ID
    st.textContent = '* { -webkit-user-select: text !important; user-select: text !important; }'
    ;(doc.head || doc.documentElement).appendChild(st)
  }
  if (!stopperMap.has(doc)) {
    const stopper = (e: Event) => { e.stopImmediatePropagation() }
    for (const t of BLOCKED_EVENTS) doc.addEventListener(t, stopper, true)
    stopperMap.set(doc, stopper)
  }
}

export function clearEditableDoc(doc: Document) {
  doc.body.removeAttribute('contenteditable')
  doc.body.style.cursor = ''
  if (!doc.body.getAttribute('style')) doc.body.removeAttribute('style')
  doc.getElementById(STYLE_ID)?.remove()
  const stopper = stopperMap.get(doc)
  if (stopper) {
    for (const t of BLOCKED_EVENTS) doc.removeEventListener(t, stopper, true)
    stopperMap.delete(doc)
  }
}
