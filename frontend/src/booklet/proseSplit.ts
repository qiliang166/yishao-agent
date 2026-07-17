import DOMPurify from 'dompurify'
import { Theme } from './types'

/**
 * 与合成模板内嵌 bkSplitProse 同算法的正文拆页（页面编排缩略图用）。
 *
 * ⚠ 同步契约：本文件的拆页算法与下方 CSS 镜像自
 *   backend/resources/booklet/{a4_book,ppt_book,a4_standard,ppt_standard}.html
 * 模板的 bkSplitProse 或 .bk-prose/.bk-chapter-head 版式改动时必须同步本文件，
 * 否则编排页的页数/分界与合成产物不一致。
 */

const FALLBACK = {
  primary: '#18181b', accent: '#3b82f6', bg: '#ffffff', text: '#27272a',
  card_bg: '#f4f4f5', font: "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif",
}

/** 模板版式镜像（选择器统一挂在 .bkr-host 下，避免污染应用样式） */
const A4_CSS = `
.bkr-host .bk-sheet { width: 210mm; height: 297mm; background: var(--book-bg); display: flex; flex-direction: column; overflow: hidden; position: relative; }
.bkr-host .bk-sheet-inner { flex: 1; padding: 22mm 20mm 26mm; display: flex; flex-direction: column; overflow: hidden; }
.bkr-host .bk-chapter-head { border-left: 5px solid var(--book-accent); padding: 2mm 0 2mm 6mm; margin-bottom: 8mm; }
.bkr-host .bk-chapter-no { font-size: 10.5pt; color: var(--book-accent); font-weight: 600; letter-spacing: 0.2em; }
.bkr-host .bk-chapter-title { font-size: 19pt; font-weight: 700; color: var(--book-primary); margin-top: 1.5mm; line-height: 1.4; }
.bkr-host .bk-chapter-src { font-size: 9pt; opacity: 0.55; margin-top: 1.5mm; }
.bkr-host .bk-prose { font-size: 11.5pt; line-height: 1.95; }
.bkr-host .bk-prose h1, .bkr-host .bk-prose h2, .bkr-host .bk-prose h3, .bkr-host .bk-prose h4 { color: var(--book-primary); margin: 7mm 0 3.5mm; line-height: 1.5; }
.bkr-host .bk-prose h1 { font-size: 16pt; } .bkr-host .bk-prose h2 { font-size: 14.5pt; } .bkr-host .bk-prose h3 { font-size: 13pt; } .bkr-host .bk-prose h4 { font-size: 12pt; }
.bkr-host .bk-prose p { margin: 3mm 0; }
.bkr-host .bk-prose ul, .bkr-host .bk-prose ol { margin: 3mm 0 3mm 7mm; }
.bkr-host .bk-prose li { margin: 1.5mm 0; }
.bkr-host .bk-prose table { border-collapse: collapse; width: 100%; margin: 4mm 0; font-size: 10.5pt; }
.bkr-host .bk-prose th, .bkr-host .bk-prose td { border: 1px solid var(--book-text); padding: 2mm 3mm; }
.bkr-host .bk-prose th { background: var(--book-card-bg); color: var(--book-primary); }
.bkr-host .bk-prose blockquote { border-left: 3px solid var(--book-accent); background: var(--book-card-bg); padding: 3mm 5mm; margin: 4mm 0; }
.bkr-host .bk-prose code { background: var(--book-card-bg); padding: 0.5mm 1.5mm; border-radius: 2px; font-size: 10pt; }
.bkr-host .bk-prose pre { background: var(--book-card-bg); padding: 4mm; overflow-x: auto; margin: 4mm 0; }
.bkr-host .bk-prose img { max-width: 100%; }
.bkr-host .bk-prose hr { border: none; border-top: 1px solid var(--book-text); opacity: 0.25; margin: 6mm 0; }
`

