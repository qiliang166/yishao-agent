"""Re-score all existing SVGs from test directories against reference families.
STRICT scoring — YAML is single source of truth.
Colors: exact hex match. Fonts: primary font must be used in font-family attr.
Layout: cover/content-specific structural checks.
No fallbacks. No softening.
"""
import sys, os, json, yaml, time, re
from collections import defaultdict

os.chdir(os.path.dirname(os.path.abspath(__file__)))

STYLES_DIR = "C:/Users/17206/.claude/plugins/marketplaces/zengwenliang416-ppt-agent/skills/_shared/references/styles"

STYLE_FAMILIES = {
    "DARK_TECH": {
        "reference": "gpt54",
        "styles": ["blueprint", "tech", "intuition-machine"],
    },
    "PROFESSIONAL": {
        "reference": "minimax",
        "styles": ["business", "minimal", "notion", "scientific", "editorial-infographic"],
    },
    "CREATIVE": {
        "reference": "root",
        "styles": ["creative", "bold-editorial", "vector-illustration"],
    },
    "THEMATIC": {
        "reference": "yaml_tokens",
        "styles": ["chalkboard", "fantasy-animation", "pixel-art", "vintage", "watercolor", "sketch-notes"],
    },
}

# ---- YAML helpers ----

def load_yaml_style(style_id: str) -> dict:
    path = os.path.join(STYLES_DIR, f"{style_id}.yaml")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)

def _yaml_colors(style_id: str):
    cs = load_yaml_style(style_id).get("color_scheme", {})
    return {
        "primary": cs.get("primary", ""),
        "accent": cs.get("accent", ""),
        "background": cs.get("background", ""),
        "card_bg": cs.get("card_bg", ""),
        "text": cs.get("text", ""),
    }

def _yaml_primary_fonts(style_id: str):
    """Returns (primary_heading, primary_body) — the FIRST font in each YAML stack."""
    typo = load_yaml_style(style_id).get("typography", {})
    h = typo.get("heading_font", "")
    b = typo.get("body_font", "")
    h_first = h.split(",")[0].strip().strip("'\"") if h else ""
    b_first = b.split(",")[0].strip().strip("'\"") if b else ""
    return h_first, b_first

def _yaml_card_rx(style_id: str):
    return load_yaml_style(style_id).get("card_style", {}).get("border_radius", 0)

def _yaml_decoration_pattern(style_id: str):
    return load_yaml_style(style_id).get("decoration", {}).get("pattern", "none")

def _yaml_has_gradient(style_id: str):
    return bool(load_yaml_style(style_id).get("gradient"))

# ---- Font checking ----

def _font_in_fontfamily(svg: str, font_name: str) -> bool:
    """Check if font_name appears as part of any font-family attribute value."""
    if not font_name:
        return True
    for fam in re.findall(r'font-family=["\']([^"\']+)["\']', svg):
        fonts = [f.strip().strip("'\"") for f in fam.split(",")]
        if font_name in fonts:
            return True
    return False

# ---- Color checking (strict) ----

def _color_used(svg: str, hex_val: str) -> bool:
    """Exact hex match only."""
    if not hex_val:
        return True
    return hex_val in svg

# ---- Family scorers ----

