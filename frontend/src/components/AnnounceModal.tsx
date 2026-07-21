import { useState, useEffect } from 'react'
import DOMPurify from 'dompurify'
import { api } from '../services/api'

export default function AnnounceModal() {
  const [html, setHtml] = useState('')
  const [show, setShow] = useState(false)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    const closed = localStorage.getItem('announce_closed')
    if (closed === today) return

    api.getSiteConfig().then(cfg => {
      if (cfg.announce_enabled === '1' && cfg.announce_html) {
        setHtml(cfg.announce_html)
        setShow(true)
      }
    }).catch(() => {})
  }, [])

  if (!show) return null

  const handleClose = () => {
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem('announce_closed', today)
    setShow(false)
  }

  return (
    <div className="dialog-overlay" onClick={handleClose}>
      <div className="dialog-box" style={{ maxWidth: 560, maxHeight: '80vh', overflow: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="dialog-title" style={{ margin: 0 }}>公告</div>
          <button
            onClick={handleClose}
            style={{
              background: 'transparent', border: 'none', fontSize: 18,
              cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px 6px',
            }}
          >✕</button>
        </div>
        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-primary btn-sm" onClick={handleClose}>我知道了</button>
        </div>
      </div>
    </div>
  )
}
