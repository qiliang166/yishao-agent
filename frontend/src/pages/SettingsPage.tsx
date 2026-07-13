import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { api } from '../services/api'
import { useModal } from '../components/ModalProvider'
import { usePermission } from '../hooks/usePermission'
import { DEFAULT_THEMES, applyThemeToDOM, resetThemeToDefault } from '../services/theme'
import type { ThemePreset } from '../services/theme'

type SettingsTab = 'general' | 'appearance' | 'manual' | 'plan'

interface HelpSection {
  location: string
  title: string
  content: string
}

const LOCATION_ORDER = [
  'home',
  'dashboard',
  'project-stage-1a', 'project-stage-1b', 'project-stage-1c',
  'project-stage-2a', 'project-stage-2b', 'project-stage-2c',
  'project-stage-3a', 'project-stage-3b', 'project-stage-3c',
  'project-stage-4a', 'project-stage-4b',
  'project-stage-5',
  'settings', 'proj-settings', 'templates', 'appendix',
]

/** 前台章节（展示在左侧栏目「操作说明」中，使用者可见） */
const FRONT_LOCATIONS = new Set([
  'home', 'dashboard',
  'project-stage-1a', 'project-stage-1b', 'project-stage-1c',
  'project-stage-2a', 'project-stage-2b', 'project-stage-2c',
  'project-stage-3a', 'project-stage-3b', 'project-stage-3c',
  'project-stage-4a', 'project-stage-4b',
  'project-stage-5',
])

const LOCATION_LABELS: Record<string, string> = {
  home: '项目管理首页',
  dashboard: '项目明细列表',
  'project-stage-1a': 'Stage 1 — 视频提取',
  'project-stage-1b': 'Stage 1 — 文字输入',
  'project-stage-1c': 'Stage 1 — 文件提取',
  'project-stage-2a': 'Stage 2 — 标准文档',
  'project-stage-2b': 'Stage 2 — 分析文档',
  'project-stage-2c': 'Stage 2 — 综合文档',
  'project-stage-3a': 'Stage 3 — 文档课件',
  'project-stage-3b': 'Stage 3 — 分析PPT',
  'project-stage-3c': 'Stage 3 — 综合PPT',
  'project-stage-4a': 'Stage 4 — 演讲文案',
  'project-stage-4b': 'Stage 4 — 演讲口播',
  'project-stage-5': 'Stage 5 — 输出列表',
  settings: '全局设置页',
  'proj-settings': '项目配置页',
  templates: '模板管理页',
  appendix: '附录 — 常见问题与故障排除',
}