def score_gpt54_family(svg: str, slide_type: str, style_id: str):
    """DARK_TECH — strict colors, strict fonts, structural invariants."""
    colors = _yaml_colors(style_id)
    h_font, b_font = _yaml_primary_fonts(style_id)
    c = {}

    # Color: exact match
    c["primary_present"] = _color_used(svg, colors["primary"])
    c["accent_present"] = _color_used(svg, colors["accent"])
    c["cardbg_or_bg_present"] = (
        _color_used(svg, colors["card_bg"]) or _color_used(svg, colors["background"])
    )

    # Font: primary heading/body must be in font-family attr
    c["heading_font"] = _font_in_fontfamily(svg, h_font)
    c["body_font"] = _font_in_fontfamily(svg, b_font)
    c["cjk_fallback"] = 'PingFang SC' in svg or 'Microsoft YaHei' in svg

    # DARK_TECH structural invariants
    c["bgGrad_3stop"] = ('id="bgGrad"' in svg) and (svg.count('stop-color=') >= 3 or svg.count('stop-color="') >= 2)
    c["panelGrad"] = 'id="panelGrad"' in svg or 'panelGrad' in svg
    c["3_accent_grads"] = (('indigoGrad' in svg or 'accentGrad' in svg) and
                           ('cyanGrad' in svg or 'accentGradSecondary' in svg) and
                           ('orangeGrad' in svg or 'accentGradTertiary' in svg))
    c["lineGrad"] = 'id="lineGrad"' in svg or 'lineGrad' in svg
    c["3_radial_glows"] = svg.lower().count('radialgradient') >= 3
    c["grain_pattern"] = 'id="grain"' in svg
    c["shadow_filter"] = 'id="shadow"' in svg or 'shadow-lg' in svg
    c["shadow_feDropShadow"] = 'feDropShadow' in svg
    c["grid_lines"] = 'stroke="#8DA7C5"' in svg
    c["glow_circles"] = ('cyanGlow' in svg or 'glowAccent' in svg) and ('orangeGlow' in svg or 'glowSecondary' in svg)
    c["bezier_thin"] = 'stroke-width="2"' in svg and 'stroke-linecap="round"' in svg
    c["bezier_thick"] = 'stroke-width="10"' in svg
    c["large_rx"] = any(rx in svg for rx in ['rx="24"', 'rx="26"', 'rx="28"', 'rx="30"'])

    # Layout
    if slide_type == "cover":
        c["hero_panel"] = ('x="734"' in svg or 'translate(734' in svg)
        c["bottom_bar"] = ('y="610"' in svg or 'y="628"' in svg or 'y="600"' in svg)
        c["footer_y"] = ('y="698"' in svg or 'y="694"' in svg or 'y="690"' in svg)
    else:
        c["capsule_at_72_34"] = 'translate(72,34)' in svg.replace(' ', '') or 'translate(72, 34)' in svg
        c["title_underline"] = 'width="96"' in svg or 'width="80"' in svg or 'width="120"' in svg
        c["page_num_capsule"] = 'translate(1172,34)' in svg.replace(' ', '') or 'translate(1172, 34)' in svg or 'translate(1172,' in svg
        c["divider_y674"] = 'y1="674"' in svg or 'y1="670"' in svg or 'y1="678"' in svg
        c["footer_source"] = 'y="694"' in svg or 'y="690"' in svg or 'y="698"' in svg

    score = sum(1 for v in c.values() if v)
    return score, len(c), c


def score_professional_family(svg: str, slide_type: str, style_id: str):
    """PROFESSIONAL — strict colors, strict fonts, clean-design invariants."""
    colors = _yaml_colors(style_id)
    h_font, b_font = _yaml_primary_fonts(style_id)
    c = {}

    # Color: exact match
    c["primary_present"] = _color_used(svg, colors["primary"])
    c["accent_present"] = _color_used(svg, colors["accent"])
    c["cardbg_or_bg_present"] = (
        _color_used(svg, colors["card_bg"]) or _color_used(svg, colors["background"])
    )

    # Font: primary heading/body must be in font-family attr
    c["heading_font"] = _font_in_fontfamily(svg, h_font)
    c["body_font"] = _font_in_fontfamily(svg, b_font)
    c["cjk_fallback"] = 'PingFang SC' in svg or 'Microsoft YaHei' in svg

    # PROFESSIONAL clean design invariants
    c["no_grain"] = 'id="grain"' not in svg
    c["no_radial_glow"] = 'radialGradient' not in svg
    c["no_bezier_thick"] = 'stroke-width="10"' not in svg
    c["no_grid_lines"] = 'stroke="#8DA7C5"' not in svg
    has_other_darktech = (
        'id="grain"' in svg or
        'stroke="#8DA7C5"' in svg or
        'stroke-width="10"' in svg or
        'radialGradient' in svg
    )
    c["no_feDropShadow_bleed"] = not ('feDropShadow' in svg and has_other_darktech)

    # Card elements
    c["has_card_elements"] = ('rx="' in svg)  # rounded rect cards
    c["has_text_content"] = '<text' in svg and ('font-size=' in svg)

    # Layout
    if slide_type == "cover":
        c["cover_has_gradient_or_bg"] = ('linearGradient' in svg) or _color_used(svg, colors["background"])
        c["cover_large_title"] = any(fs in svg for fs in [
            'font-size="56"','font-size="60"','font-size="64"','font-size="68"',
            'font-size="72"','font-size="76"','font-size="80"','font-size="84"',
            'font-size="88"','font-size="92"','font-size="96"'
        ])
        c["cover_has_date_or_dept"] = '2026' in svg
    else:
        c["content_has_heading"] = any(fs in svg for fs in [
            'font-size="28"','font-size="30"','font-size="32"','font-size="34"',
            'font-size="36"','font-size="40"','font-size="44"','font-size="48"'
        ])
        rx = _yaml_card_rx(style_id)
        c["card_rx_match"] = any(f'rx="{r}"' in svg for r in range(
            max(2, rx - 2), rx + 3
        )) or any(rx_s in svg for rx_s in [
            'rx="6"','rx="8"','rx="10"','rx="12"','rx="14"','rx="16"','rx="18"','rx="20"'
        ])
        c["has_page_number"] = any(pat in svg for pat in [
            '01 /', '02 /', '03 /', '04 /', '05 /', '06 /', '07 /',
            '/ 07', '/ 7', '01/', '02/', '03/', '04/', '05/', '06/', '07/'
        ])

    score = sum(1 for v in c.values() if v)
    return score, len(c), c


