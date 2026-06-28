import { useState, useEffect, useCallback } from 'react'
import { api, StyleItem } from '../services/api'
import { useModal } from '../components/ModalProvider'

const VI_LABELS: Record<string, string> = {
  vi: '通用规范', prompt: '提示词', tokens: 'Token',
  principles: '设计原则', colors: '色彩系统', typography: '排版层级',
  card_styles: '卡片样式', decorations: '装饰系统', layouts: '布局库',
  charts: '图表语言', card_roles: '卡片角色', chart_decision: '图表决策',
  data_rules: '数据规则', richness: '丰富度', consistency: '跨页一致',
  icons: '图标规范', images: '配图规范', checklist: '自检清单',
  cover: '封面', toc: '目录', section: '章节分隔', chapter: '章节页',
  content: '内容页', data: '数据页', data_hero: '数据突出',
  technique: '技法页', principle: '原则页', process_flow: '流程图',
  process_timeline: '流程时间线', timeline: '时间线',
  comparison: '对比页', duo_compare: '双项对比',
  table: '表格页', grid_cards: '网格卡片', image_grid: '图片网格',
  quote: '引言页', image_hero: '图片突出',
  troubleshoot: '问题排查', appendix: '附录页', copyright: '版权页',
  closing: '结尾页', summary: '总结',
}

// Canonical page type order — follows document writing conventions (cover → content → closing)
const PAGE_TYPE_ORDER = [
  'cover', 'toc', 'section', 'chapter',
  'content', 'data', 'data_hero',
  'technique', 'principle', 'process_flow', 'process_timeline', 'timeline',
  'comparison', 'duo_compare', 'table', 'grid_cards', 'image_grid',
  'quote', 'image_hero',
  'troubleshoot', 'appendix', 'copyright',
  'closing', 'summary',
]

// Meta files sort first, then foundation chapters, then page types
const META_ORDER = ['vi', 'prompt', 'tokens']
const FOUNDATION_ORDER = [
  'principles', 'colors', 'typography', 'card_styles',
  'charts', 'decorations', 'layouts', 'card_roles',
  'chart_decision', 'data_rules', 'richness', 'consistency',
  'icons', 'images', 'checklist',
]
function pageTypeSortKey(section: string): number {
  const mi = META_ORDER.indexOf(section)
  if (mi >= 0) return mi - META_ORDER.length  // -3, -2, -1
  const fi = FOUNDATION_ORDER.indexOf(section)
  if (fi >= 0) return fi  // 0..14
  const pi = PAGE_TYPE_ORDER.indexOf(section)
  if (pi >= 0) return pi + 100  // 100..125 (after foundation)
  return 999
}

// Resolve {{primary}}, {{chart_0}}, {{semantic_*}} etc. in text to styled color swatches
function resolveColorVarsInText(text: string, schemeColors: SchemeColors | null, fallbackPrimary: string): string {
  if (!schemeColors) return text
  return text.replace(/\{\{(\w+)\}\}/g, (_m: string, key: string) => {
    let val = (schemeColors as any)[key] || ''
    if (!val) {
      const chartMatch = key.match(/^chart_(\d+)$/)
      if (chartMatch && schemeColors.chart_colors) {
        val = schemeColors.chart_colors[parseInt(chartMatch[1])] || ''
      }
    }
    if (!val && schemeColors.semantic) {
      const semMatch = key.match(/^semantic_(\w+)$/)
      if (semMatch) val = schemeColors.semantic[semMatch[1]] || ''
    }
    if (val && val.startsWith('#')) return `<span style="color:${val};font-weight:600">${val}</span>`
    if (val && val.startsWith('rgb')) return `<span style="color:${fallbackPrimary};font-weight:600">${val}</span>`
    return _m
  })
}

function mdToHtml(md: string, title: string, schemeColors?: SchemeColors | null): string {
  const C = makeColors(schemeColors || null)
  // Minimal markdown → styled HTML for preview
  let body = md
    // Escapes
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Fenced code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code"><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="inline">$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Headings
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Blockquote
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
    // Table rows
    .replace(/^\|(.+)\|$/gm, (_, cells: string) => {
      const tds = cells.split('|').map((c: string) => c.trim()).filter((c: string) => !/^[-:]+$/.test(c))
      return '<tr>' + tds.map((c: string) => `<td>${c}</td>`).join('') + '</tr>'
    })
    // Wrap adjacent <tr>s in <table>
    .replace(/(<tr>[\s\S]*?<\/tr>)\s*(<tr>[\s\S]*?<\/tr>)+/g, (m: string) => `<table>${m}</table>`)
    // Horizontal rules
    .replace(/^---$/gm, '<hr>')
    // Unordered list items
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)\s*(<li>[\s\S]*?<\/li>)+/g, (m: string) => `<ul>${m}</ul>`)
    // Ordered list items
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Paragraphs — wrap lines not inside block tags
    .replace(/^(?!<[a-z/])(.+)$/gm, '<p>$1</p>')
    // Fix nested ps in blockquotes
    .replace(/<blockquote><p>(.*?)<\/p><\/blockquote>/g, '<blockquote>$1</blockquote>')
    // Resolve {{color}} placeholders in text content from scheme data
    .replace(/\{\{(\w+)\}\}/g, (_m: string, key: string) => {
      if (!schemeColors) return _m
      let val = (schemeColors as any)[key] || ''
      if (!val) {
        const chartMatch = key.match(/^chart_(\d+)$/)
        if (chartMatch && schemeColors.chart_colors) {
          val = schemeColors.chart_colors[parseInt(chartMatch[1])] || ''
        }
      }
      if (!val && schemeColors.semantic) {
        const semMatch = key.match(/^semantic_(\w+)$/)
        if (semMatch) val = schemeColors.semantic[semMatch[1]] || ''
      }
      if (val && val.startsWith('#')) return `<span style="color:${val};font-weight:600">${val}</span>`
      if (val && val.startsWith('rgb')) return `<span style="color:${schemeColors.primary || C.p};font-weight:600">${val}</span>`
      return _m
    })

  return `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  :root { --bg:${C.bg}; --text:${C.tp}; --muted:${C.tm}; --primary:${C.p}; --accent:${C.a}; --border:${C.b}; --code-bg:${C.cb}; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font:16px/1.8 Inter,'PingFang SC','Microsoft YaHei',sans-serif; color:var(--text); background:var(--bg); max-width:900px; margin:0 auto; padding:40px 48px; }
  h1 { font:700 28px/1.3 'DM Sans',Inter,'PingFang SC',sans-serif; color:var(--primary); margin:32px 0 12px; padding-bottom:8px; border-bottom:2px solid var(--border); }
  h2 { font:700 22px/1.3 'DM Sans',Inter,'PingFang SC',sans-serif; color:var(--primary); margin:28px 0 10px; }
  h3 { font:600 18px/1.4 Inter,sans-serif; color:var(--primary); margin:20px 0 8px; }
  h4 { font:600 16px/1.4 Inter,sans-serif; color:var(--text); margin:16px 0 6px; }
  p { margin:8px 0; }
  ul, ol { margin:8px 0; padding-left:24px; }
  li { margin:4px 0; }
  blockquote { margin:12px 0; padding:8px 16px; border-left:3px solid var(--accent); background:#fafafa; color:var(--muted); }
  hr { border:none; border-top:1px solid var(--border); margin:24px 0; }
  code.inline { background:var(--code-bg); padding:2px 6px; border-radius:4px; font-size:14px; }
  pre.code { background:var(--code-bg); padding:14px 18px; border-radius:8px; overflow-x:auto; font-size:13px; line-height:1.6; margin:12px 0; }
  table { border-collapse:collapse; width:100%; margin:12px 0; font-size:14px; }
  td, th { border:1px solid var(--border); padding:8px 12px; text-align:left; }
  tr:first-child td { background:var(--primary); color:#fff; font-weight:600; }
  strong { color:var(--primary); }
</style></head>
<body>${body}</body></html>`
}

// ── Hex color utilities ──
function hexToRgb(h: string): [number,number,number] {
  const v = parseInt(h.replace('#',''), 16)
  return [(v>>16)&255, (v>>8)&255, v&255]
}
function rgbToHex(r:number,g:number,b:number): string {
  return '#' + [r,g,b].map(c => Math.max(0,Math.min(255,c)).toString(16).padStart(2,'0')).join('')
}
function lighten(hex: string, amt: number): string {
  const [r,g,b] = hexToRgb(hex)
  return rgbToHex(r+amt, g+amt, b+amt)
}
function darken(hex: string, amt: number): string {
  return lighten(hex, -amt)
}

// ── Build full color tokens from a color scheme dict ──
type SchemeColors = Record<string, any>
function makeColors(scheme: SchemeColors | null) {
  // Default deep-blue tokens
  const def: Record<string, any> = {
    p:'#1a365d', pd:'#0f2340', ps:'#2d5f8a', pp:'#d1dce6',
    bg:'#ffffff', cb:'#f0f4f8',
    a:'#e67e22', al:'#fdebd0', as:'#fef5e7',
    tp:'#1a202c', ts:'#3d3d3d', tm:'#6b6b6b',
    b:'#e2e8f0', bl:'#eff1f4',
    cc:['#c8752e','#2d5f8a','#3b6b9e','#d4956a','#2980b9'],
    sem:{ positive:'#27ae60', negative:'#c0392b' },
    hero:'linear-gradient(135deg, #1a365d 0%, #2a4a7f 100%)',
    fh:"'DM Sans','Inter','PingFang SC','Microsoft YaHei',sans-serif",
    fb:"'Inter','PingFang SC','Microsoft YaHei','Helvetica Neue',sans-serif",
    fm:"'SF Mono','Cascadia Code','Consolas',monospace",
    s:'#2d5f8a', t:'#1a202c',
  }
  if (!scheme || !scheme.primary) return def

  const p = scheme.primary       // e.g. #c41e3a
  const s = scheme.secondary || darken(p, 20)
  const a = scheme.accent || '#e67e22'
  const bg = scheme.background || '#ffffff'
  const cb = scheme.card_bg || '#f0f4f8'
  const tp = scheme.text || '#1a202c'
  const cc = scheme.chart_colors && scheme.chart_colors.length >= 5
    ? scheme.chart_colors.slice(0, 5)
    : def.cc
  const sem = scheme.semantic || { positive: '#27ae60', negative: '#c0392b' }

  return {
    p, pd: darken(p, 30), ps: s, pp: lighten(p, 140),
    bg, cb,
    a, al: lighten(a, 100), as: lighten(a, 140),
    tp, ts: lighten(tp, 40), tm: lighten(tp, 90),
    b: def.b, bl: def.bl,
    cc, sem,
    hero: `linear-gradient(135deg, ${p} 0%, ${darken(p, 15)} 100%)`,
    fh: def.fh, fb: def.fb, fm: def.fm,
    s, t: tp,
  }
}

