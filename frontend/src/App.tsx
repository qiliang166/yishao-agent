import { Routes, Route, Link, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage'
import SettingsPage from './pages/SettingsPage'
import './App.css'

const navItems = [
  { path: '/', label: '项目列表', icon: '📋' },
  { path: '/prompts', label: '提示词管理', icon: '📝' },
  { path: '/templates', label: '模板管理', icon: '🎨' },
  { path: '/settings', label: '设置', icon: '⚙️' },
]

function App() {
  const location = useLocation()

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-logo">一勺笔录</h1>
          <span className="sidebar-version">v1.0.0</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/project/:id" element={<div>Project Page</div>} />
          <Route path="/prompts" element={<div>Prompt Manager</div>} />
          <Route path="/templates" element={<div>Template Manager</div>} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
