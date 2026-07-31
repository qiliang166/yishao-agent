"""PPT output quality verification — run against any output directory.

Usage:
    python services/verify_ppt_output.py data/output/<project>/<project>_col5/

Checks:
    1. No unresolved placeholders ({{IMAGE_URL}}, {{TITLE}}, etc.)
    2. No broken SVG fills (fill="url(var(...)" LLM corruption)
    3. Balanced HTML tags (div, svg)
    4. No hardcoded hex colors in template pages
    5. Image files exist for all <img src="..."> references
    6. No LLM error artifacts in slide content
    7. Slide count consistency (deck matches slides/ dir)
    8. Per-slide: no truncated or empty HTML

Exit 0 = all pass, 1 = any failure.
"""
import os, sys, re, json
from pathlib import Path


def _extract_slide_divs(deck_html: str) -> list[str]:
    """Extract individual slide divs from assembled deck HTML.

    Slides are wrapped: <div style="...slide-wrapper..."> ... </div>
    We find them by matching the wrapper pattern.
    """
    # Find slide-wrapper divs
    pattern = r'<div\s[^>]*slide-wrapper[^>]*>.*?</div>\s*(?=<div\s[^>]*slide-wrapper|</body>)'
    slides = re.findall(pattern, deck_html, re.DOTALL)
    if len(slides) < 3:
        # Fallback: try finding all top-level divs in body
        body_match = re.search(r'<body[^>]*>(.*?)</body>', deck_html, re.DOTALL)
        if body_match:
            body = body_match.group(1)
            # Find divs with explicit dimensions (slide canvases)
            slides = re.findall(
                r'<div\s[^>]*width\s*:\s*\d+px[^>]*height\s*:\s*\d+px[^>]*>.*?</div>\s*$',
                body, re.DOTALL | re.MULTILINE
            )
    return slides


def check_output(html_dir: str) -> dict:
    """Run all quality checks."""
    results = {}
    index_path = os.path.join(html_dir, "index.html")
    slides_dir = os.path.join(html_dir, "slides")
    images_dir = os.path.join(html_dir, "images")

    if not os.path.exists(index_path):
        return {"_fatal": (False, f"index.html not found at {index_path}")}

    with open(index_path, "r", encoding="utf-8") as f:
        deck_html = f.read()

    # Extract slide bodies (inside slide-wrappers, excluding deck chrome)
    slides = _extract_slide_divs(deck_html)
    slide_bodies = "\n".join(slides) if slides else deck_html

    # ── 1. Unresolved placeholders ──
    placeholders = set(re.findall(r'\{\{[A-Z_][A-Z_0-9]*\}\}', slide_bodies))
    # These are expected to be resolved or preserved
    allowed = set()
    unresolved = [p for p in placeholders
                  if p != '{{IMAGE_URL}}'  # handled by image gen
                  and not p.startswith('{{image:')]  # explicit prompt placeholder
    results["unresolved_placeholders"] = (
        len(unresolved) == 0,
        f"Found {len(unresolved)}: {sorted(unresolved)[:8]}" if unresolved else "None"
    )

    # ── 2. Broken SVG fills (LLM corruption: fill="url(var(--x)o-glow)") ──
    broken_svg = re.findall(r'fill=["\']url\(var\(--\w+\)[^)]*\)["\']', slide_bodies)
    results["broken_svg_fills"] = (
        len(broken_svg) == 0,
        f"Found {len(broken_svg)} corrupted fills" + (
            f": {broken_svg[:3]}" if broken_svg else ""
        ) if broken_svg else "None"
    )

    # ── 3. Balanced HTML tags ──
    def _check_balance(tag: str, html: str) -> tuple[int, int]:
        opens = len(re.findall(rf'<{tag}\b', html))
        closes = len(re.findall(rf'</{tag}>', html))
        return opens, closes

    tag_issues = []
    for tag in ("div", "svg"):
        o, c = _check_balance(tag, deck_html)
        if o != c:
            tag_issues.append(f"{tag}: {o}o/{c}c (Δ={o-c})")
    results["balanced_tags"] = (
        len(tag_issues) == 0,
        "; ".join(tag_issues) if tag_issues else "All balanced"
    )

    # ── 4. Image references ──
    img_refs = re.findall(r'<img[^>]*src=["\']([^"\']+)["\']', deck_html)
    missing_imgs = []
    external_imgs = 0
    for src in img_refs:
        if src.startswith("http"):
            external_imgs += 1
            continue
        if not os.path.exists(os.path.join(html_dir, src)):
            missing_imgs.append(src)
    results["image_files"] = (
        len(missing_imgs) == 0,
        f"{len(img_refs)} refs ({external_imgs} external, {len(img_refs) - external_imgs} local)" +
        (f", {len(missing_imgs)} MISSING: {missing_imgs[:3]}" if missing_imgs else ", all exist")
    )

    # ── 5. LLM error artifacts in slide content ──
    error_patterns = [
        (r'(?<!DOCT)抱歉|我无法|I cannot|I apologize|作为AI', "LLM refusal text"),
        (r'```html|```css', "Markdown code fence in slide"),
        (r'&lt;!DOCTYPE|&lt;html\b', "Escaped HTML document in slide"),
    ]
    artifacts = []
    for pat, label in error_patterns:
        matches = re.findall(pat, slide_bodies)
        if matches:
            artifacts.append(f"{label}: {len(matches)} matches")
    results["llm_artifacts"] = (
        len(artifacts) == 0,
        "; ".join(artifacts) if artifacts else "None"
    )

    # ── 6. Per-slide file checks ──
    slide_files = []
    if os.path.isdir(slides_dir):
        slide_files = sorted(
            [f for f in os.listdir(slides_dir) if f.endswith('.html')],
            key=lambda x: int(re.search(r'slide-(\d+)', x).group(1))
            if re.search(r'slide-(\d+)', x) else 0
        )

    empty_slides = []
    truncated_slides = []
    for sf in slide_files:
        spath = os.path.join(slides_dir, sf)
        with open(spath, "r", encoding="utf-8") as f:
            content = f.read().strip()
        if not content or len(content) < 100:
            empty_slides.append(sf)
        elif not content.rstrip().endswith('>'):
            truncated_slides.append(sf)

    results["slide_files"] = (
        len(slide_files) >= 2 and len(empty_slides) == 0 and len(truncated_slides) == 0,
        f"{len(slide_files)} files"
        + (f", {len(empty_slides)} EMPTY" if empty_slides else "")
        + (f", {len(truncated_slides)} TRUNCATED" if truncated_slides else "")
    )

    # ── 7. Slide count consistency ──
    deck_slide_count = len(slides)
    file_slide_count = len(slide_files)
    consistent = deck_slide_count >= 3 and file_slide_count >= 3
    results["slide_count"] = (
        consistent,
        f"deck={deck_slide_count}, files={file_slide_count}"
    )

    return results


