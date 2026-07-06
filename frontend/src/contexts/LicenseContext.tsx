import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import LicenseRegPage from '../pages/LicenseRegPage'
import { setOnLicenseRequired } from '../services/api'

interface LicenseCtx {
  activated: boolean
  showActivateDialog: () => void
}

const LicenseCtx = createContext<LicenseCtx>({ activated: false, showActivateDialog: () => {} })

export function LicenseProvider({ children }: { children: ReactNode }) {
  const [activated, setActivated] = useState<boolean | null>(null)
  const [showDialog, setShowDialog] = useState(false)

  useEffect(() => {
    fetch('/api/license/status')
      .then(r => r.json())
      .then(d => setActivated(d.activated === true))
      .catch(() => setActivated(false))
  }, [])

  const handleActivated = useCallback(() => {
    setActivated(true)
    setShowDialog(false)
  }, [])

  const showActivateDialog = useCallback(() => {
    setShowDialog(true)
  }, [])

  useEffect(() => {
    setOnLicenseRequired(showActivateDialog)
    return () => setOnLicenseRequired(null)
  }, [showActivateDialog])

  if (activated === null) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: 'var(--text-secondary)', fontSize: 14,
      }}>
        加载中...
      </div>
    )
  }

  return (
    <LicenseCtx.Provider value={{ activated, showActivateDialog }}>
      {children}
      {showDialog && (
        <LicenseRegPage embedded onActivated={handleActivated} onClose={() => setShowDialog(false)} />
      )}
    </LicenseCtx.Provider>
  )
}

export function useLicense() {
  return useContext(LicenseCtx)
}
