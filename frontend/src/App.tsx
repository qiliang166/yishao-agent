import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import HomePage from './pages/HomePage'
import ProjectPage from './pages/ProjectPage'
import SettingsPage from './pages/SettingsPage'
import ProjSettingsPage from './pages/ProjSettingsPage'
import TemplateManager from './pages/TemplateManager'
import LoginPage from './pages/LoginPage'
import { ModalProvider } from './components/ModalProvider'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { api } from './services/api'
import { applyThemeToDOM, resetThemeToDefault } from './services/theme'
import './App.css'

function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [brandLogo, setBrandLogo] = useState('⚡')
  const [brandName, setBrandName] = useState('')
  const [sidebarVersion, setSidebarVersion] = useState('1.0.0')
  const [projName, setProjName] = useState('')
  const isWorkspace = location.pathname.startsWith('/project/')

  useEffect(() => {
    Promise.all([api.getSettings(), api.getVersion()]).then(([data, ver]) => {
      const s = data.settings || {}
      const fallback = (ver as any).app || ''
      if (s.brand_logo) setBrandLogo(s.brand_logo)
      if (s.brand_name) {
        setBrandName(s.brand_name)
        document.title = s.brand_name
      } else if (fallback) {
        document.title = fallback
      }
      if ((ver as any).version) setSidebarVersion((ver as any).version)
      if (s.app_version) setSidebarVersion(s.app_version)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const parts = location.pathname.split('/')
    const id = parts[1] === 'project' ? parts[2] : null
    if (id) {
      api.getProject(id).then((p: any) => setProjName(p.name || '')).catch(() => setProjName(''))
    } else {
      setProjName('')
    }
  }, [location.pathname])

  const isImagePath = (v: string) => v.startsWith('/api/logos/') || v.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)($|\?)/i)

  const renderLogo = () => {
    if (isImagePath(brandLogo)) {
      return <img src={brandLogo} alt="Logo" style={{ width: 18, height: 18, borderRadius: 3, objectFit: 'cover', verticalAlign: 'middle' }} />
    }
    return <span style={{ fontSize: 15 }}>{brandLogo || '🍽'}</span>
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-logo">{renderLogo()} {brandName}</div>
      </div>
      <nav className="sidebar-nav">
        <button
          className={`sidebar-item ${location.pathname === '/' || isWorkspace ? 'active' : ''}`}
          onClick={() => navigate('/')}>
          <span className="ico">📋</span> 项目列表
        </button>
        <button
          className={`sidebar-item ${location.pathname === '/proj-settings' ? 'active' : ''}`}
          onClick={() => navigate('/proj-settings')}>
          <span className="ico">🔧</span> 项目配置
        </button>
        <button
          className={`sidebar-item ${location.pathname === '/templates' ? 'active' : ''}`}
          onClick={() => navigate('/templates')}>
          <span className="ico">📄</span> 模板管理
        </button>
        <button
          className={`sidebar-item ${location.pathname === '/settings' ? 'active' : ''}`}
          onClick={() => navigate('/settings')}>
          <span className="ico">⚙</span> 全局设置
        </button>
      </nav>
      <div className="sidebar-foot" style={{ padding: '8px 16px 8px 10px', marginBottom: 50, lineHeight: 2.2 }}>
        {isWorkspace && (
          <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
            当前项目：<strong>{projName || '—'}</strong>
          </div>
        )}
        <div style={{
          display: 'block', width: '100%', padding: 0,
          fontSize: 10,
          color: 'var(--text-secondary)',
          textAlign: 'left',
        }}>
          <span style={{
            display: 'inline-block', width: 6, height: 6,
            borderRadius: '50%', background: 'transparent', border: '1.5px solid var(--primary)',
            verticalAlign: 'middle', marginRight: 5,
          }} />
          {brandName} {sidebarVersion}
        </div>
        <div style={{ fontSize: 10, display: 'flex', gap: 8 }}>
          <a href="/api/download/desktop" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>「下载桌面版」</a>
          <a href="/api/download/server" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>「下载服务器版」</a>
        </div>
        <LogoutButton />
      </div>
    </aside>
  )
}

function LogoutButton() {
  const { logout, passwordRequired } = useAuth()
  const navigate = useNavigate()

  if (!passwordRequired) return null

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        display: 'block', width: '100%', padding: 0,
        marginTop: 4,
        fontSize: 10, color: 'var(--text-secondary)',
        background: 'transparent', border: 'none', cursor: 'pointer',
        textAlign: 'left', borderRadius: 0,
      }}
      title="退出登录"
    >
      <span className="ico">🚪</span> 退出登录
    </button>
  )
}

function PhoneReminder() {
  const [show, setShow] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        const s = data.settings || {}
        if (!s.admin_phone) setShow(true)
      })
      .catch(() => {})
  }, [])

  if (!show) return null

  return (
    <div className="dialog-overlay">
      <div className="dialog-box" style={{ width: 400 }}>
        <div className="dialog-title">完善安全设置</div>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', marginBottom: 12 }}>
          您尚未设置<strong>管理员手机号</strong>，忘记密码时将无法通过手机验证找回。
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          请前往「全局设置」→「安全设置」填写手机号。
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShow(false)}>稍后提醒</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setShow(false); navigate('/settings') }}>去设置</button>
        </div>
      </div>
    </div>
  )
}

function AppShell() {
  const location = useLocation()
  const isWorkspace = location.pathname.startsWith('/project/')

  return (
    <>
      <PhoneReminder />
    <div className="app-layout">
      <Sidebar />
      <div className="main-area">
        <div className={isWorkspace ? 'workspace-content' : 'main-content'}>
          <Routes>
            <Route path="/project/:id" element={<ProjectPage />} />
            <Route path="/templates" element={<TemplateManager />} />
            <Route path="/proj-settings" element={<ProjSettingsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/" element={<HomePage />} />
          </Routes>
        </div>
      </div>
    </div>
    </>
  )
}

function App() {
  useEffect(() => {
    api.getSettings().then(data => {
      const s = data.settings || {}
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
          const preset = presets.find((p: any) => p.id === themeId)
          if (preset) applyThemeToDOM(preset.colors, themeId)
        } catch {}
      }
    }).catch(() => {})
  }, [])

  return (
    <AuthProvider>
      <ModalProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          } />
        </Routes>
      </ModalProvider>
    </AuthProvider>
  )
}

export default App
