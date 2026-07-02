import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../services/api'
import { useModal } from '../components/ModalProvider'

type Tab = 'general' | 'columns' | 'core'

const COLUMN_GROUPS = [
  { id: 'col1', label: '素材输入', hasTemplate: false, summary: '输入配置' },
  { id: 'col2', label: '文档生成', hasTemplate: false, summary: '文档配置' },
  { id: 'col3', label: '文档课件', hasTemplate: true, summary: '导出配置' },
  { id: 'col4', label: '分析PPT', hasTemplate: true, summary: '分析文档 | PPT配置' },
  { id: 'col5', label: '综合PPT', hasTemplate: true, summary: '综合文档 | PPT配置' },
  { id: 'col6', label: '课件演讲', hasTemplate: false, summary: '演讲配置' },
  { id: 'col7', label: '语音合成', hasTemplate: false, summary: '角色提示词 | SKILL' },
]

interface ColumnConfig { id: string; column_id: string; label: string; prompt: string; skill: string; has_template: number; template_path: string | null; sort_order: number; rules?: string }
interface SpeechConfig { id: string; label: string; prompt: string; skill: string; sort_order: number }
interface CorePromptConfig { id: string; prompt_key: string; category: string; label: string; content: string; sort_order: number }

const CORE_CATEGORIES = [
  { key: '', label: '全部' },
  { key: 'root', label: '根级别' },
  { key: 'always', label: '通用规则' },
  { key: 'by_type', label: '按类型' },
  { key: 'by_feature', label: '按功能' },
  { key: 'by_layout', label: '按布局' },
]

