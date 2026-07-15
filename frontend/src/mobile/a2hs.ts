// 添加到桌面（A2HS）支持：
// - 动态 manifest：图标/名称来自服务器设置的品牌 LOGO（静态 manifest 无法带动态 LOGO）
// - beforeinstallprompt 捕获（安卓 Chrome 系）→ promptInstall() 弹原生安装框
// - iOS Safari / 微信内置浏览器无此事件，返回类型标记由调用方展示对应引导

let deferredPrompt: any = null

window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault()
  deferredPrompt = e
})

export const isWeChat = () => /MicroMessenger/i.test(navigator.userAgent)

export const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent)

export const isStandalone = () => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true
  } catch {
    return false
  }
}

// manifest 内的相对 URL 会相对 blob 地址解析失效，必须转绝对地址
const absUrl = (u: string) => {
  try {
    return new URL(u, window.location.origin).href
  } catch {
    return ''
  }
}

const guessMime = (u: string) => {
  const s = u.toLowerCase()
  if (s.startsWith('data:image/')) return s.slice(5, s.indexOf(';'))
  if (s.includes('.jpg') || s.includes('.jpeg')) return 'image/jpeg'
  if (s.includes('.svg')) return 'image/svg+xml'
  if (s.includes('.ico')) return 'image/x-icon'
  return 'image/png'
}

export async function injectManifest() {
  try {
    const resp = await fetch('/api/settings')
    if (!resp.ok) return
    const data = await resp.json()
    const s = data?.settings || {}
    const name = s.brand_name || '智绘食谱教案系统'
    const logo = typeof s.brand_logo === 'string' ? s.brand_logo : ''

    const manifest: any = {
      name,
      short_name: name,
      start_url: window.location.origin + '/mobile/index.html#/',
      scope: window.location.origin + '/mobile/',
      display: 'standalone',
      background_color: '#FAFAF8',
      theme_color: '#8B1A1A',
    }
    if (logo) {
      const iconUrl = logo.startsWith('data:') ? logo : absUrl(logo)
      if (iconUrl) {
        manifest.icons = [
          { src: iconUrl, sizes: '192x192', type: guessMime(logo) },
          { src: iconUrl, sizes: '512x512', type: guessMime(logo) },
        ]
      }
    }

    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' })
    const link = document.createElement('link')
    link.rel = 'manifest'
    link.href = URL.createObjectURL(blob)
    document.head.appendChild(link)

    if (logo) {
      const touch = document.createElement('link')
      touch.rel = 'apple-touch-icon'
      touch.href = logo.startsWith('data:') ? logo : absUrl(logo)
      document.head.appendChild(touch)
    }
  } catch {
    // 设置拉取失败 → 不注入，不影响其他功能
  }
}

export type A2hsResult = 'prompted' | 'accepted' | 'ios' | 'wechat' | 'installed' | 'unavailable'

// 返回值含义：accepted=已安装 / prompted=已弹框被拒 / ios=需展示 iOS 图文引导 /
// wechat=需提示去浏览器打开 / installed=已在桌面模式 / unavailable=当前浏览器不支持
export async function promptInstall(): Promise<A2hsResult> {
  if (isStandalone()) return 'installed'
  if (isWeChat()) return 'wechat'
  if (deferredPrompt != null) {
    try {
      deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      deferredPrompt = null
      return choice != null && choice.outcome === 'accepted' ? 'accepted' : 'prompted'
    } catch {
      deferredPrompt = null
      return 'unavailable'
    }
  }
  if (isIOS()) return 'ios'
  return 'unavailable'
}

export const canNativePrompt = () => deferredPrompt != null
