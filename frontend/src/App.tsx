import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import HomePage from './pages/HomePage'
import ProjectDashboard from './pages/ProjectDashboard'
import ProjectPage from './pages/ProjectPage'
import SettingsPage from './pages/SettingsPage'
import ProjSettingsPage from './pages/ProjSettingsPage'
import ProjItemSettingsPage from './pages/ProjItemSettingsPage'
import TemplateManager from './pages/TemplateManager'
import ManualPage from './pages/ManualPage'
import LoginPage from './pages/LoginPage'
import MemberLoginPage from './pages/MemberLoginPage'
import MemberRegisterPage from './pages/MemberRegisterPage'
import MemberRenewPage from './pages/MemberRenewPage'
import MemberCenterPage from './pages/MemberCenterPage'
import WorkspaceSettingsPage from './pages/WorkspaceSettingsPage'
import PromptStudioPage from './pages/PromptStudioPage'
import MemberApprovalPage from './pages/MemberApprovalPage'
import UserManagePage from './pages/UserManagePage'
import RoleManagePage from './pages/RoleManagePage'
import LandingPage from './pages/LandingPage'
import FirstTimeSetupPage from './pages/FirstTimeSetupPage'
import { ModalProvider } from './components/ModalProvider'
import ProtectedRoute from './components/ProtectedRoute'
import SettingsLock from './components/SettingsLock'
import SetupWizard from './components/SetupWizard'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LicenseProvider } from './contexts/LicenseContext'
import { usePermission } from './hooks/usePermission'
import { api, Workspace } from './services/api'
import { applyThemeToDOM, resetThemeToDefault } from './services/theme'
import './App.css'

