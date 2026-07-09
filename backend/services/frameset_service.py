# -*- coding: utf-8 -*-
"""
框架集服务（生产）：从真实 PPT 提取的框架集 → 大模型选框架 + 填内容 → 渲染 HTML。
几何(L/T/W/H)/字号/层级/配色 100% 来自 resources/framesets/{style}.json，代码不写坐标。
大模型只做两件事：① 选一个 frame_id ② 给每个槽位(content_key)填文本。

对外主函数：
  load_frameset(style_id) -> dict            读取框架集 JSON
  frame_catalog(fs) -> list                  给大模型看的框架目录(含每槽字数上限)
  render_with_content(fs, frame_id, slots)   按框架真实几何渲染(占位缺失回退example)
  render_from_vi(style_id, frame_id, slots)  从可编辑的 VI .md 模板渲染
"""
import json
import re
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
    "image":       {"weight": 600, "lh": 1.35, "align": "center", "valign": "center"},
}

ROLE_DESC = {
    "page_title": "页面主标题", "page_number": "页码", "hero_numeral": "大号数字",
    "hero_word": "大号词", "item_index": "条目序号", "section_title": "章节大标题",
    "item_title": "条目标题", "lead_text": "引导句/小标题", "item_subtitle": "条目副标题",
    "caption": "小注/说明", "body_text": "正文", "footnote": "脚注", "text": "文字",
    "image": "图片区(可填说明或留作配图)",
}

# 判定"整页背景图"：铺满画布的 PICTURE 只作柔和背板，不开文字槽（否则变巨型文字框）。
_FULLSCREEN = 95.0


def _esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def _geom_style(g):
    return (f"position:absolute;left:{g['L']}%;top:{g['T']}%;"
            f"width:{g['W']}%;height:{g['H']}%;box-sizing:border-box;overflow:hidden;")


def _is_fullscreen_pic(c) -> bool:
    g = c.get("geom", {})
    return (g.get("W", 0) >= _FULLSCREEN and g.get("H", 0) >= _FULLSCREEN)


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
    """给每个文字容器打 _content_key（role + 同role出现序），供 content 字典寻址。

    非整页的 PICTURE 也开一个 image#n 可选文字槽：大模型可填配图说明，或留空作配图位
    （本轮文字优先，真实图片下一轮）。整页背景图不开槽（只作柔和背板）。
    """
    seen = {}
    for c in sorted(frame["containers"], key=lambda x: x["z"]):
        if c["role"] in ("panel", "divider") or c["kind"] == "TABLE":
            continue
        if c["kind"] == "PICTURE" and _is_fullscreen_pic(c):
            continue
        i = seen.get(c["role"], 0)
        c["_content_key"] = f"{c['role']}#{i}"
        seen[c["role"]] = i + 1
    return frame


# ── 框架集缓存 ──
_CACHE = {}


