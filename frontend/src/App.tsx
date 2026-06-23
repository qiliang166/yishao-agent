import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import HomePage from './pages/HomePage'
import ProjectPage from './pages/ProjectPage'
import SettingsPage from './pages/SettingsPage'
import ProjSettingsPage from './pages/ProjSettingsPage'
import TemplateManager from './pages/TemplateManager'
import { ModalProvider } from './components/ModalProvider'
import { api } from './services/api'
import { applyThemeToDOM, resetThemeToDefault } from './services/theme'
import './App.css'

function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [brandLogo, setBrandLogo] = useState('🍽')
  const [brandName, setBrandName] = useState('一勺笔录(SOP)智能体')
  const [projName, setProjName] = useState('')
  const isWorkspace = location.pathname.startsWith('/project/')

  useEffect(() => {
    api.getSettings().then(data => {
      const s = data.settings || {}
      if (s.brand_logo) setBrandLogo(s.brand_logo)
      if (s.brand_name) setBrandName(s.brand_name)
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
      <div className="sidebar-foot">
        {isWorkspace && (
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', padding: '4px 10px' }}>
            当前项目：<strong>{projName || '—'}</strong>
          </div>
        )}
        <div style={{ fontSize: 9, color: 'var(--text-secondary)', padding: '2px 10px 6px' }}>{brandName} v1.0.0</div>
      </div>
    </aside>
  )
}

function App() {
  const location = useLocation()
  const isWorkspace = location.pathname.startsWith('/project/')

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
    <ModalProvider>
      {isWorkspace ? (
        <div className="app-layout">
          <Sidebar />
          <div className="main-area">
            <Routes>
              <Route path="/project/:id" element={<ProjectPage />} />
            </Routes>
          </div>
        </div>
      ) : (
        <div className="app-layout">
          <Sidebar />
          <div className="main-area">
            <div className="main-content">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/proj-settings" element={<ProjSettingsPage />} />
                <Route path="/templates" element={<TemplateManager />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </div>
          </div>
        </div>
      )}
    </ModalProvider>
  )
}

export default App
