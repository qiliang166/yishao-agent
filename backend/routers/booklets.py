"""电子成册 — 跨工作区内容装订为自包含 HTML 电子书。

独立模块：草稿 CRUD / 内容枚举与快照 / 主题 / 装配渲染。
权限模型：管理员可见全部草稿；会员仅可见/操作自己的草稿。
会员内容入口按 project_unlocks 过滤（未过期），内容出口逐次校验解锁。
注意：静态子路由（available-content/content-item/themes）必须注册在 /{booklet_id} 之前。

装配契约（5.2）：
- 模板内不得写死任何书名/署名/章节/颜色实值，全部经 PLACEHOLDERS 占位符注入
- 替换逻辑集中在 render_booklet() 单函数
- 渲染后断言：产物中不允许残留任何 {{PLACEHOLDER}}，残留即 500
- 主题归一化为同一组 VI 规范 CSS 变量注入，模板与主题解耦
"""

import base64
import html as html_lib
import importlib.util
import io
import json
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from permissions import can_access_project
import re
import uuid
from datetime import date
from urllib.parse import quote as url_quote

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from database import get_db

router = APIRouter(prefix="/api/booklets")

VALID_BOOK_TYPES = {"a4", "ppt"}

# ── 资源目录（与 prompt_studio 同款定位方式） ──

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_BOOKLET_RES_DIR = os.path.join(_BASE_DIR, "resources", "booklet")

# ── 占位符契约（代码即契约：模板占位符与本表一一对应；部分占位符仅存在于部分模板，replace 缺位为无操作） ──

