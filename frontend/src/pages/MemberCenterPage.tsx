import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../services/api'

interface MemberProfile {
  user_id: string
  username: string
  display_name: string
  email: string
  user_type: string
  expires_at: string | null
  upgrade_expires_at: string | null
  created_at: string
  is_approved: number
  is_active: number
  permissions: string[]
  roles: string[]
}

export default function MemberCenterPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<MemberProfile | null>(null)
  const [loading, setLoading] = useState(true)

  // Change password
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState('')
  const [pwError, setPwError] = useState('')

  // Upgrade
  const [upgradePlan, setUpgradePlan] = useState<any>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [upgradePaymentMethod, setUpgradePaymentMethod] = useState('wechat')
  const [upgradePaymentRef, setUpgradePaymentRef] = useState('')
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [upgradeError, setUpgradeError] = useState('')
  const [upgradeSuccess, setUpgradeSuccess] = useState('')
  const [qrCodes, setQrCodes] = useState<{ wechat: string; alipay: string }>({ wechat: '', alipay: '' })
  const [payments, setPayments] = useState<any[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(true)

  // Points
  const [points, setPoints] = useState<{ balance_deci: number; balance_display: string; expires_at: string | null; unlocked_count: number } | null>(null)
  const [unlockedProjects, setUnlockedProjects] = useState<any[]>([])

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    fetch('/api/auth/me', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => setProfile(data))
      .catch(() => {})
      .finally(() => setLoading(false))

    fetch('/api/settings').then(r => r.json()).then(data => {
      const s = data.settings || {}
      if (s.payment_qr_wechat) setQrCodes(prev => ({ ...prev, wechat: s.payment_qr_wechat }))
      if (s.payment_qr_alipay) setQrCodes(prev => ({ ...prev, alipay: s.payment_qr_alipay }))
      if (s.member_plan) {
        try {
          const p = JSON.parse(s.member_plan)
          if (p.upgrade) setUpgradePlan(p.upgrade)
        } catch {}
      }
    }).catch(() => {})

    api.listMyPayments()
      .then(data => setPayments(data?.payments || []))
      .catch(() => {})
      .finally(() => setPaymentsLoading(false))

    // Points
    api.getMyPoints().then(d => { if (d) setPoints(d) }).catch(() => {})
    api.getMyUnlockedProjects().then(d => {
      if (d?.unlocked) setUnlockedProjects(d.unlocked)
    }).catch(() => {})
  }, [])

  const handleChangePassword = async () => {
    setPwMsg('')
    setPwError('')
    if (!oldPw) { setPwError('请输入旧密码'); return }
    if (newPw.length < 8) { setPwError('新密码至少8位'); return }
    if (newPw !== newPw2) { setPwError('两次输入的新密码不一致'); return }

    setPwSaving(true)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ old_password: oldPw, new_password: newPw }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || '修改失败')
      setPwMsg(data.message || '密码已修改')
      setOldPw(''); setNewPw(''); setNewPw2('')
    } catch (e: any) {
      setPwError(e.message)
    } finally {
      setPwSaving(false)
    }
  }

  const handleUpgrade = async () => {
    setUpgradeError('')
    setUpgradeLoading(true)
    try {
      const result = await api.memberUpgrade({
        payment_method: upgradePaymentMethod,
        payment_ref: upgradePaymentRef,
      })
      setUpgradeSuccess(result.message || '升级申请已提交')
      setShowUpgrade(false)
    } catch (e: any) {
      setUpgradeError(e.message || '操作失败')
    } finally {
      setUpgradeLoading(false)
    }
  }

  const expiresInfo = () => {
    if (!profile?.expires_at) {
      return <span style={{ color: 'var(--text-secondary)' }}>永久有效</span>
    }
    const now = new Date()
    const exp = new Date(profile.expires_at)
    const diff = exp.getTime() - now.getTime()
    const days = Math.floor(diff / (86400 * 1000))
    if (diff < 0) {
      return <span style={{ color: 'var(--warning)', fontWeight: 600 }}>已过期 ({new Date(profile.expires_at).toLocaleDateString('zh-CN')})</span>
    }
    if (days <= 7) {
      return <span style={{ color: '#f0ad4e', fontWeight: 600 }}>{days} 天后到期 ({new Date(profile.expires_at).toLocaleDateString('zh-CN')})</span>
    }
    return <span style={{ color: 'var(--success)' }}>{new Date(profile.expires_at).toLocaleDateString('zh-CN')}（剩余 {days} 天）</span>
  }

  const upgradeExpiresInfo = () => {
    if (!profile?.upgrade_expires_at) return null
    const now = new Date()
    const exp = new Date(profile.upgrade_expires_at)
    const diff = exp.getTime() - now.getTime()
    const days = Math.max(0, Math.floor(diff / (86400 * 1000)))
    if (diff < 0) {
      return <span style={{ color: 'var(--warning)', fontWeight: 600 }}>已过期 ({new Date(profile.upgrade_expires_at).toLocaleDateString('zh-CN')})</span>
    }
    return <span style={{ color: 'var(--success)' }}>{new Date(profile.upgrade_expires_at).toLocaleDateString('zh-CN')}（剩余 {days} 天）</span>
  }

  const isPaid = profile?.permissions?.includes('stage5.download')
  const isUpgraded = profile?.roles?.includes('开发体验员')
  const isExpired = (() => {
    if (!profile?.expires_at) return false
    return new Date(profile.expires_at).getTime() < Date.now()
  })()

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>加载中...</div>
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 0' }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 20px 0' }}>会员中心</h2>

      {/* Profile Info */}
      <div className="ac-sub-item" style={{ marginBottom: 16 }}>
        <div className="ac-sub-item-header">个人信息</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          <div style={{ display: 'flex' }}>
            <span style={{ width: 80, color: 'var(--text-secondary)', flexShrink: 0 }}>用户名</span>
            <span>{profile?.username}</span>
          </div>
          <div style={{ display: 'flex' }}>
            <span style={{ width: 80, color: 'var(--text-secondary)', flexShrink: 0 }}>显示名</span>
            <span>{profile?.display_name || '—'}</span>
          </div>
          <div style={{ display: 'flex' }}>
            <span style={{ width: 80, color: 'var(--text-secondary)', flexShrink: 0 }}>邮箱</span>
            <span>{profile?.email || '未设置'}</span>
          </div>
          <div style={{ display: 'flex' }}>
            <span style={{ width: 80, color: 'var(--text-secondary)', flexShrink: 0 }}>当前角色</span>
            <span>{profile?.roles?.join('、') || '—'}</span>
          </div>
          <div style={{ display: 'flex' }}>
            <span style={{ width: 80, color: 'var(--text-secondary)', flexShrink: 0 }}>注册时间</span>
            <span>{profile?.created_at ? new Date(profile.created_at).toLocaleString('zh-CN') : '—'}</span>
          </div>
          <div style={{ display: 'flex' }}>
            <span style={{ width: 80, color: 'var(--text-secondary)', flexShrink: 0 }}>账号状态</span>
            <span>{profile?.is_active ? '正常' : '已停用'}</span>
          </div>
        </div>
      </div>

      {/* Expiration */}
      <div className="ac-sub-item" style={{ marginBottom: 16 }}>
        <div className="ac-sub-item-header">会员有效期</div>
        <div style={{ fontSize: 13, padding: '4px 0' }}>
          {expiresInfo()}
        </div>
        {!isExpired && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link to={`/member/renew?username=${profile?.username || ''}`} style={{
              fontSize: 11, color: 'var(--primary)', textDecoration: 'none',
              fontWeight: 600,
            }}>
              会员+积分 →
            </Link>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
              会员快到期？续费延长有效期并赠送积分
            </span>
          </div>
        )}
      </div>

      {/* Points Balance */}
      {points != null && (
        <div className="ac-sub-item" style={{ marginBottom: 16 }}>
          <div className="ac-sub-item-header">积分余额</div>
          <div style={{ fontSize: 13, padding: '4px 0' }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>
              {points.balance_display}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 11, marginLeft: 6 }}>积分</span>
            {points.expires_at && (
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>
                · 有效期至 {new Date(points.expires_at).toLocaleDateString('zh-CN')}
              </span>
            )}
          </div>
          {unlockedProjects.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
              已解锁 {unlockedProjects.length} 个明细：
              {unlockedProjects.map((p: any) => p.project_name).join('、')}
            </div>
          )}
        </div>
      )}

      {/* Upgrade Section */}
      {isPaid && !isUpgraded && !isExpired && upgradePlan && (
        <div className="ac-sub-item" style={{ marginBottom: 16 }}>
          <div className="ac-sub-item-header">角色升级</div>
          <div style={{ fontSize: 13, padding: '4px 0' }}>
            <p style={{ margin: '0 0 8px 0', color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.6 }}>
              如果您希望搭建属于自己的智能食谱教案生成系统，可申请升级为"开发体验员"，完整体验内容创建、编辑、AI 生成等全部功能，帮助您了解系统能力与使用方法。确认需求后可联系管理员购买授权码并申请独立部署。升级独立计费，购买天数用完即止。
            </p>
            {upgradeSuccess ? (
              <div style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600 }}>{upgradeSuccess}</div>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => {
                setShowUpgrade(true)
                setUpgradeError('')
                setUpgradePaymentRef('')
              }}>
                申请升级为开发体验员
              </button>
            )}
          </div>

          {/* Upgrade Dialog (inline) */}
          {showUpgrade && (
            <div style={{
              background: '#f8fafc', borderRadius: 8, padding: 16, marginTop: 12,
              border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                申请升级 · ￥{upgradePlan.amount_cents ? (upgradePlan.amount_cents / 100).toFixed(2) : '—'} / {upgradePlan.duration_days}天
              </div>

              {/* QR codes */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                  onClick={() => setUpgradePaymentMethod('wechat')}
                  style={{
                    flex: 1, padding: '6px 0', fontSize: 11, borderRadius: 6, border: 'none',
                    cursor: 'pointer', fontWeight: upgradePaymentMethod === 'wechat' ? 700 : 400,
                    background: upgradePaymentMethod === 'wechat' ? 'var(--primary)' : 'var(--card-bg)',
                    color: upgradePaymentMethod === 'wechat' ? '#fff' : 'var(--text)',
                  }}
                >
                  微信支付
                </button>
                <button
                  onClick={() => setUpgradePaymentMethod('alipay')}
                  style={{
                    flex: 1, padding: '6px 0', fontSize: 11, borderRadius: 6, border: 'none',
                    cursor: 'pointer', fontWeight: upgradePaymentMethod === 'alipay' ? 700 : 400,
                    background: upgradePaymentMethod === 'alipay' ? 'var(--primary)' : 'var(--card-bg)',
                    color: upgradePaymentMethod === 'alipay' ? '#fff' : 'var(--text)',
                  }}
                >
                  支付宝
                </button>
              </div>

              {(upgradePaymentMethod === 'wechat' && qrCodes.wechat) || (upgradePaymentMethod === 'alipay' && qrCodes.alipay) ? (
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <img
                    src={upgradePaymentMethod === 'wechat' ? qrCodes.wechat : qrCodes.alipay}
                    alt="收款码"
                    style={{ width: 140, height: 140, objectFit: 'contain', borderRadius: 8 }}
                  />
                </div>
              ) : (
                <div style={{
                  textAlign: 'center', padding: '10px 0', marginBottom: 12,
                  color: 'var(--text-secondary)', fontSize: 11,
                }}>
                  请联系管理员获取收款码
                </div>
              )}

              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>交易单号</div>
              <input
                className="form-input"
                type="text"
                placeholder="支付完成后填写交易单号"
                value={upgradePaymentRef}
                onChange={e => setUpgradePaymentRef(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', fontSize: 11 }}
              />

              {upgradeError && (
                <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 10, textAlign: 'center' }}>
                  {upgradeError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowUpgrade(false)}>取消</button>
                <button className="btn btn-primary btn-sm" onClick={() => handleUpgrade()} disabled={upgradeLoading}>
                  {upgradeLoading ? '提交中...' : '提交申请'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isUpgraded && (
        <div className="ac-sub-item" style={{ marginBottom: 16 }}>
          <div className="ac-sub-item-header">角色升级</div>
          <div style={{ fontSize: 12, padding: '4px 0', color: 'var(--primary)', fontWeight: 600 }}>
            当前已是开发体验员
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            升级有效期：{upgradeExpiresInfo() || '—'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
            升级独立计费，到期后需重新购买。与会员有效期无关。
          </div>
        </div>
      )}

      {/* Payment History */}
      {!paymentsLoading && payments.length > 0 && (
        <div className="ac-sub-item" style={{ marginBottom: 16 }}>
          <div className="ac-sub-item-header">申请记录</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {payments.slice(0, 3).map((p: any, i: number) => {
              const statusLabel = p.status === 'pending' ? '待审核' : p.status === 'rejected' ? '已拒绝' : p.status === 'confirmed' ? '已确认' : p.status
              const statusColor = p.status === 'pending' ? '#f0ad4e' : p.status === 'rejected' ? 'var(--warning)' : p.status === 'confirmed' ? '#5cb85c' : 'var(--text-secondary)'
              return (
                <div key={i} style={{
                  padding: '8px 12px', borderRadius: 6,
                  background: 'var(--card-bg)', border: '1px solid var(--border)',
                  fontSize: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{p.plan_name || '付款记录'}</span>
                    <span style={{
                      fontSize: 11, padding: '2px 6px', borderRadius: 4,
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
        </div>
      )}

      {/* Change Password */}
      <div className="ac-sub-item">
        <div className="ac-sub-item-header">修改密码</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 3 }}>旧密码</label>
            <input className="form-input" type="password" value={oldPw}
              onChange={e => setOldPw(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 3 }}>新密码（至少8位）</label>
            <input className="form-input" type="password" value={newPw}
              onChange={e => setNewPw(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 3 }}>确认新密码</label>
            <input className="form-input" type="password" value={newPw2}
              onChange={e => setNewPw2(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          {pwMsg && (
            <div style={{ fontSize: 12, color: 'var(--success)', textAlign: 'center' }}>{pwMsg}</div>
          )}
          {pwError && (
            <div style={{ fontSize: 12, color: 'var(--warning)', textAlign: 'center' }}>{pwError}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary btn-sm" onClick={handleChangePassword} disabled={pwSaving}>
              {pwSaving ? '修改中...' : '修改密码'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
