#!/usr/bin/env python3
"""
Notion VI 色系生成器 — OKLCH + WCAG AA 验证

基于 OKLCH 色彩空间的系统性色系生成，所有文字色自动满足 WCAG 2.1 AA。
13 色模型: primary, secondary, accent, background, text, card_bg,
           chart_0~4, semantic.positive, semantic.negative

Usage: python tools/generate_palette.py
"""

import math
import json

# ═══════════════════════════════════════════════
# OKLCH ↔ sRGB 转换
# ═══════════════════════════════════════════════

def _srgb_to_linear(c: float) -> float:
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4

def _linear_to_srgb(c: float) -> float:
    if c <= 0.0031308:
        return 12.92 * c
    return 1.055 * (c ** (1.0 / 2.4)) - 0.055

def _clamp(v: float) -> float:
    return max(0.0, min(1.0, v))

# sRGB → linear → XYZ (D65) → LMS → OKLab → OKLCH

def hex_to_oklch(hex_str: str) -> tuple:
    """Convert '#rrggbb' to (L, C, H) in OKLCH space."""
    h = hex_str.lstrip('#')
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0

    # sRGB → Linear
    rl, gl, bl = _srgb_to_linear(r), _srgb_to_linear(g), _srgb_to_linear(b)

    # Linear → XYZ (D65)
    x = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl
    y = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl
    z = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl

    # XYZ → LMS
    l_ = 0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z
    m_ = 0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z
    s_ = 0.0482003018 * x + 0.2643662691 * y + 0.6338517070 * z

    # LMS → OKLab (cube root)
    l_cbrt = l_ ** (1.0 / 3.0) if l_ >= 0 else -((-l_) ** (1.0 / 3.0))
    m_cbrt = m_ ** (1.0 / 3.0) if m_ >= 0 else -((-m_) ** (1.0 / 3.0))
    s_cbrt = s_ ** (1.0 / 3.0) if s_ >= 0 else -((-s_) ** (1.0 / 3.0))

    ok_l = 0.2104542553 * l_cbrt + 0.7936177850 * m_cbrt - 0.0040720468 * s_cbrt
    ok_a = 1.9779984951 * l_cbrt - 2.4285922050 * m_cbrt + 0.4505937099 * s_cbrt
    ok_b = 0.0259040371 * l_cbrt + 0.7827717662 * m_cbrt - 0.8086757660 * s_cbrt

    # OKLab → OKLCH
    c = math.sqrt(ok_a * ok_a + ok_b * ok_b)
    h = math.atan2(ok_b, ok_a)  # radians
    h_deg = math.degrees(h)
    if h_deg < 0:
        h_deg += 360.0

    return (ok_l, c, h_deg)


def oklch_to_hex(L: float, C: float, H_deg: float) -> str:
    """Convert OKLCH (L, C, H_degrees) to '#rrggbb' hex string."""
    H_rad = math.radians(H_deg)
    ok_a = C * math.cos(H_rad)
    ok_b = C * math.sin(H_rad)

    # OKLab → LMS (reverse cube root = cube)
    l_cbrt = L + 0.3963377774 * ok_a + 0.2158037573 * ok_b
    m_cbrt = L - 0.1055613458 * ok_a - 0.0638541728 * ok_b
    s_cbrt = L - 0.0894841775 * ok_a - 1.2914855480 * ok_b

    l_ = l_cbrt ** 3
    m_ = m_cbrt ** 3
    s_ = s_cbrt ** 3

    # LMS → XYZ (D65)
    x = 1.2270138511 * l_ - 0.5577999807 * m_ + 0.2812561490 * s_
    y = -0.0405801784 * l_ + 1.1122568696 * m_ - 0.0716766787 * s_
    z = -0.0763812845 * l_ - 0.4214819784 * m_ + 1.5861632204 * s_

    # XYZ → linear sRGB
    rl =  3.2409699419 * x - 1.5373831776 * y - 0.4986107603 * z
    gl = -0.9692436363 * x + 1.8759675015 * y + 0.0415550574 * z
    bl =  0.0556300797 * x - 0.2039769589 * y + 1.0569715142 * z

    # Linear → sRGB + clamp
    sr = _clamp(_linear_to_srgb(rl))
    sg = _clamp(_linear_to_srgb(gl))
    sb = _clamp(_linear_to_srgb(bl))

    return f"#{int(round(sr * 255)):02x}{int(round(sg * 255)):02x}{int(round(sb * 255)):02x}"


