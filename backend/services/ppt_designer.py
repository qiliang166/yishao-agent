"""Design system engine for PPT generation.

Creates slides from scratch using python-pptx, driven by a DesignSystem
extracted from template rules and typography profiles."""
from dataclasses import dataclass, field
from typing import Optional
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor


@dataclass
class DesignSystem:
    """Colors, fonts, and spacing for slide creation."""
    # Colors as RGB tuples
    primary_color: tuple = (0xC0, 0x2E, 0x2E)       # red
    accent_color: tuple = (0xFF, 0x6D, 0x01)         # orange
    background_color: tuple = (0xFF, 0xFF, 0xFF)      # white
    text_color: tuple = (0x33, 0x33, 0x33)            # dark gray
    light_text_color: tuple = (0xFF, 0xFF, 0xFF)       # white
    # Fonts
    font_name: str = "Microsoft YaHei"
    title_size_pt: int = 36
    subtitle_size_pt: int = 20
    body_size_pt: int = 18
    small_size_pt: int = 12
    # Spacing in EMU
    slide_width: int = int(13.333 * 914400)
    slide_height: int = int(7.5 * 914400)
    margin_left: int = int(1.0 * 914400)
    margin_right: int = int(1.0 * 914400)
    margin_top: int = int(0.8 * 914400)
    margin_bottom: int = int(0.6 * 914400)
    line_spacing_ratio: float = 1.3


def _hex_to_rgb(hex_str: str) -> tuple:
    """Convert '#1a73e8' to (0x1a, 0x73, 0xe8)."""
    h = hex_str.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def extract_design(rules: dict, typography_profile: Optional[dict] = None) -> DesignSystem:
    """Build a DesignSystem from template rules and typography profile.

    Priority: rules.design_rules > typography_profile > hardcoded defaults.
    """
    ds = DesignSystem()

    design_rules = rules.get("design_rules", {}) if rules else {}

    # Colors
    colors = design_rules.get("colors", {})
    if "primary" in colors:
        ds.primary_color = _hex_to_rgb(colors["primary"])
    if "accent" in colors:
        ds.accent_color = _hex_to_rgb(colors["accent"])
    if "background" in colors:
        ds.background_color = _hex_to_rgb(colors["background"])
    if "text" in colors:
        ds.text_color = _hex_to_rgb(colors["text"])
    if "light_text" in colors:
        ds.light_text_color = _hex_to_rgb(colors["light_text"])

    # Fonts
    fonts = design_rules.get("fonts", {})
    if "font_name" in fonts:
        ds.font_name = fonts["font_name"]
    if "title_size" in fonts:
        ds.title_size_pt = fonts["title_size"]
    if "body_size" in fonts:
        ds.body_size_pt = fonts["body_size"]

    # Typography profile overrides
    if typography_profile:
        if "title_font_size_pt" in typography_profile:
            ds.title_size_pt = int(typography_profile["title_font_size_pt"])
        if "body_font_size_pt" in typography_profile:
            ds.body_size_pt = int(typography_profile["body_font_size_pt"])
        if "line_height_ratio" in typography_profile:
            ds.line_spacing_ratio = typography_profile["line_height_ratio"]

    return ds


# ── Internal helpers ──

def _rgb(clr: tuple) -> RGBColor:
    return RGBColor(*clr)


def _add_textbox(slide, left, top, width, height, text: str = "",
                 font_size_pt: int = 18, color=None, bold: bool = False,
                 alignment=PP_ALIGN.LEFT, font_name: str = "Microsoft YaHei",
                 word_wrap: bool = True):
    """Add a textbox with one paragraph, returning (shape, text_frame)."""
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = word_wrap
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(font_size_pt)
    p.font.bold = bold
    if color:
        p.font.color.rgb = _rgb(color)
    p.font.name = font_name
    p.alignment = alignment
    return txBox, tf


