import { useState, useEffect, useRef } from 'react'
import { api } from '../../services/api'
import { useModal } from '../../components/ModalProvider'
import { BookletDraft, Chapter, ContentProject, mdToHtml, newChapterId } from '../types'
import MdToolbar from './MdToolbar'

interface Props {
  draft: BookletDraft
  onChange: (updater: (d: BookletDraft) => BookletDraft) => void
  readonly?: boolean
}

export default function StepContent({ draft, onChange, readonly }: Props) {
  const { toast } = useModal()
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([])
  const [wsId, setWsId] = useState('')
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [projects, setProjects] = useState<ContentProject[]>([])
  const [loadingTree, setLoadingTree] = useState(false)
  const [addingKey, setAddingKey] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [customTitle, setCustomTitle] = useState('')
  const [customText, setCustomText] = useState('')
  const [customFormat, setCustomFormat] = useState<'md' | 'html'>('md')
  const customTaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    api.bookletAvailableContent(draft.book_type)
      .then(d => {
        const ws = d?.workspaces || []
        setWorkspaces(ws)
        if (ws.length > 0) setWsId((prev: string) => prev || ws[0].id)
      })
      .catch((e: any) => toast(`加载工作区失败: ${e?.message || e}`, 'error'))
  }, [])

  useEffect(() => {
    if (!wsId) return
    setLoadingTree(true)
    api.bookletAvailableContent(draft.book_type, wsId, categoryId || undefined)
      .then(d => {
        if (d?.projects != null) setProjects(d.projects)
        if (d?.categories != null) setCategories(d.categories)
      })
      .catch((e: any) => toast(`加载明细失败: ${e?.message || e}`, 'error'))
      .finally(() => setLoadingTree(false))
  }, [wsId, categoryId])

  const chapterKey = (projectId: string, sourceKey: string) => `${projectId}::${sourceKey}`
  const isAdded = (projectId: string, sourceKey: string) =>
    draft.chapters.some(c => c.project_id === projectId && c.source_key === sourceKey && c.source_type !== 'custom')

  const handleToggle = async (proj: ContentProject, item: { source_type: any; source_key: string; label: string }) => {
    if (isAdded(proj.id, item.source_key)) {
      onChange(d => ({
        ...d,
        chapters: d.chapters.filter(c => !(c.project_id === proj.id && c.source_key === item.source_key)),
      }))
      return
    }
    setAddingKey(chapterKey(proj.id, item.source_key))
    try {
      const r = await api.bookletContentItem(proj.id, item.source_type, item.source_key)
      if (r != null && r.content != null) {
        const isMd = r.content_format === 'md'
        const ch: Chapter = {
          id: newChapterId(),
          title: `${proj.name} · ${item.label}`,
          source_type: item.source_type,
          project_id: proj.id,
          project_name: proj.name,
          source_key: item.source_key,
          content: r.content,
          content_html: isMd ? mdToHtml(r.content) : r.content,
          content_format: isMd ? 'md' : 'html',
          enabled: true,
        }
        onChange(d => ({ ...d, chapters: [...d.chapters, ch] }))
      }
    } catch (e: any) {
      toast(`调取内容失败: ${e?.message || e}`, 'error')
    } finally {
      setAddingKey('')
    }
  }

  const resetCustom = () => {
    setShowCustom(false)
    setCustomTitle('')
    setCustomText('')
    setCustomFormat('md')
  }

  const handleAddCustom = async () => {
    if (!customTitle.trim()) { toast('请输入章节标题', 'error'); return }
    if (!customText.trim()) { toast('请输入章节内容', 'error'); return }
    try {
      const isHtml = customFormat === 'html'
      const ch: Chapter = {
        id: newChapterId(),
        title: customTitle.trim(),
        source_type: 'custom',
        project_id: '',
        project_name: '',
        source_key: '',
        content: customText,
        content_html: isHtml ? customText : mdToHtml(customText),
        content_format: customFormat,
        enabled: true,
      }
      onChange(d => ({ ...d, chapters: [...d.chapters, ch] }))
      resetCustom()
      toast('自建章节已加入', 'success')
    } catch (e: any) {
      toast(`加入失败: ${e?.message || e}`, 'error')
    }
  }

  const [importing, setImporting] = useState(false)

  const handleImportFile = async (file: File) => {
    const officeExt = /\.(docx?|xlsx)$/i.exec(file.name)?.[1]?.toLowerCase()
    try {
      if (officeExt) {
        setImporting(true)
        const r = await api.bookletImportFile(file)
        if (r != null && r.markdown) {
          setCustomFormat('md')
          setCustomText(r.markdown)
          if (!customTitle.trim()) setCustomTitle(file.name.replace(/\.(docx?|xlsx)$/i, ''))
          toast(`已导入 ${file.name}（已转换为可编辑文本）`, 'success')
        }
        return
      }
      const text = await file.text()
      if (text == null || !text.trim()) { toast('文件内容为空', 'error'); return }
      const isHtmlFile = /\.html?$/i.test(file.name)
      setCustomFormat(isHtmlFile ? 'html' : 'md')
      setCustomText(text)
      if (!customTitle.trim()) setCustomTitle(file.name.replace(/\.(md|txt|html?)$/i, ''))
      toast(isHtmlFile
        ? `已导入 ${file.name}（HTML 页面章节，下一步可在页面里点字修改）`
        : `已导入 ${file.name}`, 'success')
    } catch (e: any) {
      toast(`导入失败: ${e?.message || e}`, 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="panel-grid">
      <div className="panel-left" style={{ overflow: 'hidden' }}>
        <div className="card" style={{ flex: 1, minHeight: 120, display: 'flex', flexDirection: 'column' }}>
          <div className="card-title" style={{ flexShrink: 0 }}>📂 从工作区调取内容</div>
          <div className="card-hint" style={{ flexShrink: 0 }}>勾选要装进册子的内容，可跨明细、跨工作区多选。</div>
          <select className="form-input" value={wsId} onChange={e => { setWsId(e.target.value); setCategoryId('') }} style={{ flexShrink: 0 }} disabled={readonly}>
            {workspaces.length === 0 && <option value="">（无可用工作区）</option>}
            {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {categories.length > 0 && (
            <select className="form-input" value={categoryId} onChange={e => setCategoryId(e.target.value)}
              style={{ flexShrink: 0, marginTop: 6 }} disabled={readonly}>
              <option value="">全部分类</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <div style={{ marginTop: 10, flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {loadingTree ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: 10 }}>加载中...</div>
            ) : projects.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: 10 }}>该工作区暂无可调取的明细</div>
            ) : projects.map((p, idx) => {
                const availCount = p.items.filter(i => i.available).length
                const points = (p.point_cost || 0) / 10
                return (
              <div key={p.id} style={{ marginBottom: 8 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0, width: 18, textAlign: 'right', userSelect: 'none' }}>{idx + 1}</span>
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span title={p.name} style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 6 }}>
                      {[p.author, availCount > 0 ? `${availCount} 个文件` : ''].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  {points > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--warning)', flexShrink: 0 }}>{points.toFixed(1)} 积分</span>
                  )}
                </div>
                {p.items.map(item => {
                  const added = isAdded(p.id, item.source_key)
                  const busy = addingKey === chapterKey(p.id, item.source_key)
                  return (
                    <label key={item.source_type + item.source_key + item.label}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px 3px 24px',
                        fontSize: 12, cursor: readonly || !item.available ? 'not-allowed' : 'pointer',
                        opacity: item.available ? 1 : 0.45,
                      }}>
                      <input type="checkbox" checked={added} disabled={readonly || !item.available || busy}
                        onChange={() => handleToggle(p, item)} />
                      <span>{item.label}</span>
                      {busy && <span>⏳</span>}
                      {!item.available && <span style={{ fontSize: 10 }}>（尚未生成）</span>}
                    </label>
                  )
                })}
              </div>
            )})}
          </div>
        </div>

        {!readonly && (
          <div className="card" style={{ flexShrink: 0 }}>
            <div className="card-title">✍ 自己写一章</div>
            {!showCustom ? (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCustom(true)}>➕ 新增自建章节</button>
            ) : (
              <div>
                <input className="form-input" placeholder="章节标题" value={customTitle}
                  onChange={e => setCustomTitle(e.target.value)} />
                {customFormat === 'md' ? (
                  <div style={{ marginTop: 6 }}>
                    <MdToolbar textareaRef={customTaRef} value={customText} onChange={setCustomText} />
                    <textarea ref={customTaRef} className="form-input"
                      placeholder="输入或粘贴内容（支持 Markdown / 纯文本，用上方按钮插入格式）"
                      value={customText} onChange={e => setCustomText(e.target.value)}
                      style={{ height: 120, resize: 'none', fontFamily: 'inherit', width: '100%' }} />
                  </div>
                ) : (
                  <div className="card-hint" style={{ marginTop: 6, marginBottom: 0 }}>
                    已导入 HTML 页面章节（{customText.length} 字符）— 加入后可在第②步页面里点字修改。
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px' }}
                      onClick={() => { setCustomText(''); setCustomFormat('md') }}>清空重来</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: importing ? 'wait' : 'pointer', opacity: importing ? 0.6 : 1 }}>
                    {importing ? '⏳ 转换中...' : '📁 导入文件'}
                    <input type="file" accept=".md,.txt,.html,.htm,.doc,.docx,.xlsx" style={{ display: 'none' }} disabled={importing}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = '' }} />
                  </label>
                  <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>支持 md/txt/html/Word/Excel</span>
                  <span style={{ flex: 1 }} />
                  <button className="btn btn-ghost btn-sm" onClick={resetCustom}>取消</button>
                  <button className="btn btn-primary btn-sm" onClick={handleAddCustom}>加入册子</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="panel-right">
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="card-title">📖 已选内容（{draft.chapters.length} 章）</div>
          {draft.chapters.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: 20, textAlign: 'center' }}>
              左侧勾选内容或新增自建章节后，会显示在这里
            </div>
          ) : (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {draft.chapters.map((c, i) => (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                  borderBottom: '1px solid var(--border)', fontSize: 12,
                }}>
                  <span style={{ color: 'var(--text-secondary)', width: 24 }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ flex: 1 }}>{c.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {c.source_type === 'custom' ? (c.content_format === 'html' ? '自建·页面' : '自建') : c.source_type === 'step_md' ? '文档' : '课件'}
                    {' · '}{(c.content || '').length} 字符
                  </span>
                </div>
              ))}
            </div>
          )}
          {!readonly && (
            <div className="card-hint" style={{ marginTop: 8, marginBottom: 0, flexShrink: 0 }}>
              下一步可调整章节顺序、重命名和编辑内容。
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
