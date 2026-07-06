import { useAuth } from '../contexts/AuthContext'
import type { ReactNode } from 'react'

export default function SettingsLock({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
        加载中...
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
        请先登录后访问此页面。
      </div>
    )
  }

  return <>{children}</>
}
