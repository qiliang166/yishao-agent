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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 960, width: '95vw', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" style={{ fontSize: 16 }}>批量管理</div>
          <button className="modal-close" onClick={onClose}>&times;</button>
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
          >📥 批量导入明细</div>
          <div
            onClick={() => setTab('execute')}
            style={{
              padding: '10px 20px', fontSize: 13, cursor: 'pointer',
              color: tab === 'execute' ? 'var(--primary)' : 'var(--text-secondary)',
              borderBottom: tab === 'execute' ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: tab === 'execute' ? 600 : 400,
            }}
          >⚡ 批量执行</div>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: 20, overflow: 'auto', flex: 1 }}>
          {tab === 'import' ? (
            <BatchImportTab workspaceId={workspaceId} onImported={onImported} />
          ) : (
            <BatchExecuteTab workspaceId={workspaceId} />
          )}
        </div>
      </div>
    </div>
  )
}
