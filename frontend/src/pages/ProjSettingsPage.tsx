import { useState, useEffect } from 'react'
import { api, Prompt, PromptVersion, Voice } from '../services/api'
import { useModal } from '../components/ModalProvider'

type MainTab = 'models' | 'columns'

const CATEGORIES = ['文案提取', '教学文档', 'SOP文案', '标准SOP', '合成PPT', '口播文案']

// Column config accordion data
interface ColumnDef {
  id: string; label: string; hasTemplate: boolean; summary: string
  subItems: { id: string; label: string; prompt: string; skill: string }[]
}
const COLUMNS: ColumnDef[] = [
  {
    id: 'col1', label: '文案提取', hasTemplate: false, summary: '无模板 · 3 个独立配置项',
    subItems: [
      { id: 'c1-text', label: '直接输入', prompt: '你是国家高级烹饪技师、菜谱SOP规范整理专家。请将用户手打输入的食谱笔记整理为标准SOP文档。\n\n输入特征：口语化笔记，可能含简写、跳跃表述、隐含信息。\n\n提取策略：\n1. 术语标准化 — 「一点」「适量」等模糊词保留原样，标注「用量待确认」；「切碎」「剁」等动词统一为「切丁/切片/切末」\n2. 补全隐含步骤 — 如原文写「炒肉」，拆解为「热锅→凉油→下肉→翻炒至变色」\n3. 分离主料/辅料/调料 — 从笔记中归类食材用途\n4. 推断缺失字段 — 如原文提到了处理方式但未写工具，可从处理方式反推\n\n铁律：不得新增原文没有的食材或步骤；无法确定的信息标注「未提供」；所有数值（用量、时间、温度）原样保留，不得修改。', skill: '## 菜名\n**菜名**：\n**菜系**：\n**成品特征**：\n**出品标准**：\n**记录日期**：\n**制作人/来源**：\n\n### 一、食材清单\n| 序号 | 用途 | 食材名称 | 用量 | 处理方式 | 备注 |\n|------|------|----------|------|----------|------|\n| 1 | 主料 | | | | |\n| 2 | 辅料 | | | | |\n| 3 | 调料 | | | | |\n\n> **准备要点**：\n\n### 二、工具与器皿\n| 序号 | 用途 | 工具名称 |\n|------|------|----------|\n| 1 | | |\n\n### 三、制作步骤\n| 序号 | 步骤 | 步骤说明 | 关键技巧 |\n|------|------|----------|----------|\n| 1 | 预处理 | | |\n| 2 | 烹饪 | | |\n\n### 四、时间与火候总览\n| 阶段 | 时长 | 火力 | 注意事项 |\n|------|------|------|----------|\n| | | | |\n\n### 五、试吃与品鉴记录\n- **口味**：\n- **口感**：\n- **色泽**：\n\n### 六、总结与评分\n- **难度**：☆\n- **耗时**：\n- **一句话点评**：' },
      { id: 'c1-video', label: '视频链接', prompt: '你是国家高级烹饪技师、菜谱SOP规范整理专家。请根据视频相关内容提取完整的食谱SOP文档。\n\n输入特征：含时间戳的字幕碎片、创作者口语叙述、可能夹杂开场/互动/广告等非烹饪内容。\n\n多源提取优先级：\n1. 视频描述/简介 → 创作者常在此贴完整食谱（最高权重）\n2. 内嵌字幕文本 → 需过滤时间戳噪音，合并跨句碎片\n3. 音频转写文本（Whisper）→ 口语化表述需标准化\n\n提取策略：\n- 去噪：删除开场白、互动问答、广告口播、BGM歌词等非烹饪段落\n- 合并碎片：跨时间戳的同一操作步骤合并为一条完整说明\n- 重建顺序：如字幕顺序与操作顺序不一致，按烹饪逻辑重排\n- 量化识别：提取所有中文和西式计量单位（克/g、毫升/ml、汤匙/tbsp、茶匙/tsp、杯/cup），识别视频中提到的具体数值\n\n铁律：不得新增视频中没有的食材或步骤；无法确定的信息标注「视频未提及」；数值宁缺毋滥。', skill: '## 菜名\n**菜名**：\n**菜系**：\n**成品特征**：\n**出品标准**：\n**记录日期**：\n**制作人/来源**：\n\n### 一、食材清单\n| 序号 | 用途 | 食材名称 | 用量 | 处理方式 | 备注 |\n|------|------|----------|------|----------|------|\n| 1 | 主料 | | | | |\n| 2 | 辅料 | | | | |\n| 3 | 调料 | | | | |\n\n> **准备要点**：\n\n### 二、工具与器皿\n| 序号 | 用途 | 工具名称 |\n|------|------|----------|\n| 1 | | |\n\n### 三、制作步骤\n| 序号 | 步骤 | 步骤说明 | 关键技巧 |\n|------|------|----------|----------|\n| 1 | 预处理 | | |\n| 2 | 烹饪 | | |\n\n### 四、时间与火候总览\n| 阶段 | 时长 | 火力 | 注意事项 |\n|------|------|------|----------|\n| | | | |\n\n### 五、试吃与品鉴记录\n- **口味**：\n- **口感**：\n- **色泽**：\n\n### 六、总结与评分\n- **难度**：☆\n- **耗时**：\n- **一句话点评**：' },
      { id: 'c1-file', label: '导入文件', prompt: '你是国家高级烹饪技师、菜谱SOP规范整理专家。请从上传文件中提取完整食谱内容，整理为标准SOP文档。\n\n输入特征：可能是 Word/PDF/图片 OCR 文本，可能含格式杂讯、乱码、扫描错误，也可能已是半结构化文档。\n\n提取策略：\n- 格式清洗：去除页眉页脚、水印文字、行号等非内容标记\n- 结构识别：自动检测原文是否已分段（食材清单/步骤/工具），提取已有结构，不重复包装\n- 表格还原：如原文为表格形式，直接映射到输出模板对应列\n- 数值校对：扫描出的数字（尤其是 0/O、1/l、6/8 等混用）结合上下文纠正；如「30O克」→「300克」\n- 乱码处理：明显 OCR 错误的文本结合烹饪常识修正，无法修正的标注「原文模糊」\n\n铁律：不得新增文件没有的食材或步骤；无法辨识的内容标注「原文模糊」而非编造；所有可辨识的数值精确保留。', skill: '## 菜名\n**菜名**：\n**菜系**：\n**成品特征**：\n**出品标准**：\n**记录日期**：\n**制作人/来源**：\n\n### 一、食材清单\n| 序号 | 用途 | 食材名称 | 用量 | 处理方式 | 备注 |\n|------|------|----------|------|----------|------|\n| 1 | 主料 | | | | |\n| 2 | 辅料 | | | | |\n| 3 | 调料 | | | | |\n\n> **准备要点**：\n\n### 二、工具与器皿\n| 序号 | 用途 | 工具名称 |\n|------|------|----------|\n| 1 | | |\n\n### 三、制作步骤\n| 序号 | 步骤 | 步骤说明 | 关键技巧 |\n|------|------|----------|----------|\n| 1 | 预处理 | | |\n| 2 | 烹饪 | | |\n\n### 四、时间与火候总览\n| 阶段 | 时长 | 火力 | 注意事项 |\n|------|------|------|----------|\n| | | | |\n\n### 五、试吃与品鉴记录\n- **口味**：\n- **口感**：\n- **色泽**：\n\n### 六、总结与评分\n- **难度**：☆\n- **耗时**：\n- **一句话点评**：' },
    ],
  },
  {
    id: 'col2', label: '教学文档', hasTemplate: false, summary: '无模板 · 3 个独立配置项',
    subItems: [
      { id: 'c2-sop', label: 'SOP 文案', prompt: '你是一个SOP撰写专家。请将食谱内容转化为标准操作流程，每一步包含：操作名称、所需工具、操作时间、质量标准。', skill: '# SOP：{菜品名称}\n\n## 准备工作\n| 项目 | 规格 |\n\n## 操作步骤\n### 步骤1：{名称}\n- 时间：\n- 标准：' },
      { id: 'c2-dao', label: '道与术文案', prompt: '你是国家级烹饪大师、食品科学家、美食技术专家。请对上传的食谱SOP进行"道与术"深度解析。\n\n核心规则：\n1. 根据SOP实际内容，自动识别并提炼3~5个核心烹饪原理，每个命名为"XX之道"（如：火之道、脆之道、发之道、去腥之道、时之道、色之道、层次之道等），名称需准确概括原理内涵\n2. 每个"道"需说明：SOP中的体现、背后的科学原理或经验法则、违反的后果\n3. 术的部分用表格列出关键操作步骤及参数、手法、目的\n4. 第二节提炼"通用流程"，适用于同类食材或工艺，包含：道术结合表、分步操作卡、主料替换调整、常见问题纠偏、扩展应用\n5. 所有数据（重量、温度、时间）必须来源于SOP原文，缺失处标注"SOP未提供，建议为……"\n6. 输出Markdown格式，表格对齐，语言专业清晰', skill: '# {菜品名称} — 道与术解析\n\n## 前端说明\n本文从"道"（烹饪原理）与"术"（操作技法）两个维度解读 `{菜品名称}` SOP，并提炼通用流程。\n\n---\n\n## 第一节：{菜品名称} SOP 的道与术\n\n### 一、道（烹饪理念与原理）\n\n#### {XX之道}\n- **SOP体现**：\n- **科学原理**：\n- **违反后果**：\n\n> 根据SOP实际内容提炼3~5个"道"\n\n### 二、术（具体操作技法）\n\n| 操作步骤 | 关键参数与手法 | 技术目的 |\n|---------|-------------|---------|\n| | | |\n\n---\n\n## 第二节：{工艺类型}通用流程\n\n### 一、道术结合总览\n\n| 阶段 | 核心道 | 关键术 | 可调参数 |\n|------|-------|-------|---------|\n| | | | |\n\n### 二、分步操作卡\n\n1. **选料与预处理**\n2. **腌制/调味**\n3. **挂浆/裹粉/静置**（如适用）\n4. **核心熟制工艺**\n5. **装盘与点缀**\n\n### 三、主料替换调整\n\n| 主料 | 预处理差异 | 调味调整 | 熟制时间变化 |\n|------|----------|---------|------------|\n| | | | |\n\n### 四、常见问题与纠偏\n\n| 问题 | 原因 | 解决方法 |\n|------|------|---------|\n| | | |\n\n### 五、扩展应用\n\n- 空气炸锅：\n- 烤箱：\n- 慢炖：\n\n---\n\n> 本文基于上传的 SOP 整理，保留原技术细节，仅作结构重组与原理提炼。\n' },
      { id: 'c2-yanxi', label: '研学手册文案', prompt: '你是一个教学设计专家。请将食谱内容编写为研学手册，适合教学使用。', skill: '# 研学手册：{菜品名称}\n\n## 学习目标\n1. \n\n## 背景知识\n\n## 实操步骤' },
    ],
  },
  {
    id: 'col3', label: '标准SOP', hasTemplate: true, summary: '有模板 · 1 个配置项',
    subItems: [
      { id: 'c3-sop', label: 'SOP 生成+导出', prompt: '你是一个餐饮标准化专家。请根据食谱笔记，编写一份「食谱标准化操作流程（SOP）」。', skill: '| 步骤 | 操作 | 标准 | 备注 |\n|------|------|------|------|\n| 1 | | | |' },
    ],
  },
  {
    id: 'col4', label: '合成PPT', hasTemplate: true, summary: '有模板 · 2 个配置项',
    subItems: [
      { id: 'c4-dao', label: '道与术 PPT', prompt: '你是一个PPT内容设计专家。请将道与术分析文案转化为PPT大纲，每页一个核心观点。', skill: '## 标题页\n- 标题：\n- 副标题：\n\n## 内容页 (×3-5)' },
      { id: 'c4-yanxi', label: '研学手册 PPT', prompt: '你是一个教学PPT设计专家。请将研学手册内容转化为PPT，图文并茂，适合教学展示。', skill: '## 封面\n- 标题：\n\n## 教学页 (×5-8)\n- 知识点：' },
    ],
  },
  {
    id: 'col5', label: '口播文案', hasTemplate: false, summary: '无模板 · 1 个配置项',
    subItems: [
      { id: 'c5-koubo', label: '口播稿生成', prompt: '你是一个短视频口播稿专家。请根据研学手册内容生成口播稿，风格亲切自然。', skill: '# 口播稿\n\n【开场】\n\n【核心内容】\n\n【结尾互动】' },
    ],
  },
  {
    id: 'col6', label: '语音合成', hasTemplate: false, summary: '音色库管理 · 自定义音色',
    subItems: [],
  },
]

