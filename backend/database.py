import os
import sys
import sqlite3
import shutil
from datetime import datetime, timedelta

if getattr(sys, 'frozen', False):
    _EXE_DIR = os.path.dirname(sys.executable)
    _WS_ROOT = os.path.dirname(_EXE_DIR)
    BASE_DIR = os.path.join(_WS_ROOT, "backend")
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "yishao.db")
BACKUP_DIR = os.path.join(DATA_DIR, "backups")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(BACKUP_DIR, exist_ok=True)


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def backup_database():
    if not os.path.exists(DB_PATH):
        return
    today = datetime.now().strftime("%Y-%m-%d")
    backup_path = os.path.join(BACKUP_DIR, f"yishao-{today}.db")
    if not os.path.exists(backup_path):
        shutil.copy2(DB_PATH, backup_path)
    # Cleanup old backups (keep 7 days)
    cutoff = datetime.now() - timedelta(days=7)
    for f in os.listdir(BACKUP_DIR):
        fpath = os.path.join(BACKUP_DIR, f)
        if os.path.isfile(fpath):
            mtime = datetime.fromtimestamp(os.path.getmtime(fpath))
            if mtime < cutoff:
                os.remove(fpath)


def _migrate_legacy_data(conn):
    """One-time migration: column_configs → project_items, step_results → project_item_results.

    Idempotent — skips if project_items already has data or column_configs is empty.
    """
    import json as _json

    # Check if migration is needed
    cc_count = conn.execute("SELECT COUNT(*) FROM column_configs").fetchone()[0]
    if cc_count == 0:
        return

    pi_count = conn.execute("SELECT COUNT(*) FROM project_items").fetchone()[0]
    if pi_count > 0:
        return  # already migrated

    # 1. For each existing project, create project_items from column_configs
    projects = conn.execute("SELECT id FROM projects").fetchall()
    col_configs = conn.execute("SELECT * FROM column_configs ORDER BY sort_order").fetchall()

    # step_name → column_id mapping for result migration
    step_to_col = {
        "col1": "col1", "col2": "col2", "raw_text": "col1", "raw_file": "col1",
        "step1_text": "col1", "step1": "col1",
        "step2_sop": "col3", "step2_daoshuyi": "col2", "step2_yanxi": "col2",
        "step3_dao_ppt": "col4", "step3_yan_ppt": "col5",
    }
    # Which column_configs column_id maps to which output mode
    col_output_mode = {
        "col1": "text", "col2": "text", "col3": "ppt",
        "col4": "ppt", "col5": "ppt", "col6": "audio",
    }

    for proj in projects:
        pid = proj["id"]

        # Create source_materials from raw input step_results
        raw_step_names = ("raw_text", "raw_file", "step1_text", "step1", "col1", "col2")
        placeholders = ",".join(["?"] * len(raw_step_names))
        raw_rows = conn.execute(
            f"SELECT * FROM step_results WHERE project_id = ? AND step_name IN ({placeholders})",
            (pid,) + raw_step_names).fetchall()
        for sr in raw_rows:
            sm_id = f"sm-{pid}-{sr['step_name']}"
            existing = conn.execute("SELECT id FROM source_materials WHERE id = ?", (sm_id,)).fetchone()
            if not existing and sr["content"]:
                conn.execute(
                    "INSERT INTO source_materials (id, project_id, source_type, source_name, "
                    "raw_content, processed_content, status) VALUES (?, ?, ?, ?, ?, ?, 'processed')",
                    (sm_id, pid, 'text', sr["step_name"], sr["content"] or '', sr["content"] or ''))

        # Create project_items from column_configs for this project
        for i, cc in enumerate(col_configs):
            pi_id = f"pi-{pid}-{cc['column_id']}"
            existing = conn.execute("SELECT id FROM project_items WHERE id = ?", (pi_id,)).fetchone()
            if existing:
                continue

            output_mode = col_output_mode.get(cc["column_id"], "text")

            # Link to source material as default input for col1/col2, or to prior item
            source_item_id = None
            col = cc["column_id"]
            if col == "col1":
                source_item_id = None  # raw material — user selects at project level
            elif col == "col2":
                source_item_id = None  # text input — user provides or from raw material
            elif col in ("col3",):
                source_item_id = f"pi-{pid}-col2"  # SOP生成 → depends on SOP文案
            elif col in ("col4",):
                source_item_id = f"pi-{pid}-col2"  # 道与术PPT → depends on 文案
            elif col in ("col5",):
                source_item_id = f"pi-{pid}-col2"  # 研学PPT → depends on 文案
            elif col in ("col6",):
                source_item_id = f"pi-{pid}-col2"  # 口播稿 → depends on 文案

            conn.execute(
                "INSERT INTO project_items (id, project_id, name, prompt, skill, "
                "output_mode, config_json, source_item_id, status, sort_order) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)",
                (pi_id, pid, cc["label"], cc["prompt"] or '', cc["skill"] or '',
                 output_mode, cc["rules"] or '{}', source_item_id, i))

        # 2. Migrate step_results → project_item_results
        all_steps = conn.execute(
            "SELECT * FROM step_results WHERE project_id = ? AND step_name NOT LIKE '_ppt_%' "
            "AND step_name NOT LIKE '_model_%' AND step_name NOT LIKE '_ds_%' "
            "AND step_name NOT LIKE '_tmpl_%' AND step_name NOT LIKE '_preview_%'",
            (pid,)).fetchall()
        for sr in all_steps:
            col_id = step_to_col.get(sr["step_name"], "")
            if not col_id:
                continue
            pi_id = f"pi-{pid}-{col_id}"
            existing = conn.execute(
                "SELECT id FROM project_item_results WHERE project_item_id = ?",
                (pi_id,)).fetchone()
            if not existing and sr["content"]:
                conn.execute(
                    "INSERT INTO project_item_results (project_item_id, content, content_type) "
                    "VALUES (?, ?, ?)",
                    (pi_id, sr["content"] or '', sr["content_type"] or 'markdown'))

    conn.commit()