function Sidebar({ onOpenWizard }: { onOpenWizard?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [brandLogo, setBrandLogo] = useState('⚡')
  const [brandName, setBrandName] = useState('')
  const [brandSlogan, setBrandSlogan] = useState('')
  const [sidebarVersion, setSidebarVersion] = useState('1.0.0')
  const [projName, setProjName] = useState('')
  const [sidebarWid, setSidebarWid] = useState('')
  const isWorkspace = location.pathname.startsWith('/project/') || location.pathname.startsWith('/workspace/')
  const currentWid = (() => {
    const parts = location.pathname.split('/')
    const wsIdx = parts.indexOf('workspace')
    if (wsIdx >= 0 && parts[wsIdx + 1]) return parts[wsIdx + 1]
    return ''
  })()
  const effectiveWid = currentWid || sidebarWid

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
      if (s.branding_slogan) setBrandSlogan(s.branding_slogan)
      if ((ver as any).version) setSidebarVersion((ver as any).version)
      if (s.app_version) setSidebarVersion(s.app_version)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const parts = location.pathname.split('/')
    const wsIdx = parts.indexOf('workspace')
    const projIdx = parts.indexOf('project')
    if (wsIdx >= 0 && parts[wsIdx + 1]) {
      api.getWorkspace(parts[wsIdx + 1]).then((ws: any) => {
        setProjName(ws.name || '')
        setSidebarWid(parts[wsIdx + 1])
      }).catch(() => { setProjName(''); setSidebarWid('') })
    } else if (projIdx >= 0 && parts[projIdx + 1]) {
      api.getProject(parts[projIdx + 1]).then((p: any) => {
        setProjName(p.name || '')
        setSidebarWid(p.workspace_id || '')
      }).catch(() => { setProjName(''); setSidebarWid('') })
    } else {
      setProjName('')
      setSidebarWid('')
    }
  }, [location.pathname])

  const isImagePath = (v: string) => v.startsWith('/api/logos/') || v.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)($|\?)/i)

  const renderLogo = () => {
    if (isImagePath(brandLogo)) {
      return <img src={brandLogo} alt="Logo" className="sidebar-head-icon-img" />
    }
    return <span className="sidebar-head-icon-emoji">{brandLogo || '🍽'}</span>
  }

  const canTemplate = usePermission('template.manage')
  const canPrompt = usePermission('prompt.manage')
  const canMember = usePermission('member.manage')
  const canRole = usePermission('role.manage')

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-head-icon">{renderLogo()}</div>
        <div className="sidebar-head-texts">
          <div className="sidebar-logo">{brandName}</div>
          {brandSlogan && <div className="sidebar-sub">{brandSlogan}</div>}
        </div>
      </div>
      <nav className="sidebar-nav">
        <button
          className={`sidebar-item ${location.pathname === '/' || isWorkspace ? 'active' : ''}`}
          onClick={() => navigate('/')}>
          <span className="ico">📋</span> 项目管理
        </button>
        {effectiveWid ? (
          <button
            className={`sidebar-item ${location.pathname.startsWith('/workspace/' + effectiveWid + '/settings') ? 'active' : ''}`}
            onClick={() => navigate(`/workspace/${effectiveWid}/settings`)}>
            <span className="ico">🔧</span> 项目配置
          </button>
        ) : (
          <button
            className={`sidebar-item ${location.pathname === '/proj-settings' ? 'active' : ''}`}
            onClick={() => navigate('/proj-settings')}>
            <span className="ico">🔧</span> 全局配置
          </button>
        )}
        {canTemplate && (
          <button
            className={`sidebar-item ${location.pathname === '/templates' ? 'active' : ''}`}
            onClick={() => navigate('/templates')}>
            <span className="ico">📄</span> 模板管理
          </button>
        )}
        {canPrompt && (
          <button
            className={`sidebar-item ${location.pathname === '/prompt-studio' ? 'active' : ''}`}
            onClick={() => navigate('/prompt-studio')}>
            <span className="ico">🎨</span> 提示词工作室
          </button>
        )}
        <button
          className={`sidebar-item ${location.pathname === '/manual' ? 'active' : ''}`}
          onClick={() => navigate('/manual')}>
          <span className="ico">📖</span> 操作说明
        </button>
        <button
          className={`sidebar-item ${location.pathname === '/settings' ? 'active' : ''}`}
          onClick={() => navigate('/settings')}>
          <span className="ico">⚙</span> 全局设置
        </button>
        {(canMember || canRole) && (
          <>
            <div style={{ borderTop: '1px solid var(--border)', margin: '4px 12px' }} />
            {canRole && (
              <button
                className={`sidebar-item ${location.pathname === '/roles' ? 'active' : ''}`}
                onClick={() => navigate('/roles')}>
                <span className="ico">🛡</span> 角色管理
              </button>
            )}
            {canMember && (
              <button
                className={`sidebar-item ${location.pathname === '/members/pending' ? 'active' : ''}`}
                onClick={() => navigate('/members/pending')}>
                <span className="ico">✅</span> 会员审批
              </button>
            )}
            {(canMember || canRole) && (
              <button
                className={`sidebar-item ${location.pathname === '/members' ? 'active' : ''}`}
                onClick={() => navigate('/members')}>
                <span className="ico">👥</span> 用户管理
              </button>
            )}
          </>
        )}
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
        {onOpenWizard && (
          <button onClick={onOpenWizard} style={{
            display: 'block', width: '100%', padding: '6px 0', marginTop: 8,
            fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none', borderRadius: 6, textAlign: 'center',
          }}>
            🚀 快速上手
          </button>
        )}
        <div style={{ fontSize: 10, display: 'flex', gap: 8, marginTop: 8 }}>
          <a href="/api/download/desktop" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>「下载桌面版」</a>
          <a href="/api/download/server" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>「下载服务器版」</a>
        </div>
        {user && (
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
              👤 {user.display_name || user.username}
            </div>
          )}
          <LogoutButton />
      </div>
    </aside>
  )
}

