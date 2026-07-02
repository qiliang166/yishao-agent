import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../services/api'
import { useModal } from '../components/ModalProvider'

type MainTab = 'project' | 'columns' | 'core'

interface ProjItem {
  id: string
  project_id: string
  name: string
  prompt: string
  skill: string
  output_mode: string
  config_json: string
  sort_order: number
  result_count: number
}

const COLUMN_GROUPS = [
  { id: 'col1', label: '素材输入', summary: 'Stage 1 — 素材处理' },
  { id: 'col2', label: '文档生成', summary: 'Stage 2 — 文档生成' },
  { id: 'col3', label: '文档课件', summary: 'Stage 3 — HTML课件' },
  { id: 'col4', label: '分析PPT', summary: 'Stage 4 — 分析PPT' },
  { id: 'col5', label: '综合PPT', summary: 'Stage 5 — 综合PPT' },
  { id: 'col6', label: '课件演讲', summary: 'Stage 4 — 演讲稿' },
  { id: 'col7', label: '语音合成', summary: 'Stage 4 — 语音合成' },
]

const CORE_CATEGORIES = [
  { key: '', label: '全部' },
  { key: 'root', label: '根级别' },
  { key: 'always', label: '通用规则' },
  { key: 'by_type', label: '按类型' },
  { key: 'by_feature', label: '按功能' },
  { key: 'by_layout', label: '按布局' },
]

