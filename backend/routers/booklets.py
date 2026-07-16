"""电子成册 — 跨工作区内容装订为自包含 HTML 电子书。

独立模块：草稿 CRUD / 内容枚举与快照 / 主题 / 装配渲染。
权限模型：管理员可见全部草稿；会员仅可见/操作自己的草稿。
会员内容入口按 project_unlocks 过滤（未过期），内容出口逐次校验解锁。
注意：静态子路由（available-content/content-item/themes）必须注册在 /{booklet_id} 之前。

装配契约（5.2）：
- 模板内不得写死任何书名/署名/章节/颜色实值，全部经 PLACEHOLDERS 占位符注入
- 替换逻辑集中在 render_booklet() 单函数
- 渲染后断言：产物中不允许残留任何 {{PLACEHOLDER}}，残留即 500
- 主题归一化为同一组 --book-* CSS 变量注入，模板与主题解耦
"""

import base64
import html as html_lib
import importlib.util
import json
import os
import re
import uuid
from datetime import date
from urllib.parse import quote as url_quote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel
from database import get_db

router = APIRouter(prefix="/api/booklets")

VALID_BOOK_TYPES = {"a4", "ppt"}

# ── 资源目录（与 prompt_studio 同款定位方式） ──

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_BOOKLET_RES_DIR = os.path.join(_BASE_DIR, "resources", "booklet")

# ── 占位符契约（代码即契约：模板占位符与本表一一对应） ──

PLACEHOLDERS = [
    "BOOK_TITLE", "BOOK_SUBTITLE", "BOOK_AUTHOR", "BOOK_ORG", "BOOK_DATE",
    "FLYLEAF_TEXT", "BACK_COVER_TEXT", "BRAND_COPYRIGHT", "BRAND_SIGNATURE",
    "BOOK_LOGO", "TOC_ENTRIES", "CHAPTERS", "PAGE_TOTAL", "THEME_CSS_VARS",
]

# step_md 内容项：step_name → 默认标签（col2 标签优先读工作区 column_configs）
STEP_MD_ITEMS_A4 = [
    ("step2_sop", "标准文档"),
    ("step2_daoshuyi", "分析文档"),
    ("step2_yanxi", "综合文档"),
    ("step4_speech_doc", "文档演讲稿"),
    ("step4_speech_analysis", "分析演讲稿"),
    ("step4_speech_comprehensive", "综合演讲稿"),
]
VALID_STEP_MD_KEYS = {k for k, _ in STEP_MD_ITEMS_A4}

# col2 三份文档的 sort_order → step_name（工作区标签映射用）
_COL2_SORT_TO_STEP = {3: "step2_sop", 4: "step2_daoshuyi", 5: "step2_yanxi"}

# html 内容项：book_type → [(column_id, source_type, 默认标签)]
HTML_ITEMS_BY_TYPE = {
    "a4": [("col3", "a4_html", "文档课件")],
    "ppt": [("col4", "ppt_html", "分析PPT"), ("col5", "ppt_html", "综合PPT")],
}


# ── 主题模块（文件路径加载，兼容 PyInstaller 冻结模式） ──


