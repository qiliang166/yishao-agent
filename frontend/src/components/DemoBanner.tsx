import { useLicense } from '../contexts/LicenseContext'

export default function DemoBanner() {
  const { activated, showActivateDialog } = useLicense()

  if (activated) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      padding: '6px 16px', fontSize: 12,
      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
      color: '#fff', flexShrink: 0,
    }}>
      <span>演示模式 — 可浏览配置但无法生成和保存</span>
      <button
        onClick={showActivateDialog}
        style={{
          padding: '3px 12px', fontSize: 11, fontWeight: 600,
          background: '#fff', color: '#d97706', border: 'none',
          borderRadius: 4, cursor: 'pointer',
        }}
      >
        激活正式版
      </button>
    </div>
  )
}
