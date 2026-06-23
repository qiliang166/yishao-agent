import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, Voice, TTSProvider, LLMProvider } from '../services/api'
import { useModal } from '../components/ModalProvider'
import TeachingDocPanel from '../components/TeachingDocPanel'

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


// Dynamic stage1 prompts — loaded from column_configs, with fallbacks
const STAGE1_SKILL_FALLBACK = '## 菜名\n**菜名**：\n**菜系**：\n**成品特征**：\n**出品标准**：\n**记录日期**：\n**制作人/来源**：\n\n### 一、食材清单\n| 序号 | 用途 | 食材名称 | 用量 | 处理方式 | 备注 |\n|------|------|----------|------|----------|------|\n| 1 | 主料 | | | | |\n| 2 | 辅料 | | | | |\n| 3 | 调料 | | | | |\n\n> **准备要点**：\n\n### 二、工具与器皿\n| 序号 | 用途 | 工具名称 |\n|------|------|----------|\n| 1 | | |\n\n### 三、制作步骤\n| 序号 | 步骤 | 步骤说明 | 关键技巧 |\n|------|------|----------|----------|\n| 1 | 预处理 | | |\n| 2 | 烹饪 | | |\n\n### 四、时间与火候总览\n| 阶段 | 时长 | 火力 | 注意事项 |\n|------|------|------|----------|\n| | | | |\n\n### 五、试吃与品鉴记录\n- **口味**：\n- **口感**：\n- **色泽**：\n\n### 六、总结与评分\n- **难度**：☆\n- **耗时**：\n- **一句话点评**：'

const STAGE1_PROMPTS_FALLBACK: Record<string, string> = {
  text: '你是国家高级烹饪技师、菜谱SOP规范整理专家。请将用户手打输入的食谱笔记整理为标准SOP文档。',
  video: '你是国家高级烹饪技师、菜谱SOP规范整理专家。请根据视频相关内容提取完整的食谱SOP文档。',
  file: '你是国家高级烹饪技师、菜谱SOP规范整理专家。请从上传文件中提取完整食谱内容，整理为标准SOP文档。',
}

