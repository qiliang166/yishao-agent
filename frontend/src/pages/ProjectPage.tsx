import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import AICollabEditor from '../components/Editor/AICollabEditor'

interface DownloadState {
  status: 'idle' | 'downloading' | 'done'
  progress: number
  filename: string
  sizeBytes: number
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function downloadWithProgress(
  url: string,
  filename: string,
  onState: (s: DownloadState) => void
): Promise<void> {
  onState({ status: 'downloading', progress: 0, filename, sizeBytes: 0 })
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const total = Number(res.headers.get('content-length') || 0)
    const reader = res.body?.getReader()
    if (!reader) throw new Error('无法读取响应流')
    const chunks: BlobPart[] = []
    let received = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        received += value.length
        onState({
          status: 'downloading',
          progress: total > 0 ? Math.round((received / total) * 100) : -1,
          filename,
          sizeBytes: received,
        })
      }
    }
    const blob = new Blob(chunks)
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(objectUrl)
    onState({ status: 'done', progress: 100, filename, sizeBytes: blob.size })
  } catch (err: any) {
    onState({ status: 'done', progress: -1, filename: err.message, sizeBytes: 0 })
  }
}

interface Project {
  id: string
  name: string
  status: string
  source_type: string
  created_at: string
  updated_at: string
}

interface StepResult {
  step_name: string
  content: string
  content_type: string
  status: string
  updated_at?: string
}

type InputMode = 'link' | 'text' | 'file'
type StepStatus = 'pending' | 'in_progress' | 'done'

interface VideoProgress {
  task_id: string
  status: string
  percent: number
  text: string
  error?: string
}

const ALL_STEP_KEYS = ['step1', 'step2', 'step3_daoshuyi', 'step3_yanxi', 'step3_sop', 'step4']

