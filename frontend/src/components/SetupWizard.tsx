import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'

const WIZARD_DONE_KEY = 'setup_wizard_done'

interface WizardProps {
  embedded?: boolean
  onDone?: () => void
}

type WizardStep = 'check' | 'quick-llm' | 'create' | 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'done'

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'check', label: '环境检查' },
  { key: 'create', label: '创建项目' },
  { key: 'stage1', label: '整理素材' },
  { key: 'stage2', label: '生成文档' },
  { key: 'stage3', label: '生成课件' },
  { key: 'stage4', label: '演讲配音' },
  { key: 'done', label: '完成' },
]

const SAMPLE_TEXT = `食品安全培训是餐饮行业的基础要求。所有从业人员必须掌握以下核心内容：

一、个人卫生规范
1. 工作前必须洗手消毒，穿戴清洁工作服
2. 不得佩戴首饰，指甲修剪整齐
3. 患有传染性疾病者不得从事食品加工

二、食品储存要求
1. 生熟食品分开存放，避免交叉污染
2. 冷藏食品温度保持在0-4°C，冷冻食品-18°C以下
3. 食品原料遵循"先进先出"原则

三、清洁消毒流程
1. 加工区域每日清洁消毒不少于2次
2. 刀具砧板按色标分类使用：红-生肉，蓝-海鲜，绿-蔬菜
3. 消毒液浓度符合国家标准

四、食品安全法律法规
1. 严格遵守《食品安全法》相关规定
2. 建立食品采购索证索票制度
3. 定期参加食品安全知识培训考核`

export default function SetupWizard({ embedded, onDone }: WizardProps) {
  const navigate = useNavigate()
  const [step, setStep] = useState<WizardStep>('check')
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Step: check
  const [checking, setChecking] = useState(true)
  const [hasProviders, setHasProviders] = useState(false)
  const [hasSeeds, setHasSeeds] = useState(false)
  const [providers, setProviders] = useState<any[]>([])

  // Step: quick-llm
  const [qlName, setQlName] = useState('')
  const [qlKey, setQlKey] = useState('')
  const [qlUrl, setQlUrl] = useState('https://api.deepseek.com/v1')
  const [qlModels, setQlModels] = useState('deepseek-chat, deepseek-reasoner')

  // Step: create
  const [projName, setProjName] = useState('我的第一个项目')
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
  const visibleSteps = STEPS.filter(s => s.key !== 'quick-llm')

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
    ]).then(([p, seeds]) => {
      if (cancelled) return
      setProviders(p)
      setHasProviders(p.length > 0)
      setHasSeeds(Array.isArray(seeds) && seeds.length > 0)
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

  // ── Step: Create Project ──
  const handleCreateProject = useCallback(async () => {
    if (!projName.trim()) { setError('请输入项目名称'); return }
    setLoading(true)
    setError('')
    try {
      // Find or create workspace
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
      // Get first available template
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
          <input className="form-input" value={qlModels} onChange={e => setQlModels(e.target.value)} placeholder="deepseek-chat, deepseek-reasoner" />
          {error && <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setStep('check'); setError('') }}>返回</button>
            <button className="btn btn-primary btn-sm" onClick={handleFixLLM} disabled={loading}>{loading ? '保存中...' : '保存并继续'}</button>
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
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', background: 'var(--card-bg)', borderRadius: 8, marginBottom: 8,
                  }}>
                    <div>
                      <strong>LLM 提供商</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>AI 生成功能的核心引擎</div>
                    </div>
                    <span style={{ color: hasProviders ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                      {hasProviders ? '✓ 已配置' : '✗ 未配置'}
                    </span>
                    {!hasProviders && (
                      <button className="btn btn-primary btn-sm" onClick={() => setStep('quick-llm')}>去配置</button>
                    )}
                  </div>
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
                      请先配置 LLM 提供商后再继续。点击「去配置」按钮快速添加。
                    </div>
                  ) : (
                    <div style={{ textAlign: 'right', marginTop: 20 }}>
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
              <input className="form-input" value={projName} onChange={e => setProjName(e.target.value)} placeholder="我的第一个项目" />
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