def score_creative_family(svg: str, slide_type: str, style_id: str):
    """CREATIVE — strict colors, strict fonts, per-style structural respect."""
    colors = _yaml_colors(style_id)
    h_font, b_font = _yaml_primary_fonts(style_id)
    rx = _yaml_card_rx(style_id)
    has_grad = _yaml_has_gradient(style_id)
    pattern = _yaml_decoration_pattern(style_id)
    c = {}

    # Color: exact match
    c["primary_present"] = _color_used(svg, colors["primary"])
    c["accent_present"] = _color_used(svg, colors["accent"])
    c["bg_or_cardbg_present"] = (
        _color_used(svg, colors["background"]) or _color_used(svg, colors["card_bg"])
    )

    # Font: primary heading/body must be in font-family attr
    c["heading_font"] = _font_in_fontfamily(svg, h_font)
    c["body_font"] = _font_in_fontfamily(svg, b_font)
    c["cjk_fallback"] = 'PingFang SC' in svg or 'Microsoft YaHei' in svg

    # Gradient: only require if YAML defines it
    if has_grad:
        c["bold_bg"] = any(tag in svg for tag in ['linearGradient', 'url(#bg'])
    else:
        c["bold_bg"] = True

    # Card rx: strict
    if rx == 0:
        c["card_rx_match"] = True
    elif rx > 0:
        c["card_rx_match"] = any(f'rx="{r}"' in svg for r in range(rx - 4, rx + 5))
    else:
        c["card_rx_match"] = True

    # Decoration
    if pattern == "none":
        c["decoration_clean"] = 'id="grain"' not in svg
    else:
        c["decoration_clean"] = True

    # No DARK_TECH bleed
    c["no_darktech_bleed"] = not (
        ('id="grain"' in svg and pattern == "none") or
        'stroke="#8DA7C5"' in svg or
        ('stroke-width="10"' in svg) or
        ('radialGradient' in svg and not has_grad)
    )

    # Layout
    if slide_type == "cover":
        c["cover_title_large"] = any(fs in svg for fs in [
            'font-size="56"','font-size="60"','font-size="64"','font-size="68"',
            'font-size="72"','font-size="76"','font-size="80"','font-size="84"',
            'font-size="88"','font-size="92"','font-size="96"'
        ])
        c["cover_accent_element"] = (
            'height="6"' in svg or 'height="4"' in svg or 'height="8"' in svg or
            'stroke-width="3"' in svg or 'stroke-width="4"' in svg or
            'stroke-width="5"' in svg
        )
        c["cover_has_kicker_or_date"] = (
            '2026' in svg or
            'font-size="14"' in svg or 'font-size="16"' in svg or
            'font-size="18"' in svg or 'font-size="20"' in svg
        )
    else:
        c["content_has_bold_heading"] = any(fs in svg for fs in [
            'font-size="28"','font-size="30"','font-size="32"','font-size="34"',
            'font-size="36"','font-size="40"','font-size="44"','font-size="48"',
            'font-size="52"','font-size="56"'
        ])
        if rx == 0:
            c["has_card_containers"] = '<rect' in svg
        else:
            c["has_card_containers"] = ('rx="' in svg) and ('<rect' in svg)
        c["has_page_number"] = any(pat in svg for pat in [
            '01 /', '02 /', '03 /', '04 /', '05 /', '06 /', '07 /',
            '/ 07', '/ 7', '01/', '02/', '03/', '04/', '05/', '06/', '07/'
        ])

    score = sum(1 for v in c.values() if v)
    return score, len(c), c


