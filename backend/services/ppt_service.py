"""PPT generation service."""
import os
import json
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from database import get_db

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORT_DIR = os.path.join(BASE_DIR, "data", "exports")
os.makedirs(EXPORT_DIR, exist_ok=True)


def generate_ppt(content: str, template_id: str = None, branding: dict = None, output_dir: str = None) -> str:
    """Generate a PPTX file from content. Returns file path."""
    prs = None

    # Load template if provided
    if template_id:
        db = get_db()
        try:
            row = db.execute("SELECT file_path, branding_config FROM templates WHERE id = ?", (template_id,)).fetchone()
            if row and row["file_path"] and os.path.exists(row["file_path"]):
                prs = Presentation(row["file_path"])
                if not branding and row["branding_config"]:
                    try:
                        branding = json.loads(row["branding_config"])
                    except Exception:
                        pass
        finally:
            db.close()

    if prs is None:
        prs = Presentation()

    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    # Split content by ## headings into slides
    sections = content.split("\n## ")
    title_slide = prs.slides.add_slide(prs.slide_layouts[0])
    if sections:
        first_lines = sections[0].strip().split("\n")
        title_text = first_lines[0].replace("# ", "").strip() if first_lines else "未命名"
        if title_slide.shapes.title:
            title_slide.shapes.title.text = title_text

    for section in sections[1:]:
        lines = section.strip().split("\n")
        slide_title = lines[0].strip()
        slide_body = "\n".join(lines[1:]).strip()

        slide = prs.slides.add_slide(prs.slide_layouts[1])
        if slide.shapes.title:
            slide.shapes.title.text = slide_title
        if len(slide.placeholders) > 1:
            slide.placeholders[1].text = slide_body[:500]

    # Add branding
    if branding:
        for slide in prs.slides:
            left = Inches(0.5)
            top = Inches(7.0)
            width = Inches(12.3)
            height = Inches(0.4)
            txBox = slide.shapes.add_textbox(left, top, width, height)
            tf = txBox.text_frame
            if branding.get("copyright"):
                tf.text = branding["copyright"]
            if branding.get("signature"):
                p = tf.add_paragraph()
                p.text = branding["signature"]
                p.alignment = PP_ALIGN.RIGHT

    filename = f"ppt_{os.urandom(4).hex()}.pptx"
    target_dir = output_dir if output_dir else EXPORT_DIR
    os.makedirs(target_dir, exist_ok=True)
    filepath = os.path.join(target_dir, filename)
    prs.save(filepath)
    return filepath