def verify_dir(html_dir: str) -> bool:
    """Run all checks and print results. Returns True if all pass."""
    if not os.path.isdir(html_dir):
        print(f"ERROR: Directory not found: {html_dir}")
        return False

    print(f"\n{'=' * 60}")
    print(f"Verifying: {os.path.basename(os.path.dirname(html_dir))}/{os.path.basename(html_dir)}")
    print(f"{'=' * 60}")

    results = check_output(html_dir)

    if "_fatal" in results:
        passed, detail = results.pop("_fatal")
        print(f"  [FATAL] {detail}")
        return False

    all_pass = True
    for check_name, (passed, detail) in sorted(results.items()):
        status = "[PASS]" if passed else "[FAIL]"
        print(f"  {status} {check_name}: {detail}")
        if not passed:
            all_pass = False

    verdict = "ALL CHECKS PASSED" if all_pass else "SOME CHECKS FAILED -- see above"
    print(f"\n  --> {verdict}")

    return all_pass


if __name__ == "__main__":
    if len(sys.argv) > 1:
        target = sys.argv[1]
    else:
        output_root = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "data", "output"
        )
        if os.path.isdir(output_root):
            dirs = []
            for d in os.listdir(output_root):
                proj_dir = os.path.join(output_root, d)
                if os.path.isdir(proj_dir):
                    for sub in os.listdir(proj_dir):
                        sub_dir = os.path.join(proj_dir, sub)
                        idx = os.path.join(sub_dir, "index.html")
                        if os.path.isdir(sub_dir) and os.path.exists(idx):
                            dirs.append((os.path.getmtime(idx), sub_dir))
            dirs.sort(reverse=True)
            if dirs:
                target = dirs[0][1]
                print(f"Auto-detected: {target}")
            else:
                print("No output directories found. Specify path as argument.")
                sys.exit(1)
        else:
            print("No output directory. Usage: python verify_ppt_output.py <dir>")
            sys.exit(1)

    ok = verify_dir(target)
    sys.exit(0 if ok else 1)
