import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { usePermission } from '../hooks/usePermission'
import { api, Voice, TTSProvider, LLMProvider } from '../services/api'
import { useModal } from '../components/ModalProvider'
import TeachingDocPanel from '../components/TeachingDocPanel'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import SlideEditModal from '../components/SlideEditModal'
import Stage3TempSettings, { StageTemps, DEFAULT_STAGE_TEMPS } from '../components/Stage3TempSettings'
import HelpButton from '../components/HelpButton'

// ── Types ──
interface Project {
  id: string; name: string; status: string; source_type: string
  storage_path?: string; workspace_id?: string
  created_at: string; updated_at: string
}
type StageId = 1 | 2 | 3 | 4 | 5
type SubId = string

interface StageDef { id: StageId; label: string; subs: { id: SubId; label: string }[] }
interface TemplateItem { id: string; name: string; isDefault: boolean; meta: string; previewHtml: string; color: string; icon: string; colors?: string[] }

// ── Stage Definitions ──
const STAGES: StageDef[] = [
  { id: 1, label: '素材输入', subs: [{ id: '1a', label: '视频提取' }, { id: '1b', label: '文字输入' }, { id: '1c', label: '文件提取' }] },
  { id: 2, label: '文档生成', subs: [{ id: '2a', label: '标准文档' }, { id: '2b', label: '分析文档' }, { id: '2c', label: '综合文档' }] },
  { id: 3, label: '课件输出', subs: [{ id: '3a', label: '文档课件' }, { id: '3b', label: '分析PPT' }, { id: '3c', label: '综合PPT' }] },
  { id: 4, label: '演讲课件', subs: [{ id: '4a', label: '演讲文案' }, { id: '4b', label: '演讲口播' }] },
  { id: 5, label: '输出列表', subs: [] },
]

const CONFIG: Record<number, { model: string; tmpl: string; tmplInfo: string }> = {
  1: { model: 'DeepSeek (deepseek-v4-pro)', tmpl: '—', tmplInfo: '' },
  2: { model: 'DeepSeek (deepseek-v4-pro)', tmpl: '—', tmplInfo: '' },
  3: { model: 'DeepSeek (deepseek-v4-pro)', tmpl: '标准文档模板.docx / PPT模板', tmplInfo: '提示词: 标准文档格式 v2.0 · SKILL: 文档表格填充' },
  4: { model: 'DeepSeek (deepseek-v4-pro)', tmpl: '栏目配置提示词', tmplInfo: '3个演讲类型各自独立提示词 + SKILL' },
  5: { model: '—', tmpl: '—', tmplInfo: '' },
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
          <div style={{
            height: 8,
            background: t.colors
              ? `linear-gradient(90deg, ${t.colors[0]}, ${t.colors[1]} 50%, ${t.colors[0]})`
              : t.color + '44',
          }} />
          <div className="tmpl-info">
            <div className="tmpl-name">{t.name}{t.isDefault ? <span className="default-tag">默认</span> : null}</div>
            {t.colors && (
              <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                {t.colors.map((c, i) => (
                  <div key={i} style={{
                    width: 14, height: 14, borderRadius: 3,
                    background: c,
                    border: c?.toLowerCase() === '#ffffff' || c?.toLowerCase() === '#fafaf8'
                      ? '1px solid #ddd' : '1px solid transparent',
                  }} />
                ))}
              </div>
            )}
            <div className="tmpl-meta">{t.meta}</div>
          </div>
        </div>
      ))}
    </div>
  )
}


// Dynamic stage1 prompts — loaded from column_configs, with fallbacks
const STAGE1_SKILL_FALLBACK = '## 文档标题\n**标题**：\n**分类**：\n**日期**：\n**来源**：\n\n### 一、基本信息\n| 序号 | 项目 | 内容 | 备注 |\n|------|------|------|------|\n| 1 | | | |\n\n### 二、主要内容\n| 序号 | 要点 | 详细说明 |\n|------|------|----------|\n| 1 | | |\n\n### 三、总结\n- **要点1**：\n- **要点2**：'

const STAGE1_PROMPTS_FALLBACK: Record<string, string> = {
  text: '请将用户输入的内容整理为标准文档格式。',
  video: '请根据视频相关内容提取完整信息，整理为标准文档。',
  file: '请从上传文件中提取完整内容，整理为标准文档格式。',
}

// ── Temperature input (shared across all model selectors) ──
const TemperatureInput = ({ value, onChange, id }: { value: number; onChange: (v: number) => void; id?: string }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
    <label style={{ whiteSpace: 'nowrap' }} htmlFor={id}>温度</label>
    <input id={id} type="number" min={0} max={2} step={0.1}
      style={{ width: 50, fontSize: 11, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
      value={value} onChange={e => onChange(parseFloat(e.target.value) || 0.3)} />
  </span>
)

// ── Stage 2 left-panel controls (split from TeachingDocPanel) ──
const MODEL_KEYS_S2: Record<string, string> = {
  sop: '_model_s2_sop', dao: '_model_s2_dao', yanxi: '_model_s2_yanxi',
}
const DOC_ICONS: Record<string, string> = { sop: '📃', dao: '💡', yanxi: '📖' }
const DOC_COLORS_S2: Record<string, string> = {
  sop: 'var(--success)', dao: 'var(--purple)', yanxi: 'var(--warning)',
}

function Stage2Controls({
  docType, label, steps, llmProviders,
  readOnly,
  dataSource, onDataSourceChange,
  generating, prompt, skill, projectId,
  panelRef, setGenerating, onRefresh,
  logEntries, progress,
}: {
  docType: string; label: string
  steps: Record<string, string>
  llmProviders: LLMProvider[]
  dataSource: string; onDataSourceChange: (v: string) => void
  generating: boolean
  prompt: string; skill: string; projectId: string
  panelRef: React.RefObject<{ triggerGenerate: () => Promise<void>; cancel: () => void } | null>
  setGenerating: (v: boolean) => void
  onRefresh: () => Promise<void>
  logEntries?: { time: string; message: string }[]
  progress?: string
  readOnly?: boolean
}) {
  const tempKey = `_temp_s2_${docType}`
  const modal = useModal()
  const mountedRef = useRef(true)
  const generatingRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  const modelKey = MODEL_KEYS_S2[docType]
  const icon = DOC_ICONS[docType]
  const color = DOC_COLORS_S2[docType]

  // Local model state with optimistic update — prevents <select> revert during async save
  const getDefaultModel = () => {
    const saved = steps[modelKey]
    if (saved) return saved
    const defP = llmProviders.find(p => p.is_enabled)
    if (!defP) return ''
    const defMs = Array.isArray(defP.models) ? defP.models : []
    return defMs.length > 0 ? `${defP.id}:${defMs[0]}` : ''
  }
  const [model, setModel] = useState(getDefaultModel)
  const lastModelKey = useRef(modelKey)
  const [temperature, setTemperature] = useState(() => {
    const saved = steps[tempKey]; return saved ? parseFloat(saved) : 0.3
  })
  // Re-sync when modelKey changes (tab switch) or steps loads a persisted value
  if (modelKey !== lastModelKey.current) {
    lastModelKey.current = modelKey
    setModel(getDefaultModel())
    setTemperature(steps[tempKey] ? parseFloat(steps[tempKey]) : 0.3)
  }

  // Check raw content AND AI-generated step1 results for data source availability
  const sourceText = {
    video: (steps.raw_video || steps.step1_video) ? '已有内容' : '暂无内容',
    text: (steps.raw_text || steps.step1_text) ? '已有内容' : '暂无内容',
    file: (steps.raw_file || steps.step1_file) ? '已有内容' : '暂无内容',
  }
  const getSourceText = (src: string) => {
    switch (src) {
      case 'video': return steps.step1_video || steps.raw_video || ''
      case 'text': return steps.step1_text || steps.raw_text || ''
      case 'file': return steps.step1_file || steps.raw_file || ''
      default: return ''
    }
  }

  const handleModelChange = (val: string) => {
    setModel(val)
    api.saveStep(projectId, modelKey, val).then(onRefresh)
  }

  const handleGenerate = async () => {
    const source = getSourceText(dataSource)
    if (!source) {
      modal.toast(`数据来源「${dataSource}」没有内容，请先在 Stage 1 导入素材`, 'error')
      return
    }
    if (!model) {
      modal.toast('请先选择大模型', 'error')
      return
    }
    if (generatingRef.current) return
    generatingRef.current = true
    setGenerating(true)
    try {
      await panelRef.current?.triggerGenerate()
    } catch (e: any) {
      if (mountedRef.current) modal.toast(`生成失败: ${e.message}`, 'error')
    } finally {
      generatingRef.current = false
      if (mountedRef.current) setGenerating(false)
    }
  }

  return (
    <>
      <div className="card-title" style={{ color }}>{icon} {label}生成
        <HelpButton location={`project-stage-2${docType === 'sop' ? 'a' : docType === 'dao' ? 'b' : 'c'}`} />
      </div>
      <div className="card-hint">基于文案提取结果，使用栏目配置中设定的提示词和SKILL生成{label}</div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
        <label className="form-label">数据来源</label>
        <select className="form-select" style={{ marginBottom: 6 }}
          value={dataSource} onChange={e => onDataSourceChange(e.target.value)}>
          <option value="video">视频提取 — {sourceText.video}</option>
          <option value="text">文字输入 — {sourceText.text}</option>
          <option value="file">文件提取 — {sourceText.file}</option>
        </select>
      </div>
      <label className="form-label">大模型</label>
      <select className="form-select" style={{ marginBottom: 8 }}
        value={model} onChange={e => handleModelChange(e.target.value)}>
        <option value="">选择模型...</option>
        {llmProviders.filter(p => p.is_enabled).map(p =>
          (Array.isArray(p.models) ? p.models : []).map((m: string) => (
            <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
          ))
        )}
      </select>
      <div style={{ marginBottom: 8 }}>
        <TemperatureInput value={temperature} onChange={v => { setTemperature(v); api.saveStep(projectId, tempKey, String(v)).then(onRefresh) }} id={`temp-s2-${docType}`} />
      </div>
      {!readOnly && (
      <button className="btn btn-primary btn-sm w-full"
        disabled={!getSourceText(dataSource) || !model || generating}
        onClick={handleGenerate}>
        {generating ? '⏳ 生成中...' : `⚙ AI 生成 ${label}`}
      </button>
      )}
      {generating && (
        <button className="btn btn-sm" style={{ marginTop: 4, background: 'var(--warning)', color: '#fff', width: '100%' }}
          onClick={() => { panelRef.current?.cancel(); setGenerating(false); modal.toast('生成已取消', 'success') }}>取消</button>
      )}
      {((logEntries && logEntries.length > 0) || generating) && (
        <div style={{ maxHeight: 180, overflowY: 'auto', background: 'var(--bg)', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 11, lineHeight: '18px', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', marginTop: 8 }}>
          {progress && (
            <div style={{ marginBottom: 4, color: 'var(--primary)', fontWeight: 500 }}>
              ⏳ {progress}
            </div>
          )}
          {(!logEntries || logEntries.length === 0) ? (
            <div style={{ color: '#888' }}>等待日志...</div>
          ) : (
            logEntries.slice(-6).map((entry, i) => (
              <div key={i} style={{ marginBottom: 2 }}>
                <span style={{ color: '#888' }}>[{entry.time}]</span> {entry.message}
              </div>
            ))
          )}
        </div>
      )}
    </>
  )
}

// ── Audio Utils ──
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const length = buffer.length
  const bytesPerSample = 2
  const blockAlign = channels * bytesPerSample
  const dataSize = length * blockAlign
  const headerSize = 44
  const buf = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(buf)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  let offset = 44
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]))
      const val = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
      view.setInt16(offset, val, true)
      offset += 2
    }
  }
  return new Blob([buf], { type: 'audio/wav' })
}

// ── Project Output List (Stage 5) ──
function ProjectOutputList({ projectId, projectName, readOnly, canEditOwn }: { projectId: string; projectName: string; readOnly?: boolean; canEditOwn?: boolean }) {
  const modal = useModal()
  const [files, setFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [playingAudio, setPlayingAudio] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playingUrlRef = useRef('')
  const audioPlayingRef = useRef(false)

  const _stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    audioRef.current = null
    setPlayingAudio('')
    playingUrlRef.current = ''
    audioPlayingRef.current = false
  }

  const handleAudioToggle = (audioUrl: string) => {
    if (playingUrlRef.current !== audioUrl) {
      _stopAudio()
      const a = new Audio(audioUrl)
      audioRef.current = a
      setPlayingAudio(audioUrl)
      playingUrlRef.current = audioUrl
      audioPlayingRef.current = true
      a.play().catch(() => {
        setPlayingAudio('')
        playingUrlRef.current = ''
        audioPlayingRef.current = false
      })
      a.onended = () => {
        setPlayingAudio('')
        audioPlayingRef.current = false
      }
      return
    }

    if (audioPlayingRef.current) {
      audioRef.current?.pause()
      setPlayingAudio('')
      audioPlayingRef.current = false
    } else {
      if (audioRef.current?.ended) {
        const a = new Audio(audioUrl)
        audioRef.current = a
        a.onended = () => {
          setPlayingAudio('')
          audioPlayingRef.current = false
        }
        a.play().catch(() => {
          setPlayingAudio('')
          playingUrlRef.current = ''
          audioPlayingRef.current = false
        })
      } else {
        audioRef.current?.play().catch(() => {
          setPlayingAudio('')
          playingUrlRef.current = ''
          audioPlayingRef.current = false
        })
      }
      setPlayingAudio(audioUrl)
      audioPlayingRef.current = true
    }
  }

  const loadFiles = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getProjectFiles(projectId) as any
      const all = data.files || []
      setFiles(all)
      if (!loaded) {
        const categories = [...new Set<string>(all.map((f: any) => f.category || '其他'))]
        setExpanded(new Set<string>(categories))
        setLoaded(true)
      }
    } catch { setFiles([]) }
    finally { setLoading(false) }
  }, [projectId, loaded])

  useEffect(() => { loadFiles() }, [loadFiles])

  const fileIcon = (f: any) => {
    const cat = f.category || ''
    if (cat.includes('素材输入')) return '📥'
    if (cat.includes('文档生成')) return '📝'
    if (cat.includes('课件输出')) return '📌'
    if (cat.includes('演讲课件')) return '🎵'
    return '📄'
  }
  const fileKey = (f: any) => f.download_url || f.filename
  const formatSize = (bytes?: number) => {
    if (bytes == null) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }
  const filtered = files.filter((f: any) => !search || (f.display_name || f.filename).toLowerCase().includes(search.toLowerCase()))
  const grouped = filtered.reduce((acc: Record<string, any[]>, f: any) => {
    const g = f.category || '其他'
    if (!acc[g]) acc[g] = []
    acc[g].push(f)
    return acc
  }, {})
  const totalSize = files.reduce((sum: number, f: any) => sum + (f.size || 0), 0)
  const allExpanded = Object.keys(grouped).length > 0 && Object.keys(grouped).every(k => expanded.has(k))

  const toggleSelect = (key: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  const toggleSelectAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set())
    else setSelected(new Set(filtered.map((f: any) => fileKey(f))))
  }
  const toggleGroup = (cat: string) => {
    setExpanded(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n })
  }
  const toggleAllGroups = () => {
    if (allExpanded) setExpanded(new Set())
    else setExpanded(new Set(Object.keys(grouped)))
  }
  const deleteFile = async (f: any) => {
    if (readOnly) return
    const key = fileKey(f)
    const ok = await modal.confirm(`确认删除「${f.display_name || f.filename}」？`)
    if (!ok) return
    try {
      await api.deleteProjectFile(projectId, f.filename)
      setFiles(prev => prev.filter(x => fileKey(x) !== key))
      setSelected(prev => { const n = new Set(prev); n.delete(key); return n })
    } catch (e: any) { modal.toast('删除失败: ' + (e?.message || e), 'error') }
  }
  const batchDelete = async () => {
    if (readOnly || selected.size === 0) return
    const keys = [...selected]
    const ok = await modal.confirm(`确认删除 ${keys.length} 个文件？`)
    if (!ok) return
    let deleted = 0
    for (const key of keys) {
      const f = files.find(x => fileKey(x) === key)
      if (f) {
        try { await api.deleteProjectFile(projectId, f.filename); deleted++ } catch {}
      }
    }
    setFiles(prev => prev.filter(x => !selected.has(fileKey(x))))
    setSelected(new Set())
    if (deleted > 0) modal.toast(`已删除 ${deleted} 个文件`, 'success')
  }

  const downloadSelected = async () => {
    const list = files.filter((f: any) => selected.has(fileKey(f)))
    if (list.length === 0) return
    try {
      await api.downloadSelectedFiles(projectId, list.map((f: any) => ({
        filename: f.filename,
        download_url: f.download_url || '',
        display_name: f.display_name || f.filename,
      })))
      modal.toast(`已打包下载 ${list.length} 个文件`, 'success')
    } catch (e) { modal.toast(`下载失败: ${e}`, 'error') }
  }

  return (
    <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>📦 {projectName} 输出列表<HelpButton location="project-stage-5" /></span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={loadFiles}
            style={{ fontSize: 11 }} title="刷新列表">🔄 刷新</button>
          {files.length > 0 && (
            <button onClick={() => selected.size > 0 ? downloadSelected() : api.downloadAllFiles(projectId)}
              className="btn btn-outline btn-sm"
              style={{ fontSize: 11, padding: '4px 12px' }}>
              {selected.size > 0 ? `📥 下载选中 (${selected.size})` : `📦 一键下载 (${files.length})`}
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          加载中...
        </div>
      ) : files.length > 0 ? (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 0 8px', flexWrap: 'wrap' }}>
            <input className="form-input" placeholder="搜索文件名..."
              style={{ flex: 1, minWidth: 160, fontSize: 11, padding: '4px 8px' }}
              value={search}
              onChange={e => setSearch(e.target.value)} />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {filtered.length} / {files.length} 个文件 · {formatSize(totalSize)}
            </span>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
              onClick={toggleSelectAll}>
              {selected.size === filtered.length && filtered.length > 0 ? '取消全选' : '全选'}
            </button>
            {canEditOwn !== false && selected.size > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, color: 'var(--warning)' }}
                onClick={batchDelete}>
                删除选中 ({selected.size})
              </button>
            )}
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
              onClick={toggleAllGroups}>
              {allExpanded ? '全部折叠' : '全部展开'}
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([category, catFiles]) => {
              const isExpanded = expanded.has(category)
              return (
              <div key={category} style={{ marginBottom: 4 }}>
                <div onClick={() => toggleGroup(category)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', cursor: 'pointer', background: 'var(--bg-secondary)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                  <span style={{ fontSize: 10 }}>{isExpanded ? '▼' : '▶'}</span>
                  <span>{fileIcon(catFiles[0])}</span>
                  <span style={{ flex: 1 }}>{category}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 400 }}>{catFiles.length} 个文件</span>
                </div>
                {isExpanded && (
                  <div style={{ padding: '2px 0 2px 14px' }}>
                    {catFiles.map((f: any) => {
                      const isAudio = f.type === 'MP3' || f.type === 'Audio'
                      const dateStr = f.modified ? new Date(f.modified * 1000).toLocaleDateString('zh-CN') : ''
                      return (
                      <div key={fileKey(f)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', fontSize: 11, borderBottom: '1px solid var(--border)', background: selected.has(fileKey(f)) ? 'var(--bg-hover)' : 'transparent' }}>
                        <input type="checkbox" checked={selected.has(fileKey(f))}
                          onChange={() => toggleSelect(fileKey(f))}
                          style={{ flexShrink: 0 }} />
                        <span style={{ flexShrink: 0 }}>{fileIcon(f)}</span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                          {f.display_name || f.filename}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0, minWidth: 50, textAlign: 'right' }}>{dateStr}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0, minWidth: 45, textAlign: 'right' }}>{formatSize(f.size)}</span>
                        {isAudio && f.audio_url && (() => {
                          const url = (f.audio_url as string).startsWith('/') ? f.audio_url : '/' + (f.audio_url as string).replace(/^\//, '')
                          const isPlaying = playingAudio === url
                          return (
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '0 4px', color: 'var(--accent)', flexShrink: 0 }}
                            onClick={e => { e.stopPropagation(); handleAudioToggle(url) }}
                            title={isPlaying ? '暂停' : '播放'}>
                            {isPlaying ? '⏸' : '▶'}
                          </button>
                          )
                        })()}
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '0 4px', flexShrink: 0 }}
                          onClick={async () => {
                            try {
                              const dlName = f.display_name || f.filename
                              if (f.download_url) {
                                await api.downloadWithName(f.download_url, dlName)
                              } else {
                                await api.downloadWithName(
                                  `/api/download/${encodeURIComponent(f.filename)}?project_id=${encodeURIComponent(projectId)}`,
                                  dlName
                                )
                              }
                            } catch (e) { modal.toast(`下载失败: ${e}`, 'error') }
                          }}>下载</button>
                        {canEditOwn !== false && (
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '0 4px', color: 'var(--warning)', flexShrink: 0 }}
                          onClick={() => deleteFile(f)}>✕</button>
                        )}
                      </div>
                    )})}
                  </div>
                )}
              </div>
            )})}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
          暂无产出物
        </div>
      )}
    </div>
  )
}

