#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PROOF v4: deterministic renderer using the 13-COLOR VARIABLE SYSTEM.

Same Kimi-learned design system as v3 (full-width dark header bar, subtitle
gold-line strip, cream cards with embedded dark multi-field blocks, dual
navy/red contrast cards, accent nodes, 20+ shapes/page) — but NO hardcoded
hex.  Every slide color is emitted as a CSS variable (var(--primary),
var(--chart-N), var(--card_bg), var(--semantic-negative), ...) resolved
against a single :root{} block built from the active tokens.yaml color
scheme, exactly like the real pipeline (_build_css_vars + _resolve_color_vars
css_vars=True).

  => To recolor the entire deck you change ONLY the 13 values of the scheme
     (色系管理 panel / tokens.yaml).  The code never invents a color.

Kimi design roles → 13 variables:
  ink header / dark gradients ....... var(--primary)
  steel titles / strips ............. var(--secondary)
  copper accent (nodes / lines) ..... var(--accent)
  gold sub-accent (embed labels) .... var(--chart-3)
  cream cards ....................... var(--card_bg)
  embedded dark block .............. var(--text)
  danger / warning cards ........... var(--semantic-negative)
  card stripe rotation ............. var(--chart-0..4)
  source / muted ................... rgba(var(--text-rgb), .55)
  white text on dark ............... #ffffff  (allowed on dark bg)

Canvas 1280x720.  Data: data/debug/last_outline_response.txt.  Zero LLM.
"""
import json, os, re, html as H, yaml

BASE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE, "data", "exports", "道术验证_鲍鱼一品煲")
OUTLINE = os.path.join(BASE, "data", "debug", "last_outline_response.txt")
TOKENS = os.path.join(BASE, "resources", "vi", "business", "tokens.yaml")
SCHEME_ID = os.environ.get("PROOF_SCHEME", "deep-blue")

# Kimi design roles mapped onto the 13-color variables (NO hardcoded hex).
V = {
    "ink":    "var(--primary)",
    "steel":  "var(--secondary)",
    "copper": "var(--accent)",
    "gold":   "var(--chart-3)",
    "cream":  "var(--card_bg)",
    "dark":   "var(--text)",
    "danger": "var(--semantic-negative)",
    "gray":   "rgba(var(--text-rgb), 0.55)",
    "white":  "#ffffff",
    "node":   ["var(--chart-0)", "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"],
}
esc = H.escape

ICONS = {
    "drop": '<path d="M12 3c-3 4-6 7-6 11a6 6 0 0012 0c0-4-3-7-6-11z"/>',
    "fire": '<path d="M12 2C8 6 8 9 10 12c1 1.5 1 3 0 4M14 6c2 3 4 5 4 9a6 6 0 01-12 0"/>',
    "merge": '<path d="M4 6h5l3 6M20 6h-5M4 18h5l3-6M20 18h-5"/><circle cx="12" cy="12" r="2"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "list": '<path d="M4 6h16M4 12h16M4 18h10"/>',
    "flow": '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="12" r="2.5"/><path d="M7.5 12h9"/>',
    "card": '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6M9 13h6"/>',
    "swap": '<path d="M12 3l9 6-9 6-9-6z"/><path d="M3 15l9 6 9-6"/>',
    "warn": '<path d="M12 9v4M12 17h.01M10.3 3.9l-8 14A2 2 0 004 21h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0z"/>',
    "star": '<path d="M12 2l2.4 7.4H22l-6 4.5 2.3 7.1-6.3-4.6L5.7 21l2.3-7.1-6-4.5h7.6z"/>',
    "book": '<path d="M4 5a2 2 0 012-2h12v18H6a2 2 0 01-2-2z"/><path d="M8 3v18"/>',
    "gear": '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
}
DAO_ICON = {"涨": "drop", "脆": "fire", "合": "merge", "时": "clock"}

W, HGT = 1280, 720
FONT = "'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif"


# ---- color scheme (13 vars) loaded from tokens.yaml ----
def _hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _load_scheme(scheme_id=SCHEME_ID):
    with open(TOKENS, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    schemes = data.get("color_schemes", {}) or {}
    return schemes.get(scheme_id) or next(iter(schemes.values()))


def _build_root_css(scheme):
    """Emit :root{} with all 13 color vars + rgb triplets — mirrors the
    pipeline's _build_css_vars so var(--x) references resolve identically."""
    out = [":root{"]
    for key in ["primary", "secondary", "accent", "background", "text", "card_bg"]:
        val = scheme.get(key, "")
        if val and val.startswith("#"):
            r, g, b = _hex_to_rgb(val)
            out.append(f"  --{key}: {val}; --{key}-rgb: {r}, {g}, {b};")
    for i, c in enumerate(scheme.get("chart_colors", []) or []):
        if c and c.startswith("#"):
            r, g, b = _hex_to_rgb(c)
            out.append(f"  --chart-{i}: {c}; --chart-{i}-rgb: {r}, {g}, {b};")
    for k, v in (scheme.get("semantic", {}) or {}).items():
        if v and v.startswith("#"):
            r, g, b = _hex_to_rgb(v)
            out.append(f"  --semantic-{k}: {v}; --semantic-{k}-rgb: {r}, {g}, {b};")
    out.append("}")
    return "\n".join(out)


