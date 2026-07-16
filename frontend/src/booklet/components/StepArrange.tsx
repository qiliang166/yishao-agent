import { useState, useRef, useEffect } from 'react'
import DOMPurify from 'dompurify'
import { api } from '../../services/api'
import { useModal } from '../../components/ModalProvider'
import { BookletDraft, mdToHtml } from '../types'

interface Props {
  draft: BookletDraft
  onChange: (updater: (d: BookletDraft) => BookletDraft) => void
}

export default function StepArrange({ draft, onChange }: Props) {
  const { confirm, prompt, toast } = useModal()
  const [selectedId, setSelectedId] = useState('')
  const [refreshingId, setRefreshingId] = useState('')
  const [htmlDirty, setHtmlDirty] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const selected = draft.chapters.find(c => c.id === selectedId) || null

  useEffect(() => {
    if (!selectedId && draft.chapters.length > 0) setSelectedId(draft.chapters[0].id)
  }, [draft.chapters.length])

  useEffect(() => { setHtmlDirty(false) }, [selectedId])

  const move = (idx: number, dir: -1 | 1) => {
    onChange(d => {
      const arr = [...d.chapters]
      const j = idx + dir
      if (j < 0 || j >= arr.length) return d
      ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
      return { ...d, chapters: arr }
    })
  }

  const handleRename = async (id: string, current: string) => {
    const name = await prompt('章节重命名', current)
    if (name == null || !name.trim()) return
    onChange(d => ({ ...d, chapters: d.chapters.map(c => c.id === id ? { ...c, title: name.trim() } : c) }))
  }

  const handleDelete = async (id: string, title: string) => {
    const ok = await confirm(`确定从册子中移除「${title}」？（不影响原明细内容）`)
    if (!ok) return
    onChange(d => ({ ...d, chapters: d.chapters.filter(c => c.id !== id) }))
    if (selectedId === id) setSelectedId('')
  }

  const handleRefresh = async (id: string) => {
    const ch = draft.chapters.find(c => c.id === id)
    if (!ch || ch.source_type === 'custom') return
    const ok = await confirm(`从源刷新会用「${ch.project_name}」的最新内容覆盖本章当前内容（包括你的编辑），确定？`)
    if (!ok) return
    setRefreshingId(id)
    try {
      const r = await api.bookletContentItem(ch.project_id, ch.source_type, ch.source_key)
      if (r != null && r.content != null) {
        const isMd = r.content_format === 'md'
        onChange(d => ({
          ...d,
          chapters: d.chapters.map(c => c.id === id
            ? { ...c, content: r.content, content_html: isMd ? mdToHtml(r.content) : r.content }
            : c),
        }))
        toast('已从源刷新', 'success')
      }
    } catch (e: any) {
      toast(`刷新失败: ${e?.message || e}`, 'error')
    } finally {
      setRefreshingId('')
    }
  }

  const handleEditText = (id: string, text: string) => {
    onChange(d => ({
      ...d,
      chapters: d.chapters.map(c => c.id === id
        ? { ...c, content: text, content_html: mdToHtml(text) }
        : c),
    }))
  }

  const handleSaveHtmlEdit = () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc || !selected) return
    try {
      const htmlOut = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
      onChange(d => ({
        ...d,
        chapters: d.chapters.map(c => c.id === selected.id
          ? { ...c, content: htmlOut, content_html: htmlOut }
          : c),
      }))
      setHtmlDirty(false)
      toast('课件文字修改已存入本章（原明细不变）', 'success')
    } catch (e: any) {
      toast(`保存修改失败: ${e?.message || e}`, 'error')
    }
  }

  return (
    <div className="panel-grid">
      <div className="panel-left">
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="card-title">🗂 章节顺序</div>
          <div className="card-hint">点击章节在右侧编辑；停用的章节保留在草稿中但不进产物。</div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {draft.chapters.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: 16, textAlign: 'center' }}>
                还没有章节 — 回到第①步选择内容
              </div>
            )}
            {draft.chapters.map((c, i) => (
              <div key={c.id}
                onClick={() => setSelectedId(c.id)}
                style={{
                  padding: '6px 8px', borderRadius: 5, marginBottom: 4, cursor: 'pointer', fontSize: 12,
                  border: `1px solid ${selectedId === c.id ? 'var(--primary)' : 'var(--border)'}`,
                  background: selectedId === c.id ? 'var(--bg-hover)' : 'transparent',
                  opacity: c.enabled ? 1 : 0.5,
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ flex: 1, textDecoration: c.enabled ? 'none' : 'line-through' }}>{c.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {c.source_type === 'custom' ? '自建' : c.source_type === 'step_md' ? '文档' : '课件'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 6px' }} title="上移"
                    disabled={i === 0} onClick={e => { e.stopPropagation(); move(i, -1) }}>↑</button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 6px' }} title="下移"
                    disabled={i === draft.chapters.length - 1} onClick={e => { e.stopPropagation(); move(i, 1) }}>↓</button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 6px' }}
                    onClick={e => { e.stopPropagation(); handleRename(c.id, c.title) }}>重命名</button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 6px' }}
                    onClick={e => {
                      e.stopPropagation()
                      onChange(d => ({ ...d, chapters: d.chapters.map(x => x.id === c.id ? { ...x, enabled: !x.enabled } : x) }))
                    }}>{c.enabled ? '停用' : '启用'}</button>
                  {c.source_type !== 'custom' && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 6px' }}
                      disabled={refreshingId === c.id}
                      onClick={e => { e.stopPropagation(); handleRefresh(c.id) }}>
                      {refreshingId === c.id ? '⏳' : '⟳ 从源刷新'}
                    </button>
                  )}
                  <span style={{ flex: 1 }} />
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 6px' }}
                    onClick={e => { e.stopPropagation(); handleDelete(c.id, c.title) }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel-right">
        {!selected ? (
          <div className="card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            左侧选择一个章节进行编辑
          </div>
        ) : selected.source_type === 'step_md' || selected.source_type === 'custom' ? (
          <>
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div className="card-title">✏️ 编辑「{selected.title}」<span style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-secondary)' }}>（编辑的是册子里的副本，不影响原明细）</span></div>
              <textarea className="form-input" value={selected.content}
                onChange={e => handleEditText(selected.id, e.target.value)}
                style={{ flex: 1, minHeight: 200, resize: 'none', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7 }} />
            </div>
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div className="card-title">👁 预览</div>
              <div style={{ flex: 1, overflowY: 'auto', fontSize: 13, lineHeight: 1.8, padding: '0 4px' }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.content_html) }} />
            </div>
          </>
        ) : (
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ flex: 1 }}>🖥 课件章节「{selected.title}」— 可直接点击页面内文字修改</span>
              {htmlDirty && <span style={{ fontSize: 10, color: 'var(--warning, #d97706)', marginRight: 8 }}>有未保存的修改</span>}
              <button className="btn btn-primary btn-sm" onClick={handleSaveHtmlEdit}>💾 保存文字修改</button>
            </div>
            <iframe ref={iframeRef} srcDoc={DOMPurify.sanitize(selected.content, { WHOLE_DOCUMENT: true })} title="chapter-edit"
              style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 5, background: '#fff', minHeight: 300 }}
              onLoad={() => {
                const doc = iframeRef.current?.contentDocument
                if (doc) {
                  try {
                    doc.designMode = 'on'
                    doc.addEventListener('input', () => setHtmlDirty(true))
                  } catch { /* 只读环境忽略 */ }
                }
              }} />
            <div className="card-hint" style={{ marginTop: 6, marginBottom: 0 }}>
              仅支持文字级修改；改动只存入本册子的副本，「⟳ 从源刷新」可还原为明细最新内容。
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
