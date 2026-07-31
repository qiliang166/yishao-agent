"""Compare generated SVGs against reference source templates.
Validates that every generated page has a basis in a reference file.
"""
import sys, os, json, re
from collections import defaultdict

os.chdir(os.path.dirname(os.path.abspath(__file__)))

EXPORTS = "data/exports"
REF_PATHS = {
    "DARK_TECH": "ref_gpt54",
    "PROFESSIONAL": "ref_minimax",
    "CREATIVE": "ref_root",
    "THEMATIC": None,  # No reference SVGs, YAML tokens are the reference
}

STYLE_FAMILIES = {
    "DARK_TECH": ["blueprint", "tech", "intuition-machine"],
    "PROFESSIONAL": ["business", "minimal", "notion", "scientific", "editorial-infographic"],
    "CREATIVE": ["creative", "bold-editorial", "vector-illustration"],
    "THEMATIC": ["chalkboard", "fantasy-animation", "pixel-art", "vintage", "watercolor", "sketch-notes"],
}

def extract_features(svg: str) -> dict:
    """Extract structural features from an SVG for comparison."""
    return {
        "has_bgGrad": 'id="bgGrad"' in svg,
        "has_panelGrad": 'panelGrad' in svg,
        "has_grain": 'id="grain"' in svg,
        "has_grid": 'stroke="#8DA7C5"' in svg,
        "has_radialGlow": 'radialGradient' in svg,
        "has_feDropShadow": 'feDropShadow' in svg,
        "has_bezier_thin": 'stroke-width="2"' in svg and 'stroke-linecap="round"' in svg,
        "has_bezier_thick": 'stroke-width="10"' in svg,
        "has_linearGradient": 'linearGradient' in svg,
        "gradient_count": svg.count('linearGradient'),
        "radial_count": svg.lower().count('radialgradient'),
        "has_cards_rx": bool(re.search(r'rx="(\d+)"', svg)),
        "card_rx_values": [int(r) for r in re.findall(r'rx="(\d+)"', svg)],
        "font_families": list(set(re.findall(r"font-family=['\"]([^'\"]+)['\"]", svg))),
        "color_hexes": list(set(re.findall(r'#[0-9a-fA-F]{6}', svg))),
        "has_cover_large_title": bool(re.search(r'font-size="(?:7[2-9]|8[0-9]|9[0-9])"', svg)),
        "has_page_number": bool(re.search(r'(?:0[1-7]\s*/\s*0[1-7]|/\s*0?[1-7])', svg)),
        "svg_size": len(svg),
    }

def compare_features(gen_feat: dict, ref_feat: dict, family: str) -> dict:
    """Compare generated features against reference features."""
    results = {}

    if family == "DARK_TECH":
        # DARK_TECH invariants from gpt54 reference
        results["bgGrad_match"] = gen_feat["has_bgGrad"] == ref_feat["has_bgGrad"]
        results["panelGrad_match"] = gen_feat["has_panelGrad"] == ref_feat["has_panelGrad"]
        results["grain_match"] = gen_feat["has_grain"] == ref_feat["has_grain"]
        results["grid_match"] = gen_feat["has_grid"] == ref_feat["has_grid"]
        results["glow_match"] = gen_feat["has_radialGlow"] == ref_feat["has_radialGlow"]
        results["shadow_match"] = gen_feat["has_feDropShadow"] == ref_feat["has_feDropShadow"]
        results["bezier_match"] = gen_feat["has_bezier_thin"] == ref_feat["has_bezier_thin"]
        results["gradient_count_ok"] = gen_feat["gradient_count"] >= 4  # bgGrad+panelGrad+3accent+lineGrad
        results["radial_count_ok"] = gen_feat["radial_count"] >= 3
        results["has_cards"] = gen_feat["has_cards_rx"]
        results["has_cover_title"] = gen_feat["has_cover_large_title"]
        results["has_page_num"] = gen_feat["has_page_number"]

    elif family == "PROFESSIONAL":
        # PROFESSIONAL invariants from minimax reference
        results["clean_no_grain"] = not gen_feat["has_grain"]  # Should NOT have grain
        results["clean_no_glow"] = not gen_feat["has_radialGlow"]  # Should NOT have radial glow
        results["clean_no_grid"] = not gen_feat["has_grid"]  # Should NOT have grid
        results["clean_no_bezier"] = not gen_feat["has_bezier_thick"]  # Should NOT have thick bezier
        results["clean_no_feDropShadow"] = not gen_feat["has_feDropShadow"]  # Should NOT have feDropShadow
        results["has_linearGradient"] = gen_feat["has_linearGradient"]
        results["gradient_count_reasonable"] = gen_feat["gradient_count"] <= 3  # minimal gradients
        results["has_cards"] = gen_feat["has_cards_rx"]
        results["has_cover_title"] = gen_feat["has_cover_large_title"]
        results["has_page_num"] = gen_feat["has_page_number"]

    elif family == "CREATIVE":
        # CREATIVE invariants from root reference
        results["has_gradient_or_bg"] = gen_feat["has_linearGradient"]
        results["has_cards"] = gen_feat["has_cards_rx"]
        results["has_large_rx"] = any(r >= 16 for r in gen_feat["card_rx_values"]) if gen_feat["card_rx_values"] else False
        results["has_cover_title"] = gen_feat["has_cover_large_title"]
        results["has_page_num"] = gen_feat["has_page_number"]
        # CREATIVE should NOT have DARK_TECH elements
        results["no_darktech_grid"] = not gen_feat["has_grid"]
        results["no_darktech_grain"] = not gen_feat["has_grain"]
        results["no_darktech_bezier"] = not gen_feat["has_bezier_thick"]

    elif family == "THEMATIC":
        # THEMATIC: compare against YAML tokens (handled by rescore_all_svgs.py)
        results["has_cards"] = gen_feat["has_cards_rx"]
        results["has_cover_title"] = gen_feat["has_cover_large_title"]
        results["has_page_num"] = gen_feat["has_page_number"]
        results["no_darktech_elements"] = (
            not gen_feat["has_grain"] and
            not gen_feat["has_grid"] and
            not gen_feat["has_bezier_thick"]
        )

    score = sum(1 for v in results.values() if v)
    total = len(results)
    return {"checks": results, "score": score, "total": total, "pct": round(score/total*100, 1) if total else 0}

