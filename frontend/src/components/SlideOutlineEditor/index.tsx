import { useState, useEffect, useCallback } from 'react'
import { api } from '../../services/api'
import ZoneEditor from './ZoneEditor'
import './SlideOutlineEditor.css'

interface SlideOutlineEditorProps {
  templateId: string
  templateName: string
  slidePlan: any[]
  onSave: (updatedPlan: any[]) => Promise<void>
  onClose: () => void
  slideTypes: string[]
}

/** Visual slide outline editor with guizang HTML previews. */
export default function SlideOutlineEditor({
  templateId, templateName, slidePlan,
  onSave, onClose, slideTypes,
}: SlideOutlineEditorProps) {
  const [plan, setPlan] = useState<any[]>(() =>
    JSON.parse(JSON.stringify(slidePlan))
  )
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [previewHtml, setPreviewHtml] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState<Record<number, boolean>>({})
  const [editingZone, setEditingZone] = useState<{
    idx: number; key: string; value: string
  } | null>(null)
  const [saving, setSaving] = useState(false)

  const selected = plan[selectedIdx]

  // Load preview HTML for selected slide
  useEffect(() => {
    if (selectedIdx < 0 || selectedIdx >= plan.length) return
    const slide = plan[selectedIdx]
    const cacheKey = `${selectedIdx}:${slide?.type}:${JSON.stringify(slide?.zones)}`

    if (previewHtml[selectedIdx]) return // already loaded

    let cancelled = false
    setLoading(prev => ({ ...prev, [selectedIdx]: true }))

    api.previewSlide(templateId, slide || { type: 'content', zones: {} })
      .then((data: any) => {
        if (!cancelled && data?.html) {
          setPreviewHtml(prev => ({ ...prev, [selectedIdx]: data.html }))
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(prev => ({ ...prev, [selectedIdx]: false }))
      })

    return () => { cancelled = true }
  }, [selectedIdx, plan[selectedIdx]?.type, JSON.stringify(plan[selectedIdx]?.zones)])

  // Listen for zone click messages from iframe
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (e.data?.type === 'zone-click' && selectedIdx >= 0) {
        const key = e.data.zoneKey || 'content'
        const zones = plan[selectedIdx]?.zones || {}
        setEditingZone({
          idx: selectedIdx,
          key,
          value: zones[key] || e.data.text || '',
        })
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [selectedIdx, plan])

  // Load all thumbnails in background
  useEffect(() => {
    plan.forEach((_, i) => {
      if (previewHtml[i] || loading[i]) return
      setLoading(prev => ({ ...prev, [i]: true }))
      const slide = plan[i]
      api.previewSlide(templateId, slide || { type: 'content', zones: {} })
        .then((data: any) => {
          if (data?.html) {
            setPreviewHtml(prev => ({ ...prev, [i]: data.html }))
          }
        })
        .catch(() => {})
        .finally(() => setLoading(prev => ({ ...prev, [i]: false })))
    })
  }, [plan.length])

  const updateZone = useCallback((zoneKey: string, value: string) => {
    if (!editingZone) return
    setPlan(prev => {
      const next = [...prev]
      next[editingZone.idx] = {
        ...next[editingZone.idx],
        zones: { ...(next[editingZone.idx].zones || {}), [zoneKey]: value },
      }
      return next
    })
    // Invalidate preview cache for this slide
    setPreviewHtml(prev => {
      const next = { ...prev }
      delete next[editingZone.idx]
      return next
    })
    setEditingZone(null)
  }, [editingZone])

  const updateType = useCallback((idx: number, newType: string) => {
    setPlan(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], type: newType }
      return next
    })
    setPreviewHtml(prev => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
  }, [])

  const addSlide = () => {
    setPlan(prev => [...prev, { type: 'content', zones: { heading: '', body: '' } }])
  }

  const removeSlide = (idx: number) => {
    if (plan.length <= 1) return
    setPlan(prev => prev.filter((_, i) => i !== idx))
    setPreviewHtml(prev => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
    if (selectedIdx >= idx) setSelectedIdx(Math.max(0, selectedIdx - 1))
  }

  const moveSlide = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= plan.length) return
    setPlan(prev => {
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next
    })
    // Swap preview cache
    setPreviewHtml(prev => {
      const next = { ...prev }
      const a = next[idx]; const b = next[newIdx]
      if (a !== undefined) next[newIdx] = a; else delete next[newIdx]
      if (b !== undefined) next[idx] = b; else delete next[idx]
      return next
    })
    setSelectedIdx(newIdx)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(plan)
    } finally {
      setSaving(false)
    }
  }

  const slideLabel = (slide: any, i: number) => {
    const zones = slide?.zones || {}
    return zones.heading || zones.title || zones.quote || zones.body?.slice(0, 20) || `Slide ${i + 1}`
  }

  return (
    <div className="soe-overlay" onMouseDown={e => {
      if (e.target === e.currentTarget) onClose()
    }}>
      <div className="soe-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="soe-header">
          <h3>编辑大纲 — {templateName}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="soe-body">
          {/* Left: thumbnails */}
          <div className="soe-thumbnails">
            {plan.map((slide, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <div
                  className={`soe-thumb${i === selectedIdx ? ' selected' : ''}`}
                  onClick={() => setSelectedIdx(i)}
                >
                  <span className="soe-thumb-num">#{i + 1}</span>
                  {previewHtml[i] ? (
                    <iframe
                      srcDoc={previewHtml[i]}
                      title={`Slide ${i + 1}`}
                      style={{ pointerEvents: 'none' }}
                    />
                  ) : (
                    <div style={{
                      aspectRatio: '16/9', background: '#f0f0f0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: '#999',
                    }}>
                      {loading[i] ? '...' : '—'}
                    </div>
                  )}
                </div>
                <div className="soe-thumb-controls">
                  <button className="btn btn-ghost btn-sm"
                    style={{ fontSize: 8, padding: '0 3px' }}
                    onClick={() => moveSlide(i, -1)} disabled={i === 0}>▲</button>
                  <span style={{ fontSize: 8, color: '#999', minWidth: 28, textAlign: 'center' }}>
                    {slide.type}
                  </span>
                  <button className="btn btn-ghost btn-sm"
                    style={{ fontSize: 8, padding: '0 3px' }}
                    onClick={() => moveSlide(i, 1)} disabled={i === plan.length - 1}>▼</button>
                  <button className="btn btn-ghost btn-sm"
                    style={{ fontSize: 8, padding: '0 3px', color: 'var(--warning)' }}
                    onClick={() => removeSlide(i)} disabled={plan.length <= 1}>✕</button>
                </div>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm"
              style={{ fontSize: 10, marginTop: 4 }}
              onClick={addSlide}>
              + 添加幻灯片
            </button>
          </div>

          {/* Right: main preview */}
          <div className="soe-preview">
            {selected ? (
              <>
                <div className="soe-preview-frame">
                  {previewHtml[selectedIdx] ? (
                    <iframe
                      srcDoc={previewHtml[selectedIdx]}
                      title={`Preview ${selectedIdx + 1}`}
                    />
                  ) : (
                    <div className="soe-empty">
                      {loading[selectedIdx] ? '加载预览...' : '点击缩略图加载预览'}
                    </div>
                  )}
                  {editingZone && editingZone.idx === selectedIdx && (
                    <ZoneEditor
                      zoneKey={editingZone.key}
                      value={editingZone.value}
                      onChange={updateZone}
                      onClose={() => setEditingZone(null)}
                      position={{ top: 60, left: 20 }}
                    />
                  )}
                </div>

                {/* Toolbar */}
                <div className="soe-preview-toolbar">
                  <span style={{ color: '#999' }}>#{selectedIdx + 1}</span>
                  <select value={selected.type}
                    onChange={e => updateType(selectedIdx, e.target.value)}>
                    {slideTypes.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 9, color: '#999' }}>
                    {Object.keys(selected.zones || {}).join(', ') || '(无字段)'}
                  </span>
                  <span style={{ fontSize: 9, color: '#999' }}>
                    点击预览中的文字区域进行编辑
                  </span>
                </div>
              </>
            ) : (
              <div className="soe-empty">暂无幻灯片</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="soe-footer">
          <span style={{ fontSize: 11, color: '#999' }}>
            {plan.length} 页幻灯片
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>取消</button>
            <button className="btn btn-primary btn-sm"
              onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存大纲'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
