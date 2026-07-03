import { useState, useEffect } from 'react'
import LicenseRegPage from '../pages/LicenseRegPage'
import type { ReactNode } from 'react'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
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

  if (licenseActivated === null) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: 'var(--text-secondary)', fontSize: 14,
      }}>
        加载中...
      </div>
    )
  }

  if (!licenseActivated) {
    return <LicenseRegPage onActivated={handleActivated} />
  }

  return <>{children}</>
}
