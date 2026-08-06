import { useState, useEffect, useCallback } from 'react'
import SvgIcon from './SvgIcon'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getRoleManual } from '../config/roleManuals'
import { api } from '../services/api'

const WIZARD_DONE_KEY = 'setup_wizard_done'

interface WizardProps {
  embedded?: boolean
  onDone?: () => void
  dismissible?: boolean
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

// ── 会员角色引导步骤 ──
type MemberGuideStep = 'guide-browse' | 'guide-view' | 'guide-download' | 'guide-booklet' | 'guide-center' | 'guide-done'

const MEMBER_STEPS: { key: MemberGuideStep; label: string }[] = [
  { key: 'guide-browse', label: '浏览项目' },
  { key: 'guide-view', label: '查看内容' },
  { key: 'guide-download', label: '下载文件' },
  { key: 'guide-booklet', label: '电子成册' },
  { key: 'guide-center', label: '会员中心' },
  { key: 'guide-done', label: '完成' },
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

export default function SetupWizard({ embedded, onDone, dismissible = true }: WizardProps) {
  const navigate = useNavigate()
  const { user } = useAuth()

  const manual = user ? getRoleManual(user) : null
  // 会员角色（试用/付费）走简化引导；超管/内容管理员/开发体验员走完整向导
  const isMemberRole = !!(user && (user.roles.includes('试用会员') || user.roles.includes('付费会员') ||
    (user.user_type === 'member' && !user.roles.includes('开发体验员') && !user.roles.includes('内容管理员'))))

  const [step, setStep] = useState<WizardStep>('check')
  const [memberStep, setMemberStep] = useState<MemberGuideStep>('guide-browse')
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
  const [projName, setProjName] = useState('一勺笔录')
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

  // ── Step: System Check (admin only) ──
  useEffect(() => {
    if (step !== 'check') return
    let cancelled = false
    setChecking(true)
    Promise.all([
      api.listProviders().catch(() => []),
      api.listColumnConfigs().catch(() => []),
      api.listTemplates('style').catch(() => []),
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
      if (!dismissible) {
        onDone?.()
      } else {
        setStep('check')
      }
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
    setStage3Log('正在获取设计风格列表...')
    try {
      const p = providers[0]
      const model = (Array.isArray(p.models) ? p.models[0] : 'deepseek-chat') || 'deepseek-chat'
      const templates = await api.listTemplates().catch(() => [] as any[])
      const pptTemplates = (templates as any[]).filter((t: any) => t.type === 'ppt')
      const templateId = pptTemplates.length > 0 ? pptTemplates[0].id : ''
      if (!templateId) {
        setStage3Log('未找到 VI 设计风格，请在「模板管理」中启用风格。跳过此步骤。')
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
      setError(e.message || '课件生成失败，请检查设计风格和 LLM 配置')
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
    if (!dismissible) return
    setDismissed(true)
    localStorage.setItem(WIZARD_DONE_KEY, '1')
    document.body.style.overflow = ''
    onDone?.()
  }

  if (dismissed) return null

  // ═══════════════════════════════════════════════════════════
  // 会员角色引导（试用会员 / 付费会员）
  // ═══════════════════════════════════════════════════════════
  if (isMemberRole) {
    const isPaid = user?.permissions.includes('stage5.download')
    const mi = MEMBER_STEPS.findIndex(s => s.key === memberStep)

    return (
      <div className="dialog-overlay" style={{ zIndex: 9999 }}>
        <div style={{
          background: 'var(--bg)', borderRadius: 12, width: 680, maxHeight: '90vh',
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
                {isPaid ? '付费会员使用指南' : '试用会员使用指南'}
              </div>
            </div>
            {dismissible && <button className="btn btn-ghost btn-sm" onClick={handleClose} style={{ fontSize: 20, padding: '2px 8px' }}>x</button>}
          </div>

          {/* Step indicators */}
          <div style={{
            display: 'flex', gap: 0, padding: '12px 28px',
            borderBottom: '1px solid var(--border)', overflowX: 'auto',
          }}>
            {MEMBER_STEPS.filter(s => s.key !== 'guide-download' || isPaid).map((s, i) => {
              const idx = MEMBER_STEPS.findIndex(x => x.key === s.key)
              const current = MEMBER_STEPS.findIndex(x => x.key === memberStep)
              const done = idx < current
              const active = idx === current
              return (
                <div key={s.key}
                  title={s.label}
                  style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 11, whiteSpace: 'nowrap',
                  color: active ? 'var(--primary)' : done ? 'var(--success)' : 'var(--text-secondary)',
                  fontWeight: active ? 600 : 400, cursor: 'default', userSelect: 'none',
                }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, height: 20, borderRadius: '50%',
                    background: active ? 'var(--primary)' : done ? 'var(--success)' : 'var(--border)',
                    color: active || done ? '#fff' : 'var(--text-secondary)',
                    fontSize: 11, fontWeight: 700,
                  }}>
                    {done ? <SvgIcon name="check" size={12} /> : idx + 1}
                  </span>
                  {s.label}
                  {i < MEMBER_STEPS.filter(s => s.key !== 'guide-download' || isPaid).length - 1 && (
                    <span style={{ margin: '0 4px', color: 'var(--border)' }}>→</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Content area */}
          <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
            {memberStep === 'guide-browse' && (
              <div>
                <h3 style={{ margin: '0 0 12px 0' }}>浏览您的项目</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  登录后，您可以在「项目管理」页面看到所有已授权工作区中的项目。
                  每个项目包含 AI 生成的完整内容：素材整理、文档、课件、演讲稿。
                </p>
                <div style={{ fontSize: 11, color: 'var(--primary)', margin: '8px 0 16px', cursor: 'pointer', textDecoration: 'underline' }}
                   onClick={() => { handleClose(); navigate('/') }}>
                  → 前往项目管理页面查看
                </div>
                <div style={{ padding: 16, background: 'var(--card-bg)', borderRadius: 8, fontSize: 12, lineHeight: 2 }}>
                  <strong>操作要点：</strong>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: 18 }}>
                    <li>左侧工作区列表展示您有权限访问的全部工作区</li>
                    <li>点击工作区进入，可看到该工作区下的所有项目卡片</li>
                    <li>项目卡片显示项目名称、分类、状态等信息</li>
                  </ul>
                </div>
                <div style={{ textAlign: 'right', marginTop: 20 }}>
                  <button className="btn btn-primary" onClick={() => setMemberStep('guide-view')}>
                    下一步：查看内容 →
                  </button>
                </div>
              </div>
            )}

            {memberStep === 'guide-view' && (
              <div>
                <h3 style={{ margin: '0 0 12px 0' }}>查看项目内容</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  点击项目可进入详情页，按五阶段查看 AI 生成的内容。您可以在左侧阶段导航中切换不同阶段的产出：
                </p>
                <div style={{ padding: 16, background: 'var(--card-bg)', borderRadius: 8, fontSize: 12, lineHeight: 2 }}>
                  <strong>五阶段流水线：</strong>
                  <ol style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                    <li><strong>文案提取</strong> — AI 从视频/文字/文件中提取结构化素材</li>
                    <li><strong>教学文档</strong> — 生成 SOP 标准文档、分析文档、综合文档</li>
                    <li><strong>输出课件</strong> — HTML/SVG 幻灯片，支持预览</li>
                    <li><strong>语音课件</strong> — 演讲稿 + TTS 配音</li>
                    <li><strong>输出列表</strong> — 所有产物的统一清单</li>
                  </ol>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'space-between' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setMemberStep('guide-browse')}>← 上一步</button>
                  <button className="btn btn-primary" onClick={() => setMemberStep(isPaid ? 'guide-download' : 'guide-booklet')}>
                    下一步：{isPaid ? '下载文件' : '电子成册'} →
                  </button>
                </div>
              </div>
            )}

            {memberStep === 'guide-download' && isPaid && (
              <div>
                <h3 style={{ margin: '0 0 12px 0' }}>下载文件</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  付费会员可以将项目中的课件、文档、音频等文件下载到本地。
                </p>
                <div style={{ fontSize: 11, color: 'var(--primary)', margin: '8px 0 16px', cursor: 'pointer', textDecoration: 'underline' }}
                   onClick={() => { handleClose(); navigate('/app/downloads') }}>
                  → 前往下载文件页面
                </div>
                <div style={{ padding: 16, background: 'var(--card-bg)', borderRadius: 8, fontSize: 12, lineHeight: 2 }}>
                  <strong>下载方式：</strong>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: 18 }}>
                    <li><strong>左侧勾选项目</strong> — 选择要下载的项目（可多选）</li>
                    <li><strong>右侧勾选文件</strong> — 每个项目下的文件可逐个勾选</li>
                    <li><strong>单文件下载</strong> — 点击文件旁的「<SvgIcon name="download" size={14} /> 下载」按钮</li>
                    <li><strong>批量下载</strong> — 勾选多个文件后点击「<SvgIcon name="package" size={14} /> 批量下载」，打包为一个 zip</li>
                    <li><strong>预览文件</strong> — 点击「<SvgIcon name="eye" size={14} /> 预览」可在下载前查看文件内容</li>
                    <li>未解锁项目需先消耗积分解锁后才能下载</li>
                  </ul>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'space-between' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setMemberStep('guide-view')}>← 上一步</button>
                  <button className="btn btn-primary" onClick={() => setMemberStep('guide-booklet')}>
                    下一步：电子成册 →
                  </button>
                </div>
              </div>
            )}

            {memberStep === 'guide-booklet' && (
              <div>
                <h3 style={{ margin: '0 0 12px 0' }}>电子成册</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  电子成册功能可以将多个项目的内容编排成一本完整的电子书，支持自定义页面排列、封面设计和导出。
                </p>
                <div style={{ fontSize: 11, color: 'var(--primary)', margin: '8px 0 16px', cursor: 'pointer', textDecoration: 'underline' }}
                   onClick={() => { handleClose(); navigate('/app/booklets') }}>
                  → 前往我的册子页面
                </div>
                <div style={{ padding: 16, background: 'var(--card-bg)', borderRadius: 8, fontSize: 12, lineHeight: 2 }}>
                  <strong>操作流程：</strong>
                  <ol style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                    <li>点击「新建成册」创建一本新册子</li>
                    <li>从已授权的项目中添加页面内容</li>
                    <li>拖拽调整页面顺序</li>
                    <li>选择封面模板和配色方案</li>
                    <li>预览并导出为 PDF 或 HTML</li>
                  </ol>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'space-between' }}>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => setMemberStep(isPaid ? 'guide-download' : 'guide-view')}>← 上一步</button>
                  <button className="btn btn-primary" onClick={() => setMemberStep('guide-center')}>
                    下一步：会员中心 →
                  </button>
                </div>
              </div>
            )}

            {memberStep === 'guide-center' && (
              <div>
                <h3 style={{ margin: '0 0 12px 0' }}>会员中心</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  会员中心展示您的账户信息、积分余额、会员有效期和积分流水记录。
                </p>
                <div style={{ fontSize: 11, color: 'var(--primary)', margin: '8px 0 16px', cursor: 'pointer', textDecoration: 'underline' }}
                   onClick={() => { handleClose(); navigate('/app/center') }}>
                  → 前往会员中心
                </div>
                <div style={{ padding: 16, background: 'var(--card-bg)', borderRadius: 8, fontSize: 12, lineHeight: 2 }}>
                  <strong>会员中心功能：</strong>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: 18 }}>
                    <li><strong>积分余额</strong> — 查看当前可用积分，用于解锁项目下载</li>
                    <li><strong>会员有效期</strong> — {isPaid ? '付费会员享永久有效' : '试用会员查看剩余试用天数'}</li>
                    <li><strong>积分充值</strong> — 点击「积分充值」获取更多积分</li>
                    <li><strong>积分明细</strong> — 查看积分获取和消费的完整记录</li>
                  </ul>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'space-between' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setMemberStep('guide-booklet')}>← 上一步</button>
                  <button className="btn btn-primary" onClick={() => setMemberStep('guide-done')}>
                    完成 →
                  </button>
                </div>
              </div>
            )}

            {memberStep === 'guide-done' && (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}><SvgIcon name="sparkles" size={48} /></div>
                <h3 style={{ margin: '0 0 8px 0' }}>新手引导完成！</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>
                  您已了解会员的核心功能操作流程。<br/>
                  如需查看详细操作说明，可随时点击左侧「操作说明」。
                </p>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
                  marginBottom: 28, textAlign: 'center',
                }}>
                  {[
                    { icon: 'clipboard', label: '浏览项目', desc: '查看内容' },
                    { icon: 'eye', label: '查看文件', desc: '预览产物' },
                    ...(isPaid ? [{ icon: 'download', label: '下载文件', desc: '保存到本地' }] : []),
                    { icon: 'book-open', label: '电子成册', desc: '编排导出' },
                  ].slice(0, 4).map(item => (
                    <div key={item.label} style={{
                      padding: 16, borderRadius: 8, background: '#e8f5e9',
                      border: '1px solid #a5d6a7',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'center' }}><SvgIcon name={item.icon} size={28} /></div>
                      <div style={{ fontSize: 11, marginTop: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--success)' }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
                <button className="btn btn-primary" onClick={handleClose}>开始使用</button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // 管理端完整向导（超管 / 内容管理员 / 开发体验员）
  // ═══════════════════════════════════════════════════════════

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

  // ── Main wizard (admin) ──
  const isSuperAdmin = user?.roles.includes('超级管理员')

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
              {isSuperAdmin ? '跟随向导完成系统初始化和第一个培训项目' : '跟随向导完成第一个培训项目'}
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
              <div key={s.key}
                onClick={() => setStep(s.key)}
                title={`跳转到：${s.label}`}
                style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, whiteSpace: 'nowrap',
                color: active ? 'var(--primary)' : done ? 'var(--success)' : 'var(--text-secondary)',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer', userSelect: 'none',
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 20, height: 20, borderRadius: '50%',
                  background: active ? 'var(--primary)' : done ? 'var(--success)' : 'var(--border)',
                  color: active || done ? '#fff' : 'var(--text-secondary)',
                  fontSize: 11, fontWeight: 700,
                }}>
                  {done ? <SvgIcon name="check" size={12} /> : idx + 1}
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
                      <div style={{ fontSize: 10, color: 'var(--primary)', marginTop: 2, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                           onClick={() => { handleClose(); navigate('/proj-settings') }}>
                        → 侧边栏「全局配置」→ 模型设置
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: hasProviders ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                        {hasProviders ? <><SvgIcon name="check" size={12} /> 已配置</> : <><SvgIcon name="x-mark" size={12} /> 未配置</>}
                      </span>
                      {!hasProviders && (
                        <button className="btn btn-primary btn-sm" onClick={() => setStep('quick-llm')}>去配置</button>
                      )}
                    </div>
                  </div>

                  {/* VI Design Style */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', background: 'var(--card-bg)', borderRadius: 8, marginBottom: 8,
                  }}>
                    <div>
                      <strong>VI 设计风格</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>课件生成所需的 VI 设计风格</div>
                      <div style={{ fontSize: 10, color: 'var(--primary)', marginTop: 2, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                           onClick={() => { handleClose(); navigate('/templates') }}>
                        → 侧边栏「模板管理」
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: hasTemplates ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                        {hasTemplates ? <><SvgIcon name="check" size={12} /> 已配置</> : <><SvgIcon name="x-mark" size={12} /> 未配置</>}
                      </span>
                      {!hasTemplates && (
                        <button className="btn btn-outline btn-sm" onClick={() => { handleClose(); navigate('/templates') }}>
                          去模板管理
                        </button>
                      )}
                    </div>
                  </div>

                  {/* TTS Provider */}
                  {isSuperAdmin && (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', background: 'var(--card-bg)', borderRadius: 8, marginBottom: 8,
                    }}>
                      <div>
                        <strong>TTS 提供商</strong>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>语音合成引擎，用于生成课件配音</div>
                        <div style={{ fontSize: 10, color: 'var(--primary)', marginTop: 2, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                             onClick={() => { handleClose(); navigate('/proj-settings') }}>
                          → 侧边栏「全局配置」→ 模型设置
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: hasTtsProviders ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                          {hasTtsProviders ? <><SvgIcon name="check" size={12} /> 已配置</> : <><SvgIcon name="x-mark" size={12} /> 未配置</>}
                        </span>
                        {!hasTtsProviders && (
                          <button className="btn btn-primary btn-sm" onClick={() => setStep('quick-tts')}>去配置</button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Seed prompts */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', background: 'var(--card-bg)', borderRadius: 8, marginBottom: 8,
                  }}>
                    <div>
                      <strong>种子提示词</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>系统预设的提示词配置，确保生成质量</div>
                      <div style={{ fontSize: 10, color: 'var(--primary)', marginTop: 2, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                           onClick={() => { handleClose(); navigate('/proj-settings') }}>
                        → 侧边栏「全局配置」→ 默认提示词
                      </div>
                    </div>
                    <span style={{ color: hasSeeds ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                      {hasSeeds ? <><SvgIcon name="check" size={12} /> 已加载</> : <><SvgIcon name="x-mark" size={12} /> 未加载</>}
                    </span>
                  </div>

                  {!hasProviders ? (
                    <div style={{
                      marginTop: 16, padding: 12, background: '#fef3c7', borderRadius: 8,
                      fontSize: 12, color: '#92400e',
                    }}>
                      LLM 提供商是必须项。请先点击「去配置」添加一个 LLM 提供商后再继续。
                      {!hasTemplates && ' VI 设计风格可在流程中跳过，之后可随时在「模板管理」中启用。'}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'right', marginTop: 20 }}>
                      {!hasTemplates && (
                        <div style={{
                          fontSize: 11, color: '#92400e', marginBottom: 10,
                          padding: '8px 12px', background: '#fef3c7', borderRadius: 6, textAlign: 'left',
                        }}>
                          尚未启用 VI 设计风格，第 3 步（生成课件）将跳过。可随时前往「模板管理」启用设计风格。
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
              <h3 style={{ margin: '0 0 8px 0' }}>创建第一个项目</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px 0', lineHeight: 1.6 }}>
                项目是所有培训内容的管理单元，每个项目包含完整的 5 阶段流水线（文案提取 → 教学文档 → 输出课件 → 语音课件 → 输出列表）。
              </p>
              <div style={{ fontSize: 10, color: 'var(--primary)', marginBottom: 16, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                   onClick={() => { handleClose(); navigate('/') }}>
                → 侧边栏「项目管理」→ 点击「+ 新建项目」
              </div>
              <div className="form-label">项目名称</div>
              <input className="form-input" value={projName} onChange={e => setProjName(e.target.value)} placeholder="一勺笔录" />
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
              <h3 style={{ margin: '0 0 8px 0' }}>
                {step === 'stage1' && '第 1 步：整理素材'}
                {step === 'stage2' && '第 2 步：生成培训文档'}
                {step === 'stage3' && '第 3 步：生成培训课件'}
                {step === 'stage4' && '第 4 步：生成演讲稿'}
              </h3>

              {/* Step description + location */}
              {step === 'stage1' && (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px 0', lineHeight: 1.6 }}>
                    AI 将原始文本/视频/文件内容整理为结构化素材，提取关键知识点和操作步骤。
                  </p>
                  <div style={{ fontSize: 10, color: 'var(--primary)', marginBottom: 16, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                       onClick={() => { if (projectId) { handleClose(); navigate(`/project/${projectId}/workspace`) } }}>
                    → 项目详情「阶段 1 · 文案提取」
                  </div>
                </>
              )}
              {step === 'stage2' && (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px 0', lineHeight: 1.6 }}>
                    AI 基于素材并发生成 3 份教学文档：SOP 标准文档（操作规范）、道与术（理论+方法）、研学手册（学习指南）。
                  </p>
                  <div style={{ fontSize: 10, color: 'var(--primary)', marginBottom: 16, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                       onClick={() => { if (projectId) { handleClose(); navigate(`/project/${projectId}/workspace`) } }}>
                    → 项目详情「阶段 2 · 教学文档」
                  </div>
                </>
              )}
              {step === 'stage3' && (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px 0', lineHeight: 1.6 }}>
                    AI 将文档转化为 HTML/SVG 幻灯片，支持选择 VI 设计风格和配色方案，生成后可逐页预览编辑。
                  </p>
                  <div style={{ fontSize: 10, color: 'var(--primary)', marginBottom: 16, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                       onClick={() => { if (projectId) { handleClose(); navigate(`/project/${projectId}/workspace`) } }}>
                    → 项目详情「阶段 3 · 输出课件」
                  </div>
                </>
              )}
              {step === 'stage4' && (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px 0', lineHeight: 1.6 }}>
                    AI 撰写口语化演讲稿（含开场白、停顿、重点强调标注），配合 TTS 语音合成为 .mp3 音频文件。
                  </p>
                  <div style={{ fontSize: 10, color: 'var(--primary)', marginBottom: 16, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                       onClick={() => { if (projectId) { handleClose(); navigate(`/project/${projectId}/workspace`) } }}>
                    → 项目详情「阶段 4 · 语音课件」
                  </div>
                </>
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
              <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}><SvgIcon name="sparkles" size={48} /></div>
              <h3 style={{ margin: '0 0 8px 0' }}>恭喜！你已完成第一个培训项目</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>
                你已经体验了从素材整理、文档生成、课件制作到演讲稿撰写的完整流程。<br/>
                在正式使用中，你可以上传更多素材、选择不同模板和风格。
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: 1.6 }}>
                点击下方「进入项目查看」前往完整的项目工作台，使用完整 5 阶段流水线：<br/>
                文案提取 → 教学文档 → 输出课件 → 语音课件 → 输出列表
              </p>
              <div style={{ fontSize: 10, color: 'var(--primary)', marginBottom: 24, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                   onClick={() => { if (projectId) { handleClose(); navigate(`/project/${projectId}/workspace`) } }}>
                → 侧边栏「项目管理」→ 选择项目 → 进入项目详情页
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
                marginBottom: 28, textAlign: 'center',
              }}>
                {[
                  { icon: 'file-text', label: '素材整理', done: !!stage1Result },
                  { icon: 'file-text', label: '文档生成', done: !!stage2Result },
                  { icon: 'bar-chart', label: '课件制作', done: !!stage3Result },
                  { icon: 'music', label: '演讲稿', done: !!stage4Result },
                ].map(item => (
                  <div key={item.label} style={{
                    padding: 16, borderRadius: 8,
                    background: item.done ? '#e8f5e9' : 'var(--card-bg)',
                    border: `1px solid ${item.done ? '#a5d6a7' : 'var(--border)'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}><SvgIcon name={item.icon} size={28} /></div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: item.done ? 'var(--success)' : 'var(--text-secondary)' }}>
                      {item.done ? <><SvgIcon name="check" size={12} /> 已完成</> : '未完成'}
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