PLACEHOLDERS = [
    "BOOK_TITLE", "BOOK_SUBTITLE", "BOOK_AUTHOR", "BOOK_ORG", "BOOK_DATE",
    "FLYLEAF_TEXT", "BACK_COVER_TEXT", "BRAND_COPYRIGHT", "BRAND_SIGNATURE",
    "BOOK_LOGO", "TOC_ENTRIES", "CHAPTERS", "PAGE_TOTAL", "THEME_CSS_VARS",
    "PROSE_ARRANGE", "BOOK_BODY_CLASS",
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
                chart = c.get("chart_colors") or []
                themes.append({
                    "id": f"style-{s['id']}",
                    "name": s.get("name") or s["id"],
                    "source": "style_tmpl",
                    "colors": {
                        "primary": c.get("primary", ""),
                        "secondary": c.get("secondary", ""),
                        "accent": c.get("accent", ""),
                        "bg": c.get("background", ""),
                        "text": c.get("text", ""),
                        "card_bg": c.get("card_bg", ""),
                        **{f"chart-{i}": (chart[i] if i < len(chart) else "") for i in range(8)},
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


def _get_booklet_or_403(db, booklet_id: str, user: dict, readonly_ok: bool = False):
    row = db.execute("SELECT * FROM booklets WHERE id=?", (booklet_id,)).fetchone()
    if not row:
        raise HTTPException(404, "册子不存在")
    is_owner = row["owner_id"] == user["sub"]
    if _is_admin(user) or is_owner:
        return row
    if readonly_ok and row["is_recommended"]:
        # 会员预览推荐画册：校验所有章节来源项目的工作区访问权限
        try:
            chapters = json.loads(row["chapters_json"] or "[]")
        except (ValueError, TypeError):
            chapters = []
        for ch in chapters:
            pid = (ch.get("project_id") or "").strip()
            if pid and not can_access_project(pid, user):
                raise HTTPException(403, "无权访问该册子（含受限工作区内容）")
        return row
    raise HTTPException(403, "无权访问该册子")


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
        "is_recommended": bool(row["is_recommended"]) if "is_recommended" in row.keys() else False,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _deduct_booklet_points(db, user: dict, booklet: dict):
    """下载电子书时扣积分：遍历章节引用的项目，对未解锁项目依次扣积分。"""
    import uuid as _uuid
    from datetime import datetime
    uid = user.get("user_id", user.get("sub", ""))
    # 收集所有章节引用的 project_id
    project_ids = set()
    for ch in booklet.get("chapters") or []:
        pid = (ch.get("project_id") or "").strip()
        if pid:
            project_ids.add(pid)
    if not project_ids:
        return
    marks = ",".join("?" * len(project_ids))
    rows = db.execute(
        f"SELECT id, name, is_downloadable, point_cost_deci FROM projects WHERE id IN ({marks})",
        tuple(project_ids),
    ).fetchall()
    # 只处理 is_downloadable=1 且未解锁的项目
    for proj in rows:
        if not proj["is_downloadable"]:
            continue
        unlock = db.execute(
            "SELECT 1 FROM project_unlocks WHERE user_id=? AND project_id=? "
            "AND (expires_at IS NULL OR expires_at > datetime('now'))",
            (uid, proj["id"]),
        ).fetchone()
        if unlock:
            continue
        cost = int(proj["point_cost_deci"] or 0)
        if cost <= 0:
            continue
        # 扣积分
        now = datetime.utcnow().isoformat()
        cur = db.execute(
            "UPDATE user_points SET balance_deci = balance_deci - ?, updated_at = ? "
            "WHERE user_id = ? AND balance_deci >= ?",
            (cost, now, uid, cost),
        )
        if cur.rowcount == 0:
            # 检查余额
            pts_row = db.execute(
                "SELECT balance_deci FROM user_points WHERE user_id=?", (uid,)
            ).fetchone()
            balance = int(pts_row["balance_deci"]) if pts_row else 0
            raise HTTPException(
                402,
                f"积分不足：下载画册「{booklet.get('title','')}」需要消耗 {cost/10:.1f} 积分（项目「{proj['name']}」），"
                f"当前余额 {balance/10:.1f} 积分",
            )
        # 记录交易
        balance_row = db.execute(
            "SELECT balance_deci FROM user_points WHERE user_id=?", (uid,)
        ).fetchone()
        new_balance = int(balance_row["balance_deci"]) if balance_row else 0
        tx_id = str(_uuid.uuid4())
        db.execute(
            "INSERT INTO points_transactions (id, user_id, amount_deci, balance_after_deci, "
            "type, ref_id, ref_type, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (tx_id, uid, -cost, new_balance, "booklet_download",
             booklet.get("id", ""), "booklet",
             f"下载电子书「{booklet.get('title','')}」— 项目「{proj['name']}」"),
        )
        # 创建解锁记录
        db.execute(
            "INSERT INTO project_unlocks (user_id, project_id, points_spent_deci, unlocked_at) "
            "VALUES (?, ?, ?, ?)",
            (uid, proj["id"], cost, now),
        )


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


def _load_book_template(book_type: str, render_mode: str = "paged") -> str:
    """paged=翻页式(a4_book/ppt_book)；flow=网页式连续长页(a4_flow/ppt_flow)；
    standard=标准页 PDF 型瀑布排布(a4_standard/ppt_standard)。占位符契约相同。"""
    suffix = {"flow": "flow", "standard": "standard"}.get(render_mode, "book")
    path = os.path.join(_BOOKLET_RES_DIR, f"{book_type}_{suffix}.html")
    if not os.path.isfile(path):
        raise HTTPException(500, f"模板文件不存在: resources/booklet/{book_type}_{suffix}.html")
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
    fragment = re.sub(r"<script\b[^>]*>.*?</script>", "", fragment, flags=re.S | re.I)
    fragment = re.sub(r"<script\b[^>]*/?>", "", fragment, flags=re.I)
    return fragment


# XSS 防护（零新增依赖分层策略：服务端正则加固 + 前端 DOMPurify + 预览 iframe sandbox）
_DANGEROUS_TAGS_RE = re.compile(
    r"</?(?:iframe|object|embed|form|meta|base|applet|frameset|frame)\b[^>]*>", re.I)
_EVENT_ATTR_RE = re.compile(r"\s+on[a-zA-Z]+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)", re.I)
_JS_URI_RE = re.compile(
    r"(\b(?:href|src|action|formaction|xlink:href)\s*=\s*[\"']?)\s*"
    r"(?:javascript|vbscript|data:text/html)[^\"'>\s]*", re.I)


def _strip_dangerous_html(fragment: str) -> str:
    fragment = _DANGEROUS_TAGS_RE.sub("", fragment)
    fragment = _EVENT_ATTR_RE.sub("", fragment)
    fragment = _JS_URI_RE.sub(r"\1#", fragment)
    return fragment


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
    return _inline_local_images(_remove_external_refs(_strip_dangerous_html(_strip_scripts(fragment))))


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


def _build_embed_docs(source_html: str, page_size: tuple) -> list:
    """把课件 HTML 拆成每页一个自包含 HTML 文档（原样式 + 单页节点，iframe 隔离防互染）。

    分页唯一事实源：page-map 缩略图与 render 装配都从这里取页，保证页数一致。
    """
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
        docs.append(doc)
    return docs


def _build_embed_srcdocs(source_html: str, page_size: tuple) -> list:
    return [_srcdoc_escape(d) for d in _build_embed_docs(source_html, page_size)]


def _build_fulldoc_doc(source_html: str, page_size: tuple) -> str:
    """导入的整页 HTML（无 slide-wrapper 结构）→ 单页自包含 HTML 文档。"""
    styles = _sanitize_fragment(_extract_head_styles(source_html))
    body_match = re.search(r"<body\b[^>]*>(.*?)</body>", source_html, flags=re.S | re.I)
    body = _sanitize_fragment(body_match.group(1) if body_match else source_html)
    if not body.strip():
        return ""
    w, h = page_size
    return (
        "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">"
        f"{styles}"
        f"<style>html,body{{margin:0;padding:0;width:{w}px;min-height:{h}px;overflow-x:hidden;}}</style>"
        f"</head><body>{body}</body></html>"
    )


def _build_fulldoc_srcdoc(source_html: str, page_size: tuple) -> str:
    doc = _build_fulldoc_doc(source_html, page_size)
    return _srcdoc_escape(doc) if doc else ""


def _esc(text: str) -> str:
    return html_lib.escape(text or "", quote=False)


# ── 装配引擎（单函数：全部占位符替换集中于此） ──

# R3 页面编排：固定页（扉页/目录/封底）模板结构标记，隐藏时物理剥除整块
_BK_FIXED_KEYS = ("flyleaf", "toc", "back")
_BK_FIXED_RE = {
    key: re.compile(r"<!--BK:" + key.upper() + r"-->.*?<!--/BK:" + key.upper() + r"-->", re.S)
    for key in _BK_FIXED_KEYS
}
_BK_MARK_RE = re.compile(r"<!--/?BK:[A-Z]+-->")


def _visible_page_indices(ch: dict, page_count: int) -> list:
    """章节内容页的可见序：page_order 须为 0..n-1 的完整排列（否则回退自然序），再过滤 hidden_pages。"""
    idxs = list(range(page_count))
    order = ch.get("page_order")
    if isinstance(order, list):
        cand = [i for i in order if isinstance(i, int) and 0 <= i < page_count]
        if len(cand) == page_count and len(set(cand)) == page_count:
            idxs = cand
    hidden = {i for i in (ch.get("hidden_pages") or []) if isinstance(i, int)}
    return [i for i in idxs if i not in hidden]


def _prose_arrange_of(ch: dict) -> dict:
    """正文章节拆页编排（R6）：bkSplitProse 浏览器拆页后由模板 JS 应用；此处只做类型清洗。

    与章节级 hidden_pages/page_order（正文语义=整章）互不相干，存量草稿零迁移。
    """
    hidden = [i for i in (ch.get("prose_hidden_pages") or []) if isinstance(i, int) and i >= 0]
    order = ch.get("prose_page_order")
    order = [i for i in order if isinstance(i, int) and i >= 0] if isinstance(order, list) else []
    if not hidden and not order:
        return {}
    return {"hidden": hidden, "order": order}


def _first_chapter_is_html(chapters: list) -> bool:
    """VI 版式判定：第一个启用章节是 HTML 课件 → A4 固定页走 VI A4 版式（与前端 isHtmlFirstChapter 同规则）。"""
    first = next((c for c in (chapters or []) if c.get("enabled", True)), None)
    if first is None:
        return False
    is_prose = (
        first.get("source_type") in ("step_md", "custom")
        and not (first.get("source_type") == "custom" and first.get("content_format") == "html")
    )
    return not is_prose


def render_booklet(booklet: dict, theme: dict) -> str:
    """把草稿装配为自包含单文件 HTML 电子书。

    booklet: _row_to_full 结构；theme: {id, name, colors} 归一化主题。
    页面编排（R3）：cover.hidden_fixed 剥除固定页；章节按 page_order/hidden_pages
    重排与过滤，整章全隐则跳过并按可见章节重新连续编号。
    VI 版式：a4 且第一启用章节为 HTML 课件 → body 注入 bk-vi（固定页走 VI A4 版式）。
    渲染后断言无 {{PLACEHOLDER}} 与 <!--BK: 标记残留，残留即抛 500。
    """
    book_type = booklet["book_type"]
    cover = booklet.get("cover") or {}
    render_mode = cover.get("render_mode")
    if render_mode not in ("flow", "standard"):
        render_mode = "paged"
    template = _load_book_template(book_type, render_mode)
    themes_mod = _load_themes_module()
    chapters = [c for c in (booklet.get("chapters") or []) if c.get("enabled", True)]
    if not chapters:
        raise HTTPException(400, "册子没有启用的章节，无法合成")

    vi_mode = book_type == "a4" and _first_chapter_is_html(chapters)

    # 固定页隐藏（不用 display:none — ppt 翻页 JS 按 .bk-slide 计数，残留节点会数错页）
    hidden_fixed = {s for s in (cover.get("hidden_fixed") or []) if s in _BK_FIXED_KEYS}
    for key in hidden_fixed:
        template = _BK_FIXED_RE[key].sub("", template)

    brand_copyright, brand_signature = _load_branding_pair()

    logo_uri = _logo_data_uri(cover.get("logo_url", ""))
    logo_html = f'<img class="bk-cover-logo" src="{logo_uri}" alt="logo">' if logo_uri else ""

    page_size = (794, 1123) if book_type == "a4" else (1280, 720)
    toc_parts, chapter_parts = [], []
    prose_arrange = {}
    visible_no = 0
    for ch in chapters:
        # custom 章节可携带整页 HTML（导入 .html），按嵌入页处理而非 prose
        is_prose = (
            ch.get("source_type") in ("step_md", "custom")
            and not (ch.get("source_type") == "custom" and ch.get("content_format") == "html")
        )

        # 先取该章内容页并应用编排（prose/fulldoc 单页；embed 按 slide-wrapper 拆页）
        if is_prose:
            docs = [""]  # prose 单页占位（正文走 content_html）
        elif ch.get("source_type") == "custom":
            sd = _build_fulldoc_srcdoc(ch.get("content") or "", page_size)
            if not sd:
                raise HTTPException(400, f"章节「{ch.get('title', '')}」HTML 内容为空或格式不支持")
            docs = [sd]
        else:
            docs = _build_embed_srcdocs(ch.get("content") or "", page_size)
            if not docs:
                kind = "课件" if book_type == "a4" else "PPT"
                raise HTTPException(400, f"章节「{ch.get('title', '')}」{kind}内容为空或格式不支持")
        vis = _visible_page_indices(ch, len(docs))
        if not vis:
            continue  # 整章页面全隐藏：不进目录、不占编号

        visible_no += 1
        i = visible_no
        anchor = f"bk-ch-{i}"
        title = _esc(ch.get("title") or f"第{i}章")
        src_name = _esc(ch.get("project_name") or "")
        src_line = f"来源：{src_name}" if src_name else "自建章节"
        # 章节页面背景色（仅 hex 通过校验才注入，防 CSS 注入）
        ch_bg = themes_mod._safe_css_value("bg", ch.get("bg_color") or "", "")
        bg_style = f' style="background:{ch_bg}"' if ch_bg else ""

        if book_type == "a4":
            toc_parts.append(
                f'<tr><td class="bk-toc-num">{i:02d}</td>'
                f'<td class="bk-toc-title-cell"><a href="#{anchor}">{title}</a></td>'
                f'<td class="bk-toc-page"></td></tr>'
            )
            if is_prose:
                body = _sanitize_fragment(ch.get("content_html") or "")
                arrange = _prose_arrange_of(ch)
                if arrange:
                    prose_arrange[anchor] = arrange
                chapter_parts.append(
                    f'<section class="bk-sheet bk-chapter" id="{anchor}" data-bk-prose="{anchor}"{bg_style}><div class="bk-sheet-inner">'
                    f'<div class="bk-chapter-head"><div class="bk-chapter-no">第 {i} 章</div>'
                    f'<div class="bk-chapter-title">{title}</div>'
                    f'<div class="bk-chapter-src">{src_line}</div></div>'
                    f'<div class="bk-prose">{body}</div></div></section>'
                )
            elif ch.get("source_type") == "custom":  # 导入的整页 HTML
                chapter_parts.append(
                    f'<section class="bk-sheet bk-embed-sheet bk-chapter" id="{anchor}">'
                    f'<iframe class="bk-embed-frame" srcdoc="{docs[0]}"></iframe></section>'
                )
            else:  # a4_html：课件按页拆分，iframe 隔离
                for k, idx in enumerate(vis):
                    id_attr = f' id="{anchor}"' if k == 0 else ""
                    cls = "bk-sheet bk-embed-sheet" + (" bk-chapter" if k == 0 else "")
                    chapter_parts.append(
                        f'<section class="{cls}"{id_attr}>'
                        f'<iframe class="bk-embed-frame" srcdoc="{docs[idx]}"></iframe></section>'
                    )
        else:  # ppt
            toc_parts.append(
                f'<tr data-slide-target="{anchor}"><td class="bk-toc-num">'
                f'<div style="background:var(--chart-{(i-1)%5})">{i:02d}</div></td>'
                f'<td class="bk-toc-title-cell">{title}</td>'
                f'<td class="bk-toc-page"></td></tr>'
            )
            # 章标题片可隐藏（hide_divider）；隐藏时锚点移到第一张可见内容片，目录跳转不失效
            show_divider = not ch.get("hide_divider")
            if show_divider:
                chapter_parts.append(
                    f'<section class="bk-slide bk-chapter-divider" id="{anchor}">'
                    f'<div class="bk-chapter-no">CHAPTER {i:02d}</div>'
                    f'<div class="bk-chapter-title">{title}</div>'
                    f'<div class="bk-chapter-src">{src_line}</div></section>'
                )
            content_id = "" if show_divider else f' id="{anchor}"'
            if is_prose:
                body = _sanitize_fragment(ch.get("content_html") or "")
                arrange = _prose_arrange_of(ch)
                if arrange:
                    prose_arrange[anchor] = arrange
                chapter_parts.append(
                    f'<section class="bk-slide bk-prose-slide" data-bk-prose="{anchor}"{content_id}{bg_style}><div class="bk-prose">{body}</div></section>'
                )
            elif ch.get("source_type") == "custom":  # 导入的整页 HTML
                chapter_parts.append(
                    f'<section class="bk-slide"{content_id}>'
                    f'<iframe class="bk-embed-frame" srcdoc="{docs[0]}"></iframe></section>'
                )
            else:  # ppt_html：每片一屏
                for k, idx in enumerate(vis):
                    id_attr = content_id if k == 0 else ""
                    chapter_parts.append(
                        f'<section class="bk-slide"{id_attr}>'
                        f'<iframe class="bk-embed-frame" srcdoc="{docs[idx]}"></iframe></section>'
                    )

    if visible_no == 0:
        raise HTTPException(400, "所有章节页面均被隐藏，无法合成")

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
        "PAGE_TOTAL": str(visible_no),
        "THEME_CSS_VARS": themes_mod.theme_css_vars(theme.get("colors") or {}),
        # 仅含服务端生成的锚点键与 int 列表，无用户字符串，可安全内嵌 <script>
        "PROSE_ARRANGE": json.dumps(prose_arrange, separators=(",", ":")),
        "BOOK_BODY_CLASS": "bk-vi" if vi_mode else "",
    }

    out = template
    for name in PLACEHOLDERS:
        out = out.replace("{{" + name + "}}", values[name])
    out = _BK_MARK_RE.sub("", out)

    residue = [name for name in PLACEHOLDERS if ("{{" + name + "}}") in out]
    if residue:
        raise HTTPException(500, f"模板占位符残留未替换: {residue}")
    if "<!--BK:" in out or "<!--/BK:" in out:
        raise HTTPException(500, "模板结构标记残留未清除: <!--BK:")
    return out


def _resolve_theme(booklet: dict) -> dict:
    """草稿封面配置 → 归一化主题（render 与 page-map 共用）。"""
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
    if cover.get("desk_none"):
        theme = {**theme, "colors": {**(theme.get("colors") or {}), "desk": "#ffffff"}}
    return theme


_BK_FIXED_DOC_CLASSES = {"cover": "bk-cover", "flyleaf": "bk-flyleaf", "toc": "bk-toc", "back": "bk-back"}


def _build_fixed_docs(booklet: dict, theme: dict) -> dict:
    """固定页缩略图文档：从装配引擎成品中提取固定页 section（单一事实源，主题/目录编号与产物一致）。"""
    bl = dict(booklet)
    cov = dict(bl.get("cover") or {})
    cov["hidden_fixed"] = []  # 已隐藏的固定页也要出缩略图，恢复显示前可预览
    # 缩略图 iframe 是固定 794×1123（A4）几何；flow 模板固定页为自适应高度横幅，
    # 塞进去会宽 96vw、高度塌缩显示为"被截断"→ 与 cover-preview 同规则恒用标准页模板出图
    cov["render_mode"] = "standard"
    bl["cover"] = cov
    try:
        full = render_booklet(bl, theme)
    except Exception:
        return {}  # 章节为空等装配失败 → 前端回退图标，不阻断页面清单
    styles = _extract_head_styles(full)
    w, h = (794, 1123) if booklet.get("book_type") == "a4" else (1280, 720)
    # VI 版式随成品 body class 走：wrapper body 不带 bk-vi 则缩略图丢 VI 固定页样式
    vi_mode = booklet.get("book_type") == "a4" and _first_chapter_is_html(bl.get("chapters"))
    body_cls = ' class="bk-vi"' if vi_mode else ""
    docs = {}
    for key, cls in _BK_FIXED_DOC_CLASSES.items():
        m = re.search(r'<section class="[^"]*\b' + cls + r'\b[^"]*"[^>]*>.*?</section>', full, re.S)
        if not m:
            continue
        docs[key] = (
            "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">"
            f"{styles}"
            f"<style>html,body{{margin:0;padding:0;overflow:hidden;width:{w}px;height:{h}px;}}"
            # 翻页式模板非 active 页 display:none/position:absolute，缩略图 iframe 无 JS 须强制显示
            ".bk-sheet,.bk-slide{display:flex !important;flex-direction:column !important;"
            "position:relative !important;margin:0 !important;}</style>"
            f"</head><body{body_cls}>{m.group(0)}</body></html>"
        )
    return docs


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
    is_recommended: bool = None


class BookletRenderBody(BaseModel):
    render_mode: str = None


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


class CoverPreviewReq(BaseModel):
    book_type: str = "ppt"
    title: str = ""
    subtitle: str = ""
    author: str = ""
    org: str = ""
    date_text: str = ""
    flyleaf_text: str = ""
    back_cover_text: str = ""
    logo_url: str = ""
    theme_id: str = ""
    theme_colors: dict = {}
    desk_none: bool = False
    vi_mode: bool = False  # a4 且第一章为 HTML 课件（本端点拿不到章节，由前端算好传入）


@router.post("/cover-preview")
def cover_preview(data: CoverPreviewReq, request: Request):
    """返回仅封面 section 的自包含 HTML 文档（iframe 实时预览用，与合成产物同一渲染管线）。"""
    _require_user(request)
    if data.book_type not in VALID_BOOK_TYPES:
        raise HTTPException(400, "book_type 必须为 a4 或 ppt")

    booklet = {
        "book_type": data.book_type,
        "title": data.title,
        "subtitle": data.subtitle,
        "author": data.author,
        "cover": {
            "org": data.org,
            "date_text": data.date_text,
            "flyleaf_text": data.flyleaf_text,
            "back_cover_text": data.back_cover_text,
            "logo_url": data.logo_url,
            "theme_id": data.theme_id,
            "theme_colors": data.theme_colors,
            "desk_none": data.desk_none,
            "render_mode": "standard",
        },
        "chapters": [{
            "id": "_cover_preview_dummy",
            "title": "",
            "source_type": "step_md",
            "project_id": "",
            "project_name": "",
            "source_key": "",
            "content": "",
            "content_html": "",
            "enabled": True,
            "content_format": "md",
        }],
    }
    theme = _resolve_theme(booklet)
    try:
        full = render_booklet(booklet, theme)
    except Exception:
        import traceback
        traceback.print_exc()
        return {"doc": "", "error": "preview generation failed"}

    styles = _extract_head_styles(full)
    w, h = (794, 1123) if data.book_type == "a4" else (1280, 720)
    m = re.search(r'<section class="[^"]*\bbk-cover\b[^"]*"[^>]*>.*?</section>', full, re.S)
    if not m:
        return {"doc": ""}

    # dummy 章节恒为 prose → 成品 body 不带 bk-vi，预览 wrapper 按前端传入的 vi_mode 补上
    body_cls = ' class="bk-vi"' if (data.vi_mode and data.book_type == "a4") else ""
    doc = (
        "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">"
        f"{styles}"
        f"<style>html,body{{margin:0;padding:0;overflow:hidden;width:{w}px;height:{h}px;background:var(--background) !important;}}"
        ".bk-sheet,.bk-slide{display:flex !important;flex-direction:column !important;"
        "position:relative !important;margin:0 !important;box-shadow:none !important;}</style>"
        f"</head><body{body_cls}>{m.group(0)}</body></html>"
    )
    return {"doc": doc}


# ── API #10 文件导入（docx/xlsx → Markdown） ──

_IMPORT_MAX_BYTES = 15 * 1024 * 1024
_IMPORT_IMG_MAX_BYTES = 2 * 1024 * 1024
_XLSX_MAX_SHEETS = 5
_XLSX_MAX_ROWS = 300
_XLSX_MAX_COLS = 20
_XLSX_MAX_CELL_CHARS = 500


def _md_escape_cell(text: str) -> str:
    return (text or "").replace("\r", "").replace("\n", " ").replace("|", "\\|").strip()


def _docx_para_to_md(para) -> str:
    """段落 → md 行：标题样式→#、加粗 run→**、内嵌图片→base64 data URI。"""
    from docx.oxml.ns import qn

    # 标题级别（style_id Heading1-9；中文 Word 的内置标题 style_id 不变）
    style = para.style
    style_id = getattr(style, "style_id", "") or ""
    style_name = getattr(style, "name", "") or ""
    level = 0
    m = re.match(r"^Heading\s*(\d)$", style_id) or re.match(r"^(?:Heading|标题)\s*(\d)$", style_name)
    if m:
        level = min(int(m.group(1)), 6)

    is_list = "List" in style_id or "List" in style_name or para._p.find(".//" + qn("w:numPr")) is not None

    parts = []
    bold_buf = []

    def _flush_bold():
        if bold_buf:
            parts.append("**" + "".join(bold_buf) + "**")
            bold_buf.clear()

    for run in para.runs:
        # 内嵌图片（≤2MB 才内联，超限跳过）
        for blip in run._element.findall(".//" + qn("a:blip")):
            rid = blip.get(qn("r:embed"))
            if rid and rid in para.part.related_parts:
                img_part = para.part.related_parts[rid]
                blob = getattr(img_part, "blob", b"")
                if blob and len(blob) <= _IMPORT_IMG_MAX_BYTES:
                    _flush_bold()
                    ct = getattr(img_part, "content_type", "") or "image/png"
                    parts.append(f"\n![图片](data:{ct};base64,{base64.b64encode(blob).decode()})\n")
        text = run.text or ""
        if not text:
            continue
        if run.bold and not level:
            bold_buf.append(text)
        else:
            _flush_bold()
            parts.append(text)
    _flush_bold()

    line = "".join(parts)
    if not line.strip():
        return line.strip()
    if level:
        return "#" * level + " " + line.strip()
    if is_list:
        return "- " + line.strip()
    return line


def _docx_table_to_md(table) -> str:
    rows = []
    for r in table.rows:
        cells = [_md_escape_cell(c.text) for c in r.cells]
        rows.append(cells)
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    out = ["| " + " | ".join(rows[0]) + " |", "|" + " --- |" * width]
    for r in rows[1:]:
        out.append("| " + " | ".join(r) + " |")
    return "\n".join(out)


def _docx_to_markdown(data: bytes) -> str:
    try:
        import docx
        from docx.oxml.ns import qn
        from docx.table import Table
        from docx.text.paragraph import Paragraph
    except ImportError:
        raise HTTPException(500, "服务器缺少 python-docx 组件，无法解析 Word 文件")
    try:
        document = docx.Document(io.BytesIO(data))
    except Exception:
        raise HTTPException(400, "无法解析该 Word 文件 — 请确认是有效的 .docx（老版 .doc 请先另存为 .docx）")

    lines = []
    for child in document.element.body.iterchildren():
        if child.tag == qn("w:p"):
            md = _docx_para_to_md(Paragraph(child, document))
            lines.append(md)
        elif child.tag == qn("w:tbl"):
            md = _docx_table_to_md(Table(child, document))
            if md:
                lines.append("")
                lines.append(md)
                lines.append("")
    # 折叠连续空行
    text = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _xlsx_to_markdown(data: bytes) -> str:
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(500, "服务器缺少 openpyxl 组件，无法解析 Excel 文件")
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(400, "无法解析该 Excel 文件 — 请确认是有效的 .xlsx")

    sections = []
    for ws in wb.worksheets[:_XLSX_MAX_SHEETS]:
        rows = []
        for row in ws.iter_rows(max_row=_XLSX_MAX_ROWS, max_col=_XLSX_MAX_COLS, values_only=True):
            cells = ["" if v is None else str(v)[:_XLSX_MAX_CELL_CHARS] for v in row]
            if any(c.strip() for c in cells):
                rows.append([_md_escape_cell(c) for c in cells])
        if not rows:
            continue
        width = max(len(r) for r in rows)
        rows = [r + [""] * (width - len(r)) for r in rows]
        table = ["| " + " | ".join(rows[0]) + " |", "|" + " --- |" * width]
        for r in rows[1:]:
            table.append("| " + " | ".join(r) + " |")
        title = f"### {ws.title}\n\n" if len(wb.worksheets) > 1 else ""
        sections.append(title + "\n".join(table))
    wb.close()
    return "\n\n".join(sections).strip()


@router.post("/import-file")
async def import_file(request: Request, file: UploadFile = File(...)):
    _require_user(request)
    name = file.filename or ""
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext == "doc":
        raise HTTPException(400, "暂不支持老版 .doc 格式 — 请用 Word 打开后「另存为 .docx」再导入")
    if ext not in ("docx", "xlsx"):
        raise HTTPException(400, f"不支持的文件类型: .{ext}（支持 .docx / .xlsx）")
    data = await file.read()
    if not data:
        raise HTTPException(400, "文件内容为空")
    if len(data) > _IMPORT_MAX_BYTES:
        raise HTTPException(400, "文件超过 15MB 上限")
    md = _docx_to_markdown(data) if ext == "docx" else _xlsx_to_markdown(data)
    if not md.strip():
        raise HTTPException(400, "未能从文件中提取到内容")
    return {"markdown": md, "filename": name}


# ══ 草稿 CRUD ══


# ── API #1 草稿列表（摘要） ──


@router.get("")
def list_booklets(request: Request):
    user = _require_user(request)
    db = get_db()
    try:
        if _is_admin(user):
            rows = db.execute(
                "SELECT b.id, b.owner_id, b.owner_role, b.book_type, b.title, b.subtitle, "
                "b.author, b.cover_json, b.chapters_json, b.is_recommended, b.updated_at, "
                "u.display_name AS owner_name "
                "FROM booklets b LEFT JOIN users u ON u.id = b.owner_id ORDER BY b.updated_at DESC"
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT b.id, b.owner_id, b.owner_role, b.book_type, b.title, b.subtitle, "
                "b.author, b.cover_json, b.chapters_json, b.is_recommended, b.updated_at, "
                "u.display_name AS owner_name "
                "FROM booklets b LEFT JOIN users u ON u.id = b.owner_id "
                "WHERE b.owner_id=? OR b.is_recommended=1 "
                "ORDER BY b.updated_at DESC",
                (user["sub"],),
            ).fetchall()
        items = []
        is_admin = _is_admin(user)
        uid = user["sub"]
        for r in rows:
            try:
                chapters = json.loads(r["chapters_json"] or "[]")
                chapter_count = len(chapters)
            except (ValueError, TypeError):
                chapters = []
                chapter_count = 0
            # 会员：推荐画册需校验来源工作区访问权限
            if not is_admin and r["is_recommended"] and r["owner_id"] != uid:
                blocked = False
                for ch in chapters:
                    pid = (ch.get("project_id") or "").strip()
                    if pid and not can_access_project(pid, user):
                        blocked = True
                        break
                if blocked:
                    continue
            items.append({
                "id": r["id"],
                "owner_id": r["owner_id"],
                "owner_role": r["owner_role"],
                "owner_name": r["owner_name"] or "",
                "book_type": r["book_type"],
                "title": r["title"],
                "subtitle": r["subtitle"] or "",
                "author": r["author"] or "",
                "cover_json": r["cover_json"] or "{}",
                "chapter_count": chapter_count,
                "is_recommended": bool(r["is_recommended"]) if "is_recommended" in r.keys() else False,
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


# ── 封面缩略图（列表页用） ──


@router.get("/{booklet_id}/cover-thumb")
def cover_thumb(booklet_id: str, request: Request):
    """返回封面的自包含 HTML 片段，供列表页缩略图 iframe 使用。支持 ?token= 认证。"""
    user = getattr(request.state, "user", None)
    if user is None:
        token = request.query_params.get("token")
        if token:
            try:
                import jwt as _jwt
                from app_config import SECRET_KEY, ALGORITHM
                user = _jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                if "token_version" in user and "sub" in user:
                    db2 = get_db()
                    try:
                        urow = db2.execute(
                            "SELECT token_version FROM users WHERE id=? AND is_active=1",
                            (user["sub"],),
                        ).fetchone()
                        if not urow or urow["token_version"] != user["token_version"]:
                            user = None
                    finally:
                        db2.close()
            except Exception:
                user = None
    if user is None:
        raise HTTPException(401, "请先登录")
    db = get_db()
    try:
        row = _get_booklet_or_403(db, booklet_id, user, readonly_ok=True)
        booklet = _row_to_full(row)
        theme = _resolve_theme(booklet)
    finally:
        db.close()
    try:
        full = render_booklet(booklet, theme)
    except Exception:
        import traceback
        traceback.print_exc()
        return Response(content="", media_type="text/html")
    styles = _extract_head_styles(full)
    w, h = (794, 1123) if booklet["book_type"] == "a4" else (1280, 720)
    m = re.search(r'<section class="[^"]*\bbk-cover\b[^"]*"[^>]*>.*?</section>', full, re.S)
    if not m:
        return Response(content="", media_type="text/html")
    doc = (
        "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">"
        f"{styles}"
        f"<style>html,body{{margin:0;padding:0;overflow:hidden;width:{w}px;height:{h}px;background:var(--background) !important;}}"
        ".bk-sheet,.bk-slide{display:flex !important;flex-direction:column !important;"
        "position:relative !important;margin:0 !important;box-shadow:none !important;}</style>"
        f"</head><body>{m.group(0)}</body></html>"
    )
    return Response(content=doc, media_type="text/html")


# ── API #9 合成下载 ──


@router.post("/{booklet_id}/render")
def render_booklet_api(booklet_id: str, request: Request, body: BookletRenderBody = None):
    user = _require_user(request)
    db = get_db()
    try:
        row = _get_booklet_or_403(db, booklet_id, user, readonly_ok=True)
        booklet = _row_to_full(row)
    finally:
        db.close()

    if body and body.render_mode and body.render_mode in ("paged", "flow", "standard"):
        booklet["cover"] = {**booklet.get("cover", {}), "render_mode": body.render_mode}

    theme = _resolve_theme(booklet)

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


# ── API #11 页面清单（Step④ 页面编排用；分页唯一事实源 = _build_embed_docs） ──


@router.get("/{booklet_id}/page-map")
def booklet_page_map(booklet_id: str, request: Request):
    user = _require_user(request)
    db = get_db()
    try:
        row = _get_booklet_or_403(db, booklet_id, user, readonly_ok=True)
        booklet = _row_to_full(row)
    finally:
        db.close()

    book_type = booklet["book_type"]
    page_size = (794, 1123) if book_type == "a4" else (1280, 720)
    chapters_out = []
    for ch in booklet.get("chapters") or []:
        if not ch.get("enabled", True):
            continue
        is_prose = (
            ch.get("source_type") in ("step_md", "custom")
            and not (ch.get("source_type") == "custom" and ch.get("content_format") == "html")
        )
        entry = {"chapter_id": ch.get("id"), "title": ch.get("title") or ""}
        if is_prose:
            entry.update({"kind": "prose", "page_count": 1})
        elif ch.get("source_type") == "custom":
            doc = _build_fulldoc_doc(ch.get("content") or "", page_size)
            entry.update({"kind": "fulldoc", "page_count": 1 if doc else 0,
                          "docs": [doc] if doc else []})
        else:
            docs = _build_embed_docs(ch.get("content") or "", page_size)
            entry.update({"kind": "embed", "page_count": len(docs), "docs": docs})
        chapters_out.append(entry)

    fixed = ["flyleaf", "toc", "back"] if book_type == "a4" else ["toc", "back"]
    fixed_docs = _build_fixed_docs(booklet, _resolve_theme(booklet))
    return {"book_type": book_type, "fixed": fixed, "chapters": chapters_out, "fixed_docs": fixed_docs}


# ── API #3 草稿详情 ──


@router.get("/{booklet_id}")
def get_booklet(booklet_id: str, request: Request):
    user = _require_user(request)
    db = get_db()
    try:
        row = _get_booklet_or_403(db, booklet_id, user, readonly_ok=True)
        return _row_to_full(row)
    finally:
        db.close()


# ── API #9a 引用推荐画册（克隆为自己的副本） ──


@router.post("/{booklet_id}/clone")
def clone_booklet(booklet_id: str, request: Request):
    user = _require_user(request)
    db = get_db()
    try:
        row = _get_booklet_or_403(db, booklet_id, user, readonly_ok=True)
        new_id = f"bk-{uuid.uuid4().hex[:12]}"
        db.execute(
            "INSERT INTO booklets (id, owner_id, owner_role, book_type, title, subtitle, "
            "author, cover_json, chapters_json, is_recommended) "
            "SELECT ?, ?, ?, book_type, title, subtitle, author, cover_json, chapters_json, 0 "
            "FROM booklets WHERE id=?",
            (new_id, user["sub"], user.get("user_type") or "member", booklet_id),
        )
        db.commit()
        new_row = db.execute("SELECT * FROM booklets WHERE id=?", (new_id,)).fetchone()
        return _row_to_full(new_row)
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
        if req.is_recommended is not None:
            if not _is_admin(user):
                raise HTTPException(403, "仅管理员可设置推荐状态")
            sets.append("is_recommended=?")
            params.append(1 if req.is_recommended else 0)
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
