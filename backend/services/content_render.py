#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Deterministic content-page renderer for col4 (分析PPT) landscape decks.

Third path of the slide-generation architecture, parallel to the existing
structural code-fill (cover/section/summary/closing/toc) and LLM free-gen:
this module renders DATA pages (principle / table / technique / troubleshoot /
grid_cards) mechanically from the outline slide dict — no LLM, so it never
crashes and never drops data.

Design constraints (all binding):
  * 1:1 with the editor structure — one outline page → one rendered page.
    NEVER inject section/summary pages or invent headers/subtitles/stats.
  * Only reads fields that exist in the outline (heading, subtitle/lead,
    key_points, description, chapters).  Absent field → omit that element,
    never fabricate.
  * Emits {{primary}} / {{chart_0}} / {{semantic_negative}} placeholders
    (NOT var()) so ppt_service._resolve_color_vars(css_vars=True) produces the
    html_vars copy used for later color-scheme switching — identical contract
    to the structural code-fill path.
  * Returns None for any page_type it does not own → caller falls through to
    the LLM path.  Safe by construction.

Kimi design roles → 13 color variables (see tokens.yaml color_schemes):
  header bar / dark gradients ...... {{primary}}
  titles / subtitle strip .......... {{secondary}}
  accent stripe / nodes ............ {{accent}}
  embed-block labels (gold) ........ {{chart_3}}
  cream cards ...................... {{card_bg}}
  embedded dark block .............. {{text}}
  warning / contrast-negative ...... {{semantic_negative}}
  card stripe rotation ............. {{chart_0..4}}
"""
import re
import html as _html

esc = _html.escape

FONT = "'DM Sans',Inter,'PingFang SC','Microsoft YaHei',sans-serif"

# Page types this module renders deterministically. Everything else (cover,
# toc, section, summary, closing, and any unknown type) is left to the
# structural path or the LLM path.
CONTENT_TYPES = frozenset({"principle", "table", "troubleshoot", "technique", "grid_cards"})

_ICONS = {
    "drop": '<path d="M12 3c-3 4-6 7-6 11a6 6 0 0012 0c0-4-3-7-6-11z"/>',
    "fire": '<path d="M12 2C8 6 8 9 10 12c1 1.5 1 3 0 4M14 6c2 3 4 5 4 9a6 6 0 01-12 0"/>',
    "merge": '<path d="M4 6h5l3 6M20 6h-5M4 18h5l3-6M20 18h-5"/><circle cx="12" cy="12" r="2"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "warn": '<path d="M12 9v4M12 17h.01M10.3 3.9l-8 14A2 2 0 004 21h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0z"/>',
    "card": '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6M9 13h6"/>',
    "book": '<path d="M4 5a2 2 0 012-2h12v18H6a2 2 0 01-2-2z"/><path d="M8 3v18"/>',
    "gear": '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
}
_DAO_ICON = {"涨": "drop", "脆": "fire", "合": "merge", "时": "clock"}


def _node(i: int) -> str:
    return "{{chart_%d}}" % (i % 5)


def _icon(name: str, color: str, size: int = 20, sw: float = 1.7) -> str:
    p = _ICONS.get(name, _ICONS["card"])
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" '
            f'style="stroke:{color}" stroke-width="{sw}" stroke-linecap="round" '
            f'stroke-linejoin="round">{p}</svg>')


def _frame(inner: str, w: int, h: int, bg: str = "#ffffff") -> str:
    return (f'<div style="width:{w}px;height:{h}px;position:relative;overflow:hidden;'
            f'background:{bg};font-family:{FONT};">{inner}</div>')


def _header(title: str, seq: int, total: int, w: int) -> str:
    return (f'<div style="position:absolute;top:0;left:0;width:{w}px;height:52px;'
            f'background:{{{{primary}}}};z-index:5;display:flex;align-items:center;padding:0 28px;">'
            f'<div style="width:5px;height:22px;background:{{{{accent}}}};margin-right:14px;border-radius:1px;"></div>'
            f'<span style="font-size:19px;font-weight:700;color:#ffffff;letter-spacing:0.5px;flex:1;">{esc(title)}</span>'
            f'<span style="font-size:15px;font-weight:600;color:{{{{chart_3}}}};">{seq:02d} / {total:02d}</span></div>')


def _subtitle_strip(text: str, w: int) -> str:
    if not text:
        return ""
    return (f'<div style="position:absolute;top:52px;left:0;width:{w}px;background:{{{{secondary}}}};'
            f'z-index:4;padding:11px 28px;display:flex;align-items:center;gap:12px;">'
            f'<div style="width:20px;height:3px;background:{{{{chart_3}}}};flex-shrink:0;"></div>'
            f'<span style="font-size:14px;color:rgba(255,255,255,0.9);line-height:1.4;">{esc(text)}</span></div>')


def _region(inner: str, top: int, bottom: int = 30) -> str:
    return (f'<div style="position:absolute;top:{top}px;left:28px;right:28px;bottom:{bottom}px;'
            f'z-index:2;">{inner}</div>')


def _sub(slide: dict) -> str:
    """Honest subtitle: only the slide's own subtitle/lead, never fabricated."""
    return (slide.get("subtitle") or slide.get("lead") or "").strip()


