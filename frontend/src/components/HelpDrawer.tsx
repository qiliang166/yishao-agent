import { useEffect, useRef } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

interface HelpSection {
  location: string
  title: string
  content: string
}

export default function HelpDrawer({ section, onClose }: { section: HelpSection | null; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  const renderContent = () => {
    if (!section || !section.content) {
      return (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: '40px 0' }}>
          暂无操作说明
        </div>
      )
    }
    const html = DOMPurify.sanitize(marked.parse(section.content) as string)
    return (
      <div
        className="help-content"
        style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--text)' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.2)', zIndex: 10000,
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        style={{
          width: 420, height: '100%',
          background: 'var(--card)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column',
          animation: 'help-slide-in .2s ease-out',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            {section?.title || '操作说明'}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 24, height: 24, borderRadius: '50%',
              border: 'none', background: 'transparent',
              color: 'var(--text-secondary)', fontSize: 16,
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '14px 18px',
        }}>
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
