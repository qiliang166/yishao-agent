import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../services/api'
import { applyThemeToDOM, resetThemeToDefault } from '../services/theme'
import { injectManifest, isStandalone, isWeChat, promptInstall } from './a2hs'
import MLogin from './pages/MLogin'
import MMemberLogin from './pages/MMemberLogin'
import MHome from './pages/MHome'
import MProjects from './pages/MProjects'
import MProject from './pages/MProject'
import MPreview from './pages/MPreview'
import MAdmin from './pages/MAdmin'
import MMe from './pages/MMe'
import MRenew from './pages/MRenew'

// ── 轻量 toast：window 事件驱动，各页面调用 mToast() ──
export function mToast(msg: string, kind: 'info' | 'error' = 'info') {
  window.dispatchEvent(new CustomEvent('m-toast', { detail: { msg, kind } }))
}

function Toaster() {
  const [toast, setToast] = useState<{ msg: string; kind: string } | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail
      if (d == null) return
      setToast({ msg: d.msg, kind: d.kind })
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setToast(null), 2500)
    }
    window.addEventListener('m-toast', handler)
    return () => {
      window.removeEventListener('m-toast', handler)
      if (timer) clearTimeout(timer)
    }
  }, [])
  if (!toast) return null
  return <div className={`m-toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.msg}</div>
}

// ── 顶栏 ──
// back="__back__" 表示浏览器历史返回（用于预览页），其他值为固定路由
export function MTopBar({ title, back, action }: {
  title: string
  back?: string
  action?: { label: string; onClick: () => void }
}) {
  const navigate = useNavigate()
  const handleBack = () => {
    if (back === '__back__') {
      navigate(-1)
    } else if (back != null) {
      navigate(back)
    }
  }
  return (
    <div className="m-topbar">
      {back != null && (
        <button className="m-back-btn" onClick={handleBack}>‹</button>
      )}
      <div className="m-topbar-title">{title}</div>
      {action && (
        <button className="m-topbar-action" onClick={action.onClick}>{action.label}</button>
      )}
    </div>
  )
}

// ── 添加到桌面图文引导弹层（安卓/iOS 共用，A2hsBanner 与个人中心均使用） ──
export function MInstallGuide({ kind, onClose }: {
  kind: 'ios' | 'android'
  onClose: () => void
}) {
  return (
    <div className="m-sheet-mask" onClick={onClose}>
      <div className="m-sheet" onClick={e => e.stopPropagation()}>
        <div className="m-sheet-title">添加到主屏幕</div>
        {kind === 'ios' ? (
          <div style={{ fontSize: 14, lineHeight: 2, padding: '0 4px' }}>
            1. 点击 Safari 底部的 <b>分享按钮</b>（方框加向上箭头 ⬆）<br />
            2. 向下滑动，选择<b>「添加到主屏幕」</b><br />
            3. 点击右上角<b>「添加」</b>完成
          </div>
        ) : (
          <div style={{ fontSize: 14, lineHeight: 2, padding: '0 4px' }}>
            1. 点击浏览器<b>菜单按钮</b>（右上角 ⋮ 或底部 ≡）<br />
            2. 选择<b>「添加到主屏幕」</b>、<b>「添加快捷方式」</b>或<b>「保存到桌面」</b><br />
            3. 确认添加，桌面上就会出现本站图标
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: 8 }}>
              若菜单中没有该选项，请改用手机自带浏览器或 Chrome 打开本页后再操作。
            </div>
          </div>
        )}
        <div className="m-sheet-actions">
          <button className="primary" onClick={onClose}>知道了</button>
        </div>
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="m-loading">加载中…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

// 与桌面版 App.tsx 一致：登录后从服务器设置同步主题，
// 覆盖手机 localStorage 里可能残留的旧主题（如暗夜模式）
function ThemeSync() {
  const { user } = useAuth()
  useEffect(() => {
    if (!user) return
    api.getSettings().then((data: any) => {
      const s = data?.settings || {}
      const themeId = s.theme || 'classic'
      const presetsJson = s.theme_presets

      localStorage.setItem('theme', themeId)
      if (presetsJson) {
        localStorage.setItem('theme_presets', presetsJson)
      } else {
        localStorage.removeItem('theme_presets')
      }

      if (themeId === 'classic') {
        resetThemeToDefault()
      } else if (presetsJson) {
        try {
          const presets = JSON.parse(presetsJson)
          const preset = Array.isArray(presets) ? presets.find((p: any) => p != null && p.id === themeId) : null
          if (preset != null && preset.colors != null) applyThemeToDOM(preset.colors, themeId)
        } catch {}
      }
    }).catch(() => {})
  }, [user])
  return null
}

// ── 首次"添加到桌面"引导条 ──
function A2hsBanner() {
  const [visible, setVisible] = useState(false)
  const [guide, setGuide] = useState<'ios' | 'android' | null>(null)

  useEffect(() => {
    if (isWeChat() || isStandalone()) return
    if (localStorage.getItem('a2hs_dismissed')) return
    setVisible(true)
  }, [])

  const dismiss = () => {
    localStorage.setItem('a2hs_dismissed', '1')
    setVisible(false)
  }

  const handleAdd = async () => {
    try {
      const result = await promptInstall()
      if (result === 'accepted') {
        mToast('已添加到桌面')
        dismiss()
      } else if (result === 'ios') {
        setGuide('ios')
      } else if (result === 'prompted') {
        // 用户在原生弹窗里点了取消 → 保留引导条
      } else if (result === 'installed') {
        dismiss()
      } else {
        // 'unavailable'：HTTP 环境或国产浏览器无 beforeinstallprompt → 图文引导
        setGuide('android')
      }
    } catch (e: any) {
      mToast(`操作失败: ${e?.message || e}`, 'error')
    }
  }

  if (!visible) return null
  return (
    <>
      <div className="m-a2hs-banner">
        <span className="msg">添加到手机桌面，下次一键打开</span>
        <button onClick={handleAdd}>添加</button>
        <button className="ghost" onClick={dismiss}>×</button>
      </div>
      {guide != null && (
        <MInstallGuide kind={guide} onClose={() => { setGuide(null); dismiss() }} />
      )}
    </>
  )
}

export default function MobileApp() {
  useEffect(() => {
    injectManifest()
  }, [])

  return (
    <div className="m-shell">
      <ThemeSync />
      <A2hsBanner />
      <Routes>
        <Route path="/login" element={<MLogin />} />
        <Route path="/member" element={<MMemberLogin />} />
        <Route path="/renew" element={<MRenew />} />
        <Route path="/" element={<RequireAuth><MHome /></RequireAuth>} />
        <Route path="/ws/:wid" element={<RequireAuth><MProjects /></RequireAuth>} />
        <Route path="/project/:id" element={<RequireAuth><MProject /></RequireAuth>} />
        <Route path="/preview" element={<RequireAuth><MPreview /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><MAdmin /></RequireAuth>} />
        <Route path="/me" element={<RequireAuth><MMe /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </div>
  )
}
