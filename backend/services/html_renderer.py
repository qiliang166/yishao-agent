"""HTML rendering engine for guizang slide_plan → HTML slides.

Uses guizang template CSS (template.html / template-swiss.html) as the
visual rendering engine. slide_plan is the universal intermediate
representation shared with the python-pptx pipeline.
"""
import os
import re
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE_DIR = os.path.join(BASE_DIR, "services", "ppt_engine")
ASSETS_DIR = os.path.join(ENGINE_DIR, "assets")
REF_DIR = os.path.join(ENGINE_DIR, "references")


# ── Template loading ──────────────────────────────────────────────

def _read(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _load_template_html(style_family: str) -> str:
    filename = "template-swiss.html" if style_family == "swiss" else "template.html"
    return _read(os.path.join(ASSETS_DIR, filename))


# ── CSS variable injection ────────────────────────────────────────

def _build_css_vars(design_rules: dict) -> str:
    """Build a :root CSS block from design_rules."""
    colors = design_rules.get("colors", {})
    fonts = design_rules.get("fonts", {})

    lines = []
    # Map design_rules colors to guizang CSS variable names
    if colors.get("accent"):
        lines.append(f"    --accent: {colors['accent']};")
    if colors.get("accent_rgb"):
        lines.append(f"    --accent-rgb: {colors['accent_rgb']};")
    if colors.get("ink"):
        lines.append(f"    --ink: {colors['ink']};")
    if colors.get("ink_rgb"):
        lines.append(f"    --ink-rgb: {colors['ink_rgb']};")
    if colors.get("paper"):
        lines.append(f"    --paper: {colors['paper']};")
    if colors.get("paper_rgb"):
        lines.append(f"    --paper-rgb: {colors['paper_rgb']};")
    if colors.get("primary"):
        lines.append(f"    --primary: {colors['primary']};")
    if colors.get("background"):
        lines.append(f"    --bg: {colors['background']};")

    if lines:
        return ":root {\n" + "\n".join(lines) + "\n  }"

    return ""


def _inject_theme(html: str, design_rules: dict) -> str:
    """Replace :root block in template with design_rules colors.

    Strategy: find the existing :root{...} block and replace its
    variable values. Variables not found in design_rules keep their
    template defaults. New variables (primary, bg) are appended.
    """
    colors = design_rules.get("colors", {})
    if not colors:
        return html

    var_map = {
        "accent": colors.get("accent"),
        "ink": colors.get("ink") or colors.get("text"),
        "paper": colors.get("paper") or colors.get("background"),
        "primary": colors.get("primary"),
        "bg": colors.get("background"),
        "accent-rgb": colors.get("accent_rgb"),
        "ink-rgb": colors.get("ink_rgb"),
        "paper-rgb": colors.get("paper_rgb"),
    }
    # Track which vars already exist in the template
    replaced = set()

    def _replace_var(m: re.Match) -> str:
        name = m.group(1)
        if name in var_map and var_map[name]:
            replaced.add(name)
            return f"--{name}: {var_map[name]};"
        return m.group(0)

    # Replace within the first :root block
    def _replace_root_block(m: re.Match) -> str:
        block = m.group(0)
        inner = m.group(1)
        new_inner = re.sub(r'--([\w-]+):\s*([^;]+);', _replace_var, inner)
        # Append new variables that weren't in the template
        extra = []
        for name in ("primary", "bg"):
            if name not in replaced and var_map.get(name):
                extra.append(f"    --{name}: {var_map[name]};")
        if extra:
            new_inner = new_inner.rstrip() + "\n" + "\n".join(extra) + "\n  "
        return block.replace(inner, new_inner)

    html = re.sub(r':root\s*\{([^}]*)\}', _replace_root_block, html, count=1, flags=re.DOTALL)
    return html


# ── Layout extraction from markdown references ─────────────────────

def _extract_layouts(style_family: str) -> dict:
    """Parse layouts markdown to extract HTML skeleton blocks.

    Returns dict of {layout_slug: html_skeleton}.
    """
    filename = "layouts-swiss.md" if style_family == "swiss" else "layouts.md"
    path = os.path.join(REF_DIR, filename)
    if not os.path.exists(path):
        return {}

    content = _read(path)
    layouts = {}

    # Collect all h3 sections (### headers) that contain an HTML block.
    # Use finditer to locate every ### header, then grab its body up to
    # the next ### or ## header.
    h3_starts = [m.end() for m in re.finditer(r'^###\s', content, re.MULTILINE)]
    h3_bodies = []
    for i, start in enumerate(h3_starts):
        end = h3_starts[i + 1] if i + 1 < len(h3_starts) else len(content)
        h3_bodies.append(content[start:end])

    for body in h3_bodies:
        lines = body.strip().split('\n')
        if not lines:
            continue
        header = lines[0].strip()

        html_match = re.search(r'```html\n(.*?)\n```', body, re.DOTALL)
        if not html_match:
            continue

        html = html_match.group(1)
        slug = _header_to_slug(header, style_family)
        if slug:
            layouts[slug] = html

    return layouts


def _header_to_slug(header: str, style_family: str) -> str:
    """Convert a layout section header to a usable slug."""
    header = header.strip()

    if style_family == "swiss":
        # "P1 · Cover · 封面页" → "p1"
        m = re.search(r'P(\d+)', header, re.IGNORECASE)
        if m:
            return f"p{m.group(1)}"
    else:
        # "Layout 1: 开场封面（Hero Cover）" → "layout-1"
        m = re.match(r'Layout\s+(\d+)', header, re.IGNORECASE)
        if m:
            return f"layout-{m.group(1)}"

    return ""


# ── Type → Layout mapping ─────────────────────────────────────────

# Maps slide_plan types to the closest guizang layout.
# Magazine style (layouts.md):
MAGAZINE_TYPE_MAP = {
    "cover":       "layout-1",   # Hero Cover
    "chapter":     "layout-2",   # Act Divider
    "data_hero":   "layout-3",   # Big Numbers Grid
    "content":     "layout-4",   # Quote + Image (left text, right image)
    "image_hero":  "layout-5",   # Image Grid
    "process_flow": "layout-6",  # Pipeline
    "quote":       "layout-8",   # Big Quote
    "duo_compare": "layout-9",   # A vs B
    "closing":     "layout-2",   # Use chapter layout as closing
    "toc":         "layout-4",   # Generic content layout
    "principle":   "layout-4",   # Content with emphasis
    "technique":   "layout-4",   # Content
    "grid_cards":  "layout-5",   # Image Grid / card grid
    "timeline":    "layout-6",   # Pipeline (closest match)
    "summary":     "layout-2",   # Chapter divider
    "section":     "layout-2",   # Chapter divider
    "food_archive": "layout-5",  # Grid layout
    "skill_card":  "layout-4",   # Content
    "troubleshoot": "layout-9",  # Before/After comparison
    "table":       "layout-4",   # Content
    "appendix":    "layout-4",   # Content
    "copyright":   "layout-2",   # Simple
}

# Swiss style (layouts-swiss.md):
SWISS_TYPE_MAP = {
    "cover":       "p1",    # Cover
    "chapter":     "p3",    # Statement (chapter divider)
    "data_hero":   "p6",    # KPI Tower
    "content":     "p5",    # Three Sub-cards / general content
    "process_flow": "p2",   # Vertical Timeline
    "quote":       "p3",    # Statement
    "duo_compare": "p8",    # Duo Compare
    "closing":     "p9",    # Closing Manifesto
    "toc":         "p4",    # Six Cells
    "principle":   "p5",    # Three Sub-cards
    "technique":   "p5",    # Three Sub-cards
    "grid_cards":  "p4",    # Six Cells
    "timeline":    "p2",    # Vertical Timeline
    "summary":     "p9",    # Closing
    "section":     "p3",    # Statement
    "image_hero":  "p1",    # Cover-style (image heavy)
    "food_archive": "p4",   # Grid
    "skill_card":  "p5",    # Sub-cards
    "troubleshoot": "p8",   # Duo Compare
    "table":       "p5",    # Sub-cards
    "appendix":    "p5",    # Sub-cards
    "copyright":   "p3",    # Statement
}


def _get_layout_map(style_family: str) -> dict:
    """Get the type→layout mapping for a style family."""
    return SWISS_TYPE_MAP if style_family == "swiss" else MAGAZINE_TYPE_MAP


# ── Zone filling ──────────────────────────────────────────────────

def _fill_zones(layout_html: str, zones: dict, style_family: str = "swiss") -> str:
    """Fill zone values into a layout HTML skeleton.

    Phase 1: CSS-class heuristics (zone_selectors)
    Phase 2: {{field}} template syntax
    Phase 3: [必填] placeholder replacement
    Phase 4: Auto-generate DOM elements for still-unmatched zones
    """
    if not zones:
        return layout_html

    html = layout_html

    # Zone → CSS class heuristics (magazine + swiss)
    zone_selectors = [
        ("title", [
            r'<h1[^>]*class="[^"]*h-hero[^"]*"[^>]*>.*?</h1>',
            r'<h1\b[^>]*>.*?</h1>',
            r'<h2\b[^>]*>.*?</h2>',
        ]),
        ("heading", [
            r'<h2[^>]*class="[^"]*h-xl[^"]*"[^>]*>.*?</h2>',
            r'<h2\b[^>]*>.*?</h2>',
        ]),
        ("subtitle", [
            r'<div[^>]*class="[^"]*lead[^"]*"[^>]*>.*?</div>',
            r'<p[^>]*class="[^"]*lead[^"]*"[^>]*>.*?</p>',
        ]),
        ("kicker", [
            r'<div[^>]*class="[^"]*(?:kicker|t-meta|t-cat)[^"]*"[^>]*>.*?</div>',
        ]),
        ("lead", [
            r'<div[^>]*class="[^"]*lead[^"]*"[^>]*>.*?</div>',
            r'<p[^>]*class="[^"]*lead[^"]*"[^>]*>.*?</p>',
        ]),
        ("body", [
            r'<p[^>]*class="[^"]*(?:lead|body-zh|body-serif|body-sm)[^"]*"[^>]*>.*?</p>',
        ]),
        ("body_text", [
            r'<p[^>]*class="[^"]*(?:lead|body-zh|body-serif|body-sm|body)[^"]*"[^>]*>.*?</p>',
        ]),
        ("quote", [
            r'<blockquote[^>]*>.*?</blockquote>',
        ]),
        ("footnote", [
            r'<div\s[^>]*style="[^"]*"[^>]*>\[必填\][^<]*</div>',
        ]),
        ("author", [
            r'<div[^>]*class="[^"]*t-meta[^"]*"[^>]*>\[选填\]?\s*作者[^<]*</div>',
            r'<div[^>]*class="[^"]*t-meta[^"]*"[^>]*>.*?</div>',
        ]),
        ("date", [
            r'<div[^>]*class="[^"]*t-meta[^"]*"[^>]*>\s*YY\.MM\.DD\s*</div>',
            r'<div[^>]*class="[^"]*t-meta[^"]*"[^>]*>\s*→\s*swipe\b[^<]*</div>',
            r'<div[^>]*class="[^"]*t-meta[^"]*"[^>]*>\s*\d{2}\.\d{2}\.\d{2}\s*</div>',
            r'<div[^>]*class="[^"]*t-meta[^"]*"[^>]*>\s*\d{4}\.\d{2}\s*</div>',
        ]),
        ("statement", [
            r'<h1[^>]*class="[^"]*h-statement[^"]*"[^>]*>.*?</h1>',
            r'<h1\b[^>]*>.*?</h1>',
        ]),
        ("declaration", [
            r'<h1[^>]*class="[^"]*h-statement[^"]*"[^>]*>.*?</h1>',
            r'<h2\b[^>]*>.*?</h2>',
        ]),
        ("text", [
            r'<(h2|h3|p)\b[^>]*>.*?</\1>',
        ]),
    ]

    handled = set()

    # Phase 1: CSS-class-based selectors
    for zone_key, value in zones.items():
        if not value or not isinstance(value, str):
            continue
        for sel_key, patterns in zone_selectors:
            if zone_key != sel_key:
                continue
            for pattern in patterns:
                m = re.search(pattern, html, re.DOTALL)
                if m:
                    old_elem = m.group(0)
                    tag_m = re.match(r'<(\w+)', old_elem)
                    tag = tag_m.group(1) if tag_m else 'p'
                    new_elem = re.sub(r'>.*?</' + tag + '>',
                                     f'>{_escape(value)}</{tag}>',
                                     old_elem, count=1, flags=re.DOTALL)
                    html = html.replace(old_elem, new_elem, 1)
                    handled.add(zone_key)
                    break
            break  # Zone matched its selector group; don't try other selector groups

    # Phase 2: {{field}} template syntax
    for zone_key, value in zones.items():
        if not value or not isinstance(value, str):
            continue
        tmpl = '{{' + zone_key + '}}'
        if tmpl in html:
            html = html.replace(tmpl, _escape(value))
            handled.add(zone_key)

    # Phase 3: [必填] placeholder fallback (for zones not handled above)
    for zone_key, value in zones.items():
        if not value or not isinstance(value, str):
            continue
        if zone_key in handled:
            continue
        if '[必填]' in html:
            html = html.replace('[必填]', _escape(value), 1)

    # Phase 4: Auto-generate elements for zones still unmatched
    unmatched = {k: v for k, v in zones.items()
                 if v and isinstance(v, str) and k not in handled}
    if unmatched:
        extra = [_gen_zone_elem(k, v, style_family) for k, v in unmatched.items()]
        extra = [e for e in extra if e]
        if extra:
            # Insert before last closing tag
            last_close = html.rfind('</')
            if last_close > 0:
                html = html[:last_close] + '\n  ' + '\n  '.join(extra) + '\n' + html[last_close:]
            else:
                html += '\n' + '\n'.join(extra)

    return html


def _escape(text: str) -> str:
    """Minimal HTML escape for text content."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _gen_zone_elem(zone_key: str, value: str, style_family: str) -> str:
    """Generate an HTML element for a zone unmatched by Phases 1-3."""
    is_swiss = style_family == "swiss"
    body_cls = "body-zh" if is_swiss else "body-zh"

    # Table zone → simple HTML table
    if zone_key == "table":
        return _gen_table(value, is_swiss)

    # List-type zones
    if zone_key in ("items", "points", "steps", "params", "metrics", "bullets",
                    "features", "benefits", "specs", "requirements", "rules"):
        return _gen_list(zone_key, value)

    # Quote
    if zone_key in ("quote", "citation", "testimonial"):
        return f'<blockquote><p>{_escape(value)}</p></blockquote>'

    # KPI / big number
    if zone_key in ("kpi", "metric", "number", "stat", "big_num"):
        return f'<div class="stat"><span class="kpi-num">{_escape(value)}</span></div>'

    # Heading-like
    if zone_key in ("heading", "subheading", "section_title", "label",
                    "tagline", "strapline"):
        return f'<h3>{_escape(value)}</h3>'

    # Code / pre
    if zone_key in ("code", "snippet", "command"):
        return f'<pre><code>{_escape(value)}</code></pre>'

    # Image URL → img tag
    if zone_key in ("image", "photo", "illustration", "icon", "logo",
                    "hero_image", "background"):
        if value.startswith("http") or value.startswith("/"):
            return f'<img src="{_escape(value)}" alt="" style="max-width:100%;height:auto" />'
        return f'<div class="img-placeholder" style="padding:4vh;border:1px dashed var(--ink);opacity:0.3;text-align:center">{_escape(value)}</div>'

    # Default: paragraph
    return f'<p class="{body_cls}">{_escape(value)}</p>'


def _gen_table(value: str, is_swiss: bool) -> str:
    """Parse a JSON-like table value into an HTML table."""
    rows = None
    # Try JSON array of arrays
    try:
        data = json.loads(value)
        if isinstance(data, list) and len(data) > 0:
            if isinstance(data[0], list):
                rows = data
            elif isinstance(data[0], dict):
                # Array of dicts: keys → header, values → rows
                keys = list(data[0].keys())
                rows = [keys] + [[str(d.get(k, "")) for k in keys] for d in data]
    except (json.JSONDecodeError, TypeError):
        pass

    # Try newline-separated with | or tab delimiter
    if rows is None:
        lines = [l.strip() for l in value.strip().split("\n") if l.strip()]
        if lines:
            rows = []
            for line in lines:
                if "|" in line:
                    rows.append([c.strip() for c in line.split("|")])
                elif "\t" in line:
                    rows.append([c.strip() for c in line.split("\t")])
                else:
                    rows.append([line])

    if not rows:
        return f'<p class="body-zh">{_escape(value)}</p>'

    parts = ['<table style="width:100%;border-collapse:collapse;margin-top:2vh;font-size:14px">']
    for i, row in enumerate(rows):
        tag = "th" if i == 0 else "td"
        style = 'style="padding:6px 10px;border-bottom:1px solid var(--ink);opacity:0.2"'
        parts.append("  <tr>")
        for cell in row:
            parts.append(f'    <{tag} {style}>{_escape(str(cell))}</{tag}>')
        parts.append("  </tr>")
    parts.append("</table>")
    return "\n".join(parts)


def _gen_list(zone_key: str, value: str) -> str:
    """Parse a value into an HTML list."""
    items = None
    # Try JSON array
    try:
        data = json.loads(value)
        if isinstance(data, list):
            items = [str(item) for item in data]
    except (json.JSONDecodeError, TypeError):
        pass

    # Try newline-separated
    if items is None:
        lines = [l.strip() for l in value.strip().split("\n") if l.strip()]
        # Strip common bullet prefixes
        items = [re.sub(r'^[-*•]\s*', '', l) for l in lines]

    if not items:
        return f'<p class="body-zh">{_escape(value)}</p>'

    parts = ['<ul style="margin-top:2vh;padding-left:1.2em;display:flex;flex-direction:column;gap:1vh;font-size:16px">']
    for item in items:
        parts.append(f'  <li>{_escape(item)}</li>')
    parts.append("</ul>")
    return "\n".join(parts)


# ── Slide HTML generation ─────────────────────────────────────────

def _generate_slide_html(slide_type: str, zones: dict, style_family: str,
                         layouts: dict, type_map: dict) -> str:
    """Generate HTML for a single slide.

    Uses the layout skeleton from the guizang references when available,
    falling back to a minimal generic slide when no layout matches.
    """
    layout_key = type_map.get(slide_type, "")
    layout_html = layouts.get(layout_key, "")

    if layout_html:
        filled = _fill_zones(layout_html, zones, style_family)
        return f'<section class="slide">\n{filled}\n</section>'

    # Fallback: generate a minimal slide using guizang CSS classes
    return _fallback_slide(slide_type, zones, style_family)


def _fallback_slide(slide_type: str, zones: dict, style_family: str) -> str:
    """Generate a minimal slide when no layout skeleton is available."""
    is_swiss = style_family == "swiss"

    if is_swiss:
        heading = zones.get("heading") or zones.get("title") or ""
        body = zones.get("body") or zones.get("content") or ""
        subtitle = zones.get("subtitle") or zones.get("lead") or ""
        kicker = zones.get("kicker") or ""

        parts = ['<section class="slide" data-layout="auto">',
                 '  <div class="canvas-card">',
                 '    <header class="chrome-min">',
                 f'      <div class="l">{_escape(kicker)}</div>',
                 f'      <div class="r">{_escape(slide_type)}</div>',
                 '    </header>']
        if heading:
            parts.append(f'    <h2 class="h-xl-zh">{_escape(heading)}</h2>')
        if subtitle:
            parts.append(f'    <p class="lead">{_escape(subtitle)}</p>')
        if body:
            parts.append(f'    <p class="body">{_escape(body)}</p>')
        # Render list items
        if zones.get("items"):
            items = zones["items"]
            if isinstance(items, str):
                try:
                    items = json.loads(items)
                except Exception:
                    items = [items]
            if isinstance(items, list):
                parts.append('    <ul style="margin-top:2vh;padding-left:1.2em;display:flex;flex-direction:column;gap:1vh;font-size:16px">')
                for item in items:
                    parts.append(f'      <li>{_escape(str(item))}</li>')
                parts.append('    </ul>')
        parts.extend([
            '  </div>',
            '</section>'])
        return '\n'.join(parts)

    # Magazine style fallback
    heading = zones.get("heading") or zones.get("title") or ""
    body = zones.get("body") or zones.get("content") or ""
    subtitle = zones.get("subtitle") or zones.get("lead") or ""
    kicker = zones.get("kicker") or ""

    theme_class = "light"
    if slide_type in ("cover", "chapter", "closing"):
        theme_class = "hero dark" if slide_type == "cover" else "hero light"

    parts = [f'<section class="slide {theme_class}">',
             '  <div class="chrome">',
             f'    <div>{_escape(kicker)}</div>',
             f'    <div>{_escape(slide_type)}</div>',
             '  </div>']
    parts.append('  <div class="frame" style="display:grid;gap:3vh;align-content:center;min-height:80vh">')

    if kicker and not zones.get("title") and not heading:
        parts.append(f'    <div class="kicker">{_escape(kicker)}</div>')

    if heading:
        cls = "h-hero" if slide_type in ("cover", "chapter") else "h-xl"
        parts.append(f'    <h1 class="{cls}">{_escape(heading)}</h1>')

    if subtitle:
        parts.append(f'    <p class="lead">{_escape(subtitle)}</p>')

    if body:
        parts.append(f'    <p class="body-zh">{_escape(body)}</p>')

    if zones.get("items"):
        items = zones["items"]
        if isinstance(items, str):
            try:
                items = json.loads(items)
            except Exception:
                items = [items]
        if isinstance(items, list):
            parts.append('    <ul style="margin-top:2vh;padding-left:1.2em;display:flex;flex-direction:column;gap:1vh;font-size:16px">')
            for item in items:
                parts.append(f'      <li>{_escape(str(item))}</li>')
            parts.append('    </ul>')

    parts.append('  </div>')
    parts.append('  <div class="foot">')
    parts.append(f'    <div>{_escape(slide_type)}</div>')
    parts.append('    <div>— · —</div>')
    parts.append('  </div>')
    parts.append('</section>')
    return '\n'.join(parts)


# ── Deck assembly ─────────────────────────────────────────────────

def _assemble_deck(template_html: str, slides_html: str) -> str:
    """Insert generated slide sections into the template HTML.

    Replaces the <body> content while preserving CSS, fonts, and JS.
    """
    # The template has WebGL canvases + #deck container. We need to
    # replace slide content inside #deck while keeping the structure.

    # Find the #deck div and replace its inner content
    deck_pattern = r'(<div\s+id="deck"[^>]*>)'
    m = re.search(deck_pattern, template_html)
    if m:
        # Insert slides right after the opening #deck tag
        insert_pos = m.end()
        # Find the closing </div> of #deck (simple approach: find next </section> or </div>)
        # Actually, remove all existing <section class="slide"> elements
        # and insert our own

        # Remove existing slide sections
        html = re.sub(r'<section\s+class="slide[^"]*"[^>]*>.*?</section>',
                      '', template_html, flags=re.DOTALL)

        # Also handle swiss-style slides
        html = re.sub(r'<section\s+class="slide[^"]*"[^>]*>.*?</section>',
                      '', html, flags=re.DOTALL)

        # Find #deck again in cleaned HTML
        m2 = re.search(r'(<div\s+id="deck"[^>]*>)\s*', html)
        if m2:
            insert_pos = m2.end()
            html = html[:insert_pos] + '\n' + slides_html + '\n' + html[insert_pos:]
            return html

    # Fallback: wrap slides in a minimal deck structure
    # Strip the template to just keep <head> + <style> + <body> wrapper
    head_match = re.search(r'<head>(.*?)</head>', template_html, re.DOTALL)
    style_match = re.search(r'<style>(.*?)</style>', template_html, re.DOTALL)

    head = head_match.group(1) if head_match else '<meta charset="UTF-8">'
    style = style_match.group(1) if style_match else ''

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
{head}
<style>
{style}
</style>
</head>
<body>
<div id="deck">
{slides_html}
</div>
</body>
</html>"""


# ── Public API ────────────────────────────────────────────────────

def render_slide_html(slide_type: str, zones: dict, style_family: str,
                      design_rules: dict) -> str:
    """Render a single slide_plan entry to a complete HTML page.

    Returns a full HTML document that can be opened directly in a browser
    or embedded in an iframe via srcdoc.
    """
    style_family = style_family or "swiss"
    template_html = _load_template_html(style_family)
    template_html = _inject_theme(template_html, design_rules)

    layouts = _extract_layouts(style_family)
    type_map = _get_layout_map(style_family)

    slide_html = _generate_slide_html(slide_type, zones, style_family,
                                      layouts, type_map)

    # For single slide preview, create a one-slide deck
    return _assemble_deck(template_html, slide_html)


def render_deck_html(slide_plan: list, style_family: str,
                     design_rules: dict) -> str:
    """Render a full slide_plan to a complete HTML page.

    Returns a full HTML document with all slides arranged horizontally
    in the guizang deck format (single-page app with horizontal scroll).
    """
    style_family = style_family or "swiss"
    template_html = _load_template_html(style_family)
    template_html = _inject_theme(template_html, design_rules)

    layouts = _extract_layouts(style_family)
    type_map = _get_layout_map(style_family)

    slides_parts = []
    for i, slide in enumerate(slide_plan):
        slide_type = slide.get("type", "content")
        zones = slide.get("zones", {})
        # Inject page number into zones if not present
        if "page_num" not in zones:
            zones = {**zones, "page_num": str(i + 1)}
        slide_html = _generate_slide_html(slide_type, zones, style_family,
                                          layouts, type_map)
        slides_parts.append(slide_html)

    all_slides = '\n'.join(slides_parts)
    return _assemble_deck(template_html, all_slides)
