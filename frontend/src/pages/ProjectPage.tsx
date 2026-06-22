import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, Voice, TTSProvider, LLMProvider } from '../services/api'
import { useModal } from '../components/ModalProvider'

// ── Types ──
interface Project {
  id: string; name: string; status: string; source_type: string
  storage_path?: string
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

// Stage 1 mode-specific prompts + shared SKILL
const STAGE1_SKILL = '## 菜名\n**菜名**：\n**菜系**：\n**成品特征**：\n**出品标准**：\n**记录日期**：\n**制作人/来源**：\n\n### 一、食材清单\n| 序号 | 用途 | 食材名称 | 用量 | 处理方式 | 备注 |\n|------|------|----------|------|----------|------|\n| 1 | 主料 | | | | |\n| 2 | 辅料 | | | | |\n| 3 | 调料 | | | | |\n\n> **准备要点**：\n\n### 二、工具与器皿\n| 序号 | 用途 | 工具名称 |\n|------|------|----------|\n| 1 | | |\n\n### 三、制作步骤\n| 序号 | 步骤 | 步骤说明 | 关键技巧 |\n|------|------|----------|----------|\n| 1 | 预处理 | | |\n| 2 | 烹饪 | | |\n\n### 四、时间与火候总览\n| 阶段 | 时长 | 火力 | 注意事项 |\n|------|------|------|----------|\n| | | | |\n\n### 五、试吃与品鉴记录\n- **口味**：\n- **口感**：\n- **色泽**：\n\n### 六、总结与评分\n- **难度**：☆\n- **耗时**：\n- **一句话点评**：'

const STAGE1_PROMPTS: Record<string, string> = {
  text: '你是国家高级烹饪技师、菜谱SOP规范整理专家。请将用户手打输入的食谱笔记整理为标准SOP文档。\n\n输入特征：口语化笔记，可能含简写、跳跃表述、隐含信息。\n\n提取策略：\n1. 术语标准化 — 「一点」「适量」等模糊词保留原样，标注「用量待确认」；「切碎」「剁」等动词统一为「切丁/切片/切末」\n2. 补全隐含步骤 — 如原文写「炒肉」，拆解为「热锅→凉油→下肉→翻炒至变色」\n3. 分离主料/辅料/调料 — 从笔记中归类食材用途\n4. 推断缺失字段 — 如原文提到了处理方式但未写工具，可从处理方式反推\n\n铁律：不得新增原文没有的食材或步骤；无法确定的信息标注「未提供」；所有数值（用量、时间、温度）原样保留，不得修改。',
  video: '你是国家高级烹饪技师、菜谱SOP规范整理专家。请根据视频相关内容提取完整的食谱SOP文档。\n\n输入特征：含时间戳的字幕碎片、创作者口语叙述、可能夹杂开场/互动/广告等非烹饪内容。\n\n多源提取优先级：\n1. 视频描述/简介 → 创作者常在此贴完整食谱（最高权重）\n2. 内嵌字幕文本 → 需过滤时间戳噪音，合并跨句碎片\n3. 音频转写文本（Whisper）→ 口语化表述需标准化\n\n提取策略：\n- 去噪：删除开场白、互动问答、广告口播、BGM歌词等非烹饪段落\n- 合并碎片：跨时间戳的同一操作步骤合并为一条完整说明\n- 重建顺序：如字幕顺序与操作顺序不一致，按烹饪逻辑重排\n- 量化识别：提取所有中文和西式计量单位（克/g、毫升/ml、汤匙/tbsp、茶匙/tsp、杯/cup），识别视频中提到的具体数值\n\n铁律：不得新增视频中没有的食材或步骤；无法确定的信息标注「视频未提及」；数值宁缺毋滥。',
  file: '你是国家高级烹饪技师、菜谱SOP规范整理专家。请从上传文件中提取完整食谱内容，整理为标准SOP文档。\n\n输入特征：可能是 Word/PDF/图片 OCR 文本，可能含格式杂讯、乱码、扫描错误，也可能已是半结构化文档。\n\n提取策略：\n- 格式清洗：去除页眉页脚、水印文字、行号等非内容标记\n- 结构识别：自动检测原文是否已分段（食材清单/步骤/工具），提取已有结构，不重复包装\n- 表格还原：如原文为表格形式，直接映射到输出模板对应列\n- 数值校对：扫描出的数字（尤其是 0/O、1/l、6/8 等混用）结合上下文纠正；如「30O克」→「300克」\n- 乱码处理：明显 OCR 错误的文本结合烹饪常识修正，无法修正的标注「原文模糊」\n\n铁律：不得新增文件没有的食材或步骤；无法辨识的内容标注「原文模糊」而非编造；所有可辨识的数值精确保留。',
}

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
  const [asrProviders, setAsrProviders] = useState<any[]>([])
  const [asrProviderId, setAsrProviderId] = useState('')
  const [asrModels, setAsrModels] = useState<string[]>([])
  const [videoUrl, setVideoUrl] = useState('')
  const [asrModel, setAsrModel] = useState('fun-asr')
  const [dlStatus, setDlStatus] = useState('')
  const [dlPercent, setDlPercent] = useState(0)
  const [dlTaskId, setDlTaskId] = useState('')
  const [videoPath, setVideoPath] = useState('')
  const [textInput, setTextInput] = useState('')
  const mode1 = sub === '1a' ? 'link' : sub === '1b' ? 'text' : 'file' as 'link' | 'text' | 'file'
  const mode1Key = sub === '1a' ? 'video' : sub === '1b' ? 'text' : 'file'
  const [vcOpen, setVcOpen] = useState(false)
  const [savedFlash, setSavedFlash] = useState(0)
  const flashSave = () => {
    setSavedFlash(Date.now())
    setTimeout(() => setSavedFlash(0), 1500)
  }
  const vcRef = useRef<HTMLDivElement>(null)
  const [vcPos, setVcPos] = useState({ x: 0, y: 0 })
  const [vcSize, setVcSize] = useState({ w: 0, h: 0 })
  const dragRef = useRef<{ down: boolean; sx: number; sy: number; px: number; py: number }>({ down: false, sx: 0, sy: 0, px: 0, py: 0 })
  const resizing = useRef(false)
  const overlayRef = useRef(false)
  const [sourceTab, setSourceTab] = useState<'merged' | 'asr' | 'subtitle'>('merged')
  const [sourceMerged, setSourceMerged] = useState('')
  const [sourceAsr, setSourceAsr] = useState('')
  const [sourceSubtitle, setSourceSubtitle] = useState('')
  const [llmProviders, setLlmProviders] = useState<LLMProvider[]>([])
  const [step1Model, setStep1Model] = useState('')
  const [step1Generating, setStep1Generating] = useState(false)
  const [step1Source, setStep1Source] = useState('')

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
  const [ttsProviderId, setTtsProviderId] = useState('')
  const [ttsModel, setTtsModel] = useState('cosyvoice-v3-flash')
  const [voiceId, setVoiceId] = useState('')
  const [ttsVoices, setTtsVoices] = useState<Voice[]>([])
  const [ttsProviders, setTtsProviders] = useState<TTSProvider[]>([])
  const [kouboText, setKouboText] = useState('')
  const [ttsGenerating, setTtsGenerating] = useState(false)
  const [ttsAudioUrl, setTtsAudioUrl] = useState('')
  const [projStoragePath, setProjStoragePath] = useState('')
  const [savingPath, setSavingPath] = useState(false)

