import { useState, useEffect } from 'react'

// ── Types ──

interface Dimension {
  label: string
  desc: string
}

interface Chapter {
  label: string
  example: string
}

interface ColumnDef {
  name: string
  desc: string
}

interface PageDef {
  id: string
  type: PageType
  heading: string
  dimensions?: Dimension[]   // content / chart / diagram
  columns?: ColumnDef[]      // table / flowchart
  bodyRule?: string          // table / flowchart — body fill instruction
  titleFormat?: string       // cover
  subtitle?: string          // cover
  description?: string       // cover
  metaFields?: string[]      // cover — key_point labels
  metaExamples?: string[]    // cover — hints/examples for each metaField
  chapters?: Chapter[]       // toc — chapter entries
}

type PageType = 'cover' | 'toc' | 'content' | 'table' | 'chart' | 'diagram' | 'flowchart' | 'closing'

const PAGE_TYPES: { type: PageType; label: string; hint: string }[] = [
  { type: 'cover', label: '封面', hint: '标题 / 副标题 / 基础信息 / 内容简述' },
  { type: 'toc', label: '目录', hint: '章节条目列表，带标签和说明引导 LLM 填空' },
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
    base.columns = [{ name: '', desc: '' }]
    base.bodyRule = ''
  } else if (type === 'cover') {
    base.titleFormat = ''
    base.subtitle = ''
    base.description = ''
    base.metaFields = ['']
    base.metaExamples = ['']
  } else if (type === 'toc') {
    base.chapters = [{ label: '', example: '' }]
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

function _chapterChange(chapters: Chapter[], idx: number, field: 'label' | 'example', val: string): Chapter[] {
  return chapters.map((c, i) => (i === idx ? { ...c, [field]: val } : c))
}

// ── Component ──

interface Props {
  initialSkill: string
  onSaved: (skill: string) => void
}

export default function Col3StructureEditor({ initialSkill, onSaved }: Props) {
  const [pages, setPages] = useState<PageDef[]>(() => parseSkill(initialSkill))

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
          const kps: string[] = p.key_points || []
          const exs: string[] = p.examples || []
          def.columns = kps.map((k: string, i: number) => ({ name: k, desc: exs[i] || '' }))
          if (def.columns.length === 0) def.columns = [{ name: '', desc: '' }]
          def.bodyRule = p.body_rule || ''
        } else if (t === 'cover') {
          def.metaFields = (p.key_points || []).length > 0 ? p.key_points : ['']
          def.metaExamples = p.examples || []
          while (def.metaExamples!.length < def.metaFields!.length) def.metaExamples!.push('')
          if (def.metaExamples!.length > def.metaFields!.length) def.metaExamples = def.metaExamples!.slice(0, def.metaFields!.length)
          def.titleFormat = p.title_format || ''
          def.subtitle = p.subtitle || ''
          def.description = p.description || ''
        } else if (t === 'toc') {
          const chapters = p.chapters || []
          if (chapters.length > 0) {
            def.chapters = chapters.map((ch: any) => ({
              label: ch.label || '',
              example: ch.example || ''
            }))
          } else {
            def.chapters = [{ label: '', example: '' }]
          }
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
        s.key_points = (p.columns || []).filter(c => c.name.trim()).map(c => c.name.trim())
        const colExamples = (p.columns || []).map(c => c.desc.trim()).filter(d => d !== '')
        if (colExamples.length > 0) s.examples = colExamples
        if (p.bodyRule && p.bodyRule.trim()) s.body_rule = p.bodyRule.trim()
      } else if (p.type === 'cover') {
        s.key_points = (p.metaFields || []).filter(f => f.trim()).map(f => f.trim())
        const examples = (p.metaExamples || []).map(e => e.trim()).filter(e => e !== '')
        if (examples.length > 0) s.examples = examples
        if (p.titleFormat) s.title_format = p.titleFormat
        if (p.subtitle) s.subtitle = p.subtitle
        if (p.description) s.description = p.description
      } else if (p.type === 'toc') {
        const chapters = (p.chapters || []).filter(c => c.label.trim()).map(c => ({
          label: c.label.trim(),
          example: (c.example || '').trim()
        }))
        if (chapters.length > 0) s.chapters = chapters
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
    p.id === id ? { ...p, columns: [...(p.columns || []), { name: '', desc: '' }] } : p))
  const setColName = (id: string, idx: number, v: string) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, columns: (p.columns || []).map((c, i) => i === idx ? { ...c, name: v } : c) } : p))
  const setColDesc = (id: string, idx: number, v: string) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, columns: (p.columns || []).map((c, i) => i === idx ? { ...c, desc: v } : c) } : p))
  const removeCol = (id: string, idx: number) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, columns: (p.columns || []).filter((_, i) => i !== idx) } : p))

  const addChapter = (id: string) => setPages(prev => prev.map(p =>
    p.id === id ? { ...p, chapters: [...(p.chapters || []), { label: '', example: '' }] } : p))
  const setChapter = (id: string, idx: number, field: 'label' | 'example', v: string) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, chapters: _chapterChange(p.chapters || [], idx, field, v) } : p))
  const removeChapter = (id: string, idx: number) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, chapters: (p.chapters || []).filter((_, i) => i !== idx) } : p))

  // ── Styles ──
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
                  <input value={c.name} onChange={e => setColName(p.id, ci, e.target.value)}
                    placeholder="列名（如：食材名称）" style={{ ...inputStyle, flex: 1 }} />
                  <input value={c.desc} onChange={e => setColDesc(p.id, ci, e.target.value)}
                    placeholder="说明（可选，如：食材的具体名称，不可使用类别统称）" style={{ ...inputStyle, flex: 2 }} />
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
              <div style={{ marginTop: 6 }}>
                <div className="form-hint" style={{ marginBottom: 2 }}>body 填充规则（控制内容生成行为，如逐行保留/归纳总结）</div>
                <input
                  value={p.bodyRule || ''}
                  onChange={e => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, bodyRule: e.target.value } : pp))}
                  placeholder={p.type === 'table' ? '如：逐行完整保留，各单元格用 | 分隔，每条记录独占一行，禁止归纳合并' : '如：按步骤逐一列出，每步一行，保留原文所有细节，禁止归纳合并'}
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>
            </div>
          )}

          {/* cover: 标题 / 副标题 / 基础信息(标签+说明) / 内容简述 */}
          {p.type === 'cover' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div className="form-hint" style={{ marginBottom: 2 }}>标题格式</div>
                <input value={p.titleFormat || ''}
                  onChange={e => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, titleFormat: e.target.value } : pp))}
                  placeholder="标题模板（如：{菜名} — 标准作业文档）" style={{ ...inputStyle, width: '100%' }} />
              </div>

              <div>
                <div className="form-hint" style={{ marginBottom: 2 }}>副标题</div>
                <input value={p.subtitle || ''}
                  onChange={e => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, subtitle: e.target.value } : pp))}
                  placeholder="副标题模板（如：{工艺特征} 的精要解析）" style={{ ...inputStyle, width: '100%' }} />
              </div>

              <div>
                <div className="form-hint" style={{ marginBottom: 2 }}>基础信息</div>
                {(p.metaFields || []).map((f, fi) => (
                  <div key={fi} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
                    <span style={dimLabelStyle}>标签{fi + 1}</span>
                    <input value={f}
                      onChange={e => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, metaFields: _strArrChange(pp.metaFields || [], fi, e.target.value) } : pp))}
                      placeholder="标签（如：版本说明）" style={{ ...inputStyle, flex: 1 }} />
                    <input value={(p.metaExamples || [])[fi] || ''}
                      onChange={e => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, metaExamples: _strArrChange(pp.metaExamples || [], fi, e.target.value) } : pp))}
                      placeholder="说明（可选）" style={{ ...inputStyle, flex: 2 }} />
                    <button
                      onClick={() => setPages(prev => prev.map(pp => pp.id === p.id ? {
                        ...pp,
                        metaFields: (pp.metaFields || []).filter((_, i) => i !== fi),
                        metaExamples: (pp.metaExamples || []).filter((_, i) => i !== fi)
                      } : pp))}
                      style={{ fontSize: 11, padding: '1px 4px', color: 'var(--danger)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                      ×
                    </button>
                  </div>
                ))}
                <button onClick={() => setPages(prev => prev.map(pp => pp.id === p.id ? {
                  ...pp,
                  metaFields: [...(pp.metaFields || []), ''],
                  metaExamples: [...(pp.metaExamples || []), '']
                } : pp))}
                  style={{ fontSize: 10, padding: '2px 6px', alignSelf: 'flex-start', marginTop: 2 }}>
                  + 添加标签
                </button>
              </div>

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

          {/* toc: 章节条目列表 */}
          {p.type === 'toc' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {(p.chapters || []).map((c, ci) => (
                <div key={ci} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={dimLabelStyle}>章节{ci + 1}</span>
                  <input value={c.label}
                    onChange={e => setChapter(p.id, ci, 'label', e.target.value)}
                    placeholder="章节标题（如：原料准备与预处理）" style={{ ...inputStyle, flex: 1 }} />
                  <input value={c.example || ''}
                    onChange={e => setChapter(p.id, ci, 'example', e.target.value)}
                    placeholder="说明（可选，如：食材采购、验收与储存流程）" style={{ ...inputStyle, flex: 2 }} />
                  <button onClick={() => removeChapter(p.id, ci)}
                    style={{ fontSize: 11, padding: '1px 4px', color: 'var(--danger)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    ×
                  </button>
                </div>
              ))}
              <button onClick={() => addChapter(p.id)}
                style={{ fontSize: 10, padding: '2px 6px', alignSelf: 'flex-start', marginTop: 2 }}>
                + 添加章节
              </button>
            </div>
          )}

          {p.type === 'closing' && (
            <div className="form-hint">此页面类型仅需标题，无需额外配置字段。</div>
          )}
        </div>
      ))}

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
