import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { MTopBar, mToast } from '../MobileApp'
import { promptInstall } from '../a2hs'

const fmtDate = (v?: string | null) => {
  if (!v) return '永久'
  try {
    return new Date(v).toLocaleDateString('zh-CN')
  } catch {
    return String(v)
  }
}

export default function MMe() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [me, setMe] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [iosGuide, setIosGuide] = useState(false)

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
    load()
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
        setIosGuide(true)
      } else if (result === 'unavailable') {
        mToast('当前浏览器不支持，请在浏览器菜单中选择"添加到主屏幕"')
      }
    } catch (e: any) {
      mToast(`操作失败: ${e?.message || e}`, 'error')
    }
  }

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
            <div className="m-kv-group">
              <div className="m-kv">
                <span className="m-kv-label">姓名</span>
                <span className="m-kv-value">{me.display_name || me.username}</span>
              </div>
              <div className="m-kv">
                <span className="m-kv-label">用户名</span>
                <span className="m-kv-value">@{me.username}</span>
              </div>
              {me.email && (
                <div className="m-kv">
                  <span className="m-kv-label">邮箱</span>
                  <span className="m-kv-value">{me.email}</span>
                </div>
              )}
              <div className="m-kv">
                <span className="m-kv-label">账号类型</span>
                <span className="m-kv-value">{me.user_type === 'admin' ? '管理员' : '会员'}</span>
              </div>
              {me.user_type === 'member' && (
                <div className="m-kv">
                  <span className="m-kv-label">会员到期</span>
                  <span className="m-kv-value">{fmtDate(me.expires_at)}</span>
                </div>
              )}
              {me.upgrade_expires_at && (
                <div className="m-kv">
                  <span className="m-kv-label">体验员到期</span>
                  <span className="m-kv-value">{fmtDate(me.upgrade_expires_at)}</span>
                </div>
              )}
              {Array.isArray(me.roles) && me.roles.length > 0 && (
                <div className="m-kv">
                  <span className="m-kv-label">角色</span>
                  <span className="m-kv-value">{me.roles.join('、')}</span>
                </div>
              )}
            </div>

            {(me.user_type === 'member' || user?.user_type === 'member') && (
              <button className="m-btn-primary" style={{ marginBottom: 12 }}
                onClick={() => navigate(`/renew?u=${encodeURIComponent(me.username || '')}`)}>
                会员续费
              </button>
            )}

            <button className="m-btn-primary"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text)', border: '1px solid var(--border)' }}
              onClick={handleA2hs}>
              添加到桌面
            </button>
          </>
        )}
      </div>

      {iosGuide && (
        <div className="m-sheet-mask" onClick={() => setIosGuide(false)}>
          <div className="m-sheet" onClick={e => e.stopPropagation()}>
            <div className="m-sheet-title">添加到主屏幕</div>
            <div style={{ fontSize: 14, lineHeight: 2, padding: '0 4px' }}>
              1. 点击 Safari 底部的 <b>分享按钮</b>（方框加向上箭头 ⬆）<br />
              2. 向下滑动，选择<b>「添加到主屏幕」</b><br />
              3. 点击右上角<b>「添加」</b>完成
            </div>
            <div className="m-sheet-actions">
              <button className="primary" onClick={() => setIosGuide(false)}>知道了</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
