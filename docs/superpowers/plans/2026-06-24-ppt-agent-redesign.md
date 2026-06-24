# PPT Agent 重设计 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 用"设计引擎 + python-pptx 原生创建"替代"模板克隆 + 文本替换"，实现可用的 PPT 生成

**Architecture:** 新增 `ppt_designer.py` 设计引擎，为每种 layout type 提供 builder 函数从空白 slide 创建幻灯片；修改 API 新增 `/api/ppt/plan` 端点回显 slide_plan；前端拆分"生成大纲"和"合成PPT"两步操作

**Tech Stack:** python-pptx, FastAPI, React/TypeScript

## Global Constraints

- 复用现有 Stage1/Stage2 AI pipeline（`_generate_slides_staged`），不重写 AI 部分
- 保留 `typography_profile` 和 `_normalize_formatting` 逻辑
- 不修改数据库 schema
- 不修改 template analyze 流程
- 前端遵守 CLAUDE.md 规则 2（异步操作模板）

---

### Task 1: 设计引擎 — 配色与字体系统

**Files:**
- Create: `backend/services/ppt_designer.py`

**Interfaces:**
- Produces: `DesignSystem` dataclass, `extract_design(rules, typography_profile)` → `DesignSystem`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_ppt_designer.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.ppt_designer import DesignSystem, extract_design

def test_extract_design_fallback():
    """Design system falls back to defaults when rules is empty."""
    ds = extract_design({}, None)
    assert ds.primary_color == (0xC0, 0x2E, 0x2E)  # default red
    assert ds.title_size_pt == 36
    assert ds.body_size_pt == 18
    assert ds.font_name == "Microsoft YaHei"

def test_extract_design_from_rules():
    """Design system reads colors and fonts from rules."""
    rules = {
        "design_rules": {
            "colors": {"primary": "#1a73e8", "accent": "#ff6d01", "background": "#ffffff", "text": "#333333"},
            "fonts": {"title_size": 40, "body_size": 16, "font_name": "SimHei"}
        }
    }
    ds = extract_design(rules, None)
    assert ds.primary_color == (0x1a, 0x73, 0xe8)
    assert ds.title_size_pt == 40
    assert ds.body_size_pt == 16
    assert ds.font_name == "SimHei"

def test_extract_design_from_typography():
    """Body/title sizes come from typography_profile when rules don't specify."""
    profile = {"body_font_size_pt": 14.0, "title_font_size_pt": 32.0, "line_height_ratio": 1.3}
    ds = extract_design({}, profile)
    assert ds.title_size_pt == 32
    assert ds.body_size_pt == 14
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd d:\YISHAOAGENT && python -m pytest tests/test_ppt_designer.py -v`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```python
# backend/services/ppt_designer.py
"""Design system engine for PPT generation.

Creates slides from scratch using python-pptx, driven by a DesignSystem
extracted from template rules and typography profiles."""
from dataclasses import dataclass, field
from typing import Optional


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
    slide_width: int = 13.333 * 914400  # 13.333 inches
    slide_height: int = 7.5 * 914400    # 7.5 inches
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd d:\YISHAOAGENT && python -m pytest tests/test_ppt_designer.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/ppt_designer.py tests/test_ppt_designer.py
git commit -m "feat: add DesignSystem and extract_design for PPT design engine"
```

---

### Task 2: 设计引擎 — Slide Builders

**Files:**
- Modify: `backend/services/ppt_designer.py` — add builder functions

**Interfaces:**
- Consumes: `DesignSystem` from Task 1
- Produces: `build_slide(prs, slide_type, zones, design)` — dispatcher; individual builders `build_cover()`, `build_toc()`, `build_technique()`, `build_content()`, `build_summary()`, `build_section()`

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_ppt_designer.py
from pptx import Presentation
from pptx.util import Inches, Pt
from services.ppt_designer import build_slide, build_cover, build_toc, build_technique, build_content, build_summary

def make_prs():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    return prs

def test_build_cover_creates_slide():
    prs = make_prs()
    ds = DesignSystem()
    zones = {"title": "测试菜品", "subtitle": "制作工艺", "date": "2024-01-01"}
    build_cover(prs, zones, ds)
    assert len(prs.slides) == 1
    slide = prs.slides[0]
    text_shapes = [sh for sh in slide.shapes if sh.has_text_frame]
    assert len(text_shapes) >= 2  # at least title + subtitle

def test_build_slide_dispatches():
    prs = make_prs()
    ds = DesignSystem()
    build_slide(prs, "cover", {"title": "T", "subtitle": "S"}, ds)
    assert len(prs.slides) == 1

def test_build_toc_with_items():
    prs = make_prs()
    ds = DesignSystem()
    zones = {"heading": "目录", "items": "1. 选材\n2. 备料\n3. 烹饪\n4. 装盘"}
    build_toc(prs, zones, ds)
    assert len(prs.slides) == 1

def test_build_technique_with_params():
    prs = make_prs()
    ds = DesignSystem()
    zones = {"heading": "焯水技法", "operation": "冷水下锅，大火烧开，撇去浮沫", "principle": "去腥除血水", "params": "水温: 100°C | 时间: 3分钟"}
    build_technique(prs, zones, ds)
    assert len(prs.slides) == 1

def test_build_content_long_text():
    prs = make_prs()
    ds = DesignSystem()
    zones = {"heading": "详细说明", "body": "这是一段很长的正文内容。" * 50}
    build_content(prs, zones, ds)
    assert len(prs.slides) == 1

def test_build_summary():
    prs = make_prs()
    ds = DesignSystem()
    zones = {"heading": "总结", "points": "要点一\n要点二\n要点三"}
    build_summary(prs, zones, ds)
    assert len(prs.slides) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd d:\YISHAOAGENT && python -m pytest tests/test_ppt_designer.py -v -k "build"`
