import { useState, useEffect, useRef, useCallback } from 'react'
import SvgIcon from '../../components/SvgIcon'
import { api } from '../../services/api'
import { useModal } from '../../components/ModalProvider'
import { BookletDraft, Theme, isHtmlFirstChapter, PageHeaderFooter } from '../types'

interface Props {
  draft: BookletDraft
  onChange: (updater: (d: BookletDraft) => BookletDraft) => void
  readonly?: boolean
}

function Thumb({ doc, pageW, pageH, thumbW }: { doc: string; pageW: number; pageH: number; thumbW: number }) {
  if (!doc || thumbW <= 0) return null
  const scale = thumbW / pageW
  return (
    <div style={{ width: thumbW, height: Math.round(pageH * scale), overflow: 'hidden', background: '#fff', flexShrink: 0 }}>
      <iframe srcDoc={doc} sandbox="" scrolling="no" title="封面预览"
        style={{ width: pageW, height: pageH, border: 'none', transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }} />
    </div>
  )
}

export default function StepCover({ draft, onChange, readonly }: Props) {
  const { toast } = useModal()
  const [themes, setThemes] = useState<Theme[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadingHfLogo, setUploadingHfLogo] = useState(false)
  const [coverDoc, setCoverDoc] = useState('')
  const [coverError, setCoverError] = useState('')
  const [showHf, setShowHf] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const hfLogoRef = useRef<HTMLInputElement>(null)
  const fetchTimer = useRef<ReturnType<typeof setTimeout>>()
  const previewRef = useRef<HTMLDivElement>(null)
  const [previewW, setPreviewW] = useState(0)
  const [previewH, setPreviewH] = useState(0)

  useEffect(() => {
    api.bookletThemes()
      .then(list => { if (list != null) setThemes(list) })
      .catch((e: any) => toast(`加载主题失败: ${e?.message || e}`, 'error'))
  }, [])

  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    const update = () => { setPreviewW(el.clientWidth); setPreviewH(el.clientHeight) }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fetchCover = useCallback(() => {
    const theme = themes.find(t => t.id === draft.cover.theme_id) || themes[0]
    setCoverError('')
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
      vi_mode: draft.book_type === 'a4' && isHtmlFirstChapter(draft.chapters),
      page_hf: draft.cover.page_hf || {},
    }).then(doc => { if (doc) { setCoverDoc(doc); setCoverError('') } })
      .catch((e: any) => {
        console.warn('封面预览加载失败:', e)
        setCoverError('封面预览暂时不可用，请检查后端服务是否已部署最新版本')
      })
  }, [draft.book_type, draft.title, draft.subtitle, draft.author,
      draft.cover.org, draft.cover.date_text, draft.cover.flyleaf_text, draft.cover.back_cover_text,
      draft.cover.logo_url, draft.cover.theme_id, draft.cover.desk_none, draft.cover.page_hf, draft.chapters, themes])

  useEffect(() => {
    if (!themes.length) return
    clearTimeout(fetchTimer.current)
    fetchTimer.current = setTimeout(fetchCover, 250)
    return () => clearTimeout(fetchTimer.current)
  }, [fetchCover, themes])

  const setCover = (patch: Record<string, any>) =>
    onChange(d => ({ ...d, cover: { ...d.cover, ...patch } }))

  const setPageHf = (patch: Partial<PageHeaderFooter>) =>
    setCover({ page_hf: { ...(draft.cover.page_hf || {}), ...patch } })

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

  const handleUploadHfLogo = async (file: File) => {
    setUploadingHfLogo(true)
    try {
      const r = await api.uploadLogo(file)
      if (r != null && r.url) {
        setPageHf({ header_logo_url: r.url })
        toast('页眉 LOGO 已上传', 'success')
      }
    } catch (e: any) {
      toast(`上传失败: ${e?.message || e}`, 'error')
    } finally {
      setUploadingHfLogo(false)
    }
  }

  const pad = 32
  const maxW = Math.max(0, previewW - pad)
  const maxH = Math.max(0, previewH - pad)
  const pageW = draft.book_type === 'ppt' ? 1280 : 794
  const pageH = draft.book_type === 'ppt' ? 720 : 1123
  const aspect = pageW / pageH
  let thumbW = maxW || 480
  if (maxW > 0 && maxH > 0 && maxW / aspect > maxH) {
    thumbW = Math.round(maxH * aspect)
  }

  const hf = draft.cover.page_hf || {}
  const hfEnabled = !!hf.enabled

  return (
    <div className="panel-grid">
      <div className="panel-left">
        <div className="card" style={{ flexShrink: 0 }}>
          <div className="card-title"><SvgIcon name="file-text" size={14} /> 封面与署名</div>
          <div className="form-group">
            <label className="form-label">书名</label>
            <input className="form-input" value={draft.title} disabled={readonly}
              onChange={e => onChange(d => ({ ...d, title: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">副标题</label>
            <input className="form-input" value={draft.subtitle} placeholder="选填" disabled={readonly}
              onChange={e => onChange(d => ({ ...d, subtitle: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">署名（作者/编者）</label>
            <input className="form-input" value={draft.author} placeholder="例如：张三" disabled={readonly}
              onChange={e => onChange(d => ({ ...d, author: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">单位</label>
            <input className="form-input" value={draft.cover.org || ''} placeholder="选填" disabled={readonly}
              onChange={e => setCover({ org: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">日期文字</label>
            <input className="form-input" value={draft.cover.date_text || ''} placeholder="留空则用合成当天日期" disabled={readonly}
              onChange={e => setCover({ date_text: e.target.value })} />
          </div>
          {!readonly && (
            <div className="form-group">
              <label className="form-label">LOGO</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {draft.cover.logo_url && (
                  <img src={draft.cover.logo_url} alt="logo" style={{ height: 32, maxWidth: 90, objectFit: 'contain' }} />
                )}
                <button className="btn btn-ghost btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? '上传中...' : draft.cover.logo_url ? '更换' : <><SvgIcon name="folder" size={14} /> 上传 LOGO</>}
                </button>
                {draft.cover.logo_url && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setCover({ logo_url: '' })}>移除</button>
                )}
                <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.gif,.svg,.webp" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadLogo(f); e.target.value = '' }} />
              </div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">扉页文字（封面背面的编制说明）</label>
            <textarea className="form-input" value={draft.cover.flyleaf_text || ''} placeholder="选填，如编制说明、致读者" disabled={readonly}
              onChange={e => setCover({ flyleaf_text: e.target.value })}
              style={{ height: 64, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">封底文字</label>
            <textarea className="form-input" value={draft.cover.back_cover_text || ''} placeholder="选填，如致谢、版权说明" disabled={readonly}
              onChange={e => setCover({ back_cover_text: e.target.value })}
              style={{ height: 64, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>

        {draft.book_type === 'a4' && (
          <div className="card" style={{ flexShrink: 0 }}>
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span><SvgIcon name="file-text" size={14} /> 正文页眉页脚</span>
              {!readonly && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', fontWeight: 400 }}>
                  <input type="checkbox" checked={hfEnabled}
                    onChange={e => { setPageHf({ enabled: e.target.checked }); if (e.target.checked) setShowHf(true) }} />
                  启用
                </label>
              )}
            </div>
            {hfEnabled && (
              <>
                <div className="form-group" style={{ marginTop: 4 }}>
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>页眉左侧</span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 400 }}>&#123;书名&#125; &#123;章节&#125; &#123;日期&#125; ...</span>
                  </label>
                  <input className="form-input" value={hf.header_left ?? '{书名}'} disabled={readonly}
                    onChange={e => setPageHf({ header_left: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">页眉居中</label>
                  <input className="form-input" value={hf.header_center ?? ''} placeholder="选填" disabled={readonly}
                    onChange={e => setPageHf({ header_center: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">页眉右侧</label>
                  <input className="form-input" value={hf.header_right ?? '{章节}'} disabled={readonly}
                    onChange={e => setPageHf({ header_right: e.target.value })} />
                </div>
                {!readonly && (
                  <div className="form-group">
                    <label className="form-label">页眉 LOGO</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {hf.header_logo_url && (
                        <img src={hf.header_logo_url} alt="" style={{ height: 20, maxWidth: 60, objectFit: 'contain' }} />
                      )}
                      <button className="btn btn-ghost btn-sm" disabled={uploadingHfLogo} onClick={() => hfLogoRef.current?.click()}>
                        {uploadingHfLogo ? '上传中...' : hf.header_logo_url ? '更换' : <><SvgIcon name="folder" size={14} /> 上传页眉 LOGO</>}
                      </button>
                      {hf.header_logo_url && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setPageHf({ header_logo_url: '' })}>移除</button>
                      )}
                      <input ref={hfLogoRef} type="file" accept=".png,.jpg,.jpeg,.gif,.svg,.webp" style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadHfLogo(f); e.target.value = '' }} />
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>页脚左侧</span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 400 }}>&#123;书名&#125; &#123;日期&#125; &#123;口号&#125; ...</span>
                  </label>
                  <input className="form-input" value={hf.footer_left ?? ''} placeholder="选填，如单位名称" disabled={readonly}
                    onChange={e => setPageHf({ footer_left: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">页脚居中</label>
                  <input className="form-input" value={hf.footer_center ?? ''} placeholder="选填" disabled={readonly}
                    onChange={e => setPageHf({ footer_center: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>页脚右侧</span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 400 }}>&#123;页码&#125; &#123;总页数&#125; 自动替换</span>
                  </label>
                  <input className="form-input" value={hf.footer_right ?? '{页码} / {总页数}'} disabled={readonly}
                    onChange={e => setPageHf({ footer_right: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: readonly ? 'default' : 'pointer' }}>
                    <input type="checkbox" checked={hf.show_divider !== false} disabled={readonly}
                      onChange={e => setPageHf({ show_divider: e.target.checked })} />
                    页眉下方显示分隔线
                  </label>
                </div>
                <div className="card-hint" style={{ marginTop: 10, marginBottom: 0 }}>
                  可用变量：&#123;书名&#125; &#123;章节&#125; &#123;日期&#125; &#123;应用名称&#125; &#123;口号&#125; &#123;版权&#125; &#123;签名&#125; &#123;页码&#125; &#123;总页数&#125;
                </div>
              </>
            )}
            {!hfEnabled && (
              <div className="card-hint" style={{ marginTop: 6, marginBottom: 0 }}>
                启用后可在每页正文顶部添加页眉、底部添加页脚。支持的变量：
                &#123;书名&#125; &#123;章节&#125; &#123;日期&#125; &#123;应用名称&#125; &#123;口号&#125; &#123;版权&#125; &#123;签名&#125; &#123;页码&#125; &#123;总页数&#125;
                仅文本章节生效，HTML 课件页不受影响。
              </div>
            )}
          </div>
        )}

        <div className="card" style={{ flexShrink: 0 }}>
          <div className="card-title"><SvgIcon name="palette" size={14} /> 主题配色</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
            {themes.map(t => (
              <div key={t.id} onClick={() => { if (!readonly) setCover({ theme_id: t.id, theme_colors: {} }) }}
                style={{
                  padding: '6px 8px', borderRadius: 5, cursor: readonly ? 'default' : 'pointer', fontSize: 11,
                  border: `2px solid ${draft.cover.theme_id === t.id ? 'var(--primary)' : 'var(--border)'}`,
                  opacity: readonly && draft.cover.theme_id !== t.id ? 0.5 : 1,
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
          {!readonly && (
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
          )}
        </div>
      </div>

      <div className="panel-right" style={{ overflow: 'hidden' }}>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <div className="card-title"><SvgIcon name="eye" size={14} /> 封面实时预览</div>
          <div ref={previewRef}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--bg-secondary)', borderRadius: 6, padding: 16, minHeight: 0 }}>
            {coverError && !coverDoc ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                <div style={{ marginBottom: 8 }}><SvgIcon name="alert-triangle" size={14} /></div>
                <div>{coverError}</div>
              </div>
            ) : (
              <Thumb doc={coverDoc} pageW={pageW} pageH={pageH} thumbW={thumbW} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
