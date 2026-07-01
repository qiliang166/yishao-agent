import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LicenseRegPage from '../pages/LicenseRegPage'
import type { ReactNode } from 'react'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [licenseActivated, setLicenseActivated] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/license/status')
      .then(r => r.json())
      .then(d => setLicenseActivated(d.activated === true))
      .catch(() => setLicenseActivated(false))
  }, [])

  const handleActivated = () => {
    setLicenseActivated(true)
  }

  // Both checks loading
  if (authLoading || licenseActivated === null) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: 'var(--text-secondary)', fontSize: 14,
      }}>
        加载中...
      </div>
    )
  }

  // First: license check
  if (!licenseActivated) {
    return <LicenseRegPage onActivated={handleActivated} />
  }

  // Second: auth check
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