def _top(slide: dict) -> int:
    return 112 if _sub(slide) else 72


# ─────────────────────────── per-type renderers ───────────────────────────

def _render_principle(slide, seq, total, w, h):
    kps = [str(k) for k in slide.get("key_points", [])]
    if not kps:
        return None
    cards = []
    for i, kp in enumerate(kps):
        name, _, rest = kp.partition("：")
        if not rest:
            name, rest = f"要点 {i+1}", kp
        parts = re.split(r"[；;]", rest, maxsplit=1)
        correct = parts[0].strip()
        wrong = parts[1].strip() if len(parts) > 1 else ""
        col = _node(i)
        ch = name.strip()[0] if name.strip() else str(i + 1)
        wrong_html = (f'<div style="color:#ffffff;padding-top:6px;margin-top:6px;'
                      f'border-top:1px solid rgba(255,255,255,0.12);">'
                      f'<b style="color:{{{{semantic_negative}}}};">✕ </b>{esc(wrong)}</div>') if wrong else ""
        cards.append(
            f'<div style="flex:1;display:flex;flex-direction:column;background:{{{{card_bg}}}};'
            f'border-radius:10px;overflow:hidden;box-shadow:0 3px 10px rgba(0,0,0,0.08);">'
            f'<div style="height:4px;background:{col};"></div>'
            f'<div style="display:flex;align-items:center;gap:10px;padding:12px 16px 8px;">'
            f'<div style="width:36px;height:36px;border-radius:9px;background:{col};color:#ffffff;'
            f'font-weight:800;font-size:19px;display:flex;align-items:center;justify-content:center;">{esc(ch)}</div>'
            f'<span style="font-size:17px;font-weight:700;color:{{{{secondary}}}};flex:1;">{esc(name)}</span>'
            f'{_icon(_DAO_ICON.get(ch,"card"),col,18)}</div>'
            f'<div style="flex:1;margin:0 12px 12px;background:{{{{text}}}};border-radius:8px;'
            f'padding:12px 14px;font-size:13px;line-height:1.55;">'
            f'<div style="color:rgba(255,255,255,0.92);"><b style="color:{{{{chart_3}}}};">✓ </b>{esc(correct)}</div>'
            f'{wrong_html}</div></div>')
    ncol = 2 if len(cards) >= 2 else 1
    rows = (len(cards) + ncol - 1) // ncol
    grid = (f'<div style="height:100%;display:grid;grid-template-columns:repeat({ncol},1fr);'
            f'grid-template-rows:repeat({rows},1fr);gap:16px;">{"".join(cards)}</div>')
    inner = _header(slide.get("heading", ""), seq, total, w) + _subtitle_strip(_sub(slide), w) + _region(grid, _top(slide))
    return _frame(inner, w, h)


def _split_cells(kp: str) -> list:
    """Split one key_point into aligned cells.

    Delimiters are prioritised: strong column signals (→ ； ;) win first; the
    weaker "/ 、 ·" are only used when no strong one is present, because in real
    data a slash is often an intra-cell "A/B" list (e.g. 蒸/温水浸/冷水浸) rather
    than a column boundary — using it blindly misaligns the matrix."""
    for d in ("→", "；", ";"):
        if d in kp:
            return [c.strip() for c in kp.split(d) if c.strip()]
    for d in ("/", "、", "·"):
        if d in kp:
            return [c.strip() for c in kp.split(d) if c.strip()]
    return [kp]