export default function ProjSettingsPage() {
  const modal = useModal()
  const [mainTab, setMainTab] = useState<MainTab>('models')
  const [providers, setProviders] = useState<any[]>([])
  const [prompts, setPrompts] = useState<Prompt[]>([])

  // Accordion state
  const [openCols, setOpenCols] = useState<Set<string>>(new Set())

  // Prompt modals
  const [showPromptForm, setShowPromptForm] = useState(false)
  const [editPromptId, setEditPromptId] = useState<string | null>(null)
  const [pfName, setPfName] = useState('')
  const [pfCat, setPfCat] = useState('')
  const [pfSystem, setPfSystem] = useState('')
  const [pfSkill, setPfSkill] = useState('')
  const [pfNote, setPfNote] = useState('')
  const [pfSaving, setPfSaving] = useState(false)
  const [showVersions, setShowVersions] = useState<{ promptName: string; versions: PromptVersion[] } | null>(null)

  // Template modals
  const [showTmplForm, setShowTmplForm] = useState(false)
  const [editTmplId, setEditTmplId] = useState<string | null>(null)
  const [tfName, setTfName] = useState('')
  const [tfType, setTfType] = useState('ppt')
  const [tfSkill, setTfSkill] = useState('')
  const [tfSaving, setTfSaving] = useState(false)
  const [templates, setTemplates] = useState<any[]>([])

  // Provider form
  const [showProviderForm, setShowProviderForm] = useState(false)
  const [editProviderId, setEditProviderId] = useState<string | null>(null)
  const [pvName, setPvName] = useState('')
  const [pvKey, setPvKey] = useState('')
  const [pvUrl, setPvUrl] = useState('')
  const [pvModels, setPvModels] = useState('')
  const [pvSaving, setPvSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)

  // TTS state
  const [ttsProviders, setTtsProviders] = useState<any[]>([])
  const [showTtsProviderForm, setShowTtsProviderForm] = useState(false)
  const [editTtsProviderId, setEditTtsProviderId] = useState<string | null>(null)
  const [tpvName, setTpvName] = useState('')
  const [tpvKey, setTpvKey] = useState('')
  const [tpvUrl, setTpvUrl] = useState('')
  const [tpvModels, setTpvModels] = useState('')
  const [tpvDefault, setTpvDefault] = useState(false)
  const [tpvSaving, setTpvSaving] = useState(false)
  const [ttsTestingId, setTtsTestingId] = useState<string | null>(null)

  // Voice state
  const [voices, setVoices] = useState<Voice[]>([])
  const [showVoiceForm, setShowVoiceForm] = useState(false)
  const [editVoiceId, setEditVoiceId] = useState<string | null>(null)
  const [vfName, setVfName] = useState('')
  const [vfProviderId, setVfProviderId] = useState('')
  const [vfVoiceId, setVfVoiceId] = useState('')
  const [vfDesc, setVfDesc] = useState('')
  const [vfDefault, setVfDefault] = useState(false)
  const [vfSaving, setVfSaving] = useState(false)
  const [previewingId, setPreviewingId] = useState<string | null>(null)

  // ASR Provider state
  const [asrProviders, setAsrProviders] = useState<any[]>([])
  const [showAsrProviderForm, setShowAsrProviderForm] = useState(false)
  const [editAsrProviderId, setEditAsrProviderId] = useState<string | null>(null)
  const [apvName, setApvName] = useState('')
  const [apvKey, setApvKey] = useState('')
  const [apvUrl, setApvUrl] = useState('')
  const [apvModels, setApvModels] = useState('')
  const [apvDefault, setApvDefault] = useState(false)
  const [apvSaving, setApvSaving] = useState(false)
  const [asrTestingId, setAsrTestingId] = useState<string | null>(null)

  const load = () => {
    api.listProviders().then(setProviders).catch(() => {})
    api.listPrompts().then(setPrompts).catch(() => {})
    api.listTemplates().then(setTemplates).catch(() => {})
    api.listTtsProviders().then(setTtsProviders).catch(() => {})
    api.listVoices().then(setVoices).catch(() => {})
    api.listAsrProviders().then(setAsrProviders).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const toggleCol = (id: string) => {
    setOpenCols(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ── Prompt actions ──
  const openNewPrompt = () => {
    setEditPromptId(null); setPfName(''); setPfCat('')
    setPfSystem(''); setPfSkill(''); setPfNote('')
    setShowPromptForm(true)
  }
  const openEditPrompt = (p: Prompt) => {
    setEditPromptId(p.id); setPfName(p.name); setPfCat(p.category)
    setPfSystem((p as any).system_prompt || ''); setPfSkill((p as any).skill_template || '')
    setPfNote(''); setShowPromptForm(true)
  }
  const savePrompt = async () => {
    if (!pfName.trim() || !pfCat.trim()) return
    setPfSaving(true)
    try {
      if (editPromptId) {
        await api.updatePrompt(editPromptId, { name: pfName, category: pfCat, system_prompt: pfSystem || undefined, skill_template: pfSkill || undefined, change_note: pfNote || undefined })
      } else {
        await api.createPrompt({ name: pfName, category: pfCat, system_prompt: pfSystem, skill_template: pfSkill })
      }
      setShowPromptForm(false); load()
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setPfSaving(false) }
  }
  const deletePrompt = async (id: string) => {
    const ok = await modal.confirm('确定删除此提示词？')
    if (!ok) return
    try { await api.deletePrompt(id); load() } catch (e: any) { modal.toast('删除失败: ' + e.message, 'error') }
  }
  const viewVersions = async (p: Prompt) => {
    try {
      const versions = await api.getPromptVersions(p.id)
      setShowVersions({ promptName: p.name, versions })
    } catch (e: any) { modal.toast('获取版本失败: ' + e.message, 'error') }
  }

  // ── Template actions ──
  const openNewTmpl = () => {
    setEditTmplId(null); setTfName(''); setTfType('ppt'); setTfSkill('')
    setShowTmplForm(true)
  }
  const saveTmpl = async () => {
    if (!tfName.trim()) return
    setTfSaving(true)
    try {
      if (editTmplId) {
        await api.updateTemplate(editTmplId, { name: tfName, type: tfType, linked_skill_id: tfSkill || undefined } as any)
      } else {
        await api.createTemplate({ name: tfName, type: tfType, linked_skill_id: tfSkill || undefined })
      }
      setShowTmplForm(false); load()
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setTfSaving(false) }
  }
  const deleteTmpl = async (id: string) => {
    const ok = await modal.confirm('确定删除此模板？')
    if (!ok) return
    try { await api.deleteTemplate(id); load() } catch (e: any) { modal.toast('删除失败: ' + e.message, 'error') }
  }
  const downloadTmpl = (t: any) => {
    const a = document.createElement('a')
    a.href = '/api/download/' + encodeURIComponent(t.file_path || t.name)
    a.download = t.file_path || t.name
    a.click()
  }

  // ── Provider actions ──
  const openEditProvider = (p: any) => {
    setEditProviderId(p.id)
    setPvName(p.name || '')
    setPvKey(p.api_key || '')
    setPvUrl(p.base_url || '')
    setPvModels(Array.isArray(p.models) ? p.models.join(', ') : (p.models || ''))
    setShowProviderForm(true)
  }
  const openNewProvider = () => {
    setEditProviderId(null)
    setPvName('')
    setPvKey('')
    setPvUrl('https://api.deepseek.com/v1')
    setPvModels('deepseek-chat, deepseek-reasoner')
    setShowProviderForm(true)
  }
  const saveProvider = async () => {
    if (!pvName.trim()) { modal.toast('请输入名称', 'error'); return }
    setPvSaving(true)
    try {
      const models = pvModels.split(',').map((s: string) => s.trim()).filter(Boolean)
      if (editProviderId) {
        await api.updateProvider(editProviderId, { name: pvName.trim(), api_key: pvKey, base_url: pvUrl, models })
      } else {
        await api.createProvider({ name: pvName.trim(), api_key: pvKey, base_url: pvUrl, models })
      }
      await api.listProviders().then(setProviders)
      setShowProviderForm(false)
      modal.toast(editProviderId ? '提供商已更新' : '提供商已添加', 'success')
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setPvSaving(false) }
  }
  const testProvider = async (id: string) => {
    setTestingId(id)
    try {
      const result: any = await api.testProvider(id)
      if (result.ok) {
        modal.toast(`连接成功 (${(result.models || []).length} 个模型可用)`, 'success')
      } else {
        modal.toast('连接失败: ' + (result.error || '未知错误'), 'error')
      }
    } catch (e: any) { modal.toast('测试失败: ' + e.message, 'error') }
    finally { setTestingId(null) }
  }
  const deleteProvider = async (id: string, name: string) => {
    const ok = await modal.confirm(`确定删除提供商「${name}」？`)
    if (!ok) return
    try {
      await api.deleteProvider(id)
      await api.listProviders().then(setProviders)
      modal.toast('已删除', 'success')
    } catch (e: any) { modal.toast('删除失败: ' + e.message, 'error') }
  }

  // ── TTS Provider actions ──
  const openNewTtsProvider = () => {
    setEditTtsProviderId(null)
    setTpvName('')
    setTpvKey('')
    setTpvUrl('https://dashscope.aliyuncs.com/api/v1')
    setTpvModels('cosyvoice-v3-flash, cosyvoice-v3-plus')
    setTpvDefault(false)
    setShowTtsProviderForm(true)
  }
  const openEditTtsProvider = (p: any) => {
    setEditTtsProviderId(p.id)
    setTpvName(p.name || '')
    setTpvKey(p.api_key || '')
    setTpvUrl(p.base_url || '')
    setTpvModels(Array.isArray(p.models) ? p.models.join(', ') : (p.models || ''))
    setTpvDefault(!!p.is_default)
    setShowTtsProviderForm(true)
  }
  const saveTtsProvider = async () => {
    if (!tpvName.trim()) { modal.toast('请输入名称', 'error'); return }
    setTpvSaving(true)
    try {
      const models = tpvModels.split(',').map((s: string) => s.trim()).filter(Boolean)
      if (editTtsProviderId) {
        await api.updateTtsProvider(editTtsProviderId, { name: tpvName.trim(), api_key: tpvKey, base_url: tpvUrl, models, is_default: tpvDefault ? 1 : 0 })
      } else {
        await api.createTtsProvider({ name: tpvName.trim(), api_key: tpvKey, base_url: tpvUrl, models, is_default: tpvDefault ? 1 : 0 })
      }
      await api.listTtsProviders().then(setTtsProviders)
      setShowTtsProviderForm(false)
      modal.toast(editTtsProviderId ? 'TTS 提供商已更新' : 'TTS 提供商已添加', 'success')
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setTpvSaving(false) }
  }
  const testTtsProvider = async (id: string) => {
    setTtsTestingId(id)
    try {
      const result: any = await api.testTtsProvider(id)
      if (result.ok) {
        modal.toast('TTS 连接成功', 'success')
      } else {
        modal.toast('TTS 连接失败: ' + (result.error || '未知错误'), 'error')
      }
    } catch (e: any) { modal.toast('测试失败: ' + e.message, 'error') }
    finally { setTtsTestingId(null) }
  }
  const deleteTtsProvider = async (id: string, name: string) => {
    const ok = await modal.confirm(`确定删除 TTS 提供商「${name}」？`)
    if (!ok) return
    try {
      await api.deleteTtsProvider(id)
      await api.listTtsProviders().then(setTtsProviders)
      modal.toast('已删除', 'success')
    } catch (e: any) { modal.toast('删除失败: ' + e.message, 'error') }
  }

  // ── Voice actions ──
  const openNewVoice = () => {
    setEditVoiceId(null)
    setVfName('')
    setVfProviderId(ttsProviders[0]?.id || '')
    setVfVoiceId('')
    setVfDesc('')
    setVfDefault(false)
    setShowVoiceForm(true)
  }
  const openEditVoice = (v: Voice) => {
    setEditVoiceId(v.id)
    setVfName(v.name)
    setVfProviderId(v.provider_id)
    setVfVoiceId(v.voice_id)
    setVfDesc(v.description || '')
    setVfDefault(!!v.is_default)
    setShowVoiceForm(true)
  }
  const saveVoice = async () => {
    if (!vfName.trim() || !vfProviderId || !vfVoiceId.trim()) {
      modal.toast('请填写名称、提供商和音色ID', 'error'); return
    }
    setVfSaving(true)
    try {
      if (editVoiceId) {
        await api.updateVoice(editVoiceId, { name: vfName.trim(), provider_id: vfProviderId, voice_id: vfVoiceId.trim(), description: vfDesc, is_default: vfDefault ? 1 : 0 })
      } else {
        await api.createVoice({ name: vfName.trim(), provider_id: vfProviderId, voice_id: vfVoiceId.trim(), description: vfDesc, is_default: vfDefault ? 1 : 0 })
      }
      await api.listVoices().then(setVoices)
      setShowVoiceForm(false)
      modal.toast(editVoiceId ? '音色已更新' : '音色已添加', 'success')
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setVfSaving(false) }
  }
  const previewVoice = async (id: string) => {
    setPreviewingId(id)
    try {
      const result: any = await api.previewVoice(id)
      if (result.audio_url) {
        const audio = new Audio(result.audio_url)
        await audio.play()
      } else {
        modal.toast('预览失败: 未获取到音频', 'error')
      }
    } catch (e: any) { modal.toast('预览失败: ' + e.message, 'error') }
    finally { setPreviewingId(null) }
  }
  const deleteVoice = async (id: string, name: string) => {
    const ok = await modal.confirm(`确定删除音色「${name}」？`)
    if (!ok) return
    try {
      await api.deleteVoice(id)
      await api.listVoices().then(setVoices)
      modal.toast('已删除', 'success')
    } catch (e: any) { modal.toast('删除失败: ' + e.message, 'error') }
  }

  // ── ASR Provider actions ──
  const openNewAsrProvider = () => {
    setEditAsrProviderId(null)
    setApvName('')
    setApvKey('')
    setApvUrl('https://dashscope.aliyuncs.com')
    setApvModels('fun-asr, qwen3-asr-flash')
    setApvDefault(false)
    setShowAsrProviderForm(true)
  }
  const openEditAsrProvider = (p: any) => {
    setEditAsrProviderId(p.id)
    setApvName(p.name || '')
    setApvKey(p.api_key || '')
    setApvUrl(p.base_url || '')
    setApvModels(Array.isArray(p.models) ? p.models.join(', ') : (p.models || ''))
    setApvDefault(!!p.is_default)
    setShowAsrProviderForm(true)
  }
  const saveAsrProvider = async () => {
    if (!apvName.trim()) { modal.toast('请输入名称', 'error'); return }
    setApvSaving(true)
    try {
      const models = apvModels.split(',').map((s: string) => s.trim()).filter(Boolean)
      if (editAsrProviderId) {
        await api.updateAsrProvider(editAsrProviderId, { name: apvName.trim(), api_key: apvKey, base_url: apvUrl, models, is_default: apvDefault ? 1 : 0 })
      } else {
        await api.createAsrProvider({ name: apvName.trim(), api_key: apvKey, base_url: apvUrl, models, is_default: apvDefault ? 1 : 0 })
      }
      await api.listAsrProviders().then(setAsrProviders)
      setShowAsrProviderForm(false)
      modal.toast(editAsrProviderId ? 'ASR 提供商已更新' : 'ASR 提供商已添加', 'success')
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setApvSaving(false) }
  }
  const testAsrProvider = async (id: string) => {
    setAsrTestingId(id)
    try {
      const result: any = await api.testAsrProvider(id)
      if (result.ok) {
        modal.toast('ASR 连接成功', 'success')
      } else {
        modal.toast('ASR 连接失败: ' + (result.error || '未知错误'), 'error')
      }
    } catch (e: any) { modal.toast('测试失败: ' + e.message, 'error') }
    finally { setAsrTestingId(null) }
  }
  const deleteAsrProvider = async (id: string, name: string) => {
    const ok = await modal.confirm(`确定删除 ASR 提供商「${name}」？`)
    if (!ok) return
    try {
      await api.deleteAsrProvider(id)
      await api.listAsrProviders().then(setAsrProviders)
      modal.toast('已删除', 'success')
    } catch (e: any) { modal.toast('删除失败: ' + e.message, 'error') }
  }

  return (
    <div>
      {/* Tab Bar — mgmt-tabs style */}
      <div className="mgmt-tabs">
        <button className={`mgmt-tab${mainTab === 'models' ? ' active' : ''}`}
          onClick={() => setMainTab('models')}>模型设置</button>
        <button className={`mgmt-tab${mainTab === 'columns' ? ' active' : ''}`}
          onClick={() => setMainTab('columns')}>栏目配置</button>
      </div>
      <div className="mgmt-content">

        {/* ═══ Tab: 模型设置 ═══ */}
        {mainTab === 'models' && (
          <div>
              <div>
                <table className="output-table" style={{ marginBottom: 8, tableLayout: 'fixed' }}>
                  <colgroup><col width="16%" /><col width="44%" /><col width="10%" /><col width="30%" /></colgroup>
                  <thead><tr><th>名称</th><th>Base URL</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {providers.map((p: any) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td style={{ fontSize: 11 }}>{p.base_url}</td>
                        <td style={{ color: p.is_enabled ? 'var(--success)' : 'var(--text-secondary)' }}>
                          {p.is_enabled ? '已连接' : '未配置'}
                        </td>
                        <td style={{ display: 'flex', gap: 5 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => testProvider(p.id)}
                            disabled={testingId === p.id}>
                            {testingId === p.id ? '测试中...' : '测试'}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEditProvider(p)}>编辑</button>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}
                              onClick={() => deleteProvider(p.id, p.name)}>删除</button>
                        </td>
                      </tr>
                    ))}
                    {providers.length === 0 && (
                      <tr><td colSpan={4} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>暂无提供商，请在「全局设置」中添加</td></tr>
                    )}
                  </tbody>
                </table>
                <button className="btn btn-outline btn-sm" style={{ marginBottom: 12 }} onClick={openNewProvider}>+ 添加 LLM 提供商</button>

                {/* TTS Providers */}
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>TTS 语音提供商</div>
                  <table className="output-table" style={{ marginBottom: 8, tableLayout: 'fixed' }}>
                    <colgroup><col width="16%" /><col width="44%" /><col width="10%" /><col width="30%" /></colgroup>
                    <thead><tr><th>名称</th><th>Base URL</th><th>状态</th><th>操作</th></tr></thead>
                    <tbody>
                      {ttsProviders.map((p: any) => (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td style={{ fontSize: 11 }}>{p.base_url}</td>
                          <td style={{ color: p.is_enabled ? 'var(--success)' : 'var(--text-secondary)' }}>
                            {p.is_enabled ? '已连接' : '未配置'}
                          </td>
                          <td style={{ display: 'flex', gap: 5 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => testTtsProvider(p.id)}
                              disabled={ttsTestingId === p.id}>
                              {ttsTestingId === p.id ? '测试中...' : '测试'}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => openEditTtsProvider(p)}>编辑</button>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}
                              onClick={() => deleteTtsProvider(p.id, p.name)}>删除</button>
                          </td>
                        </tr>
                      ))}
                      {ttsProviders.length === 0 && (
                        <tr><td colSpan={4} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>暂无 TTS 提供商</td></tr>
                      )}
                    </tbody>
                  </table>
                  <button className="btn btn-outline btn-sm" style={{ marginBottom: 12 }} onClick={openNewTtsProvider}>+ 添加 TTS 提供商</button>

                  {/* ASR Providers */}
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>ASR 语音识别提供商</div>
                    <table className="output-table" style={{ marginBottom: 8, tableLayout: 'fixed' }}>
                      <colgroup><col width="16%" /><col width="44%" /><col width="10%" /><col width="30%" /></colgroup>
                      <thead><tr><th>名称</th><th>Base URL</th><th>状态</th><th>操作</th></tr></thead>
                      <tbody>
                        {asrProviders.map((p: any) => (
                          <tr key={p.id}>
                            <td>{p.name}</td>
                            <td style={{ fontSize: 11 }}>{p.base_url}</td>
                            <td style={{ color: p.is_enabled ? 'var(--success)' : 'var(--text-secondary)' }}>
                              {p.is_enabled ? '已连接' : '未配置'}
                            </td>
                            <td style={{ display: 'flex', gap: 5 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => testAsrProvider(p.id)}
                                disabled={asrTestingId === p.id}>
                                {asrTestingId === p.id ? '测试中...' : '测试'}
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => openEditAsrProvider(p)}>编辑</button>
                              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}
                                onClick={() => deleteAsrProvider(p.id, p.name)}>删除</button>
                            </td>
                          </tr>
                        ))}
                        {asrProviders.length === 0 && (
                          <tr><td colSpan={4} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>暂无 ASR 提供商</td></tr>
                        )}
                      </tbody>
                    </table>
                    <button className="btn btn-outline btn-sm" style={{ marginBottom: 12 }} onClick={openNewAsrProvider}>+ 添加 ASR 提供商</button>
                  </div>
                </div>
              </div>
          </div>
        )}

        {/* ═══ Tab: 栏目配置 ═══ */}
        {mainTab === 'columns' && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 10 }}>
              每个栏目配置模板/提示词/SKILL，新建项目时按栏目调取默认配置。有模板的栏目上传模板后AI自动分析生成提示词+SKILL，无模板的栏目直接手写。
            </div>

            {COLUMNS.map(col => (
              <div key={col.id} className={`ac-group${openCols.has(col.id) ? ' open' : ''}`}>
                <div className="ac-head" onClick={() => toggleCol(col.id)}>
                  <span className={`ac-num${!col.hasTemplate ? ' no-tmpl' : ''}`}>{col.id.slice(-1)}</span>
                  <span className="ac-title">{col.label}</span>
                  <span className="ac-summary">{col.summary}</span>
                  <span className="ac-arrow">▼</span>
                </div>
                <div className="ac-body">
                  {col.id === 'col6' ? (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        管理自定义音色，合成语音时从音色库中选择。每个音色关联一个 TTS 提供商。
                      </div>
                      <table className="output-table" style={{ marginBottom: 8, tableLayout: 'fixed' }}>
                        <colgroup><col width="20%" /><col width="20%" /><col width="20%" /><col width="10%" /><col width="30%" /></colgroup>
                        <thead><tr><th>名称</th><th>提供商</th><th>音色 ID</th><th>默认</th><th>操作</th></tr></thead>
                        <tbody>
                          {voices.map((v: Voice) => {
                            const provider = ttsProviders.find(p => p.id === v.provider_id)
                            return (
                              <tr key={v.id}>
                                <td style={{ fontWeight: 600 }}>{v.name}</td>
                                <td style={{ fontSize: 11 }}>{provider?.name || v.provider_id}</td>
                                <td style={{ fontSize: 11 }}>{v.voice_id}</td>
                                <td>{v.is_default ? '✓' : ''}</td>
                                <td style={{ display: 'flex', gap: 5 }}>
                                  <button className="btn btn-ghost btn-sm" onClick={() => previewVoice(v.id)}
                                    disabled={previewingId === v.id}>
                                    {previewingId === v.id ? '...' : '▶'}
                                  </button>
                                  <button className="btn btn-ghost btn-sm" onClick={() => openEditVoice(v)}>编辑</button>
                                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}
                                    onClick={() => deleteVoice(v.id, v.name)}>删除</button>
                                </td>
                              </tr>
                            )
                          })}
                          {voices.length === 0 && (
                            <tr><td colSpan={5} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>暂无自定义音色，请添加</td></tr>
                          )}
                        </tbody>
                      </table>
                      <button className="btn btn-outline btn-sm" onClick={openNewVoice}>+ 添加音色</button>
                    </div>
                  ) : col.subItems.length === 0 ? (
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', padding: '4px 0' }}>
                      CosyVoice TTS 引擎，无需配置提示词和 SKILL。音色和语速在「模型设置」→「TTS 语音」中统一配置。
                    </div>
                  ) : (
                    col.subItems.map(sub => (
                      <div key={sub.id} className="ac-sub-item">
                        <div className="ac-sub-item-header">{sub.label}</div>
                        <div className="ac-field-row">
                          <div className="ac-field">
                            <label>提示词</label>
                            <textarea defaultValue={sub.prompt} />
                          </div>
                          <div className="ac-field">
                            <label>SKILL 输出格式</label>
                            <textarea defaultValue={sub.skill} />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {col.hasTemplate && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>模板文件：</span>
                      <span style={{ fontSize: 10, fontWeight: 600 }}>
                        {col.id === 'col3' ? 'SOP标准模板.docx' : col.id === 'col4' ? '道与术PPT模板.pptx / 研学手册PPT模板.pptx' : ''}
                      </span>
                      <button className="btn btn-ghost btn-sm">替换</button>
                      <button className="btn btn-ghost btn-sm">下载</button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* 提示词快速管理入口 */}
            <div style={{ marginTop: 16, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>提示词库</span>
                <button className="btn btn-primary btn-sm" onClick={openNewPrompt}>+ 新建提示词</button>
              </div>
              <table className="output-table">
                <thead><tr><th>名称</th><th>分类</th><th>当前版本</th><th>默认</th><th>操作</th></tr></thead>
                <tbody>
                  {prompts.map((p: any) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>{p.category}</td>
                      <td>{p.current_version || 'v1.0'}</td>
                      <td>{p.is_default ? '✓' : ''}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditPrompt(p)}>编辑</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => viewVersions(p)}>版本</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }} onClick={() => deletePrompt(p.id)}>删除</button>
                      </td>
                    </tr>
                  ))}
                  {prompts.length === 0 && (
                    <tr><td colSpan={5} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>暂无提示词</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 模板快速管理入口 */}
            <div style={{ marginTop: 16, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>模板库</span>
                <button className="btn btn-primary btn-sm" onClick={openNewTmpl}>+ 新建模板</button>
              </div>
              <table className="output-table">
                <thead><tr><th>名称</th><th>类型</th><th>关联 Skill</th><th>默认</th><th>操作</th></tr></thead>
                <tbody>
                  {templates.map((t: any) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.name}</td>
                      <td>{t.type === 'ppt' ? 'PPT' : t.type === 'sop' ? 'SOP' : t.type}</td>
                      <td style={{ fontSize: 12 }}>{t.linked_skill_id || '—'}</td>
                      <td>{t.is_default ? '✓' : ''}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => downloadTmpl(t)}>下载</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }} onClick={() => deleteTmpl(t.id)}>删除</button>
                      </td>
                    </tr>
                  ))}
                  {templates.length === 0 && (
                    <tr><td colSpan={5} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>暂无模板</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Prompt Form Modal ═══ */}
      {showPromptForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowPromptForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 500 }}>
            <div className="dialog-title">{editPromptId ? '编辑提示词' : '新建提示词'}</div>
            <div className="form-label">名称</div>
            <input className="form-input" value={pfName} onChange={e => setPfName(e.target.value)} placeholder="提示词名称" />
            <div className="form-label" style={{ marginTop: 12 }}>分类</div>
            <select className="form-select" value={pfCat} onChange={e => setPfCat(e.target.value)}>
              <option value="">选择分类...</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="form-label" style={{ marginTop: 12 }}>System Prompt</div>
            <textarea className="form-textarea" rows={4} value={pfSystem} onChange={e => setPfSystem(e.target.value)} placeholder="系统提示词..." />
            <div className="form-label" style={{ marginTop: 12 }}>Skill Template</div>
            <textarea className="form-textarea" rows={4} value={pfSkill} onChange={e => setPfSkill(e.target.value)} placeholder="输出格式模板..." />
            {editPromptId && (
              <>
                <div className="form-label" style={{ marginTop: 12 }}>变更说明</div>
                <input className="form-input" value={pfNote} onChange={e => setPfNote(e.target.value)} placeholder="此次修改的说明（可选）" />
              </>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPromptForm(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={savePrompt} disabled={pfSaving}>{pfSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Version History Modal ═══ */}
      {showVersions && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowVersions(null) }}>
          <div className="dialog-box" style={{ minWidth: 500 }}>
            <div className="dialog-title">版本历史 — {showVersions.promptName}</div>
            <table className="output-table">
              <thead><tr><th>版本</th><th>变更说明</th><th>时间</th></tr></thead>
              <tbody>
                {showVersions.versions.map((v: PromptVersion) => (
                  <tr key={v.version}>
                    <td style={{ fontWeight: 600 }}>{v.version}</td>
                    <td style={{ fontSize: 12 }}>{v.change_note || '—'}</td>
                    <td style={{ fontSize: 11 }}>{v.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowVersions(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Template Form Modal ═══ */}
      {showTmplForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowTmplForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 420 }}>
            <div className="dialog-title">{editTmplId ? '编辑模板' : '新建模板'}</div>
            <div className="form-label">名称</div>
            <input className="form-input" value={tfName} onChange={e => setTfName(e.target.value)} placeholder="模板名称" />
            <div className="form-label" style={{ marginTop: 12 }}>类型</div>
            <select className="form-select" value={tfType} onChange={e => setTfType(e.target.value)}>
              <option value="ppt">PPT</option>
              <option value="sop">SOP</option>
            </select>
            <div className="form-label" style={{ marginTop: 12 }}>关联 Skill</div>
            <select className="form-select" value={tfSkill} onChange={e => setTfSkill(e.target.value)}>
              <option value="">无</option>
              {prompts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.category})</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowTmplForm(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={saveTmpl} disabled={tfSaving}>{tfSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Provider Form Modal ═══ */}
      {showProviderForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowProviderForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 480 }}>
            <div className="dialog-title">{editProviderId ? '编辑提供商' : '添加 LLM 提供商'}</div>
            <div className="form-label">名称</div>
            <input className="form-input" value={pvName} onChange={e => setPvName(e.target.value)} placeholder="如 DeepSeek" autoFocus />
            <div className="form-label" style={{ marginTop: 12 }}>API Key</div>
            <input className="form-input" value={pvKey} onChange={e => setPvKey(e.target.value)} placeholder="sk-..." />
            <div className="form-label" style={{ marginTop: 12 }}>Base URL</div>
            <input className="form-input" value={pvUrl} onChange={e => setPvUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" />
            <div className="form-label" style={{ marginTop: 12 }}>模型列表（逗号分隔）</div>
            <input className="form-input" value={pvModels} onChange={e => setPvModels(e.target.value)} placeholder="deepseek-chat, deepseek-reasoner" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowProviderForm(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={saveProvider} disabled={pvSaving}>{pvSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TTS Provider Form Modal ═══ */}
      {showTtsProviderForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowTtsProviderForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 480 }}>
            <div className="dialog-title">{editTtsProviderId ? '编辑 TTS 提供商' : '添加 TTS 提供商'}</div>
            <div className="form-label">名称</div>
            <input className="form-input" value={tpvName} onChange={e => setTpvName(e.target.value)} placeholder="如 DashScope" autoFocus />
            <div className="form-label" style={{ marginTop: 12 }}>API Key</div>
            <input className="form-input" value={tpvKey} onChange={e => setTpvKey(e.target.value)} placeholder="sk-..." />
            <div className="form-label" style={{ marginTop: 12 }}>Base URL</div>
            <input className="form-input" value={tpvUrl} onChange={e => setTpvUrl(e.target.value)} placeholder="https://dashscope.aliyuncs.com/api/v1" />
            <div className="form-label" style={{ marginTop: 12 }}>模型列表（逗号分隔）</div>
            <input className="form-input" value={tpvModels} onChange={e => setTpvModels(e.target.value)} placeholder="cosyvoice-v3-flash, cosyvoice-v3-plus" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={tpvDefault} onChange={e => setTpvDefault(e.target.checked)} />
              <span style={{ fontSize: 12 }}>设为默认提供商</span>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowTtsProviderForm(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={saveTtsProvider} disabled={tpvSaving}>{tpvSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Voice Form Modal ═══ */}
      {showVoiceForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowVoiceForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 420 }}>
            <div className="dialog-title">{editVoiceId ? '编辑音色' : '添加音色'}</div>
            <div className="form-label">名称</div>
            <input className="form-input" value={vfName} onChange={e => setVfName(e.target.value)} placeholder="如 温柔女声" autoFocus />
            <div className="form-label" style={{ marginTop: 12 }}>提供商</div>
            <select className="form-select" value={vfProviderId} onChange={e => setVfProviderId(e.target.value)}>
              <option value="">选择提供商...</option>
              {ttsProviders.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="form-label" style={{ marginTop: 12 }}>音色 ID</div>
            <input className="form-input" value={vfVoiceId} onChange={e => setVfVoiceId(e.target.value)} placeholder="如 longanyang 或克隆音色ID" />
            <div className="form-label" style={{ marginTop: 12 }}>描述（可选）</div>
            <input className="form-input" value={vfDesc} onChange={e => setVfDesc(e.target.value)} placeholder="如 温柔甜美的年轻女声" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={vfDefault} onChange={e => setVfDefault(e.target.checked)} />
              <span style={{ fontSize: 12 }}>设为默认音色</span>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowVoiceForm(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={saveVoice} disabled={vfSaving}>{vfSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ASR Provider Form Modal ═══ */}
      {showAsrProviderForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAsrProviderForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 480 }}>
            <div className="dialog-title">{editAsrProviderId ? '编辑 ASR 提供商' : '添加 ASR 提供商'}</div>
            <div className="form-label">名称</div>
            <input className="form-input" value={apvName} onChange={e => setApvName(e.target.value)} placeholder="如 DashScope" autoFocus />
            <div className="form-label" style={{ marginTop: 12 }}>API Key</div>
            <input className="form-input" value={apvKey} onChange={e => setApvKey(e.target.value)} placeholder="sk-..." />
            <div className="form-label" style={{ marginTop: 12 }}>Base URL</div>
            <input className="form-input" value={apvUrl} onChange={e => setApvUrl(e.target.value)} placeholder="https://dashscope.aliyuncs.com" />
            <div className="form-label" style={{ marginTop: 12 }}>模型列表（逗号分隔）</div>
            <input className="form-input" value={apvModels} onChange={e => setApvModels(e.target.value)} placeholder="fun-asr, qwen3-asr-flash" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={apvDefault} onChange={e => setApvDefault(e.target.checked)} />
              <span style={{ fontSize: 12 }}>设为默认提供商</span>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAsrProviderForm(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={saveAsrProvider} disabled={apvSaving}>{apvSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