Expected: FAIL — functions not defined

- [ ] **Step 3: Write builder implementations**

```python
# append to backend/services/ppt_designer.py
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor


def _rgb(clr: tuple) -> RGBColor:
    return RGBColor(*clr)


def _emu(inches: float) -> int:
    return int(inches * 914400)


def _add_textbox(slide, left, top, width, height, text: str = "",
                 font_size_pt: int = 18, color=None, bold: bool = False,
                 alignment=PP_ALIGN.LEFT, font_name: str = "Microsoft YaHei",
                 word_wrap: bool = True):
    """Add a textbox with one paragraph, returning (shape, text_frame)."""
    txBox = slide.shapes.add_textbox(Emu(left), Emu(top), Emu(width), Emu(height))
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
        Emu(left), Emu(top), Emu(width), Emu(height)
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = _rgb(fill_color)
    shape.line.fill.background()  # no border
    return shape


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

    sw, sh = design.slide_width, design.slide_height

    title = zones.get("title", "").strip()
    subtitle = zones.get("subtitle", "").strip()
    date = zones.get("date", "").strip()

    # Title — centered
    if title:
        _add_textbox(slide, _emu(1.5), _emu(2.0), _emu(10.3), _emu(1.6),
                     title, font_size_pt=design.title_size_pt + 8,
                     color=design.light_text_color, bold=True,
                     alignment=PP_ALIGN.CENTER, font_name=design.font_name)

    # Subtitle
    if subtitle:
        _add_textbox(slide, _emu(1.5), _emu(3.8), _emu(10.3), _emu(0.8),
                     subtitle, font_size_pt=design.subtitle_size_pt,
                     color=design.light_text_color, bold=False,
                     alignment=PP_ALIGN.CENTER, font_name=design.font_name)

    # Date — bottom right
    if date:
        _add_textbox(slide, _emu(8.0), _emu(6.5), _emu(4.3), _emu(0.5),
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
    _add_textbox(slide, design.margin_left, design.margin_top,
                 _emu(3.0), _emu(0.8), heading,
                 font_size_pt=design.title_size_pt,
                 color=design.primary_color, bold=True,
                 font_name=design.font_name)

    # Accent line under heading
    _add_rect(slide, design.margin_left, _emu(1.8), _emu(1.5), _emu(0.05),
              design.accent_color)

    # Items
    if items_text:
        items = [it.strip() for it in items_text.split('\n') if it.strip()]
        y = _emu(2.2)
        for idx, item in enumerate(items):
            # Number badge
            num_text = f"{idx + 1:02d}"
            _add_textbox(slide, design.margin_left, y, _emu(0.6), _emu(0.5),
                         num_text, font_size_pt=design.body_size_pt,
                         color=design.accent_color, bold=True,
                         font_name=design.font_name)
            # Item text
            _add_textbox(slide, _emu(2.0), y, _emu(9.5), _emu(0.5),
                         item, font_size_pt=design.body_size_pt,
                         color=design.text_color, bold=False,
                         font_name=design.font_name)
            y += _emu(0.7)


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
    _add_rect(slide, 0, 0, design.slide_width, _emu(1.2), design.primary_color)
    if heading:
        _add_textbox(slide, design.margin_left, _emu(0.15), _emu(11.3), _emu(0.9),
                     heading, font_size_pt=design.title_size_pt,
                     color=design.light_text_color, bold=True,
                     font_name=design.font_name)

    y = _emu(1.5)

    # Operation steps
    if operation:
        _add_textbox(slide, design.margin_left, y, _emu(2.0), _emu(0.4),
                     "▎操作步骤", font_size_pt=design.subtitle_size_pt,
                     color=design.primary_color, bold=True,
                     font_name=design.font_name)
        y += _emu(0.5)
        _, tf = _add_textbox(slide, design.margin_left, y, _emu(11.3), _emu(2.0),
                             operation, font_size_pt=design.body_size_pt,
                             color=design.text_color, bold=False,
                             font_name=design.font_name)
        # Measure text to update y — use line count approximation
        line_count = max(1, len(operation) // 40 + operation.count('\n') + 1)
        y += _emu(line_count * 0.45)

    # Principle box
    if principle:
        y += _emu(0.3)
        _add_rect(slide, design.margin_left, y, _emu(11.3), _emu(0.05), design.accent_color)
        y += _emu(0.2)
        _add_textbox(slide, design.margin_left, y, _emu(11.3), _emu(0.8),
                     f"💡 原理: {principle}", font_size_pt=design.body_size_pt,
                     color=design.accent_color, bold=False,
                     font_name=design.font_name)
        y += _emu(0.5)

    # Params
    if params:
        y += _emu(0.2)
        _add_textbox(slide, design.margin_left, y, _emu(11.3), _emu(0.5),
                     f"📋 参数: {params}", font_size_pt=design.small_size_pt,
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
        _add_textbox(slide, design.margin_left, design.margin_top,
                     _emu(11.3), _emu(0.8), heading,
                     font_size_pt=design.title_size_pt,
                     color=design.primary_color, bold=True,
                     font_name=design.font_name)
        # Underline
        _add_rect(slide, design.margin_left, _emu(1.2), _emu(11.3), _emu(0.03),
                  design.primary_color)

    # Body
    if body:
        _add_textbox(slide, design.margin_left, _emu(1.5), _emu(11.3), _emu(5.0),
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
    _add_rect(slide, _emu(0.5), _emu(1.5), _emu(0.08), _emu(4.5),
              design.accent_color)

    # Heading
    _add_textbox(slide, _emu(1.0), _emu(1.5), _emu(11.3), _emu(0.8),
                 heading, font_size_pt=design.title_size_pt,
                 color=design.primary_color, bold=True,
                 font_name=design.font_name)

    # Points
    if points:
        point_list = [p.strip() for p in points.split('\n') if p.strip()]
        y = _emu(2.5)
        for pt_text in point_list:
            _add_textbox(slide, _emu(1.0), y, _emu(11.3), _emu(0.5),
                         f"✦ {pt_text}", font_size_pt=design.body_size_pt,
                         color=design.text_color, bold=False,
                         font_name=design.font_name)
            y += _emu(0.55)


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
        _add_textbox(slide, _emu(1.5), _emu(2.5), _emu(10.3), _emu(1.2),
                     heading, font_size_pt=design.title_size_pt + 4,
                     color=design.light_text_color, bold=True,
                     alignment=PP_ALIGN.CENTER, font_name=design.font_name)

    if subtitle:
        _add_textbox(slide, _emu(1.5), _emu(3.8), _emu(10.3), _emu(0.8),
                     subtitle, font_size_pt=design.subtitle_size_pt,
                     color=design.light_text_color, bold=False,
                     alignment=PP_ALIGN.CENTER, font_name=design.font_name)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd d:\YISHAOAGENT && python -m pytest tests/test_ppt_designer.py -v`