# ═══════════════════════════════════════════════
# WCAG 2.1 对比度计算
# ═══════════════════════════════════════════════

def _relative_luminance(hex_str: str) -> float:
    """WCAG 2.1 relative luminance from '#rrggbb'."""
    h = hex_str.lstrip('#')
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0

    rs = r / 12.92 if r <= 0.04045 else ((r + 0.055) / 1.055) ** 2.4
    gs = g / 12.92 if g <= 0.04045 else ((g + 0.055) / 1.055) ** 2.4
    bs = b / 12.92 if b <= 0.04045 else ((b + 0.055) / 1.055) ** 2.4

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs


def contrast_ratio(hex1: str, hex2: str) -> float:
    """WCAG 2.1 contrast ratio between two '#rrggbb' colors."""
    l1 = _relative_luminance(hex1)
    l2 = _relative_luminance(hex2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


# ═══════════════════════════════════════════════
# 色系生成
# ═══════════════════════════════════════════════

def ensure_contrast(color_hex: str, bg_hex: str, min_ratio: float = 4.5) -> str:
    """
    Adjust L while preserving C and H to meet min_ratio on bg_hex.
    Returns original if already compliant.
    """
    cr = contrast_ratio(color_hex, bg_hex)
    if cr >= min_ratio:
        return color_hex

    L, C, H = hex_to_oklch(color_hex)
    bg_L, _, _ = hex_to_oklch(bg_hex)

    step = 0.015
    for _ in range(60):
        if bg_L > 0.5:
            L = max(0.03, L - step)
        else:
            L = min(0.97, L + step)
        new_hex = oklch_to_hex(L, C, H)
        if contrast_ratio(new_hex, bg_hex) >= min_ratio:
            return new_hex
        color_hex = new_hex
    return color_hex


def _semantic_color(target_hue: float, bg_L: float, pri_L: float, chroma_scale: float, bg_hex: str) -> str:
    """Generate a semantic color with forced hue and minimum chroma for recognizability."""
    if bg_L < 0.5:
        L = 0.68
        min_c = 0.14 * chroma_scale
    else:
        L = pri_L
        min_c = 0.12 * chroma_scale
    c = max(min_c, 0.14 * chroma_scale)
    result = oklch_to_hex(L, c, target_hue)
    result = ensure_contrast(result, bg_hex, 4.5)
    # If chroma got crushed too much by contrast adjustment, boost it
    _, c2, h2 = hex_to_oklch(result)
    if c2 < 0.04:
        result = oklch_to_hex(L + (0.05 if bg_L > 0.5 else -0.05), c, target_hue)
        result = ensure_contrast(result, bg_hex, 4.5)
    return result


def generate_scheme(label: str, anchor: dict, persona: str) -> dict:
    """
    Generate complete 13-color scheme from OKLCH anchor parameters.

    anchor = {
        'bg_L': background lightness (0-1),
        'bg_H': background hue,
        'bg_C': background chroma,
        'pri_H': primary hue,
        'pri_L': primary lightness (lower for dark text on light bg),
        'acc_H': accent hue (should differ from pri_H by >= 90 deg),
        'acc_L': accent lightness override (optional, defaults to pri_L),
        'chroma_scale': chroma scaling factor (0.5 for dark mode),
    }
    """
    a = anchor
    bg = oklch_to_hex(a['bg_L'], a['bg_C'], a['bg_H'])
    cs = a['chroma_scale']
    is_light = a['bg_L'] > 0.5

    # Primary — heading text, readable dark (or light) but not extreme black/white
    pri = oklch_to_hex(a['pri_L'], 0.012 * cs, a['pri_H'])
    pri = ensure_contrast(pri, bg, 7.0)

    # Text — body, same hue as primary, slightly lighter (or darker for dark bg)
    txt_L = a['pri_L'] + (0.04 if is_light else -0.04)
    txt = oklch_to_hex(txt_L, 0.010 * cs, a['pri_H'])
    txt = ensure_contrast(txt, bg, 4.5)

    # Secondary — muted support text
    sec_L = a['pri_L'] + (0.22 if is_light else -0.22)
    sec = oklch_to_hex(sec_L, 0.006 * cs, a['pri_H'])
    sec = ensure_contrast(sec, bg, 4.5)

    # Card background — slightly offset from page bg
    card_bg_L = a['bg_L'] - (0.035 if is_light else -0.04)
    card_bg = oklch_to_hex(card_bg_L, a['bg_C'], a['bg_H'])

    # Accent — visually distinct emphasis color, adequate chroma
    acc_L = a.get('acc_L', a['pri_L'])
    acc_c = 0.16 * cs
    acc = oklch_to_hex(acc_L, acc_c, a['acc_H'])
    acc = ensure_contrast(acc, bg, 4.5)

    # chart_0 = accent
    chart_0 = acc

    # chart_1 — secondary hue, slightly stronger
    chart_1 = oklch_to_hex(sec_L - (0.06 if is_light else -0.06), 0.06 * cs, a['pri_H'])
    chart_1 = ensure_contrast(chart_1, bg, 4.5)

    # chart_2 — pri hue + 60 deg offset
    chart_2 = oklch_to_hex(a['pri_L'], 0.07 * cs, (a['pri_H'] + 60) % 360)
    chart_2 = ensure_contrast(chart_2, bg, 4.5)

    # chart_3 — warm red/coral (H=25), chart_4 — green (H=145)
    chart_3 = _semantic_color(25, a['bg_L'], a['pri_L'], cs, bg)
    chart_4 = _semantic_color(145, a['bg_L'], a['pri_L'], cs, bg)

    # semantic — must read as green/red
    positive = _semantic_color(145, a['bg_L'], a['pri_L'], cs, bg)
    negative = _semantic_color(25, a['bg_L'], a['pri_L'], cs, bg)

    return {
        "label": label,
        "primary": pri,
        "secondary": sec,
        "accent": acc,
        "background": bg,
        "text": txt,
        "card_bg": card_bg,
        "chart_colors": [chart_0, chart_1, chart_2, chart_3, chart_4],
        "semantic": {
            "positive": positive,
            "negative": negative,
        },
        "persona_hint": persona,
    }


# ═══════════════════════════════════════════════
# 验证
# ═══════════════════════════════════════════════

def verify_scheme(name: str, sc: dict) -> list:
    """验证色系，返回问题列表。空列表 = 通过。"""
    issues = []
    bg = sc['background']
    card_bg = sc['card_bg']

    # 文字对比度检查
    checks = [
        ("primary on background", sc['primary'], bg, 7.0),
        ("text on background", sc['text'], bg, 4.5),
        ("secondary on background", sc['secondary'], bg, 4.5),
        ("accent on background", sc['accent'], bg, 4.5),
    ]
    for label, fg, back, min_cr in checks:
        cr = contrast_ratio(fg, back)
        status = "PASS" if cr >= min_cr else "FAIL"
        if cr < min_cr:
            issues.append(f"{status} {label}: {fg} on {back} = {cr:.1f}:1 (need >={min_cr}:1)")

    # chart colors on background
    for i, ch in enumerate(sc['chart_colors']):
        cr = contrast_ratio(ch, bg)
        if cr < 4.5:
            issues.append(f"FAIL chart_{i} on background: {ch} on {bg} = {cr:.1f}:1 (need >=4.5:1)")

    # chart colors on card_bg
    for i, ch in enumerate(sc['chart_colors']):
        cr = contrast_ratio(ch, card_bg)
        if cr < 4.5:
            issues.append(f"FAIL chart_{i} on card_bg: {ch} on {card_bg} = {cr:.1f}:1 (need >=4.5:1)")

    # semantic
    for sem_name, sem_hex, expected_h_range in [
        ("semantic.positive", sc['semantic']['positive'], (100, 170)),
        ("semantic.negative", sc['semantic']['negative'], (8, 42)),
    ]:
        cr = contrast_ratio(sem_hex, bg)
        if cr < 4.5:
            issues.append(f"FAIL {sem_name} on background: {sem_hex} on {bg} = {cr:.1f}:1 (need >=4.5:1)")
        _, _, h_deg = hex_to_oklch(sem_hex)
        if h_deg < expected_h_range[0] or h_deg > expected_h_range[1]:
            issues.append(f"FAIL {sem_name} hue={h_deg:.0f} deg, expected {expected_h_range[0]}-{expected_h_range[1]}")

    # accent vs primary hue separation
    _, _, pri_h = hex_to_oklch(sc['primary'])
    _, _, acc_h = hex_to_oklch(sc['accent'])
    hue_diff = abs(acc_h - pri_h)
    if hue_diff > 180:
        hue_diff = 360 - hue_diff
    if hue_diff < 90:
        issues.append(f"FAIL accent-primary hue separation: {hue_diff:.0f} deg (need >=90)")

    return issues


# ═══════════════════════════════════════════════
# 主程序：生成 5 套色系
# ═══════════════════════════════════════════════

PERSONAS = {
    "notion-light": "Structured, clear, systematic. Notion-like clarity with clean hierarchy. Minimal decoration, typography-driven layout, systematic grid alignment. Clean white backgrounds, subtle light-gray cards (#f7f6f3), blue accents (#2383e2) for interactive emphasis only. Cards use 1px solid chart_color colored borders — the border itself is the only decoration. No gradients, no heavy shadows — hierarchy is created through spacing, weight, and alignment.",
    "notion-dark": "Dark mode structured clarity. Deep charcoal backgrounds, lighter dark-gray cards, soft blue accents. Cards use 1px solid chart_color colored borders. Same systematic typography as Light mode — hierarchy through weight and spacing, not color. No gradients, no shadows. Clean, focused, minimal strain.",
    "notion-warm": "Warm, paper-like structured clarity. Cream backgrounds, warm beige cards, amber-wood accents. Cards use 1px solid chart_color colored borders. Feels like high-quality paper stationery — systematic and clean but with organic warmth. No gradients, no shadows. Typography-driven hierarchy.",
    "notion-cool": "Cool, serene structured clarity. Blue-white backgrounds, cool gray-blue cards, teal-blue accents. Cards use 1px solid chart_color colored borders. Calm, focused, analytical — like a well-organized research notebook. No gradients, no shadows. Purely typographic hierarchy.",
    "notion-mono": "Pure monochrome structured clarity. Black text on white backgrounds, light gray cards. Cards use 1px solid chart_color colored borders. Zero color — all hierarchy is created through typographic weight, size, and spacing alone. The most extreme expression of Notion minimalism. No accents, no gradients, no shadows — just text, space, and structure.",
}

def main():
    schemes = {}

    # ── 极简白 (Notion 本色参考) ──
    # primary: warm-gray ~H85, not pure black; accent: blue ~H225, visible chroma
    schemes["notion-light"] = generate_scheme("极简白", {
        'bg_L': 1.0, 'bg_H': 85, 'bg_C': 0.002,
        'pri_H': 85, 'pri_L': 0.30,
        'acc_H': 240, 'acc_L': 0.32,
        'chroma_scale': 1.0,
    }, PERSONAS["notion-light"])

    # ── 暗夜黑 ──
    schemes["notion-dark"] = generate_scheme("暗夜黑", {
        'bg_L': 0.10, 'bg_H': 85, 'bg_C': 0.001,
        'pri_H': 85, 'pri_L': 0.90,
        'acc_H': 240, 'acc_L': 0.78,
        'chroma_scale': 0.6,
    }, PERSONAS["notion-dark"])

    # ── 暖纸色 ──
    schemes["notion-warm"] = generate_scheme("暖纸色", {
        'bg_L': 0.98, 'bg_H': 55, 'bg_C': 0.006,
        'pri_H': 55, 'pri_L': 0.28,
        'acc_H': 210, 'acc_L': 0.30,
        'chroma_scale': 1.0,
    }, PERSONAS["notion-warm"])

    # ── 冷静蓝 ──
    schemes["notion-cool"] = generate_scheme("冷静蓝", {
        'bg_L': 0.99, 'bg_H': 250, 'bg_C': 0.003,
        'pri_H': 225, 'pri_L': 0.28,
        'acc_H': 15, 'acc_L': 0.30,
        'chroma_scale': 0.95,
    }, PERSONAS["notion-cool"])

    # ── 纯粹灰 ──
    schemes["notion-mono"] = generate_scheme("纯粹灰", {
        'bg_L': 1.0, 'bg_H': 0, 'bg_C': 0.0,
        'pri_H': 0, 'pri_L': 0.20,
        'acc_H': 240, 'acc_L': 0.28,
        'chroma_scale': 0.4,
    }, PERSONAS["notion-mono"])

    # ═══ 验证 ═══
    print("=" * 70)
    print("WCAG 2.1 AA 验证报告")
    print("=" * 70)

    total_issues = 0
    for sid, sc in schemes.items():
        print(f"\n── {sc['label']} ({sid}) ──")
        issues = verify_scheme(sid, sc)
        if issues:
            for issue in issues:
                print(f"  {issue}")
            total_issues += len(issues)
        else:
            print("  [PASS] ALL CHECKS PASSED")

        # Print key metrics
        pri_cr = contrast_ratio(sc['primary'], sc['background'])
        acc_cr = contrast_ratio(sc['accent'], sc['background'])
        _, _, pri_h = hex_to_oklch(sc['primary'])
        _, _, acc_h = hex_to_oklch(sc['accent'])
        hue_diff = abs(acc_h - pri_h)
        if hue_diff > 180:
            hue_diff = 360 - hue_diff
        print(f"  primary={sc['primary']} (CR {pri_cr:.1f}:1, H={pri_h:.0f}°)")
        print(f"  accent={sc['accent']} (CR {acc_cr:.1f}:1, H={acc_h:.0f}°)")
        print(f"  accent-pri hue gap: {hue_diff:.0f}°")
        print(f"  chart_0~4: {sc['chart_colors']}")
        print(f"  semantic: +{sc['semantic']['positive']} / -{sc['semantic']['negative']}")

    print("\n" + "=" * 70)
    if total_issues == 0:
        print("RESULT: 5/5 schemes PASS - all WCAG AA compliant")
    else:
        print(f"RESULT: {total_issues} ISSUES FOUND - fix required")
    print("=" * 70)

    # ═══ 输出 YAML 片段 ═══
    print("\n\n# ── tokens.yaml color_schemes 片段 ──\n")
    for sid, sc in schemes.items():
        print(f"  {sid}:")
        print(f'    label: "{sc["label"]}"')
        print(f'    primary: "{sc["primary"]}"')
        print(f'    secondary: "{sc["secondary"]}"')
        print(f'    accent: "{sc["accent"]}"')
        print(f'    background: "{sc["background"]}"')
        print(f'    text: "{sc["text"]}"')
        print(f'    card_bg: "{sc["card_bg"]}"')
        print(f"    chart_colors:")
        for i, ch in enumerate(sc['chart_colors']):
            print(f'      - "{ch}"')
        print(f"    semantic:")
        print(f'      positive: "{sc["semantic"]["positive"]}"')
        print(f'      negative: "{sc["semantic"]["negative"]}"')
        print(f'    persona_hint: "{sc["persona_hint"]}"')

    # ═══ 输出 JSON 用于编程引用 ═══
    print("\n\n# ── JSON ──\n")
    print(json.dumps(schemes, indent=2, ensure_ascii=False))

    return 0 if total_issues == 0 else 1


if __name__ == "__main__":
    exit(main())
