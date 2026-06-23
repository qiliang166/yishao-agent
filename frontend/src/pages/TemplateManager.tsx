import { useState, useEffect, useCallback, useRef } from 'react'
import { api, Prompt } from '../services/api'
import { useModal } from '../components/ModalProvider'

// ---------- types ----------

interface Template {
  id: string
  name: string
  type: string
  file_path: string
  prompt: string
  skill: string
  linked_skill_id: string
  branding_config: string
  is_default: number
  created_at: string
}

const TABS = [
  { key: 'ppt', label: 'PPT模板' },
  { key: 'sop', label: 'SOP模板' },
]

// ---------- shared inline style factories ----------

const btnPrimary: React.CSSProperties = {
  background: 'var(--primary)',
  color: '#fff',
  border: 'none',
  padding: '8px 16px',
  borderRadius: 'var(--radius-sm)',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const btnSecondary: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  padding: '6px 14px',
  borderRadius: 'var(--radius-sm)',
  fontSize: '13px',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const btnDanger: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  padding: '6px 14px',
  borderRadius: 'var(--radius-sm)',
  fontSize: '13px',
  color: 'var(--primary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const inputField: React.CSSProperties = {
  width: '100%',
  height: '36px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '0 10px',
  fontSize: '14px',
  fontFamily: 'inherit',
  color: 'var(--text)',
  background: 'var(--card)',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text)',
  display: 'block',
  marginBottom: '6px',
}

const card: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '16px',
}

// ---------- component ----------

