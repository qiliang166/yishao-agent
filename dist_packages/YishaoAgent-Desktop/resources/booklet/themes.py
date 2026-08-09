"""电子成册内置主题 — 每套 = 一组 CSS 变量值 + 封面版式类名。

硬性约束：主题只提供变量值，模板通过 {{THEME_CSS_VARS}} 注入，
禁止在模板或代码中写死任何颜色实值。
"""

# 变量键（与模板 var(--*) 一一对应）；desk = 产物页面外桌面底色
THEME_VAR_KEYS = [
    "primary", "secondary", "accent", "bg", "text", "card_bg", "desk", "font",
    "chart-0", "chart-1", "chart-2", "chart-3",
    "chart-4", "chart-5", "chart-6", "chart-7",
]

_DEFAULT_FONT = "'Noto Serif SC','Source Han Serif SC','SimSun',serif"
_SANS_FONT = "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif"

BUILTIN_THEMES = [
    {
        "id": "builtin-minimal",
        "name": "简约素雅",
        "source": "builtin",
        "colors": {
            "primary": "#18181b", "secondary": "#3f3f46",
            "accent": "#3b82f6", "bg": "#ffffff", "text": "#27272a",
            "card_bg": "#f4f4f5", "desk": "#52525b", "font": _SANS_FONT,
            "chart-0": "#3b82f6", "chart-1": "#ef4444", "chart-2": "#10b981",
            "chart-3": "#f59e0b", "chart-4": "#8b5cf6", "chart-5": "#06b6d4",
            "chart-6": "#ec4899", "chart-7": "#84cc16",
        },
    },
    {
        "id": "builtin-business",
        "name": "商务深蓝",
        "source": "builtin",
        "colors": {
            "primary": "#1a365d", "secondary": "#2d5f8a",
            "accent": "#e67e22", "bg": "#ffffff", "text": "#1a202c",
            "card_bg": "#f0f4f8", "desk": "#1f2937", "font": _SANS_FONT,
            "chart-0": "#e67e22", "chart-1": "#2d5f8a", "chart-2": "#27ae60",
            "chart-3": "#8e44ad", "chart-4": "#c0392b", "chart-5": "#16a085",
            "chart-6": "#f39c12", "chart-7": "#2980b9",
        },
    },
    {
        "id": "builtin-vivid",
        "name": "活力橙紫",
        "source": "builtin",
        "colors": {
            "primary": "#7c3aed", "secondary": "#a78bfa",
            "accent": "#d97706", "bg": "#faf5ff", "text": "#1e1b4b",
            "card_bg": "#ffffff", "desk": "#2e1065", "font": _SANS_FONT,
            "chart-0": "#d97706", "chart-1": "#7c3aed", "chart-2": "#ec4899",
            "chart-3": "#10b981", "chart-4": "#f59e0b", "chart-5": "#3b82f6",
            "chart-6": "#ef4444", "chart-7": "#84cc16",
        },
    },
    {
        "id": "builtin-academic",
        "name": "学术书卷",
        "source": "builtin",
        "colors": {
            "primary": "#1565c0", "secondary": "#42a5f5",
            "accent": "#ff7043", "bg": "#fafafa", "text": "#212121",
            "card_bg": "#ffffff", "desk": "#37474f", "font": _DEFAULT_FONT,
            "chart-0": "#ff7043", "chart-1": "#1565c0", "chart-2": "#27ae60",
            "chart-3": "#8e44ad", "chart-4": "#c0392b", "chart-5": "#16a085",
            "chart-6": "#f39c12", "chart-7": "#2980b9",
        },
    },
]


import re

_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{3,8}$")
_FONT_FORBIDDEN_RE = re.compile(r"[;{}<>\\]|url\s*\(|expression\s*\(|@import", re.I)


def _hex_to_rgb_channels(hex_color: str):
    """Parse #RRGGBB to (r, g, b) ints. Returns (0,0,0) on malformed input."""
    h = hex_color.lstrip("#")
    if len(h) >= 6:
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return (0, 0, 0)


def _rel_luminance(hex_color: str) -> float:
    """WCAG 2.x 相对亮度。"""
    def f(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = _hex_to_rgb_channels(hex_color)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def _contrast(hex_a: str, hex_b: str) -> float:
    """WCAG 对比度（1~21）。"""
    la, lb = _rel_luminance(hex_a), _rel_luminance(hex_b)
    hi, lo = (la, lb) if la >= lb else (lb, la)
    return (hi + 0.05) / (lo + 0.05)


def _safe_css_value(key: str, val: str, fallback: str) -> str:
    """CSS 注入防护：色键仅接受 hex，font 键拒绝危险片段，否则回退默认。"""
    val = (val or "").strip()
    if not val:
        return fallback
    if key == "font":
        return val if not _FONT_FORBIDDEN_RE.search(val) else fallback
    return val if _HEX_COLOR_RE.match(val) else fallback


# 内部键名 → CSS 变量名映射（bg 对应 VI 规范 --background，其余去 book- 前缀）
_KEY_TO_CSS_VAR = {
    "bg": "background",
    "card_bg": "card-bg",
}


def theme_css_vars(colors: dict) -> str:
    """把主题色归一化为 VI 规范 CSS 变量声明串（缺失/非法值回退到第一套内置主题）。"""
    fallback = BUILTIN_THEMES[0]["colors"]
    norm = {}
    parts = []
    for key in THEME_VAR_KEYS:
        val = _safe_css_value(key, (colors or {}).get(key, ""), fallback[key])
        norm[key] = val
        css_name = _KEY_TO_CSS_VAR.get(key, key.replace("_", "-"))
        parts.append(f"--{css_name}: {val};")
    # RGB 分量变量（供 rgba(var(--primary-rgb), ...) 使用，VI 规范格式）
    for rgb_key in ("primary", "accent", "bg", "text"):
        r, g, b = _hex_to_rgb_channels(norm[rgb_key])
        css_name = _KEY_TO_CSS_VAR.get(rgb_key, rgb_key)
        parts.append(f"--{css_name}-rgb: {r}, {g}, {b};")
    # 对比度派生变量（深色配色下固定页文字仍可读；text-on-bg 是配色自身保证的兜底）
    ink = norm["primary"] if _contrast(norm["primary"], norm["bg"]) >= 4.5 else norm["text"]
    if _contrast(norm["bg"], norm["primary"]) >= 4.5:
        on_primary = norm["bg"]
    else:
        on_primary = max((norm["bg"], "#ffffff", norm["text"]), key=lambda c: _contrast(c, norm["primary"]))
    parts.append(f"--ink: {ink};")
    parts.append(f"--on-primary: {on_primary};")
    return " ".join(parts)