def _render_timeline(slide, seq, total, w, h, matrix):
    """Horizontal process timeline: nodes on a connector line + attribute cards.

    Chosen when the table's row-0 is a step SEQUENCE (contains →), e.g.
    发花胶→发花菇→…→装盘.  Each → cell becomes a numbered node; the remaining
    rows' aligned cells stack as that step's attributes in the card below —
    turning a "process table" into a real timeline instead of a look-alike of
    the comparison column-cards, so tables of different data shape look different.
    """
    steps = matrix[0]
    attr_rows = matrix[1:]
    n = len(steps)
    inset = 100.0 / n / 2.0  # align connector ends with the first/last node centres
    nodes = []
    for ci in range(n):
        col = _node(ci)
        nodes.append(
            f'<div style="display:flex;flex-direction:column;align-items:center;">'
            f'<div style="width:44px;height:44px;border-radius:50%;background:{col};color:#ffffff;'
            f'font-weight:800;font-size:19px;display:flex;align-items:center;justify-content:center;'
            f'box-shadow:0 3px 8px rgba(0,0,0,0.18);border:3px solid #ffffff;">{ci+1}</div></div>')
    node_band = (
        f'<div style="position:relative;height:56px;flex-shrink:0;">'
        f'<div style="position:absolute;top:22px;left:{inset}%;right:{inset}%;height:3px;'
        f'background:linear-gradient(90deg,{{{{accent}}}},{{{{secondary}}}});"></div>'
        f'<div style="position:relative;height:100%;display:grid;grid-template-columns:repeat({n},1fr);'
        f'align-items:center;">{"".join(nodes)}</div></div>')

    titles = []
    for ci in range(n):
        titles.append(
            f'<div style="text-align:center;font-size:14.5px;font-weight:800;color:{{{{secondary}}}};'
            f'line-height:1.25;padding:0 6px;">{esc(steps[ci])}</div>')
    title_band = (f'<div style="display:grid;grid-template-columns:repeat({n},1fr);gap:12px;'
                  f'margin:8px 0 12px;flex-shrink:0;">{"".join(titles)}</div>')

    cards = []
    for ci in range(n):
        col = _node(ci)
        fields = []
        for row in attr_rows:
            val = row[ci] if ci < len(row) else ""
            if not val:
                continue
            fields.append(
                f'<div style="flex:1;display:flex;align-items:flex-start;gap:8px;padding:9px 0;'
                f'border-top:1px dashed rgba(var(--text-rgb),0.12);">'
                f'<span style="flex-shrink:0;width:7px;height:7px;margin-top:6px;border-radius:50%;background:{col};"></span>'
                f'<span style="font-size:12.5px;color:{{{{text}}}};line-height:1.5;">{esc(val)}</span></div>')
        body = ("".join(fields) if fields else
                '<div style="flex:1;"></div>')
        cards.append(
            f'<div style="display:flex;flex-direction:column;background:#ffffff;border-radius:11px;'
            f'overflow:hidden;box-shadow:0 3px 12px rgba(0,0,0,0.09);border:1px solid rgba(var(--text-rgb),0.06);">'
            f'<div style="height:4px;background:{col};"></div>'
            f'<div style="flex:1;display:flex;flex-direction:column;padding:4px 13px 12px;">{body}</div></div>')
    card_band = (f'<div style="flex:1;display:grid;grid-template-columns:repeat({n},1fr);gap:12px;'
                 f'min-height:0;">{"".join(cards)}</div>')

    box = (f'<div style="height:100%;display:flex;flex-direction:column;">'
           f'{node_band}{title_band}{card_band}</div>')
    inner = _header(slide.get("heading", ""), seq, total, w) + _subtitle_strip(_sub(slide), w) + _region(box, _top(slide))
    return _frame(inner, w, h)


