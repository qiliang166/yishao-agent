import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import SvgIcon from '../components/SvgIcon'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useModal } from '../components/ModalProvider'
import { BookletDraft, BOOK_TYPE_LABEL, normalizeChapters } from './types'
import StepContent from './components/StepContent'
import StepArrange from './components/StepArrange'
import StepCover from './components/StepCover'
import StepPages from './components/StepPages'
import StepFinish from './components/StepFinish'

const STEPS = [
  { id: 1, label: '选内容' },
  { id: 2, label: '排序与编辑' },
  { id: 3, label: '封面署名' },
  { id: 4, label: '页面编排' },
  { id: 5, label: '预览合成' },
]

export default function BookletEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useModal()
  const { user } = useAuth()
  const isAdmin = user?.user_type === 'admin'
  const canEditAll = user?.permissions?.includes('project.edit_all') ?? false
  const userId = user?.user_id || ''
  const base = location.pathname.startsWith('/app') ? '/app/booklets' : '/booklets'

  const [draft, setDraft] = useState<BookletDraft | null>(null)
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState(() => {
    const s = parseInt(searchParams.get('step') || '1', 10)
    return (s >= 1 && s <= 5) ? s : 1
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [cloning, setCloning] = useState(false)

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) return
    api.getBooklet(id)
      .then(b => {
        if (b != null) {
          setDraft({
            id: b.id, book_type: b.book_type, title: b.title,
            subtitle: b.subtitle || '', author: b.author || '',
            cover: b.cover || {}, chapters: b.chapters || [],
            is_recommended: b.is_recommended || false,
            owner_id: b.owner_id || '',
          })
        }
      })
      .catch((e: any) => setLoadError(e?.message || String(e)))
  }, [id])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [editingTitle])

  const onChange = (updater: (d: BookletDraft) => BookletDraft) => {
    setDraft(d => (d ? updater(d) : d))
    setDirty(true)
  }

  const handleSave = async (): Promise<boolean> => {
    if (!draft) return false
    setSaving(true)
    try {
      const chapters = normalizeChapters(draft.chapters)
      const payload: any = {
        title: draft.title || '未命名册子',
        subtitle: draft.subtitle,
        author: draft.author,
        cover: draft.cover,
        chapters,
      }
      if (isAdmin) payload.is_recommended = draft.is_recommended
      const r = await api.updateBooklet(draft.id, payload)
      if (r != null) {
        setDraft(d => (d ? { ...d, chapters } : d))
        setDirty(false)
        toast('草稿已保存', 'success')
        return true
      }
      return false
    } catch (e: any) {
      toast(`保存失败: ${e?.message || e}`, 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleClone = async () => {
    if (!draft) return
    setCloning(true)
    try {
      const cloned = await api.cloneBooklet(draft.id)
      if (cloned != null && cloned.id) {
        toast('已引用到我的册子', 'success')
        navigate(`${base}/${cloned.id}`)
      }
    } catch (e: any) {
      toast(`引用失败: ${e?.message || e}`, 'error')
    } finally {
      setCloning(false)
    }
  }

  const handleBack = async () => {
    if (dirty) {
      const saved = await handleSave()
      if (!saved) return
    }
    navigate(base)
  }

  const startRename = () => {
    if (!draft) return
    setTitleInput(draft.title || '')
    setEditingTitle(true)
  }

  const commitRename = () => {
    const trimmed = titleInput.trim()
    if (trimmed && draft && trimmed !== draft.title) {
      onChange(d => ({ ...d, title: trimmed }))
    }
    setEditingTitle(false)
  }

  const cancelRename = () => {
    setEditingTitle(false)
  }

  const isOwnerView = !draft || draft.owner_id === userId || canEditAll
  const isReadonly = !isOwnerView
  const showUseRecommend = isReadonly

  if (loadError) {
    return (
      <div style={{ padding: 30, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--danger, #dc2626)', marginBottom: 12 }}>加载失败：{loadError}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(base)}>← 返回册子列表</button>
      </div>
    )
  }
  if (!draft) {
    return <div style={{ padding: 30, color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center' }}>加载中...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* 顶部：标题栏 + 步骤导航 */}
      <div className="proj-header-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
        <button className="btn btn-ghost btn-sm" onClick={handleBack}>← 返回</button>
        {editingTitle ? (
          <input
            ref={titleInputRef}
            className="form-input"
            value={titleInput}
            onChange={e => setTitleInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') cancelRename()
            }}
            onBlur={commitRename}
            style={{ fontSize: 14, fontWeight: 600, padding: '2px 6px', width: 200 }}
          />
        ) : (
          <span
            style={{ fontSize: 14, fontWeight: 600, ...(isOwnerView ? { cursor: 'pointer' } : {}) }}
            onClick={isOwnerView ? startRename : undefined}
            title={isOwnerView ? '点击重命名' : undefined}
          ><SvgIcon name="book-open" size={14} /> {draft.title || '未命名册子'}</span>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{BOOK_TYPE_LABEL[draft.book_type]}</span>
        <span style={{ flex: 1 }} />
        {!isReadonly && dirty && <span style={{ fontSize: 10, color: 'var(--warning, #d97706)' }}>● 未保存</span>}
        {isAdmin && isOwnerView && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', marginRight: 8 }}>
            <input type="checkbox" checked={!!draft.is_recommended}
              onChange={e => onChange(d => ({ ...d, is_recommended: e.target.checked }))} />
            <SvgIcon name="star" size={14} /> 推荐
          </label>
        )}
        {showUseRecommend && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={cloning} onClick={handleClone}
            style={{ fontSize: 11 }}>
            {cloning ? '引用中...' : '引用为我的副本'}
          </button>
        )}
        {isOwnerView && (
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleSave}>
            {saving ? '保存中...' : <><SvgIcon name="download" size={14} /> 保存草稿</>}
          </button>
        )}
      </div>

      <div className="top-nav">
        {STEPS.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && <span className="tn-arrow">›</span>}
            <div className={`tn-item ${step === s.id ? 'active' : ''} ${step > s.id ? 'done' : ''}`}
              onClick={() => setStep(s.id)}>
              <span className="tn-num">{s.id}</span> {s.label}
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {step === 1 && <StepContent draft={draft} onChange={onChange} readonly={isReadonly} />}
        {step === 2 && <StepArrange draft={draft} onChange={onChange} readonly={isReadonly} />}
        {step === 3 && <StepCover draft={draft} onChange={onChange} readonly={isReadonly} />}
        {step === 4 && <StepPages draft={draft} dirty={dirty} onSave={handleSave} onChange={onChange} readonly={isReadonly} />}
        {step === 5 && <StepFinish draft={draft} dirty={dirty} onSave={handleSave} onChange={onChange} readonly={isReadonly} />}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
        <button className="btn btn-ghost btn-sm" disabled={step === 1} onClick={() => setStep(step - 1)}>← 上一步</button>
        <span style={{ flex: 1 }} />
        {step < STEPS.length && (
          <button className="btn btn-primary btn-sm" onClick={() => setStep(step + 1)}>下一步 →</button>
        )}
      </div>
    </div>
  )
}
