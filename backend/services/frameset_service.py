# -*- coding: utf-8 -*-
"""
框架集服务（生产）：从真实 PPT 提取的框架集 → 大模型选框架 + 填内容 → 渲染 HTML。
几何(L/T/W/H)/字号/层级/配色 100% 来自 resources/framesets/{style}.json，代码不写坐标。
大模型只做两件事：① 选一个 frame_id ② 给每个槽位(content_key)填文本。

对外主函数：
  load_frameset(style_id) -> dict            读取框架集 JSON
  frame_catalog(fs) -> list                  给大模型看的框架目录(含每槽字数上限)
  render_with_content(fs, frame_id, slots)   按框架真实几何渲染(占位缺失回退example)
"""
import json
from pathlib import Path

_RES = Path(__file__).resolve().parent.parent / "resources" / "framesets"

# ── 角色 → 排版属性(与渲染一致，纯样式无坐标) ──
ROLE_STYLE = {
    "page_title":  {"weight": 800, "lh": 1.2,  "align": "left",   "valign": "center"},
    "page_number": {"weight": 700, "lh": 1.0,  "align": "right",  "valign": "center"},
    "hero_numeral":{"weight": 900, "lh": 0.9,  "align": "left",   "valign": "top"},
    "hero_word":   {"weight": 900, "lh": 1.0,  "align": "left",   "valign": "top"},
    "item_index":  {"weight": 900, "lh": 1.0,  "align": "left",   "valign": "top"},
    "section_title":{"weight": 800, "lh": 1.2, "align": "left",   "valign": "center"},
    "item_title":  {"weight": 800, "lh": 1.2,  "align": "left",   "valign": "center"},
    "lead_text":   {"weight": 800, "lh": 1.3,  "align": "left",   "valign": "center"},
    "item_subtitle":{"weight": 700, "lh": 1.3, "align": "left",   "valign": "center"},
    "caption":     {"weight": 700, "lh": 1.35, "align": "left",   "valign": "center"},
    "body_text":   {"weight": 400, "lh": 1.55, "align": "left",   "valign": "top"},
    "footnote":    {"weight": 400, "lh": 1.4,  "align": "left",   "valign": "center"},
    "text":        {"weight": 400, "lh": 1.5,  "align": "left",   "valign": "top"},
}

ROLE_DESC = {
    "page_title": "页面主标题", "page_number": "页码", "hero_numeral": "大号数字",
    "hero_word": "大号词", "item_index": "条目序号", "section_title": "章节大标题",
    "item_title": "条目标题", "lead_text": "引导句/小标题", "item_subtitle": "条目副标题",
    "caption": "小注/说明", "body_text": "正文", "footnote": "脚注", "text": "文字",
}


def _esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def _geom_style(g):
    return (f"position:absolute;left:{g['L']}%;top:{g['T']}%;"
            f"width:{g['W']}%;height:{g['H']}%;box-sizing:border-box;overflow:hidden;")


