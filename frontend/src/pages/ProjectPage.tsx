import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useModal } from '../components/ModalProvider'

// ── Types ──
interface Project {
  id: string; name: string; status: string; source_type: string
  created_at: string; updated_at: string
}
type StageId = 1 | 2 | 3 | 4 | 5
type SubId = string

interface StageDef { id: StageId; label: string; subs: { id: SubId; label: string }[] }
interface TemplateItem { id: string; name: string; isDefault: boolean; meta: string; previewHtml: string; color: string; icon: string }

// ── Stage Definitions ──
const STAGES: StageDef[] = [
  { id: 1, label: '文案提取', subs: [{ id: '1a', label: '视频提取' }, { id: '1b', label: '文字输入' }, { id: '1c', label: '文件上传' }] },
  { id: 2, label: '教学文档', subs: [{ id: '2a', label: 'SOP文案' }, { id: '2b', label: '道与术文案' }, { id: '2c', label: '研学手册文案' }] },
  { id: 3, label: '输出课件', subs: [{ id: '3a', label: 'SOP课件' }, { id: '3b', label: '道术PPT' }, { id: '3c', label: '研学PPT' }] },
  { id: 4, label: '语音课件', subs: [{ id: '4a', label: '口播文案' }, { id: '4b', label: '口播语音' }] },
  { id: 5, label: '输出列表', subs: [] },
]

const CONFIG: Record<number, { model: string; tmpl: string; tmplInfo: string }> = {
  1: { model: 'DeepSeek (deepseek-v4-pro)', tmpl: '—', tmplInfo: '' },
  2: { model: 'DeepSeek (deepseek-v4-pro)', tmpl: '—', tmplInfo: '' },
  3: { model: 'DeepSeek (deepseek-v4-pro)', tmpl: 'SOP标准模板.docx / PPT模板', tmplInfo: '提示词: SOP标准格式 v2.0 · SKILL: SOP表格填充' },
  4: { model: 'DeepSeek (deepseek-v4-pro)', tmpl: '标准口播模板', tmplInfo: '提示词: 口播稿生成 v1.0 · SKILL: 口播风格' },
  5: { model: '—', tmpl: '—', tmplInfo: '' },
}

// ── Download Helper ──
async function downloadFile(url: string, filename: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = objUrl; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(objUrl)
}