def _load_outline():
    with open(OUTLINE, encoding="utf-8") as f:
        raw = f.read()
    m = re.search(r"```json\s*\n(.*?)\n```", raw, re.DOTALL)
    return json.loads(m.group(1) if m else raw)


def _icon(name, color, size=22, sw=1.7):
    # stroke set via style so CSS variables (var(--x)) resolve in SVG.
    p = ICONS.get(name, ICONS["card"])
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" '
            f'style="stroke:{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{p}</svg>')


def _frame(inner, bg=None):
    bg = bg or V["white"]
    return (f'<div style="width:{W}px;height:{HGT}px;position:relative;overflow:hidden;'
            f'background:{bg};font-family:{FONT};">{inner}</div>')


# ---- header bar: full-width ink strip + white title + page badge ----
def _header(title, seq, total):
    return (f'<div style="position:absolute;top:0;left:0;width:{W}px;height:52px;background:{V["ink"]};z-index:5;'
            f'display:flex;align-items:center;padding:0 28px;">'
            f'<div style="width:5px;height:22px;background:{V["copper"]};margin-right:14px;border-radius:1px;"></div>'
            f'<span style="font-size:19px;font-weight:700;color:#fff;letter-spacing:0.5px;flex:1;">{esc(title)}</span>'
            f'<span style="font-size:15px;font-weight:600;color:{V["gold"]};">{seq:02d} / {total:02d}</span></div>')


def _subtitle_strip(text):
    if not text:
        return ""
    return (f'<div style="position:absolute;top:52px;left:0;width:{W}px;background:{V["steel"]};z-index:4;'
            f'padding:11px 28px;display:flex;align-items:center;gap:12px;">'
            f'<div style="width:20px;height:3px;background:{V["gold"]};flex-shrink:0;"></div>'
            f'<span style="font-size:14px;color:rgba(255,255,255,0.9);line-height:1.4;">{esc(text)}</span></div>')


def _source(txt="Source: 「鲍鱼一品煲」SOP · 道术拆解"):
    return (f'<div style="position:absolute;bottom:20px;left:28px;font-size:12px;color:{V["gray"]};z-index:5;">{esc(txt)}</div>')


def _region(inner, top, bottom=54):
    return (f'<div style="position:absolute;top:{top}px;left:28px;right:28px;bottom:{bottom}px;z-index:2;">{inner}</div>')


# cream card with embedded dark block (Kimi signature)
def _cream_card(stripe_color, icon, title, embed_lines, flex=True):
    embed = "".join(
        f'<div style="display:flex;gap:8px;margin-bottom:7px;">'
        f'<span style="color:{V["gold"]};font-weight:700;flex-shrink:0;">{esc(lbl)}</span>'
        f'<span style="color:rgba(255,255,255,0.9);">{esc(val)}</span></div>'
        if lbl else
        f'<div style="color:rgba(255,255,255,0.9);margin-bottom:7px;line-height:1.55;">{esc(val)}</div>'
        for lbl, val in embed_lines)
    grow = "flex:1;" if flex else ""
    return (f'<div style="{grow}display:flex;flex-direction:column;background:{V["cream"]};border-radius:10px;overflow:hidden;'
            f'box-shadow:0 3px 10px rgba(0,0,0,0.08);">'
            f'<div style="height:4px;background:{stripe_color};"></div>'
            f'<div style="display:flex;align-items:center;gap:10px;padding:13px 18px 10px;">'
            f'<div style="width:30px;height:30px;border-radius:8px;background:{stripe_color};display:flex;align-items:center;justify-content:center;">{_icon(icon,"#fff",18)}</div>'
            f'<span style="font-size:16px;font-weight:700;color:{V["steel"]};">{esc(title)}</span></div>'
            f'<div style="flex:1;margin:0 14px 14px;background:{V["dark"]};border-radius:8px;padding:14px 16px;font-size:13px;">{embed}</div></div>')