def _capacity(geom, fs, role, canvas_w, canvas_h):
    """该文字格子能舒适容纳的中文字数(宽×高/字号，含内边距余量)。"""
    if not fs:
        fs = 14
    lh = ROLE_STYLE.get(role, ROLE_STYLE["text"])["lh"]
    w = geom["W"] / 100 * canvas_w - 16
    h = geom["H"] / 100 * canvas_h - 8
    per_line = max(1, int(w // fs))
    lines = max(1, int(h // (fs * lh)))
    return per_line * lines


def _assign_content_keys(frame):
    """给每个文字容器打 _content_key（role + 同role出现序），供 content 字典寻址。"""
    seen = {}
    for c in sorted(frame["containers"], key=lambda x: x["z"]):
        if c["role"] in ("panel", "divider") or c["kind"] in ("PICTURE", "TABLE"):
            continue
        i = seen.get(c["role"], 0)
        c["_content_key"] = f"{c['role']}#{i}"
        seen[c["role"]] = i + 1
    return frame


# ── 框架集缓存 ──
_CACHE = {}


def load_frameset(style_id: str = "business") -> dict | None:
    """读取 resources/framesets/{style_id}.json；无则回退 business.json。"""
    if style_id in _CACHE:
        return _CACHE[style_id]
    path = _RES / f"{style_id}.json"
    if not path.exists():
        path = _RES / "business.json"
    if not path.exists():
        return None
    fs = json.loads(path.read_text(encoding="utf-8"))
    for fr in fs["frames"]:
        _assign_content_keys(fr)
    _CACHE[style_id] = fs
    return fs


def frame_catalog(fs: dict) -> list:
    """给大模型的框架目录：[{id,page_type,page,n_slots,summary,slots:[{key,role,role_cn,fs,cap,example}]}]"""
    cw, ch = fs.get("canvas", [1280, 720])
    cat = []
    for f in fs["frames"]:
        slots, panels, pics, tables = [], 0, 0, 0
        for c in sorted(f["containers"], key=lambda x: x["z"]):
            if c["role"] == "panel":
                panels += 1; continue
            if c["role"] == "divider":
                continue
            if c["kind"] == "PICTURE":
                pics += 1; continue
            if c["kind"] == "TABLE":
                tables += 1; continue
            key = c.get("_content_key")
            if not key:
                continue
            slots.append({
                "key": key, "role": c["role"],
                "role_cn": ROLE_DESC.get(c["role"], c["role"]),
                "fs": c["fs"], "cap": _capacity(c["geom"], c["fs"], c["role"], cw, ch),
                "example": (c.get("example") or "")[:24],
            })
        summary = (f"{panels}个色块背板, {len(slots)}个文字位"
                   + (f", {pics}张图" if pics else "")
                   + (f", {tables}个表格" if tables else ""))
        cat.append({"id": f["frame_id"], "page_type": f["page_type"],
                    "page": f["source_page"], "n_slots": len(slots),
                    "summary": summary, "slots": slots})
    return cat


def _frame_by_id(fs: dict, frame_id: str):
    for f in fs["frames"]:
        if f["frame_id"] == frame_id:
            return f
    return None


def render_frame(frame: dict, content: dict, canvas_w=1280, canvas_h=720) -> str:
    """遍历容器(按 z 升序)，每容器用真实几何生成绝对定位 div。几何全来自 JSON。"""
    parts = []
    for c in sorted(frame["containers"], key=lambda x: x["z"]):
        g = c["geom"]; role = c["role"]; base = _geom_style(g)
        if role == "panel":
            bg = c.get("fill_var") or "transparent"
            parts.append(f'<div style="{base}background:{bg};border-radius:8px;"></div>')
            continue
        if role == "divider":
            col = c.get("line_var") or "rgba(var(--text-rgb),0.2)"
            w = max(1, round(c.get("line_w", 1) or 1))
            if g["W"] < g["H"]:
                parts.append(f'<div style="{base}border-left:{w}px solid {col};"></div>')
            else:
                parts.append(f'<div style="{base}border-top:{w}px solid {col};"></div>')
            continue
        if c["kind"] == "PICTURE":
            parts.append(f'<div style="{base}background:rgba(var(--text-rgb),0.06);'
                         f'border:1px dashed rgba(var(--text-rgb),0.25);border-radius:8px;"></div>')
            continue
        if c["kind"] == "TABLE":
            parts.append(f'<div style="{base}background:var(--card_bg);border-radius:8px;"></div>')
            continue
        fs_px = c.get("fs") or 14
        color = c.get("text_var") or "var(--text)"
        st = ROLE_STYLE.get(role, ROLE_STYLE["text"])
        key = c.get("_content_key")
        txt = content.get(key) if key and key in content else (c.get("example") or "")
        flex = ("display:flex;flex-direction:column;"
                + ("justify-content:center;" if st["valign"] == "center" else "justify-content:flex-start;"))
        parts.append(
            f'<div style="{base}{flex}font-size:{fs_px}px;font-weight:{st["weight"]};'
            f'line-height:{st["lh"]};color:{color};text-align:{st["align"]};'
            f'white-space:pre-line;">{_esc(txt)}</div>')
    inner = "\n  ".join(parts)
    return (f'<div style="position:relative;width:{canvas_w}px;height:{canvas_h}px;overflow:hidden;'
            f'background:var(--background);font-family:\'DM Sans\',Inter,'
            f'\'PingFang SC\',\'Microsoft YaHei\',sans-serif;">\n  {inner}\n</div>')


def render_with_content(fs: dict, frame_id: str, slots: dict) -> str:
    """用指定框架 + 内容字典渲染 HTML(几何来自 JSON，缺失槽位回退 example)。"""
    frame = _frame_by_id(fs, frame_id)
    if frame is None:
        return ""
    cw, ch = fs.get("canvas", [1280, 720])
    return render_frame(frame, slots or {}, cw, ch)


def catalog_prompt(cat: list) -> str:
    """把框架目录压成一段给大模型的文本(每槽带字数上限)。"""
    lines = []
    for c in cat:
        slot_brief = ", ".join(f"{s['key']}({s['role_cn']}≤{s['cap']}字)" for s in c["slots"])
        lines.append(f"- {c['id']} [页型:{c['page_type']}, {c['summary']}]\n    槽位: {slot_brief}")
    return "\n".join(lines)
