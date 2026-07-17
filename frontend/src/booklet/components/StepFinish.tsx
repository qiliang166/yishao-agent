import { useState } from 'react'
import { api } from '../../services/api'
import { useModal } from '../../components/ModalProvider'
import { BookletDraft } from '../types'

interface Props {
  draft: BookletDraft
  dirty: boolean
  onSave: () => Promise<boolean>
  onChange: (updater: (d: BookletDraft) => BookletDraft) => void
}

export default function StepFinish({ draft, dirty, onSave, onChange }: Props) {
  const { toast } = useModal()
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [zoom, setZoom] = useState(100)

  const enabledCount = draft.chapters.filter(c => c.enabled).length
  const renderMode = draft.cover.render_mode || 'paged'

  const setRenderMode = (mode: 'paged' | 'flow' | 'standard') =>
    onChange(d => ({ ...d, cover: { ...d.cover, render_mode: mode } }))

  const MODE_OPTIONS: { mode: 'paged' | 'flow' | 'standard'; label: string; descA4: string; descPpt: string }[] = [
    { mode: 'paged', label: '翻页式', descA4: '电子书形态：一次一页居中显示，按钮/方向键翻页', descPpt: '幻灯片形态：一次一屏，按钮/方向键翻页' },
    { mode: 'flow', label: '网页式', descA4: '连续长页不分页，从头滚到尾；打印时由浏览器自然分页', descPpt: '全部页面纵向连续滚动浏览' },
    { mode: 'standard', label: '标准页（PDF 型）', descA4: 'A4 纸页一页接一页瀑布式排布，像 PDF 阅读器；打印即得一页一张 A4', descPpt: '16:9 标准页瀑布式排布，像 PDF 阅读器；打印每页一屏' },
  ]

  const ensureSavedAndRender = async (): Promise<string | null> => {
    const ok = await onSave()
    if (!ok) return null
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

  // 翻页式产物自带窗口自适应，缩放无意义（会被产物内部 fit 抵消）→ 固定 100%；滚动型限 25–100%
  const effZoom = renderMode === 'paged' ? 100 : Math.min(zoom, 100)
  const scale = effZoom / 100

  return (
    <div className="panel-grid">
      <div className="panel-left">
        <div className="card" style={{ flexShrink: 0 }}>
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

        <div className="card" style={{ flexShrink: 0 }}>
          <div className="card-title">🧩 合成方式</div>
          {MODE_OPTIONS.map((opt, i) => (
            <label key={opt.mode} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, cursor: 'pointer', marginBottom: i < MODE_OPTIONS.length - 1 ? 8 : 0 }}>
              <input type="radio" name="bk-render-mode" checked={renderMode === opt.mode}
                onChange={() => setRenderMode(opt.mode)} style={{ marginTop: 2 }} />
              <span>
                <strong>{opt.label}</strong>
                <span style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {draft.book_type === 'a4' ? opt.descA4 : opt.descPpt}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="card" style={{ flexShrink: 0 }}>
          <div className="card-title">📥 合成下载</div>
          <div className="card-hint">
            产物是一个自包含 HTML 文件：双击用浏览器打开即可翻阅；
            {renderMode === 'paged'
              ? '打开后用 ←/→ 方向键或底部按钮翻页。'
              : renderMode === 'standard'
                ? '打开后逐页向下滚动，Ctrl+P 打印即得逐页排版的 PDF。'
                : '打开后上下滚动浏览全部内容。'}
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

      <div className="panel-right" style={{ overflow: 'hidden' }}>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="card-title" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>📖 整书预览</span>
            <span style={{ flex: 1 }} />
            {previewHtml && (renderMode === 'paged' ? (
              <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-secondary)' }}>翻页式自动适配窗口，无需缩放</span>
            ) : (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 11 }}>
                显示比例
                <input type="range" min={25} max={100} step={5} value={effZoom}
                  onChange={e => setZoom(Number(e.target.value))} style={{ width: 140 }} />
                <span style={{ width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{effZoom}%</span>
              </label>
            ))}
          </div>
          {previewHtml ? (
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }}>
              <div style={{
                width: `${10000 / effZoom}%`, height: `${10000 / effZoom}%`,
                transform: `scale(${scale})`, transformOrigin: 'top left',
              }}>
                <iframe srcDoc={previewHtml} title="booklet-preview" sandbox="allow-scripts"
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#fff' }} />
              </div>
            </div>
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
