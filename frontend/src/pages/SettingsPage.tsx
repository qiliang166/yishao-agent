import { useState, useEffect, useRef } from 'react'
import { api } from '../services/api'
import { sha256 } from '../services/sha256'
import { useModal } from '../components/ModalProvider'
import { DEFAULT_THEMES, applyThemeToDOM, resetThemeToDefault } from '../services/theme'
import type { ThemePreset } from '../services/theme'

type SettingsTab = 'general' | 'appearance'

const COLOR_LABELS = [
  { key: 'primary', label: '主色调' },
  { key: 'bg', label: '背景色' },
  { key: 'card', label: '卡片色' },
  { key: 'text', label: '文字色' },
  { key: 'textSecondary', label: '次要文字' },
  { key: 'border', label: '边框色' },
  { key: 'primaryLight', label: '浅色背景' },
  { key: 'success', label: '成功色' },
  { key: 'warning', label: '警告色' },
  { key: 'primaryHover', label: '悬停色' },
  { key: 'btnDirtyBg', label: '保存按钮' },
]

function SettingsPage() {
  const modal = useModal()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  // -- 通用设置 state --
  const [brandLogo, setBrandLogo] = useState('⚡')
  const [brandName, setBrandName] = useState('')
  const [savePath, setSavePath] = useState('D:\\YISHAOAGENT\\data\\output')
  const [brandingCopyright, setBrandingCopyright] = useState('')
  const [brandingSignature, setBrandingSignature] = useState('')
  const [saveMsg, setSaveMsg] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [versionInfo, setVersionInfo] = useState<null | { current: string; latest: string; has_update: boolean; release_url?: string; error?: string }>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const [passwordEnabled, setPasswordEnabled] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [initialPassword, setInitialPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')

  // -- 主题设置 state --
  const [currentThemeId, setCurrentThemeId] = useState('classic')
  const [themePresets, setThemePresets] = useState<ThemePreset[]>(DEFAULT_THEMES)
  const [editThemeId, setEditThemeId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColors, setEditColors] = useState<Record<string, string>>({})

  useEffect(() => {
    api.getSettings().then(data => {
      const s = data.settings || {}
      if (s.brand_logo) setBrandLogo(s.brand_logo)
      if (s.brand_name) setBrandName(s.brand_name)
      if (s.save_path) setSavePath(s.save_path)
      if (s.branding_copyright) setBrandingCopyright(s.branding_copyright)
      if (s.branding_signature) setBrandingSignature(s.branding_signature)
      if (s.admin_password_enabled === '1') setPasswordEnabled(true)

      // 加载主题数据
      const themeId = s.theme || 'classic'
      setCurrentThemeId(themeId)

      if (s.theme_presets) {
        try {
          const custom = JSON.parse(s.theme_presets)
          setThemePresets(DEFAULT_THEMES.map(p => {
            if (p.isDefault) return p
            const override = custom.find((c: any) => c.id === p.id)
            return override ? { ...p, name: override.name, colors: { ...p.colors, ...override.colors } } : p
          }))
        } catch {}
      }
    }).catch(() => {})
  }, [])

  // -- 通用设置 handlers --
  const isImagePath = (v: string) => v.startsWith('/api/logos/') || v.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)($|\?)/i)

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    try {
      const result = await api.uploadLogo(file)
      setBrandLogo(result.url)
    } catch (err: any) {
      setSaveMsg('上传失败: ' + err.message)
    } finally {
      setLogoUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const SALT = 'yishao-agent-salt-2026'
  const INITIAL_PASSWORD = '11110000'

  const handlePasswordSave = async () => {
    setPasswordMsg('')
    if (initialPassword !== INITIAL_PASSWORD) { setPasswordMsg('初始密码错误，无法修改密码'); return }
    if (!newPassword.trim()) { setPasswordMsg('密码不能为空'); return }
    if (newPassword !== confirmPassword) { setPasswordMsg('两次输入的密码不一致'); return }
    if (newPassword.length < 4) { setPasswordMsg('密码至少需要4个字符'); return }
    try {
      const hash = sha256(SALT + newPassword)
      await api.updateSettings({ admin_password: hash, admin_password_enabled: '1' })
      setPasswordEnabled(true)
      setNewPassword(''); setConfirmPassword(''); setInitialPassword('')
      setPasswordMsg('密码保护已启用')
    } catch (err: any) { setPasswordMsg('保存失败: ' + err.message) }
  }

  const handlePasswordDisable = async () => {
    const ok = await modal.confirm('确定要关闭密码保护吗？关闭后，项目配置中的敏感栏目将无需密码即可访问。')
    if (!ok) return
    try {
      await api.updateSettings({ admin_password_enabled: '0' })
      setPasswordEnabled(false)
      setNewPassword(''); setConfirmPassword(''); setInitialPassword('')
      setPasswordMsg('密码保护已关闭')
    } catch (err: any) { setPasswordMsg('操作失败: ' + err.message) }
  }

  const handleGlobalSave = async () => {
    setSaveMsg('')
    try {
      await api.updateSettings({ brand_logo: brandLogo, brand_name: brandName, save_path: savePath, branding_copyright: brandingCopyright, branding_signature: brandingSignature })
      document.title = brandName || '文档智能体'
      setSaveMsg('保存成功')
    } catch (err: any) {
      setSaveMsg('保存失败: ' + err.message)
    }
  }

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    try {
      const data = await api.checkUpdate()
      setVersionInfo(data)
    } catch {
      setVersionInfo({ current: '1.0.0', latest: '1.0.0', has_update: false, error: '检查更新失败，请检查网络连接' })
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleDownloadUpdate = async () => {
    setDownloading(true)
    try {
      await api.downloadUpdate(versionInfo?.release_url)
    } catch (err: any) {
      setSaveMsg('下载失败: ' + err.message)
    } finally {
      setDownloading(false)
    }
  }

  const handleBrowseFolder = async () => {
    try {
      const res = await fetch('/api/browse-folder')
      const data = await res.json()
      if (data.path) setSavePath(data.path)
    } catch {
      // user cancelled or not supported
    }
  }

  // -- 主题 handlers --
  const applyTheme = (preset: ThemePreset) => {
    applyThemeToDOM(preset.colors, preset.id)
  }

  const applyClassicTheme = () => {
    resetThemeToDefault()
  }

  const saveThemeChoice = (id: string) => {
    localStorage.setItem('theme', id)
    if (id !== 'classic') {
      const preset = themePresets.find(p => p.id === id)
      if (preset) {
        localStorage.setItem('theme_presets', JSON.stringify(
          themePresets.filter(p => !p.isDefault).map(p => ({ id: p.id, name: p.name, colors: p.colors }))
        ))
      }
    }
    api.updateSettings({ theme: id }).catch(() => {})
  }

  const saveThemePreset = (id: string, name: string, colors: Record<string, string>) => {
    const updated = themePresets.map(p => {
      if (p.id === id) return { ...p, name, colors: { ...p.colors, ...colors } }
      return p
    })
    setThemePresets(updated)

    const custom = updated.filter(p => !p.isDefault).map(p => ({ id: p.id, name: p.name, colors: p.colors }))
    localStorage.setItem('theme_presets', JSON.stringify(custom))
    api.updateSettings({ theme_presets: JSON.stringify(custom) }).catch(() => {})

    if (currentThemeId === id) {
      const newPreset = updated.find(p => p.id === id)!
      applyTheme(newPreset)
    }
  }

  const handleThemeSelect = (preset: ThemePreset) => {
    setCurrentThemeId(preset.id)
    if (preset.isDefault) {
      applyClassicTheme()
    } else {
      applyTheme(preset)
    }
    saveThemeChoice(preset.id)
  }

  return (
    <div>
      {/* Tab Bar */}
      <div className="mgmt-tabs">
        <button className={`mgmt-tab${activeTab === 'general' ? ' active' : ''}`}
          onClick={() => setActiveTab('general')}>通用设置</button>
        <button className={`mgmt-tab${activeTab === 'appearance' ? ' active' : ''}`}
          onClick={() => setActiveTab('appearance')}>网站风格</button>
      </div>
      <div className="mgmt-content">

        {/* ═══ TAB: 通用设置 ═══ */}
        {activeTab === 'general' && (<>
          <div className="settings-section">
            <h3>品牌信息</h3>
            <div className="settings-row">
              <label>LOGO 图标</label>
              <input className="form-input" type="text" value={brandLogo}
                onChange={e => setBrandLogo(e.target.value)} style={{ maxWidth: 200 }} />
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={handleLogoUpload} />
              <button className="btn btn-ghost btn-sm" onClick={() => fileInputRef.current?.click()}
                disabled={logoUploading}>
                {logoUploading ? '上传中...' : '本地上传'}
              </button>
              {isImagePath(brandLogo) && (
                <img src={brandLogo} alt="Logo预览" style={{
                  width: 28, height: 28, borderRadius: 4, objectFit: 'cover',
                  border: '1px solid var(--border)',
                }} />
              )}
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>可输入 emoji、URL 或本地上传</span>
            </div>
            <div className="settings-row">
              <label>应用名称</label>
              <input className="form-input" type="text" value={brandName}
                onChange={e => setBrandName(e.target.value)} style={{ maxWidth: 300 }} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '6px 0 8px' }}>
              以下信息将作为页脚嵌入导出的文档 / PPT 中。
            </p>
            <div className="settings-row">
              <label>版权信息</label>
              <input className="form-input" type="text" value={brandingCopyright}
                onChange={e => setBrandingCopyright(e.target.value)} placeholder="例如：© 2026 你的站点名称" style={{ maxWidth: 300 }} />
            </div>
            <div className="settings-row">
              <label>签名/作者</label>
              <input className="form-input" type="text" value={brandingSignature}
                onChange={e => setBrandingSignature(e.target.value)} placeholder="例如：作者名称" style={{ maxWidth: 300 }} />
            </div>
          </div>

          <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
            <h3>文件保存</h3>
            <div className="settings-row">
              <label>默认保存路径</label>
              <input className="form-input" type="text" value={savePath}
                onChange={e => setSavePath(e.target.value)} />
              <button className="btn btn-ghost btn-sm" onClick={handleBrowseFolder}>浏览...</button>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
              此路径作为所有项目的默认存储根目录，每个项目将在此路径下创建独立子文件夹。
            </div>
          </div>

          <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
            <h3>安全设置</h3>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
              开启后，访问「项目配置」中的模型设置和栏目配置需要输入密码。
              忘记密码？在下方关闭密码保护后重新设置即可。
            </p>
            <div className="settings-row">
              <label>密码保护</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minWidth: 'auto' }}>
                <input type="checkbox" checked={passwordEnabled}
                  onChange={e => { if (e.target.checked) setPasswordEnabled(true); else handlePasswordDisable() }} />
                <span style={{ fontSize: 12 }}>启用密码</span>
              </label>
            </div>
            {passwordEnabled && (<>
              <div className="settings-row">
                <label>初始密码</label>
                <input className="form-input" type="password" value={initialPassword}
                  onChange={e => setInitialPassword(e.target.value)}
                  placeholder="输入初始密码" style={{ maxWidth: 220 }} />
              </div>
              <div className="settings-row">
                <label>新密码</label>
                <input className="form-input" type="password" value={newPassword}
                  onChange={e => setNewPassword(e.target.value)} placeholder="至少4位字符" style={{ maxWidth: 220 }} />
              </div>
              <div className="settings-row">
                <label>确认密码</label>
                <input className="form-input" type="password" value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)} placeholder="再次输入密码" style={{ maxWidth: 220 }} />
              </div>
              <div className="settings-row">
                <label></label>
                <button className="btn btn-primary btn-sm" onClick={handlePasswordSave}>保存密码</button>
                {passwordMsg && (
                  <span style={{ marginLeft: 8, fontSize: 11,
                    color: passwordMsg.includes('失败') || passwordMsg.includes('错误') || passwordMsg.includes('不能') || passwordMsg.includes('不一致') ? 'var(--warning)' : 'var(--success)' }}>
                    {passwordMsg}
                  </span>
                )}
              </div>
            </>)}
          </div>

          <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-primary btn-sm" onClick={handleGlobalSave}>
              全局保存
            </button>
            {saveMsg && (
              <span style={{ marginLeft: 8, fontSize: 11, color: saveMsg.includes('失败') ? 'var(--warning)' : 'var(--success)' }}>
                {saveMsg}
              </span>
            )}
          </div>

          <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
            <h3>关于</h3>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {brandName} v{versionInfo?.current || '1.0.0'}<br />
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }}
                onClick={handleCheckUpdate} disabled={checkingUpdate}>
                {checkingUpdate ? '检查中...' : '检查更新'}
              </button>
              {versionInfo && !checkingUpdate && (
                <div style={{ marginTop: 8, fontSize: 11 }}>
                  {versionInfo.error ? (
                    <span style={{ color: 'var(--warning)' }}>{versionInfo.error}</span>
                  ) : versionInfo.has_update ? (
                    <span style={{ color: 'var(--warning)' }}>
                      发现新版本 v{versionInfo.latest}！
                      <button className="btn btn-primary btn-sm" style={{ marginLeft: 8 }}
                        onClick={handleDownloadUpdate} disabled={downloading}>
                        {downloading ? '下载中...' : '下载并安装'}
                      </button>
                    </span>
                  ) : (
                    <span style={{ color: 'var(--success)' }}>当前已是最新版本</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </>)}

        {/* ═══ TAB: 网站风格 ═══ */}
        {activeTab === 'appearance' && (
          <div>
            <div className="settings-section">
              <h3>主题配色</h3>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
                选择预设主题或自定义配色，一键改变网站整体风格。经典酒红为默认主题，不可修改。
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {themePresets.map(preset => {
                  const isActive = currentThemeId === preset.id
                  const isEditing = editThemeId === preset.id

                  return (
                    <div key={preset.id} style={{
                      padding: 14, borderRadius: 'var(--radius)',
                      border: isActive ? '2px solid var(--primary)' : '2px solid var(--border)',
                      background: 'var(--card)', minWidth: 220,
                    }}>
                      {/* 颜色条 */}
                      <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
                        {[preset.colors.primary, preset.colors.bg, preset.colors.card, preset.colors.text].map((c, i) => (
                          <span key={i} style={{ width: 24, height: 24, borderRadius: 4, background: c, border: '1px solid rgba(0,0,0,0.1)' }} />
                        ))}
                      </div>

                      {/* 名称 */}
                      {preset.isDefault || !isEditing ? (
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{preset.name}</div>
                      ) : (
                        <input className="form-input" value={editName} onChange={e => setEditName(e.target.value)}
                          style={{ fontSize: 12, marginBottom: 4, maxWidth: 160 }} />
                      )}

                      {/* 按钮 */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => handleThemeSelect(preset)}>
                          {isActive ? '✓ 使用中' : '启用'}
                        </button>
                        {!preset.isDefault && (
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => {
                              if (isEditing) {
                                saveThemePreset(preset.id, editName, editColors)
                                setEditThemeId(null)
                              } else {
                                setEditThemeId(preset.id)
                                setEditName(preset.name)
                                setEditColors({ ...preset.colors })
                              }
                            }}>
                            {isEditing ? '💾 保存修改' : '✏ 编辑'}
                          </button>
                        )}
                        {!preset.isDefault && isEditing && (
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => setEditThemeId(null)}>取消</button>
                        )}
                      </div>

                      {/* 编辑模式 — 颜色选择器 */}
                      {isEditing && (
                        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                          {COLOR_LABELS.map(({ key, label }) => (
                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <label style={{ fontSize: 10, minWidth: 56, color: 'var(--text-secondary)' }}>{label}</label>
                              <input type="color" value={editColors[key] || preset.colors[key] || '#000000'}
                                onChange={e => setEditColors(prev => ({ ...prev, [key]: e.target.value }))}
                                style={{ width: 26, height: 22, border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer', padding: 0 }} />
                              <span style={{ fontSize: 9, color: 'var(--text-secondary)', fontFamily: 'var(--mono)' }}>
                                {(editColors[key] || preset.colors[key] || '').toUpperCase()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SettingsPage
