import { useState, useEffect, useCallback } from 'react'
import { api, StyleItem } from '../services/api'

// ---------- component ----------

function TemplateManager() {
  const STYLE_GROUPS = ['professional', 'creative', 'tech', 'thematic'] as const
  const GROUP_META: Record<string, { label: string; desc: string; apiGroup: string }> = {
    professional: { label: '商务专业', desc: '干净、权威、可信赖', apiGroup: 'Professional' },
    creative: { label: '创意大胆', desc: '活力、鲜艳、表现力强', apiGroup: 'Creative' },
    tech: { label: '科技暗色', desc: '前卫、精确、未来感', apiGroup: 'Tech / Dark' },
    thematic: { label: '主题风格', desc: '教育、奇幻、经典复古', apiGroup: 'Thematic' },
  }

  const [styles, setStyles] = useState<StyleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeGroup, setActiveGroup] = useState<string>('professional')
  const [expandedStyle, setExpandedStyle] = useState<string | null>(null)

  const loadStyles = useCallback(async () => {
    setLoading(true)
    try { setStyles(await api.listStyles() || []) } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadStyles() }, [loadStyles])

  // ---------- render ----------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* Tab bar — mgmt-tabs style */}
      <div className="mgmt-tabs" style={{ padding: '0 0 0 0' }}>
        {STYLE_GROUPS.map(g => {
          const meta = GROUP_META[g]
          const count = styles.filter(s => s.group === meta.apiGroup).length
          return (
            <button key={g}
              className={`mgmt-tab${activeGroup === g ? ' active' : ''}`}
              onClick={() => { setActiveGroup(g); setExpandedStyle(null) }}
            >
              {meta.label} <span style={{ fontSize: 9, opacity: 0.6 }}>({loading ? '-' : count})</span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="mgmt-content" style={{ flex: 1 }}>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>
            加载中...
          </p>
        ) : (
          (() => {
            const meta = GROUP_META[activeGroup]
            const groupStyles = styles.filter(s => s.group === meta.apiGroup)
            return (
              <>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 12px 2px' }}>
                  {meta.desc} · {groupStyles.length} 套风格
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                  {groupStyles.map(style => {
                    const p = style.colors
                    const isExpanded = expandedStyle === style.id
                    return (
                      <div key={style.id}
                        className="card"
                        style={{
                          padding: 0, overflow: 'hidden', cursor: 'pointer',
                          borderColor: isExpanded ? p.accent : undefined,
                        }}
                        onClick={() => setExpandedStyle(isExpanded ? null : style.id)}
                      >
                        <div style={{
                          height: 8,
                          background: `linear-gradient(90deg, ${p.primary}, ${p.accent} 50%, ${p.primary})`,
                        }} />
                        <div style={{ padding: 12 }}>
                          <h4 style={{ fontSize: 12, fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                            {style.name}
                          </h4>
                          <p style={{ fontSize: 10, color: 'var(--text-secondary)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                            {style.mood}
                          </p>
                          <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
                            {[p.primary, p.accent, p.background, p.text].filter(Boolean).map((c, i) => (
                              <div key={i} style={{
                                width: 16, height: 16, borderRadius: 3,
                                background: c,
                                border: c?.toLowerCase() === '#ffffff' || c?.toLowerCase() === '#fafaf8'
                                  ? '1px solid #ddd' : '1px solid transparent',
                              }} title={['主色', '强调', '背景', '文字'][i]} />
                            ))}
                          </div>
                          {isExpanded && (
                            <div style={{
                              marginTop: 10, padding: '10px',
                              background: 'var(--bg)', borderRadius: 6,
                              fontSize: 10, lineHeight: 1.8, color: 'var(--text-secondary)',
                            }}>
                              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>配色详情</div>
                              {Object.entries(p).filter(([, v]) => v).map(([k, v]) => (
                                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{
                                    display: 'inline-block', width: 12, height: 12, borderRadius: 2,
                                    background: v,
                                    border: v.toLowerCase() === '#ffffff' ? '1px solid #ddd' : '1px solid transparent',
                                  }} />
                                  <span style={{ color: 'var(--text)' }}>{k}</span>
                                  <span style={{ fontFamily: 'monospace' }}>{v}</span>
                                </div>
                              ))}
                              <div style={{ fontWeight: 600, color: 'var(--text)', margin: '6px 0 4px' }}>关键词</div>
                              <div>{style.keywords?.filter((k: string) => /^[a-zA-Z]/.test(k)).slice(0, 5).join(', ') || style.mood}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()
        )}
      </div>
    </div>
  )
}

export default TemplateManager
