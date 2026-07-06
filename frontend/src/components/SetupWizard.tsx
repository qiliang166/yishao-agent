import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'

const WIZARD_DONE_KEY = 'setup_wizard_done'

interface WizardProps {
  embedded?: boolean
  onDone?: () => void
}

type WizardStep = 'check' | 'quick-llm' | 'quick-tts' | 'create' | 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'done'

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'check', label: '环境检查' },
  { key: 'create', label: '创建项目' },
  { key: 'stage1', label: '整理素材' },
  { key: 'stage2', label: '生成文档' },
  { key: 'stage3', label: '生成课件' },
  { key: 'stage4', label: '演讲配音' },
  { key: 'done', label: '完成' },
]

function appendModel(current: string, model: string): string {
  const parts = current.split(',').map(s => s.trim()).filter(Boolean)
  if (!parts.includes(model)) parts.push(model)
  return parts.join(', ')
}

const RECOMMENDED_MODELS: Record<string, string[]> = {
  llm: ['deepseek-chat', 'deepseek-reasoner', 'gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5', 'qwen3-max', 'qwen3-plus', 'glm-4-plus'],
  tts: ['cosyvoice-v3-flash', 'cosyvoice-v3-plus', 'speech-1.0'],
}

function ModelTags({ models, onAdd }: { models: string[]; onAdd: (m: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
      <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginRight: 2 }}>推荐模型：</span>
      {models.map(m => (
        <span key={m} onClick={() => onAdd(m)}
          style={{ cursor: 'pointer', fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--primary)', userSelect: 'none' }}
          title={`点击添加 ${m}`}>{m}</span>
      ))}
    </div>
  )
}

const SAMPLE_TEXT = `餐饮服务培训是新员工入职的必修课程。所有服务人员必须掌握以下核心技能：

一、迎宾接待规范
1. 顾客进店3秒内主动问候，使用标准欢迎语"欢迎光临"
2. 引导顾客入座，先女士后男士，先长辈后晚辈
3. 15秒内递上菜单，同时呈上热毛巾或茶水

二、点餐服务流程
1. 熟悉所有菜品的主料、口味、烹饪方式和推荐搭配
2. 主动询问顾客忌口和过敏信息，做好记录
3. 复述订单确认，避免错漏
4. 推荐当日特色菜和畅销品，提升客单价

三、上菜服务标准
1. 冷菜8分钟内上桌，热菜15分钟内上桌
2. 上菜时报菜名，说明食用方法
3. 注意上菜顺序：冷菜→汤→热菜→主食→甜品
4. 随时关注餐桌状况，及时撤空盘、换骨碟

四、顾客关怀与投诉处理
1. 用餐中至少巡台2次，主动询问口味是否满意
2. 遇到投诉先道歉再处理，不推诿不争辩
3. 顾客离店时致谢送别，提醒带好随身物品
4. 收集顾客反馈，记录偏好信息建立客户档案`

