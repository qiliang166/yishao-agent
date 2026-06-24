import { useEffect, useRef } from 'react'

interface SlidePreviewProps {
  templateId: string
  slide: { type: string; zones: Record<string, any> }
  onZoneClick?: (zoneKey: string) => void
}

/** Iframe-based slide renderer using guizang HTML previews. */
export default function SlidePreview({ templateId, slide, onZoneClick }: SlidePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const htmlCache = useRef<string>('')

  useEffect(() => {
    let cancelled = false
    const key = `${templateId}:${slide.type}:${JSON.stringify(slide.zones)}`

    async function load() {
      try {
        const resp = await fetch(`/api/templates/${encodeURIComponent(templateId)}/preview-slide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slide }),
        })
        if (!resp.ok || cancelled) return
        const data = await resp.json()
        if (data.html && !cancelled) {
          htmlCache.current = data.html
          if (iframeRef.current) {
            iframeRef.current.srcdoc = data.html
          }
        }
      } catch {
        // ignore network errors
      }
    }

    load()
    return () => { cancelled = true }
  }, [templateId, slide.type, JSON.stringify(slide.zones)])

  // Listen for postMessage from iframe for zone clicks
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (e.data?.type === 'zone-click' && onZoneClick) {
        onZoneClick(e.data.zoneKey)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onZoneClick])

  return <iframe ref={iframeRef} title="Slide Preview" />
}

/** Inline preview that injects zone-click listeners into the rendered HTML. */
export function useSlidePreviewHtml(templateId: string) {
  /** Fetch HTML for a single slide and enhance it with zone click handlers */
  async function fetchSlideHtml(slide: { type: string; zones: Record<string, any> }): Promise<string> {
    const resp = await fetch(`/api/templates/${encodeURIComponent(templateId)}/preview-slide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slide }),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json()
    return injectZoneListeners(data.html || '')
  }

  return { fetchSlideHtml }
}

/** Inject click listeners that use postMessage to report zone clicks. */
function injectZoneListeners(html: string): string {
  // Add a script that makes clickable zones send postMessage
  const script = `
<script>
(function(){
  // Find text-containing elements and make them clickable
  var zones = document.querySelectorAll('h1, h2, h3, p, blockquote, .lead, .body-zh, .kicker, .h-xl, .h-hero, .h-xl-zh, .h-statement');
  zones.forEach(function(el, i) {
    var key = el.className || el.tagName.toLowerCase();
    el.style.cursor = 'pointer';
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      window.parent.postMessage({ type: 'zone-click', zoneKey: key, text: el.textContent }, '*');
    });
  });
})();
<\/script>`;
  return html.replace('</body>', script + '</body>')
}
