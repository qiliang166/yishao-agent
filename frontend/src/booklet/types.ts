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

export interface BookletSummary {
  id: string
  book_type: BookType
  title: string
  subtitle: string
  owner_id: string
  owner_role: string
  chapter_count: number
  is_recommended: boolean
  updated_at: string
}

export interface BookletDraft {
  id: string
  book_type: BookType
  title: string
  subtitle: string
  author: string
  cover: Cover
  chapters: Chapter[]
  is_recommended?: boolean
  owner_id?: string
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

/** VI 版式判定：第一个启用章节是 HTML 课件 → A4 固定页走 VI A4 版式（与后端 _first_chapter_is_html 同规则） */
export function isHtmlFirstChapter(chapters: Chapter[]): boolean {
  const first = chapters.find(c => c.enabled)
  return !!first && !isProseChapter(first)
}

/** 保存前统一从 md 原文重算渲染快照，不信任存量（旧草稿保存一次即自愈） */
export function normalizeChapters(chapters: Chapter[]): Chapter[] {
  return chapters.map(c => (isProseChapter(c) ? { ...c, content_html: mdToHtml(c.content) } : c))
}

/** 草稿主题解析；custom 分支兼容历史上 theme_id 为空但存有 theme_colors 的草稿（与后端 _resolve_theme 同规则） */
export function resolveDraftTheme(draft: BookletDraft, themes: Theme[]): Theme | null {
  const custom = draft.cover.theme_colors || {}
  if (!draft.cover.theme_id && Object.keys(custom).length > 0) {
    return { id: 'custom', name: '自定义配色', source: 'builtin', colors: custom as Theme['colors'] }
  }
  return themes.find(t => t.id === draft.cover.theme_id) || themes[0] || null
}

export function newChapterId(): string {
  return 'ch-' + Math.random().toString(36).slice(2, 10)
}

export const BOOK_TYPE_LABEL: Record<BookType, string> = {
  a4: 'A4 书册版',
  ppt: 'PPT 合辑版',
}
