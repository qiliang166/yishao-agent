import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/api'

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
  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>({
    step1: 'pending',
    step2: 'pending',
    step3: 'pending',
    step4: 'pending',
  })
  const [stepContents, setStepContents] = useState<Record<string, string>>({
    step1: '',
    step2: '',
    step3: '',
    step4: '',
  })
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)

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
        const newStatuses: Record<string, StepStatus> = { step1: 'pending', step2: 'pending', step3: 'pending', step4: 'pending' }
        const newContents: Record<string, string> = { step1: '', step2: '', step3: '', step4: '' }
        for (const s of stepsArr) {
          const key = s.step_name
          if (s.content) {
            newContents[key] = s.content
            newStatuses[key] = 'done'
          } else if (s.status === 'in_progress') {
            newStatuses[key] = 'in_progress'
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

  const clearMessage = () => setMessage(null)

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

      // Start polling
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
          style={{
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            padding: '8px 18px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 14,
            fontWeight: 600,
          }}
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

      {/* Step 1 Card */}
      <div style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: statusColor(stepStatuses.step1),
              animation: stepStatuses.step1 === 'in_progress' ? 'pulse 1.2s ease-in-out infinite' : 'none',
              flexShrink: 0,
            }} />
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
            }}
          >
            {saving ? '保存中...' : '保存到项目'}
          </button>
        </div>
      </div>

      {/* Steps 2-4: Placeholder cards */}
      {['step2', 'step3', 'step4'].map(stepKey => (
        <div
          key={stepKey}
          style={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            opacity: 0.7,
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusColor(stepStatuses[stepKey]),
                flexShrink: 0,
              }} />
              {stepLabels[stepKey]}
            </h2>
            <span style={{
              fontSize: 13,
              color: statusColor(stepStatuses[stepKey]),
              fontWeight: 500,
            }}>
              {statusLabel(stepStatuses[stepKey])}
            </span>
          </div>
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--color-text-secondary)',
            fontSize: 14,
          }}>
            后续版本开放
          </div>
        </div>
      ))}

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
