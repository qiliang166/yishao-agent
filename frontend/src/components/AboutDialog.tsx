import { useState, useEffect } from 'react'
import SvgIcon from './SvgIcon'

const isImagePath = (v: string) =>
  v.startsWith('/api/logos/') || !!v.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)($|\?)/i)

export default function AboutDialog({ onClose }: { onClose: () => void }) {
  const [brandName, setBrandName] = useState('')
  const [brandLogo, setBrandLogo] = useState('')
  const [brandSlogan, setBrandSlogan] = useState('')
  const [aboutContent, setAboutContent] = useState('')
  const [version, setVersion] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then(r => r.json()).catch(() => ({})),
      fetch('/api/version').then(r => r.json()).catch(() => ({})),
    ]).then(([data, ver]) => {
      const s = (data as any)?.settings || {}
      if (s.brand_name) setBrandName(s.brand_name)
      if (s.brand_logo) setBrandLogo(s.brand_logo)
      if (s.branding_slogan) setBrandSlogan(s.branding_slogan)
      if (s.about_content) setAboutContent(s.about_content)
      if (s.contact_info) setContactInfo(s.contact_info)
      setVersion(s.app_version || (ver as any)?.version || '')
    }).finally(() => setLoading(false))
  }, [])

  const logo = brandLogo || ''

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-primary, #fff)', borderRadius: 12, padding: 28, width: 520,
        minHeight: 460, maxHeight: '85vh', overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }} onClick={e => e.stopPropagation()}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)', fontSize: 12 }}>加载中...</div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              {isImagePath(logo) ? (
                <img src={logo} alt="Logo" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
              ) : logo ? (
                <span style={{ fontSize: 40 }}>{logo}</span>
              ) : (
                <SvgIcon name="bolt" size={40} />
              )}
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px 0', textAlign: 'center' }}>
              {brandName || '关于软件'}
            </h2>
            {brandSlogan && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 4 }}>
                {brandSlogan}
              </div>
            )}
            {version && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 16 }}>
                版本 {version}
              </div>
            )}
            <div style={{
              fontSize: 11, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: 'var(--text, #333)',
              background: 'var(--bg-secondary, #f5f5f5)', padding: '12px 14px', borderRadius: 6,
              marginBottom: 14, flex: 1,
            }}>
              {aboutContent || '暂无介绍'}
            </div>
            {contactInfo && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14, textAlign: 'center' }}>
                联系我们：{contactInfo}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="btn btn-primary btn-sm" onClick={onClose}>关闭</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