function genSlidePreview(section: string, styleName: string, schemeColors?: SchemeColors | null): string {
  const C = makeColors(schemeColors || null)
  const label = VI_LABELS[section] || section
  const shell = (body: string, cls='') =>
    `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${label} · ${styleName}</title><style>
    :root{
      --p:${C.p};--pd:${C.pd};--ps:${C.ps};--pp:${C.pp};
      --bg:${C.bg};--cb:${C.cb};
      --a:${C.a};--al:${C.al};--as:${C.as};
      --tp:${C.tp};--ts:${C.ts};--tm:${C.tm};
      --b:${C.b};--bl:${C.bl};
      --fh:${C.fh};--fb:${C.fb};--fm:${C.fm};
      --r-sm:4px;--r-md:8px;--r-lg:12px;
      --sh-sm:0 2px 8px rgba(0,0,0,0.08);--sh-md:0 4px 12px rgba(0,0,0,0.08);--sh-lg:0 12px 40px rgba(0,0,0,0.15);
    }
    *{margin:0;padding:0;box-sizing:border-box}
    body{font:16px/1.6 var(--fb);color:var(--tp);background:var(--bg);display:flex;align-items:center;justify-content:center;min-height:100vh}
    .slide{width:960px;height:540px;position:relative;overflow:hidden;box-shadow:var(--sh-lg);border-radius:4px;${cls}}
    /* 5-layer: branding */
    .top-bar{position:absolute;top:0;left:0;right:0;height:4px;background:var(--a);z-index:10}
    .page-num{position:absolute;bottom:16px;right:20px;display:flex;align-items:center;gap:6px;font:12px var(--fm);color:var(--tm);z-index:10}
    .dot{width:6px;height:6px;border-radius:50%;background:var(--a)}
    /* 5-layer: decoration */
    .deco-circle{position:absolute;border-radius:50%;z-index:0}
    .deco-square{position:absolute;z-index:0;opacity:0.04}
    /* 5-layer: structure */
    h2{font:700 32px/1.2 var(--fh);color:var(--p);margin:0 0 6px}
    .short-line{width:40px;height:3px;background:var(--a);border-radius:2px;margin-bottom:20px}
    h3{font:600 16px/1.3 var(--fh);color:var(--p);margin:0 0 4px}
    /* 5-layer: content — card system */
    .card{background:var(--cb);border-radius:var(--r-lg);padding:18px 20px;border:1px solid var(--b);box-shadow:var(--sh-sm);position:relative;overflow:hidden;transition:box-shadow .3s}
    .card:hover{box-shadow:var(--sh-md)}
    .card-bar{position:absolute;left:0;top:0;bottom:0;width:4px}
    .card-bar-top{position:absolute;left:0;right:0;top:0;height:3px;border-radius:0 0 2px 2px}
    .card .card-title{font:600 18px/1.3 var(--fh);color:var(--p);margin:0 0 6px 12px}
    .card .card-body{font-size:14px;color:var(--ts);margin:0 0 0 12px;line-height:1.6}
    .card .card-icon{margin:0 0 8px 10px}
    /* content — metric card */
    .metric{text-align:center;padding:20px 16px}
    .metric .val{font:700 36px/1 'DM Sans',sans-serif;margin:8px 0 4px}
    .metric .lbl{font-size:13px;color:var(--tm)}
    /* content — big number */
    .big-num{font:800 96px/1 'DM Sans',sans-serif;color:var(--a)}
    .big-num .unit{font-size:32px}
    /* content — tags */
    .tag{display:inline-block;padding:2px 8px;border-radius:10px;font:10px/1.4 var(--fm);font-weight:600}
    .tag.accent{background:var(--as);color:${C.a}}
    /* content — table */
    .tbl{width:100%;border-collapse:collapse;font-size:14px}
    .tbl th{font:600 0.7rem var(--fm);color:#fff;background:var(--p);padding:10px 14px;text-align:left;letter-spacing:.05em;text-transform:uppercase}
    .tbl td{padding:10px 14px;border-bottom:1px solid var(--bl);color:var(--ts)}
    .tbl tr:nth-child(even) td{background:#fafbfc}
    /* content — flow node */
    .flow-node{display:inline-flex;align-items:center;justify-content:center;padding:8px 18px;border:2px solid var(--p);background:#fff;font:600 0.7rem var(--fm);color:var(--p);border-radius:4px;margin:6px;letter-spacing:.06em}
    .flow-node.accent{border-color:var(--a);background:var(--as);color:${C.a}}
    .flow-arrow{display:inline-block;margin:0 10px;color:var(--a);font-size:1.2rem;font-weight:700}
    /* content — callout */
    .callout{background:${C.cb};border-left:3px solid var(--p);padding:16px 20px;margin:20px 0;font-size:0.85rem;color:${C.ts};border-radius:0 var(--r-sm) var(--r-sm) 0}
    /* utilities */
    .flex-row{display:flex;gap:16px}
    .flex-col{display:flex;flex-direction:column;gap:12px}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
    .grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    .center{display:flex;align-items:center;justify-content:center}
    .text-center{text-align:center}
    .z1{position:relative;z-index:1}
  </style></head><body><div class="slide">${body}</div></body></html>`

  const pageNum = (n:number, total=12) => `<div class="page-num"><span class="dot"></span> ${n} / ${total}</div>`

  // SVG icon set — outline style, 1.5px stroke, round cap/join
  const ico = {
    clock:   (c:string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    user:    (c:string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`,
    chart:   (c:string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
    shield:  (c:string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    star:    (c:string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    check:   (c:string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><polyline points="20 6 9 17 4 12"/></svg>`,
    target:  (c:string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
    zap:     (c:string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    book:    (c:string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    grid:    (c:string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
    compare: (c:string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    flag:    (c:string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="card-icon"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
  }

  switch (section) {
    // ── cover ──
    case 'cover': return shell(`
      <div style="position:absolute;inset:0;background:${C.hero};display:flex;align-items:flex-end;padding:60px 64px;color:#fff">
        <div class="deco-circle" style="top:-15%;right:-8%;width:45%;height:70%;background:rgba(255,255,255,0.04)"></div>
        <div class="deco-circle" style="bottom:-12%;left:-5%;width:40%;height:60%;background:rgba(255,255,255,0.03)"></div>
        <div style="z-index:1">
          <div style="font:800 48px/1.15 'DM Sans','Inter','PingFang SC',sans-serif;margin-bottom:12px">战略规划 2026</div>
          <div style="font-size:18px;opacity:0.7;margin-bottom:24px">企业增长与市场拓展</div>
          <div style="width:48px;height:4px;background:${C.a};border-radius:2px"></div>
          <div style="margin-top:32px;font-size:13px;opacity:0.5">Company Name · 2026.06</div>
        </div>
      </div>
    `)

    // ── toc ──
    case 'toc': return shell(`
      <div class="top-bar"></div>
      <div class="deco-circle" style="top:-8%;right:-3%;width:22%;height:45%;background:rgba(230,126,34,0.04)"></div>
      <div style="position:relative;z-index:1;padding:56px 64px">
        <h2>目录</h2><div class="short-line"></div>
        <div class="flex-col" style="gap:18px;margin-top:8px">
          ${['项目背景与目标','市场分析','核心能力','战略路径','财务预测','总结与展望'].map((t,i)=>`
            <div style="display:flex;align-items:center;gap:16px">
              <span style="width:32px;height:32px;border-radius:50%;background:${C.cc[i % C.cc.length]};color:#fff;display:flex;align-items:center;justify-content:center;font:600 14px 'DM Sans',sans-serif;flex-shrink:0">${i+1}</span>
              <span style="font:600 18px 'DM Sans','Inter',sans-serif;color:${C.p}">${t}</span>
            </div>
          `).join('')}
        </div>
      </div>
      ${pageNum(2, 26)}
    `)

    // ── content ──
    case 'content': return shell(`
      <div class="top-bar"></div>
      <div class="deco-circle" style="top:-10%;right:-5%;width:30%;height:60%;background:rgba(230,126,34,0.04)"></div>
      <div style="position:relative;z-index:1;padding:48px 56px">
        <h2>核心能力概述</h2><div class="short-line"></div>
        <div class="flex-row" style="margin-top:8px">
          ${[{t:'技术领先',b:'专利数量行业第一，核心技术自主可控',i:0},{t:'团队资深',b:'核心成员来自顶尖企业，平均10年+经验',i:1},{t:'增速迅猛',b:'年复合增长率达45%，市场占有率持续提升',i:2}].map(c=>`
            <div class="card" style="flex:1">
              <div class="card-bar" style="background:${C.cc[c.i]}"></div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${C.cc[c.i]}" stroke-width="1.5" style="margin:0 0 8px 10px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <h3>${c.t}</h3><p>${c.b}</p>
            </div>
          `).join('')}
        </div>
      </div>
      ${pageNum(5, 26)}
    `)

    // ── data ──
    case 'data': return shell(`
      <div class="top-bar"></div>
      <div class="deco-circle" style="top:-8%;right:-3%;width:22%;height:50%;background:rgba(230,126,34,0.04)"></div>
      <div style="position:relative;z-index:1;padding:44px 56px">
        <h2>业绩总览</h2><div class="short-line"></div>
        <div class="flex-row" style="margin-bottom:20px">
          ${[{v:'68.3',u:'M',l:'营收',c:0},{v:'+17.6',u:'%',l:'增长率',c:1},{v:'94.2',u:'%',l:'完成率',c:2}].map(m=>`
            <div class="card" style="flex:1;text-align:center;padding:24px 16px">
              <div class="card-bar" style="background:${C.cc[m.c]};width:40px;height:3px;top:0;left:50%;transform:translateX(-50%);border-radius:2px"></div>
              <div style="font:700 36px/1 'DM Sans',sans-serif;color:${C.cc[m.c]};margin:8px 0 4px">${m.v}<span style="font-size:18px">${m.u}</span></div>
              <div style="font-size:13px;color:${C.tm}">${m.l}</div>
            </div>
          `).join('')}
        </div>
        <div class="card" style="padding:20px 24px">
          <div style="font:600 16px 'DM Sans',sans-serif;color:${C.p};margin-bottom:12px">月度趋势</div>
          <svg width="100%" height="100" viewBox="0 0 800 100">
            <polyline points="20,80 150,60 280,55 410,40 540,30 670,20 780,15" fill="none" stroke="${C.cc[0]}" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="150" cy="60" r="4" fill="${C.cc[1]}"/><circle cx="410" cy="40" r="4" fill="${C.cc[2]}"/><circle cx="780" cy="15" r="5" fill="${C.cc[0]}"/>
          </svg>
        </div>
      </div>
      ${pageNum(6, 26)}
    `)

    // ── summary ──
    case 'summary': return shell(`
      <div style="position:absolute;inset:0;background:${C.hero};display:flex;align-items:center;justify-content:center;color:#fff;text-align:center;padding:60px 80px">
        <div class="deco-circle" style="top:-10%;right:-6%;width:40%;height:65%;background:rgba(255,255,255,0.04)"></div>
        <div class="deco-circle" style="bottom:-10%;left:-5%;width:35%;height:55%;background:rgba(255,255,255,0.03)"></div>
        <div style="z-index:1">
          <div style="font:700 36px/1.3 'DM Sans','Inter','PingFang SC',sans-serif;margin-bottom:32px">感谢聆听</div>
          <div class="flex-row" style="justify-content:center;gap:32px;flex-wrap:wrap">
            ${['技术领先 · 专利行业第一','团队资深 · 10年+经验','增速迅猛 · 年增长45%','市场验证 · 用户满意度94%'].map(k=>`
              <div style="display:flex;align-items:center;gap:10px;font-size:15px">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${C.a}" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                ${k}
              </div>
            `).join('')}
          </div>
          <div style="margin-top:40px;font-size:14px;opacity:0.5">contact@company.com · www.company.com</div>
          <div style="margin-top:8px;font-size:11px;opacity:0.35">&copy; 2026 Company Name. All rights reserved.</div>
        </div>
      </div>
    `)

    // ── technique ──
    case 'technique': return shell(`
      <div class="top-bar"></div>
      <div class="deco-circle" style="top:-8%;right:-3%;width:22%;height:45%;background:rgba(230,126,34,0.04)"></div>
      <div style="position:relative;z-index:1;padding:48px 56px">
        <h2>核心技法：敏捷开发流程</h2><div class="short-line"></div>
        <div class="flex-col" style="gap:12px">
          ${['需求分析','架构设计','迭代开发','测试验证','部署上线'].map((s,i)=>`
            <div class="card" style="display:flex;align-items:center;gap:16px;padding:14px 20px">
              <div class="card-bar" style="background:${C.cc[i]}"></div>
              <div style="width:28px;height:28px;border-radius:50%;background:${C.cc[i]};color:#fff;display:flex;align-items:center;justify-content:center;font:700 13px 'DM Sans',sans-serif;flex-shrink:0">${i+1}</div>
              <div>
                <div style="font:600 16px 'DM Sans',sans-serif;color:${C.p}">${s}</div>
                <div style="font-size:13px;color:${C.tm}">关键步骤描述，确保团队理解执行要点</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ${pageNum(8, 26)}
    `)

    // ── process_flow ──
    case 'process_flow': return shell(`
      <div class="top-bar"></div>
      <div class="deco-circle" style="top:-8%;right:-3%;width:22%;height:45%;background:rgba(230,126,34,0.04)"></div>
      <div style="position:relative;z-index:1;padding:48px 56px">
        <h2>业务流程</h2><div class="short-line"></div>
        <div style="display:flex;align-items:center;justify-content:center;gap:0;margin-top:32px;flex-wrap:wrap">
          ${['需求提交','审核评估','方案设计','开发实施','验收交付'].map((s,i,a)=>`
            <div style="display:flex;align-items:center;gap:0">
              <div style="background:#fff;border:2px solid ${C.cc[i]};border-radius:12px;padding:12px 18px;text-align:center;min-width:100px">
                <div style="font:600 14px 'DM Sans',sans-serif;color:${C.p}">${s}</div>
                <div style="font-size:11px;color:${C.tm};margin-top:4px">步骤 ${i+1}</div>
              </div>
              ${i<a.length-1?`<div style="width:24px;height:2px;background:${C.a};margin:0 2px;position:relative"><div style="position:absolute;right:-4px;top:-4px;border:5px solid transparent;border-left-color:${C.a}"></div></div>`:''}
            </div>
          `).join('')}
        </div>
      </div>
      ${pageNum(10, 26)}
    `)

    // ── comparison ──
    case 'comparison': return shell(`
      <div class="top-bar"></div>
      <div style="position:relative;z-index:1;padding:48px 56px">
        <h2>方案对比分析</h2><div class="short-line"></div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px">
          <tr style="background:${C.p};color:#fff"><th style="padding:10px 14px;text-align:left">维度</th><th style="padding:10px 14px">方案 A</th><th style="padding:10px 14px">方案 B</th><th style="padding:10px 14px">方案 C</th></tr>
          ${[['成本','低','中','高'],['周期','3月','6月','12月'],['风险','中','低','高'],['可扩展','好','优秀','一般'],['推荐','★★★','★★★★','★★']].map((r,i)=>`
            <tr style="background:${i%2?'#fff':C.cb}"><td style="padding:10px 14px;font-weight:600;color:${C.p}">${r[0]}</td>${r.slice(1).map((c,j)=>`<td style="padding:10px 14px;text-align:center${j===1?';color:'+C.cc[4]+';font-weight:600':''}">${c}</td>`).join('')}</tr>
          `).join('')}
        </table>
      </div>
      ${pageNum(13, 26)}
    `)

    // ── timeline ──
    case 'timeline': return shell(`
      <div class="top-bar"></div>
      <div style="position:relative;z-index:1;padding:48px 56px">
        <h2>项目里程碑</h2><div class="short-line"></div>
        <div style="position:relative;margin-top:40px">
          <div style="position:absolute;top:16px;left:0;right:0;height:3px;background:${C.b}"></div>
          <div style="display:flex;justify-content:space-between;position:relative">
            ${[{t:'Q1 2025',e:'项目启动',c:0},{t:'Q2 2025',e:'MVP 上线',c:1},{t:'Q3 2025',e:'首批用户',c:2},{t:'Q4 2025',e:'规模化增长',c:3},{t:'Q1 2026',e:'营收达标',c:4}].map((m,i)=>`
              <div style="text-align:center;width:120px">
                <div style="width:14px;height:14px;border-radius:50%;background:${C.cc[m.c]};margin:9px auto 16px;position:relative;z-index:1"></div>
                <div style="font:600 13px 'DM Sans',sans-serif;color:${C.p}">${m.t}</div>
                <div style="font-size:12px;color:${C.tm};margin-top:4px">${m.e}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      ${pageNum(12, 26)}
    `)

    // ── quote ──
    case 'quote': return shell(`
      <div style="position:absolute;inset:0;background:${C.p};display:flex;align-items:center;justify-content:center;color:#fff;padding:80px 120px">
        <div class="deco-circle" style="top:-15%;right:-10%;width:40%;height:70%;background:rgba(255,255,255,0.02)"></div>
        <div style="text-align:center;position:relative;z-index:1">
          <div style="font:200 120px/1 'DM Sans',sans-serif;color:${C.a};opacity:0.15;margin-bottom:-40px">&ldquo;</div>
          <div style="font:300 32px/1.55 'DM Sans','Inter','PingFang SC',sans-serif">唯一可持续的竞争优势，<br/>是比竞争对手学得更快的能力。</div>
          <div style="width:60px;height:2px;background:${C.a};margin:28px auto;opacity:0.5"></div>
          <div style="font-size:15px;opacity:0.5">&mdash; Peter Drucker</div>
        </div>
      </div>
    `)

    // ── data_hero ──
    case 'data_hero': return shell(`
      <div class="top-bar"></div>
      <div style="display:flex;align-items:center;justify-content:center;height:100%;text-align:center;position:relative">
        <div class="deco-circle" style="top:-20%;right:-10%;width:50%;height:80%;background:rgba(230,126,34,0.03)"></div>
        <div style="z-index:1">
          <div style="font-size:16px;color:${C.tm};margin-bottom:8px">年度总营收</div>
          <div style="font:800 96px/1 'DM Sans',sans-serif;color:${C.cc[0]}">68.3<span style="font-size:32px">M</span></div>
          <div style="display:flex;gap:32px;justify-content:center;margin-top:32px">
            ${[{v:'+17.6%',l:'同比增长',c:2},{v:'94.2%',l:'目标完成',c:1},{v:'#1',l:'市场排名',c:0}].map(m=>`
              <div class="card" style="text-align:center;padding:16px 24px;min-width:120px">
                <div class="card-bar" style="background:${C.cc[m.c]};width:30px;height:3px;top:0;left:50%;transform:translateX(-50%);border-radius:2px"></div>
                <div style="font:700 24px/1 'DM Sans',sans-serif;color:${C.cc[m.c]};margin:8px 0 4px">${m.v}</div>
                <div style="font-size:12px;color:${C.tm}">${m.l}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      ${pageNum(7, 26)}
    `)

    // ── grid_cards ──
    case 'grid_cards': return shell(`
      <div class="top-bar"></div>
      <div class="deco-circle" style="top:-8%;right:-3%;width:22%;height:45%;background:rgba(230,126,34,0.04)"></div>
      <div style="position:relative;z-index:1;padding:44px 52px">
        <h2>核心团队</h2><div class="short-line"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px">
          ${['张明','李华','王芳','陈刚'].map((n,i)=>`
            <div class="card" style="text-align:center;padding:20px 14px">
              <div class="card-bar" style="background:${C.cc[i]};width:100%;height:3px;top:0;left:0;border-radius:0 0 2px 2px"></div>
              <div style="width:44px;height:44px;border-radius:50%;background:${C.cc[i]};color:#fff;display:flex;align-items:center;justify-content:center;font:700 18px 'DM Sans',sans-serif;margin:8px auto 10px">${n[0]}</div>
              <div style="font:600 15px 'DM Sans',sans-serif;color:${C.p}">${n}</div>
              <div style="font-size:12px;color:${C.tm};margin-top:4px">${['CEO','CTO','CFO','COO'][i]} · 核心合伙人</div>
            </div>
          `).join('')}
        </div>
      </div>
      ${pageNum(16, 26)}
    `)

    // ── table ──
    case 'table': return shell(`
      <div class="top-bar"></div>
      <div style="position:relative;z-index:1;padding:44px 52px">
        <h2>产品规格对比</h2><div class="short-line"></div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px">
          <tr style="background:${C.p};color:#fff"><th style="padding:10px 14px;text-align:left">型号</th><th style="padding:10px 14px">处理器</th><th style="padding:10px 14px">内存</th><th style="padding:10px 14px">存储</th><th style="padding:10px 14px">价格</th></tr>
          ${[['Pro','A18','16GB','512GB','$999'],['Max','A18 Pro','32GB','1TB','$1,299'],['Ultra','M4','64GB','2TB','$1,999'],['Lite','A17','8GB','256GB','$699']].map((r,i)=>`
            <tr style="background:${i%2?'#fff':C.cb}"><td style="padding:10px 14px;font-weight:600;color:${C.p}">${r[0]}</td>${r.slice(1).map(c=>`<td style="padding:10px 14px;text-align:center">${c}</td>`).join('')}</tr>
          `).join('')}
        </table>
      </div>
      ${pageNum(15, 26)}
    `)

    // ── principle ──
    case 'principle': return shell(`
      <div class="top-bar"></div>
      <div class="deco-circle" style="top:-10%;right:-4%;width:20%;height:42%;background:rgba(45,95,138,0.04)"></div>
      <div style="position:relative;z-index:1;padding:44px 52px">
        <h2>设计原则</h2><div class="short-line"></div>
        <div class="flex-col" style="gap:14px;margin-top:8px">
          ${[
            {n:'01',t:'用户优先',d:'一切设计决策以最终用户体验为出发点，摒弃技术偏见与内部视角'},
            {n:'02',t:'数据驱动',d:'基于真实数据而非主观臆断，用 A/B 测试验证每一个假设'},
            {n:'03',t:'渐进增强',d:'从核心功能开始迭代，避免过度设计，保持架构可演化性'},
            {n:'04',t:'一致可预测',d:'保持交互模式、视觉语言和命名规范的全局一致性'},
          ].map((p,i)=>`
            <div class="card" style="display:flex;align-items:flex-start;gap:16px;padding:16px 20px">
              <div class="card-bar" style="background:${C.cc[i]};width:4px;top:0;left:0;bottom:0;position:absolute"></div>
              <div style="flex-shrink:0;width:36px;height:36px;border-radius:50%;background:${C.cc[i]};color:#fff;display:flex;align-items:center;justify-content:center;font:700 16px 'DM Sans',sans-serif">${p.n}</div>
              <div>
                <h3 style="margin:0 0 4px">${p.t}</h3>
                <p style="margin:0">${p.d}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ${pageNum(9, 26)}
    `)

    // ── duo_compare ──
    case 'duo_compare': return shell(`
      <div class="top-bar"></div>
      <div style="position:relative;z-index:1;padding:40px 48px;display:flex;flex-direction:column;height:100%">
        <h2>方案对比：A vs B</h2><div class="short-line"></div>
        <div style="display:flex;flex:1;gap:0;margin-top:8px;position:relative">
          <div style="flex:1;padding:20px 24px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
              <div style="width:40px;height:40px;border-radius:50%;background:${C.cc[0]};color:#fff;display:flex;align-items:center;justify-content:center;font:700 18px 'DM Sans',sans-serif">A</div>
              <div style="font:600 20px 'DM Sans',sans-serif;color:${C.p}">自研方案</div>
            </div>
            ${['完全可控，定制化强','开发周期 6 个月','初始投入 $50 万','后期维护成本低'].map((t,i)=>`
              <div style="display:flex;align-items:center;gap:8px;padding:8px 0;font-size:14px"><span style="color:${C.cc[0]};font-weight:700">✓</span> ${t}</div>
            `).join('')}
          </div>
          <div style="width:2px;background:linear-gradient(180deg,${C.a}00 0%,${C.a} 50%,${C.a}00 100%)"></div>
          <div style="flex:1;padding:20px 24px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
              <div style="width:40px;height:40px;border-radius:50%;background:${C.cc[3]};color:#fff;display:flex;align-items:center;justify-content:center;font:700 18px 'DM Sans',sans-serif">B</div>
              <div style="font:600 20px 'DM Sans',sans-serif;color:${C.p}">采购方案</div>
            </div>
            ${['快速上线，1 个月交付','年费 $30 万 + 按量','供应商锁定风险','功能扩展受限'].map((t,i)=>`
              <div style="display:flex;align-items:center;gap:8px;padding:8px 0;font-size:14px"><span style="color:${C.cc[3]};font-weight:700">○</span> ${t}</div>
            `).join('')}
          </div>
        </div>
        <div style="text-align:center;margin-top:12px;padding:10px 20px;background:${C.cb};border-radius:8px;font-size:14px;color:${C.p};font-weight:600">建议：优先采购快速验证，并行规划自研 2.0</div>
      </div>
      ${pageNum(14, 26)}
    `)

    // ── troubleshoot ──
    case 'troubleshoot': return shell(`
      <div class="top-bar"></div>
      <div style="position:relative;z-index:1;padding:40px 48px">
        <h2>常见问题排查</h2><div class="short-line"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:4px;font-size:12px;font-weight:600;color:${C.p};padding:6px 14px">
          <span>问题</span><span>原因</span><span>解决方案</span>
        </div>
        ${[
          ['服务响应超时','连接池耗尽 + GC 暂停','扩容连接池至 200，启用 HTTP/2 多路复用'],
          ['数据库死锁','并发事务更新同表不同行','引入乐观锁版本号，重试机制 3 次退避'],
          ['缓存命中率低','Key 设计不合理 + 过期集中','Hash Tag 分散 + TTL 随机抖动 ±15%'],
        ].map((r,i)=>`
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:12px 14px;background:${i%2?'#fff':C.cb};border-radius:6px;font-size:13px;line-height:1.6;margin-bottom:6px">
            <div style="font-weight:600;color:${C.cc[0]}">${r[0]}</div>
            <div style="color:${C.ts}">${r[1]}</div>
            <div style="color:${C.s}">${r[2]}</div>
          </div>
        `).join('')}
      </div>
      ${pageNum(22, 26)}
    `)

    // ── copyright ──
    case 'copyright': return shell(`
      <div style="position:absolute;inset:0;background:${C.hero};display:flex;align-items:center;justify-content:center;color:#fff;text-align:center">
        <div class="deco-circle" style="top:-20%;left:-10%;width:50%;height:80%;background:rgba(255,255,255,0.03)"></div>
        <div class="deco-circle" style="bottom:-15%;right:-8%;width:40%;height:60%;background:rgba(255,255,255,0.02)"></div>
        <div style="z-index:1">
          <div style="font:300 14px/2 'Inter','PingFang SC',sans-serif;opacity:0.75;max-width:520px;margin:0 auto">
            &copy; 2026 Company Name. All Rights Reserved.<br>
            本文件所含信息为机密信息，仅供授权人员使用。<br>
            未经事先书面许可，不得以任何形式复制或传播。
          </div>
          <div style="width:32px;height:2px;background:${C.a};margin:24px auto;border-radius:1px"></div>
          <div style="font-size:12px;opacity:0.45">致谢 · 产品团队 设计团队 工程团队</div>
        </div>
      </div>
      ${pageNum(24, 26)}
    `)

    // ── appendix ──
    case 'appendix': return shell(`
      <div class="top-bar"></div>
      <div style="position:relative;z-index:1;padding:40px 52px">
        <h2>附录</h2><div class="short-line"></div>
        <div style="margin-top:8px">
          <h3 style="font:600 16px 'DM Sans',sans-serif;color:${C.p};margin-bottom:6px">参考资料</h3>
          ${[
            '[1] Chen, L. et al. "Deep Learning for NLP." JMLR 2025.',
            '[2] Smith, R. "System Design at Scale." O\'Reilly 2024.',
            '[3] Kumar, A. & Zhang, W. "Cloud Native Patterns." ACM Queue 22(3).',
          ].map(r=>`<div style="padding:5px 0;font-size:13px;color:${C.ts};border-bottom:1px solid ${C.cb}">${r}</div>`).join('')}
        </div>
        <div style="margin-top:16px">
          <h3 style="font:600 16px 'DM Sans',sans-serif;color:${C.p};margin-bottom:6px">术语表</h3>
          <div style="display:grid;grid-template-columns:2fr 5fr;gap:4px 16px;font-size:13px">
            ${[['SLA','Service Level Agreement — 服务等级协议'],['MTTR','Mean Time To Recovery — 平均恢复时间'],['RPO','Recovery Point Objective — 恢复点目标']].map(([t,d])=>`
              <div style="font-weight:600;color:${C.p};padding:3px 0">${t}</div>
              <div style="color:${C.ts};padding:3px 0;border-bottom:1px solid ${C.cb}">${d}</div>
            `).join('')}
          </div>
        </div>
      </div>
      ${pageNum(23, 26)}
    `)

    // ── section ──
    case 'section': return shell(`
      <div style="position:absolute;inset:0;background:${C.hero};display:flex;align-items:center;justify-content:center;color:#fff;text-align:center">
        <div class="deco-circle" style="top:-12%;right:-5%;width:40%;height:65%;background:rgba(255,255,255,0.04)"></div>
        <div class="deco-circle" style="bottom:-10%;left:-6%;width:35%;height:55%;background:rgba(255,255,255,0.03)"></div>
        <div style="z-index:1">
          <div style="font:600 16px var(--fm);color:var(--a);opacity:0.75;letter-spacing:0.12em;margin-bottom:16px">PART 2</div>
          <div style="font:700 48px/1.2 'DM Sans',sans-serif;margin-bottom:12px">市场分析与策略</div>
          <div style="width:48px;height:3px;background:var(--a);border-radius:2px;margin:0 auto 20px"></div>
          <div style="font-size:15px;opacity:0.55;max-width:400px;margin:0 auto">本章深入分析市场趋势、竞争格局与增长机会</div>
        </div>
      </div>
    `)

    // ── chapter ──
    case 'chapter': return shell(`
      <div class="top-bar"></div>
      <div class="deco-circle" style="top:-8%;right:-3%;width:22%;height:45%;background:rgba(230,126,34,0.04)"></div>
      <div style="position:relative;z-index:1;padding:48px 56px;display:flex;gap:40px;align-items:center;height:100%">
        <div style="font:800 120px/1 var(--fh);color:var(--a);opacity:0.2;flex-shrink:0">02</div>
        <div>
          <div style="font:600 14px var(--fm);color:var(--a);letter-spacing:0.1em;margin-bottom:8px">CHAPTER 2</div>
          <h2 style="font-size:36px">核心技术架构</h2>
          <div class="short-line"></div>
          <p style="font-size:16px;color:var(--tm);max-width:480px">本章深入探讨系统核心技术栈、架构设计原则与关键技术决策，为后续实现奠定基础。</p>
          <div style="display:flex;gap:20px;margin-top:20px">
            ${['微服务架构','分布式存储','实时计算'].map((t,i)=>`
              <div class="card" style="padding:10px 16px;text-align:center">
                <div class="card-bar-top" style="background:${C.cc[i]}"></div>
                <div style="font:600 13px var(--fh);color:var(--p);margin-top:6px">${t}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      ${pageNum(4, 26)}
    `)

    // ── process_timeline ──
    case 'process_timeline': return shell(`
      <div class="top-bar"></div>
      <div class="deco-circle" style="top:-8%;right:-3%;width:22%;height:45%;background:rgba(230,126,34,0.04)"></div>
      <div style="position:relative;z-index:1;padding:40px 48px">
        <h2>产品路线图</h2><div class="short-line"></div>
        <div style="position:relative;margin-top:12px">
          <div style="position:absolute;top:14px;left:0;right:0;height:2px;background:var(--b)"></div>
          <div style="display:flex;justify-content:space-between;position:relative">
            ${[{q:'Q1',y:'2025',t:'MVP 上线',d:'核心功能验证 · 种子用户入驻 · 反馈闭环',c:0},{q:'Q2',y:'2025',t:'增长引擎',d:'推荐系统上线 · 付费转化率 +15% · A/B 平台',c:1},{q:'Q3',y:'2025',t:'规模化',d:'多语言支持 · 弹性扩缩容 · SLA 99.9%',c:2},{q:'Q4',y:'2025',t:'生态构建',d:'开放 API · 合作伙伴接入 · 插件市场',c:3}].map((m,i)=>`
              <div style="text-align:center;width:140px">
                <div style="width:12px;height:12px;border-radius:50%;background:${C.cc[m.c]};margin:8px auto 10px;position:relative;z-index:1;box-shadow:0 0 0 4px rgba(0,0,0,0.04)"></div>
                <div style="font:600 11px var(--fm);color:var(--a);letter-spacing:0.08em">${m.q} ${m.y}</div>
                <div style="font:600 15px var(--fh);color:var(--p);margin:6px 0 4px">${m.t}</div>
                <div style="font-size:11px;color:var(--tm);line-height:1.5">${m.d}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      ${pageNum(11, 26)}
    `)

    // ── image_grid ──
    case 'image_grid': return shell(`
      <div class="top-bar"></div>
      <div class="deco-circle" style="top:-8%;right:-3%;width:22%;height:45%;background:rgba(230,126,34,0.04)"></div>
      <div style="position:relative;z-index:1;padding:40px 48px">
        <h2>设计作品集</h2><div class="short-line"></div>
        <div class="grid-4" style="margin-top:8px">
          ${['品牌 VI 设计','移动端 UI','数据看板','插画系统'].map((t,i)=>`
            <div style="text-align:center">
              <div style="background:${C.cb};border-radius:var(--r-md);aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;border:1px solid var(--b)">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="${C.cc[i]}" stroke-width="1" opacity="0.4"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
              </div>
              <div style="font-size:12px;color:var(--tm);margin-top:6px">${t}</div>
            </div>
          `).join('')}
        </div>
      </div>
      ${pageNum(17, 26)}
    `)

    // ── image_hero ──
    case 'image_hero': return shell(`
      <div class="top-bar"></div>
      <div style="position:relative;height:100%">
        <div style="position:absolute;inset:0;background:linear-gradient(135deg, ${C.p} 0%, ${C.s} 50%, ${C.pd} 100%);display:flex;align-items:flex-end">
          <div class="deco-circle" style="top:-20%;right:-10%;width:55%;height:80%;background:rgba(255,255,255,0.03)"></div>
          <div style="position:relative;z-index:1;width:100%;background:linear-gradient(0deg, ${C.pd}ea 0%, transparent 100%);padding:48px 56px 40px;color:#fff">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <span class="tag accent">产品展示</span>
            </div>
            <div style="font:700 36px/1.2 var(--fh)">新一代智能终端</div>
            <div style="font-size:15px;opacity:0.7;margin-top:8px;max-width:500px">极致轻薄 · 全天续航 · AI 原生系统</div>
          </div>
        </div>
      </div>
      ${pageNum(19, 26)}
    `)

    // ── closing ──
    case 'closing': return shell(`
      <div style="position:absolute;inset:0;background:${C.hero};display:flex;align-items:center;justify-content:center;color:#fff;text-align:center">
        <div class="deco-circle" style="top:-12%;right:-6%;width:45%;height:70%;background:rgba(255,255,255,0.04)"></div>
        <div class="deco-circle" style="bottom:-10%;left:-5%;width:40%;height:60%;background:rgba(255,255,255,0.03)"></div>
        <div style="z-index:1">
          <div style="font:700 44px/1.2 var(--fh);margin-bottom:16px">感谢聆听</div>
          <div style="width:48px;height:3px;background:var(--a);border-radius:2px;margin:0 auto 28px"></div>
          <div style="font-size:15px;opacity:0.6;margin-bottom:32px">期待与您深入交流合作</div>
          <div style="display:flex;gap:32px;justify-content:center;font-size:13px;opacity:0.45">
            <span>contact@company.com</span><span>www.company.com</span><span>+86 400-888-0000</span>
          </div>
          <div style="margin-top:36px;font-size:11px;opacity:0.3">&copy; 2026 Company Name. All rights reserved.</div>
        </div>
      </div>
    `)

    // ── default: generic content page ──
    default: return shell(`
      <div class="top-bar"></div>
      <div class="deco-circle" style="top:-8%;right:-3%;width:22%;height:45%;background:rgba(230,126,34,0.04)"></div>
      <div style="position:relative;z-index:1;padding:48px 56px">
        <h2>${label}</h2><div class="short-line"></div>
        <div class="flex-row">
          ${[0,1,2].map(i=>`
            <div class="card" style="flex:1">
              <div class="card-bar" style="background:${C.cc[i]}"></div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${C.cc[i]}" stroke-width="1.5" style="margin:0 0 8px 10px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <h3>要点 ${i+1}</h3><p>此处展示核心观点与支撑论据，确保信息层级清晰。</p>
            </div>
          `).join('')}
        </div>
      </div>
      ${pageNum(99, 26)}
    `)
  }
}

function encodeHtmlAttr(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function genFoundationHTML(type: string, schemeColors?: SchemeColors | null): string {
  const C = makeColors(schemeColors || null)
  const cc = C.cc
  // ── VIS slide design pattern helpers ──
  const hd = (t: string, s?: string) => `<div style="margin-bottom:24px"><h2 style="font:700 22px/1.2 'DM Sans','Inter','PingFang SC','Microsoft YaHei',sans-serif;color:var(--p);margin:0 0 6px">${t}</h2><div style="width:40px;height:3px;background:var(--a);border-radius:2px;margin-bottom:8px"></div>${s?`<p style="font-size:13px;color:var(--m);line-height:1.6;margin:0;max-width:640px">${s}</p>`:''}</div>`
  const cd = (c: string, body: string) => `<div style="background:var(--cb);border-radius:12px;padding:20px 20px 20px 24px;position:relative;overflow:hidden;border:1px solid var(--b)"><div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${c};border-radius:0 2px 2px 0"></div>${body}</div>`
  const ct = (t: string) => `<h3 style="font:600 15px/1.3 'DM Sans','Inter','PingFang SC','Microsoft YaHei',sans-serif;color:var(--p);margin:0 0 6px">${t}</h3>`
  const cb = (t: string) => `<p style="font-size:13px;color:var(--t);line-height:1.65;margin:0">${t}</p>`
  const co = (c: string, body: string) => `<div style="margin-top:16px;padding:14px 18px;background:${c}18;border-left:4px solid ${c};border-radius:0 8px 8px 0;font-size:13px;color:var(--t);line-height:1.65">${body}</div>`
  const sw = (c: string) => `<span style="display:inline-block;width:13px;height:13px;border-radius:3px;background:${c};vertical-align:middle;margin-right:6px;flex-shrink:0"></span>`
  const mono = (t: string) => `<span style="font-family:'SF Mono','Cascadia Code','Consolas',monospace;font-size:11px;color:var(--m)">${t}</span>`
  const g = (n: number, gap: number, body: string) => `<div style="display:grid;grid-template-columns:repeat(${n},1fr);gap:${gap}px">${body}</div>`
  // mini bar chart SVG for data_rules / richness
  const barIcon = (c: string, h: number) => `<svg width="28" height="20" viewBox="0 0 28 20"><rect x="1" y="${20-h}" width="5" height="${h}" rx="1" fill="${c}" opacity=".7"/><rect x="8" y="${20-h*1.3}" width="5" height="${h*1.3}" rx="1" fill="${c}" opacity=".9"/><rect x="15" y="${20-h*.6}" width="5" height="${h*.6}" rx="1" fill="${c}" opacity=".5"/><rect x="22" y="${20-h*1.1}" width="5" height="${h*1.1}" rx="1" fill="${c}"/></svg>`

  switch (type) {
    // ── I. 核心设计原则 ──
    case 'principles':
      return hd('核心设计原则','商业幻灯片的三大设计支柱，贯穿全部 26 种页面类型。') + g(3,18,[
        {t:'一致性',d:'全 Deck 统一颜色、字体、间距、装饰元素。相同的 accent 色条、标题位置、页码标记，确保品牌识别连贯。',c:cc[0],i:'grid'},
        {t:'层次感',d:'5 层结构（背景→装饰→结构→内容→标识），每层职责明确。卡片系统承载核心信息，装饰层提供视觉节奏。',c:cc[1],i:'target'},
        {t:'呼吸感',d:'充足留白、适度 16px 卡片间距、克制装饰密度 ≤3 个大圆。避免信息过载，让每页聚焦一个核心信息。',c:cc[2],i:'zap'},
      ].map(p=>cd(p.c,`
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${p.c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            ${p.i==='grid'?`<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`:
              p.i==='target'?`<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`:
              `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`}
          </svg>
          ${ct(p.t)}
        </div>
        ${cb(p.d)}
      `)).join(''))

    // ── II. 色彩系统 ──
    case 'colors':
      return hd('色彩系统','基础色 6 + 图表色 5 + 语义色 2 = 13 色令牌。全部来自 tokens.yaml color_schemes，禁止混用、禁止硬编码。')
      + `<div style="margin-bottom:28px">${ct('基础色 (6 色)')}<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:12px">${[
        {l:'Primary',c:C.p,v:'primary',w:'标题、深色背景'},
        {l:'Secondary',c:C.s,v:'secondary',w:'强调、渐变端点'},
        {l:'Accent',c:C.a,v:'accent',w:'CTA、装饰条、页码'},
        {l:'Background',c:C.bg,v:'background',w:'页面底色'},
        {l:'Card BG',c:C.cb,v:'card_bg',w:'卡片容器底色'},
        {l:'Text',c:C.tp,v:'text',w:'正文颜色'},
      ].map(x=>`<div style="text-align:center;flex:1;min-width:80px"><div style="width:56px;height:56px;border-radius:10px;background:${x.c};border:1px solid var(--b);margin:0 auto 8px;box-shadow:0 2px 6px rgba(0,0,0,0.06)"></div><div style="font:600 12px 'DM Sans',sans-serif;color:var(--p)">${x.l}</div><div style="font-size:10px;color:var(--m);font-family:'SF Mono',monospace">${x.c}</div><div style="font-size:10px;color:var(--m)">${x.v}</div></div>`).join('')}</div></div>`
      + `<div style="margin-bottom:24px">${ct('图表色 chart_colors (5 色)')}<div style="display:flex;gap:8px;border-radius:8px;overflow:hidden;margin:10px 0 6px">${cc.map((c: string)=>`<div style="flex:1;height:40px;background:${c}"></div>`).join('')}</div><div style="display:flex;gap:8px;font:10px 'SF Mono',monospace;color:var(--m)">${cc.map((c: string)=>`<span style="flex:1;text-align:center">${c}</span>`).join('')}</div></div>`
      + `<div style="margin-bottom:28px">${ct('语义色 semantic (2 色)')}<div style="display:flex;gap:14px;margin-top:12px">${[
        {l:'Positive',c:C.sem.positive,k:'semantic.positive'},
        {l:'Negative',c:C.sem.negative,k:'semantic.negative'},
      ].map(x=>`<div style="text-align:center;min-width:100px"><div style="width:56px;height:56px;border-radius:10px;background:${x.c};border:1px solid var(--b);margin:0 auto 8px;box-shadow:0 2px 6px rgba(0,0,0,0.06)"></div><div style="font:600 12px 'DM Sans',sans-serif;color:var(--p)">${x.l}</div><div style="font-size:10px;color:var(--m);font-family:'SF Mono',monospace">${x.c}</div><div style="font-size:10px;color:var(--m)">${x.k}</div></div>`).join('')}</div></div>`
      + co(cc[0],`<b style="color:${cc[0]}">语义映射：</b>primary=标题 | secondary=强调 | accent=CTA及装饰条 | text=正文 | card_bg=卡片容器 | background=页面底色 | semantic=正负面标记`)
      + co('#c62828',`<b style="color:#c62828">禁止规则：</b>chart_color 用于正文 | text 色用于标题 | 单页超过 5 种主色 | 渐变背景覆盖正文区域 | 硬编码色值`)

    // ── III. 排版层级 ──
    case 'typography':
      return hd('排版层级','三套字族 + 四级标题 + 正文/代码双规格。')
      + g(3,18,[
        // Heading font
        cd(cc[0],ct('标题字体 DM Sans')+`<div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">${[
          {s:'32px',w:'700',l:'1.2',t:'H1 页面主标题'},
          {s:'24px',w:'700',l:'1.3',t:'H2 内容区标题'},
          {s:'18px',w:'600',l:'1.35',t:'H3 卡片标题'},
          {s:'15px',w:'600',l:'1.4',t:'H4 子标题/标签'},
        ].map(h=>`<div style="border-left:3px solid ${cc[0]};padding:4px 0 4px 12px"><div style="font:${h.w} ${h.s}/${h.l} 'DM Sans','Inter',sans-serif;color:var(--p)">${h.t}</div><div style="font-size:10px;color:var(--m);font-family:'SF Mono',monospace">${h.w} ${h.s}/${h.l}</div></div>`).join('')}</div>`),
        // Body font
        cd(cc[1],ct('正文字体 Inter')+`<div style="margin-top:8px"><div style="background:#fff;border-radius:6px;padding:16px;font:400 14px/1.7 'Inter','PingFang SC','Microsoft YaHei',sans-serif;color:var(--t)">正文使用 Inter 字族，line-height: 1.6~1.8，确保中英文混排阅读舒适度与可访问性。</div><div style="font-size:10px;color:var(--m);font-family:'SF Mono',monospace;margin-top:6px">400 14px/1.7 · Inter, PingFang SC, Microsoft YaHei</div></div>`),
        // Code font
        cd(cc[2],ct('代码/数据字体 SF Mono')+`<div style="margin-top:8px"><div style="background:${C.tp};color:${C.b};border-radius:6px;padding:14px 16px;font:400 12px/1.6 'SF Mono','Cascadia Code',monospace">const tokens = { primary: '${C.p}',<br/>  accent: '${C.a}', chart: [...] }</div><div style="font-size:10px;color:var(--m);font-family:'SF Mono',monospace;margin-top:6px">11-13px · type-tag / metadata / code</div></div>`),
      ].join(''))

    // ── IV. 卡片样式 Token ──
    case 'card_styles':
      return hd('卡片样式 Token','圆角、阴影、边框、渐变 —— 构成卡片系统的原子 Token。')
      + `<div style="margin-bottom:28px">${ct('圆角 (border-radius)')}<div style="display:flex;gap:16px;margin-top:10px">${[
        {v:'6px',l:'small',w:'标签、徽章'},
        {v:'12px',l:'card',w:'卡片容器（默认）'},
        {v:'20px',l:'large',w:'大面板、Hero 区域'},
      ].map(r=>`<div style="flex:1;text-align:center"><div style="height:56px;background:var(--cb);border-radius:${r.v};border:1px solid var(--b);margin-bottom:8px"></div><span style="font:600 12px 'DM Sans',sans-serif;color:var(--p)">${r.l}</span><span style="font-size:10px;color:var(--m);display:block;font-family:'SF Mono',monospace">${r.v}</span><span style="font-size:10px;color:var(--m);display:block">${r.w}</span></div>`).join('')}</div></div>`
      + `<div style="margin-bottom:28px">${ct('阴影 (elevation)')}<div style="display:flex;gap:16px;margin-top:10px">${[
        {v:'0 2px 8px rgba(0,0,0,0.04)',l:'low',w:'卡片默认'},
        {v:'0 4px 20px rgba(0,0,0,0.12)',l:'mid',w:'iframe 预览框'},
        {v:'0 8px 32px rgba(0,0,0,0.18)',l:'high',w:'Hero、封面页'},
      ].map(r=>`<div style="flex:1;text-align:center"><div style="height:56px;background:#fff;border-radius:12px;box-shadow:${r.v};margin-bottom:8px"></div><span style="font:600 12px 'DM Sans',sans-serif;color:var(--p)">${r.l}</span><span style="font-size:9px;color:var(--m);display:block;font-family:'SF Mono',monospace;word-break:break-all">${r.v}</span></div>`).join('')}</div></div>`
      + ct('渐变预设')+`<div style="display:flex;gap:14px;margin-top:10px">${[
        {l:'hero_bg',g:'linear-gradient(135deg,var(--p) 0%,var(--s) 100%)',t:'#fff',w:'封面/总结/页脚'},
        {l:'card',g:'linear-gradient(180deg,var(--cb) 0%,#fff 100%)',t:'var(--t)',w:'卡片渐变，增加层次'},
      ].map(x=>`<div style="flex:1"><div style="height:64px;border-radius:10px;background:${x.g};display:flex;align-items:center;justify-content:center;color:${x.t};font:600 14px 'DM Sans',sans-serif;margin-bottom:6px">${x.l}</div><span style="font-size:11px;color:var(--m)">${x.w}</span></div>`).join('')}</div>`

    // ── V. 图表语言 ──
    case 'charts':
      return hd('图表语言','10 种图表类型，每种有明确的数据触发条件。')
      + g(2,16,[
        cd(cc[0],ct('折线图 line')+`<svg width="220" height="70" viewBox="0 0 220 70" style="margin:8px 0"><polyline points="10,55 50,38 90,48 130,18 170,32 210,22" fill="none" stroke="${cc[0]}" stroke-width="2.5" stroke-linecap="round"/><circle cx="130" cy="18" r="3.5" fill="${cc[0]}"/></svg>`+cb('趋势 · 时序数据 ≥4 点 · 多系列对比')),
        cd(cc[1],ct('柱状图 bar')+`<svg width="220" height="70" viewBox="0 0 220 70" style="margin:8px 0">${[35,55,25,70,48,38,60,42].map((h,i)=>`<rect x="${i*26+4}" y="${70-h}" width="18" height="${h}" rx="3" fill="${cc[i%5]}"/>`).join('')}</svg>`+cb('比较 · 排名 · 3~6 个类别对比')),
        cd(cc[2],ct('环形图 donut')+`<div style="display:flex;align-items:center;gap:16px;margin:8px 0"><svg width="80" height="80" viewBox="0 0 100 100"><circle cx="50" cy="50" r="36" fill="none" stroke="${cc[4]}" stroke-width="12" opacity="0.15"/><circle cx="50" cy="50" r="36" fill="none" stroke="${cc[0]}" stroke-width="12" stroke-dasharray="170 56" stroke-linecap="round" transform="rotate(-90 50 50)"/><text x="50" y="54" text-anchor="middle" font-size="18" font-weight="700" fill="var(--p)">67%</text></svg><div>${cb('占比 · 构成 · ≤5 个分类')}</div></div>`),
        cd(cc[3],ct('大数字 big_number')+`<div style="margin:8px 0"><div style="font:800 48px/1 'DM Sans',sans-serif;color:${cc[0]}">98.6<span style="font-size:18px;color:var(--m);font-weight:400">%</span></div><div style="height:6px;background:rgba(0,0,0,0.05);border-radius:3px;margin-top:10px"><div style="width:98.6%;height:100%;background:${cc[0]};border-radius:3px"></div></div>${cb('KPI · 单一关键指标 · 完成率')}</div>`),
      ].join(''))

    // ── VI. 装饰系统 · 5 层结构 ──
    case 'decorations':
      return hd('装饰系统 · 5 层结构','每张幻灯片由五层组成：背景→装饰→结构→内容→标识。每层独立，叠加为完整页面。')
      + `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">${[
        {n:'1',l:'背景层',d:'页面底色、渐变背景、纹理（hero_bg 渐变）',c:cc[0]},
        {n:'2',l:'装饰层',d:'光晕大圆、几何图形、网格纹理（rgba 半透明）',c:cc[1]},
        {n:'3',l:'结构层',d:'卡片容器、栅格系统、间距框架（16px gap）',c:cc[2]},
        {n:'4',l:'内容层',d:'文字、图表、插图、数据指标',c:cc[3]},
        {n:'5',l:'标识层',d:'页码 dot、顶部 accent 色条 4px、品牌标记',c:cc[4]},
      ].map(l=>`<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--cb);border-radius:8px;border-left:4px solid ${l.c}"><span style="width:24px;height:24px;border-radius:50%;background:${l.c};color:#fff;font:600 12px 'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;flex-shrink:0">${l.n}</span><span style="font:600 13px 'DM Sans',sans-serif;color:var(--p);min-width:70px">${l.l}</span><span style="font-size:12px;color:var(--m);line-height:1.5">${l.d}</span></div>`).join('')}</div>`
      + ct('3 种固定装饰元素')+g(3,14,[
        cd(cc[0],`<div style="text-align:center"><div style="width:100%;height:4px;background:${cc[0]};border-radius:2px;margin-bottom:12px"></div>${ct('Top Bar')}${cb('accent 色条 · 4px 高 · 页面顶部 · z-index:10')}</div>`),
        cd(cc[1],`<div style="text-align:center"><div style="width:40px;height:3px;background:${cc[1]};border-radius:2px;margin:0 auto 12px"></div>${ct('Short Line')}${cb('40×3px · 标题下方 · accent 色 · 视觉锚点')}</div>`),
        cd(cc[2],`<div style="text-align:center"><div style="width:28px;height:28px;border-radius:50%;background:conic-gradient(${cc[2]} 0deg,${cc[2]} 120deg,transparent 120deg);margin:0 auto 12px"></div>${ct('Page Dot')}${cb('右下角页码标记 · dot + current/total')}</div>`),
      ].join(''))

    // ── VII. 布局库 · 10 种布局 ──
    case 'layouts':
      return hd('布局库 · 10 种核心布局','根据卡片数量和内容类型选择布局，确保信息传达高效。')
      + g(5,10,[
        ['1-col','单栏'],['2-col','双栏'],['3-col','三栏'],['2+1','2/3+1/3'],['1+2','1/3+2/3'],
        ['2×2','四宫格'],['3×2','六宫格'],['1+3','1大3小'],['3+1','3小1大'],['grid','多行网格'],
      ].map((l,i)=>`<div style="background:var(--cb);border-radius:8px;padding:14px 10px;text-align:center;border:1px solid var(--b);border-top:3px solid ${cc[i%5]}"><div style="font:600 13px 'DM Sans',sans-serif;color:var(--p)">${l[0]}</div><div style="font-size:11px;color:var(--m);margin-top:4px">${l[1]}</div></div>`).join(''))
      + co(cc[1],`<b style="color:${cc[1]}">决策规则：</b>卡片数 ≤3→单行排列 | 3~6→2×N 网格 | ≥7→多行网格 | KPI→顶部大数字+下方小网格 | 对比→2-col 对称 | 流程→1-col + 下方步骤条`)

    // ── VIII. 卡片角色目录 · 11 种 Role ──
    case 'card_roles':
      return hd('卡片角色目录 · 11 种 Role','每张卡片的角色决定其内部结构。角色不同，图标尺寸、字体层级、数据密度均不同。')
      + g(4,10,[
        ['kpi','KPI 指标',cc[0]],['chart','图表容器',cc[1]],['text','文本块',cc[2]],['list','列表',cc[3]],
        ['quote','引用',cc[4]],['compare','对比框',cc[0]],['timeline','时间线',cc[1]],['metric','度量值',cc[2]],
        ['stat','统计卡',cc[3]],['highlight','高亮',cc[4]],['summary','摘要',cc[0]],
      ].map(r=>`<div style="background:var(--cb);border-radius:8px;padding:12px;text-align:center;border-left:3px solid ${r[2]}"><div style="font:600 12px 'DM Sans',sans-serif;color:var(--p)">${r[0]}</div><div style="font-size:10px;color:var(--m);margin-top:2px">${r[1]}</div></div>`).join(''))
      + co(cc[0],`<b style="color:${cc[0]}">色条轮换规则：</b>同一页面中，每张卡片的 chart_color 色条各不同，按 cc[0]→cc[1]→cc[2]→cc[3]→cc[4] 依次分配，确保视觉多样性`)

    // ── IX. 图表选择决策树 ──
    case 'chart_decision':
      return hd('图表选择决策树','数据特征决定图表类型 — 先判断数据形态，再选择对应图表。')
      + cd(cc[0],`<div style="line-height:2.2;font-size:13px;color:var(--t)">${[
        ['数据有趋势？','折线图 line','时序数据 ≥4 点'],
        ['数据需比较？','类别 ≤6→柱状图 bar | >6→水平条形图','分类对比'],
        ['数据是占比？','类别 ≤5→环形图 donut | >5→堆叠柱状图','部分与整体'],
        ['单一关键指标？','大数字 big_number + 进度条','KPI、完成率'],
        ['对比两组数据？','对比柱状图 compare','A vs B 双栏'],
        ['展示流程步骤？','时间线 timeline','按时间/顺序排列'],
        ['多维小指标？','sparkline / 迷你网格','多指标一览'],
      ].map((r,i)=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:${i%2?'var(--cb)':'#fff'};border-radius:6px"><span style="font-weight:700;color:${cc[i%5]};min-width:100px;font-size:12px">${r[0]}</span><span style="flex:1;font-weight:600;color:var(--p)">${r[1]}</span><span style="font-size:11px;color:var(--m);min-width:100px;text-align:right">${r[2]}</span></div>`).join('')}</div>`)

    // ── X. 数据转化规则 ──
    case 'data_rules':
      return hd('数据转化规则 · 强制映射','后端数据特征 → 前端图表选择的强制对应关系，确保数据呈现的一致性。')
      + `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;line-height:2">
        <thead><tr style="background:var(--p);color:#fff">
          <th style="padding:10px 16px;text-align:left;font:600 11px 'SF Mono',monospace;letter-spacing:.05em;text-transform:uppercase">数据特征</th>
          <th style="padding:10px 16px;text-align:left;font:600 11px 'SF Mono',monospace;letter-spacing:.05em;text-transform:uppercase">强制图表</th>
          <th style="padding:10px 16px;text-align:left;font:600 11px 'SF Mono',monospace;letter-spacing:.05em;text-transform:uppercase">示例场景</th>
        </tr></thead>
        <tbody>${[
          ['≥4 个时序点','折线图 line','月度活跃用户 1-12 月'],
          ['3-6 个类别比较','柱状图 bar','各产品线 Q2 营收'],
          ['2-5 个部分占比','环形图 donut','流量来源分布'],
          ['单一关键指标','大数字 big_number','系统可用性 SLA'],
          ['>6 条分类数据','水平条形图','各省份覆盖率排名'],
          ['两两对比','对比柱 compare','自研 vs 外采 TCO'],
          ['≤3 个时序点','数值列表 + 趋势','Q1-Q3 里程碑节点'],
        ].map((r,i)=>`<tr style="border-bottom:1px solid var(--b);background:${i%2?'#fff':'var(--cb)'}"><td style="padding:10px 16px;font-weight:500;color:var(--t)">${sw(cc[i%5])}${r[0]}</td><td style="padding:10px 16px;color:${cc[0]};font-weight:600">${r[1]}</td><td style="padding:10px 16px;color:var(--m);font-size:12px">${r[2]}</td></tr>`).join('')}</tbody>
      </table></div>`

    // ── XI. 视觉丰富度硬指标 ──
    case 'richness':
      return hd('视觉丰富度硬指标','每页生成后逐项验证的 7 项硬性指标，任意一项未达标则重新生成。')
      + g(2,12,[
        ['≥3 个 SVG 元素','每页至少 3 个独立 SVG（图标/图表/装饰），确保非纯文本',cc[0],'chart'],
        ['≥4 种 chart_color','同一页面出现 ≥4 种不同 chart_color，丰富视觉层次',cc[1],'grid'],
        ['≥1 个半透明装饰','至少 1 个 rgba 半透明几何装饰图形（deco-circle）',cc[2],'target'],
        ['卡片含 SVG 图标','每张卡片必须有 SVG 图标（card-icon 20px）+ 标题 + 正文',cc[3],'star'],
        ['数字处有图表','有数据指标的地方必须有图表形态呈现（非纯数字）',cc[4],'zap'],
        ['accent 色条','顶部 accent 色条 4px（封面/总结除外），品牌识别锚点',cc[0],'shield'],
        ['插图标签对齐','text-anchor="middle"，标签与图形间距 ≥22px，字号 ≥14px',cc[1],'check'],
      ].map((r,i)=>cd(r[2] as string,`
        <div style="display:flex;align-items:flex-start;gap:10px">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${r[2]}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-top:2px;flex-shrink:0">
            ${r[3]==='chart'?`<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>`:
              r[3]==='grid'?`<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>`:
              r[3]==='target'?`<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`:
              r[3]==='star'?`<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`:
              r[3]==='zap'?`<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`:
              r[3]==='shield'?`<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`:
              `<polyline points="20 6 9 17 4 12"/>`}
          </svg>
          <div>
            <div style="font:600 14px 'DM Sans',sans-serif;color:var(--p);margin-bottom:4px">${r[0]}</div>
            <div style="font-size:12px;color:var(--m);line-height:1.5">${r[1]}</div>
          </div>
        </div>
      `)).join(''))

    // ── XII. 跨页一致性 ──
    case 'consistency':
      return hd('跨页一致性','全 Deck 统一元素 + 封面/总结书挡效应 + 页脚呼应 = 完整的视觉闭环。')
      + ct('所有内容页固定元素')+g(2,10,[
        '顶部 accent 色条（4px，同色同高同位置）','标题位置（同 left / 同 top）',
        '标题下方 accent 短线（40×3px）','页码标记（右下角 dot + current/total）',
        '字体族（全 Deck 统一 DM Sans + Inter）','卡片间距（同 gap 值 16px）',
        '卡片圆角（同 border-radius 12px）','阴影（同 elevation token 层级）',
      ].map((s,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--cb);border-radius:6px;font-size:12px;color:var(--t);border-left:3px solid ${cc[i%5]}">${sw(cc[i%5])}${s}</div>`).join(''))
      + `<div style="margin-top:24px">${ct('封面 / 总结 书挡效应')}</div>`+g(2,14,[
        `<div style="background:linear-gradient(135deg,var(--p) 0%,var(--s) 100%);color:#fff;border-radius:10px;padding:24px;text-align:center"><div style="font:700 14px 'DM Sans',sans-serif;margin-bottom:8px">封面 Hero</div><div style="font-size:11px;opacity:0.55;margin-bottom:12px">深蓝渐变 · 白色文字 · 大面积装饰</div><div style="height:4px;background:var(--a);border-radius:2px"></div></div>`,
        `<div style="background:linear-gradient(135deg,var(--p) 0%,var(--s) 100%);color:#fff;border-radius:10px;padding:24px;text-align:center"><div style="height:4px;background:var(--a);border-radius:2px;margin-bottom:12px"></div><div style="font:700 14px 'DM Sans',sans-serif;margin-bottom:8px">总结 Closing</div><div style="font-size:11px;opacity:0.55">同色系深色背景 · 镜像装饰 · 视觉闭环</div></div>`,
      ].join(''))

    // ── XIII. 图标规范 ──
    case 'icons':
      return hd('图标规范','12 个 SVG 图标，统一 outline 描线风格，1.5px 描边，圆角端点。颜色跟随所在卡片 chart_color。')
      + g(6,10,[
        ['clock','时间/进度'],['user','用户/团队'],['chart','数据/分析'],['shield','安全/防护'],
        ['star','评分/亮点'],['check','确认/完成'],['target','目标/指标'],['zap','性能/加速'],
        ['book','知识/文档'],['grid','网格/模块'],['compare','对比/权衡'],['flag','里程碑/标记'],
      ].map(icon=>`<div style="text-align:center;background:var(--cb);border-radius:8px;padding:14px 8px;border:1px solid var(--b)">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${cc[0]}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.8">
          ${icon[0]==='clock'?`<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`:
            icon[0]==='user'?`<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`:
            icon[0]==='chart'?`<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`:
            icon[0]==='shield'?`<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`:
            icon[0]==='star'?`<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`:
            icon[0]==='check'?`<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`:
            icon[0]==='target'?`<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`:
            icon[0]==='zap'?`<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`:
            icon[0]==='book'?`<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>`:
            icon[0]==='grid'?`<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`:
            icon[0]==='compare'?`<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`:
            icon[0]==='flag'?`<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>`:
            `<circle cx="12" cy="12" r="10"/>`}
        </svg>
        <div style="font:600 10px 'DM Sans',sans-serif;color:var(--p);margin-top:8px">${icon[0]}</div><div style="font-size:9px;color:var(--m)">${icon[1]}</div>
      </div>`).join(''))
      + `<div style="margin-top:20px;display:flex;gap:20px;font-size:12px;color:var(--t);padding:12px 18px;background:var(--cb);border-radius:8px">${['<b style="color:var(--p)">风格：</b>outline 描线','<b style="color:var(--p)">描边：</b>1.5px','<b style="color:var(--p)">card：</b>20px','<b style="color:var(--p)">hero：</b>36px','<b style="color:var(--p)">metric：</b>16px'].join('<span style="color:var(--b)"> | </span>')}</div>`

    // ── XIV. 配图规范 ──
    case 'images':
      return hd('配图规范','何时需要配图、插图 SVG 的排版要求 —— 避免留白过多或图文不匹配。')
      + ct('配图时机')+g(2,12,[
        ['封面/总结页','必须：大面积装饰（光晕大圆 + 几何图形）'],
        ['留白 > 80px','添加主题相关插图填充空白区域'],
        ['右侧留白 > 200px','用插图 / 图表填补右侧空间'],
        ['抽象概念 / 流程','用 SVG 矢量插图辅助说明'],
      ].map((r,i)=>cd(cc[i],`<div style="font-size:12px"><span style="font-weight:600;color:var(--p)">${r[0]}</span><span style="color:var(--m);margin-left:8px">${r[1]}</span></div>`)).join(''))
      + `<div style="margin-top:24px">${ct('插图 SVG 排版规范')}</div>`+g(2,10,[
        '标签对齐：text-anchor="middle"','图元与标签间距：≥ 22px',
        '辅助线到标签：≥ 20px','可见描边：≥ 1px',
        '插图内字号：≥ 14px','元素分布：均匀对称，视觉平衡',
      ].map((s,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--cb);border-radius:6px;font-size:12px;color:var(--t);border-left:3px solid ${cc[i%5]}">${sw(cc[i%5])}${s}</div>`).join(''))

    // ── XV. 质量自检清单 · 22 项 ──
    case 'checklist':
      return hd('质量自检清单','22 项逐条验证。生成每页 HTML 后逐项确认。任一项未满足 → 重新生成该页。')
      + g(2,6,[
        '1. 5 层结构完整（背景→装饰→结构→内容→标识）','2. ≥3 个 SVG 元素',
        '3. ≥4 种不同 chart_color 出现在页面','4. ≥1 个半透明几何装饰图形（rgba）',
        '5. 每张卡片有：SVG 图标 + 标题 + 正文','6. 有数字的地方有图表形态',
        '7. 顶部有 accent 色条（4px）','8. 标题下方有 accent 短线（40×3px）',
        `9. 右下角有页码（dot + current/total）`,`10. 标题使用 primary 色（${C.p}）`,
        `11. 正文使用 text 色（${C.tp}）`,`12. 卡片背景使用 card_bg 色（${C.cb}）`,
        `13. 页面背景使用 background 色（${C.bg}）`,`14. 字体来自 typography token（DM Sans + Inter）`,
        '15. 圆角来自 card_style token（12px）','16. 阴影来自 elevation token',
        '17. 插图标签与图形居中对齐（text-anchor="middle"）','18. 插图标签与图形间距 ≥ 22px',
        '19. 插图内字号 ≥ 14px','20. 可见 SVG 描边 ≥ 1px',
        '21. 封面 / 总结禁止卡片容器包裹内容','22. 色条轮换：每张卡片不同 chart_color',
      ].map((s,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--cb);border-radius:6px;font-size:12px;color:var(--t);line-height:1.6"><span style="color:${cc[i%5]};font-weight:700;font-size:11px;flex-shrink:0;font-family:'SF Mono',monospace">${i<9?'0':''}${i+1}</span>${s}</div>`).join(''))

    default: return ''
  }
}

function genFullManual(styleName: string, schemeColors?: SchemeColors | null): string {
  const C = makeColors(schemeColors || null)
  const items = PAGE_TYPE_ORDER.map(t => {
    const label = VI_LABELS[t] || t
    const preview = genSlidePreview(t, styleName, schemeColors)
    return { type: t, label, html: encodeHtmlAttr(preview) }
  })
  const FDN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV']
  const fdItems = FOUNDATION_ORDER.map((t, i) => {
    const label = VI_LABELS[t] || t
    return { type: t, label, html: genFoundationHTML(t, schemeColors), isFd: true as const, roman: FDN[i] }
  })
  const allItems = [...fdItems, ...items.map(it=>({...it,isFd:false as const}))]

  return `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VIS 视觉识别手册 · ${styleName}</title>
<style>
:root{--p:${C.p};--s:${C.s};--a:${C.a};--bg:${C.bg};--cb:${C.cb};--t:${C.tp};--m:${C.tm};--b:${C.b}}
*{margin:0;padding:0;box-sizing:border-box}
body{font:15px/1.7 Inter,'PingFang SC','Microsoft YaHei',sans-serif;color:var(--t);background:#f7fafc}
.hero{background:linear-gradient(135deg,var(--p) 0%,var(--s) 100%);color:#fff;padding:56px 40px 48px;text-align:center;border-bottom:8px solid var(--a)}
.hero h1{font:700 2.6rem/1.2 'DM Sans','Inter','PingFang SC',sans-serif;letter-spacing:-0.3px}
.hero p{font-size:1rem;opacity:0.7;margin-top:12px;max-width:500px;margin-left:auto;margin-right:auto}
.container{max-width:1100px;margin:0 auto;padding:40px 24px 80px}
.toc{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:40px}
.toc a{display:block;padding:10px 12px;background:#fff;border-radius:8px;text-align:center;font-size:13px;font-weight:600;color:var(--p);text-decoration:none;border:1px solid var(--b);transition:all .2s}
.toc a:hover{background:var(--p);color:#fff;border-color:var(--p)}
.section{margin-bottom:32px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid var(--b);box-shadow:0 2px 8px rgba(0,0,0,0.04)}
.section-header{padding:16px 24px;border-bottom:1px solid var(--b);display:flex;align-items:center;gap:12px;background:#fafbfc}
.section-header .num{width:32px;height:32px;border-radius:50%;background:var(--p);color:#fff;font:600 14px 'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.section-header h2{font:600 18px 'DM Sans','Inter',sans-serif;color:var(--p);margin:0}
.section-header .type-tag{font:11px 'SF Mono',monospace;color:var(--m);margin-left:auto}
.preview-wrap{display:flex;align-items:center;justify-content:center;padding:24px;background:#f0f2f5}
.preview-wrap iframe{width:960px;height:540px;border:none;box-shadow:0 4px 20px rgba(0,0,0,0.12);border-radius:4px}
.footer{margin-top:48px;background:linear-gradient(135deg,var(--p) 0%,var(--s) 100%);color:#fff;padding:32px 40px;text-align:center;border-top:5px solid var(--a);border-radius:0 0 12px 12px}
.footer p{font-size:13px;opacity:0.5;margin-top:8px}
@media(max-width:1000px){.toc{grid-template-columns:repeat(3,1fr)}.preview-wrap iframe{width:100%;height:auto;aspect-ratio:16/9}}
</style></head><body>
<header class="hero">
  <h1>幻灯片视觉识别系统</h1>
  <p>${styleName} · Business Professional · 26 种页面类型 + 15 设计基础章节</p>
  <button onclick="downloadVI()" style="margin-top:16px;padding:8px 20px;background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.25);border-radius:6px;font:600 13px 'Inter','PingFang SC',sans-serif;cursor:pointer;transition:all .2s" onmouseover="this.style.background='rgba(255,255,255,0.22)'" onmouseout="this.style.background='rgba(255,255,255,0.12)'">下载 HTML</button>
</header>
<div class="container">
<div class="toc">${allItems.map((it,i)=>`<a href="#${it.type}">${it.isFd ? it.roman : i - 15 + 1}. ${it.label}</a>`).join('')}</div>
${allItems.map((it,i)=>`
<div class="section" id="${it.type}">
  <div class="section-header">
    <span class="num"${it.isFd ? ' style="width:auto;padding:0 8px;border-radius:16px;font-size:12px;letter-spacing:0.5px"' : ''}>${it.isFd ? it.roman : i - 15 + 1}</span>
    <h2>${it.label}</h2>
    <span class="type-tag">${it.isFd ? 'design_foundation' : 'page_type: ' + it.type}</span>
  </div>
  ${it.isFd ? '<div style="padding:32px 40px;background:#fff">'+it.html+'</div>' : '<div class="preview-wrap"><iframe srcdoc="'+it.html+'"></iframe></div>'}
</div>
`).join('')}
<div class="footer">
  <div style="font:700 20px 'DM Sans',sans-serif">VIS 视觉识别手册</div>
  <p>${styleName} · 26 种页面类型 + 15 设计基础章节 · &copy; 2026</p>
</div>
</div>
<script>function downloadVI(){var h='<!DOCTYPE html>\\n'+document.documentElement.outerHTML;var b=new Blob([h],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='VIS_Style_Manual.html';a.click();URL.revokeObjectURL(u)}</script></body></html>`
}

// ---------- component ----------

function TemplateManager() {
  const STYLE_GROUPS = ['professional', 'creative', 'tech', 'thematic'] as const
  const GROUP_META: Record<string, { label: string; desc: string; apiGroup: string }> = {
    professional: { label: '商务专业', desc: '干净、权威、可信赖', apiGroup: 'Professional' },
    creative: { label: '创意大胆', desc: '活力、鲜艳、表现力强', apiGroup: 'Creative' },
    tech: { label: '科技暗色', desc: '前卫、精确、未来感', apiGroup: 'Tech / Dark' },
    thematic: { label: '主题风格', desc: '教育、奇幻、经典复古', apiGroup: 'Thematic' },
  }

  const [styles, setStyles] = useState<StyleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeGroup, setActiveGroup] = useState<string>('professional')
  const [expandedStyle, setExpandedStyle] = useState<string | null>(null)
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({})

  // Editor modal state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'vi' | 'prompt'>('vi')
  const [editorStyleId, setEditorStyleId] = useState('')
  const [editorStyleName, setEditorStyleName] = useState('')
  const [editorTabs, setEditorTabs] = useState<Record<string, string>>({})
  const [editorActiveSection, setEditorActiveSection] = useState<string>('vi')
  const [editorSaving, setEditorSaving] = useState(false)
  const [editorLoading, setEditorLoading] = useState(false)
  const [editorMsg, setEditorMsg] = useState('')

  // Color scheme management state
  const [schemeData, setSchemeData] = useState<Record<string, any>>({})
  const [editingSchemeId, setEditingSchemeId] = useState<string | null>(null)
  const [schemesLoading, setSchemesLoading] = useState(false)
  const [schemesSaving, setSchemesSaving] = useState(false)
  const [showNewSchemeInput, setShowNewSchemeInput] = useState(false)
  const [newSchemeName, setNewSchemeName] = useState('')
  const [schemeStyleId, setSchemeStyleId] = useState('')
  const [activeSchemeId, setActiveSchemeId] = useState('')
  const [previewSchemeId, setPreviewSchemeId] = useState('')
  const modal = useModal()

  // ── Parse tokens.yaml → { schemes, activeId } ──
  function parseTokensYaml(yamlText: string): { schemes: Record<string, any>; activeId: string } {
    const schemes: Record<string, any> = {}
    const activeMatch = yamlText.match(/^color_scheme:\s*(\S+)/m)
    const activeId = activeMatch ? activeMatch[1] : ''
    let inSchemes = false
    let currentScheme = ''
    let currentMap: Record<string, any> = {}
    let inChartColors = false
    let chartColorsList: string[] = []
    let inSemantic = false
    let semanticMap: Record<string, string> = {}
    for (const line of yamlText.split('\n')) {
      if (/^color_schemes:/.test(line)) { inSchemes = true; continue }
      if (inSchemes && /^[a-z_]+:/.test(line) && !line.startsWith('  ')) { inSchemes = false; continue }
      if (!inSchemes) continue
      const indent2 = /^  [a-z]/.test(line)
      const indent4 = /^    [a-z]/.test(line)
      const indent6 = /^      [a-z-]/.test(line)
      if (indent2) {
        if (currentScheme) {
          schemes[currentScheme] = { ...currentMap }
          if (chartColorsList.length) schemes[currentScheme].chart_colors = [...chartColorsList]
          if (Object.keys(semanticMap).length) schemes[currentScheme].semantic = { ...semanticMap }
        }
        currentScheme = line.replace(/:/, '').trim()
        currentMap = {}
        chartColorsList = []
        semanticMap = {}
        inChartColors = false
        inSemantic = false
      } else if (indent4 && currentScheme) {
        const m = line.match(/^\s+(\w+):\s*"([^"]*)"/)
        if (m) {
          currentMap[m[1]] = m[2]
        } else if (/^\s+chart_colors:/.test(line)) {
          inChartColors = true
          inSemantic = false
        } else if (/^\s+semantic:/.test(line)) {
          inSemantic = true
          inChartColors = false
        }
      } else if (indent6 && inChartColors && currentScheme) {
        const m = line.match(/"([^"]*)"/)
        if (m) chartColorsList.push(m[1])
      } else if (indent6 && inSemantic && currentScheme) {
        const m = line.match(/^\s+(\w+):\s*"([^"]*)"/)
        if (m) semanticMap[m[1]] = m[2]
      } else if (indent4 && /^\s+label:/.test(line) && currentScheme) {
        const m = line.match(/"([^"]*)"/)
        if (m) currentMap['label'] = m[1]
      } else if (indent4 && /^\s+persona_hint:/.test(line) && currentScheme) {
        const m = line.match(/"([^"]*)"/)
        if (m) currentMap['persona_hint'] = m[1]
      }
    }
    if (currentScheme) {
      schemes[currentScheme] = { ...currentMap }
      if (chartColorsList.length) schemes[currentScheme].chart_colors = [...chartColorsList]
      if (Object.keys(semanticMap).length) schemes[currentScheme].semantic = { ...semanticMap }
    }
    return { schemes, activeId }
  }

  const loadSchemes = useCallback(async (styleId: string) => {
    setSchemesLoading(true)
    setSchemeStyleId(styleId)
    try {
      const result: any = await api.getStyleVISection(styleId, 'tokens')
      if (result?.content) {
        const { schemes, activeId } = parseTokensYaml(result.content)
        setActiveSchemeId(activeId)
        setPreviewSchemeId(activeId)
        setSchemeData(schemes)
      }
    } catch (e) {
      console.error('Failed to load color schemes:', e)
    } finally {
      setSchemesLoading(false)
    }
  }, [])

  const saveSchemes = useCallback(async () => {
    if (!schemeStyleId || Object.keys(schemeData).length === 0) return
    const ok = await modal.confirm('确认保存色系修改？')
    if (!ok) return
    setSchemesSaving(true)
    try {
      const result: any = await api.getStyleVISection(schemeStyleId, 'tokens')
      if (result?.content) {
        let yamlText = result.content
        // Replace color_scheme field + color_schemes block in YAML
        const lines = yamlText.split('\n')
        const newLines: string[] = []
        let inSchemes = false
        let replacedSchemes = false
        let replacedScheme = false
        for (const line of lines) {
          // Update active scheme field
          if (/^color_scheme:/.test(line) && !replacedScheme) {
            replacedScheme = true
            newLines.push(`color_scheme: ${activeSchemeId || Object.keys(schemeData)[0]}`)
            continue
          }
          // Replace color_schemes block
          if (/^color_schemes:/.test(line) && !replacedSchemes) {
            inSchemes = true
            replacedSchemes = true
            newLines.push('color_schemes:')
            for (const [sid, scheme] of Object.entries(schemeData)) {
              newLines.push(`  ${sid}:`)
              if (scheme.label) newLines.push(`    label: "${scheme.label}"`)
              for (const key of ['primary', 'secondary', 'accent', 'background', 'text', 'card_bg']) {
                if (scheme[key]) newLines.push(`    ${key}: "${scheme[key]}"`)
              }
              if (scheme.chart_colors?.length) {
                newLines.push('    chart_colors:')
                for (const c of scheme.chart_colors) {
                  newLines.push(`      - "${c}"`)
                }
              }
              if (scheme.semantic) {
                newLines.push('    semantic:')
                for (const [sk, sv] of Object.entries(scheme.semantic)) {
                  newLines.push(`      ${sk}: "${sv}"`)
                }
              }
              if (scheme.persona_hint) {
                newLines.push(`    persona_hint: "${scheme.persona_hint}"`)
              }
            }
            continue
          }
          if (inSchemes) {
            if (/^[a-z_]+:/.test(line) && !line.startsWith('  ')) {
              inSchemes = false
              newLines.push(line)
            }
            continue
          }
          newLines.push(line)
        }
        if (!replacedScheme) {
          // Insert color_scheme field before color_schemes
          const csIdx = newLines.findIndex(l => /^color_schemes:/.test(l))
          if (csIdx > 0) newLines.splice(csIdx, 0, '', `color_scheme: ${activeSchemeId || Object.keys(schemeData)[0]}`)
          else newLines.splice(2, 0, `color_scheme: ${activeSchemeId || Object.keys(schemeData)[0]}`, '')
        }
        if (!replacedSchemes) {
          // Append color_schemes block before the first top-level key after the header
          const insertIdx = newLines.findIndex((l, i) => i > 1 && /^[a-z_]+:/.test(l) && !l.startsWith('#') && !/^color_scheme:/.test(l))
          if (insertIdx > 0) {
            newLines.splice(insertIdx, 0, 'color_schemes:')
          }
        }
        const newYaml = newLines.join('\n')
        await api.saveStyleVISection(schemeStyleId, 'tokens', newYaml)
        modal.toast('色系已保存', 'success')
      }
    } catch (e: any) {
      modal.toast('保存失败: ' + (e?.message || e), 'error')
    } finally {
      setSchemesSaving(false)
    }
  }, [schemeData, schemeStyleId, activeSchemeId, modal])

  const handleSchemeColorChange = (schemeId: string, key: string, value: string) => {
    setSchemeData(prev => {
      const scheme = { ...prev[schemeId] }
      if (key.startsWith('chart_')) {
        const idx = parseInt(key.split('_')[1])
        const arr = [...(scheme.chart_colors || [])]
        arr[idx] = value
        scheme.chart_colors = arr
      } else if (key.startsWith('semantic_')) {
        const semKey = key.replace('semantic_', '')
        scheme.semantic = { ...(scheme.semantic || {}), [semKey]: value }
      } else {
        scheme[key] = value
      }
      return { ...prev, [schemeId]: scheme }
    })
  }

  const handleAddScheme = () => {
    const name = newSchemeName.trim()
    if (!name) return
    const baseScheme = editingSchemeId ? schemeData[editingSchemeId] : Object.values(schemeData)[0]
    const defBase = { primary: '#1a365d', secondary: '#2d5f8a', accent: '#e67e22', background: '#ffffff', text: '#1a202c', card_bg: '#f0f4f8', chart_colors: ['#c8752e','#2d5f8a','#3b6b9e','#d4956a','#2980b9'], semantic: { positive: '#27ae60', negative: '#c0392b' } }
    setSchemeData(prev => ({
      ...prev,
      [name]: { ...defBase, ...(baseScheme || {}), label: name }
    }))
    setNewSchemeName('')
    setShowNewSchemeInput(false)
    setEditingSchemeId(name)
  }

  const handleDeleteScheme = async (schemeId: string) => {
    if (Object.keys(schemeData).length <= 1) return
    const ok = await modal.confirm('确认删除该色系？')
    if (!ok) return
    setSchemeData(prev => {
      const next = { ...prev }
      delete next[schemeId]
      return next
    })
    if (editingSchemeId === schemeId) setEditingSchemeId(null)
  }

  // Auto-load schemes when a style card expands
  useEffect(() => {
    if (expandedStyle) {
      loadSchemes(expandedStyle)
    } else {
      setSchemeData({})
      setEditingSchemeId(null)
      setActiveSchemeId('')
      setPreviewSchemeId('')
    }
  }, [expandedStyle, loadSchemes])

  const loadStyles = useCallback(async () => {
    setLoading(true)
    try {
      const [s, templates] = await Promise.all([
        api.listStyles() || [],
        api.listTemplates('style') || [],
      ])
      setStyles(s)
      const map: Record<string, boolean> = {}
      for (const t of templates) {
        map[t.id] = t.enabled === 1
      }
      setEnabledMap(map)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { loadStyles() }, [loadStyles])

  const handleToggleEnabled = async (styleId: string) => {
    const templateId = `style-${styleId}`
    const isEnabled = enabledMap[templateId]
    try {
      const res = await api.toggleTemplateEnabled(templateId)
      if (res?.ok) {
        setEnabledMap(prev => ({ ...prev, [templateId]: res.enabled }))
      }
    } catch (e: any) {
      alert(`切换失败: ${e}`)
    }
  }

  const openEditor = async (styleId: string, styleName: string, mode: 'vi' | 'prompt') => {
    setEditorOpen(true)
    setEditorMode(mode)
    setEditorStyleId(styleId)
    setEditorStyleName(styleName)
    setEditorTabs({})
    setEditorMsg('')
    setEditorLoading(true)
    try {
      if (mode === 'vi') {
        // Dynamically load all VI sub-files from directory
        const tabs: Record<string, string> = {}
        try {
          const fileList = await api.listStyleVIFiles(styleId)
          const sections = (fileList.files || []).map((f: {section: string}) => f.section)
          for (const s of sections) {
            try {
              const res = await api.getStyleVISection(styleId, s)
              tabs[s] = res.content || ''
            } catch {
              tabs[s] = ''
            }
          }
        } catch {
          // Fallback: load known files individually
          const fallbackSections = ['vi', 'cover', 'toc', 'content', 'data', 'summary', 'prompt', 'tokens']
          for (const s of fallbackSections) {
            try {
              const res = await api.getStyleVISection(styleId, s)
              tabs[s] = res.content || ''
            } catch {
              tabs[s] = ''
            }
          }
        }
        setEditorTabs(tabs)
        setEditorActiveSection('vi')
        // Auto-load color schemes for preview
        loadSchemes(styleId).then(() => {
          // previewSchemeId will be set by loadSchemes via activeSchemeId
        })
      } else {
        // Legacy prompt mode — single tab
        const res = await api.getStylePrompt(styleId)
        setEditorTabs({ prompt: res.content || '' })
        setEditorActiveSection('prompt')
      }
    } catch {
      setEditorMsg('加载失败')
    } finally {
      setEditorLoading(false)
    }
  }

  const saveEditor = async () => {
    setEditorSaving(true)
    setEditorMsg('')
    try {
      const sections = Object.keys(editorTabs).sort((a,b) => pageTypeSortKey(a) - pageTypeSortKey(b))
      for (const s of sections) {
        const content = editorTabs[s]
        if (s === 'prompt') {
          await api.saveStylePrompt(editorStyleId, content)
        } else {
          await api.saveStyleVISection(editorStyleId, s, content)
        }
      }
      setEditorMsg('已保存')
    } catch {
      setEditorMsg('保存失败')
    } finally {
      setEditorSaving(false)
    }
  }

  const copyContent = async () => {
    // Copy ALL tabs combined with section headers as comments
    const sections = Object.keys(editorTabs).sort((a,b) => pageTypeSortKey(a) - pageTypeSortKey(b))
    const parts = sections.map(s => {
      const label = VI_LABELS[s] || s
      return `<!-- ====== ${label} (${s}) ====== -->\n\n${editorTabs[s] || ''}`
    })
    const combined = parts.join('\n\n')
    try {
      await navigator.clipboard.writeText(combined)
      setEditorMsg(`已复制 ${sections.length} 个分区`)
    } catch {
      setEditorMsg('复制失败')
    }
  }

  const downloadContent = () => {
    // Download ALL tabs combined as one TXT
    const sections = Object.keys(editorTabs).sort((a,b) => pageTypeSortKey(a) - pageTypeSortKey(b))
    const parts = sections.map(s => {
      const label = VI_LABELS[s] || s
      return `# ${label} (${s})\n\n${editorTabs[s] || ''}`
    })
    const combined = parts.join('\n\n' + '='.repeat(60) + '\n\n')
    const ext = editorMode === 'vi' ? 'txt' : 'md'
    const blob = new Blob([combined], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${editorStyleId}_${editorMode === 'vi' ? 'vi_full' : 'prompt'}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const runPreview = () => {
    const section = editorActiveSection
    const raw = editorTabs[section] || ''
    const isMeta = section === 'vi' || section === 'prompt' || section === 'tokens'
    const isFoundation = FOUNDATION_ORDER.indexOf(section) >= 0
    const scheme = previewSchemeId ? schemeData[previewSchemeId] : null
    const C = makeColors(scheme)
    let html: string
    if (isMeta) {
      // meta tabs: render content as HTML (or convert md)
      const isHtml = /<html|<body|<div|<table|<svg|<!DOCTYPE/i.test(raw.trim().slice(0, 200))
      html = isHtml ? resolveColorVarsInText(raw, scheme, C.p) : mdToHtml(raw, `${editorStyleName} · ${section}`, scheme)
    } else if (isFoundation) {
      // foundation tabs: render genFoundationHTML wrapped in a full document
      const label = VI_LABELS[section] || section
      const body = genFoundationHTML(section, scheme)
      html = `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${label} · ${editorStyleName}</title><style>
:root{--p:${C.p};--s:${C.s};--a:${C.a};--bg:${C.bg};--cb:${C.cb};--t:${C.tp};--m:${C.tm};--b:${C.b}}
*{margin:0;padding:0;box-sizing:border-box}
body{font:15px/1.7 Inter,'PingFang SC','Microsoft YaHei',sans-serif;color:var(--t);background:#f7fafc;padding:32px 40px;max-width:960px;margin:0 auto}
.foundation-wrap{background:#fff;border-radius:12px;padding:32px 36px;box-shadow:0 2px 8px rgba(0,0,0,0.04);border:1px solid var(--b)}
.foundation-wrap h4{margin-top:0}
</style></head><body><div class="foundation-wrap">${body}</div></body></html>`
    } else {
      // type tabs: generate visual slide preview
      html = genSlidePreview(section, editorStyleName, scheme)
    }
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    window.open(URL.createObjectURL(blob), '_blank')
  }

  const updateTab = (section: string, value: string) => {
    setEditorTabs(prev => ({ ...prev, [section]: value }))
  }

  // ---------- render ----------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* Tab bar — mgmt-tabs style */}
      <div className="mgmt-tabs" style={{ padding: '0 0 0 0' }}>
        {STYLE_GROUPS.map(g => {
          const meta = GROUP_META[g]
          const count = styles.filter(s => s.group === meta.apiGroup).length
          return (
            <button key={g}
              className={`mgmt-tab${activeGroup === g ? ' active' : ''}`}
              onClick={() => { setActiveGroup(g); setExpandedStyle(null) }}
            >
              {meta.label} <span style={{ fontSize: 9, opacity: 0.6 }}>({loading ? '-' : count})</span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="mgmt-content" style={{ flex: 1 }}>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>
            加载中...
          </p>
        ) : (
          (() => {
            const meta = GROUP_META[activeGroup]
            const groupStyles = styles.filter(s => s.group === meta.apiGroup)
            return (
              <>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 12px 2px' }}>
                  {meta.desc} · {groupStyles.length} 套风格
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                  {groupStyles.map(style => {
                    const p = style.colors
                    const isExpanded = expandedStyle === style.id
                    return (
                      <div key={style.id}
                        className="card"
                        style={{
                          padding: 0, overflow: 'hidden',
                          borderColor: isExpanded ? p.accent : undefined,
                        }}
                      >
                        <div style={{
                          height: 8,
                          background: `linear-gradient(90deg, ${p.primary}, ${p.accent} 50%, ${p.primary})`,
                        }} />
                        <div style={{ padding: 12 }}>
                          <h4 style={{ fontSize: 12, fontWeight: 600, margin: 0, color: 'var(--text)', cursor: 'pointer' }}
                            onClick={() => setExpandedStyle(isExpanded ? null : style.id)}>
                            {style.name}
                          </h4>
                          <p style={{ fontSize: 10, color: 'var(--text-secondary)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                            {style.mood}
                          </p>
                          <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
                            {[p.primary, p.accent, p.background, p.text].filter(Boolean).map((c, i) => (
                              <div key={i} style={{
                                width: 16, height: 16, borderRadius: 3,
                                background: c,
                                border: c?.toLowerCase() === '#ffffff' || c?.toLowerCase() === '#fafaf8'
                                  ? '1px solid #ddd' : '1px solid transparent',
                              }} title={['主色', '强调', '背景', '文字'][i]} />
                            ))}
                          </div>

                          {/* Action buttons */}
                          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                            <button
                              className="btn btn-xs"
                              style={{ flex: 1, fontSize: 10, padding: '4px 0' }}
                              onClick={(e) => { e.stopPropagation(); openEditor(style.id, style.name, 'vi') }}
                            >编辑VI</button>
                            <button
                              className="btn btn-xs"
                              style={{ flex: 1, fontSize: 10, padding: '4px 0', opacity: 0.8 }}
                              onClick={async (e) => {
                                e.stopPropagation()
                                // Fetch tokens and parse schemes directly (not via state)
                                const result: any = await api.getStyleVISection(style.id, 'tokens')
                                let activeScheme: Record<string, any> | null = null
                                if (result?.content) {
                                  const parsed = parseTokensYaml(result.content)
                                  if (parsed.activeId && parsed.schemes[parsed.activeId]) {
                                    activeScheme = parsed.schemes[parsed.activeId]
                                  }
                                }
                                const html = genFullManual(style.name, activeScheme)
                                const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
                                window.open(URL.createObjectURL(blob), '_blank')
                              }}
                            >预览VI</button>
                            <button
                              className="btn btn-xs"
                              style={{ flex: 1, fontSize: 10, padding: '4px 0', opacity: 0.75 }}
                              onClick={(e) => { e.stopPropagation(); openEditor(style.id, style.name, 'prompt') }}
                            >提示词</button>
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                            <span style={{ fontSize: 9, color: 'var(--text-muted)', flex: 1 }}>在模板选择中显示</span>
                            <button
                              className="btn btn-xs"
                              style={{
                                fontSize: 9, padding: '2px 8px',
                                background: enabledMap[`style-${style.id}`] ? 'var(--primary)' : '#ccc',
                                color: enabledMap[`style-${style.id}`] ? '#fff' : '#666',
                                border: 'none', borderRadius: 3, cursor: 'pointer',
                              }}
                              onClick={(e) => { e.stopPropagation(); handleToggleEnabled(style.id) }}
                            >{enabledMap[`style-${style.id}`] ? '已启用' : '已禁用'}</button>
                          </div>

                          {isExpanded && (
                            <div style={{
                              marginTop: 10, padding: '10px',
                              background: 'var(--bg)', borderRadius: 6,
                              fontSize: 10, lineHeight: 1.8, color: 'var(--text-secondary)',
                            }}>
                              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>色系管理</span>
                                {activeSchemeId && (
                                  <span style={{
                                    fontSize: 9, fontWeight: 500,
                                    background: 'var(--primary)', color: '#fff',
                                    padding: '1px 6px', borderRadius: 3,
                                  }}>
                                    默认: {schemeData[activeSchemeId]?.label || activeSchemeId}
                                  </span>
                                )}
                                {schemesLoading && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>加载中...</span>}
                                <div style={{ flex: 1 }} />
                                <button className="btn btn-xs" style={{ fontSize: 9, padding: '2px 6px' }}
                                  onClick={(e) => { e.stopPropagation(); loadSchemes(style.id) }}>刷新</button>
                              </div>
                              {!schemesLoading && Object.keys(schemeData).length > 0 && (
                                <>
                                  {Object.entries(schemeData).map(([schemeId, scheme]: [string, any]) => {
                                    const isEditing = editingSchemeId === schemeId
                                    const baseColors = [
                                      scheme.primary, scheme.secondary, scheme.accent,
                                      scheme.background, scheme.text, scheme.card_bg
                                    ].filter(Boolean)
                                    return (
                                      <div key={schemeId} style={{
                                        marginBottom: 4, border: '1px solid var(--border)',
                                        borderRadius: 4, overflow: 'hidden',
                                      }}>
                                        <div
                                          onClick={(e) => { e.stopPropagation(); setEditingSchemeId(isEditing ? null : schemeId) }}
                                          style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            padding: '4px 8px', cursor: 'pointer',
                                            background: isEditing ? 'var(--primary)' : 'transparent',
                                            color: isEditing ? '#fff' : 'var(--text)',
                                          }}>
                                          {baseColors.map((c: string, i: number) => (
                                            <span key={'b'+i} style={{
                                              display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                                              background: c,
                                              border: c?.toLowerCase() === '#ffffff' ? '1px solid #ddd' : '1px solid transparent',
                                            }} />
                                          ))}
                                          <span style={{ flex: 1, fontSize: 10, fontWeight: 500 }}>
                                            {scheme.label || schemeId}
                                          </span>
                                          {activeSchemeId === schemeId ? (
                                            <span style={{ fontSize: 8, background: '#27ae60', color: '#fff', padding: '1px 5px', borderRadius: 2 }}>默认</span>
                                          ) : (
                                            <button className="btn btn-xs"
                                              onClick={(e) => { e.stopPropagation(); setActiveSchemeId(schemeId); setPreviewSchemeId(schemeId) }}
                                              style={{ fontSize: 8, padding: '1px 5px', opacity: 0.6 }}
                                              title="设为默认色系">默认</button>
                                          )}
                                        </div>
                                        {isEditing && (
                                          <div style={{ padding: '6px 8px' }}>
                                            {/* 基础色 6 */}
                                            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text)', marginBottom: 4, borderBottom: '1px solid var(--border)', paddingBottom: 2 }}>基础色 (6)</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
                                              {[
                                                {k:'primary',l:'主色'},{k:'secondary',l:'辅色'},{k:'accent',l:'强调'},
                                                {k:'background',l:'背景'},{k:'text',l:'文字'},{k:'card_bg',l:'卡底'},
                                              ].map(({k,l}) => (
                                                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                  <span style={{ fontSize: 9, width: 26, color: 'var(--text-muted)' }}>{l}</span>
                                                  <input type="color" value={scheme[k] || '#000000'}
                                                    onChange={e => { e.stopPropagation(); handleSchemeColorChange(schemeId, k, e.target.value) }}
                                                    style={{ width: 18, height: 18, border: 'none', borderRadius: 2, cursor: 'pointer', padding: 0 }} />
                                                  <input value={scheme[k] || ''}
                                                    onChange={e => { e.stopPropagation(); handleSchemeColorChange(schemeId, k, e.target.value) }}
                                                    style={{ flex: 1, fontSize: 9, fontFamily: 'monospace', border: '1px solid var(--border)', borderRadius: 2, padding: '1px 4px', width: 50 }} />
                                                </div>
                                              ))}
                                            </div>
                                            {/* 图表色 5 + 语义色 2 并列 */}
                                            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                                              <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text)', marginBottom: 4, borderBottom: '1px solid var(--border)', paddingBottom: 2 }}>图表色 (5)</div>
                                                {[0,1,2,3,4].map(i => {
                                                  const ck = `chart_${i}`
                                                  const cv = scheme.chart_colors?.[i] || ''
                                                  return (
                                                    <div key={ck} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                                                      <span style={{ fontSize: 9, width: 20, color: 'var(--text-muted)', textAlign: 'right' }}>C{i}</span>
                                                      <input type="color" value={cv || '#000000'}
                                                        onChange={e => { e.stopPropagation(); handleSchemeColorChange(schemeId, ck, e.target.value) }}
                                                        style={{ width: 18, height: 18, border: 'none', borderRadius: 2, cursor: 'pointer', padding: 0 }} />
                                                      <input value={cv}
                                                        onChange={e => { e.stopPropagation(); handleSchemeColorChange(schemeId, ck, e.target.value) }}
                                                        style={{ flex: 1, fontSize: 9, fontFamily: 'monospace', border: '1px solid var(--border)', borderRadius: 2, padding: '1px 4px', width: 50 }} />
                                                    </div>
                                                  )
                                                })}
                                              </div>
                                              <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text)', marginBottom: 4, borderBottom: '1px solid var(--border)', paddingBottom: 2 }}>语义色 (2)</div>
                                                {[
                                                  {k:'semantic_positive',l:'正面',cv: scheme.semantic?.positive || ''},
                                                  {k:'semantic_negative',l:'负面',cv: scheme.semantic?.negative || ''},
                                                ].map(({k,l,cv}) => (
                                                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                                                    <span style={{ fontSize: 9, width: 28, color: 'var(--text-muted)' }}>{l}</span>
                                                    <input type="color" value={cv || '#000000'}
                                                      onChange={e => { e.stopPropagation(); handleSchemeColorChange(schemeId, k, e.target.value) }}
                                                      style={{ width: 18, height: 18, border: 'none', borderRadius: 2, cursor: 'pointer', padding: 0 }} />
                                                    <input value={cv}
                                                      onChange={e => { e.stopPropagation(); handleSchemeColorChange(schemeId, k, e.target.value) }}
                                                      style={{ flex: 1, fontSize: 9, fontFamily: 'monospace', border: '1px solid var(--border)', borderRadius: 2, padding: '1px 4px', width: 50 }} />
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                            <button className="btn btn-xs"
                                              onClick={(e) => { e.stopPropagation(); handleDeleteScheme(schemeId) }}
                                              disabled={Object.keys(schemeData).length <= 1}
                                              style={{
                                                fontSize: 9, padding: '2px 8px', marginTop: 4,
                                                background: Object.keys(schemeData).length <= 1 ? '#ddd' : '#e74c3c',
                                                color: '#fff', border: 'none', borderRadius: 3,
                                                cursor: Object.keys(schemeData).length <= 1 ? 'not-allowed' : 'pointer',
                                              }}>删除</button>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                  {showNewSchemeInput ? (
                                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                      <input value={newSchemeName}
                                        onChange={(e) => setNewSchemeName(e.target.value)}
                                        placeholder="色系名称"
                                        style={{ flex: 1, fontSize: 10, border: '1px solid var(--border)', borderRadius: 3, padding: '3px 6px' }}
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddScheme() }} />
                                      <button className="btn btn-xs" onClick={(e) => { e.stopPropagation(); handleAddScheme() }}
                                        style={{ fontSize: 9, padding: '2px 6px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: 3 }}>确认</button>
                                      <button className="btn btn-xs" onClick={(e) => { e.stopPropagation(); setShowNewSchemeInput(false); setNewSchemeName('') }}
                                        style={{ fontSize: 9, padding: '2px 6px' }}>取消</button>
                                    </div>
                                  ) : (
                                    <button className="btn btn-xs" onClick={(e) => { e.stopPropagation(); setShowNewSchemeInput(true) }}
                                      style={{ fontSize: 9, padding: '2px 8px', marginTop: 4 }}>+ 新增色系</button>
                                  )}
                                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                                    <button className="btn btn-xs" onClick={(e) => { e.stopPropagation(); saveSchemes() }}
                                      disabled={schemesSaving}
                                      style={{ flex: 1, fontSize: 10, padding: '4px 0', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4 }}>
                                      {schemesSaving ? '保存中...' : '保存色系'}
                                    </button>
                                    <button className="btn btn-xs" onClick={(e) => { e.stopPropagation(); loadSchemes(style.id) }}
                                      style={{ fontSize: 10, padding: '4px 8px', opacity: 0.7 }}>取消</button>
                                  </div>
                                </>
                              )}
                              {!schemesLoading && Object.keys(schemeData).length === 0 && (
                                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>暂无色系数据</div>
                              )}
                              <div style={{ fontWeight: 600, color: 'var(--text)', margin: '6px 0 4px' }}>关键词</div>
                              <div>{style.keywords?.filter((k: string) => /^[a-zA-Z]/.test(k)).slice(0, 5).join(', ') || style.mood}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()
        )}
      </div>

      {/* Editor Modal */}
      {editorOpen && (() => {
        const sections = Object.keys(editorTabs).sort((a,b) => pageTypeSortKey(a) - pageTypeSortKey(b))
        return (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.35)',
        }} onClick={() => setEditorOpen(false)}>
          <div style={{
            background: 'var(--bg-card, #fff)', borderRadius: 12,
            width: '90vw', maxWidth: 900, maxHeight: '85vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 20px', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>
                  {editorStyleName}
                </span>
                <span style={{
                  fontSize: 11, color: 'var(--text-muted)',
                  background: 'var(--bg)', padding: '2px 8px', borderRadius: 4,
                }}>
                  {editorMode === 'vi' ? 'VIS 视觉识别规则' : '模版提示词'}
                </span>
              </div>
              <button className="btn" style={{ fontSize: 12, padding: '4px 12px' }}
                onClick={() => setEditorOpen(false)}>关闭</button>
            </div>

            {/* Tabs */}
            {sections.length > 1 && (
              <div style={{
                display: 'flex', borderBottom: '1px solid var(--border)',
                padding: '0 12px', gap: 2, overflowX: 'auto',
              }}>
                {sections.map(s => (
                  <button key={s}
                    onClick={() => setEditorActiveSection(s)}
                    style={{
                      padding: '8px 12px', fontSize: 11, border: 'none',
                      background: editorActiveSection === s ? 'var(--bg)' : 'transparent',
                      color: editorActiveSection === s ? 'var(--text)' : 'var(--text-muted)',
                      borderBottom: editorActiveSection === s ? '2px solid var(--primary, #1a365d)' : '2px solid transparent',
                      cursor: 'pointer', fontWeight: editorActiveSection === s ? 600 : 400,
                      whiteSpace: 'nowrap',
                    }}
                  >{VI_LABELS[s] || s}</button>
                ))}
              </div>
            )}

            {/* Body */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {editorLoading ? (
                <p style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>加载中...</p>
              ) : (
                <textarea
                  style={{
                    flex: 1, padding: 16, border: 'none', resize: 'none',
                    fontFamily: 'monospace', fontSize: 12,
                    lineHeight: 1.6, color: 'var(--text)',
                    background: 'var(--bg)',
                    outline: 'none',
                    minHeight: 400,
                  }}
                  value={editorTabs[editorActiveSection] || ''}
                  onChange={(e) => updateTab(editorActiveSection, e.target.value)}
                />
              )}
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 20px', borderTop: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 11, color: editorMsg === '已保存' || editorMsg === '已复制' ? 'var(--success, #27ae60)' : 'var(--text-muted)' }}>
                {editorMsg || (sections.length > 1 ? `${editorActiveSection} · 共 ${sections.length} 个文件` : '')}
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {editorMode === 'vi' && Object.keys(schemeData).length > 0 && (
                  <select
                    value={previewSchemeId || activeSchemeId || ''}
                    onChange={(e) => setPreviewSchemeId(e.target.value)}
                    style={{
                      fontSize: 11, padding: '4px 6px', borderRadius: 4,
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      color: 'var(--text)', maxWidth: 130,
                    }}
                  >
                    {Object.entries(schemeData).map(([id, s]) => (
                      <option key={id} value={id}>{s.label || id}</option>
                    ))}
                  </select>
                )}
                <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }}
                  onClick={runPreview}>预览</button>
                <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }}
                  onClick={copyContent}>复制</button>
                <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }}
                  onClick={downloadContent}>下载</button>
                <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 20px' }}
                  disabled={editorSaving}
                  onClick={saveEditor}>
                  {editorSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )})()}
    </div>
  )
}

export default TemplateManager
