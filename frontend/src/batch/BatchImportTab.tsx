import React, { useState, useRef } from 'react'
import { api } from '../services/api'

interface Props {
  workspaceId?: string
  onImported?: () => void
}

interface PreviewRow {
  name: string
  category: string
  author: string
  point_cost_deci: number
  is_downloadable: number
  raw_text: string
}

export const BatchImportTab: React.FC<Props> = ({ workspaceId, onImported }) => {
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [errors, setErrors] = useState<{ row: number; error: string }[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  const handleDownloadTemplate = async () => {
    try {
      await api.downloadBatchTemplate()
    } catch (e) {
      alert('下载模板失败: ' + e)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const data = await api.previewBatchImport(file)
      const rows = data.rows || []
      setPreviewRows(rows)
      setErrors(data.errors || [])
      setSelectedRows(new Set(rows.map((_: any, i: number) => i)))
      setResult(null)
    } catch (err: any) {
      alert('解析失败: ' + (err.message || err))
      setPreviewRows([])
      setErrors([])
    }
  }

  const handleImport = async () => {
    if (selectedRows.size === 0) return
    setImporting(true)
    setResult(null)
    try {
      const toImport = previewRows.filter((_, i) => selectedRows.has(i))
      const resp = await api.batchImport(toImport, workspaceId)
      setResult({
        success: resp.total_created || 0,
        failed: (resp.failed || []).length,
      })
      if (resp.total_created > 0) {
        setPreviewRows([])
        setSelectedRows(new Set())
        if (fileRef.current) fileRef.current.value = ''
        onImported?.()
      }
    } catch (err: any) {
      alert('导入失败: ' + (err.message || err))
    } finally {
      setImporting(false)
    }
  }

  const toggleRow = (i: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const toggleAllRows = () => {
    if (selectedRows.size === previewRows.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(previewRows.map((_, i) => i)))
    }
  }

  const deleteRow = (i: number) => {
    setPreviewRows(prev => {
      const next = prev.filter((_, idx) => idx !== i)
      // Rebuild selectedRows with shifted indices
      setSelectedRows(s => {
        const ns = new Set<number>()
        s.forEach(n => {
          if (n < i) ns.add(n)
          else if (n > i) ns.add(n - 1)
        })
        return ns
      })
      return next
    })
  }

  const dismissError = (i: number) => {
    setErrors(prev => prev.filter((_, idx) => idx !== i))
  }

  const hasData = previewRows.length > 0 || errors.length > 0

  return (
    <div>
      {/* Step Cards */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
        <div className="card" style={{ flex: 1, textAlign: 'center', padding: 20 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: 'var(--primary-light)',
            color: 'var(--primary)', display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 13, fontWeight: 600, marginBottom: 8
          }}>1</div>
          <h4 style={{ fontSize: 13, margin: '0 0 4px' }}>下载模板</h4>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            下载标准 Excel 模板<br />按格式填写明细数据
          </p>
          <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }}
            onClick={handleDownloadTemplate}>下载模板</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', fontSize: 20, flexShrink: 0 }}>
          &rarr;
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center', padding: 20 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: 'var(--primary-light)',
            color: 'var(--primary)', display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 13, fontWeight: 600, marginBottom: 8
          }}>2</div>
          <h4 style={{ fontSize: 13, margin: '0 0 4px' }}>上传 Excel</h4>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            上传填写好的 Excel 文件<br />系统自动解析预览
          </p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ marginTop: 12, fontSize: 11, width: '100%' }}
            onChange={handleFileChange} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', fontSize: 20, flexShrink: 0 }}>
          &rarr;
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center', padding: 20 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: 'var(--primary-light)',
            color: 'var(--primary)', display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 13, fontWeight: 600, marginBottom: 8
          }}>3</div>
          <h4 style={{ fontSize: 13, margin: '0 0 4px' }}>确认导入</h4>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            检查预览数据无误后<br />一键创建所有项目
          </p>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }}
            disabled={selectedRows.size === 0 || importing}
            onClick={handleImport}>
            {importing ? '导入中...' : `确认导入 (${selectedRows.size}条)`}
          </button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 6, fontSize: 12,
          background: result.failed === 0 ? 'var(--success-light)' : '#fff7e6',
          border: `1px solid ${result.failed === 0 ? 'var(--success)' : '#faad14'}`,
        }}>
          导入完成：成功 <strong style={{ color: 'var(--success)' }}>{result.success}</strong> 条
          {result.failed > 0 && (
            <span>，失败 <strong style={{ color: '#ff4d4f' }}>{result.failed}</strong> 条</span>
          )}
        </div>
      )}

      {/* Preview Table */}
      {hasData && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              数据预览 (共 {previewRows.length + errors.length} 条，已选 {selectedRows.size} 条)
            </span>
          </div>
          <div style={{ overflow: 'auto', maxHeight: 300 }}>
            <table className="data-table" style={{ width: '100%', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ width: 30 }}>
                    <input type="checkbox" checked={previewRows.length > 0 && selectedRows.size === previewRows.length}
                      onChange={toggleAllRows} />
                  </th>
                  <th>名称</th><th>分类</th><th>出处作者</th>
                  <th>积分</th><th>可下载</th><th style={{ maxWidth: 200 }}>第一步文字内容</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} style={{ opacity: selectedRows.has(i) ? 1 : 0.45 }}>
                    <td>
                      <input type="checkbox" checked={selectedRows.has(i)}
                        onChange={() => toggleRow(i)} />
                    </td>
                    <td>{row.name}</td>
                    <td>{row.category || '—'}</td>
                    <td>{row.author || '—'}</td>
                    <td>{(row.point_cost_deci / 10).toFixed(1)}</td>
                    <td>{row.is_downloadable ? '是' : '否'}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.raw_text || '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button onClick={() => deleteRow(i)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#ff4d4f', fontSize: 14, lineHeight: 1, padding: 2,
                        }} title="移除此行">&times;</button>
                    </td>
                  </tr>
                ))}
                {errors.map((e, i) => (
                  <tr key={`err-${i}`} style={{ background: '#fff2f0' }}>
                    <td></td>
                    <td style={{ color: '#ff4d4f' }}>第{e.row}行</td>
                    <td colSpan={5} style={{ color: '#ff4d4f' }}>
                      &times; {e.error}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button onClick={() => dismissError(i)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#ff4d4f', fontSize: 14, lineHeight: 1, padding: 2,
                        }} title="忽略">&times;</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