export default function WorkspaceSettingsPage() {
  const { wid } = useParams<{ wid: string }>()
  const modal = useModal()
  const [tab, setTab] = useState<Tab>('general')

  // Workspace info
  const [wsName, setWsName] = useState('')
  const [wsStatus, setWsStatus] = useState('draft')
  const [wsDesc, setWsDesc] = useState('')
  const [wsLogo, setWsLogo] = useState('')
  const [wsLogoUploading, setWsLogoUploading] = useState(false)
  const [wsSaving, setWsSaving] = useState(false)

  // Column configs
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([])
  const [colValues, setColValues] = useState<Record<string, { prompt: string; skill: string; rules?: string }>>({})
  const [colSaving, setColSaving] = useState<Record<string, boolean>>({})
  const [openCols, setOpenCols] = useState<Set<string>>(new Set())

  // Speech configs (col6)
  const [speechConfigs, setSpeechConfigs] = useState<SpeechConfig[]>([])
  const [speechValues, setSpeechValues] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [speechSaving, setSpeechSaving] = useState<Record<string, boolean>>({})

  // TTS configs (col7)
  const [ttsConfigs, setTtsConfigs] = useState<SpeechConfig[]>([])
  const [ttsValues, setTtsValues] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [ttsSaving, setTtsSaving] = useState<Record<string, boolean>>({})

  // Core prompt configs
  const [coreConfigs, setCoreConfigs] = useState<CorePromptConfig[]>([])
  const [coreCategory, setCoreCategory] = useState('')
  const [corePage, setCorePage] = useState(1)
  const corePageSize = 30
  const [coreValues, setCoreValues] = useState<Record<string, string>>({})
  const [coreSaving, setCoreSaving] = useState<Record<string, boolean>>({})
  const [editingCoreId, setEditingCoreId] = useState<string | null>(null)

  // Loading
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadAll = async () => {
    if (!wid) return
    setLoading(true)
    try {
      // Load workspace info
      const ws: any = await api.getWorkspace(wid)
      setWsName(ws.name || '')
      setWsStatus(ws.status || 'draft')
      setWsDesc(ws.description || '')
      setWsLogo(ws.logo || '')

      // Try loading workspace configs; if empty, copy from seed
      let cc = await api.listColumnConfigs(wid)
      if (!cc || cc.length === 0) {
        await api.copySeedConfigs(wid)
        cc = await api.listColumnConfigs(wid)
      }
      setColumnConfigs(cc as ColumnConfig[])
      const cv: Record<string, { prompt: string; skill: string; rules?: string }> = {}
      ;(cc as ColumnConfig[]).forEach(c => { cv[c.id] = { prompt: c.prompt, skill: c.skill, rules: c.rules } })
      setColValues(cv)

      let sc = await api.listSpeechConfigs(wid)
      if (!sc || sc.length === 0) {
        sc = await api.listSpeechConfigs(wid)
      }
      setSpeechConfigs(sc as SpeechConfig[])
      const sv: Record<string, { prompt: string; skill: string }> = {}
      ;(sc as SpeechConfig[]).forEach(c => { sv[c.id] = { prompt: c.prompt, skill: c.skill } })
      setSpeechValues(sv)

      let tc = await api.listTtsConfigs(wid)
      if (!tc || tc.length === 0) {
        tc = await api.listTtsConfigs(wid)
      }
      setTtsConfigs(tc as SpeechConfig[])
      const tv: Record<string, { prompt: string; skill: string }> = {}
      ;(tc as SpeechConfig[]).forEach(c => { tv[c.id] = { prompt: c.prompt, skill: c.skill } })
      setTtsValues(tv)

      let cpc = await api.listCorePromptConfigs(wid)
      if (!cpc || cpc.length === 0) {
        cpc = await api.listCorePromptConfigs(wid)
      }
      setCoreConfigs(cpc as CorePromptConfig[])
      const cpcv: Record<string, string> = {}
      ;(cpc as CorePromptConfig[]).forEach(c => { cpcv[c.id] = c.content || '' })
      setCoreValues(cpcv)

      setError('')
    } catch (e: any) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [wid])

  const saveWorkspace = async () => {
    if (!wid || !wsName.trim()) return
    setWsSaving(true)
    try {
      await api.updateWorkspace(wid, { name: wsName.trim(), status: wsStatus, description: wsDesc.trim(), logo: wsLogo.trim() })
      modal.toast('已保存', 'success')
    } catch (e: any) {
      modal.toast('保存失败: ' + e.message, 'error')
    } finally { setWsSaving(false) }
  }

  const toggleCol = (id: string) => {
    setOpenCols(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const filteredCoreConfigs = coreCategory
    ? coreConfigs.filter(c => c.category === coreCategory)
    : coreConfigs

  const coreTotalPages = Math.ceil(filteredCoreConfigs.length / corePageSize)
  const coreStart = (corePage - 1) * corePageSize
  const corePageItems = filteredCoreConfigs.slice(coreStart, coreStart + corePageSize)

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>加载中...</div>
  }

  if (error) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--warning)' }}>加载失败: {error}</div>
  }

  return (
    <div>
      <div className="mgmt-tabs">
        <button className={`mgmt-tab${tab === 'general' ? ' active' : ''}`}
          onClick={() => setTab('general')}>项目设置</button>
        <button className={`mgmt-tab${tab === 'columns' ? ' active' : ''}`}
          onClick={() => setTab('columns')}>栏目配置</button>
        <button className={`mgmt-tab${tab === 'core' ? ' active' : ''}`}
          onClick={() => setTab('core')}>核心配置</button>
      </div>

      <div className="mgmt-content">

        {/* ═══ Tab: 项目设置 ═══ */}
        {tab === 'general' && (
          <div style={{ maxWidth: 500 }}>
            <div className="form-group">
              <label className="form-label">项目名称</label>
              <input className="form-input" type="text" value={wsName}
                onChange={e => setWsName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">项目图标</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {wsLogo ? (
                  <>
                    <img src={wsLogo} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }} alt="" />
                    <button className="btn btn-ghost btn-sm" onClick={() => setWsLogo('')}>移除</button>
                  </>
                ) : (
                  <span style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: 'var(--text-secondary)' }}>🖼</span>
                )}
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                  {wsLogoUploading ? '上传中...' : '上传图片'}
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={async e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setWsLogoUploading(true)
                      try {
                        const form = new FormData()
                        form.append('file', file)
                        const res = await fetch('/api/upload/logo', { method: 'POST', body: form })
                        if (!res.ok) throw new Error((await res.json()).detail || '上传失败')
                        const data = await res.json()
                        setWsLogo(data.url)
                      } catch (err: any) {
                        modal.toast('上传失败: ' + err.message, 'error')
                      } finally {
                        setWsLogoUploading(false)
                      }
                    }} />
                </label>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">项目简介</label>
              <textarea className="form-input" rows={4} value={wsDesc}
                onChange={e => setWsDesc(e.target.value)}
                placeholder="简要描述该项目的用途和内容..."
                style={{ resize: 'vertical' }} />
            </div>
            <div className="form-group">
              <label className="form-label">状态</label>
              <select className="form-input" value={wsStatus}
                onChange={e => setWsStatus(e.target.value)}>
                <option value="draft">草稿</option>
                <option value="completed">已完成</option>
              </select>
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveWorkspace} disabled={wsSaving}>
              {wsSaving ? '保存中...' : '保存'}
            </button>
          </div>
        )}

        {/* ═══ Tab: 栏目配置 ═══ */}
        {tab === 'columns' && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text)', background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: 6, marginBottom: 12, lineHeight: 1.7 }}>
              栏目配置定义了<strong>7 个工作阶段</strong>的提示词模板：素材输入 → 文档生成 → 文档课件 → 分析PPT → 综合PPT → 课件演讲 → 语音合成。每个阶段可独立配置角色提示词和输出格式（SKILL），修改仅影响当前项目。
            </div>

            {COLUMN_GROUPS.map(col => (
              <div key={col.id} className={`ac-group${openCols.has(col.id) ? ' open' : ''}`}>
                <div className="ac-head" onClick={() => toggleCol(col.id)}>
                  <span className={`ac-num${!col.hasTemplate ? ' no-tmpl' : ''}`}>{col.id.slice(-1)}</span>
                  <span className="ac-title">{col.label}</span>
                  <span className="ac-summary">{col.summary}</span>
                  <span className="ac-arrow">▼</span>
                </div>
                <div className="ac-body">
                  {col.id === 'col7' ? (
                    <>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        为三种语音合成场景分别配置角色提示词和输出格式。提示词定义角色口吻和风格，SKILL 定义输出格式模板。
                      </div>
                      {ttsConfigs.map(config => (
                        <div key={config.id} className="ac-sub-item">
                          <div className="ac-sub-item-header">{config.label} — 语音合成角色</div>
                          <div className="ac-field-row">
                            <div className="ac-field">
                              <label>角色提示词</label>
                              <textarea
                                value={ttsValues[config.id]?.prompt || ''}
                                onChange={e => setTtsValues(prev => ({ ...prev, [config.id]: { ...prev[config.id], prompt: e.target.value } }))}
                              />
                            </div>
                            <div className="ac-field">
                              <label>SKILL 输出格式</label>
                              <textarea
                                value={ttsValues[config.id]?.skill || ''}
                                onChange={e => setTtsValues(prev => ({ ...prev, [config.id]: { ...prev[config.id], skill: e.target.value } }))}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                            <button className="btn btn-primary btn-sm" disabled={ttsSaving[config.id]}
                              onClick={async () => {
                                setTtsSaving(prev => ({ ...prev, [config.id]: true }))
                                try {
                                  await api.updateTtsConfig(config.id, { prompt: ttsValues[config.id]?.prompt || '', skill: ttsValues[config.id]?.skill || '' })
                                  modal.toast('已保存', 'success')
                                } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                                finally { setTtsSaving(prev => ({ ...prev, [config.id]: false })) }
                              }}>
                              {ttsSaving[config.id] ? '保存中...' : '保存'}
                            </button>
                          </div>
                        </div>
                      ))}
                      {ttsConfigs.length === 0 && (
                        <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 8 }}>加载中...</div>
                      )}
                    </>
                  ) : col.id === 'col6' ? (
                    <>
                      {speechConfigs.map(config => (
                        <div key={config.id} className="ac-sub-item">
                          <div className="ac-sub-item-header">{config.label}</div>
                          <div className="ac-field-row">
                            <div className="ac-field">
                              <label>提示词</label>
                              <textarea
                                value={speechValues[config.id]?.prompt || ''}
                                onChange={e => setSpeechValues(prev => ({ ...prev, [config.id]: { ...prev[config.id], prompt: e.target.value } }))}
                              />
                            </div>
                            <div className="ac-field">
                              <label>SKILL 输出格式</label>
                              <textarea
                                value={speechValues[config.id]?.skill || ''}
                                onChange={e => setSpeechValues(prev => ({ ...prev, [config.id]: { ...prev[config.id], skill: e.target.value } }))}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                            <button className="btn btn-primary btn-sm" disabled={speechSaving[config.id]}
                              onClick={async () => {
                                setSpeechSaving(prev => ({ ...prev, [config.id]: true }))
                                try {
                                  await api.updateSpeechConfig(config.id, { prompt: speechValues[config.id]?.prompt || '', skill: speechValues[config.id]?.skill || '' })
                                  modal.toast('已保存', 'success')
                                } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                                finally { setSpeechSaving(prev => ({ ...prev, [config.id]: false })) }
                              }}>
                              {speechSaving[config.id] ? '保存中...' : '保存'}
                            </button>
                          </div>
                        </div>
                      ))}
                      {speechConfigs.length === 0 && (
                        <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 8 }}>加载中...</div>
                      )}
                    </>
                  ) : (<>
                    {columnConfigs.filter(c => c.column_id === col.id).map(config => (
                      <div key={config.id} className="ac-sub-item">
                        <div className="ac-sub-item-header">{config.label}</div>
                        <div className="ac-field-row">
                          <div className="ac-field">
                            <label>提示词</label>
                            <textarea
                              value={colValues[config.id]?.prompt || ''}
                              onChange={e => setColValues(prev => ({ ...prev, [config.id]: { ...prev[config.id], prompt: e.target.value } }))}
                            />
                          </div>
                          <div className="ac-field">
                            <label>SKILL 输出格式</label>
                            <textarea
                              value={colValues[config.id]?.skill || ''}
                              onChange={e => setColValues(prev => ({ ...prev, [config.id]: { ...prev[config.id], skill: e.target.value } }))}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                          <button className="btn btn-primary btn-sm" disabled={colSaving[config.id]}
                            onClick={async () => {
                              setColSaving(prev => ({ ...prev, [config.id]: true }))
                              try {
                                await api.updateColumnConfig(config.id, { prompt: colValues[config.id]?.prompt || '', skill: colValues[config.id]?.skill || '' })
                                modal.toast('已保存', 'success')
                              } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                              finally { setColSaving(prev => ({ ...prev, [config.id]: false })) }
                            }}>
                            {colSaving[config.id] ? '保存中...' : '保存'}
                          </button>
                        </div>
                      </div>
                    ))}
                    {columnConfigs.filter(c => c.column_id === col.id).length === 0 && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 8 }}>无配置项</div>
                    )}
                  </>)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ Tab: 核心配置 ═══ */}
        {tab === 'core' && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text)', background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: 6, marginBottom: 12, lineHeight: 1.7 }}>
              核心配置是 PPT 生成流程中的<strong>底层提示词变量</strong>，按类别组织（根级别、通用规则、按类型、按功能、按布局）。修改仅影响当前项目，不影响其他项目的提示词。
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {CORE_CATEGORIES.map(cat => (
                <button key={cat.key}
                  className={`btn btn-sm ${coreCategory === cat.key ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => { setCoreCategory(cat.key); setCorePage(1) }}>
                  {cat.label}
                </button>
              ))}
            </div>
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {corePageItems.map(config => (
                        <div key={config.id} style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', cursor: 'pointer',
                            background: editingCoreId === config.id ? 'var(--bg-secondary)' : 'transparent' }}
                            onClick={() => setEditingCoreId(editingCoreId === config.id ? null : config.id)}>
                            <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>
                              <span style={{ fontSize: 9, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 3, marginRight: 8 }}>
                                {config.category}
                              </span>
                              {config.label}
                            </span>
                            <span style={{ fontSize: 9, color: 'var(--text-secondary)', marginRight: 8 }}>
                              {config.content ? `${(config.content.length / 1024).toFixed(1)}KB` : '空'}
                            </span>
                            <span style={{ fontSize: 10, color: editingCoreId === config.id ? 'var(--text-secondary)' : 'var(--primary)' }}>
                              {editingCoreId === config.id ? '收起' : '编辑'}
                            </span>
                          </div>
                          {editingCoreId === config.id && (
                            <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
                              <textarea
                                value={coreValues[config.id] || ''}
                                onChange={e => setCoreValues(prev => ({ ...prev, [config.id]: e.target.value }))}
                                style={{ width: '100%', minHeight: 200, fontFamily: 'monospace', fontSize: 11 }}
                              />
                              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditingCoreId(null)}>取消</button>
                                <button className="btn btn-primary btn-sm" disabled={coreSaving[config.id]}
                                  onClick={async () => {
                                    setCoreSaving(prev => ({ ...prev, [config.id]: true }))
                                    try {
                                      await api.updateCorePromptConfig(config.id, { content: coreValues[config.id] || '' })
                                      modal.toast('已保存', 'success')
                                    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                                    finally { setCoreSaving(prev => ({ ...prev, [config.id]: false })) }
                                  }}>
                                  {coreSaving[config.id] ? '保存中...' : '保存'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {filteredCoreConfigs.length === 0 && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 12, textAlign: 'center' }}>加载中...</div>
                    )}
                    {coreTotalPages > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '8px 10px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)' }}>
                        <button className="btn btn-ghost btn-sm" disabled={corePage <= 1} onClick={() => setCorePage(p => p - 1)}>上一页</button>
                        <span>第 {corePage} / {coreTotalPages} 页（共 {filteredCoreConfigs.length} 条）</span>
                        <button className="btn btn-ghost btn-sm" disabled={corePage >= coreTotalPages} onClick={() => setCorePage(p => p + 1)}>下一页</button>
                      </div>
                    )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