// ── Main Component ──
export default function ProjectPage() {
  const modal = useModal()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [stage, setStage] = useState<StageId>(1)
  const [sub, setSub] = useState<SubId>('1a')
  const [steps, setSteps] = useState<Record<string, string>>({})
  const [savedSteps, setSavedSteps] = useState<Record<string, string>>({})

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
  const [videoText, setVideoText] = useState('')
  const [fileText, setFileText] = useState('')
  const mode1 = sub === '1a' ? 'link' : sub === '1b' ? 'text' : 'file' as 'link' | 'text' | 'file'
  const mode1Key = sub === '1a' ? 'video' : sub === '1b' ? 'text' : 'file'
  const [vcOpen, setVcOpen] = useState(false)
  const [savedFlash, setSavedFlash] = useState(0)
  const flashSave = () => {
    setSavedFlash(Date.now())
    setTimeout(() => setSavedFlash(0), 1500)
  }
  const getSaveBtnLabel = (content: string, savedKey: string) => {
    if (!content.trim()) return '💾 保存'
    if (content !== (savedSteps[savedKey] || '')) return '💾 保存'
    return '✓ 已保存'
  }
  const getSaveBtnClass = (content: string, savedKey: string) => {
    if (savedFlash) return 'btn-saved-flash'
    if (!content.trim()) return 'btn-dirty'
    if (content !== (savedSteps[savedKey] || '')) return 'btn-dirty'
    return ''
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
  const [step1Generating, setStep1Generating] = useState('')

  // Stage 2 state
  const [step2Generating, setStep2Generating] = useState('') // which sub is generating
  const [batchGenerating, setBatchGenerating] = useState(false)
  const sopRef = useRef<{ triggerGenerate: () => Promise<void> }>(null)
  const daoRef = useRef<{ triggerGenerate: () => Promise<void> }>(null)
  const yanxiRef = useRef<{ triggerGenerate: () => Promise<void> }>(null)
  const [stage2Prompts, setStage2Prompts] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [stage1Prompts, setStage1Prompts] = useState<Record<string, string>>({})
  const [stage1Skill, setStage1Skill] = useState('')
  const [stage4KouboPrompt, setStage4KouboPrompt] = useState('')
  // Stage 3 state
  const [sopSelected, setSopSelected] = useState('sop-std')
  const [daoPptSelected, setDaoPptSelected] = useState('dao-std')
  const [yanxiPptSelected, setYanxiPptSelected] = useState('yanxi-std')
  const [stage3Prompts, setStage3Prompts] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [s3SopModel, setS3SopModel] = useState('')
  const [s3DaoPptModel, setS3DaoPptModel] = useState('')
  const [s3YanxiPptModel, setS3YanxiPptModel] = useState('')
  const [globalBranding, setGlobalBranding] = useState<{ copyright: string; signature: string }>({ copyright: '', signature: '' })
  const [pptGenerating, setPptGenerating] = useState('')
  const [daoPptTemplates, setDaoPptTemplates] = useState<TemplateItem[]>([])
  const [yanxiPptTemplates, setYanxiPptTemplates] = useState<TemplateItem[]>([])
  const [templatesMap, setTemplatesMap] = useState<Record<string, { prompt: string; skill: string; hasFile: boolean }>>({})

  // Stage 4 state
  const [s4KouboModel, setS4KouboModel] = useState('')
  const [kouboSelected, setKouboSelected] = useState('')
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
    let hasModelOverride = false
    api.getSteps(id).then((s: any[]) => {
      const map: Record<string, string> = {}
      s.forEach((x: any) => { map[x.step_name] = x.content })
      setSteps(map)
      setSavedSteps({...map})
      setVideoText(map['raw_video'] || map['video_text'] || '')
      setTextInput(map['raw_text'] || '')
      setFileText(map['raw_file'] || '')
      // Restore saved model selections
      if (map['_model_step1']) { setStep1Model(map['_model_step1']); hasModelOverride = true }
      if (map['_model_step3_sop']) { setS3SopModel(map['_model_step3_sop']); hasModelOverride = true }
      if (map['_model_step3_dao_ppt']) { setS3DaoPptModel(map['_model_step3_dao_ppt']); hasModelOverride = true }
      if (map['_model_step3_yan_ppt']) { setS3YanxiPptModel(map['_model_step3_yan_ppt']); hasModelOverride = true }
      if (map['_model_s4_koubo']) { setS4KouboModel(map['_model_s4_koubo']); hasModelOverride = true }
    })
    api.listColumnConfigs().then((configs: any[]) => {
      const s1p: Record<string, string> = {}
      let s1s = ''
      const s2p: Record<string, { prompt: string; skill: string }> = {}
      const s3p: Record<string, { prompt: string; skill: string }> = {}
      let kouboP = ''
      configs.forEach((c: any) => {
        if (c.column_id === 'col1') {
          const key = c.id === 'c1-text' ? 'text' : c.id === 'c1-video' ? 'video' : c.id === 'c1-file' ? 'file' : ''
          if (key) { s1p[key] = c.prompt; if (!s1s) s1s = c.skill }
        }
        if (c.column_id === 'col2') {
          const key = c.id === 'c2-sop' ? 'sop' : c.id === 'c2-dao' ? 'dao' : c.id === 'c2-yanxi' ? 'yanxi' : ''
          if (key) s2p[key] = { prompt: c.prompt, skill: c.skill }
        }
        if (c.column_id === 'col3') {
          const key = c.id === 'c3-sop' ? 'sop' : ''
          if (key) s3p[key] = { prompt: c.prompt, skill: c.skill }
        }
        if (c.column_id === 'col4') {
          if (c.id === 'c4-dao') s3p['daoPpt'] = { prompt: c.prompt, skill: c.skill }
        }
        if (c.column_id === 'col5') {
          if (c.id === 'c4-yanxi') s3p['yanxiPpt'] = { prompt: c.prompt, skill: c.skill }
        }
        if (c.column_id === 'col6' && c.id === 'c5-koubo') {
          kouboP = c.prompt
        }
      })
      setStage1Prompts(s1p)
      if (s1s) setStage1Skill(s1s)
      setStage2Prompts(s2p)
      setStage3Prompts(s3p)
      if (kouboP) setStage4KouboPrompt(kouboP)
    }).catch(() => {})
    // Load templates for Stage 3 PPT columns
    const loadTemplates = (stageType: string) =>
      api.listTemplatesForStage(stageType).then((items: any[]) => {
        const tmplItems: TemplateItem[] = items.map((t: any) => ({
          id: t.id, name: t.name, isDefault: t.isDefault,
          meta: t.prompt ? `提示词: ${t.prompt.slice(0, 30)}...` : '暂无提示词',
          color: '#7C3AED', icon: t.hasFile ? '📌' : '📄', previewHtml: '',
        }))
        const map: Record<string, { prompt: string; skill: string; hasFile: boolean }> = {}
        items.forEach((t: any) => { map[t.id] = { prompt: t.prompt || '', skill: t.skill || '', hasFile: t.hasFile } })
        return { tmplItems, map, items }
      }).catch(() => ({ tmplItems: [], map: {}, items: [] }))
    loadTemplates('daoPpt').then(({ tmplItems, map, items }) => {
      setDaoPptTemplates(tmplItems)
      if (tmplItems.length > 0) {
        const def = items.find((t: any) => t.isDefault) || items[0]
        setDaoPptSelected(def.id)
      }
      setTemplatesMap(prev => ({ ...prev, ...map }))
    })
    loadTemplates('yanxiPpt').then(({ tmplItems, map, items }) => {
      setYanxiPptTemplates(tmplItems)
      if (tmplItems.length > 0) {
        const def = items.find((t: any) => t.isDefault) || items[0]
        setYanxiPptSelected(def.id)
      }
      setTemplatesMap(prev => ({ ...prev, ...map }))
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
      if (hasModelOverride) return  // persisted models already loaded, skip defaults
      const def = providers.find(p => p.is_enabled) || providers[0]
      const defModels = Array.isArray(def?.models) ? def.models : []
      const defVal = def && defModels.length > 0 ? `${def.id}:${defModels[0]}` : ''
      if (defVal) {
        setStep1Model((prev: string) => prev || defVal)
        setS3SopModel((prev: string) => prev || defVal)
        setS3DaoPptModel((prev: string) => prev || defVal)
        setS3YanxiPptModel((prev: string) => prev || defVal)
      }
    }).catch(() => {})
    api.getSettings().then(data => {
      const s = data.settings || {}
      if (s.branding_copyright || s.branding_signature) {
        setGlobalBranding({ copyright: s.branding_copyright || '', signature: s.branding_signature || '' })
      }
    }).catch(() => {})
  }, [id, navigate])

  // Save step helper
  const saveStep = useCallback((stepName: string, content: string) => {
    if (!id) return
    api.saveStep(id, stepName, content)
    setSteps(prev => ({ ...prev, [stepName]: content }))
    setSavedSteps(prev => ({ ...prev, [stepName]: content }))
  }, [id])

  const step1Key = () => sub === '1a' ? 'step1_video' : sub === '1b' ? 'step1_text' : 'step1_file'
  const step3Key = () => sub === '3a' ? 'step3_sop_doc' : sub === '3b' ? 'step3_dao_ppt' : 'step3_yan_ppt'

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
      if (p.text) setVideoText(p.text)
      if (p.subtitle_text) setSourceSubtitle(p.subtitle_text)
      if (p.asr_text) setSourceAsr(p.asr_text)
      if (p.merged_text) { setSourceMerged(p.merged_text); setVideoText(p.merged_text); setSourceTab('merged') }
      else if (p.asr_text) { setSourceTab('asr') }
      else if (p.subtitle_text) { setSourceTab('subtitle') }
      if (p.video_path) setVideoPath(p.video_path)
      if (p.status === 'completed') {
        setDlStatus('done')
        modal.toast('✅ 视频下载完成', 'success')
        const rawText = p.merged_text || p.asr_text || p.text || ''
        if (rawText && id) {
          api.saveStep(id, 'raw_video', rawText)
          setSteps(prev => ({ ...prev, raw_video: rawText }))
          setSavedSteps(prev => ({ ...prev, raw_video: rawText }))
        }
        return
      }
      if (p.status === 'failed') { setDlStatus('failed'); modal.toast('❌ 下载失败', 'error'); return }
      setTimeout(poll, 1000)
    }
    poll()
  }
  // ── LLM Generate ──
  const doGenerate = async (stepKey: string, systemPrompt: string, userMessage: string, providerId?: string, model?: string) => {
    if (!id) return
    try {
      const result: any = await api.llmGenerate({
        provider_id: providerId || 'default', model: model || 'deepseek-v4-pro',
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
    const source = mode1 === 'text' ? textInput : mode1 === 'file' ? fileText : videoText
    if (!source.trim() || !id || !step1Model) return
    setStep1Generating(sub)
    try {
      const [providerId, model] = step1Model.split(':')
      const prompt = stage1Prompts[mode1Key] || STAGE1_PROMPTS_FALLBACK[mode1Key]
      const skill = stage1Skill || STAGE1_SKILL_FALLBACK
      const result: any = await api.llmGenerate({
        provider_id: providerId, model,
        system_prompt: prompt,
        user_message: `请将以下内容按指定格式整理：\n\n${source}\n\n输出格式要求：\n${skill}`,
      })
      const content = result.content
      const key = step1Key()
      setSteps(prev => ({ ...prev, [key]: content }))
      saveStep(key, content)
    } catch (e: any) { modal.toast('生成失败: ' + e.message, 'error') }
    finally { setStep1Generating('') }
  }

  // ── Batch Generate All Stage 2 Docs ──
  const doBatchGenerate = async () => {
    setBatchGenerating(true)
    try {
      const tasks = [
        { ref: sopRef, label: 'SOP文案' },
        { ref: daoRef, label: '道与术文案' },
        { ref: yanxiRef, label: '研学手册文案' },
      ]
      const results = await Promise.all(
        tasks.map(t =>
          t.ref.current?.triggerGenerate().then(
            () => ({ label: t.label, ok: true }),
            () => ({ label: t.label, ok: false }),
          ) ?? Promise.resolve({ label: t.label, ok: false })
        )
      )
      const ok = results.filter(r => r.ok)
      const fail = results.filter(r => !r.ok)
      if (fail.length === 0) {
        modal.toast('三篇文案已全部生成', 'success')
      } else if (ok.length === 0) {
        modal.toast(`全部生成失败: ${fail.map(f => f.label).join('、')}`, 'error')
      } else {
        modal.toast(`${ok.map(o => o.label).join('、')} 生成成功; ${fail.map(f => f.label).join('、')} 失败`, 'error')
      }
    } catch (e: any) {
      modal.toast('批量生成失败: ' + e.message, 'error')
    } finally {
      setBatchGenerating(false)
    }
  }

  // ── PPT / SOP Generation ──
  const doGeneratePPT = async (stepKey: string, content: string, tmplId: string, label: string, _prompt: string, model: string) => {
    setPptGenerating(stepKey)
    try {
      const branding = (globalBranding.copyright || globalBranding.signature) ? globalBranding : undefined
      const [pid, mdl] = model ? model.split(':') : ['', '']
      const result: any = await api.generatePPT(content, tmplId, branding, id, pid, mdl)
      setGenFiles(prev => [...prev, {
        name: result.filename, type: 'PPT',
        source: label,
        url: result.download_url || '/api/download/' + encodeURIComponent(result.filename),
      }])
      modal.toast(`PPT 已生成: ${result.filename}`, 'success')
    } catch (e: any) { modal.toast('PPT生成失败: ' + e.message, 'error') }
    finally { setPptGenerating('') }
  }
  const doExportSOP = async (content: string, prompt: string, model: string, branding?: Record<string, string>) => {
    try {
      // Step 1: AI generation with column prompt
      let aiContent = content
      if (model && prompt) {
        const [pid, mdl] = model.split(':')
        const result = await doGenerate('step3_sop_doc', prompt, content, pid, mdl)
        if (result) aiContent = result
      }
      // Step 2: Export as DOCX
      const result: any = await api.exportSOP(aiContent, branding, id)
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
    if (s === 1 && (st.step1_video || st.step1_text || st.step1_file)) return 'done'
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
      {/* ═══ Project Header ═══ */}
      <div className="proj-header-bar">
        <span className="proj-header-name">{project?.name || '加载中...'}</span>
        <span className={`pc-status ${project?.status || 'draft'}`}
          style={{ cursor: 'pointer' }}
          onClick={async () => {
            if (!id) return
            const newStatus = (project?.status === 'completed') ? 'draft' : 'completed'
            await api.updateProject(id, { status: newStatus })
            setProject(prev => prev ? { ...prev, status: newStatus } : prev)
          }}>{project?.status === 'completed' ? '已完成' : '草稿'}</span>
        <button style={{
            fontSize: 12, padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
            border: (project as any)?.is_locked ? '1px solid var(--warning)' : '1px solid var(--border)',
            background: (project as any)?.is_locked ? 'var(--warning)' : 'var(--card)',
            color: (project as any)?.is_locked ? '#fff' : 'var(--text-secondary)',
          }}
          onClick={async () => {
            if (!id) return
            const locked = !(project as any)?.is_locked
            await api.updateProject(id, { is_locked: locked } as any)
            setProject(prev => prev ? { ...prev, is_locked: locked } as any : prev)
          }}>
          {(project as any)?.is_locked ? '🔒 已锁定' : '🔓 锁定'}
        </button>
      </div>

      {/* ═══ Top Nav ═══ */}
      <div className="top-nav">
        {STAGES.filter(s => s.id <= 3).map((s, i) => (
          <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span className="tn-arrow">→</span>}
            <div className={`tn-item${stage === s.id ? ' active' : ''}`}
              onClick={() => switchStage(s.id)}>
              <span className="tn-num">{s.id}</span> {s.label}
              <span className={`tn-dot ${stageDot(s.id)}`} />
            </div>
          </span>
        ))}
        <span style={{ borderLeft: '1px solid var(--border)', height: 20, margin: '0 6px', alignSelf: 'center' }} />
        {STAGES.filter(s => s.id >= 4).map((s, i) => (
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
                    onChange={e => { setStep1Model(e.target.value); saveStep('_model_step1', e.target.value) }}>
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
                    disabled={step1Generating === '1a' || !step1Model || !videoText.trim()}
                    onClick={doGenerateStep1}>
                    {step1Generating === '1a' ? '⏳ 生成中...' : '⚙ 整理文档'}
                  </button>
                </div>
                {videoText && (
                  <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div className="card-title">📝 提取的原始文本</div>
                    <div className="card-hint">视频提取的原始字幕内容，可编辑后重新生成</div>
                    {(sourceMerged || sourceAsr || sourceSubtitle) && (
                      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                        {sourceMerged && (
                          <button
                            className={`btn ${sourceTab === 'merged' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                            onClick={() => { setSourceTab('merged'); setVideoText(sourceMerged) }}>
                            合并版
                          </button>
                        )}
                        {sourceAsr && (
                          <button
                            className={`btn ${sourceTab === 'asr' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                            onClick={() => { setSourceTab('asr'); setVideoText(sourceAsr) }}>
                            语音识别
                          </button>
                        )}
                        {sourceSubtitle && (
                          <button
                            className={`btn ${sourceTab === 'subtitle' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                            onClick={() => { setSourceTab('subtitle'); setVideoText(sourceSubtitle) }}
                            disabled={!sourceSubtitle}>
                            字幕
                          </button>
                        )}
                      </div>
                    )}
                    <textarea className="form-textarea" style={{ flex: 1, minHeight: 150 }}
                      value={videoText}
                      onChange={e => setVideoText(e.target.value)}
                      placeholder="视频字幕将显示在此..." />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setVideoText('')}>🗑 清空</button>
                      <button className={`btn btn-primary btn-sm ${getSaveBtnClass(videoText, 'video_text')}`} disabled={!videoText.trim()}
                        onClick={() => { if (id && videoText.trim()) { saveStep('video_text', videoText); saveStep('raw_video', videoText); flashSave() } }}>{getSaveBtnLabel(videoText, 'video_text')}</button>
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
                    <button className={`btn btn-primary btn-sm ${getSaveBtnClass(textInput, 'video_text')}`} disabled={!textInput.trim()}
                      onClick={() => { if (id && textInput.trim()) { saveStep('video_text', textInput); saveStep('raw_text', textInput); flashSave() } }}>{getSaveBtnLabel(textInput, 'video_text')}</button>
                    <button className="btn btn-primary btn-sm"
                      disabled={step1Generating === '1b' || !step1Model || !textInput.trim()}
                      onClick={doGenerateStep1}>
                      {step1Generating === '1b' ? '⏳ 生成中...' : '⚙ 整理文档'}
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
                      setFileText(text)
                      if (id && text) {
                        api.saveStep(id, 'raw_file', text)
                        setSteps(prev => ({ ...prev, raw_file: text }))
                        setSavedSteps(prev => ({ ...prev, raw_file: text }))
                      }
                    }} />
                  <button className="btn btn-primary btn-sm w-full"
                    disabled={step1Generating === '1c' || !step1Model || !fileText.trim()}
                    onClick={doGenerateStep1}>
                    {step1Generating === '1c' ? '⏳ 生成中...' : '⚙ 整理文档'}
                  </button>
                </div>
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="card-title">📝 文件原始内容</div>
                  <div className="card-hint">文件读取的原始内容，可编辑后重新生成</div>
                  <textarea className="form-textarea" style={{ flex: 1, minHeight: 200 }}
                    value={fileText}
                    onChange={e => setFileText(e.target.value)}
                    placeholder="文件内容将显示在此..." />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setFileText('')}>🗑 清空</button>
                    <button className={`btn btn-primary btn-sm ${getSaveBtnClass(fileText, 'video_text')}`} disabled={!fileText.trim()}
                      onClick={() => { if (id && fileText.trim()) { saveStep('video_text', fileText); saveStep('raw_file', fileText); flashSave() } }}>{getSaveBtnLabel(fileText, 'video_text')}</button>
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
                  value={steps[step1Key()] || ''}
                  onChange={e => { setSteps(prev => ({ ...prev, [step1Key()]: e.target.value })) }}
                  placeholder="点击左侧「生成」按钮，AI 整理后的标准 SOP 文档将显示在此..." />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {mode1 === 'link' ? '来源：视频提取' : mode1 === 'text' ? '来源：文字输入' : '来源：文件上传'}
                  </span>
                  <span style={{ display: 'flex', gap: 5 }}>
                    <button className="btn btn-ghost btn-sm"
                      disabled={!steps[step1Key()]}
                      onClick={async () => {
                        if (!id) return
                        try {
                          const label = sub === '1a' ? '视频提取' : sub === '1b' ? '文字输入' : '文件上传'
                          const resp = await api.saveFileToProject(id, `${project?.name || '文档'}_${label}_AI整理.txt`, steps[step1Key()] || '')
                          modal.toast(`已保存到 ${resp.path}`, 'success')
                        } catch (e: any) {
                          modal.toast('保存失败: ' + e.message, 'error')
                        }
                      }}>📥 保存到项目</button>
                    <button className="btn btn-outline btn-sm"
                      disabled={batchGenerating || (!steps.raw_video && !steps.raw_text && !steps.raw_file)}
                      onClick={doBatchGenerate}>
                      {batchGenerating ? '⏳ 生成中...' : '⚡ 生成所有文案'}
                    </button>
                    <button className={`btn btn-primary btn-sm ${getSaveBtnClass(steps[step1Key()] || '', step1Key())}`}
                      disabled={!steps[step1Key()]}
                      onClick={() => { saveStep(step1Key(), steps[step1Key()] || ''); flashSave() }}>{getSaveBtnLabel(steps[step1Key()] || '', step1Key())}</button>
                    <button className="btn btn-ghost btn-sm"
                      disabled={!steps[step1Key()]}
                      onClick={() => { setSteps(prev => ({ ...prev, [step1Key()]: '' })); saveStep(step1Key(), '') }}>✕ 清空</button>
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
                {sub === '2a' && (
                  <TeachingDocPanel ref={sopRef} docType="sop" projectId={id!}
                    steps={steps} savedSteps={savedSteps}
                    prompt={stage2Prompts.sop?.prompt || ''}
                    skill={stage2Prompts.sop?.skill || ''}
                    llmProviders={llmProviders}
                    onRefresh={() => api.getSteps(id!).then((s: any[]) => {
                      const map: Record<string, string> = {}
                      s.forEach((x: any) => { map[x.step_name] = x.content })
                      setSteps(map)
                      setSavedSteps({...map})
                    })} />
                )}
                {sub === '2b' && (
                  <TeachingDocPanel ref={daoRef} docType="dao" projectId={id!}
                    steps={steps} savedSteps={savedSteps}
                    prompt={stage2Prompts.dao?.prompt || ''}
                    skill={stage2Prompts.dao?.skill || ''}
                    llmProviders={llmProviders}
                    onRefresh={() => api.getSteps(id!).then((s: any[]) => {
                      const map: Record<string, string> = {}
                      s.forEach((x: any) => { map[x.step_name] = x.content })
                      setSteps(map)
                      setSavedSteps({...map})
                    })} />
                )}
                {sub === '2c' && (
                  <TeachingDocPanel ref={yanxiRef} docType="yanxi" projectId={id!}
                    steps={steps} savedSteps={savedSteps}
                    prompt={stage2Prompts.yanxi?.prompt || ''}
                    skill={stage2Prompts.yanxi?.skill || ''}
                    llmProviders={llmProviders}
                    onRefresh={() => api.getSteps(id!).then((s: any[]) => {
                      const map: Record<string, string> = {}
                      s.forEach((x: any) => { map[x.step_name] = x.content })
                      setSteps(map)
                      setSavedSteps({...map})
                    })} />
                )}
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
                <TemplateSelector items={[]} selectedId={sopSelected}
                  onSelect={t => setSopSelected(t.id)} previewTarget="prev3" />
                <div className="form-label">大模型</div>
                <select className="form-select" style={{ marginBottom: 8 }} value={s3SopModel} onChange={e => { setS3SopModel(e.target.value); saveStep('_model_step3_sop', e.target.value) }}>
                  <option value="">选择模型...</option>
                  {llmProviders.filter(p => p.is_enabled).map(p =>
                    (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                      <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                    ))
                  )}
                </select>
                <div className="form-label" style={{ marginTop: 10 }}>品牌信息</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {globalBranding.copyright || globalBranding.signature
                    ? `版权: ${globalBranding.copyright || '—'} · 签名: ${globalBranding.signature || '—'}`
                    : '未配置，在「全局设置」→ 通用设置 中配置'}
                </div>
                <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                  disabled={!s3SopModel}
                  onClick={() => doExportSOP(
                    steps.step2_sop || steps.step1_video || steps.step1_text || steps.step1_file || '',
                    stage3Prompts.sop?.prompt || '你是一个餐饮标准化专家。请根据食谱笔记，编写SOP。',
                    s3SopModel,
                    (globalBranding.copyright || globalBranding.signature) ? globalBranding : undefined
                  )}>
                  📄 AI 生成 + 导出 .docx
                </button>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="card-title">生成 / 编辑</div>
                <textarea className="form-textarea" style={{ flex: 1, minHeight: 120 }}
                  value={steps[step3Key()] || ''}
                  onChange={e => setSteps(prev => ({ ...prev, [step3Key()]: e.target.value }))}
                  placeholder="点击生成按钮，AI生成后在此编辑..." />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>编辑后保存，然后导出为 .docx 文档</span>
                  <span style={{ display: 'flex', gap: 5 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setSteps(prev => ({ ...prev, [step3Key()]: '' }))
                      saveStep(step3Key(), '')
                    }}>✕ 清空</button>
                    <button className="btn btn-ghost btn-sm"
                      disabled={!steps[step3Key()]}
                      onClick={async () => {
                        if (!id) return
                        try {
                          const resp = await api.saveFileToProject(id, `${project?.name || '文档'}_SOP文档.txt`, steps[step3Key()] || '')
                          modal.toast(`已保存到 ${resp.path}`, 'success')
                        } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                      }}>📥 保存到项目</button>
                    <button className={`btn btn-primary btn-sm ${getSaveBtnClass(steps[step3Key()] || '', step3Key())}`}
                      onClick={() => { saveStep(step3Key(), steps[step3Key()] || ''); flashSave() }}>
                      {getSaveBtnLabel(steps[step3Key()] || '', step3Key())}
                    </button>
                  </span>
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
                <TemplateSelector items={daoPptTemplates} selectedId={daoPptSelected}
                  onSelect={t => setDaoPptSelected(t.id)} previewTarget="prev3b" />
                <div className="form-label">大模型</div>
                <select className="form-select" style={{ marginBottom: 8 }} value={s3DaoPptModel} onChange={e => { setS3DaoPptModel(e.target.value); saveStep('_model_step3_dao_ppt', e.target.value) }}>
                  <option value="">选择模型...</option>
                  {llmProviders.filter(p => p.is_enabled).map(p =>
                    (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                      <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                    ))
                  )}
                </select>
                <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                  disabled={pptGenerating !== '' || !s3DaoPptModel}
                  onClick={() => doGeneratePPT('step3_dao_ppt', steps.step2_daoshuyi || '', daoPptSelected, '道术PPT',
                    stage3Prompts.daoPpt?.prompt || '你是一个PPT内容设计专家。请将道与术文案转化为PPT大纲。',
                    s3DaoPptModel)}>
                  {pptGenerating === 'step3_dao_ppt' ? '⏳ 生成中...' : '📌 合成道术PPT'}
                </button>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="card-title">生成 / 编辑</div>
                <textarea className="form-textarea" style={{ flex: 1, minHeight: 120 }}
                  value={steps[step3Key()] || ''}
                  onChange={e => setSteps(prev => ({ ...prev, [step3Key()]: e.target.value }))}
                  placeholder="点击生成按钮，AI生成后在此编辑..." />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>编辑后保存，然后合成为道术PPT</span>
                  <span style={{ display: 'flex', gap: 5 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setSteps(prev => ({ ...prev, [step3Key()]: '' }))
                      saveStep(step3Key(), '')
                    }}>✕ 清空</button>
                    <button className="btn btn-ghost btn-sm"
                      disabled={!steps[step3Key()]}
                      onClick={async () => {
                        if (!id) return
                        try {
                          const resp = await api.saveFileToProject(id, `${project?.name || '文档'}_道术PPT大纲.txt`, steps[step3Key()] || '')
                          modal.toast(`已保存到 ${resp.path}`, 'success')
                        } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                      }}>📥 保存到项目</button>
                    <button className={`btn btn-primary btn-sm ${getSaveBtnClass(steps[step3Key()] || '', step3Key())}`}
                      onClick={() => { saveStep(step3Key(), steps[step3Key()] || ''); flashSave() }}>
                      {getSaveBtnLabel(steps[step3Key()] || '', step3Key())}
                    </button>
                  </span>
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
                <TemplateSelector items={yanxiPptTemplates} selectedId={yanxiPptSelected}
                  onSelect={t => setYanxiPptSelected(t.id)} previewTarget="prev3c" />
                <div className="form-label">大模型</div>
                <select className="form-select" style={{ marginBottom: 8 }} value={s3YanxiPptModel} onChange={e => { setS3YanxiPptModel(e.target.value); saveStep('_model_step3_yan_ppt', e.target.value) }}>
                  <option value="">选择模型...</option>
                  {llmProviders.filter(p => p.is_enabled).map(p =>
                    (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                      <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                    ))
                  )}
                </select>
                <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                  disabled={pptGenerating !== '' || !s3YanxiPptModel}
                  onClick={() => doGeneratePPT('step3_yan_ppt', steps.step2_yanxi || '', yanxiPptSelected, '研学PPT',
                    stage3Prompts.yanxiPpt?.prompt || '你是一个教学PPT设计专家。请将研学手册内容转化为PPT。',
                    s3YanxiPptModel)}>
                  {pptGenerating === 'step3_yan_ppt' ? '⏳ 生成中...' : '📌 合成研学PPT'}
                </button>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="card-title">生成 / 编辑</div>
                <textarea className="form-textarea" style={{ flex: 1, minHeight: 120 }}
                  value={steps[step3Key()] || ''}
                  onChange={e => setSteps(prev => ({ ...prev, [step3Key()]: e.target.value }))}
                  placeholder="点击生成按钮，AI生成后在此编辑..." />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>编辑后保存，然后合成为研学PPT</span>
                  <span style={{ display: 'flex', gap: 5 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setSteps(prev => ({ ...prev, [step3Key()]: '' }))
                      saveStep(step3Key(), '')
                    }}>✕ 清空</button>
                    <button className="btn btn-ghost btn-sm"
                      disabled={!steps[step3Key()]}
                      onClick={async () => {
                        if (!id) return
                        try {
                          const resp = await api.saveFileToProject(id, `${project?.name || '文档'}_研学PPT大纲.txt`, steps[step3Key()] || '')
                          modal.toast(`已保存到 ${resp.path}`, 'success')
                        } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                      }}>📥 保存到项目</button>
                    <button className={`btn btn-primary btn-sm ${getSaveBtnClass(steps[step3Key()] || '', step3Key())}`}
                      onClick={() => { saveStep(step3Key(), steps[step3Key()] || ''); flashSave() }}>
                      {getSaveBtnLabel(steps[step3Key()] || '', step3Key())}
                    </button>
                  </span>
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
                <div className="card-hint">基于研学手册文案，生成口播稿</div>
                <div className="form-label">来源</div>
                <select className="form-select" style={{ marginBottom: 8 }}><option>研学手册文案</option></select>
                <div className="form-label">大模型</div>
                <select className="form-select" style={{ marginBottom: 8 }}
                  value={s4KouboModel} onChange={e => { setS4KouboModel(e.target.value); saveStep('_model_s4_koubo', e.target.value) }}>
                  <option value="">默认 (DeepSeek)</option>
                  {llmProviders.map(p => (
                    Array.isArray(p.models) ? p.models.map((m: string) => (
                      <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} ({m})</option>
                    )) : null
                  ))}
                </select>
                <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                  onClick={async () => {
                    setStep2Generating('koubo')
                    try {
                      let prompt = stage4KouboPrompt || '你是一个短视频口播稿专家。请根据以下研学手册内容生成口播稿，风格亲切自然，适合美食类短视频。'
                      let pid = '', mdl = ''
                      if (s4KouboModel) { [pid, mdl] = s4KouboModel.split(':') }
                      const content = await doGenerate('step4_koubo', prompt,
                        steps.step2_yanxi || steps.step1_video || steps.step1_text || steps.step1_file || '',
                        pid, mdl)
                      if (content) setKouboText(content)
                    } finally { setStep2Generating('') }
                  }}>
                  {step2Generating === 'koubo' ? '⏳ 生成中...' : '📢 生成口播稿'}
                </button>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="tmpl-preview" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="tmpl-preview-header">📢 口播稿预览</div>
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
                  value={videoText}
                  onChange={e => setVideoText(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setVideoText('')}>
                    🗑 清空
                  </button>
                  <button className={`btn btn-primary btn-sm ${getSaveBtnClass(videoText, 'video_text')}`} onClick={() => {
                    if (id && videoText.trim()) { saveStep('video_text', videoText); flashSave() }
                    setVcOpen(false)
                  }}>
                    {getSaveBtnLabel(videoText, 'video_text')}
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
