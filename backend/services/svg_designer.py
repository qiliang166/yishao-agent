"""Deck designer — renders SVG decks from AI-generated or code-structured slide data."""
import os
import json
import uuid
import yaml

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _resolve_preview_template():
    p = os.path.join(BASE_DIR, "data", "assets", "preview-template.html")
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            return f.read()
    return "<html><body><h1>{{TITLE}}</h1><div id='slides'>{{SLIDES_JSON}}</div></body></html>"


def _hex_to_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def _luminance(hex_color: str) -> float:
    r, g, b = _hex_to_rgb(hex_color)
    vals = [v / 255.0 for v in (r, g, b)]
    vals = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in vals]
    return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2]


class DeckDesigner:
    def __init__(self, style_name: str = "business", branding: dict = None):
        self.style_name = style_name
        self.branding = branding or {}
        self._style_data = {}
        self._accent = "#FF6900"
        self._primary = "#1a365d"
        self._secondary = "#2d5f8a"
        self._background = "#ffffff"
        self._text = "#1a202c"
        self._card_bg = "#f0f4f8"
        self._heading_font = "system-ui, sans-serif"
        self._body_font = "system-ui, sans-serif"
        self._cjk_font = ""
        self._border_radius = 12
        self._card_shadow = ""
        self._card_border = ""
        self._card_gap = 24
        self._gradients = {}
        self._elevation = {}
        self._decoration = {}
        self._overrides = {}
        self._load_style()

    def _load_style(self):
        p = os.path.join(BASE_DIR, "data", "styles", f"{self.style_name}.yaml")
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
                self._style_data = data
                cs = data.get("color_scheme", {})
                self._accent = cs.get("accent", "#FF6900")
                self._primary = cs.get("primary", "#1a365d")
                self._secondary = cs.get("secondary", "#2d5f8a")
                self._background = cs.get("background", "#ffffff")
                self._text = cs.get("text", "#1a202c")
                self._card_bg = cs.get("card_bg", "#f0f4f8")
                typo = data.get("typography", {})
                self._heading_font = typo.get("heading_font", self._heading_font)
                self._body_font = typo.get("body_font", self._body_font)
                self._cjk_font = typo.get("cjk_font", "")
                card = data.get("card_style", {})
                self._border_radius = card.get("border_radius", 12)
                self._card_shadow = card.get("shadow", "")
                self._card_border = card.get("border", "")
                self._card_gap = card.get("gap", 24)
                self._gradients = data.get("gradients", {})
                self._elevation = data.get("elevation", {})
                self._decoration = data.get("decoration", {})
                self._overrides = data.get("slide_type_overrides", {})
            except Exception:
                pass
                return

    def _make_run_id(self):
        return uuid.uuid4().hex[:8]

    def _build_html(self, slides: list, title: str, accent: str) -> str:
        tpl = _resolve_preview_template()
        tpl = tpl.replace("{{TITLE}}", title)
        tpl = tpl.replace("{{LOGO}}", self.branding.get("logo", "PPT"))
        tpl = tpl.replace("{{ACCENT_COLOR}}", accent)
        tpl = tpl.replace("{{SLIDES_JSON}}", json.dumps(slides, ensure_ascii=False))
        return tpl

    # ── AI-SVG Path ──

    def render_deck_from_ai_svg(self, ai_svg_slides: list, title: str,
                                output_dir: str = None, dir_name: str = ""):
        """Write AI-generated SVGs to disk and create HTML preview."""
        run_id = self._make_run_id()
        target = output_dir or os.path.join(BASE_DIR, "data", "exports")
        svg_dir = os.path.join(target, run_id) if not output_dir else output_dir
        os.makedirs(svg_dir, exist_ok=True)

        slides_info = []
        for s in ai_svg_slides:
            seq = s.get("seq", 0)
            fname = s.get("file", f"slide-{seq:02d}.svg")
            fpath = os.path.join(svg_dir, fname)
            content = s.get("svg_content", "")
            if content and "<svg" in content:
                with open(fpath, "w", encoding="utf-8") as f:
                    f.write(content)
            slides_info.append({
                "seq": seq,
                "file": fname,
                "label": s.get("label", f"Slide {seq}"),
                "type": s.get("type", "content"),
            })

        preview_slides = [{"file": si["file"], "label": si["label"]} for si in slides_info]
        preview_html = self._build_html(preview_slides, title, self._accent)
        html_path = os.path.join(svg_dir, "index.html")
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(preview_html)

        return slides_info, preview_html, svg_dir, run_id

    # ── Code-rendered fallback path ──

    def render_deck(self, slide_data: list, title: str,
                    output_dir: str = None, dir_name: str = ""):
        """Code-render SVGs from structured card data."""
        run_id = self._make_run_id()
        target = output_dir or os.path.join(BASE_DIR, "data", "exports")
        svg_dir = os.path.join(target, run_id)
        os.makedirs(svg_dir, exist_ok=True)

        slides_info = []
        total = len([s for s in slide_data if isinstance(s, dict)])
        valid = [s for s in slide_data if isinstance(s, dict)]

        for i, sd in enumerate(valid):
            seq = sd.get("seq", i + 1)
            zones = sd.get("zones", {}) if isinstance(sd.get("zones"), dict) else {}
            heading = zones.get("heading", f"Slide {seq}")
            body = zones.get("body", "")
            cards = zones.get("cards", [])
            slide_type = sd.get("type", "content")
            image_url = zones.get("image_url", "") or zones.get("image", "")
            # Only use string URLs (filter out boolean True sentinel values)
            if not isinstance(image_url, str) or image_url in ("true", "True", "1"):
                image_url = ""

            layout = sd.get("layout", "")
            svg = self._render_single_svg(seq, total, slide_type, heading, body, cards, layout, image_url)
            fname = f"slide-{seq:02d}.svg"
            fpath = os.path.join(svg_dir, fname)
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(svg)

            slides_info.append({
                "seq": seq,
                "file": fname,
                "label": heading,
                "type": slide_type,
            })

        preview_slides = [{"file": si["file"], "label": si["label"]} for si in slides_info]
        preview_html = self._build_html(preview_slides, title, self._accent)
        html_path = os.path.join(svg_dir, "index.html")
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(preview_html)

        return slides_info, preview_html, svg_dir, run_id

    def _full_font(self) -> str:
        """Build font-family string with CJK support from style tokens."""
        return self._heading_font if self._heading_font else "system-ui, sans-serif"

    def _body_font_str(self) -> str:
        return self._body_font if self._body_font else "system-ui, sans-serif"

    def _wrap_text(self, text: str, max_chars: int) -> list:
        """Wrap CJK-aware text into lines. CJK chars count as ~1.8x."""
        lines = []
        current = ""
        current_len = 0.0
        for ch in text:
            w = 1.8 if '一' <= ch <= '鿿' or '　' <= ch <= '〿' else 1.0
            if current_len + w > max_chars:
                lines.append(current)
                current = ch
                current_len = w
            else:
                current += ch
                current_len += w
        if current:
            lines.append(current)
        return lines

    def _apply_slide_overrides(self, slide_type: str):
        """Apply per-slide-type color/scale overrides from style YAML."""
        ov = self._overrides.get(slide_type, {})
        bg = ov.get("background", self._background)
        text_c = ov.get("text", self._text)
        card_bg = ov.get("card_bg", self._card_bg)
        hs = ov.get("heading_scale", 1.0)
        # Cover uses hero gradient if no explicit background override
        if slide_type == "cover" and "background" not in ov:
            bg = "url(#heroBg)"
        return bg, text_c, card_bg, hs

    def _build_defs(self, slide_type: str) -> str:
        """Build <defs> section with gradients and shadow filters."""
        parts = []
        grad = self._gradients
        hero = grad.get("hero_bg", "")
        card_hl = grad.get("card_highlight", "")

        # Parse gradient strings like "linear-gradient(135deg, #1a365d 0%, #2a4a7f 100%)"
        import re
        def _parse_grad(gstr: str):
            m = re.search(r'linear-gradient\((\d+)deg,\s*(\S+)\s+(\d+)%,\s*(\S+)\s+(\d+)%\)', gstr)
            if m:
                angle = int(m.group(1))
                x1, y1 = "0%", "0%"
                if angle == 135:
                    x1, y1 = "0%", "0%"
                    x2, y2 = "100%", "100%"
                elif angle == 180:
                    x1, y1 = "0%", "0%"
                    x2, y2 = "0%", "100%"
                else:
                    x1, y1 = "0%", "0%"
                    x2, y2 = "100%", "100%"
                return (
                    m.group(2), m.group(3),
                    m.group(4), m.group(5),
                    x1, y1, x2, y2
                )
            return None

        if hero:
            pg = _parse_grad(hero)
            if pg:
                parts.append(
                    f'  <linearGradient id="heroBg" x1="{pg[4]}" y1="{pg[5]}" x2="{pg[6]}" y2="{pg[7]}">\n'
                    f'    <stop offset="{pg[1]}%" stop-color="{pg[0]}"/>\n'
                    f'    <stop offset="{pg[3]}%" stop-color="{pg[2]}"/>\n'
                    f'  </linearGradient>'
                )

        # Shadow filters
        for name, shadow_str in [("card-sm", self._elevation.get("shadow_sm", "")),
                                  ("card-md", self._elevation.get("shadow_md", "")),
                                  ("card-lg", self._elevation.get("shadow_lg", ""))]:
            if shadow_str:
                # Parse "0 2px 8px rgba(0,0,0,0.08)" → dx, dy, stdDev, opacity
                m2 = re.search(r'([\d.]+)(?:px)?\s+([\d.]+)(?:px)?\s+([\d.]+)(?:px)?\s+rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)', shadow_str)
                if m2:
                    parts.append(
                        f'  <filter id="{name}" x="-10%" y="-10%" width="120%" height="120%">\n'
                        f'    <feDropShadow dx="{m2.group(1)}" dy="{m2.group(2)}" stdDeviation="{m2.group(3)}" flood-color="#000000" flood-opacity="{m2.group(4)}"/>\n'
                        f'  </filter>'
                    )

        return "\n".join(parts) if parts else ""

    # ── Chart renderers ──

    def _render_chart(self, chart: dict, x: int, y: int, w: int, h: int,
                      accent: str, text_c: str, font_b: str) -> str:
        """Render a chart inside a card region. Returns SVG fragment."""
        ctype = chart.get("type", "")
        if ctype == "big_number":
            val = chart.get("value", 0)
            label = chart.get("label", "")
            return (
                f'    <text x="{x + w//2}" y="{y + 40}" text-anchor="middle" '
                f'font-family="{font_b}" font-size="48" font-weight="bold" fill="{accent}">{val}</text>\n'
                f'    <text x="{x + w//2}" y="{y + 68}" text-anchor="middle" '
                f'font-family="{font_b}" font-size="16" fill="{text_c}" opacity="0.6">{label}</text>\n'
            )
        if ctype == "progress_bar":
            pct = min(100, max(0, chart.get("value", 0) if chart.get("label", "").endswith("%") else chart.get("pct", 50)))
            bar_w = int(w * pct / 100)
            return (
                f'    <rect x="{x}" y="{y + 20}" width="{w}" height="16" rx="8" fill="{text_c}" opacity="0.1"/>\n'
                f'    <rect x="{x}" y="{y + 20}" width="{bar_w}" height="16" rx="8" fill="{accent}"/>\n'
                f'    <text x="{x + w//2}" y="{y + 56}" text-anchor="middle" '
                f'font-family="{font_b}" font-size="14" fill="{text_c}" opacity="0.7">{pct}%</text>\n'
            )
        if ctype == "bar":
            items = chart.get("items", [])
            bw = max(20, (w - (len(items) - 1) * 16) // max(len(items), 1))
            parts = []
            for i, it in enumerate(items):
                bx = x + i * (bw + 16)
                v = it.get("value", 0)
                bh = int(h * 0.7 * v / 100)
                parts.append(
                    f'    <rect x="{bx}" y="{y + h - 28 - bh}" width="{bw}" height="{bh}" rx="4" fill="{accent}" opacity="0.8"/>\n'
                    f'    <text x="{bx + bw//2}" y="{y + h - 8}" text-anchor="middle" '
                    f'font-family="{font_b}" font-size="11" fill="{text_c}" opacity="0.6">{it.get("label", "")}</text>\n'
                )
            return "".join(parts)
        # chart as decoration: colored stat box
        val = chart.get("value", "")
        label = chart.get("label", "")
        return (
            f'    <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{accent}" opacity="0.08"/>\n'
            f'    <text x="{x + w//2}" y="{y + h//2 - 6}" text-anchor="middle" '
            f'font-family="{font_b}" font-size="28" font-weight="bold" fill="{accent}">{val}</text>\n'
            f'    <text x="{x + w//2}" y="{y + h//2 + 20}" text-anchor="middle" '
            f'font-family="{font_b}" font-size="12" fill="{text_c}" opacity="0.6">{label}</text>\n'
        )

    def _card_svg(self, card: dict, cx: int, cy: int, cw: int, ch: int,
                  accent: str, primary: str, text_c: str, card_bg: str,
                  font_h: str, font_b: str, br: int, shadow_attr: str,
                  bar_color: str = "", emoji: str = "",
                  show_bar: bool = True, title_size: int = 20) -> str:
        """Render a single card as SVG. Returns SVG fragment."""
        ctitle = card.get("title", "")
        cbody = card.get("body", "")
        chart = card.get("chart")
        role = card.get("role", "")
        parts = []

        parts.append(f'  <g transform="translate({cx},{cy})">\n')
        parts.append(f'    <rect width="{cw}" height="{ch}" rx="{br}" fill="{card_bg}"{shadow_attr}/>\n')

        # Color bar at top
        if show_bar and bar_color:
            parts.append(f'    <rect x="0" y="0" width="{cw}" height="5" rx="2.5" fill="{bar_color}"/>\n')

        # Title with optional emoji prefix
        title_y = 42 if show_bar else 38
        prefix = f"{emoji} · " if emoji else ""
        if ctitle:
            parts.append(
                f'    <text x="26" y="{title_y}" font-family="{font_h}" font-size="{title_size}" '
                f'font-weight="bold" fill="{primary}">{prefix}{ctitle[:48]}</text>\n'
            )

        # Body text
        body_start_y = title_y + 24
        if cbody:
            # For narrower cards, wrap tighter
            wrap_width = int(cw / 13) if cw < 400 else int(cw / 12)
            body_lines = self._wrap_text(cbody, wrap_width)
            body_fs = 15 if cw < 400 else 16
            for li, bl in enumerate(body_lines[:8]):  # max 8 lines
                parts.append(
                    f'    <text x="26" y="{body_start_y + li * 24}" '
                    f'font-family="{font_b}" font-size="{body_fs}" fill="{text_c}" opacity="0.85">{bl}</text>\n'
                )

        # Chart rendering
        if chart:
            chart_y = body_start_y + (len(self._wrap_text(cbody, int(cw / 12))) * 24 if cbody else 0) + 16
            chart_h = min(120, ch - (chart_y - 0) - 20)
            parts.append(self._render_chart(chart, 26, chart_y, cw - 52, chart_h, accent, text_c, font_b))

        parts.append(f'  </g>\n')
        return "".join(parts)

    # ── Content page layout router ──

    def _render_content_page(self, seq, total, slide_type, heading, body, cards, layout,
                             bg, text_c, card_bg, accent, primary, secondary,
                             font_h, font_b, br, gap, defs, use_dark,
                             title_size, card_title_size, body_size, image_url=""):
        """Route content page rendering to appropriate layout."""
        content = ""

        # ── Hero image (full-width background image with overlay, for image_hero slides) ──
        if image_url and slide_type in ("image_hero",):
            content += f'  <image href="{image_url}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/>\n'
            content += f'  <rect x="0" y="0" width="1280" height="720" fill="#000000" opacity="0.50"/>\n'
            # Use white text on image overlay
            text_c_img = "#ffffff"
            primary_img = "#ffffff"
        else:
            text_c_img = text_c
            primary_img = primary

        # Top accent line (all content pages; skip on image_hero)
        if not image_url or slide_type not in ("image_hero",):
            content += f'  <rect x="0" y="0" width="1280" height="4" fill="{accent}"/>\n'
        # Title + decorative underline
        heading_color = primary_img if image_url and slide_type in ("image_hero",) else primary
        content += f'  <text x="60" y="82" font-family="{font_h}" font-size="38" font-weight="bold" fill="{heading_color}">{heading}</text>\n'
        content += f'  <rect x="60" y="100" width="80" height="3" rx="1.5" fill="{accent}"/>\n'

        shadow_attr = ' filter="url(#card-md)"' if defs and "card-md" in defs else ""
        # For image_hero slides, use light text on the dark overlay
        _t = text_c_img
        _p = primary_img

        # ── Route by layout ──
        if layout == "dashboard":
            content += self._layout_dashboard(cards, accent, _p, _t, card_bg,
                                               font_h, font_b, br, shadow_attr)
        elif layout == "three_column":
            content += self._layout_three_column(cards, accent, _p, _t, card_bg,
                                                  font_h, font_b, br, shadow_attr)
        elif layout == "mixed_grid":
            content += self._layout_mixed_grid(cards, accent, _p, _t, card_bg,
                                                font_h, font_b, br, gap, shadow_attr)
        elif layout == "single_focus":
            content += self._layout_single_focus(cards, heading, accent, _p, _t, card_bg,
                                                  font_h, font_b, br, shadow_attr)
        elif layout in ("two_column_asymmetric",):
            content += self._layout_two_col(cards, accent, _p, _t, card_bg,
                                             font_h, font_b, br, shadow_attr, asymmetric=True)
        elif layout in ("two_column", "hero_grid"):
            content += self._layout_two_col(cards, accent, _p, _t, card_bg,
                                             font_h, font_b, br, shadow_attr, asymmetric=False)
        else:
            content += self._layout_stacked(cards, accent, _p, _t, card_bg,
                                             font_h, font_b, br, gap, shadow_attr, use_dark)

        return content

    # ── Individual layout implementations ──

    def _layout_dashboard(self, cards, accent, primary, text_c, card_bg,
                          font_h, font_b, br, shadow_attr) -> str:
        """Dashboard: 1 large metric card + 2-3 metric/summary cards."""
        s = ""
        card_top = 130
        has_chart_cards = [c for c in cards if c.get("chart")]
        other_cards = [c for c in cards if not c.get("chart")]

        # Top row: big number cards (max 3)
        top_cards = has_chart_cards[:3] if has_chart_cards else cards[:3]
        if top_cards:
            n_top = len(top_cards)
            usable = 1160
            cw = (usable - (n_top - 1) * 16) // n_top
            for i, card in enumerate(top_cards):
                cx = 60 + i * (cw + 16)
                ch = 180
                s += self._card_svg(card, cx, card_top, cw, ch,
                                    accent, primary, text_c, card_bg,
                                    font_h, font_b, br, shadow_attr,
                                    bar_color=accent, show_bar=True, title_size=17)
            card_top += 200

        # Bottom row: summary cards
        if other_cards:
            summary = other_cards[0]
            cbody = summary.get("body", "")
            lines = self._wrap_text(cbody, 90)
            ch = 48 + len(lines) * 24
            s += self._card_svg(summary, 60, card_top, 1160, ch,
                                accent, primary, text_c, card_bg,
                                font_h, font_b, br, shadow_attr,
                                bar_color=accent, show_bar=True, title_size=20)

        return s

    def _layout_three_column(self, cards, accent, primary, text_c, card_bg,
                             font_h, font_b, br, shadow_attr) -> str:
        """Three equal columns."""
        s = ""
        card_top = 140
        n = min(len(cards), 3)
        cw = (1160 - (n - 1) * 20) // n
        chart_colors = ["#27ae60", "#2980b9", "#e67e22", "#8e44ad", "#c0392b"]

        for i in range(n):
            card = cards[i] if i < len(cards) else {}
            cx = 60 + i * (cw + 20)
            cbody = card.get("body", "")
            lines = self._wrap_text(cbody, int(cw / 12))
            ch = max(280, 80 + len(lines) * 22 + 20)
            bc = chart_colors[i % len(chart_colors)]
            s += self._card_svg(card, cx, card_top, cw, ch,
                                accent, primary, text_c, card_bg,
                                font_h, font_b, br, shadow_attr,
                                bar_color=bc, show_bar=True, title_size=19)

        return s

    def _layout_mixed_grid(self, cards, accent, primary, text_c, card_bg,
                           font_h, font_b, br, gap, shadow_attr) -> str:
        """Mixed grid: 1 wide hero card + 2 smaller cards side by side below."""
        s = ""
        card_top = 140

        if len(cards) >= 1:
            # Hero card (full width)
            hero = cards[0]
            cbody = hero.get("body", "")
            lines = self._wrap_text(cbody, 90)
            ch = max(160, 60 + len(lines) * 22)
            s += self._card_svg(hero, 60, card_top, 1160, ch,
                                accent, primary, text_c, card_bg,
                                font_h, font_b, br, shadow_attr,
                                bar_color=accent, show_bar=True, title_size=22)
            card_top += ch + gap

        # Bottom row: up to 3 smaller cards
        remaining = cards[1:4]
        if remaining:
            n_bot = len(remaining)
            cw = (1160 - (n_bot - 1) * 16) // n_bot
            for i, card in enumerate(remaining):
                cx = 60 + i * (cw + 16)
                cbody = card.get("body", "")
                lines = self._wrap_text(cbody, int(cw / 13))
                ch = max(200, 70 + len(lines) * 22)
                bc = ["#27ae60", "#2980b9", "#e67e22"][i % 3]
                s += self._card_svg(card, cx, card_top, cw, ch,
                                    accent, primary, text_c, card_bg,
                                    font_h, font_b, br, shadow_attr,
                                    bar_color=bc, show_bar=True, title_size=17)

        return s

    def _layout_single_focus(self, cards, heading, accent, primary, text_c, card_bg,
                             font_h, font_b, br, shadow_attr) -> str:
        """Single focus: one large centered card with prominent content."""
        s = ""
        card = cards[0] if cards else {"title": heading}
        ctitle = card.get("title", "")
        cbody = card.get("body", "")
        chart = card.get("chart")

        cw, cx = 900, 190
        cy = 150
        lines = self._wrap_text(cbody, 68)
        ch = 160 + len(lines) * 26
        if chart:
            ch += 120

        s += f'  <g transform="translate({cx},{cy})">\n'
        s += f'    <rect width="{cw}" height="{ch}" rx="{br}" fill="{card_bg}"{shadow_attr}/>\n'
        s += f'    <rect x="0" y="0" width="{cw}" height="5" rx="2.5" fill="{accent}"/>\n'
        # Large centered emoji-like icon (from card role)
        role_icons = {"hero": "★", "metric": "◆", "summary": "◎", "left": "○", "right": "●"}
        icon = role_icons.get(card.get("role", ""), "◆")
        s += f'    <text x="{cw//2}" y="70" text-anchor="middle" font-family="{font_h}" font-size="28" fill="{accent}" opacity="0.5">{icon}</text>\n'
        s += f'    <text x="{cw//2}" y="110" text-anchor="middle" font-family="{font_h}" font-size="28" font-weight="bold" fill="{primary}">{ctitle[:36]}</text>\n'

        by = 152
        for bl in lines[:10]:
            s += f'    <text x="{cw//2}" y="{by}" text-anchor="middle" font-family="{font_b}" font-size="18" fill="{text_c}" opacity="0.8">{bl}</text>\n'
            by += 26

        if chart:
            s += self._render_chart(chart, 100, by + 10, cw - 200, 100, accent, text_c, font_b)

        s += f'  </g>\n'
        return s

    def _layout_two_col(self, cards, accent, primary, text_c, card_bg,
                        font_h, font_b, br, shadow_attr, asymmetric=False) -> str:
        """Two-column layout (symmetric or asymmetric)."""
        s = ""
        if asymmetric:
            left_w, right_w = 660, 440
        else:
            left_w = right_w = 550
        gap_x = 24
        total_w = left_w + gap_x + right_w
        start_x = 60 + (1160 - total_w) // 2
        card_top = 140

        for ci, card in enumerate(cards[:2]):
            if ci == 0:
                cx, cw = start_x, left_w
                cr = card.get("role", "")
                is_pos = cr in ("left", "hero")
            else:
                cx, cw = start_x + left_w + gap_x, right_w
                is_pos = False

            bar_color = "#27ae60" if is_pos else "#c0392b"
            emoji = "目标" if is_pos else "警示"
            cbody = card.get("body", "")
            lines = self._wrap_text(cbody, int(cw / 14))
            ch = max(400, 110 + len(lines) * 30 + 90)

            # Card background
            s += f'  <g transform="translate({cx},{card_top})">\n'
            s += f'    <rect width="{cw}" height="{ch}" rx="{br}" fill="{card_bg}"{shadow_attr}/>\n'
            s += f'    <rect x="0" y="0" width="{cw}" height="5" rx="2.5" fill="{bar_color}"/>\n'
            s += f'    <text x="28" y="44" font-family="{font_h}" font-size="24" font-weight="bold" fill="{primary}">{emoji} · {card.get("title", "")}</text>\n'

            # Body with tspan
            s += f'    <text x="28" y="82" font-family="{font_b}" font-size="18" fill="{text_c}" opacity="0.9">\n'
            for li, bl in enumerate(lines):
                dy = 0 if li == 0 else 30
                s += f'      <tspan x="28" dy="{dy}">{bl}</tspan>\n'
            s += f'    </text>\n'

            # Highlight box
            hy = 82 + len(lines) * 30 + 24
            hh = 72
            summary_text = lines[0][:36] if lines else ""
            s += f'    <rect x="28" y="{hy}" width="{cw - 56}" height="{hh}" rx="8" fill="{bar_color}" opacity="0.08"/>\n'
            s += f'    <text x="48" y="{hy + 28}" font-family="{font_b}" font-size="15" font-weight="bold" fill="{bar_color}">{("核心要点" if is_pos else "常见后果")}：</text>\n'
            s += f'    <text x="48" y="{hy + 52}" font-family="{font_b}" font-size="14" fill="{text_c}" opacity="0.75">{summary_text}</text>\n'
            s += f'  </g>\n'

        return s

    def _layout_stacked(self, cards, accent, primary, text_c, card_bg,
                        font_h, font_b, br, gap, shadow_attr, use_dark) -> str:
        """Stacked single-column cards with improved style token usage."""
        s = ""
        if use_dark:
            card_top = 140
        else:
            s += f'  <rect x="0" y="0" width="1280" height="90" fill="{primary}"/>\n'
            s += f'  <rect x="0" y="0" width="6" height="90" fill="{accent}"/>\n'
            card_top = 140

        chart_colors = ["#27ae60", "#2980b9", "#e67e22", "#8e44ad", "#c0392b"]

        for ci, card in enumerate(cards):
            ctitle = card.get("title", "")
            cbody = card.get("body", "")
            chart = card.get("chart")
            body_lines = self._wrap_text(cbody, 80)
            card_h = max(100, 52 + len(body_lines) * 26)
            if chart:
                card_h += 100

            bc = chart_colors[ci % len(chart_colors)]

            s += f'  <g transform="translate(80,{card_top})">\n'
            s += f'    <rect width="1120" height="{card_h}" rx="{br}" fill="{card_bg}" stroke="{accent}" stroke-width="1" stroke-opacity="0.12"{shadow_attr}/>\n'
            # Left accent bar
            s += f'    <rect x="0" y="0" width="4" height="{card_h}" rx="2" fill="{bc}"/>\n'
            if ctitle:
                s += f'    <text x="28" y="32" font-family="{font_h}" font-size="20" font-weight="700" fill="{text_c}">{ctitle}</text>\n'
            by = 60 if ctitle else 36
            for bl in body_lines:
                s += f'    <text x="28" y="{by}" font-family="{font_b}" font-size="16" fill="{text_c}" opacity="0.8">{bl}</text>\n'
                by += 26

            if chart:
                s += self._render_chart(chart, 28, by + 8, 1064, 80, accent, text_c, font_b)

            s += f'  </g>\n'
            card_top += card_h + gap

        return s

    def _render_single_svg(self, seq, total, slide_type, heading, body, cards, layout="", image_url=""):
        """Render professional SVG slide from structured data using style tokens."""
        bg, text_c, card_bg, hs = self._apply_slide_overrides(slide_type)
        accent = self._accent
        primary = self._primary
        secondary = self._secondary
        font_h = self._full_font()
        font_b = self._body_font_str()
        br = self._border_radius
        gap = self._card_gap
        defs = self._build_defs(slide_type)
        # Cover with gradient is always dark; otherwise check luminance
        if bg.startswith("url("):
            use_dark = True
        else:
            use_dark = _luminance(bg) < 0.5

        # Font sizes (from style thresholds)
        title_size = int(44 * hs) if hs != 1.0 else 40
        card_title_size = 22
        body_size = 16
        page_size = 12

        # ── Build decorative elements ──
        decor = ""
        dec = self._decoration
        # Cover/section-divider always get decorative circles
        if slide_type in ("cover", "section_divider") or dec.get("pattern", "none") != "none":
            dop = dec.get("pattern_opacity", 0.03) or 0.03
            decor += f'  <circle cx="1100" cy="150" r="300" fill="#ffffff" opacity="{dop}"/>\n'
            decor += f'  <circle cx="200" cy="650" r="250" fill="#ffffff" opacity="{dop * 0.7:.2f}"/>\n'

        # Bottom accent line
        decor += f'  <path d="M 0 700 L 1280 700" stroke="{accent}" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.15"/>\n'

        # ── Build content ──
        content = ""
        cy = 160
        page_t_c = text_c  # default page number color; overridden for covers / image pages
        # Image pages always have dark overlay → white page number
        if slide_type in ("image_hero",) or image_url:
            page_t_c = "#ffffff"

        if slide_type == "cover":
            # Cover: hero area, large title centered
            # Derive text color from hero gradient: dark gradient → white text, light gradient → dark text
            t_c = "#ffffff" if use_dark else text_c
            page_t_c = t_c  # page number uses same contrast color
            title_size = int(48 * hs) if hs != 1.0 else 48

            # ── Background image (with dark overlay for readability) ──
            if image_url:
                content += f'  <image href="{image_url}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/>\n'
                content += f'  <rect x="0" y="0" width="1280" height="720" fill="#000000" opacity="0.55"/>\n'
                # Force dark text mode when we have an image with overlay
                t_c = "#ffffff"
                page_t_c = "#ffffff"
            subtitle = body if body else (cards[0].get("body", "") if cards else "")
            lead = ""
            if cards:
                for c in cards:
                    if c.get("role") == "hero" and c.get("body"):
                        lead = c.get("body", "")
                        break
            # Chapter label
            if cards:
                kicker = ""
                for c in cards:
                    k = c.get("title", "")
                    if k and c.get("role") != "hero":
                        kicker = k
                        break
                if not kicker and cards:
                    kicker = cards[0].get("title", "")
                if kicker:
                    content += f'  <text x="80" y="100" font-family="{font_h}" font-size="14" font-weight="bold" fill="{t_c}" opacity="0.5" letter-spacing="2">{kicker}</text>\n'
            content += f'  <text x="80" y="240" font-family="{font_h}" font-size="{title_size}" font-weight="bold" fill="{t_c}">{heading}</text>\n'
            if subtitle:
                content += f'  <text x="80" y="310" font-family="{font_h}" font-size="24" fill="{t_c}" opacity="0.85">{subtitle}</text>\n'
            if lead:
                body_lines = self._wrap_text(lead, 70)
                by = 440
                for bl in body_lines:
                    content += f'  <text x="80" y="{by}" font-family="{font_b}" font-size="{body_size}" fill="{t_c}" opacity="0.8">{bl}</text>\n'
                    by += 28

        elif slide_type == "toc":
            # Table of Contents: grid of chapter cards
            content += f'  <text x="80" y="80" font-family="{font_h}" font-size="{title_size}" font-weight="bold" fill="{text_c}">{heading}</text>\n'
            cols = 2
            card_w = 540
            card_h = 160
            for ci, card in enumerate(cards):
                row = ci // cols
                col = ci % cols
                cx = 80 + col * (card_w + 20)
                cy_card = 140 + row * (card_h + 20)
                ctitle = card.get("title", "")
                cbody = card.get("body", "")
                shadow_attr = ' filter="url(#card-md)"' if defs and "card-md" in defs else ""
                content += f"""  <g transform="translate({cx},{cy_card})">
        <rect width="{card_w}" height="{card_h}" rx="{br}" fill="{card_bg}" stroke="{accent}" stroke-width="1" stroke-opacity="0.1"{shadow_attr}/>
        <text x="28" y="48" font-family="{font_h}" font-size="{card_title_size}" font-weight="700" fill="{text_c}">{ctitle[:40]}</text>
        <text x="28" y="78" font-family="{font_b}" font-size="{body_size}" fill="{text_c}" opacity="0.7">{cbody[:120]}</text>
        <rect x="28" y="100" width="40" height="3" rx="2" fill="{accent}" opacity="0.4"/>
      </g>
    """
                cy = cy_card + card_h + 20

        elif slide_type in ("process_flow", "timeline"):
            # Timeline/process: horizontal steps
            content += f'  <text x="80" y="80" font-family="{font_h}" font-size="{title_size}" font-weight="bold" fill="{text_c}">{heading}</text>\n'
            n = len(cards)
            step_w = min(220, 1060 // max(n, 1) - 20)
            start_x = 80 + (1060 - n * step_w - (n - 1) * 20) // 2
            for ci, card in enumerate(cards):
                cx = start_x + ci * (step_w + 20)
                ctitle = card.get("title", "")
                cbody = card.get("body", "")
                shadow_attr = ' filter="url(#card-md)"' if defs and "card-md" in defs else ""
                content += f"""  <g transform="translate({cx},160)">
        <rect width="{step_w}" height="200" rx="{br}" fill="{card_bg}" stroke="{accent}" stroke-width="1" stroke-opacity="0.15"{shadow_attr}/>
        <circle cx="{step_w // 2}" cy="30" r="16" fill="{accent}" opacity="0.15"/>
        <circle cx="{step_w // 2}" cy="30" r="8" fill="{accent}"/>
        <text x="{step_w // 2}" y="80" text-anchor="middle" font-family="{font_h}" font-size="{card_title_size}" font-weight="700" fill="{text_c}">{ctitle}</text>
        <text x="{step_w // 2}" y="110" text-anchor="middle" font-family="{font_b}" font-size="{body_size}" fill="{text_c}" opacity="0.7">{cbody[:60]}</text>
      </g>
    """

        else:
            # ── Content / Table / Summary / Troubleshoot ──
            # Route by layout type for maximum visual diversity
            content += self._render_content_page(
                seq, total, slide_type, heading, body, cards, layout,
                bg, text_c, card_bg, accent, primary, secondary,
                font_h, font_b, br, gap, defs, use_dark,
                title_size, card_title_size, body_size, image_url)

        # ── Assemble ──
        bg_fill = bg if bg.startswith("url(") else bg
        defs_block = ""
        if defs:
            indented = '\n'.join('  ' + line if line.strip() else '' for line in defs.split('\n'))
            defs_block = f"  <defs>\n{indented}\n  </defs>"
        svg_parts = [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">',
            defs_block,
            f'  <rect width="1280" height="720" fill="{bg_fill}"/>',
            decor.rstrip('\n'),
            content.rstrip('\n'),
            f'  <text x="1220" y="700" text-anchor="end" font-family="{font_b}" font-size="{page_size}" fill="{page_t_c}" opacity="0.35">{seq:02d} / {total:02d}</text>',
            '</svg>',
        ]
        svg = '\n'.join(p for p in svg_parts if p)
        return svg