# ---------- renderers ----------
def render_cover(s, seq, total):
    kps = s.get("key_points", [])
    grad = f'linear-gradient(135deg,{V["ink"]} 0%,{V["steel"]} 100%)'
    corners = (f'<div style="position:absolute;top:0;left:0;width:120px;height:120px;border-top:5px solid {V["copper"]};border-left:5px solid {V["copper"]};opacity:0.6;"></div>'
               f'<div style="position:absolute;bottom:0;right:0;width:120px;height:120px;border-bottom:5px solid {V["copper"]};border-right:5px solid {V["copper"]};opacity:0.6;"></div>')
    svg = ('<svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">'
           f'<circle cx="1080" cy="140" r="220" fill="none" style="stroke:{V["copper"]}" stroke-width="1" opacity="0.15"/>'
           f'<circle cx="1080" cy="140" r="150" fill="none" style="stroke:{V["gold"]}" stroke-width="1" opacity="0.1"/>'
           f'<circle cx="180" cy="600" r="180" fill="none" style="stroke:{V["copper"]}" stroke-width="1" opacity="0.12"/></svg>')
    meta = "".join(
        f'<span style="display:inline-flex;align-items:center;gap:7px;">'
        f'<span style="width:6px;height:6px;border-radius:50%;background:{V["copper"]};"></span>{esc(str(k))}</span>'
        for k in kps[:5])
    inner = (svg + corners +
        '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-52%);text-align:center;width:80%;">'
        f'<div style="width:80px;height:3px;background:{V["copper"]};margin:0 auto 26px;"></div>'
        f'<h1 style="font-size:52px;font-weight:800;color:#fff;margin:0 0 20px;line-height:1.2;letter-spacing:1px;">{esc(s.get("title_format") or s.get("heading",""))}</h1>'
        f'<p style="font-size:21px;color:{V["gold"]};margin:0 0 30px;font-weight:500;">{esc(s.get("subtitle",""))}</p>'
        f'<div style="width:400px;height:1px;background:rgba(255,255,255,0.2);margin:0 auto 26px;"></div>'
        f'<div style="display:flex;justify-content:center;flex-wrap:wrap;gap:14px 32px;font-size:14px;color:rgba(255,255,255,0.75);">{meta}</div>'
        '</div>'
        f'<div style="position:absolute;bottom:34px;left:50%;transform:translateX(-50%);font-size:13px;color:rgba(255,255,255,0.5);letter-spacing:2px;">一勺笔录 · 2024</div>')
    return _frame(inner, grad)


def render_toc(s, seq, total):
    chapters = s.get("chapters", [])
    labels = [c.get("label", "") if isinstance(c, dict) else str(c) for c in chapters]
    ics = ["drop", "list", "flow", "card", "swap", "warn", "star"]
    cells = []
    for i, lab in enumerate(labels):
        main = lab.split("（")[0].split("(")[0].strip()
        m = re.search(r"[（(](.*?)[)）]", lab)
        sub = m.group(1) if m else ""
        col = V["node"][i % 5]
        sub_html = f'<div style="font-size:12px;color:{V["gray"]};margin-top:3px;">{esc(sub)}</div>' if sub else ""
        cells.append(
            f'<div style="display:flex;align-items:center;gap:16px;background:{V["cream"]};border-radius:10px;padding:0 20px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">'
            f'<span style="font-size:30px;font-weight:800;color:{col};opacity:0.55;width:44px;">{i+1:02d}</span>'
            f'<div style="width:38px;height:38px;border-radius:10px;background:{col};display:flex;align-items:center;justify-content:center;flex-shrink:0;">{_icon(ics[i%len(ics)],"#fff",20)}</div>'
            f'<div><div style="font-size:15px;font-weight:700;color:{V["steel"]};">{esc(main)}</div>{sub_html}</div></div>')
    rows = (len(cells) + 1) // 2
    grid = f'<div style="height:100%;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat({rows},1fr);gap:14px 28px;">{"".join(cells)}</div>'
    inner = _header("目录 · CONTENTS", seq, total) + _region(grid, top=72) + _source()
    return _frame(inner)


