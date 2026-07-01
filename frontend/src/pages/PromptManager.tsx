import { useState, useEffect, useRef, useCallback } from 'react'
import { api, PromptDetail, PromptVersion, DiffResult } from '../services/api'
import { useModal } from '../components/ModalProvider'

const CATEGORIES = ['笔记整理', '道与术分析', '研习手册', 'SOP', '口播稿', 'Note Taking']

// ---------- shared inline style factories ----------

const btnPrimary: React.CSSProperties = {
  background: 'var(--primary)',
  color: '#fff',
  border: 'none',
  padding: '8px 16px',
  borderRadius: 'var(--radius-sm)',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const btnSecondary: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  padding: '6px 14px',
  borderRadius: 'var(--radius-sm)',
  fontSize: '13px',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const btnDanger: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  padding: '6px 14px',
  borderRadius: 'var(--radius-sm)',
  fontSize: '13px',
  color: 'var(--primary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const inputField: React.CSSProperties = {
  width: '100%',
  height: '36px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '0 10px',
  fontSize: '14px',
  fontFamily: 'inherit',
  color: 'var(--text)',
  background: 'var(--card)',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text)',
  display: 'block',
  marginBottom: '6px',
}

const card: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '16px',
}

const smallBtn: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '3px 10px',
  fontSize: '12px',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
}

// ---------- component ----------