Expected: 9 PASS (3 from Task 1 + 6 from Task 2)

- [ ] **Step 5: Commit**

```bash
git add backend/services/ppt_designer.py tests/test_ppt_designer.py
git commit -m "feat: add slide builders (cover, toc, technique, content, summary, section)"
```

---

### Task 3: 修改 generate_ppt 使用设计引擎

**Files:**
- Modify: `backend/services/ppt_service.py` — replace `_fill_template_slides` usage with `build_slide`
- Modify: `backend/models.py` — add `slide_plan` field to `PPTGenerateRequest`
- Modify: `backend/app.py` — update `api_generate_ppt` return value, add `/api/ppt/plan` endpoint

**Interfaces:**
- Consumes: `build_slide` from Task 2, `extract_design` from Task 1
- Produces: modified `generate_ppt(slide_plan=None)` — accepts optional pre-generated plan
- New endpoint: `POST /api/ppt/plan` → `{ slide_plan: [...] }`
- Modified endpoint: `POST /api/ppt/generate` → `{ filename, download_url, slide_plan }`

- [ ] **Step 1: Modify models.py**

```python
# In backend/models.py, modify PPTGenerateRequest:
class PPTGenerateRequest(BaseModel):
    content: str
    template_id: str = ""
    branding: Optional[dict] = None
    project_id: Optional[str] = None
    provider_id: str = ""
    model: str = ""
    slide_plan: Optional[list] = None  # NEW: pre-generated slide plan
```