def _render_table(slide, seq, total, w, h):
    """Matrix table rendered as COLUMN CARDS to fill both width and height.

    Outline table shape: each key_point is one "attribute row" whose ；/→/·
    delimiters split it into per-entity values.  Row 0 is usually the entity
    names.  We TRANSPOSE this into one card per entity, stacking that entity's
    attributes inside a dark block — so the page fills space instead of leaving
    tall single-line rows with big vertical gaps (the "不够丰满" complaint).

    Data-shape branch: if row-0 is a step SEQUENCE (contains →), the page is a
    PROCESS, not a comparison → render a horizontal timeline instead, so tables
    of different meaning don't all look identical (the "布局类型很单调" complaint).

    Fallback: if the matrix is irregular (rows have very different cell counts),
    fall back to full-height numbered rows with the value chips laid out."""
    kps = [str(k) for k in slide.get("key_points", [])]
    if not kps:
        return None

    matrix = [_split_cells(kp) for kp in kps]
    counts = [len(r) for r in matrix]
    ncols = max(counts)

    # Process shape: row-0 is a →-sequence of >=3 steps → horizontal timeline.
    if "→" in kps[0] and len(matrix[0]) >= 3 and len(matrix[0]) == ncols and ncols <= 8:
        return _render_timeline(slide, seq, total, w, h, matrix)

    # Regular matrix = most rows share the max column count → transpose to cards.
    regular = ncols >= 2 and sum(1 for c in counts if c == ncols) >= max(2, len(matrix) - 1)

    if regular and ncols <= 8:
        # Column cards, LIGHT style (deliberately distinct from the dark-embed
        # cards used by principle/grid_cards, so the deck has light/dark rhythm
        # instead of one repeated motif). Header = row-0 value; body stacks the
        # remaining rows' values as label + value split by a colored hairline.
        header_row = matrix[0]
        attr_rows = matrix[1:]
        cards = []
        for ci in range(ncols):
            col = _node(ci)
            title = header_row[ci] if ci < len(header_row) else f"{ci+1}"
            fields = []
            for ri, row in enumerate(attr_rows):
                val = row[ci] if ci < len(row) else ""
                if not val:
                    continue
                fields.append(
                    f'<div style="display:flex;align-items:flex-start;gap:9px;padding:8px 0;'
                    f'{"border-top:1px dashed rgba(var(--text-rgb),0.14);" if ri>0 else ""}">'
                    f'<span style="flex-shrink:0;width:18px;height:18px;margin-top:1px;border-radius:5px;'
                    f'background:rgba(var(--secondary-rgb),0.12);color:{{{{secondary}}}};font-size:11px;'
                    f'font-weight:700;display:flex;align-items:center;justify-content:center;">{ri+1}</span>'
                    f'<span style="font-size:13.5px;color:{{{{text}}}};line-height:1.5;">{esc(val)}</span></div>')
            cards.append(
                f'<div style="flex:1;min-width:0;display:flex;flex-direction:column;background:#ffffff;'
                f'border-radius:12px;overflow:hidden;box-shadow:0 3px 12px rgba(0,0,0,0.09);'
                f'border:1px solid rgba(var(--text-rgb),0.06);">'
                f'<div style="height:5px;background:{col};"></div>'
                f'<div style="display:flex;align-items:center;gap:10px;padding:14px 16px 11px;'
                f'background:{{{{card_bg}}}};border-bottom:1px solid rgba(var(--text-rgb),0.06);">'
                f'<div style="width:34px;height:34px;flex-shrink:0;border-radius:9px;background:{col};color:#ffffff;'
                f'font-weight:800;font-size:16px;display:flex;align-items:center;justify-content:center;">{esc(chr(65+ci))}</div>'
                f'<span style="font-size:16px;font-weight:800;color:{{{{secondary}}}};line-height:1.2;">{esc(title)}</span></div>'
                f'<div style="flex:1;padding:6px 16px 12px;display:flex;flex-direction:column;">{"".join(fields)}</div></div>')
        grid = (f'<div style="height:100%;display:grid;grid-template-columns:repeat({ncols},1fr);gap:16px;">'
                f'{"".join(cards)}</div>')
        inner = _header(slide.get("heading", ""), seq, total, w) + _subtitle_strip(_sub(slide), w) + _region(grid, _top(slide))
        return _frame(inner, w, h)

    # Irregular fallback: full-height numbered rows, values as inline chips.
    rows = []
    for i, cells in enumerate(matrix):
        col = _node(i)
        chips = "".join(
            f'<div style="flex:1;min-width:0;padding:10px 14px;background:rgba(255,255,255,0.55);'
            f'border-radius:8px;font-size:13.5px;line-height:1.5;'
            f'color:{"{{secondary}}" if j==0 else "{{text}}"};font-weight:{700 if j==0 else 400};">{esc(c)}</div>'
            for j, c in enumerate(cells))
        rows.append(
            f'<div style="flex:1;display:flex;align-items:stretch;gap:10px;background:{{{{card_bg}}}};'
            f'border-radius:10px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.05);padding:8px 10px 8px 0;">'
            f'<div style="width:52px;flex-shrink:0;align-self:stretch;background:{col};color:#ffffff;border-radius:8px;'
            f'font-weight:800;font-size:17px;display:flex;align-items:center;justify-content:center;">{i+1}</div>'
            f'<div style="flex:1;display:flex;align-items:center;gap:10px;">{chips}</div></div>')
    box = f'<div style="height:100%;display:flex;flex-direction:column;gap:12px;">{"".join(rows)}</div>'
    inner = _header(slide.get("heading", ""), seq, total, w) + _subtitle_strip(_sub(slide), w) + _region(box, _top(slide))
    return _frame(inner, w, h)