def render_section(s, seq, total, part_no):
    grad = f'linear-gradient(135deg,{V["ink"]} 0%,{V["steel"]} 100%)'
    svg = ('<svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">'
           f'<circle cx="640" cy="330" r="260" fill="none" style="stroke:{V["copper"]}" stroke-width="1" opacity="0.15"/>'
           f'<circle cx="640" cy="330" r="190" fill="none" style="stroke:{V["gold"]}" stroke-width="1" opacity="0.1"/></svg>')
    inner = (svg +
             '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-55%);text-align:center;">'
             f'<div style="font-size:19px;font-weight:700;color:{V["copper"]};letter-spacing:4px;margin-bottom:18px;">CHAPTER {part_no:02d}</div>'
             f'<h2 style="font-size:50px;font-weight:800;color:#fff;margin:0 0 22px;letter-spacing:1px;">{esc(s.get("heading",""))}</h2>'
             f'<div style="width:60px;height:3px;background:{V["copper"]};margin:0 auto 22px;"></div>'
             f'<p style="font-size:17px;color:{V["gold"]};margin:0;max-width:680px;line-height:1.6;">{esc(s.get("subtitle","") or s.get("lead",""))}</p></div>')
    return _frame(inner, grad)


def render_principle(s, seq, total):
    """Kimi S4 layout: cream cards, each embedding a dark block with ✓ correct
    (white) + ✕ wrong (semantic-negative marker) contrast."""
    kps = [str(k) for k in s.get("key_points", [])]
    cards = []
    for i, kp in enumerate(kps):
        name, _, rest = kp.partition("：")
        if not rest:
            name, rest = f"要点{i+1}", kp
        parts = re.split(r"[；;]", rest, maxsplit=1)
        correct = parts[0].strip()
        wrong = parts[1].strip() if len(parts) > 1 else ""
        col = V["node"][i % 5]
        ch = name[0]
        cards.append(
            f'<div style="flex:1;display:flex;flex-direction:column;background:{V["cream"]};border-radius:10px;overflow:hidden;box-shadow:0 3px 10px rgba(0,0,0,0.08);">'
            f'<div style="height:4px;background:{col};"></div>'
            f'<div style="display:flex;align-items:center;gap:10px;padding:12px 16px 8px;">'
            f'<div style="width:36px;height:36px;border-radius:9px;background:{col};color:#fff;font-weight:800;font-size:19px;display:flex;align-items:center;justify-content:center;">{esc(ch)}</div>'
            f'<span style="font-size:17px;font-weight:700;color:{V["steel"]};flex:1;">{esc(name)}</span>'
            f'{_icon(DAO_ICON.get(ch,"card"),col,18)}</div>'
            f'<div style="flex:1;margin:0 12px 12px;background:{V["dark"]};border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.55;">'
            f'<div style="color:rgba(255,255,255,0.92);margin-bottom:6px;"><b style="color:{V["gold"]};">✓ </b>{esc(correct)}</div>'
            + (f'<div style="color:#fff;padding-top:6px;border-top:1px solid rgba(255,255,255,0.12);"><b style="color:{V["danger"]};">✕ </b>{esc(wrong)}</div>' if wrong else "")
            + '</div></div>')
    rows = (len(cards) + 1) // 2
    grid = f'<div style="height:100%;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat({rows},1fr);gap:16px;">{"".join(cards)}</div>'
    inner = _header(s.get("heading", ""), seq, total) + _subtitle_strip(s.get("subtitle", "") or "以「涨脆合时」四维,拆解本菜核心科学") + _region(grid, top=112) + _source()
    return _frame(inner)