- [ ] **Step 2: Modify generate_ppt in ppt_service.py**

Replace the main body of `generate_ppt` (lines 43-134) where it calls `_fill_template_slides`:

```python
# In generate_ppt, replace lines 79-102 (the AI + fill section):
from services.ppt_designer import extract_design, build_slide

# ... (template loading code stays the same up to line 78) ...

if slide_data is None and provider_id and model and rules and content.strip():
    slide_data = _generate_slides_staged(provider_id, model, rules, content,
                                         prompt, skill)

if prs is None:
    prs = Presentation()

prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

# Remove all existing slides from template (we build from scratch)
_remove_all_slides(prs)

# Extract design system
design = extract_design(rules, typography_profile)

if slide_data and isinstance(slide_data, list) and len(slide_data) > 0:
    for sd in slide_data:
        if not isinstance(sd, dict):
            continue
        slide_type = sd.get("type", "content")
        zones = sd.get("zones", {})
        if not isinstance(zones, dict):
            zones = {}
        build_slide(prs, slide_type, zones, design)
else:
    _mechanical_fill(prs, content)

# ... (branding, spacing, save code stays the same from line 104 onwards) ...
```

- [ ] **Step 3: Modify api_generate_ppt in app.py**

```python
# In api_generate_ppt, change the return statement:
@app.post("/api/ppt/generate")
def api_generate_ppt(req: PPTGenerateRequest):
    # ... existing code ...
    filepath = generate_ppt(
        req.content, req.template_id, req.branding, output_dir,
        req.provider_id, req.model, req.slide_plan  # pass slide_plan
    )
    # ... existing filename/download_url code ...
    return {
        "filename": filename,
        "download_url": download_url,
        "slide_plan": req.slide_plan  # echo back for display
    }
```

- [ ] **Step 4: Add /api/ppt/plan endpoint**

```python
# In app.py, add after api_generate_ppt:
class PPTPlanRequest(BaseModel):
    content: str
    template_id: str = ""
    provider_id: str = ""
    model: str = ""

@app.post("/api/ppt/plan")
def api_ppt_plan(req: PPTPlanRequest):
    """Generate slide plan only (no PPTX file). Returns JSON for user review."""
    from services.ppt_service import _generate_slides_staged
    db = get_db()
    try:
        rules = {}
        prompt = ""
        skill = ""
        if req.template_id:
            row = db.execute(
                "SELECT prompt, skill, rules FROM templates WHERE id = ?",
                (req.template_id,)).fetchone()
            if row:
                prompt = row["prompt"] or ""
                skill = row["skill"] or ""
                if row["rules"]:
                    try:
                        rules = json.loads(row["rules"])
                    except Exception:
                        pass
        if not rules:
            cfg = db.execute(
                "SELECT rules FROM column_configs WHERE column_id IN ('col4','col5') LIMIT 1"
            ).fetchone()
            if cfg and cfg["rules"]:
                rules = json.loads(cfg["rules"])

        slide_plan = _generate_slides_staged(
            req.provider_id, req.model, rules, req.content, prompt, skill
        )
        return {"slide_plan": slide_plan or []}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()
```