function DownloadButton({
  url, filename, label, state, onStateChange,
}: {
  url: string
  filename: string
  label: string
  state?: DownloadState
  onStateChange: (s: DownloadState) => void
}) {
  const handleDownload = () => {
    if (state?.status === 'downloading') return
    downloadWithProgress(url, filename, onStateChange)
  }

  const btnStyle: React.CSSProperties = {
    fontSize: 12,
    padding: '4px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    background: state?.status === 'done' && state.progress > 0 ? '#F0F7F0' : 'var(--color-card)',
    color: state?.status === 'done' && state.progress > 0 ? 'var(--color-success)' : 'var(--color-primary)',
    cursor: state?.status === 'downloading' ? 'wait' : 'pointer',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.2s',
  }

  if (!state || state.status === 'idle') {
    return (
      <button onClick={handleDownload} style={btnStyle}>
        {label}
      </button>
    )
  }

  if (state.status === 'downloading') {
    const pct = state.progress >= 0 ? `${state.progress}%` : '...'
    const barStyle: React.CSSProperties = {
      width: 80,
      height: 4,
      background: 'var(--color-border)',
      borderRadius: 2,
      overflow: 'hidden',
    }
    const fillStyle: React.CSSProperties = {
      width: state.progress >= 0 ? `${state.progress}%` : '30%',
      height: '100%',
      background: 'var(--color-primary)',
      borderRadius: 2,
      transition: 'width 0.3s',
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span style={barStyle}><span style={fillStyle} /></span>
        <span style={{ color: 'var(--color-text-secondary)' }}>{pct}</span>
        <span style={{ color: 'var(--color-text-secondary)' }}>{formatFileSize(state.sizeBytes)}</span>
      </span>
    )
  }

  // Done
  if (state.progress < 0) {
    return (
      <span style={{ fontSize: 12, color: 'var(--color-warning)' }}>
        下载失败: {state.filename}
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
        下载完成
      </span>
      <span style={{ color: 'var(--color-text-secondary)' }}>
        {state.filename} ({formatFileSize(state.sizeBytes)})
      </span>
    </span>
  )
}

function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [inputMode, setInputMode] = useState<InputMode>('link')
  const [urlInput, setUrlInput] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [videoProgress, setVideoProgress] = useState<VideoProgress | null>(null)
  const [subtitleContent, setSubtitleContent] = useState('')
  const [textInput, setTextInput] = useState('')
  const [saving, setSaving] = useState(false)

  const initialStatuses: Record<string, StepStatus> = {}
  const initialContents: Record<string, string> = {}
  for (const k of ALL_STEP_KEYS) {
    initialStatuses[k] = 'pending'
    initialContents[k] = ''
  }

  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>(initialStatuses)
  const [stepContents, setStepContents] = useState<Record<string, string>>(initialContents)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)

  // Saving indicators for individual step3 sub-steps
  const [savingSubStep, setSavingSubStep] = useState<string | null>(null)

  // ── Step 4 state ──
  const [pptResults, setPptResults] = useState<Record<string, {filename: string, download_url: string} | null>>({})
  const [sopResult, setSopResult] = useState<{filename: string, download_url: string} | null>(null)
  const [voiceoverTexts, setVoiceoverTexts] = useState<Record<string, string>>({dao: '', yanxi: ''})
  const [ttsResults, setTtsResults] = useState<Record<string, {audio_url: string, filename: string} | null>>({dao: null, yanxi: null})

  const [generatingPpt, setGeneratingPpt] = useState<string | null>(null)
  const [exportingSop, setExportingSop] = useState(false)
  const [generatingVoiceover, setGeneratingVoiceover] = useState<string | null>(null)
  const [synthesizingTts, setSynthesizingTts] = useState<string | null>(null)

  const [fileDownloads, setFileDownloads] = useState<Record<string, DownloadState>>({})

  const [pptBranding, setPptBranding] = useState({copyright: '', signature: ''})
  const [sopBranding, setSopBranding] = useState({copyright: '', signature: ''})

  const [pptTemplates, setPptTemplates] = useState<any[]>([])
  const [sopTemplates, setSopTemplates] = useState<any[]>([])
  const [selectedPptTemplateId, setSelectedPptTemplateId] = useState('')
  const [selectedSopTemplateId, setSelectedSopTemplateId] = useState('')

  const [voiceoverProviderId, setVoiceoverProviderId] = useState('')
  const [voiceoverModel, setVoiceoverModel] = useState('')
  const [voiceoverPromptId, setVoiceoverPromptId] = useState('')

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load project and steps on mount
  useEffect(() => {
    if (!id) return
    Promise.all([
      api.getProject(id),
      api.getSteps(id).catch(() => [] as StepResult[]),
    ])
      .then(([projectData, steps]) => {
        setProject(projectData as Project)
        const stepsArr = steps as StepResult[]
        const newStatuses: Record<string, StepStatus> = { ...initialStatuses }
        const newContents: Record<string, string> = { ...initialContents }
        for (const s of stepsArr) {
          const key = s.step_name
          // Map known keys
          if (ALL_STEP_KEYS.includes(key) || key.startsWith('step3_')) {
            if (s.content) {
              newContents[key] = s.content
              newStatuses[key] = 'done'
            } else if (s.status === 'in_progress') {
              newStatuses[key] = 'in_progress'
            }
          }
        }
        setStepStatuses(newStatuses)
        setStepContents(newContents)
        // Populate step1 content into the editor
        if (newContents.step1) {
          setSubtitleContent(newContents.step1)
          setTextInput(newContents.step1)
        }
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load project:', err)
        setLoading(false)
      })
  }, [id])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  const step3Done =
    stepStatuses.step3_daoshuyi === 'done' &&
    stepStatuses.step3_yanxi === 'done' &&
    stepStatuses.step3_sop === 'done'

  const step3StatusForDisplay: StepStatus = step3Done ? 'done'
    : (stepStatuses.step3_daoshuyi === 'in_progress' ||
       stepStatuses.step3_yanxi === 'in_progress' ||
       stepStatuses.step3_sop === 'in_progress')
      ? 'in_progress'
      : 'pending'

  // Load templates, providers, and voiceover prompt when step3 is done
  useEffect(() => {
    if (!step3Done) return
    api.listTemplates('ppt').then((data: any[]) => setPptTemplates(data || [])).catch(() => {})
    api.listTemplates('sop').then((data: any[]) => setSopTemplates(data || [])).catch(() => {})
    api.listPrompts('口播稿').then((prompts: any[]) => {
      if (prompts.length > 0) {
        setVoiceoverPromptId(prompts[0].id)
      }
    }).catch(() => {})
    api.listProviders().then((providers: any[]) => {
      const enabled = providers.filter((p: any) => p.is_enabled !== 0)
      if (enabled.length > 0) {
        setVoiceoverProviderId(enabled[0].id)
        const models = typeof enabled[0].models === 'string' ? JSON.parse(enabled[0].models) : (enabled[0].models || [])
        if (models.length > 0) setVoiceoverModel(models[0])
      }
    }).catch(() => {})
  }, [step3Done])

  const clearMessage = () => setMessage(null)

  const setStepContent = (key: string, content: string) => {
    setStepContents(prev => ({ ...prev, [key]: content }))
  }

  const startDownload = async () => {
    if (!urlInput.trim()) return
    setDownloading(true)
    setVideoProgress(null)
    setSubtitleContent('')
    setStepStatuses(prev => ({ ...prev, step1: 'in_progress' }))

    try {
      const res = await api.downloadVideo(urlInput.trim())
      const tid = (res as any).task_id
      setTaskId(tid)

      pollingRef.current = setInterval(async () => {
        try {
          const prog = await api.getVideoProgress(tid) as VideoProgress
          setVideoProgress(prog)

          if (prog.status === 'completed') {
            if (pollingRef.current) clearInterval(pollingRef.current)
            setDownloading(false)
            setSubtitleContent(prog.text || '')
            setStepStatuses(prev => ({ ...prev, step1: 'done' }))
            setMessage({ text: '视频下载完成', type: 'success' })
          } else if (prog.status === 'failed') {
            if (pollingRef.current) clearInterval(pollingRef.current)
            setDownloading(false)
            setStepStatuses(prev => ({ ...prev, step1: 'pending' }))
            setMessage({ text: prog.error || '下载失败', type: 'error' })
          }
        } catch {
          // Polling error — keep trying
        }
      }, 2000)
    } catch (err: any) {
      setDownloading(false)
      setStepStatuses(prev => ({ ...prev, step1: 'pending' }))
      setMessage({ text: '开始下载失败：' + err.message, type: 'error' })
    }
  }

  const cancelDownload = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    setDownloading(false)
    setVideoProgress(null)
    setStepStatuses(prev => ({ ...prev, step1: 'pending' }))
    setMessage({ text: '已取消下载', type: 'info' })
  }

  const saveStep = async () => {
    if (!id) return
    setSaving(true)
    const content = inputMode === 'text' ? textInput : subtitleContent
    try {
      await api.saveStep(id, 'step1', content)
      setStepStatuses(prev => ({ ...prev, step1: content ? 'done' : 'pending' }))
      setStepContents(prev => ({ ...prev, step1: content }))
      setMessage({ text: '已保存到项目', type: 'success' })
    } catch (err: any) {
      setMessage({ text: '保存失败：' + err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const confirmStep2 = async () => {
    if (!id) return
    const content = stepContents.step2
    if (!content) return
    setSaving(true)
    try {
      await api.saveStep(id, 'step2', content)
      setStepStatuses(prev => ({ ...prev, step2: 'done' }))
      setStepContents(prev => ({ ...prev, step2: content }))
      setMessage({ text: '步骤 2 已完成，步骤 3 已解锁', type: 'success' })
    } catch (err: any) {
      setMessage({ text: '保存失败：' + err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const saveSubStep = async (stepName: string, content: string) => {
    if (!id || !content) return
    setSavingSubStep(stepName)
    try {
      await api.saveStep(id, stepName, content)
      setStepStatuses(prev => ({ ...prev, [stepName]: 'done' }))
      setStepContents(prev => ({ ...prev, [stepName]: content }))
      setMessage({ text: `已保存`, type: 'success' })
    } catch (err: any) {
      setMessage({ text: '保存失败：' + err.message, type: 'error' })
    } finally {
      setSavingSubStep(null)
    }
  }

  const saveOverallProgress = async () => {
    if (!id || !project) return
    try {
      const hasStep1 = stepContents.step1 || subtitleContent || textInput
      await api.updateProject(id, {
        name: project.name,
        status: hasStep1 ? 'in_progress' : 'draft',
      })
      setMessage({ text: '进度已保存', type: 'success' })
    } catch (err: any) {
      setMessage({ text: '保存失败：' + err.message, type: 'error' })
    }
  }

  // ── Step 4 Handlers ──

  const generatePptHandler = async (key: 'dao' | 'yanxi') => {
    const contentKey = key === 'dao' ? 'step3_daoshuyi' : 'step3_yanxi'
    const content = stepContents[contentKey]
    if (!content) {
      setMessage({ text: '请先完成对应文档的生成', type: 'error' })
      return
    }
    setGeneratingPpt(key)
    try {
      const branding = pptBranding.copyright || pptBranding.signature ? pptBranding : undefined
      const result = await api.generatePPT(content, selectedPptTemplateId || undefined, branding as any)
      setPptResults(prev => ({ ...prev, [key]: result as any }))
      setMessage({ text: `${key === 'dao' ? '道与术' : '研习手册'} PPT 生成成功`, type: 'success' })
    } catch (err: any) {
      setMessage({ text: 'PPT 生成失败：' + err.message, type: 'error' })
    } finally {
      setGeneratingPpt(null)
    }
  }

  const exportSopHandler = async () => {
    const content = stepContents.step3_sop
    if (!content) {
      setMessage({ text: '请先完成 SOP 文档的生成', type: 'error' })
      return
    }
    setExportingSop(true)
    try {
      const branding = sopBranding.copyright || sopBranding.signature ? sopBranding : undefined
      const result = await api.exportSOP(content, branding as any)
      setSopResult(result as any)
      setMessage({ text: 'SOP 文档导出成功', type: 'success' })
    } catch (err: any) {
      setMessage({ text: 'SOP 导出失败：' + err.message, type: 'error' })
    } finally {
      setExportingSop(false)
    }
  }

  const generateVoiceoverHandler = async (key: 'dao' | 'yanxi') => {
    const contentKey = key === 'dao' ? 'step3_daoshuyi' : 'step3_yanxi'
    const content = stepContents[contentKey]
    if (!content) {
      setMessage({ text: '请先完成对应文档的生成', type: 'error' })
      return
    }
    if (!voiceoverProviderId || !voiceoverModel || !voiceoverPromptId) {
      setMessage({ text: '请先在设置中配置 LLM 提供方和口播稿提示词', type: 'error' })
      return
    }
    setGeneratingVoiceover(key)
    try {
      // Get the voiceover prompt
      const prompt = await api.getPrompt(voiceoverPromptId)
      const systemPrompt = prompt.system_prompt || ''
      const result = await api.llmGenerate({
        provider_id: voiceoverProviderId,
        model: voiceoverModel,
        system_prompt: systemPrompt,
        user_message: content,
      })
      const text = (result as any).content || ''
      setVoiceoverTexts(prev => ({ ...prev, [key]: text }))
      setMessage({ text: `${key === 'dao' ? '道与术' : '研习手册'} 口播稿生成成功`, type: 'success' })
    } catch (err: any) {
      setMessage({ text: '口播稿生成失败：' + err.message, type: 'error' })
    } finally {
      setGeneratingVoiceover(null)
    }
  }

  const synthesizeTtsHandler = async (key: 'dao' | 'yanxi') => {
    const text = voiceoverTexts[key]
    if (!text) {
      setMessage({ text: '请先生成口播稿', type: 'error' })
      return
    }
    setSynthesizingTts(key)
    try {
      const result = await api.ttsSynthesize(text)
      setTtsResults(prev => ({ ...prev, [key]: result as any }))
      setMessage({ text: `${key === 'dao' ? '道与术' : '研习手册'} 语音合成成功`, type: 'success' })
    } catch (err: any) {
      setMessage({ text: '语音合成失败：' + err.message, type: 'error' })
    } finally {
      setSynthesizingTts(null)
    }
  }

  const statusLabel = (s: StepStatus) => {
    const map: Record<StepStatus, string> = { pending: '等待中', in_progress: '处理中', done: '已完成' }
    return map[s]
  }

  const statusColor = (s: StepStatus) => {
    const map: Record<StepStatus, string> = { pending: 'var(--color-step-pending)', in_progress: 'var(--color-primary)', done: 'var(--color-success)' }
    return map[s]
  }

  const stepLabels: Record<string, string> = {
    step1: '步骤 1：内容获取',
    step2: '步骤 2：笔记整理',
    step3: '步骤 3：文档生成',
    step4: '步骤 4：输出',
  }

  // Shared styles
  const cardStyle: React.CSSProperties = {
    background: 'var(--color-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  }

  const stepHeaderStyle = (status: StepStatus): React.CSSProperties => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  })

  const stepDotStyle = (status: StepStatus): React.CSSProperties => ({
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: statusColor(status),
    animation: status === 'in_progress' ? 'pulse 1.2s ease-in-out infinite' : 'none',
    flexShrink: 0,
  })

  const btnPrimary: React.CSSProperties = {
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    padding: '8px 18px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  }

  const btnSecondary: React.CSSProperties = {
    background: 'none',
    border: '1px solid var(--color-border)',
    padding: '6px 14px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 13,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        加载中...
      </div>
    )
  }

  if (!project) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        项目未找到
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'none',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 14px',
              color: 'var(--color-text-secondary)',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            &larr; 返回
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>
            食谱：{project.name}
          </h1>
        </div>
        <button
          onClick={saveOverallProgress}
          style={btnPrimary}
        >
          保存进度
        </button>
      </div>

      {/* Flash message */}
      {message && (
        <div
          onClick={clearMessage}
          style={{
            padding: '8px 16px',
            marginBottom: 16,
            borderRadius: 'var(--radius-sm)',
            fontSize: 13,
            cursor: 'pointer',
            background: message.type === 'error' ? 'rgba(199, 91, 57, 0.1)'
              : message.type === 'success' ? 'rgba(74, 139, 63, 0.1)'
              : 'rgba(139, 26, 26, 0.06)',
            color: message.type === 'error' ? 'var(--color-warning)'
              : message.type === 'success' ? 'var(--color-success)'
              : 'var(--color-primary)',
            border: '1px solid ' + (message.type === 'error' ? 'var(--color-warning)'
              : message.type === 'success' ? 'var(--color-success)'
              : 'var(--color-border)'),
          }}
        >
          {message.text}
        </div>
      )}

      {/* ==================== Step 1 Card ==================== */}
      <div style={cardStyle}>
        <div style={stepHeaderStyle(stepStatuses.step1)}>
          <h2 style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={stepDotStyle(stepStatuses.step1)} />
            {stepLabels.step1}
          </h2>
          <span style={{
            fontSize: 13,
            color: statusColor(stepStatuses.step1),
            fontWeight: 500,
          }}>
            {statusLabel(stepStatuses.step1)}
          </span>
        </div>

        {/* Input mode tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {(['link', 'text', 'file'] as InputMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setInputMode(mode)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                border: inputMode === mode ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: inputMode === mode ? 'rgba(139, 26, 26, 0.06)' : 'var(--color-card)',
                color: inputMode === mode ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontSize: 13,
                fontWeight: inputMode === mode ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {mode === 'link' ? '链接' : mode === 'text' ? '文本' : '文件'}
            </button>
          ))}
        </div>

        {/* Link mode */}
        {inputMode === 'link' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="输入视频链接（B站/YouTube/抖音等）"
                disabled={downloading}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 14,
                  fontFamily: 'var(--font-family)',
                  outline: 'none',
                }}
                onKeyDown={e => { if (e.key === 'Enter') startDownload() }}
              />
              {!downloading ? (
                <button
                  onClick={startDownload}
                  disabled={!urlInput.trim()}
                  style={{
                    padding: '8px 18px',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 14,
                    fontWeight: 600,
                    opacity: urlInput.trim() ? 1 : 0.5,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                  }}
                >
                  开始下载
                </button>
              ) : (
                <button
                  onClick={cancelDownload}
                  style={{
                    padding: '8px 18px',
                    background: 'var(--color-warning)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 14,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                  }}
                >
                  取消
                </button>
              )}
            </div>

            {/* Progress bar */}
            {videoProgress && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {videoProgress.status === 'completed' ? '下载完成' :
                     videoProgress.status === 'downloading' ? '下载中...' :
                     videoProgress.status === 'processing' ? '处理中...' : videoProgress.status}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {videoProgress.percent}%
                  </span>
                </div>
                <div style={{
                  height: 4,
                  background: 'var(--color-border)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${videoProgress.percent}%`,
                    background: 'var(--color-primary)',
                    borderRadius: 2,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            )}

            {/* Subtitles textarea — shown after download completes */}
            {stepStatuses.step1 === 'done' && (
              <div>
                <textarea
                  value={subtitleContent}
                  onChange={e => setSubtitleContent(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: 200,
                    padding: 12,
                    border: '1px solid var(--color-border)',
                    borderRadius: 6,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    lineHeight: 1.6,
                    resize: 'vertical',
                    outline: 'none',
                    background: 'var(--color-card)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Text mode */}
        {inputMode === 'text' && (
          <div>
            <textarea
              value={textInput}
              onChange={e => {
                setTextInput(e.target.value)
                if (e.target.value) {
                  setStepStatuses(prev => prev.step1 === 'pending' ? { ...prev, step1: 'done' } : prev)
                }
              }}
              placeholder="在此粘贴或输入文本内容..."
              style={{
                width: '100%',
                minHeight: 200,
                padding: 12,
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                lineHeight: 1.6,
                resize: 'vertical',
                outline: 'none',
                background: 'var(--color-card)',
                color: 'var(--color-text)',
              }}
            />
          </div>
        )}

        {/* File mode placeholder */}
        {inputMode === 'file' && (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--color-text-secondary)',
            border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 14,
          }}>
            文件上传功能后续开放
          </div>
        )}

        {/* Save button */}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={saveStep}
            disabled={saving || (inputMode === 'link' && !subtitleContent && stepStatuses.step1 !== 'done')}
            style={{
              padding: '8px 20px',
              background: stepStatuses.step1 === 'done' || (inputMode === 'text' && textInput)
                ? 'var(--color-primary)'
                : 'var(--color-step-pending)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: 14,
              fontWeight: 600,
              opacity: (stepStatuses.step1 === 'done' || textInput) ? 1 : 0.6,
              cursor: 'pointer',
            }}
          >
            {saving ? '保存中...' : '保存到项目'}
          </button>
        </div>
      </div>

      {/* ==================== Step 2 Card ==================== */}
      <div style={cardStyle}>
        <div style={stepHeaderStyle(stepStatuses.step2)}>
          <h2 style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={stepDotStyle(stepStatuses.step2)} />
            {stepLabels.step2}
          </h2>
          <span style={{
            fontSize: 13,
            color: statusColor(stepStatuses.step2),
            fontWeight: 500,
          }}>
            {statusLabel(stepStatuses.step2)}
          </span>
        </div>

        {stepStatuses.step1 !== 'done' ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--color-text-secondary)',
            fontSize: 14,
          }}>
            请先完成步骤 1
          </div>
        ) : (
          <>
            <AICollabEditor
              value={stepContents.step2}
              onChange={text => setStepContent('step2', text)}
              placeholder="在此编辑笔记内容..."
              height="400px"
              category="笔记整理"
              generateUserMessage={stepContents.step1}
            />

            {/* Confirm step 2 button */}
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={confirmStep2}
                disabled={saving || !stepContents.step2}
                style={{
                  ...btnPrimary,
                  opacity: (saving || !stepContents.step2) ? 0.5 : 1,
                }}
              >
                {saving ? '保存中...' : '确认，进入步骤 3'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ==================== Step 3 Card ==================== */}
      <div style={{
        ...cardStyle,
        maxWidth: '100%',
        overflowX: 'auto',
      }}>
        <div style={stepHeaderStyle(step3StatusForDisplay)}>
          <h2 style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={stepDotStyle(step3StatusForDisplay)} />
            {stepLabels.step3}
          </h2>
          <span style={{
            fontSize: 13,
            color: statusColor(step3StatusForDisplay),
            fontWeight: 500,
          }}>
            {statusLabel(step3StatusForDisplay)}
          </span>
        </div>

        {stepStatuses.step2 !== 'done' ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--color-text-secondary)',
            fontSize: 14,
          }}>
            请先完成步骤 2
          </div>
        ) : (
          <>
            {/* Three-column layout for the three documents */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
              minWidth: 750,
            }}>
              {/* --- 食谱的道与术分析 --- */}
              <div style={{
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}>
                <div style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: statusColor(stepStatuses.step3_daoshuyi),
                    flexShrink: 0,
                  }} />
                  食谱的道与术分析
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <AICollabEditor
                    value={stepContents.step3_daoshuyi}
                    onChange={text => setStepContent('step3_daoshuyi', text)}
                    placeholder="道与术分析..."
                    height="350px"
                    category="道与术分析"
                    generateUserMessage={stepContents.step2}
                  />
                </div>
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => saveSubStep('step3_daoshuyi', stepContents.step3_daoshuyi)}
                    disabled={savingSubStep === 'step3_daoshuyi' || !stepContents.step3_daoshuyi}
                    style={{
                      ...btnPrimary,
                      fontSize: 12,
                      padding: '4px 14px',
                      opacity: (savingSubStep === 'step3_daoshuyi' || !stepContents.step3_daoshuyi) ? 0.5 : 1,
                    }}
                  >
                    {savingSubStep === 'step3_daoshuyi' ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>

              {/* --- 食谱的研习手册 --- */}
              <div style={{
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}>
                <div style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: statusColor(stepStatuses.step3_yanxi),
                    flexShrink: 0,
                  }} />
                  食谱的研习手册
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <AICollabEditor
                    value={stepContents.step3_yanxi}
                    onChange={text => setStepContent('step3_yanxi', text)}
                    placeholder="研习手册..."
                    height="350px"
                    category="研习手册"
                    generateUserMessage={stepContents.step2}
                  />
                </div>
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => saveSubStep('step3_yanxi', stepContents.step3_yanxi)}
                    disabled={savingSubStep === 'step3_yanxi' || !stepContents.step3_yanxi}
                    style={{
                      ...btnPrimary,
                      fontSize: 12,
                      padding: '4px 14px',
                      opacity: (savingSubStep === 'step3_yanxi' || !stepContents.step3_yanxi) ? 0.5 : 1,
                    }}
                  >
                    {savingSubStep === 'step3_yanxi' ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>

              {/* --- 食谱的SOP --- */}
              <div style={{
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}>
                <div style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: statusColor(stepStatuses.step3_sop),
                    flexShrink: 0,
                  }} />
                  食谱的 SOP
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <AICollabEditor
                    value={stepContents.step3_sop}
                    onChange={text => setStepContent('step3_sop', text)}
                    placeholder="SOP..."
                    height="350px"
                    category="SOP"
                    generateUserMessage={stepContents.step2}
                  />
                </div>
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => saveSubStep('step3_sop', stepContents.step3_sop)}
                    disabled={savingSubStep === 'step3_sop' || !stepContents.step3_sop}
                    style={{
                      ...btnPrimary,
                      fontSize: 12,
                      padding: '4px 14px',
                      opacity: (savingSubStep === 'step3_sop' || !stepContents.step3_sop) ? 0.5 : 1,
                    }}
                  >
                    {savingSubStep === 'step3_sop' ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            </div>

            {/* Overall step 3 status */}
            {step3Done && (
              <div style={{
                marginTop: 12,
                padding: '10px 16px',
                background: 'rgba(74, 139, 63, 0.08)',
                border: '1px solid var(--color-success)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                color: 'var(--color-success)',
                textAlign: 'center',
              }}>
                三份文档已全部生成完成，可进入步骤 4
              </div>
            )}
          </>
        )}
      </div>

      {/* ==================== Step 4 Card ==================== */}
      <div style={{
        ...cardStyle,
        opacity: step3Done ? 1 : 0.7,
      }}>
        <div style={stepHeaderStyle(stepStatuses.step4)}>
          <h2 style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={stepDotStyle(stepStatuses.step4)} />
            {stepLabels.step4}
          </h2>
          <span style={{
            fontSize: 13,
            color: statusColor(stepStatuses.step4),
            fontWeight: 500,
          }}>
            {statusLabel(stepStatuses.step4)}
          </span>
        </div>

        {!step3Done ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--color-text-secondary)',
            fontSize: 14,
          }}>
            请先完成步骤 3
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── A. PPT 生成 ── */}
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px 0' }}>PPT 生成</h3>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                使用下方共享的模板与品牌配置，分别从道与术分析和研习手册生成 PPT。
              </div>

              {/* Shared branding inputs for PPT */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="版权说明（如 © 2026）"
                  value={pptBranding.copyright}
                  onChange={e => setPptBranding(prev => ({ ...prev, copyright: e.target.value }))}
                  style={{
                    padding: '6px 10px', border: '1px solid var(--color-border)', borderRadius: 4,
                    fontSize: 13, fontFamily: 'var(--font-family)', flex: '1 1 180px', outline: 'none',
                    background: 'var(--color-card)', color: 'var(--color-text)',
                  }}
                />
                <input
                  type="text"
                  placeholder="作者签名"
                  value={pptBranding.signature}
                  onChange={e => setPptBranding(prev => ({ ...prev, signature: e.target.value }))}
                  style={{
                    padding: '6px 10px', border: '1px solid var(--color-border)', borderRadius: 4,
                    fontSize: 13, fontFamily: 'var(--font-family)', flex: '1 1 150px', outline: 'none',
                    background: 'var(--color-card)', color: 'var(--color-text)',
                  }}
                />
                {pptTemplates.length > 0 && (
                  <select
                    value={selectedPptTemplateId}
                    onChange={e => setSelectedPptTemplateId(e.target.value)}
                    style={{
                      padding: '6px 10px', border: '1px solid var(--color-border)', borderRadius: 4,
                      fontSize: 13, fontFamily: 'var(--font-family)', outline: 'none',
                      background: 'var(--color-card)', color: 'var(--color-text)',
                    }}
                  >
                    <option value="">默认模板</option>
                    {pptTemplates.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Row 1: 道与术 PPT */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', minWidth: 140 }}>
                  来源: 道与术分析
                </span>
                <button
                  onClick={() => generatePptHandler('dao')}
                  disabled={generatingPpt === 'dao' || !stepContents.step3_daoshuyi}
                  style={{
                    ...btnPrimary, fontSize: 13, padding: '6px 16px',
                    opacity: (generatingPpt === 'dao' || !stepContents.step3_daoshuyi) ? 0.5 : 1,
                  }}
                >
                  {generatingPpt === 'dao' ? '生成中...' : '生成PPT'}
                </button>
                {pptResults.dao && (
                  <DownloadButton
                    url={pptResults.dao.download_url}
                    filename={pptResults.dao.filename}
                    label="下载PPT"
                    state={fileDownloads['ppt_dao']}
                    onStateChange={s => setFileDownloads(prev => ({ ...prev, ppt_dao: s }))}
                  />
                )}
              </div>

              {/* Row 2: 研习手册 PPT */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', minWidth: 140 }}>
                  来源: 研习手册
                </span>
                <button
                  onClick={() => generatePptHandler('yanxi')}
                  disabled={generatingPpt === 'yanxi' || !stepContents.step3_yanxi}
                  style={{
                    ...btnPrimary, fontSize: 13, padding: '6px 16px',
                    opacity: (generatingPpt === 'yanxi' || !stepContents.step3_yanxi) ? 0.5 : 1,
                  }}
                >
                  {generatingPpt === 'yanxi' ? '生成中...' : '生成PPT'}
                </button>
                {pptResults.yanxi && (
                  <DownloadButton
                    url={pptResults.yanxi.download_url}
                    filename={pptResults.yanxi.filename}
                    label="下载PPT"
                    state={fileDownloads['ppt_yanxi']}
                    onStateChange={s => setFileDownloads(prev => ({ ...prev, ppt_yanxi: s }))}
                  />
                )}
              </div>
            </div>

            {/* ── B. SOP 导出 ── */}
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px 0' }}>SOP 导出</h3>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="版权说明"
                  value={sopBranding.copyright}
                  onChange={e => setSopBranding(prev => ({ ...prev, copyright: e.target.value }))}
                  style={{
                    padding: '6px 10px', border: '1px solid var(--color-border)', borderRadius: 4,
                    fontSize: 13, fontFamily: 'var(--font-family)', flex: '1 1 180px', outline: 'none',
                    background: 'var(--color-card)', color: 'var(--color-text)',
                  }}
                />
                <input
                  type="text"
                  placeholder="作者签名"
                  value={sopBranding.signature}
                  onChange={e => setSopBranding(prev => ({ ...prev, signature: e.target.value }))}
                  style={{
                    padding: '6px 10px', border: '1px solid var(--color-border)', borderRadius: 4,
                    fontSize: 13, fontFamily: 'var(--font-family)', flex: '1 1 150px', outline: 'none',
                    background: 'var(--color-card)', color: 'var(--color-text)',
                  }}
                />
                {sopTemplates.length > 0 && (
                  <select
                    value={selectedSopTemplateId}
                    onChange={e => setSelectedSopTemplateId(e.target.value)}
                    style={{
                      padding: '6px 10px', border: '1px solid var(--color-border)', borderRadius: 4,
                      fontSize: 13, fontFamily: 'var(--font-family)', outline: 'none',
                      background: 'var(--color-card)', color: 'var(--color-text)',
                    }}
                  >
                    <option value="">默认模板</option>
                    {sopTemplates.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', minWidth: 140 }}>
                  来源: SOP 文档
                </span>
                <button
                  onClick={exportSopHandler}
                  disabled={exportingSop || !stepContents.step3_sop}
                  style={{
                    ...btnPrimary, fontSize: 13, padding: '6px 16px',
                    opacity: (exportingSop || !stepContents.step3_sop) ? 0.5 : 1,
                  }}
                >
                  {exportingSop ? '导出中...' : '导出文档'}
                </button>
                {sopResult && (
                  <DownloadButton
                    url={sopResult.download_url}
                    filename={sopResult.filename}
                    label="下载文档"
                    state={fileDownloads['sop']}
                    onStateChange={s => setFileDownloads(prev => ({ ...prev, sop: s }))}
                  />
                )}
              </div>
            </div>

            {/* ── C. 口播稿 + 语音 ── */}
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px 0' }}>口播稿 + 语音合成</h3>

              {/* Row 1: 道与术口播稿 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>道与术口播稿</span>
                  <button
                    onClick={() => generateVoiceoverHandler('dao')}
                    disabled={generatingVoiceover === 'dao' || !stepContents.step3_daoshuyi}
                    style={{
                      ...btnPrimary, fontSize: 12, padding: '4px 12px',
                      opacity: (generatingVoiceover === 'dao' || !stepContents.step3_daoshuyi) ? 0.5 : 1,
                    }}
                  >
                    {generatingVoiceover === 'dao' ? '生成中...' : '生成口播稿'}
                  </button>
                  <button
                    onClick={() => synthesizeTtsHandler('dao')}
                    disabled={synthesizingTts === 'dao' || !voiceoverTexts.dao}
                    style={{
                      ...btnSecondary, fontSize: 12, padding: '4px 12px',
                      opacity: (synthesizingTts === 'dao' || !voiceoverTexts.dao) ? 0.5 : 1,
                    }}
                  >
                    {synthesizingTts === 'dao' ? '合成中...' : '语音合成'}
                  </button>
                </div>
                <textarea
                  value={voiceoverTexts.dao}
                  onChange={e => setVoiceoverTexts(prev => ({ ...prev, dao: e.target.value }))}
                  placeholder="口播稿将在此显示..."
                  style={{
                    width: '100%',
                    minHeight: 80,
                    padding: 8,
                    border: '1px solid var(--color-border)',
                    borderRadius: 4,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    lineHeight: 1.5,
                    resize: 'vertical',
                    outline: 'none',
                    background: 'var(--color-card)',
                    color: 'var(--color-text)',
                  }}
                />
                {ttsResults.dao && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <audio controls style={{ width: '100%', maxWidth: 400 }}>
                      <source src={ttsResults.dao.audio_url} type="audio/mpeg" />
                    </audio>
                    <DownloadButton
                      url={ttsResults.dao.audio_url}
                      filename={ttsResults.dao.filename}
                      label="下载音频"
                      state={fileDownloads['tts_dao']}
                      onStateChange={s => setFileDownloads(prev => ({ ...prev, tts_dao: s }))}
                    />
                  </div>
                )}
              </div>

              {/* Row 2: 研习手册口播稿 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>研习手册口播稿</span>
                  <button
                    onClick={() => generateVoiceoverHandler('yanxi')}
                    disabled={generatingVoiceover === 'yanxi' || !stepContents.step3_yanxi}
                    style={{
                      ...btnPrimary, fontSize: 12, padding: '4px 12px',
                      opacity: (generatingVoiceover === 'yanxi' || !stepContents.step3_yanxi) ? 0.5 : 1,
                    }}
                  >
                    {generatingVoiceover === 'yanxi' ? '生成中...' : '生成口播稿'}
                  </button>
                  <button
                    onClick={() => synthesizeTtsHandler('yanxi')}
                    disabled={synthesizingTts === 'yanxi' || !voiceoverTexts.yanxi}
                    style={{
                      ...btnSecondary, fontSize: 12, padding: '4px 12px',
                      opacity: (synthesizingTts === 'yanxi' || !voiceoverTexts.yanxi) ? 0.5 : 1,
                    }}
                  >
                    {synthesizingTts === 'yanxi' ? '合成中...' : '语音合成'}
                  </button>
                </div>
                <textarea
                  value={voiceoverTexts.yanxi}
                  onChange={e => setVoiceoverTexts(prev => ({ ...prev, yanxi: e.target.value }))}
                  placeholder="口播稿将在此显示..."
                  style={{
                    width: '100%',
                    minHeight: 80,
                    padding: 8,
                    border: '1px solid var(--color-border)',
                    borderRadius: 4,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    lineHeight: 1.5,
                    resize: 'vertical',
                    outline: 'none',
                    background: 'var(--color-card)',
                    color: 'var(--color-text)',
                  }}
                />
                {ttsResults.yanxi && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <audio controls style={{ width: '100%', maxWidth: 400 }}>
                      <source src={ttsResults.yanxi.audio_url} type="audio/mpeg" />
                    </audio>
                    <DownloadButton
                      url={ttsResults.yanxi.audio_url}
                      filename={ttsResults.yanxi.filename}
                      label="下载音频"
                      state={fileDownloads['tts_yanxi']}
                      onStateChange={s => setFileDownloads(prev => ({ ...prev, tts_yanxi: s }))}
                    />
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Keyframes for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}

export default ProjectPage
