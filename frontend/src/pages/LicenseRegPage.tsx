import { useState, useEffect, useRef } from 'react'
import { api } from '../services/api'

interface LicenseRegPageProps {
  onActivated: () => void
  embedded?: boolean
  onClose?: () => void
}

const isImagePath = (v: string) =>
  v.startsWith('/api/logos/') || v.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)($|\?)/i)

function formatKey(raw: string): string {
  const upper = raw.toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (upper.length < 4) return upper
  const groups: string[] = [upper.slice(0, 4)]
  for (let i = 4; i < upper.length; i += 5) {
    groups.push(upper.slice(i, i + 5))
  }
  return groups.join('-')
}

export default function LicenseRegPage({ onActivated, embedded, onClose }: LicenseRegPageProps) {
  const [brandName, setBrandName] = useState('')
  const [brandLogo, setBrandLogo] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/version').then(r => r.json()),
    ]).then(([data, ver]) => {
      const s = data.settings || {}
      const fallback = (ver as any).app || ''
      if (s.brand_name) setBrandName(s.brand_name)
      else if (fallback) setBrandName(fallback)
      if (s.brand_logo) setBrandLogo(s.brand_logo)
    }).catch(() => {})

    api.getLicenseStatus()
      .then((d: any) => {
        if (d.activated) onActivated()
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [onActivated])

  useEffect(() => {
    if (!checking && inputRef.current) {
      inputRef.current.focus()
    }
  }, [checking])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('')
    setKeyInput(e.target.value.toUpperCase())
  }

  const handleSubmit = async () => {
    const clean = keyInput.replace(/[^0-9A-Z]/g, '')
    if (clean.length < 54) {
      setError('许可证密钥格式不正确，请检查后重试')
      return
    }
    setLoading(true)
    setError('')
    try {
      const formatted = formatKey(clean)
      await api.activateLicense(formatted)
      onActivated()
    } catch (e: any) {
      setError(e.message || '激活失败')
    } finally {
      setLoading(false)
    }
  }

  const name = brandName
  const logo = brandLogo

  if (checking) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: 'var(--text-secondary)', fontSize: 14,
      }}>
        检查许可证状态...
      </div>
    )
  }

  const displayKey = formatKey(keyInput)

  const formContent = (
    <div style={{
      background: '#ffffff', padding: '40px 36px',
      borderRadius: 12, width: 440,
      boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        {isImagePath(logo) ? (
          <img src={logo} alt="Logo" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 40 }}>{logo}</span>
        )}
      </div>
      <h1 style={{
        fontSize: 22, fontWeight: 700, textAlign: 'center',
        margin: '0 0 8px 0', color: 'var(--text)',
      }}>
        {name}
      </h1>
      <p style={{
        fontSize: 12, textAlign: 'center', margin: '0 0 28px 0',
        color: 'var(--text-secondary)',
      }}>
        请输入许可证密钥以激活软件
      </p>

      <div style={{
        background: '#f0f6ff', border: '1px solid #93c5fd',
        borderRadius: 6, padding: '8px 12px', marginBottom: 20,
        fontSize: 13, lineHeight: 1.6, color: '#1e40af',
      }}>
        密钥示例格式：
        <code style={{
          display: 'block', fontSize: 11, marginTop: 6,
          background: 'rgba(0,0,0,0.05)', padding: '6px 8px',
          borderRadius: 4, wordBreak: 'break-all', userSelect: 'none',
        }}>
          YSAG-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
        </code>
      </div>

      <input
        ref={inputRef}
        className="form-input"
        type="text"
        placeholder="YSAG-XXXXX-XXXXX-..."
        value={displayKey}
        onChange={handleInput}
        onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
        maxLength={70}
        style={{
          width: '100%', boxSizing: 'border-box',
          fontFamily: 'monospace', fontSize: 13,
          letterSpacing: 1,
        }}
      />

      {error && (
        <div style={{
          fontSize: 12, color: 'var(--warning)',
          marginTop: 10, textAlign: 'center',
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        {embedded && onClose && (
          <button
            className="btn btn-ghost"
            onClick={onClose}
            style={{ flex: 1 }}
          >
            稍后激活
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={loading}
          style={{ flex: 1 }}
        >
          {loading ? '激活中...' : '激活'}
        </button>
      </div>

      <p style={{
        fontSize: 12, color: 'var(--text-secondary)',
        marginTop: 16, textAlign: 'center', lineHeight: 1.6,
      }}>
        如未获得许可证，请联系供应商获取
      </p>
    </div>
  )

  if (embedded) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()}>
          {formContent}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--primary)',
    }}>
      {formContent}
    </div>
  )
}