function PromptManager() {
  const modal = useModal()
  // ---------- state ----------
  const [prompts, setPrompts] = useState<{ id: string; name: string; category: string; is_default: number; updated_at: string }[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedPrompt, setSelectedPrompt] = useState<PromptDetail | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  // editor state
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editSystemPrompt, setEditSystemPrompt] = useState('')
  const [editSkillTemplate, setEditSkillTemplate] = useState('')
  const [editIsDefault, setEditIsDefault] = useState(false)
  const [changeNote, setChangeNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // create modal
  const [showCreate, setShowCreate] = useState(false)
  const [createCategory, setCreateCategory] = useState(CATEGORIES[0])
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  // diff state
  const [diffVersions, setDiffVersions] = useState<string[]>([])
  const [diffModal, setDiffModal] = useState<(DiffResult & { va: string; vb: string }) | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  // import ref
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ---------- data loading ----------

  const loadPrompts = useCallback(async () => {
    try {
      const data = await api.listPrompts()
      setPrompts(data)
    } catch (err: any) {
      console.error('Failed to load prompts:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPrompts() }, [loadPrompts])

  // load selected prompt detail
  useEffect(() => {
    if (!selectedId) {
      setSelectedPrompt(null)
      return
    }
    let cancelled = false
    api.getPrompt(selectedId).then(d => {
      if (!cancelled) setSelectedPrompt(d)
    }).catch(err => {
      if (!cancelled) console.error('Failed to load prompt detail:', err)
    })
    return () => { cancelled = true }
  }, [selectedId])

  // sync editor from selected prompt
  useEffect(() => {
    if (!selectedPrompt) return
    setEditName(selectedPrompt.name)
    setEditCategory(selectedPrompt.category)
    setEditSystemPrompt(selectedPrompt.system_prompt)
    setEditSkillTemplate(selectedPrompt.skill_template || '')
    setEditIsDefault(selectedPrompt.is_default === 1)
    setChangeNote('')
    setSaveMsg('')
    setDiffVersions([])
  }, [selectedPrompt])

  // ---------- derived ----------

  const filteredPrompts = prompts.filter(p => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
  })

  const grouped = CATEGORIES.map(cat => ({
    category: cat,
    prompts: filteredPrompts.filter(p => p.category === cat),
  })).filter(g => g.prompts.length > 0 || !searchQuery.trim())

  const hasSearchResults = filteredPrompts.length > 0 || !searchQuery.trim()

  // ---------- handlers ----------

  const selectPrompt = (id: string) => {
    if (id === selectedId) return
    setSelectedId(id)
  }

  const handleCreate = async () => {
    if (!createName.trim()) {
      setCreateError('请输入提示词名称')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const created = await api.createPrompt({
        name: createName.trim(),
        category: createCategory,
      })
      await loadPrompts()
      setShowCreate(false)
      setCreateName('')
      setSelectedId(created.id)
    } catch (err: any) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const openCreateForCategory = (cat: string) => {
    setCreateCategory(cat)
    setCreateName('')
    setCreateError('')
    setShowCreate(true)
  }

  const handleSave = async () => {
    if (!selectedId || !selectedPrompt) return
    setSaving(true)
    setSaveMsg('')
    try {
      const data = await api.updatePrompt(selectedId, {
        name: editName.trim(),
        category: editCategory,
        system_prompt: editSystemPrompt,
        skill_template: editSkillTemplate,
        change_note: changeNote.trim() || undefined,
      })
      // refresh detail
      const detail = await api.getPrompt(selectedId)
      setSelectedPrompt(detail)
      // also refresh the list (name / category may have changed)
      await loadPrompts()
      setSaveMsg('保存成功，新版本: ' + (data as any).version || '已保存')
    } catch (err: any) {
      setSaveMsg('保存失败: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedId || !selectedPrompt) return
    const ok = await modal.confirm(`确认删除「${selectedPrompt.name}」？此操作不可撤销。`)
    if (!ok) return
    try {
      await api.deletePrompt(selectedId)
      setSelectedId(null)
      await loadPrompts()
    } catch (err: any) {
      modal.toast('删除失败: ' + err.message, 'error')
    }
  }

  const handleRollback = async (version: string) => {
    if (!selectedId) return
    const ok = await modal.confirm(`确认回滚到版本 ${version}？当前未保存的修改将丢失。`)
    if (!ok) return
    try {
      const data = await api.rollbackPrompt(selectedId, version)
      setSelectedPrompt(data)
      await loadPrompts()
    } catch (err: any) {
      modal.toast('回滚失败: ' + err.message, 'error')
    }
  }

  const handleSetDefault = async () => {
    if (!selectedId) return
    try {
      await api.setDefaultPrompt(selectedId)
      setEditIsDefault(true)
      await loadPrompts()
    } catch (err: any) {
      modal.toast('设置默认失败: ' + err.message, 'error')
    }
  }

  const handleExport = async () => {
    try {
      const data = await api.exportPrompts()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `prompts-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      modal.toast('导出失败: ' + err.message, 'error')
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const raw = JSON.parse(text)
      const data = Array.isArray(raw) ? raw : (raw.prompts || raw.data || [])
      if (!Array.isArray(data) || data.length === 0) {
        modal.toast('导入失败: 文件中未找到有效的提示词数据', 'error')
        return
      }
      await api.importPrompts(data)
      await loadPrompts()
      setSelectedId(null)
      modal.toast(`导入成功，共 ${data.length} 条提示词`, 'success')
    } catch (err: any) {
      modal.toast('导入失败: ' + err.message, 'error')
    } finally {
      // reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDiff = async () => {
    if (!selectedId || diffVersions.length !== 2) return
    setDiffLoading(true)
    try {
      const result = await api.diffPrompt(selectedId, diffVersions[0], diffVersions[1])
      setDiffModal({ ...result, va: diffVersions[0], vb: diffVersions[1] })
    } catch (err: any) {
      modal.toast('对比失败: ' + err.message, 'error')
    } finally {
      setDiffLoading(false)
    }
  }

  const toggleDiffVersion = (v: string) => {
    setDiffVersions(prev => {
      if (prev.includes(v)) return prev.filter(x => x !== v)
      if (prev.length >= 2) return [prev[1], v]
      return [...prev, v]
    })
  }

  // ---------- render ----------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', gap: 0 }}>

      {/* ====== Top Toolbar ====== */}
      <div style={{
        display: 'flex', gap: '10px', alignItems: 'center',
        paddingBottom: '16px', borderBottom: '1px solid var(--border)',
        marginBottom: '0', flexShrink: 0,
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginRight: 'auto' }}>提示词管理</h2>
        <button style={btnPrimary} onClick={() => openCreateForCategory(CATEGORIES[0])}>
          + 新建提示词
        </button>
        <button style={btnSecondary} onClick={handleExport}>导出全部</button>
        <button style={btnSecondary} onClick={handleImportClick}>导入</button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
      </div>

      {/* ====== Two-panel body ====== */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ---------- LEFT PANEL: category tree + prompt list ---------- */}
        <div style={{
          width: '280px', minWidth: '280px',
          borderRight: '1px solid var(--border)',
          overflowY: 'auto',
          paddingRight: '12px',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Search */}
          <div style={{ padding: '12px 0' }}>
            <input
              style={{ ...inputField, height: '32px', fontSize: '13px' }}
              placeholder="搜索提示词..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Category list */}
          {loading ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '8px 0' }}>加载中...</p>
          ) : !hasSearchResults ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '8px 0' }}>无匹配结果</p>
          ) : (
            grouped.map(g => (
              <div key={g.category} style={{ marginBottom: '4px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 4px',
                }}>
                  <span style={{
                    fontSize: '13px', fontWeight: 700,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>
                    {g.category}
                  </span>
                  <button
                    onClick={() => openCreateForCategory(g.category)}
                    title="在此分类新建"
                    style={{
                      ...smallBtn,
                      padding: '1px 6px',
                      fontSize: '14px',
                      lineHeight: '18px',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      fontWeight: 700,
                    }}
                  >
                    +
                  </button>
                </div>

                {g.prompts.length === 0 ? (
                  <p style={{
                    fontSize: '12px', color: 'var(--text-secondary)',
                    padding: '4px 16px', fontStyle: 'italic',
                  }}>
                    暂无提示词
                  </p>
                ) : (
                  g.prompts.map(p => (
                    <div
                      key={p.id}
                      onClick={() => selectPrompt(p.id)}
                      title={p.name}
                      style={{
                        padding: '7px 12px 7px 20px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        borderRadius: 'var(--radius-sm)',
                        marginBottom: '1px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: selectedId === p.id ? 'rgba(139, 26, 26, 0.08)' : 'transparent',
                        color: selectedId === p.id ? 'var(--primary)' : 'var(--text)',
                        fontWeight: selectedId === p.id ? 600 : 400,
                      }}
                    >
                      <span style={{
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                      }}>
                        {p.name}
                      </span>
                      {p.is_default === 1 && (
                        <span style={{
                          fontSize: '10px', color: 'var(--primary)',
                          border: '1px solid var(--primary)',
                          borderRadius: '3px', padding: '0 4px',
                          marginLeft: '6px', flexShrink: 0,
                        }}>
                          默认
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            ))
          )}
        </div>

        {/* ---------- RIGHT PANEL: editor + version history ---------- */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          paddingLeft: '24px',
          display: 'flex', flexDirection: 'column', gap: '16px',
        }}>
          {!selectedPrompt ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)', fontSize: '15px',
            }}>
              选择一个提示词开始编辑，或点击「+ 新建提示词」
            </div>
          ) : (
            <>
              {/* --- Editor header --- */}
              <div style={{ ...card, display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 240px' }}>
                  <label style={labelStyle}>名称</label>
                  <input
                    style={inputField}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                  />
                </div>
                <div style={{ flex: '0 0 160px' }}>
                  <label style={labelStyle}>分类</label>
                  <select
                    value={editCategory}
                    onChange={e => setEditCategory(e.target.value)}
                    style={{ ...inputField, cursor: 'pointer' }}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '4px' }}>
                  {editIsDefault ? (
                    <span style={{
                      fontSize: '12px', color: 'var(--primary)',
                      border: '1px solid var(--primary)',
                      borderRadius: 'var(--radius-sm)', padding: '4px 10px',
                    }}>
                      已设为默认
                    </span>
                  ) : (
                    <button style={smallBtn} onClick={handleSetDefault}>
                      设为默认
                    </button>
                  )}
                  <button style={btnDanger} onClick={handleDelete}>删除</button>
                </div>
              </div>

              {/* --- Textareas --- */}
              <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <label style={labelStyle}>系统 Prompt</label>
                  <textarea
                    value={editSystemPrompt}
                    onChange={e => setEditSystemPrompt(e.target.value)}
                    style={{
                      flex: 1, minHeight: '200px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '10px',
                      fontSize: '13px',
                      fontFamily: 'var(--mono)',
                      color: 'var(--text)',
                      background: 'var(--card)',
                      resize: 'vertical',
                      outline: 'none',
                      lineHeight: 1.6,
                    }}
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <label style={labelStyle}>Skill 模板</label>
                  <textarea
                    value={editSkillTemplate}
                    onChange={e => setEditSkillTemplate(e.target.value)}
                    style={{
                      flex: 1, minHeight: '200px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '10px',
                      fontSize: '13px',
                      fontFamily: 'var(--mono)',
                      color: 'var(--text)',
                      background: 'var(--card)',
                      resize: 'vertical',
                      outline: 'none',
                      lineHeight: 1.6,
                    }}
                  />
                </div>
              </div>

              {/* --- Change note + Save --- */}
              <div style={{ ...card, display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <label style={labelStyle}>变更说明</label>
                  <input
                    style={inputField}
                    placeholder="本次修改内容..."
                    value={changeNote}
                    onChange={e => setChangeNote(e.target.value)}
                  />
                </div>
                <button style={btnPrimary} onClick={handleSave} disabled={saving}>
                  {saving ? '保存中...' : '保存（创建新版本）'}
                </button>
                {saveMsg && (
                  <span style={{
                    fontSize: '13px',
                    color: saveMsg.includes('失败') ? 'var(--warning)' : 'var(--success)',
                  }}>
                    {saveMsg}
                  </span>
                )}
              </div>

              {/* --- Version History --- */}
              <div style={card}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: '12px',
                }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700 }}>版本历史</h3>
                  {diffVersions.length === 2 && (
                    <button
                      style={{ ...btnSecondary, fontSize: '12px' }}
                      onClick={handleDiff}
                      disabled={diffLoading}
                    >
                      {diffLoading ? '对比中...' : `对比 ${diffVersions[0]} vs ${diffVersions[1]}`}
                    </button>
                  )}
                </div>

                {(!selectedPrompt.versions || selectedPrompt.versions.length === 0) ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>暂无版本记录</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {[...selectedPrompt.versions]
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map(v => {
                        const isSelected = diffVersions.includes(v.version)
                        return (
                          <div
                            key={v.version}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '12px',
                              padding: '8px 12px',
                              background: isSelected ? 'rgba(139, 26, 26, 0.05)' : 'transparent',
                              borderRadius: 'var(--radius-sm)',
                              border: isSelected ? '1px solid rgba(139, 26, 26, 0.2)' : '1px solid transparent',
                            }}
                          >
                            <span style={{
                              fontSize: '13px', fontWeight: 600,
                              color: 'var(--primary)', minWidth: '52px',
                            }}>
                              {v.version}
                            </span>
                            <span style={{
                              fontSize: '12px', color: 'var(--text-secondary)',
                              minWidth: '120px',
                            }}>
                              {new Date(v.created_at).toLocaleString('zh-CN')}
                            </span>
                            <span style={{
                              fontSize: '13px', color: 'var(--text)',
                              flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {v.change_note || '（无说明）'}
                            </span>
                            <button
                              style={smallBtn}
                              onClick={() => handleRollback(v.version)}
                            >
                              回滚
                            </button>
                            <button
                              style={{
                                ...smallBtn,
                                border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                                color: isSelected ? 'var(--primary)' : 'var(--text-secondary)',
                                fontWeight: isSelected ? 600 : 400,
                              }}
                              onClick={() => toggleDiffVersion(v.version)}
                            >
                              {isSelected ? '已选' : '对比'}
                            </button>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ====== Create Modal ====== */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{ ...card, width: '420px', maxWidth: '90vw', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>新建提示词</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>名称</label>
                <input
                  style={inputField}
                  placeholder="输入提示词名称"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                  autoFocus
                />
              </div>
              <div>
                <label style={labelStyle}>分类</label>
                <select
                  style={{ ...inputField, cursor: 'pointer' }}
                  value={createCategory}
                  onChange={e => setCreateCategory(e.target.value)}
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            {createError && (
              <p style={{ color: 'var(--warning)', fontSize: '13px', marginTop: '12px' }}>{createError}</p>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button style={btnSecondary} onClick={() => setShowCreate(false)} disabled={creating}>取消</button>
              <button style={btnPrimary} onClick={handleCreate} disabled={creating}>
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== Diff Modal ====== */}
      {diffModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            ...card,
            width: '780px', maxWidth: '95vw', maxHeight: '85vh',
            overflowY: 'auto', padding: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700 }}>
                版本对比: {diffModal.va} vs {diffModal.vb}
              </h3>
              <button
                style={btnSecondary}
                onClick={() => setDiffModal(null)}
              >
                关闭
              </button>
            </div>

            {/* System prompt diff */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--text)' }}>
                系统 Prompt 差异
              </h4>
              <pre style={{
                background: '#fafafa',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px',
                fontSize: '12px',
                fontFamily: 'var(--mono)',
                lineHeight: 1.6,
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: '280px',
                overflowY: 'auto',
                color: 'var(--text)',
                margin: 0,
              }}>
                {diffModal.system_prompt_diff || '（无变化）'}
              </pre>
            </div>

            {/* Skill template diff */}
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--text)' }}>
                Skill 模板差异
              </h4>
              <pre style={{
                background: '#fafafa',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px',
                fontSize: '12px',
                fontFamily: 'var(--mono)',
                lineHeight: 1.6,
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: '280px',
                overflowY: 'auto',
                color: 'var(--text)',
                margin: 0,
              }}>
                {diffModal.skill_template_diff || '（无变化）'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PromptManager
