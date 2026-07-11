import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface MemberProfile {
  user_id: string
  username: string
  display_name: string
  email: string
  user_type: string
  expires_at: string | null
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

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    fetch('/api/auth/me', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => setProfile(data))
      .catch(() => {})
      .finally(() => setLoading(false))
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
            <span>@{profile?.username}</span>
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
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
          如需续期，请联系管理员
        </div>
      </div>

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
