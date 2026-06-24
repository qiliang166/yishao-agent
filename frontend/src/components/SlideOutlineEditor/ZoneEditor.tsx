import { useState } from 'react'

interface ZoneEditorProps {
  zoneKey: string
  value: string
  onChange: (key: string, value: string) => void
  onClose: () => void
  position?: { top: number; left: number }
}

/** Floating popover for editing a single zone text field. */
export default function ZoneEditor({ zoneKey, value, onChange, onClose, position }: ZoneEditorProps) {
  const [text, setText] = useState(value || '')

  return (
    <div
      className="zone-editor-popover"
      style={position ? { top: position.top, left: position.left } : { top: '50%', left: '50%' }}
      onClick={e => e.stopPropagation()}
    >
      <label>{zoneKey}</label>
      <textarea
        rows={zoneKey === 'body' || zoneKey === 'items' || zoneKey === 'rows' ? 4 : 2}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && e.ctrlKey) {
            onChange(zoneKey, text)
          }
          if (e.key === 'Escape') onClose()
        }}
        autoFocus
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>取消</button>
        <button className="btn btn-primary btn-sm" onClick={() => onChange(zoneKey, text)}>
          应用
        </button>
      </div>
    </div>
  )
}