// ── Main Component ──
export default function ProjectPage() {
  const modal = useModal()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const readOnly = user?.user_type === 'member'
  const canViewStage1 = usePermission('stage1.view')
  const canViewStage2 = usePermission('stage2.view')
  const canViewStage3 = usePermission('stage3.view')
  const canViewStage4 = usePermission('stage4.view')
  const canViewStage5 = usePermission('stage5.view')
  const canGenerate1 = usePermission('stage1.generate')
  const canGenerate2 = usePermission('stage2.generate')
  const canGenerate3 = usePermission('stage3.generate')
  const canGenerate4 = usePermission('stage4.generate')
  const canDownload5 = usePermission('stage5.download')
  const canEditOwn = usePermission('project.edit_own')
  const stageViewPerms: Record<number, boolean> = { 1: canViewStage1, 2: canViewStage2, 3: canViewStage3, 4: canViewStage4, 5: canViewStage5 }
  const stageGeneratePerms: Record<number, boolean> = { 1: canGenerate1, 2: canGenerate2, 3: canGenerate3, 4: canGenerate4 }
  const visibleStages = STAGES.filter(s => stageViewPerms[s.id] !== false)

  function CanEdit({ children, perm }: { children: React.ReactNode; perm?: boolean }) {
    if (readOnly) return null
    if (perm !== undefined && !perm) return null
    return <>{children}</>
  }

  async function downloadFile(url: string, filename: string) {
    const token = localStorage.getItem('auth_token')
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = objUrl; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(objUrl)
    modal.toast('已开始下载: ' + filename, 'success')
  }

  const [project, setProject] = useState<Project | null>(null)
  const [editName, setEditName] = useState(false)
  const [editNameValue, setEditNameValue] = useState('')
  const [batchWarning, setBatchWarning] = useState('')
  const [hdrCategories, setHdrCategories] = useState<{id:string;name:string}[]>([])
  const [hdrAuthors, setHdrAuthors] = useState<{id:string;name:string}[]>([])
  const styleColorMap = useRef<Record<string, any>>({})
  const workspaceIdRef = useRef<string | undefined>(undefined)
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
  const videoFileRef = useRef<HTMLInputElement>(null)
  const [dlStatus, setDlStatus] = useState('')
  const [dlPercent, setDlPercent] = useState(0)
  const [dlMessage, setDlMessage] = useState('')
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
  const [step1Models, setStep1Models] = useState<Record<string, string>>({})
  const [s1Temperatures, setS1Temperatures] = useState<Record<string, number>>({ video: 0.3, text: 0.3, file: 0.3 })
  const step1Model = step1Models[mode1Key] || ''
  const s1Temperature = s1Temperatures[mode1Key] || 0.3
  const [step1Generating, setStep1Generating] = useState<Record<string, boolean>>({})
  const [s1ViewMode, setS1ViewMode] = useState<Record<string, 'edit' | 'preview'>>({})

  // Stage 2 state
  const [step2Generating, setStep2Generating] = useState<Record<string, boolean>>({})
  const [s2DataSources, setS2DataSources] = useState<Record<string, string>>({ sop: 'video', dao: 'video', yanxi: 'video' })
  const [showModelPicker, setShowModelPicker] = useState(false)
  const overlayMouseDownRef = useRef(false)
  const [modelPickerValues, setModelPickerValues] = useState<Record<string, string>>({})
  const sopRef = useRef<{ triggerGenerate: () => Promise<void>; cancel: () => void }>(null)
  const daoRef = useRef<{ triggerGenerate: () => Promise<void>; cancel: () => void }>(null)
  const yanxiRef = useRef<{ triggerGenerate: () => Promise<void>; cancel: () => void }>(null)

  const handleS2DataSourceChange = (tab: string, val: string) => {
    setS2DataSources(prev => ({ ...prev, [tab]: val }))
    if (id) api.saveStep(id, `_ds_s2_${tab}`, val)
  }
  const [stage2Prompts, setStage2Prompts] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [stage1Prompts, setStage1Prompts] = useState<Record<string, string>>({})
  const [stage1Skill, setStage1Skill] = useState('')
  const [stage4Prompts, setStage4Prompts] = useState<Record<string, { prompt: string; skill: string }>>({})
  // Stage 3 state
  const [sopSelected, setSopSelected] = useState('sop-std')
  const [daoPptSelected, setDaoPptSelected] = useState('dao-std')
  const [yanxiPptSelected, setYanxiPptSelected] = useState('yanxi-std')
  const [stage3Prompts, setStage3Prompts] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [s3SopModel, setS3SopModel] = useState('')
  const [s3DaoPptModel, setS3DaoPptModel] = useState('')
  const [s3YanxiPptModel, setS3YanxiPptModel] = useState('')
  const [s3SopTemp, setS3SopTemp] = useState(0.3)
  const [s3DaoPptTemp, setS3DaoPptTemp] = useState(0.3)
  const [s3YanxiPptTemp, setS3YanxiPptTemp] = useState(0.3)
  const [s3DaoTemps, setS3DaoTemps] = useState<StageTemps>({ ...DEFAULT_STAGE_TEMPS })
  const [s3YanxiTemps, setS3YanxiTemps] = useState<StageTemps>({ ...DEFAULT_STAGE_TEMPS })
  const [s3DaoTempOpen, setS3DaoTempOpen] = useState(false)
  const [s3YanxiTempOpen, setS3YanxiTempOpen] = useState(false)
  const [s3SopTempOpen, setS3SopTempOpen] = useState(false)
  const [s3SopTemps, setS3SopTemps] = useState<StageTemps>({ ...DEFAULT_STAGE_TEMPS })
  const [globalBranding, setGlobalBranding] = useState<{ copyright: string; signature: string }>({ copyright: '', signature: '' })
  const [pptGenerating, setPptGenerating] = useState<Record<string, boolean>>({})
  const [forceRegenerate, setForceRegenerate] = useState(false)
  const [s3ViewMode, setS3ViewMode] = useState<Record<string, 'edit' | 'preview'>>({})
  const [s4ViewMode, setS4ViewMode] = useState<string>('edit')
  const [pptProgress, setPptProgress] = useState<{ phase_label: string; message: string; slides_done?: number; slides_total?: number; preview_url?: string } | null>(null)
  const [pptLog, setPptLog] = useState<{ time: string; message: string }[]>([])
  const [docGenLog, setDocGenLog] = useState<{ time: string; message: string }[]>([])
  const [docGenProgress, setDocGenProgress] = useState<{ phase_label: string; message: string; stepKey?: string } | null>(null)
  const [s2Logs, setS2Logs] = useState<Record<string, { time: string; message: string }[]>>({})
  const [s2Progress, setS2Progress] = useState<Record<string, string>>({})
  const [progressivePreviewUrl, setProgressivePreviewUrl] = useState<Record<string, string>>({})
  const pptPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pptLogPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pptLogContainerRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<Record<string, AbortController>>({})
  const [pptSlidePlans, setPptSlidePlans] = useState<Record<string, { slides: any[]; filename: string; downloadUrl: string; templateId: string; previewUrl?: string; zipUrl?: string; format?: string; styleId?: string; colorScheme?: string }>>({})
  const [pptOutline, setPptOutline] = useState<Record<string, { outline_json: any[]; outline_text: string }>>({})
  const [pptOutlineLoading, setPptOutlineLoading] = useState<Record<string, boolean>>({})
  const [pptColorScheme, setPptColorScheme] = useState<Record<string, string>>({})
  const [pptColorSchemesByStage, setPptColorSchemesByStage] = useState<Record<string, {id:string;label:string;primary:string;accent:string;background:string;text:string;card_bg:string}[]>>({})
  const getStyleIdFromTemplate = (tmplId: string) => tmplId.startsWith('style-') ? tmplId.replace('style-', '') : 'business'
  const loadColorSchemesForStage = (stepKey: string, tmplId: string) => {
    const styleId = getStyleIdFromTemplate(tmplId)
    api.listColorSchemes(styleId).then(cs => {
      if (cs?.length) setPptColorSchemesByStage(prev => ({ ...prev, [stepKey]: cs }))
    }).catch(() => {})
  }
  const [pptSavingOutline, setPptSavingOutline] = useState<Record<string, boolean>>({})
  const [previewHtml, setPreviewHtml] = useState<Record<string, string>>({})
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({})
  const [previewTab, setPreviewTab] = useState<Record<string, 'ppt' | 'html' | 'json' | 'preview'>>({})
  const [editPanelOpen, setEditPanelOpen] = useState<Record<string, boolean>>({})
  const [pptEditMode, setPptEditMode] = useState<Record<string, boolean>>({})
  const [daoPptTemplates, setDaoPptTemplates] = useState<TemplateItem[]>([])
  const [yanxiPptTemplates, setYanxiPptTemplates] = useState<TemplateItem[]>([])
  const [sopTemplates, setSopTemplates] = useState<TemplateItem[]>([])
  const [templatesMap, setTemplatesMap] = useState<Record<string, { prompt: string; skill: string; hasFile: boolean }>>({})

  // Stage 4 state
  const S4_SPEECH_TABS = [
    { key: 'doc' as const, label: '文档演讲', stepKey: 'step4_speech_doc', modelKey: '_model_s4_speech_doc' },
    { key: 'analysis' as const, label: '分析演讲', stepKey: 'step4_speech_analysis', modelKey: '_model_s4_speech_analysis' },
    { key: 'comprehensive' as const, label: '综合演讲', stepKey: 'step4_speech_comprehensive', modelKey: '_model_s4_speech_comprehensive' },
  ]
  const S4_SOURCE_OPTS = [
    { key: 'step2_sop', label: '标准文档' },
    { key: 'step2_daoshuyi', label: '分析文档' },
    { key: 'step2_yanxi', label: '综合文档' },
  ]
  const [s4ActiveSpeechTab, setS4ActiveSpeechTab] = useState<'doc' | 'analysis' | 'comprehensive'>('doc')
  const [s4SpeechModels, setS4SpeechModels] = useState<Record<string, string>>({})
  const [s4SpeechGenerating, setS4SpeechGenerating] = useState<Record<string, boolean>>({})
  const [s4DataSources, setS4DataSources] = useState<Record<string, string>>({ doc: 'step2_sop', analysis: 'step2_daoshuyi', comprehensive: 'step2_yanxi' })
  const [s4SourceEdits, setS4SourceEdits] = useState<Record<string, string>>({})
  const [ttsProviderId, setTtsProviderId] = useState('')

  const [voiceId, setVoiceId] = useState('')
  const [ttsVoices, setTtsVoices] = useState<Voice[]>([])
  const [ttsProviders, setTtsProviders] = useState<TTSProvider[]>([])
  const [ttsSourceTab, setTtsSourceTab] = useState<'doc' | 'analysis' | 'comprehensive' | 'blank'>('comprehensive')
  const [ttsInputText, setTtsInputText] = useState('')
  const [ttsGenerating, setTtsGenerating] = useState(false)
  const [ttsAudioUrl, setTtsAudioUrl] = useState('')
  const [ttsVolume, setTtsVolume] = useState(50)
  const [ttsSpeed, setTtsSpeed] = useState(1.0)
  const [ttsHistory, setTtsHistory] = useState<{ id: number; voice: string; audioUrl: string; audioPath: string; filename: string; time: string }[]>([])
  const [ttsEditorTab, setTtsEditorTab] = useState<'edit' | 'split'>('edit')
  const [splitSegments, setSplitSegments] = useState<{ index: number; text: string; audioUrl?: string }[]>([])
  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(new Set())
  const [splitGenerating, setSplitGenerating] = useState(false)
  const [splitMode, setSplitMode] = useState<'newline' | 'chars'>('chars')
  const [splitMaxChunk, setSplitMaxChunk] = useState(290)
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<number>>(new Set())
  const segmentsLoaded = useRef(false)

  // Auto-save splitSegments to step_results whenever they change
  useEffect(() => {
    if (!segmentsLoaded.current) { segmentsLoaded.current = true; return }
    saveStep('_tts_segments', JSON.stringify(splitSegments))
  }, [splitSegments])
  const [projStoragePath, setProjStoragePath] = useState('')
  const [savingPath, setSavingPath] = useState(false)
  // Voice clone states
  const [cloneMode, setCloneMode] = useState<'clone' | 'design'>('clone')
  const [cloneName, setCloneName] = useState('我的声音')
  const [cloneModel, setCloneModel] = useState('cosyvoice-v3.5-plus')
  const [cloneFile, setCloneFile] = useState<File | null>(null)
  const [cloning, setCloning] = useState(false)
  const [showNameDialog, setShowNameDialog] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [editingVoiceId, setEditingVoiceId] = useState('')
  const [editVoiceName, setEditVoiceName] = useState('')
  const [editingHistoryIdx, setEditingHistoryIdx] = useState<number | null>(null)
  const [editHistoryName, setEditHistoryName] = useState('')
  const [playingVoiceId, setPlayingVoiceId] = useState('')
  const [playingHistoryIdx, setPlayingHistoryIdx] = useState<number | null>(null)
  const playingAudioRef = useRef<HTMLAudioElement | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordingStarted, setRecordingStarted] = useState(false)
  const [recordingDone, setRecordingDone] = useState(false)
  const [recTooShort, setRecTooShort] = useState(false)
  const [recPreviewUrl, setRecPreviewUrl] = useState('')
  const [recTime, setRecTime] = useState(0)
  const [countdown, setCountdown] = useState(0)
  const [recPos, setRecPos] = useState({ x: 0, y: 0 })
  const recDragRef = useRef({ dragging: false, startX: 0, startY: 0, posX: 0, posY: 0 })
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recTimeRef = useRef(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recStreamRef = useRef<MediaStream | null>(null)
  const recFileRef = useRef<File | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const [waveData, setWaveData] = useState<number[]>([4, 6, 3, 8, 5, 4, 7, 3, 6, 4, 5, 3])
  const [voicePrompt, setVoicePrompt] = useState('温柔知性的年轻女性声音，语调自然流畅，适合阅读和讲述')
  const [previewText, setPreviewText] = useState('各位听众朋友们大家好，欢迎使用我的语音合成服务')
  const [clonedVoices, setClonedVoices] = useState<any[]>([])

  // Load project
  useEffect(() => {
    if (!id) return
    const wsidRef = { current: '' }
    api.getProject(id).then(p => {
      setProject(p)
      setProjStoragePath(p.storage_path || '')
      workspaceIdRef.current = p.workspace_id
      wsidRef.current = p.workspace_id
      if (p.workspace_id) {
        api.listCategories(p.workspace_id).then(d => setHdrCategories((d?.categories || []) as {id:string;name:string}[])).catch(() => {})
      }
      api.listAuthorOptions().then(d => setHdrAuthors((d?.authors || []) as {id:string;name:string}[])).catch(() => {})
      api.projectBatchStatus(id).then((r: any) => {
        if (r?.in_batch) setBatchWarning('此项目正在批量执行中，生成过程由服务器自动完成。请勿在此页面手动操作，以免结果冲突。')
        else setBatchWarning('')
      }).catch(() => {})

      // Load configs only after we have the workspace_id to avoid race condition
      // where listColumnConfigs(undefined) returns global seed configs instead of
      // workspace-specific configs
      api.listProjectItems(id).then((items: any[]) => {
        if (items && items.length > 0) {
          const s3p: Record<string, { prompt: string; skill: string }> = {}
          const s4p: Record<string, { prompt: string; skill: string }> = {}
          items.forEach((item: any) => {
            if (item.name === '文档课件') s3p['sop'] = { prompt: item.prompt, skill: item.skill }
            else if (item.name === '分析PPT') s3p['daoPpt'] = { prompt: item.prompt, skill: item.skill }
            else if (item.name === '综合PPT') s3p['yanxiPpt'] = { prompt: item.prompt, skill: item.skill }
            if (item.output_mode === 'speech_config') {
              if (item.name === '文档演讲') s4p['doc'] = { prompt: item.prompt, skill: item.skill }
              else if (item.name === '分析演讲') s4p['analysis'] = { prompt: item.prompt, skill: item.skill }
              else if (item.name === '综合演讲') s4p['comprehensive'] = { prompt: item.prompt, skill: item.skill }
            }
          })
          setStage3Prompts(s3p)
          if (Object.keys(s4p).length > 0) setStage4Prompts(s4p)
          // col1 & col2 always loaded from column configs
          api.listColumnConfigs(wsidRef.current).then(applyCol12Configs).catch(() => {})
          return
        }
        loadWsConfigs(wsidRef.current)
      }).catch(() => { loadWsConfigs(wsidRef.current) })

      function loadWsConfigs(wid: string) {
        api.listColumnConfigs(wid).then((configs: any[]) => {
          applyCol12Configs(configs)
          const s3p: Record<string, { prompt: string; skill: string }> = {}
          configs.forEach((c: any) => {
            if (c.column_id === 'col3') s3p['sop'] = { prompt: c.prompt, skill: c.skill }
            if (c.column_id === 'col4') s3p['daoPpt'] = { prompt: c.prompt, skill: c.skill }
            if (c.column_id === 'col5') s3p['yanxiPpt'] = { prompt: c.prompt, skill: c.skill }
          })
          setStage3Prompts(s3p)
        }).catch(() => {})
        api.listSpeechConfigs(wid).then((configs: any[]) => {
          const s4p: Record<string, { prompt: string; skill: string }> = {}
          configs.forEach((c: any) => {
            const key = c.label === '文档演讲' ? 'doc' : c.label === '分析演讲' ? 'analysis' : c.label === '综合演讲' ? 'comprehensive' : ''
            if (key) s4p[key] = { prompt: c.prompt, skill: c.skill }
          })
          if (Object.keys(s4p).length > 0) setStage4Prompts(prev => ({ ...prev, ...s4p }))
        }).catch(() => {})
      }
    }).catch(() => navigate('/'))
    let hasModelOverride = false
    api.getSteps(id).then((s: any[]) => {
      const map: Record<string, string> = {}
      s.forEach((x: any) => { map[x.step_name] = x.content })
      setSteps(prev => ({ ...prev, ...map }))
      setSavedSteps(prev => ({ ...prev, ...map }))
      setVideoText(map['raw_video'] || map['video_text'] || '')
      // Load existing video files so player works after refresh
      api.listProjectVideos(id).then((vids: any) => {
        if (vids.videos?.length > 0) setVideoPath(vids.videos[0].path)
      }).catch(() => {})
      setTextInput(map['raw_text'] || '')
      setFileText(map['raw_file'] || '')
      // Restore saved split segments
      if (map['_tts_segments']) {
        try {
          const parsed = JSON.parse(map['_tts_segments'])
          if (Array.isArray(parsed) && parsed.length > 0) {
            segmentsLoaded.current = true
            setSplitSegments(parsed)
          }
        } catch {}
      }
      // Restore saved model selections
      if (map['_model_s1_video'] || map['_model_s1_text'] || map['_model_s1_file']) {
        setStep1Models({
          video: map['_model_s1_video'] || '',
          text: map['_model_s1_text'] || '',
          file: map['_model_s1_file'] || '',
        })
        hasModelOverride = true
      }
      // Also restore legacy single key for backward compatibility
      if (!hasModelOverride && map['_model_step1']) {
        setStep1Models({ video: map['_model_step1'], text: map['_model_step1'], file: map['_model_step1'] })
        hasModelOverride = true
      }
      if (map['_temp_s1_video']) { setS1Temperatures(prev => ({ ...prev, video: parseFloat(map['_temp_s1_video']) || 0.3 })) }
      if (map['_temp_s1_text']) { setS1Temperatures(prev => ({ ...prev, text: parseFloat(map['_temp_s1_text']) || 0.3 })) }
      if (map['_temp_s1_file']) { setS1Temperatures(prev => ({ ...prev, file: parseFloat(map['_temp_s1_file']) || 0.3 })) }
      if (map['_model_step3_sop']) { setS3SopModel(map['_model_step3_sop']); hasModelOverride = true }
      if (map['_model_step3_dao_ppt']) { setS3DaoPptModel(map['_model_step3_dao_ppt']); hasModelOverride = true }
      if (map['_model_step3_yan_ppt']) { setS3YanxiPptModel(map['_model_step3_yan_ppt']); hasModelOverride = true }
      if (map['_model_s4_speech_doc']) { setS4SpeechModels(prev => ({ ...prev, doc: map['_model_s4_speech_doc'] })) }
      if (map['_model_s4_speech_analysis']) { setS4SpeechModels(prev => ({ ...prev, analysis: map['_model_s4_speech_analysis'] })) }
      if (map['_model_s4_speech_comprehensive']) { setS4SpeechModels(prev => ({ ...prev, comprehensive: map['_model_s4_speech_comprehensive'] })) }
      // Restore Stage 4 data source selections
      if (map['_ds_s4_doc']) { setS4DataSources(prev => ({ ...prev, doc: map['_ds_s4_doc'] })) }
      if (map['_ds_s4_analysis']) { setS4DataSources(prev => ({ ...prev, analysis: map['_ds_s4_analysis'] })) }
      if (map['_ds_s4_comprehensive']) { setS4DataSources(prev => ({ ...prev, comprehensive: map['_ds_s4_comprehensive'] })) }
      if (map['_temp_step3_sop']) { setS3SopTemp(parseFloat(map['_temp_step3_sop']) || 0.3) }
      if (map['_temp_step3_dao_ppt']) { setS3DaoPptTemp(parseFloat(map['_temp_step3_dao_ppt']) || 0.3) }
      if (map['_temp_step3_yan_ppt']) { setS3YanxiPptTemp(parseFloat(map['_temp_step3_yan_ppt']) || 0.3) }
      // Restore per-stage temps (13 fields each)
      const _loadTemps = (prefix: string): StageTemps => {
        const t = { ...DEFAULT_STAGE_TEMPS }
        const keys = Object.keys(t) as (keyof StageTemps)[]
        for (const k of keys) {
          const val = map[`${prefix}${k}`]
          if (val) { (t as any)[k] = parseFloat(val) || (DEFAULT_STAGE_TEMPS as any)[k] }
        }
        return t
      }
      if (Object.keys(map).some(k => k.startsWith('_temps_dao_'))) {
        setS3DaoTemps(_loadTemps('_temps_dao_'))
      }
      if (Object.keys(map).some(k => k.startsWith('_temps_yanxi_'))) {
        setS3YanxiTemps(_loadTemps('_temps_yanxi_'))
      }
      if (Object.keys(map).some(k => k.startsWith('_temps_sop_'))) {
        setS3SopTemps(_loadTemps('_temps_sop_'))
        const sopVal = map['_temps_sop_sop']
        if (sopVal) { setS3SopTemp(parseFloat(sopVal) || 0.3) }
      }
      // Restore saved template selections
      if (map['_tmpl_step3_sop']) setSopSelected(map['_tmpl_step3_sop'])
      if (map['_tmpl_step3_dao_ppt']) setDaoPptSelected(map['_tmpl_step3_dao_ppt'])
      if (map['_tmpl_step3_yan_ppt']) setYanxiPptSelected(map['_tmpl_step3_yan_ppt'])
      // Restore saved color schemes per step
      if (map['_color_scheme_step3_sop_doc']) setPptColorScheme(prev => ({ ...prev, step3_sop_doc: map['_color_scheme_step3_sop_doc'] }))
      if (map['_color_scheme_step3_dao_ppt']) setPptColorScheme(prev => ({ ...prev, step3_dao_ppt: map['_color_scheme_step3_dao_ppt'] }))
      if (map['_color_scheme_step3_yan_ppt']) setPptColorScheme(prev => ({ ...prev, step3_yan_ppt: map['_color_scheme_step3_yan_ppt'] }))
      // Restore saved PPT slide plans
      ;['step3_sop_doc', 'step3_dao_ppt', 'step3_yan_ppt'].forEach(sk => {
        const key = `_ppt_plan_${sk}`
        if (map[key]) { try { setPptSlidePlans(prev => ({ ...prev, [sk]: JSON.parse(map[key]) })) } catch {} }
        const htmlKey = `_preview_html_${sk}`
        if (map[htmlKey] && map[htmlKey].startsWith('__SVG__')) {
          setPreviewHtml(prev => ({...prev, [sk]: map[htmlKey]}))
        } else if (map[key]) {
          // Has plan data but no HTML preview — show slide list tab by default
          setPreviewTab(prev => ({...prev, [sk]: 'ppt'}))
        }
        // Restore saved PPT outlines
        const outlineJsonKey = `_ppt_outline_json_${sk}`
        const outlineText = map[sk] || ''
        const outlineJsonStr = map[outlineJsonKey]
        if (outlineJsonStr && outlineText) {
          try {
            setPptOutline(prev => ({...prev, [sk]: { outline_json: JSON.parse(outlineJsonStr), outline_text: outlineText }}))
          } catch {}
        }
      })
      // Restore per-tab data source selections
      setS2DataSources(prev => ({
        sop: map['_ds_s2_sop'] || prev.sop,
        dao: map['_ds_s2_dao'] || prev.dao,
        yanxi: map['_ds_s2_yanxi'] || prev.yanxi,
      }))
    })
    // Shared col1/col2 config parser — single source of truth for stage 1 & 2 prompts
    const applyCol12Configs = (configs: any[]) => {
      const s1p: Record<string, string> = {}
      let s1s = ''
      const s2p: Record<string, { prompt: string; skill: string }> = {}
      configs.forEach((c: any) => {
        if (c.column_id === 'col1') {
          const key = c.sort_order === 0 ? 'text' : c.sort_order === 1 ? 'video' : c.sort_order === 2 ? 'file' : ''
          if (key) { s1p[key] = c.prompt; if (!s1s) s1s = c.skill }
        }
        if (c.column_id === 'col2') {
          const key = c.sort_order === 3 ? 'sop' : c.sort_order === 4 ? 'dao' : c.sort_order === 5 ? 'yanxi' : ''
          if (key) s2p[key] = { prompt: c.prompt, skill: c.skill }
        }
      })
      if (Object.keys(s1p).length > 0) setStage1Prompts(s1p)
      if (s1s) setStage1Skill(s1s)
      if (Object.keys(s2p).length > 0) setStage2Prompts(s2p)
    }

    // Load templates for Stage 3 PPT columns
    const loadTemplates = (stageType: string) =>
      api.listTemplatesForStage(stageType).then((items: any[]) => {
        const tmplItems: TemplateItem[] = items.map((t: any) => {
          const isStyle = t.type === 'style'
          const sc = isStyle ? styleColorMap.current[t.id.replace('style-', '')] : null
          return {
            id: t.id, name: t.name, isDefault: t.isDefault,
            meta: isStyle ? (sc?.mood || '') : t.prompt ? `提示词: ${t.prompt.slice(0, 30)}...` : '暂无提示词',
            color: sc?.primary || (isStyle ? '#e67e22' : '#7C3AED'),
            icon: isStyle ? '' : t.hasFile ? '📌' : '📄',
            colors: isStyle && sc ? [sc.primary, sc.accent, sc.background, sc.text].filter(Boolean) : undefined,
            previewHtml: '',
          }
        })
        const map: Record<string, { prompt: string; skill: string; hasFile: boolean }> = {}
        items.forEach((t: any) => { map[t.id] = { prompt: t.prompt || '', skill: t.skill || '', hasFile: t.hasFile } })
        return { tmplItems, map, items }
      }).catch(() => ({ tmplItems: [], map: {}, items: [] }))
    // Pre-fetch style colors before loading templates
    api.listStyles().then((styles: any[]) => {
      (styles || []).forEach((s: any) => {
        styleColorMap.current[s.id] = {
          primary: s.colors?.primary || '#1a365d',
          accent: s.colors?.accent || '#e67e22',
          background: s.colors?.background || '#ffffff',
          text: s.colors?.text || '#1a202c',
          mood: s.mood || '',
        }
      })
    }).catch(() => {}).finally(() => {
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
    loadTemplates('sop').then(({ tmplItems, map, items }) => {
      setSopTemplates(tmplItems)
      if (tmplItems.length > 0) {
        const def = items.find((t: any) => t.isDefault) || items[0]
        setSopSelected(def.id)
      }
      setTemplatesMap(prev => ({ ...prev, ...map }))
    })
    })  // end finally
    api.listTtsProviders().then((providers: TTSProvider[]) => {
      setTtsProviders(providers)
      if (providers.length > 0 && !ttsProviderId) {
        const def = providers.find(p => p.is_default) || providers[0]
        setTtsProviderId(def.id)
        const models = Array.isArray(def.models) ? def.models : []
        if (models.length > 0) setCloneModel(models[0])
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
      const def = providers.find(p => p.is_enabled) || providers[0]
      const defModels = Array.isArray(def?.models) ? def.models : []
      const defVal = def && defModels.length > 0 ? `${def.id}:${defModels[0]}` : ''
      if (defVal) {
        setStep1Models((prev: Record<string, string>) => ({
          video: prev.video || defVal,
          text: prev.text || defVal,
          file: prev.file || defVal,
        }))
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

  // Poll batch status so the warning clears when batch finishes
  useEffect(() => {
    if (!id || !batchWarning) return
    const timer = setInterval(() => {
      api.projectBatchStatus(id).then((r: any) => {
        if (!r?.in_batch) setBatchWarning('')
      }).catch(() => {})
    }, 10000)
    return () => clearInterval(timer)
  }, [id, batchWarning])

  // Load color schemes when template selection changes (handles initial load, restoration, and user clicks)
  useEffect(() => {
    if (sopSelected) loadColorSchemesForStage('step3_sop_doc', sopSelected)
  }, [sopSelected])
  useEffect(() => {
    if (daoPptSelected) loadColorSchemesForStage('step3_dao_ppt', daoPptSelected)
  }, [daoPptSelected])
  useEffect(() => {
    if (yanxiPptSelected) loadColorSchemesForStage('step3_yan_ppt', yanxiPptSelected)
  }, [yanxiPptSelected])

  // Auto-load saved PPT results on mount (fallback for results not in step state)
  useEffect(() => {
    if (!id) return
    setPptSlidePlans({})
    setPreviewHtml({})
    setPreviewTab({})
    api.listPptResults(id).then((results: any[]) => {
      ;(results || []).forEach((r: any) => {
        const stepName = r._step_name || ''
        // Extract stepKey from _ppt_plan_step3_dao_ppt or _ppt_result_<run_id>
        let stepKey = ''
        const planMatch = stepName.match(/^_ppt_plan_(step3_\w+)$/)
        if (planMatch) {
          stepKey = planMatch[1]
        } else if (stepName.startsWith('_ppt_result_')) {
          // Derive stepKey from column_id in saved result_meta.
          // Fallback: parse from run_id (e.g. 鲍鱼一品煲_col5 → col5)
          let cid = r.column_id
          if (!cid) {
            const rid = r.run_id || stepName
            const colMatch = rid.match(/_(col\d+)$/)
            if (colMatch) cid = colMatch[1]
          }
          if (cid === 'col3') stepKey = 'step3_sop_doc'
          else if (cid === 'col5') stepKey = 'step3_yan_ppt'
          else if (cid === 'col4') stepKey = 'step3_dao_ppt'
          else stepKey = '' // unknown, skip
        }
        if (!stepKey) return
        // _ppt_result_ entries have priority over _ppt_plan_ entries.
        // If a result entry already loaded data with a preview URL, keep it.
        if (pptSlidePlans[stepKey] && stepName.startsWith('_ppt_result_')) {
          // Replace with result data (has previewUrl, zipUrl etc.)
        } else if (pptSlidePlans[stepKey]) {
          return // plan entry, keep existing data
        }
        // Build planData from result fields (handle both slides and slide_plan keys)
        const slides = r.slides || r.slide_plan
        if (!slides || !slides.length) return
        const planData = {
          slides,
          filename: r.filename || `svg-deck-${r.run_id || 'unknown'}`,
          downloadUrl: r.downloadUrl || r.zip_url || '',
          previewUrl: r.preview_url || r.previewUrl || '',
          zipUrl: r.zip_url || r.zipUrl || '',
          templateId: r.template_id || r.templateId || '',
          format: r.format || 'svg',
          styleId: r.styleId || r.style_id || '',
          colorScheme: r.colorScheme || r.color_scheme || '',
        }
        setPptSlidePlans(prev => ({ ...prev, [stepKey]: planData }))
        if (r.preview_url || r.previewUrl) {
          setPreviewHtml(prev => ({...prev, [stepKey]: '__SVG__' + (r.preview_url || r.previewUrl)}))
          setPreviewTab(prev => ({...prev, [stepKey]: 'ppt'}))
        } else {
          setPreviewTab(prev => ({...prev, [stepKey]: 'ppt'}))
        }
      })
    }).catch(() => {})
  }, [id])

  // Save step helper
  const saveStep = useCallback(async (stepName: string, content: string) => {
    if (!id) return
    try {
      await api.saveStep(id, stepName, content)
      setSteps(prev => ({ ...prev, [stepName]: content }))
      setSavedSteps(prev => ({ ...prev, [stepName]: content }))
    } catch (e: any) {
      modal.toast(`保存失败: ${e?.message || e}`, 'error')
    }
  }, [id, modal])

  const step1Key = () => sub === '1a' ? 'step1_video' : sub === '1b' ? 'step1_text' : 'step1_file'

  // ── Stage 1 preview helpers ──
  const s1Content = steps[step1Key()] || ''
  const s1RenderedHtml = useMemo(() => {
    if (!s1Content) return ''
    try { return DOMPurify.sanitize(marked.parse(s1Content) as string) } catch { return '' }
  }, [s1Content])

  const s1View = s1ViewMode[sub] || 'edit'
  const setS1View = (v: 'edit' | 'preview') => setS1ViewMode(prev => ({ ...prev, [sub]: v }))

  const PREVIEW_CSS = `
.md-preview{font-size:14px;line-height:1.8;color:#1a1a2e}
.md-preview h1{font-size:1.6em;margin:.8em 0 .4em;border-bottom:2px solid #e0e0e0;padding-bottom:.3em}
.md-preview h2{font-size:1.35em;margin:.7em 0 .35em;border-bottom:1px solid #eee;padding-bottom:.2em}
.md-preview h3{font-size:1.15em;margin:.6em 0 .3em}
.md-preview h4{font-size:1.05em;margin:.5em 0 .25em}
.md-preview p{margin:.5em 0}
.md-preview ul,.md-preview ol{padding-left:1.6em;margin:.4em 0}
.md-preview li{margin:.2em 0}
.md-preview table{border-collapse:collapse;width:100%;margin:.6em 0}
.md-preview th,.md-preview td{border:1px solid #d0d0d0;padding:6px 10px;text-align:left}
.md-preview th{background:#f5f5f5;font-weight:600}
.md-preview code{background:#f0f0f0;padding:1px 5px;border-radius:3px;font-size:.9em}
.md-preview pre{background:#f8f8f8;border:1px solid #e0e0e0;border-radius:6px;padding:12px 16px;overflow-x:auto}
.md-preview pre code{background:none;padding:0}
.md-preview blockquote{border-left:3px solid #ddd;margin:.6em 0;padding:.4em 1em;color:#666}
.md-preview hr{border:none;border-top:1px solid #e0e0e0;margin:1em 0}
.md-preview img{max-width:100%}
.md-preview a{color:var(--primary,#4a6cf7)}
`

  const handleS1DownloadHtml = () => {
    if (!s1RenderedHtml) return
    const label = sub === '1a' ? '视频提取' : sub === '1b' ? '文字输入' : '文件提取'
    const doc = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<title>AI生成结果 - ' + label + '</title>\n<style>' + PREVIEW_CSS + '</style>\n</head>\n<body style="max-width:800px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif">\n<div class="md-preview">' + s1RenderedHtml + '</div>\n</body>\n</html>'
    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `AI生成结果_${label}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleS1Print = () => {
    if (!s1RenderedHtml) return
    const label = sub === '1a' ? '视频提取' : sub === '1b' ? '文字输入' : '文件提取'
    const doc = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<title>AI生成结果 - ' + label + '</title>\n<style>' + PREVIEW_CSS + '\nbody{max-width:800px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif}@media print{body{max-width:none;padding:0}}\n</style>\n</head>\n<body><div class="md-preview">' + s1RenderedHtml + '</div></body>\n</html>'
    const w = window.open('', '_blank', 'width=900,height=700')
    if (w) { w.document.write(doc); w.document.close(); w.focus(); w.print() }
  }
  const step3Key = () => sub === '3a' ? 'step3_sop_doc' : sub === '3b' ? 'step3_dao_ppt' : 'step3_yan_ppt'

  // ── Stage 3 preview helpers ──
  const s3CurrentView = s3ViewMode[step3Key()] || 'edit'
  const setS3CurrentView = (v: 'edit' | 'preview') => setS3ViewMode(prev => ({ ...prev, [step3Key()]: v }))
  const s3OutlineText = pptOutline[step3Key()]?.outline_text || ''
  const s3RenderedHtml = useMemo(() => {
    if (!s3OutlineText) return ''
    try { return DOMPurify.sanitize(marked.parse(s3OutlineText) as string) } catch { return '' }
  }, [s3OutlineText])

  const handleS3DownloadHtml = () => {
    if (!s3RenderedHtml) return
    const key = step3Key()
    const label = key === 'step3_dao_ppt' ? '分析PPT' : key === 'step3_yan_ppt' ? '综合PPT' : '文档课件'
    const doc = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<title>PPT大纲 - ' + label + '</title>\n<style>' + PREVIEW_CSS + '</style>\n</head>\n<body style="max-width:800px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif">\n<div class="md-preview">' + s3RenderedHtml + '</div>\n</body>\n</html>'
    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'PPT大纲_' + label + '.html'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleS3Print = () => {
    if (!s3RenderedHtml) return
    const key = step3Key()
    const label = key === 'step3_dao_ppt' ? '分析PPT' : key === 'step3_yan_ppt' ? '综合PPT' : '文档课件'
    const doc = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<title>PPT大纲 - ' + label + '</title>\n<style>' + PREVIEW_CSS + '\nbody{max-width:800px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif}@media print{body{max-width:none;padding:0}}\n</style>\n</head>\n<body><div class="md-preview">' + s3RenderedHtml + '</div></body>\n</html>'
    const w = window.open('', '_blank', 'width=900,height=700')
    if (w) { w.document.write(doc); w.document.close(); w.focus(); w.print() }
  }

  // ── Stage 4 preview helpers ──
  const s4ActiveStepKey = (() => {
    const tab = S4_SPEECH_TABS.find(t => t.key === s4ActiveSpeechTab)
    return tab?.stepKey || 'step4_speech_doc'
  })()
  const s4Content = steps[s4ActiveStepKey] || ''
  const s4RenderedHtml = useMemo(() => {
    if (!s4Content) return ''
    try { return DOMPurify.sanitize(marked.parse(s4Content) as string) } catch { return '' }
  }, [s4Content])

  const handleS4DownloadHtml = () => {
    if (!s4RenderedHtml) return
    const tab = S4_SPEECH_TABS.find(t => t.key === s4ActiveSpeechTab)
    const label = tab?.label || '演讲稿'
    const doc = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<title>' + label + '</title>\n<style>' + PREVIEW_CSS + '</style>\n</head>\n<body style="max-width:800px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif">\n<div class="md-preview">' + s4RenderedHtml + '</div>\n</body>\n</html>'
    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = label + '.html'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleS4Print = () => {
    if (!s4RenderedHtml) return
    const tab = S4_SPEECH_TABS.find(t => t.key === s4ActiveSpeechTab)
    const label = tab?.label || '演讲稿'
    const doc = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<title>' + label + '</title>\n<style>' + PREVIEW_CSS + '\nbody{max-width:800px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif}@media print{body{max-width:none;padding:0}}\n</style>\n</head>\n<body><div class="md-preview">' + s4RenderedHtml + '</div></body>\n</html>'
    const w = window.open('', '_blank', 'width=900,height=700')
    if (w) { w.document.write(doc); w.document.close(); w.focus(); w.print() }
  }

  // Extract run_id, provider, model for the edit panel
  const editPanelProps = () => {
    const key = step3Key()
    const plan = pptSlidePlans[key]
    const previewUrl = plan?.previewUrl || ''
    const m = previewUrl.match(/\/api\/exports\/(.+?)\/index\.html/)
    const runId = m ? m[1] : ''
    const slideCount = plan?.slides?.length || 0
    const model = key === 'step3_dao_ppt' ? s3DaoPptModel : key === 'step3_yan_ppt' ? s3YanxiPptModel : s3SopModel
    const [pid, mdl] = model ? model.split(':') : ['', '']
    const styleId = plan?.styleId || 'business'
    return { runId, slideCount, providerId: pid, model: mdl, previewUrl, styleId }
  }

  // ── Stage nav ──
  const switchStage = (s: StageId) => {
    if (!stageViewPerms[s]) return
    setStage(s)
    const stageDef = STAGES.find(x => x.id === s)
    if (stageDef && stageDef.subs.length > 0) setSub(stageDef.subs[0].id)
  }

  // Auto-redirect to first visible stage if current stage has no view permission
  useEffect(() => {
    if (!stageViewPerms[stage] && visibleStages.length > 0) {
      switchStage(visibleStages[0].id)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
  const handleVideoUpload = async (file: File) => {
    setDlStatus('downloading'); setDlPercent(0)
    try {
      const result: any = await api.uploadVideo(file, id, asrModel, asrProviderId)
      setDlTaskId(result.task_id)
      pollProgress(result.task_id)
    } catch (e: any) { setDlStatus('error: ' + e.message) }
  }
  const pollProgress = async (taskId: string) => {
    const poll = async () => {
      const p: any = await api.getVideoProgress(taskId)
      setDlPercent(p.percent); setDlStatus(p.status)
      if (p.text) setDlMessage(p.text)
      if (p.text) setVideoText(p.text)
      if (p.subtitle_text) setSourceSubtitle(p.subtitle_text)
      if (p.asr_text) setSourceAsr(p.asr_text)
      if (p.merged_text) { setSourceMerged(p.merged_text); setVideoText(p.merged_text); setSourceTab('merged') }
      else if (p.asr_text) { setSourceTab('asr') }
      else if (p.subtitle_text) { setSourceTab('subtitle') }
      if (p.video_path) setVideoPath(p.video_path)
      if (p.status === 'completed') {
        setDlStatus('done')
        modal.toast('✅ 视频处理完成', 'success')
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
  // ── LLM Generate (streaming with progress) ──
  const doGenerate = async (stepKey: string, systemPrompt: string, userMessage: string, providerId?: string, model?: string, temperature: number = 0.3, signal?: AbortSignal) => {
    if (!id) return
    const labelMap: Record<string, string> = { step2_sop: '标准文档', step2_daoshuyi: '分析文档', step2_yanxi: '综合文档', step3_sop_doc: '标准课件' }
    const label = labelMap[stepKey] || stepKey
    const subMap: Record<string, string> = { step2_sop: '2a', step2_daoshuyi: '2b', step2_yanxi: '2c' }
    const subKey = subMap[stepKey] || ''
    const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })
    try {
      setDocGenLog(prev => [...prev, { time: now(), message: `开始生成 ${label}...` }])
      setDocGenProgress({ phase_label: `正在生成 ${label}`, message: '准备中...', stepKey })
      if (subKey) {
        setS2Logs(prev => ({ ...prev, [subKey]: [{ time: now(), message: `开始生成 ${label}...` }] }))
        setS2Progress(prev => ({ ...prev, [subKey]: `正在生成 ${label}...` }))
      }

      let fullText = ''
      let lastUpdate = 0
      for await (const chunk of api.llmGenerateStream({
        provider_id: providerId || 'default',
        model: model || 'deepseek-v4-pro',
        system_prompt: systemPrompt,
        user_message: userMessage,
        temperature,
        signal,
      })) {
        fullText += chunk
        if (fullText.length - lastUpdate > 300) {
          lastUpdate = fullText.length
          setDocGenProgress({ phase_label: `正在生成 ${label}`, message: `已生成 ${fullText.length} 字符`, stepKey })
          if (subKey) setS2Progress(prev => ({ ...prev, [subKey]: `正在生成 ${label} — 已生成 ${fullText.length} 字符` }))
        }
      }

      setDocGenLog(prev => [...prev, { time: now(), message: `${label} 完成 (${fullText.length} 字符)` }])
      setDocGenProgress({ phase_label: `${label} 已完成`, message: `${fullText.length} 字符`, stepKey })
      if (subKey) {
        setS2Logs(prev => ({ ...prev, [subKey]: [...(prev[subKey] || []), { time: now(), message: `${label} 完成 (${fullText.length} 字符)` }] }))
        setS2Progress(prev => ({ ...prev, [subKey]: '' }))
      }
      setSteps(prev => ({ ...prev, [stepKey]: fullText }))
      saveStep(stepKey, fullText)
      return fullText
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setDocGenLog(prev => [...prev, { time: now(), message: `${label} 失败: ${e.message}` }])
        if (subKey) setS2Logs(prev => ({ ...prev, [subKey]: [...(prev[subKey] || []), { time: now(), message: `${label} 失败: ${e.message}` }] }))
        modal.toast('生成失败: ' + e.message, 'error')
      } else {
        setDocGenLog(prev => [...prev, { time: now(), message: `${label} 已取消` }])
        if (subKey) setS2Logs(prev => ({ ...prev, [subKey]: [...(prev[subKey] || []), { time: now(), message: `${label} 已取消` }] }))
      }
      return null
    }
  }

  // ── Stage 1 Generate ──
  const doGenerateStep1 = async () => {
    const source = mode1 === 'text' ? textInput : mode1 === 'file' ? fileText : videoText
    if (!source.trim() || !id || !step1Model) return
    if (step1Generating[sub]) return
    const stepKey = `step1_${sub}`
    const ctrl = new AbortController(); abortRef.current[stepKey] = ctrl
    setStep1Generating(prev => ({ ...prev, [sub]: true }))
    try {
      const [providerId, model] = step1Model.split(':')
      const prompt = stage1Prompts[mode1Key] || STAGE1_PROMPTS_FALLBACK[mode1Key]
      const skill = stage1Skill || STAGE1_SKILL_FALLBACK
      const result: any = await api.llmGenerate({
        provider_id: providerId, model,
        system_prompt: prompt,
        user_message: `请将以下内容按指定格式整理：\n\n${source}\n\n输出格式要求：\n${skill}`,
        temperature: s1Temperature,
        signal: ctrl.signal,
      })
      const content = result.content
      const key = step1Key()
      setSteps(prev => ({ ...prev, [key]: content }))
      saveStep(key, content)
    } catch (e: any) { if (e.name !== 'AbortError') modal.toast('生成失败: ' + e.message, 'error') }
    finally { setStep1Generating(prev => ({ ...prev, [sub]: false })); delete abortRef.current[stepKey] }
  }

  // ── Batch Generate All Stage 2 Docs ──
  const STAGE2_CONFIGS = [
    { stepKey: 'step2_sop', modelKey: '_model_s2_sop', promptKey: 'sop', tempKey: '_temp_s2_sop', label: '标准文档', fallbackPrompt: '请将以下内容整理为标准文档格式。' },
    { stepKey: 'step2_daoshuyi', modelKey: '_model_s2_dao', promptKey: 'dao', tempKey: '_temp_s2_dao', label: '分析文档', fallbackPrompt: '请分析以下内容的原理与方法。' },
    { stepKey: 'step2_yanxi', modelKey: '_model_s2_yanxi', promptKey: 'yanxi', tempKey: '_temp_s2_yanxi', label: '综合文档', fallbackPrompt: '请将以下内容整理为手册格式，包含背景知识和要点。' },
  ]

  const executeBatchGenerate = async (resolvedModels: Record<string, string>) => {
    // 严格按当前上下文取该源右侧整理后的内容（step1_xxx），不回退 raw，不跨源
    const dsMapS1: Record<string, string> = { '1a': 'video', '1b': 'text', '1c': 'file' }
    const effectiveDs = stage === 1 ? (dsMapS1[sub] || 'video') : (s2DataSources['sop'] || 'video')
    const stage1Source = effectiveDs === 'video' ? (steps.step1_video || '')
      : effectiveDs === 'text' ? (steps.step1_text || '')
      : effectiveDs === 'file' ? (steps.step1_file || '')
      : ''

    // Stage 1 触发：严格只用当前 TAB 整理内容；Stage 2 触发：可用已有 Stage 2 输出回退
    const source = stage === 1 ? stage1Source : (STAGE2_CONFIGS.reduce((acc, c) => acc || steps[c.stepKey] || '', '') || stage1Source)

    if (!source) {
      const tabLabel = effectiveDs === 'video' ? '视频提取' : effectiveDs === 'text' ? '文字输入' : '文件提取'
      modal.toast(`「${tabLabel}」右侧整理区没有内容，请先点击「整理文档」生成内容`, 'error')
      delete abortRef.current['step2_batch']
      return
    }

    const ctrl = new AbortController(); abortRef.current['step2_batch'] = ctrl

    // When called from Stage 1, auto-set all Stage 2 data sources
    if (stage === 1) {
      ;['sop', 'dao', 'yanxi'].forEach(col => {
        setS2DataSources(prev => ({ ...prev, [col]: effectiveDs }))
        if (id) api.saveStep(id, `_ds_s2_${col}`, effectiveDs)
      })
    }

    const subMap: Record<string, string> = {
      step2_sop: '2a', step2_daoshuyi: '2b', step2_yanxi: '2c',
    }

    const tasks = STAGE2_CONFIGS.map(c => {
      const model = resolvedModels[c.modelKey]
      if (!model) return null
      const [pid, mdl] = model.split(':')
      const prompt = stage2Prompts[c.promptKey]?.prompt || c.fallbackPrompt
      const skill = stage2Prompts[c.promptKey]?.skill || ''
      const userMessage = skill
        ? `请将以下内容按指定格式整理：\n\n${source}\n\n输出格式要求：\n${skill}`
        : source
      const subKey = subMap[c.stepKey] || ''
      const temperature = steps[c.tempKey] ? parseFloat(steps[c.tempKey]) : 0.3
      if (subKey) setStep2Generating(prev => ({ ...prev, [subKey]: true }))
      return doGenerate(c.stepKey, prompt, userMessage, pid, mdl, temperature, ctrl.signal)
        .then(r => {
          if (subKey) setStep2Generating(prev => ({ ...prev, [subKey]: false }))
          return { label: c.label, ok: r != null }
        })
        .catch(() => {
          if (subKey) setStep2Generating(prev => ({ ...prev, [subKey]: false }))
          return { label: c.label, ok: false }
        })
    }).filter(Boolean)

    try {
      const results = await Promise.all(tasks)
      const ok = results.filter((r: any) => r.ok)
      const fail = results.filter((r: any) => !r.ok)
      if (fail.length === 0) {
        modal.toast('三篇文案已全部生成', 'success')
      } else if (ok.length === 0) {
        modal.toast(`全部生成失败: ${fail.map((f: any) => f.label).join('、')}`, 'error')
      } else {
        modal.toast(`${ok.map((o: any) => o.label).join('、')} 生成成功; ${fail.map((f: any) => f.label).join('、')} 失败`, 'error')
      }
    } catch (e: any) {
      setStep2Generating({})
      if (e.name !== 'AbortError') modal.toast('批量生成失败: ' + e.message, 'error')
    } finally {
      delete abortRef.current['step2_batch']
      setDocGenProgress(null)
      try {
        const s = await api.getSteps(id!)
        const map: Record<string, string> = {}
        s.forEach((x: any) => { map[x.step_name] = x.content })
        setSteps(prev => ({ ...prev, ...map }))
        setSavedSteps(prev => ({ ...prev, ...map }))
      } catch {}
    }
  }

  const doBatchGenerate = () => {
    const defP = llmProviders.find(p => p.is_enabled)
    const defMs = (defP && Array.isArray(defP.models)) ? defP.models : []
    const defModel = (defMs.length > 0 && defP) ? `${defP.id}:${defMs[0]}` : ''
    const defaults: Record<string, string> = {}
    STAGE2_CONFIGS.forEach(c => {
      defaults[c.modelKey] = steps[c.modelKey] || defModel
    })
    setModelPickerValues(defaults)
    setShowModelPicker(true)
  }

  // ── Model Picker: confirm → save models → regenerate ──
  const handleModelPickerConfirm = async () => {
    if (!id) return
    const configs = [
      { modelKey: '_model_s2_sop' as const },
      { modelKey: '_model_s2_dao' as const },
      { modelKey: '_model_s2_yanxi' as const },
    ]
    // Save selections
    try {
      for (const c of configs) {
        const val = modelPickerValues[c.modelKey]
        if (val) {
          await api.saveStep(id, c.modelKey, val)
        }
      }
    } catch {
      modal.toast('设置不成功', 'error')
      return
    }
    setShowModelPicker(false)
    // Update local state
    try {
      const s = await api.getSteps(id)
      const map: Record<string, string> = {}
      s.forEach((x: any) => { map[x.step_name] = x.content })
      setSteps(prev => ({ ...prev, ...map }))
      setSavedSteps(prev => ({ ...prev, ...map }))
    } catch {}
    executeBatchGenerate(modelPickerValues)
  }

  const modelPickerAll = [
    { modelKey: '_model_s2_sop', label: '标准文档' },
    { modelKey: '_model_s2_dao', label: '分析文档' },
    { modelKey: '_model_s2_yanxi', label: '综合文档' },
  ]

  // ── PPT / SOP Generation ──
  const getPptModel = (key: string): string => {
    if (key === 'step3_dao_ppt') return s3DaoPptModel
    if (key === 'step3_yan_ppt') return s3YanxiPptModel
    if (key === 'step3_sop_doc') return s3SopModel
    return ''
  }
  const doGeneratePlan = async (stepKey: string, content: string, tmplId: string, model: string, columnId: string, temperature: number = 0.3, tempOutline?: number, tempGeneration?: number, tempStageOutline?: number, tempStageGeneration?: number, tempStageReview?: number) => {
    setPptGenerating(prev => ({...prev, [stepKey]: true}))
    const ctrl = new AbortController(); abortRef.current[stepKey] = ctrl
    try {
      const [pid, mdl] = model ? model.split(':') : ['', '']
      const result: any = await api.generatePPTPlan(content, tmplId, pid, mdl, columnId, ctrl.signal, temperature, tempOutline, tempGeneration, tempStageOutline, tempStageGeneration, tempStageReview)
      const plan = result.slide_plan || []
      const planJson = JSON.stringify(plan, null, 2)
      setSteps(prev => ({ ...prev, [stepKey]: planJson }))
      saveStep(stepKey, planJson)
      modal.toast(`大纲已生成: ${plan.length} 页幻灯片`, 'success')
    } catch (e: any) { if (e.name !== 'AbortError') modal.toast('生成大纲失败: ' + e.message, 'error') }
    finally { setPptGenerating(prev => { const n = {...prev}; delete n[stepKey]; return n }); delete abortRef.current[stepKey] }
  }

  const clearPptPolling = () => {
    if (pptPollRef.current) { clearInterval(pptPollRef.current); pptPollRef.current = null }
    setPptProgress(null)
    setProgressivePreviewUrl({})
  }

  const clearPptLogPolling = () => {
    if (pptLogPollRef.current) { clearInterval(pptLogPollRef.current); pptLogPollRef.current = null }
  }

  const startPptLogPolling = () => {
    clearPptLogPolling()
    setPptLog([])
    const poll = () => {
      api.getPptLog(id!).then(logs => {
        if (logs && logs.length > 0) setPptLog(logs)
      }).catch(() => {})
    }
    poll() // immediate first fetch
    pptLogPollRef.current = setInterval(poll, 10000)
  }

  // Auto-scroll log container to bottom when new entries arrive
  useEffect(() => {
    if (pptLogContainerRef.current) {
      pptLogContainerRef.current.scrollTop = pptLogContainerRef.current.scrollHeight
    }
  }, [pptLog])

  const doGenerateOutline = async (stepKey: string, content: string, tmplId: string, model: string, columnId: string, temperature: number = 0.3, tempOutline?: number, tempKeyword?: number, tempResearch?: number, tempFill?: number, tempStageOutline?: number, tempStageGeneration?: number, tempStageReview?: number) => {
    setPptOutlineLoading(prev => ({...prev, [stepKey]: true}))
    startPptLogPolling()
    // Clear stale PPT result from previous generation so the outline textarea shows after this completes
    setPptSlidePlans(prev => { const n = { ...prev }; delete n[stepKey]; return n })
    const ctrl = new AbortController()
    abortRef.current[stepKey] = ctrl
    let pollFailCount = 0
    pptPollRef.current = setInterval(() => {
      api.getPptStatus(id!).then(s => {
        pollFailCount = 0
        setPptProgress(s)
      }).catch(() => {
        pollFailCount++
        if (pollFailCount >= 2) {
          ctrl.abort()
          modal.toast('后端连接丢失，生成已中断', 'error')
        }
      })
    }, 10000)
    try {
      const [pid, mdl] = model ? model.split(':') : ['', '']
      const result = await api.generateOutline(content, tmplId, pid, mdl, columnId, ctrl.signal, temperature, tempOutline, tempKeyword, tempResearch, tempFill, tempStageOutline, tempStageGeneration, tempStageReview, id)
      if (result && result.outline_json?.length > 0) {
        setPptOutline(prev => ({...prev, [stepKey]: result}))
        setPreviewTab(prev => ({...prev, [stepKey]: 'ppt'}))
        saveStep(stepKey, result.outline_text || '')
        if (result.outline_json?.length) saveStep(`_ppt_outline_json_${stepKey}`, JSON.stringify(result.outline_json))
        const outlineLabel = stepKey === 'step3_dao_ppt' ? '分析PPT' : stepKey === 'step3_yan_ppt' ? '综合PPT' : '文档课件'
        api.saveFileToProject(id!, `${project?.name || '文档'}_${outlineLabel}大纲.txt`, result.outline_text || '').catch(() => {})
        modal.toast(`大纲已生成：${result.outline_json.length} 页`, 'success')
      } else {
        modal.toast('大纲生成失败：返回为空', 'error')
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') modal.toast('生成已取消', 'success')
      else modal.toast(`大纲生成失败: ${e?.message || e}`, 'error')
    } finally {
      delete abortRef.current[stepKey]
      setPptOutlineLoading(prev => ({...prev, [stepKey]: false}))
      clearPptPolling()
      api.getPptLog(id!).then(logs => {
        if (logs && logs.length > 0) setPptLog(logs)
      }).catch(() => {})
      clearPptLogPolling()
    }
  }

  const doGeneratePPT = async (stepKey: string, content: string, tmplId: string, label: string, _prompt: string, model: string, columnId: string, temperature: number = 0.3, tempKeyword?: number, tempResearch?: number, tempOutline?: number, tempFill?: number, tempCards?: number, tempHtml?: number, tempSvgBatch?: number, tempSvgSingle?: number, tempReview?: number, tempFix?: number, tempHolistic?: number, tempHolisticFix?: number, tempStageOutline?: number, tempStageGeneration?: number, tempStageReview?: number, forceRegen?: boolean) => {
    if (!pptOutline[stepKey]?.outline_json?.length) {
      modal.confirm('请先生成大纲')
      return
    }
    setPptGenerating(prev => ({...prev, [stepKey]: true}))
    clearPptPolling()
    startPptLogPolling()
    // Clear stale preview/edit data from previous generation so buttons don't show old results
    setPptSlidePlans(prev => { const n = { ...prev }; delete n[stepKey]; return n })
    setPreviewHtml(prev => { const n = { ...prev }; delete n[stepKey]; return n })
    setPreviewTab(prev => ({...prev, [stepKey]: 'ppt'}))
    const ctrl = new AbortController(); abortRef.current[stepKey] = ctrl
    let pollFailCount = 0
    pptPollRef.current = setInterval(() => {
      api.getPptStatus(id!).then(s => {
        pollFailCount = 0
        setPptProgress(s)
        if (s?.preview_url) setProgressivePreviewUrl(prev => ({ ...prev, [stepKey]: s.preview_url }))
      }).catch(() => {
        pollFailCount++
        if (pollFailCount >= 2) {
          ctrl.abort()
          modal.toast('后端连接丢失，生成已中断', 'error')
        }
      })
    }, 10000)
    try {
      const branding = (globalBranding.copyright || globalBranding.signature) ? globalBranding : undefined
      const [pid, mdl] = model ? model.split(':') : ['', '']
      const outlineJson = pptOutline[stepKey]?.outline_json
      const validOutlinePlan = outlineJson?.length ? outlineJson : undefined
      const result: any = await api.generatePPT(content, tmplId, branding, id, pid, mdl, validOutlinePlan, ctrl.signal, columnId, pptColorScheme[stepKey] || 'deep-blue', temperature, tempKeyword, tempResearch, tempOutline, tempFill, tempCards, tempHtml, tempSvgBatch, tempSvgSingle, tempReview, tempFix, tempHolistic, tempHolisticFix, tempStageOutline, tempStageGeneration, tempStageReview, forceRegen)

      if (result.format === 'svg') {
        // SVG output — PPT-Agent Bento Grid
        setGenFiles(prev => [...prev, {
          name: `svg-deck-${result.run_id}.zip`, type: 'SVG',
          source: label,
          url: result.zip_url,
        }])
        const planData = {
          slides: result.slide_plan || [], filename: `svg-deck-${result.run_id}`,
          downloadUrl: result.zip_url,
          previewUrl: result.preview_url,
          zipUrl: result.zip_url,
          templateId: tmplId,
          format: 'svg',
          styleId: (result as any).style_id || '',
          colorScheme: (result as any).color_scheme || '',
        }
        setPptSlidePlans(prev => ({ ...prev, [stepKey]: planData }))
        saveStep(`_ppt_plan_${stepKey}`, JSON.stringify(planData))
        setPreviewTab(prev => ({...prev, [stepKey]: 'ppt'}))
        const htmlUrl = '__SVG__' + result.preview_url
        setPreviewHtml(prev => ({...prev, [stepKey]: htmlUrl}))
        saveStep(`_preview_html_${stepKey}`, htmlUrl)
        modal.toast(`SVG 幻灯片已生成: ${result.slide_count || 0} 页`, 'success')
      } else {
        // PPTX output — legacy format
        setGenFiles(prev => [...prev, {
          name: result.filename, type: 'PPT',
          source: label,
          url: result.download_url || '/api/download/' + encodeURIComponent(result.filename),
        }])
        if (result.slide_plan) {
          const planData = {
            slides: result.slide_plan, filename: result.filename,
            downloadUrl: result.download_url || '/api/download/' + encodeURIComponent(result.filename),
            templateId: tmplId,
            format: 'pptx',
          }
          setPptSlidePlans(prev => ({ ...prev, [stepKey]: planData }))
          saveStep(`_ppt_plan_${stepKey}`, JSON.stringify(planData))
          setPreviewTab(prev => ({...prev, [stepKey]: 'ppt'}))
          setPreviewHtml(prev => ({...prev, [stepKey]: ''}))
        }
        modal.toast(`PPT 已生成: ${result.filename}`, 'success')
      }
      // Auto-save slide plan to project file list
      if (result.slide_plan?.length) {
        const lines = result.slide_plan.map((s: any, i: number) => `${i + 1}. ${s.heading || s.title || `幻灯片 ${i + 1}`}`)
        api.saveFileToProject(id!, `${project?.name || '文档'}_${label}_幻灯片列表.txt`, `${label} — 幻灯片列表 (共 ${result.slide_plan.length} 页)\n\n${lines.join('\n')}`).catch(() => {})
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        const msg = e?.message || String(e) || '未知错误'
        modal.toast('PPT 生成失败: ' + msg, 'error')
      }
    } finally { setPptGenerating(prev => { const n = {...prev}; delete n[stepKey]; return n }); delete abortRef.current[stepKey]; clearPptPolling(); api.getPptLog(id!).then(logs => { if (logs && logs.length > 0) setPptLog(logs) }).catch(() => {}); clearPptLogPolling() }
  }

  const handleCancelGenerate = (stepKey: string) => {
    if (abortRef.current[stepKey]) { abortRef.current[stepKey].abort(); clearPptPolling(); modal.toast('已取消生成', 'success') }
  }

  const refreshPreview = async (stepKey: string) => {
    let plan = pptSlidePlans[stepKey]
    if (!plan && id) {
      // 清空按钮只清了内存状态，后端数据还在，尝试恢复
      setPreviewLoading(prev => ({...prev, [stepKey]: true}))
      try {
        const steps = await api.getSteps(id)
        const map: Record<string, string> = {}
        steps.forEach((x: any) => { map[x.step_name] = x.content })
        const planKey = `_ppt_plan_${stepKey}`
        const htmlKey = `_preview_html_${stepKey}`
        if (map[planKey]) {
          plan = JSON.parse(map[planKey])
          // 兼容旧格式：从 _preview_html_* 补全缺失字段
          if (!plan.format && map[htmlKey]) {
            plan.format = map[htmlKey].startsWith('__SVG__') ? 'svg' : 'pptx'
          }
          if (!plan.previewUrl && map[htmlKey]) {
            plan.previewUrl = map[htmlKey].replace(/^__SVG__/, '')
          }
          if (!plan.zipUrl && plan.previewUrl) {
            const m = plan.previewUrl.match(/\/api\/exports\/(.+?)\/index\.html/)
            if (m) plan.zipUrl = `/api/ppt/export-zip/${m[1]}`
          }
          setPptSlidePlans(prev => ({ ...prev, [stepKey]: plan }))
          if (map[htmlKey]) {
            setPreviewHtml(prev => ({...prev, [stepKey]: map[htmlKey]}))
            setPreviewTab(prev => ({...prev, [stepKey]: 'ppt'}))
          }
        }
      } catch { /* ignore */ }
    }
    if (!plan) {
      setPreviewLoading(prev => { const n = {...prev}; delete n[stepKey]; return n })
      modal.toast('暂无 PPT 数据，请先生成', 'error')
      return
    }
    setPreviewLoading(prev => ({...prev, [stepKey]: true}))
    setPreviewTab(prev => ({...prev, [stepKey]: 'ppt'}))
    try {
      if (plan.format === 'svg' && plan.previewUrl) {
        setPreviewHtml(prev => ({...prev, [stepKey]: '__SVG__' + plan.previewUrl}))
      } else if (plan.previewUrl) {
        setPreviewHtml(prev => ({...prev, [stepKey]: plan.previewUrl as string}))
      } else {
        modal.toast('此计划暂无预览', 'error')
      }
    } catch (e: any) { modal.toast('预览失败: ' + e.message, 'error') }
    finally { setPreviewLoading(prev => { const n = {...prev}; delete n[stepKey]; return n }) }
  }

  const handleDownloadHtml = async (stepKey: string) => {
    const plan = pptSlidePlans[stepKey]
    if (!plan?.previewUrl) {
      if (plan?.format === 'svg' && plan.zipUrl) {
        modal.toast('SVG 格式请使用「⬇ SVG ZIP」下载完整包', 'error')
      } else {
        modal.toast('此 PPT 暂无 HTML 预览（仅 SVG 格式支持 HTML 预览）', 'error')
      }
      return
    }
    try {
      const token = localStorage.getItem('auth_token')
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const resp = await fetch(plan.previewUrl, { headers })
      if (!resp.ok) {
        modal.toast(`HTML导出失败: 服务器返回 ${resp.status}`, 'error')
        return
      }
      let html = await resp.text()
      html = html.replace(/<script>[\s\S]*?<\/script>/gi, '')
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = (plan.filename || 'slides').replace(/\.pptx$/i, '') + '.html'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      modal.toast('已开始下载: ' + ((plan.filename || 'slides').replace(/\.pptx$/i, '') + '.html'), 'success')
    } catch (e: any) { modal.toast('HTML导出失败: ' + e.message, 'error') }
  }

  // ── TTS ──
  const stopAudio = () => {
    if (playingAudioRef.current) { playingAudioRef.current.pause(); playingAudioRef.current = null }
    setPlayingVoiceId('')
    setPlayingHistoryIdx(null)
  }
  const playAudio = (url: string, voiceId?: string, historyIdx?: number, vol?: number, spd?: number) => {
    stopAudio()
    const a = new Audio(url)
    playingAudioRef.current = a
    if (voiceId) setPlayingVoiceId(voiceId)
    if (historyIdx !== undefined) setPlayingHistoryIdx(historyIdx)
    if (vol !== undefined) a.volume = Math.max(0, Math.min(1, vol / 100))
    if (spd !== undefined) a.playbackRate = spd
    a.onended = () => {
      playingAudioRef.current = null
      setPlayingVoiceId('')
      setPlayingHistoryIdx(null)
    }
    a.play().catch((err: any) => {
      stopAudio()
      modal.toast(`播放失败: ${err?.message || '未知错误'}`, 'error')
    })
  }

  const doTTS = async () => {
    if (!ttsInputText.trim()) return
    setTtsGenerating(true)
    try {
      // Prefer clonedVoices (has latest volume/speed from sliders)
      const selectedVoice = clonedVoices.find(v => v.id === voiceId) || ttsVoices.find(v => v.id === voiceId)
      // Auto-detect model from voice_id prefix (same logic as backend preview)
      const _knownModels = ['cosyvoice-v3-flash', 'cosyvoice-v3-plus', 'cosyvoice-v3.5-plus']
      const _vid = selectedVoice?.voice_id || selectedVoice?.id || ''
      let _model = cloneModel
      for (const m of _knownModels) {
        if (_vid.startsWith(m)) { _model = m; break }
      }
      const sourceLabels: Record<string, string> = { doc: '文档演讲', analysis: '分析演讲', comprehensive: '综合演讲', blank: '白板编辑' }
      const sourceLabel = sourceLabels[ttsSourceTab] || '演讲'
      const result: any = await api.ttsSynthesize(
        ttsInputText, _model,
        selectedVoice?.voice_id,
        selectedVoice?.volume ?? ttsVolume, selectedVoice?.speed ?? ttsSpeed,
        id, ttsProviderId || undefined,
        selectedVoice?.name,
        sourceLabel,
      )
      setTtsAudioUrl(result.audio_url)
      const url = result.audio_url || '/api/audio/' + encodeURIComponent(result.filename || '')
      const ttsFilename = result.filename || result.audio_name || 'tts.mp3'
      // Reload from API to get full data
      loadTtsHistory()
      setGenFiles(prev => [...prev, {
        name: ttsFilename, type: 'MP3',
        source: sourceLabel,
        url,
      }])
    } catch (e: any) { modal.toast('TTS失败: ' + e.message, 'error') }
    finally { setTtsGenerating(false) }
  }

  // ── Split & Segmented Synthesis ──
  const doSplit = async () => {
    if (!ttsInputText.trim()) return
    try {
      const res: any = await api.ttsSplit(ttsInputText, splitMaxChunk, splitMode)
      setSplitSegments(res.segments.map((s: any) => ({ index: s.index, text: s.text })))
      setSelectedSegments(new Set())
      setTtsEditorTab('split')
    } catch (e: any) { modal.toast('分割失败: ' + (e?.message || '未知错误'), 'error') }
  }

  const synthesizeSegment = async (segIndex: number) => {
    const seg = splitSegments.find(s => s.index === segIndex)
    if (!seg) return
    setSplitGenerating(true)
    try {
      // Prefer clonedVoices (has latest volume/speed from sliders)
      const selectedVoice = clonedVoices.find(v => v.id === voiceId) || ttsVoices.find(v => v.id === voiceId)
      const _knownModels = ['cosyvoice-v3-flash', 'cosyvoice-v3-plus', 'cosyvoice-v3.5-plus']
      const _vid = selectedVoice?.voice_id || selectedVoice?.id || ''
      let _model = cloneModel
      for (const m of _knownModels) { if (_vid.startsWith(m)) { _model = m; break } }
      const result: any = await api.ttsSynthesize(
        seg.text, _model,
        selectedVoice?.voice_id,
        selectedVoice?.volume ?? ttsVolume, selectedVoice?.speed ?? ttsSpeed,
        id, ttsProviderId || undefined,
        selectedVoice?.name,
        '分割段落',
      )
      setSplitSegments(prev => prev.map(s => s.index === segIndex ? { ...s, audioUrl: result.audio_url } : s))
      loadTtsHistory()
      modal.toast(`段${segIndex} 合成完成`, 'success')
    } catch (e: any) { modal.toast(`段${segIndex} 合成失败: ` + (e?.message || '未知错误'), 'error') }
    finally { setSplitGenerating(false) }
  }

  const synthesizeSelected = async () => {
    if (selectedSegments.size === 0) return
    const sorted = [...selectedSegments].sort((a, b) => a - b)
    for (const idx of sorted) {
      await synthesizeSegment(idx)
    }
  }

  const addSegment = () => {
    const newIndex = splitSegments.length > 0 ? Math.max(...splitSegments.map(s => s.index)) + 1 : 1
    setSplitSegments(prev => [...prev, { index: newIndex, text: '' }])
  }

  const moveSegmentUp = (idx: number) => {
    setSplitSegments(prev => {
      const i = prev.findIndex(s => s.index === idx)
      if (i <= 0) return prev
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next
    })
  }

  const moveSegmentDown = (idx: number) => {
    setSplitSegments(prev => {
      const i = prev.findIndex(s => s.index === idx)
      if (i < 0 || i >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      return next
    })
  }

  const removeSegment = (idx: number) => {
    setSplitSegments(prev => prev.filter(s => s.index !== idx))
    setSelectedSegments(prev => { const n = new Set(prev); n.delete(idx); return n })
  }

  // ── Voice Clone ──
  const loadClonedVoices = () => {
    api.listClonedVoices(ttsProviderId || undefined).then(setClonedVoices).catch(() => {})
  }

  const loadTtsHistory = () => {
    if (id) {
      api.listTtsHistory(id).then((data: any) => {
        const newHistory = data.map((r: any) => ({
          id: r.id,
          voice: r.voice_name || '默认音色',
          audioUrl: `/api/audio/${r.audio_path}${r.project_id ? `?project_id=${r.project_id}` : ''}`,
          audioPath: r.audio_path,
          filename: r.name || '演讲.mp3',
          time: new Date(r.created_at + 'Z').toLocaleString('zh-CN'),
        }))
        setTtsHistory(newHistory)
        const validPaths = new Set(newHistory.map((h: any) => h.audioUrl.split('?')[0].split('/').pop()))
        setSplitSegments(prev => prev.map(s => {
          if (s.audioUrl) {
            const segFile = s.audioUrl.split('?')[0].split('/').pop()
            if (!validPaths.has(segFile)) {
              return { ...s, audioUrl: undefined }
            }
          }
          return s
        }))
      }).catch(() => {})
    }
  }

  useEffect(() => {
    if (ttsProviderId) loadClonedVoices()
  }, [ttsProviderId])

  useEffect(() => {
    loadTtsHistory()
  }, [id])

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        modal.toast('当前浏览器不支持录音功能，请使用 Chrome 或 Edge', 'error')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recStreamRef.current = stream
      setRecPos({ x: 0, y: 0 })
      setRecording(true)
      setRecordingStarted(false)
      setRecTime(0)
      recTimeRef.current = 0
    } catch (e: any) {
      modal.toast('录音失败: ' + (e.message || '无法访问麦克风'), 'error')
    }
  }

  const startCountdown = () => {
    setCountdown(3)
    let n = 3
    const iv = setInterval(() => {
      n--
      if (n <= 0) {
        clearInterval(iv)
        setCountdown(0)
        beginRecording()
      } else {
        setCountdown(n)
      }
    }, 600)
  }

  const beginRecording = () => {
    const stream = recStreamRef.current!
    // Real-time waveform analyser
    const ctx = new AudioContext()
    audioCtxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 64
    source.connect(analyser)
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    const animate = () => {
      analyser.getByteFrequencyData(dataArray)
      const bars = Array.from(dataArray.slice(0, 16)).map(v => Math.max(3, Math.round(v / 8)))
      setWaveData(bars)
      animFrameRef.current = requestAnimationFrame(animate)
    }
    animate()

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : ''
    const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    mediaRecorderRef.current = mr
    const chunks: BlobPart[] = []
    mr.ondataavailable = e => chunks.push(e.data)
    mr.onstop = async () => {
      const blob = new Blob(chunks, { type: mimeType || 'audio/webm' })
      stream.getTracks().forEach(t => t.stop())
      // Decode, trim last 300ms to remove click, re-encode as WAV
      try {
        const arrayBuf = await blob.arrayBuffer()
        const audioCtx = new AudioContext()
        const audioBuf = await audioCtx.decodeAudioData(arrayBuf)
        const sampleRate = audioBuf.sampleRate
        const trimSamples = Math.round(sampleRate * 0.3) // trim 300ms
        const keepSamples = Math.max(0, audioBuf.length - trimSamples)
        const trimmed = audioCtx.createBuffer(audioBuf.numberOfChannels, keepSamples, sampleRate)
        for (let ch = 0; ch < audioBuf.numberOfChannels; ch++) {
          trimmed.copyToChannel(audioBuf.getChannelData(ch).subarray(0, keepSamples), ch)
        }
        // AudioBuffer → WAV
        const wavBlob = audioBufferToWav(trimmed)
        const file = new File([wavBlob], 'recording.wav', { type: 'audio/wav' })
        recFileRef.current = file
        setCloneFile(file)
        const url = URL.createObjectURL(wavBlob)
        setRecPreviewUrl(url)
        audioCtx.close()
      } catch {
        // Fallback: use original blob if decoding fails
        const file = new File([blob], 'recording.webm', { type: mimeType || 'audio/webm' })
        recFileRef.current = file
        setCloneFile(file)
        const url = URL.createObjectURL(blob)
        setRecPreviewUrl(url)
      }
      setRecordingDone(true)
      setRecTooShort(recTimeRef.current < 3)
    }
    mr.start()
    setRecordingStarted(true)
    setRecTime(0)
    recTimeRef.current = 0
    recTimerRef.current = setInterval(() => { setRecTime(t => t + 1); recTimeRef.current++ }, 1000)
  }

  const stopRecording = () => {
    setRecordingStarted(false)
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
    mediaRecorderRef.current?.stop()
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    recStreamRef.current = null
  }

  const confirmClone = () => {
    setRecording(false)
    setRecordingDone(false)
    setNameInput(cloneName)
    setShowNameDialog(true)
  }

  const cancelRecording = () => {
    recStreamRef.current?.getTracks().forEach(t => t.stop())
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    if (recPreviewUrl) { URL.revokeObjectURL(recPreviewUrl); setRecPreviewUrl('') }
    setRecording(false)
    setRecordingStarted(false)
    setRecordingDone(false)
    recStreamRef.current = null
    recFileRef.current = null
    setCloneFile(null)
  }

  const doClone = async (name?: string) => {
    const voiceName = name || cloneName
    setCloning(true)
    try {
      if (cloneMode === 'design') {
        await api.designVoice(voiceName, cloneModel, voicePrompt, previewText, ttsProviderId || undefined)
      } else {
        const file = cloneFile || recFileRef.current
        if (!file) return
        await api.cloneVoice(voiceName, cloneModel, file, ttsProviderId || undefined)
        recFileRef.current = null
      }
      setCloneName(voiceName)
      loadClonedVoices()
      api.listVoices(ttsProviderId || undefined).then(setTtsVoices).catch(() => {})
      setCloneFile(null)
      modal.toast(cloneMode === 'design' ? '声音设计成功' : '声音克隆成功', 'success')
    } catch (e: any) {
      modal.toast((cloneMode === 'design' ? '声音设计' : '克隆') + '失败: ' + (e?.message || e), 'error')
    } finally {
      setCloning(false)
    }
  }

  // Generated files tracking
  const [genFiles, setGenFiles] = useState<{ name: string; type: string; source: string; url: string; size?: number }[]>([])
  const [filesLoaded, setFilesLoaded] = useState(false)
  const [stage5Search, setStage5Search] = useState('')
  const [stage5Selected, setStage5Selected] = useState<Set<string>>(new Set())
  const [stage5Expanded, setStage5Expanded] = useState<Set<string>>(new Set())

  // Load existing files from project folder on mount
  useEffect(() => {
    if (!id || filesLoaded) return
    api.getProjectFiles(id).then((data: any) => {
      const existing = (data.files || []).map((f: any) => ({
        name: f.filename,
        type: f.type,
        source: '项目文件',
        url: f.download_url,
        size: f.size,
      }))
      setGenFiles(prev => {
        const existingNames = new Set(existing.map((e: any) => e.name))
        const sessionOnly = prev.filter(p => !existingNames.has(p.name))
        return [...existing, ...sessionOnly]
      })
      setFilesLoaded(true)
    }).catch(() => {})
  }, [id, filesLoaded])

  // Auto-expand groups when genFiles changes
  useEffect(() => {
    const sources = [...new Set(genFiles.map(f => f.source))]
    setStage5Expanded(prev => {
      if (prev.size === 0 && sources.length > 0) return new Set(sources)
      return prev
    })
  }, [genFiles])

  // Global generation tracking — visible across all stages
  const isAnyS1 = Object.values(step1Generating).some(Boolean)
  const isAnyS2 = Object.values(step2Generating).some(Boolean)
  const isAnyS4 = Object.values(s4SpeechGenerating).some(Boolean)
  const isAnyOutlineLoading = Object.values(pptOutlineLoading).some(Boolean)
  const isGlobalGenerating = isAnyS1 || isAnyS2 || isAnyS4 || Object.keys(pptGenerating).length > 0 || ttsGenerating || isAnyOutlineLoading
  const globalGenLabel = Object.keys(pptGenerating).length > 0 ? 'PPT 合成中'
    : ttsGenerating ? '语音合成中'
    : isAnyS4 ? '演讲稿生成中'
    : isAnyOutlineLoading ? '大纲生成中'
    : isAnyS2 ? 'AI 生成文档中'
    : isAnyS1 ? '整理文档中'
    : '处理中'

  const stageDot = (s: StageId) => {
    const st = steps
    if (s === 1 && (st.step1_video || st.step1_text || st.step1_file)) return 'done'
    if (s === 2 && (st.step2_sop || st.step2_daoshuyi || st.step2_yanxi)) return 'done'
    if (s === 3 && (st.step3_sop_doc || st.step3_dao_ppt || st.step3_yan_ppt)) return 'done'
    if (s === 4 && (st.step4_speech_doc || st.step4_speech_analysis || st.step4_speech_comprehensive || st.step4_tts)) return 'done'
    if (s === 5 && genFiles.length > 0) return 'done'
    if (s === stage) return 'progress'
    return 'waiting'
  }

  if (!project) return <div className="pipeline-area"><div style={{ padding: 32 }}>加载中...</div></div>

  return (
    <div className="pipeline-area">
      {/* ═══ Project Header ═══ */}
      <div className="proj-header-bar">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/workspace/${workspaceIdRef.current}`)}>← 返回</button>
        {editName ? (
          <span style={{ display: 'flex', gap: 2, alignItems: 'center' }}
            onClick={e => e.stopPropagation()}>
            <input className="form-input" type="text"
              value={editNameValue}
              onChange={e => setEditNameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') { e.stopPropagation(); setEditName(false) }
                if (e.key === 'Enter') {
                  e.stopPropagation()
                  const v = editNameValue.trim()
                  setEditName(false)
                  if (v && id) {
                    api.updateProject(id, { name: v }).then(() => {
                      setProject(prev => prev ? { ...prev, name: v } : prev)
                    })
                  }
                }
              }}
              autoFocus
              style={{ width: 180, fontSize: 14, padding: '2px 6px', fontWeight: 600 }} />
            <button className="btn btn-ghost btn-sm"
              onClick={async () => {
                const v = editNameValue.trim()
                if (!v || !id) { setEditName(false); return }
                setEditName(false)
                await api.updateProject(id, { name: v })
                setProject(prev => prev ? { ...prev, name: v } : prev)
              }}
              style={{ fontSize: 11, padding: '2px 6px', color: 'var(--success)' }}>✓</button>
            <button className="btn btn-ghost btn-sm"
              onClick={() => setEditName(false)}
              style={{ fontSize: 11, padding: '2px 6px', color: 'var(--text-secondary)' }}>✕</button>
          </span>
        ) : (
          <span className="proj-header-name"
            style={{ cursor: 'text' }}
            onClick={() => {
              if (!readOnly && project) {
                setEditName(true)
                setEditNameValue(project.name)
              }
            }}
            title={readOnly ? '' : '点击编辑名称'}>{project?.name || '加载中...'}</span>
        )}
        <span className={`pc-status ${project?.status || 'draft'}`}
          style={{ cursor: readOnly ? 'default' : 'pointer' }}
          onClick={async () => {
            if (!id || readOnly) return
            const newStatus = (project?.status === 'completed') ? 'draft' : 'completed'
            await api.updateProject(id, { status: newStatus })
            setProject(prev => prev ? { ...prev, status: newStatus } : prev)
          }}>{project?.status === 'completed' ? '已完成' : '草稿'}</span>
        <CanEdit perm={canEditOwn}>
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
        </CanEdit>
        {(hdrCategories.length > 0 || (project as any)?.category_id) && (
          <select className="form-input" title="明细分类"
            value={(project as any)?.category_id || ''}
            disabled={readOnly}
            style={{ width: 'auto', fontSize: 11, padding: '3px 6px', marginLeft: 6 }}
            onChange={async e => {
              if (!id) return
              const v = e.target.value
              try {
                await api.updateProject(id, { category_id: v })
                setProject(prev => prev ? { ...prev, category_id: v } as any : prev)
                modal.toast('分类已保存', 'success')
              } catch (err: any) {
                modal.toast('保存失败: ' + err.message, 'error')
              }
            }}>
            <option value="">无分类</option>
            {hdrCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {(hdrAuthors.length > 0 || (project as any)?.author_id) && (
          <select className="form-input" title="出处作者"
            value={(project as any)?.author_id || ''}
            disabled={readOnly}
            style={{ width: 'auto', fontSize: 11, padding: '3px 6px', marginLeft: 4 }}
            onChange={async e => {
              if (!id) return
              const v = e.target.value
              try {
                await api.updateProject(id, { author_id: v })
                setProject(prev => prev ? { ...prev, author_id: v } as any : prev)
                modal.toast('作者已保存', 'success')
              } catch (err: any) {
                modal.toast('保存失败: ' + err.message, 'error')
              }
            }}>
            <option value="">无署名</option>
            {hdrAuthors.map(a => <option key={a.id} value={a.id}>✍ {a.name}</option>)}
          </select>
        )}
        {readOnly && (
          <span style={{ fontSize: 11, color: 'var(--warning)', marginLeft: 8, fontWeight: 600 }}>只读模式</span>
        )}
        {batchWarning && (
          <span style={{
            fontSize: 11, color: '#fff', marginLeft: 8, fontWeight: 600,
            background: 'var(--warning)', padding: '2px 10px', borderRadius: 4,
            animation: 'pulse 2s infinite',
          }}>
            ⚠ {batchWarning}
          </span>
        )}
        {isGlobalGenerating && (
          <span style={{
            marginLeft: 12, fontSize: 11, color: 'var(--primary)',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            animation: 'pulse 1.5s infinite',
          }}>
            <span style={{
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              background: 'var(--primary)', animation: 'blink 0.8s infinite',
            }} />
            ⏳ {globalGenLabel} (切换栏目不影响)
            {pptProgress && (
              <span style={{ fontWeight: 500, marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                {pptProgress.phase_label}
                {pptProgress.slides_total ? (
                  <span style={{ marginLeft: 6 }}>
                    <span style={{
                      display: 'inline-block', width: 120, height: 4, background: 'var(--border)',
                      borderRadius: 2, verticalAlign: 'middle', marginRight: 6, position: 'relative'
                    }}>
                      <span style={{
                        display: 'inline-block', width: `${Math.round((pptProgress.slides_done || 0) / pptProgress.slides_total * 100)}%`,
                        height: 4, background: 'var(--primary)', borderRadius: 2,
                        position: 'absolute', left: 0, top: 0, transition: 'width 0.3s'
                      }} />
                    </span>
                    {pptProgress.slides_done}/{pptProgress.slides_total} 页
                  </span>
                ) : ''}
                {pptProgress.message ? <span style={{ marginLeft: 6 }}>— {pptProgress.message}</span> : ''}
              </span>
            )}
            {docGenProgress && !pptProgress && (
              <span style={{ fontWeight: 500, marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                {docGenProgress.phase_label}
                {docGenProgress.message ? <span style={{ marginLeft: 6 }}>— {docGenProgress.message}</span> : ''}
              </span>
            )}
          </span>
        )}
      </div>

      {readOnly && (
        <div style={{
          background: 'linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%)',
          border: '1px solid #f0ad4e', borderRadius: 6,
          padding: '8px 16px', marginBottom: 8,
          fontSize: 12, color: '#856404', textAlign: 'center',
        }}>
          只读模式 — 您只能查看和下载已生成的内容，无法创建、编辑或删除。
        </div>
      )}

      {/* ═══ Top Nav ═══ */}
      <div className="top-nav">
        {visibleStages.filter(s => s.id <= 3).map((s, i) => (
          <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span className="tn-arrow">→</span>}
            <div className={`tn-item${stage === s.id ? ' active' : ''}`}
              onClick={() => switchStage(s.id)}>
              <span className="tn-num">{s.id}</span> {s.label}
              <span className={`tn-dot ${stageDot(s.id)}`} />
            </div>
          </span>
        ))}
        {visibleStages.some(s => s.id >= 4) && (
          <span style={{ borderLeft: '1px solid var(--border)', height: 20, margin: '0 6px', alignSelf: 'center' }} />
        )}
        {visibleStages.filter(s => s.id >= 4).map((s, i) => (
          <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span className="tn-arrow">→</span>}
            <div className={`tn-item${stage === s.id ? ' active' : ''}`}
              onClick={() => switchStage(s.id)}>
              <span className="tn-num">{s.id}</span> {s.label}
              <span className={`tn-dot ${stageDot(s.id)}`} />
            </div>
          </span>
        ))}
        <span style={{ flex: 1 }} />
      </div>

      {/* ═══ Sub Nav ═══ */}
      {STAGES.find(s => s.id === stage)?.subs.length ? (
        <div className="sub-nav">
          {STAGES.find(s => s.id === stage)!.subs.map((sn, i) => {
            const busy = (() => {
              switch (sn.id) {
                case '1a': case '1b': case '1c': return !!step1Generating[sn.id]
                case '2a': case '2b': case '2c': return !!step2Generating[sn.id]
                case '3a': return !!(pptOutlineLoading['step3_sop_doc'] || pptGenerating['step3_sop_doc'])
                case '3b': return !!(pptOutlineLoading['step3_dao_ppt'] || pptGenerating['step3_dao_ppt'])
                case '3c': return !!(pptOutlineLoading['step3_yan_ppt'] || pptGenerating['step3_yan_ppt'])
                case '4a': return Object.values(s4SpeechGenerating).some(Boolean)
                case '4b': return ttsGenerating
                default: return false
              }
            })()
            return (
              <span key={sn.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {i > 0 && <span className="sn-sep">|</span>}
                <div className={`sn-item${sub === sn.id ? ' active' : ''}`}
                  onClick={() => setSub(sn.id)}>{sn.label}{busy && <span style={{ marginLeft: 4 }}>⏳</span>}</div>
              </span>
            )
          })}
        </div>
      ) : null}

      {/* ═══ Content ═══ */}
      <div className="content-area">
        {/* ====== STAGE 1: 文案提取 ====== */}
        {stage === 1 && (
          <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>📁 保存路径</span>
            <input className="form-input" style={{ fontSize: 11, flex: 1, padding: '4px 8px' }}
              value={projStoragePath}
              onChange={e => setProjStoragePath(e.target.value)}
              placeholder={project?.storage_path || `D:\\YISHAOAGENT\\data\\output\\${project?.name || ''}`} />
            <button className="btn btn-ghost btn-sm" title="打开文件夹" style={{ whiteSpace: 'nowrap', fontSize: 11 }}
              onClick={async () => {
                const p = (projStoragePath || project?.storage_path || '').replace(/\\/g, '/')
                if (p) { try { await api.openFolder(p) } catch { modal.toast('无法打开文件夹', 'error') } }
              }}>📂</button>
            <button className="btn btn-sm" style={{ whiteSpace: 'nowrap', fontSize: 11, padding: '4px 10px', background: 'var(--primary)', color: '#fff' }}
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
              }}>{savingPath ? '...' : '保存'}</button>
          </div>
          <div className="panel-grid">
            <div className="panel-left">
              {/* Shared model selector */}
              <div className="card">
                <div className="card-title">🤖 模型选择</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select className="form-select" style={{ flex: 1 }}
                    value={step1Model}
                    onChange={e => {
                      const val = e.target.value
                      setStep1Models(prev => ({ ...prev, [mode1Key]: val }))
                      saveStep(`_model_s1_${mode1Key}`, val)
                    }}>
                    <option value="">选择模型...</option>
                    {llmProviders.filter(p => p.is_enabled).map(p =>
                      (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                        <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                      ))
                    )}
                  </select>
                  <TemperatureInput value={s1Temperature} onChange={v => { setS1Temperatures(prev => ({ ...prev, [mode1Key]: v })); saveStep(`_temp_s1_${mode1Key}`, String(v)) }} id="temp-s1" />
                </div>
              </div>

              {/* 1a: Video Link */}
              {mode1 === 'link' && <>
                <div className="card">
                  <div className="card-title">📺 视频提取<HelpButton location="project-stage-1a" /></div>
                  <div className="card-hint">粘贴视频链接或上传本地文件 → 下载 + 语音识别 → 提取内容在下方编辑</div>
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
                  <div style={{ display: 'flex', gap: 6 }}>
                  <CanEdit perm={canGenerate1}>
                  <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                    onClick={handleVideoDownload} disabled={dlStatus === 'downloading'}>
                    ▶ 下载并识别
                  </button>
                  </CanEdit>
                  <CanEdit perm={canGenerate1}>
                  <input ref={videoFileRef} type="file" accept=".mp4,.mkv,.webm,.avi,.mov,.flv" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f); e.target.value = '' }} />
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}
                    disabled={dlStatus === 'downloading'}
                    onClick={() => videoFileRef.current?.click()}>
                    📁 上传视频
                  </button>
                  </CanEdit>
                  </div>
                  <div style={{ minHeight: 24, display: 'flex', alignItems: 'center' }}>
                    {(dlStatus && dlStatus !== 'done' && dlStatus !== 'failed' && !dlStatus.startsWith('error')) && (
                      <div style={{ width: '100%' }}>
                        <div style={{ fontSize: 11, color: 'var(--primary)', marginBottom: 2 }}>⏳ {dlMessage || '正在处理...'} {dlPercent}%</div>
                        <div style={{ background: 'var(--border)', height: 4, borderRadius: 2 }}>
                          <div style={{ width: Math.max(dlPercent, 2) + '%', height: '100%', background: 'var(--primary)', borderRadius: 2, transition: 'width .3s' }} />
                        </div>
                      </div>
                    )}
                    {dlStatus === 'done' && <span style={{ fontSize: 11, color: 'var(--success)' }}>✅ 处理完成</span>}
                    {dlStatus === 'failed' && <span style={{ fontSize: 11, color: 'var(--warning)' }}>❌ 下载失败</span>}
                    {dlStatus.startsWith('error') && <span style={{ fontSize: 11, color: 'var(--warning)' }}>{dlStatus}</span>}
                  </div>
                  <button className="btn btn-ghost btn-sm w-full"
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
                  <CanEdit perm={canGenerate1}>
                  <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 6 }}
                    disabled={step1Generating['1a'] || !step1Model || !videoText.trim()}
                    onClick={doGenerateStep1}>
                    {step1Generating['1a'] ? '⏳ 生成中...' : '⚙ 整理文档'}
                  </button>
                  </CanEdit>
                  {step1Generating['1a'] && (
                    <button className="btn btn-sm" style={{ marginTop: 4, background: 'var(--warning)', color: '#fff', width: '100%' }}
                      onClick={() => { abortRef.current['step1_1a']?.abort(); modal.toast('已取消生成', 'success') }}>取消</button>
                  )}
                </div>
                {videoText && (
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
                      value={videoText} readOnly={readOnly}
                      onChange={e => setVideoText(e.target.value)}
                      placeholder="视频字幕将显示在此..." />
                    <CanEdit perm={canGenerate1}>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setVideoText('')}>🗑 清空</button>
                      <button className={`btn btn-primary btn-sm ${getSaveBtnClass(videoText, 'video_text')}`}
                        onClick={() => { if (id) { saveStep('video_text', videoText); saveStep('raw_video', videoText); flashSave() } }}>{getSaveBtnLabel(videoText, 'video_text')}</button>
                    </div>
                    </CanEdit>
                  </div>
                )}
              </>}

              {/* 1b: Text Input */}
              {mode1 === 'text' && (<>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div className="card-title">✏️ 文字输入<HelpButton location="project-stage-1b" /></div>
                  <div className="card-hint">直接粘贴或输入内容，可编辑后重新生成</div>
                  <textarea className="form-textarea" style={{ flex: 1, minHeight: 280 }}
                    placeholder="在此粘贴或输入内容..."
                    value={textInput} readOnly={readOnly} onChange={e => setTextInput(e.target.value)} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                    <CanEdit>
                      <button className="btn btn-ghost btn-sm" onClick={() => setTextInput('')}>🗑 清空</button>
                      <button className={`btn btn-primary btn-sm ${getSaveBtnClass(textInput, 'raw_text')}`}
                        onClick={() => { if (id) { saveStep('raw_text', textInput); flashSave() } }}>{getSaveBtnLabel(textInput, 'raw_text')}</button>
                    </CanEdit>
                    <CanEdit perm={canGenerate1}>
                    <button className="btn btn-primary btn-sm"
                      disabled={step1Generating['1b'] || !step1Model || !textInput.trim()}
                      onClick={doGenerateStep1}>
                      {step1Generating['1b'] ? '⏳ 生成中...' : '⚙ 整理文档'}
                    </button>
                    </CanEdit>
                    {step1Generating['1b'] && (
                      <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#fff' }}
                        onClick={() => { abortRef.current['step1_1b']?.abort(); modal.toast('已取消生成', 'success') }}>取消</button>
                    )}
                  </div>
                </div>
              </>)}

              {/* 1c: File Upload */}
              {mode1 === 'file' && <>
                <div className="card">
                  <div className="card-title">📄 文件提取<HelpButton location="project-stage-1c" /></div>
                  <div className="card-hint">支持 .txt / .md / .docx 文件，读取后内容在下方编辑</div>
                  <input type="file" accept=".txt,.md,.docx" style={{ fontSize: 10, marginBottom: 6 }}
                    disabled={readOnly}
                    onChange={async e => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      let text = ''
                      if (f.name.toLowerCase().endsWith('.docx')) {
                        const res = await api.uploadMaterial(id!, f)
                        text = res.parse_result?.text || ''
                      } else {
                        text = await f.text()
                      }
                      setFileText(text)
                      if (id && text) {
                        api.saveStep(id, 'raw_file', text)
                        setSteps(prev => ({ ...prev, raw_file: text }))
                        setSavedSteps(prev => ({ ...prev, raw_file: text }))
                      }
                    }} />
                  <CanEdit perm={canGenerate1}>
                  <button className="btn btn-primary btn-sm w-full"
                    disabled={step1Generating['1c'] || !step1Model || !fileText.trim()}
                    onClick={doGenerateStep1}>
                    {step1Generating['1c'] ? '⏳ 生成中...' : '⚙ 整理文档'}
                  </button>
                  </CanEdit>
                  {step1Generating['1c'] && (
                    <button className="btn btn-sm" style={{ marginTop: 4, background: 'var(--warning)', color: '#fff', width: '100%' }}
                      onClick={() => { abortRef.current['step1_1c']?.abort(); modal.toast('已取消生成', 'success') }}>取消</button>
                  )}
                </div>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div className="card-title">📝 文件原始内容</div>
                  <div className="card-hint">文件读取的原始内容，可编辑后重新生成</div>
                  <textarea className="form-textarea" style={{ flex: 1, minHeight: 120 }}
                    value={fileText} readOnly={readOnly}
                    onChange={e => setFileText(e.target.value)}
                    placeholder="文件内容将显示在此..." />
                  <CanEdit perm={canGenerate1}>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setFileText('')}>🗑 清空</button>
                    <button className={`btn btn-primary btn-sm ${getSaveBtnClass(fileText, 'raw_file')}`}
                      onClick={() => { if (id) { saveStep('raw_file', fileText); flashSave() } }}>{getSaveBtnLabel(fileText, 'raw_file')}</button>
                  </div>
                  </CanEdit>
                </div>
              </>}

              {/* Document generation log — same style as PPT log */}
              {docGenLog.length > 0 && (
                <div style={{ maxHeight: 180, overflowY: 'auto', background: 'var(--bg)', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 11, lineHeight: '18px', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', marginTop: 8 }}>
                  {docGenLog.slice(-6).map((entry, i) => (
                    <div key={i} style={{ marginBottom: 2 }}>
                      <span style={{ color: '#888' }}>[{entry.time}]</span> {entry.message}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Tab switcher */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 6, borderBottom: '1px solid var(--border)' }}>
                  <button onClick={() => setS1View('edit')} style={{
                    padding: '5px 14px', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', borderRadius: 0,
                    color: s1View === 'edit' ? 'var(--primary)' : 'var(--text-secondary)',
                    borderBottom: s1View === 'edit' ? '2px solid var(--primary)' : '2px solid transparent',
                    fontWeight: s1View === 'edit' ? 600 : 400,
                  }}>✏️ 编辑</button>
                  <button onClick={() => setS1View('preview')} style={{
                    padding: '5px 14px', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', borderRadius: 0,
                    color: s1View === 'preview' ? 'var(--primary)' : 'var(--text-secondary)',
                    borderBottom: s1View === 'preview' ? '2px solid var(--primary)' : '2px solid transparent',
                    fontWeight: s1View === 'preview' ? 600 : 400,
                  }}>👁 预览</button>
                  {s1View === 'preview' && s1Content && (
                    <>
                      <button onClick={handleS1DownloadHtml} style={{
                        marginLeft: 'auto', padding: '5px 12px', fontSize: 11, cursor: 'pointer',
                        background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4,
                      }}>📥 下载 HTML</button>
                      <button onClick={handleS1Print} style={{
                        marginLeft: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer',
                        background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4,
                      }}>🖨 打印</button>
                    </>
                  )}
                </div>
                {s1View === 'edit' ? (
                  <textarea className="form-textarea" style={{ flex: 1, minHeight: 280 }}
                    value={s1Content} readOnly={readOnly}
                    onChange={e => { setSteps(prev => ({ ...prev, [step1Key()]: e.target.value })) }}
                    placeholder="点击左侧「生成」按钮，AI 整理后的标准文档将显示在此..." />
                ) : (
                  <div style={{
                    flex: 1, minHeight: 280, overflow: 'auto',
                    background: '#fff', borderRadius: 6, padding: '16px 20px',
                    border: '1px solid var(--border)',
                  }}>
                    <style>{PREVIEW_CSS}</style>
                    {s1Content ? (
                      <div className="md-preview" dangerouslySetInnerHTML={{ __html: s1RenderedHtml }} />
                    ) : (
                      <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: 40 }}>
                        暂无内容，请先生成文档
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {mode1 === 'link' ? '来源：视频提取' : mode1 === 'text' ? '来源：文字输入' : '来源：文件提取'}
                  </span>
                  <span style={{ display: 'flex', gap: 5 }}>
                    <button className="btn btn-ghost btn-sm"
                      disabled={!steps[step1Key()]}
                      onClick={async () => {
                        if (!id) return
                        try {
                          const label = sub === '1a' ? '视频提取' : sub === '1b' ? '文字输入' : '文件提取'
                          const resp = await api.saveFileToProject(id, `${project?.name || '文档'}_${label}_AI整理.txt`, steps[step1Key()] || '')
                          modal.toast(`已保存到 ${resp.path}`, 'success')
                        } catch (e: any) {
                          modal.toast('保存失败: ' + e.message, 'error')
                        }
                      }}>📥 保存到项目</button>
                    <CanEdit perm={canGenerate2}>
                    <button className="btn btn-outline btn-sm"
                      disabled={!!Object.values(step2Generating).some(Boolean) || !steps[step1Key()]}
                      onClick={doBatchGenerate}>
                      {Object.values(step2Generating).some(Boolean) ? '⏳ 生成中...' : '⚡ 生成所有文案'}
                    </button>
                    </CanEdit>
                    {Object.values(step2Generating).some(Boolean) && (
                      <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#fff' }}
                        onClick={() => { abortRef.current['step2_batch']?.abort(); modal.toast('已取消生成', 'success') }}>取消</button>
                    )}
                    <CanEdit perm={canGenerate2}>
                    <button className={`btn btn-primary btn-sm ${getSaveBtnClass(steps[step1Key()] || '', step1Key())}`}
                      disabled={!steps[step1Key()]}
                      onClick={() => { saveStep(step1Key(), steps[step1Key()] || ''); flashSave() }}>{getSaveBtnLabel(steps[step1Key()] || '', step1Key())}</button>
                    <button className="btn btn-ghost btn-sm"
                      disabled={!steps[step1Key()]}
                      onClick={() => { setSteps(prev => ({ ...prev, [step1Key()]: '' })); saveStep(step1Key(), '') }}>✕ 清空</button>
                    </CanEdit>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>)}

        {/* ====== STAGE 2: 教学文档 ====== */}
        {stage === 2 && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                <div style={{ display: sub === '2a' ? 'contents' : 'none' }}>
                  <Stage2Controls docType="sop" label="标准文档" readOnly={readOnly}
                    steps={steps} llmProviders={llmProviders}
                    dataSource={s2DataSources['sop'] || 'video'} onDataSourceChange={(v) => handleS2DataSourceChange('sop', v)}
                    generating={!!step2Generating['2a']}
                    prompt={stage2Prompts.sop?.prompt || ''}
                    skill={stage2Prompts.sop?.skill || ''}
                    projectId={id!}
                    panelRef={sopRef}
                    setGenerating={(v) => setStep2Generating(prev => ({ ...prev, '2a': v }))}
                    logEntries={s2Logs['2a'] || []}
                    progress={s2Progress['2a'] || ''}
                    onRefresh={() => {
                      return api.getSteps(id!).then((s: any[]) => {
                        const map: Record<string, string> = {}
                        s.forEach((x: any) => { map[x.step_name] = x.content })
                        setSteps(prev => ({ ...prev, ...map }))
                        setSavedSteps(prev => ({ ...prev, ...map }))
                      })
                    }} />
                </div>
                <div style={{ display: sub === '2b' ? 'contents' : 'none' }}>
                  <Stage2Controls docType="dao" label="分析文档" readOnly={readOnly}
                    steps={steps} llmProviders={llmProviders}
                    dataSource={s2DataSources['dao'] || 'video'} onDataSourceChange={(v) => handleS2DataSourceChange('dao', v)}
                    generating={!!step2Generating['2b']}
                    prompt={stage2Prompts.dao?.prompt || ''}
                    skill={stage2Prompts.dao?.skill || ''}
                    projectId={id!}
                    panelRef={daoRef}
                    setGenerating={(v) => setStep2Generating(prev => ({ ...prev, '2b': v }))}
                    logEntries={s2Logs['2b'] || []}
                    progress={s2Progress['2b'] || ''}
                    onRefresh={() => {
                      return api.getSteps(id!).then((s: any[]) => {
                        const map: Record<string, string> = {}
                        s.forEach((x: any) => { map[x.step_name] = x.content })
                        setSteps(prev => ({ ...prev, ...map }))
                        setSavedSteps(prev => ({ ...prev, ...map }))
                      })
                    }} />
                </div>
                <div style={{ display: sub === '2c' ? 'contents' : 'none' }}>
                  <Stage2Controls docType="yanxi" label="综合文档" readOnly={readOnly}
                    steps={steps} llmProviders={llmProviders}
                    dataSource={s2DataSources['yanxi'] || 'video'} onDataSourceChange={(v) => handleS2DataSourceChange('yanxi', v)}
                    generating={!!step2Generating['2c']}
                    prompt={stage2Prompts.yanxi?.prompt || ''}
                    skill={stage2Prompts.yanxi?.skill || ''}
                    projectId={id!}
                    panelRef={yanxiRef}
                    setGenerating={(v) => setStep2Generating(prev => ({ ...prev, '2c': v }))}
                    logEntries={s2Logs['2c'] || []}
                    progress={s2Progress['2c'] || ''}
                    onRefresh={() => {
                      return api.getSteps(id!).then((s: any[]) => {
                        const map: Record<string, string> = {}
                        s.forEach((x: any) => { map[x.step_name] = x.content })
                        setSteps(prev => ({ ...prev, ...map }))
                        setSavedSteps(prev => ({ ...prev, ...map }))
                      })
                    }} />
                </div>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: sub === '2a' ? 'contents' : 'none' }}>
                  <TeachingDocPanel ref={sopRef} docType="sop" projectId={id!}
                    projectName={project?.name || ''}
                    steps={steps} savedSteps={savedSteps}
                    prompt={stage2Prompts.sop?.prompt || ''}
                    skill={stage2Prompts.sop?.skill || ''}
                    llmProviders={llmProviders}
                    onGeneratingChange={(g) => { setStep2Generating(prev => ({ ...prev, '2a': g })); if (g) { setS2Logs(prev => ({ ...prev, '2a': [] })); setS2Progress(prev => ({ ...prev, '2a': '' })) } }}
                    onLogEntry={(entry) => setS2Logs(prev => ({ ...prev, '2a': [...(prev['2a'] || []), entry] }))}
                    onProgressChange={(p) => { setS2Progress(prev => ({ ...prev, '2a': p })); setDocGenProgress({ phase_label: '正在生成 标准文档', message: p.replace(/^[^-]+—\s*/, ''), stepKey: 'step2_sop' }) }}
                    hideControls dataSource={s2DataSources['sop'] || 'video'}
                    onRefresh={() => {
                      return api.getSteps(id!).then((s: any[]) => {
                        const map: Record<string, string> = {}
                        s.forEach((x: any) => { map[x.step_name] = x.content })
                        setSteps(prev => ({ ...prev, ...map }))
                        setSavedSteps(prev => ({ ...prev, ...map }))
                      })
                    }} />
                </div>
                <div style={{ display: sub === '2b' ? 'contents' : 'none' }}>
                  <TeachingDocPanel ref={daoRef} docType="dao" projectId={id!}
                    projectName={project?.name || ''}
                    steps={steps} savedSteps={savedSteps}
                    prompt={stage2Prompts.dao?.prompt || ''}
                    skill={stage2Prompts.dao?.skill || ''}
                    llmProviders={llmProviders}
                    onGeneratingChange={(g) => { setStep2Generating(prev => ({ ...prev, '2b': g })); if (g) { setS2Logs(prev => ({ ...prev, '2b': [] })); setS2Progress(prev => ({ ...prev, '2b': '' })) } }}
                    onLogEntry={(entry) => setS2Logs(prev => ({ ...prev, '2b': [...(prev['2b'] || []), entry] }))}
                    onProgressChange={(p) => { setS2Progress(prev => ({ ...prev, '2b': p })); setDocGenProgress({ phase_label: '正在生成 分析文档', message: p.replace(/^[^-]+—\s*/, ''), stepKey: 'step2_daoshuyi' }) }}
                    hideControls dataSource={s2DataSources['dao'] || 'video'}
                    onRefresh={() => {
                      return api.getSteps(id!).then((s: any[]) => {
                        const map: Record<string, string> = {}
                        s.forEach((x: any) => { map[x.step_name] = x.content })
                        setSteps(prev => ({ ...prev, ...map }))
                        setSavedSteps(prev => ({ ...prev, ...map }))
                      })
                    }} />
                </div>
                <div style={{ display: sub === '2c' ? 'contents' : 'none' }}>
                  <TeachingDocPanel ref={yanxiRef} docType="yanxi" projectId={id!}
                    projectName={project?.name || ''}
                    steps={steps} savedSteps={savedSteps}
                    prompt={stage2Prompts.yanxi?.prompt || ''}
                    skill={stage2Prompts.yanxi?.skill || ''}
                    llmProviders={llmProviders}
                    onGeneratingChange={(g) => { setStep2Generating(prev => ({ ...prev, '2c': g })); if (g) { setS2Logs(prev => ({ ...prev, '2c': [] })); setS2Progress(prev => ({ ...prev, '2c': '' })) } }}
                    onLogEntry={(entry) => setS2Logs(prev => ({ ...prev, '2c': [...(prev['2c'] || []), entry] }))}
                    onProgressChange={(p) => { setS2Progress(prev => ({ ...prev, '2c': p })); setDocGenProgress({ phase_label: '正在生成 综合文档', message: p.replace(/^[^-]+—\s*/, ''), stepKey: 'step2_yanxi' }) }}
                    hideControls dataSource={s2DataSources['yanxi'] || 'video'}
                    onRefresh={() => {
                      return api.getSteps(id!).then((s: any[]) => {
                        const map: Record<string, string> = {}
                        s.forEach((x: any) => { map[x.step_name] = x.content })
                        setSteps(prev => ({ ...prev, ...map }))
                        setSavedSteps(prev => ({ ...prev, ...map }))
                      })
                    }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== STAGE 3: 输出课件 ====== */}
        {stage === 3 && sub === '3a' && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card" style={{ overflow: 'hidden' }}>
                <div className="card-title">📄 生成课件<HelpButton location="project-stage-3a" /></div>
                <div className="card-hint">基于标准文档，选择模板生成课件</div>
                <div className="form-label">选择模板</div>
                <TemplateSelector items={sopTemplates} selectedId={sopSelected}
                  onSelect={t => { setSopSelected(t.id); saveStep('_tmpl_step3_sop', t.id) }} previewTarget="prev3" />
                {(pptColorSchemesByStage[step3Key()] || []).length > 1 && (
                  <div style={{ marginTop: 8, marginBottom: 8 }}>
                    <div className="form-label">配色方案</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(pptColorSchemesByStage[step3Key()] || []).map(cs => {
                        const key = step3Key()
                        const current = pptColorScheme[key] || 'deep-blue'
                        return (
                        <button key={cs.id}
                          onClick={() => { setPptColorScheme(prev => ({ ...prev, [key]: cs.id })); saveStep(`_color_scheme_${key}`, cs.id) }}
                          title={cs.label}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', fontSize: 11,
                            borderRadius: 6, border: current === cs.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                            background: current === cs.id ? 'var(--bg-hover)' : 'var(--bg)',
                            cursor: 'pointer',
                          }}>
                          <span style={{ width: 14, height: 14, borderRadius: '50%', background: cs.primary, display: 'inline-block', flexShrink: 0 }} />
                          {cs.label}
                        </button>
                      )})}
                    </div>
                  </div>
                )}
                <div className="form-label">大模型</div>
                <select className="form-select" style={{ marginBottom: 8 }} value={s3SopModel} onChange={e => { setS3SopModel(e.target.value); saveStep('_model_step3_sop', e.target.value) }}>
                  <option value="">选择模型...</option>
                  {llmProviders.filter(p => p.is_enabled).map(p =>
                    (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                      <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                    ))
                  )}
                </select>
                <button className="btn btn-ghost btn-sm" onClick={() => setS3SopTempOpen(true)}>⚙温度设置</button>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, userSelect: 'none', marginLeft: 8 }}>
                  <input type="checkbox" checked={forceRegenerate} onChange={(e) => setForceRegenerate(e.target.checked)} style={{ cursor: 'pointer' }} />
                  全新生成
                </label>
                <CanEdit perm={canGenerate3}>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-sm"
                    style={{ flex: 1 }}
                    disabled={!sopSelected || !(steps.step2_sop || '') || !s3SopModel || pptOutlineLoading['step3_sop_doc']}
                    onClick={() => doGenerateOutline('step3_sop_doc', steps.step2_sop || '', sopSelected, s3SopModel, 'col3', s3SopTemp, s3SopTemps.outline, s3SopTemps.keyword, s3SopTemps.research, s3SopTemps.fill, s3SopTemps.stageOutline, s3SopTemps.stageGeneration, s3SopTemps.stageReview)}>
                    {pptOutlineLoading['step3_sop_doc'] ? '⏳ 生成中...' : '📋 生成大纲'}
                  </button>
                  <button className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                    disabled={!sopSelected || !(steps.step2_sop || '') || !s3SopModel || !pptOutline['step3_sop_doc']?.outline_json?.length || pptOutlineLoading['step3_sop_doc'] || pptGenerating['step3_sop_doc']}
                    onClick={() => doGeneratePPT('step3_sop_doc',
                      steps.step2_sop || steps.step1_video || steps.step1_text || steps.step1_file || '',
                      sopSelected, '标准课件',
                      stage3Prompts.sop?.prompt || '请将内容转化为标准文档课件。',
                      s3SopModel, 'col3', s3SopTemps.sop,
                      s3SopTemps.keyword, s3SopTemps.research, s3SopTemps.outline, s3SopTemps.fill,
                      s3SopTemps.cards, s3SopTemps.html, s3SopTemps.svg_batch, s3SopTemps.svg_single,
                      s3SopTemps.review, s3SopTemps.fix, s3SopTemps.holistic, s3SopTemps.holistic_fix,
                      s3SopTemps.stageOutline, s3SopTemps.stageGeneration, s3SopTemps.stageReview,
                      forceRegenerate)}>
                    {pptGenerating['step3_sop_doc'] ? '⏳ 合成中...' : '📄 合成课件'}
                  </button>
                </div>
                </CanEdit>
                {(pptOutlineLoading['step3_sop_doc'] || pptGenerating['step3_sop_doc']) && (
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)', width: '100%', marginTop: 4 }}
                    onClick={() => handleCancelGenerate('step3_sop_doc')}>取消</button>
                )}
                {!sopSelected || !(steps.step2_sop || '') || !s3SopModel ? (
                  <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>
                    {[
                      !sopSelected ? '请选择模板' : '',
                      !(steps.step2_sop || '') ? '请先生成标准文档' : '',
                      !s3SopModel ? '请选择大模型' : '',
                    ].filter(Boolean).join(' | ')}
                  </div>
                ) : !pptOutline['step3_sop_doc']?.outline_json?.length ? (
                  <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>
                    请先生成大纲
                  </div>
                ) : null}
                {(pptLog.length > 0 || pptOutlineLoading['step3_sop_doc'] || pptGenerating['step3_sop_doc']) && (
                  <div ref={pptLogContainerRef} style={{ maxHeight: 180, minHeight: 0, overflowY: 'auto', background: 'var(--bg)', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 11, lineHeight: '18px', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', marginTop: 8 }}>
                    {pptLog.length === 0 ? (
                      <div style={{ color: '#888' }}>等待日志...</div>
                    ) : (
                      pptLog.map((entry, i) => (
                        <div key={i} style={{ marginBottom: 2 }}>
                          <span style={{ color: '#888' }}>[{entry.time}]</span> {entry.message}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', marginBottom: 8, flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 0 }}>
                    <button
                      style={{ padding: '5px 14px', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', borderRadius: 0,
                        color: (previewTab[step3Key()] || 'ppt') === 'ppt' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: (previewTab[step3Key()] || 'ppt') === 'ppt' ? '2px solid var(--primary)' : '2px solid transparent',
                        fontWeight: (previewTab[step3Key()] || 'ppt') === 'ppt' ? 600 : 400,
                      }}
                      onClick={() => setPreviewTab(prev => ({...prev, [step3Key()]: 'ppt'}))}>大纲内容</button>
                    <button
                      style={{ padding: '5px 14px', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', borderRadius: 0,
                        color: (previewTab[step3Key()] || 'ppt') === 'json' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: (previewTab[step3Key()] || 'ppt') === 'json' ? '2px solid var(--primary)' : '2px solid transparent',
                        fontWeight: (previewTab[step3Key()] || 'ppt') === 'json' ? 600 : 400,
                      }}
                      onClick={() => setPreviewTab(prev => ({...prev, [step3Key()]: 'json'}))}>JSON</button>
                    <button
                      style={{ padding: '5px 14px', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', borderRadius: 0,
                        color: (previewTab[step3Key()] || 'ppt') === 'preview' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: (previewTab[step3Key()] || 'ppt') === 'preview' ? '2px solid var(--primary)' : '2px solid transparent',
                        fontWeight: (previewTab[step3Key()] || 'ppt') === 'preview' ? 600 : 400,
                      }}
                      onClick={() => setPreviewTab(prev => ({...prev, [step3Key()]: 'preview'}))}>预览</button>
                  </div>
                  {(previewTab[step3Key()] || 'ppt') === 'preview' && s3OutlineText && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button onClick={handleS3DownloadHtml} style={{
                        padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                        background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4,
                      }}>📥 下载 HTML</button>
                      <button onClick={handleS3Print} style={{
                        padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                        background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4,
                      }}>🖨 打印</button>
                    </div>
                  )}
                </div>
                {((previewTab[step3Key()] || 'ppt') === 'ppt') ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {pptOutlineLoading['step3_sop_doc'] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                        <div style={{ fontSize: 24, animation: 'spin 2s linear infinite' }}>⏳</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          AI 正在分析内容并生成大纲...<br />
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>预计 30-60 秒，请耐心等待</span>
                        </div>
                      </div>
                    ) : pptOutline[step3Key()] ? (
                      <textarea
                        style={{
                          flex: 1, width: '100%', border: 'none', resize: 'none',
                          fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
                          color: 'var(--text)', background: 'var(--bg)',
                          outline: 'none', padding: 8, borderRadius: 4,
                        }}
                        value={pptOutline[step3Key()].outline_text}
                        readOnly={readOnly || !pptEditMode[step3Key()]}
                        onChange={(e) => {
                          const md = e.target.value
                          setPptOutline(prev => ({
                            ...prev,
                            [step3Key()]: { ...prev[step3Key()], outline_text: md }
                          }))
                        }}
                        placeholder="大纲内容将显示在这里..."
                      />
                    ) : pptGenerating['step3_sop_doc'] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                        <div style={{ fontSize: 24, animation: 'spin 2s linear infinite' }}>⏳</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          AI 正在合成课件...
                        </div>
                      </div>
                    ) : pptSlidePlans[step3Key()] ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>已生成 {pptSlidePlans[step3Key()].slides.length} 页课件</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm"
                            disabled={!pptSlidePlans[step3Key()]?.previewUrl}
                            onClick={() => pptSlidePlans[step3Key()]?.previewUrl && window.open(pptSlidePlans[step3Key()].previewUrl + '?_t=' + Date.now(), '_blank')}>
                            预览
                          </button>
                          {pptSlidePlans[step3Key()].format === 'svg' ? (
                            <button className="btn btn-ghost btn-sm"
                              onClick={async () => { const z = pptSlidePlans[step3Key()].zipUrl; if (z) downloadFile(z, pptSlidePlans[step3Key()].filename + '.zip') }}>
                              ⬇ SVG ZIP
                            </button>
                          ) : (
                            <>
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => downloadFile(pptSlidePlans[step3Key()].downloadUrl, pptSlidePlans[step3Key()].filename)}>
                                ⬇ PPTX
                              </button>
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => handleDownloadHtml(step3Key())}>
                                ⬇ HTML
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
                        <div style={{ fontSize: 36, opacity: 0.3 }}>📋</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          点击左侧 <span style={{ fontWeight: 600, color: 'var(--primary)' }}>📋 生成大纲</span> 开始分析
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 10, textAlign: 'center' }}>
                          生成大纲后可在此编辑精修<br />确认无误后再点击 合成课件
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const key = step3Key()
                          setPptEditMode(prev => ({...prev, [key]: !prev[key]}))
                        }}>
                        {pptEditMode[step3Key()] ? '👁 查看' : '✏ 编辑'}
                      </button>
                      <button className="btn btn-ghost btn-sm"
                        disabled={!pptOutline[step3Key()] && !steps[step3Key()]}
                        onClick={async () => {
                          if (!id) return
                          const text = pptOutline[step3Key()]?.outline_text || steps[step3Key()] || ''
                          try {
                            const resp = await api.saveFileToProject(id, `${project?.name || '文档'}_标准文档大纲.txt`, text)
                            modal.toast(`已保存到 ${resp.path}`, 'success')
                          } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                        }}>📥 保存到项目</button>
                      <button className={`btn btn-primary btn-sm ${getSaveBtnClass(pptOutline[step3Key()]?.outline_text || steps[step3Key()] || '', step3Key())} ${pptSavingOutline[step3Key()] ? 'btn-disabled' : ''}`}
                        disabled={pptSavingOutline[step3Key()]}
                        onClick={async () => {
                          const key = step3Key();
                          const currentText = pptOutline[key]?.outline_text || '';
                          const savedText = steps[key] || '';
                          const textChanged = currentText !== savedText;
                          const model = getPptModel(key);

                          if (textChanged && model) {
                            setPptSavingOutline(prev => ({...prev, [key]: true}));
                            try {
                              const [pid, mdl] = model.split(':');
                              const result = await api.convertOutlineToJson(currentText, pptOutline[key]?.outline_json || [], pid, mdl);
                              if (result?.outline_json?.length) {
                                setPptOutline(prev => ({...prev, [key]: {...prev[key], outline_json: result.outline_json}}));
                                saveStep(`_ppt_outline_json_${key}`, JSON.stringify(result.outline_json));
                              }
                            } catch (e: any) {
                              modal.toast(`大纲转换失败: ${e?.message || e}`, 'error');
                            } finally {
                              setPptSavingOutline(prev => ({...prev, [key]: false}));
                            }
                          }

                          saveStep(key, currentText);
                          flashSave();
                        }}>
                        {pptSavingOutline[step3Key()] ? '⏳ 转换中...' : getSaveBtnLabel(pptOutline[step3Key()]?.outline_text || steps[step3Key()] || '', step3Key())}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => {
                        const key = step3Key()
                        setPptSlidePlans(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPptOutline(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPreviewHtml(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPreviewLoading(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPptEditMode(prev => { const n = { ...prev }; delete n[key]; return n })
                      }}>✕ 清空</button>
                      <span style={{ flex: 1 }} />
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const key = step3Key()
                          setEditPanelOpen(prev => ({ ...prev, [key]: !prev[key] }))
                        }}
                        style={{ background: editPanelOpen[step3Key()] ? 'var(--primary)' : undefined, color: editPanelOpen[step3Key()] ? '#fff' : undefined }}>
                        {editPanelOpen[step3Key()] ? '✕ 关闭' : 'HTML编辑'}
                      </button>
                      {pptSlidePlans[step3Key()]?.previewUrl && (
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => window.open(pptSlidePlans[step3Key()].previewUrl + '?_t=' + Date.now(), '_blank')}>
                          预览
                        </button>
                      )}
                      {pptSlidePlans[step3Key()]?.format === 'svg' ? (
                        <button className="btn btn-ghost btn-sm"
                          onClick={async () => { const z = pptSlidePlans[step3Key()].zipUrl; if (z) downloadFile(z, (pptSlidePlans[step3Key()].filename || 'svg-deck') + '.zip') }}>
                          ⬇ SVG ZIP
                        </button>
                      ) : pptSlidePlans[step3Key()] ? (
                        <>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => downloadFile(pptSlidePlans[step3Key()].downloadUrl, pptSlidePlans[step3Key()].filename)}>
                            ⬇ PPTX
                          </button>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => handleDownloadHtml(step3Key())}>
                            ⬇ HTML
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : ((previewTab[step3Key()] || 'ppt') === 'json') ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {pptOutline[step3Key()] ? (
                      <textarea
                        style={{
                          flex: 1, width: '100%', border: 'none', resize: 'none',
                          fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
                          color: 'var(--text)', background: 'var(--bg)',
                          outline: 'none', padding: 8, borderRadius: 4,
                        }}
                        value={JSON.stringify(pptOutline[step3Key()].outline_json, null, 2)}
                        readOnly
                      />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
                        <div style={{ fontSize: 36, opacity: 0.3 }}>📋</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          请先点击左侧 <span style={{ fontWeight: 600, color: 'var(--primary)' }}>📋 生成大纲</span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>生成大纲后才可合成课件</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
                    <style>{PREVIEW_CSS}</style>
                    {s3OutlineText ? (
                      <div className="md-preview" style={{ padding: '12px 16px', background: '#fff', borderRadius: 6, border: '1px solid var(--border)' }}
                        dangerouslySetInnerHTML={{ __html: s3RenderedHtml }} />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
                        <div style={{ fontSize: 36, opacity: 0.3 }}>👁</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>暂无大纲内容</div>
                      </div>
                    )}
                  </div>
                )}
                <SlideEditModal
                  open={!!(editPanelOpen[step3Key()] && editPanelProps().runId)}
                  runId={editPanelProps().runId}
                  previewUrl={editPanelProps().previewUrl}
                  slideCount={editPanelProps().slideCount}
                  providerId={editPanelProps().providerId}
                  model={editPanelProps().model}
                  styleId={editPanelProps().styleId}
                  columnId="col3"
                  pptxDownloadUrl={pptSlidePlans[step3Key()]?.downloadUrl}
                  pptxFilename={pptSlidePlans[step3Key()]?.filename}
                  downloadFormat={pptSlidePlans[step3Key()]?.format}
                  projectId={id}
                  projectName={project?.name}
                  onDownloadHtml={() => handleDownloadHtml(step3Key())}
                  onClose={() => {
                    const key = step3Key()
                    setEditPanelOpen(prev => ({ ...prev, [key]: false }))
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {stage === 3 && sub === '3b' && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card" style={{ overflow: 'hidden' }}>
                <div className="card-title">📌 分析PPT<HelpButton location="project-stage-3b" /></div>
                <div className="card-hint">基于分析文档，选择模板合成PPT</div>
                <div className="form-label">选择模板</div>
                <TemplateSelector items={daoPptTemplates} selectedId={daoPptSelected}
                  onSelect={t => { setDaoPptSelected(t.id); saveStep('_tmpl_step3_dao_ppt', t.id) }} previewTarget="prev3b" />
                {(pptColorSchemesByStage[step3Key()] || []).length > 1 && (
                  <div style={{ marginTop: 8, marginBottom: 8 }}>
                    <div className="form-label">配色方案</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(pptColorSchemesByStage[step3Key()] || []).map(cs => {
                        const key = step3Key()
                        const current = pptColorScheme[key] || 'deep-blue'
                        return (
                        <button key={cs.id}
                          onClick={() => { setPptColorScheme(prev => ({ ...prev, [key]: cs.id })); saveStep(`_color_scheme_${key}`, cs.id) }}
                          title={cs.label}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', fontSize: 11,
                            borderRadius: 6, border: current === cs.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                            background: current === cs.id ? 'var(--bg-hover)' : 'var(--bg)',
                            cursor: 'pointer',
                          }}>
                          <span style={{ width: 14, height: 14, borderRadius: '50%', background: cs.primary, display: 'inline-block', flexShrink: 0 }} />
                          {cs.label}
                        </button>
                      )})}
                    </div>
                  </div>
                )}
                <div className="form-label">大模型</div>
                <select className="form-select" style={{ marginBottom: 8 }} value={s3DaoPptModel} onChange={e => { setS3DaoPptModel(e.target.value); saveStep('_model_step3_dao_ppt', e.target.value) }}>
                  <option value="">选择模型...</option>
                  {llmProviders.filter(p => p.is_enabled).map(p =>
                    (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                      <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                    ))
                  )}
                </select>
                <button className="btn btn-ghost btn-sm" onClick={() => setS3DaoTempOpen(true)}>⚙温度设置</button>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, userSelect: 'none', marginLeft: 8 }}>
                  <input type="checkbox" checked={forceRegenerate} onChange={(e) => setForceRegenerate(e.target.checked)} style={{ cursor: 'pointer' }} />
                  全新生成
                </label>
                <CanEdit perm={canGenerate3}>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-sm"
                    style={{ flex: 1 }}
                    disabled={!daoPptSelected || !(steps.step2_daoshuyi || '') || !s3DaoPptModel || pptOutlineLoading['step3_dao_ppt']}
                    onClick={() => doGenerateOutline('step3_dao_ppt', steps.step2_daoshuyi || '', daoPptSelected, s3DaoPptModel, 'col4', s3DaoPptTemp, s3DaoTemps.outline, s3DaoTemps.keyword, s3DaoTemps.research, s3DaoTemps.fill, s3DaoTemps.stageOutline, s3DaoTemps.stageGeneration, s3DaoTemps.stageReview)}>
                    {pptOutlineLoading['step3_dao_ppt'] ? '⏳ 生成中...' : '📋 生成大纲'}
                  </button>
                  <button className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                    disabled={!daoPptSelected || !(steps.step2_daoshuyi || '') || !s3DaoPptModel || !pptOutline['step3_dao_ppt']?.outline_json?.length || pptOutlineLoading['step3_dao_ppt'] || pptGenerating['step3_dao_ppt']}
                    onClick={() => doGeneratePPT('step3_dao_ppt', steps.step2_daoshuyi || '', daoPptSelected, '分析PPT',
                      stage3Prompts.daoPpt?.prompt || '请将分析文档内容转化为PPT大纲。',
                      s3DaoPptModel, 'col4', s3DaoPptTemp, s3DaoTemps.keyword, s3DaoTemps.research, s3DaoTemps.outline, s3DaoTemps.fill, s3DaoTemps.cards, s3DaoTemps.html, s3DaoTemps.svg_batch, s3DaoTemps.svg_single, s3DaoTemps.review, s3DaoTemps.fix, s3DaoTemps.holistic, s3DaoTemps.holistic_fix, s3DaoTemps.stageOutline, s3DaoTemps.stageGeneration, s3DaoTemps.stageReview, forceRegenerate)}>
                    {pptGenerating['step3_dao_ppt'] ? '⏳ 合成中...' : '📌 合成PPT'}
                  </button>
                </div>
                </CanEdit>
                {(pptOutlineLoading['step3_dao_ppt'] || pptGenerating['step3_dao_ppt']) && (
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)', width: '100%', marginTop: 4 }}
                    onClick={() => handleCancelGenerate('step3_dao_ppt')}>取消</button>
                )}
                {!daoPptSelected || !(steps.step2_daoshuyi || '') || !s3DaoPptModel ? (
                  <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>
                    {[
                      !daoPptSelected ? '请选择模板' : '',
                      !(steps.step2_daoshuyi || '') ? '请先生成分析文档' : '',
                      !s3DaoPptModel ? '请选择大模型' : '',
                    ].filter(Boolean).join(' | ')}
                  </div>
                ) : !pptOutline['step3_dao_ppt']?.outline_json?.length ? (
                  <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>
                    请先生成大纲
                  </div>
                ) : null}
                {(pptLog.length > 0 || pptOutlineLoading['step3_dao_ppt'] || pptGenerating['step3_dao_ppt']) && (
                  <div ref={pptLogContainerRef} style={{ maxHeight: 180, minHeight: 0, overflowY: 'auto', background: 'var(--bg)', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 11, lineHeight: '18px', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', marginTop: 8 }}>
                    {pptLog.length === 0 ? (
                      <div style={{ color: '#888' }}>等待日志...</div>
                    ) : (
                      pptLog.map((entry, i) => (
                        <div key={i} style={{ marginBottom: 2 }}>
                          <span style={{ color: '#888' }}>[{entry.time}]</span> {entry.message}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', marginBottom: 8, flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 0 }}>
                    <button
                      style={{ padding: '5px 14px', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', borderRadius: 0,
                        color: (previewTab[step3Key()] || 'ppt') === 'ppt' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: (previewTab[step3Key()] || 'ppt') === 'ppt' ? '2px solid var(--primary)' : '2px solid transparent',
                        fontWeight: (previewTab[step3Key()] || 'ppt') === 'ppt' ? 600 : 400,
                      }}
                      onClick={() => setPreviewTab(prev => ({...prev, [step3Key()]: 'ppt'}))}>大纲内容</button>
                    <button
                      style={{ padding: '5px 14px', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', borderRadius: 0,
                        color: (previewTab[step3Key()] || 'ppt') === 'json' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: (previewTab[step3Key()] || 'ppt') === 'json' ? '2px solid var(--primary)' : '2px solid transparent',
                        fontWeight: (previewTab[step3Key()] || 'ppt') === 'json' ? 600 : 400,
                      }}
                      onClick={() => setPreviewTab(prev => ({...prev, [step3Key()]: 'json'}))}>JSON</button>
                    <button
                      style={{ padding: '5px 14px', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', borderRadius: 0,
                        color: (previewTab[step3Key()] || 'ppt') === 'preview' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: (previewTab[step3Key()] || 'ppt') === 'preview' ? '2px solid var(--primary)' : '2px solid transparent',
                        fontWeight: (previewTab[step3Key()] || 'ppt') === 'preview' ? 600 : 400,
                      }}
                      onClick={() => setPreviewTab(prev => ({...prev, [step3Key()]: 'preview'}))}>预览</button>
                  </div>
                  {(previewTab[step3Key()] || 'ppt') === 'preview' && s3OutlineText && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button onClick={handleS3DownloadHtml} style={{
                        padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                        background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4,
                      }}>📥 下载 HTML</button>
                      <button onClick={handleS3Print} style={{
                        padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                        background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4,
                      }}>🖨 打印</button>
                    </div>
                  )}
                </div>
                {((previewTab[step3Key()] || 'ppt') === 'ppt') ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {pptOutlineLoading['step3_dao_ppt'] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                        <div style={{ fontSize: 24, animation: 'spin 2s linear infinite' }}>⏳</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          AI 正在分析内容并生成大纲...<br />
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>预计 30-60 秒，请耐心等待</span>
                        </div>
                      </div>
                    ) : pptOutline[step3Key()] ? (
                      <textarea
                        style={{
                          flex: 1, width: '100%', border: 'none', resize: 'none',
                          fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
                          color: 'var(--text)', background: 'var(--bg)',
                          outline: 'none', padding: 8, borderRadius: 4,
                        }}
                        value={pptOutline[step3Key()].outline_text}
                        readOnly={readOnly || !pptEditMode[step3Key()]}
                        onChange={(e) => {
                          const md = e.target.value
                          setPptOutline(prev => ({
                            ...prev,
                            [step3Key()]: { ...prev[step3Key()], outline_text: md }
                          }))
                        }}
                        placeholder="大纲内容将显示在这里..."
                      />
                    ) : pptGenerating['step3_dao_ppt'] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                        <div style={{ fontSize: 24, animation: 'spin 2s linear infinite' }}>⏳</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          AI 正在合成幻灯片...
                        </div>
                      </div>
                    ) : pptSlidePlans[step3Key()] ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>已生成 {pptSlidePlans[step3Key()].slides.length} 页幻灯片</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm"
                            disabled={!pptSlidePlans[step3Key()]?.previewUrl}
                            onClick={() => pptSlidePlans[step3Key()]?.previewUrl && window.open(pptSlidePlans[step3Key()].previewUrl + '?_t=' + Date.now(), '_blank')}>
                            预览
                          </button>
                          {pptSlidePlans[step3Key()].format === 'svg' ? (
                            <button className="btn btn-ghost btn-sm"
                              onClick={async () => { const z = pptSlidePlans[step3Key()].zipUrl; if (z) downloadFile(z, pptSlidePlans[step3Key()].filename + '.zip') }}>
                              ⬇ SVG ZIP
                            </button>
                          ) : (
                            <>
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => downloadFile(pptSlidePlans[step3Key()].downloadUrl, pptSlidePlans[step3Key()].filename)}>
                                ⬇ PPTX
                              </button>
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => handleDownloadHtml(step3Key())}>
                                ⬇ HTML
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
                        <div style={{ fontSize: 36, opacity: 0.3 }}>📋</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          点击左侧 <span style={{ fontWeight: 600, color: 'var(--primary)' }}>📋 生成大纲</span> 开始分析
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 10, textAlign: 'center' }}>
                          生成大纲后可在此编辑精修<br />确认无误后再点击 合成PPT
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const key = step3Key()
                          setPptEditMode(prev => ({...prev, [key]: !prev[key]}))
                        }}>
                        {pptEditMode[step3Key()] ? '👁 查看' : '✏ 编辑'}
                      </button>
                      <button className="btn btn-ghost btn-sm"
                        disabled={!pptOutline[step3Key()] && !steps[step3Key()]}
                        onClick={async () => {
                          if (!id) return
                          const text = pptOutline[step3Key()]?.outline_text || steps[step3Key()] || ''
                          const label = step3Key() === 'step3_dao_ppt' ? '分析PPT' : '综合PPT'
                          try {
                            const resp = await api.saveFileToProject(id, `${project?.name || '文档'}_${label}大纲.txt`, text)
                            modal.toast(`已保存到 ${resp.path}`, 'success')
                          } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                        }}>📥 保存到项目</button>
                      <button className={`btn btn-primary btn-sm ${getSaveBtnClass(pptOutline[step3Key()]?.outline_text || steps[step3Key()] || '', step3Key())} ${pptSavingOutline[step3Key()] ? 'btn-disabled' : ''}`}
                        disabled={pptSavingOutline[step3Key()]}
                        onClick={async () => {
                          const key = step3Key();
                          const currentText = pptOutline[key]?.outline_text || '';
                          const savedText = steps[key] || '';
                          const textChanged = currentText !== savedText;
                          const model = getPptModel(key);

                          if (textChanged && model) {
                            setPptSavingOutline(prev => ({...prev, [key]: true}));
                            try {
                              const [pid, mdl] = model.split(':');
                              const result = await api.convertOutlineToJson(currentText, pptOutline[key]?.outline_json || [], pid, mdl);
                              if (result?.outline_json?.length) {
                                setPptOutline(prev => ({...prev, [key]: {...prev[key], outline_json: result.outline_json}}));
                                saveStep(`_ppt_outline_json_${key}`, JSON.stringify(result.outline_json));
                              }
                            } catch (e: any) {
                              modal.toast(`大纲转换失败: ${e?.message || e}`, 'error');
                            } finally {
                              setPptSavingOutline(prev => ({...prev, [key]: false}));
                            }
                          }

                          saveStep(key, currentText);
                          flashSave();
                        }}>
                        {pptSavingOutline[step3Key()] ? '⏳ 转换中...' : getSaveBtnLabel(pptOutline[step3Key()]?.outline_text || steps[step3Key()] || '', step3Key())}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => {
                        const key = step3Key()
                        setPptSlidePlans(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPptOutline(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPreviewHtml(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPreviewLoading(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPptEditMode(prev => { const n = { ...prev }; delete n[key]; return n })
                      }}>✕ 清空</button>
                      <span style={{ flex: 1 }} />
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const key = step3Key()
                          setEditPanelOpen(prev => ({ ...prev, [key]: !prev[key] }))
                        }}
                        style={{ background: editPanelOpen[step3Key()] ? 'var(--primary)' : undefined, color: editPanelOpen[step3Key()] ? '#fff' : undefined }}>
                        {editPanelOpen[step3Key()] ? '✕ 关闭' : 'HTML编辑'}
                      </button>
                      {pptSlidePlans[step3Key()]?.previewUrl && (
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => window.open(pptSlidePlans[step3Key()].previewUrl + '?_t=' + Date.now(), '_blank')}>
                          预览
                        </button>
                      )}
                      {pptSlidePlans[step3Key()]?.format === 'svg' ? (
                        <button className="btn btn-ghost btn-sm"
                          onClick={async () => { const z = pptSlidePlans[step3Key()].zipUrl; if (z) downloadFile(z, (pptSlidePlans[step3Key()].filename || 'svg-deck') + '.zip') }}>
                          ⬇ SVG ZIP
                        </button>
                      ) : pptSlidePlans[step3Key()] ? (
                        <>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => downloadFile(pptSlidePlans[step3Key()].downloadUrl, pptSlidePlans[step3Key()].filename)}>
                            ⬇ PPTX
                          </button>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => handleDownloadHtml(step3Key())}>
                            ⬇ HTML
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : (previewTab[step3Key()] === 'json') ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {pptOutline[step3Key()] ? (
                      <pre style={{
                        flex: 1, width: '100%', border: 'none', margin: 0,
                        fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
                        color: 'var(--text)', background: 'var(--bg)',
                        overflow: 'auto', padding: 8, borderRadius: 4,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}>
                        {JSON.stringify(pptOutline[step3Key()].outline_json, null, 2)}
                      </pre>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
                        <div style={{ fontSize: 36, opacity: 0.3 }}>📋</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          请先点击左侧 <span style={{ fontWeight: 600, color: 'var(--primary)' }}>📋 生成大纲</span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>生成大纲后才可合成PPT</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
                    <style>{PREVIEW_CSS}</style>
                    {s3OutlineText ? (
                      <div className="md-preview" style={{ padding: '12px 16px', background: '#fff', borderRadius: 6, border: '1px solid var(--border)' }}
                        dangerouslySetInnerHTML={{ __html: s3RenderedHtml }} />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
                        <div style={{ fontSize: 36, opacity: 0.3 }}>👁</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>暂无大纲内容</div>
                      </div>
                    )}
                  </div>
                )}
                <SlideEditModal
                  open={!!(editPanelOpen[step3Key()] && editPanelProps().runId)}
                  runId={editPanelProps().runId}
                  previewUrl={editPanelProps().previewUrl}
                  slideCount={editPanelProps().slideCount}
                  providerId={editPanelProps().providerId}
                  model={editPanelProps().model}
                  styleId={editPanelProps().styleId}
                  columnId="col4"
                  pptxDownloadUrl={pptSlidePlans[step3Key()]?.downloadUrl}
                  pptxFilename={pptSlidePlans[step3Key()]?.filename}
                  downloadFormat={pptSlidePlans[step3Key()]?.format}
                  projectId={id}
                  projectName={project?.name}
                  onDownloadHtml={() => handleDownloadHtml(step3Key())}
                  onClose={() => {
                    const key = step3Key()
                    setEditPanelOpen(prev => ({ ...prev, [key]: false }))
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {stage === 3 && sub === '3c' && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card" style={{ overflow: 'hidden' }}>
                <div className="card-title">📚 综合PPT<HelpButton location="project-stage-3c" /></div>
                <div className="card-hint">基于综合文档，选择模板合成PPT</div>
                <div className="form-label">选择模板</div>
                <TemplateSelector items={yanxiPptTemplates} selectedId={yanxiPptSelected}
                  onSelect={t => { setYanxiPptSelected(t.id); saveStep('_tmpl_step3_yan_ppt', t.id) }} previewTarget="prev3c" />
                {(pptColorSchemesByStage[step3Key()] || []).length > 1 && (
                  <div style={{ marginTop: 8, marginBottom: 8 }}>
                    <div className="form-label">配色方案</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(pptColorSchemesByStage[step3Key()] || []).map(cs => {
                        const key = step3Key()
                        const current = pptColorScheme[key] || 'deep-blue'
                        return (
                        <button key={cs.id}
                          onClick={() => { setPptColorScheme(prev => ({ ...prev, [key]: cs.id })); saveStep(`_color_scheme_${key}`, cs.id) }}
                          title={cs.label}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', fontSize: 11,
                            borderRadius: 6, border: current === cs.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                            background: current === cs.id ? 'var(--bg-hover)' : 'var(--bg)',
                            cursor: 'pointer',
                          }}>
                          <span style={{ width: 14, height: 14, borderRadius: '50%', background: cs.primary, display: 'inline-block', flexShrink: 0 }} />
                          {cs.label}
                        </button>
                      )})}
                    </div>
                  </div>
                )}
                <div className="form-label">大模型</div>
                <select className="form-select" style={{ marginBottom: 8 }} value={s3YanxiPptModel} onChange={e => { setS3YanxiPptModel(e.target.value); saveStep('_model_step3_yan_ppt', e.target.value) }}>
                  <option value="">选择模型...</option>
                  {llmProviders.filter(p => p.is_enabled).map(p =>
                    (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                      <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                    ))
                  )}
                </select>
                <button className="btn btn-ghost btn-sm" onClick={() => setS3YanxiTempOpen(true)}>⚙温度设置</button>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, userSelect: 'none', marginLeft: 8 }}>
                  <input type="checkbox" checked={forceRegenerate} onChange={(e) => setForceRegenerate(e.target.checked)} style={{ cursor: 'pointer' }} />
                  全新生成
                </label>
                <CanEdit perm={canGenerate3}>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-sm"
                    style={{ flex: 1 }}
                    disabled={!yanxiPptSelected || !(steps.step2_yanxi || '') || !s3YanxiPptModel || pptOutlineLoading['step3_yan_ppt']}
                    onClick={() => doGenerateOutline('step3_yan_ppt', steps.step2_yanxi || '', yanxiPptSelected, s3YanxiPptModel, 'col5', s3YanxiPptTemp, s3YanxiTemps.outline, s3YanxiTemps.keyword, s3YanxiTemps.research, s3YanxiTemps.fill, s3YanxiTemps.stageOutline, s3YanxiTemps.stageGeneration, s3YanxiTemps.stageReview)}>
                    {pptOutlineLoading['step3_yan_ppt'] ? '⏳ 生成中...' : '📋 生成大纲'}
                  </button>
                  <button className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                    disabled={!yanxiPptSelected || !(steps.step2_yanxi || '') || !s3YanxiPptModel || !pptOutline['step3_yan_ppt']?.outline_json?.length || pptOutlineLoading['step3_yan_ppt'] || pptGenerating['step3_yan_ppt']}
                    onClick={() => doGeneratePPT('step3_yan_ppt', steps.step2_yanxi || '', yanxiPptSelected, '综合PPT',
                      stage3Prompts.yanxiPpt?.prompt || '请将手册内容转化为PPT。',
                      s3YanxiPptModel, 'col5', s3YanxiPptTemp, s3YanxiTemps.keyword, s3YanxiTemps.research, s3YanxiTemps.outline, s3YanxiTemps.fill, s3YanxiTemps.cards, s3YanxiTemps.html, s3YanxiTemps.svg_batch, s3YanxiTemps.svg_single, s3YanxiTemps.review, s3YanxiTemps.fix, s3YanxiTemps.holistic, s3YanxiTemps.holistic_fix, s3YanxiTemps.stageOutline, s3YanxiTemps.stageGeneration, s3YanxiTemps.stageReview, forceRegenerate)}>
                    {pptGenerating['step3_yan_ppt'] ? '⏳ 合成中...' : '📌 合成PPT'}
                  </button>
                </div>
                </CanEdit>
                {(pptOutlineLoading['step3_yan_ppt'] || pptGenerating['step3_yan_ppt']) && (
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)', width: '100%', marginTop: 4 }}
                    onClick={() => handleCancelGenerate('step3_yan_ppt')}>取消</button>
                )}
                {!yanxiPptSelected || !(steps.step2_yanxi || '') || !s3YanxiPptModel ? (
                  <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>
                    {[
                      !yanxiPptSelected ? '请选择模板' : '',
                      !(steps.step2_yanxi || '') ? '请先生成综合文档' : '',
                      !s3YanxiPptModel ? '请选择大模型' : '',
                    ].filter(Boolean).join(' | ')}
                  </div>
                ) : !pptOutline['step3_yan_ppt']?.outline_json?.length ? (
                  <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>
                    请先生成大纲
                  </div>
                ) : null}
                {(pptLog.length > 0 || pptOutlineLoading['step3_yan_ppt'] || pptGenerating['step3_yan_ppt']) && (
                  <div ref={pptLogContainerRef} style={{ maxHeight: 180, minHeight: 0, overflowY: 'auto', background: 'var(--bg)', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 11, lineHeight: '18px', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', marginTop: 8 }}>
                    {pptLog.length === 0 ? (
                      <div style={{ color: '#888' }}>等待日志...</div>
                    ) : (
                      pptLog.map((entry, i) => (
                        <div key={i} style={{ marginBottom: 2 }}>
                          <span style={{ color: '#888' }}>[{entry.time}]</span> {entry.message}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', marginBottom: 8, flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 0 }}>
                    <button
                      style={{ padding: '5px 14px', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', borderRadius: 0,
                        color: (previewTab[step3Key()] || 'ppt') === 'ppt' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: (previewTab[step3Key()] || 'ppt') === 'ppt' ? '2px solid var(--primary)' : '2px solid transparent',
                        fontWeight: (previewTab[step3Key()] || 'ppt') === 'ppt' ? 600 : 400,
                      }}
                      onClick={() => setPreviewTab(prev => ({...prev, [step3Key()]: 'ppt'}))}>大纲内容</button>
                    <button
                      style={{ padding: '5px 14px', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', borderRadius: 0,
                        color: (previewTab[step3Key()] || 'ppt') === 'json' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: (previewTab[step3Key()] || 'ppt') === 'json' ? '2px solid var(--primary)' : '2px solid transparent',
                        fontWeight: (previewTab[step3Key()] || 'ppt') === 'json' ? 600 : 400,
                      }}
                      onClick={() => setPreviewTab(prev => ({...prev, [step3Key()]: 'json'}))}>JSON</button>
                    <button
                      style={{ padding: '5px 14px', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', borderRadius: 0,
                        color: (previewTab[step3Key()] || 'ppt') === 'preview' ? 'var(--primary)' : 'var(--text-secondary)',
                        borderBottom: (previewTab[step3Key()] || 'ppt') === 'preview' ? '2px solid var(--primary)' : '2px solid transparent',
                        fontWeight: (previewTab[step3Key()] || 'ppt') === 'preview' ? 600 : 400,
                      }}
                      onClick={() => setPreviewTab(prev => ({...prev, [step3Key()]: 'preview'}))}>预览</button>
                  </div>
                  {(previewTab[step3Key()] || 'ppt') === 'preview' && s3OutlineText && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button onClick={handleS3DownloadHtml} style={{
                        padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                        background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4,
                      }}>📥 下载 HTML</button>
                      <button onClick={handleS3Print} style={{
                        padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                        background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4,
                      }}>🖨 打印</button>
                    </div>
                  )}
                </div>
                {((previewTab[step3Key()] || 'ppt') === 'ppt') ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {pptOutlineLoading['step3_yan_ppt'] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                        <div style={{ fontSize: 24, animation: 'spin 2s linear infinite' }}>⏳</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          AI 正在分析内容并生成大纲...<br />
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>预计 30-60 秒，请耐心等待</span>
                        </div>
                      </div>
                    ) : pptOutline[step3Key()] ? (
                      <textarea
                        style={{
                          flex: 1, width: '100%', border: 'none', resize: 'none',
                          fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
                          color: 'var(--text)', background: 'var(--bg)',
                          outline: 'none', padding: 8, borderRadius: 4,
                        }}
                        value={pptOutline[step3Key()].outline_text}
                        readOnly={readOnly || !pptEditMode[step3Key()]}
                        onChange={(e) => {
                          const md = e.target.value
                          setPptOutline(prev => ({
                            ...prev,
                            [step3Key()]: { ...prev[step3Key()], outline_text: md }
                          }))
                        }}
                        placeholder="大纲内容将显示在这里..."
                      />
                    ) : pptGenerating['step3_yan_ppt'] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                        <div style={{ fontSize: 24, animation: 'spin 2s linear infinite' }}>⏳</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          AI 正在合成幻灯片...
                        </div>
                      </div>
                    ) : pptSlidePlans[step3Key()] ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>已生成 {pptSlidePlans[step3Key()].slides.length} 页幻灯片</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm"
                            disabled={!pptSlidePlans[step3Key()]?.previewUrl}
                            onClick={() => pptSlidePlans[step3Key()]?.previewUrl && window.open(pptSlidePlans[step3Key()].previewUrl + '?_t=' + Date.now(), '_blank')}>
                            预览
                          </button>
                          {pptSlidePlans[step3Key()].format === 'svg' ? (
                            <button className="btn btn-ghost btn-sm"
                              onClick={async () => { const z = pptSlidePlans[step3Key()].zipUrl; if (z) downloadFile(z, pptSlidePlans[step3Key()].filename + '.zip') }}>
                              ⬇ SVG ZIP
                            </button>
                          ) : (
                            <>
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => downloadFile(pptSlidePlans[step3Key()].downloadUrl, pptSlidePlans[step3Key()].filename)}>
                                ⬇ PPTX
                              </button>
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => handleDownloadHtml(step3Key())}>
                                ⬇ HTML
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
                        <div style={{ fontSize: 36, opacity: 0.3 }}>📋</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          点击左侧 <span style={{ fontWeight: 600, color: 'var(--primary)' }}>📋 生成大纲</span> 开始分析
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 10, textAlign: 'center' }}>
                          生成大纲后可在此编辑精修<br />确认无误后再点击 合成PPT
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const key = step3Key()
                          setPptEditMode(prev => ({...prev, [key]: !prev[key]}))
                        }}>
                        {pptEditMode[step3Key()] ? '👁 查看' : '✏ 编辑'}
                      </button>
                      <button className="btn btn-ghost btn-sm"
                        disabled={!pptOutline[step3Key()] && !steps[step3Key()]}
                        onClick={async () => {
                          if (!id) return
                          try {
                            const text = pptOutline[step3Key()]?.outline_text || steps[step3Key()] || ''
                            const resp = await api.saveFileToProject(id, `${project?.name || '文档'}_综合PPT大纲.txt`, text)
                            modal.toast(`已保存到 ${resp.path}`, 'success')
                          } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                        }}>📥 保存到项目</button>
                      <button className={`btn btn-primary btn-sm ${getSaveBtnClass(pptOutline[step3Key()]?.outline_text || steps[step3Key()] || '', step3Key())} ${pptSavingOutline[step3Key()] ? 'btn-disabled' : ''}`}
                        disabled={pptSavingOutline[step3Key()]}
                        onClick={async () => {
                          const key = step3Key();
                          const currentText = pptOutline[key]?.outline_text || '';
                          const savedText = steps[key] || '';
                          const textChanged = currentText !== savedText;
                          const model = getPptModel(key);

                          if (textChanged && model) {
                            setPptSavingOutline(prev => ({...prev, [key]: true}));
                            try {
                              const [pid, mdl] = model.split(':');
                              const result = await api.convertOutlineToJson(currentText, pptOutline[key]?.outline_json || [], pid, mdl);
                              if (result?.outline_json?.length) {
                                setPptOutline(prev => ({...prev, [key]: {...prev[key], outline_json: result.outline_json}}));
                                saveStep(`_ppt_outline_json_${key}`, JSON.stringify(result.outline_json));
                              }
                            } catch (e: any) {
                              modal.toast(`大纲转换失败: ${e?.message || e}`, 'error');
                            } finally {
                              setPptSavingOutline(prev => ({...prev, [key]: false}));
                            }
                          }

                          saveStep(key, currentText);
                          flashSave();
                        }}>
                        {pptSavingOutline[step3Key()] ? '⏳ 转换中...' : getSaveBtnLabel(pptOutline[step3Key()]?.outline_text || steps[step3Key()] || '', step3Key())}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => {
                        const key = step3Key()
                        setPptSlidePlans(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPptOutline(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPreviewHtml(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPreviewLoading(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPptEditMode(prev => { const n = { ...prev }; delete n[key]; return n })
                      }}>✕ 清空</button>
                      <span style={{ flex: 1 }} />
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const key = step3Key()
                          setEditPanelOpen(prev => ({ ...prev, [key]: !prev[key] }))
                        }}
                        style={{ background: editPanelOpen[step3Key()] ? 'var(--primary)' : undefined, color: editPanelOpen[step3Key()] ? '#fff' : undefined }}>
                        {editPanelOpen[step3Key()] ? '✕ 关闭' : 'HTML编辑'}
                      </button>
                      {pptSlidePlans[step3Key()]?.previewUrl && (
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => window.open(pptSlidePlans[step3Key()].previewUrl + '?_t=' + Date.now(), '_blank')}>
                          预览
                        </button>
                      )}
                      {pptSlidePlans[step3Key()]?.format === 'svg' ? (
                        <button className="btn btn-ghost btn-sm"
                          onClick={async () => { const z = pptSlidePlans[step3Key()].zipUrl; if (z) downloadFile(z, (pptSlidePlans[step3Key()].filename || 'svg-deck') + '.zip') }}>
                          ⬇ SVG ZIP
                        </button>
                      ) : pptSlidePlans[step3Key()] ? (
                        <>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => downloadFile(pptSlidePlans[step3Key()].downloadUrl, pptSlidePlans[step3Key()].filename)}>
                            ⬇ PPTX
                          </button>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => handleDownloadHtml(step3Key())}>
                            ⬇ HTML
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : (previewTab[step3Key()] === 'json') ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {pptOutline[step3Key()] ? (
                      <pre style={{
                        flex: 1, width: '100%', border: 'none', margin: 0,
                        fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
                        color: 'var(--text)', background: 'var(--bg)',
                        overflow: 'auto', padding: 8, borderRadius: 4,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}>
                        {JSON.stringify(pptOutline[step3Key()].outline_json, null, 2)}
                      </pre>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
                        <div style={{ fontSize: 36, opacity: 0.3 }}>📋</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          请先点击左侧 <span style={{ fontWeight: 600, color: 'var(--primary)' }}>📋 生成大纲</span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>生成大纲后才可合成PPT</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
                    <style>{PREVIEW_CSS}</style>
                    {s3OutlineText ? (
                      <div className="md-preview" style={{ padding: '12px 16px', background: '#fff', borderRadius: 6, border: '1px solid var(--border)' }}
                        dangerouslySetInnerHTML={{ __html: s3RenderedHtml }} />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
                        <div style={{ fontSize: 36, opacity: 0.3 }}>👁</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>暂无大纲内容</div>
                      </div>
                    )}
                  </div>
                )}
                <SlideEditModal
                  open={!!(editPanelOpen[step3Key()] && editPanelProps().runId)}
                  runId={editPanelProps().runId}
                  previewUrl={editPanelProps().previewUrl}
                  slideCount={editPanelProps().slideCount}
                  providerId={editPanelProps().providerId}
                  model={editPanelProps().model}
                  styleId={editPanelProps().styleId}
                  columnId="col5"
                  pptxDownloadUrl={pptSlidePlans[step3Key()]?.downloadUrl}
                  pptxFilename={pptSlidePlans[step3Key()]?.filename}
                  downloadFormat={pptSlidePlans[step3Key()]?.format}
                  projectId={id}
                  projectName={project?.name}
                  onDownloadHtml={() => handleDownloadHtml(step3Key())}
                  onClose={() => {
                    const key = step3Key()
                    setEditPanelOpen(prev => ({ ...prev, [key]: false }))
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ====== STAGE 4: 演讲课件 ====== */}
        {stage === 4 && sub === '4a' && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                <div className="card-title">演讲文案<HelpButton location="project-stage-4a" /></div>
                <div className="card-hint">基于文档内容，生成对应风格的演讲稿</div>
                {/* ── Sub-tab bar ── */}
                <div className="s4-speech-tabs" style={{ display: 'flex', gap: 2, marginBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  {S4_SPEECH_TABS.map(t => (
                    <button key={t.key}
                      className="btn btn-ghost btn-sm"
                      style={{
                        borderBottom: s4ActiveSpeechTab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
                        borderRadius: 0,
                        fontWeight: s4ActiveSpeechTab === t.key ? 600 : 400,
                        color: s4ActiveSpeechTab === t.key ? 'var(--primary)' : 'var(--text-secondary)',
                        fontSize: 12,
                      }}
                      onClick={() => setS4ActiveSpeechTab(t.key)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {/* ── Active tab content ── */}
                {S4_SPEECH_TABS.map(t => {
                  const isActive = s4ActiveSpeechTab === t.key
                  const activeModel = s4SpeechModels[t.key] || ''
                  const activePrompt = stage4Prompts[t.key]?.prompt || '请根据以下内容生成演讲稿，风格亲切自然。'
                  const activeSkill = stage4Prompts[t.key]?.skill || ''
                  const dsKey = s4DataSources[t.key] || 'step2_sop'
                  const sourceContent = steps[dsKey] || steps.step1_video || steps.step1_text || steps.step1_file || ''
                  const isGenerating = s4SpeechGenerating[t.key] || false
                  return (
                    <div key={t.key} style={{ display: isActive ? 'block' : 'none' }}>
                      <div className="form-label">来源</div>
                      <select className="form-select" style={{ marginBottom: 8 }}
                        value={dsKey} onChange={e => {
                          const val = e.target.value
                          setS4DataSources(prev => ({ ...prev, [t.key]: val }))
                          saveStep(`_ds_s4_${t.key}`, val)
                        }}>
                        {S4_SOURCE_OPTS.map(s => (
                          <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                      </select>
                      <div className="form-label">大模型</div>
                      <select className="form-select" style={{ marginBottom: 8 }}
                        value={activeModel} onChange={e => {
                          const val = e.target.value
                          setS4SpeechModels(prev => ({ ...prev, [t.key]: val }))
                          saveStep(t.modelKey, val)
                        }}>
                        <option value="">默认 (DeepSeek)</option>
                        {llmProviders.map(p => (
                          Array.isArray(p.models) ? p.models.map((m: string) => (
                            <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} ({m})</option>
                          )) : null
                        ))}
                      </select>
                      <CanEdit perm={canGenerate4}>
                      <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                        disabled={isGenerating}
                        onClick={async () => {
                          const ctrl = new AbortController(); abortRef.current[t.stepKey] = ctrl
                          setS4SpeechGenerating(prev => ({ ...prev, [t.key]: true }))
                          let inputContent = sourceContent
                          const editKey = `${t.key}_${dsKey}`
                          if (s4SourceEdits[editKey] !== undefined) inputContent = s4SourceEdits[editKey]
                          try {
                            let pid = '', mdl = ''
                            if (activeModel) {
                              [pid, mdl] = activeModel.split(':')
                            } else {
                              const def = llmProviders.find((p: any) => p.is_enabled)
                              if (def) { pid = def.id; mdl = Array.isArray(def.models) ? def.models[0] : '' }
                            }
                            const userMessage = activeSkill
                              ? `请将以下内容按指定格式生成演讲稿：\n\n${inputContent}\n\n输出格式要求：\n${activeSkill}`
                              : inputContent
                            const content = await doGenerate(t.stepKey, activePrompt, userMessage, pid, mdl, 0.3, ctrl.signal)
                          } finally {
                            setS4SpeechGenerating(prev => ({ ...prev, [t.key]: false }))
                            delete abortRef.current[t.stepKey]
                          }
                        }}>
                        {isGenerating ? '⏳ 生成中...' : '📢 生成演讲稿'}
                      </button>
                      </CanEdit>
                      {isGenerating && (
                        <button className="btn btn-sm" style={{ marginTop: 4, background: 'var(--warning)', color: '#fff', width: '100%' }}
                          onClick={() => { abortRef.current[t.stepKey]?.abort(); modal.toast('已取消生成', 'success') }}>取消</button>
                      )}
                      {(() => {
                        const curDs = s4DataSources[t.key] || 'step2_sop'
                        const editKey = `${t.key}_${curDs}`
                        const editVal = s4SourceEdits[editKey] !== undefined ? s4SourceEdits[editKey] : steps[curDs] || ''
                        return (
                          <div style={{ marginTop: 10 }}>
                            <div className="form-label">来源文档（可编辑）</div>
                            <textarea className="form-textarea" readOnly={readOnly}
                              style={{ width: '100%', minHeight: 320, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6, resize: 'vertical' }}
                              value={editVal}
                              onChange={e => setS4SourceEdits(prev => ({ ...prev, [editKey]: e.target.value }))}
                            />
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  saveStep(curDs, editVal)
                                  setSteps(prev => ({ ...prev, [curDs]: editVal }))
                                  flashSave()
                                }}>
                                {getSaveBtnLabel(editVal, curDs)}
                              </button>
                              <button className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--warning)' }}
                                onClick={() => setS4SourceEdits(prev => ({ ...prev, [editKey]: '' }))}>
                                🗑 清空
                              </button>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 8, overflow: 'auto' }}>
                  <div style={{ display: 'flex', gap: 0, marginBottom: 4 }}>
                    <button onClick={() => setS4ViewMode('edit')} style={{
                      padding: '3px 10px', fontSize: 11, cursor: 'pointer', background: 'none', border: 'none', borderRadius: 0,
                      color: s4ViewMode === 'edit' ? 'var(--primary)' : 'var(--text-secondary)',
                      borderBottom: s4ViewMode === 'edit' ? '2px solid var(--primary)' : '2px solid transparent',
                      fontWeight: s4ViewMode === 'edit' ? 600 : 400,
                    }}>✏️ 编辑</button>
                    <button onClick={() => setS4ViewMode('preview')} style={{
                      padding: '3px 10px', fontSize: 11, cursor: 'pointer', background: 'none', border: 'none', borderRadius: 0,
                      color: s4ViewMode === 'preview' ? 'var(--primary)' : 'var(--text-secondary)',
                      borderBottom: s4ViewMode === 'preview' ? '2px solid var(--primary)' : '2px solid transparent',
                      fontWeight: s4ViewMode === 'preview' ? 600 : 400,
                    }}>👁 预览</button>
                    {s4ViewMode === 'preview' && s4Content && (
                      <>
                        <button onClick={handleS4DownloadHtml} style={{
                          marginLeft: 'auto', padding: '3px 10px', fontSize: 10, cursor: 'pointer',
                          background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 3,
                        }}>📥 下载 HTML</button>
                        <button onClick={handleS4Print} style={{
                          marginLeft: 4, padding: '3px 10px', fontSize: 10, cursor: 'pointer',
                          background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 3,
                        }}>🖨 打印</button>
                      </>
                    )}
                  </div>
                  {s4ViewMode === 'edit' ? (
                    (() => {
                      const activeTab = S4_SPEECH_TABS.find(t => t.key === s4ActiveSpeechTab)
                      const content = steps[activeTab?.stepKey || 'step4_speech_doc'] || ''
                      return (
                        <textarea className="form-textarea" readOnly={readOnly}
                          style={{ flex: 1, width: '100%', minHeight: 0, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6, border: '1px solid var(--border)', borderRadius: 4, padding: 8, background: 'var(--bg)', color: 'var(--text-primary)', resize: 'none', outline: 'none' }}
                          value={content}
                          placeholder="点击「生成演讲稿」生成..."
                          onChange={e => setSteps(prev => ({ ...prev, [activeTab!.stepKey]: e.target.value }))}
                        />
                      )
                    })()
                  ) : (
                    <div style={{
                      flex: 1, overflow: 'auto', background: '#fff', borderRadius: 6,
                      padding: '12px 16px', border: '1px solid var(--border)',
                    }}>
                      <style>{PREVIEW_CSS}</style>
                      {s4Content ? (
                        <div className="md-preview" dangerouslySetInnerHTML={{ __html: s4RenderedHtml }} />
                      ) : (
                        <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: 40 }}>暂无内容</div>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {(() => {
                      const activeTab = S4_SPEECH_TABS.find(t => t.key === s4ActiveSpeechTab)
                      const content = steps[activeTab?.stepKey || 'step4_speech_doc'] || ''
                      return (
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => {
                            if (activeTab && content.trim()) {
                              saveStep(activeTab.stepKey, content)
                              flashSave()
                            }
                          }}>
                          {getSaveBtnLabel(content, activeTab?.stepKey || 'step4_speech_doc')}
                        </button>
                      )
                    })()}
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const activeTab = S4_SPEECH_TABS.find(t => t.key === s4ActiveSpeechTab)
                        const text = activeTab ? (steps[activeTab.stepKey] || '') : ''
                        if (text.trim()) {
                          const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url; a.download = `${activeTab!.label}_${id}.txt`
                          a.click(); URL.revokeObjectURL(url)
                        }
                      }}>
                      📥 下载
                    </button>
                    <button className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--warning)' }}
                      onClick={() => {
                        const activeTab = S4_SPEECH_TABS.find(t => t.key === s4ActiveSpeechTab)
                        if (activeTab) {
                          setSteps(prev => ({ ...prev, [activeTab.stepKey]: '' }))
                          saveStep(activeTab.stepKey, '')
                          flashSave()
                        }
                      }}>
                      🗑 清空
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 4 && sub === '4b' && (
          <>
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                <div className="card-title">🎙 演讲口播<HelpButton location="project-stage-4b" /></div>
                <div className="form-label">TTS 提供商</div>
                <select className="form-select" style={{ marginBottom: 8 }}
                  value={ttsProviderId} onChange={e => {
                    setTtsProviderId(e.target.value)
                    const p = ttsProviders.find(x => x.id === e.target.value)
                    if (p) {
                      const models = Array.isArray(p.models) ? p.models : []
                      if (models.length > 0) setCloneModel(models[0])
                      api.listVoices(e.target.value).then(setTtsVoices).catch(() => {})
                    }
                  }}>
                  {ttsProviders.length === 0 && <option value="">暂无提供商</option>}
                  {ttsProviders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>

                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  {/* Tabs: 克隆音色 / 音色设计 */}
                  <div style={{ display: 'flex', marginBottom: 10, background: 'var(--bg)', borderRadius: 20, padding: 2 }}>
                    <button
                      style={{ flex: 1, padding: '5px 0', fontSize: 11, fontWeight: cloneMode === 'clone' ? 600 : 400, borderRadius: 20, border: 'none', cursor: 'pointer', background: cloneMode === 'clone' ? 'var(--card-bg)' : 'transparent', color: cloneMode === 'clone' ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: cloneMode === 'clone' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                      onClick={() => setCloneMode('clone')}>克隆音色</button>
                    <button
                      style={{ flex: 1, padding: '5px 0', fontSize: 11, fontWeight: cloneMode === 'design' ? 600 : 400, borderRadius: 20, border: 'none', cursor: 'pointer', background: cloneMode === 'design' ? 'var(--card-bg)' : 'transparent', color: cloneMode === 'design' ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: cloneMode === 'design' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                      onClick={() => setCloneMode('design')}>音色设计</button>
                  </div>

                  {/* 绑定模型 */}
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>绑定模型</label>
                    <select className="form-select" style={{ width: '100%', fontSize: 11 }} value={cloneModel} onChange={e => setCloneModel(e.target.value)}>
                      {ttsProviders.length === 0 && <option value="cosyvoice-v3.5-plus">CosyVoice 3.5 Plus</option>}
                      {ttsProviders.flatMap((p: any) => Array.isArray(p.models) ? p.models.filter((m: string) => m.includes('v3.5') || m.includes('cosyvoice')).map((m: string) => (
                        <option key={`${p.id}:${m}`} value={m}>{m}</option>
                      )) : [])}
                    </select>
                  </div>

                  {cloneMode === 'design' ? (
                    <>
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>声音描述</label>
                        <textarea className="form-textarea" style={{ width: '100%', minHeight: 60, resize: 'vertical', fontSize: 11 }}
                          value={voicePrompt} readOnly={readOnly} onChange={e => setVoicePrompt(e.target.value)}
                          placeholder="例如: 沉稳的中年男性，音色低沉有磁性" />
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>预览文本</label>
                        <input className="form-input" style={{ width: '100%', fontSize: 11 }} value={previewText} onChange={e => setPreviewText(e.target.value)} />
                      </div>
                    </>
                  ) : (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <label style={{ flex: 1 }}>
                          <input type="file" accept="audio/*" style={{ display: 'none' }}
                            onChange={e => setCloneFile(e.target.files?.[0] || null)} />
                          <span style={{ display: 'block', textAlign: 'center', background: 'var(--bg)', padding: '6px 0', borderRadius: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text-primary)' }}>
                            选择音频文件
                          </span>
                        </label>
                        <button style={{ flex: 1, background: 'var(--bg)', border: 'none', padding: '6px 0', borderRadius: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text-primary)' }}
                          onClick={recording ? stopRecording : startRecording}>
                          {recording ? '停止录制' : '录制声音'}
                        </button>
                      </div>
                      {cloneFile && <div style={{ fontSize: 10, color: 'var(--success)', marginTop: 3 }}>已选择: {cloneFile.name}</div>}
                      <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 3 }}>建议 10-20 秒清晰人声，WAV/MP3 格式</div>
                    </div>
                  )}

                  <div className="form-label" style={{ fontSize: 10 }}>选择音色</div>
                  <select className="form-select" style={{ marginBottom: 8, fontSize: 11 }}
                    value={voiceId} onChange={e => setVoiceId(e.target.value)}>
                    <option value="">默认音色</option>
                    {ttsVoices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    {clonedVoices.filter(v => !ttsVoices.some(tv => tv.id === v.id)).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>

                  {/* 我的音色 */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>我的音色</div>
                    {clonedVoices.length > 0 ? (
                      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                        {clonedVoices.map((v: any) => (
                          <div key={v.id}
                            onClick={() => setVoiceId(v.id)}
                            style={{ fontSize: 10, padding: '4px 6px', marginBottom: 4, background: voiceId === v.id ? 'var(--primary-light)' : 'var(--bg)', borderRadius: 4, border: voiceId === v.id ? '1px solid var(--primary)' : '1px solid var(--border)', cursor: 'pointer' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              {editingVoiceId === v.id ? (
                                <input className="form-input"
                                  style={{ flex: 1, fontSize: 10, padding: '1px 4px' }}
                                  value={editVoiceName}
                                  onChange={e => setEditVoiceName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      api.updateVoice(v.id, { name: editVoiceName }).then(() => loadClonedVoices())
                                      setEditingVoiceId('')
                                    }
                                  }}
                                  onClick={e => e.stopPropagation()}
                                  autoFocus
                                />
                              ) : (
                                <span style={{ color: voiceId === v.id ? 'var(--primary)' : 'var(--text-primary)', fontWeight: voiceId === v.id ? 600 : 400 }}>{v.name}</span>
                              )}
                              <span style={{ color: 'var(--text-secondary)', fontSize: 9 }}>{new Date(v.created_at).toLocaleDateString('zh-CN')}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 3, marginTop: 2, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                              {playingVoiceId === v.id ? (
                                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 9, padding: '0 3px', color: 'var(--warning)' }}
                                  onClick={stopAudio}>■</button>
                              ) : (
                                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 9, padding: '0 3px' }}
                                  onClick={async () => {
                                    try {
                                      const res = await api.previewVoice(v.id)
                                      playAudio(res.audio_url, v.id, undefined, v.volume, v.speed)
                                    } catch (e: any) {
                                      modal.toast('试听失败: ' + (e?.message || '未知错误'), 'error')
                                    }
                                  }}>
                                ▶</button>
                              )}
                              <input type="range" min="0" max="100" value={v.volume ?? 50}
                                onClick={e => e.stopPropagation()}
                                onChange={e => {
                                  const vol = Number(e.target.value)
                                  setClonedVoices(prev => prev.map(x => x.id === v.id ? { ...x, volume: vol } : x))
                                  api.updateVoice(v.id, { volume: vol }).catch(() => {})
                                }}
                                title={`音量 ${v.volume ?? 50}`}
                                style={{ flex: 1, height: 10, accentColor: 'var(--primary)', minWidth: 40 }} />
                              <input type="range" min="0.5" max="2.0" step="0.1" value={v.speed ?? 1.0}
                                onClick={e => e.stopPropagation()}
                                onChange={e => {
                                  const spd = Number(e.target.value)
                                  setClonedVoices(prev => prev.map(x => x.id === v.id ? { ...x, speed: spd } : x))
                                  api.updateVoice(v.id, { speed: spd }).catch(() => {})
                                }}
                                title={`语速 ${(v.speed ?? 1.0).toFixed(1)}`}
                                style={{ flex: 1, height: 10, accentColor: 'var(--primary)', minWidth: 40 }} />
                              {editingVoiceId === v.id ? (
                                <>
                                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 9, padding: '0 3px', color: 'var(--success)' }}
                                    onClick={() => {
                                      api.updateVoice(v.id, { name: editVoiceName }).then(() => loadClonedVoices())
                                      setEditingVoiceId('')
                                    }}>✓</button>
                                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 9, padding: '0 3px', color: 'var(--text-secondary)' }}
                                    onClick={() => setEditingVoiceId('')}>✕</button>
                                </>
                              ) : (
                                <>
                                  <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 9, padding: '0 3px' }}
                                    onClick={() => { setEditingVoiceId(v.id); setEditVoiceName(v.name) }}>✏</button>
                                  <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 9, padding: '0 3px', color: 'var(--warning)' }}
                                    onClick={async () => {
                                      if (!confirm('确定删除此音色？')) return
                                      try {
                                        await api.deleteVoice(v.id)
                                        setClonedVoices(prev => prev.filter(x => x.id !== v.id))
                                        api.listVoices(ttsProviderId || undefined).then(setTtsVoices).catch(() => {})
                                        modal.toast('音色已删除', 'success')
                                        loadClonedVoices()
                                      } catch (e: any) {
                                        modal.toast('删除失败: ' + (e?.message || '未知错误'), 'error')
                                      }
                                    }}>✕</button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>暂无克隆音色</div>
                    )}
                  </div>

                  <CanEdit perm={canGenerate4}>
                  <button className="btn btn-primary btn-sm" style={{ width: '100%', fontSize: 11 }}
                    onClick={() => {
                      setNameInput(cloneName)
                      setShowNameDialog(true)
                    }} disabled={cloning || (cloneMode === 'clone' && !cloneFile)}>
                    {cloning ? '处理中...' : (cloneMode === 'design' ? '开始设计' : '开始克隆')}
                  </button>
                  </CanEdit>
                </div>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'auto' }}>
                  {/* 左侧编辑区 */}
                  <div style={{ padding: 10, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                    {/* Tab 切换 */}
                    <div style={{ display: 'flex', gap: 0, marginBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <button type="button"
                        style={{ flex: 1, padding: '6px 0', fontSize: 11, fontWeight: ttsEditorTab === 'edit' ? 600 : 400, color: ttsEditorTab === 'edit' ? 'var(--primary)' : 'var(--text-secondary)', background: 'none', border: 'none', borderBottom: ttsEditorTab === 'edit' ? '2px solid var(--primary)' : '2px solid transparent', cursor: 'pointer' }}
                        onClick={() => setTtsEditorTab('edit')}>文案编辑</button>
                      <button type="button"
                        style={{ flex: 1, padding: '6px 0', fontSize: 11, fontWeight: ttsEditorTab === 'split' ? 600 : 400, color: ttsEditorTab === 'split' ? 'var(--primary)' : 'var(--text-secondary)', background: 'none', border: 'none', borderBottom: ttsEditorTab === 'split' ? '2px solid var(--primary)' : '2px solid transparent', cursor: 'pointer' }}
                        onClick={() => setTtsEditorTab('split')}>文案分割</button>
                    </div>

                    {ttsEditorTab === 'edit' ? (
                      <>
                        <div className="form-label" style={{ fontSize: 10 }}>来源</div>
                        <select className="form-select" style={{ marginBottom: 8, fontSize: 11 }}
                          value={ttsSourceTab} onChange={e => {
                            const val = e.target.value
                            if (val === 'split') {
                              setTtsSourceTab('blank')
                              setTtsInputText(splitSegments.map(s => `【段${s.index}】${s.text}`).join('\n\n'))
                            } else if (val === 'blank') {
                              setTtsSourceTab(val)
                              setTtsInputText(steps['step4_tts_blank'] || '')
                            } else {
                              setTtsSourceTab(val as typeof ttsSourceTab)
                              const tab = S4_SPEECH_TABS.find(t => t.key === val)
                              setTtsInputText(steps[tab?.stepKey || 'step4_speech_comprehensive'] || '')
                            }
                          }}>
                          {S4_SPEECH_TABS.map(t => (
                            <option key={t.key} value={t.key}>{t.label}{steps[t.stepKey] ? ' ✓' : ' (暂无内容)'}</option>
                          ))}
                          <option value="blank">白板编辑</option>
                          {splitSegments.length > 0 && (
                            <option value="split">文案分割 ({splitSegments.length}段)</option>
                          )}
                        </select>
                        <textarea className="form-textarea" readOnly={readOnly}
                          style={{ width: '100%', flex: 1, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6, resize: 'vertical' }}
                          value={ttsInputText}
                          onChange={e => setTtsInputText(e.target.value)}
                        />
                        <div style={{ display: 'flex', gap: 6, marginTop: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                          {(() => {
                            const tab = S4_SPEECH_TABS.find(t => t.key === ttsSourceTab)
                            const stepKey = ttsSourceTab === 'blank' ? 'step4_tts_blank' : (tab?.stepKey || 'step4_speech_comprehensive')
                            return (
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  if (ttsInputText.trim()) {
                                    saveStep(stepKey, ttsInputText)
                                    setSteps(prev => ({ ...prev, [stepKey]: ttsInputText }))
                                    flashSave()
                                  }
                                }}>
                                {getSaveBtnLabel(ttsInputText, stepKey)}
                              </button>
                            )
                          })()}
                          <CanEdit>
                            <button className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--warning)' }}
                              onClick={() => setTtsInputText('')}>🗑 清空</button>
                            <button className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--primary)' }}
                              onClick={doSplit}>✂ 分割</button>
                          </CanEdit>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                            <span>分割方式：</span>
                            <select className="form-input" style={{ width: 80, fontSize: 10, padding: '1px 4px' }}
                              value={splitMode} onChange={e => setSplitMode(e.target.value as 'newline' | 'chars')}>
                              <option value="newline">按换行</option>
                              <option value="chars">按字数</option>
                            </select>
                            {splitMode === 'chars' && <>
                              <span>每段≤</span>
                              <input type="number" className="form-input" style={{ width: 60, fontSize: 10, padding: '1px 4px' }}
                                value={splitMaxChunk} min={50} max={2000} step={10}
                                onChange={e => setSplitMaxChunk(Number(e.target.value) || 290)} />
                              <span>字</span>
                            </>}
                          </div>
                        </div>
                        <CanEdit perm={canGenerate4}>
                        <button className="btn btn-primary btn-sm w-full"
                          disabled={ttsGenerating} onClick={doTTS}>
                          {ttsGenerating ? '⏳ 合成中...' : '🔊 语音合成'}
                        </button>
                        </CanEdit>
                      </>
                    ) : (
                      <>
                        {splitSegments.length === 0 ? (
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
                            暂无分割段落，请先在"文案编辑"中点击"✂ 分割"
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>共 {splitSegments.length} 段 · 已选 {selectedSegments.size} 段</span>
                              <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '0 6px' }}
                                onClick={() => {
                                  if (selectedSegments.size === splitSegments.length) {
                                    setSelectedSegments(new Set())
                                  } else {
                                    setSelectedSegments(new Set(splitSegments.map(s => s.index)))
                                  }
                                }}>
                                {selectedSegments.size === splitSegments.length ? '取消全选' : '全选'}
                              </button>
                            </div>
                            <div style={{ flex: 1, overflow: 'auto', marginBottom: 8 }}>
                              {splitSegments.map(seg => (
                                <div key={seg.index}
                                  style={{ fontSize: 11, marginBottom: 6, padding: 6, background: 'var(--bg)', borderRadius: 4, border: selectedSegments.has(seg.index) ? '1px solid var(--primary)' : '1px solid var(--border)', cursor: 'pointer' }}
                                  onClick={() => {
                                    const next = new Set(selectedSegments)
                                    if (next.has(seg.index)) next.delete(seg.index)
                                    else next.add(seg.index)
                                    setSelectedSegments(next)
                                  }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                                        <input type="checkbox" checked={selectedSegments.has(seg.index)} readOnly
                                          style={{ marginRight: 6, verticalAlign: 'middle', cursor: 'pointer' }}
                                          onClick={e => e.stopPropagation()} />
                                        段{seg.index}
                                        {seg.audioUrl && <span style={{ color: 'var(--success)', marginLeft: 6, fontSize: 10 }}>✅</span>}
                                      </div>
                                      <textarea readOnly={readOnly}
                                        style={{ color: 'var(--text-secondary)', fontSize: 10, lineHeight: 1.4, width: '100%', minHeight: 36, height: 36, resize: 'vertical', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, padding: '2px 4px', fontFamily: 'inherit' }}
                                        value={seg.text}
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => {
                                          e.stopPropagation()
                                          setSplitSegments(prev => prev.map(s => s.index === seg.index ? { ...s, text: e.target.value } : s))
                                        }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: 2, flexShrink: 0, alignItems: 'center' }}>
                                      <button type="button" className="btn btn-ghost btn-sm"
                                        style={{ fontSize: 9, padding: '0 3px', color: 'var(--primary)' }}
                                        disabled={splitGenerating}
                                        onClick={e => { e.stopPropagation(); synthesizeSegment(seg.index) }}>
                                        {splitGenerating ? '⏳' : '合成'}
                                      </button>
                                      <button type="button" className="btn btn-ghost btn-sm"
                                        style={{ fontSize: 9, padding: '0 2px', color: 'var(--text-secondary)' }}
                                        title="上移"
                                        onClick={e => { e.stopPropagation(); moveSegmentUp(seg.index) }}>↑</button>
                                      <button type="button" className="btn btn-ghost btn-sm"
                                        style={{ fontSize: 9, padding: '0 2px', color: 'var(--text-secondary)' }}
                                        title="下移"
                                        onClick={e => { e.stopPropagation(); moveSegmentDown(seg.index) }}>↓</button>
                                      <button type="button" className="btn btn-ghost btn-sm"
                                        style={{ fontSize: 9, padding: '0 2px', color: 'var(--danger)' }}
                                        title="删除"
                                        onClick={e => { e.stopPropagation(); removeSegment(seg.index) }}>✕</button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <button className="btn btn-primary btn-sm w-full"
                              disabled={splitGenerating || selectedSegments.size === 0}
                              onClick={synthesizeSelected}>
                              {splitGenerating ? '⏳ 合成中...' : `🔊 合成选中段落 (${selectedSegments.size})`}
                            </button>
                            <button className="btn btn-ghost btn-sm w-full"
                              style={{ marginTop: 4, fontSize: 10, border: '1px dashed var(--border)' }}
                              onClick={addSegment}>
                              + 新增段落
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  {/* 合成列表 */}
                  <div style={{ padding: 10, overflow: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>合成列表</span>
                      {ttsHistory.length > 0 && (
                        <span style={{ fontSize: 10 }}>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '0 6px' }}
                            onClick={() => {
                              if (selectedHistoryIds.size === ttsHistory.length) {
                                setSelectedHistoryIds(new Set())
                              } else {
                                setSelectedHistoryIds(new Set(ttsHistory.map(h => h.id)))
                              }
                            }}>
                            {selectedHistoryIds.size === ttsHistory.length ? '取消全选' : '全选'}
                          </button>
                          {selectedHistoryIds.size > 0 && (
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, color: 'var(--warning)', padding: '0 6px', marginLeft: 4 }}
                              onClick={() => {
                                const n = selectedHistoryIds.size
                                if (confirm(`确定删除选中的 ${n} 条合成记录？`)) {
                                  const deletedUrls = new Set(ttsHistory.filter(h => selectedHistoryIds.has(h.id)).map(h => h.audioUrl))
                                  Promise.all([...selectedHistoryIds].map(id => api.deleteTtsHistory(id))).then(() => {
                                    setSelectedHistoryIds(new Set())
                                    setSplitSegments(prev => prev.map(s => s.audioUrl && deletedUrls.has(s.audioUrl) ? { ...s, audioUrl: undefined } : s))
                                    loadTtsHistory()
                                  })
                                }
                              }}>
                              删除选中 ({selectedHistoryIds.size})
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                    {ttsHistory.length === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>暂无合成记录</div>
                    ) : (
                      ttsHistory.map((h, i) => (
                        <div key={i} style={{ fontSize: 11, marginBottom: 8, padding: 6, background: 'var(--bg)', borderRadius: 4, border: '1px solid var(--border)' }}>
                          {editingHistoryIdx === i ? (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2 }}>
                              <input className="form-input"
                                style={{ flex: 1, fontSize: 10, padding: '2px 4px' }}
                                value={editHistoryName}
                                onChange={e => setEditHistoryName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    api.updateTtsHistory(h.id, editHistoryName).then(() => loadTtsHistory())
                                    setEditingHistoryIdx(null)
                                  }
                                }}
                                autoFocus
                              />
                              <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, color: 'var(--success)' }}
                                onClick={() => {
                                  api.updateTtsHistory(h.id, editHistoryName).then(() => loadTtsHistory())
                                  setEditingHistoryIdx(null)
                                }}>✓</button>
                              <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                                onClick={() => setEditingHistoryIdx(null)}>✕</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                              <span style={{ color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                <input type="checkbox" checked={selectedHistoryIds.has(h.id)} readOnly
                                  style={{ marginRight: 6, verticalAlign: 'middle', cursor: 'pointer' }}
                                  onClick={e => {
                                    e.stopPropagation()
                                    const next = new Set(selectedHistoryIds)
                                    if (next.has(h.id)) next.delete(h.id)
                                    else next.add(h.id)
                                    setSelectedHistoryIds(next)
                                  }} />
                                {h.filename}
                              </span>
                              <div style={{ display: 'flex', gap: 2, flexShrink: 0, marginLeft: 6 }}>
                                {h.audioUrl && (
                                  playingHistoryIdx === i ? (
                                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, color: 'var(--warning)', padding: '0 4px' }}
                                      onClick={stopAudio}>■</button>
                                  ) : (
                                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '0 4px' }}
                                      onClick={() => playAudio(h.audioUrl, undefined, i)}>▶</button>
                                  )
                                )}
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '0 4px' }}
                                  onClick={() => downloadFile(h.audioUrl, h.filename)}>💾</button>
                                <CanEdit perm={canGenerate4}>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '0 4px' }}
                                  onClick={() => { setEditingHistoryIdx(i); setEditHistoryName(h.filename) }}>✏</button>
                                </CanEdit>
                                <CanEdit perm={canGenerate4}>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, color: 'var(--warning)', padding: '0 4px' }}
                                  onClick={() => { if (confirm('确定删除此合成记录？')) { api.deleteTtsHistory(h.id).then(() => { setSplitSegments(prev => prev.map(s => s.audioUrl === h.audioUrl ? { ...s, audioUrl: undefined } : s)); loadTtsHistory() }) } }}>✕</button>
                                </CanEdit>
                              </div>
                            </div>
                          )}
                          <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{h.voice} · {h.time}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Recording Overlay ── */}
          {recording && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 110 }}
              onMouseMove={e => {
                if (!recDragRef.current.dragging) return
                setRecPos({
                  x: recDragRef.current.posX + e.clientX - recDragRef.current.startX,
                  y: recDragRef.current.posY + e.clientY - recDragRef.current.startY,
                })
              }}
              onMouseUp={() => { recDragRef.current.dragging = false }}
              onMouseLeave={() => { recDragRef.current.dragging = false }}>
              <div style={{ position: 'absolute', left: `calc(50% + ${recPos.x}px)`, top: `calc(50% + ${recPos.y}px)`, transform: 'translate(-50%, -50%)', background: '#fff', borderRadius: 20, padding: '36px 32px', width: 300, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', cursor: 'default' }}
                onMouseDown={e => {
                  // Only drag from non-interactive areas
                  const target = e.target as HTMLElement
                  if (target.tagName === 'BUTTON') return
                  recDragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, posX: recPos.x, posY: recPos.y }
                }}>
                <div style={{ position: 'absolute', top: 8, left: 0, right: 0, height: 20, cursor: 'move', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                  onMouseDown={e => {
                    recDragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, posX: recPos.x, posY: recPos.y }
                  }}>
                  <span style={{ width: 32, height: 4, background: 'var(--border)', borderRadius: 2 }} />
                </div>
                {recordingDone ? (
                  <>
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)', fontFamily: "'幼圆', 'Microsoft YaHei', sans-serif", marginBottom: 12 }}>录制完成</div>
                      <audio controls style={{ width: '100%', height: 40, borderRadius: 8 }}>
                        <source src={recPreviewUrl} />
                      </audio>
                      {recTooShort && (
                        <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 6, fontFamily: "'幼圆', 'Microsoft YaHei', sans-serif" }}>
                          录制时长不足 3 秒，请重新录制
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button
                        style={{ background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', padding: '10px 18px', borderRadius: 24, cursor: 'pointer', fontSize: 13, fontFamily: "'幼圆', 'Microsoft YaHei', sans-serif" }}
                        onClick={async () => {
                          if (recPreviewUrl) { URL.revokeObjectURL(recPreviewUrl); setRecPreviewUrl('') }
                          setRecordingDone(false)
                          setRecTime(0)
                          recTimeRef.current = 0
                          setRecTooShort(false)
                          setCloneFile(null)
                          recFileRef.current = null
                          try {
                            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                            recStreamRef.current = stream
                          } catch {}
                        }}>
                        重新录制
                      </button>
                      <button
                        style={{ background: recTooShort ? 'var(--muted)' : 'var(--primary)', color: recTooShort ? 'var(--text-secondary)' : '#fff', border: 'none', padding: '10px 18px', borderRadius: 24, cursor: recTooShort ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'幼圆', 'Microsoft YaHei', sans-serif" }}
                        onClick={recTooShort ? undefined : confirmClone}
                        disabled={recTooShort}>
                        确认克隆
                      </button>
                      <button
                        style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', padding: '10px 18px', borderRadius: 24, cursor: 'pointer', fontSize: 13, fontFamily: "'幼圆', 'Microsoft YaHei', sans-serif" }}
                        onClick={cancelRecording}>
                        关闭
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
                        {(recordingStarted ? waveData : [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]).map((h, i) => (
                          <span key={i} style={{ width: 5, height: recordingStarted ? h * 3 : 12, background: 'var(--primary)', borderRadius: 3, display: 'inline-block', transition: 'height 0.08s ease', opacity: recordingStarted ? 1 : 0.4 }} />
                        ))}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)', fontFamily: "'幼圆', 'Microsoft YaHei', sans-serif" }}>
                        {countdown > 0 ? '即将开始...' : (recordingStarted ? '正在录音...' : '准备录音')}
                      </div>
                    </div>
                    <div style={{ fontSize: 52, fontFamily: "'幼圆', 'Microsoft YaHei', sans-serif", fontWeight: 700, color: 'var(--primary)', marginBottom: 24 }}>
                      {countdown > 0 ? countdown : `${String(Math.floor(recTime / 60)).padStart(2, '0')}:${String(recTime % 60).padStart(2, '0')}`}
                    </div>
                    {recordingStarted ? (
                      <>
                        <button
                          style={{ background: recTime < 3 ? 'var(--muted)' : 'var(--primary)', color: recTime < 3 ? 'var(--text-secondary)' : '#fff', border: 'none', padding: '12px 40px', borderRadius: 24, cursor: recTime < 3 ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, fontFamily: "'幼圆', 'Microsoft YaHei', sans-serif" }}
                          onClick={recTime < 3 ? undefined : stopRecording}
                          disabled={recTime < 3}>
                          停止录制
                        </button>
                        {recTime < 3 && (
                          <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 6, fontFamily: "'幼圆', 'Microsoft YaHei', sans-serif" }}>
                            至少录制 3 秒 ({recTime}s / 3s)
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                        <button
                          style={{ background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', padding: '10px 32px', borderRadius: 24, cursor: 'pointer', fontSize: 14, fontFamily: "'幼圆', 'Microsoft YaHei', sans-serif" }}
                          onClick={cancelRecording}>
                          取消
                        </button>
                        <button
                          style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 32px', borderRadius: 24, cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: "'幼圆', 'Microsoft YaHei', sans-serif" }}
                          onClick={startCountdown}>
                          开始录制
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Naming Dialog ── */}
          {showNameDialog && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={e => { if (e.target === e.currentTarget) setShowNameDialog(false) }}>
              <div style={{ background: '#fff', borderRadius: 16, padding: '28px 24px', width: 320, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16, fontFamily: "'幼圆', 'Microsoft YaHei', sans-serif" }}>
                  {cloneMode === 'design' ? '命名音色' : '命名克隆音色'}
                </div>
                <input className="form-input"
                  style={{ width: '100%', fontSize: 13, marginBottom: 20, padding: '8px 12px' }}
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="输入声音名称"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter' && nameInput.trim()) {
                      setShowNameDialog(false)
                      doClone(nameInput.trim())
                    }
                  }}
                />
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    style={{ background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', padding: '8px 20px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontFamily: "'幼圆', 'Microsoft YaHei', sans-serif" }}
                    onClick={() => setShowNameDialog(false)}>
                    取消
                  </button>
                  <button
                    style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'幼圆', 'Microsoft YaHei', sans-serif" }}
                    disabled={!nameInput.trim()}
                    onClick={() => {
                      setShowNameDialog(false)
                      doClone(nameInput.trim())
                    }}>
                    确认
                  </button>
                </div>
              </div>
            </div>
          )}
          </>
        )}

        {/* ====== STAGE 5: 输出列表 ====== */}
        {stage === 5 && (
          <ProjectOutputList projectId={id!} projectName={project?.name || '项目'} readOnly={readOnly} canEditOwn={canEditOwn} />
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
                {(videoPath || dlTaskId) ? (
                  <video src={dlTaskId ? `/api/video/file?task_id=${dlTaskId}` : `/api/video/file?path=${encodeURIComponent(videoPath)}`} controls style={{ width: '100%', height: '100%', borderRadius: 8 }}
                    onError={(e: any) => {
                      const err = e.currentTarget?.error
                      let msg = '视频加载失败'
                      if (err) {
                        switch (err.code) {
                          case 1: msg += ': 加载中止'; break
                          case 2: msg += ': 网络错误'; break
                          case 3: msg += ': 解码失败，视频编码可能不兼容（请尝试重新下载）'; break
                          case 4: msg += ': 视频格式不支持（浏览器无法播放此编码）'; break
                          default: msg += `: 错误码 ${err.code}`
                        }
                      }
                      const checkUrl = dlTaskId ? `/api/video/file?task_id=${dlTaskId}` : `/api/video/file?path=${encodeURIComponent(videoPath)}`
                      fetch(checkUrl, { method: 'HEAD' }).then(r => {
                        if (!r.ok) msg += ` [HTTP ${r.status}]`
                      }).catch(() => {})
                      modal.toast(msg, 'error')
                    }} />
                ) : (
                  <span style={{ color: '#666', fontSize: 16 }}>暂无视频文件</span>
                )}
              </div>
              <div style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
                <textarea className="form-textarea" style={{ flex: 1, minHeight: 360 }}
                  value={videoText} readOnly={readOnly}
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

      {/* ── Stage3 Temp Settings Modals ── */}
      <Stage3TempSettings open={s3DaoTempOpen} initialTemps={s3DaoTemps} onApply={temps => { setS3DaoTemps(temps); Object.keys(temps).forEach(k => saveStep(`_temps_dao_${k}`, String((temps as any)[k]))); setS3DaoTempOpen(false) }} onClose={() => setS3DaoTempOpen(false)} />
      <Stage3TempSettings open={s3YanxiTempOpen} initialTemps={s3YanxiTemps} onApply={temps => { setS3YanxiTemps(temps); Object.keys(temps).forEach(k => saveStep(`_temps_yanxi_${k}`, String((temps as any)[k]))); setS3YanxiTempOpen(false) }} onClose={() => setS3YanxiTempOpen(false)} />
      <Stage3TempSettings open={s3SopTempOpen} initialTemps={s3SopTemps} onApply={temps => { setS3SopTemps(temps); setS3SopTemp(temps.sop); Object.keys(temps).forEach(k => saveStep(`_temps_sop_${k}`, String((temps as any)[k]))); setS3SopTempOpen(false) }} onClose={() => setS3SopTempOpen(false)} />

      {/* ── Model Picker Modal ── */}
      {showModelPicker && (
        <div className="dialog-overlay"
          onMouseDown={(e: any) => { overlayMouseDownRef.current = e.target === e.currentTarget }}
          onClick={() => { if (overlayMouseDownRef.current) setShowModelPicker(false) }}>
          <div className="dialog-box" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">选择大模型</div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>
              为以下栏目选择大模型，已选中的将自动沿用：
            </p>
            {modelPickerAll.map(c => (
              <div key={c.modelKey} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  {c.label} {steps[c.modelKey] ? <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 400 }}>已配置</span> : <span style={{ fontSize: 10, color: 'var(--warning)', fontWeight: 400 }}>未配置</span>}
                </label>
                <select
                  className="form-input"
                  value={modelPickerValues[c.modelKey] || ''}
                  onChange={e => setModelPickerValues(prev => ({ ...prev, [c.modelKey]: e.target.value }))}
                >
                  <option value="">-- 选择模型 --</option>
                  {llmProviders.filter(p => p.is_enabled).flatMap(p =>
                    (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                      <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>
                        {p.name} / {m}
                      </option>
                    ))
                  )}
                </select>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModelPicker(false)}>取消</button>
              <button className="btn btn-primary btn-sm"
                disabled={modelPickerAll.some(c => !modelPickerValues[c.modelKey])}
                onClick={handleModelPickerConfirm}
              >确认并生成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
