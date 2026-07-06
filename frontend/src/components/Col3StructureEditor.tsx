import { useState, useEffect } from 'react'

// ── Types ──

interface Dimension {
  label: string
  desc: string
}

interface PageDef {
  id: string
  type: PageType
  heading: string
  dimensions?: Dimension[]   // content / chart / diagram
  columns?: string[]         // table / flowchart
  titleFormat?: string       // cover
  subtitle?: string          // cover — 副标题模板
  description?: string       // cover — 内容简述
  metaFields?: string[]      // cover
}

type PageType = 'cover' | 'toc' | 'content' | 'table' | 'chart' | 'diagram' | 'flowchart' | 'closing'

const PAGE_TYPES: { type: PageType; label: string; hint: string }[] = [
  { type: 'cover', label: '封面', hint: '标题 / 副标题 / 基础信息 / 内容简述' },
  { type: 'toc', label: '目录', hint: '内容导航与章节概览' },
  { type: 'content', label: '内容页', hint: '通用自由内容，多维度属性描述' },
  { type: 'table', label: '表格', hint: '多列结构化数据表格' },
  { type: 'chart', label: '图表', hint: '数据图表、统计可视化' },
  { type: 'diagram', label: '图示', hint: '示意图、结构图、插图说明' },
  { type: 'flowchart', label: '流程', hint: '操作流程、步骤顺序' },
  { type: 'closing', label: '尾页', hint: '文档结尾、总结、版权信息' },
]

const PAGE_LABEL_MAP: Record<PageType, string> = Object.fromEntries(
  PAGE_TYPES.map(t => [t.type, t.label])
) as Record<PageType, string>

const PAGE_HINT_MAP: Record<PageType, string> = Object.fromEntries(
  PAGE_TYPES.map(t => [t.type, t.hint])
) as Record<PageType, string>

// Old → new type migration
const TYPE_MIGRATE: Record<string, PageType> = {
  definition: 'content',
  quality: 'content',
  steps: 'flowchart',
}

let _pageCounter = 0
function newPageId() { return `p${++_pageCounter}_${Date.now()}` }

function emptyPage(type: PageType): PageDef {
  const base: PageDef = { id: newPageId(), type, heading: PAGE_LABEL_MAP[type] }
  if (type === 'content' || type === 'chart' || type === 'diagram') {
    base.dimensions = [{ label: '', desc: '' }]
  } else if (type === 'table' || type === 'flowchart') {
    base.columns = ['']
  } else if (type === 'cover') {
    base.titleFormat = ''
    base.subtitle = ''
    base.description = ''
    base.metaFields = ['']
  }
  return base
}

// ── Helpers ──

function _dimChange(dims: Dimension[], idx: number, field: 'label' | 'desc', val: string): Dimension[] {
  return dims.map((d, i) => (i === idx ? { ...d, [field]: val } : d))
}

function _strArrChange(arr: string[], idx: number, val: string): string[] {
  return arr.map((s, i) => (i === idx ? val : s))
}

// ── Component ──

interface Props {
  initialSkill: string
  onSaved: (skill: string) => void
}

