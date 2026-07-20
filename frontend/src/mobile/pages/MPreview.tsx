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

// 将 /api/download/{filename}?project_id=xxx 转为 /api/member/preview-file（免解锁预览）
const toPreviewSrc = (u: string, pid: string): string => {
  if (!u.startsWith('/api/download/')) return u
  const parsed = new URL(u, window.location.origin)
  const fn = parsed.pathname.replace('/api/download/', '')
  const pid2 = parsed.searchParams.get('project_id') || pid
  return `/api/member/preview-file?project_id=${encodeURIComponent(pid2)}&filename=${encodeURIComponent(fn)}`
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

// 父页面兜底测量（srcdoc 同源可读时），与 MEASURE_SCRIPT 同一套包围盒并集逻辑
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
  // 微信 X5/XWeb 对 blob: iframe 支持不可靠（真机空白），改用 srcdoc 内联 HTML
  const [htmlDoc, setHtmlDoc] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [frameDims, setFrameDims] = useState<{ w: number; h: number; scale: number } | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

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
          // 统一 fetch 取文本 → 注入测量脚本 → srcdoc 内联加载
          // /api/download/ 会校验解锁 → 返回 402，这里自动转为免解锁预览端点
          const fetchSrc = toPreviewSrc(src, pid)
          const token = localStorage.getItem('auth_token')
          const headers: Record<string, string> = {}
          if (!fetchSrc.startsWith('/api/exports/') && token) headers['Authorization'] = `Bearer ${token}`
          const resp = await fetch(fetchSrc, { headers })
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
          const ct = resp.headers.get('content-type') || ''
          if (!ct.includes('text/html')) throw new Error('该文件不是 HTML，无法预览')
          const html = await resp.text()
          if (!cancelled) setHtmlDoc(html + MEASURE_SCRIPT)
        } else if (kind === 'image' || kind === 'video' || kind === 'audio') {
          if (!src) throw new Error('缺少文件地址')
          // 媒体标签无法带 Authorization 头，用 token 查询参数（src 已限定本站 /api/）
          if (!cancelled) setMediaUrl(kind === 'audio' ? src : withToken(src))
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
    return () => { cancelled = true }
  }, [kind, src, pid, sn, name])

  // 兜底：srcdoc iframe 同源，多数浏览器可直接读取内容
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
      const token = localStorage.getItem('auth_token')
      const sep = src.includes('?') ? '&' : '?'
      const finalUrl = token ? `${src}${sep}token=${encodeURIComponent(token)}` : src
      window.open(finalUrl, '_blank')
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
              <iframe ref={iframeRef} srcDoc={htmlDoc} onLoad={handleFrameLoad} title={name}
                style={{
                  width: frameDims.w, height: frameDims.h, border: 'none',
                  transform: `scale(${frameDims.scale})`, transformOrigin: '0 0',
                }} />
            </div>
          ) : (
            <iframe ref={iframeRef} srcDoc={htmlDoc} onLoad={handleFrameLoad} title={name}
              className="m-preview-frame" />
          )
        ) : kind === 'image' ? (
          <img className="m-preview-img" src={mediaUrl} alt={name} />
        ) : kind === 'video' ? (
          <video className="m-preview-video" src={mediaUrl} controls playsInline />
        ) : kind === 'audio' ? (
          <div className="m-preview-audio-wrap">
            <div className="m-preview-audio-name">{name}</div>
            <audio src={mediaUrl} controls style={{ width: '100%' }} />
          </div>
        ) : null}
      </div>
    </>
  )
}