// ── Template Selector Component ──
function TemplateSelector({ items, selectedId, onSelect, previewTarget }: {
  items: TemplateItem[]; selectedId: string; onSelect: (item: TemplateItem) => void; previewTarget: string
}) {
  return (
    <div className="tmpl-group">
      {items.map(t => (
        <div key={t.id}
          className={`tmpl-card${t.id === selectedId ? ' selected' : ''}`}
          onClick={() => onSelect(t)}
        >
          <div className="tmpl-thumb" style={{ background: t.color + '22', color: t.color }}>{t.icon}</div>
          <div className="tmpl-info">
            <div className="tmpl-name">{t.name}{t.isDefault ? <span className="default-tag">默认</span> : null}</div>
            <div className="tmpl-meta">{t.meta}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Template data ──
const SOP_TEMPLATES: TemplateItem[] = [
  { id: 'sop-std', name: 'SOP标准模板.docx', isDefault: true, meta: '提示词: SOP标准格式 v2.0 · SKILL: SOP表格填充', color: '#4A8B3F', icon: '📃', previewHtml: '' },
  { id: 'sop-simple', name: '简约SOP模板.docx', isDefault: false, meta: '提示词: 简约SOP v1.0 · SKILL: 简约SOP填充', color: '#4A8B3F', icon: '📄', previewHtml: '' },
  { id: 'sop-detail', name: '详细SOP模板.docx', isDefault: false, meta: '提示词: 详细SOP v1.2 · SKILL: 详细SOP填充', color: '#4A8B3F', icon: '📋', previewHtml: '' },
]
const DAO_PPT_TEMPLATES: TemplateItem[] = [
  { id: 'dao-std', name: '道与术PPT模板.pptx', isDefault: true, meta: '提示词: PPT排版 v1.0 · SKILL: 道与术PPT技能', color: '#7C3AED', icon: '📌', previewHtml: '' },
  { id: 'dao-food', name: '美食风PPT模板.pptx', isDefault: false, meta: '提示词: 美食PPT v0.9 · SKILL: 美食PPT技能', color: '#C75B39', icon: '🍽', previewHtml: '' },
]
const YANXI_PPT_TEMPLATES: TemplateItem[] = [
  { id: 'yanxi-std', name: '研学手册PPT模板.pptx', isDefault: true, meta: '提示词: PPT排版 v1.0 · SKILL: 研学手册PPT技能', color: '#4A8B3F', icon: '📚', previewHtml: '' },
  { id: 'yanxi-food', name: '美食风PPT模板.pptx', isDefault: false, meta: '提示词: 美食PPT v0.9 · SKILL: 美食PPT技能', color: '#C75B39', icon: '🍽', previewHtml: '' },
]
const KOUBO_TEMPLATES: TemplateItem[] = [
  { id: 'koubo-std', name: '标准口播模板', isDefault: true, meta: '提示词: 口播稿生成 v1.0 · SKILL: 口播风格', color: '#0891B2', icon: '📢', previewHtml: '' },
  { id: 'koubo-fast', name: '快节奏口播模板', isDefault: false, meta: '提示词: 口播稿 v0.8 · SKILL: 快节奏口播', color: '#C75B39', icon: '⚡', previewHtml: '' },
]
const VOICE_TEMPLATES: TemplateItem[] = [
  { id: 'voice-soft', name: '标准口播音色', isDefault: true, meta: '音色: 温柔女声 · 语速: 1.0x · 音量: 50%', color: '#E91E63', icon: '🎵', previewHtml: '' },
  { id: 'voice-male', name: '沉稳男声', isDefault: false, meta: '音色: 沉稳男声 · 语速: 1.0x · 音量: 50%', color: '#4CAF50', icon: '🎵', previewHtml: '' },
  { id: 'voice-fast', name: '快节奏口播音色', isDefault: false, meta: '音色: 活泼女声 · 语速: 1.3x · 音量: 60%', color: '#FF9800', icon: '🎵', previewHtml: '' },
]

// Stage 2 prompt/SKILL templates
const STAGE2_SOP_TMPL: TemplateItem[] = [
  { id: 's2-sop-std', name: 'SOP标准格式 v2.0', isDefault: true, meta: '提示词: SOP标准格式 v2.0 · SKILL: SOP表格填充', color: '#4A8B3F', icon: '📃', previewHtml: '' },
  { id: 's2-sop-simple', name: 'SOP简约格式 v1.0', isDefault: false, meta: '提示词: SOP简约格式 v1.0 · SKILL: SOP简约填充', color: '#4A8B3F', icon: '📄', previewHtml: '' },
  { id: 's2-sop-detail', name: 'SOP详细格式 v1.2', isDefault: false, meta: '提示词: SOP详细格式 v1.2 · SKILL: SOP详细填充', color: '#4A8B3F', icon: '📋', previewHtml: '' },
]
const STAGE2_DAO_TMPL: TemplateItem[] = [
  { id: 's2-dao-std', name: '道与术标准分析 v1.0', isDefault: true, meta: '提示词: 道与术分析 v1.0 · SKILL: 道与术分析技能', color: '#7C3AED', icon: '💡', previewHtml: '' },
  { id: 's2-dao-deep', name: '道与术深度分析 v0.9', isDefault: false, meta: '提示词: 道与术深度 v0.9 · SKILL: 道与术深度技能', color: '#7C3AED', icon: '🔬', previewHtml: '' },
]
const STAGE2_YANXI_TMPL: TemplateItem[] = [
  { id: 's2-yanxi-std', name: '研学手册标准 v1.0', isDefault: true, meta: '提示词: 研学手册标准 v1.0 · SKILL: 研学手册技能', color: '#C75B39', icon: '📖', previewHtml: '' },
  { id: 's2-yanxi-detail', name: '研学手册详细 v0.9', isDefault: false, meta: '提示词: 研学手册详细 v0.9 · SKILL: 研学手册详细技能', color: '#C75B39', icon: '📚', previewHtml: '' },
]

const STAGE2_MODELS = ['DeepSeek (deepseek-v4-pro)', 'Kimi (moonshot-v1)', '通义千问 (qwen-plus)']

// ── Main Component ──
export default function ProjectPage() {
  const modal = useModal()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [stage, setStage] = useState<StageId>(1)
  const [sub, setSub] = useState<SubId>('1a')
  const [steps, setSteps] = useState<Record<string, string>>({})

  // Stage 1 state
  const [videoUrl, setVideoUrl] = useState('')
  const [dlStatus, setDlStatus] = useState('')
  const [dlPercent, setDlPercent] = useState(0)
  const [dlTaskId, setDlTaskId] = useState('')
  const [textInput, setTextInput] = useState('')
  const mode1 = sub === '1a' ? 'link' : sub === '1b' ? 'text' : 'file' as 'link' | 'text' | 'file'
  const [vcOpen, setVcOpen] = useState(false)

  // Stage 2 state
  const [step2Generating, setStep2Generating] = useState('') // which sub is generating
  const [s2SopTmpl, setS2SopTmpl] = useState('s2-sop-std')
  const [s2DaoTmpl, setS2DaoTmpl] = useState('s2-dao-std')
  const [s2YanxiTmpl, setS2YanxiTmpl] = useState('s2-yanxi-std')
  const [s2SopModel, setS2SopModel] = useState(STAGE2_MODELS[0])
  const [s2DaoModel, setS2DaoModel] = useState(STAGE2_MODELS[0])
  const [s2YanxiModel, setS2YanxiModel] = useState(STAGE2_MODELS[0])
  const [s2DataSource, setS2DataSource] = useState('video')

  // Stage 3 state
  const [sopSelected, setSopSelected] = useState('sop-std')
  const [daoPptSelected, setDaoPptSelected] = useState('dao-std')
  const [yanxiPptSelected, setYanxiPptSelected] = useState('yanxi-std')
  const [pptGenerating, setPptGenerating] = useState('')

  // Stage 4 state
  const [kouboSelected, setKouboSelected] = useState('koubo-std')
  const [voiceSelected, setVoiceSelected] = useState('voice-soft')
  const [kouboText, setKouboText] = useState('')
  const [ttsGenerating, setTtsGenerating] = useState(false)
  const [ttsAudioUrl, setTtsAudioUrl] = useState('')

  // Load project
  useEffect(() => {
    if (!id) return
    api.getProject(id).then(setProject).catch(() => navigate('/'))
    api.getSteps(id).then((s: any[]) => {
      const map: Record<string, string> = {}
      s.forEach((x: any) => { map[x.step_name] = x.content })
      setSteps(map)
    })
  }, [id, navigate])

  // Save step helper
  const saveStep = useCallback((stepName: string, content: string) => {
    if (!id) return
    api.saveStep(id, stepName, content)
    setSteps(prev => ({ ...prev, [stepName]: content }))
  }, [id])

  // ── Stage nav ──
  const switchStage = (s: StageId) => {
    setStage(s)
    const stageDef = STAGES.find(x => x.id === s)
    if (stageDef && stageDef.subs.length > 0) setSub(stageDef.subs[0].id)
  }

  // ── Video download ──
  const handleVideoDownload = async () => {
    if (!videoUrl.trim()) return
    setDlStatus('downloading'); setDlPercent(0)
    try {
      const result: any = await api.downloadVideo(videoUrl)
      setDlTaskId(result.task_id)
      pollProgress(result.task_id)
    } catch (e: any) { setDlStatus('error: ' + e.message) }
  }
  const pollProgress = async (taskId: string) => {
    const poll = async () => {
      const p: any = await api.getVideoProgress(taskId)
      setDlPercent(p.percent); setDlStatus(p.status)
      if (p.text) setSteps(prev => ({ ...prev, step1: p.text }))
      if (p.status === 'completed') { setDlStatus('done'); return }
      if (p.status === 'failed') { setDlStatus('failed: ' + (p.error || '')); return }
      setTimeout(poll, 1000)
    }
    poll()
  }
  const handleExtractSubtitles = async () => {
    if (!dlTaskId || !id) return
    const result: any = await api.extractSubtitles(dlTaskId, id)
    if (result.subtitle_text) {
      setSteps(prev => ({ ...prev, step1: result.subtitle_text }))
      saveStep('step1', result.subtitle_text)
    }
  }

  // ── LLM Generate ──
  const doGenerate = async (stepKey: string, systemPrompt: string, userMessage: string) => {
    if (!id) return
    try {
      const result: any = await api.llmGenerate({
        provider_id: 'default', model: 'deepseek-v4-pro',
        system_prompt: systemPrompt, user_message: userMessage,
      })
      const content = result.content
      setSteps(prev => ({ ...prev, [stepKey]: content }))
      saveStep(stepKey, content)
      return content
    } catch (e: any) { modal.toast('生成失败: ' + e.message, 'error'); return null }
  }

  // ── PPT / SOP Generation ──
  const doGeneratePPT = async (stepKey: string, content: string, tmplId: string, label: string) => {
    setPptGenerating(stepKey)
    try {
      const result: any = await api.generatePPT(content, tmplId)
      setGenFiles(prev => [...prev, {
        name: result.filename, type: 'PPT',
        source: label,
        url: '/api/download/' + encodeURIComponent(result.filename),
      }])
      modal.toast(`PPT 已生成: ${result.filename}`, 'success')
    } catch (e: any) { modal.toast('PPT生成失败: ' + e.message, 'error') }
    finally { setPptGenerating('') }
  }
  const doExportSOP = async (content: string) => {
    try {
      const result: any = await api.exportSOP(content)
      setGenFiles(prev => [...prev, {
        name: result.filename, type: 'Word',
        source: 'SOP课件',
        url: '/api/download/' + encodeURIComponent(result.filename),
      }])
      modal.toast(`SOP 已导出: ${result.filename}`, 'success')
    } catch (e: any) { modal.toast('SOP导出失败: ' + e.message, 'error') }
  }

  // ── TTS ──
  const doTTS = async () => {
    if (!kouboText.trim()) return
    setTtsGenerating(true)
    try {
      const result: any = await api.ttsSynthesize(kouboText)
      setTtsAudioUrl(result.audio_url)
      setGenFiles(prev => [...prev, {
        name: (project?.name || 'output') + '_口播.mp3', type: 'MP3',
        source: '口播语音',
        url: result.audio_url || '/api/audio/' + encodeURIComponent(result.filename || ''),
      }])
    } catch (e: any) { modal.toast('TTS失败: ' + e.message, 'error') }
    finally { setTtsGenerating(false) }
  }

  // Generated files tracking
  const [genFiles, setGenFiles] = useState<{ name: string; type: string; source: string; url: string }[]>([])

  // ── Stage status dots ──
  const stageDot = (s: StageId) => {
    const st = steps
    if (s === 1 && st.step1) return 'done'
    if (s === 2 && (st.step2_sop || st.step2_daoshuyi || st.step2_yanxi)) return 'done'
    if (s === 3 && (st.step3_sop_doc || st.step3_dao_ppt || st.step3_yan_ppt)) return 'done'
    if (s === 4 && (st.step4_koubo || st.step4_tts)) return 'done'
    if (s === 5 && genFiles.length > 0) return 'done'
    if (s === stage) return 'progress'
    return 'waiting'
  }

  if (!project) return <div className="pipeline-area"><div style={{ padding: 32 }}>加载中...</div></div>

  return (
    <div className="pipeline-area">
      {/* ═══ Top Nav ═══ */}
      <div className="top-nav">
        {STAGES.map((s, i) => (
          <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span className="tn-arrow">→</span>}
            <div className={`tn-item${stage === s.id ? ' active' : ''}`}
              onClick={() => switchStage(s.id)}>
              <span className="tn-num">{s.id}</span> {s.label}
              <span className={`tn-dot ${stageDot(s.id)}`} />
            </div>
          </span>
        ))}
      </div>

      {/* ═══ Sub Nav ═══ */}
      {STAGES.find(s => s.id === stage)?.subs.length ? (
        <div className="sub-nav">
          {STAGES.find(s => s.id === stage)!.subs.map((sn, i) => (
            <span key={sn.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {i > 0 && <span className="sn-sep">|</span>}
              <div className={`sn-item${sub === sn.id ? ' active' : ''}`}
                onClick={() => setSub(sn.id)}>{sn.label}</div>
            </span>
          ))}
        </div>
      ) : (
        <div className="sub-nav">
          <span className="sub-nav-desc">输出列表 — 所有产出物统一下载</span>
        </div>
      )}

      {/* ═══ Content ═══ */}
      <div className="content-area">
        {/* ====== STAGE 1: 文案提取 ====== */}
        {stage === 1 && (
          <div className="panel-grid">
            <div className="panel-left">
              {/* 1a: Video Link */}
              {mode1 === 'link' && <>
                <div className="card">
                  <div className="card-title">📺 视频提取</div>
                  <div className="card-hint">粘贴视频链接 → 下载 + 语音识别 → 内容自动填入右侧编辑区</div>
                  <input className="form-input" placeholder="粘贴视频链接（支持抖音/B站/YouTube等）"
                    value={videoUrl} onChange={e => setVideoUrl(e.target.value)} style={{ marginBottom: 6 }} />
                  <button className="btn btn-primary btn-sm w-full"
                    onClick={handleVideoDownload} disabled={dlStatus === 'downloading'}>
                    ▶ 下载并识别
                  </button>
                  {dlStatus === 'downloading' && (
                    <div style={{ marginTop: 8, background: 'var(--border)', height: 4, borderRadius: 2 }}>
                      <div style={{ width: dlPercent + '%', height: '100%', background: 'var(--primary)', borderRadius: 2, transition: 'width .3s' }} />
                    </div>
                  )}
                  {dlStatus === 'done' && <div className="form-hint" style={{ color: 'var(--success)' }}>下载完成</div>}
                  {dlStatus.startsWith('error') && <div className="form-hint" style={{ color: 'var(--warning)' }}>{dlStatus}</div>}
                  <button className="btn btn-outline btn-sm w-full" style={{ marginTop: 6 }}
                    onClick={() => setVcOpen(true)} disabled={!steps.step1}>
                    📺 播放校验
                  </button>
                </div>
                <div className="card">
                  <div className="card-title">📁 项目保存路径</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input className="form-input" style={{ fontSize: 10, flex: 1 }} readOnly
                      value={`D:\\YISHAOAGENT\\data\\projects\\${project?.name || ''}`} />
                    <button className="btn btn-ghost btn-sm">浏览</button>
                  </div>
                </div>
              </>}

              {/* 1b: Text Input */}
              {mode1 === 'text' && (
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="card-title">✏️ 文字输入</div>
                  <div className="card-hint">直接粘贴或输入食谱内容，右侧同步显示并可编辑</div>
                  <textarea className="form-textarea" style={{ flex: 1, minHeight: 120 }}
                    placeholder="在此粘贴或输入食谱笔记..."
                    value={textInput} onChange={e => setTextInput(e.target.value)} />
                </div>
              )}

              {/* 1c: File Upload */}
              {mode1 === 'file' && <>
                <div className="card">
                  <div className="card-title">📄 文件上传</div>
                  <div className="card-hint">支持 .txt / .md / .docx 文件，读取后内容自动填入右侧编辑区</div>
                  <input type="file" accept=".txt,.md,.docx" style={{ fontSize: 10, marginBottom: 6 }}
                    onChange={async e => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      const text = await f.text()
                      setSteps(prev => ({ ...prev, step1: text }))
                      saveStep('step1', text)
                    }} />
                  <button className="btn btn-primary btn-sm w-full">读取文件</button>
                </div>
                <div className="card">
                  <div className="card-title">📁 项目保存路径</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input className="form-input" style={{ fontSize: 10, flex: 1 }} readOnly
                      value={`D:\\YISHAOAGENT\\data\\projects\\${project?.name || ''}`} />
                    <button className="btn btn-ghost btn-sm">浏览</button>
                  </div>
                </div>
              </>}
            </div>

            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="card-title">生成 / 编辑</div>
                <textarea className="form-textarea" style={{ flex: 1, minHeight: 120 }}
                  value={steps.step1 || ''}
                  onChange={e => { setSteps(prev => ({ ...prev, step1: e.target.value })); }}
                  placeholder="提取的文本将显示在此，可直接编辑..." />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>编辑完成后保存，供下一阶段引用</span>
                  <button className="btn btn-primary btn-sm" onClick={() => saveStep('step1', steps.step1 || '')}>✓ 保存</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== STAGE 2: 教学文档 ====== */}
        {stage === 2 && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                {/* 2a: SOP文案 */}
                {sub === '2a' && <>
                  <div className="card-title" style={{ color: 'var(--success)' }}>📃 SOP文案生成</div>
                  <div className="card-hint">基于文案提取结果，用选定的模板（提示词+SKILL）生成标准SOP文案</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    <div className="form-label">数据来源</div>
                    <select className="form-select" style={{ marginBottom: 6 }} value={s2DataSource} onChange={e => setS2DataSource(e.target.value)}>
                      <option value="video">视频提取 — {steps.step1 ? '已有内容' : '暂无内容'}</option>
                      <option value="text">文字输入 — {steps.step1 ? '已有内容' : '暂无内容'}</option>
                      <option value="file">文件上传 — 暂无内容</option>
                    </select>
                  </div>
                  <div className="form-label">选择模板</div>
                  <TemplateSelector items={STAGE2_SOP_TMPL} selectedId={s2SopTmpl} onSelect={t => setS2SopTmpl(t.id)} previewTarget="prev2a" />
                  <div className="form-label">大模型</div>
                  <select className="form-select" style={{ marginBottom: 8 }} value={s2SopModel} onChange={e => setS2SopModel(e.target.value)}>
                    {STAGE2_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm w-full"
                    disabled={!steps.step1 || step2Generating !== ''}
                    onClick={async () => {
                      setStep2Generating(sub)
                      await doGenerate('step2_sop',
                        '请将以下食谱内容整理为标准操作流程(SOP)文案。按步骤、操作、标准、备注四列整理。',
                        steps.step1 || '')
                      setStep2Generating('')
                    }}>
                    {step2Generating === sub ? '⏳ 生成中...' : '⚙ AI 生成 SOP文案'}
                  </button>
                </>}

                {/* 2b: 道与术文案 */}
                {sub === '2b' && <>
                  <div className="card-title" style={{ color: 'var(--purple)' }}>💡 道与术文案生成</div>
                  <div className="card-hint">基于文案提取结果，用选定的模板（提示词+SKILL）生成「道与术」分析文案</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    <div className="form-label">数据来源</div>
                    <select className="form-select" style={{ marginBottom: 6 }} value={s2DataSource} onChange={e => setS2DataSource(e.target.value)}>
                      <option value="video">视频提取 — {steps.step1 ? '已有内容' : '暂无内容'}</option>
                      <option value="text">文字输入 — {steps.step1 ? '已有内容' : '暂无内容'}</option>
                      <option value="file">文件上传 — 暂无内容</option>
                    </select>
                  </div>
                  <div className="form-label">选择模板</div>
                  <TemplateSelector items={STAGE2_DAO_TMPL} selectedId={s2DaoTmpl} onSelect={t => setS2DaoTmpl(t.id)} previewTarget="prev2b" />
                  <div className="form-label">大模型</div>
                  <select className="form-select" style={{ marginBottom: 8 }} value={s2DaoModel} onChange={e => setS2DaoModel(e.target.value)}>
                    {STAGE2_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm w-full"
                    disabled={!steps.step1 || step2Generating !== ''}
                    onClick={async () => {
                      setStep2Generating(sub)
                      await doGenerate('step2_daoshuyi',
                        '请分析以下食谱内容的"道"（原理、烹饪哲学）与"术"（具体技巧、手法）。',
                        steps.step1 || '')
                      setStep2Generating('')
                    }}>
                    {step2Generating === sub ? '⏳ 生成中...' : '⚙ AI 生成 道与术文案'}
                  </button>
                </>}

                {/* 2c: 研学手册文案 */}
                {sub === '2c' && <>
                  <div className="card-title" style={{ color: 'var(--warning)' }}>📖 研学手册文案生成</div>
                  <div className="card-hint">基于文案提取结果，用选定的模板（提示词+SKILL）生成研学手册文案</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    <div className="form-label">数据来源</div>
                    <select className="form-select" style={{ marginBottom: 6 }} value={s2DataSource} onChange={e => setS2DataSource(e.target.value)}>
                      <option value="video">视频提取 — {steps.step1 ? '已有内容' : '暂无内容'}</option>
                      <option value="text">文字输入 — {steps.step1 ? '已有内容' : '暂无内容'}</option>
                      <option value="file">文件上传 — 暂无内容</option>
                    </select>
                  </div>
                  <div className="form-label">选择模板</div>
                  <TemplateSelector items={STAGE2_YANXI_TMPL} selectedId={s2YanxiTmpl} onSelect={t => setS2YanxiTmpl(t.id)} previewTarget="prev2c" />
                  <div className="form-label">大模型</div>
                  <select className="form-select" style={{ marginBottom: 8 }} value={s2YanxiModel} onChange={e => setS2YanxiModel(e.target.value)}>
                    {STAGE2_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm w-full"
                    disabled={!steps.step1 || step2Generating !== ''}
                    onClick={async () => {
                      setStep2Generating(sub)
                      await doGenerate('step2_yanxi',
                        '请将以下食谱内容整理为研学手册文案，包含背景知识、动手步骤、观察要点。',
                        steps.step1 || '')
                      setStep2Generating('')
                    }}>
                    {step2Generating === sub ? '⏳ 生成中...' : '⚙ AI 生成 研学手册文案'}
                  </button>
                </>}
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="card-title">生成 / 编辑</div>
                <textarea className="form-textarea" style={{ flex: 1, minHeight: 120 }}
                  value={steps[`step2_${sub === '2a' ? 'sop' : sub === '2b' ? 'daoshuyi' : 'yanxi'}`] || ''}
                  onChange={e => {
                    const key = `step2_${sub === '2a' ? 'sop' : sub === '2b' ? 'daoshuyi' : 'yanxi'}`
                    setSteps(prev => ({ ...prev, [key]: e.target.value }))
                  }}
                  placeholder="点击生成按钮，AI生成后在此编辑..." />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {sub === '2a' ? '编辑完成后保存，即可供「标准SOP」栏目引用'
                      : sub === '2b' ? '编辑完成后保存，即可供「合成PPT」栏目引用'
                        : '编辑完成后保存，即可供「合成PPT」「口播文案」栏目引用'}
                  </span>
                  <button className="btn btn-primary btn-sm" onClick={() => {
                    const key = `step2_${sub === '2a' ? 'sop' : sub === '2b' ? 'daoshuyi' : 'yanxi'}`
                    saveStep(key, steps[key] || '')
                  }}>✓ 保存</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== STAGE 3: 输出课件 ====== */}
        {stage === 3 && sub === '3a' && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                <div className="card-title">SOP 生成 + 导出</div>
                <div className="card-hint">选择模板自动关联提示词+SKILL，配置在「项目配置」→ 栏目配置</div>
                <div className="form-label">选择模板</div>
                <TemplateSelector items={SOP_TEMPLATES} selectedId={sopSelected}
                  onSelect={t => setSopSelected(t.id)} previewTarget="prev3" />
                <div className="form-label" style={{ marginTop: 10 }}>品牌信息（可选）</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input className="form-input" placeholder="版权" style={{ flex: 1 }} />
                  <input className="form-input" placeholder="签名" style={{ flex: 1 }} />
                </div>
                <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                  onClick={() => doExportSOP(steps.step2_sop || steps.step1 || '')}>
                  📄 AI 生成 + 导出 .docx
                </button>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="tmpl-preview" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="tmpl-preview-header">📃 模板预览 — {SOP_TEMPLATES.find(t => t.id === sopSelected)?.name}</div>
                  <div className="tmpl-preview-body" style={{ flex: 1, overflow: 'auto' }}>
                    <div className="prev-sop">
                      <div className="prev-title">【标准SOP】菜品名称</div>
                      <table><thead><tr><th>步骤</th><th>操作</th><th>标准</th><th>备注</th></tr></thead>
                        <tbody><tr><td>1</td><td>备料</td><td>食材洗净切配</td><td>—</td></tr>
                          <tr><td>2</td><td>烹饪</td><td>火候/时间</td><td>—</td></tr></tbody></table>
                      <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 4 }}>标准表格格式 · 清晰步骤划分</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 3 && sub === '3b' && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                <div className="card-title">📌 道术PPT</div>
                <div className="card-hint">基于道与术文案，选择模板合成PPT</div>
                <div className="form-label">选择模板</div>
                <TemplateSelector items={DAO_PPT_TEMPLATES} selectedId={daoPptSelected}
                  onSelect={t => setDaoPptSelected(t.id)} previewTarget="prev3b" />
                <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                  disabled={pptGenerating !== ''}
                  onClick={() => doGeneratePPT('step3_dao_ppt', steps.step2_daoshuyi || '', daoPptSelected, '道术PPT')}>
                  {pptGenerating === 'step3_dao_ppt' ? '⏳ 生成中...' : '📌 合成道术PPT'}
                </button>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="tmpl-preview" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="tmpl-preview-header">📌 模板预览 — {DAO_PPT_TEMPLATES.find(t => t.id === daoPptSelected)?.name}</div>
                  <div className="tmpl-preview-body" style={{ flex: 1, overflow: 'auto' }}>
                    <div className="prev-ppt">
                      <div className="prev-slide" style={{ borderTop: '3px solid var(--purple)' }}>
                        <span style={{ fontWeight: 700 }}>标题页</span>
                        <div className="slide-bar" style={{ background: 'var(--purple)' }} />
                        <span style={{ fontSize: 7 }}>道与术分析</span>
                      </div>
                      <div className="prev-slide"><span>内容页</span><div className="slide-bar" /><span style={{ fontSize: 7 }}>分析要点</span></div>
                      <div className="prev-slide"><span>内容页</span><div className="slide-bar" /><span style={{ fontSize: 7 }}>总结</span></div>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 4 }}>深色商务风 · 3页布局 · 结构清晰</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 3 && sub === '3c' && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                <div className="card-title">📚 研学PPT</div>
                <div className="card-hint">基于研学手册文案，选择模板合成PPT</div>
                <div className="form-label">选择模板</div>
                <TemplateSelector items={YANXI_PPT_TEMPLATES} selectedId={yanxiPptSelected}
                  onSelect={t => setYanxiPptSelected(t.id)} previewTarget="prev3c" />
                <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                  disabled={pptGenerating !== ''}
                  onClick={() => doGeneratePPT('step3_yan_ppt', steps.step2_yanxi || '', yanxiPptSelected, '研学PPT')}>
                  {pptGenerating === 'step3_yan_ppt' ? '⏳ 生成中...' : '📌 合成研学PPT'}
                </button>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="tmpl-preview" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="tmpl-preview-header">📚 模板预览 — {YANXI_PPT_TEMPLATES.find(t => t.id === yanxiPptSelected)?.name}</div>
                  <div className="tmpl-preview-body" style={{ flex: 1, overflow: 'auto' }}>
                    <div className="prev-ppt">
                      <div className="prev-slide" style={{ borderTop: '3px solid var(--success)' }}>
                        <span style={{ fontWeight: 700 }}>研学封面</span>
                        <div className="slide-bar" style={{ background: 'var(--success)' }} />
                      </div>
                      <div className="prev-slide"><span>背景</span><div className="slide-bar" /></div>
                      <div className="prev-slide"><span>步骤</span><div className="slide-bar" /></div>
                      <div className="prev-slide"><span>要点</span><div className="slide-bar" /></div>
                      <div className="prev-slide"><span>总结</span><div className="slide-bar" /></div>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 4 }}>清新学术风 · 5页布局 · 体系完整</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== STAGE 4: 语音课件 ====== */}
        {stage === 4 && sub === '4a' && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                <div className="card-title">口播文案</div>
                <div className="card-hint">基于研学手册文案，选择模板生成口播稿</div>
                <div className="form-label">来源</div>
                <select className="form-select" style={{ marginBottom: 8 }}><option>研学手册文案</option></select>
                <div className="form-label">选择模板</div>
                <TemplateSelector items={KOUBO_TEMPLATES} selectedId={kouboSelected}
                  onSelect={t => setKouboSelected(t.id)} previewTarget="prev4a" />
                <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                  onClick={async () => {
                    setStep2Generating('koubo')
                    const content = await doGenerate('step4_koubo',
                      '你是一个短视频口播稿专家。请根据以下研学手册内容生成口播稿，风格亲切自然，适合美食类短视频。',
                      steps.step2_yanxi || steps.step1 || '')
                    if (content) setKouboText(content)
                    setStep2Generating('')
                  }}>
                  {step2Generating === 'koubo' ? '⏳ 生成中...' : '📢 生成口播稿'}
                </button>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="tmpl-preview" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="tmpl-preview-header">📢 口播稿预览 — {KOUBO_TEMPLATES.find(t => t.id === kouboSelected)?.name}</div>
                  <div className="tmpl-preview-body" style={{ flex: 1, overflow: 'auto' }}>
                    <div className="prev-script">
                      {steps.step4_koubo ? (
                        steps.step4_koubo.split('\n').map((line, i) => <p key={i}>{line || ' '}</p>)
                      ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>点击「生成口播稿」生成...</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 4 && sub === '4b' && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                <div className="card-title">TTS 语音合成</div>
                <div className="card-hint">选择模板自动关联音色+语速+音量</div>
                <div className="form-label">来源</div>
                <select className="form-select" style={{ marginBottom: 8 }}><option>口播文案</option></select>
                <div className="form-label">引擎</div>
                <select className="form-select" style={{ marginBottom: 8 }}><option>CosyVoice (DashScope)</option></select>
                <div className="form-label">选择模板</div>
                <TemplateSelector items={VOICE_TEMPLATES} selectedId={voiceSelected}
                  onSelect={t => setVoiceSelected(t.id)} previewTarget="prev4b" />
                <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                  disabled={ttsGenerating} onClick={doTTS}>
                  {ttsGenerating ? '⏳ 合成中...' : '🔊 语音合成'}
                </button>
                {ttsAudioUrl && (
                  <div style={{ marginTop: 8 }}>
                    <audio controls style={{ width: '100%', height: 32 }}>
                      <source src={ttsAudioUrl} type="audio/mpeg" />
                    </audio>
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }}
                      onClick={() => downloadFile(ttsAudioUrl, 'tts_output.mp3')}>
                      💾 下载 .mp3
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="tmpl-preview" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="tmpl-preview-header">🎵 音色预览 — {VOICE_TEMPLATES.find(t => t.id === voiceSelected)?.name}</div>
                  <div className="tmpl-preview-body" style={{ flex: 1, overflow: 'auto' }}>
                    <div className="prev-voice">
                      <div className="voice-wave" />
                      <div className="voice-meta">
                        <strong>{VOICE_TEMPLATES.find(t => t.id === voiceSelected)?.name}</strong><br />
                        语速: 1.0x · 音量: 50%<br />风格: 自然亲切
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6 }}>
                      适合美食类口播，声音柔和有亲和力
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== STAGE 5: 输出列表 ====== */}
        {stage === 5 && (
          <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="card-title">所有产出物</div>
            {genFiles.length > 0 ? (
              <table className="output-table">
                <thead><tr><th>文件</th><th>类型</th><th>来源</th><th>大小</th><th>操作</th></tr></thead>
                <tbody>
                  {genFiles.map((f, i) => (
                    <tr key={i}>
                      <td>
                        {f.type === 'Word' ? '📃 ' : f.type === 'PPT' ? '📌 ' : '🎵 '}
                        {f.name}
                      </td>
                      <td>{f.type}</td>
                      <td>{f.source}</td>
                      <td style={{ fontSize: 10, color: 'var(--text-secondary)' }}>—</td>
                      <td>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => downloadFile(f.url, f.name)}>下载</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
                暂无产出物。请完成前面阶段的生成后，文件将自动出现在此列表中。
              </div>
            )}
            {genFiles.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-outline btn-sm"
                  onClick={async () => {
                    for (const f of genFiles) {
                      try { await downloadFile(f.url, f.name) } catch (e: any) { /* skip failed */ }
                    }
                  }}>
                  📦 一键下载全部 ({genFiles.length} 个文件)
                </button>
                <button className="btn btn-ghost btn-sm">📁 打开文件夹</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Config Bar ═══ */}
      <div className="config-bar">
        <span className="cb-label">⚙ 当前栏目配置：</span>
        <span>模型</span> <span className="cb-val">{CONFIG[stage]?.model}</span>
        <span className="cb-sep">|</span>
        <span>模板</span> <span className="cb-val">{CONFIG[stage]?.tmpl}</span>
        {CONFIG[stage]?.tmplInfo && (
          <span style={{ fontSize: 9, color: '#999' }}>({CONFIG[stage]?.tmplInfo})</span>
        )}
        <span className="cb-sep">|</span>
        <span>项目路径</span> <span className="cb-val" style={{ color: 'var(--text-secondary)' }}>{project?.name}</span>
        <a className="cb-edit" onClick={() => navigate('/proj-settings')}>前往项目配置修改</a>
      </div>

      {/* ═══ Video Check Dialog ═══ */}
      {vcOpen && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setVcOpen(false) }}>
          <div className="dialog-box wide">
            <div className="dialog-title">📺 视频播放校验 <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>确认字幕内容是否准确</span></div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1, background: '#000', borderRadius: 8, minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 48 }}>
                ▶
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <textarea className="form-textarea" style={{ flex: 1, minHeight: 250 }}
                  value={steps.step1 || ''}
                  onChange={e => setSteps(prev => ({ ...prev, step1: e.target.value }))} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setVcOpen(false)}>取消</button>
                  <button className="btn btn-primary btn-sm" onClick={() => { saveStep('step1', steps.step1 || ''); setVcOpen(false) }}>
                    保存并关闭
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