def render_table(s, seq, total, headers=None, stats=None):
    kps = [str(k) for k in s.get("key_points", [])]
    cols = [[c.strip() for c in re.split(r"[；;]|→|/", kp) if c.strip()] for kp in kps]
    nrows = max((len(c) for c in cols), default=0)
    ncol = len(cols)
    if not headers:
        headers = ["步骤", "参数", "目标"][:ncol] or ["内容"]
    idx_hdr = f'<th style="background:{V["ink"]};color:#fff;padding:13px 12px;width:48px;"></th>'
    head_cells = idx_hdr + "".join(
        f'<th style="background:{V["node"][j%5]};color:#fff;padding:13px 16px;text-align:left;font-weight:600;font-size:14px;">{esc(headers[j] if j<len(headers) else "")}</th>'
        for j in range(ncol))
    body = []
    for r in range(nrows):
        bg = V["cream"] if r % 2 == 0 else V["white"]
        idx_cell = f'<td style="padding:12px;text-align:center;font-weight:800;color:{V["copper"]};font-size:15px;background:rgba(var(--accent-rgb),0.08);">{r+1}</td>'
        cells = idx_cell + "".join(
            f'<td style="padding:12px 16px;font-size:13.5px;color:{V["steel"] if j==0 else "var(--text)"};font-weight:{700 if j==0 else 400};line-height:1.5;">{esc(cols[j][r] if r<len(cols[j]) else "")}</td>'
            for j in range(ncol))
        body.append(f'<tr style="background:{bg};">{cells}</tr>')
    table = (f'<table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;box-shadow:0 3px 12px rgba(0,0,0,0.08);">'
             f'<thead><tr>{head_cells}</tr></thead><tbody>{"".join(body)}</tbody></table>')
    stat_html = ""
    if stats:
        chips = "".join(
            f'<div style="flex:1;background:{V["ink"]};border-radius:10px;padding:14px;text-align:center;">'
            f'<div style="font-size:24px;font-weight:800;color:{V["gold"]};">{esc(v)}</div>'
            f'<div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:3px;">{esc(l)}</div></div>'
            for v, l in stats)
        stat_html = f'<div style="display:flex;gap:14px;margin-top:auto;">{chips}</div>'
    region = f'<div style="height:100%;display:flex;flex-direction:column;gap:14px;">{table}{stat_html}</div>'
    inner = _header(s.get("heading", ""), seq, total) + _subtitle_strip(s.get("subtitle","") or "参数化关键步骤 · 可复制的工序表") + _region(region, top=112) + _source()
    return _frame(inner)


def render_technique(s, seq, total):
    kps = [str(k) for k in s.get("key_points", [])]
    n = len(kps)
    steps = []
    for i, kp in enumerate(kps):
        col = V["node"][i % 5]
        title, _, body = kp.partition("：")
        if not body:
            title, body = f"步骤{i+1}", kp
        last = (i == n - 1)
        bar = V["copper"] if last else col
        steps.append(
            f'<div style="flex:1;display:flex;align-items:stretch;background:{V["cream"]};border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">'
            f'<div style="width:56px;background:{bar};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:20px;flex-shrink:0;">{i+1}</div>'
            f'<div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:10px 20px;">'
            f'<div style="font-size:16px;font-weight:700;color:{V["steel"]};margin-bottom:3px;">{esc(title)}</div>'
            f'<p style="font-size:13.5px;color:var(--text);line-height:1.5;margin:0;">{esc(body)}</p></div></div>')
    box = f'<div style="height:100%;display:flex;flex-direction:column;gap:12px;">{"".join(steps)}</div>'
    inner = _header(s.get("heading", ""), seq, total) + _subtitle_strip(s.get("subtitle","") or "分步骤通用操作卡 · 五阶段细化") + _region(box, top=112) + _source()
    return _frame(inner)