def init_db():
    backup_database()
    conn = get_db()
    try:
        # Migration tracking table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                description TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT DEFAULT 'draft',
                source_type TEXT,
                source_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT DEFAULT 'draft',
                description TEXT DEFAULT '',
                logo TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS step_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
                step_name TEXT NOT NULL,
                content TEXT,
                content_type TEXT DEFAULT 'markdown',
                file_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS prompts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                current_version TEXT,
                is_default INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS prompt_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prompt_id TEXT REFERENCES prompts(id) ON DELETE CASCADE,
                version TEXT NOT NULL,
                system_prompt TEXT,
                skill_template TEXT,
                change_note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                file_path TEXT NOT NULL,
                prompt TEXT DEFAULT '',
                skill TEXT DEFAULT '',
                rules TEXT DEFAULT '{}',
                thumbnail_path TEXT,
                linked_skill_id TEXT,
                branding_config TEXT,
                is_default INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS help_manual_sections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                location TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Migrate help_manual data from settings table to help_manual_sections
        try:
            hm_row = conn.execute(
                "SELECT value FROM settings WHERE key = 'help_manual'"
            ).fetchone()
            if hm_row and hm_row["value"]:
                import json as _json_m
                data = _json_m.loads(hm_row["value"])
                sections = data.get("sections", [])
                for i, s in enumerate(sections):
                    conn.execute(
                        "INSERT OR IGNORE INTO help_manual_sections (location, title, content, sort_order) "
                        "VALUES (?, ?, ?, ?)",
                        (s["location"], s["title"], s["content"], i)
                    )
                conn.execute("DELETE FROM settings WHERE key = 'help_manual'")
                conn.commit()
        except Exception:
            pass

        # Seed help manual sections if empty (first-time init)
        try:
            existing = conn.execute("SELECT COUNT(*) FROM help_manual_sections").fetchone()[0]
            if existing == 0:
                from seed_manual import SECTIONS
                for i, s in enumerate(SECTIONS):
                    conn.execute(
                        "INSERT OR IGNORE INTO help_manual_sections (location, title, content, sort_order) "
                        "VALUES (?, ?, ?, ?)",
                        (s["location"], s["title"], s["content"], i)
                    )
                conn.commit()
        except Exception as e:
            print(f"[DB] Help manual seed skipped: {e}")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS llm_providers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                api_key TEXT,
                base_url TEXT NOT NULL,
                models TEXT,
                is_enabled INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tts_providers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                api_key TEXT,
                base_url TEXT NOT NULL,
                models TEXT,
                is_enabled INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS asr_providers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                api_key TEXT,
                base_url TEXT NOT NULL,
                models TEXT,
                is_enabled INTEGER DEFAULT 1,
                is_default INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS image_providers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                api_key TEXT,
                base_url TEXT NOT NULL,
                models TEXT,
                is_enabled INTEGER DEFAULT 1,
                is_default INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Add storage_path column if missing (migration)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(projects)").fetchall()]
            if 'storage_path' not in existing_cols:
                conn.execute("ALTER TABLE projects ADD COLUMN storage_path TEXT DEFAULT ''")
        except Exception:
            pass

        # Add is_default column to tts_providers if missing (migration)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(tts_providers)").fetchall()]
            if 'is_default' not in existing_cols:
                conn.execute("ALTER TABLE tts_providers ADD COLUMN is_default INTEGER DEFAULT 0")
        except Exception:
            pass

        # Add is_default column to asr_providers if missing (migration)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(asr_providers)").fetchall()]
            if 'is_default' not in existing_cols:
                conn.execute("ALTER TABLE asr_providers ADD COLUMN is_default INTEGER DEFAULT 0")
        except Exception:
            pass

        # Add is_default column to image_providers if missing (migration)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(image_providers)").fetchall()]
            if 'is_default' not in existing_cols:
                conn.execute("ALTER TABLE image_providers ADD COLUMN is_default INTEGER DEFAULT 0")
        except Exception:
            pass

        # Add enabled column to templates if missing (migration)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(templates)").fetchall()]
            if 'enabled' not in existing_cols:
                conn.execute("ALTER TABLE templates ADD COLUMN enabled INTEGER DEFAULT 1")
        except Exception:
            pass

        # Add workspace_id column to projects if missing (migration)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(projects)").fetchall()]
            if 'workspace_id' not in existing_cols:
                conn.execute("ALTER TABLE projects ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)")
        except Exception:
            pass

        # Migrate: create default workspace "食谱培训" and assign all workspace_id-less projects
        try:
            ws_count = conn.execute("SELECT COUNT(*) FROM workspaces").fetchone()[0]
            if ws_count == 0:
                import uuid as _uuid
                ws_id = _uuid.uuid4().hex[:12]
                conn.execute(
                    "INSERT INTO workspaces (id, name, status) VALUES (?, ?, ?)",
                    (ws_id, "食谱培训", "completed"))
                conn.execute(
                    "UPDATE projects SET workspace_id = ? WHERE workspace_id IS NULL OR workspace_id = ''",
                    (ws_id,))
        except Exception:
            pass


        # Default workspace configs are loaded from JSON below (see "Load default workspace configs from JSON")


        # Add is_locked column to projects if missing (migration)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(projects)").fetchall()]
            if 'is_locked' not in existing_cols:
                conn.execute("ALTER TABLE projects ADD COLUMN is_locked INTEGER DEFAULT 0")
        except Exception:
            pass

        # Add copied_from_project_id column to projects if missing (migration)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(projects)").fetchall()]
            if 'copied_from_project_id' not in existing_cols:
                conn.execute("ALTER TABLE projects ADD COLUMN copied_from_project_id TEXT")
        except Exception:
            pass

        # Add project_code column to projects if missing (migration)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(projects)").fetchall()]
            if 'project_code' not in existing_cols:
                conn.execute("ALTER TABLE projects ADD COLUMN project_code TEXT DEFAULT ''")
            # Backfill missing/old-format project codes: KH{YYMMDD}-{seq} per creation date
            rows = conn.execute(
                "SELECT id, created_at FROM projects WHERE project_code IS NULL OR project_code = ''"
                " OR project_code LIKE 'P-%' ORDER BY created_at ASC"
            ).fetchall()
            if rows:
                day_counters: dict[str, int] = {}
                for pid, created_at in rows:
                    # Extract YYMMDD from created_at (format: "2026-06-27 10:30:00")
                    date_str = created_at[:10] if created_at else "2000-01-01"
                    yymmdd = date_str[2:].replace("-", "")  # "2026-06-27" → "260627"
                    day_counters[yymmdd] = day_counters.get(yymmdd, 0) + 1
                    seq = day_counters[yymmdd]
                    conn.execute(
                        "UPDATE projects SET project_code = ? WHERE id = ?",
                        (f"KH{yymmdd}-{seq:04d}", pid))
        except Exception:
            pass

        # Add prompt column to templates if missing (migration)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(templates)").fetchall()]
            if 'prompt' not in existing_cols:
                conn.execute("ALTER TABLE templates ADD COLUMN prompt TEXT DEFAULT ''")
        except Exception:
            pass

        # Add skill column to templates if missing (migration)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(templates)").fetchall()]
            if 'skill' not in existing_cols:
                conn.execute("ALTER TABLE templates ADD COLUMN skill TEXT DEFAULT ''")
        except Exception:
            pass

        # Add rules column to templates if missing (migration)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(templates)").fetchall()]
            if 'rules' not in existing_cols:
                conn.execute("ALTER TABLE templates ADD COLUMN rules TEXT DEFAULT '{}'")
        except Exception:
            pass

        # Migrate column_configs for column split (existing DBs) — col6 entries moved to speech_configs table
        try:
            conn.execute("UPDATE column_configs SET column_id='col5', sort_order=8 WHERE id='c4-yanxi' AND column_id='col4'")
        except Exception:
            pass

        # Add rules column to column_configs if missing (migration)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(column_configs)").fetchall()]
            if 'rules' not in existing_cols:
                conn.execute("ALTER TABLE column_configs ADD COLUMN rules TEXT DEFAULT '{}'")
        except Exception:
            pass

        # Add typography_profile column to templates if missing (migration)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(templates)").fetchall()]
            if 'typography_profile' not in existing_cols:
                conn.execute("ALTER TABLE templates ADD COLUMN typography_profile TEXT DEFAULT ''")
        except Exception:
            pass

        # Add slide_plan column to templates if missing (migration, 2026-06-24)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(templates)").fetchall()]
            if 'slide_plan' not in existing_cols:
                conn.execute("ALTER TABLE templates ADD COLUMN slide_plan TEXT DEFAULT ''")
        except Exception:
            pass

        # Add style_id column to templates if missing (migration, 2026-06-25)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(templates)").fetchall()]
            if 'style_id' not in existing_cols:
                conn.execute("ALTER TABLE templates ADD COLUMN style_id TEXT DEFAULT 'business'")
        except Exception:
            pass

        # Add style_overrides column to templates if missing (migration, 2026-06-25)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(templates)").fetchall()]
            if 'style_overrides' not in existing_cols:
                conn.execute("ALTER TABLE templates ADD COLUMN style_overrides TEXT DEFAULT ''")
        except Exception:
            pass

        # Update col4/col5 rules to constraint-based version (remove presets, 2026-06-23)
        try:
            conn.execute("UPDATE column_configs SET rules = ?, updated_at = CURRENT_TIMESTAMP WHERE column_id = 'col4' AND rules LIKE '%color_schemes%'", ("{\"design_rules\":{\"color_discipline\":\"从模板母版中提取实际配色方案。配色应克制，不超过3种功能色（主色/底色/点缀色）。底色不可用纯白 #FFFFFF，字色不可用纯黑 #000000。保持模板原有配色，不做重新设计。\",\"font_discipline\":\"从模板占位符中提取实际字体和字号。字体应有清晰的三级分工：标题（最大最粗）、二级标题（中等粗细）、正文（常规）。保持模板原有字体设置，不做重新设计。\",\"layout_discipline\":\"从模板母版中提取实际版式列表。版式应覆盖内容结构所需的所有页面类型，各版式之间应有清晰的视觉层次区分。\",\"slide_discipline\":\"从模板中提取实际幻灯片尺寸和比例。保持模板原有尺寸。\",\"branding_discipline\":\"从模板中识别品牌区域（页脚/页眉/logo位置）。保持模板原有的品牌信息位置。\"},\"layout_types\":[{\"id\":\"cover\",\"name\":\"封面\",\"zones\":[\"title\",\"subtitle\",\"date\"],\"description\":\"菜品名 + 类型 + 日期\"},{\"id\":\"toc\",\"name\":\"目录页\",\"zones\":[\"heading\",\"items\"],\"description\":\"章节概览列表\"},{\"id\":\"technique\",\"name\":\"技法分析页\",\"zones\":[\"heading\",\"operation\",\"principle\",\"params\"],\"description\":\"单个技法的深度分析\"},{\"id\":\"comparison\",\"name\":\"对比页\",\"zones\":[\"heading\",\"left\",\"right\"],\"description\":\"传统 vs 创新对比\"},{\"id\":\"key_params\",\"name\":\"关键参数页\",\"zones\":[\"heading\",\"big_number\",\"label\",\"notes\"],\"description\":\"大字数据 + 参数说明\"},{\"id\":\"summary\",\"name\":\"总结页\",\"zones\":[\"review\",\"key_points\",\"signature\"],\"description\":\"核心技法回顾 + 署名\"}],\"components\":{\"fonts\":{\"title\":{\"size\":\"36-44pt\",\"weight\":\"bold\",\"color\":\"primary\"},\"heading\":{\"size\":\"24-30pt\",\"weight\":\"600\",\"color\":\"primary\"},\"body\":{\"size\":\"14-18pt\",\"weight\":\"400\",\"color\":\"text\"},\"annotation\":{\"size\":\"10-12pt\",\"weight\":\"400\",\"color\":\"muted\"}},\"grid\":{\"margins\":{\"top\":\"1.5cm\",\"bottom\":\"1.5cm\",\"left\":\"2cm\",\"right\":\"2cm\"},\"columns\":2,\"gap\":\"0.5cm\"},\"callouts\":[{\"id\":\"tip\",\"name\":\"小提示\",\"style\":\"左边框绿色，浅绿背景\",\"usage\":\"补充技巧或优化建议\"},{\"id\":\"warning\",\"name\":\"安全红线\",\"style\":\"左边框琥珀色，浅琥珀背景\",\"usage\":\"涉及温度、油溅、消毒等安全要点\"},{\"id\":\"key_point\",\"name\":\"关键点\",\"style\":\"左边框主题色，浅主题色背景\",\"usage\":\"核心技法或不可省略的步骤\"},{\"id\":\"quote\",\"name\":\"引用\",\"style\":\"左边框灰色，斜体\",\"usage\":\"引用经典菜谱或师传口诀\"}],\"stats\":[{\"id\":\"big_number\",\"name\":\"大字数据\",\"description\":\"大号数字 + 下方标签，用于突出关键参数\"},{\"id\":\"comparison\",\"name\":\"对比\",\"description\":\"左右并排数据对比\"},{\"id\":\"steps_bar\",\"name\":\"步骤条\",\"description\":\"横向步骤进度条，用于流程概览\"}],\"pipeline\":[{\"id\":\"horizontal\",\"name\":\"横向流程\",\"description\":\"左→右箭头链，用于线性步骤\"},{\"id\":\"vertical\",\"name\":\"纵向时间线\",\"description\":\"上→下时间线\"},{\"id\":\"branch\",\"name\":\"判断分支\",\"description\":\"条件判断→分支处理，用于故障诊断\"}]},\"content_spec\":\"# {菜品名} — 道与术解析\\n\\n## 封面\\n- 菜品名\\n- 菜品类型\\n- 解析日期\\n\\n## 技法深度分析\\n### {技法名}\\n- 操作要点\\n- 科学原理\\n- 关键参数\\n\\n（每个技法一页）\\n\\n## 总结\\n- 核心技法回顾\",\"image_rules\":{\"types\":[{\"id\":\"technique_demo\",\"name\":\"技法演示图\",\"ratio\":\"16:9\",\"description\":\"关键技法操作示意\"},{\"id\":\"ingredient_shot\",\"name\":\"食材特写\",\"ratio\":\"4:3\",\"description\":\"核心食材高清特写\"},{\"id\":\"process_flow\",\"name\":\"流程图\",\"ratio\":\"16:9\",\"description\":\"步骤流程可视化\"},{\"id\":\"final_dish\",\"name\":\"成品图\",\"ratio\":\"16:9\",\"description\":\"菜品成品展示\"}],\"generation_prompt\":\"你是食物摄影专家。请为以下内容生成配图：{context}。风格：专业厨房场景、自然光、高分辨率。比例：{ratio}。\",\"placement\":\"每张幻灯片最多 1 张配图。封面和总结页可用全幅背景图，内容页为内嵌图（占 1/2 或 1/3 版面）。\"},\"clarification_questions\":[{\"id\":\"q1\",\"question\":\"受众是谁？分享场景？\",\"why\":\"决定语言风格和深度\"},{\"id\":\"q2\",\"question\":\"分享时长？\",\"why\":\"15分钟≈10页，30分钟≈20页\"},{\"id\":\"q3\",\"question\":\"有没有原始素材（文档/数据/旧菜谱）？\",\"why\":\"有素材就基于素材，没有就搭骨架\"},{\"id\":\"q4\",\"question\":\"有没有图片？放在哪？\",\"why\":\"确定图片路径和命名规则\"},{\"id\":\"q5\",\"question\":\"模板的配色风格是否符合内容主题？需要调整吗？\",\"why\":\"确认配色方向与内容调性一致\"},{\"id\":\"q6\",\"question\":\"有没有硬约束（必须包含/禁止出现的内容）？\",\"why\":\"避免返工\"}],\"design_principles\":[{\"id\":\"restraint\",\"rule\":\"克制优于炫技\",\"detail\":\"装饰仅用于强调，不喧宾夺主\"},{\"id\":\"structure\",\"rule\":\"结构优于装饰\",\"detail\":\"靠字号对比+网格留白，不用阴影/浮动卡片\"},{\"id\":\"font_hierarchy\",\"rule\":\"字体三级分工\",\"detail\":\"衬线=观点(标题) / 非衬线=信息(正文) / 等宽=元数据\"},{\"id\":\"image_first\",\"rule\":\"图片是第一公民\",\"detail\":\"图片优先占据视觉焦点，文字围绕图片布局\"},{\"id\":\"rhythm\",\"rule\":\"节奏靠页面交替\",\"detail\":\"封面/目录页与内容页交替出现，连续3页同类型=P0错误\"},{\"id\":\"terminology\",\"rule\":\"术语统一\",\"detail\":\"同一概念全文使用相同术语，不中英混翻\"}],\"page_rhythm\":{\"sequence\":[\"cover\",\"toc\",\"content*N\",\"summary\"],\"alternation_rule\":\"内容页之间应有节奏变化，避免连续3页同一版式\",\"p0_violation\":\"连续3页同一版式类型 = P0 阻断性错误\"},\"checklist\":{\"p0_must_pass\":[{\"id\":\"P0-1\",\"item\":\"所有幻灯片版式类型在 layout_types 定义范围内\"},{\"id\":\"P0-2\",\"item\":\"配色符合 color_discipline 约束（不超过3种功能色，底色非纯白，字色非纯黑）\"},{\"id\":\"P0-3\",\"item\":\"每页内容不超出对应版式的 zones 定义\"},{\"id\":\"P0-4\",\"item\":\"字号在 components.fonts 定义的范围内\"},{\"id\":\"P0-5\",\"item\":\"图片比例符合 image_rules.types 中的规定\"},{\"id\":\"P0-6\",\"item\":\"无连续3页同一版式类型（page_rhythm 硬约束）\"}],\"p1_should_pass\":[{\"id\":\"P1-1\",\"item\":\"封面包含全部必需元素（title, subtitle, date）\"},{\"id\":\"P1-2\",\"item\":\"内容页标题与正文层级正确\"},{\"id\":\"P1-3\",\"item\":\"配图与内容语义匹配\"},{\"id\":\"P1-4\",\"item\":\"字重阶梯正确应用（标题最粗、二级中等、正文常规）\"},{\"id\":\"P1-5\",\"item\":\"callout 类型选择恰当（tip/warning/key_point/quote）\"}],\"p2_suggested\":[{\"id\":\"P2-1\",\"item\":\"无单页文字过密（超过 3 个要点则分页）\"},{\"id\":\"P2-2\",\"item\":\"整体页数在合理范围（8-20页）\"},{\"id\":\"P2-3\",\"item\":\"同页面不超过 3 种颜色\"}],\"p3_optional\":[{\"id\":\"P3-1\",\"item\":\"页面节奏合理：cover → toc → content×N → summary\"},{\"id\":\"P3-2\",\"item\":\"stats 组件使用恰当（big_number/comparison/steps_bar）\"},{\"id\":\"P3-3\",\"item\":\"pipeline 组件正确表达流程关系\"}]},\"analysis_rules\":\"你是PPT模板分析专家。请分析下方PPTX结构，在以下约束框架内输出：\\n\\n1. 识别每张幻灯片对应的版式类型（cover/toc/technique/comparison/key_params/summary）\\n2. 提取每个占位符的内容分区归属\\n3. 从模板母版中提取实际配色方案（主色/底色/点缀色），按 color_discipline 规则审视\\n4. 从模板占位符中提取实际字体设置（名称/字号/粗细），按 font_discipline 规则审视\\n5. 基于以上分析，生成该模板专属的完整 prompt 和 SKILL\\n\\n约束：\\n- 版式类型必须在栏目定义的 layout_types 范围内\\n- 从模板中提取实际颜色和字体，不预设配色方案\\n- 输出格式必须符合栏目的 content_spec 规范\\n- 遵守 design_principles 中的所有铁律\\n- 遵守 page_rhythm 中的页面节奏规则\\n- prompt 应完整包含：角色设定、从模板提取的实际样式描述（颜色/字体/版式）、内容规范引用、版式选择规则、输出格式要求\\n- skill 应为完整的 Markdown 模板，包含 content_spec 规定的完整结构\\n- 输出JSON格式：{prompt, skill}\"}",))
            conn.execute("UPDATE column_configs SET rules = ?, updated_at = CURRENT_TIMESTAMP WHERE column_id = 'col5' AND rules LIKE '%color_schemes%'", ("{\"design_rules\":{\"color_discipline\":\"从模板母版中提取实际配色方案。配色应克制，不超过3种功能色（主色/底色/点缀色）。底色不可用纯白 #FFFFFF，字色不可用纯黑 #000000。保持模板原有配色，不做重新设计。\",\"font_discipline\":\"从模板占位符中提取实际字体和字号。字体应有清晰的三级分工：标题（最大最粗）、二级标题（中等粗细）、正文（常规）。保持模板原有字体设置，不做重新设计。\",\"layout_discipline\":\"从模板母版中提取实际版式列表。版式应覆盖内容结构所需的所有页面类型，各版式之间应有清晰的视觉层次区分。\",\"slide_discipline\":\"从模板中提取实际幻灯片尺寸和比例。保持模板原有尺寸。\",\"branding_discipline\":\"从模板中识别品牌区域（页脚/页眉/logo位置）。保持模板原有的品牌信息位置。\"},\"layout_types\":[{\"id\":\"cover\",\"name\":\"封面\",\"zones\":[\"title\",\"subtitle\",\"date\",\"author\"],\"description\":\"菜品名 + 实训日期 + 制作人\"},{\"id\":\"toc\",\"name\":\"目录页\",\"zones\":[\"heading\",\"chapters\"],\"description\":\"六大章节概览\"},{\"id\":\"content\",\"name\":\"教学页\",\"zones\":[\"heading\",\"steps\",\"image\"],\"description\":\"教学步骤 + 配图说明\"},{\"id\":\"food_archive\",\"name\":\"食材档案页\",\"zones\":[\"food_name\",\"params\",\"mechanism\",\"substitutes\"],\"description\":\"食材科学档案卡片\"},{\"id\":\"skill_card\",\"name\":\"技法卡片页\",\"zones\":[\"skill_name\",\"description\",\"flowchart\",\"migration\"],\"description\":\"技法流程图+迁移应用\"},{\"id\":\"troubleshoot\",\"name\":\"故障诊断页\",\"zones\":[\"problem\",\"cause\",\"solution\",\"prevention\"],\"description\":\"常见问题诊断与解决\"},{\"id\":\"closing\",\"name\":\"收束页\",\"zones\":[\"summary\",\"signature\"],\"description\":\"总结 + 署名\"}],\"components\":{\"fonts\":{\"title\":{\"size\":\"36-44pt\",\"weight\":\"bold\",\"color\":\"primary\"},\"heading\":{\"size\":\"24-30pt\",\"weight\":\"600\",\"color\":\"primary\"},\"body\":{\"size\":\"14-18pt\",\"weight\":\"400\",\"color\":\"text\"},\"annotation\":{\"size\":\"10-12pt\",\"weight\":\"400\",\"color\":\"muted\"}},\"grid\":{\"margins\":{\"top\":\"1.5cm\",\"bottom\":\"1.5cm\",\"left\":\"2cm\",\"right\":\"2cm\"},\"columns\":2,\"gap\":\"0.5cm\"},\"callouts\":[{\"id\":\"tip\",\"name\":\"小提示\",\"style\":\"左边框绿色，浅绿背景\",\"usage\":\"补充技巧或优化建议\"},{\"id\":\"warning\",\"name\":\"安全红线\",\"style\":\"左边框琥珀色，浅琥珀背景\",\"usage\":\"涉及温度、油溅、消毒等安全要点\"},{\"id\":\"key_point\",\"name\":\"关键点\",\"style\":\"左边框主题色，浅主题色背景\",\"usage\":\"核心技法或不可省略的步骤\"},{\"id\":\"quote\",\"name\":\"引用\",\"style\":\"左边框灰色，斜体\",\"usage\":\"引用经典菜谱或师传口诀\"}],\"stats\":[{\"id\":\"big_number\",\"name\":\"大字数据\",\"description\":\"大号数字 + 下方标签，用于突出关键参数\"},{\"id\":\"comparison\",\"name\":\"对比\",\"description\":\"左右并排数据对比\"},{\"id\":\"steps_bar\",\"name\":\"步骤条\",\"description\":\"横向步骤进度条，用于流程概览\"}],\"pipeline\":[{\"id\":\"horizontal\",\"name\":\"横向流程\",\"description\":\"左→右箭头链，用于线性步骤\"},{\"id\":\"vertical\",\"name\":\"纵向时间线\",\"description\":\"上→下时间线\"},{\"id\":\"branch\",\"name\":\"判断分支\",\"description\":\"条件判断→分支处理，用于故障诊断\"}]},\"content_spec\":\"# 菜肴研习手册：{菜品名}\\n\\n## 一、风味与质地预置\\n### 香气构成\\n| 香气类型 | 来源食材 | 强度 | 备注 |\\n|----------|----------|------|------|\\n\\n### 口感三阶递进\\n入口初感 → 咀嚼中段 → 回味余韵\\n\\n## 二、烹饪原理清单\\n| 烹饪化学原理 | 应用位置 | 作用 |\\n|--------------|----------|------|\\n\\n## 三、深度剖析SOP\\n### 关键步骤深度卡片\\n**步骤一：{步骤名}**\\n| 维度 | 内容 |\\n|------|------|\\n| 操作与观察 | |\\n| 科学原理与技法要义 | |\\n| 迁移思考与风险规避 | |\\n\\n## 四、食材科学档案\\n### 食材档案：{食材名}\\n| 维度 | 内容 |\\n|------|------|\\n| 角色 | |\\n| 黄金参数 | |\\n| 作用机理 | |\\n| 替代与风险 | |\\n\\n## 五、专项技能工具箱\\n### 技法卡片：{技法名}\\n| 维度 | 内容 |\\n|------|------|\\n| 技法描述 | |\\n| 本菜应用 | |\\n| 科学本质 | |\\n| 可迁移至 | |\\n\\n## 六、故障诊断与学习复盘\\n### 常见缺陷诊断树\\n| 常见问题 | 原因分析 | 解决方案 | 预防措施 |\\n|----------|----------|----------|----------|\",\"image_rules\":{\"types\":[{\"id\":\"food_archive\",\"name\":\"食材档案图\",\"ratio\":\"4:3\",\"description\":\"食材科学档案配图\"},{\"id\":\"technique_card\",\"name\":\"技法卡片图\",\"ratio\":\"16:9\",\"description\":\"技法流程可视化\"},{\"id\":\"troubleshooting_diagram\",\"name\":\"故障诊断图\",\"ratio\":\"16:9\",\"description\":\"分支判断流程图\"},{\"id\":\"step_illustration\",\"name\":\"步骤示意图\",\"ratio\":\"16:9\",\"description\":\"关键步骤操作示意\"}],\"generation_prompt\":\"你是食物摄影与教学图表专家。请为以下内容生成配图：{context}。风格：专业厨房场景、科学教学模式、自然光、高分辨率。比例：{ratio}。\",\"placement\":\"每张幻灯片最多 1 张配图。封面和收束页可用全幅背景图，教学页和食材档案页为内嵌图（占 1/2 版面）。\"},\"clarification_questions\":[{\"id\":\"q1\",\"question\":\"受众是谁？分享场景？\",\"why\":\"决定语言风格和深度\"},{\"id\":\"q2\",\"question\":\"分享时长？\",\"why\":\"15分钟≈10页，30分钟≈20页\"},{\"id\":\"q3\",\"question\":\"有没有原始素材（文档/数据/旧菜谱）？\",\"why\":\"有素材就基于素材，没有就搭骨架\"},{\"id\":\"q4\",\"question\":\"有没有图片？放在哪？\",\"why\":\"确定图片路径和命名规则\"},{\"id\":\"q5\",\"question\":\"模板的配色风格是否符合内容主题？需要调整吗？\",\"why\":\"确认配色方向与内容调性一致\"},{\"id\":\"q6\",\"question\":\"有没有硬约束（必须包含/禁止出现的内容）？\",\"why\":\"避免返工\"}],\"design_principles\":[{\"id\":\"restraint\",\"rule\":\"克制优于炫技\",\"detail\":\"装饰仅用于强调，不喧宾夺主\"},{\"id\":\"structure\",\"rule\":\"结构优于装饰\",\"detail\":\"靠字号对比+网格留白，不用阴影/浮动卡片\"},{\"id\":\"font_hierarchy\",\"rule\":\"字体三级分工\",\"detail\":\"衬线=观点(标题) / 非衬线=信息(正文) / 等宽=元数据\"},{\"id\":\"image_first\",\"rule\":\"图片是第一公民\",\"detail\":\"图片优先占据视觉焦点，文字围绕图片布局\"},{\"id\":\"rhythm\",\"rule\":\"节奏靠页面交替\",\"detail\":\"封面/目录页与内容页交替出现，连续3页同类型=P0错误\"},{\"id\":\"terminology\",\"rule\":\"术语统一\",\"detail\":\"同一概念全文使用相同术语，不中英混翻\"}],\"page_rhythm\":{\"sequence\":[\"cover\",\"toc\",\"content*N\",\"closing\"],\"alternation_rule\":\"内容页之间应有节奏变化，避免连续3页同一版式\",\"p0_violation\":\"连续3页同一版式类型 = P0 阻断性错误\"},\"checklist\":{\"p0_must_pass\":[{\"id\":\"P0-1\",\"item\":\"所有幻灯片版式类型在 layout_types 定义范围内\"},{\"id\":\"P0-2\",\"item\":\"配色符合 color_discipline 约束（不超过3种功能色，底色非纯白，字色非纯黑）\"},{\"id\":\"P0-3\",\"item\":\"每页内容不超出对应版式的 zones 定义\"},{\"id\":\"P0-4\",\"item\":\"字号在 components.fonts 定义的范围内\"},{\"id\":\"P0-5\",\"item\":\"图片比例符合 image_rules.types 中的规定\"},{\"id\":\"P0-6\",\"item\":\"无连续3页同一版式类型（page_rhythm 硬约束）\"}],\"p1_should_pass\":[{\"id\":\"P1-1\",\"item\":\"封面包含全部必需元素（title, subtitle, date, author）\"},{\"id\":\"P1-2\",\"item\":\"六大章节结构完整，不可省略任何章节\"},{\"id\":\"P1-3\",\"item\":\"配图与内容语义匹配\"},{\"id\":\"P1-4\",\"item\":\"字重阶梯正确应用（标题最粗、二级中等、正文常规）\"},{\"id\":\"P1-5\",\"item\":\"callout 类型选择恰当（tip/warning/key_point/quote）\"}],\"p2_suggested\":[{\"id\":\"P2-1\",\"item\":\"无单页文字过密（超过 3 个要点则分页）\"},{\"id\":\"P2-2\",\"item\":\"整体页数在合理范围（12-30页，六大章节）\"},{\"id\":\"P2-3\",\"item\":\"同页面不超过 3 种颜色\"}],\"p3_optional\":[{\"id\":\"P3-1\",\"item\":\"页面节奏合理：cover → toc → content×N → closing\"},{\"id\":\"P3-2\",\"item\":\"stats 组件使用恰当（big_number/comparison/steps_bar）\"},{\"id\":\"P3-3\",\"item\":\"pipeline 组件正确表达流程关系\"}]},\"analysis_rules\":\"你是PPT模板分析专家。请分析下方PPTX结构，在以下约束框架内输出：\\n\\n1. 识别每张幻灯片对应的版式类型（cover/toc/content/food_archive/skill_card/troubleshoot/closing）\\n2. 提取每个占位符的内容分区归属\\n3. 从模板母版中提取实际配色方案（主色/底色/点缀色），按 color_discipline 规则审视\\n4. 从模板占位符中提取实际字体设置（名称/字号/粗细），按 font_discipline 规则审视\\n5. 基于以上分析，生成该模板专属的完整 prompt 和 SKILL\\n\\n约束：\\n- 版式类型必须在栏目定义的 layout_types 范围内\\n- 从模板中提取实际颜色和字体，不预设配色方案\\n- 输出格式必须符合栏目的 content_spec 规范（六大章节不可省略）\\n- 遵守 design_principles 中的所有铁律\\n- 遵守 page_rhythm 中的页面节奏规则\\n- prompt 应完整包含：角色设定、从模板提取的实际样式描述（颜色/字体/版式）、内容规范引用、版式选择规则、输出格式要求\\n- skill 应为完整的 Markdown 模板，包含六大章节结构、表格、mermaid 图表占位符\\n- 输出JSON格式：{prompt, skill}\"}",))
            conn.commit()
        except Exception:
            pass

        # Add typography_spec to col4/col5 design_rules (2026-06-24)
        try:
            import json
            for col_id in ('col4', 'col5'):
                row = conn.execute("SELECT rules FROM column_configs WHERE column_id = ?", (col_id,)).fetchone()
                if row and row['rules']:
                    rules = json.loads(row['rules'])
                    dr = rules.get('design_rules', {})
                    if 'typography_spec' not in dr:
                        dr['typography_spec'] = {
                            "body_font_size_pt": {
                                "extract": "母版 bodyStyle 中最频繁字号；若无则检查占位符 defRPr[@sz]",
                                "fallback": 18,
                                "rationale": "ISO/IEC 29500 默认 18pt"
                            },
                            "title_font_size_pt": {
                                "extract": "母版 titleStyle 字号；若无则检查布局标题占位符 defRPr[@sz]",
                                "fallback": 36,
                                "rationale": "国开标准标题 >= 36pt"
                            },
                            "line_height_ratio": {
                                "extract": "母版 bodyPr.normAutofit.fontScale；若无则 para.pPr.lnSpc.spcPct/100000",
                                "fallback": 1.2,
                                "rationale": "国开标准行距 1.0-1.5 倍，SJ/T 11841.6.1 推荐 >= 1.2"
                            }
                        }
                        rules['design_rules'] = dr
                        conn.execute("UPDATE column_configs SET rules = ?, updated_at = CURRENT_TIMESTAMP WHERE column_id = ?",
                                     (json.dumps(rules, ensure_ascii=False), col_id))
            conn.commit()
        except Exception:
            pass


        # Inject PPT-Agent SVG prompt specs into column_configs rules (2026-06-25)
        try:
            import os as _os
            _prompts_dir = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)),
                                        "data", "prompts")
            _outline_path = _os.path.join(_prompts_dir, "outline-architect.md")
            _cognitive_path = _os.path.join(_prompts_dir, "cognitive-design-principles.md")

            _outline_content = ""
            _cognitive_content = ""
            if _os.path.exists(_outline_path):
                with open(_outline_path, "r", encoding="utf-8") as _f:
                    _outline_content = _f.read()
            if _os.path.exists(_cognitive_path):
                with open(_cognitive_path, "r", encoding="utf-8") as _f:
                    _cognitive_content = _f.read()

            if _outline_content or _cognitive_content:
                for _col_id in ("col4", "col5"):
                    _row = conn.execute(
                        "SELECT id, rules FROM column_configs WHERE column_id = ? LIMIT 1",
                        (_col_id,)
                    ).fetchone()
                    if _row and _row["rules"]:
                        try:
                            try:
                                _rules = json.loads(_row["rules"])
                            except Exception:
                                _rules = {}
                            _updated = False
                            if _outline_content and "outline_architect_prompt" not in _rules:
                                _rules["outline_architect_prompt"] = _outline_content
                                _updated = True
                            if _cognitive_content and "cognitive_design_principles" not in _rules:
                                _rules["cognitive_design_principles"] = _cognitive_content
                                _updated = True
                            if _updated:
                                conn.execute(
                                    "UPDATE column_configs SET rules = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                                    (json.dumps(_rules, ensure_ascii=False), _row["id"])
                                )
                        except Exception:
                            pass
                conn.commit()
        except Exception:
            pass

        # Add canvas dimensions to col3 (A4: 794x1123) for existing rows (2026-06-30)
        try:
            row = conn.execute(
                "SELECT id, rules FROM column_configs WHERE column_id = ? LIMIT 1",
                ("col3",)
            ).fetchone()
            if row and row["rules"]:
                rules = json.loads(row["rules"])
                if "canvas" not in rules:
                    rules["canvas"] = {"width": 794, "height": 1123}
                    conn.execute(
                        "UPDATE column_configs SET rules = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                        (json.dumps(rules, ensure_ascii=False), row["id"])
                    )
                    conn.commit()
        except Exception:
            pass

        # ── Workspace config migration: add workspace_id to 4 config tables ──
        # Only runs when upgrading an old database (tables already exist but lack workspace_id)
        _config_tables = ['column_configs', 'speech_configs', 'tts_configs', 'core_prompt_configs']
        try:
            _all_tables_exist = True
            for _tbl in _config_tables:
                try:
                    conn.execute(f"SELECT 1 FROM {_tbl} LIMIT 1")
                except Exception:
                    _all_tables_exist = False
                    break
            if _all_tables_exist:
                for _tbl in _config_tables:
                    _existing_cols = [row[1] for row in conn.execute(f"PRAGMA table_info({_tbl})").fetchall()]
                    if 'workspace_id' not in _existing_cols:
                        conn.execute(f"ALTER TABLE {_tbl} ADD COLUMN workspace_id TEXT")
                _ws = conn.execute("SELECT id FROM workspaces WHERE name LIKE '%食谱%' LIMIT 1").fetchone()
                if _ws:
                    _ws_id = _ws[0]
                    _migrated = conn.execute(
                        "SELECT COUNT(*) FROM column_configs WHERE workspace_id IS NOT NULL").fetchone()[0]
                    if _migrated == 0:
                        conn.execute("""CREATE TABLE IF NOT EXISTS _cpc_rebuild (
                            id TEXT PRIMARY KEY, prompt_key TEXT NOT NULL, category TEXT NOT NULL,
                            label TEXT NOT NULL, content TEXT, sort_order INTEGER DEFAULT 0,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, workspace_id TEXT,
                            UNIQUE(prompt_key, workspace_id))""")
                        _cpc_rows = conn.execute("SELECT * FROM core_prompt_configs").fetchall()
                        if _cpc_rows:
                            _cpc_keys = _cpc_rows[0].keys()
                            _cpc_vals = [[r[k] for k in _cpc_keys] for r in _cpc_rows]
                            _cpc_ph = ', '.join(['?'] * len(_cpc_keys))
                            _cpc_cn = ', '.join(_cpc_keys)
                            conn.executemany(f"INSERT OR IGNORE INTO _cpc_rebuild ({_cpc_cn}) VALUES ({_cpc_ph})", _cpc_vals)
                        conn.execute("DROP TABLE core_prompt_configs")
                        conn.execute("ALTER TABLE _cpc_rebuild RENAME TO core_prompt_configs")
                        for _tbl in _config_tables:
                            conn.execute(f"UPDATE {_tbl} SET workspace_id = ?", (_ws_id,))
                        for _tbl in _config_tables:
                            _rows = conn.execute(f"SELECT * FROM {_tbl}").fetchall()
                            if not _rows:
                                continue
                            _keys = _rows[0].keys()
                            for _row in _rows:
                                _d = {k: _row[k] for k in _keys}
                                _d['id'] = 'seed-' + str(_d['id'])
                                _d['workspace_id'] = None
                                if _tbl == 'core_prompt_configs' and 'prompt_key' in _d:
                                    _d['prompt_key'] = 'seed-' + str(_d['prompt_key'])
                                _vals = [_d[k] for k in _keys]
                                _ph = ', '.join(['?'] * len(_keys))
                                _cn = ', '.join(_keys)
                                conn.execute(f"INSERT OR IGNORE INTO {_tbl} ({_cn}) VALUES ({_ph})", _vals)
                        conn.commit()
        except Exception as _e:
            print(f"[DB] Workspace config migration: {_e}")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS tts_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT,
                text TEXT NOT NULL,
                voice_id TEXT,
                model TEXT,
                audio_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Add description and logo columns to workspaces (migration, 2026-07-02)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(workspaces)").fetchall()]
            if 'description' not in existing_cols:
                conn.execute("ALTER TABLE workspaces ADD COLUMN description TEXT DEFAULT ''")
            if 'logo' not in existing_cols:
                conn.execute("ALTER TABLE workspaces ADD COLUMN logo TEXT DEFAULT ''")
        except Exception:
            pass

        # Add name and voice_name columns to tts_history if missing (migration, 2026-07-01)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(tts_history)").fetchall()]
            if 'name' not in existing_cols:
                conn.execute("ALTER TABLE tts_history ADD COLUMN name TEXT DEFAULT ''")
            if 'voice_name' not in existing_cols:
                conn.execute("ALTER TABLE tts_history ADD COLUMN voice_name TEXT DEFAULT ''")
            if 'segment_index' not in existing_cols:
                conn.execute("ALTER TABLE tts_history ADD COLUMN segment_index INTEGER DEFAULT 0")
            if 'group_id' not in existing_cols:
                conn.execute("ALTER TABLE tts_history ADD COLUMN group_id TEXT DEFAULT ''")
        except Exception:
            pass
        # Add volume and speed columns to voices if missing (migration, 2026-07-01)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(voices)").fetchall()]
            if 'volume' not in existing_cols:
                conn.execute("ALTER TABLE voices ADD COLUMN volume INTEGER DEFAULT 50")
            if 'speed' not in existing_cols:
                conn.execute("ALTER TABLE voices ADD COLUMN speed REAL DEFAULT 1.0")
        except Exception:
            pass
        conn.execute("""
            CREATE TABLE IF NOT EXISTS voices (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                provider_id TEXT NOT NULL,
                voice_id TEXT NOT NULL,
                description TEXT,
                preview_audio_path TEXT,
                is_default INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS column_configs (
                id TEXT PRIMARY KEY,
                column_id TEXT NOT NULL,
                label TEXT NOT NULL,
                prompt TEXT,
                skill TEXT,
                has_template INTEGER DEFAULT 0,
                template_path TEXT,
                rules TEXT DEFAULT '{}',
                sort_order INTEGER DEFAULT 0,
                workspace_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ── New tables for industry-agnostic architecture ──
        conn.execute("""
            CREATE TABLE IF NOT EXISTS source_materials (
                id TEXT PRIMARY KEY,
                project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
                source_type TEXT NOT NULL,
                source_name TEXT DEFAULT '',
                raw_content TEXT DEFAULT '',
                processed_content TEXT DEFAULT '',
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS project_items (
                id TEXT PRIMARY KEY,
                project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                prompt TEXT DEFAULT '',
                skill TEXT DEFAULT '',
                output_mode TEXT DEFAULT 'text',
                config_json TEXT DEFAULT '{}',
                source_item_id TEXT DEFAULT NULL,
                status TEXT DEFAULT 'pending',
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS project_item_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_item_id TEXT REFERENCES project_items(id) ON DELETE CASCADE,
                content TEXT DEFAULT '',
                content_type TEXT DEFAULT 'markdown',
                file_path TEXT DEFAULT '',
                quality_score REAL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Migrate old data → new tables (one-time, idempotent)
        _migrate_legacy_data(conn)

        # Seed column configs if empty (loaded from JSON — single source of truth)
        existing = conn.execute("SELECT COUNT(*) FROM column_configs WHERE workspace_id IS NULL").fetchone()[0]
        if existing == 0:
            _seed_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resources", "default_workspace_configs.json")
            if os.path.exists(_seed_path):
                import json as _json_seed
                import uuid as _uuid_seed
                with open(_seed_path, 'r', encoding='utf-8') as _f_seed:
                    _cfg_seed = _json_seed.load(_f_seed)
                for _item in _cfg_seed.get('column_configs', []):
                    _rid = 'seed-' + _uuid_seed.uuid4().hex[:10]
                    conn.execute(
                        "INSERT INTO column_configs (id, column_id, label, prompt, skill, sort_order, has_template, rules) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (_rid, _item['column_id'], _item['label'], _item['prompt'], _item['skill'],
                         _item.get('sort_order', 0), _item.get('has_template', 0), _item.get('rules', '{}')))
        # Clean up old presets and seed all 18 style templates
        try:
            _json = __import__('json')
            conn.execute("DELETE FROM templates WHERE type='preset'")
            existing_styles = conn.execute("SELECT COUNT(*) FROM templates WHERE type='style'").fetchone()[0]
            if existing_styles == 0:
                _styles = [
                    ('style-blueprint', '蓝图 (Blueprint)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"blueprint","group":"Tech / Dark"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-bold-editorial', '大胆编辑 (Bold Editorial)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"bold-editorial","group":"Creative"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-business', '商务专业 (Business)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"business","group":"Professional"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-chalkboard', '黑板教学 (Chalkboard)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"chalkboard","group":"Thematic"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-creative', '创意大胆 (Creative Bold)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"creative","group":"Creative"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-editorial-infographic', '编辑信息图 (Editorial Infographic)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"editorial-infographic","group":"Professional"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-fantasy-animation', '幻想动画 (Fantasy Animation)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"fantasy-animation","group":"Thematic"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-intuition-machine', '直觉机器 (Intuition Machine)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"intuition-machine","group":"Tech / Dark"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-minimal', '简约清爽 (Minimal)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"minimal","group":"Professional"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-nature', '自然有机 (Nature Organic)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"nature","group":"Thematic"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-notion', '笔记风格 (Notion)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"notion","group":"Professional"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-pixel-art', '像素艺术 (Pixel Art)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"pixel-art","group":"Tech / Dark"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-scientific', '学术严谨 (Scientific)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"scientific","group":"Professional"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-sketch-notes', '手绘笔记 (Sketch Notes)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"sketch-notes","group":"Creative"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-tech', '科技现代 (Tech Modern)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"tech","group":"Tech / Dark"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-vector-illustration', '矢量插画 (Vector Illustration)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"vector-illustration","group":"Creative"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-vintage', '复古经典 (Vintage)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"vintage","group":"Thematic"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                    ('style-watercolor', '水彩晕染 (Watercolor)', 'style',
                     'backend/services/ppt_engine/assets/preview-template.html', '', '',
                     _json.dumps({"style_id":"watercolor","group":"Creative"}, ensure_ascii=False),
                     '', '', '', 0, '', ''),
                ]
                for s in _styles:
                    conn.execute(
                        "INSERT INTO templates (id, name, type, file_path, prompt, skill, rules, "
                        "thumbnail_path, linked_skill_id, branding_config, is_default, typography_profile, slide_plan) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", s
                    )
        except Exception:
            pass

        # Create speech_configs table and seed data
        conn.execute("""
            CREATE TABLE IF NOT EXISTS license (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                license_key TEXT NOT NULL,
                machine_id TEXT NOT NULL,
                product_id INTEGER NOT NULL DEFAULT 1,
                serial_number INTEGER NOT NULL DEFAULT 0,
                activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS speech_configs (
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                prompt TEXT,
                skill TEXT,
                sort_order INTEGER DEFAULT 0,
                workspace_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Remove any stale col6 entries from column_configs (speech is now in its own table)
        try:
            conn.execute("DELETE FROM column_configs WHERE column_id = 'col6'")
        except Exception:
            pass
        # Seed speech_configs if empty (loaded from JSON — single source of truth)
        try:
            sc_count = conn.execute("SELECT COUNT(*) FROM speech_configs WHERE workspace_id IS NULL").fetchone()[0]
            if sc_count == 0:
                _seed_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resources", "default_workspace_configs.json")
                if os.path.exists(_seed_path):
                    import json as _json_seed2
                    import uuid as _uuid_seed2
                    with open(_seed_path, 'r', encoding='utf-8') as _f_seed2:
                        _cfg_seed2 = _json_seed2.load(_f_seed2)
                    for _item in _cfg_seed2.get('speech_configs', []):
                        _rid = 'seed-speech-' + _uuid_seed2.uuid4().hex[:10]
                        conn.execute(
                            "INSERT INTO speech_configs (id, label, prompt, skill, sort_order) VALUES (?, ?, ?, ?, ?)",
                            (_rid, _item['label'], _item['prompt'], _item.get('skill', ''), _item.get('sort_order', 0)))
        except Exception:
            pass

        # Create tts_configs table (voice synthesis role prompts, independent from speech_configs)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tts_configs (
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                prompt TEXT,
                skill TEXT,
                sort_order INTEGER DEFAULT 0,
                workspace_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Seed tts_configs if empty (loaded from JSON — single source of truth)
        try:
            tc_count = conn.execute("SELECT COUNT(*) FROM tts_configs WHERE workspace_id IS NULL").fetchone()[0]
            if tc_count == 0:
                _seed_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resources", "default_workspace_configs.json")
                if os.path.exists(_seed_path):
                    import json as _json_seed3
                    import uuid as _uuid_seed3
                    with open(_seed_path, 'r', encoding='utf-8') as _f_seed3:
                        _cfg_seed3 = _json_seed3.load(_f_seed3)
                    for _item in _cfg_seed3.get('tts_configs', []):
                        _rid = 'seed-tts-' + _uuid_seed3.uuid4().hex[:10]
                        conn.execute(
                            "INSERT INTO tts_configs (id, label, prompt, skill, sort_order) VALUES (?, ?, ?, ?, ?)",
                            (_rid, _item['label'], _item['prompt'], _item.get('skill', ''), _item.get('sort_order', 0)))
        except Exception:
            pass

        # ── Load default workspace configs from JSON (must run after all config tables exist) ──
        try:
            import json as _json
            import uuid as _uuid
            _config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resources", "default_workspace_configs.json")
            if os.path.exists(_config_path):
                _ws_row = conn.execute("SELECT id FROM workspaces WHERE name LIKE '%食谱%' LIMIT 1").fetchone()
                if _ws_row:
                    _ws_id = _ws_row[0]
                    _ws_cfg_count = conn.execute("SELECT COUNT(*) FROM column_configs WHERE workspace_id = ?", (_ws_id,)).fetchone()[0]
                    if _ws_cfg_count == 0:
                        with open(_config_path, 'r', encoding='utf-8') as _f:
                            _cfg = _json.load(_f)
                        for _item in _cfg.get('column_configs', []):
                            _rid = 'ws-cfg-' + _uuid.uuid4().hex[:10]
                            conn.execute(
                                "INSERT INTO column_configs (id, workspace_id, column_id, label, prompt, skill, rules, sort_order, has_template) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                (_rid, _ws_id, _item['column_id'], _item['label'], _item['prompt'], _item['skill'], _item.get('rules', '{}'), _item['sort_order'], _item.get('has_template', 0)))
                        for _item in _cfg.get('speech_configs', []):
                            _rid = 'ws-cfg-' + _uuid.uuid4().hex[:10]
                            conn.execute(
                                "INSERT INTO speech_configs (id, workspace_id, label, prompt, skill, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
                                (_rid, _ws_id, _item['label'], _item['prompt'], _item['skill'], _item['sort_order']))
                        for _item in _cfg.get('tts_configs', []):
                            _rid = 'ws-cfg-' + _uuid.uuid4().hex[:10]
                            conn.execute(
                                "INSERT INTO tts_configs (id, workspace_id, label, prompt, skill, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
                                (_rid, _ws_id, _item['label'], _item['prompt'], _item['skill'], _item['sort_order']))
                        conn.commit()
                        print("[DB] Default workspace configs loaded from JSON")
        except Exception as _e:
            print(f"[DB] Workspace config loading failed: {_e}")

        # Create core_prompt_configs table (seed documentation for PPT generation prompts)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS core_prompt_configs (
                id TEXT PRIMARY KEY,
                prompt_key TEXT NOT NULL,
                category TEXT NOT NULL,
                label TEXT NOT NULL,
                content TEXT,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                workspace_id TEXT,
                UNIQUE(prompt_key, workspace_id)
            )
        """)
        # Migration: add stage column (2026-07-04)
        try:
            existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(core_prompt_configs)").fetchall()]
            if 'stage' not in existing_cols:
                conn.execute("ALTER TABLE core_prompt_configs ADD COLUMN stage TEXT DEFAULT ''")
        except Exception:
            pass
        try:
            cpc_count = conn.execute("SELECT COUNT(*) FROM core_prompt_configs WHERE workspace_id IS NULL").fetchone()[0]
            if cpc_count == 0:
                import glob as _glob
                _core_dir = os.path.join(BASE_DIR, "resources", "prompts", "core")
                _categories = [
                    ("root", "", ["research", "outline-rules", "fill-content", "text-to-json",
                                  "structure-output", "html-output", "edit-agent"]),
                    ("always", "always", ["identity", "iron-laws", "colors", "color-semantics",
                                          "structure", "richness", "typography", "consistency",
                                          "checklist", "format-spec"]),
                    ("by_type", "by_type", ["cards", "card-roles", "decoration", "illustration"]),
                    ("by_feature", "by_feature", ["charts"]),
                    ("by_layout", "by_layout", ["full_bleed", "single_focus", "two_column",
                                                "two_column_asymmetric", "three_column",
                                                "hero_grid", "mixed_grid", "dashboard",
                                                "timeline", "horizontal_split"]),
                ]
                _stage_map = {
                    "research": "stage1-outline", "outline-rules": "stage1-outline", "fill-content": "stage1-outline",
                    "text-to-json": "aux", "structure-output": "stage2-structure",
                    "html-output": "stage3-html", "edit-agent": "aux",
                    "identity": "stage3-html", "iron-laws": "stage3-html", "colors": "stage3-html",
                    "color-semantics": "stage3-html", "structure": "stage3-html", "richness": "stage3-html",
                    "typography": "stage3-html", "consistency": "stage3-html", "checklist": "stage3-html",
                    "format-spec": "stage3-html",
                    "cards": "stage3-html", "card-roles": "stage3-html", "decoration": "stage3-html",
                    "illustration": "stage3-html",
                    "charts": "stage3-html",
                    "full_bleed": "stage3-html", "single_focus": "stage3-html", "two_column": "stage3-html",
                    "two_column_asymmetric": "stage3-html", "three_column": "stage3-html",
                    "hero_grid": "stage3-html", "mixed_grid": "stage3-html", "dashboard": "stage3-html",
                    "timeline": "stage3-html", "horizontal_split": "stage3-html",
                }
                _sort = 0
                for _cat, _subdir, _keys in _categories:
                    for _key in _keys:
                        _filepath = os.path.join(_core_dir, _subdir, f"{_key}.md") if _subdir \
                            else os.path.join(_core_dir, f"{_key}.md")
                        _content = ""
                        if os.path.exists(_filepath):
                            with open(_filepath, "r", encoding="utf-8") as _f:
                                _content = _f.read()
                        _label = _key.replace("-", " ").replace("_", " ").title()
                        _id = f"seed-core-{_key.replace('/', '-').replace('_', '-')}"
                        _stage = _stage_map.get(_key, "")
                        conn.execute(
                            "INSERT INTO core_prompt_configs (id, prompt_key, category, label, content, sort_order, stage) "
                            "VALUES (?, ?, ?, ?, ?, ?, ?)",
                            (_id, f"{_subdir}/{_key}" if _subdir else _key, _cat, _label, _content, _sort, _stage)
                        )
                        _sort += 1
        except Exception:
            pass

        # Create prompt_studio_saves table (saved generated configs for Prompt Studio)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS prompt_studio_saves (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                industry_topic TEXT NOT NULL,
                purpose_description TEXT NOT NULL,
                configs TEXT NOT NULL,
                provider_info TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        _migrate_v1_rbac(conn)

        # Always re-seed roles — idempotent (skips existing), catches new roles added in updates
        _migrate_v1_seed_roles(conn)

        # Batch execution tables — created here (not in _migrate_v1_create_tables)
        # so they get created on every startup, not just during v0→v1 migration
        conn.execute("""
            CREATE TABLE IF NOT EXISTS batch_jobs (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                total_count INTEGER NOT NULL DEFAULT 0,
                completed_count INTEGER NOT NULL DEFAULT 0,
                failed_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS batch_job_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                batch_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                steps TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'pending',
                logs TEXT NOT NULL DEFAULT '',
                started_at TEXT,
                finished_at TEXT,
                FOREIGN KEY (batch_id) REFERENCES batch_jobs(id) ON DELETE CASCADE
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_bji_batch ON batch_job_items(batch_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_bji_project ON batch_job_items(project_id)")

        # Grant prompt.manage to existing 内容管理员 and 开发体验员 roles
        for role_name in ("内容管理员", "开发体验员"):
            role = conn.execute("SELECT id FROM roles WHERE name=?", (role_name,)).fetchone()
            if role:
                conn.execute(
                    "INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES (?, 'prompt.manage')",
                    (role["id"],),
                )

        # Ensure workspace_roles table exists (added post-migration, idempotent)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS workspace_roles (
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
                PRIMARY KEY (workspace_id, role_id)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_wr_workspace_id ON workspace_roles(workspace_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_wr_role_id ON workspace_roles(role_id)")

        # Ensure upgrade_expires_at column exists (added post-migration)
        try:
            users_cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
            if "upgrade_expires_at" not in users_cols:
                conn.execute("ALTER TABLE users ADD COLUMN upgrade_expires_at TEXT")
        except Exception as e:
            print(f"[DB] Warning: could not add upgrade_expires_at to users: {e}")

        # Ensure admin_note (超管专用备注) / approval_note (审批意见) columns exist
        try:
            users_cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
            if "admin_note" not in users_cols:
                conn.execute("ALTER TABLE users ADD COLUMN admin_note TEXT DEFAULT ''")
            if "approval_note" not in users_cols:
                conn.execute("ALTER TABLE users ADD COLUMN approval_note TEXT DEFAULT ''")
        except Exception as e:
            print(f"[DB] Warning: could not add admin_note/approval_note to users: {e}")

        # Backfill: existing users with 开发体验员 role get upgrade_expires_at = expires_at
        try:
            conn.execute("""
                UPDATE users SET upgrade_expires_at = expires_at
                WHERE upgrade_expires_at IS NULL
                AND id IN (SELECT ur.user_id FROM user_roles ur
                           JOIN roles r ON r.id = ur.role_id
                           WHERE r.name = '开发体验员')
                AND expires_at IS NOT NULL
            """)
        except Exception as e:
            print(f"[DB] Warning: could not backfill upgrade_expires_at: {e}")

        # Fix col2 sub-item labels to match frontend stage tabs (see CLAUDE.md plan)
        try:
            conn.execute("DELETE FROM column_configs WHERE column_id = 'col2' AND sort_order = 0")
            conn.execute("UPDATE column_configs SET label = '标准文档' WHERE column_id = 'col2' AND sort_order = 3")
            conn.execute("UPDATE column_configs SET label = '分析文档' WHERE column_id = 'col2' AND sort_order = 4")
            conn.execute("UPDATE column_configs SET label = '综合文档' WHERE column_id = 'col2' AND sort_order = 5")
        except Exception as e:
            print(f"[DB] Warning: col2 label migration failed: {e}")

        # ── Points system tables ──

        # 8. user_points table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_points (
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                balance_deci INTEGER NOT NULL DEFAULT 0,
                expires_at TEXT,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (user_id)
            )
        """)

        # 9. points_transactions table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS points_transactions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                amount_deci INTEGER NOT NULL,
                balance_after_deci INTEGER NOT NULL,
                type TEXT NOT NULL,
                ref_id TEXT DEFAULT '',
                ref_type TEXT DEFAULT '',
                note TEXT DEFAULT '',
                created_by TEXT REFERENCES users(id),
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pt_user ON points_transactions(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pt_created ON points_transactions(created_at)")

        # 10. project_unlocks table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS project_unlocks (
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                points_spent_deci INTEGER NOT NULL,
                unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
                expires_at TEXT,
                PRIMARY KEY (user_id, project_id)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pu_user ON project_unlocks(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pu_project ON project_unlocks(project_id)")

        # 11. download_logs table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS download_logs (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                filename TEXT DEFAULT '',
                download_type TEXT NOT NULL DEFAULT 'file',
                ip_address TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_dl_user ON download_logs(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_dl_project ON download_logs(project_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_dl_created ON download_logs(created_at)")

        # 12. view_logs table (preview/read tracking)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS view_logs (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                filename TEXT DEFAULT '',
                ip_address TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_vl_user ON view_logs(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_vl_project ON view_logs(project_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_vl_created ON view_logs(created_at)")

        # Migrate: points system columns on projects
        try:
            proj_cols = [r[1] for r in conn.execute("PRAGMA table_info(projects)").fetchall()]
            if "point_cost_deci" not in proj_cols:
                conn.execute("ALTER TABLE projects ADD COLUMN point_cost_deci INTEGER NOT NULL DEFAULT 5")
            if "is_downloadable" not in proj_cols:
                conn.execute("ALTER TABLE projects ADD COLUMN is_downloadable INTEGER NOT NULL DEFAULT 0")
            if "download_count" not in proj_cols:
                conn.execute("ALTER TABLE projects ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0")
            if "view_count" not in proj_cols:
                conn.execute("ALTER TABLE projects ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0")
        except Exception as e:
            print(f"[DB] Warning: could not add points columns to projects: {e}")

        # Migrate: points_granted_deci on payment_records
        try:
            pr_cols = [r[1] for r in conn.execute("PRAGMA table_info(payment_records)").fetchall()]
            if "points_granted_deci" not in pr_cols:
                conn.execute("ALTER TABLE payment_records ADD COLUMN points_granted_deci INTEGER NOT NULL DEFAULT 0")
        except Exception as e:
            print(f"[DB] Warning: could not add points_granted_deci to payment_records: {e}")

        # Migrate: rate on payment_records
        try:
            pr_cols2 = [r[1] for r in conn.execute("PRAGMA table_info(payment_records)").fetchall()]
            if "rate" not in pr_cols2:
                conn.execute("ALTER TABLE payment_records ADD COLUMN rate REAL DEFAULT NULL")
        except Exception as e:
            print(f"[DB] Warning: could not add rate to payment_records: {e}")

        # Migrate: project categories + authors (attribution)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS project_categories (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                name TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pcat_ws ON project_categories(workspace_id)")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS authors (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                intro TEXT DEFAULT '',
                license_text TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        try:
            proj_cols2 = [r[1] for r in conn.execute("PRAGMA table_info(projects)").fetchall()]
            if "category_id" not in proj_cols2:
                conn.execute("ALTER TABLE projects ADD COLUMN category_id TEXT DEFAULT ''")
            if "author_id" not in proj_cols2:
                conn.execute("ALTER TABLE projects ADD COLUMN author_id TEXT DEFAULT ''")
        except Exception as e:
            print(f"[DB] Warning: could not add category/author columns to projects: {e}")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS booklets (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                owner_role TEXT NOT NULL,
                book_type TEXT NOT NULL,
                title TEXT NOT NULL,
                subtitle TEXT DEFAULT '',
                author TEXT DEFAULT '',
                cover_json TEXT DEFAULT '{}',
                chapters_json TEXT NOT NULL DEFAULT '[]',
                is_recommended INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_booklets_owner ON booklets(owner_id)")
        try:
            conn.execute("ALTER TABLE booklets ADD COLUMN is_recommended INTEGER DEFAULT 0")
        except Exception:
            pass  # column already exists

        # ── Signed author / revenue sharing migration ──
        try:
            author_cols = [r[1] for r in conn.execute("PRAGMA table_info(authors)").fetchall()]
            author_adds = [
                ("photo_url", "TEXT DEFAULT ''"),
                ("user_id", "TEXT DEFAULT ''"),
                ("contract_status", "TEXT DEFAULT 'none'"),
                ("revenue_share", "REAL DEFAULT 0.7"),
                ("cash_share", "REAL DEFAULT 0.0"),
                ("points_per_yuan", "REAL DEFAULT 100.0"),
                ("contract_signed_at", "TEXT DEFAULT ''"),
                ("contract_note", "TEXT DEFAULT ''"),
            ]
            for col_name, col_def in author_adds:
                if col_name not in author_cols:
                    conn.execute(f"ALTER TABLE authors ADD COLUMN {col_name} {col_def}")
        except Exception as e:
            print(f"[DB] Warning: could not extend authors table: {e}")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS author_revenue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                author_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                unlock_id INTEGER NOT NULL,
                points_spent_deci INTEGER NOT NULL,
                share_rate REAL NOT NULL,
                cash_share_rate REAL NOT NULL,
                author_points_deci INTEGER NOT NULL,
                author_cash_cents INTEGER DEFAULT 0,
                points_per_yuan REAL NOT NULL,
                settled INTEGER DEFAULT 0,
                payout_id TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_arev_author ON author_revenue(author_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_arev_settled ON author_revenue(settled)")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS author_payouts (
                id TEXT PRIMARY KEY,
                author_id TEXT NOT NULL,
                points_deci INTEGER NOT NULL,
                cash_cents INTEGER NOT NULL DEFAULT 0,
                revenue_count INTEGER NOT NULL,
                period_start TEXT NOT NULL,
                period_end TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                note TEXT DEFAULT '',
                paid_at TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_apay_author ON author_payouts(author_id)")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS recipe_submissions (
                id TEXT PRIMARY KEY,
                author_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                cover_url TEXT DEFAULT '',
                files_json TEXT DEFAULT '[]',
                point_cost_deci INTEGER DEFAULT 0,
                category_id TEXT DEFAULT '',
                status TEXT DEFAULT 'pending',
                review_note TEXT DEFAULT '',
                reviewed_by TEXT DEFAULT '',
                reviewed_at TEXT DEFAULT '',
                created_project_id TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rsub_author ON recipe_submissions(author_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rsub_status ON recipe_submissions(status)")

        conn.commit()
    finally:
        conn.close()
    print(f"[DB] Initialized at {DB_PATH}")


def _migrate_v1_rbac(conn):
    """v0→v1: Multi-role RBAC + member system migration. Idempotent."""
    try:
        existing = [r[1] for r in conn.execute("PRAGMA table_info(settings)").fetchall()]
    except Exception:
        return
    if 'value' not in existing:
        return  # settings table not ready yet

    # Check schema version (idempotent guard)
    row = conn.execute("SELECT value FROM settings WHERE key='db_schema_version'").fetchone()
    current_version = int(row["value"]) if row else 0
    if current_version >= 1:
        return

    # Check if migration was partially completed (tables exist but version < 1)
    try:
        conn.execute("SELECT 1 FROM users LIMIT 0")
        tables_exist = True
    except Exception:
        tables_exist = False

    if not tables_exist:
        _migrate_v1_create_tables(conn)

    _migrate_v1_seed_roles(conn)
    _migrate_v1_create_admin(conn)

    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('db_schema_version', '1')")
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('migration_status', 'completed')")
    print("[DB] Migration v0→v1 completed: RBAC + member system initialized")


def _migrate_v1_create_tables(conn):
    """Create all v1 tables and add created_by columns to existing tables."""
    import uuid as _uuid

    # 1. users table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE COLLATE NOCASE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            email TEXT UNIQUE,
            user_type TEXT NOT NULL CHECK(user_type IN ('admin','member')),
            is_active INTEGER NOT NULL DEFAULT 1,
            is_approved INTEGER NOT NULL DEFAULT 0,
            approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            approved_at TEXT,
            expires_at TEXT,
            token_version INTEGER NOT NULL DEFAULT 1,
            failed_login_attempts INTEGER NOT NULL DEFAULT 0,
            locked_until TEXT,
            password_changed_at TEXT,
            upgrade_expires_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_users_is_approved ON users(is_approved)")

    # 2. roles table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS roles (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            description TEXT DEFAULT '',
            user_type TEXT NOT NULL CHECK(user_type IN ('admin','member')),
            is_system INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # 3. role_permissions table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS role_permissions (
            role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            permission TEXT NOT NULL,
            PRIMARY KEY (role_id, permission)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rp_role_id ON role_permissions(role_id)")

    # 4. user_roles table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_roles (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            PRIMARY KEY (user_id, role_id)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ur_user_id ON user_roles(user_id)")

    # 5. member_workspaces table — member access is at workspace level
    conn.execute("""
        CREATE TABLE IF NOT EXISTS member_workspaces (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            PRIMARY KEY (user_id, workspace_id)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_mw_user_id ON member_workspaces(user_id)")

    # 5b. workspace_roles table — role-based workspace visibility
    conn.execute("""
        CREATE TABLE IF NOT EXISTS workspace_roles (
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            PRIMARY KEY (workspace_id, role_id)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wr_workspace_id ON workspace_roles(workspace_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wr_role_id ON workspace_roles(role_id)")

    # 6. payment_records table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS payment_records (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount_cents INTEGER NOT NULL,
            plan_name TEXT NOT NULL,
            duration_days INTEGER NOT NULL,
            payment_method TEXT DEFAULT '',
            recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            expires_before TEXT,
            expires_after TEXT,
            note TEXT DEFAULT '',
            paid_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # 7. audit_log table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id TEXT PRIMARY KEY,
            actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            action TEXT NOT NULL,
            target_type TEXT DEFAULT '',
            target_id TEXT DEFAULT '',
            detail TEXT DEFAULT '{}',
            ip_address TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)")

    # ── Points system tables ──

    # 8. user_points table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_points (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            balance_deci INTEGER NOT NULL DEFAULT 0,
            expires_at TEXT,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id)
        )
    """)

    # 9. points_transactions table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS points_transactions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount_deci INTEGER NOT NULL,
            balance_after_deci INTEGER NOT NULL,
            type TEXT NOT NULL,
            ref_id TEXT DEFAULT '',
            ref_type TEXT DEFAULT '',
            note TEXT DEFAULT '',
            created_by TEXT REFERENCES users(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pt_user ON points_transactions(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pt_created ON points_transactions(created_at)")

    # 10. project_unlocks table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS project_unlocks (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            points_spent_deci INTEGER NOT NULL,
            unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT,
            PRIMARY KEY (user_id, project_id)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pu_user ON project_unlocks(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pu_project ON project_unlocks(project_id)")

    # 11. download_logs table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS download_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            filename TEXT DEFAULT '',
            download_type TEXT NOT NULL DEFAULT 'file',
            ip_address TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_dl_user ON download_logs(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_dl_project ON download_logs(project_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_dl_created ON download_logs(created_at)")

    # 12. view_logs table (preview/read tracking)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS view_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            filename TEXT DEFAULT '',
            ip_address TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_vl_user ON view_logs(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_vl_project ON view_logs(project_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_vl_created ON view_logs(created_at)")

    # Migrate: add must_change_password to users (first-time setup wizard flag)
    try:
        users_cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "must_change_password" not in users_cols:
            conn.execute("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0")
    except Exception as e:
        print(f"[DB] Warning: could not add must_change_password to users: {e}")

    # Migrate: add phone to users
    try:
        users_cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "phone" not in users_cols:
            conn.execute("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''")
    except Exception as e:
        print(f"[DB] Warning: could not add phone to users: {e}")

    # Migrate: add upgrade_expires_at to users (独立升级计费)
    try:
        users_cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "upgrade_expires_at" not in users_cols:
            conn.execute("ALTER TABLE users ADD COLUMN upgrade_expires_at TEXT")
    except Exception as e:
        print(f"[DB] Warning: could not add upgrade_expires_at to users: {e}")

    # Backfill: existing users with 开发体验员 role get upgrade_expires_at = expires_at
    try:
        conn.execute("""
            UPDATE users SET upgrade_expires_at = expires_at
            WHERE upgrade_expires_at IS NULL
            AND id IN (SELECT ur.user_id FROM user_roles ur
                       JOIN roles r ON r.id = ur.role_id
                       WHERE r.name = '开发体验员')
            AND expires_at IS NOT NULL
        """)
    except Exception as e:
        print(f"[DB] Warning: could not backfill upgrade_expires_at: {e}")

    # Migrate: add payment_ref to payment_records (user-submitted payment proof)
    try:
        pr_cols = [r[1] for r in conn.execute("PRAGMA table_info(payment_records)").fetchall()]
        if "payment_ref" not in pr_cols:
            conn.execute("ALTER TABLE payment_records ADD COLUMN payment_ref TEXT DEFAULT ''")
    except Exception as e:
        print(f"[DB] Warning: could not add payment_ref to payment_records: {e}")

    # Migrate: points system columns on projects
    try:
        proj_cols = [r[1] for r in conn.execute("PRAGMA table_info(projects)").fetchall()]
        if "point_cost_deci" not in proj_cols:
            conn.execute("ALTER TABLE projects ADD COLUMN point_cost_deci INTEGER NOT NULL DEFAULT 5")
        if "is_downloadable" not in proj_cols:
            conn.execute("ALTER TABLE projects ADD COLUMN is_downloadable INTEGER NOT NULL DEFAULT 0")
        if "download_count" not in proj_cols:
            conn.execute("ALTER TABLE projects ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0")
        if "view_count" not in proj_cols:
            conn.execute("ALTER TABLE projects ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0")
    except Exception as e:
        print(f"[DB] Warning: could not add points columns to projects: {e}")

    # Migrate: points_granted_deci on payment_records
    try:
        pr_cols = [r[1] for r in conn.execute("PRAGMA table_info(payment_records)").fetchall()]
        if "points_granted_deci" not in pr_cols:
            conn.execute("ALTER TABLE payment_records ADD COLUMN points_granted_deci INTEGER NOT NULL DEFAULT 0")
    except Exception as e:
        print(f"[DB] Warning: could not add points_granted_deci to payment_records: {e}")

    # Migrate: rate on payment_records
    try:
        pr_cols2 = [r[1] for r in conn.execute("PRAGMA table_info(payment_records)").fetchall()]
        if "rate" not in pr_cols2:
            conn.execute("ALTER TABLE payment_records ADD COLUMN rate REAL DEFAULT NULL")
    except Exception as e:
        print(f"[DB] Warning: could not add rate to payment_records: {e}")

    # Add created_by to existing tables (NULL = super admin)
    _tables_for_created_by = [
        "workspaces", "projects", "project_items",
        "step_results", "templates", "prompts",
    ]
    for tbl in _tables_for_created_by:
        try:
            cols = [r[1] for r in conn.execute(f"PRAGMA table_info({tbl})").fetchall()]
            if "created_by" not in cols:
                conn.execute(f"ALTER TABLE {tbl} ADD COLUMN created_by TEXT")
                conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{tbl}_created_by ON {tbl}(created_by)")
        except Exception as e:
            print(f"[DB] Warning: could not add created_by to {tbl}: {e}")

    # Add created_by to batch_jobs for cancel ownership tracking
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(batch_jobs)").fetchall()]
        if "created_by" not in cols:
            conn.execute("ALTER TABLE batch_jobs ADD COLUMN created_by TEXT DEFAULT ''")
    except Exception as e:
        print(f"[DB] Warning: could not add created_by to batch_jobs: {e}")

def _migrate_v1_seed_roles(conn):
    """Insert 4 system roles with their permissions."""
    import uuid as _uuid
    import json as _json

    # All 19 permission codes
    ALL_PERMISSIONS = [
        "project.create", "project.edit_own", "project.delete_own",
        "project.view_all", "project.edit_all",
        "config.project", "config.global",
        "stage1.view", "stage1.generate",
        "stage2.view", "stage2.generate",
        "stage3.view", "stage3.generate",
        "stage4.view", "stage4.generate",
        "stage5.view", "stage5.download",
        "template.manage", "prompt.manage",
        "member.manage", "role.manage",
    ]

    CONTENT_ADMIN_PERMS = [
        "project.create", "project.edit_own", "project.delete_own",
        "config.project",
        "stage1.view", "stage1.generate",
        "stage2.view", "stage2.generate",
        "stage3.view", "stage3.generate",
        "stage4.view", "stage4.generate",
        "stage5.view", "stage5.download",
        "prompt.manage",
    ]

    TRIAL_MEMBER_PERMS = [
        "stage1.view", "stage2.view", "stage3.view",
        "stage4.view", "stage5.view",
    ]

    PAID_MEMBER_PERMS = [
        "stage1.view", "stage2.view", "stage3.view",
        "stage4.view", "stage5.view", "stage5.download",
    ]

    _seed_roles = [
        ("超级管理员", "admin", ALL_PERMISSIONS),
        ("内容管理员", "admin", CONTENT_ADMIN_PERMS),
        ("试用会员", "member", TRIAL_MEMBER_PERMS),
        ("付费会员", "member", PAID_MEMBER_PERMS),
        ("开发体验员", "member", CONTENT_ADMIN_PERMS),
    ]

    for name, utype, perms in _seed_roles:
        existing = conn.execute("SELECT id FROM roles WHERE name=?", (name,)).fetchone()
        if existing:
            continue
        rid = str(_uuid.uuid4())
        conn.execute(
            "INSERT INTO roles (id, name, description, user_type, is_system) VALUES (?, ?, ?, ?, 1)",
            (rid, name, f"系统预置{name}角色", utype),
        )
        for p in perms:
            conn.execute(
                "INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES (?, ?)",
                (rid, p),
            )


def _migrate_v1_create_admin(conn):
    """Create super admin user from existing admin_password or generate new password."""
    import uuid as _uuid
    import secrets

    # Check if super admin already exists
    existing = conn.execute("SELECT id FROM users WHERE user_type='admin' LIMIT 1").fetchone()
    if existing:
        return

    # Read existing password from settings
    stored_hash_row = conn.execute(
        "SELECT value FROM settings WHERE key='admin_password'"
    ).fetchone()
    stored_hash = stored_hash_row["value"] if stored_hash_row else ""

    if stored_hash and stored_hash.strip():
        password_hash = stored_hash.strip()
    else:
        # New installation: generate random password
        import string as _str
        alphabet = _str.ascii_letters + _str.digits
        password = ''.join(secrets.choice(alphabet) for _ in range(16))
        password_hash = _hash_password_v1(password)
        # Print to console
        print("=" * 48)
        print(f"  初始超级管理员密码: {password}")
        print("  请登录后立即修改")
        print("=" * 48)
        # Also write to file as fallback
        try:
            with open(os.path.join(BASE_DIR, "initial_admin_password.txt"), "w") as f:
                f.write(password)
        except Exception:
            pass

    # Create super admin user
    admin_id = str(_uuid.uuid4())
    conn.execute(
        """INSERT INTO users (id, username, password_hash, display_name, email, user_type,
           is_active, is_approved, token_version, must_change_password)
           VALUES (?, 'admin', ?, '超级管理员', NULL, 'admin', 1, 1, 1, 1)""",
        (admin_id, password_hash),
    )

    # Mark setup as not completed (forces setup wizard on first login)
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('setup_completed', '0')"
    )

    # Find super admin role
    role_row = conn.execute("SELECT id FROM roles WHERE name='超级管理员' AND is_system=1").fetchone()
    if role_row:
        conn.execute(
            "INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
            (admin_id, role_row["id"]),
        )


def _hash_password_v1(password: str) -> str:
    """bcrypt hash helper usable during migration (avoids circular import)."""
    import bcrypt as _bcrypt
    return _bcrypt.hashpw(password.encode("utf-8")[:72], _bcrypt.gensalt()).decode("utf-8")


if __name__ == "__main__":
    init_db()
