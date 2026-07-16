"""电子成册内置主题 — 每套 = 一组 CSS 变量值 + 封面版式类名。

硬性约束：主题只提供变量值，模板通过 {{THEME_CSS_VARS}} 注入，
禁止在模板或代码中写死任何颜色实值。
"""

# 变量键（与模板 var(--book-*) 一一对应）
THEME_VAR_KEYS = ["primary", "accent", "bg", "text", "card_bg", "font"]

_DEFAULT_FONT = "'Noto Serif SC','Source Han Serif SC','SimSun',serif"
_SANS_FONT = "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif"

BUILTIN_THEMES = [
    {
        "id": "builtin-minimal",
        "name": "简约素雅",
        "source": "builtin",
        "colors": {
            "primary": "#18181b",
            "accent": "#3b82f6",
            "bg": "#ffffff",
            "text": "#27272a",
            "card_bg": "#f4f4f5",
            "font": _SANS_FONT,
        },
    },
    {
        "id": "builtin-business",
        "name": "商务深蓝",
        "source": "builtin",
        "colors": {
            "primary": "#1a365d",
            "accent": "#e67e22",
            "bg": "#ffffff",
            "text": "#1a202c",
            "card_bg": "#f0f4f8",
            "font": _SANS_FONT,
        },
    },
    {
        "id": "builtin-vivid",
        "name": "活力橙紫",
        "source": "builtin",
        "colors": {
            "primary": "#7c3aed",
            "accent": "#d97706",
            "bg": "#faf5ff",
            "text": "#1e1b4b",
            "card_bg": "#ffffff",
            "font": _SANS_FONT,
        },
    },
    {
        "id": "builtin-academic",
        "name": "学术书卷",
        "source": "builtin",
        "colors": {
            "primary": "#1565c0",
            "accent": "#ff7043",
            "bg": "#fafafa",
            "text": "#212121",
            "card_bg": "#ffffff",
            "font": _DEFAULT_FONT,
        },
    },
]


import re

_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{3,8}$")
_FONT_FORBIDDEN_RE = re.compile(r"[;{}<>\\]|url\s*\(|expression\s*\(|@import", re.I)


def _safe_css_value(key: str, val: str, fallback: str) -> str:
    """CSS 注入防护：色键仅接受 hex，font 键拒绝危险片段，否则回退默认。"""
    val = (val or "").strip()
    if not val:
        return fallback
    if key == "font":
        return val if not _FONT_FORBIDDEN_RE.search(val) else fallback
    return val if _HEX_COLOR_RE.match(val) else fallback


def theme_css_vars(colors: dict) -> str:
    """把主题色归一化为模板 CSS 变量声明串（缺失/非法值回退到第一套内置主题）。"""
    fallback = BUILTIN_THEMES[0]["colors"]
    parts = []
    for key in THEME_VAR_KEYS:
        val = _safe_css_value(key, (colors or {}).get(key, ""), fallback[key])
        css_key = key.replace("_", "-")
        parts.append(f"--book-{css_key}: {val};")
    return " ".join(parts)
