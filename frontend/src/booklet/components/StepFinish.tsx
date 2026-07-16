import { useState } from 'react'
import { api } from '../../services/api'
import { useModal } from '../../components/ModalProvider'
import { BookletDraft } from '../types'

interface Props {
  draft: BookletDraft
  dirty: boolean
  onSave: () => Promise<boolean>
}

export default function StepFinish({ draft, dirty, onSave }: Props) {
  const { toast } = useModal()
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const enabledCount = draft.chapters.filter(c => c.enabled).length

  const ensureSavedAndRender = async (): Promise<string | null> => {
    if (dirty) {
      const ok = await onSave()
      if (!ok) return null
    }
    return api.renderBooklet(draft.id)
  }

  const handlePreview = async () => {
    setPreviewing(true)
    try {
      const html = await ensureSavedAndRender()
      if (html != null) {
        setPreviewHtml(html)
      }
    } catch (e: any) {
      toast(`预览失败: ${e?.message || e}`, 'error')
    } finally {
      setPreviewing(false)
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const html = await ensureSavedAndRender()
      if (html != null) {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${draft.title || 'booklet'}.html`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        toast('电子书已合成下载 — 双击打开即可翻阅', 'success')
      }
    } catch (e: any) {
      toast(`合成失败: ${e?.message || e}`, 'error')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="panel-grid">
      <div className="panel-left">
        <div className="card">
          <div className="card-title">📦 合成信息</div>
          <div style={{ fontSize: 12, lineHeight: 2.1 }}>
            <div>书名：<strong>{draft.title || '—'}</strong></div>
            {draft.subtitle && <div>副标题：{draft.subtitle}</div>}
            <div>署名：{draft.author || '—'}</div>
            <div>类型：{draft.book_type === 'ppt' ? '🖥 PPT 合辑版（横版 16:9）' : '📕 A4 书册版（可打印）'}</div>
            <div>章节：{enabledCount} 章启用 / 共 {draft.chapters.length} 章</div>
          </div>
          {enabledCount === 0 && (
            <div className="card-hint" style={{ marginTop: 8, color: 'var(--danger, #dc2626)' }}>
              没有启用的章节，无法合成 — 回到第①②步添加或启用章节。
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-title">📥 合成下载</div>
          <div className="card-hint">
            产物是一个自包含 HTML 文件：双击用浏览器打开即可翻阅；
            {draft.book_type === 'a4'
              ? '浏览器里 Ctrl+P 打印即得 A4 排版的纸质书/PDF。'
              : '打开后用 ←/→ 方向键或底部按钮翻页。'}
          </div>
          <button className="btn btn-primary" style={{ width: '100%', padding: '10px 0', fontSize: 14 }}
            disabled={downloading || enabledCount === 0} onClick={handleDownload}>
            {downloading ? '⏳ 合成中...' : '📥 合成并下载电子书'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 8 }}
            disabled={previewing || enabledCount === 0} onClick={handlePreview}>
            {previewing ? '⏳ 生成预览中...' : '👁 整书预览'}
          </button>
          {dirty && (
            <div className="card-hint" style={{ marginTop: 8, marginBottom: 0 }}>
              有未保存的修改 — 预览/下载时会自动先保存草稿。
            </div>
          )}
        </div>
      </div>

      <div className="panel-right">
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="card-title">📖 整书预览</div>
          {previewHtml ? (
            <iframe srcDoc={previewHtml} title="booklet-preview" sandbox="allow-scripts"
              style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, background: '#fff', minHeight: 400 }} />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              点击左侧「👁 整书预览」查看合成效果
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
