import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import DemoBanner from './DemoBanner'

interface Props {
  children: ReactNode
  requiredType?: 'admin' | 'member'
}

export default function ProtectedRoute({ children, requiredType }: Props) {
  const { user, loading, authRequired, tokenVersionMismatch } = useAuth()

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

  // Demo mode — no auth required
  if (!authRequired) {
    return (
      <>
        <DemoBanner />
        {children}
      </>
    )
  }

  if (tokenVersionMismatch) {
    const loginPath = requiredType === 'member' ? '/member' : '/login'
    return <Navigate to={loginPath} replace state={{ reason: '权限已变更，请重新登录' }} />
  }

  if (!user) {
    const loginPath = requiredType === 'member' ? '/member' : '/login'
    return <Navigate to={loginPath} replace />
  }

  if (requiredType && user.user_type !== requiredType) {
    // Allow members with 开发体验员 role to access admin interface
    if (requiredType === 'admin' && user.roles?.includes('开发体验员')) {
      return <><DemoBanner />{children}</>
    }
    const fallback = user.user_type === 'member' ? '/app' : '/'
    return <Navigate to={fallback} replace />
  }

  // Allow 开发体验员 to access member interface (for member center, points, etc.)
  if (requiredType === 'member' && user.roles?.includes('开发体验员')) {
    return <><DemoBanner />{children}</>
  }

  return (
    <>
      <DemoBanner />
      {children}
    </>
  )
}