  // Load project
  useEffect(() => {
    if (!id) return
    api.getProject(id).then(p => {
      setProject(p)
      setProjStoragePath(p.storage_path || '')
    }).catch(() => navigate('/'))
    api.getSteps(id).then((s: any[]) => {
      const map: Record<string, string> = {}
      s.forEach((x: any) => { map[x.step_name] = x.content })
      setSteps(map)
      if (map['video_text']) {
        setStep1Source(map['video_text'])
        setTextInput(map['video_text'])
      }
    })
    api.listTtsProviders().then((providers: TTSProvider[]) => {
      setTtsProviders(providers)
      if (providers.length > 0 && !ttsProviderId) {
        const def = providers.find(p => p.is_default) || providers[0]
        setTtsProviderId(def.id)
        const models = Array.isArray(def.models) ? def.models : []
        if (models.length > 0) setTtsModel(models[0])
      }
    }).catch(() => {})
    api.listVoices().then((v: Voice[]) => {
      setTtsVoices(v)
      if (v.length > 0 && !voiceId) {
        const def = v.find(x => x.is_default) || v[0]
        setVoiceId(def.id)
      }
    }).catch(() => {})
    api.listAsrProviders().then((providers: any[]) => {
      setAsrProviders(providers)
      const enabled = providers.filter((p: any) => p.is_enabled)
      if (enabled.length > 0) {
        const def = enabled.find((p: any) => p.is_default) || enabled[0]
        setAsrProviderId(def.id)
        const models: string[] = Array.isArray(def.models) ? def.models : (def.models || '').split(',').map((s: string) => s.trim()).filter(Boolean)
        setAsrModels(models)
        if (models.length > 0 && !models.includes(asrModel)) {
          setAsrModel(models.includes('fun-asr') ? 'fun-asr' : models[0])
        }
      }
    }).catch(() => {})
    api.listProviders().then((providers: LLMProvider[]) => {
      setLlmProviders(providers)
      if (providers.length > 0 && !step1Model) {
        const def = providers.find(p => p.is_enabled) || providers[0]
        const models = Array.isArray(def.models) ? def.models : []
        if (models.length > 0) setStep1Model(`${def.id}:${models[0]}`)
      }
    }).catch(() => {})
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
    if (!videoUrl.trim()) {
      modal.toast('请先粘贴视频链接', 'error')
      return
    }
    setDlStatus('downloading'); setDlPercent(0)
    try {
      const result: any = await api.downloadVideo(videoUrl, undefined, id, asrModel, asrProviderId)
      setDlTaskId(result.task_id)
      pollProgress(result.task_id)
    } catch (e: any) { setDlStatus('error: ' + e.message) }
  }
  const pollProgress = async (taskId: string) => {
    const poll = async () => {
      const p: any = await api.getVideoProgress(taskId)
      setDlPercent(p.percent); setDlStatus(p.status)
      if (p.text) setStep1Source(p.text)
      if (p.subtitle_text) setSourceSubtitle(p.subtitle_text)
      if (p.asr_text) setSourceAsr(p.asr_text)
      if (p.merged_text) { setSourceMerged(p.merged_text); setStep1Source(p.merged_text); setSourceTab('merged') }
      else if (p.asr_text) { setSourceTab('asr') }
      else if (p.subtitle_text) { setSourceTab('subtitle') }
      if (p.video_path) setVideoPath(p.video_path)
      if (p.status === 'completed') {
        setDlStatus('done')
        modal.toast('✅ 视频下载完成', 'success')
        return
      }
      if (p.status === 'failed') { setDlStatus('failed'); modal.toast('❌ 下载失败', 'error'); return }
      setTimeout(poll, 1000)
    }
    poll()
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

  // ── Stage 1 Generate ──
  const doGenerateStep1 = async () => {
    const source = mode1 === 'text' ? textInput : step1Source
    if (!source.trim() || !id || !step1Model) return
    setStep1Generating(true)
    try {
      const [providerId, model] = step1Model.split(':')
      const prompt = STAGE1_PROMPTS[mode1Key]
      const result: any = await api.llmGenerate({
        provider_id: providerId, model,
        system_prompt: prompt,
        user_message: `请将以下内容按指定格式整理：\n\n${source}\n\n输出格式要求：\n${STAGE1_SKILL}`,
      })
      const content = result.content
      setSteps(prev => ({ ...prev, step1: content }))
      saveStep('step1', content)
    } catch (e: any) { modal.toast('生成失败: ' + e.message, 'error') }
    finally { setStep1Generating(false) }
  }

  // ── PPT / SOP Generation ──
  const doGeneratePPT = async (stepKey: string, content: string, tmplId: string, label: string) => {
    setPptGenerating(stepKey)
    try {
      const result: any = await api.generatePPT(content, tmplId, undefined, id)
      setGenFiles(prev => [...prev, {
        name: result.filename, type: 'PPT',
        source: label,
        url: result.download_url || '/api/download/' + encodeURIComponent(result.filename),
      }])
      modal.toast(`PPT 已生成: ${result.filename}`, 'success')
    } catch (e: any) { modal.toast('PPT生成失败: ' + e.message, 'error') }
    finally { setPptGenerating('') }
  }
  const doExportSOP = async (content: string) => {
    try {
      const result: any = await api.exportSOP(content, undefined, id)
      setGenFiles(prev => [...prev, {
        name: result.filename, type: 'Word',
        source: 'SOP课件',
        url: result.download_url || '/api/download/' + encodeURIComponent(result.filename),
      }])
      modal.toast(`SOP 已导出: ${result.filename}`, 'success')
    } catch (e: any) { modal.toast('SOP导出失败: ' + e.message, 'error') }
  }

  // ── TTS ──
  const doTTS = async () => {
    if (!kouboText.trim()) return
    setTtsGenerating(true)
    try {
      const selectedVoice = ttsVoices.find(v => v.id === voiceId)
      const result: any = await api.ttsSynthesize(
        kouboText, ttsModel,
        selectedVoice?.voice_id,
        undefined, undefined,
        id, ttsProviderId || undefined,
      )
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
              {/* Shared model selector */}
              <div className="card">
                <div className="card-title">🤖 模型选择</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select className="form-select" style={{ flex: 1 }}
                    value={step1Model}
                    onChange={e => setStep1Model(e.target.value)}>
                    <option value="">选择模型...</option>
                    {llmProviders.filter(p => p.is_enabled).map(p =>
                      (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                        <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* 1a: Video Link */}
              {mode1 === 'link' && <>
                <div className="card">
                  <div className="card-title">📺 视频提取</div>
                  <div className="card-hint">粘贴视频链接 → 下载 + 语音识别 → 提取内容在下方编辑</div>
                  <input className="form-input" placeholder="粘贴视频链接（支持抖音/B站/YouTube等）"
                    value={videoUrl} onChange={e => setVideoUrl(e.target.value)} style={{ marginBottom: 6 }} />
                  <div className="form-row" style={{ gap: 6, marginBottom: 6 }}>
                    {asrProviders.filter((p: any) => p.is_enabled).length > 1 && (
                      <select className="form-select" style={{ flex: 1 }}
                        value={asrProviderId}
                        onChange={e => {
                          setAsrProviderId(e.target.value)
                          const prov = asrProviders.find((p: any) => p.id === e.target.value)
                          if (prov) {
                            const models: string[] = Array.isArray(prov.models) ? prov.models : (prov.models || '').split(',').map((s: string) => s.trim()).filter(Boolean)
                            setAsrModels(models)
                            if (models.length > 0 && !models.includes(asrModel)) {
                              setAsrModel(models[0])
                            }
                          }
                        }}>
                        {asrProviders.filter((p: any) => p.is_enabled).map((p: any) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    )}
                    <select className="form-select" style={{ flex: 1 }}
                      value={asrModel}
                      onChange={e => setAsrModel(e.target.value)}>
                      {asrModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-primary btn-sm w-full"
                    onClick={handleVideoDownload} disabled={dlStatus === 'downloading'}>
                    ▶ 下载并识别
                  </button>
                  {dlStatus === 'downloading' && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--primary)', marginBottom: 4 }}>⏳ 正在下载... {dlPercent}%</div>
                      <div style={{ background: 'var(--border)', height: 6, borderRadius: 3 }}>
                        <div style={{ width: Math.max(dlPercent, 2) + '%', height: '100%', background: 'var(--primary)', borderRadius: 3, transition: 'width .3s' }} />
                      </div>
                    </div>
                  )}
                  {dlStatus === 'done' && <div className="form-hint" style={{ color: 'var(--success)' }}>✅ 下载完成</div>}
                  {dlStatus === 'failed' && <div className="form-hint" style={{ color: 'var(--warning)' }}>❌ 下载失败</div>}
                  {dlStatus.startsWith('error') && <div className="form-hint" style={{ color: 'var(--warning)' }}>{dlStatus}</div>}
                  <button className="btn btn-ghost btn-sm w-full" style={{ marginTop: 4 }}
                    onClick={async () => {
                      if (!videoPath && id) {
                        try {
                          const vids: any = await api.listProjectVideos(id)
                          if (vids.videos?.length > 0) setVideoPath(vids.videos[0].path)
                        } catch (_) {}
                      }
                      setVcOpen(true)
                    }} >
                    📺 播放校验
                  </button>
                  <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 8 }}
                    disabled={step1Generating || !step1Model || !step1Source.trim()}
                    onClick={doGenerateStep1}>
                    {step1Generating ? '⏳ 生成中...' : '⚙ 整理文档'}
                  </button>
                </div>
                {step1Source && (
                  <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div className="card-title">📝 提取的原始文本</div>
                    <div className="card-hint">视频提取的原始字幕内容，可编辑后重新生成</div>
                    {(sourceMerged || sourceAsr || sourceSubtitle) && (
                      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                        {sourceMerged && (
                          <button
                            className={`btn ${sourceTab === 'merged' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                            onClick={() => { setSourceTab('merged'); setStep1Source(sourceMerged) }}>
                            合并版
                          </button>
                        )}
                        {sourceAsr && (
                          <button
                            className={`btn ${sourceTab === 'asr' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                            onClick={() => { setSourceTab('asr'); setStep1Source(sourceAsr) }}>
                            语音识别
                          </button>
                        )}
                        {sourceSubtitle && (
                          <button
                            className={`btn ${sourceTab === 'subtitle' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                            onClick={() => { setSourceTab('subtitle'); setStep1Source(sourceSubtitle) }}
                            disabled={!sourceSubtitle}>
                            字幕
                          </button>
                        )}
                      </div>
                    )}
                    <textarea className="form-textarea" style={{ flex: 1, minHeight: 150 }}
                      value={step1Source}
                      onChange={e => setStep1Source(e.target.value)}
                      placeholder="视频字幕将显示在此..." />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setStep1Source('')}>🗑 清空</button>
                      <button className="btn btn-primary btn-sm" disabled={!step1Source.trim()}
                        onClick={() => { if (id && step1Source.trim()) { saveStep('video_text', step1Source); flashSave() } }} style={savedFlash ? { background: '#22c55e', borderColor: '#22c55e', color: '#fff' } : undefined}>{savedFlash ? '✓ 已保存' : '💾 保存'}</button>
                    </div>
                  </div>
                )}
                <div className="card">
                  <div className="card-title">📁 项目保存路径</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input className="form-input" style={{ fontSize: 10, flex: 1 }}
                      value={projStoragePath}
                      onChange={e => setProjStoragePath(e.target.value)}
                      placeholder={project?.storage_path || `D:\\YISHAOAGENT\\data\\output\\${project?.name || ''}`} />
                    <button className="btn btn-ghost btn-sm" title="打开文件夹"
                      onClick={async () => {
                        const p = (projStoragePath || project?.storage_path || '').replace(/\\/g, '/')
                        if (p) {
                          try { await api.openFolder(p) } catch { modal.toast('无法打开文件夹', 'error') }
                        }
                      }}>
                      📂
                    </button>
                    <button className="btn btn-ghost btn-sm"
                      disabled={savingPath}
                      onClick={async () => {
                        if (!id) return
                        const p = projStoragePath.trim() || (project?.storage_path || `D:\\YISHAOAGENT\\data\\output\\${project?.name || ''}`)
                        setSavingPath(true)
                        try {
                          await api.updateProject(id, { storage_path: p })
                          setProjStoragePath(p)
                          setProject(prev => prev ? { ...prev, storage_path: p } : prev)
                          modal.toast('保存路径已更新', 'success')
                        } catch (e: any) {
                          modal.toast('保存失败: ' + e.message, 'error')
                        } finally { setSavingPath(false) }
                      }}>
                      {savingPath ? '...' : '保存'}
                    </button>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 4 }}>
                    留空则使用全局默认路径
                  </div>
                </div>
              </>}

              {/* 1b: Text Input */}
              {mode1 === 'text' && (
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="card-title">✏️ 文字输入</div>
                  <div className="card-hint">直接粘贴或输入食谱笔记，可编辑后重新生成</div>
                  <textarea className="form-textarea" style={{ flex: 1, minHeight: 280 }}
                    placeholder="在此粘贴或输入食谱笔记..."
                    value={textInput} onChange={e => setTextInput(e.target.value)} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setTextInput('')}>🗑 清空</button>
                    <button className="btn btn-primary btn-sm" disabled={!textInput.trim()}
                      onClick={() => { if (id && textInput.trim()) { setStep1Source(textInput); saveStep('video_text', textInput); flashSave() } }} style={savedFlash ? { background: '#22c55e', borderColor: '#22c55e', color: '#fff' } : undefined}>{savedFlash ? '✓ 已保存' : '💾 保存'}</button>
                    <button className="btn btn-primary btn-sm"
                      disabled={step1Generating || !step1Model || !textInput.trim()}
                      onClick={doGenerateStep1}>
                      {step1Generating ? '⏳ 生成中...' : '⚙ 整理文档'}
                    </button>
                  </div>
                </div>
              )}

              {/* 1c: File Upload */}
              {mode1 === 'file' && <>
                <div className="card">
                  <div className="card-title">📄 文件上传</div>
                  <div className="card-hint">支持 .txt / .md / .docx 文件，读取后内容在下方编辑</div>
                  <input type="file" accept=".txt,.md,.docx" style={{ fontSize: 10, marginBottom: 6 }}
                    onChange={async e => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      const text = await f.text()
                      setStep1Source(text)
                    }} />
                  <button className="btn btn-primary btn-sm w-full"
                    disabled={step1Generating || !step1Model || !step1Source.trim()}
                    onClick={doGenerateStep1}>
                    {step1Generating ? '⏳ 生成中...' : '⚙ 整理文档'}
                  </button>
                </div>
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="card-title">📝 文件原始内容</div>
                  <div className="card-hint">文件读取的原始内容，可编辑后重新生成</div>
                  <textarea className="form-textarea" style={{ flex: 1, minHeight: 200 }}
                    value={step1Source}
                    onChange={e => setStep1Source(e.target.value)}
                    placeholder="文件内容将显示在此..." />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setStep1Source('')}>🗑 清空</button>
                    <button className="btn btn-primary btn-sm" disabled={!step1Source.trim()}
                      onClick={() => { if (id && step1Source.trim()) { saveStep('video_text', step1Source); flashSave() } }} style={savedFlash ? { background: '#22c55e', borderColor: '#22c55e', color: '#fff' } : undefined}>{savedFlash ? '✓ 已保存' : '💾 保存'}</button>
                  </div>
                </div>
                <div className="card">
                  <div className="card-title">📁 项目保存路径</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input className="form-input" style={{ fontSize: 10, flex: 1 }}
                      value={projStoragePath}
                      onChange={e => setProjStoragePath(e.target.value)}
                      placeholder={project?.storage_path || `D:\\YISHAOAGENT\\data\\output\\${project?.name || ''}`} />
                    <button className="btn btn-ghost btn-sm" title="打开文件夹"
                      onClick={async () => {
                        const p = (projStoragePath || project?.storage_path || '').replace(/\\/g, '/')
                        if (p) {
                          try { await api.openFolder(p) } catch { modal.toast('无法打开文件夹', 'error') }
                        }
                      }}>
                      📂
                    </button>
                    <button className="btn btn-ghost btn-sm"
                      disabled={savingPath}
                      onClick={async () => {
                        if (!id) return
                        const p = projStoragePath.trim() || (project?.storage_path || `D:\\YISHAOAGENT\\data\\output\\${project?.name || ''}`)
                        setSavingPath(true)
                        try {
                          await api.updateProject(id, { storage_path: p })
                          setProjStoragePath(p)
                          setProject(prev => prev ? { ...prev, storage_path: p } : prev)
                          modal.toast('保存路径已更新', 'success')
                        } catch (e: any) {
                          modal.toast('保存失败: ' + e.message, 'error')
                        } finally { setSavingPath(false) }
                      }}>
                      {savingPath ? '...' : '保存'}
                    </button>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 4 }}>
                    留空则使用全局默认路径
                  </div>
                </div>
              </>}
            </div>

            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="card-title">🤖 AI 生成结果</div>
                <textarea className="form-textarea" style={{ flex: 1, minHeight: 280 }}
                  value={steps.step1 || ''}
                  onChange={e => { setSteps(prev => ({ ...prev, step1: e.target.value })) }}
                  placeholder="点击左侧「生成」按钮，AI 整理后的标准 SOP 文档将显示在此..." />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {mode1 === 'link' ? '来源：视频提取' : mode1 === 'text' ? '来源：文字输入' : '来源：文件上传'}
                  </span>
                  <span style={{ display: 'flex', gap: 5 }}>
                    <button className="btn btn-ghost btn-sm"
                      disabled={!steps.step1}
                      onClick={async () => {
                        if (!id) return
                        try {
                          const resp = await api.saveFileToProject(id, `${project?.name || '文档'}_AI整理.txt`, steps.step1 || '')
                          modal.toast(`已保存到 ${resp.path}`, 'success')
                        } catch (e: any) {
                          modal.toast('保存失败: ' + e.message, 'error')
                        }
                      }}>📥 保存到项目</button>
                    <button className="btn btn-primary btn-sm"
                      disabled={!steps.step1}
                      onClick={() => saveStep('step1', steps.step1 || '')}>✓ 保存</button>
                    <button className="btn btn-ghost btn-sm"
                      disabled={!steps.step1}
                      onClick={() => { setSteps(prev => ({ ...prev, step1: '' })); saveStep('step1', '') }}>✕ 清空</button>
                  </span>
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
                  <span style={{ display: 'flex', gap: 5 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      const key = `step2_${sub === '2a' ? 'sop' : sub === '2b' ? 'daoshuyi' : 'yanxi'}`
                      setSteps(prev => ({ ...prev, [key]: '' }))
                      saveStep(key, '')
                    }}>✕ 清空</button>
                    <button className="btn btn-primary btn-sm" onClick={() => {
                      const key = `step2_${sub === '2a' ? 'sop' : sub === '2b' ? 'daoshuyi' : 'yanxi'}`
                      saveStep(key, steps[key] || '')
                    }}>✓ 保存</button>
                  </span>
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
                <div className="card-hint">选择提供商、合成模型和音色，生成语音文件</div>
                <div className="form-label">来源</div>
                <select className="form-select" style={{ marginBottom: 8 }}><option>口播文案</option></select>
                <div className="form-label">TTS 提供商</div>
                <select className="form-select" style={{ marginBottom: 8 }}
                  value={ttsProviderId} onChange={e => {
                    setTtsProviderId(e.target.value)
                    const p = ttsProviders.find(x => x.id === e.target.value)
                    if (p) {
                      const models = Array.isArray(p.models) ? p.models : []
                      if (models.length > 0) setTtsModel(models[0])
                      api.listVoices(e.target.value).then(setTtsVoices).catch(() => {})
                    }
                  }}>
                  {ttsProviders.length === 0 && <option value="">暂无提供商</option>}
                  {ttsProviders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div className="form-label">合成模型</div>
                <select className="form-select" style={{ marginBottom: 8 }}
                  value={ttsModel} onChange={e => setTtsModel(e.target.value)}>
                  {(Array.isArray(ttsProviders.find(p => p.id === ttsProviderId)?.models)
                    ? ttsProviders.find(p => p.id === ttsProviderId)!.models
                    : []).map((m: string) => <option key={m} value={m}>{m}</option>)}
                </select>
                <div className="form-label">音色</div>
                <select className="form-select" style={{ marginBottom: 10 }}
                  value={voiceId} onChange={e => setVoiceId(e.target.value)}>
                  <option value="">默认音色 (系统)</option>
                  {ttsVoices.map(v => <option key={v.id} value={v.id}>{v.name} ({v.voice_id})</option>)}
                </select>
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
                  <div className="tmpl-preview-header">🎵 音色预览 — {ttsVoices.find(v => v.id === voiceId)?.name || '默认音色'}</div>
                  <div className="tmpl-preview-body" style={{ flex: 1, overflow: 'auto' }}>
                    <div className="prev-voice">
                      <div className="voice-wave" />
                      <div className="voice-meta">
                        <strong>{ttsVoices.find(v => v.id === voiceId)?.name || '系统默认音色'}</strong><br />
                        音色ID: {ttsVoices.find(v => v.id === voiceId)?.voice_id || 'longanyang'}<br />
                        {ttsVoices.find(v => v.id === voiceId)?.description || '自然亲切的女声'}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6 }}>
                      {ttsVoices.find(v => v.id === voiceId)?.description || '适合美食类口播，声音柔和有亲和力'}
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
        <span>项目路径</span> <span className="cb-val" style={{ color: 'var(--text-secondary)' }}>{projStoragePath || project?.storage_path || project?.name || '—'}</span>
        <a className="cb-edit" onClick={() => navigate('/proj-settings')}>前往项目配置修改</a>
      </div>

      {/* ═══ Video Check Dialog ═══ */}
      {vcOpen && (
        <div className="dialog-overlay"
          onMouseDown={e => { if (e.target === e.currentTarget) overlayRef.current = true }}
          onMouseUp={e => {
            if (e.target === e.currentTarget && overlayRef.current && !dragRef.current.down && !resizing.current) {
              setVcOpen(false)
            }
            overlayRef.current = false
          }}>
          <div className="dialog-box video-checker" ref={vcRef}
            style={{
              ...((vcPos.x || vcPos.y) ? { position: 'absolute' as const, left: vcPos.x, top: vcPos.y } : {}),
              ...((vcSize.w || vcSize.h) ? { width: vcSize.w, height: vcSize.h } : {}),
            }}>
            <div className="dialog-title" style={{ cursor: 'move', userSelect: 'none' }}
              onMouseDown={e => {
                const el = vcRef.current
                if (!el) return
                const rect = el.getBoundingClientRect()
                dragRef.current = { down: true, sx: e.clientX, sy: e.clientY, px: rect.left, py: rect.top }
                const onMove = (ev: MouseEvent) => {
                  if (!dragRef.current.down) return
                  setVcPos({ x: dragRef.current.px + (ev.clientX - dragRef.current.sx), y: dragRef.current.py + (ev.clientY - dragRef.current.sy) })
                }
                const onUp = () => {
                  setTimeout(() => { dragRef.current.down = false }, 0)
                  document.removeEventListener('mousemove', onMove)
                  document.removeEventListener('mouseup', onUp)
                }
                document.addEventListener('mousemove', onMove)
                document.addEventListener('mouseup', onUp)
              }}>
              📺 视频播放校验 <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>确认字幕内容是否准确</span>
            </div>
            <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
              <div style={{ flex: 3, background: '#000', borderRadius: 8, minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {videoPath ? (
                  <video src={`/api/video/file?path=${encodeURIComponent(videoPath)}`} controls style={{ width: '100%', height: '100%', borderRadius: 8 }}
                    onError={() => modal.toast('视频加载失败', 'error')} />
                ) : (
                  <span style={{ color: '#666', fontSize: 16 }}>暂无视频文件</span>
                )}
              </div>
              <div style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
                <textarea className="form-textarea" style={{ flex: 1, minHeight: 360 }}
                  value={step1Source}
                  onChange={e => setStep1Source(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setStep1Source('')}>
                    🗑 清空
                  </button>
                  <button className="btn btn-primary btn-sm" style={savedFlash ? { background: '#22c55e', borderColor: '#22c55e', color: '#fff' } : undefined} onClick={() => {
                    if (id && step1Source.trim()) { saveStep('video_text', step1Source); flashSave() }
                    setVcOpen(false)
                  }}>
                    {savedFlash ? '✓ 已保存' : '💾 保存'}
                  </button>
                </div>
              </div>
            </div>
            <div style={{
              position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, cursor: 'nwse-resize',
              background: 'linear-gradient(135deg, transparent 50%, var(--primary) 50%)',
              borderRadius: '0 0 8px 0',
            }}
              onMouseDown={e => {
                e.stopPropagation()
                e.preventDefault()
                const el = vcRef.current
                if (!el) return
                resizing.current = true
                const rect = el.getBoundingClientRect()
                const sx = e.clientX, sy = e.clientY
                const sw = rect.width, sh = rect.height
                const onMove = (ev: MouseEvent) => {
                  setVcSize({ w: Math.max(640, sw + (ev.clientX - sx)), h: Math.max(400, sh + (ev.clientY - sy)) })
                }
                const onUp = () => {
                  setTimeout(() => { resizing.current = false }, 0)
                  document.removeEventListener('mousemove', onMove)
                  document.removeEventListener('mouseup', onUp)
                }
                document.addEventListener('mousemove', onMove)
                document.addEventListener('mouseup', onUp)
              }} />
          </div>
        </div>
      )}
    </div>
  )
}
