import React, { useState, useEffect, useRef } from 'react'
import { api } from '../services/api'

interface Props {
  workspaceId?: string
  refreshKey?: number
}

interface ProjectStatus {
  id: string
  name: string
  category_id: string
  category_name: string
  author_id: string
  author_name: string
  status: string
  steps_status: { step1: boolean; step2: boolean; step3: boolean; step4: boolean; [key: string]: boolean }
  sub_steps?: Record<string, boolean>
}

const STEP_DEFS = [
  { key: 'step1', label: '第一步·素材输入', subs: ['video', 'text', 'file'], subLabels: ['整理视频', '整理文字', '整理文件'] },
  { key: 'step2', label: '第二步·文档生成', subs: ['sop', 'dao', 'yanxi'], subLabels: ['标准文档', '分析文档', '综合文档'] },
  { key: 'step3', label: '第三步·课件输出', subs: ['doc-ppt', 'analysis-ppt', 'comprehensive-ppt'], subLabels: ['文档课件', '分析PPT', '综合PPT'] },
  { key: 'step4', label: '第四步·演讲课件', subs: ['speech-script'], subLabels: ['生成演讲稿'] },
]

// Sub-TAB → step_results step_name mapping for status check
const SUB_STEP_NAMES: Record<string, string> = {
  'video': 'step1_video', 'text': 'step1_text', 'file': 'step1_file',
  'sop': 'step2_sop', 'dao': 'step2_daoshuyi', 'yanxi': 'step2_yanxi',
  'doc-ppt': 'step3_col1', 'analysis-ppt': 'step3_col2', 'comprehensive-ppt': 'step3_col3',
  'speech-script': 'step4_speech_script',
}

// Raw source keys for Step 1 radio availability (input box must have content)
const RAW_SOURCE_KEYS: Record<string, string> = {
  'video': 'raw_video', 'text': 'raw_text', 'file': 'raw_file',
}

// Step 2 → Step 3 1:1 mapping
const STEP2_TO_STEP3: Record<string, string> = {
  'sop': 'doc-ppt',
  'dao': 'analysis-ppt',
  'yanxi': 'comprehensive-ppt',
}

// Step 3 subs for Step 4 source selector
const STEP3_SUBS = [
  { key: 'doc-ppt', label: '文档演讲' },
  { key: 'analysis-ppt', label: '分析演讲' },
  { key: 'comprehensive-ppt', label: '综合演讲' },
]

interface BatchStatus {
  batch_id: string
  status: string
  total_count: number
  completed_count: number
  failed_count: number
  items: Array<{
    project_id: string
    project_name: string
    steps: any[]
    status: string
    logs: string[]
  }>
}

