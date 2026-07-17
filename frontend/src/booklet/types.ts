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
  colors: { primary: string; accent: string; bg: string; text: string; card_bg?: string; desk?: string; font?: string }
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

export function newChapterId(): string {
  return 'ch-' + Math.random().toString(36).slice(2, 10)
}

export const BOOK_TYPE_LABEL: Record<BookType, string> = {
  a4: 'A4 书册版',
  ppt: 'PPT 合辑版',
}
