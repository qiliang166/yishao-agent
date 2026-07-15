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

// 注入到课件 HTML 末尾的测量脚本：由课件自己上报真实内容宽高。
// 微信等移动端 WebView 中父页面直接读 iframe contentDocument 的时机/结果不可靠，
// postMessage 是各端一致的方式。
// 宽度必须用「子元素包围盒并集」而非 scrollWidth：
// COL4/COL5 课件 body 是 flex 居中布局（1280px 固定宽 slide），
// 视口窄时内容向左溢出到负坐标区，scrollWidth 只统计右侧溢出，会严重偏小
const MEASURE_SCRIPT = `<script>(function(){
function measure(){
  var de = document.documentElement, b = document.body;
  var maxR = Math.max(de.scrollWidth, b ? b.scrollWidth : 0);
  var minL = 0;
  var h = Math.max(de.scrollHeight, b ? b.scrollHeight : 0);
  if (b) {
    var els = b.children;
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) continue;
      if (r.left < minL) minL = r.left;
      if (r.right > maxR) maxR = r.right;
      if (r.bottom > h) h = r.bottom;
    }
  }
  return { w: maxR - minL, h: h };
}
function report(){
  try{
    var m = measure();
    parent.postMessage({ t: 'm-preview-size', w: m.w, h: m.h }, '*');
  }catch(e){}
}
if (document.readyState === 'complete') { report() } else { window.addEventListener('load', report) }
setTimeout(report, 300); setTimeout(report, 1200);
})()<\/script>`

// 父页面兜底测量（同源 blob 可读时），与 MEASURE_SCRIPT 同一套包围盒并集逻辑
const measureDoc = (doc: Document): { w: number; h: number } => {
  const de = doc.documentElement
  const b = doc.body
  let maxR = Math.max(de.scrollWidth, b ? b.scrollWidth : 0)
  let minL = 0
  let h = Math.max(de.scrollHeight, b ? b.scrollHeight : 0)
  if (b) {
    for (const el of Array.from(b.children)) {
      const r = el.getBoundingClientRect()
      if (r.width <= 0 && r.height <= 0) continue
      if (r.left < minL) minL = r.left
      if (r.right > maxR) maxR = r.right
      if (r.bottom > h) h = r.bottom
    }
  }
  return { w: maxR - minL, h }
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

  const applyDims = (w: number, h: number) => {
    const cw = containerRef.current?.clientWidth || window.innerWidth
    if (w > 0 && h > 0 && w > cw) {
      setFrameDims(prev => {
        // 取最大上报宽度，避免早期未布局完成的偏小值
        if (prev != null && prev.w >= w) return prev
        return { w, h, scale: cw / w }
      })
    }
  }

  // 接收课件注入脚本上报的真实宽高 → 计算缩放
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data
      if (d == null || d.t !== 'm-preview-size') return
      applyDims(Number(d.w) || 0, Number(d.h) || 0)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

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
          // 统一 fetch 取文本 → 注入测量脚本 → blob 加载
          // 安全：不强制 MIME，仅当服务器声明 text/html 时才渲染
          const token = localStorage.getItem('auth_token')
          const headers: Record<string, string> = {}
          if (!src.startsWith('/api/exports/') && token) headers['Authorization'] = `Bearer ${token}`
          const resp = await fetch(src, { headers })
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
          const ct = resp.headers.get('content-type') || ''
          if (!ct.includes('text/html')) throw new Error('该文件不是 HTML，无法预览')
          const html = await resp.text()
          if (cancelled) return
          const blob = new Blob([html + MEASURE_SCRIPT], { type: 'text/html' })
          const url = URL.createObjectURL(blob)
          blobUrlRef.current = url
          setBlobUrl(url)
        } else if (kind === 'image' || kind === 'video' || kind === 'audio') {
          if (!src) throw new Error('缺少文件地址')
          // 媒体标签无法带 Authorization 头，用 token 查询参数（src 已限定本站 /api/）
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

  // 兜底：部分浏览器可直接同源读取 iframe 内容
  const handleFrameLoad = () => {
    try {
      const doc = iframeRef.current?.contentDocument
      if (doc == null || doc.documentElement == null) return
      const m = measureDoc(doc)
      applyDims(m.w, m.h)
    } catch {
      // 读取失败 → 等 postMessage 上报
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
