import { CSSProperties } from 'react'
import DOMPurify from 'dompurify'
import { Theme } from '../types'
import { themeVars } from '../proseSplit'

interface Props {
  html: string
  theme?: Theme | null
  bgColor?: string
  style?: CSSProperties
}

/** 与合成模板 .bk-prose 同款排版的预览容器 — 所见即成书（含主题配色与 --ink 派生色） */
export default function ProsePreview({ html, theme, bgColor, style }: Props) {
  const vars = themeVars(theme) as CSSProperties

  return (
    <div style={{
      ...vars,
      background: bgColor || 'var(--background)',
      color: 'var(--text)',
      fontFamily: 'var(--font)',
      padding: '14px 18px',
      borderRadius: 4,
      ...style,
    }}>
      <style>{`
        .bkp-prose { font-size: 13px; line-height: 1.95; }
        .bkp-prose h1, .bkp-prose h2, .bkp-prose h3, .bkp-prose h4 { color: var(--ink); margin: 14px 0 7px; line-height: 1.5; }
        .bkp-prose h1 { font-size: 19px; } .bkp-prose h2 { font-size: 17px; } .bkp-prose h3 { font-size: 15px; } .bkp-prose h4 { font-size: 14px; }
        .bkp-prose p { margin: 6px 0; }
        .bkp-prose ul, .bkp-prose ol { margin: 6px 0 6px 18px; }
        .bkp-prose li { margin: 3px 0; }
        .bkp-prose table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
        .bkp-prose th, .bkp-prose td { border: 1px solid var(--text); padding: 4px 7px; }
        .bkp-prose th { background: var(--card-bg); color: var(--ink); }
        .bkp-prose blockquote { border-left: 3px solid var(--accent); background: var(--card-bg); padding: 6px 10px; margin: 8px 0; }
        .bkp-prose code { background: var(--card-bg); padding: 1px 4px; border-radius: 2px; font-size: 12px; }
        .bkp-prose pre { background: var(--card-bg); padding: 8px; overflow-x: auto; margin: 8px 0; }
        .bkp-prose img { max-width: 100%; }
        .bkp-prose hr { border: none; border-top: 1px solid var(--text); opacity: 0.25; margin: 12px 0; }
      `}</style>
      <div className="bkp-prose" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
    </div>
  )
}
