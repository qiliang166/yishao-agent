import { useState, useEffect, useRef } from 'react'
import { api } from '../services/api'
import { sha256 } from '../services/sha256'
import { useModal } from '../components/ModalProvider'

function SettingsPage() {
  const modal = useModal()
  const [brandLogo, setBrandLogo] = useState('🍽')
  const [brandName, setBrandName] = useState('一勺笔录(SOP)智能体')
  const [savePath, setSavePath] = useState('D:\\YISHAOAGENT\\data\\output')
  const [saveMsg, setSaveMsg] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [versionInfo, setVersionInfo] = useState<null | { current: string; latest: string; has_update: boolean; release_url?: string; error?: string }>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Password protection state
  const [passwordEnabled, setPasswordEnabled] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [initialPassword, setInitialPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')

  useEffect(() => {
    api.getSettings().then(data => {
      const s = data.settings || {}
      if (s.brand_logo) setBrandLogo(s.brand_logo)
      if (s.brand_name) setBrandName(s.brand_name)
      if (s.save_path) setSavePath(s.save_path)
      if (s.admin_password_enabled === '1') setPasswordEnabled(true)
    }).catch(() => {})
  }, [])

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
      await api.updateSettings({ brand_logo: brandLogo, brand_name: brandName, save_path: savePath })
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

  return (
    <div>
      {/* 品牌信息 */}
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
      </div>

      {/* 文件保存 */}
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

      {/* 安全设置 */}
      <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
        <h3>安全设置</h3>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
          开启后，访问「项目配置」中的模型设置和栏目配置需要输入密码。
          忘记密码时，可在数据库 backend/data/yishao.db 的 settings 表中删除 admin_password 和 admin_password_enabled 记录。
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

      {/* 全局保存 */}
      <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-primary btn-sm" onClick={handleGlobalSave}>
          📀 全局保存
        </button>
        {saveMsg && (
          <span style={{ marginLeft: 8, fontSize: 11, color: saveMsg.includes('失败') ? 'var(--warning)' : 'var(--success)' }}>
            {saveMsg}
          </span>
        )}
      </div>

      {/* 关于 */}
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
    </div>
  )
}

export default SettingsPage