def _render_troubleshoot(slide, seq, total, w, h):
    """3-array troubleshoot (symptom / cause / fix) OR fallback to per-kp rows."""
    kps = [str(k) for k in slide.get("key_points", [])]
    if not kps:
        return None
    # Canonical shape: kp0=symptoms, kp1=causes, kp2=fixes (each ；-separated)
    syms = [x.strip() for x in re.split(r"[；;/]", kps[0]) if x.strip()]
    causes = [x.strip() for x in re.split(r"[；;]", kps[1]) if x.strip()] if len(kps) > 1 else []
    fixes = [x.strip() for x in re.split(r"[；;]", re.sub(r"^补救[:：]", "", kps[2])) if x.strip()] if len(kps) > 2 else []
    aligned = len(kps) == 3 and len(syms) >= 2 and (len(syms) == max(len(syms), len(causes), len(fixes)))
    rows = []
    if aligned:
        n = max(len(syms), len(causes), len(fixes))
        for i in range(n):
            rows.append(
                f'<div style="flex:1;display:grid;grid-template-columns:48px 1.1fr 1.2fr 1.6fr;gap:14px;'
                f'align-items:center;background:{{{{card_bg}}}};border-radius:10px;padding:0 16px;'
                f'box-shadow:0 2px 8px rgba(0,0,0,0.06);border-left:4px solid {{{{semantic_negative}}}};">'
                f'<div style="width:36px;height:36px;border-radius:9px;background:{{{{semantic_negative}}}};'
                f'display:flex;align-items:center;justify-content:center;">{_icon("warn","#ffffff",18)}</div>'
                f'<div style="font-size:14.5px;font-weight:700;color:{{{{semantic_negative}}}};line-height:1.4;">{esc(syms[i] if i<len(syms) else "")}</div>'
                f'<div style="font-size:12.5px;color:rgba(var(--text-rgb),0.6);line-height:1.5;">{esc(causes[i] if i<len(causes) else "")}</div>'
                f'<div style="background:{{{{text}}}};border-radius:7px;padding:9px 13px;font-size:12.5px;'
                f'color:rgba(255,255,255,0.9);line-height:1.5;"><b style="color:{{{{chart_3}}}};">补救 </b>{esc(fixes[i] if i<len(fixes) else "")}</div></div>')
    else:
        for i, kp in enumerate(kps):
            rows.append(
                f'<div style="flex:1;display:flex;align-items:center;gap:14px;background:{{{{card_bg}}}};'
                f'border-radius:10px;padding:0 18px;box-shadow:0 2px 8px rgba(0,0,0,0.06);'
                f'border-left:4px solid {{{{semantic_negative}}}};">'
                f'<div style="width:36px;height:36px;border-radius:9px;background:{{{{semantic_negative}}}};'
                f'flex-shrink:0;display:flex;align-items:center;justify-content:center;">{_icon("warn","#ffffff",18)}</div>'
                f'<div style="font-size:14px;color:{{{{text}}}};line-height:1.5;">{esc(kp)}</div></div>')
    box = f'<div style="height:100%;display:flex;flex-direction:column;gap:11px;">{"".join(rows)}</div>'
    inner = _header(slide.get("heading", ""), seq, total, w) + _subtitle_strip(_sub(slide), w) + _region(box, _top(slide))
    return _frame(inner, w, h)