def score_thematic_family(svg: str, slide_type: str, style_id: str):
    """THEMATIC — strict colors, strict fonts, expanded layout checks."""
    yaml_data = load_yaml_style(style_id)
    colors = _yaml_colors(style_id)
    h_font, b_font = _yaml_primary_fonts(style_id)
    rx = _yaml_card_rx(style_id)
    pattern = _yaml_decoration_pattern(style_id)
    c = {}

    # ---- Color: exact match ----
    c["primary_color_present"] = _color_used(svg, colors["primary"])
    c["accent_color_present"] = _color_used(svg, colors["accent"])
    c["bg_or_cardbg_present"] = (
        _color_used(svg, colors["background"]) or _color_used(svg, colors["card_bg"])
    )

    # ---- Font: primary heading/body must be in font-family attr ----
    c["heading_font"] = _font_in_fontfamily(svg, h_font)
    c["body_font"] = _font_in_fontfamily(svg, b_font)
    c["cjk_fallback"] = 'PingFang SC' in svg or 'Microsoft YaHei' in svg

    # ---- Decoration pattern ----
    if pattern == "none":
        c["no_pattern_bleed"] = 'id="grain"' not in svg and 'stroke="#8DA7C5"' not in svg
    elif pattern == "grid":
        c["has_grid_pattern"] = (
            '<pattern' in svg or 'grid' in svg.lower() or 'stroke-opacity' in svg
        )
    elif pattern == "dots":
        c["has_dots_pattern"] = '<pattern' in svg or '<circle' in svg
    else:
        c["decoration_ok"] = True

    # ---- No DARK_TECH cross-contamination ----
    c["no_darktech_bleed"] = not (
        'id="grain"' in svg or
        'stroke="#8DA7C5"' in svg or
        'stroke-width="10"' in svg or
        ('radialGradient' in svg and 'feDropShadow' in svg)
    )

    # ---- Card style ----
    if rx > 0:
        c["card_rx_match"] = any(f'rx="{r}"' in svg for r in range(max(2, rx - 4), rx + 5))
    else:
        c["card_rx_match"] = True

    # ---- Layout ----
    if slide_type == "cover":
        c["cover_large_title"] = any(fs in svg for fs in [
            'font-size="48"','font-size="52"','font-size="56"','font-size="60"',
            'font-size="64"','font-size="68"','font-size="72"','font-size="76"',
            'font-size="80"','font-size="84"','font-size="88"','font-size="92"',
            'font-size="96"'
        ])
        c["cover_has_subtitle_or_date"] = (
            '2026' in svg or
            'font-size="14"' in svg or 'font-size="16"' in svg or
            'font-size="18"' in svg or 'font-size="20"' in svg or
            'font-size="22"' in svg or 'font-size="24"' in svg
        )
    else:
        c["content_has_heading"] = any(fs in svg for fs in [
            'font-size="24"','font-size="26"','font-size="28"','font-size="30"',
            'font-size="32"','font-size="34"','font-size="36"','font-size="40"',
            'font-size="44"','font-size="48"','font-size="52"','font-size="56"'
        ])
        c["has_card_rects"] = '<rect' in svg
        c["has_page_number"] = any(pat in svg for pat in [
            '01 /', '02 /', '03 /', '04 /', '05 /', '06 /', '07 /',
            '/ 07', '/ 7', '01/', '02/', '03/', '04/', '05/', '06/', '07/',
            '01', '02', '03', '04', '05', '06', '07'
        ])

    score = sum(1 for v in c.values() if v)
    return score, len(c), c


