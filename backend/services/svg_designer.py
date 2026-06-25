"""Deck designer — renders SVG decks from AI-generated or code-structured slide data."""
import os
import json
import uuid
import yaml

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _resolve_preview_template():
    for d in [
        os.path.join(BASE_DIR, "ppt_agent", "skills", "_shared", "assets"),
        os.path.join(BASE_DIR, "services", "ppt_engine", "assets"),
    ]:
        p = os.path.join(d, "preview-template.html")
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
        self._accent = "#FF6900"
        self._primary = "#1a365d"
        self._background = "#ffffff"
        self._load_style()

    def _load_style(self):
        for d in [
            os.path.join(BASE_DIR, "ppt_agent", "skills", "_shared", "references", "styles"),
            os.path.join(BASE_DIR, "services", "ppt_engine", "styles"),
        ]:
            p = os.path.join(d, f"{self.style_name}.yaml")
            if os.path.exists(p):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        data = yaml.safe_load(f)
                    cs = data.get("color_scheme", {})
                    self._accent = cs.get("accent", "#FF6900")
                    self._primary = cs.get("primary", "#1a365d")
                    self._background = cs.get("background", "#ffffff")
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
        """Fallback: code-render basic SVGs from structured card data."""
        run_id = self._make_run_id()
        target = output_dir or os.path.join(BASE_DIR, "data", "exports")
        svg_dir = os.path.join(target, run_id) if not output_dir else output_dir
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

            svg = self._render_single_svg(seq, total, slide_type, heading, body, cards)
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

    def _render_single_svg(self, seq, total, slide_type, heading, body, cards):
        """Render a single basic SVG slide from structured data."""
        bg = self._background
        fg = "#1a202c" if _luminance(bg) > 0.5 else "#e2e8f0"
        accent = self._accent
        primary = self._primary

        card_rects = ""
        y = 160
        for ci, card in enumerate(cards):
            ctitle = card.get("title", "")
            cbody = card.get("body", "")
            h = max(80, 40 + 24 * (1 + cbody.count("\n") + len(cbody) // 60))
            card_rects += f"""<g transform="translate(60,{y})">
  <rect width="1160" height="{h}" rx="12" fill="{bg}" stroke="{accent}" stroke-width="1" stroke-opacity="0.15"/>
  <text x="28" y="32" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="{fg}">{ctitle}</text>
  <text x="28" y="58" font-family="system-ui, sans-serif" font-size="15" fill="{fg}" opacity="0.75">{cbody[:200]}</text>
</g>
"""
            y += h + 20

        return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="{bg}"/>
  <rect x="0" y="0" width="1280" height="90" fill="{primary}"/>
  <rect x="0" y="0" width="6" height="90" fill="{accent}"/>
  <text x="40" y="56" font-family="system-ui, sans-serif" font-size="32" font-weight="700" fill="#ffffff">{heading}</text>
  {card_rects}
  <text x="1220" y="700" text-anchor="end" font-family="system-ui, sans-serif" font-size="12" fill="{fg}" opacity="0.3">{seq:02d} / {total:02d}</text>
</svg>"""