def render_troubleshoot(s, seq, total):
    kps = [str(k) for k in s.get("key_points", [])]
    syms = [x.strip() for x in re.split(r"[；;/]", kps[0]) if x.strip()] if kps else []
    causes = [x.strip() for x in re.split(r"[；;]", kps[1]) if x.strip()] if len(kps) > 1 else []
    fixes = [x.strip() for x in re.split(r"[；;]", kps[2].replace("补救：", "")) if x.strip()] if len(kps) > 2 else []
    n = max(len(syms), len(causes), len(fixes))
    rows = []
    for i in range(n):
        rows.append(
            f'<div style="flex:1;display:grid;grid-template-columns:50px 200px 1fr 1.3fr;gap:14px;align-items:center;background:{V["cream"]};border-radius:10px;padding:0 18px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border-left:4px solid {V["danger"]};">'
            f'<div style="width:38px;height:38px;border-radius:9px;background:{V["danger"]};display:flex;align-items:center;justify-content:center;">{_icon("warn","#fff",20)}</div>'
            f'<div style="font-size:15px;font-weight:700;color:{V["danger"]};">{esc(syms[i] if i<len(syms) else "")}</div>'
            f'<div style="font-size:12.5px;color:{V["gray"]};line-height:1.5;">{esc(causes[i] if i<len(causes) else "")}</div>'
            f'<div style="background:{V["dark"]};border-radius:7px;padding:9px 13px;font-size:12.5px;color:rgba(255,255,255,0.9);line-height:1.5;"><b style="color:{V["gold"]};">补救 </b>{esc(fixes[i] if i<len(fixes) else "")}</div></div>')
    box = f'<div style="height:100%;display:flex;flex-direction:column;gap:11px;">{"".join(rows)}</div>'
    inner = _header(s.get("heading", ""), seq, total) + _subtitle_strip(s.get("subtitle","") or "现象 → 成因 → 补救 · 排障速查") + _region(box, top=112) + _source()
    return _frame(inner)


def render_grid_cards(s, seq, total):
    kps = [str(k) for k in s.get("key_points", [])]
    cards = []
    for i, kp in enumerate(kps):
        col = V["node"][i % 5]
        title, _, body = kp.partition("：")
        if not body:
            title, body = f"方案{chr(65+i)}", kp
        cards.append(
            f'<div style="display:flex;flex-direction:column;background:{V["cream"]};border-radius:12px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,0.1);">'
            f'<div style="height:5px;background:{col};"></div>'
            f'<div style="display:flex;align-items:center;gap:14px;padding:22px 26px 14px;">'
            f'<div style="width:50px;height:50px;border-radius:13px;background:{col};display:flex;align-items:center;justify-content:center;">{_icon("clock" if i==0 else "book","#fff",26)}</div>'
            f'<div><div style="font-size:13px;color:{col};font-weight:700;letter-spacing:2px;">方案 {chr(65+i)}</div>'
            f'<div style="font-size:23px;font-weight:800;color:{V["steel"]};">{esc(title)}</div></div></div>'
            f'<div style="flex:1;margin:0 20px 22px;background:{V["dark"]};border-radius:10px;padding:18px 20px;">'
            f'<p style="font-size:15px;line-height:1.8;color:rgba(255,255,255,0.9);margin:0;">{esc(body)}</p></div></div>')
    grid = f'<div style="height:100%;display:grid;grid-template-columns:repeat({len(cards)},1fr);gap:28px;">{"".join(cards)}</div>'
    inner = _header(s.get("heading", ""), seq, total) + _subtitle_strip(s.get("subtitle","") or "设备迁移 · 举一反三") + _region(grid, top=112) + _source()
    return _frame(inner)


def render_summary(s, seq, total, points):
    grad = f'linear-gradient(135deg,{V["ink"]} 0%,{V["steel"]} 100%)'
    items = []
    for i, (name, txt) in enumerate(points):
        col = V["node"][i % 5]
        items.append(
            f'<div style="flex:1;display:flex;align-items:center;gap:18px;background:rgba(255,255,255,0.06);border-radius:10px;border-left:4px solid {col};padding:0 22px;">'
            f'<div style="flex-shrink:0;width:46px;height:46px;border-radius:12px;background:{col};display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:21px;">{esc(name)}</div>'
            f'<p style="font-size:15.5px;line-height:1.5;color:rgba(255,255,255,0.92);margin:0;">{esc(txt)}</p></div>')
    box = f'<div style="height:100%;display:flex;flex-direction:column;gap:14px;">{"".join(items)}</div>'
    inner = (f'<div style="position:absolute;top:0;left:0;width:{W}px;height:52px;background:rgba(0,0,0,0.25);z-index:5;display:flex;align-items:center;padding:0 28px;">'
             f'<div style="width:5px;height:22px;background:{V["copper"]};margin-right:14px;"></div>'
             f'<span style="font-size:19px;font-weight:700;color:#fff;flex:1;">{esc(s.get("heading","核心要点回顾"))}</span>'
             f'<span style="font-size:15px;color:{V["gold"]};">{seq:02d} / {total:02d}</span></div>'
             + _region(box, top=76, bottom=64) +
             '<div style="position:absolute;bottom:22px;left:0;width:100%;text-align:center;z-index:3;">'
             f'<p style="font-size:13px;color:rgba(255,255,255,0.55);margin:0;">一勺笔录 · 高端煲菜工艺解析 · © 2024 内容基于上传 SOP 整理</p></div>')
    return _frame(inner, grad)