- [ ] **Step 5: Update generate_ppt signature to accept slide_plan**

```python
# ppt_service.py line 35:
def generate_ppt(content: str, template_id: str = None, branding: dict = None,
                 output_dir: str = None, provider_id: str = "",
                 model: str = "", slide_plan: list = None) -> str:
    # ... at line 79:
    if slide_plan is not None:
        slide_data = slide_plan  # use pre-generated plan, skip AI
    elif provider_id and model and rules and content.strip():
        slide_data = _generate_slides_staged(...)
```

- [ ] **Step 6: Test the flow**

Run: Start backend server, then:
```bash
# Test plan endpoint
curl -s -X POST http://localhost:8700/api/ppt/plan \
  -H "Content-Type: application/json" \
  -d '{"content":"测试内容：选材、备料、烹饪三步","template_id":"default-dao","provider_id":"...","model":"..."}' \
  | python -c "import sys,json; d=json.load(sys.stdin); print(f'slides={len(d.get(\"slide_plan\",[]))}')"

# Test generate endpoint with slide_plan
curl -s -X POST http://localhost:8700/api/ppt/generate \
  -H "Content-Type: application/json" \
  -d '{"content":"test","template_id":"default-dao","slide_plan":[{"type":"cover","zones":{"title":"Test","subtitle":"Sub","date":"2024"}}]}' \
  | python -c "import sys,json; d=json.load(sys.stdin); print(f'file={d.get(\"filename\")} plan={bool(d.get(\"slide_plan\"))}')"
```

- [ ] **Step 7: Commit**

```bash
git add backend/models.py backend/services/ppt_service.py backend/app.py
git commit -m "feat: replace template cloning with design engine, add /api/ppt/plan endpoint"
```

---

### Task 4: 前端 — 拆分生成大纲和合成PPT

**Files:**
- Modify: `frontend/src/services/api.ts` — add `generatePPTPlan`, update `generatePPT`
- Modify: `frontend/src/pages/ProjectPage.tsx` — split buttons, slide_plan flow

**Interfaces:**
- Consumes: `/api/ppt/plan` and `/api/ppt/generate` from Task 3
- Produces: two-step UI flow for PPT generation

- [ ] **Step 1: Update api.ts**

```typescript
// Add after generatePPT (line 362):
generatePPTPlan: (content: string, templateId?: string, providerId?: string, model?: string) =>
  request('/api/ppt/plan', { method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({content, template_id: templateId || '', provider_id: providerId || '', model: model || ''}) }),

// Update generatePPT to accept slidePlan:
generatePPT: (content: string, templateId?: string, branding?: Record<string, string>, projectId?: string, providerId?: string, model?: string, slidePlan?: any[]) =>
  request('/api/ppt/generate', { method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({content, template_id: templateId || '', branding, project_id: projectId || null,
      provider_id: providerId || '', model: model || '', slide_plan: slidePlan || null}) }),
```

- [ ] **Step 2: Update ProjectPage.tsx — replace doGeneratePPT and add doGeneratePlan**

Replace the `doGeneratePPT` function (line 614-628) with:

