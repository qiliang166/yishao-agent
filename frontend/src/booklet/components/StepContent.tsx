import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { useModal } from '../../components/ModalProvider'
import { BookletDraft, Chapter, ContentProject, mdToHtml, newChapterId } from '../types'

interface Props {
  draft: BookletDraft
  onChange: (updater: (d: BookletDraft) => BookletDraft) => void
}

export default function StepContent({ draft, onChange }: Props) {
  const { toast } = useModal()
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([])
  const [wsId, setWsId] = useState('')
  const [projects, setProjects] = useState<ContentProject[]>([])
  const [loadingTree, setLoadingTree] = useState(false)
  const [addingKey, setAddingKey] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [customTitle, setCustomTitle] = useState('')
  const [customText, setCustomText] = useState('')

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
    api.bookletAvailableContent(draft.book_type, wsId)
      .then(d => { if (d?.projects != null) setProjects(d.projects) })
      .catch((e: any) => toast(`加载明细失败: ${e?.message || e}`, 'error'))
      .finally(() => setLoadingTree(false))
  }, [wsId])

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

  const handleAddCustom = async () => {
    if (!customTitle.trim()) { toast('请输入章节标题', 'error'); return }
    if (!customText.trim()) { toast('请输入章节内容', 'error'); return }
    try {
      const ch: Chapter = {
        id: newChapterId(),
        title: customTitle.trim(),
        source_type: 'custom',
        project_id: '',
        project_name: '',
        source_key: '',
        content: customText,
        content_html: mdToHtml(customText),
        enabled: true,
      }
      onChange(d => ({ ...d, chapters: [...d.chapters, ch] }))
      setShowCustom(false)
      setCustomTitle('')
      setCustomText('')
      toast('自建章节已加入', 'success')
    } catch (e: any) {
      toast(`加入失败: ${e?.message || e}`, 'error')
    }
  }

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text()
      if (text == null || !text.trim()) { toast('文件内容为空', 'error'); return }
      setCustomText(text)
      if (!customTitle.trim()) setCustomTitle(file.name.replace(/\.(md|txt|html?)$/i, ''))
      toast(`已导入 ${file.name}`, 'success')
    } catch (e: any) {
      toast(`导入失败: ${e?.message || e}`, 'error')
    }
  }

  return (
    <div className="panel-grid">
      <div className="panel-left">
        <div className="card">
          <div className="card-title">📂 从工作区调取内容</div>
          <div className="card-hint">勾选要装进册子的内容，可跨明细、跨工作区多选。</div>
          <select className="form-input" value={wsId} onChange={e => setWsId(e.target.value)}>
            {workspaces.length === 0 && <option value="">（无可用工作区）</option>}
            {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div style={{ marginTop: 10, maxHeight: 380, overflowY: 'auto' }}>
            {loadingTree ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: 10 }}>加载中...</div>
            ) : projects.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: 10 }}>该工作区暂无可调取的明细</div>
            ) : projects.map(p => (
              <div key={p.id} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>📋 {p.name}</div>
                {p.items.map(item => {
                  const added = isAdded(p.id, item.source_key)
                  const busy = addingKey === chapterKey(p.id, item.source_key)
                  return (
                    <label key={item.source_type + item.source_key + item.label}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px 3px 16px',
                        fontSize: 12, cursor: item.available ? 'pointer' : 'not-allowed',
                        opacity: item.available ? 1 : 0.45,
                      }}>
                      <input type="checkbox" checked={added} disabled={!item.available || busy}
                        onChange={() => handleToggle(p, item)} />
                      <span>{item.label}</span>
                      {busy && <span>⏳</span>}
                      {!item.available && <span style={{ fontSize: 10 }}>（尚未生成）</span>}
                    </label>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">✍ 自己写一章</div>
          {!showCustom ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowCustom(true)}>➕ 新增自建章节</button>
          ) : (
            <div>
              <input className="form-input" placeholder="章节标题" value={customTitle}
                onChange={e => setCustomTitle(e.target.value)} />
              <textarea className="form-input" placeholder="输入或粘贴内容（支持 Markdown / 纯文本）"
                value={customText} onChange={e => setCustomText(e.target.value)}
                style={{ marginTop: 6, height: 140, resize: 'vertical', fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                  📁 导入文件
                  <input type="file" accept=".md,.txt,.html,.htm" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = '' }} />
                </label>
                <span style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-sm" onClick={() => setShowCustom(false)}>取消</button>
                <button className="btn btn-primary btn-sm" onClick={handleAddCustom}>加入册子</button>
              </div>
            </div>
          )}
        </div>
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
                    {c.source_type === 'custom' ? '自建' : c.source_type === 'step_md' ? '文档' : '课件'}
                    {' · '}{(c.content || '').length} 字符
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="card-hint" style={{ marginTop: 8, marginBottom: 0 }}>
            下一步可调整章节顺序、重命名和编辑内容。
          </div>
        </div>
      </div>
    </div>
  )
}
