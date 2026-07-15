import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../services/api'
import { MTopBar, mToast } from '../MobileApp'

const withToken = (url: string) => {
  const token = localStorage.getItem('auth_token')
  if (!token) return url
  return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token)
}

// 安全：src 来自 URL 参数，规范化后只允许本站 /api/ 路径，
// 防止构造外部地址或 /api/../ 绕过骗取带 Authorization/token 的请求
const isSafeSrc = (u: string) => {
  try {
    const parsed = new URL(u, window.location.origin)
    return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

export default function MPreview() {
  const [params] = useSearchParams()
  const kind = params.get('kind') || ''
  const rawSrc = params.get('src') || ''
  const src = isSafeSrc(rawSrc) ? rawSrc : ''
  const name = params.get('name') || '预览'
  const pid = params.get('pid') || ''
  const sn = params.get('sn') || ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [textContent, setTextContent] = useState('')
  const [blobUrl, setBlobUrl] = useState('')
  const [frameDims, setFrameDims] = useState<{ w: number; h: number; scale: number } | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const blobUrlRef = useRef('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        if (kind === 'text') {
          if (!src) throw new Error('缺少文件地址')
          const token = localStorage.getItem('auth_token')
          const resp = await fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
          const text = await resp.text()
          if (!cancelled) setTextContent(text)
        } else if (kind === 'material') {
          if (!pid) throw new Error('缺少项目参数')
          const materials = await api.listMaterials(pid)
          if (cancelled) return
          const target = Array.isArray(materials)
            ? materials.find((m: any) => m != null && (m.source_name === sn || m.source_name === name))
            : null
          if (target == null) throw new Error('未找到该素材')
          setTextContent(target.raw_content || target.processed_content || '（素材内容为空）')
        } else if (kind === 'html') {
          if (!src) throw new Error('缺少文件地址')
          if (src.startsWith('/api/exports/')) {
            // exports 端点公开且 inline，iframe 直接加载
            if (!cancelled) setBlobUrl(src)
          } else {
            // download 端点需 token 且强制 attachment → 取 blob
            // 安全：不强制 MIME，仅当服务器声明 text/html 时才渲染
            const token = localStorage.getItem('auth_token')
            const resp = await fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
            const ct = resp.headers.get('content-type') || ''
            if (!ct.includes('text/html')) throw new Error('该文件不是 HTML，无法预览')
            const blob = await resp.blob()
            if (cancelled) return
            const url = URL.createObjectURL(blob)
            blobUrlRef.current = url
            setBlobUrl(url)
          }
        } else if (kind === 'image' || kind === 'video' || kind === 'audio') {
          if (!src) throw new Error('缺少文件地址')
          // 媒体标签无法带 Authorization 头，用 token 查询参数
          if (!cancelled) setBlobUrl(kind === 'audio' ? src : withToken(src))
        } else {
          throw new Error('不支持的预览类型')
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = ''
      }
    }
  }, [kind, src, pid, sn, name])

  // HTML 课件多为固定宽度桌面布局 → 按容器宽度整体缩放，整页宽度完整可见
  const handleFrameLoad = () => {
    try {
      const doc = iframeRef.current?.contentDocument
      const container = containerRef.current
      if (doc == null || doc.documentElement == null || container == null) return
      const contentW = doc.documentElement.scrollWidth
      const contentH = doc.documentElement.scrollHeight
      const cw = container.clientWidth
      if (contentW > 0 && cw > 0 && contentW > cw) {
        setFrameDims({ w: contentW, h: contentH, scale: cw / contentW })
      }
    } catch {
      // 跨域等读取失败 → 保持默认 100% 宽，容器可双向滚动
    }
  }

  const handleDownload = async () => {
    if (!src) return
    try {
      await api.downloadWithName(src, name)
      mToast('已开始下载')
    } catch (e: any) {
      mToast(`下载失败: ${e?.message || e}`, 'error')
    }
  }

  return (
    <>
      <MTopBar title={name} back="__back__" action={src ? { label: '下载', onClick: handleDownload } : undefined} />
      <div className="m-preview-body" ref={containerRef}>
        {loading ? (
          <div className="m-loading">加载中…</div>
        ) : error ? (
          <div className="m-empty">{error}</div>
        ) : kind === 'text' || kind === 'material' ? (
          <pre className="m-preview-text">{textContent}</pre>
        ) : kind === 'html' ? (
          frameDims != null ? (
            <div style={{ width: frameDims.w * frameDims.scale, height: frameDims.h * frameDims.scale, overflow: 'hidden' }}>
              <iframe ref={iframeRef} src={blobUrl} onLoad={handleFrameLoad} title={name}
                style={{
                  width: frameDims.w, height: frameDims.h, border: 'none',
                  transform: `scale(${frameDims.scale})`, transformOrigin: '0 0',
                }} />
            </div>
          ) : (
            <iframe ref={iframeRef} src={blobUrl} onLoad={handleFrameLoad} title={name}
              className="m-preview-frame" />
          )
        ) : kind === 'image' ? (
          <img className="m-preview-img" src={blobUrl} alt={name} />
        ) : kind === 'video' ? (
          <video className="m-preview-video" src={blobUrl} controls playsInline />
        ) : kind === 'audio' ? (
          <div className="m-preview-audio-wrap">
            <div className="m-preview-audio-name">{name}</div>
            <audio src={blobUrl} controls style={{ width: '100%' }} />
          </div>
        ) : null}
      </div>
    </>
  )
}