export default function SetupWizard({ embedded, onDone }: WizardProps) {
  const navigate = useNavigate()
  const [step, setStep] = useState<WizardStep>('check')
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Step: check
  const [checking, setChecking] = useState(true)
  const [hasProviders, setHasProviders] = useState(false)
  const [hasSeeds, setHasSeeds] = useState(false)
  const [hasTemplates, setHasTemplates] = useState(false)
  const [hasTtsProviders, setHasTtsProviders] = useState(false)
  const [providers, setProviders] = useState<any[]>([])

  // Step: quick-llm
  const [qlName, setQlName] = useState('')
  const [qlKey, setQlKey] = useState('')
  const [qlUrl, setQlUrl] = useState('https://api.deepseek.com/v1')
  const [qlModels, setQlModels] = useState('')

  // Step: quick-tts
  const [qtName, setQtName] = useState('')
  const [qtKey, setQtKey] = useState('')
  const [qtUrl, setQtUrl] = useState('')
  const [qtModels, setQtModels] = useState('')

  // Step: create
  const [projName, setProjName] = useState('餐饮食品安全培训')
  const [sourceText, setSourceText] = useState(SAMPLE_TEXT)
  const [workspaceId, setWorkspaceId] = useState('')
  const [projectId, setProjectId] = useState('')

  // Step: stage results
  const [stage1Result, setStage1Result] = useState('')
  const [stage2Result, setStage2Result] = useState('')
  const [stage3Result, setStage3Result] = useState<any>(null)
  const [stage3Log, setStage3Log] = useState('')
  const [stage4Result, setStage4Result] = useState('')
  const [error, setError] = useState('')

  // Step navigation helpers
  const stepIndex = STEPS.findIndex(s => s.key === step)
  const visibleSteps = STEPS.filter(s => s.key !== 'quick-llm' && s.key !== 'quick-tts')

  useEffect(() => { if (!dismissed) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' } }, [dismissed])

  // ── Step: System Check ──
  useEffect(() => {
    if (step !== 'check') return
    let cancelled = false
    setChecking(true)
    Promise.all([
      api.listProviders().catch(() => []),
      api.listColumnConfigs().catch(() => []),
      api.listTemplates('ppt').catch(() => []),
      api.listTtsProviders().catch(() => []),
    ]).then(([p, seeds, tmpls, tts]) => {
      if (cancelled) return
      setProviders(p)
      setHasProviders(p.length > 0)
      setHasSeeds(Array.isArray(seeds) && seeds.length > 0)
      setHasTemplates(Array.isArray(tmpls) && tmpls.length > 0)
      setHasTtsProviders(Array.isArray(tts) && tts.length > 0)
      setChecking(false)
    })
    return () => { cancelled = true }
  }, [step])

  const handleFixLLM = useCallback(async () => {
    if (!qlName.trim() || !qlKey.trim() || !qlUrl.trim() || !qlModels.trim()) {
      setError('请填写完整的 LLM 提供商信息')
      return
    }
    setLoading(true)
    setError('')
    try {
      const models = qlModels.split(',').map((s: string) => s.trim()).filter(Boolean)
      await api.createProvider({ name: qlName.trim(), api_key: qlKey.trim(), base_url: qlUrl.trim(), models })
      setHasProviders(true)
      setStep('check')
    } catch (e: any) {
      setError(e.message || '添加失败')
    } finally {
      setLoading(false)
    }
  }, [qlName, qlKey, qlUrl, qlModels])

  const handleFixTTS = useCallback(async () => {
    if (!qtName.trim() || !qtKey.trim() || !qtUrl.trim() || !qtModels.trim()) {
      setError('请填写完整的 TTS 提供商信息')
      return
    }
    setLoading(true)
    setError('')
    try {
      const models = qtModels.split(',').map((s: string) => s.trim()).filter(Boolean)
      await api.createTtsProvider({ name: qtName.trim(), api_key: qtKey.trim(), base_url: qtUrl.trim(), models })
      setHasTtsProviders(true)
      setStep('check')
    } catch (e: any) {
      setError(e.message || '添加失败')
    } finally {
      setLoading(false)
    }
  }, [qtName, qtKey, qtUrl, qtModels])

  // ── Step: Create Project ──
  const handleCreateProject = useCallback(async () => {
    if (!projName.trim()) { setError('请输入项目名称'); return }
    setLoading(true)
    setError('')
    try {
      const wsList = await api.listWorkspaces().catch(() => ({ workspaces: [] as any[] }))
      let wsId = ''
      if (wsList.workspaces.length > 0) {
        wsId = wsList.workspaces[0].id
      } else {
        const ws = await api.createWorkspace('我的工作区') as any
        wsId = ws.id
      }
      const proj = await api.createProject(projName.trim(), wsId) as any
      setWorkspaceId(wsId)
      setProjectId(proj.id)
      setStep('stage1')
    } catch (e: any) {
      setError(e.message || '创建失败')
    } finally {
      setLoading(false)
    }
  }, [projName])

  // ── Stage 1: 整理素材 ──
  const handleStage1 = useCallback(async () => {
    if (!sourceText.trim()) { setError('请输入素材内容'); return }
    if (providers.length === 0) { setError('请先配置 LLM 提供商'); return }
    setLoading(true)
    setError('')
    setStage1Result('')
    try {
      const p = providers[0]
      const model = (Array.isArray(p.models) ? p.models[0] : 'deepseek-chat') || 'deepseek-chat'
      let full = ''
      for await (const chunk of api.llmGenerateStream({
        provider_id: p.id, model,
        system_prompt: '你是一个专业的培训内容整理助手。请将用户提供的素材整理成结构清晰的 Markdown 文档，包含标题、分节、要点列表。保持原始信息完整，补充必要的背景说明。',
        user_message: `请整理以下培训素材：\n\n${sourceText}`,
      })) { full += chunk }
      setStage1Result(full)
    } catch (e: any) {
      setError(e.message || '生成失败')
    } finally {
      setLoading(false)
    }
  }, [sourceText, providers])

  // ── Stage 2: 生成文档 ──
  const handleStage2 = useCallback(async () => {
    if (!stage1Result) { setError('请先完成素材整理'); return }
    setLoading(true)
    setError('')
    setStage2Result('')
    try {
      const p = providers[0]
      const model = (Array.isArray(p.models) ? p.models[0] : 'deepseek-chat') || 'deepseek-chat'
      let full = ''
      for await (const chunk of api.llmGenerateStream({
        provider_id: p.id, model,
        system_prompt: '你是一个专业的培训文档撰写助手。请根据整理后的素材，生成一份完整、结构清晰的培训文档。包含：封面信息、目录、各章节详细内容、总结。使用 Markdown 格式，语言专业但通俗易懂。',
        user_message: `请根据以下素材生成完整的培训文档：\n\n${stage1Result}`,
      })) { full += chunk }
      setStage2Result(full)
    } catch (e: any) {
      setError(e.message || '生成失败')
    } finally {
      setLoading(false)
    }
  }, [stage1Result, providers])

  // ── Stage 3: 生成课件 ──
  const handleStage3 = useCallback(async () => {
    if (!stage2Result) { setError('请先完成文档生成'); return }
    setLoading(true)
    setError('')
    setStage3Result(null)
    setStage3Log('正在获取模板列表...')
    try {
      const p = providers[0]
      const model = (Array.isArray(p.models) ? p.models[0] : 'deepseek-chat') || 'deepseek-chat'
      const templates = await api.listTemplates().catch(() => [] as any[])
      const pptTemplates = (templates as any[]).filter((t: any) => t.type === 'ppt')
      const templateId = pptTemplates.length > 0 ? pptTemplates[0].id : ''
      if (!templateId) {
        setStage3Log('未找到 PPT 模板，请在「模板管理」中先上传模板。跳过此步骤。')
        setLoading(false)
        return
      }
      setStage3Log('正在生成课件大纲...')
      const result = await api.generatePPT(
        stage2Result, templateId, undefined, projectId, p.id, model,
        undefined, undefined, 'col3', 'deep-blue',
      ) as any
      setStage3Result(result)
      setStage3Log('')
    } catch (e: any) {
      setStage3Log('')
      setError(e.message || '课件生成失败，请检查模板和 LLM 配置')
    } finally {
      setLoading(false)
    }
  }, [stage2Result, providers, projectId])

  // ── Stage 4: 演讲配音 ──
  const handleStage4 = useCallback(async () => {
    const content = stage2Result || stage1Result
    if (!content) { setError('请先完成文档生成'); return }
    setLoading(true)
    setError('')
    setStage4Result('')
    try {
      const p = providers[0]
      const model = (Array.isArray(p.models) ? p.models[0] : 'deepseek-chat') || 'deepseek-chat'
      let full = ''
      for await (const chunk of api.llmGenerateStream({
        provider_id: p.id, model,
        system_prompt: '你是一个专业的演讲撰稿人。请根据培训文档撰写一篇口语化的演讲稿，适合现场培训使用。语言亲切自然，有开场白和结束语，标注停顿和重点强调的位置。',
        user_message: `请根据以下培训文档撰写演讲稿：\n\n${content}`,
      })) { full += chunk }
      setStage4Result(full)
    } catch (e: any) {
      setError(e.message || '生成失败')
    } finally {
      setLoading(false)
    }
  }, [stage1Result, stage2Result, providers])

  const handleViewProject = () => {
    handleClose()
    if (projectId) navigate(`/project/${projectId}/workspace`)
  }

  const handleClose = () => {
    setDismissed(true)
    localStorage.setItem(WIZARD_DONE_KEY, '1')
    document.body.style.overflow = ''
    onDone?.()
  }

  if (dismissed) return null

  // ── Quick LLM form ──
  if (step === 'quick-llm') {
    return (
      <div className="dialog-overlay" style={{ zIndex: 10000 }}>
        <div className="dialog-box" style={{ minWidth: 480 }}>
          <div className="dialog-title">添加 LLM 提供商</div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
            需要一个 LLM 提供商才能使用 AI 生成功能。以 DeepSeek 为例：
          </p>
          <div className="form-label">名称</div>
          <input className="form-input" value={qlName} onChange={e => setQlName(e.target.value)} placeholder="如 DeepSeek" autoFocus />
          <div className="form-label" style={{ marginTop: 12 }}>API Key</div>
          <input className="form-input" value={qlKey} onChange={e => setQlKey(e.target.value)} placeholder="sk-..." />
          <div className="form-label" style={{ marginTop: 12 }}>Base URL</div>
          <input className="form-input" value={qlUrl} onChange={e => setQlUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" />
          <div className="form-label" style={{ marginTop: 12 }}>模型列表（逗号分隔）</div>
          <input className="form-input" value={qlModels} onChange={e => setQlModels(e.target.value)} placeholder="输入模型名或点击下方推荐模型" />
          <ModelTags models={RECOMMENDED_MODELS.llm} onAdd={m => setQlModels(prev => appendModel(prev, m))} />
          {error && <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setStep('check'); setError('') }}>返回</button>
            <button className="btn btn-primary btn-sm" onClick={handleFixLLM} disabled={loading}>{loading ? '保存中...' : '保存并继续'}</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Quick TTS form ──
  if (step === 'quick-tts') {
    return (
      <div className="dialog-overlay" style={{ zIndex: 10000 }}>
        <div className="dialog-box" style={{ minWidth: 480 }}>
          <div className="dialog-title">添加 TTS 提供商</div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
            需要一个 TTS（语音合成）提供商才能为课件生成配音。
          </p>
          <div className="form-label">名称</div>
          <input className="form-input" value={qtName} onChange={e => setQtName(e.target.value)} placeholder="如 CosyVoice" autoFocus />
          <div className="form-label" style={{ marginTop: 12 }}>API Key</div>
          <input className="form-input" value={qtKey} onChange={e => setQtKey(e.target.value)} placeholder="sk-..." />
          <div className="form-label" style={{ marginTop: 12 }}>Base URL</div>
          <input className="form-input" value={qtUrl} onChange={e => setQtUrl(e.target.value)} placeholder="https://api.example.com/v1" />
          <div className="form-label" style={{ marginTop: 12 }}>模型列表（逗号分隔）</div>
          <input className="form-input" value={qtModels} onChange={e => setQtModels(e.target.value)} placeholder="输入模型名或点击下方推荐模型" />
          <ModelTags models={RECOMMENDED_MODELS.tts} onAdd={m => setQtModels(prev => appendModel(prev, m))} />
          {error && <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setStep('check'); setError('') }}>返回</button>
            <button className="btn btn-primary btn-sm" onClick={handleFixTTS} disabled={loading}>{loading ? '保存中...' : '保存并继续'}</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main wizard ──
  return (
    <div className="dialog-overlay" style={{ zIndex: 9999 }}>
      <div style={{
        background: 'var(--bg)', borderRadius: 12, width: 760, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 4px 32px rgba(0,0,0,0.15)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 28px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>快速上手</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              跟随向导完成第一个培训项目
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleClose} style={{ fontSize: 20, padding: '2px 8px' }}>x</button>
        </div>

        {/* Step indicators */}
        <div style={{
          display: 'flex', gap: 0, padding: '12px 28px',
          borderBottom: '1px solid var(--border)', overflowX: 'auto',
        }}>
          {visibleSteps.map((s, i) => {
            const idx = STEPS.findIndex(x => x.key === s.key)
            const current = STEPS.findIndex(x => x.key === step)
            const done = idx < current
            const active = idx === current
            return (
              <div key={s.key} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, whiteSpace: 'nowrap',
                color: active ? 'var(--primary)' : done ? 'var(--success)' : 'var(--text-secondary)',
                fontWeight: active ? 600 : 400,
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 20, height: 20, borderRadius: '50%',
                  background: active ? 'var(--primary)' : done ? 'var(--success)' : 'var(--border)',
                  color: active || done ? '#fff' : 'var(--text-secondary)',
                  fontSize: 11, fontWeight: 700,
                }}>
                  {done ? '✓' : idx + 1}
                </span>
                {s.label}
                {i < visibleSteps.length - 1 && (
                  <span style={{ margin: '0 4px', color: 'var(--border)' }}>→</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
          {/* ── Step: check ── */}
          {step === 'check' && (
            <div>
              <h3 style={{ margin: '0 0 16px 0' }}>系统环境检查</h3>
              {checking ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>检测中...</div>
              ) : (
                <div>
                  {/* LLM Provider */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', background: 'var(--card-bg)', borderRadius: 8, marginBottom: 8,
                  }}>
                    <div>
                      <strong>LLM 提供商</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>AI 生成功能的核心引擎</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: hasProviders ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                        {hasProviders ? '✓ 已配置' : '✗ 未配置'}
                      </span>
                      {!hasProviders && (
                        <button className="btn btn-primary btn-sm" onClick={() => setStep('quick-llm')}>去配置</button>
                      )}
                    </div>
                  </div>

                  {/* PPT Template */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', background: 'var(--card-bg)', borderRadius: 8, marginBottom: 8,
                  }}>
                    <div>
                      <strong>PPT 模板</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>课件生成所需的设计模板（需上传 PPTX 文件）</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: hasTemplates ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                        {hasTemplates ? '✓ 已配置' : '✗ 未配置'}
                      </span>
                      {!hasTemplates && (
                        <button className="btn btn-outline btn-sm" onClick={() => { handleClose(); navigate('/templates') }}>
                          去模板管理
                        </button>
                      )}
                    </div>
                  </div>

                  {/* TTS Provider */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', background: 'var(--card-bg)', borderRadius: 8, marginBottom: 8,
                  }}>
                    <div>
                      <strong>TTS 提供商</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>语音合成引擎，用于生成课件配音</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: hasTtsProviders ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                        {hasTtsProviders ? '✓ 已配置' : '✗ 未配置'}
                      </span>
                      {!hasTtsProviders && (
                        <button className="btn btn-primary btn-sm" onClick={() => setStep('quick-tts')}>去配置</button>
                      )}
                    </div>
                  </div>

                  {/* Seed prompts */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', background: 'var(--card-bg)', borderRadius: 8, marginBottom: 8,
                  }}>
                    <div>
                      <strong>种子提示词</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>系统预设的提示词配置，确保生成质量</div>
                    </div>
                    <span style={{ color: hasSeeds ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                      {hasSeeds ? '✓ 已加载' : '✗ 未加载'}
                    </span>
                  </div>

                  {!hasProviders ? (
                    <div style={{
                      marginTop: 16, padding: 12, background: '#fef3c7', borderRadius: 8,
                      fontSize: 12, color: '#92400e',
                    }}>
                      LLM 提供商是必须项。请先点击「去配置」添加一个 LLM 提供商后再继续。
                      {!hasTemplates && ' PPT 模板可在流程中跳过，之后可随时在「模板管理」中上传。'}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'right', marginTop: 20 }}>
                      {!hasTemplates && (
                        <div style={{
                          fontSize: 11, color: '#92400e', marginBottom: 10,
                          padding: '8px 12px', background: '#fef3c7', borderRadius: 6, textAlign: 'left',
                        }}>
                          尚未配置 PPT 模板，第 3 步（生成课件）将跳过。可随时前往「模板管理」上传。
                        </div>
                      )}
                      <button className="btn btn-primary" onClick={() => setStep('create')} disabled={!hasProviders}>
                        下一步：创建项目
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step: create ── */}
          {step === 'create' && (
            <div>
              <h3 style={{ margin: '0 0 16px 0' }}>创建第一个项目</h3>
              <div className="form-label">项目名称</div>
              <input className="form-input" value={projName} onChange={e => setProjName(e.target.value)} placeholder="餐饮食品安全培训" />
              <div className="form-label" style={{ marginTop: 16 }}>素材内容（可直接使用示例）</div>
              <textarea className="form-input" value={sourceText} onChange={e => setSourceText(e.target.value)}
                rows={12} style={{ fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }} />
              {error && <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 10 }}>{error}</div>}
              <div style={{ textAlign: 'right', marginTop: 20 }}>
                <button className="btn btn-primary" onClick={handleCreateProject} disabled={loading}>
                  {loading ? '创建中...' : '创建并开始生成'}
                </button>
              </div>
            </div>
          )}

          {/* ── Stage 1-4 ── */}
          {['stage1', 'stage2', 'stage3', 'stage4'].includes(step) && (
            <div>
              <h3 style={{ margin: '0 0 16px 0' }}>
                {step === 'stage1' && '第 1 步：整理素材'}
                {step === 'stage2' && '第 2 步：生成培训文档'}
                {step === 'stage3' && '第 3 步：生成培训课件'}
                {step === 'stage4' && '第 4 步：生成演讲稿'}
              </h3>

              {!loading && !stage1Result && step === 'stage1' && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  AI 将读取你的素材内容，整理成结构清晰的 Markdown 文档。点击下方按钮开始。
                </p>
              )}
              {!loading && !stage2Result && step === 'stage2' && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  基于整理后的素材，AI 将生成一份完整的培训文档（包含目录、章节、总结）。
                </p>
              )}
              {!loading && !stage3Result && step === 'stage3' && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  基于文档内容，AI 将自动生成 PPT 培训课件（需要模板支持）。
                </p>
              )}
              {!loading && !stage4Result && step === 'stage4' && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  基于文档内容，AI 将撰写一篇口语化的演讲稿，适合现场培训使用。
                </p>
              )}

              {/* Results display */}
              {stage1Result && step === 'stage1' && (
                <div style={{
                  maxHeight: 350, overflow: 'auto', background: 'var(--card-bg)',
                  padding: 16, borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap',
                  border: '1px solid var(--border)', marginBottom: 16,
                }}>{stage1Result}</div>
              )}
              {stage2Result && step === 'stage2' && (
                <div style={{
                  maxHeight: 350, overflow: 'auto', background: 'var(--card-bg)',
                  padding: 16, borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap',
                  border: '1px solid var(--border)', marginBottom: 16,
                }}>{stage2Result}</div>
              )}
              {step === 'stage3' && stage3Log && (
                <div style={{
                  padding: 12, background: 'var(--card-bg)', borderRadius: 8, fontSize: 12,
                  color: 'var(--text-secondary)', marginBottom: 16,
                }}>{stage3Log}</div>
              )}
              {stage3Result && step === 'stage3' && (
                <div style={{
                  padding: 16, background: '#e8f5e9', borderRadius: 8, fontSize: 13,
                  color: '#2e7d32', marginBottom: 16,
                }}>
                  课件生成完成！包含 {stage3Result.total_slides || '多'} 页幻灯片。
                  {stage3Result.run_id && (
                    <div style={{ marginTop: 8 }}>
                      <a href={api.previewUrl(stage3Result.run_id)} target="_blank" rel="noreferrer"
                        style={{ color: 'var(--primary)', fontSize: 12 }}>预览课件 →</a>
                    </div>
                  )}
                </div>
              )}
              {stage4Result && step === 'stage4' && (
                <div style={{
                  maxHeight: 350, overflow: 'auto', background: 'var(--card-bg)',
                  padding: 16, borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap',
                  border: '1px solid var(--border)', marginBottom: 16,
                }}>{stage4Result}</div>
              )}

              {loading && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                  生成中，请耐心等待...
                </div>
              )}

              {error && (
                <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 16, padding: 8, background: '#fff3e0', borderRadius: 6 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 20 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  const steps: WizardStep[] = ['stage1', 'stage2', 'stage3', 'stage4']
                  const idx = steps.indexOf(step)
                  setStep(idx > 0 ? steps[idx - 1] : 'create')
                  setError('')
                }}>
                  ← 上一步
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  {step === 'stage1' && !stage1Result && (
                    <button className="btn btn-primary" onClick={handleStage1} disabled={loading}>
                      {loading ? '生成中...' : '开始整理素材'}
                    </button>
                  )}
                  {step === 'stage1' && stage1Result && (
                    <button className="btn btn-primary" onClick={() => { setStep('stage2'); setError('') }}>
                      下一步：生成文档 →
                    </button>
                  )}
                  {step === 'stage2' && !stage2Result && (
                    <button className="btn btn-primary" onClick={handleStage2} disabled={loading}>
                      {loading ? '生成中...' : '开始生成文档'}
                    </button>
                  )}
                  {step === 'stage2' && stage2Result && (
                    <button className="btn btn-primary" onClick={() => { setStep('stage3'); setError('') }}>
                      下一步：生成课件 →
                    </button>
                  )}
                  {step === 'stage3' && !stage3Result && !stage3Log && (
                    <button className="btn btn-primary" onClick={handleStage3} disabled={loading}>
                      {loading ? '生成中...' : '开始生成课件'}
                    </button>
                  )}
                  {step === 'stage3' && (stage3Result || stage3Log) && (
                    <button className="btn btn-primary" onClick={() => { setStep('stage4'); setError('') }}>
                      下一步：生成演讲稿 →
                    </button>
                  )}
                  {step === 'stage4' && !stage4Result && (
                    <button className="btn btn-primary" onClick={handleStage4} disabled={loading}>
                      {loading ? '生成中...' : '开始生成演讲稿'}
                    </button>
                  )}
                  {step === 'stage4' && stage4Result && (
                    <button className="btn btn-primary" onClick={() => setStep('done')}>
                      完成 →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Step: done ── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
              <h3 style={{ margin: '0 0 8px 0' }}>恭喜！你已完成第一个培训项目</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 24 }}>
                你已经体验了从素材整理、文档生成、课件制作到演讲稿撰写的完整流程。<br/>
                在正式使用中，你可以上传更多素材、选择不同模板和风格。
              </p>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
                marginBottom: 28, textAlign: 'center',
              }}>
                {[
                  { icon: '📝', label: '素材整理', done: !!stage1Result },
                  { icon: '📄', label: '文档生成', done: !!stage2Result },
                  { icon: '📊', label: '课件制作', done: !!stage3Result },
                  { icon: '🎙', label: '演讲稿', done: !!stage4Result },
                ].map(item => (
                  <div key={item.label} style={{
                    padding: 16, borderRadius: 8,
                    background: item.done ? '#e8f5e9' : 'var(--card-bg)',
                    border: `1px solid ${item.done ? '#a5d6a7' : 'var(--border)'}`,
                  }}>
                    <div style={{ fontSize: 28 }}>{item.icon}</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: item.done ? 'var(--success)' : 'var(--text-secondary)' }}>
                      {item.done ? '✓ 已完成' : '未完成'}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-ghost" onClick={handleClose}>返回首页</button>
                <button className="btn btn-primary" onClick={handleViewProject}>进入项目查看</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