const PPT_CSS = `
.bkr-host .bk-slide { width: 1280px; height: 720px; background: var(--book-bg); display: flex; flex-direction: column; overflow: hidden; position: relative; }
.bkr-host .bk-prose-slide { padding: 60px 110px; }
.bkr-host .bk-prose { font-size: 20px; line-height: 1.9; overflow-y: auto; }
.bkr-host .bk-prose h1, .bkr-host .bk-prose h2, .bkr-host .bk-prose h3 { color: var(--book-primary); margin: 22px 0 12px; }
.bkr-host .bk-prose h1 { font-size: 32px; } .bkr-host .bk-prose h2 { font-size: 27px; } .bkr-host .bk-prose h3 { font-size: 23px; }
.bkr-host .bk-prose p { margin: 10px 0; }
.bkr-host .bk-prose ul, .bkr-host .bk-prose ol { margin: 10px 0 10px 26px; }
.bkr-host .bk-prose table { border-collapse: collapse; width: 100%; margin: 14px 0; }
.bkr-host .bk-prose th, .bkr-host .bk-prose td { border: 1px solid var(--book-text); padding: 8px 12px; }
.bkr-host .bk-prose th { background: var(--book-card-bg); color: var(--book-primary); }
.bkr-host .bk-prose blockquote { border-left: 4px solid var(--book-accent); background: var(--book-card-bg); padding: 12px 18px; margin: 14px 0; }
`

export function proseSplitCss(bookType: 'a4' | 'ppt'): string {
  return bookType === 'a4' ? A4_CSS : PPT_CSS
}

export function themeVars(theme?: Theme | null): Record<string, string> {
  const c = { ...FALLBACK, ...(theme?.colors || {}) }
  return {
    '--book-primary': c.primary,
    '--book-accent': c.accent,
    '--book-bg': c.bg,
    '--book-text': c.text,
    '--book-card-bg': c.card_bg || FALLBACK.card_bg,
    '--book-font': c.font || FALLBACK.font,
  }
}

export interface ProseSplitInput {
  bookType: 'a4' | 'ppt'
  html: string
  theme?: Theme | null
  bgColor?: string
  chapterNo?: number
  chapterTitle?: string
  chapterSrc?: string
}

/* ── 以下四个函数与模板 bkSplitProse 逐条对齐 ── */

function contentBottom(box: HTMLElement): number {
  const r = box.getBoundingClientRect()
  const pb = parseFloat(getComputedStyle(box).paddingBottom) || 0
  return r.bottom - pb
}

function overflowIndex(prose: HTMLElement, limit: number): number {
  const kids = prose.children
  for (let i = 0; i < kids.length; i++) {
    if (kids[i].getBoundingClientRect().bottom > limit + 1) return i
  }
  return -1
}

function splitTable(table: HTMLTableElement, limit: number): HTMLTableElement | null {
  let rows: HTMLTableRowElement[] = []
  for (let b = 0; b < table.tBodies.length; b++) {
    rows = rows.concat(Array.prototype.slice.call(table.tBodies[b].rows))
  }
  let cut = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].getBoundingClientRect().bottom > limit + 1) { cut = i; break }
  }
  if (cut <= 0) return null /* 首行就超 → 整表移到下一页 */
  const clone = table.cloneNode(false) as HTMLTableElement
  if (table.tHead) clone.appendChild(table.tHead.cloneNode(true))
  const tb = document.createElement('tbody')
  for (let j = cut; j < rows.length; j++) tb.appendChild(rows[j])
  clone.appendChild(tb)
  return clone
}

