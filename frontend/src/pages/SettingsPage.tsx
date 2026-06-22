import { useState, useEffect, useCallback } from 'react'
import { api, LLMProvider } from '../services/api'

type TabKey = 'llm' | 'tts' | 'data' | 'about'

interface TabDef {
  key: TabKey
  label: string
}

const tabs: TabDef[] = [
  { key: 'llm', label: 'LLM配置' },
  { key: 'tts', label: 'TTS配置' },
  { key: 'data', label: '数据' },
  { key: 'about', label: '关于' },
]

function maskApiKey(key: string): string {
  if (!key || key.length <= 6) return '***'
  return key.slice(0, 3) + '***' + key.slice(-3)
}

interface ProviderFormData {
  name: string
  api_key: string
  base_url: string
  models: string
}

const emptyForm: ProviderFormData = {
  name: '',
  api_key: '',
  base_url: '',
  models: '',
}

function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('llm')

  // LLM state
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [providersLoading, setProvidersLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderFormData>(emptyForm)
  const [formError, setFormError] = useState('')
  const [formSaving, setFormSaving] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string } | null>>({})
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set())

  // TTS state
  const [ttsApiKey, setTtsApiKey] = useState('')
  const [ttsSaving, setTtsSaving] = useState(false)
  const [ttsSaveMsg, setTtsSaveMsg] = useState('')

  const loadProviders = useCallback(async () => {
    try {
      const data = await api.listProviders()
      setProviders(data)
    } catch (err: any) {
      console.error('Failed to load providers:', err)
    } finally {
      setProvidersLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  const openAddForm = () => {
    setForm(emptyForm)
    setFormError('')
    setEditingId(null)
    setShowAddForm(true)
  }

  const openEditForm = (p: LLMProvider) => {
    setForm({
      name: p.name,
      api_key: '',
      base_url: p.base_url,
      models: (p.models || []).join(', '),
    })
    setFormError('')
    setEditingId(p.id)
    setShowAddForm(true)
  }

  const closeForm = () => {
    setShowAddForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setFormError('')
  }

  const parseModels = (raw: string): string[] => {
    return raw
      .split(/[,，]/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
  }

  const handleSaveProvider = async () => {
    setFormError('')
    if (!form.name.trim()) { setFormError('请输入提供商名称'); return }
    if (!form.base_url.trim()) { setFormError('请输入 Base URL'); return }

    const models = parseModels(form.models)
    if (editingId) {
      const updateData: { name: string; api_key: string; base_url: string; models: string[] } = {
        name: form.name.trim(),
        api_key: form.api_key || '',
        base_url: form.base_url.trim(),
        models,
      }
      if (!form.api_key && !editingId) { /* skip - editing with empty key means keep old */ }
      setFormSaving(true)
      try {
        await api.updateProvider(editingId, updateData)
        closeForm()
        await loadProviders()
      } catch (err: any) {
        setFormError(err.message)
      } finally {
        setFormSaving(false)
      }
    } else {
      if (!form.api_key.trim()) { setFormError('请输入 API Key'); return }
      setFormSaving(true)
      try {
        await api.createProvider({
          name: form.name.trim(),
          api_key: form.api_key.trim(),
          base_url: form.base_url.trim(),
          models,
        })
        closeForm()
        await loadProviders()
      } catch (err: any) {
        setFormError(err.message)
      } finally {
        setFormSaving(false)
      }
    }
  }

  const handleDeleteProvider = async (p: LLMProvider) => {
    if (!confirm(`确认删除提供商「${p.name}」？此操作不可撤销。`)) return
    try {
      await api.deleteProvider(p.id)
      await loadProviders()
      setTestResults(prev => { const n = { ...prev }; delete n[p.id]; return n })
    } catch (err: any) {
      alert('删除失败: ' + err.message)
    }
  }

  const handleTestConnection = async (p: LLMProvider) => {
    setTestingIds(prev => new Set(prev).add(p.id))
    setTestResults(prev => ({ ...prev, [p.id]: null }))
    try {
      const data = await api.testProvider(p.id)
      setTestResults(prev => ({ ...prev, [p.id]: { ok: true, msg: data.message || '连接成功' } }))
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [p.id]: { ok: false, msg: err.message } }))
    } finally {
      setTestingIds(prev => { const n = new Set(prev); n.delete(p.id); return n })
    }
  }

  const handleSaveTts = async () => {
    setTtsSaving(true)
    setTtsSaveMsg('')
    try {
      await api.updateSettings({ tts_api_key: ttsApiKey })
      setTtsSaveMsg('保存成功')
    } catch (err: any) {
      setTtsSaveMsg('保存失败: ' + err.message)
    } finally {
      setTtsSaving(false)
    }
  }

  const styles = {
    tabBar: {
      display: 'flex',
      gap: '4px',
      marginBottom: '24px',
      borderBottom: '2px solid var(--color-border)',
      paddingBottom: 0,
    } as React.CSSProperties,
    tabBtn: (active: boolean) => ({
      padding: '10px 20px',
      background: 'none',
      border: 'none',
      borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
      color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
      fontWeight: active ? 600 : 400,
      fontSize: '14px',
      cursor: 'pointer',
      marginBottom: '-2px',
      transition: 'color 0.15s, border-color 0.15s',
    } as React.CSSProperties),
    card: {
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: '16px',
      boxShadow: 'var(--shadow-card)',
    } as React.CSSProperties,
    cardGrid: {
      display: 'grid',
      gap: '12px',
    } as React.CSSProperties,
    btnPrimary: {
      background: 'var(--color-primary)',
      color: '#fff',
      border: 'none',
      padding: '8px 16px',
      borderRadius: 'var(--radius-sm)',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
    } as React.CSSProperties,
    btnSecondary: {
      background: 'none',
      border: '1px solid var(--color-border)',
      padding: '6px 14px',
      borderRadius: 'var(--radius-sm)',
      fontSize: '13px',
      color: 'var(--color-text-secondary)',
      cursor: 'pointer',
    } as React.CSSProperties,
    btnDanger: {
      background: 'none',
      border: '1px solid var(--color-border)',
      padding: '6px 14px',
      borderRadius: 'var(--radius-sm)',
      fontSize: '13px',
      color: 'var(--color-primary)',
      cursor: 'pointer',
    } as React.CSSProperties,
    inputField: {
      width: '100%',
      height: '36px',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-sm)',
      padding: '0 10px',
      fontSize: '14px',
      fontFamily: 'inherit',
      color: 'var(--color-text)',
      background: 'var(--color-card)',
      outline: 'none',
      boxSizing: 'border-box' as const,
    } as React.CSSProperties,
    label: {
      fontSize: '13px',
      fontWeight: 600,
      color: 'var(--color-text)',
      display: 'block',
      marginBottom: '6px',
    } as React.CSSProperties,
    sectionTitle: {
      fontSize: '18px',
      fontWeight: 700,
      color: 'var(--color-text)',
      marginBottom: '16px',
    } as React.CSSProperties,
    successBadge: {
      color: 'var(--color-success)',
      fontSize: '13px',
    } as React.CSSProperties,
    errorBadge: {
      color: 'var(--color-warning)',
      fontSize: '13px',
    } as React.CSSProperties,
    infoRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 0',
      borderBottom: '1px solid var(--color-border)',
    } as React.CSSProperties,
  }

  // --- LLM TAB ---
  const renderLLMTab = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={styles.sectionTitle}>LLM 提供商管理</h2>
        <button style={styles.btnPrimary} onClick={openAddForm}>
          + 添加提供商
        </button>
      </div>

      {/* Add/Edit Form Modal */}
      {showAddForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            ...styles.card,
            width: '480px',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>
              {editingId ? '编辑提供商' : '添加提供商'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={styles.label}>名称</label>
                <input
                  style={styles.inputField}
                  placeholder="例如: DashScope"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label style={styles.label}>API Key</label>
                <input
                  style={styles.inputField}
                  type="password"
                  placeholder={editingId ? '留空则不修改' : '请输入 API Key'}
                  value={form.api_key}
                  onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                />
              </div>
              <div>
                <label style={styles.label}>Base URL</label>
                <input
                  style={styles.inputField}
                  placeholder="例如: https://dashscope.aliyuncs.com/compatible-mode/v1"
                  value={form.base_url}
                  onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
                />
              </div>
              <div>
                <label style={styles.label}>模型列表（逗号分隔）</label>
                <input
                  style={styles.inputField}
                  placeholder="例如: qwen-plus, qwen-max, qwen-turbo"
                  value={form.models}
                  onChange={e => setForm(f => ({ ...f, models: e.target.value }))}
                />
              </div>
            </div>

            {formError && (
              <p style={{ color: 'var(--color-warning)', fontSize: '13px', marginTop: '12px' }}>{formError}</p>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button style={styles.btnSecondary} onClick={closeForm} disabled={formSaving}>取消</button>
              <button style={styles.btnPrimary} onClick={handleSaveProvider} disabled={formSaving}>
                {formSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provider List */}
      {providersLoading ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>加载中...</p>
      ) : providers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-secondary)' }}>
          <p style={{ fontSize: 15, marginBottom: 8 }}>暂无 LLM 提供商</p>
          <p>点击「+ 添加提供商」配置大模型接入</p>
        </div>
      ) : (
        <div style={styles.cardGrid}>
          {providers.map(p => (
            <div key={p.id} style={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
                    {p.name}
                    {p.is_enabled === 0 && (
                      <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginLeft: '8px' }}>
                        (已禁用)
                      </span>
                    )}
                  </h4>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                    <div>Base URL: {p.base_url}</div>
                    <div>API Key: {maskApiKey(p.api_key)}</div>
                    <div>模型: {(p.models || []).join(', ') || '无'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '16px' }}>
                  <button style={styles.btnSecondary} onClick={() => openEditForm(p)}>编辑</button>
                  <button style={styles.btnDanger} onClick={() => handleDeleteProvider(p)}>删除</button>
                </div>
              </div>

              {/* Test Connection */}
              <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
                <button
                  style={{
                    ...styles.btnSecondary,
                    fontSize: '12px',
                    padding: '4px 12px',
                  }}
                  onClick={() => handleTestConnection(p)}
                  disabled={testingIds.has(p.id)}
                >
                  {testingIds.has(p.id) ? '测试中...' : '测试连接'}
                </button>
                {testResults[p.id] && (
                  <span style={testResults[p.id]!.ok ? styles.successBadge : styles.errorBadge}>
                    {testResults[p.id]!.ok ? '✔ ' : '✘ '}
                    {testResults[p.id]!.msg}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // --- TTS TAB ---
  const renderTTSTab = () => (
    <div>
      <h2 style={styles.sectionTitle}>TTS 语音合成配置</h2>
      <div style={styles.card}>
        <div style={{ marginBottom: '16px' }}>
          <label style={styles.label}>DashScope API Key</label>
          <input
            style={styles.inputField}
            type="password"
            placeholder="请输入 DashScope API Key"
            value={ttsApiKey}
            onChange={e => setTtsApiKey(e.target.value)}
          />
        </div>
        <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
          提示：可复用 LLM 配置中的 DashScope API Key
        </p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button style={styles.btnPrimary} onClick={handleSaveTts} disabled={ttsSaving}>
            {ttsSaving ? '保存中...' : '保存'}
          </button>
          {ttsSaveMsg && (
            <span style={ttsSaveMsg.includes('失败') ? styles.errorBadge : styles.successBadge}>
              {ttsSaveMsg}
            </span>
          )}
        </div>
      </div>
    </div>
  )

  // --- DATA TAB ---
  const renderDataTab = () => (
    <div>
      <h2 style={styles.sectionTitle}>数据管理</h2>
      <div style={styles.card}>
        <div style={styles.infoRow}>
          <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>数据目录</span>
          <span style={{ fontSize: '14px', color: 'var(--color-text)' }}>backend/data/</span>
        </div>
        <div style={styles.infoRow}>
          <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>磁盘占用</span>
          <span style={{ fontSize: '14px', color: 'var(--color-text)' }}>估算中...</span>
        </div>
        <div style={{ ...styles.infoRow, borderBottom: 'none' }}>
          <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>项目数量</span>
          <span style={{ fontSize: '14px', color: 'var(--color-text)' }}>--</span>
        </div>
      </div>
    </div>
  )

  // --- ABOUT TAB ---
  const renderAboutTab = () => (
    <div>
      <h2 style={styles.sectionTitle}>关于</h2>
      <div style={{ ...styles.card, textAlign: 'center', padding: '40px 16px' }}>
        <h3 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '8px' }}>
          一勺笔录 Agent
        </h3>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
          版本 v1.0.0
        </p>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '24px', lineHeight: 1.6 }}>
          智能食谱笔记助手，基于大语言模型的一体化食谱记录与优化工具
        </p>
        <button
          style={styles.btnSecondary}
          onClick={() => alert('当前已是最新版本')}
        >
          检查更新
        </button>
      </div>
    </div>
  )

  // --- MAIN RENDER ---
  return (
    <div>
      {/* Tab Bar */}
      <div style={styles.tabBar}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            style={styles.tabBtn(activeTab === tab.key)}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'llm' && renderLLMTab()}
      {activeTab === 'tts' && renderTTSTab()}
      {activeTab === 'data' && renderDataTab()}
      {activeTab === 'about' && renderAboutTab()}
    </div>
  )
}

export default SettingsPage