def _load_themes_module():
    path = os.path.join(_BOOKLET_RES_DIR, "themes.py")
    if not os.path.isfile(path):
        raise HTTPException(500, "主题资源文件不存在: resources/booklet/themes.py")
    spec = importlib.util.spec_from_file_location("booklet_themes", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _all_themes() -> list:
    """内置主题 + 风格模板配色（归一化为同一组色键）。"""
    mod = _load_themes_module()
    themes = [dict(t) for t in mod.BUILTIN_THEMES]
    try:
        from services.svg_renderer import StyleLoader
        loader = StyleLoader()
        for group in loader.list_styles():
            for s in group.get("styles", []):
                c = s.get("colors") or {}
                if not c.get("primary"):
                    continue
                themes.append({
                    "id": f"style-{s['id']}",
                    "name": s.get("name") or s["id"],
                    "source": "style_tmpl",
                    "colors": {
                        "primary": c.get("primary", ""),
                        "accent": c.get("accent", ""),
                        "bg": c.get("background", ""),
                        "text": c.get("text", ""),
                    },
                })
    except Exception:
        pass  # 风格库不可用时至少保留内置主题
    return themes


# ── Auth helpers（读 request.state.user，避免与 app.py 循环导入） ──


def _require_user(request: Request) -> dict:
    user = getattr(request.state, "user", None)
    if user is None or not user.get("sub"):
        raise HTTPException(401, "请先登录")
    return user


def _is_admin(user: dict) -> bool:
    return user.get("user_type") == "admin"


def _user_id(user: dict) -> str:
    return user.get("user_id", user.get("sub", ""))


def _member_unlocked_project_ids(db, user: dict) -> set:
    """会员当前未过期解锁的明细 id 集合。"""
    rows = db.execute(
        """SELECT project_id FROM project_unlocks
           WHERE user_id=? AND (expires_at IS NULL OR expires_at > datetime('now'))""",
        (_user_id(user),),
    ).fetchall()
    return {r["project_id"] for r in rows}


def _check_project_readable(db, user: dict, project_id: str):
    """内容出口校验：管理员放行；会员必须持有未过期解锁，否则 403。"""
    proj = db.execute("SELECT id FROM projects WHERE id=?", (project_id,)).fetchone()
    if not proj:
        raise HTTPException(404, "明细不存在")
    if _is_admin(user):
        return
    if project_id not in _member_unlocked_project_ids(db, user):
        raise HTTPException(403, "该明细未解锁，无法调取内容")


def _get_booklet_or_403(db, booklet_id: str, user: dict):
    row = db.execute("SELECT * FROM booklets WHERE id=?", (booklet_id,)).fetchone()
    if not row:
        raise HTTPException(404, "册子不存在")
    if not _is_admin(user) and row["owner_id"] != user["sub"]:
        raise HTTPException(403, "无权访问该册子")
    return row


def _row_to_full(row) -> dict:
    return {
        "id": row["id"],
        "owner_id": row["owner_id"],
        "owner_role": row["owner_role"],
        "book_type": row["book_type"],
        "title": row["title"],
        "subtitle": row["subtitle"] or "",
        "author": row["author"] or "",
        "cover": json.loads(row["cover_json"] or "{}"),
        "chapters": json.loads(row["chapters_json"] or "[]"),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


# ── 内容源解析 ──


def _project_ppt_runs(db, project_id: str) -> dict:
    """项目已生成的 PPT 导出 run：column_id → run_id（来自 step_results 白名单）。"""
    rows = db.execute(
        "SELECT step_name, content FROM step_results "
        "WHERE project_id=? AND step_name LIKE '_ppt_result_%'",
        (project_id,),
    ).fetchall()
    runs = {}
    for r in rows:
        run_id = r["step_name"].replace("_ppt_result_", "", 1)
        try:
            meta = json.loads(r["content"] or "{}")
        except (ValueError, TypeError):
            meta = {}
        col_id = meta.get("column_id") or (run_id.rsplit("_", 1)[-1] if "_" in run_id else "")
        if col_id:
            runs[col_id] = run_id
    return runs


def _resolve_run_index_html(run_id: str) -> str:
    """解析 run_id 对应的 index.html 路径（复用 app.py 的 run_dirs 映射）。

    run_id 必须先经 _project_ppt_runs 白名单校验，此处不接受任意输入。
    """
    from app import _run_dirs, EXPORT_DIR  # 延迟导入，规避循环依赖
    run_dir = _run_dirs.get(run_id)
    if not run_dir:
        candidate = os.path.join(EXPORT_DIR, run_id)
        if os.path.isdir(candidate):
            run_dir = candidate
    if not run_dir or not os.path.isdir(run_dir):
        return ""
    index_path = os.path.join(run_dir, "index.html")
    return index_path if os.path.isfile(index_path) else ""


def _workspace_labels(db, workspace_id: str) -> dict:
    """工作区栏目标签：step_name/column_id → 自定义标签。"""
    labels = {}
    try:
        rows = db.execute(
            "SELECT column_id, label, sort_order FROM column_configs WHERE workspace_id=?",
            (workspace_id,),
        ).fetchall()
        for r in rows:
            if r["column_id"] == "col2" and r["sort_order"] in _COL2_SORT_TO_STEP:
                labels[_COL2_SORT_TO_STEP[r["sort_order"]]] = r["label"]
            elif r["column_id"] in ("col3", "col4", "col5"):
                labels[r["column_id"]] = r["label"]
    except Exception:
        pass
    return labels


# ── 装配辅助 ──


def _load_book_template(book_type: str) -> str:
    path = os.path.join(_BOOKLET_RES_DIR, f"{book_type}_book.html")
    if not os.path.isfile(path):
        raise HTTPException(500, f"模板文件不存在: resources/booklet/{book_type}_book.html")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _load_branding_pair() -> tuple:
    """settings 表品牌信息（无配置则空串）。"""
    db = get_db()
    copyright_str, signature_str = "", ""
    try:
        rows = db.execute(
            "SELECT key, value FROM settings WHERE key IN ('branding_copyright', 'branding_signature')"
        ).fetchall()
        for r in rows:
            if r["key"] == "branding_copyright" and r["value"]:
                copyright_str = r["value"]
            elif r["key"] == "branding_signature" and r["value"]:
                signature_str = r["value"]
    except Exception:
        pass
    finally:
        db.close()
    return copyright_str, signature_str


_LOGO_MEDIA = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
    ".ico": "image/x-icon",
}


def _logo_data_uri(logo_url: str) -> str:
    """把 /api/logos/{filename} 转为 base64 data URI（自包含要求）。"""
    if not logo_url or not logo_url.startswith("/api/logos/"):
        return ""
    filename = os.path.basename(logo_url)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in _LOGO_MEDIA:
        return ""
    from app import LOGO_DIR  # 延迟导入，规避循环依赖
    path = os.path.join(LOGO_DIR, filename)
    if not os.path.isfile(path):
        return ""
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    return f"data:{_LOGO_MEDIA[ext]};base64,{b64}"


def _strip_scripts(fragment: str) -> str:
    return re.sub(r"<script\b[^>]*>.*?</script>", "", fragment, flags=re.S | re.I)


def _remove_external_refs(fragment: str) -> str:
    """自包含约束：剥离 http(s) 外链资源（link 标签 / img 外链 / CSS @import）。"""
    fragment = re.sub(r"<link\b[^>]*>", "", fragment, flags=re.I)
    fragment = re.sub(r"<img\b[^>]*src=[\"']https?://[^>]*>", "", fragment, flags=re.I)
    fragment = re.sub(r"@import\s+url\([^)]*https?://[^)]*\)\s*;?", "", fragment, flags=re.I)
    return fragment


def _inline_local_images(fragment: str) -> str:
    """把 /api/logos/ 本地图片引用内联为 base64。"""
    def _sub(m):
        uri = _logo_data_uri(m.group(2))
        return f'{m.group(1)}"{uri}"' if uri else f'{m.group(1)}""'
    return re.sub(r'(src=)["\'](/api/logos/[^"\']+)["\']', _sub, fragment)


def _sanitize_fragment(fragment: str) -> str:
    return _inline_local_images(_remove_external_refs(_strip_scripts(fragment)))


def _extract_head_styles(source_html: str) -> str:
    """提取课件 HTML <head> 内全部 <style> 块（保留原页面样式）。"""
    head_match = re.search(r"<head\b.*?</head>", source_html, flags=re.S | re.I)
    scope = head_match.group(0) if head_match else source_html
    styles = re.findall(r"<style\b[^>]*>.*?</style>", scope, flags=re.S | re.I)
    return "\n".join(styles)


def _extract_slide_wrappers(source_html: str) -> list:
    """按 div 配对扫描提取每个 .slide-wrapper 完整节点（正则不处理嵌套，需手工计数）。"""
    wrappers = []
    for m in re.finditer(r'<div\b[^>]*class="[^"]*slide-wrapper[^"]*"', source_html):
        start = m.start()
        depth = 0
        pos = start
        tag_re = re.compile(r"<div\b|</div>", re.I)
        for tag in tag_re.finditer(source_html, start):
            if tag.group(0).lower().startswith("<div"):
                depth += 1
            else:
                depth -= 1
            if depth == 0:
                pos = tag.end()
                break
        if pos > start:
            wrappers.append(source_html[start:pos])
    return wrappers


def _srcdoc_escape(doc: str) -> str:
    return doc.replace("&", "&amp;").replace('"', "&quot;")


def _build_embed_srcdocs(source_html: str, page_size: tuple) -> list:
    """把课件 HTML 拆成每页一个自包含 srcdoc（原样式 + 单页节点，iframe 隔离防互染）。"""
    styles = _sanitize_fragment(_extract_head_styles(source_html))
    wrappers = _extract_slide_wrappers(source_html)
    w, h = page_size
    docs = []
    for wrapper in wrappers:
        page = _sanitize_fragment(wrapper)
        doc = (
            "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">"
            f"{styles}"
            f"<style>html,body{{margin:0;padding:0;overflow:hidden;width:{w}px;height:{h}px;}}"
            ".slide-wrapper{margin:0 !important;}</style>"
            f"</head><body>{page}</body></html>"
        )
        docs.append(_srcdoc_escape(doc))
    return docs


def _esc(text: str) -> str:
    return html_lib.escape(text or "", quote=False)


# ── 装配引擎（单函数：全部占位符替换集中于此） ──


def render_booklet(booklet: dict, theme: dict) -> str:
    """把草稿装配为自包含单文件 HTML 电子书。

    booklet: _row_to_full 结构；theme: {id, name, colors} 归一化主题。
    渲染后断言无 {{PLACEHOLDER}} 残留，残留即抛 500。
    """
    book_type = booklet["book_type"]
    template = _load_book_template(book_type)
    themes_mod = _load_themes_module()
    cover = booklet.get("cover") or {}
    chapters = [c for c in (booklet.get("chapters") or []) if c.get("enabled", True)]
    if not chapters:
        raise HTTPException(400, "册子没有启用的章节，无法合成")

    brand_copyright, brand_signature = _load_branding_pair()

    logo_uri = _logo_data_uri(cover.get("logo_url", ""))
    logo_html = f'<img class="bk-cover-logo" src="{logo_uri}" alt="logo">' if logo_uri else ""

    toc_parts, chapter_parts = [], []
    for i, ch in enumerate(chapters, start=1):
        anchor = f"bk-ch-{i}"
        title = _esc(ch.get("title") or f"第{i}章")
        src_name = _esc(ch.get("project_name") or "")
        src_line = f"来源：{src_name}" if src_name else "自建章节"

        if book_type == "a4":
            toc_parts.append(
                f'<li><a href="#{anchor}"><span class="bk-toc-num">{i:02d}</span>'
                f'<span class="bk-toc-label">{title}</span><span class="bk-toc-dots"></span></a></li>'
            )
            if ch.get("source_type") in ("step_md", "custom"):
                body = _sanitize_fragment(ch.get("content_html") or "")
                chapter_parts.append(
                    f'<section class="bk-sheet bk-chapter" id="{anchor}"><div class="bk-sheet-inner">'
                    f'<div class="bk-chapter-head"><div class="bk-chapter-no">第 {i} 章</div>'
                    f'<div class="bk-chapter-title">{title}</div>'
                    f'<div class="bk-chapter-src">{src_line}</div></div>'
                    f'<div class="bk-prose">{body}</div></div></section>'
                )
            else:  # a4_html：课件按页拆分，iframe 隔离
                srcdocs = _build_embed_srcdocs(ch.get("content") or "", (794, 1123))
                if not srcdocs:
                    raise HTTPException(400, f"章节「{ch.get('title', '')}」课件内容为空或格式不支持")
                for k, sd in enumerate(srcdocs):
                    id_attr = f' id="{anchor}"' if k == 0 else ""
                    cls = "bk-sheet bk-embed-sheet" + (" bk-chapter" if k == 0 else "")
                    chapter_parts.append(
                        f'<section class="{cls}"{id_attr}>'
                        f'<iframe class="bk-embed-frame" srcdoc="{sd}"></iframe></section>'
                    )
        else:  # ppt
            toc_parts.append(
                f'<li><a href="#" data-slide-target="{anchor}"><span class="bk-toc-num">{i:02d}</span>'
                f'<span class="bk-toc-label">{title}</span><span class="bk-toc-dots"></span></a></li>'
            )
            chapter_parts.append(
                f'<section class="bk-slide bk-chapter-divider" id="{anchor}">'
                f'<div class="bk-chapter-no">CHAPTER {i:02d}</div>'
                f'<div class="bk-chapter-title">{title}</div>'
                f'<div class="bk-chapter-src">{src_line}</div></section>'
            )
            if ch.get("source_type") in ("step_md", "custom"):
                body = _sanitize_fragment(ch.get("content_html") or "")
                chapter_parts.append(
                    f'<section class="bk-slide bk-prose-slide"><div class="bk-prose">{body}</div></section>'
                )
            else:  # ppt_html：每片一屏
                srcdocs = _build_embed_srcdocs(ch.get("content") or "", (1280, 720))
                if not srcdocs:
                    raise HTTPException(400, f"章节「{ch.get('title', '')}」PPT 内容为空或格式不支持")
                for sd in srcdocs:
                    chapter_parts.append(
                        f'<section class="bk-slide">'
                        f'<iframe class="bk-embed-frame" srcdoc="{sd}"></iframe></section>'
                    )

    values = {
        "BOOK_TITLE": _esc(booklet.get("title")),
        "BOOK_SUBTITLE": _esc(booklet.get("subtitle")),
        "BOOK_AUTHOR": _esc(booklet.get("author")),
        "BOOK_ORG": _esc(cover.get("org")),
        "BOOK_DATE": _esc(cover.get("date_text")) or date.today().strftime("%Y年%m月%d日"),
        "FLYLEAF_TEXT": _esc(cover.get("flyleaf_text")),
        "BACK_COVER_TEXT": _esc(cover.get("back_cover_text")),
        "BRAND_COPYRIGHT": _esc(brand_copyright),
        "BRAND_SIGNATURE": _esc(brand_signature),
        "BOOK_LOGO": logo_html,
        "TOC_ENTRIES": "\n".join(toc_parts),
        "CHAPTERS": "\n".join(chapter_parts),
        "PAGE_TOTAL": str(len(chapters)),
        "THEME_CSS_VARS": themes_mod.theme_css_vars(theme.get("colors") or {}),
    }

    out = template
    for name in PLACEHOLDERS:
        out = out.replace("{{" + name + "}}", values[name])

    residue = [name for name in PLACEHOLDERS if ("{{" + name + "}}") in out]
    if residue:
        raise HTTPException(500, f"模板占位符残留未替换: {residue}")
    return out


# ── Pydantic models ──


class BookletCreate(BaseModel):
    title: str
    book_type: str


class BookletUpdate(BaseModel):
    title: str = None
    subtitle: str = None
    author: str = None
    cover: dict = None
    chapters: list = None


# ══ 静态子路由（必须在 /{booklet_id} 之前注册） ══


# ── API #6 可用内容枚举 ──


@router.get("/available-content")
def available_content(request: Request, book_type: str = "a4", workspace_id: str = ""):
    user = _require_user(request)
    if book_type not in VALID_BOOK_TYPES:
        raise HTTPException(400, f"册子类型非法: {book_type}")
    db = get_db()
    try:
        admin = _is_admin(user)
        unlocked = None if admin else _member_unlocked_project_ids(db, user)

        if not workspace_id:
            # 工作区列表：管理员=全部；会员=有已解锁明细的工作区
            if admin:
                rows = db.execute(
                    "SELECT id, name FROM workspaces ORDER BY updated_at DESC"
                ).fetchall()
                return {"workspaces": [{"id": r["id"], "name": r["name"]} for r in rows]}
            if not unlocked:
                return {"workspaces": []}
            marks = ",".join("?" * len(unlocked))
            rows = db.execute(
                f"SELECT DISTINCT w.id, w.name FROM workspaces w "
                f"JOIN projects p ON p.workspace_id = w.id "
                f"WHERE p.id IN ({marks}) ORDER BY w.updated_at DESC",
                tuple(unlocked),
            ).fetchall()
            return {"workspaces": [{"id": r["id"], "name": r["name"]} for r in rows]}

        # 明细及内容项树
        proj_rows = db.execute(
            "SELECT id, name FROM projects WHERE workspace_id=? ORDER BY updated_at DESC",
            (workspace_id,),
        ).fetchall()
        labels = _workspace_labels(db, workspace_id)
        projects = []
        for p in proj_rows:
            if not admin and p["id"] not in unlocked:
                continue
            items = []
            if book_type == "a4":
                step_rows = db.execute(
                    "SELECT step_name, length(content) AS n FROM step_results "
                    "WHERE project_id=? AND step_name IN ({})".format(
                        ",".join("?" * len(VALID_STEP_MD_KEYS))),
                    (p["id"], *VALID_STEP_MD_KEYS),
                ).fetchall()
                lengths = {r["step_name"]: r["n"] or 0 for r in step_rows}
                for key, default_label in STEP_MD_ITEMS_A4:
                    items.append({
                        "source_type": "step_md",
                        "source_key": key,
                        "label": labels.get(key, default_label),
                        "available": lengths.get(key, 0) > 0,
                    })
            runs = _project_ppt_runs(db, p["id"])
            for col_id, source_type, default_label in HTML_ITEMS_BY_TYPE[book_type]:
                run_id = runs.get(col_id, "")
                has_file = bool(run_id and _resolve_run_index_html(run_id))
                items.append({
                    "source_type": source_type,
                    "source_key": run_id,
                    "label": labels.get(col_id, default_label),
                    "available": has_file,
                })
            projects.append({"id": p["id"], "name": p["name"], "items": items})
        return {"projects": projects}
    finally:
        db.close()


# ── API #7 内容快照 ──


@router.get("/content-item")
def content_item(request: Request, project_id: str, source_type: str, source_key: str):
    user = _require_user(request)
    db = get_db()
    try:
        _check_project_readable(db, user, project_id)

        if source_type == "step_md":
            if source_key not in VALID_STEP_MD_KEYS:
                raise HTTPException(400, f"内容键非法: {source_key}")
            row = db.execute(
                "SELECT content FROM step_results WHERE project_id=? AND step_name=?",
                (project_id, source_key),
            ).fetchone()
            if not row or not (row["content"] or "").strip():
                raise HTTPException(404, "该内容尚未生成")
            return {"content": row["content"], "content_format": "md"}

        if source_type in ("a4_html", "ppt_html"):
            # 白名单：source_key 必须是该明细 step_results 登记过的 run_id，杜绝目录穿越
            runs = _project_ppt_runs(db, project_id)
            if source_key not in runs.values():
                raise HTTPException(400, "内容键非法或不属于该明细")
            index_path = _resolve_run_index_html(source_key)
            if not index_path:
                raise HTTPException(404, "该课件文件不存在")
            with open(index_path, "r", encoding="utf-8") as f:
                return {"content": f.read(), "content_format": "html"}

        raise HTTPException(400, f"内容类型非法: {source_type}")
    finally:
        db.close()


# ── API #8 主题列表 ──


@router.get("/themes")
def list_themes(request: Request):
    _require_user(request)
    return {"themes": _all_themes()}


# ══ 草稿 CRUD ══


# ── API #1 草稿列表（摘要） ──


@router.get("")
def list_booklets(request: Request):
    user = _require_user(request)
    db = get_db()
    try:
        if _is_admin(user):
            rows = db.execute(
                "SELECT id, owner_id, owner_role, book_type, title, subtitle, "
                "chapters_json, updated_at FROM booklets ORDER BY updated_at DESC"
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT id, owner_id, owner_role, book_type, title, subtitle, "
                "chapters_json, updated_at FROM booklets WHERE owner_id=? "
                "ORDER BY updated_at DESC",
                (user["sub"],),
            ).fetchall()
        items = []
        for r in rows:
            try:
                chapter_count = len(json.loads(r["chapters_json"] or "[]"))
            except (ValueError, TypeError):
                chapter_count = 0
            items.append({
                "id": r["id"],
                "owner_id": r["owner_id"],
                "owner_role": r["owner_role"],
                "book_type": r["book_type"],
                "title": r["title"],
                "subtitle": r["subtitle"] or "",
                "chapter_count": chapter_count,
                "updated_at": r["updated_at"],
            })
        return {"booklets": items}
    finally:
        db.close()


# ── API #2 新建草稿 ──


@router.post("")
def create_booklet(req: BookletCreate, request: Request):
    user = _require_user(request)
    title = (req.title or "").strip()
    if not title:
        raise HTTPException(400, "书名不能为空")
    if req.book_type not in VALID_BOOK_TYPES:
        raise HTTPException(400, f"册子类型非法: {req.book_type}（仅支持 a4/ppt）")
    booklet_id = f"bk-{uuid.uuid4().hex[:12]}"
    db = get_db()
    try:
        db.execute(
            "INSERT INTO booklets (id, owner_id, owner_role, book_type, title) "
            "VALUES (?, ?, ?, ?, ?)",
            (booklet_id, user["sub"], user.get("user_type") or "member",
             req.book_type, title),
        )
        db.commit()
        row = db.execute("SELECT * FROM booklets WHERE id=?", (booklet_id,)).fetchone()
        return _row_to_full(row)
    finally:
        db.close()


# ── API #9 合成下载 ──


@router.post("/{booklet_id}/render")
def render_booklet_api(booklet_id: str, request: Request):
    user = _require_user(request)
    db = get_db()
    try:
        row = _get_booklet_or_403(db, booklet_id, user)
        booklet = _row_to_full(row)
    finally:
        db.close()

    cover = booklet.get("cover") or {}
    theme_id = cover.get("theme_id") or ""
    theme_colors = cover.get("theme_colors") or {}
    theme = None
    if theme_id:
        theme = next((t for t in _all_themes() if t["id"] == theme_id), None)
    if theme is None:
        theme = {"id": "custom", "name": "自定义", "colors": theme_colors}
    elif theme_colors:
        theme = {**theme, "colors": {**theme["colors"], **theme_colors}}

    html_out = render_booklet(booklet, theme)

    safe_title = "".join(c for c in booklet["title"] if c.isalnum() or c in "._- ()（）") or "booklet"
    quoted = url_quote(f"{safe_title}.html")
    return Response(
        content=html_out,
        media_type="text/html; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quoted}",
        },
    )