export default function ProjItemSettingsPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const modal = useModal()
  const [mainTab, setMainTab] = useState<MainTab>('project')

  // All project items
  const [items, setItems] = useState<ProjItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hasItems, setHasItems] = useState(false)

  // Project info
  const [projName, setProjName] = useState('')
  const [projCopyright, setProjCopyright] = useState('')
  const [projSignature, setProjSignature] = useState('')
  const [projSaving, setProjSaving] = useState(false)

  // Column prompt values: itemId → { prompt, skill }
  const [colValues, setColValues] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [colSaving, setColSaving] = useState<Record<string, boolean>>({})

  // Core prompt values: itemId → content (stored in prompt field)
  const [coreValues, setCoreValues] = useState<Record<string, string>>({})
  const [coreSaving, setCoreSaving] = useState<Record<string, boolean>>({})
  const [coreCategory, setCoreCategory] = useState('')
  const [editingCoreId, setEditingCoreId] = useState<string | null>(null)

  // Accordion
  const [openCols, setOpenCols] = useState<Set<string>>(new Set(['col1']))

  // Init from factory state
  const [initLoading, setInitLoading] = useState(false)

  const loadItems = useCallback(() => {
    if (!projectId) return
    setLoading(true)
    api.listProjectItems(projectId).then((data: ProjItem[]) => {
      setItems(data)
      setHasItems(data.length > 0)

      // Columns (output_mode: text, ppt, speech_config, tts_config)
      const colVals: Record<string, { prompt: string; skill: string }> = {}
      data.filter(i => ['text', 'ppt', 'speech_config', 'tts_config'].includes(i.output_mode))
        .forEach(i => { colVals[i.id] = { prompt: i.prompt || '', skill: i.skill || '' } })
      setColValues(colVals)

      // Core prompts (output_mode: core_prompt)
      const coreVals: Record<string, string> = {}
      data.filter(i => i.output_mode === 'core_prompt')
        .forEach(i => { coreVals[i.id] = i.prompt || '' })
      setCoreValues(coreVals)

      // Project config items (output_mode: project_config)
      const cfgItem = data.find(i => i.output_mode === 'project_config')
      if (cfgItem) {
        try {
          const cfg = JSON.parse(cfgItem.config_json || '{}')
          setProjCopyright(cfg.copyright || '')
          setProjSignature(cfg.signature || '')
        } catch { /* ignore */ }
      }
    }).catch(() => {
      modal.toast('加载项目配置失败', 'error')
    }).finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => { loadItems() }, [loadItems])

  // Load project name
  useEffect(() => {
    if (!projectId) return
    api.getProject(projectId).then((d: any) => setProjName(d.name || '')).catch(() => {})
  }, [projectId])

  const handleInitFromFactory = async () => {
    if (!projectId) return
    setInitLoading(true)
    try {
      await api.initProjectItemsFromFactory(projectId)
      modal.toast('已从种子数据初始化', 'success')
      loadItems()
    } catch (e: any) {
      modal.toast('初始化失败: ' + e.message, 'error')
    } finally { setInitLoading(false) }
  }

  // Save column item (prompt + skill)
  const saveColumnItem = async (itemId: string) => {
    if (!projectId) return
    setColSaving(prev => ({ ...prev, [itemId]: true }))
    try {
      await api.updateProjectItem(projectId, itemId, {
        prompt: colValues[itemId]?.prompt || '',
        skill: colValues[itemId]?.skill || '',
      })
      modal.toast('已保存', 'success')
    } catch (e: any) {
      modal.toast('保存失败: ' + e.message, 'error')
    } finally { setColSaving(prev => ({ ...prev, [itemId]: false })) }
  }

  // Save core prompt item
  const saveCoreItem = async (itemId: string) => {
    if (!projectId) return
    setCoreSaving(prev => ({ ...prev, [itemId]: true }))
    try {
      await api.updateProjectItem(projectId, itemId, {
        prompt: coreValues[itemId] || '',
      })
      modal.toast('已保存', 'success')
    } catch (e: any) {
      modal.toast('保存失败: ' + e.message, 'error')
    } finally { setCoreSaving(prev => ({ ...prev, [itemId]: false })) }
  }

  // Save project config
  const saveProjectConfig = async () => {
    if (!projectId) return
    setProjSaving(true)
    try {
      // Update project name
      await api.updateProject(projectId, { name: projName })
      // Update or create project_config item
      const cfgItem = items.find(i => i.output_mode === 'project_config')
      const configJson = JSON.stringify({ copyright: projCopyright, signature: projSignature })
      if (cfgItem) {
        await api.updateProjectItem(projectId, cfgItem.id, { config_json: configJson })
      } else {
        await api.createProjectItem(projectId, {
          name: '项目配置',
          output_mode: 'project_config',
          config_json: configJson,
          sort_order: 0,
          prompt: '',
          skill: '',
        })
        loadItems()
      }
      modal.toast('项目配置已保存', 'success')
    } catch (e: any) {
      modal.toast('保存失败: ' + e.message, 'error')
    } finally { setProjSaving(false) }
  }

  // Map items by column
  const colItemMap = (colId: string): ProjItem[] => {
    if (colId === 'col7') return items.filter(i => i.output_mode === 'tts_config')
    if (colId === 'col6') return items.filter(i => i.output_mode === 'speech_config')
    // col1-col5: match by ID suffix pattern pi-{pid}-{colId}
    return items.filter(i => i.id.endsWith(`-${colId}`) || i.output_mode === (['col3','col4','col5'].includes(colId) ? 'ppt' : 'text'))
  }

  // Filtered core items
  const coreItems = items.filter(i => i.output_mode === 'core_prompt')
  const filteredCoreItems = coreCategory
    ? coreItems.filter(i => {
        // Extract category from item ID: pi-{pid}-core-{category}-...
        const idParts = i.id.split('-core-')[1] || ''
        return idParts.startsWith(coreCategory + '-') || idParts === coreCategory
      })
    : coreItems
  // Sort core items by sort_order
  filteredCoreItems.sort((a, b) => a.sort_order - b.sort_order)

  const toggleCol = (id: string) => {
    setOpenCols(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>加载中...</div>
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>项目设置</h2>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{projName}</span>
        {!hasItems && (
          <button className="btn btn-outline btn-sm" onClick={handleInitFromFactory} disabled={initLoading}>
            {initLoading ? '初始化中...' : '从种子数据初始化'}
          </button>
        )}
      </div>

      {!hasItems && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border)', borderRadius: 8, marginBottom: 16 }}>
          <p>此项目还没有独立的提示词配置。</p>
          <p style={{ fontSize: 12 }}>点击「从种子数据初始化」从全局种子数据复制一份到项目里，或者直接编辑全局种子数据（不影响此项目）。</p>
        </div>
      )}

      <div className="mgmt-tabs">
        <button className={`mgmt-tab${mainTab === 'project' ? ' active' : ''}`} onClick={() => setMainTab('project')}>项目配置</button>
        <button className={`mgmt-tab${mainTab === 'columns' ? ' active' : ''}`} onClick={() => setMainTab('columns')}>栏目配置</button>
        <button className={`mgmt-tab${mainTab === 'core' ? ' active' : ''}`} onClick={() => setMainTab('core')}>核心提示词</button>
      </div>
      <div className="mgmt-content">

        {/* ═══ Tab 1: 项目配置 ═══ */}
        {mainTab === 'project' && (
          <div>
            <div className="ac-sub-item">
              <div className="ac-sub-item-header">品牌信息</div>
              <div className="ac-field-row">
                <div className="ac-field">
                  <label>项目名称</label>
                  <input className="form-input" value={projName} onChange={e => setProjName(e.target.value)} />
                </div>
              </div>
              <div className="ac-field-row">
                <div className="ac-field">
                  <label>版权信息 (Copyright)</label>
                  <input className="form-input" value={projCopyright} onChange={e => setProjCopyright(e.target.value)}
                    placeholder="如: Copyright 2026 Your Company" />
                </div>
                <div className="ac-field">
                  <label>签名/署名</label>
                  <input className="form-input" value={projSignature} onChange={e => setProjSignature(e.target.value)}
                    placeholder="如: 培训课件组" />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={saveProjectConfig} disabled={projSaving}>
                  {projSaving ? '保存中...' : '保存项目配置'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Tab 2: 栏目配置 ═══ */}
        {mainTab === 'columns' && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 10 }}>
              编辑此项目专属的栏目提示词和 SKILL。修改仅影响此项目，不影响全局种子数据。
            </div>

            {COLUMN_GROUPS.map(col => {
              const colItems = colItemMap(col.id)
              return (
                <div key={col.id} className={`ac-group${openCols.has(col.id) ? ' open' : ''}`}>
                  <div className="ac-head" onClick={() => toggleCol(col.id)}>
                    <span className="ac-num no-tmpl">{col.id.slice(-1)}</span>
                    <span className="ac-title">{col.label}</span>
                    <span className="ac-summary">{col.summary}</span>
                    <span className="ac-arrow">▼</span>
                  </div>
                  <div className="ac-body">
                    {colItems.length === 0 ? (
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, padding: 8 }}>
                        暂无配置项 — 请先「从种子数据初始化」
                      </div>
                    ) : (
                      colItems.map(item => (
                        <div key={item.id} className="ac-sub-item">
                          <div className="ac-sub-item-header">{item.name}</div>
                          <div className="ac-field-row">
                            <div className="ac-field">
                              <label>提示词</label>
                              <textarea
                                value={colValues[item.id]?.prompt || ''}
                                onChange={e => setColValues(prev => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], prompt: e.target.value }
                                }))}
                              />
                            </div>
                            <div className="ac-field">
                              <label>SKILL 输出格式</label>
                              <textarea
                                value={colValues[item.id]?.skill || ''}
                                onChange={e => setColValues(prev => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], skill: e.target.value }
                                }))}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                            <button className="btn btn-primary btn-sm"
                              disabled={colSaving[item.id]}
                              onClick={() => saveColumnItem(item.id)}>
                              {colSaving[item.id] ? '保存中...' : '保存'}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ Tab 3: 核心提示词 ═══ */}
        {mainTab === 'core' && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 10 }}>
              PPT 生成的底层提示词，共 {coreItems.length} 个。修改仅影响此项目。
            </div>

            {coreItems.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, padding: 16, textAlign: 'center' }}>
                暂无核心提示词 — 请先「从种子数据初始化」
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                  {CORE_CATEGORIES.map(cat => (
                    <button key={cat.key}
                      className={`btn btn-sm ${coreCategory === cat.key ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setCoreCategory(cat.key)}>
                      {cat.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {filteredCoreItems.map(item => (
                    <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', cursor: 'pointer',
                        background: editingCoreId === item.id ? 'var(--bg-secondary)' : 'transparent' }}
                        onClick={() => setEditingCoreId(editingCoreId === item.id ? null : item.id)}>
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{item.name}</span>
                        <span style={{ fontSize: 9, color: 'var(--text-secondary)', marginRight: 8 }}>
                          {coreValues[item.id] ? `${(coreValues[item.id].length / 1024).toFixed(1)}KB` : '空'}
                        </span>
                        <span style={{ fontSize: 10, color: editingCoreId === item.id ? 'var(--text-secondary)' : 'var(--primary)' }}>
                          {editingCoreId === item.id ? '收起' : '编辑'}
                        </span>
                      </div>
                      {editingCoreId === item.id && (
                        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
                          <textarea
                            value={coreValues[item.id] || ''}
                            onChange={e => setCoreValues(prev => ({ ...prev, [item.id]: e.target.value }))}
                            style={{ width: '100%', minHeight: 200, fontFamily: 'monospace', fontSize: 11 }}
                          />
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingCoreId(null)}>取消</button>
                            <button className="btn btn-primary btn-sm" disabled={coreSaving[item.id]}
                              onClick={() => saveCoreItem(item.id)}>
                              {coreSaving[item.id] ? '保存中...' : '保存'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