```typescript
const doGeneratePlan = async (stepKey: string, content: string, tmplId: string, model: string) => {
  setPptGenerating(stepKey)
  try {
    const [pid, mdl] = model ? model.split(':') : ['', '']
    const result: any = await api.generatePPTPlan(content, tmplId, pid, mdl)
    const plan = result.slide_plan || []
    // Display plan JSON in the textarea
    setSteps(prev => ({ ...prev, [stepKey]: JSON.stringify(plan, null, 2) }))
    saveStep(stepKey, JSON.stringify(plan, null, 2))
    modal.toast(`大纲已生成: ${plan.length} 页幻灯片`, 'success')
  } catch (e: any) { modal.toast('生成大纲失败: ' + e.message, 'error') }
  finally { setPptGenerating('') }
}

const doGeneratePPT = async (stepKey: string, content: string, tmplId: string, label: string, model: string) => {
  setPptGenerating(stepKey)
  try {
    const branding = (globalBranding.copyright || globalBranding.signature) ? globalBranding : undefined
    const [pid, mdl] = model ? model.split(':') : ['', '']
    // Parse slide_plan from textarea
    let slidePlan = null
    const planText = steps[stepKey] || ''
    if (planText.trim()) {
      try { slidePlan = JSON.parse(planText) }
      catch { modal.toast('大纲 JSON 格式错误，请检查', 'error'); setPptGenerating(''); return }
    }
    const result: any = await api.generatePPT(content, tmplId, branding, id, pid, mdl, slidePlan)
    setGenFiles(prev => [...prev, {
      name: result.filename, type: 'PPT',
      source: label,
      url: result.download_url || '/api/download/' + encodeURIComponent(result.filename),
    }])
    modal.toast(`PPT 已生成: ${result.filename}`, 'success')
  } catch (e: any) { modal.toast('PPT生成失败: ' + e.message, 'error') }
  finally { setPptGenerating('') }
}
```

- [ ] **Step 3: Update Stage 3b/3c JSX — replace single button with two buttons**

For sub='3b' (around line 1330), replace the single "合成道术PPT" button with:

```tsx
<div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
  <button className="btn btn-outline btn-sm"
    style={{ flex: 1 }}
    disabled={pptGenerating !== '' || !s3DaoPptModel || !(steps.step2_daoshuyi || '')}
    onClick={() => doGeneratePlan('step3_dao_ppt', steps.step2_daoshuyi || '', daoPptSelected, s3DaoPptModel)}>
    {pptGenerating === 'step3_dao_ppt' ? '⏳ 生成中...' : '📝 生成大纲'}
  </button>
  <button className="btn btn-primary btn-sm"
    style={{ flex: 1 }}
    disabled={pptGenerating !== '' || !(steps.step3_dao_ppt || '')}
    onClick={() => doGeneratePPT('step3_dao_ppt', steps.step2_daoshuyi || '', daoPptSelected, '道术PPT', s3DaoPptModel)}>
    {pptGenerating === 'step3_dao_ppt' ? '⏳ 合成中...' : '📌 合成PPT'}
  </button>
</div>
```

For sub='3c', same pattern with `step3_yan_ppt`, `steps.step2_yanxi`, `yanxiPptSelected`, `s3YanxiPptModel`.

- [ ] **Step 4: Test the full flow in browser**

1. Open project page, navigate to Stage 3 → 道术PPT
2. Click "生成大纲" — verify slide_plan JSON appears in textarea
3. Edit the JSON if desired
4. Click "合成PPT" — verify PPT file appears in right-side file list
5. Download and open the PPTX — verify slides have proper layout, colors, fonts

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/pages/ProjectPage.tsx
git commit -m "feat: split PPT flow into plan + synthesize, show slide_plan in textarea"
```

---

### Task 5: 集成测试与端到端验证

**Files:**
- Create: `tests/test_ppt_e2e.py`

- [ ] **Step 1: Write end-to-end test**

```python
# tests/test_ppt_e2e.py
import sys, os, json, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from pptx import Presentation
from services.ppt_service import generate_ppt
from services.ppt_designer import extract_design, build_slide, DesignSystem

SAMPLE_RULES = {
    "layout_types": [
        {"id": "cover", "name": "封面", "zones": ["title", "subtitle", "date"]},
        {"id": "toc", "name": "目录", "zones": ["heading", "items"]},
        {"id": "technique", "name": "技法", "zones": ["heading", "operation", "principle", "params"]},
        {"id": "content", "name": "内容", "zones": ["heading", "body"]},
        {"id": "summary", "name": "总结", "zones": ["heading", "points"]},
    ],
    "design_rules": {
        "colors": {"primary": "#C02E2E", "accent": "#FF6D01", "background": "#FFFFFF", "text": "#333333"},
        "fonts": {"title_size": 36, "body_size": 18, "font_name": "Microsoft YaHei"}
    }
}