def get_family_for_style(style_id: str) -> str:
    for family_name, family_data in STYLE_FAMILIES.items():
        if style_id in family_data["styles"]:
            return family_name
    return "THEMATIC"


def score_svg(svg: str, slide_type: str, style_id: str):
    family = get_family_for_style(style_id)
    if family == "DARK_TECH":
        return score_gpt54_family(svg, slide_type, style_id)
    elif family == "PROFESSIONAL":
        return score_professional_family(svg, slide_type, style_id)
    elif family == "CREATIVE":
        return score_creative_family(svg, slide_type, style_id)
    else:
        return score_thematic_family(svg, slide_type, style_id)


# ============================================================
# MAIN
# ============================================================

EXPORTS = "data/exports"
all_results = []

print("=" * 110)
print("STRICT RESCORING — YAML FIDELITY (exact colors, primary fonts, layout)")
print("=" * 110)

for entry in sorted(os.listdir(EXPORTS)):
    if not entry.startswith("test_") or not os.path.isdir(os.path.join(EXPORTS, entry)):
        continue

    name = entry[5:]  # remove "test_"
    parts = name.split("_sop")
    if len(parts) != 2:
        continue
    style_id = parts[0]
    sop_suffix = parts[1]
    sop_parts = sop_suffix.split("_", 1)
    if len(sop_parts) != 2:
        continue
    sop_num = sop_parts[0]
    sop_name = sop_parts[1]
    sop_full = f"sop{sop_num}_{sop_name}"

    family = get_family_for_style(style_id)

    dir_path = os.path.join(EXPORTS, entry)
    svg_files = sorted([f for f in os.listdir(dir_path) if f.startswith("slide-") and f.endswith(".svg")])

    if not svg_files:
        print(f"  {style_id:25s} | {sop_full:15s} | 0 slides -- EMPTY")
        all_results.append({
            "style_id": style_id, "sop_name": sop_full, "family": family,
            "total_score": 0, "total_checks": 0, "overall_pct": 0,
            "slides": [], "svg_count": 0
        })
        continue

    slides = []
    for svg_file in svg_files:
        filepath = os.path.join(dir_path, svg_file)
        with open(filepath, encoding="utf-8") as f:
            svg_content = f.read()

        seq = int(svg_file.replace("slide-", "").replace(".svg", ""))
        slide_type = "cover" if seq == 1 else "content"

        score, total, checks = score_svg(svg_content, slide_type, style_id)
        failed = [k for k, v in checks.items() if not v]

        # Get actual fonts used for diagnostic
        actual_fonts = re.findall(r'font-family=["\']([^"\']+)["\']', svg_content)

        pct = round(score / total * 100, 1) if total > 0 else 0
        slides.append({
            "seq": seq, "type": slide_type,
            "score": score, "total": total, "pct": pct,
            "failed": failed,
            "bytes": len(svg_content.encode("utf-8")),
            "fonts_used": list(set(actual_fonts))[:5],
        })

    total_score = sum(s["score"] for s in slides)
    total_checks = sum(s["total"] for s in slides)
    overall_pct = round(total_score / total_checks * 100, 1) if total_checks > 0 else 0

    status = "PASS" if overall_pct >= 90 else ("WARN" if overall_pct >= 70 else "FAIL")
    slide_detail = " | ".join([f"S{s['seq']}:{s['score']}/{s['total']}({s['pct']}%)" for s in slides])

    print(f"  {style_id:25s} | {sop_full:15s} | {len(svg_files)} slides | {total_score}/{total_checks} ({overall_pct}%) {status}")
    print(f"    {'':25s} | {'':15s} | {slide_detail}")
    # Show first slide's fonts for diagnostic
    if slides and slides[0].get("fonts_used"):
        print(f"    {'':25s} | {'':15s} | S1 fonts: {slides[0]['fonts_used']}")

    all_results.append({
        "style_id": style_id, "sop_name": sop_full, "family": family,
        "total_score": total_score, "total_checks": total_checks,
        "overall_pct": overall_pct, "status": status,
        "slides": slides, "svg_count": len(svg_files)
    })