function splitSections(
  first: HTMLElement,
  boxOf: (s: HTMLElement) => HTMLElement,
  makeCont: (s: HTMLElement) => { section: HTMLElement; prose: HTMLElement },
): HTMLElement[] {
  const pages: HTMLElement[] = [first]
  let cur: HTMLElement | null = first
  let guard = 0
  while (cur && guard++ < 200) {
    const prose = cur.querySelector('.bk-prose') as HTMLElement | null
    if (!prose) break
    const limit = contentBottom(boxOf(cur))
    let idx = overflowIndex(prose, limit)
    if (idx < 0) break
    const carry: HTMLElement[] = []
    const breaker = prose.children[idx] as HTMLElement | undefined
    if (breaker && breaker.tagName === 'TABLE') {
      const rest = splitTable(breaker as HTMLTableElement, limit)
      if (rest) { carry.push(rest); idx += 1 }
    }
    if (idx === 0 && carry.length === 0 && !cur.querySelector('.bk-chapter-head')) {
      if (prose.children.length <= 1) break
      idx = 1 /* 单个超高不可拆块留本页，其余移下页 */
    }
    const moved: Node[] = []
    while (prose.children.length > idx) moved.push(prose.removeChild(prose.children[idx]))
    const next = makeCont(cur)
    carry.forEach(n => next.prose.appendChild(n))
    moved.forEach(n => next.prose.appendChild(n))
    pages.push(next.section)
    cur = next.section
  }
  return pages
}

/**
 * 拆页并返回每页 sheet/slide 的 innerHTML（已 sanitize，供缩放缩略图渲染）。
 * 页数与分界 = 合成产物在翻页式/标准页模式下的真实页。
 */
export function splitProsePages(input: ProseSplitInput): string[] {
  const { bookType, html, theme, bgColor } = input
  const host = document.createElement('div')
  host.className = 'bkr-host'
  host.style.position = 'fixed'
  host.style.left = '-100000px'
  host.style.top = '0'
  host.style.visibility = 'hidden'
  host.style.pointerEvents = 'none'
  const vars = themeVars(theme)
  Object.entries(vars).forEach(([k, v]) => host.style.setProperty(k, v))
  host.style.fontFamily = 'var(--book-font)'
  host.style.color = 'var(--book-text)'

  const style = document.createElement('style')
  style.textContent = proseSplitCss(bookType)
  host.appendChild(style)

  const clean = DOMPurify.sanitize(html)
  let first: HTMLElement
  let boxOf: (s: HTMLElement) => HTMLElement
  let makeCont: (s: HTMLElement) => { section: HTMLElement; prose: HTMLElement }

  if (bookType === 'a4') {
    first = document.createElement('section')
    first.className = 'bk-sheet'
    if (bgColor) first.style.background = bgColor
    const head = input.chapterNo
      ? `<div class="bk-chapter-head"><div class="bk-chapter-no">第 ${input.chapterNo} 章</div>` +
        `<div class="bk-chapter-title"></div><div class="bk-chapter-src"></div></div>`
      : ''
    first.innerHTML = `<div class="bk-sheet-inner">${head}<div class="bk-prose">${clean}</div></div>`
    if (input.chapterNo) {
      const t = first.querySelector('.bk-chapter-title')
      const s = first.querySelector('.bk-chapter-src')
      if (t) t.textContent = input.chapterTitle || ''
      if (s) s.textContent = input.chapterSrc || ''
    }
    boxOf = s => s.querySelector('.bk-sheet-inner') as HTMLElement
    makeCont = s => {
      const cont = s.cloneNode(false) as HTMLElement
      const inner = document.createElement('div'); inner.className = 'bk-sheet-inner'
      const prose = document.createElement('div'); prose.className = 'bk-prose'
      inner.appendChild(prose); cont.appendChild(inner)
      s.parentNode!.insertBefore(cont, s.nextSibling)
      return { section: cont, prose }
    }
  } else {
    first = document.createElement('section')
    first.className = 'bk-slide bk-prose-slide'
    if (bgColor) first.style.background = bgColor
    first.innerHTML = `<div class="bk-prose">${clean}</div>`
    boxOf = s => s
    makeCont = s => {
      const cont = s.cloneNode(false) as HTMLElement
      const prose = document.createElement('div'); prose.className = 'bk-prose'
      cont.appendChild(prose)
      s.parentNode!.insertBefore(cont, s.nextSibling)
      return { section: cont, prose }
    }
  }

  host.appendChild(first)
  document.body.appendChild(host)
  try {
    const pages = splitSections(first, boxOf, makeCont)
    return pages.map(p => p.innerHTML)
  } finally {
    document.body.removeChild(host)
  }
}