function LogoutButton() {
  const { logout, user } = useAuth()
  const navigate = useNavigate()

  if (!user) return null

  const handleLogout = () => {
    logout()
    sessionStorage.removeItem('settings_token')
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

function MemberLogoutButton() {
  const { logout, user } = useAuth()
  const navigate = useNavigate()

  if (!user) return null

  const handleLogout = () => {
    logout()
    sessionStorage.removeItem('settings_token')
    navigate('/member', { replace: true })
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

// ── Member sidebar (simplified, same layout) ──

function MemberSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [brandLogo, setBrandLogo] = useState('⚡')
  const [brandName, setBrandName] = useState('')
  const [brandSlogan, setBrandSlogan] = useState('')
  const [sidebarVersion, setSidebarVersion] = useState('1.0.0')
  const [projName, setProjName] = useState('')
  const isWorkspace = location.pathname.startsWith('/app/workspace/') || location.pathname.startsWith('/app/project/')

  useEffect(() => {
    Promise.all([api.getSettings(), api.getVersion()]).then(([data, ver]) => {
      const s = data.settings || {}
      const fallback = (ver as any).app || ''
      if (s.brand_logo) setBrandLogo(s.brand_logo)
      if (s.brand_name) { setBrandName(s.brand_name); document.title = s.brand_name }
      else if (fallback) { document.title = fallback }
      if (s.branding_slogan) setBrandSlogan(s.branding_slogan)
      if ((ver as any).version) setSidebarVersion((ver as any).version)
      if (s.app_version) setSidebarVersion(s.app_version)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const parts = location.pathname.split('/')
    const wsIdx = parts.indexOf('workspace')
    const projIdx = parts.indexOf('project')
    if (wsIdx >= 0 && parts[wsIdx + 1]) {
      api.getWorkspace(parts[wsIdx + 1]).then((ws: any) => {
        setProjName(ws.name || '')
      }).catch(() => setProjName(''))
    } else if (projIdx >= 0 && parts[projIdx + 1]) {
      api.getProject(parts[projIdx + 1]).then((p: any) => {
        setProjName(p.name || '')
      }).catch(() => setProjName(''))
    } else {
      setProjName('')
    }
  }, [location.pathname])

  const isImagePath = (v: string) => v.startsWith('/api/logos/') || v.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)($|\?)/i)

  const renderLogo = () => {
    if (isImagePath(brandLogo)) {
      return <img src={brandLogo} alt="Logo" className="sidebar-head-icon-img" />
    }
    return <span className="sidebar-head-icon-emoji">{brandLogo || '🍽'}</span>
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-head-icon">{renderLogo()}</div>
        <div className="sidebar-head-texts">
          <div className="sidebar-logo">{brandName}</div>
          {brandSlogan && <div className="sidebar-sub">{brandSlogan}</div>}
        </div>
      </div>
      <nav className="sidebar-nav">
        <button
          className={`sidebar-item ${location.pathname === '/app' || isWorkspace ? 'active' : ''}`}
          onClick={() => navigate('/app')}>
          <span className="ico">📋</span> 项目管理
        </button>
        <button
          className={`sidebar-item ${location.pathname === '/app/center' ? 'active' : ''}`}
          onClick={() => navigate('/app/center')}>
          <span className="ico">👤</span> 会员中心
        </button>
        <button
          className={`sidebar-item ${location.pathname === '/app/manual' ? 'active' : ''}`}
          onClick={() => navigate('/app/manual')}>
          <span className="ico">📖</span> 操作说明
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
        <div style={{ fontSize: 10, display: 'flex', gap: 8, marginTop: 8 }}>
          <a href="/api/download/desktop" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>「下载桌面版」</a>
          <a href="/api/download/server" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>「下载服务器版」</a>
        </div>
        {user && (
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
              👤 {user.display_name || user.username}
            </div>
          )}
          <MemberLogoutButton />
      </div>
    </aside>
  )
}

// ── Member workspace list (home page for members) ──

function MemberHomePage() {
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    fetch('/api/workspaces', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => setWorkspaces(data.workspaces || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { draft: '草稿', completed: '已完成' }
    return map[s] || s
  }

  return (
    <div>
      <div className="proj-list-header">
        <span style={{ fontSize: 14, fontWeight: 600 }}>我的项目</span>
      </div>
      {loading ? (
        <p style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>加载中...</p>
      ) : workspaces.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
          <div style={{ fontSize: 14 }}>暂无可用项目，请联系管理员分配</div>
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: 12,
          padding: 20,
          margin: '16px 20px',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 20,
          }}>
            {workspaces.map(w => (
              <div key={w.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 24,
                  cursor: 'pointer',
                  background: 'var(--bg)',
                  transition: 'box-shadow 0.15s, transform 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'
                  ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = ''
                  ;(e.currentTarget as HTMLElement).style.transform = ''
                }}
                onClick={() => navigate(`/app/workspace/${w.id}`)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  {w.logo ? (
                    <img src={w.logo} style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} alt="" />
                  ) : (
                    <span style={{ fontSize: 28 }}>📁</span>
                  )}
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 10,
                    background: w.status === 'completed' ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.12)',
                    color: w.status === 'completed' ? 'var(--success)' : 'var(--text-secondary)'
                  }}>
                    {statusLabel(w.status)}
                  </span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, wordBreak: 'break-word' }}>
                  {w.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Member App Shell (sidebar + content area) ──

function MemberAppShell() {
  const { user, loading: authLoading, authRequired } = useAuth()
  const location = useLocation()
  const isWorkspace = location.pathname.startsWith('/app/workspace/') || location.pathname.startsWith('/app/project/')

  if (authLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: 'var(--text-secondary)', fontSize: 14,
      }}>
        加载中...
      </div>
    )
  }

  if (authRequired && !user) {
    return <Navigate to="/member" replace />
  }

  return (
    <div className="app-layout">
      <MemberSidebar />
      <div className="main-area">
        <div className={isWorkspace ? 'workspace-content' : 'main-content'}>
          <Routes>
            <Route path="/workspace/:wid" element={<ProjectDashboard />} />
            <Route path="/project/:id" element={<ProjectPage />} />
            <Route path="/manual" element={<ManualPage />} />
            <Route path="/center" element={<MemberCenterPage />} />
            <Route path="/" element={<MemberHomePage />} />
          </Routes>
        </div>
      </div>
    </div>
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
  const { user, loading: authLoading, authRequired } = useAuth()
  const isWorkspace = location.pathname.startsWith('/project/') || location.pathname.startsWith('/workspace/')
  const [showWizard, setShowWizard] = useState(false)

  if (authLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: 'var(--text-secondary)', fontSize: 14,
      }}>
        加载中...
      </div>
    )
  }

  if (authRequired && !user) {
    return <Navigate to="/login" replace />
  }

  return (
    <>
      <PhoneReminder />
      {showWizard && <SetupWizard onDone={() => setShowWizard(false)} />}
    <div className="app-layout">
      <Sidebar onOpenWizard={() => setShowWizard(true)} />
      <div className="main-area">
        <div className={isWorkspace ? 'workspace-content' : 'main-content'}>
          <Routes>
            <Route path="/workspace/:wid/settings" element={<SettingsLock><WorkspaceSettingsPage /></SettingsLock>} />
            <Route path="/workspace/:wid" element={<ProjectDashboard />} />
            <Route path="/project/:id/workspace" element={<ProjectPage />} />
            <Route path="/project/:id/settings" element={<SettingsLock><ProjItemSettingsPage /></SettingsLock>} />
            <Route path="/manual" element={<ManualPage />} />
            <Route path="/templates" element={<TemplateManager />} />
            <Route path="/proj-settings" element={<SettingsLock><ProjSettingsPage /></SettingsLock>} />
            <Route path="/prompt-studio" element={<PromptStudioPage />} />
            <Route path="/members/pending" element={<MemberApprovalPage />} />
            <Route path="/members" element={<UserManagePage />} />
            <Route path="/roles" element={<RoleManagePage />} />
            <Route path="/settings" element={<SettingsLock><SettingsPage /></SettingsLock>} />
            <Route path="/" element={<HomePage />} />
            <Route path="/home" element={<HomePage />} />
          </Routes>
        </div>
      </div>
    </div>
    </>
  )
}

function RootRoute() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: 'var(--text-secondary)', fontSize: 14,
      }}>
        加载中...
      </div>
    )
  }
  if (user) {
    const isExperienceOfficer = user.roles?.includes('开发体验员')
    if (user.user_type === 'member' && !isExperienceOfficer) return <Navigate to="/app" replace />
    return <Navigate to="/home" replace />
  }
  return <LandingPage />
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
      <LicenseProvider>
        <ModalProvider>
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/setup" element={<FirstTimeSetupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/member" element={<MemberLoginPage />} />
            <Route path="/member/register" element={<MemberRegisterPage />} />
            <Route path="/member/renew" element={<MemberRenewPage />} />
            <Route path="/app/*" element={
              <ProtectedRoute requiredType="member">
                <MemberAppShell />
              </ProtectedRoute>
            } />
            <Route path="*" element={
              <ProtectedRoute requiredType="admin">
                <AppShell />
              </ProtectedRoute>
            } />
          </Routes>
        </ModalProvider>
      </LicenseProvider>
    </AuthProvider>
  )
}

export default App