SAMPLE_PLAN = [
    {"type": "cover", "zones": {"title": "红烧肉制作工艺", "subtitle": "传统技法与现代标准", "date": "2024-01-01"}},
    {"type": "toc", "zones": {"heading": "目录", "items": "01 选材标准\n02 备料工序\n03 烹饪技法\n04 装盘出品"}},
    {"type": "technique", "zones": {"heading": "焯水去腥", "operation": "五花肉切3cm方块，冷水下锅，加姜片料酒，大火烧开撇去浮沫，捞出沥干备用。", "principle": "高温使蛋白质凝固，血水析出形成浮沫，撇除可去腥增鲜", "params": "水温: 100°C | 时间: 3-5分钟 | 肉块: 3cm见方"}},
    {"type": "technique", "zones": {"heading": "糖色上色", "operation": "冷锅下冰糖，小火慢熬至枣红色起泡，迅速下入肉块翻炒均匀上色。", "principle": "焦糖化反应使糖分解产生红褐色物质，附着肉表面形成红亮色泽", "params": "冰糖: 30g | 温度: 160-180°C | 时间: 2-3分钟"}},
    {"type": "content", "zones": {"heading": "收汁关键控制点", "body": "收汁是红烧肉出锅前的最后一道工序。此时应转大火，不断翻动肉块使汤汁均匀包裹。\\n\\n关键指标：\\n1. 汤汁浓稠度 — 能挂在肉块表面不滴落\\n2. 色泽 — 红亮油润无反黑\\n3. 咸度 — 收汁后浓度提高，前期调味宜淡\\n\\n常见问题：火太大导致焦底；翻动不及时导致着色不均。"}},
    {"type": "summary", "zones": {"heading": "核心要点总结", "points": "选材标准：五花三层，肥瘦比例3:7\n焯水火候：冷水下锅，沸而不滚\n糖色控制：枣红色起泡为最佳时机\n收汁判断：能挂壁不滴落即出锅"}},
]

def test_design_engine_full_flow():
    """Build a complete PPT from sample plan using design engine."""
    prs = Presentation()
    prs.slide_width = 13.333 * 914400
    prs.slide_height = 7.5 * 914400
    ds = extract_design(SAMPLE_RULES, None)

    for sd in SAMPLE_PLAN:
        build_slide(prs, sd["type"], sd.get("zones", {}), ds)

    assert len(prs.slides) == 6

    with tempfile.NamedTemporaryFile(suffix='.pptx', delete=False) as f:
        prs.save(f.name)
        saved_size = os.path.getsize(f.name)
        assert saved_size > 10000  # PPTX file has content
        print(f"Saved PPTX: {f.name} ({saved_size} bytes)")

    # Verify slide content
    cover = prs.slides[0]
    texts = []
    for sh in cover.shapes:
        if sh.has_text_frame:
            texts.append(sh.text_frame.text)
    assert "红烧肉制作工艺" in ''.join(texts)

def test_generate_ppt_with_plan():
    """generate_ppt accepts slide_plan and produces valid PPTX."""
    with tempfile.TemporaryDirectory() as tmpdir:
        path = generate_ppt(
            content="test", template_id=None, branding=None,
            output_dir=tmpdir, provider_id="", model="",
            slide_plan=SAMPLE_PLAN
        )
        assert os.path.exists(path)
        assert os.path.getsize(path) > 10000
        prs = Presentation(path)
        assert len(prs.slides) == 6
```

- [ ] **Step 2: Run tests**

Run: `cd d:\YISHAOAGENT && python -m pytest tests/test_ppt_e2e.py -v`
Expected: 2 PASS

- [ ] **Step 3: Run all tests**

Run: `cd d:\YISHAOAGENT && python -m pytest tests/test_ppt_designer.py tests/test_ppt_e2e.py -v`
Expected: 11 PASS

- [ ] **Step 4: Verify frontend builds**

Run: `cd d:\YISHAOAGENT\frontend && npm run build 2>&1 | tail -5`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add tests/test_ppt_e2e.py
git commit -m "test: add end-to-end PPT generation tests with design engine"
```