def render_closing(s, seq, total):
    grad = f'linear-gradient(135deg,{V["ink"]} 0%,{V["steel"]} 100%)'
    svg = ('<svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">'
           f'<circle cx="640" cy="360" r="280" fill="none" style="stroke:{V["copper"]}" stroke-width="1" opacity="0.12"/>'
           f'<circle cx="640" cy="360" r="200" fill="none" style="stroke:{V["gold"]}" stroke-width="1" opacity="0.1"/></svg>')
    inner = (svg +
             '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-55%);text-align:center;">'
             f'<div style="width:60px;height:3px;background:{V["copper"]};margin:0 auto 26px;"></div>'
             f'<h1 style="font-size:56px;font-weight:800;color:#fff;margin:0 0 18px;">{esc(s.get("heading","谢谢观赏"))}</h1>'
             f'<p style="font-size:19px;color:{V["gold"]};margin:0;">愿每一煲,都恰到好处</p></div>')
    return _frame(inner, grad)


def render_copyright(s, seq, total):
    inner = (_header("版权声明", seq, total) +
             '<div style="position:absolute;top:52%;left:50%;transform:translate(-50%,-50%);text-align:center;max-width:820px;">'
             f'<div style="width:52px;height:52px;border-radius:14px;background:{V["cream"]};display:flex;align-items:center;justify-content:center;margin:0 auto 22px;">{_icon("book",V["steel"],28)}</div>'
             f'<p style="font-size:17px;line-height:1.9;color:{V["steel"]};">{esc(s.get("description",""))}</p></div>' + _source())
    return _frame(inner)


def _swatch_legend(scheme):
    """Intro legend showing the 13 scheme values (a color KEY, not slide color)."""
    def chip(lbl, hexv):
        return (f'<div style="text-align:center;">'
                f'<div style="width:32px;height:32px;border-radius:6px;background:{hexv};border:1px solid #cbd5e0;margin:0 auto 4px;"></div>'
                f'<div style="font-size:10px;color:#4a5568;">{lbl}</div>'
                f'<div style="font-size:8px;color:#94a3b8;font-family:monospace;">{hexv}</div></div>')
    base = [("主色", "primary"), ("辅色", "secondary"), ("强调", "accent"),
            ("背景", "background"), ("文字", "text"), ("卡底", "card_bg")]
    chips = "".join(chip(l, scheme.get(k, "")) for l, k in base)
    chips += "".join(chip(f"C{i}", c) for i, c in enumerate(scheme.get("chart_colors", []) or []))
    for l, k in [("正面", "positive"), ("负面", "negative")]:
        chips += chip(l, (scheme.get("semantic", {}) or {}).get(k, ""))
    return f'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">{chips}</div>'


