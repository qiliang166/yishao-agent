import { useState, useEffect } from 'react'
import { api, Prompt, PromptVersion } from '../services/api'
import { useModal } from '../components/ModalProvider'

type MainTab = 'models' | 'columns'
type ModelSubTab = 'providers' | 'stageModels'

const CATEGORIES = ['文案提取', '教学文档', 'SOP文案', '标准SOP', '合成PPT', '口播文案']

const STAGE_MODEL_ROWS = [
  { stage: '1. 文案提取', sub: '直接输入', rowspan: 3 },
  { stage: '', sub: '视频链接', rowspan: 0 },
  { stage: '', sub: '导入文件', rowspan: 0 },
  { stage: '2. 教学文档', sub: 'SOP文案', rowspan: 3 },
  { stage: '', sub: '道与术文案', rowspan: 0 },
  { stage: '', sub: '研学手册文案', rowspan: 0 },
  { stage: '3. 标准SOP', sub: 'SOP 生成+导出', rowspan: 1 },
  { stage: '4. 合成PPT', sub: '道与术 PPT', rowspan: 2 },
  { stage: '', sub: '研学手册 PPT', rowspan: 0 },
  { stage: '5. 口播文案', sub: '口播稿生成', rowspan: 1 },
  { stage: '6. 语音合成', sub: 'TTS', rowspan: 1 },
  { stage: '7. 输出列表', sub: '汇总下载', rowspan: 1 },
]

const MODELS = ['DeepSeek (deepseek-v4-pro)', 'DeepSeek (deepseek-chat)', '通义千问 (qwen-plus)', '通义千问 (qwen-max)', 'Kimi (moonshot-v1)']

