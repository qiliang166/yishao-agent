import { useState, useEffect } from 'react'
import { api } from '../services/api'
import { useModal } from '../components/ModalProvider'

interface Author {
  id: string
  name: string
  intro: string
  license_text: string
  created_at?: string
  updated_at?: string
}

export default function AuthorManagePage() {
  const modal = useModal()
  const [authors, setAuthors] = useState<Author[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formIntro, setFormIntro] = useState('')
  const [formLicense, setFormLicense] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const d = await api.listAuthors()
      setAuthors(((d as any)?.authors || []) as Author[])
    } catch (e: any) {
      modal.toast('加载失败: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditingId(null)
    setFormName('')
    setFormIntro('')
    setFormLicense('')
    setDialogOpen(true)
  }

  const openEdit = (a: Author) => {
    setEditingId(a.id)
    setFormName(a.name)
    setFormIntro(a.intro || '')
    setFormLicense(a.license_text || '')
    setDialogOpen(true)
  }

  const save = async () => {
    if (!formName.trim()) {
      modal.toast('请填写作者姓名', 'error')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await api.updateAuthor(editingId, { name: formName.trim(), intro: formIntro, license_text: formLicense })
      } else {
        const created = await api.createAuthor({ name: formName.trim(), intro: formIntro, license_text: formLicense })
        if (created == null) throw new Error('创建返回为空')
      }
      modal.toast('已保存', 'success')
      setDialogOpen(false)
      await load()
    } catch (e: any) {
      modal.toast('保存失败: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (a: Author) => {
    const ok = await modal.confirm(`确定删除作者「${a.name}」？引用该作者的明细将变为无署名。`)
    if (!ok) return
    try {
      await api.deleteAuthor(a.id)
      modal.toast('已删除', 'success')
      setAuthors(prev => prev.filter(x => x.id !== a.id))
    } catch (e: any) {
      modal.toast('删除失败: ' + e.message, 'error')
    }
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>作者管理</h1>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>+ 新建作者</button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text)', background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: 6, marginBottom: 16, lineHeight: 1.7 }}>
        作者库为全局共享。每篇明细可选择出处作者，会员在下载页看到署名，点击可查看作者简介与授权说明。
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>加载中...</div>
      ) : authors.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-secondary)', fontSize: 12 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✍</div>
          <p>暂无作者，点击右上角「新建作者」添加</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="output-table">
            <thead>
              <tr>
                <th style={{ width: 140 }}>姓名</th>
                <th>简介</th>
                <th style={{ width: 200 }}>授权说明</th>
                <th style={{ width: 130 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {authors.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxWidth: 300 }}>
                    {(a.intro || '—').length > 80 ? (a.intro || '').slice(0, 80) + '…' : (a.intro || '—')}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {(a.license_text || '—').length > 40 ? (a.license_text || '').slice(0, 40) + '…' : (a.license_text || '—')}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => openEdit(a)}>编辑</button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--warning)' }} onClick={() => remove(a)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialogOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => !saving && setDialogOpen(false)}>
          <div style={{
            background: 'var(--bg-primary)', borderRadius: 12, padding: 24, width: 480,
            maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px 0' }}>
              {editingId ? '编辑作者' : '新建作者'}
            </h2>
            <div className="form-group">
              <label className="form-label">姓名 *</label>
              <input className="form-input" type="text" value={formName} autoFocus
                onChange={e => setFormName(e.target.value)} placeholder="作者姓名" />
            </div>
            <div className="form-group">
              <label className="form-label">简介</label>
              <textarea className="form-input" rows={5} value={formIntro}
                onChange={e => setFormIntro(e.target.value)}
                placeholder="作者背景、专长、代表作等..."
                style={{ resize: 'vertical' }} />
            </div>
            <div className="form-group">
              <label className="form-label">授权说明</label>
              <textarea className="form-input" rows={5} value={formLicense}
                onChange={e => setFormLicense(e.target.value)}
                placeholder="内容授权范围、使用条款等..."
                style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" disabled={saving} onClick={() => setDialogOpen(false)}>取消</button>
              <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