export const BatchExecuteTab: React.FC<Props> = ({ workspaceId, refreshKey }) => {
  const [projects, setProjects] = useState<ProjectStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
  // selectedSteps: { [projectId]: { [stepKey]: string[] } }
  // For step1: array has exactly one element (the selected source)
  const [selectedSteps, setSelectedSteps] = useState<Record<string, Record<string, string[]>>>({})
  // step4Source: { [projectId]: string } — which step3 output to use as source
  const [step4Source, setStep4Source] = useState<Record<string, string>>({})
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [executing, setExecuting] = useState(false)
  const [conflictMsg, setConflictMsg] = useState('')
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load projects
  useEffect(() => {
    api.batchProjectsStatus(workspaceId).then((data: ProjectStatus[]) => {
      setProjects(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [workspaceId, refreshKey])

  // Cleanup polling
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // Categories for filter
  const categories = Array.from(new Map(
    projects.filter(p => p.category_name).map(p => [p.category_name, p.category_id])
  ).entries()).map(([name, id]) => ({ id, name }))

  // Filter
  const filtered = projects.filter(p => {
    if (search && !p.name.includes(search)) return false
    if (catFilter && p.category_id !== catFilter) return false
    return true
  })

  const toggleExpand = (pid: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(pid) ? next.delete(pid) : next.add(pid)
      return next
    })
  }

  const toggleProject = (pid: string) => {
    setSelectedProjects(prev => {
      const next = new Set(prev)
      if (next.has(pid)) {
        next.delete(pid)
        setSelectedSteps(s => { const n = { ...s }; delete n[pid]; return n })
        setStep4Source(s => { const n = { ...s }; delete n[pid]; return n })
      } else {
        next.add(pid)
      }
      return next
    })
  }

  // Step 1: radio single-select — set value directly
  const setStep1Sub = (pid: string, sub: string) => {
    setSelectedSteps(prev => {
      const projSteps = { ...(prev[pid] || {}) }
      projSteps['step1'] = [sub]
      return { ...prev, [pid]: projSteps }
    })
    setSelectedProjects(prev => {
      if (!prev.has(pid)) return new Set([...prev, pid])
      return prev
    })
  }

  // Steps 2-4: checkbox toggle
  const toggleStepSub = (pid: string, stepKey: string, sub: string) => {
    setSelectedSteps(prev => {
      const projSteps = { ...(prev[pid] || {}) }
      const curList = [...(projSteps[stepKey] || [])]
      const idx = curList.indexOf(sub)
      if (idx >= 0) {
        curList.splice(idx, 1)
      } else {
        curList.push(sub)
      }
      projSteps[stepKey] = curList
      return { ...prev, [pid]: projSteps }
    })

    setSelectedProjects(prev => {
      if (!prev.has(pid)) return new Set([...prev, pid])
      return prev
    })
  }

  const setStep4SourceSub = (pid: string, source: string) => {
    setStep4Source(prev => ({ ...prev, [pid]: source }))
    setSelectedProjects(prev => {
      if (!prev.has(pid)) return new Set([...prev, pid])
      return prev
    })
  }

  // Check if a step has at least one sub selected
  const stepHasSelection = (pid: string, stepKey: string) => {
    return (selectedSteps[pid]?.[stepKey]?.length || 0) > 0
  }

  // Check if a sub-TAB already has data (from sub_steps or steps_status)
  const subHasData = (p: ProjectStatus, stepKey: string, sub: string) => {
    if (p.sub_steps) {
      const name = SUB_STEP_NAMES[sub]
      if (name && p.sub_steps[name] !== undefined) return p.sub_steps[name]
    }
    // Fallback: use steps_status
    if (stepKey === 'step1' && p.steps_status.step1) {
      // For step1, check if the specific source type has data
      if (p.sub_steps) {
        const name = SUB_STEP_NAMES[sub]
        if (name) return !!p.sub_steps[name]
      }
    }
    return false
  }

  // Build project_steps payload
  const buildStepsPayload = () => {
    const payload: Record<string, any> = {}
    for (const pid of selectedProjects) {
      const steps: any[] = []
      const projSteps = selectedSteps[pid] || {}
      for (const def of STEP_DEFS) {
        if (def.key === 'step1') {
          const subs = projSteps[def.key]
          if (subs && subs.length > 0) {
            steps.push([def.key.replace('step', ''), subs])
          }
        } else if (def.key === 'step4') {
          const subs = projSteps[def.key]
          const source = step4Source[pid]
          if (subs && subs.length > 0 && source) {
            steps.push([def.key.replace('step', ''), source, subs])
          }
        } else {
          const subs = projSteps[def.key]
          if (subs && subs.length > 0) {
            steps.push([def.key.replace('step', ''), subs])
          }
        }
      }
      if (steps.length > 0) {
        payload[pid] = steps
      }
    }
    return payload
  }

  const canExecute = () => {
    if (selectedProjects.size === 0) return false
    if (!startTime || !endTime) return false
    return Object.keys(buildStepsPayload()).length > 0
  }

  const totalSteps = () => {
    let count = 0
    const payload = buildStepsPayload()
    for (const pid of Object.keys(payload)) {
      count += payload[pid].length
    }
    return count
  }

  const handleExecute = async () => {
    const payload = buildStepsPayload()
    if (Object.keys(payload).length === 0) return
    setExecuting(true)
    setBatchStatus(null)
    setConflictMsg('')
    try {
      const resp = await api.batchExecute(payload, startTime, endTime, workspaceId)
      if (resp.conflicts && resp.conflicts.length > 0) {
        setConflictMsg('以下项目已在其他批次中执行：' + resp.conflicts.join('、'))
        if (!resp.batch_id) {
          setExecuting(false)
          return
        }
      }
      const batchId = resp.batch_id
      if (!batchId) { setExecuting(false); return }
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.batchStatus(batchId)
          setBatchStatus(status)
          if (status.status === 'completed' || status.status === 'cancelled' || status.status === 'stopped') {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
            setExecuting(false)
            api.batchProjectsStatus(workspaceId).then(setProjects)
          }
        } catch { /* ignore poll errors */ }
      }, 2000)
    } catch (err: any) {
      alert('执行失败: ' + (err.message || err))
      setExecuting(false)
    }
  }

  const handleCancel = async () => {
    if (!batchStatus) return
    try {
      await api.batchCancel(batchStatus.batch_id)
    } catch (err: any) {
      alert('取消失败: ' + (err.message || err))
    }
  }

  const isActive = batchStatus && (batchStatus.status === 'running' || batchStatus.status === 'pending')
  const progress = batchStatus && batchStatus.total_count > 0
    ? Math.round((batchStatus.completed_count + batchStatus.failed_count) / batchStatus.total_count * 100)
    : 0

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="form-input" type="text" placeholder="搜索项目名称..."
          style={{ width: 200, fontSize: 12 }}
          value={search} onChange={e => setSearch(e.target.value)} />
        {categories.length > 0 && (
          <select className="form-input" style={{ width: 130, fontSize: 12 }}
            value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="">全部分类</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          已选 <strong style={{ color: 'var(--primary)' }}>{selectedProjects.size}</strong> 个项目
        </span>
      </div>

      {/* Conflict warning */}
      {conflictMsg && (
        <div style={{
          marginBottom: 12, padding: '8px 14px', borderRadius: 6, fontSize: 12,
          background: '#fff7e6', border: '1px solid #faad14', color: '#d48806',
        }}>
          {conflictMsg}
        </div>
      )}

      {/* Project List */}
      {loading ? (
        <p style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 12 }}>加载中...</p>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {filtered.map(p => {
            const isExpanded = expanded.has(p.id)
            const isSelected = selectedProjects.has(p.id)
            const projSteps = selectedSteps[p.id] || {}
            const ss = p.steps_status

            return (
              <div key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                {/* Project Row */}
                <div style={{
                  display: 'flex', alignItems: 'center', padding: '8px 12px',
                  fontSize: 12, cursor: 'pointer', background: isExpanded ? 'var(--bg-hover)' : undefined,
                }} onClick={() => toggleExpand(p.id)}>
                  <div style={{ width: 36, flexShrink: 0 }} onClick={e => { e.stopPropagation(); toggleProject(p.id) }}>
                    <input type="checkbox" checked={isSelected} onChange={() => {}} />
                  </div>
                  <div style={{ flex: 1, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ width: 80, color: 'var(--text-secondary)' }}>{p.category_name || '—'}</div>
                  <div style={{ width: 80, color: 'var(--text-secondary)' }}>{p.author_name || '—'}</div>
                  <div style={{ width: 140, display: 'flex', gap: 4, alignItems: 'center' }}>
                    {STEP_DEFS.map(def => {
                      const done = ss[def.key]
                      return (
                        <span key={def.key} style={{
                          width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                          background: done ? 'var(--success)' : 'var(--border)',
                        }} title={`${def.label}: ${done ? '已完成' : '未完成'}`} />
                      )
                    })}
                  </div>
                  <div style={{ width: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>
                    {isExpanded ? '▲' : '▼'}
                  </div>
                </div>

                {/* Expanded Step Selection */}
                {isExpanded && (
                  <div>
                    {STEP_DEFS.map((def, si) => {
                      const prevCompleted = si > 0 && ss[STEP_DEFS[si - 1].key]
                      const locked = si > 0 && !prevCompleted && !stepHasSelection(p.id, STEP_DEFS[si - 1].key)
                      const curSubs = projSteps[def.key] || []
                      const isStep1 = def.key === 'step1'
                      const isStep4 = def.key === 'step4'
                      const step4Src = step4Source[p.id] || ''

                      return (
                        <div key={def.key} style={{
                          padding: '6px 12px 6px 48px',
                          borderBottom: '1px solid var(--border)', fontSize: 11,
                          background: 'var(--bg-hover)',
                        }}>
                          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{
                              fontWeight: 600, minWidth: 110, fontSize: 11,
                              color: locked ? 'var(--text-secondary)' : 'var(--text-primary)',
                            }}>
                              {def.label}
                            </span>
                            {isStep4 && !locked ? (
                              /* Step 4: Source selector + generate checkbox */
                              <>
                                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                                  选择课件来源：
                                </span>
                                {STEP3_SUBS.filter(s3 => {
                                  const step3Subs = projSteps['step3'] || []
                                  return step3Subs.includes(s3.key)
                                }).map(s3 => {
                                  const s3HasData = subHasData(p, 'step3', s3.key)
                                  return (
                                    <label key={s3.key} style={{
                                      marginRight: 12, fontSize: 10, cursor: 'pointer',
                                      color: step4Src === s3.key ? 'var(--primary)' : 'var(--text-secondary)',
                                      fontWeight: step4Src === s3.key ? 600 : 400,
                                    }}>
                                      <input type="radio" name={`step4src-${p.id}`}
                                        checked={step4Src === s3.key}
                                        onChange={() => setStep4SourceSub(p.id, s3.key)}
                                        style={{ marginRight: 3 }} />
                                      {s3.label}
                                      {s3HasData && <span style={{ color: 'var(--success)', marginLeft: 2 }}>✓</span>}
                                    </label>
                                  )
                                })}
                                {step4Src && def.subs.map((sub, i) => {
                                  const hasData = subHasData(p, def.key, sub)
                                  const checked = curSubs.includes(sub)
                                  return (
                                    <label key={sub} style={{
                                      display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                                      color: 'var(--text-primary)', fontSize: 10,
                                    }}>
                                      <input type="checkbox" checked={checked}
                                        onChange={() => toggleStepSub(p.id, def.key, sub)} />
                                      {def.subLabels[i]}
                                      {hasData && <span style={{ color: 'var(--success)', fontSize: 10 }} title="已有数据">✓</span>}
                                    </label>
                                  )
                                })}
                              </>
                            ) : (
                              !isStep4 && def.subs.filter(sub => {
                                // Step 3: only show subs matching Step 2 selections
                                if (def.key !== 'step3') return true
                                const step2Subs = projSteps['step2'] || []
                                const step2Key = Object.entries(STEP2_TO_STEP3).find(([, v]) => v === sub)?.[0]
                                return step2Key ? step2Subs.includes(step2Key) : true
                              }).map((sub, i) => {
                                const hasData = subHasData(p, def.key, sub)
                                const checked = curSubs.includes(sub)
                                const inputType = isStep1 ? 'radio' : 'checkbox'
                                const rawKey: string = isStep1 ? (RAW_SOURCE_KEYS[sub] || '') : ''
                                const rawMissing: boolean = isStep1 && !!rawKey && !!(p.sub_steps && p.sub_steps[rawKey] === false)
                                const step1Disabled: boolean = locked || (rawMissing && !hasData)
                                return (
                                  <label key={sub} style={{
                                    display: 'flex', alignItems: 'center', gap: 4, cursor: step1Disabled ? 'not-allowed' : 'pointer',
                                    color: step1Disabled ? 'var(--text-secondary)' : 'var(--text-primary)',
                                    opacity: step1Disabled ? 0.5 : 1,
                                  }}>
                                    <input type={inputType} checked={checked}
                                      name={isStep1 ? `step1-${p.id}` : undefined}
                                      disabled={step1Disabled}
                                      onChange={() => {
                                        if (isStep1) setStep1Sub(p.id, sub)
                                        else toggleStepSub(p.id, def.key, sub)
                                      }} />
                                    {def.subLabels[i]}
                                    {rawMissing && !hasData && (
                                      <span style={{ color: 'var(--text-secondary)', fontSize: 9, marginLeft: 2 }}>(无内容)</span>
                                    )}
                                    {hasData && (
                                      <span style={{ color: 'var(--success)', fontSize: 10, marginLeft: 2 }} title="已有数据">✓</span>
                                    )}
                                  </label>
                                )
                              })
                            )}
                            {locked && (
                              <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto', fontSize: 10 }}>
                                🔒 需上一步勾选
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
              暂无项目
            </div>
          )}
        </div>
      )}

      {/* Time Window Config */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px',
        background: 'var(--bg-hover)', borderRadius: 6, marginTop: 16,
        border: '1px solid var(--border)', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>执行时间窗口</span>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          开始
          <input type="datetime-local" className="form-input" style={{ fontSize: 12, width: 200 }}
            value={startTime} onChange={e => setStartTime(e.target.value)} />
        </label>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          结束
          <input type="datetime-local" className="form-input" style={{ fontSize: 12, width: 200 }}
            value={endTime} onChange={e => setEndTime(e.target.value)} />
        </label>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          （到达结束时间自动停止）
        </span>
      </div>

      {/* Execute Button */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          将执行 <strong style={{ color: 'var(--primary)' }}>{selectedProjects.size}</strong> 个项目，
          共 <strong style={{ color: 'var(--primary)' }}>{totalSteps()}</strong> 个步骤
        </span>
        {isActive ? (
          <button className="btn btn-outline btn-sm" onClick={handleCancel}>取消执行</button>
        ) : (
          <button className="btn btn-primary btn-sm" disabled={!canExecute() || executing}
            onClick={handleExecute}>
            {executing ? '提交中...' : '▶ 开始执行'}
          </button>
        )}
      </div>

      {/* Log Panel */}
      {batchStatus && (
        <div className="card" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px', borderBottom: '1px solid var(--border)',
            fontSize: 12, fontWeight: 600,
          }}>
            <span>执行日志</span>
            <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-secondary)' }}>
              批次 #{batchStatus.batch_id} · {batchStatus.status === 'running' ? '运行中' : batchStatus.status}
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', margin: '0 14px', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: 'var(--primary)', borderRadius: 2,
              width: `${progress}%`, transition: 'width .3s',
            }} />
          </div>
          <div style={{
            maxHeight: 250, overflow: 'auto', padding: '10px 14px',
            fontFamily: 'monospace', fontSize: 11, lineHeight: 1.8,
            background: '#1e1e1e', color: '#d4d4d4',
          }}>
            {batchStatus.items.map((item, i) => (
              <div key={i}>
                <div style={{ color: '#9cdcfe', marginTop: i > 0 ? 8 : 0 }}>
                  ── {item.project_name} ({item.status})
                </div>
                {item.logs?.map((log, j) => (
                  <div key={j}>
                    <span style={{ color: '#6a9955' }}>
                      {log.substring(0, 10)}
                    </span>
                    {' '}
                    <span style={{
                      color: log.includes('失败') ? '#f14c4c'
                        : log.includes('完成') ? '#4ec9b0'
                        : log.includes('跳过') ? '#ce9178'
                        : '#d4d4d4',
                    }}>
                      {log.substring(11)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {batchStatus.items.length === 0 && (
              <div style={{ color: '#6a9955' }}>等待执行...</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