// Column config accordion data
interface ColumnDef {
  id: string; label: string; hasTemplate: boolean; summary: string
  subItems: { id: string; label: string; prompt: string; skill: string }[]
}
const COLUMNS: ColumnDef[] = [
  {
    id: 'col1', label: '文案提取', hasTemplate: false, summary: '无模板 · 3 个独立配置项',
    subItems: [
      { id: 'c1-text', label: '直接输入', prompt: '你是一个食谱内容整理专家。请将用户输入的食谱笔记整理为结构化格式，包含：菜品名称、主料、配料、调料、步骤。', skill: '## 菜品名称\n{name}\n\n## 主料\n- {ingredient}\n\n## 步骤\n1. {step}' },
      { id: 'c1-video', label: '视频链接', prompt: '你是一个视频内容提取专家。请根据视频字幕整理出完整的食谱内容，去除冗余对话，保留所有关键步骤和用量。', skill: '## 菜品名称\n{name}\n\n## 原料\n- {ingredient}' },
      { id: 'c1-file', label: '导入文件', prompt: '你是一个文件内容解析专家。请从上传的文件中提取完整食谱内容，识别并保留所有数值信息（用量、时间、温度）。', skill: '## 菜品名称\n{name}\n\n## 主料\n- {ingredient}\n\n## 步骤\n1. {step}' },
    ],
  },
  {
    id: 'col2', label: '教学文档', hasTemplate: false, summary: '无模板 · 3 个独立配置项',
    subItems: [
      { id: 'c2-sop', label: 'SOP 文案', prompt: '你是一个SOP撰写专家。请将食谱内容转化为标准操作流程，每一步包含：操作名称、所需工具、操作时间、质量标准。', skill: '# SOP：{菜品名称}\n\n## 准备工作\n| 项目 | 规格 |\n\n## 操作步骤\n### 步骤1：{名称}\n- 时间：\n- 标准：' },
      { id: 'c2-dao', label: '道与术文案', prompt: '你是一个美食文化研究专家。请分析食谱背后的"道"（原理、文化）与"术"（技巧、方法）。', skill: '# {菜品名称} — 道与术\n\n## 道\n- 文化背景：\n- 烹饪哲学：\n\n## 术\n- 技法1：\n- 技法2：' },
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
    id: 'col6', label: '语音合成', hasTemplate: false, summary: 'CosyVoice · 无需提示词',
    subItems: [],
  },
]

export default function ProjSettingsPage() {
  const modal = useModal()
  const [mainTab, setMainTab] = useState<MainTab>('models')
  const [modelSubTab, setModelSubTab] = useState<ModelSubTab>('providers')
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

  const load = () => {
    api.listProviders().then(setProviders).catch(() => {})
    api.listPrompts().then(setPrompts).catch(() => {})
    api.listTemplates().then(setTemplates).catch(() => {})
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
            {/* Sub Tabs */}
            <div className="sub-tabs">
              <button className={`sub-tab${modelSubTab === 'providers' ? ' active' : ''}`}
                onClick={() => setModelSubTab('providers')}>添加厂商</button>
              <button className={`sub-tab${modelSubTab === 'stageModels' ? ' active' : ''}`}
                onClick={() => setModelSubTab('stageModels')}>模型配置</button>
            </div>

            {/* 添加厂商 */}
            {modelSubTab === 'providers' && (
              <div>
                <table className="output-table" style={{ marginBottom: 8 }}>
                  <thead><tr><th>名称</th><th>Base URL</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {providers.map((p: any) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td style={{ fontSize: 11 }}>{p.base_url}</td>
                        <td style={{ color: p.is_enabled ? 'var(--success)' : 'var(--text-secondary)' }}>
                          {p.is_enabled ? '已连接' : '未配置'}
                        </td>
                        <td><button className="btn btn-ghost btn-sm">编辑</button></td>
                      </tr>
                    ))}
                    {providers.length === 0 && (
                      <tr><td colSpan={4} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>暂无提供商，请在「全局设置」中添加</td></tr>
                    )}
                  </tbody>
                </table>
                <button className="btn btn-outline btn-sm" style={{ marginBottom: 12 }}>+ 添加 LLM 提供商</button>

                {/* TTS Config */}
                <div style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 5 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>TTS 语音</div>
                  <div className="settings-row">
                    <label>DashScope API Key</label>
                    <input className="form-input" type="password" value="sk-xxxx****" readOnly />
                    <button className="btn btn-ghost btn-sm">测试</button>
                  </div>
                  <div className="settings-row">
                    <label>默认音色</label>
                    <select className="form-select" style={{ maxWidth: 200 }}>
                      <option>温柔女声</option>
                      <option>沉稳男声</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 模型配置 */}
            {modelSubTab === 'stageModels' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>为每个栏目/子栏目指定默认大模型，新建项目时自动套用，也可在项目中覆盖。</span>
                  <button className="btn btn-outline btn-sm">+ 新建模型配置</button>
                </div>
                <table className="output-table">
                  <thead><tr><th>栏目</th><th>子项</th><th>当前模型</th><th>操作</th></tr></thead>
                  <tbody>
                    {STAGE_MODEL_ROWS.map((row, i) => (
                      <tr key={i}>
                        {row.rowspan > 0 ? <td rowSpan={row.rowspan}><strong>{row.stage}</strong></td> : null}
                        <td>{row.sub}</td>
                        <td>
                          {row.stage === '6. 语音合成' ? (
                            <span style={{ color: 'var(--text-secondary)' }}>CosyVoice (无需选择)</span>
                          ) : row.stage === '7. 输出列表' ? (
                            <span style={{ color: 'var(--text-secondary)' }}>无需配置</span>
                          ) : (
                            <select className="form-select" style={{ fontSize: 10, padding: '2px 4px' }}>
                              {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          )}
                        </td>
                        <td>{row.stage !== '6. 语音合成' && row.stage !== '7. 输出列表' ? <button className="btn btn-ghost btn-sm">测试</button> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                  {col.subItems.length === 0 ? (
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
    </div>
  )
}
