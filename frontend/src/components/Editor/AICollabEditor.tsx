import { useState, useEffect, useRef, useCallback } from 'react'
import { api, Prompt, LLMProvider } from '../../services/api'

interface AICollabEditorProps {
  value: string
  onChange: (text: string) => void
  placeholder?: string
  height?: string
  readOnly?: boolean
  category?: string
  generateUserMessage?: string
}

function AICollabEditor({
  value,
  onChange,
  placeholder = '',
  height = '400px',
  readOnly = false,
  category,
  generateUserMessage,
}: AICollabEditorProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [selectedPromptId, setSelectedPromptId] = useState('')
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [customInstruction, setCustomInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load prompts filtered by category
  useEffect(() => {
    api.listPrompts(category).then(ps => {
      setPrompts(ps)
      if (ps.length > 0 && !selectedPromptId) {
        const defaultP = ps.find(p => p.is_default === 1)
        setSelectedPromptId(defaultP?.id || ps[0].id)
      }
    }).catch(() => {})
  }, [category])

  // Load providers
  useEffect(() => {
    api.listProviders().then(provs => {
      setProviders(provs)
      const enabled = provs.filter((p: LLMProvider) => p.is_enabled === 1)
      if (enabled.length > 0 && !selectedProviderId) {
        setSelectedProviderId(enabled[0].id)
        if (enabled[0].models && enabled[0].models.length > 0) {
          setSelectedModel(enabled[0].models[0])
        }
      }
    }).catch(() => {})
  }, [])

  // When selectedProviderId changes, pick first model for that provider
  const syncModelForProvider = useCallback(() => {
    const prov = providers.find(p => p.id === selectedProviderId)
    if (prov && prov.models && prov.models.length > 0) {
      if (!prov.models.includes(selectedModel)) {
        setSelectedModel(prov.models[0])
      }
    }
  }, [selectedProviderId, providers, selectedModel])

  useEffect(() => {
    syncModelForProvider()
  }, [selectedProviderId])

  const selectedProvider = providers.find(p => p.id === selectedProviderId)
  const models = selectedProvider?.models || []

  const getSelection = () => {
    const ta = textareaRef.current
    if (!ta) return { text: '', start: 0, end: 0 }
    return {
      text: ta.value.substring(ta.selectionStart, ta.selectionEnd),
      start: ta.selectionStart,
      end: ta.selectionEnd,
    }
  }

  const replaceSelection = (newText: string) => {
    const { start, end } = getSelection()
    const before = value.substring(0, start)
    const after = value.substring(end)
    onChange(before + newText + after)
  }

  const insertAtCursor = (newText: string) => {
    const { start } = getSelection()
    const before = value.substring(0, start)
    const after = value.substring(start)
    onChange(before + newText + after)
  }

  const handleGenerate = async () => {
    if (!generateUserMessage) return
    const prompt = prompts.find(p => p.id === selectedPromptId)
    if (!prompt) return
    setError(null)
    setLoading(true)
    try {
      const res: any = await api.llmGenerate({
        provider_id: selectedProviderId,
        model: selectedModel,
        system_prompt: prompt.system_prompt,
        user_message: generateUserMessage,
      })
      onChange(res.content)
    } catch (err: any) {
      setError(err.message || '生成失败')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickAction = async (instruction: string) => {
    const { text } = getSelection()
    if (!text) {
      setError('请先选中文本')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res: any = await api.llmRefine({
        provider_id: selectedProviderId,
        model: selectedModel,
        instruction,
        selected_text: text,
        full_context: value,
      })
      replaceSelection(res.content)
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCustomInstruction = async () => {
    if (!customInstruction.trim()) return
    const { text, start, end } = getSelection()
    setError(null)
    setLoading(true)
    try {
      const res: any = await api.llmRefine({
        provider_id: selectedProviderId,
        model: selectedModel,
        instruction: customInstruction.trim(),
        selected_text: text,
        full_context: value,
      })
      if (text && start !== end) {
        replaceSelection(res.content)
      } else {
        insertAtCursor(res.content)
      }
      setCustomInstruction('')
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  const quickActions = [
    { label: '润色选中', instruction: '请润色以下文本，使其表达更流畅、更专业，保持原意不变。' },
    { label: '扩写', instruction: '请扩写以下文本，增加更多细节和说明，使内容更加丰富完整。' },
    { label: '精简', instruction: '请精简以下文本，去除冗余内容，保留核心要点。' },
    { label: '检查错别字', instruction: '请检查以下文本中的错别字和语法错误，并给出修正后的版本。如果发现错误请修正，没有错误请原样返回。' },
  ]

  // Shared inline styles
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    display: 'block',
    marginBottom: 4,
  }

  const selectStyle: React.CSSProperties = {
    width: '100%',
    height: 32,
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '0 8px',
    fontSize: 13,
    fontFamily: 'inherit',
    color: 'var(--color-text)',
    background: 'var(--color-card)',
    outline: 'none',
    cursor: 'pointer',
    boxSizing: 'border-box',
  }

  const btnPrimary: React.CSSProperties = {
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  }

  const quickBtnStyle: React.CSSProperties = {
    padding: '4px 10px',
    background: 'none',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{
      display: 'flex',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      background: 'var(--color-card)',
    }}>
      {/* Left: Editor textarea */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          onSelect={() => {
            // Selection tracking — no-op, we read from the ref on action
          }}
          style={{
            width: '100%',
            height,
            padding: 12,
            border: 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            lineHeight: 1.6,
            resize: 'vertical',
            outline: 'none',
            background: 'var(--color-card)',
            color: 'var(--color-text)',
            boxSizing: 'border-box',
            display: 'block',
          }}
        />
      </div>

      {/* AI Panel Toggle */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--color-border)',
      }}>
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          title={panelOpen ? '关闭 AI 面板' : '打开 AI 面板'}
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            padding: '10px 8px',
            border: 'none',
            background: panelOpen
              ? 'rgba(139, 26, 26, 0.06)'
              : 'var(--color-bg)',
            color: panelOpen ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: 2,
            flex: 1,
          }}
        >
          AI 辅助
        </button>
      </div>

      {/* Right: AI Panel */}
      {panelOpen && (
        <div style={{
          width: 300,
          minWidth: 300,
          borderLeft: '1px solid var(--color-border)',
          background: 'var(--color-bg)',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflowY: 'auto',
          maxHeight: height,
        }}>
          {/* Error banner */}
          {error && (
            <div style={{
              padding: '6px 10px',
              background: 'rgba(199, 91, 57, 0.1)',
              border: '1px solid var(--color-warning)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              color: 'var(--color-warning)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ flex: 1, wordBreak: 'break-all' }}>{error}</span>
              <button
                onClick={() => setError(null)}
                style={{
                  marginLeft: 8,
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-warning)',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 14,
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                x
              </button>
            </div>
          )}

          {/* Loading indicator */}
          {loading && (
            <div style={{
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 0',
            }}>
              <span style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--color-primary)',
                animation: 'pulse 1.2s ease-in-out infinite',
              }} />
              AI 处理中...
            </div>
          )}

          {/* Prompt selector */}
          <div>
            <label style={labelStyle}>提示词模板</label>
            <select
              value={selectedPromptId}
              onChange={e => setSelectedPromptId(e.target.value)}
              style={selectStyle}
              disabled={loading}
            >
              {prompts.length === 0 && (
                <option value="">暂无可用提示词</option>
              )}
              {prompts.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Provider + Model selector */}
          <div>
            <label style={labelStyle}>LLM 模型</label>
            <select
              value={selectedProviderId}
              onChange={e => {
                setSelectedProviderId(e.target.value)
                const prov = providers.find(p => p.id === e.target.value)
                if (prov && prov.models && prov.models.length > 0) {
                  setSelectedModel(prov.models[0])
                }
              }}
              style={selectStyle}
              disabled={loading}
            >
              {providers.filter(p => p.is_enabled === 1).length === 0 && (
                <option value="">暂无可用模型</option>
              )}
              {providers.filter(p => p.is_enabled === 1).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {models.length > 1 && (
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                style={{ ...selectStyle, marginTop: 4 }}
                disabled={loading}
              >
                {models.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}
          </div>

          {/* Generate draft button — only when editor is empty and generateUserMessage is provided */}
          {!value && generateUserMessage && (
            <button
              onClick={handleGenerate}
              disabled={loading || !selectedPromptId || !selectedProviderId || !selectedModel}
              style={{
                ...btnPrimary,
                opacity: (loading || !selectedPromptId || !selectedProviderId || !selectedModel) ? 0.5 : 1,
                width: '100%',
              }}
            >
              {loading ? '生成中...' : '生成初稿'}
            </button>
          )}

          {/* Quick actions — only when editor has content */}
          {value && (
            <div>
              <label style={labelStyle}>快捷操作（先选中文本）</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {quickActions.map(a => (
                  <button
                    key={a.label}
                    onClick={() => handleQuickAction(a.instruction)}
                    disabled={loading}
                    style={{
                      ...quickBtnStyle,
                      opacity: loading ? 0.5 : 1,
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom instruction — only when editor has content */}
          {value && (
            <div>
              <label style={labelStyle}>自定义指令</label>
              <textarea
                value={customInstruction}
                onChange={e => setCustomInstruction(e.target.value)}
                placeholder="输入自定义 AI 指令..."
                disabled={loading}
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault()
                    handleCustomInstruction()
                  }
                }}
                style={{
                  width: '100%',
                  height: 60,
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 8px',
                  fontSize: 12,
                  fontFamily: 'var(--font-family)',
                  resize: 'vertical',
                  outline: 'none',
                  background: 'var(--color-card)',
                  color: 'var(--color-text)',
                  boxSizing: 'border-box',
                }}
              />
              <button
                onClick={handleCustomInstruction}
                disabled={loading || !customInstruction.trim() || !selectedProviderId}
                style={{
                  ...btnPrimary,
                  marginTop: 6,
                  opacity: (loading || !customInstruction.trim() || !selectedProviderId) ? 0.5 : 1,
                  width: '100%',
                  fontSize: 12,
                  padding: '6px 12px',
                }}
              >
                发送 AI 指令 (Ctrl+Enter)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AICollabEditor