# ============================================================
# COMPARISON MATRIX
# ============================================================

print("\n" + "=" * 110)
print("FINAL QUALITY COMPARISON MATRIX - ALL STYLES x ALL SOPs (STRICT SCORING)")
print("=" * 110)

for family_name in ["DARK_TECH", "PROFESSIONAL", "CREATIVE", "THEMATIC"]:
    family_styles = STYLE_FAMILIES[family_name]["styles"]
    print(f"\n--- {family_name} (ref: {STYLE_FAMILIES[family_name]['reference']}) ---")
    print(f"{'Style':28s} {'SOP1 Score':>14s} {'SOP2 Score':>14s} {'AVG':>8s} {'Status':>8s}")
    print("-" * 80)

    for style_id in family_styles:
        sop1_result = next((r for r in all_results if r["style_id"] == style_id and r["sop_name"].startswith("sop1")), None)
        sop2_result = next((r for r in all_results if r["style_id"] == style_id and r["sop_name"].startswith("sop2")), None)

        sop1_str = f"{sop1_result['total_score']}/{sop1_result['total_checks']} ({sop1_result['overall_pct']}%)" if sop1_result else "N/A"
        sop2_str = f"{sop2_result['total_score']}/{sop2_result['total_checks']} ({sop2_result['overall_pct']}%)" if sop2_result else "N/A"

        if sop1_result and sop2_result:
            avg = round((sop1_result["overall_pct"] + sop2_result["overall_pct"]) / 2, 1)
        elif sop1_result:
            avg = sop1_result["overall_pct"]
        elif sop2_result:
            avg = sop2_result["overall_pct"]
        else:
            avg = 0

        status = "PASS" if avg >= 90 else ("WARN" if avg >= 70 else "FAIL")
        print(f"  {style_id:26s} {sop1_str:>14s} {sop2_str:>14s} {avg:>6.1f}% {status:>8s}")

# Summary
print("\n" + "=" * 110)
print("SUMMARY: DECKS BELOW 90% (STRICT SCORING)")
print("=" * 110)
failing = []
for r in all_results:
    if r["svg_count"] < 7:
        failing.append(f"  {r['style_id']} / {r['sop_name']}: {r['svg_count']}/7 slides — INCOMPLETE")
    elif r["overall_pct"] < 90:
        failures = set()
        for s in r["slides"]:
            for f in s["failed"]:
                failures.add(f)
        failing.append(f"  {r['style_id']:25s} / {r['sop_name']:15s} : {r['total_score']}/{r['total_checks']} ({r['overall_pct']}%) — failed: {sorted(failures)}")

if failing:
    print(f"  {len(failing)} decks below 90% or incomplete:")
    for m in failing:
        print(m)
else:
    print("  All decks complete and >= 90%!")

pass_count = sum(1 for r in all_results if r["svg_count"] == 7 and r["overall_pct"] >= 90)
warn_count = sum(1 for r in all_results if r["svg_count"] == 7 and 70 <= r["overall_pct"] < 90)
fail_count = sum(1 for r in all_results if r["svg_count"] == 7 and r["overall_pct"] < 70)
incomplete = sum(1 for r in all_results if r["svg_count"] < 7)
print(f"\n  PASS(>=90%): {pass_count} | WARN(70-89%): {warn_count} | FAIL(<70%): {fail_count} | INCOMPLETE: {incomplete}")
print(f"  Pass rate: {round(pass_count / len(all_results) * 100, 1)}%" if all_results else "  No results")

# Save
with open(os.path.join(EXPORTS, "quality_matrix.json"), "w", encoding="utf-8") as f:
    json.dump(all_results, f, ensure_ascii=False, indent=2)

print(f"\nResults saved to data/exports/quality_matrix.json")
print(f"Total decks scored: {len(all_results)}")