function TemplateManager() {
  const modal = useModal()
  // ---------- state ----------
  const [templates, setTemplates] = useState<Template[]>([])
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [activeTab, setActiveTab] = useState('ppt')
  const [loading, setLoading] = useState(true)

  // create / edit modal
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('ppt')
  const [formPrompt, setFormPrompt] = useState('')
  const [formSkill, setFormSkill] = useState('')
  const [formSkillId, setFormSkillId] = useState('')
  const [formBrandingConfig, setFormBrandingConfig] = useState('{}')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)

  // ---------- data loading ----------

  const loadTemplates = useCallback(async () => {
    try {
      const data = await api.listTemplates()
      setTemplates(data)
    } catch (err: any) {
      console.error('Failed to load templates:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPrompts = useCallback(async () => {
    try {
      const data = await api.listPrompts()
      setPrompts(data)
    } catch (err: any) {
      console.error('Failed to load prompts:', err)
    }
  }, [])

  useEffect(() => { loadTemplates() }, [loadTemplates])
  useEffect(() => { loadPrompts() }, [loadPrompts])

  // ---------- derived ----------

  const filteredTemplates = templates.filter(t => t.type === activeTab)

  // Resolve linked skill name
  const getSkillName = (skillId: string): string => {
    if (!skillId) return ''
    const p = prompts.find(pp => pp.id === skillId)
    return p ? p.name : skillId
  }

  // ---------- modal handlers ----------

  const openCreate = () => {
    setEditingId(null)
    setFormName('')
    setFormType(activeTab)
    setFormPrompt('')
    setFormSkill('')
    setFormSkillId('')
    setFormBrandingConfig('{}')
    setFormError('')
    setShowModal(true)
  }

  const openEdit = (t: Template) => {
    setEditingId(t.id)
    setFormName(t.name)
    setFormType(t.type)
    setFormPrompt(t.prompt || '')
    setFormSkill(t.skill || '')
    setFormSkillId(t.linked_skill_id || '')
    setFormBrandingConfig(t.branding_config || '{}')
    setFormError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      setFormError('请输入模板名称')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = {
        name: formName.trim(),
        type: formType,
        prompt: formPrompt,
        skill: formSkill,
        linked_skill_id: formSkillId,
        branding_config: formBrandingConfig,
      }
      if (editingId) {
        await api.updateTemplate(editingId, payload)
      } else {
        await api.createTemplate(payload)
      }
      await loadTemplates()
      setShowModal(false)
    } catch (err: any) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (t: Template) => {
    const ok = await modal.confirm(`确认删除模板「${t.name}」？此操作不可撤销。`)
    if (!ok) return
    try {
      await api.deleteTemplate(t.id)
      await loadTemplates()
    } catch (err: any) {
      modal.toast('删除失败: ' + err.message, 'error')
    }
  }

  const handleSetDefault = async (t: Template) => {
    try {
      await api.setDefaultTemplate(t.id)
      await loadTemplates()
    } catch (err: any) {
      modal.toast('设置默认失败: ' + err.message, 'error')
    }
  }

  const handleFileUpload = async (t: Template, file: File) => {
    try {
      await api.uploadTemplateFile(t.id, file)
      await loadTemplates()
      modal.toast('模板文件上传成功', 'success')
    } catch (err: any) {
      modal.toast('上传失败: ' + err.message, 'error')
    }
  }

  const handleAnalyze = async (t: Template) => {
    setAnalyzingId(t.id)
    try {
      const result = await api.analyzeTemplate(t.id)
      await loadTemplates()
      modal.toast('智能解析完成！prompt 和 SKILL 已自动填入', 'success')
    } catch (err: any) {
      modal.toast('解析失败: ' + err.message, 'error')
    } finally {
      setAnalyzingId(null)
    }
  }

  // ---------- render ----------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', gap: 0 }}>

      {/* ====== Top Toolbar ====== */}
      <div style={{
        display: 'flex', gap: '10px', alignItems: 'center',
        paddingBottom: '16px', borderBottom: '1px solid var(--border)',
        marginBottom: '0', flexShrink: 0,
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginRight: 'auto' }}>模板管理</h2>
        <button style={btnPrimary} onClick={openCreate}>+ 新建模板</button>
      </div>

      {/* ====== Tabs ====== */}
      <div style={{
        display: 'flex', gap: '0', paddingTop: '16px', paddingBottom: '16px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
              padding: '8px 20px',
              fontSize: '14px',
              fontWeight: activeTab === tab.key ? 700 : 400,
              color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ====== Template Cards Grid ====== */}
      <div style={{
        flex: 1, overflowY: 'auto', paddingTop: '20px',
      }}>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', padding: '40px 0' }}>
            加载中...
          </p>
        ) : filteredTemplates.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            color: 'var(--text-secondary)', fontSize: '14px',
          }}>
            <p style={{ marginBottom: '16px' }}>暂无{activeTab === 'ppt' ? 'PPT' : 'SOP'}模板</p>
            <button style={btnPrimary} onClick={openCreate}>+ 新建模板</button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
          }}>
            {filteredTemplates.map(t => (
              <div
                key={t.id}
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* Header row: name + badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{
                    fontSize: '15px', fontWeight: 700, color: 'var(--text)',
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}>
                    {t.name}
                  </h3>
                  <span style={{
                    fontSize: '11px', fontWeight: 600,
                    color: t.type === 'ppt' ? 'var(--primary)' : 'var(--color-accent)',
                    background: t.type === 'ppt' ? 'rgba(139, 26, 26, 0.08)' : 'rgba(212, 165, 116, 0.15)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                  }}>
                    {t.type === 'ppt' ? 'PPT' : 'SOP'}
                  </span>
                  {t.is_default === 1 && (
                    <span style={{
                      fontSize: '11px', fontWeight: 600,
                      color: 'var(--success)',
                      background: 'rgba(74, 139, 63, 0.1)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                    }}>
                      默认
                    </span>
                  )}
                </div>

                {/* File status */}
                <div style={{ fontSize: '12px', color: t.file_path ? 'var(--success)' : 'var(--text-secondary)' }}>
                  {t.file_path ? '📌 已上传模板文件' : '📄 未上传模板文件'}
                </div>

                {/* Linked skill */}
                {t.linked_skill_id && (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <span style={{ fontWeight: 600 }}>关联Skill: </span>
                    {getSkillName(t.linked_skill_id)}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{
                  display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '10px',
                  borderTop: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center',
                }}>
                  {/* File upload */}
                  <label style={{
                    background: 'none',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 12px',
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'inline-block',
                  }}>
                    {t.file_path ? '更换文件' : '上传PPTX'}
                    <input type="file" accept=".pptx" style={{ display: 'none' }}
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) handleFileUpload(t, f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  {t.file_path && (
                    <button
                      style={{
                        background: 'var(--primary)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      onClick={() => handleAnalyze(t)}
                      disabled={analyzingId === t.id}
                    >
                      {analyzingId === t.id ? '解析中...' : '智能解析'}
                    </button>
                  )}
                  {t.is_default !== 1 && (
                    <button
                      style={{
                        background: 'none',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '4px 12px',
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleSetDefault(t)}
                    >
                      设为默认
                    </button>
                  )}
                  <button
                    style={{
                      background: 'none',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px 12px',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                    onClick={() => openEdit(t)}
                  >
                    编辑
                  </button>
                  <button
                    style={{
                      ...btnDanger,
                      padding: '4px 12px',
                      fontSize: '12px',
                    }}
                    onClick={() => handleDelete(t)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ====== Create / Edit Modal ====== */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{ ...card, width: '480px', maxWidth: '90vw', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>
              {editingId ? '编辑模板' : '新建模板'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Name */}
              <div>
                <label style={labelStyle}>名称</label>
                <input
                  style={inputField}
                  placeholder="输入模板名称"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                  autoFocus
                />
              </div>

              {/* Type */}
              <div>
                <label style={labelStyle}>类型</label>
                <select
                  style={{ ...inputField, cursor: 'pointer' }}
                  value={formType}
                  onChange={e => setFormType(e.target.value)}
                >
                  <option value="ppt">PPT</option>
                  <option value="sop">SOP</option>
                </select>
              </div>

              {/* Prompt */}
              <div>
                <label style={labelStyle}>提示词 (Prompt)</label>
                <textarea
                  value={formPrompt}
                  onChange={e => setFormPrompt(e.target.value)}
                  placeholder="输入AI提示词，选择此模板时将使用此提示词生成内容"
                  style={{
                    width: '100%',
                    height: '80px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    color: 'var(--text)',
                    background: 'var(--card)',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* SKILL */}
              <div>
                <label style={labelStyle}>输出格式 (SKILL)</label>
                <textarea
                  value={formSkill}
                  onChange={e => setFormSkill(e.target.value)}
                  placeholder="输入SKILL模板，定义AI输出的格式结构"
                  style={{
                    width: '100%',
                    height: '100px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px',
                    fontSize: '13px',
                    fontFamily: 'var(--mono)',
                    color: 'var(--text)',
                    background: 'var(--card)',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* Linked Skill */}
              <div>
                <label style={labelStyle}>关联Skill</label>
                <select
                  style={{ ...inputField, cursor: 'pointer' }}
                  value={formSkillId}
                  onChange={e => setFormSkillId(e.target.value)}
                >
                  <option value="">（无）</option>
                  {prompts
                    .filter(p => {
                      if (formType === 'ppt') return p.category === 'PPT Skill'
                      if (formType === 'sop') return p.category === 'SOP'
                      return false
                    })
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
              </div>

              {/* Branding Config */}
              <div>
                <label style={labelStyle}>品牌配置</label>
                <textarea
                  value={formBrandingConfig}
                  onChange={e => setFormBrandingConfig(e.target.value)}
                  placeholder='{"logo_position": "top-right", "copyright_placeholder": "", "signature_placeholder": ""}'
                  style={{
                    width: '100%',
                    height: '80px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px',
                    fontSize: '13px',
                    fontFamily: 'var(--mono)',
                    color: 'var(--text)',
                    background: 'var(--card)',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    lineHeight: 1.5,
                  }}
                />
              </div>
            </div>

            {formError && (
              <p style={{ color: 'var(--warning)', fontSize: '13px', marginTop: '12px' }}>{formError}</p>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button style={btnSecondary} onClick={() => setShowModal(false)} disabled={saving}>取消</button>
              <button style={btnPrimary} onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TemplateManager
