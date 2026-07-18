import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../../services/api'
import { useModal } from '../../components/ModalProvider'
import { BookletDraft, Theme } from '../types'

interface Props {
  draft: BookletDraft
  onChange: (updater: (d: BookletDraft) => BookletDraft) => void
}

function Thumb({ doc, pageW, pageH, thumbW }: { doc: string; pageW: number; pageH: number; thumbW: number }) {
  if (!doc) return null
  const scale = thumbW / pageW
  return (
    <div style={{ width: thumbW, height: Math.round(pageH * scale), overflow: 'hidden', background: '#fff', flexShrink: 0 }}>
      <iframe srcDoc={doc} sandbox="" scrolling="no" title="封面预览"
        style={{ width: pageW, height: pageH, border: 'none', transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }} />
    </div>
  )
}

export default function StepCover({ draft, onChange }: Props) {
  const { toast } = useModal()
  const [themes, setThemes] = useState<Theme[]>([])
  const [uploading, setUploading] = useState(false)
  const [coverDoc, setCoverDoc] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const fetchTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    api.bookletThemes()
      .then(list => { if (list != null) setThemes(list) })
      .catch((e: any) => toast(`加载主题失败: ${e?.message || e}`, 'error'))
  }, [])

  const fetchCover = useCallback(() => {
    const theme = themes.find(t => t.id === draft.cover.theme_id) || themes[0]
    api.bookletCoverPreview({
      book_type: draft.book_type,
      title: draft.title,
      subtitle: draft.subtitle,
      author: draft.author,
      org: draft.cover.org || '',
      date_text: draft.cover.date_text || '',
      flyleaf_text: draft.cover.flyleaf_text || '',
      back_cover_text: draft.cover.back_cover_text || '',
      logo_url: draft.cover.logo_url || '',
      theme_id: draft.cover.theme_id || '',
      theme_colors: (theme?.colors || {}) as Record<string, string>,
      desk_none: !!draft.cover.desk_none,
    }).then(doc => { if (doc) setCoverDoc(doc) }).catch(() => { /* 静默忽略 */ })
  }, [draft.book_type, draft.title, draft.subtitle, draft.author,
      draft.cover.org, draft.cover.date_text, draft.cover.flyleaf_text, draft.cover.back_cover_text,
      draft.cover.logo_url, draft.cover.theme_id, draft.cover.desk_none, themes])

  useEffect(() => {
    if (!themes.length) return
    clearTimeout(fetchTimer.current)
    fetchTimer.current = setTimeout(fetchCover, 250)
    return () => clearTimeout(fetchTimer.current)
  }, [fetchCover, themes])

  const setCover = (patch: Record<string, any>) =>
    onChange(d => ({ ...d, cover: { ...d.cover, ...patch } }))

  const handleUploadLogo = async (file: File) => {
    setUploading(true)
    try {
      const r = await api.uploadLogo(file)
      if (r != null && r.url) {
        setCover({ logo_url: r.url })
        toast('LOGO 已上传', 'success')
      }
    } catch (e: any) {
      toast(`上传失败: ${e?.message || e}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  const theme = themes.find(t => t.id === draft.cover.theme_id) || themes[0]

  return (
    <div className="panel-grid">
      <div className="panel-left">
        {/* flexShrink:0 防止滚动列内卡片被压缩导致内容溢出重叠 */}
        <div className="card" style={{ flexShrink: 0 }}>
          <div className="card-title">📝 封面与署名</div>
          <div className="form-group">
            <label className="form-label">书名</label>
            <input className="form-input" value={draft.title}
              onChange={e => onChange(d => ({ ...d, title: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">副标题</label>
            <input className="form-input" value={draft.subtitle} placeholder="选填"
              onChange={e => onChange(d => ({ ...d, subtitle: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">署名（作者/编者）</label>
            <input className="form-input" value={draft.author} placeholder="例如：张三"
              onChange={e => onChange(d => ({ ...d, author: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">单位</label>
            <input className="form-input" value={draft.cover.org || ''} placeholder="选填"
              onChange={e => setCover({ org: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">日期文字</label>
            <input className="form-input" value={draft.cover.date_text || ''} placeholder="留空则用合成当天日期"
              onChange={e => setCover({ date_text: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">LOGO</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {draft.cover.logo_url && (
                <img src={draft.cover.logo_url} alt="logo" style={{ height: 32, maxWidth: 90, objectFit: 'contain' }} />
              )}
              <button className="btn btn-ghost btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? '上传中...' : draft.cover.logo_url ? '更换' : '📁 上传 LOGO'}
              </button>
              {draft.cover.logo_url && (
                <button className="btn btn-ghost btn-sm" onClick={() => setCover({ logo_url: '' })}>移除</button>
              )}
              <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.gif,.svg,.webp" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadLogo(f); e.target.value = '' }} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">扉页文字（封面背面的编制说明）</label>
            <textarea className="form-input" value={draft.cover.flyleaf_text || ''} placeholder="选填，如编制说明、致读者"
              onChange={e => setCover({ flyleaf_text: e.target.value })}
              style={{ height: 64, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">封底文字</label>
            <textarea className="form-input" value={draft.cover.back_cover_text || ''} placeholder="选填，如致谢、版权说明"
              onChange={e => setCover({ back_cover_text: e.target.value })}
              style={{ height: 64, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>

        <div className="card" style={{ flexShrink: 0 }}>
          <div className="card-title">🎨 主题配色</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
            {themes.map(t => (
              <div key={t.id} onClick={() => setCover({ theme_id: t.id, theme_colors: {} })}
                style={{
                  padding: '6px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11,
                  border: `2px solid ${draft.cover.theme_id === t.id ? 'var(--primary)' : 'var(--border)'}`,
                }}>
                <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                  {[t.colors.primary, t.colors.accent, t.colors.bg].map((c, i) => (
                    <span key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: '1px solid var(--border)' }} />
                  ))}
                </div>
                <div>{t.name}</div>
                <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{t.source === 'builtin' ? '内置主题' : '风格模板配色'}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!draft.cover.desk_none}
                onChange={e => setCover({ desk_none: e.target.checked })} />
              不要页面外背景色（合成后页面四周用白色底）
            </label>
            <div className="card-hint" style={{ marginTop: 6, marginBottom: 0 }}>
              不勾选时，页面外背景跟随所选主题的深色底，衬托书页更醒目。
            </div>
          </div>
        </div>
      </div>

      <div className="panel-right">
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="card-title">👁 封面实时预览</div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', background: 'var(--bg-secondary)', borderRadius: 6, padding: 16 }}>
            <Thumb doc={coverDoc}
              pageW={draft.book_type === 'ppt' ? 1280 : 794}
              pageH={draft.book_type === 'ppt' ? 720 : 1123}
              thumbW={draft.book_type === 'ppt' ? 480 : 340} />
          </div>
        </div>
      </div>
    </div>
  )
}