def _render_technique(slide, seq, total, w, h):
    kps = [str(k) for k in slide.get("key_points", [])]
    if not kps:
        return None
    steps = []
    for i, kp in enumerate(kps):
        col = _node(i)
        title, _, body = kp.partition("：")
        if not body:
            title, body = f"步骤 {i+1}", kp
        title_html = (f'<div style="font-size:16px;font-weight:700;color:{{{{secondary}}}};margin-bottom:3px;">{esc(title)}</div>'
                      if body else "")
        steps.append(
            f'<div style="flex:1;display:flex;align-items:stretch;background:{{{{card_bg}}}};border-radius:10px;'
            f'overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">'
            f'<div style="width:56px;flex-shrink:0;background:{col};display:flex;align-items:center;'
            f'justify-content:center;color:#ffffff;font-weight:800;font-size:20px;">{i+1}</div>'
            f'<div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:10px 20px;">'
            f'{title_html}'
            f'<p style="font-size:13.5px;color:{{{{text}}}};line-height:1.5;margin:0;">{esc(body)}</p></div></div>')
    box = f'<div style="height:100%;display:flex;flex-direction:column;gap:12px;">{"".join(steps)}</div>'
    inner = _header(slide.get("heading", ""), seq, total, w) + _subtitle_strip(_sub(slide), w) + _region(box, _top(slide))
    return _frame(inner, w, h)


def _render_grid_cards(slide, seq, total, w, h):
    kps = [str(k) for k in slide.get("key_points", [])]
    if not kps:
        return None
    cards = []
    for i, kp in enumerate(kps):
        col = _node(i)
        title, _, body = kp.partition("：")
        if not body:
            title, body = f"方案 {chr(65+i)}", kp
        cards.append(
            f'<div style="display:flex;flex-direction:column;background:{{{{card_bg}}}};border-radius:12px;'
            f'overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,0.1);">'
            f'<div style="height:5px;background:{col};"></div>'
            f'<div style="display:flex;align-items:center;gap:14px;padding:20px 24px 12px;">'
            f'<div style="width:48px;height:48px;flex-shrink:0;border-radius:13px;background:{col};'
            f'display:flex;align-items:center;justify-content:center;">{_icon("gear" if i%2 else "book","#ffffff",24)}</div>'
            f'<div><div style="font-size:12px;color:{col};font-weight:700;letter-spacing:2px;">{esc(chr(65+i))}</div>'
            f'<div style="font-size:21px;font-weight:800;color:{{{{secondary}}}};line-height:1.2;">{esc(title)}</div></div></div>'
            f'<div style="flex:1;margin:0 18px 20px;background:{{{{text}}}};border-radius:10px;padding:16px 18px;">'
            f'<p style="font-size:14.5px;line-height:1.75;color:rgba(255,255,255,0.9);margin:0;">{esc(body)}</p></div></div>')
    ncol = min(len(cards), 3) if cards else 1
    grid = (f'<div style="height:100%;display:grid;grid-template-columns:repeat({ncol},1fr);gap:22px;">'
            f'{"".join(cards)}</div>')
    inner = _header(slide.get("heading", ""), seq, total, w) + _subtitle_strip(_sub(slide), w) + _region(grid, _top(slide))
    return _frame(inner, w, h)


_DISPATCH = {
    "principle": _render_principle,
    "table": _render_table,
    "troubleshoot": _render_troubleshoot,
    "technique": _render_technique,
    "grid_cards": _render_grid_cards,
}


def render_content_slide(slide: dict, seq: int, total: int,
                         canvas_w: int = 1280, canvas_h: int = 720) -> str | None:
    """Render one content page deterministically, or None to fall through to LLM.

    Returns HTML with {{token}} color placeholders (resolve via _resolve_color_vars).
    None is returned for unsupported page types or empty data — the caller then
    uses its normal LLM generation path.
    """
    stype = slide.get("page_type") or slide.get("type") or ""
    fn = _DISPATCH.get(stype)
    if not fn:
        return None
    try:
        return fn(slide, seq, total, canvas_w, canvas_h)
    except Exception:
        return None