export default function Col3StructureEditor({ initialSkill, onSaved }: Props) {
  const [pages, setPages] = useState<PageDef[]>(() => parseSkill(initialSkill))

  // Auto-sync skill JSON to parent on every change
  useEffect(() => {
    onSaved(buildSkill())
  }, [pages])

  function parseSkill(skill: string): PageDef[] {
    try {
      const raw = JSON.parse(skill)
      const arr = Array.isArray(raw) ? raw : (raw.slides || [])
      return arr.map((p: any, i: number) => {
        let t = (p.page_type || 'content') as PageType
        if (TYPE_MIGRATE[t]) t = TYPE_MIGRATE[t]
        const def: PageDef = { id: newPageId(), type: t, heading: p.heading || `第${i + 1}页` }
        if (t === 'content' || t === 'chart' || t === 'diagram') {
          const kps: string[] = p.key_points || []
          def.dimensions = kps.map((k: string) => ({ label: k, desc: '' }))
          if (def.dimensions.length === 0) def.dimensions = [{ label: '', desc: '' }]
        } else if (t === 'table' || t === 'flowchart') {
          def.columns = (p.key_points || []).length > 0 ? p.key_points : ['']
        } else if (t === 'cover') {
          def.metaFields = (p.key_points || []).length > 0 ? p.key_points : ['']
          def.titleFormat = p.title_format || ''
          def.subtitle = p.subtitle || ''
          def.description = p.description || ''
        }
        return def
      })
    } catch {
      return [emptyPage('cover'), emptyPage('toc'), emptyPage('content'), emptyPage('table'), emptyPage('flowchart'), emptyPage('closing')]
    }
  }

  function buildSkill(): string {
    const slides = pages.map((p, i) => {
      const s: any = { seq: i + 1, heading: p.heading, page_type: p.type }
      if (p.type === 'content' || p.type === 'chart' || p.type === 'diagram') {
        s.key_points = (p.dimensions || []).filter(d => d.label.trim()).map(d => d.label.trim())
      } else if (p.type === 'table' || p.type === 'flowchart') {
        s.key_points = (p.columns || []).filter(c => c.trim()).map(c => c.trim())
      } else if (p.type === 'cover') {
        s.key_points = (p.metaFields || []).filter(f => f.trim()).map(f => f.trim())
        if (p.titleFormat) s.title_format = p.titleFormat
        if (p.subtitle) s.subtitle = p.subtitle
        if (p.description) s.description = p.description
      }
      return s
    })
    return JSON.stringify(slides, null, 2)
  }

  // ── Page mutations ──
  const addPage = (type: PageType) => setPages(prev => [...prev, emptyPage(type)])
  const removePage = (id: string) => setPages(prev => prev.filter(p => p.id !== id))
  const movePage = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= pages.length) return
    setPages(prev => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }
  const setPageType = (id: string, type: PageType) => {
    setPages(prev => prev.map(p => {
      if (p.id !== id) return p
      const fresh = emptyPage(type)
      return { ...fresh, id: p.id, heading: p.heading }
    }))
  }
  const setHeading = (id: string, v: string) => setPages(prev => prev.map(p => p.id === id ? { ...p, heading: v } : p))

  const addDim = (id: string) => setPages(prev => prev.map(p =>
    p.id === id ? { ...p, dimensions: [...(p.dimensions || []), { label: '', desc: '' }] } : p))
  const setDim = (id: string, idx: number, field: 'label' | 'desc', v: string) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, dimensions: _dimChange(p.dimensions || [], idx, field, v) } : p))
  const removeDim = (id: string, idx: number) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, dimensions: (p.dimensions || []).filter((_, i) => i !== idx) } : p))

  const addCol = (id: string) => setPages(prev => prev.map(p =>
    p.id === id ? { ...p, columns: [...(p.columns || []), ''] } : p))
  const setCol = (id: string, idx: number, v: string) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, columns: _strArrChange(p.columns || [], idx, v) } : p))
  const removeCol = (id: string, idx: number) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, columns: (p.columns || []).filter((_, i) => i !== idx) } : p))

  // ── Styles matching other settings UI ──
  const pageNumStyle: React.CSSProperties = { fontWeight: 600, fontSize: 11, minWidth: 36, color: 'var(--text-secondary)' }
  const inputStyle: React.CSSProperties = { fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)' }
  const selectStyle: React.CSSProperties = { fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)' }
  const btnStyle: React.CSSProperties = { fontSize: 10, padding: '2px 6px', borderRadius: 3 }
  const dimLabelStyle: React.CSSProperties = { fontSize: 10, minWidth: 30, color: 'var(--text-secondary)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="form-label" style={{ margin: 0 }}>
        文档结构编辑器 — 可视化编排页面结构，自动生成输出 SKILL
      </div>

      {pages.map((p, idx) => (
        <div key={p.id} style={{
          border: '1px solid var(--border)', borderRadius: 4,
          padding: '8px 10px', background: 'var(--bg-secondary)',
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={pageNumStyle}>第{idx + 1}页</span>
            <select value={p.type} onChange={e => setPageType(p.id, e.target.value as PageType)} style={selectStyle}>
              {PAGE_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
            <input value={p.heading} onChange={e => setHeading(p.id, e.target.value)}
              placeholder="页面标题" style={{ ...inputStyle, flex: 1 }} />
            <button onClick={() => movePage(idx, -1)} disabled={idx === 0} style={btnStyle} title="上移">↑</button>
            <button onClick={() => movePage(idx, 1)} disabled={idx === pages.length - 1} style={btnStyle} title="下移">↓</button>
            <button onClick={() => removePage(p.id)}
              style={{ ...btnStyle, color: 'var(--danger)', border: '1px solid var(--danger)', background: 'transparent' }}>
              删除
            </button>
          </div>

          <div className="form-hint" style={{ marginBottom: 4 }}>{PAGE_HINT_MAP[p.type]}</div>

          {/* content / chart / diagram: dimension list */}
          {(p.type === 'content' || p.type === 'chart' || p.type === 'diagram') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {(p.dimensions || []).map((d, di) => (
                <div key={di} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={dimLabelStyle}>维度{di + 1}</span>
                  <input value={d.label} onChange={e => setDim(p.id, di, 'label', e.target.value)}
                    placeholder="标签（如：正式名称）" style={{ ...inputStyle, flex: 1 }} />
                  <input value={d.desc} onChange={e => setDim(p.id, di, 'desc', e.target.value)}
                    placeholder="说明（可选）" style={{ ...inputStyle, flex: 2 }} />
                  <button onClick={() => removeDim(p.id, di)}
                    style={{ fontSize: 11, padding: '1px 4px', color: 'var(--danger)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    ×
                  </button>
                </div>
              ))}
              <button onClick={() => addDim(p.id)}
                style={{ fontSize: 10, padding: '2px 6px', alignSelf: 'flex-start', marginTop: 2 }}>
                + 添加维度
              </button>
            </div>
          )}

          {/* table / flowchart: column list */}
          {(p.type === 'table' || p.type === 'flowchart') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {(p.columns || []).map((c, ci) => (
                <div key={ci} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={dimLabelStyle}>列{ci + 1}</span>
                  <input value={c} onChange={e => setCol(p.id, ci, e.target.value)}
                    placeholder="列名（如：条款编号）" style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={() => removeCol(p.id, ci)}
                    style={{ fontSize: 11, padding: '1px 4px', color: 'var(--danger)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    ×
                  </button>
                </div>
              ))}
              <button onClick={() => addCol(p.id)}
                style={{ fontSize: 10, padding: '2px 6px', alignSelf: 'flex-start', marginTop: 2 }}>
                + 添加列
              </button>
            </div>
          )}

          {/* cover: 4-part structure — 标题 / 副标题 / 基础信息 / 内容简述 */}
          {p.type === 'cover' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* 1. 标题格式 */}
              <div>
                <div className="form-hint" style={{ marginBottom: 2 }}>标题格式</div>
                <input value={p.titleFormat || ''}
                  onChange={e => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, titleFormat: e.target.value } : pp))}
                  placeholder="标题模板（如：{菜名} — 标准作业文档）" style={{ ...inputStyle, width: '100%' }} />
              </div>

              {/* 2. 副标题 */}
              <div>
                <div className="form-hint" style={{ marginBottom: 2 }}>副标题</div>
                <input value={p.subtitle || ''}
                  onChange={e => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, subtitle: e.target.value } : pp))}
                  placeholder="副标题模板（如：{工艺特征} 的精要解析）" style={{ ...inputStyle, width: '100%' }} />
              </div>

              {/* 3. 基础信息 */}
              <div>
                <div className="form-hint" style={{ marginBottom: 2 }}>基础信息</div>
                {(p.metaFields || []).map((f, fi) => (
                  <div key={fi} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
                    <span style={dimLabelStyle}>标签{fi + 1}</span>
                    <input value={f}
                      onChange={e => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, metaFields: _strArrChange(pp.metaFields || [], fi, e.target.value) } : pp))}
                      placeholder="信息标签（如：版本说明）" style={{ ...inputStyle, flex: 1 }} />
                    <button
                      onClick={() => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, metaFields: (pp.metaFields || []).filter((_, i) => i !== fi) } : pp))}
                      style={{ fontSize: 11, padding: '1px 4px', color: 'var(--danger)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                      ×
                    </button>
                  </div>
                ))}
                <button onClick={() => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, metaFields: [...(pp.metaFields || []), ''] } : pp))}
                  style={{ fontSize: 10, padding: '2px 6px', alignSelf: 'flex-start', marginTop: 2 }}>
                  + 添加标签
                </button>
              </div>

              {/* 4. 内容简述 */}
              <div>
                <div className="form-hint" style={{ marginBottom: 2 }}>内容简述</div>
                <textarea value={p.description || ''}
                  onChange={e => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, description: e.target.value } : pp))}
                  placeholder="内容简述模板或空（AI 自动从正文提炼）"
                  rows={2}
                  style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
              </div>
            </div>
          )}

          {/* toc / closing: no extra config */}
          {(p.type === 'toc' || p.type === 'closing') && (
            <div className="form-hint">此页面类型仅需标题，无需额外配置字段。</div>
          )}
        </div>
      ))}

      {/* Add page row */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {PAGE_TYPES.map(t => (
          <button key={t.type} onClick={() => addPage(t.type)}
            style={{ fontSize: 10, padding: '3px 8px' }}>
            + {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