function defaultSections(): HelpSection[] {
  return LOCATION_ORDER.map(loc => ({
    location: loc,
    title: LOCATION_LABELS[loc] || loc,
    content: '',
  }))
}

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
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  // -- 通用设置 state --
  const [brandLogo, setBrandLogo] = useState('⚡')
  const [brandName, setBrandName] = useState('')
  const [brandSlogan, setBrandSlogan] = useState('')
  const [savePath, setSavePath] = useState('D:\\YISHAOAGENT\\data\\output')
  const [brandingCopyright, setBrandingCopyright] = useState('')
  const [brandingSignature, setBrandingSignature] = useState('')
  const [saveMsg, setSaveMsg] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canSaveGlobal = usePermission('config.global')
  const [adminPhone, setAdminPhone] = useState('')
  const [qrWechat, setQrWechat] = useState('')
  const [qrAlipay, setQrAlipay] = useState('')
  // 会员套餐
  const [planName, setPlanName] = useState('标准套餐')
  const [planPrice, setPlanPrice] = useState('29.90')
  const [planDays, setPlanDays] = useState('90')
  // 升级套餐
  const [upgradePlanName, setUpgradePlanName] = useState('体验管理员升级')
  const [upgradePlanPrice, setUpgradePlanPrice] = useState('19.90')
  const [upgradePlanDays, setUpgradePlanDays] = useState('30')

  const [adminPasswordEnabled, setAdminPasswordEnabled] = useState(true)

  // -- 修改密码 state --
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwChanging, setPwChanging] = useState(false)
  const [appVersion, setAppVersion] = useState('1.0.0')

  // License state
  const [licenseStatus, setLicenseStatus] = useState<any>(null)
  const [licenseKeyInput, setLicenseKeyInput] = useState('')
  const [licenseLoading, setLicenseLoading] = useState(false)
  const [licenseMsg, setLicenseMsg] = useState('')

  // -- 主题设置 state --
  const [currentThemeId, setCurrentThemeId] = useState('classic')
  const [themePresets, setThemePresets] = useState<ThemePreset[]>(DEFAULT_THEMES)
  const [editThemeId, setEditThemeId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColors, setEditColors] = useState<Record<string, string>>({})

  // -- 操作说明 state --
  const [helpSections, setHelpSections] = useState<HelpSection[]>(defaultSections())
  const [activeEditSection, setActiveEditSection] = useState('')
  const [editSectionTitle, setEditSectionTitle] = useState('')
  const [editSectionContent, setEditSectionContent] = useState('')
  const [manualMsg, setManualMsg] = useState('')
  const [manualSaving, setManualSaving] = useState(false)

  useEffect(() => {
    Promise.all([api.getSettings(), api.getVersion()]).then(([data, ver]) => {
      const s = data.settings || {}
      if (s.brand_logo) setBrandLogo(s.brand_logo)
      if (s.brand_name) setBrandName(s.brand_name)
      if (s.branding_slogan) setBrandSlogan(s.branding_slogan)
      if (s.save_path) setSavePath(s.save_path)
      if (s.branding_copyright) setBrandingCopyright(s.branding_copyright)
      if (s.branding_signature) setBrandingSignature(s.branding_signature)
      if (s.admin_phone) setAdminPhone(s.admin_phone)
      if (s.payment_qr_wechat) setQrWechat(s.payment_qr_wechat)
      if (s.payment_qr_alipay) setQrAlipay(s.payment_qr_alipay)
      if (s.member_plan) {
        try {
          const p = JSON.parse(s.member_plan)
          const q = p.quarterly || p[Object.keys(p)[0]] || {}
          if (q.name) setPlanName(q.name)
          if (q.amount_cents) setPlanPrice((q.amount_cents / 100).toFixed(2))
          if (q.duration_days) setPlanDays(String(q.duration_days))
          if (p.upgrade) {
            if (p.upgrade.name) setUpgradePlanName(p.upgrade.name)
            if (p.upgrade.amount_cents) setUpgradePlanPrice((p.upgrade.amount_cents / 100).toFixed(2))
            if (p.upgrade.duration_days) setUpgradePlanDays(String(p.upgrade.duration_days))
          }
        } catch {}
      }
      setAdminPasswordEnabled(s.admin_password_enabled !== '0')
      if ((ver as any).version) setAppVersion((ver as any).version)
      if (s.app_version) setAppVersion(s.app_version)

      // 加载许可证状态
      api.getLicenseStatus().then((d: any) => setLicenseStatus(d)).catch(() => {})

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

    // 加载操作说明（独立 API）
    fetch('/api/help-manual/sections')
      .then(r => r.json())
      .then(data => {
        const existing: HelpSection[] = data.sections || []
        const merged = defaultSections().map(def => {
          const saved = existing.find((e: HelpSection) => e.location === def.location)
          return saved || def
        })
        setHelpSections(merged)
        if (merged.length > 0) {
          setActiveEditSection(merged[0].location)
          setEditSectionTitle(merged[0].title)
          setEditSectionContent(merged[0].content)
        }
      })
      .catch(() => {})
  }, [])

  // -- Section nav handler --
  const selectSection = (sec: HelpSection) => {
    const updated = helpSections.map(s =>
      s.location === activeEditSection
        ? { ...s, title: editSectionTitle, content: editSectionContent }
        : s
    )
    setHelpSections(updated)
    setActiveEditSection(sec.location)
    setEditSectionTitle(sec.title)
    setEditSectionContent(sec.content)
  }

  const handleManualSave = async () => {
    setManualMsg('')
    setManualSaving(true)
    // Sync current edits into local state
    const updated = helpSections.map(s =>
      s.location === activeEditSection
        ? { ...s, title: editSectionTitle, content: editSectionContent }
        : s
    )
    setHelpSections(updated)

    try {
      const token = localStorage.getItem('auth_token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`/api/help-manual/sections/${encodeURIComponent(activeEditSection)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ title: editSectionTitle, content: editSectionContent }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '保存失败' }))
        throw new Error(err.detail || '保存失败')
      }
      setManualMsg('保存成功')
    } catch (err: any) {
      setManualMsg('保存失败: ' + err.message)
    } finally {
      setManualSaving(false)
    }
  }

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

  const handleGlobalSave = async () => {
    setSaveMsg('')
    try {
      await api.updateSettings({
        brand_logo: brandLogo, brand_name: brandName, save_path: savePath,
        branding_slogan: brandSlogan,
        branding_copyright: brandingCopyright, branding_signature: brandingSignature,
        admin_phone: adminPhone, app_version: appVersion,
        payment_qr_wechat: qrWechat, payment_qr_alipay: qrAlipay,
        admin_password_enabled: adminPasswordEnabled ? '1' : '0',
        member_plan: JSON.stringify({
          quarterly: {
            name: planName, amount_cents: Math.round(parseFloat(planPrice) * 100),
            duration_days: parseInt(planDays, 10) || 90,
          },
          upgrade: {
            name: upgradePlanName, amount_cents: Math.round(parseFloat(upgradePlanPrice) * 100),
            duration_days: parseInt(upgradePlanDays, 10) || 30,
          },
        }),
      })
      const fallback = (await api.getVersion()).app || ''
      document.title = brandName || fallback
      setSaveMsg('保存成功')
    } catch (err: any) {
      setSaveMsg('保存失败: ' + err.message)
    }
  }

  const handleBrowseFolder = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch('/api/browse-folder', { headers })
      const data = await res.json()
      if (data.path) setSavePath(data.path)
    } catch {
      // user cancelled or not supported
    }
  }

  // -- 许可证 handlers --
  const handleLicenseActivate = async () => {
    setLicenseMsg('')
    if (!licenseKeyInput.trim()) { setLicenseMsg('请输入许可证密钥'); return }
    setLicenseLoading(true)
    try {
      await api.activateLicense(licenseKeyInput.trim())
      setLicenseMsg('激活成功')
      setLicenseKeyInput('')
      const d = await api.getLicenseStatus()
      setLicenseStatus(d)
    } catch (err: any) {
      setLicenseMsg('激活失败: ' + err.message)
    } finally {
      setLicenseLoading(false)
    }
  }

  const handleLicenseDeactivate = async () => {
    const ok = await modal.confirm('确定要解除许可证激活吗？解除后软件将无法使用，需重新输入许可证密钥。')
    if (!ok) return
    try {
      const pwdOk = await api.verifyPassword('admin')
      if (!pwdOk.ok) throw new Error('验证失败')
    } catch {
      try {
        await api.verifyPassword('')
      } catch {
        setLicenseMsg('解除激活失败：需要先设置管理员密码')
        return
      }
    }
    try {
      await api.deactivateLicense()
      setLicenseMsg('已解除激活')
      const d = await api.getLicenseStatus()
      setLicenseStatus(d)
    } catch (err: any) {
      setLicenseMsg('操作失败: ' + err.message)
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
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`mgmt-tab${activeTab === 'general' ? ' active' : ''}`}
            onClick={() => setActiveTab('general')}>通用设置</button>
          <button className={`mgmt-tab${activeTab === 'appearance' ? ' active' : ''}`}
            onClick={() => setActiveTab('appearance')}>网站风格</button>
          <button className={`mgmt-tab${activeTab === 'manual' ? ' active' : ''}`}
            onClick={() => setActiveTab('manual')}>操作说明</button>
          <button className={`mgmt-tab${activeTab === 'plan' ? ' active' : ''}`}
            onClick={() => setActiveTab('plan')}>会员套餐</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', marginRight: 50 }}>
          {saveMsg && (
            <span style={{ fontSize: 11, color: saveMsg.includes('失败') ? 'var(--warning)' : 'var(--success)' }}>
              {saveMsg}
            </span>
          )}
          {activeTab !== 'manual' && canSaveGlobal && (
            <button className="btn btn-primary btn-sm" onClick={handleGlobalSave}>
              全局保存
            </button>
          )}
        </div>
      </div>
      <div className="mgmt-content">

        {/* ═══ TAB: 通用设置 ═══ */}
        {activeTab === 'general' && (<>
          <div className="settings-section">
            <h3>品牌信息</h3>
            <div className="settings-row">
              <label>LOGO 图标</label>
              <input className="form-input" type="text" value={brandLogo}
                onChange={e => setBrandLogo(e.target.value)} style={{ maxWidth: 200 }} disabled={!canSaveGlobal} />
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={handleLogoUpload} />
              {canSaveGlobal && <button className="btn btn-ghost btn-sm" onClick={() => fileInputRef.current?.click()}
                disabled={logoUploading}>
                {logoUploading ? '上传中...' : '本地上传'}
              </button>}
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
                onChange={e => setBrandName(e.target.value)} style={{ maxWidth: 300 }} disabled={!canSaveGlobal} />
            </div>
            <div className="settings-row">
              <label>口号</label>
              <input className="form-input" type="text" value={brandSlogan}
                onChange={e => setBrandSlogan(e.target.value)} placeholder="展示在侧边栏品牌名称下方" style={{ maxWidth: 300 }} disabled={!canSaveGlobal} />
            </div>
            <div className="settings-row">
              <label>版本号</label>
              <input className="form-input" type="text" value={appVersion}
                onChange={e => setAppVersion(e.target.value)} style={{ maxWidth: 120 }} disabled={!canSaveGlobal} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '6px 0 8px' }}>
              以下信息将作为页脚嵌入导出的文档 / PPT 中。
            </p>
            <div className="settings-row">
              <label>版权信息</label>
              <input className="form-input" type="text" value={brandingCopyright}
                onChange={e => setBrandingCopyright(e.target.value)} placeholder="例如：© 2026 你的站点名称" style={{ maxWidth: 300 }} disabled={!canSaveGlobal} />
            </div>
            <div className="settings-row">
              <label>签名/作者</label>
              <input className="form-input" type="text" value={brandingSignature}
                onChange={e => setBrandingSignature(e.target.value)} placeholder="例如：作者名称" style={{ maxWidth: 300 }} disabled={!canSaveGlobal} />
            </div>
          </div>

          <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
            <h3>文件保存</h3>
            <div className="settings-row">
              <label>默认保存路径</label>
              <input className="form-input" type="text" value={savePath}
                onChange={e => setSavePath(e.target.value)} disabled={!canSaveGlobal} />
              {canSaveGlobal && <button className="btn btn-ghost btn-sm" onClick={handleBrowseFolder}>浏览...</button>}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
              此路径作为所有项目的默认存储根目录，每个项目将在此路径下创建独立子文件夹。
            </div>
          </div>

          <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
            <h3>账户管理</h3>
            <div className="settings-row">
              <label>密码保护</label>
              <button
                className={adminPasswordEnabled ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                onClick={() => setAdminPasswordEnabled(!adminPasswordEnabled)}
                style={{ minWidth: 80 }}
              >
                {adminPasswordEnabled ? '已开启' : '已关闭'}
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>
                {adminPasswordEnabled ? '访问系统需要登录' : '任何人可直接访问系统'}
              </span>
            </div>
            <div className="settings-row">
              <label>管理员手机号</label>
              <input className="form-input" type="text" value={adminPhone}
                onChange={e => setAdminPhone(e.target.value)} placeholder="用于身份验证" style={{ maxWidth: 220 }} disabled={!canSaveGlobal} />
            </div>
            <h4 style={{ marginTop: 20, marginBottom: 8, fontSize: 13 }}>修改密码</h4>
            <div className="settings-row">
              <label>当前密码</label>
              <input className="form-input" type="password" value={oldPw}
                onChange={e => setOldPw(e.target.value)} placeholder="输入当前密码" style={{ maxWidth: 200 }} />
            </div>
            <div className="settings-row">
              <label>新密码</label>
              <input className="form-input" type="password" value={newPw}
                onChange={e => setNewPw(e.target.value)} placeholder="至少 8 位" style={{ maxWidth: 200 }} />
            </div>
            <div className="settings-row">
              <label>确认新密码</label>
              <input className="form-input" type="password" value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)} placeholder="再次输入新密码" style={{ maxWidth: 200 }} />
            </div>
            <div className="settings-row">
              <label></label>
              <button className="btn btn-primary btn-sm" disabled={pwChanging}
                onClick={async () => {
                  setPwMsg('')
                  if (!oldPw) { setPwMsg('请输入当前密码'); return }
                  if (newPw.length < 8) { setPwMsg('新密码至少 8 位'); return }
                  if (newPw !== confirmPw) { setPwMsg('两次输入的新密码不一致'); return }
                  setPwChanging(true)
                  try {
                    await api.changePassword(oldPw, newPw)
                    setPwMsg('密码修改成功')
                    setOldPw(''); setNewPw(''); setConfirmPw('')
                  } catch (e: any) {
                    setPwMsg(e.message || '修改失败')
                  } finally {
                    setPwChanging(false)
                  }
                }}>
                {pwChanging ? '修改中...' : '修改密码'}
              </button>
              {pwMsg && (
                <span style={{
                  fontSize: 11, marginLeft: 8,
                  color: pwMsg.includes('成功') ? 'var(--success)' : 'var(--warning)',
                }}>
                  {pwMsg}
                </span>
              )}
            </div>
          </div>

          <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
            <h3>收款码配置</h3>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
              会员注册付费套餐时展示的付款二维码。支持上传图片或直接粘贴 base64。
            </p>
            <div className="settings-row">
              <label>微信收款码</label>
              <input className="form-input" type="text" value={qrWechat}
                onChange={e => setQrWechat(e.target.value)} placeholder="粘贴 base64 或通过文件上传"
                style={{ maxWidth: 300 }} disabled={!canSaveGlobal} />
              <input type="file" accept="image/*" style={{ display: 'none' }}
                id="qr-wechat-file"
                onChange={async e => {
                  const f = e.target.files?.[0]
                  if (f) {
                    const reader = new FileReader()
                    reader.onload = () => setQrWechat(reader.result as string)
                    reader.readAsDataURL(f)
                  }
                }} />
              {canSaveGlobal && (
                <button className="btn btn-ghost btn-sm"
                  onClick={() => (document.getElementById('qr-wechat-file') as HTMLInputElement)?.click()}>
                  上传
                </button>
              )}
              {qrWechat && (
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}
                  onClick={() => setQrWechat('')}>清除</button>
              )}
              {qrWechat && (
                <img src={qrWechat} alt="微信收款码" style={{
                  width: 100, height: 100, objectFit: 'contain', marginLeft: 8,
                  border: '1px solid var(--border)', borderRadius: 6,
                }} />
              )}
            </div>
            <div className="settings-row">
              <label>支付宝收款码</label>
              <input className="form-input" type="text" value={qrAlipay}
                onChange={e => setQrAlipay(e.target.value)} placeholder="粘贴 base64 或通过文件上传"
                style={{ maxWidth: 300 }} disabled={!canSaveGlobal} />
              <input type="file" accept="image/*" style={{ display: 'none' }}
                id="qr-alipay-file"
                onChange={async e => {
                  const f = e.target.files?.[0]
                  if (f) {
                    const reader = new FileReader()
                    reader.onload = () => setQrAlipay(reader.result as string)
                    reader.readAsDataURL(f)
                  }
                }} />
              {canSaveGlobal && (
                <button className="btn btn-ghost btn-sm"
                  onClick={() => (document.getElementById('qr-alipay-file') as HTMLInputElement)?.click()}>
                  上传
                </button>
              )}
              {qrAlipay && (
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}
                  onClick={() => setQrAlipay('')}>清除</button>
              )}
              {qrAlipay && (
                <img src={qrAlipay} alt="支付宝收款码" style={{
                  width: 100, height: 100, objectFit: 'contain', marginLeft: 8,
                  border: '1px solid var(--border)', borderRadius: 6,
                }} />
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
              会员注册时将展示这些收款码。如不配置，付费选项将提示用户联系管理员。
            </div>
          </div>

          <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
            <h3>许可证</h3>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
              激活状态管理。一个许可证密钥仅绑定一台机器。
            </p>

            {licenseStatus?.activated ? (
              <>
                <div style={{ fontSize: 12, lineHeight: 1.8, marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <span>状态：<strong style={{ color: 'var(--success)' }}>已激活</strong></span>
                    {licenseStatus.serial_number != null && (
                      <span>序列号：<strong>#{String(licenseStatus.serial_number).padStart(5, '0')}</strong></span>
                    )}
                    {licenseStatus.product_id != null && (
                      <span>产品：<strong>标准版</strong></span>
                    )}
                  </div>
                  {licenseStatus.license_key && (
                    <div style={{ marginTop: 4 }}>
                      激活码：<code style={{
                        fontSize: 11, fontFamily: 'var(--mono)',
                        background: 'var(--primaryLight)', padding: '2px 6px',
                        borderRadius: 4, wordBreak: 'break-all',
                      }}>{licenseStatus.license_key}</code>
                    </div>
                  )}
                  {licenseStatus.activated_at && (
                    <div>激活时间：{licenseStatus.activated_at}</div>
                  )}
                </div>
                {canSaveGlobal && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}
                  onClick={handleLicenseDeactivate}>
                  解除激活
                </button>}
              </>
            ) : (
              <>
                <div style={{
                  fontSize: 12, color: 'var(--warning)', marginBottom: 12,
                  background: '#fef3c7', padding: '6px 10px', borderRadius: 6,
                  display: 'inline-block',
                }}>
                  未激活 — 请输入有效的许可证密钥
                </div>
                <div className="settings-row">
                  <label>许可证密钥</label>
                  <input className="form-input" type="text" value={licenseKeyInput}
                    onChange={e => { setLicenseKeyInput(e.target.value); setLicenseMsg('') }}
                    placeholder="YSAG-XXXXX-XXXXX-..."
                    style={{ maxWidth: 380, fontFamily: 'monospace', fontSize: 12 }}
                    onKeyDown={e => { if (e.key === 'Enter') handleLicenseActivate() }}
                    disabled={!canSaveGlobal}
                  />
                </div>
                <div className="settings-row">
                  <label></label>
                  {canSaveGlobal && <button className="btn btn-primary btn-sm" onClick={handleLicenseActivate}
                    disabled={licenseLoading}>
                    {licenseLoading ? '激活中...' : '激活'}
                  </button>}
                </div>
              </>
            )}

            {licenseMsg && (
              <div style={{
                fontSize: 11, marginTop: 8,
                color: licenseMsg.includes('失败') || licenseMsg.includes('错误') ? 'var(--warning)' : 'var(--success)',
              }}>
                {licenseMsg}
              </div>
            )}
          </div>

          <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
            <h3>关于</h3>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <div>应用名称：{brandName}</div>
              <div>版本：{appVersion}</div>
              {brandingCopyright && <div>版权：{brandingCopyright}</div>}
              {brandingSignature && <div>作者：{brandingSignature}</div>}
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
                          onClick={() => handleThemeSelect(preset)}
                          disabled={!canSaveGlobal}>
                          {isActive ? '✓ 使用中' : '启用'}
                        </button>
                        {canSaveGlobal && !preset.isDefault && (
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

        {/* ═══ TAB: 操作说明 ═══ */}
        {activeTab === 'manual' && (
          <div style={{ display: 'flex', height: 'calc(100vh - 130px)', gap: 0 }}>
            {/* Left: section list */}
            <div style={{
              width: 200, minWidth: 200,
              borderRight: '1px solid var(--border)',
              overflowY: 'auto',
              background: 'var(--bg)',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* 后台管理说明下载按钮 */}
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', fontSize: 10 }}
                  onClick={() => {
                    const backSections = helpSections.filter(s => !FRONT_LOCATIONS.has(s.location))
                    if (backSections.length === 0) return
                    const cover = '\n# 智绘教案系统 Yishao Agent — 操作说明书 V1.0.0\n\n> **后台管理说明（管理员）**\n\n本手册面向系统管理员，覆盖全局设置、全局配置、模板管理以及常见问题与故障排除。\n'
                    const md = cover + '\n---\n' + backSections.map(s => s.content).join('\n\n---\n\n')
                    const html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<title>Yishao Agent 后台管理说明</title>\n<style>\nbody{max-width:800px;margin:0 auto;padding:40px 24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC",sans-serif;font-size:15px;line-height:1.8;color:#333}\nh1{font-size:24px;border-bottom:2px solid #b22222;padding-bottom:8px;margin-top:32px}\nh2{font-size:19px;color:#b22222;margin-top:28px}\ntable{border-collapse:collapse;width:100%}\nth,td{border:1px solid #ddd;padding:8px 12px;font-size:14px}\nth{background:#f5f5f5}\nhr{border:none;border-top:1px solid #eee;margin:32px 0}\n</style>\n</head>\n<body>\n' + DOMPurify.sanitize(marked.parse(md) as string) + '\n</body>\n</html>'
                    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    a.download = 'YishaoAgent_后台管理说明.html'
                    a.click()
                  }}
                >
                  📥 下载后台管理说明
                </button>
              </div>

              {(() => {
                const frontSecs = helpSections.filter(s => FRONT_LOCATIONS.has(s.location))
                const backSecs = helpSections.filter(s => !FRONT_LOCATIONS.has(s.location))
                return (
                  <>
                    {/* 前台分组 */}
                    <div style={{
                      padding: '5px 12px', fontSize: 9, color: 'var(--text-secondary)',
                      letterSpacing: 1, borderBottom: '1px solid var(--border)',
                      background: 'var(--bg)',
                    }}>
                      前台操作说明（使用者可见）
                    </div>
                    {frontSecs.map(s => (
                      <button
                        key={s.location}
                        onClick={() => selectSection(s)}
                        style={{
                          display: 'block', width: '100%', padding: '8px 12px',
                          border: 'none', borderBottom: '1px solid var(--border)',
                          background: activeEditSection === s.location ? 'var(--primary-light)' : 'transparent',
                          color: activeEditSection === s.location ? 'var(--primary)' : 'var(--text)',
                          fontWeight: activeEditSection === s.location ? 600 : 400,
                          fontSize: 10, cursor: 'pointer', textAlign: 'left',
                          fontFamily: 'var(--font)',
                          transition: 'all .1s',
                        }}
                      >
                        {s.title}
                      </button>
                    ))}

                    {/* 后台分组 */}
                    <div style={{
                      padding: '5px 12px', fontSize: 9, color: 'var(--text-secondary)',
                      letterSpacing: 1, borderBottom: '1px solid var(--border)',
                      borderTop: '2px solid var(--border)',
                      background: 'var(--bg)',
                    }}>
                      后台管理说明（仅管理员）
                    </div>
                    {backSecs.map(s => (
                      <button
                        key={s.location}
                        onClick={() => selectSection(s)}
                        style={{
                          display: 'block', width: '100%', padding: '8px 12px',
                          border: 'none', borderBottom: '1px solid var(--border)',
                          background: activeEditSection === s.location ? 'var(--primary-light)' : 'transparent',
                          color: activeEditSection === s.location ? 'var(--primary)' : 'var(--text)',
                          fontWeight: activeEditSection === s.location ? 600 : 400,
                          fontSize: 10, cursor: 'pointer', textAlign: 'left',
                          fontFamily: 'var(--font)',
                          transition: 'all .1s',
                        }}
                      >
                        {s.title}
                      </button>
                    ))}
                  </>
                )
              })()}
            </div>

            {/* Right: editor + preview */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Toolbar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', borderBottom: '1px solid var(--border)',
                background: 'var(--bg)', flexShrink: 0,
              }}>
                <label style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>章节标题：</label>
                <input
                  className="form-input"
                  value={editSectionTitle}
                  onChange={e => setEditSectionTitle(e.target.value)}
                  disabled={!canSaveGlobal}
                  style={{ maxWidth: 200, fontSize: 11 }}
                />
                <div style={{ flex: 1 }} />
                {manualMsg && (
                  <span style={{ fontSize: 10, color: manualMsg.includes('失败') ? 'var(--warning)' : 'var(--success)' }}>
                    {manualMsg}
                  </span>
                )}
                {canSaveGlobal && (
                  <button className="btn btn-primary btn-sm" onClick={handleManualSave} disabled={manualSaving}>
                    {manualSaving ? '保存中...' : '保存当前章节'}
                  </button>
                )}
              </div>

              {/* Editor + Preview split */}
              <div style={{ flex: 1, display: 'flex', gap: 0, minHeight: 0 }}>
                {/* Editor */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)',
                    padding: '6px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--border)',
                  }}>
                    Markdown 编辑
                  </div>
                  <textarea
                    className="form-textarea"
                    value={editSectionContent}
                    onChange={e => setEditSectionContent(e.target.value)}
                    disabled={!canSaveGlobal}
                    style={{
                      flex: 1, minHeight: 0, border: 'none', borderRadius: 0,
                      fontSize: 11, fontFamily: 'var(--mono)', lineHeight: 1.6,
                      resize: 'none', padding: '10px 12px',
                    }}
                    placeholder="输入 Markdown 格式的操作说明..."
                  />
                </div>

                {/* Preview */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)',
                    padding: '6px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--border)',
                  }}>
                    预览
                  </div>
                  <div style={{
                    flex: 1, overflowY: 'auto', padding: '12px 16px',
                  }}>
                    {editSectionContent ? (
                      <div
                        className="prev-md"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(editSectionContent) as string) }}
                      />
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>
                        输入内容后此处显示预览
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ TAB: 会员套餐 ═══ */}
        {activeTab === 'plan' && (<>
          <div className="settings-section">
            <h3>会员套餐</h3>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>会员注册和续费使用的标准套餐。</p>
            <div className="settings-row">
              <label>套餐名称</label>
              <input className="form-input" value={planName}
                onChange={e => setPlanName(e.target.value)}
                disabled={!canSaveGlobal} style={{ maxWidth: 200 }} />
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>如"标准套餐"，会员注册/续费时展示</span>
            </div>
            <div className="settings-row">
              <label>价格（元）</label>
              <input className="form-input" type="number" step="0.01" min="0.01"
                value={planPrice}
                onChange={e => setPlanPrice(e.target.value)}
                disabled={!canSaveGlobal} style={{ maxWidth: 120 }} />
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>会员支付金额</span>
            </div>
            <div className="settings-row">
              <label>有效天数</label>
              <input className="form-input" type="number" step="1" min="1"
                value={planDays}
                onChange={e => setPlanDays(e.target.value)}
                disabled={!canSaveGlobal} style={{ maxWidth: 100 }} />
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>从审批通过当天起算</span>
            </div>
          </div>

          <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
            <h3>升级套餐</h3>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
              付费会员可申请升级为"开发体验员"，获得内容管理权限。升级天数超过会员剩余天数时自动截断。
            </p>
            <div className="settings-row">
              <label>套餐名称</label>
              <input className="form-input" value={upgradePlanName}
                onChange={e => setUpgradePlanName(e.target.value)}
                disabled={!canSaveGlobal} style={{ maxWidth: 200 }} />
            </div>
            <div className="settings-row">
              <label>价格（元）</label>
              <input className="form-input" type="number" step="0.01" min="0.01"
                value={upgradePlanPrice}
                onChange={e => setUpgradePlanPrice(e.target.value)}
                disabled={!canSaveGlobal} style={{ maxWidth: 120 }} />
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>一次性付费，升级天数自动截断不超过会员剩余天数</span>
            </div>
            <div className="settings-row">
              <label>最大天数</label>
              <input className="form-input" type="number" step="1" min="1"
                value={upgradePlanDays}
                onChange={e => setUpgradePlanDays(e.target.value)}
                disabled={!canSaveGlobal} style={{ maxWidth: 100 }} />
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>不超过会员剩余天数时使用此值</span>
            </div>
          </div>
        </>)}
      </div>
    </div>
  )
}

export default SettingsPage
