import { useState, useEffect } from 'react'
import { api } from '../services/api'
import { useModal } from '../components/ModalProvider'

const PAGE_SIZE = 20

interface Author {
  id: string
  name: string
  intro: string
  license_text: string
  photo_url?: string
  user_id?: string
  contract_status?: string
  revenue_share?: number
  cash_share?: number
  points_per_yuan?: number
  contract_signed_at?: string
  contract_note?: string
  created_at?: string
}

export default function AuthorManagePage() {
  const modal = useModal()
  const [tab, setTab] = useState<'authors' | 'pending' | 'submissions' | 'revenue'>('authors')

  // ── Authors tab ──
  const [authors, setAuthors] = useState<Author[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formIntro, setFormIntro] = useState('')
  const [formLicense, setFormLicense] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Pending tab ──
  const [pending, setPending] = useState<Author[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [approveOpen, setApproveOpen] = useState<string | null>(null)
  const [approveRevShare, setApproveRevShare] = useState('0.7')
  const [approveCashShare, setApproveCashShare] = useState('0')
  const [approvePtsPerYuan, setApprovePtsPerYuan] = useState('100')
  const [approveNote, setApproveNote] = useState('')
  const [approveSaving, setApproveSaving] = useState(false)

  // ── Submissions tab ──
  const [submissions, setSubmissions] = useState<any[]>([])
  const [subLoading, setSubLoading] = useState(false)
  const [subApproveOpen, setSubApproveOpen] = useState<string | null>(null)
  const [subPointCost, setSubPointCost] = useState('5')
  const [subCategory, setSubCategory] = useState('')
  const [subRejectOpen, setSubRejectOpen] = useState<string | null>(null)
  const [subRejectNote, setSubRejectNote] = useState('')
  const [subSaving, setSubSaving] = useState(false)

  // ── Revenue tab ──
  const [revStats, setRevStats] = useState<any>(null)
  const [revLoading, setRevLoading] = useState(false)
  const [payouts, setPayouts] = useState<any[]>([])
  const [payoutOpen, setPayoutOpen] = useState<string | null>(null)
  const [payoutStart, setPayoutStart] = useState('')
  const [payoutEnd, setPayoutEnd] = useState('')
  const [payoutNote, setPayoutNote] = useState('')
  const [payoutSaving, setPayoutSaving] = useState(false)
  const [activeAuthorId, setActiveAuthorId] = useState('')

  // ── Contract edit for existing authors ──
  const [contractOpen, setContractOpen] = useState<string | null>(null)
  const [contractRevShare, setContractRevShare] = useState('0.7')
  const [contractCashShare, setContractCashShare] = useState('0')
  const [contractPtsPerYuan, setContractPtsPerYuan] = useState('100')
  const [contractStatus, setContractStatus] = useState('active')
  const [contractNote, setContractNote] = useState('')
  const [contractSaving, setContractSaving] = useState(false)

  const loadAuthors = async () => {
    setLoading(true)
    try {
      const d = await api.listAuthors()
      setAuthors(((d as any)?.authors || []) as Author[])
    } catch (e: any) {
      modal.toast('加载失败: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadPending = async () => {
    setPendingLoading(true)
    try {
      const d = await api.adminAuthorsPending()
      setPending((d as any)?.authors || [])
    } catch (e: any) {
      modal.toast('加载失败: ' + e.message, 'error')
    } finally {
      setPendingLoading(false)
    }
  }

  const loadSubmissions = async () => {
    setSubLoading(true)
    try {
      const d = await api.adminSubmissionsPending()
      setSubmissions((d as any)?.submissions || [])
    } catch (e: any) {
      modal.toast('加载失败: ' + e.message, 'error')
    } finally {
      setSubLoading(false)
    }
  }

  const loadRevenue = async () => {
    setRevLoading(true)
    try {
      const d = await api.adminRevenueStats()
      setRevStats(d)
      const p = await api.adminPayouts()
      setPayouts((p as any)?.payouts || [])
    } catch (e: any) {
      modal.toast('加载失败: ' + e.message, 'error')
    } finally {
      setRevLoading(false)
    }
  }

  useEffect(() => { loadAuthors() }, [])

  useEffect(() => {
    if (tab === 'pending') loadPending()
    else if (tab === 'submissions') loadSubmissions()
    else if (tab === 'revenue') loadRevenue()
  }, [tab])

  // ── Authors CRUD ──
  const openCreate = () => {
    setEditingId(null)
    setFormName(''); setFormIntro(''); setFormLicense('')
    setDialogOpen(true)
  }

  const openEdit = (a: Author) => {
    setEditingId(a.id)
    setFormName(a.name); setFormIntro(a.intro || ''); setFormLicense(a.license_text || '')
    setDialogOpen(true)
  }

  const save = async () => {
    if (!formName.trim()) { modal.toast('请填写作者姓名', 'error'); return }
    setSaving(true)
    try {
      if (editingId) {
        await api.updateAuthor(editingId, { name: formName.trim(), intro: formIntro, license_text: formLicense })
      } else {
        const created = await api.createAuthor({ name: formName.trim(), intro: formIntro, license_text: formLicense })
        if (created == null) throw new Error('创建返回为空')
      }
      modal.toast('已保存', 'success')
      setDialogOpen(false)
      await loadAuthors()
    } catch (e: any) {
      modal.toast('保存失败: ' + e.message, 'error')
    } finally { setSaving(false) }
  }

  const remove = async (a: Author) => {
    const ok = await modal.confirm(`确定删除作者「${a.name}」？引用该作者的明细将变为无署名。`)
    if (!ok) return
    try {
      await api.deleteAuthor(a.id)
      modal.toast('已删除', 'success')
      setAuthors(prev => prev.filter(x => x.id !== a.id))
    } catch (e: any) {
      modal.toast('删除失败: ' + e.message, 'error')
    }
  }

  // ── Approve / Reject contract ──
  const handleApprove = async (authorId: string) => {
    setApproveSaving(true)
    try {
      await api.adminApproveAuthor(authorId, {
        revenue_share: parseFloat(approveRevShare) || 0.7,
        cash_share: parseFloat(approveCashShare) || 0,
        points_per_yuan: parseFloat(approvePtsPerYuan) || 100,
        contract_note: approveNote,
      })
      modal.toast('已通过签约', 'success')
      setApproveOpen(null)
      loadPending()
      loadAuthors()
    } catch (e: any) {
      modal.toast('操作失败: ' + e.message, 'error')
    } finally { setApproveSaving(false) }
  }

  const handleReject = async (authorId: string) => {
    const note = prompt('拒绝理由（可选）:')
    if (note === null) return
    try {
      await api.adminRejectAuthor(authorId, note || '')
      modal.toast('已拒绝', 'success')
      loadPending()
      loadAuthors()
    } catch (e: any) {
      modal.toast('操作失败: ' + e.message, 'error')
    }
  }

  // ── Contract management for existing authors ──
  const openContract = (a: Author) => {
    setContractOpen(a.id)
    setContractRevShare(String(a.revenue_share ?? 0.7))
    setContractCashShare(String(a.cash_share ?? 0))
    setContractPtsPerYuan(String(a.points_per_yuan ?? 100))
    setContractStatus(a.contract_status === 'suspended' ? 'suspended' : 'active')
    setContractNote(a.contract_note || '')
  }

  const saveContract = async () => {
    if (!contractOpen) return
    setContractSaving(true)
    try {
      await api.adminUpdateContract(contractOpen, {
        revenue_share: parseFloat(contractRevShare) || 0.7,
        cash_share: parseFloat(contractCashShare) || 0,
        points_per_yuan: parseFloat(contractPtsPerYuan) || 100,
        contract_status: contractStatus,
        contract_note: contractNote,
      })
      modal.toast('签约信息已更新', 'success')
      setContractOpen(null)
      loadAuthors()
    } catch (e: any) {
      modal.toast('保存失败: ' + e.message, 'error')
    } finally { setContractSaving(false) }
  }

  // ── Submissions approve / reject ──
  const handleSubApprove = async (subId: string) => {
    setSubSaving(true)
    try {
      await api.adminApproveSubmission(subId, {
        point_cost_deci: parseInt(subPointCost) || 5,
        category_id: subCategory,
      })
      modal.toast('食谱已通过并创建项目', 'success')
      setSubApproveOpen(null)
      loadSubmissions()
    } catch (e: any) {
      modal.toast('操作失败: ' + e.message, 'error')
    } finally { setSubSaving(false) }
  }

  const handleSubReject = async (subId: string) => {
    setSubSaving(true)
    try {
      await api.adminRejectSubmission(subId, subRejectNote)
      modal.toast('已驳回', 'success')
      setSubRejectOpen(null)
      setSubRejectNote('')
      loadSubmissions()
    } catch (e: any) {
      modal.toast('操作失败: ' + e.message, 'error')
    } finally { setSubSaving(false) }
  }

  // ── Payout ──
  const handlePayout = async (authorId: string) => {
    if (!payoutStart || !payoutEnd) { modal.toast('请填写日期范围', 'error'); return }
    setPayoutSaving(true)
    try {
      await api.adminCreatePayout(authorId, {
        period_start: payoutStart,
        period_end: payoutEnd,
        note: payoutNote,
      })
      modal.toast('派发成功', 'success')
      setPayoutOpen(null)
      setPayoutNote('')
      loadRevenue()
    } catch (e: any) {
      modal.toast('派发失败: ' + e.message, 'error')
    } finally { setPayoutSaving(false) }
  }

  const contractStatusLabel = (s: string) => {
    const map: Record<string, string> = { none: '未签约', pending: '待审核', active: '已签约', suspended: '已暂停' }
    return map[s] || s || '未签约'
  }

  const contractStatusColor = (s: string) => {
    const map: Record<string, string> = { none: 'var(--text-secondary)', pending: '#f0ad4e', active: '#5cb85c', suspended: 'var(--warning)' }
    return map[s] || 'var(--text-secondary)'
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>作者管理</h1>
        {tab === 'authors' && <button className="btn btn-primary btn-sm" onClick={openCreate}>+ 新建作者</button>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {([
          ['authors', '作者库'],
          ['pending', '签约审核'],
          ['submissions', '食谱审核'],
          ['revenue', '收益管理'],
        ] as const).map(([k, label]) => (
          <button key={k}
            onClick={() => setTab(k)}
            style={{
              padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: tab === k ? 600 : 400,
              color: tab === k ? 'var(--text)' : 'var(--text-secondary)',
              borderBottom: tab === k ? '2px solid var(--accent)' : '2px solid transparent',
            }}>
            {label}
            {k === 'pending' && pending.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 11, background: '#f0ad4e', color: '#fff', padding: '1px 6px', borderRadius: 8 }}>{pending.length}</span>
            )}
            {k === 'submissions' && submissions.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 11, background: '#f0ad4e', color: '#fff', padding: '1px 6px', borderRadius: 8 }}>{submissions.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: 作者库 ── */}
      {tab === 'authors' && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>加载中...</div>
          ) : authors.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-secondary)', fontSize: 12 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✍</div>
              <p>暂无作者，点击右上角「新建作者」添加</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table className="output-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th style={{ width: 100 }}>姓名</th>
                    <th>简介</th>
                    <th style={{ width: 75 }}>签约状态</th>
                    <th style={{ width: 90 }}>积分分成</th>
                    <th style={{ width: 90 }}>现金分成</th>
                    <th style={{ width: 165 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {authors.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((a, i) => (
                    <tr key={a.id}>
                      <td style={{ color: 'var(--text-secondary)' }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{a.name}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.intro || '—'}
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 500,
                          color: contractStatusColor(a.contract_status || 'none'),
                        }}>
                          {contractStatusLabel(a.contract_status || 'none')}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{a.contract_status === 'active' ? `${((a.revenue_share || 0) * 100).toFixed(0)}%` : '—'}</td>
                      <td style={{ fontSize: 12 }}>{a.contract_status === 'active' ? `${((a.cash_share || 0) * 100).toFixed(0)}%` : '—'}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => openEdit(a)}>编辑</button>
                        {a.contract_status === 'active' || a.contract_status === 'suspended' ? (
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => openContract(a)}>签约</button>
                        ) : null}
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--warning)' }} onClick={() => remove(a)}>删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {Math.ceil(authors.length / PAGE_SIZE) > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '10px 0', fontSize: 11, color: 'var(--text-secondary)' }}>
                  <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
                  <span>第 {page} / {Math.ceil(authors.length / PAGE_SIZE)} 页（共 {authors.length} 条）</span>
                  <button className="btn btn-ghost btn-sm" disabled={page >= Math.ceil(authors.length / PAGE_SIZE)} onClick={() => setPage(p => p + 1)}>下一页</button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Tab: 签约审核 ── */}
      {tab === 'pending' && (
        <>
          {pendingLoading ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>加载中...</div>
          ) : pending.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-secondary)', fontSize: 12 }}>
              <p>暂无待审核的签约申请</p>
            </div>
          ) : pending.map(a => (
            <div key={a.id} className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                    {a.name}
                    {a.user_id && <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8, fontWeight: 400 }}>用户: {a.user_id}</span>}
                  </div>
                  {a.intro && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, lineHeight: 1.6 }}>{a.intro}</div>}
                  {a.photo_url && (
                    <img src={a.photo_url} alt={a.name}
                      style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', marginTop: 4 }} />
                  )}
                  {a.contract_note && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>申请说明: {a.contract_note}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    申请时间: {a.created_at ? new Date(a.created_at).toLocaleString('zh-CN') : '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 16 }}>
                  <button className="btn btn-primary btn-sm"
                    onClick={() => {
                      setApproveOpen(a.id)
                      setApproveRevShare('0.7')
                      setApproveCashShare('0')
                      setApprovePtsPerYuan('100')
                      setApproveNote('')
                    }}>
                    通过
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}
                    onClick={() => handleReject(a.id)}>
                    拒绝
                  </button>
                </div>
              </div>

              {approveOpen === a.id && (
                <div style={{ marginTop: 12, padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>设置分佣比例</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>积分分成 (0~1)</label>
                      <input className="form-input" type="number" step="0.01" min="0" max="1" value={approveRevShare}
                        onChange={e => setApproveRevShare(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>现金分成 (0~1)</label>
                      <input className="form-input" type="number" step="0.01" min="0" max="1" value={approveCashShare}
                        onChange={e => setApproveCashShare(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>积分汇率 (1元=X积分)</label>
                      <input className="form-input" type="number" step="1" min="1" value={approvePtsPerYuan}
                        onChange={e => setApprovePtsPerYuan(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>签约备注</label>
                    <input className="form-input" value={approveNote}
                      onChange={e => setApproveNote(e.target.value)} placeholder="可选备注"
                      style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setApproveOpen(null)}>取消</button>
                    <button className="btn btn-primary btn-sm" disabled={approveSaving}
                      onClick={() => handleApprove(a.id)}>
                      {approveSaving ? '处理中...' : '确认通过'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* ── Tab: 食谱审核 ── */}
      {tab === 'submissions' && (
        <>
          {subLoading ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>加载中...</div>
          ) : submissions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-secondary)', fontSize: 12 }}>
              <p>暂无待审核的食谱提交</p>
            </div>
          ) : submissions.map((s: any) => (
            <div key={s.id} className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{s.name}</div>
                  {s.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 4, maxHeight: 60, overflow: 'hidden' }}>
                      {s.description.length > 150 ? s.description.slice(0, 150) + '…' : s.description}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>作者: {s.author_name || s.author_id}</span>
                    {s.cover_url && <span>有封面图</span>}
                    {s.files_json && s.files_json !== '[]' && <span>附件: {JSON.parse(s.files_json).length} 个</span>}
                    <span>提交: {s.created_at?.substring(0, 10)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 16 }}>
                  <button className="btn btn-primary btn-sm"
                    onClick={() => { setSubApproveOpen(s.id); setSubPointCost('5'); setSubCategory('') }}>
                    通过
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}
                    onClick={() => { setSubRejectOpen(s.id); setSubRejectNote('') }}>
                    驳回
                  </button>
                </div>
              </div>

              {subApproveOpen === s.id && (
                <div style={{ marginTop: 12, padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>通过并创建项目</div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>积分定价 (单位: 分, 5=0.5积分)</label>
                      <input className="form-input" type="number" step="1" min="1" value={subPointCost}
                        onChange={e => setSubPointCost(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>分类 ID (可选)</label>
                      <input className="form-input" value={subCategory}
                        onChange={e => setSubCategory(e.target.value)} placeholder="如: recipe"
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSubApproveOpen(null)}>取消</button>
                    <button className="btn btn-primary btn-sm" disabled={subSaving}
                      onClick={() => handleSubApprove(s.id)}>
                      {subSaving ? '处理中...' : '确认通过'}
                    </button>
                  </div>
                </div>
              )}

              {subRejectOpen === s.id && (
                <div style={{ marginTop: 12, padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>驳回原因</div>
                  <textarea className="form-input" rows={2} value={subRejectNote}
                    onChange={e => setSubRejectNote(e.target.value)} placeholder="填写驳回原因（必填）"
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, marginBottom: 10 }} />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSubRejectOpen(null)}>取消</button>
                    <button className="btn btn-primary btn-sm" disabled={subSaving || !subRejectNote.trim()}
                      onClick={() => handleSubReject(s.id)}>
                      {subSaving ? '处理中...' : '确认驳回'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* ── Tab: 收益管理 ── */}
      {tab === 'revenue' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-sm" onClick={loadRevenue}>刷新</button>
          </div>
          {revLoading ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>加载中...</div>
          ) : !revStats ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>暂无数据</div>
          ) : (
            <>
              {/* Revenue overview */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
                {[
                  { label: '总收益积分', value: ((revStats as any)?.total_points_deci / 10 || 0).toFixed(1) },
                  { label: '总收益现金(元)', value: ((revStats as any)?.total_cash_cents / 100 || 0).toFixed(2) },
                  { label: '未结算积分', value: ((revStats as any)?.unsettled_points_deci / 10 || 0).toFixed(1) },
                  { label: '未结算现金(元)', value: ((revStats as any)?.unsettled_cash_cents / 100 || 0).toFixed(2) },
                ].map(item => (
                  <div key={item.label} style={{ background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)', padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{item.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Per-author breakdown */}
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>按作者汇总</h3>
              {((revStats as any)?.by_author || []).length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 20, fontSize: 12 }}>暂无作者收益数据</p>
              ) : ((revStats as any)?.by_author || []).map((item: any) => (
                <div key={item.author_id} className="card" style={{ padding: 14, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{item.author_name || item.author_id}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>
                        积分: {(item.total_points_deci / 10).toFixed(1)} (未结: {(item.unsettled_points_deci / 10).toFixed(1)})
                        {' · '}现金: ¥{(item.total_cash_cents / 100).toFixed(2)} (未结: ¥{(item.unsettled_cash_cents / 100).toFixed(2)})
                      </span>
                    </div>
                    <button className="btn btn-primary btn-sm"
                      onClick={() => {
                        setPayoutOpen(item.author_id)
                        setActiveAuthorId(item.author_id)
                        setPayoutStart('')
                        setPayoutEnd('')
                        setPayoutNote('')
                      }}>
                      派发
                    </button>
                  </div>

                  {payoutOpen === item.author_id && (
                    <div style={{ marginTop: 12, padding: 14, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>派发收益 — {item.author_name || item.author_id}</div>
                      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>开始日期</label>
                          <input className="form-input" type="date" value={payoutStart}
                            onChange={e => setPayoutStart(e.target.value)}
                            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>结束日期</label>
                          <input className="form-input" type="date" value={payoutEnd}
                            onChange={e => setPayoutEnd(e.target.value)}
                            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} />
                        </div>
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>备注</label>
                        <input className="form-input" value={payoutNote}
                          onChange={e => setPayoutNote(e.target.value)} placeholder="可选备注"
                          style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setPayoutOpen(null)}>取消</button>
                        <button className="btn btn-primary btn-sm" disabled={payoutSaving}
                          onClick={() => handlePayout(activeAuthorId)}>
                          {payoutSaving ? '处理中...' : '确认派发'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Payout history */}
              {payouts.length > 0 && (
                <>
                  <h3 style={{ fontSize: 15, fontWeight: 600, margin: '24px 0 12px' }}>派发记录</h3>
                  <div className="card" style={{ padding: 0 }}>
                    <table className="output-table">
                      <thead>
                        <tr>
                          <th>作者</th>
                          <th>积分</th>
                          <th>现金(元)</th>
                          <th>笔数</th>
                          <th>周期</th>
                          <th>状态</th>
                          <th>时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payouts.map((p: any) => (
                          <tr key={p.id}>
                            <td style={{ fontSize: 12 }}>{p.author_name || p.author_id}</td>
                            <td style={{ fontSize: 12 }}>{(p.points_deci / 10).toFixed(1)}</td>
                            <td style={{ fontSize: 12 }}>¥{(p.cash_cents / 100).toFixed(2)}</td>
                            <td style={{ fontSize: 12 }}>{p.revenue_count}</td>
                            <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              {p.period_start?.substring(0, 10)} ~ {p.period_end?.substring(0, 10)}
                            </td>
                            <td>
                              <span style={{
                                fontSize: 11, padding: '2px 8px', borderRadius: 8, fontWeight: 500,
                                ...(p.status === 'paid' ? { background: '#dcfce7', color: '#166534' } : { background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }),
                              }}>
                                {p.status === 'paid' ? '已派发' : '待派发'}
                              </span>
                            </td>
                            <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.created_at?.substring(0, 10)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ── Author edit dialog ── */}
      {dialogOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => !saving && setDialogOpen(false)}>
          <div style={{
            background: 'var(--bg-primary)', borderRadius: 12, padding: 24, width: 480,
            maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px 0' }}>
              {editingId ? '编辑作者' : '新建作者'}
            </h2>
            <div className="form-group">
              <label className="form-label">姓名 *</label>
              <input className="form-input" type="text" value={formName} autoFocus
                onChange={e => setFormName(e.target.value)} placeholder="作者姓名" />
            </div>
            <div className="form-group">
              <label className="form-label">简介</label>
              <textarea className="form-input" rows={5} value={formIntro}
                onChange={e => setFormIntro(e.target.value)}
                placeholder="作者背景、专长、代表作等..."
                style={{ resize: 'vertical' }} />
            </div>
            <div className="form-group">
              <label className="form-label">授权说明</label>
              <textarea className="form-input" rows={5} value={formLicense}
                onChange={e => setFormLicense(e.target.value)}
                placeholder="内容授权范围、使用条款等..."
                style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" disabled={saving} onClick={() => setDialogOpen(false)}>取消</button>
              <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Contract edit dialog ── */}
      {contractOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => !contractSaving && setContractOpen(null)}>
          <div style={{
            background: 'var(--bg-primary)', borderRadius: 12, padding: 24, width: 440,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px 0' }}>签约管理</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="form-label">签约状态</label>
                <select className="form-input" value={contractStatus}
                  onChange={e => setContractStatus(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}>
                  <option value="active">已签约</option>
                  <option value="suspended">已暂停</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">积分分成 (0~1)</label>
                  <input className="form-input" type="number" step="0.01" min="0" max="1" value={contractRevShare}
                    onChange={e => setContractRevShare(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">现金分成 (0~1)</label>
                  <input className="form-input" type="number" step="0.01" min="0" max="1" value={contractCashShare}
                    onChange={e => setContractCashShare(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label className="form-label">积分汇率 (1元=X积分)</label>
                <input className="form-input" type="number" step="1" min="1" value={contractPtsPerYuan}
                  onChange={e => setContractPtsPerYuan(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label className="form-label">签约备注</label>
                <input className="form-input" value={contractNote}
                  onChange={e => setContractNote(e.target.value)} placeholder="可选"
                  style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setContractOpen(null)}>取消</button>
                <button className="btn btn-primary btn-sm" disabled={contractSaving} onClick={saveContract}>
                  {contractSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
