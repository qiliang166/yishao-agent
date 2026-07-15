import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import MLogin from './pages/MLogin'
import MMemberLogin from './pages/MMemberLogin'
import MHome from './pages/MHome'
import MProjects from './pages/MProjects'
import MProject from './pages/MProject'
import MPreview from './pages/MPreview'

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

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="m-loading">加载中…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function MobileApp() {
  return (
    <div className="m-shell">
      <Routes>
        <Route path="/login" element={<MLogin />} />
        <Route path="/member" element={<MMemberLogin />} />
        <Route path="/" element={<RequireAuth><MHome /></RequireAuth>} />
        <Route path="/ws/:wid" element={<RequireAuth><MProjects /></RequireAuth>} />
        <Route path="/project/:id" element={<RequireAuth><MProject /></RequireAuth>} />
        <Route path="/preview" element={<RequireAuth><MPreview /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </div>
  )
}
