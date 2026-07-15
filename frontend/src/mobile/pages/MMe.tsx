import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../services/api'
import { MTopBar, MInstallGuide, mToast } from '../MobileApp'
import { promptInstall } from '../a2hs'

const fmtDate = (v?: string | null) => {
  if (!v) return '永久'
  try {
    return new Date(v).toLocaleDateString('zh-CN')
  } catch {
    return String(v)
  }
}

const fmtDateTime = (v?: string | null) => {
  if (!v) return '—'
  try {
    return new Date(v).toLocaleString('zh-CN')
  } catch {
    return String(v)
  }
}

// 与桌面 MemberCenterPage.expiresInfo 相同的着色逻辑
function ExpiresInfo({ expiresAt }: { expiresAt?: string | null }) {
  if (!expiresAt) return <span style={{ color: 'var(--text-secondary)' }}>永久有效</span>
  const exp = new Date(expiresAt)
  const diff = exp.getTime() - Date.now()
  const days = Math.floor(diff / (86400 * 1000))
  const dateStr = exp.toLocaleDateString('zh-CN')
  if (diff < 0) {
    return <span style={{ color: 'var(--warning)', fontWeight: 600 }}>已过期（{dateStr}）</span>
  }
  if (days <= 7) {
    return <span style={{ color: '#f0ad4e', fontWeight: 600 }}>{days} 天后到期（{dateStr}）</span>
  }
  return <span style={{ color: 'var(--success)' }}>{dateStr}（剩余 {days} 天）</span>
}

