"""HTML slide designer — generates complete HTML deck from style YAML tokens.

Rich visual output with decorative elements, patterns, varied layouts,
and card-level visual hierarchy. Each slide looks like a designed page,
not an empty template.
"""
import os
import json
import re
import uuid
import yaml

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STYLES_DIR = os.path.join(BASE_DIR, "data", "styles")


class HTMLDesigner:
    """Render slide_data to a complete HTML slide deck using style tokens."""

    def __init__(self, style_name: str = "business"):
        self._style = self._load_style(style_name)
        self._name = self._style.get("name", style_name)
        self._mood = self._style.get("mood", "")

        cs = self._style.get("color_scheme", {})
        self._primary = cs.get("primary", "#1a365d")
        self._secondary = cs.get("secondary", "#2c5282")
        self._accent = cs.get("accent", "#e67e22")
        self._background = cs.get("background", "#f8f9fa")
        self._text = cs.get("text", "#2d3748")
        self._card_bg = cs.get("card_bg", "#ffffff")
        self._chart_colors = cs.get("chart_colors", [self._accent])

        tp = self._style.get("typography", {})
        self._heading_font = tp.get("heading_font", "system-ui, sans-serif")
        self._body_font = tp.get("body_font", "system-ui, sans-serif")
        self._scale = tp.get("scale", 1.0)

        cd = self._style.get("card_style", {})
        self._border_radius = cd.get("border_radius", 16)
        self._shadow = cd.get("shadow", "0 4px 12px rgba(0,0,0,0.08)")
        self._gap = cd.get("gap", 24)
        self._border = cd.get("border", "")

        gd = self._style.get("gradients", {})
        self._hero_bg = gd.get("hero_bg",
            f"linear-gradient(135deg, {self._primary}, {self._secondary})")
        self._card_highlight = gd.get("card_highlight", "none")

        el = self._style.get("elevation", {})
        self._shadow_sm = el.get("shadow_sm", self._shadow)
        self._shadow_md = el.get("shadow_md", self._shadow)
        self._shadow_lg = el.get("shadow_lg", self._shadow)

        dc = self._style.get("decoration", {})
        self._pattern = dc.get("pattern", "none")
        self._pattern_opacity = dc.get("pattern_opacity", 0)
        self._icon_style = dc.get("icon_style", "outline")
        self._icon_weight = dc.get("icon_weight", 1.5)

        self._overrides = self._style.get("slide_type_overrides", {})

        ft = self._style.get("font_thresholds", {})
        st = ft.get("slide_title", {})
        self._title_min = st.get("min", 28)
        self._title_max = st.get("max", 44)
        ct = ft.get("card_title", {})
        self._card_title_min = ct.get("min", 18)
        self._card_title_max = ct.get("max", 32)
        bd = ft.get("body", {})
        self._body_min = bd.get("min", 14)
        self._body_max = bd.get("max", 20)

    def _load_style(self, name: str) -> dict:
        path = os.path.join(STYLES_DIR, f"{name}.yaml")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return yaml.safe_load(f) or {}
        return {}

    # ── Public API ──

    def render_deck(self, slide_data: list, title: str = "Presentation",
                    output_dir: str = None) -> tuple:
        run_id = uuid.uuid4().hex[:8]
        target = output_dir or os.path.join(BASE_DIR, "data", "exports")
        out_dir = os.path.join(target, run_id)
        os.makedirs(out_dir, exist_ok=True)

        slides_html = []
        slides_info = []
        valid = [s for s in slide_data if isinstance(s, dict)]
        total = len(valid)

        for i, sd in enumerate(valid):
            seq = sd.get("seq", i + 1)
            slide_type = sd.get("type", "content")
            layout = sd.get("layout", "")
            zones = sd.get("zones", {}) if isinstance(sd.get("zones"), dict) else {}
            heading = zones.get("heading", "")
            body = zones.get("body", "")
            kicker = zones.get("kicker", "")
            lead = zones.get("lead", "")
            cards = zones.get("cards", [])
            image_url = zones.get("image_url", "") or zones.get("image", "")
            if not isinstance(image_url, str) or image_url in ("true", "True", "1"):
                image_url = ""

            section = self._render_slide(seq, total, slide_type, layout,
                                         heading, body, kicker, lead, cards, image_url)
            slides_html.append(section)
            slides_info.append({
                "seq": seq, "file": f"slide-{seq:02d}.html",
                "label": heading or f"Slide {seq}", "type": slide_type,
            })

        full_html = self._assemble(slides_html, title)
        html_path = os.path.join(out_dir, "index.html")
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(full_html)
        return slides_info, full_html, out_dir, run_id

    # ── Slide shell ──

    def _apply_overrides(self, slide_type: str):
        ov = self._overrides.get(slide_type, {})
        bg = ov.get("background") or ov.get("card_bg") or self._background
        text_c = ov.get("text", self._text)
        card_bg = ov.get("card_bg", self._card_bg)
        hs = ov.get("heading_scale", 1.0)
        return bg, text_c, card_bg, hs

    def _render_slide(self, seq, total, slide_type, layout,
                      heading, body, kicker, lead, cards, image_url):
        bg, text_c, card_bg, hs = self._apply_overrides(slide_type)
        use_dark = self._is_dark(bg)
        title_size = int(self._title_max * hs) if hs != 1.0 else self._title_max

        # Background pattern
        pattern_bg = self._build_pattern(bg, use_dark)

        # Decorative elements
        decor = self._build_decor(slide_type, use_dark)

        content = ""
        if slide_type == "cover":
            content = self._render_cover(heading, body, kicker, lead, cards,
                                         text_c, title_size, image_url, bg)
        elif slide_type in ("process_flow", "timeline"):
            content = self._render_timeline(heading, cards, text_c, card_bg, title_size, bg)
        elif slide_type == "toc":
            content = self._render_toc(heading, cards, text_c, card_bg, title_size, bg)
        elif slide_type == "data_hero":
            content = self._render_data_hero(heading, cards, text_c, card_bg, title_size, bg)
        else:
            content = self._render_content(heading, body, cards, layout,
                                           text_c, card_bg, title_size, image_url, bg)

        page_color = "rgba(255,255,255,0.4)" if use_dark else "rgba(0,0,0,0.25)"
        page_num = f'{seq:02d} <span style="opacity:0.5">/ {total:02d}</span>'

        return f"""<section class="slide" data-seq="{seq}" data-type="{slide_type}" style="
  position:relative; width:1280px; height:720px; overflow:hidden;
  font-family:{self._body_font}; color:{text_c};
  box-sizing:border-box;
">
  <div style="position:absolute;inset:0;background:{bg};z-index:0;"></div>
  {pattern_bg}
  {decor}
  {content}
  <div style="position:absolute; bottom:20px; right:48px; font-size:13px;
    color:{page_color}; font-family:{self._body_font}; letter-spacing:1px;
    display:flex;align-items:center;gap:10px;z-index:2;">
    <span style="width:6px;height:6px;border-radius:50%;background:{self._accent};opacity:0.6;display:inline-block;"></span>
    {page_num}
  </div>
</section>"""

    # ── Background pattern ──

    def _build_pattern(self, bg, use_dark):
        if self._pattern == "none" or self._pattern_opacity <= 0:
            return ""
        dot_color = "255,255,255" if use_dark else "0,0,0"
        op = self._pattern_opacity
        if self._pattern == "dots":
            svg = f"""<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <circle cx="20" cy="20" r="1.2" fill="rgba({dot_color},{op})"/>
</svg>"""
            return f'<div style="position:absolute;inset:0;z-index:0;background-image:url(\'data:image/svg+xml,{_esc_url(svg)}\');background-repeat:repeat;"></div>'
        if self._pattern == "grid":
            svg = f"""<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="39.5" height="39.5" fill="none" stroke="rgba({dot_color},{op})" stroke-width="0.5"/>
</svg>"""
            return f'<div style="position:absolute;inset:0;z-index:0;background-image:url(\'data:image/svg+xml,{_esc_url(svg)}\');background-repeat:repeat;"></div>'
        return ""

    def _build_decor(self, slide_type, use_dark):
        dec_color = "255,255,255" if use_dark else "0,0,0"
        parts = []
        if slide_type in ("cover", "section_divider"):
            parts.append(f"""<div style="position:absolute;top:-15%;right:-5%;width:50%;height:50%;
  border-radius:50%;background:rgba({dec_color},0.03);z-index:0;"></div>""")
            parts.append(f"""<div style="position:absolute;bottom:-10%;left:-3%;width:40%;height:40%;
  border-radius:50%;background:rgba({dec_color},0.02);z-index:0;"></div>""")
        return "\n".join(parts)

    # ── Cover ──

    def _render_cover(self, heading, body, kicker, lead, cards,
                      text_c, title_size, image_url, bg):
        kicker_text = kicker
        subtitle = lead or body
        hero_body = ""
        if cards:
            for c in cards:
                if c.get("role") == "hero" and c.get("body"):
                    hero_body = c["body"]
                    break
            if not kicker_text:
                for c in cards:
                    k = c.get("title", "")
                    if k and c.get("role") != "hero":
                        kicker_text = k
                        break

        img_html = ""
        if image_url:
            img_html = f"""<div style="position:absolute;inset:0;z-index:0">
    <img src="{image_url}" style="width:100%;height:100%;object-fit:cover" alt="">
    <div style="position:absolute;inset:0;background:rgba(0,0,0,0.55)"></div>
  </div>"""

        # Use hero gradient if no image
        hero_overlay = ""
        if not image_url and self._hero_bg and self._hero_bg != "none":
            hero_overlay = f'<div style="position:absolute;inset:0;background:{self._hero_bg};z-index:0;"></div>'

        title_fs = int(title_size * 1.15)

        parts = [f"""<div style="position:relative;z-index:2;display:flex;flex-direction:column;
  justify-content:center;height:100%;padding:60px 100px;box-sizing:border-box;">"""]
        if kicker_text:
            parts.append(f"""<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <span style="width:32px;height:2px;background:{self._accent};display:inline-block;"></span>
    <span style="font-size:15px;font-weight:700;letter-spacing:4px;opacity:0.6;text-transform:uppercase;
      font-family:{self._body_font};">{_esc(kicker_text)}</span>
  </div>""")
        parts.append(f"""<h1 style="font-family:{self._heading_font};font-size:{title_fs}px;
  font-weight:800;line-height:1.15;margin:0 0 28px 0;max-width:80%;letter-spacing:-0.5px;">{_esc(heading)}</h1>""")
        if subtitle:
            parts.append(f"""<p style="font-size:24px;opacity:0.85;line-height:1.5;margin:0 0 16px 0;
  max-width:60%;font-weight:300;">{_esc(subtitle)}</p>""")
        if hero_body:
            parts.append(f"""<p style="font-size:17px;opacity:0.65;line-height:1.7;max-width:50%;margin:0;
  border-left:3px solid {self._accent};padding-left:20px;">{_esc(hero_body)}</p>""")
        parts.append("</div>")
        return hero_overlay + img_html + "\n".join(parts)

    # ── Content page ──

    def _render_content(self, heading, body, cards, layout,
                        text_c, card_bg, title_size, image_url, bg):
        use_dark = self._is_dark(bg)
        heading_color = text_c if use_dark else self._primary
        parts = []

        # Top accent stripe
        parts.append(f'<div style="position:absolute;top:0;left:0;right:0;height:4px;background:{self._accent};z-index:1;opacity:0.8;"></div>')

        # Title section with decorative elements
        parts.append(f"""<div style="position:relative;z-index:1;padding:36px 60px 0 60px;">
  <div style="display:flex;align-items:baseline;gap:16px;">
    <h2 style="font-family:{self._heading_font};font-size:{title_size}px;font-weight:700;
      margin:0;color:{heading_color};line-height:1.2;">{_esc(heading)}</h2>
    <span style="width:40px;height:3px;background:{self._accent};border-radius:2px;align-self:flex-end;margin-bottom:6px;"></span>
  </div>
  {f'<p style="font-size:{self._body_min + 2}px;opacity:0.65;margin:8px 0 0 0;max-width:70%;line-height:1.5;">{_esc(body)}</p>' if body else ''}
</div>""")

        # Image hero overlay
        img_html = ""
        if image_url:
            img_html = f"""<div style="position:absolute;inset:0;z-index:0">
    <img src="{image_url}" style="width:100%;height:100%;object-fit:cover" alt="">
    <div style="position:absolute;inset:0;background:rgba(0,0,0,0.45)"></div>
  </div>"""

        # Cards area
        content_area = self._layout_cards(cards, layout, text_c, card_bg, use_dark, bg)
        parts.append(f"""<div style="position:relative;z-index:1;padding:24px 60px;box-sizing:border-box;">
{content_area}
</div>""")
        return img_html + "\n".join(parts)

    # ── Layout routing ──

    def _layout_cards(self, cards, layout, text_c, card_bg, use_dark, bg):
        if not cards:
            return self._empty_state(text_c)
        if layout == "dashboard":
            return self._layout_dashboard(cards, text_c, card_bg)
        elif layout == "three_column":
            return self._layout_n_column(cards, text_c, card_bg, 3)
        elif layout == "two_column":
            return self._layout_n_column(cards, text_c, card_bg, 2)
        elif layout == "two_column_asymmetric":
            return self._layout_asymmetric(cards, text_c, card_bg)
        elif layout == "mixed_grid":
            return self._layout_mixed(cards, text_c, card_bg)
        elif layout == "single_focus":
            return self._layout_single_focus(cards, text_c, card_bg)
        elif layout == "hero_grid":
            return self._layout_hero_grid(cards, text_c, card_bg)
        elif layout == "timeline":
            return self._render_timeline_cards(cards, text_c, card_bg)
        else:
            return self._layout_stacked(cards, text_c, card_bg)

    def _empty_state(self, text_c):
        return f"""<div style="display:flex;align-items:center;justify-content:center;
  min-height:400px;opacity:0.3;font-size:18px;font-style:italic;">
  内容区域 — 待填充
</div>"""

    # ── Card building ──

    def _make_card(self, card, text_c, card_bg, width=None, extra_style="",
                   show_accent_bar=True, color_override=None):
        title = card.get("title", "")
        body = card.get("body", "")
        chart = card.get("chart", {})
        role = card.get("role", "card")
        kicker = card.get("kicker", "")
        card_accent = color_override or card.get("accent_color", self._accent)

        chart_html = ""
        if chart:
            chart_html = self._render_chart(chart, card_bg)

        ws = f"width:{width};" if width else "flex:1;"
        accent_bar = f'<div style="width:40px;height:3px;background:{card_accent};border-radius:2px;margin-bottom:4px;flex-shrink:0;"></div>' if show_accent_bar else ''

        is_hero = role in ("hero", "summary")

        title_tag = "h3"
        title_fs = self._card_title_min + 6 if is_hero else self._card_title_min + 4
        body_fs = self._body_min + 4 if is_hero else self._body_min + 2

        return f"""<div style="
  {ws}
  background:{card_bg};
  border-radius:{self._border_radius}px;
  box-shadow:{self._shadow};
  padding:{'32px 28px' if is_hero else '24px 22px'};
  display:flex;flex-direction:column;
  gap:10px;
  box-sizing:border-box;
  position:relative;
  {extra_style}
">
  <div style="position:absolute;left:0;top:{self._border_radius}px;bottom:{self._border_radius}px;
    width:4px;background:{card_accent};border-radius:0 4px 4px 0;opacity:0.3;"></div>
  {f'<div style="font-size:11px;font-weight:700;letter-spacing:2.5px;opacity:0.35;text-transform:uppercase;">{_esc(kicker)}</div>' if kicker else ''}
  {f'<h3 style="font-family:{self._heading_font};font-size:{title_fs}px;font-weight:700;margin:0;color:{self._primary};line-height:1.3;">{_esc(title)}</h3>' if title else ''}
  {f'<p style="font-size:{body_fs}px;line-height:1.65;margin:0;opacity:0.78;">{_esc(body)}</p>' if body else ''}
  {chart_html}
</div>"""

    def _make_metric_card(self, card, text_c, card_bg, color_override=None):
        chart = card.get("chart", {})
        value = chart.get("value", "") if isinstance(chart, dict) else str(chart)
        label = card.get("title", "")
        body = card.get("body", "")
        card_accent = color_override or card.get("accent_color", self._accent)
        delta = chart.get("delta", "") if isinstance(chart, dict) else ""

        return f"""<div style="
  background:{card_bg};
  border-radius:{self._border_radius}px;
  box-shadow:{self._shadow};
  padding:32px 28px;
  text-align:center;
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  gap:10px;
  min-height:170px;
  flex:1;
  position:relative;
">
  <div style="position:absolute;top:0;left:20%;right:20%;height:3px;
    background:{card_accent};border-radius:0 0 3px 3px;opacity:0.5;"></div>
  <span style="font-family:{self._heading_font};font-size:52px;font-weight:800;
    color:{card_accent};line-height:1;">{_esc(str(value))}</span>
  {f'<span style="font-size:{self._card_title_max - 6}px;font-weight:700;color:{self._primary};">{_esc(label)}</span>' if label else ''}
  {f'<span style="font-size:{self._body_min}px;opacity:0.65;">{_esc(body)}</span>' if body else ''}
  {f'<span style="font-size:12px;opacity:0.5;margin-top:2px;">{_esc(delta)}</span>' if delta else ''}
</div>"""

    # ── Layout implementations ──

    def _layout_dashboard(self, cards, text_c, card_bg):
        metric_cards = [c for c in cards if c.get("chart")]
        other_cards = [c for c in cards if not c.get("chart")]
        parts = []
        if metric_cards:
            parts.append(f"""<div style="display:flex;gap:{self._gap}px;margin-bottom:{self._gap}px;">""")
            for i, c in enumerate(metric_cards[:4]):
                clr = self._chart_colors[i % len(self._chart_colors)]
                parts.append(self._make_metric_card(c, text_c, card_bg, color_override=clr))
            parts.append("</div>")
        if other_cards:
            parts.append(f"""<div style="display:flex;gap:{self._gap}px;">""")
            for i, c in enumerate(other_cards[:2]):
                clr = self._chart_colors[(len(metric_cards) + i) % len(self._chart_colors)]
                parts.append(self._make_card(c, text_c, card_bg, color_override=clr))
            parts.append("</div>")
        return "\n".join(parts) if parts else ""

    def _get_card_color(self, idx, used=0):
        """Rotate through chart_colors for visual variety across cards."""
        return self._chart_colors[(used + idx) % len(self._chart_colors)]

    def _layout_n_column(self, cards, text_c, card_bg, cols):
        n = min(len(cards), cols)
        parts = [f"""<div style="display:flex;gap:{self._gap}px;min-height:460px;">"""]
        for i in range(n):
            clr = self._get_card_color(i)
            parts.append(self._make_card(cards[i], text_c, card_bg, color_override=clr))
        parts.append("</div>")
        return "\n".join(parts)

    def _layout_asymmetric(self, cards, text_c, card_bg):
        if len(cards) < 2:
            return self._layout_n_column(cards, text_c, card_bg, 1)
        parts = [f"""<div style="display:flex;gap:{self._gap}px;min-height:460px;">"""]
        parts.append(self._make_card(cards[0], text_c, card_bg, width="62%",
                     color_override=self._chart_colors[0]))
        if len(cards) > 1:
            parts.append(f"""<div style="display:flex;flex-direction:column;gap:{self._gap}px;flex:1;">""")
            for i, c in enumerate(cards[1:4]):
                clr = self._get_card_color(i, used=1)
                parts.append(self._make_card(c, text_c, card_bg, color_override=clr))
            parts.append("</div>")
        parts.append("</div>")
        return "\n".join(parts)

    def _layout_mixed(self, cards, text_c, card_bg):
        if len(cards) < 2:
            return self._layout_n_column(cards, text_c, card_bg, 1)
        parts = []
        parts.append(self._make_card(cards[0], text_c, card_bg,
                     extra_style="margin-bottom:" + str(self._gap) + "px;",
                     color_override=self._chart_colors[0]))
        if len(cards) > 1:
            parts.append(f"""<div style="display:flex;gap:{self._gap}px;">""")
            for i, c in enumerate(cards[1:5]):
                clr = self._get_card_color(i, used=1)
                parts.append(self._make_card(c, text_c, card_bg, color_override=clr))
            parts.append("</div>")
        return "\n".join(parts)

    def _layout_single_focus(self, cards, text_c, card_bg):
        if not cards:
            return ""
        main = cards[0]
        others = cards[1:]
        parts = []
        parts.append(self._make_card(main, text_c, card_bg,
                     extra_style="margin-bottom:" + str(self._gap) + "px;min-height:300px;",
                     color_override=self._chart_colors[0]))
        if others:
            parts.append(f"""<div style="display:flex;gap:{self._gap}px;">""")
            for i, c in enumerate(others[:4]):
                clr = self._get_card_color(i, used=1)
                parts.append(self._make_card(c, text_c, card_bg, color_override=clr))
            parts.append("</div>")
        return "\n".join(parts)

    def _layout_hero_grid(self, cards, text_c, card_bg):
        if len(cards) <= 2:
            return self._layout_n_column(cards, text_c, card_bg, len(cards))
        hero = cards[0]
        grid = cards[1:]
        parts = [f"""<div style="display:flex;gap:{self._gap}px;margin-bottom:{self._gap}px;">"""]
        parts.append(self._make_card(hero, text_c, card_bg,
                     color_override=self._chart_colors[0]))
        parts.append("</div>")
        parts.append(f"""<div style="display:flex;gap:{self._gap}px;">""")
        for i in range(min(len(grid), 3)):
            clr = self._get_card_color(i, used=1)
            parts.append(self._make_card(grid[i], text_c, card_bg, color_override=clr))
        parts.append("</div>")
        return "\n".join(parts)

    def _layout_stacked(self, cards, text_c, card_bg):
        parts = [f"""<div style="display:flex;flex-direction:column;gap:{self._gap}px;">"""]
        for i, c in enumerate(cards[:6]):
            clr = self._get_card_color(i)
            parts.append(self._make_card(c, text_c, card_bg, color_override=clr))
        parts.append("</div>")
        return "\n".join(parts)

    # ── Timeline ──

    def _render_timeline(self, heading, cards, text_c, card_bg, title_size, bg):
        use_dark = self._is_dark(bg)
        hc = text_c if use_dark else self._primary
        parts = [f"""<div style="padding:36px 60px 0;position:relative;z-index:1;">
  <div style="display:flex;align-items:baseline;gap:16px;">
    <h2 style="font-family:{self._heading_font};font-size:{title_size}px;font-weight:700;margin:0;color:{hc};">{_esc(heading)}</h2>
    <span style="width:40px;height:3px;background:{self._accent};border-radius:2px;align-self:flex-end;margin-bottom:6px;"></span>
  </div>
</div>"""]
        parts.append(self._render_timeline_cards(cards, text_c, card_bg))
        # Top accent
        parts.insert(0, f'<div style="position:absolute;top:0;left:0;right:0;height:4px;background:{self._accent};z-index:1;opacity:0.8;"></div>')
        return "\n".join(parts)

    def _render_timeline_cards(self, cards, text_c, card_bg):
        n = len(cards)
        if n == 0:
            return ""
        step_w = min(195, 1060 // max(n, 1) - 20)
        total_w = n * step_w + (n - 1) * 20
        start = max(60, (1160 - total_w) // 2 + 60)

        items = []
        for i, card in enumerate(cards):
            left = start + i * (step_w + 20)
            title = card.get("title", "")
            body = card.get("body", "")
            step_accent = card.get("accent_color", self._accent)
            items.append(f"""<div style="
      position:absolute;left:{left}px;top:0;width:{step_w}px;
      background:{card_bg};border-radius:{self._border_radius}px;
      box-shadow:{self._shadow};padding:36px 16px 22px;text-align:center;
      box-sizing:border-box;
    ">
      <div style="width:36px;height:36px;border-radius:50%;
        background:{step_accent};color:white;margin:0 auto 12px;
        display:flex;align-items:center;justify-content:center;
        font-size:16px;font-weight:800;line-height:1;">{i + 1}</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:8px;color:{self._primary};
        line-height:1.3;">{_esc(title)}</div>
      <div style="font-size:13px;opacity:0.7;line-height:1.55;">{_esc(body[:120])}</div>
    </div>""")

        connector = ""
        if n > 1:
            cy = 18
            x1 = start + step_w // 2
            x2 = start + (n - 1) * (step_w + 20) + step_w // 2
            connector = f"""<div style="position:absolute;left:{x1}px;top:{cy}px;
  width:{x2 - x1}px;height:2px;background:{self._accent};opacity:0.15;"></div>"""

        return f"""<div style="position:relative;z-index:1;padding:20px 40px 60px;min-height:340px;">
{connector}
{"".join(items)}
</div>"""

    # ── TOC ──

    def _render_toc(self, heading, cards, text_c, card_bg, title_size, bg):
        use_dark = self._is_dark(bg)
        hc = text_c if use_dark else self._primary
        parts = [f'<div style="position:absolute;top:0;left:0;right:0;height:4px;background:{self._accent};z-index:1;opacity:0.8;"></div>']
        parts.append(f"""<div style="padding:36px 60px 0;position:relative;z-index:1;">
  <h2 style="font-family:{self._heading_font};font-size:{title_size}px;font-weight:700;margin:0 0 32px 0;color:{hc};">{_esc(heading)}</h2>
</div>
<div style="display:flex;flex-direction:column;gap:{self._gap}px;padding:0 60px;position:relative;z-index:1;max-width:900px;">""")
        for i, card in enumerate(cards[:8]):
            title = card.get("title", "")
            body = card.get("body", "")
            c = self._chart_colors[i % len(self._chart_colors)]
            parts.append(f"""<div style="
    background:{card_bg};border-radius:{self._border_radius}px;
    box-shadow:{self._shadow};padding:20px 28px;
    border-left:5px solid {c};
    display:flex;align-items:center;gap:20px;
  ">
    <span style="width:32px;height:32px;border-radius:50%;background:{c};color:white;
      display:flex;align-items:center;justify-content:center;
      font-size:14px;font-weight:700;flex-shrink:0;">{i + 1}</span>
    <div style="flex:1;">
      <div style="font-size:{self._card_title_min + 4}px;font-weight:700;color:{self._primary};margin-bottom:4px;">{_esc(title[:60])}</div>
      <div style="font-size:{self._body_min}px;opacity:0.7;line-height:1.5;">{_esc(body[:150])}</div>
    </div>
  </div>""")
        parts.append("</div>")
        return "\n".join(parts)

    # ── Data Hero ──

    def _render_data_hero(self, heading, cards, text_c, card_bg, title_size, bg):
        use_dark = self._is_dark(bg)
        hc = text_c if use_dark else self._primary
        parts = [f'<div style="position:absolute;top:0;left:0;right:0;height:4px;background:{self._accent};z-index:1;opacity:0.8;"></div>']
        parts.append(f"""<div style="padding:36px 60px 0;position:relative;z-index:1;">
  <h2 style="font-family:{self._heading_font};font-size:{title_size}px;font-weight:700;margin:0 0 32px 0;color:{hc};">{_esc(heading)}</h2>
</div>
<div style="display:flex;gap:{self._gap}px;padding:0 60px;flex-wrap:wrap;position:relative;z-index:1;">""")
        for card in cards[:6]:
            if card.get("chart"):
                parts.append(self._make_metric_card(card, text_c, card_bg))
            else:
                parts.append(self._make_card(card, text_c, card_bg, width="320px"))
        parts.append("</div>")
        return "\n".join(parts)

    # ── Chart rendering ──

    def _render_chart(self, chart, card_bg):
        if not isinstance(chart, dict):
            return ""
        ctype = chart.get("type", "")
        value = chart.get("value", "")
        label = chart.get("label", "")

        if ctype == "big_number":
            return f"""<div style="margin-top:6px;display:flex;align-items:baseline;gap:10px;">
  <span style="font-family:{self._heading_font};font-size:38px;font-weight:800;color:{self._accent};line-height:1;">{_esc(str(value))}</span>
  {f'<span style="font-size:14px;opacity:0.55;font-weight:500;">{_esc(label)}</span>' if label else ''}
</div>"""

        if ctype == "progress_bar":
            pct = min(float(value or 0), 100)
            return f"""<div style="margin-top:8px;">
  <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
    <span style="font-size:13px;font-weight:600;">{_esc(label)}</span>
    <span style="font-size:13px;color:{self._accent};font-weight:700;">{_esc(str(value))}</span>
  </div>
  <div style="height:12px;background:{card_bg};border-radius:6px;overflow:hidden;
    box-shadow:inset 0 1px 3px rgba(0,0,0,0.08);">
    <div style="height:100%;width:{pct}%;background:linear-gradient(90deg,{self._accent},{self._secondary});border-radius:6px;
      transition:width 0.5s;"></div>
  </div>
</div>"""

        if ctype == "bar":
            items = chart.get("items", [])
            if not items:
                return ""
            max_val = max((it.get("value", 0) for it in items), default=1)
            bars = []
            colors = self._chart_colors
            for j, it in enumerate(items):
                v = it.get("value", 0)
                name = it.get("name", "")
                w = max((v / max_val) * 100, 3) if max_val > 0 else 0
                c = colors[j % len(colors)]
                bars.append(f"""<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <span style="font-size:12px;width:70px;text-align:right;opacity:0.7;flex-shrink:0;">{_esc(name)}</span>
      <div style="flex:1;height:22px;background:{card_bg};border-radius:4px;overflow:hidden;
        box-shadow:inset 0 1px 2px rgba(0,0,0,0.06);">
        <div style="height:100%;width:{w}%;background:{c};border-radius:4px;"></div>
      </div>
      <span style="font-size:12px;font-weight:700;width:36px;flex-shrink:0;">{_esc(str(v))}</span>
    </div>""")
            return "\n".join(bars)

        if ctype == "donut":
            pct = min(float(value or 0), 100)
            return f"""<div style="display:flex;align-items:center;gap:20px;margin-top:8px;">
  <svg width="90" height="90" viewBox="0 0 90 90">
    <circle cx="45" cy="45" r="32" fill="none" stroke="rgba(128,128,128,0.1)" stroke-width="12"/>
    <circle cx="45" cy="45" r="32" fill="none" stroke="{self._accent}" stroke-width="12"
      stroke-dasharray="{pct * 2.01:.1f} 201" stroke-linecap="round" transform="rotate(-90 45 45)"/>
    <text x="45" y="49" text-anchor="middle" font-family="{self._heading_font}"
      font-size="18" font-weight="800" fill="{self._primary}">{_esc(str(value))}</text>
  </svg>
  <span style="font-size:14px;opacity:0.7;line-height:1.4;">{_esc(label)}</span>
</div>"""

        return ""

    # ── Assembly ──

    def _assemble(self, slides_html: list, title: str) -> str:
        slides = "\n".join(slides_html)
        return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{_esc(title)} — {_esc(self._name)}</title>
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{
  font-family: {self._body_font};
  background: #1a1a2e;
  color: {self._text};
}}
.deck {{
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 48px;
  padding: 48px 20px;
}}
.slide {{
  flex-shrink: 0;
  border-radius: 10px;
  box-shadow: {self._shadow_lg};
}}
@media print {{
  body {{ background: white; }}
  .deck {{ gap: 0; padding: 0; }}
  .slide {{ page-break-after: always; border-radius: 0; box-shadow: none; }}
}}
</style>
</head>
<body>
<div class="deck">
{slides}
</div>
</body>
</html>"""

    def _is_dark(self, hex_color: str) -> bool:
        if not hex_color or "url(" in hex_color or "linear-" in hex_color:
            return True
        c = hex_color.lstrip("#")
        if len(c) < 6:
            return True
        try:
            r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
            return (0.299 * r + 0.587 * g + 0.114 * b) < 128
        except Exception:
            return False


def _esc(text: str) -> str:
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _esc_url(text: str) -> str:
    return text.replace("<", "%3C").replace(">", "%3E").replace("#", "%23")


# ── Test ──

if __name__ == "__main__":
    test_data = [
        {"seq": 1, "type": "cover", "layout": "full_bleed",
         "zones": {"heading": "黑松露筋道波士顿龙虾炒饭",
                   "kicker": "道与术解析",
                   "lead": "分段控温拉油 · 二次炒制入味 · 淀粉保护层",
                   "cards": [{"role": "hero", "title": "核心技法",
                              "body": "海洋到森林的双重鲜香叠加，三段温差控制实现立体口感"}]}},
        {"seq": 2, "type": "content", "layout": "three_column",
         "zones": {"heading": "风味轮分析", "cards": [
             {"role": "card_0", "title": "咸 · 全程铺底", "body": "盐、生抽、蚝油、鸡粉协同作用"},
             {"role": "card_1", "title": "鲜 · 核心风味", "body": "龙虾+黑松露+黄油+龙虾汤的鲜味共振"},
             {"role": "card_2", "title": "甜 · 入口回味", "body": "糖与龙虾本味的收敛性甜味夹持"},
         ]}},
        {"seq": 3, "type": "content", "layout": "dashboard",
         "zones": {"heading": "风味维度数据", "cards": [
             {"role": "metric", "title": "鲜味强度", "chart": {"type": "big_number", "value": "9.5"}},
             {"role": "metric", "title": "技法步骤", "chart": {"type": "big_number", "value": "5"}},
             {"role": "summary", "title": "核心风味逻辑",
              "body": "龙虾提供谷氨酸鲜，黑松露提供鸟苷酸鲜，在黄油媒介下产生1+1>2的协同鲜效应"},
         ]}},
        {"seq": 4, "type": "summary", "layout": "single_focus",
         "zones": {"heading": "总结", "cards": [
             {"role": "hero", "title": "核心技法：分段温差控制",
              "body": "焯水低温定型 → 拉油中温锁水 → 炒制高温焦香，实现龙虾弹嫩、米饭筋道、风味穿透的立体口感"},
         ]}},
    ]

    designer = HTMLDesigner(style_name="business")
    info, html, out_dir, run_id = designer.render_deck(test_data, "龙虾炒饭解析")
    print(f"Generated {len(info)} slides → {out_dir}")
    print(f"HTML: {len(html)} chars")
