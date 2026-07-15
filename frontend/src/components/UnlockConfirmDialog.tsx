import { api } from '../services/api'

interface UnlockItem {
  project_id: string
  project_name: string
  point_cost_deci: number
}

interface Props {
  needUnlock: UnlockItem[]
  alreadyUnlocked: { project_id: string; project_name: string }[]
  notDownloadable: { project_id: string; project_name: string }[]
  totalCostDeci: number
  balanceDeci: number
  onConfirm: () => void
  onCancel: () => void
}

function pts(d: number) { return (d / 10).toFixed(1) }

export default function UnlockConfirmDialog({
  needUnlock, alreadyUnlocked, notDownloadable,
  totalCostDeci, balanceDeci, onConfirm, onCancel,
}: Props) {
  const canAfford = balanceDeci >= totalCostDeci

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 460, width: '90vw' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>
          确认解锁下载
        </h3>

        {needUnlock.length > 0 && (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
              以下明细需要消耗积分解锁：
            </p>
            <div style={{
              background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 12px',
              marginBottom: 8, fontSize: 13,
            }}>
              {needUnlock.map(p => (
                <div key={p.project_id} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '4px 0', borderBottom: '1px solid var(--border)',
                }}>
                  <span>{p.project_name}</span>
                  <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
                    -{pts(p.point_cost_deci)} 积分
                  </span>
                </div>
              ))}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '6px 0 0', fontWeight: 600, fontSize: 13,
                borderTop: '1px solid var(--border)', marginTop: 4,
              }}>
                <span>合计消耗</span>
                <span style={{ color: 'var(--warning)' }}>{pts(totalCostDeci)} 积分</span>
              </div>
            </div>
            <div style={{
              fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10,
              textAlign: 'center',
            }}>
              当前余额：{pts(balanceDeci)} 积分
              {canAfford ? (
                <span style={{ color: 'var(--text-secondary)' }}>
                  {' '}→ {pts(balanceDeci - totalCostDeci)} 积分
                </span>
              ) : (
                <span style={{ color: 'var(--warning)' }}>
                  {' '}(不足 {pts(totalCostDeci - balanceDeci)} 积分)
                </span>
              )}
            </div>
          </>
        )}

        {alreadyUnlocked.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 8 }}>
            已解锁（不扣积分）：{alreadyUnlocked.map(p => p.project_name).join('、')}
          </div>
        )}

        {notDownloadable.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 8 }}>
            未开放下载：{notDownloadable.map(p => p.project_name).join('、')}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn btn-secondary" onClick={onCancel}>取消</button>
          {canAfford ? (
            <button className="btn btn-primary" onClick={onConfirm}>
              确认解锁并下载
            </button>
          ) : (
            <button className="btn btn-primary" disabled
              style={{ opacity: 0.5, cursor: 'not-allowed' }}>
              积分不足，请先购买套餐
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
