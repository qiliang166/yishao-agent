import { useState } from 'react'
import HelpDrawer from './HelpDrawer'

interface HelpSection {
  location: string
  title: string
  content: string
}

export default function HelpButton({ location }: { location: string }) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<HelpSection | null>(null)
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/help-manual/sections/${encodeURIComponent(location)}`)
      if (res.ok) {
        const data = await res.json()
        setSection({ location: data.location, title: data.title, content: data.content })
      } else {
        setSection(null)
      }
    } catch {
      setSection(null)
    } finally {
      setLoading(false)
      setOpen(true)
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        title="操作说明"
        style={{
          width: 20, height: 20, borderRadius: '50%',
          border: '1px solid var(--border)',
          background: 'var(--bg)',
          color: 'var(--text-secondary)',
          fontSize: 11, fontWeight: 700,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
          marginLeft: 4,
          transition: 'all .12s',
        }}
        onMouseEnter={e => {
          (e.target as HTMLElement).style.background = 'var(--primary-light)'
          ;(e.target as HTMLElement).style.color = 'var(--primary)'
          ;(e.target as HTMLElement).style.borderColor = 'var(--primary)'
        }}
        onMouseLeave={e => {
          (e.target as HTMLElement).style.background = 'var(--bg)'
          ;(e.target as HTMLElement).style.color = 'var(--text-secondary)'
          ;(e.target as HTMLElement).style.borderColor = 'var(--border)'
        }}
      >
        ?
      </button>
      {open && <HelpDrawer section={section} onClose={() => setOpen(false)} />}
    </>
  )
}