# ── API #3 草稿详情 ──


@router.get("/{booklet_id}")
def get_booklet(booklet_id: str, request: Request):
    user = _require_user(request)
    db = get_db()
    try:
        row = _get_booklet_or_403(db, booklet_id, user)
        return _row_to_full(row)
    finally:
        db.close()


# ── API #4 更新草稿 ──


@router.put("/{booklet_id}")
def update_booklet(booklet_id: str, req: BookletUpdate, request: Request):
    user = _require_user(request)
    db = get_db()
    try:
        _get_booklet_or_403(db, booklet_id, user)
        sets, params = [], []
        if req.title is not None:
            title = req.title.strip()
            if not title:
                raise HTTPException(400, "书名不能为空")
            sets.append("title=?")
            params.append(title)
        if req.subtitle is not None:
            sets.append("subtitle=?")
            params.append(req.subtitle)
        if req.author is not None:
            sets.append("author=?")
            params.append(req.author)
        if req.cover is not None:
            sets.append("cover_json=?")
            params.append(json.dumps(req.cover, ensure_ascii=False))
        if req.chapters is not None:
            for ch in req.chapters:
                if not isinstance(ch, dict):
                    raise HTTPException(400, "章节格式非法")
            sets.append("chapters_json=?")
            params.append(json.dumps(req.chapters, ensure_ascii=False))
        if not sets:
            raise HTTPException(400, "没有可更新的字段")
        sets.append("updated_at=CURRENT_TIMESTAMP")
        params.append(booklet_id)
        db.execute(f"UPDATE booklets SET {', '.join(sets)} WHERE id=?", params)
        db.commit()
        row = db.execute("SELECT * FROM booklets WHERE id=?", (booklet_id,)).fetchone()
        return _row_to_full(row)
    finally:
        db.close()


# ── API #5 删除草稿 ──


@router.delete("/{booklet_id}")
def delete_booklet(booklet_id: str, request: Request):
    user = _require_user(request)
    db = get_db()
    try:
        _get_booklet_or_403(db, booklet_id, user)
        db.execute("DELETE FROM booklets WHERE id=?", (booklet_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()
