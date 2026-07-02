import { useState, useEffect, useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

interface HelpSection {
  location: string
  title: string
  content: string
}

const LOCATION_ORDER = [
  'home',
  'dashboard',
  'project-stage-1a', 'project-stage-1b', 'project-stage-1c',
  'project-stage-2a', 'project-stage-2b', 'project-stage-2c',
  'project-stage-3a', 'project-stage-3b', 'project-stage-3c',
  'project-stage-4a', 'project-stage-4b',
  'project-stage-5',
  'settings', 'proj-settings', 'templates', 'appendix',
]

/** 前台操作说明：仅使用者可见的章节 */
const FRONT_LOCATIONS = new Set([
  'home', 'dashboard',
  'project-stage-1a', 'project-stage-1b', 'project-stage-1c',
  'project-stage-2a', 'project-stage-2b', 'project-stage-2c',
  'project-stage-3a', 'project-stage-3b', 'project-stage-3c',
  'project-stage-4a', 'project-stage-4b',
  'project-stage-5',
])

function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md) as string)
}

const BASE_STYLE = `
  body { max-width: 800px; margin: 0 auto; padding: 40px 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif; font-size: 15px; line-height: 1.8; color: #333; background: #fff; }
  h1 { font-size: 24px; border-bottom: 2px solid #b22222; padding-bottom: 8px; margin-top: 32px; }
  h2 { font-size: 19px; color: #b22222; margin-top: 28px; }
  h3 { font-size: 16px; margin-top: 20px; }
  p { margin: 10px 0; }
  ul, ol { padding-left: 22px; }
  li { margin: 4px 0; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
  pre { background: #f5f5f5; padding: 12px 16px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 14px; }
  th { background: #f5f5f5; }
  strong { color: #222; }
  hr { border: none; border-top: 1px solid #eee; margin: 32px 0; }
  @media print { body { max-width: 100%; padding: 0; } }
`

const PRINT_STYLE = `
  body { max-width: 800px; margin: 0 auto; padding: 30px 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif; font-size: 14px; line-height: 1.8; color: #333; }
  h1 { font-size: 22px; border-bottom: 2px solid #b22222; padding-bottom: 6px; margin-top: 24px; page-break-after: avoid; }
  h2 { font-size: 17px; color: #b22222; margin-top: 20px; page-break-after: avoid; }
  h3 { font-size: 15px; page-break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; page-break-inside: avoid; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; font-size: 13px; }
  th { background: #f0f0f0; }
  pre { background: #f5f5f5; padding: 10px 14px; border-radius: 4px; font-size: 12px; white-space: pre-wrap; }
  code { background: #f5f5f5; padding: 1px 5px; border-radius: 3px; font-size: 13px; }
  hr { border: none; border-top: 1px solid #ccc; margin: 24px 0; }
  @page { margin: 2cm; }
`

const COVER_FRONT = `
# 智绘教案系统 Yishao Agent — 操作说明书 V1.0.0

> **前台操作说明（使用者）**

本手册面向内容制作者，覆盖产品概述、工作区管理、项目明细管理以及五阶段流水线（素材输入 → 文档生成 → 课件输出 → 演讲课件 → 输出列表）的完整操作指南。
`

export default function ManualPage() {
  const [sections, setSections] = useState<HelpSection[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('')

  useEffect(() => {
    fetch('/api/help-manual/sections')
      .then(r => r.json())
      .then(data => {
        const secs: HelpSection[] = (data.sections || []).sort(
          (a: HelpSection, b: HelpSection) =>
            LOCATION_ORDER.indexOf(a.location) - LOCATION_ORDER.indexOf(b.location)
        )
        setSections(secs)
        if (secs.length > 0) setActiveSection(secs[0].location)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  /** 仅展示前台操作说明，后台管理内容在「全局设置 → 操作说明」tab 中查看 */
  const frontSections = useMemo(
    () => sections.filter(s => FRONT_LOCATIONS.has(s.location)),
    [sections]
  )

  const handleDownload = () => {
    if (frontSections.length === 0) return
    const fullMd = COVER_FRONT + '\n\n---\n\n' + frontSections.map(s => s.content).join('\n\n---\n\n')
    const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Yishao Agent 前台操作说明书</title>
<style>${BASE_STYLE}</style>
</head>
<body>
${renderMarkdown(fullMd)}
</body>
</html>`
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'YishaoAgent_前台操作说明书.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    if (frontSections.length === 0) return
    const fullMd = COVER_FRONT + '\n\n---\n\n' + frontSections.map(s => s.content).join('\n\n---\n\n')
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Yishao Agent 前台操作说明书</title>
<style>${PRINT_STYLE}</style></head>
<body>${renderMarkdown(fullMd)}</body>
</html>`
    const w = window.open('', '_blank', 'width=900,height=700')
    if (w) {
      w.document.write(html)
      w.document.close()
      w.onload = () => w.print()
    }
  }

  const active = frontSections.find(s => s.location === activeSection)

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
        加载中...
      </div>
    )
  }

  if (frontSections.length === 0) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
        暂无操作说明内容。请前往「全局设置」→「操作说明」编辑。
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left TOC */}
      <div style={{
        width: 220, minWidth: 220,
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
        background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Toolbar */}
        <div style={{
          padding: '10px 12px', borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 6, flexShrink: 0,
        }}>
          <button
            className="btn btn-primary btn-sm"
            style={{ flex: 1 }}
            onClick={handleDownload}
            disabled={frontSections.length === 0}
          >
            下载说明书
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handlePrint}
            disabled={frontSections.length === 0}
          >
            打印
          </button>
        </div>

        {/* 前台操作说明标签 */}
        <div style={{
          padding: '6px 12px', borderBottom: '1px solid var(--border)',
          fontSize: 10, color: 'var(--text-secondary)',
          letterSpacing: 1, flexShrink: 0,
        }}>
          前台操作说明（使用者）
        </div>

        {/* Section list */}
        {frontSections.map(s => (
          <button
            key={s.location}
            onClick={() => setActiveSection(s.location)}
            style={{
              display: 'block', width: '100%',
              padding: '9px 14px',
              border: 'none', borderBottom: '1px solid var(--border)',
              background: activeSection === s.location ? 'var(--primary-light)' : 'transparent',
              color: activeSection === s.location ? 'var(--primary)' : 'var(--text)',
              fontWeight: activeSection === s.location ? 600 : 400,
              fontSize: 11, cursor: 'pointer', textAlign: 'left',
              fontFamily: 'var(--font)',
              transition: 'all .1s',
            }}
            onMouseEnter={e => {
              if (activeSection !== s.location) {
                (e.target as HTMLElement).style.background = 'var(--bg-hover)'
              }
            }}
            onMouseLeave={e => {
              if (activeSection !== s.location) {
                (e.target as HTMLElement).style.background = 'transparent'
              }
            }}
          >
            {s.title}
          </button>
        ))}
      </div>

      {/* Right content */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '24px 32px',
      }}>
        {active ? (
          <div
            className="prev-md"
            style={{ maxWidth: 800 }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(active.content) }}
          />
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 60 }}>
            请从左侧选择章节
          </div>
        )}
      </div>
    </div>
  )
}
