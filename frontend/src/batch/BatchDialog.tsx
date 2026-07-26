import React, { useState } from 'react'
import { BatchImportTab } from './BatchImportTab'
import { BatchExecuteTab } from './BatchExecuteTab'

interface Props {
  workspaceId?: string
  onClose: () => void
  onImported?: () => void
}

export const BatchDialog: React.FC<Props> = ({ workspaceId, onClose, onImported }) => {
  const [tab, setTab] = useState<'import' | 'execute'>('import')
  const [refreshKey, setRefreshKey] = useState(0)

  const handleImported = () => {
    setRefreshKey(k => k + 1)
    onImported?.()
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div style={{
        background: 'var(--card)', borderRadius: 'var(--radius)',
        width: '95vw', maxWidth: 960, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 24px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>批量管理</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
            color: 'var(--text-secondary)', lineHeight: 1, padding: 0,
          }}>&times;</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
          <div
            onClick={() => setTab('import')}
            style={{
              padding: '10px 20px', fontSize: 13, cursor: 'pointer',
              color: tab === 'import' ? 'var(--primary)' : 'var(--text-secondary)',
              borderBottom: tab === 'import' ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: tab === 'import' ? 600 : 400,
            }}
          >批量导入明细</div>
          <div
            onClick={() => setTab('execute')}
            style={{
              padding: '10px 20px', fontSize: 13, cursor: 'pointer',
              color: tab === 'execute' ? 'var(--primary)' : 'var(--text-secondary)',
              borderBottom: tab === 'execute' ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: tab === 'execute' ? 600 : 400,
            }}
          >批量执行</div>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflow: 'auto', flex: 1 }}>
          {tab === 'import' ? (
            <BatchImportTab workspaceId={workspaceId} onImported={handleImported} />
          ) : (
            <BatchExecuteTab workspaceId={workspaceId} refreshKey={refreshKey} />
          )}
        </div>
      </div>
    </div>
  )
}
