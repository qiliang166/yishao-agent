import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { api } from '../services/api'
import { useModal } from '../components/ModalProvider'
import { BookletDraft, BOOK_TYPE_LABEL, normalizeChapters } from './types'
import StepContent from './components/StepContent'
import StepArrange from './components/StepArrange'
import StepCover from './components/StepCover'
import StepFinish from './components/StepFinish'

const STEPS = [
  { id: 1, label: '选内容' },
  { id: 2, label: '排序与编辑' },
  { id: 3, label: '封面署名' },
  { id: 4, label: '预览合成' },
]

export default function BookletEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useModal()
  const base = location.pathname.startsWith('/app') ? '/app/booklets' : '/booklets'

  const [draft, setDraft] = useState<BookletDraft | null>(null)
  const [step, setStep] = useState(1)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!id) return
    api.getBooklet(id)
      .then(b => {
        if (b != null) {
          setDraft({
            id: b.id, book_type: b.book_type, title: b.title,
            subtitle: b.subtitle || '', author: b.author || '',
            cover: b.cover || {}, chapters: b.chapters || [],
          })
        }
      })
      .catch((e: any) => setLoadError(e?.message || String(e)))
  }, [id])

  // 未保存离开提示（浏览器级）
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const onChange = (updater: (d: BookletDraft) => BookletDraft) => {
    setDraft(d => (d ? updater(d) : d))
    setDirty(true)
  }

  const handleSave = async (): Promise<boolean> => {
    if (!draft) return false
    setSaving(true)
    try {
      // md 章节一律从原文重算渲染快照，不信任存量（旧草稿保存一次即自愈）
      const chapters = normalizeChapters(draft.chapters)
      const r = await api.updateBooklet(draft.id, {
        title: draft.title || '未命名册子',
        subtitle: draft.subtitle,
        author: draft.author,
        cover: draft.cover,
        chapters,
      })
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

  const handleBack = async () => {
    if (dirty) {
      const saved = await handleSave()
      if (!saved) return
    }
    navigate(base)
  }

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* 顶部：标题栏 + 步骤导航（与明细页生成流程同款视觉） */}
      <div className="proj-header-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
        <button className="btn btn-ghost btn-sm" onClick={handleBack}>← 返回</button>
        <span style={{ fontSize: 14, fontWeight: 600 }}>📚 {draft.title || '未命名册子'}</span>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{BOOK_TYPE_LABEL[draft.book_type]}</span>
        <span style={{ flex: 1 }} />
        {dirty && <span style={{ fontSize: 10, color: 'var(--warning, #d97706)' }}>● 未保存</span>}
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleSave}>
          {saving ? '保存中...' : '💾 保存草稿'}
        </button>
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

      {/* 步骤内容区 */}
      <div style={{ flex: 1, minHeight: 0, padding: 14, display: 'flex', flexDirection: 'column' }}>
        {step === 1 && <StepContent draft={draft} onChange={onChange} />}
        {step === 2 && <StepArrange draft={draft} onChange={onChange} />}
        {step === 3 && <StepCover draft={draft} onChange={onChange} />}
        {step === 4 && <StepFinish draft={draft} dirty={dirty} onSave={handleSave} onChange={onChange} />}
      </div>

      {/* 底部：上一步/下一步 */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
        <button className="btn btn-ghost btn-sm" disabled={step === 1} onClick={() => setStep(step - 1)}>← 上一步</button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" disabled={step === 4} onClick={() => setStep(step + 1)}>下一步 →</button>
      </div>
    </div>
  )
}
