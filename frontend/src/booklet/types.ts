import { marked } from 'marked'
import DOMPurify from 'dompurify'

export type BookType = 'a4' | 'ppt'
export type SourceType = 'step_md' | 'a4_html' | 'ppt_html' | 'custom'

export interface Chapter {
  id: string
  title: string
  source_type: SourceType
  project_id: string
  project_name: string
  source_key: string
  content: string
  content_html: string
  enabled: boolean
  content_format?: 'md' | 'html'
  bg_color?: string
  hidden_pages?: number[]
  page_order?: number[]
  hide_divider?: boolean
  /** 正文拆页级隐藏/排序（R6，翻页式/标准页生效）；与 hidden_pages=[0]（整章隐藏）语义独立 */
  prose_hidden_pages?: number[]
  prose_page_order?: number[]
}

export interface Cover {
  logo_url?: string
  org?: string
  date_text?: string
  flyleaf_text?: string
  back_cover_text?: string
  theme_id?: string
  theme_colors?: Record<string, string>
  desk_none?: boolean
  render_mode?: 'paged' | 'flow' | 'standard'
  hidden_fixed?: string[]
}

export interface BookletDraft {
  id: string
  book_type: BookType
  title: string
  subtitle: string
  author: string
  cover: Cover
  chapters: Chapter[]
}

export interface ContentItem {
  source_type: SourceType
  source_key: string
  label: string
  available: boolean
}

export interface ContentProject {
  id: string
  name: string
  items: ContentItem[]
}

export interface PageMapChapter {
  chapter_id: string
  title: string
  kind: 'prose' | 'fulldoc' | 'embed'
  page_count: number
  docs?: string[]
}

export interface Theme {
  id: string
  name: string
  source: 'builtin' | 'style_tmpl'
  colors: { primary: string; accent: string; bg: string; text: string; card_bg?: string; desk?: string; font?: string; secondary?: string; [k: string]: string | undefined }
}

export function mdToHtml(md: string): string {
  try {
    return DOMPurify.sanitize(marked.parse(md) as string)
  } catch {
    return ''
  }
}

/** 判断章节是否为 Markdown 可编辑正文（step_md 或 md 格式的自建章） */
export function isProseChapter(c: Chapter): boolean {
  if (c.source_type === 'step_md') return true
  return c.source_type === 'custom' && c.content_format !== 'html'
}

/** 保存前统一从 md 原文重算渲染快照，不信任存量（旧草稿保存一次即自愈） */
export function normalizeChapters(chapters: Chapter[]): Chapter[] {
  return chapters.map(c => (isProseChapter(c) ? { ...c, content_html: mdToHtml(c.content) } : c))
}

/** 草稿主题解析：theme_id 空且带 theme_colors → 内容同款自定义配色（与后端 _resolve_theme custom 分支同规则） */
export function resolveDraftTheme(draft: BookletDraft, themes: Theme[]): Theme | null {
  const custom = draft.cover.theme_colors || {}
  if (!draft.cover.theme_id && Object.keys(custom).length > 0) {
    return { id: 'custom', name: '内容同款配色', source: 'builtin', colors: custom as Theme['colors'] }
  }
  return themes.find(t => t.id === draft.cover.theme_id) || themes[0] || null
}

/* :root 变量名 → 主题色 key（与后端 THEME_VAR_KEYS 语义一致） */
const PALETTE_VAR_MAP: Record<string, string> = {
  '--primary': 'primary', '--secondary': 'secondary', '--accent': 'accent',
  '--background': 'bg', '--text': 'text', '--card-bg': 'card_bg',
  '--chart-0': 'chart-0', '--chart-1': 'chart-1', '--chart-2': 'chart-2', '--chart-3': 'chart-3',
  '--chart-4': 'chart-4', '--chart-5': 'chart-5', '--chart-6': 'chart-6', '--chart-7': 'chart-7',
}

/** 从第一个启用的 HTML 章节的 :root 块提取配色（仅收合法 hex；无 primary 视为不可用） */
export function extractContentPalette(chapters: Chapter[]): Record<string, string> | null {
  const ch = chapters.find(c => c.enabled && !isProseChapter(c) && (c.content || '').includes(':root'))
  if (!ch) return null
  const m = (ch.content || '').match(/:root\s*\{([^}]*)\}/)
  if (!m) return null
  const out: Record<string, string> = {}
  const re = /(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g
  let mm: RegExpExecArray | null
  while ((mm = re.exec(m[1])) !== null) {
    const key = PALETTE_VAR_MAP[mm[1]]
    if (key && !out[key]) out[key] = mm[2]
  }
  return out.primary ? out : null
}

export function newChapterId(): string {
  return 'ch-' + Math.random().toString(36).slice(2, 10)
}

export const BOOK_TYPE_LABEL: Record<BookType, string> = {
  a4: 'A4 书册版',
  ppt: 'PPT 合辑版',
}