def build():
    scheme = _load_scheme()
    root_css = _build_root_css(scheme)
    outline = _load_outline()
    slides = []
    part = 0
    for s in outline:
        st = s.get("page_type")
        heading = s.get("heading", "")
        if st == "principle":
            part += 1
            slides.append(("section", {"heading": "道 · 烹饪理念与原理",
                                        "subtitle": "涨之道 · 脆之道 · 合之道 · 时之道 —— 四把钥匙,打开高端煲菜的复制精度"}, part))
            slides.append(("principle", s, None))
        elif st == "table" and "术 · 具体操作技法" in heading:
            part += 1
            slides.append(("section", {"heading": "术 · 具体操作技法",
                                        "subtitle": "把「道」落成可复制的参数 —— 流程、温度、时间、分段调味"}, part))
            slides.append(("table", s, ["工序", "参数（温度/时间）", "目标状态"],
                           [("6", "关键工序"), ("50-210℃", "温控跨度"), ("~10h", "全程耗时"), ("4", "主料协同")]))
        elif st == "table":
            if "通用流程" in heading:
                hdr = ["阶段", "对应道", "关键动作", "变量"]
            elif "主料" in heading:
                hdr = ["主料", "处理", "调味", "火候", "适用"]
            else:
                hdr = None
            slides.append(("table", s, hdr, None))
        else:
            slides.append((st, s, None))

    total = len(slides) + 1
    out_html, seq, summary_done = [], 0, False
    for item in slides:
        st, s = item[0], item[1]
        extra = item[2] if len(item) > 2 else None
        stats = item[3] if len(item) > 3 else None
        if st in ("copyright", "closing") and not summary_done:
            seq += 1
            pts = [("涨", "花胶先蒸后 50℃ 浸 8h,慢渗还原弹滑,忌沸水直涨外融内硬。"),
                   ("脆", "白醋刻蚀 + 210℃ 高温瞬间汽化起虎皮,低油温则干硬。"),
                   ("合", "分而治之批量预制,最后砂煲鲍汁融合,忌一锅乱炖老嫩不齐。"),
                   ("时", "花菇 6h 慢发、凤爪 1h 释胶、花胶 20-30min 控软弹,各司其时。")]
            out_html.append(render_summary({"heading": "四道归一 · 核心要点回顾"}, seq, total, pts))
            summary_done = True
        seq += 1
        if st == "cover": out_html.append(render_cover(s, seq, total))
        elif st == "toc": out_html.append(render_toc(s, seq, total))
        elif st == "section": out_html.append(render_section(s, seq, total, extra))
        elif st == "principle": out_html.append(render_principle(s, seq, total))
        elif st == "table": out_html.append(render_table(s, seq, total, extra, stats))
        elif st == "technique": out_html.append(render_technique(s, seq, total))
        elif st == "troubleshoot": out_html.append(render_troubleshoot(s, seq, total))
        elif st == "grid_cards": out_html.append(render_grid_cards(s, seq, total))
        elif st == "copyright": out_html.append(render_copyright(s, seq, total))
        elif st == "closing": out_html.append(render_closing(s, seq, total))
        else: out_html.append(_frame(_header(s.get("heading",""), seq, total)))

    blocks = "".join(f'<div class="slide-label">{i+1:02d}</div><div class="slide">{h}</div>' for i, h in enumerate(out_html))
    legend = _swatch_legend(scheme)
    doc = f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<title>道术验证 v4 · 鲍鱼一品煲（13色变量系统）</title><style>
{root_css}
*{{box-sizing:border-box;}} body{{margin:0;background:#3a4556;font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;}}
.wrap{{max-width:1320px;margin:0 auto;padding:40px 20px;}}
.intro{{background:#fff;border-radius:12px;padding:24px 32px;margin-bottom:28px;}}
.intro h1{{margin:0 0 8px;font-size:24px;color:#1a365d;}}
.intro p{{margin:6px 0;font-size:15px;line-height:1.7;color:#4a5568;}} .intro b{{color:#1a365d;}}
.slide-label{{color:#cbd5e0;font-size:13px;font-weight:600;margin:24px 0 8px;letter-spacing:1px;}}
.slide{{box-shadow:0 12px 40px rgba(0,0,0,0.4);border-radius:6px;overflow:hidden;}}
@media (max-width:1340px){{.slide{{transform:scale(0.72);transform-origin:top left;margin-bottom:-200px;}}}}
</style></head><body><div class="wrap">
<div class="intro"><h1>「鲍鱼一品煲」道与术 — v4（13色变量系统 · 色系「{esc(scheme.get('label',SCHEME_ID))}」）</h1>
<p>同一套 Kimi 手法(<b>全宽深色页眉、副标题金线条、米色卡内嵌深色多字段块、藏蓝/深红双色对照、accent 铜色、每页20+图形</b>),但<b>零硬编码颜色</b>:每个色值都是 <code>var(--primary)</code> / <code>var(--chart-N)</code> / <code>var(--card_bg)</code> / <code>var(--semantic-negative)</code>,统一由下方 13 个色值(:root)驱动。</p>
<p><b>换色只改这 13 个值</b>(色系管理面板 / tokens.yaml),整份 deck 自动变色 —— 代码永不自造颜色。纯 Python 渲染、零 LLM,数据来自大纲阶段真实产出。共 {total} 页。</p>
{legend}
</div>
{blocks}
</div></body></html>"""
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(doc)
    print(f"OK scheme={SCHEME_ID} pages={total} bytes={len(doc)} -> {OUT_DIR}/index.html")


if __name__ == "__main__":
    build()
