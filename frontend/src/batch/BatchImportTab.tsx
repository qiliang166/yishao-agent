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
      setPreviewRows(data.rows || [])
      setErrors(data.errors || [])
      setResult(null)
    } catch (err: any) {
      alert('解析失败: ' + (err.message || err))
      setPreviewRows([])
      setErrors([])
    }
  }

  const handleImport = async () => {
    if (previewRows.length === 0) return
    setImporting(true)
    setResult(null)
    try {
      const resp = await api.batchImport(previewRows, workspaceId)
      setResult({
        success: resp.created || 0,
        failed: resp.errors?.length || 0,
      })
      if (resp.created > 0) {
        setPreviewRows([])
        if (fileRef.current) fileRef.current.value = ''
        onImported?.()
      }
    } catch (err: any) {
      alert('导入失败: ' + (err.message || err))
    } finally {
      setImporting(false)
    }
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
            disabled={previewRows.length === 0 || importing}
            onClick={handleImport}>
            {importing ? '导入中...' : `确认导入 (${previewRows.length}条)`}
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
          <h4 style={{ fontSize: 13, color: 'var(--text-primary)', margin: '0 0 10px' }}>
            数据预览 (共 {previewRows.length + errors.length} 条)
          </h4>
          <div style={{ overflow: 'auto', maxHeight: 300 }}>
            <table className="data-table" style={{ width: '100%', fontSize: 11 }}>
              <thead>
                <tr>
                  <th>#</th><th>名称</th><th>分类</th><th>出处作者</th>
                  <th>积分</th><th>可下载</th><th style={{ maxWidth: 200 }}>第一步文字内容</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{row.name}</td>
                    <td>{row.category || '—'}</td>
                    <td>{row.author || '—'}</td>
                    <td>{row.point_cost_deci}</td>
                    <td>{row.is_downloadable ? '是' : '否'}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.raw_text || '—'}
                    </td>
                  </tr>
                ))}
                {errors.map((e, i) => (
                  <tr key={`err-${i}`} style={{ background: '#fff2f0' }}>
                    <td>{e.row}</td>
                    <td colSpan={6} style={{ color: '#ff4d4f' }}>
                      &times; {e.error}
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