def get_family_for_style(style_id: str) -> str:
    for fam, styles in STYLE_FAMILIES.items():
        if style_id in styles:
            return fam
    return "THEMATIC"

def load_ref_features(family: str) -> list:
    """Load reference SVGs and extract features."""
    ref_dir = REF_PATHS.get(family)
    if not ref_dir:
        return []
    ref_path = os.path.join(EXPORTS, ref_dir)
    if not os.path.exists(ref_path):
        return []

    features = []
    for fname in sorted(os.listdir(ref_path)):
        if fname.endswith('.svg'):
            with open(os.path.join(ref_path, fname), encoding='utf-8') as f:
                features.append(extract_features(f.read()))
    return features

def main():
    with open(os.path.join(EXPORTS, "quality_matrix.json"), encoding='utf-8') as f:
        matrix = json.load(f)

    print("=" * 100)
    print("REFERENCE COMPARISON: Generated SVGs vs Source Template Files")
    print("=" * 100)

    for family in ["DARK_TECH", "PROFESSIONAL", "CREATIVE", "THEMATIC"]:
        ref_feats = load_ref_features(family)
        if not ref_feats:
            print(f"\n{family}: No reference SVGs available (YAML tokens used as reference)")
            continue

        # Average reference features for this family
        avg_ref = ref_feats[len(ref_feats)//2]  # Use middle slide as representative

        print(f"\n--- {family} (ref: {len(ref_feats)} slides) ---")

        family_results = [r for r in matrix if r.get("family") == family]
        for r in sorted(family_results, key=lambda x: x["style_id"]):
            if r["svg_count"] == 0:
                print(f"  {r['style_id']:28s} {r['sop_name']:15s} NO SLIDES")
                continue

            # Compare each generated slide against reference
            slide_comparisons = []
            for slide in r["slides"]:
                # Reconstruct SVG path and read it
                dir_name = f"test_{r['style_id']}_{r['sop_name']}"
                dir_path = os.path.join(EXPORTS, dir_name)
                svg_file = os.path.join(dir_path, f"slide-{slide['seq']:02d}.svg")

                if os.path.exists(svg_file):
                    with open(svg_file, encoding='utf-8') as f:
                        gen_feat = extract_features(f.read())
                    comp = compare_features(gen_feat, avg_ref, family)
                    slide_comparisons.append(comp)

            if slide_comparisons:
                avg_score = sum(c["score"] for c in slide_comparisons)
                avg_total = sum(c["total"] for c in slide_comparisons)
                avg_pct = round(avg_score/avg_total*100, 1) if avg_total else 0
                status = "PASS" if avg_pct >= 90 else ("WARN" if avg_pct >= 70 else "FAIL")
                print(f"  {r['style_id']:28s} {r['sop_name']:15s} {avg_score}/{avg_total} ({avg_pct}%) {status}")

    print(f"\nResults saved to data/exports/ref_comparison.json")

if __name__ == "__main__":
    main()