def load_frameset(style_id: str = "business") -> dict | None:
    """读取 resources/framesets/{style_id}.json；无则回退 business.json。"""
    # style_id 直接拼进文件路径，必须限制为安全标识符，防止路径穿越(../)。
    if not style_id or not re.fullmatch(r"[A-Za-z0-9_-]+", style_id):
        style_id = "business"
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
    """给大模型的框架目录：[{id,page_type,page,n_slots,summary,slots:[{key,role,role_cn,fs,cap,example,optional}]}]"""
    cw, ch = fs.get("canvas", [1280, 720])
    cat = []
    for f in fs["frames"]:
        slots, panels, pics, tables = [], 0, 0, 0
        for c in sorted(f["containers"], key=lambda x: x["z"]):
            if c["role"] == "panel":
                panels += 1; continue
            if c["role"] == "divider":
                continue
            if c["kind"] == "TABLE":
                tables += 1; continue
            key = c.get("_content_key")
            if c["kind"] == "PICTURE":
                pics += 1
                if not key:            # 整页背景图无槽
                    continue
            if not key:
                continue
            fs_px = c.get("fs") or 14
            slots.append({
                "key": key, "role": c["role"],
                "role_cn": ROLE_DESC.get(c["role"], c["role"]),
                "fs": fs_px, "cap": _capacity(c["geom"], fs_px, c["role"], cw, ch),
                "example": (c.get("example") or "")[:24],
                "optional": (c["kind"] == "PICTURE"),
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
            # 柔和 var() 背板（非刺眼虚线）。非整页图开一个可选 caption 文字槽，
            # 大模型可填配图说明；留空则渲染为纯柔和背板。真实配图下一轮另做。
            soft = "background:rgba(var(--text-rgb),0.04);border-radius:8px;"
            key = c.get("_content_key")
            if key:
                st = ROLE_STYLE["image"]
                fs_px = c.get("fs") or 14
                color = c.get("text_var") or "var(--text)"
                txt = content.get(key) if key in content else ""
                parts.append(
                    f'<div style="{base}{soft}display:flex;flex-direction:column;'
                    f'justify-content:center;font-size:{fs_px}px;font-weight:{st["weight"]};'
                    f'line-height:{st["lh"]};color:{color};text-align:center;'
                    f'white-space:pre-line;">{_esc(txt)}</div>')
            else:
                parts.append(f'<div style="{base}{soft}"></div>')
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


# ── 从 VI 文件渲染（可编辑的渲染源）──
_VI_BASE = Path(__file__).resolve().parent.parent / "resources" / "vi"
_SAFE_ID = re.compile(r"[A-Za-z0-9_-]+")


def render_from_vi(style_id: str, frame_id: str, slots: dict,
                   seq=None, total=None) -> str:
    """从 resources/vi/{style}/framesets/{frame_id}.md 读 HTML 模板并填槽渲染。

    与 render_with_content 的区别：几何来源是**可在 VI 编辑器里改**的 .md 文件，
    而非只读的 JSON。用户改模板里的 var()/font-size，合成输出即跟着变。
    - 模板里每个文字格子是 {{content_key}} 占位符（如 {{item_title#0}}）。
    - slots: {content_key: 文本}，逐个 replace（HTML 转义）。
    - page_number#* 若给了 seq/total，用真实页码覆盖。
    - 剩余未填占位符清空，不残留。
    文件缺失或无 ```html``` 块 → 返回 ""（调用方回退 JSON 渲染）。
    """
    if not style_id or not _SAFE_ID.fullmatch(style_id):
        return ""
    if not frame_id or not _SAFE_ID.fullmatch(frame_id):
        return ""
    path = _VI_BASE / style_id / "framesets" / f"{frame_id}.md"
    if not path.exists():
        return ""
    md = path.read_text(encoding="utf-8")
    import re as _re
    m = _re.search(r"```html\s*\n(.*?)\n```", md, _re.DOTALL)
    if not m:
        return ""
    html = m.group(1).strip()

    # 页码由系统覆盖（不用大模型猜的值）
    if seq is not None and total is not None:
        html = html.replace("{{page_number#0}}", f"{seq} / {total}")

    for key, text in (slots or {}).items():
        html = html.replace("{{" + str(key) + "}}", _esc(text))

    # 清空剩余占位符（含未填的 page_number）
    html = _re.sub(r"\{\{[^}]+\}\}", "", html)
    return html


def catalog_prompt(cat: list) -> str:
    """把框架目录压成一段给大模型的文本(每槽带字数上限；图片槽标注可选)。"""
    lines = []
    for c in cat:
        briefs = []
        for s in c["slots"]:
            tag = "图片区,可填说明或留空" if s.get("optional") else f"{s['role_cn']}≤{s['cap']}字"
            briefs.append(f"{s['key']}({tag})")
        slot_brief = ", ".join(briefs)
        lines.append(f"- {c['id']} [页型:{c['page_type']}, {c['summary']}]\n    槽位: {slot_brief}")
    return "\n".join(lines)
