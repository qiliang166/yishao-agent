import { useState, useEffect, useRef } from 'react'
import { api } from '../services/api'

function SettingsPage() {
  const [brandLogo, setBrandLogo] = useState('🍽')
  const [brandName, setBrandName] = useState('一勺笔录(SOP)智能体')
  const [savePath, setSavePath] = useState('D:\\YISHAOAGENT\\data\\output')
  const [saveMsg, setSaveMsg] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [versionInfo, setVersionInfo] = useState<null | { current: string; latest: string; has_update: boolean; release_url?: string; error?: string }>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    api.getSettings().then(data => {
      const s = data.settings || {}
      if (s.brand_logo) setBrandLogo(s.brand_logo)
      if (s.brand_name) setBrandName(s.brand_name)
      if (s.save_path) setSavePath(s.save_path)
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
          <button className="btn btn-ghost btn-sm">浏览...</button>
        </div>
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
          一勺笔录(SOP)智能体 v{versionInfo?.current || '1.0.0'}<br />
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
