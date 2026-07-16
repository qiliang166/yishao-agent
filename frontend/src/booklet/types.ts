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
}

export interface Cover {
  logo_url?: string
  org?: string
  date_text?: string
  flyleaf_text?: string
  back_cover_text?: string
  theme_id?: string
  theme_colors?: Record<string, string>
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

export interface Theme {
  id: string
  name: string
  source: 'builtin' | 'style_tmpl'
  colors: { primary: string; accent: string; bg: string; text: string; card_bg?: string; font?: string }
}

export function mdToHtml(md: string): string {
  try {
    return DOMPurify.sanitize(marked.parse(md) as string)
  } catch {
    return ''
  }
}

export function newChapterId(): string {
  return 'ch-' + Math.random().toString(36).slice(2, 10)
}

export const BOOK_TYPE_LABEL: Record<BookType, string> = {
  a4: 'A4 书册版',
  ppt: 'PPT 合辑版',
}
