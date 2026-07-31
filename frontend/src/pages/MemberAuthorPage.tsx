import { useState, useEffect } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { api } from '../services/api'
import { useModal } from '../components/ModalProvider'

const DEFAULT_CONTRACT_TEMPLATE = `## 签约作者协议

欢迎申请成为本平台签约作者。签约后，您将获得以下权益：

1. **收益分佣**：您的食谱作品被会员下载后，将按签约比例获得积分和现金收益。
2. **作品上架**：提交的食谱经审核通过后，将上架至平台供会员浏览和下载。
3. **作者主页**：拥有个人专属作者主页，展示您的相片和作品集。

**签约义务**：
- 保证提交作品的原创性，不得侵犯他人知识产权
- 遵守平台审核规范，配合管理员的内容审核
- 分佣比例以签约时约定为准，平台有权根据规则调整

如您同意以上条款，请勾选下方确认框并提交申请。`

export default function MemberAuthorPage() {
  const modal = useModal()
  const [status, setStatus] = useState<any>(null)
  const [revenue, setRevenue] = useState<any>(null)
  const [submissions, setSubmissions] = useState<any[]>([])
  const [payouts, setPayouts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'revenue' | 'submit' | 'submissions' | 'payouts'>('revenue')

  // Apply form
  const [showApply, setShowApply] = useState(false)
  const [applyName, setApplyName] = useState('')
  const [applyIntro, setApplyIntro] = useState('')
  const [applyPhotoUrl, setApplyPhotoUrl] = useState('')
  const [applyNote, setApplyNote] = useState('')
  const [applying, setApplying] = useState(false)

  // Contract agreement
  const [contractEnabled, setContractEnabled] = useState(false)
  const [contractTemplate, setContractTemplate] = useState('')
  const [agreedContract, setAgreedContract] = useState(false)

  // Submit recipe form
  const [showSubmit, setShowSubmit] = useState(false)
  const [recipeName, setRecipeName] = useState('')
  const [recipeDesc, setRecipeDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const s = await api.myAuthorStatus()
      setStatus(s)
      if ((s as any)?.author?.contract_status === 'active') {
        const [rev, subs, pays] = await Promise.all([
          api.myAuthorRevenue(1, 50),
          api.mySubmissions(),
          api.myAuthorPayouts(),
        ])
        setRevenue(rev)
        setSubmissions((subs as any)?.submissions || [])
        setPayouts((pays as any)?.payouts || [])
      }
    } catch (e: any) {
      modal.toast('加载失败: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Load contract enabled flag on mount
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        const s = data.settings || {}
        setContractEnabled(s.author_contract_enabled === '1')
      })
      .catch(() => {})
  }, [])

  // Load contract template when apply form opens
  useEffect(() => {
    if (!showApply) return
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        const s = data.settings || {}
        setContractTemplate(s.author_contract_template || DEFAULT_CONTRACT_TEMPLATE)
      })
      .catch(() => setContractTemplate(DEFAULT_CONTRACT_TEMPLATE))
  }, [showApply])

  const handleApply = async () => {
    if (!applyName.trim()) { modal.toast('请输入作者姓名', 'error'); return }
    setApplying(true)
    try {
      await api.applyAuthor({ name: applyName.trim(), intro: applyIntro, photo_url: applyPhotoUrl, note: applyNote })
      modal.toast('申请已提交，等待管理员审核', 'success')
      setShowApply(false)
      load()
    } catch (e: any) {
      modal.toast('申请失败: ' + e.message, 'error')
    } finally { setApplying(false) }
  }

  const handleSubmitRecipe = async () => {
    if (!recipeName.trim()) { modal.toast('请输入食谱名称', 'error'); return }
    setSubmitting(true)
    try {
      await api.submitRecipe({ name: recipeName.trim(), description: recipeDesc })
      modal.toast('食谱已提交，等待审核', 'success')
      setShowSubmit(false)
      setRecipeName(''); setRecipeDesc('')
      load()
    } catch (e: any) {
      modal.toast('提交失败: ' + e.message, 'error')
    } finally { setSubmitting(false) }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>加载中...</div>

  const author = (status as any)?.author
  const isActive = author?.contract_status === 'active'
  const isPending = author?.contract_status === 'pending'

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 20px' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 24px 0' }}>作者中心</h2>

      {/* Not yet applied */}
      {!author && !showApply && (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
          {contractEnabled ? (
            <>
              <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 24 }}>你还没有申请成为签约作者</p>
              <button className="btn btn-primary" onClick={() => setShowApply(true)}>申请成为签约作者</button>
            </>
          ) : (
            <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>签约功能暂未开放</p>
          )}
        </div>
      )}

      {/* Apply form */}
      {!author && showApply && (
        <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', padding: 24 }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: 16 }}>签约作者申请</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div className="form-label">作者姓名 *</div>
              <input className="form-input" value={applyName} onChange={e => setApplyName(e.target.value)} placeholder="你的笔名或真实姓名" />
            </div>
            <div>
              <div className="form-label">简介</div>
              <textarea className="form-input" rows={3} value={applyIntro} onChange={e => setApplyIntro(e.target.value)} placeholder="介绍你的专业背景、擅长菜系等" />
            </div>
            <div>
              <div className="form-label">相片 URL</div>
              <input className="form-input" value={applyPhotoUrl} onChange={e => setApplyPhotoUrl(e.target.value)} placeholder="头像/相片的图片链接" />
            </div>
            <div>
              <div className="form-label">申请说明</div>
              <textarea className="form-input" rows={2} value={applyNote} onChange={e => setApplyNote(e.target.value)} placeholder="补充说明（可选）" />
            </div>
            {/* Contract notice */}
            {contractEnabled && contractTemplate && (
              <>
                <div style={{
                  border: '1px solid var(--border)', borderRadius: 8, padding: 12,
                  background: 'var(--bg-secondary)', maxHeight: 200, overflowY: 'auto',
                }}>
                  <div className="prev-md" style={{ fontSize: 12, lineHeight: 1.7 }}
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(contractTemplate) as string) }} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={agreedContract} onChange={e => setAgreedContract(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  <span>我已阅读并同意签约须知</span>
                </label>
              </>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" disabled={applying || (contractEnabled && !agreedContract)} onClick={handleApply}>{applying ? '提交中...' : '提交申请'}</button>
              <button className="btn btn-ghost" onClick={() => { setShowApply(false); setAgreedContract(false) }}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Pending */}
      {isPending && (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <p style={{ fontSize: 16, color: 'var(--warning)', marginBottom: 8 }}>申请审核中</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>你的签约申请正在审核，请耐心等待管理员处理</p>
        </div>
      )}

      {/* Active author */}
      {isActive && (
        <>
          {/* Revenue summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: '累计积分收益', value: ((revenue as any)?.total_points_deci / 10 || 0).toFixed(1) },
              { label: '累计现金收益(元)', value: ((revenue as any)?.total_cash_cents / 100 || 0).toFixed(2) },
              { label: '待结算积分', value: ((revenue as any)?.unsettled_points_deci / 10 || 0).toFixed(1) },
              { label: '待结算现金(元)', value: ((revenue as any)?.unsettled_cash_cents / 100 || 0).toFixed(2) },
              { label: '收益笔数', value: (revenue as any)?.revenue_count || 0 },
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)', padding: '16px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
            {(['revenue', 'submit', 'submissions', 'payouts'] as const).map(t => (
              <button key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 14, fontWeight: tab === t ? 600 : 400,
                  color: tab === t ? 'var(--text)' : 'var(--text-secondary)',
                  borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                }}>
                {{ revenue: '收益明细', submit: '提交食谱', submissions: '我的提交', payouts: '派发记录' }[t]}
              </button>
            ))}
          </div>

          {/* Revenue tab */}
          {tab === 'revenue' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button className="btn btn-sm" onClick={load}>刷新</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>作品</th>
                    <th style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>消耗积分</th>
                    <th style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>积分收益</th>
                    <th style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>现金收益</th>
                    <th style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>状态</th>
                    <th style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {((revenue as any)?.rows || []).map((r: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px' }}>{r.project_name || r.project_id}</td>
                      <td style={{ padding: '8px 12px' }}>{(r.points_spent_deci / 10).toFixed(1)}</td>
                      <td style={{ padding: '8px 12px' }}>{(r.author_points_deci / 10).toFixed(1)}</td>
                      <td style={{ padding: '8px 12px' }}>{(r.author_cash_cents / 100).toFixed(2)}</td>
                      <td style={{ padding: '8px 12px' }}>{r.settled ? '已结算' : '待结算'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: 12 }}>{r.created_at?.substring(0, 10)}</td>
                    </tr>
                  ))}
                  {((revenue as any)?.rows || []).length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>暂无收益记录</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Submit tab */}
          {tab === 'submit' && (
            <div>
              <button className="btn btn-primary" onClick={() => setShowSubmit(true)}>+ 提交新食谱</button>
              {showSubmit && (
                <div style={{ marginTop: 16, background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', padding: 24 }}>
                  <h3 style={{ margin: '0 0 20px 0', fontSize: 16 }}>提交食谱</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <div className="form-label">食谱名称 *</div>
                      <input className="form-input" value={recipeName} onChange={e => setRecipeName(e.target.value)} placeholder="输入食谱名称" />
                    </div>
                    <div>
                      <div className="form-label">食谱描述/正文</div>
                      <textarea className="form-input" rows={5} value={recipeDesc} onChange={e => setRecipeDesc(e.target.value)} placeholder="食谱的详细内容、步骤等" />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" disabled={submitting} onClick={handleSubmitRecipe}>{submitting ? '提交中...' : '提交'}</button>
                      <button className="btn btn-ghost" onClick={() => setShowSubmit(false)}>取消</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Submissions tab */}
          {tab === 'submissions' && (
            <div>
              {submissions.map((s: any, i: number) => (
                <div key={i} style={{
                  padding: '14px 16px', marginBottom: 8, background: 'var(--card-bg)',
                  borderRadius: 8, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{s.created_at?.substring(0, 10)}</div>
                  </div>
                  <div>
                    <span style={{
                      fontSize: 12, padding: '2px 10px', borderRadius: 10, fontWeight: 500,
                      ...(s.status === 'approved' ? { background: '#dcfce7', color: '#166534' }
                        : s.status === 'rejected' ? { background: '#fef2f2', color: '#991b1b' }
                        : { background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }),
                    }}>
                      {{ pending: '待审核', approved: '已通过', rejected: '已驳回' }[s.status as string] || s.status}
                    </span>
                    {s.review_note && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, textAlign: 'right' }}>{s.review_note}</div>}
                  </div>
                </div>
              ))}
              {submissions.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 20 }}>暂无提交记录</p>}
            </div>
          )}

          {/* Payouts tab */}
          {tab === 'payouts' && (
            <div>
              {payouts.map((p: any, i: number) => (
                <div key={i} style={{
                  padding: '14px 16px', marginBottom: 8, background: 'var(--card-bg)',
                  borderRadius: 8, border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>
                        积分: {(p.points_deci / 10).toFixed(1)} | 现金: ¥{(p.cash_cents / 100).toFixed(2)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        {p.period_start?.substring(0, 10)} ~ {p.period_end?.substring(0, 10)} · {p.revenue_count} 笔
                      </div>
                    </div>
                    <span style={{
                      fontSize: 12, padding: '2px 10px', borderRadius: 10, fontWeight: 500,
                      ...(p.status === 'paid' ? { background: '#dcfce7', color: '#166534' } : { background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }),
                    }}>
                      {p.status === 'paid' ? '已派发' : '待派发'}
                    </span>
                  </div>
                  {p.note && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>备注: {p.note}</div>}
                </div>
              ))}
              {payouts.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 20 }}>暂无派发记录</p>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