export default function MMe() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [me, setMe] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [guide, setGuide] = useState<'ios' | 'android' | null>(null)

  // ── 角色升级 ──
  const [upgradePlan, setUpgradePlan] = useState<any | null>(null)
  const [qrWechat, setQrWechat] = useState('')
  const [qrAlipay, setQrAlipay] = useState('')
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [upgradeMethod, setUpgradeMethod] = useState('wechat')
  const [upgradeRef, setUpgradeRef] = useState('')
  const [upgradeSubmitting, setUpgradeSubmitting] = useState(false)
  const [upgradeSuccess, setUpgradeSuccess] = useState('')

  // ── 修改密码 ──
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState('')
  const [pwError, setPwError] = useState('')

  // ── 申请记录 ──
  const [payments, setPayments] = useState<any[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const token = localStorage.getItem('auth_token')
        const resp = await fetch('/api/auth/me', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const data = await resp.json()
        if (!cancelled && data != null) setMe(data)
      } catch (e: any) {
        if (!cancelled) mToast(`加载失败: ${e?.message || e}`, 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    const loadSettings = async () => {
      try {
        const resp = await fetch('/api/settings')
        if (!resp.ok) return
        const data = await resp.json()
        if (cancelled || data == null) return
        const s = data.settings || {}
        if (s.payment_qr_wechat) setQrWechat(s.payment_qr_wechat)
        if (s.payment_qr_alipay) setQrAlipay(s.payment_qr_alipay)
        if (s.member_plan) {
          try {
            const p = JSON.parse(s.member_plan)
            if (p?.upgrade != null) setUpgradePlan(p.upgrade)
          } catch {}
        }
      } catch {
        // 设置读取失败 → 不显示升级区，不影响其他内容
      }
    }
    const loadPayments = async () => {
      setPaymentsLoading(true)
      try {
        const data = await api.listMyPayments()
        if (!cancelled && data != null && Array.isArray(data.payments)) {
          setPayments(data.payments)
        }
      } catch {
        // 付款记录加载失败不阻塞其他内容
      } finally {
        if (!cancelled) setPaymentsLoading(false)
      }
    }
    load()
    loadSettings()
    loadPayments()
    return () => { cancelled = true }
  }, [])

  const handleA2hs = async () => {
    try {
      const result = await promptInstall()
      if (result === 'accepted') {
        mToast('已添加到桌面')
      } else if (result === 'installed') {
        mToast('当前已是桌面模式')
      } else if (result === 'wechat') {
        mToast('请点微信右上角 ⋯ → 在浏览器打开，再添加到桌面')
      } else if (result === 'ios') {
        setGuide('ios')
      } else if (result === 'unavailable') {
        setGuide('android')
      }
    } catch (e: any) {
      mToast(`操作失败: ${e?.message || e}`, 'error')
    }
  }

  const handleUpgrade = async () => {
    if (!upgradeRef.trim()) {
      mToast('请填写付款单号', 'error')
      return
    }
    setUpgradeSubmitting(true)
    try {
      const result = await api.memberUpgrade({
        payment_method: upgradeMethod,
        payment_ref: upgradeRef.trim(),
      }) as any
      if (result != null) {
        setUpgradeSuccess(result.message || '升级申请已提交，请等待管理员审批')
        setShowUpgrade(false)
      } else {
        mToast('提交失败：服务器未确认', 'error')
      }
    } catch (e: any) {
      mToast(`提交失败: ${e?.message || e}`, 'error')
    } finally {
      setUpgradeSubmitting(false)
    }
  }

  const handleChangePassword = async () => {
    setPwMsg('')
    setPwError('')
    if (!oldPw) { setPwError('请输入旧密码'); return }
    if (newPw.length < 8) { setPwError('新密码至少 8 位'); return }
    if (newPw !== newPw2) { setPwError('两次输入的新密码不一致'); return }
    setPwSaving(true)
    try {
      const token = localStorage.getItem('auth_token')
      const resp = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ old_password: oldPw, new_password: newPw }),
      })
      const data = await resp.json().catch(() => null)
      if (!resp.ok) throw new Error((data as any)?.detail || '修改失败')
      setPwMsg((data as any)?.message || '密码已修改')
      setOldPw(''); setNewPw(''); setNewPw2('')
    } catch (e: any) {
      setPwError(e?.message || '修改失败')
    } finally {
      setPwSaving(false)
    }
  }

  const isMember = me?.user_type === 'member' || user?.user_type === 'member'
  const isPaid = !!me?.permissions?.includes('stage5.download')
  const isUpgraded = !!me?.roles?.includes('开发体验员')
  const isExpired = !!me?.expires_at && new Date(me.expires_at).getTime() < Date.now()
  const upgradeQr = upgradeMethod === 'wechat' ? qrWechat : qrAlipay

  return (
    <>
      <MTopBar title="个人中心" back="/" />
      <div className="m-content">
        {loading ? (
          <div className="m-loading">加载中…</div>
        ) : me == null ? (
          <div className="m-empty">加载失败</div>
        ) : (
          <>
            <div className="m-section-title">个人信息</div>
            <div className="m-kv-group">
              <div className="m-kv">
                <span className="m-kv-label">姓名</span>
                <span className="m-kv-value">{me.display_name || me.username}</span>
              </div>
              <div className="m-kv">
                <span className="m-kv-label">用户名</span>
                <span className="m-kv-value">@{me.username}</span>
              </div>
              <div className="m-kv">
                <span className="m-kv-label">邮箱</span>
                <span className="m-kv-value">{me.email || '未设置'}</span>
              </div>
              <div className="m-kv">
                <span className="m-kv-label">账号类型</span>
                <span className="m-kv-value">{me.user_type === 'admin' ? '管理员' : '会员'}</span>
              </div>
              {Array.isArray(me.roles) && me.roles.length > 0 && (
                <div className="m-kv">
                  <span className="m-kv-label">角色</span>
                  <span className="m-kv-value">{me.roles.join('、')}</span>
                </div>
              )}
              <div className="m-kv">
                <span className="m-kv-label">注册时间</span>
                <span className="m-kv-value">{fmtDateTime(me.created_at)}</span>
              </div>
              <div className="m-kv">
                <span className="m-kv-label">账号状态</span>
                <span className="m-kv-value">{me.is_active ? '正常' : '已停用'}</span>
              </div>
            </div>

            {isMember && (
              <>
                <div className="m-section-title">会员有效期</div>
                <div className="m-kv-group">
                  <div className="m-kv">
                    <span className="m-kv-label">会员到期</span>
                    <span className="m-kv-value"><ExpiresInfo expiresAt={me.expires_at} /></span>
                  </div>
                  {me.upgrade_expires_at && (
                    <div className="m-kv">
                      <span className="m-kv-label">体验员到期</span>
                      <span className="m-kv-value"><ExpiresInfo expiresAt={me.upgrade_expires_at} /></span>
                    </div>
                  )}
                </div>
                <button className="m-btn-primary" style={{ marginBottom: 16 }}
                  onClick={() => navigate(`/renew?u=${encodeURIComponent(me.username || '')}`)}>
                  会员续费
                </button>

                {/* 申请记录 — 与桌面 MemberCenterPage 一致 */}
                {!paymentsLoading && payments.length > 0 && (
                  <>
                    <div className="m-section-title">申请记录</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                      {payments.slice(0, 3).map((p: any, i: number) => {
                        const statusLabel = p.status === 'pending' ? '待审核' : p.status === 'rejected' ? '已拒绝' : p.status === 'confirmed' ? '已确认' : p.status
                        const statusColor = p.status === 'pending' ? '#f0ad4e' : p.status === 'rejected' ? 'var(--warning)' : p.status === 'confirmed' ? '#5cb85c' : 'var(--text-secondary)'
                        return (
                          <div key={i} style={{
                            padding: '10px 12px', borderRadius: 8,
                            background: 'var(--card-bg)', border: '1px solid var(--border)',
                            fontSize: 12,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600 }}>{p.plan_name || '付款记录'}</span>
                              <span style={{
                                fontSize: 11, padding: '2px 8px', borderRadius: 4,
                                background: statusColor + '20', color: statusColor, fontWeight: 600,
                              }}>
                                {statusLabel}
                              </span>
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 4 }}>
                              ￥{(p.amount_cents / 100).toFixed(2)}
                              {p.payment_ref ? ` · 单号：${p.payment_ref}` : ''}
                              {p.paid_at ? ` · ${new Date(p.paid_at).toLocaleString('zh-CN')}` : ''}
                            </div>
                            {p.note && (
                              <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 2 }}>
                                备注：{p.note}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {isUpgraded ? (
              <>
                <div className="m-section-title">角色升级</div>
                <div className="m-kv-group">
                  <div className="m-kv">
                    <span className="m-kv-label">当前身份</span>
                    <span className="m-kv-value" style={{ color: 'var(--primary)', fontWeight: 600 }}>开发体验员</span>
                  </div>
                  <div className="m-kv">
                    <span className="m-kv-label">升级有效期</span>
                    <span className="m-kv-value"><ExpiresInfo expiresAt={me.upgrade_expires_at} /></span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  升级独立计费，到期后需重新购买，与会员有效期无关。
                </div>
              </>
            ) : (isPaid && !isExpired && upgradePlan != null) ? (
              <>
                <div className="m-section-title">角色升级</div>
                {upgradeSuccess ? (
                  <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600, marginBottom: 16 }}>
                    {upgradeSuccess}
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 10 }}>
                      如果您希望搭建属于自己的智能食谱教案生成系统，可申请升级为"开发体验员"，
                      完整体验内容创建、编辑、AI 生成等全部功能。升级独立计费，购买天数用完即止。
                    </div>
                    <button className="m-btn-primary" style={{ marginBottom: 16 }}
                      onClick={() => { setShowUpgrade(true); setUpgradeRef('') }}>
                      申请升级为开发体验员 ￥{upgradePlan.amount_cents != null ? (upgradePlan.amount_cents / 100).toFixed(2) : '—'}/{upgradePlan.duration_days || '—'}天
                    </button>
                  </>
                )}
              </>
            ) : null}

            <div className="m-section-title">修改密码</div>
            <div className="m-field">
              <label>旧密码</label>
              <input className="m-input" type="password" value={oldPw} autoComplete="current-password"
                onChange={e => { setOldPw(e.target.value); setPwError(''); setPwMsg('') }} />
            </div>
            <div className="m-field">
              <label>新密码（至少 8 位）</label>
              <input className="m-input" type="password" value={newPw} autoComplete="new-password"
                onChange={e => { setNewPw(e.target.value); setPwError(''); setPwMsg('') }} />
            </div>
            <div className="m-field">
              <label>确认新密码</label>
              <input className="m-input" type="password" value={newPw2} autoComplete="new-password"
                onChange={e => { setNewPw2(e.target.value); setPwError(''); setPwMsg('') }} />
            </div>
            {pwMsg && <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 8 }}>{pwMsg}</div>}
            {pwError && <div className="m-error">{pwError}</div>}
            <button className="m-btn-primary" style={{ marginBottom: 16 }}
              disabled={pwSaving} onClick={handleChangePassword}>
              {pwSaving ? '修改中…' : '修改密码'}
            </button>

            <button className="m-btn-primary"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text)', border: '1px solid var(--border)' }}
              onClick={handleA2hs}>
              添加到桌面
            </button>
          </>
        )}
      </div>

      {showUpgrade && upgradePlan != null && (
        <div className="m-sheet-mask" onClick={() => { if (!upgradeSubmitting) setShowUpgrade(false) }}>
          <div className="m-sheet" onClick={e => e.stopPropagation()}>
            <div className="m-sheet-title">
              申请升级 · ￥{upgradePlan.amount_cents != null ? (upgradePlan.amount_cents / 100).toFixed(2) : '—'}/{upgradePlan.duration_days || '—'}天
            </div>
            <div className="m-pay-tabs">
              <button className={upgradeMethod === 'wechat' ? 'active' : ''}
                onClick={() => setUpgradeMethod('wechat')}>微信支付</button>
              <button className={upgradeMethod === 'alipay' ? 'active' : ''}
                onClick={() => setUpgradeMethod('alipay')}>支付宝</button>
            </div>
            {upgradeQr ? (
              <img className="m-qr-preview" src={upgradeQr} alt="收款码" />
            ) : (
              <div className="m-qr-empty">该渠道收款码未配置，请联系管理员</div>
            )}
            <div className="m-field" style={{ marginTop: 10 }}>
              <label>付款单号（付款后在微信/支付宝账单中查看）</label>
              <input className="m-input" value={upgradeRef} placeholder="扫码付款后填写"
                onChange={e => setUpgradeRef(e.target.value)} />
            </div>
            <div className="m-sheet-actions">
              <button disabled={upgradeSubmitting} onClick={() => setShowUpgrade(false)}>取消</button>
              <button className="primary" disabled={upgradeSubmitting} onClick={handleUpgrade}>
                {upgradeSubmitting ? '提交中…' : '提交申请'}
              </button>
            </div>
          </div>
        </div>
      )}

      {guide != null && (
        <MInstallGuide kind={guide} onClose={() => setGuide(null)} />
      )}
    </>
  )
}