def _add_rect(slide, left, top, width, height, fill_color):
    """Add a filled rectangle shape."""
    shape = slide.shapes.add_shape(
        1,  # MSO_SHAPE.RECTANGLE
        left, top, width, height
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = _rgb(fill_color)
    shape.line.fill.background()  # no border
    return shape


# ── Builder registry ──

BUILDERS = {}


def _register(*types: str):
    def deco(fn):
        for t in types:
            BUILDERS[t] = fn
        return fn
    return deco


def build_slide(prs: Presentation, slide_type: str, zones: dict,
                design: DesignSystem):
    """Create a slide using the appropriate builder for slide_type.

    Falls back to build_content for unknown types.
    """
    builder = BUILDERS.get(slide_type, build_content)
    builder(prs, zones, design)


@_register("cover")
def build_cover(prs: Presentation, zones: dict, design: DesignSystem):
    """Full-bleed primary background, centered title + subtitle + date."""
    slide_layout = prs.slide_layouts[6]  # blank
    slide = prs.slides.add_slide(slide_layout)

    # Background
    bg = slide.background
    bg.fill.solid()
    bg.fill.fore_color.rgb = _rgb(design.primary_color)

    sw = design.slide_width
    sh = design.slide_height

    title = zones.get("title", "").strip()
    subtitle = zones.get("subtitle", "").strip()
    date = zones.get("date", "").strip()

    # Title — centered
    if title:
        _add_textbox(slide, Emu(design.margin_left), Emu(int(2.0 * 914400)),
                     Emu(design.slide_width - design.margin_left * 2), Emu(int(1.6 * 914400)),
                     title, font_size_pt=design.title_size_pt + 8,
                     color=design.light_text_color, bold=True,
                     alignment=PP_ALIGN.CENTER, font_name=design.font_name)

    # Subtitle
    if subtitle:
        _add_textbox(slide, Emu(design.margin_left), Emu(int(3.8 * 914400)),
                     Emu(design.slide_width - design.margin_left * 2), Emu(int(0.8 * 914400)),
                     subtitle, font_size_pt=design.subtitle_size_pt,
                     color=design.light_text_color, bold=False,
                     alignment=PP_ALIGN.CENTER, font_name=design.font_name)

    # Date — bottom right
    if date:
        _add_textbox(slide, Emu(int(8.0 * 914400)), Emu(int(6.5 * 914400)),
                     Emu(int(4.3 * 914400)), Emu(int(0.5 * 914400)),
                     date, font_size_pt=design.small_size_pt,
                     color=design.light_text_color, bold=False,
                     alignment=PP_ALIGN.RIGHT, font_name=design.font_name)


@_register("toc")
def build_toc(prs: Presentation, zones: dict, design: DesignSystem):
    """Left heading + numbered items with accent bars."""
    slide_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(slide_layout)

    heading = zones.get("heading", "目录").strip()
    items_text = zones.get("items", "").strip()

    # Heading
    _add_textbox(slide, Emu(design.margin_left), Emu(design.margin_top),
                 Emu(int(3.0 * 914400)), Emu(int(0.8 * 914400)), heading,
                 font_size_pt=design.title_size_pt,
                 color=design.primary_color, bold=True,
                 font_name=design.font_name)

    # Accent line under heading
    _add_rect(slide, Emu(design.margin_left), Emu(int(1.8 * 914400)),
              Emu(int(1.5 * 914400)), Emu(int(0.05 * 914400)),
              design.accent_color)

    # Items
    if items_text:
        items = [it.strip() for it in items_text.split('\n') if it.strip()]
        y = int(2.2 * 914400)
        for idx, item in enumerate(items):
            # Number badge
            num_text = f"{idx + 1:02d}"
            _add_textbox(slide, Emu(design.margin_left), Emu(y),
                         Emu(int(0.6 * 914400)), Emu(int(0.5 * 914400)),
                         num_text, font_size_pt=design.body_size_pt,
                         color=design.accent_color, bold=True,
                         font_name=design.font_name)
            # Item text
            _add_textbox(slide, Emu(int(2.0 * 914400)), Emu(y),
                         Emu(int(9.5 * 914400)), Emu(int(0.5 * 914400)),
                         item, font_size_pt=design.body_size_pt,
                         color=design.text_color, bold=False,
                         font_name=design.font_name)
            y += int(0.7 * 914400)


@_register("technique")
def build_technique(prs: Presentation, zones: dict, design: DesignSystem):
    """Title bar + operation steps + principle box + params row."""
    slide_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(slide_layout)

    heading = zones.get("heading", "").strip()
    operation = zones.get("operation", "").strip()
    principle = zones.get("principle", "").strip()
    params = zones.get("params", "").strip()

    # Title bar — primary color background
    _add_rect(slide, 0, 0, design.slide_width, int(1.2 * 914400), design.primary_color)
    if heading:
        _add_textbox(slide, Emu(design.margin_left), Emu(int(0.15 * 914400)),
                     Emu(int(11.3 * 914400)), Emu(int(0.9 * 914400)),
                     heading, font_size_pt=design.title_size_pt,
                     color=design.light_text_color, bold=True,
                     font_name=design.font_name)

    y = int(1.5 * 914400)

    # Operation steps
    if operation:
        _add_textbox(slide, Emu(design.margin_left), Emu(y),
                     Emu(int(2.0 * 914400)), Emu(int(0.4 * 914400)),
                     "▎操作步骤", font_size_pt=design.subtitle_size_pt,
                     color=design.primary_color, bold=True,
                     font_name=design.font_name)
        y += int(0.5 * 914400)
        line_count = max(1, len(operation) // 40 + operation.count('\n') + 1)
        _, tf = _add_textbox(slide, Emu(design.margin_left), Emu(y),
                             Emu(int(11.3 * 914400)), Emu(int(2.0 * 914400)),
                             operation, font_size_pt=design.body_size_pt,
                             color=design.text_color, bold=False,
                             font_name=design.font_name)
        y += int(line_count * 0.45 * 914400)

    # Principle box
    if principle:
        y += int(0.3 * 914400)
        _add_rect(slide, Emu(design.margin_left), Emu(y),
                  Emu(int(11.3 * 914400)), Emu(int(0.05 * 914400)),
                  design.accent_color)
        y += int(0.2 * 914400)
        _add_textbox(slide, Emu(design.margin_left), Emu(y),
                     Emu(int(11.3 * 914400)), Emu(int(0.8 * 914400)),
                     f"原理: {principle}", font_size_pt=design.body_size_pt,
                     color=design.accent_color, bold=False,
                     font_name=design.font_name)
        y += int(0.5 * 914400)

    # Params
    if params:
        y += int(0.2 * 914400)
        _add_textbox(slide, Emu(design.margin_left), Emu(y),
                     Emu(int(11.3 * 914400)), Emu(int(0.5 * 914400)),
                     f"参数: {params}", font_size_pt=design.small_size_pt,
                     color=design.text_color, bold=False,
                     font_name=design.font_name)


@_register("content")
def build_content(prs: Presentation, zones: dict, design: DesignSystem):
    """Generic content slide: heading + body text."""
    slide_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(slide_layout)

    heading = zones.get("heading", "").strip()
    body = zones.get("body", "").strip()

    # Heading
    if heading:
        _add_textbox(slide, Emu(design.margin_left), Emu(design.margin_top),
                     Emu(int(11.3 * 914400)), Emu(int(0.8 * 914400)), heading,
                     font_size_pt=design.title_size_pt,
                     color=design.primary_color, bold=True,
                     font_name=design.font_name)
        # Underline
        _add_rect(slide, Emu(design.margin_left), Emu(int(1.2 * 914400)),
                  Emu(int(11.3 * 914400)), Emu(int(0.03 * 914400)),
                  design.primary_color)

    # Body
    if body:
        _add_textbox(slide, Emu(design.margin_left), Emu(int(1.5 * 914400)),
                     Emu(int(11.3 * 914400)), Emu(int(5.0 * 914400)),
                     body, font_size_pt=design.body_size_pt,
                     color=design.text_color, bold=False,
                     font_name=design.font_name)


@_register("summary")
def build_summary(prs: Presentation, zones: dict, design: DesignSystem):
    """Summary slide with accent left bar and key points."""
    slide_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(slide_layout)

    heading = zones.get("heading", "总结").strip()
    points = zones.get("points", "").strip()

    # Left accent bar
    _add_rect(slide, Emu(int(0.5 * 914400)), Emu(int(1.5 * 914400)),
              Emu(int(0.08 * 914400)), Emu(int(4.5 * 914400)),
              design.accent_color)

    # Heading
    _add_textbox(slide, Emu(int(1.0 * 914400)), Emu(int(1.5 * 914400)),
                 Emu(int(11.3 * 914400)), Emu(int(0.8 * 914400)),
                 heading, font_size_pt=design.title_size_pt,
                 color=design.primary_color, bold=True,
                 font_name=design.font_name)

    # Points
    if points:
        point_list = [p.strip() for p in points.split('\n') if p.strip()]
        y = int(2.5 * 914400)
        for pt_text in point_list:
            _add_textbox(slide, Emu(int(1.0 * 914400)), Emu(y),
                         Emu(int(11.3 * 914400)), Emu(int(0.5 * 914400)),
                         f"✦ {pt_text}", font_size_pt=design.body_size_pt,
                         color=design.text_color, bold=False,
                         font_name=design.font_name)
            y += int(0.55 * 914400)


@_register("section")
def build_section(prs: Presentation, zones: dict, design: DesignSystem):
    """Section divider: primary background + heading + subtitle."""
    slide_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(slide_layout)

    bg = slide.background
    bg.fill.solid()
    bg.fill.fore_color.rgb = _rgb(design.primary_color)

    heading = zones.get("heading", "").strip()
    subtitle = zones.get("subtitle", "").strip()

    if heading:
        _add_textbox(slide, Emu(int(1.5 * 914400)), Emu(int(2.5 * 914400)),
                     Emu(int(10.3 * 914400)), Emu(int(1.2 * 914400)),
                     heading, font_size_pt=design.title_size_pt + 4,
                     color=design.light_text_color, bold=True,
                     alignment=PP_ALIGN.CENTER, font_name=design.font_name)

    if subtitle:
        _add_textbox(slide, Emu(int(1.5 * 914400)), Emu(int(3.8 * 914400)),
                     Emu(int(10.3 * 914400)), Emu(int(0.8 * 914400)),
                     subtitle, font_size_pt=design.subtitle_size_pt,
                     color=design.light_text_color, bold=False,
                     alignment=PP_ALIGN.CENTER, font_name=design.font_name)
