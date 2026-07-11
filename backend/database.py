import os
import sys
import sqlite3
import shutil
from datetime import datetime, timedelta

# When running as PyInstaller bundle, data goes next to the exe
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
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
        # Seed data → workspace_id IS NULL; workspace copies → workspace_id = <wid>
        _config_tables = ['column_configs', 'speech_configs', 'tts_configs', 'core_prompt_configs']
        try:
            for _tbl in _config_tables:
                _existing_cols = [row[1] for row in conn.execute(f"PRAGMA table_info({_tbl})").fetchall()]
                if 'workspace_id' not in _existing_cols:
                    conn.execute(f"ALTER TABLE {_tbl} ADD COLUMN workspace_id TEXT")
            # Assign existing data to 食谱教案 workspace, then re-insert seed copies
            _ws = conn.execute("SELECT id FROM workspaces WHERE name LIKE '%食谱%' LIMIT 1").fetchone()
            if _ws:
                _ws_id = _ws[0]
                _migrated = conn.execute(
                    "SELECT COUNT(*) FROM column_configs WHERE workspace_id IS NOT NULL").fetchone()[0]
                if _migrated == 0:
                    # Rebuild core_prompt_configs UNIQUE constraint: single-col → composite
                    # so the same prompt_key can exist in different workspaces
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
                    # Re-insert seed rows (workspace_id = NULL) with 'seed-' prefixed IDs
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

        # Seed column configs if empty
        existing = conn.execute("SELECT COUNT(*) FROM column_configs WHERE workspace_id IS NULL").fetchone()[0]
        if existing == 0:
            defaults = [
                ('seed-c1-input', 'col1', '素材输入',
                 '【作用】Stage 1 — 用户输入素材后，此提示词定义 AI 如何处理和整理原始素材。\n'
                 '【输入】用户提供的原始文本/文件内容\n'
                 '【编写要点】指定输出格式（Markdown/纯文本）、内容组织方式、是否需要去噪/摘要/结构化。保持通用，不限定行业术语。',
                 '【作用】定义 Stage 1 的输出格式模板，AI 按此模板组织整理后的素材。\n'
                 '【编写要点】使用 Markdown 结构，用占位符标注需要填充的内容位置。模板越具体，输出越稳定。',
                 0, '{}', 0),
                ('seed-c2-text', 'col2', '文档生成',
                 '【作用】Stage 2 — 基于素材输入（col1 输出），生成完整的培训文档。\n'
                 '【输入】col1 整理后的素材内容\n'
                 '【编写要点】定义文档结构（章节/段落/要点）、语言风格（正式/通俗/教学）、输出格式。可指定"金字塔原理"等结构化方法。',
                 '【作用】定义 Stage 2 输出的文档结构模板。\n'
                 '【编写要点】使用 Markdown 标题层级组织章节，表格定义结构化数据，占位符标注动态内容。',
                 0, '{}', 1),
                ('seed-c3-sop', 'col3', '文档课件',
                 '【作用】Stage 3 — 将 Stage 2 的文档转为 A4 文档大纲（JSON 格式），用于后续 PPT 生成。\n'
                 '【输入】Stage 2 生成的培训文档（Markdown）\n'
                 '【编写要点】定义 JSON 输出格式（slide 数组），指定每个 slide 的字段（seq/heading/page_type/key_points）。\n'
                 '支持的 page_type 共 8 种：cover（封面）、toc（目录）、content（内容页）、table（表格页）、chart（图表页）、diagram（示意图）、flowchart（流程图）、closing（结尾页）。\n'
                 'page_type 需与 VI 通用块（vi/_common/blocks/）对应。',
                 '[{"seq":1,"heading":"封面","page_type":"cover",'
                 '"title_format":"【标题模板】{项目名称} — 标准作业文档",'
                 '"subtitle":"【副标题模板】留空则不显示副标题",'
                 '"key_points":["编写日期","内容分类","适用范围","版本说明"],'
                 '"examples":["文档的编写或更新日期","文档内容的类型或分类归属","本规范的适用对象或场景","文档版本号与修订记录"],'
                 '"description":"【内容简述】留空则 AI 自动从正文提炼一段概述"},\n'
                 '{"seq":2,"heading":"目录","page_type":"toc","chapters":['
                 '{"label":"【章节1】如：项目背景","example":"项目的发起原因与业务需求背景"},'
                 '{"label":"【章节2】如：核心内容","example":"文档的核心内容范围与知识要点"},'
                 '{"label":"【章节3】如：实施流程","example":"操作步骤的关键阶段与执行顺序"},'
                 '{"label":"【章节4】如：总结回顾","example":"全文要点回顾与后续行动建议"}]},\n'
                 '{"seq":3,"heading":"概述","page_type":"content","key_points":["【要点1】该页核心观点或数据","【要点2】该页核心观点或数据","【要点3】该页核心观点或数据"]},\n'
                 '{"seq":4,"heading":"数据表格","page_type":"table","key_points":["【列1】如：项目名称","【列2】如：参数指标","【列3】如：备注说明"]},\n'
                 '{"seq":5,"heading":"数据图表","page_type":"chart","key_points":["【指标1】如：完成率","【指标2】如：增长率"]},\n'
                 '{"seq":6,"heading":"结构示意","page_type":"diagram","key_points":["【标注1】如：模块A","【标注2】如：模块B"]},\n'
                 '{"seq":7,"heading":"流程步骤","page_type":"flowchart","key_points":["【步骤1】如：需求分析","【步骤2】如：方案设计","【步骤3】如：实施交付"]},\n'
                 '{"seq":8,"heading":"感谢聆听","page_type":"closing","key_points":["【结尾信息】如：联系方式、版权说明"]}]',
                 1, '{"canvas": {"width": 794, "height": 1123}}', 2),
                ('seed-c4-dao', 'col4', '分析PPT',
                 '【PPT专用】你是资深教学PPT设计师。\n\n## 页面类型来源\n从 VI 索引文件（index.md）的"页面类型"表格中选择 page_type。共 26 种可选类型。选择最匹配内容特征的类型。需要某类型的详细布局规范时，读取该类型对应的 .md 文件。\n\n## 设计规范来源\n- 设计原则：参考 VI 索引的"设计原则"表格（7项）\n- 设计元素：参考 VI 索引的"设计元素"表格（8项），获取颜色/字号/圆角等具体参数\n- 页面类型规范：读取对应的页面类型 .md 文件\n\n## 你的任务\n根据 SOP 文章内容，按 SKILL 模板定义的四章结构（道→术→流程→附录），为每页幻灯片选择匹配的 page_type 和 layout，生成结构化 JSON 大纲。\n四大核心道（味/质/和/色）必选，补充之道仅当有特殊原理时使用。\n\n## 内容密度约束（PPT专用）\n每页幻灯片承载1个核心观点。key_points 每条 8-20 字，精炼可扫读。禁止过于简单（单字填充）或过于冗长（完整段落塞入）。',
                 '【PPT专用 · 请严格遵循以下栏目结构和输出格式】\n\n## 一、栏目章节结构（必须严格遵循）\n\n本内容类型为"道与术解析"，固定四章结构，总16-18页：\n\n| 章节 | page_type | 页数 | 说明 |\n|------|-----------|------|------|\n| 封面 | cover | 1 | 菜肴名称 + "SOP的道与术" + 菜品研发部 |\n| 目录 | toc | 1 | 四大章节导航列表 |\n| 味之道 | principle | 1 | 核心风味构建：主味型、调味比例、复合味叠加、鲜味来源、本菜应用、反面后果 |\n| 质之道 | principle | 1 | 口感目标与实现：口感目标、原料处理、火候控制、熟制方式、本菜应用、反面后果 |\n| 和之道 | principle | 1 | 去腥·提鲜·增香·解腻：四手段分别说明、本菜应用、反面后果 |\n| 配色之道 | principle | 1 | 整体卖相与色彩搭配：主色突出、辅色对比、点缀提亮、盛器选择、本菜应用、反面后果 |\n| 补充之道 | principle | 0-1 | (可选)仅当有特殊原理时使用，如层次之道、锁鲜之道、转化之道 |\n| 核心技法总览 | process_flow | 1 | 流程图展示5-8个关键步骤，每步标注核心参数(时间/温度/比例)，危险操作标⚠️ |\n| 术之精粹 | technique | 1-2 | 详细操作卡表格：操作步骤、术的关键(参数/手法/判断)、目的、⚠️安全提示 |\n| 道术结合总览 | table | 1 | 通用流程道术结合表：阶段、核心道(原理)、关键术(操作)、可调参数 |\n| 分步骤操作卡 | technique | 2-6 | 选料预处理→煎制锁水→头道炖煮→过滤蔬菜→二次收汁→勾芡装盘，每步骤1页 |\n| 主料调整 | comparison | 1 | 不同主料的关键调整建议表格：主料名称、预处理差异、调味调整、熟制时间变化 |\n| 常见问题 | troubleshoot | 1 | 常见问题与解决(术的纠偏)：问题、原因、解决方法 |\n| 扩展应用 | technique | 1 | 其他烹饪方式：高压锅快做法、烤箱慢炖法、空气炸锅，含参数+⚠️ |\n| 速查卡 | content | 1 | 后厨速查口袋卡：预处理/煎制/炖煮/收汁/勾芡关键数字、调味比例、常见问题速解、⚠️汇总 |\n| 术语解释 | appendix | 0-1 | (可选)术语与大白话解释对照表 |\n| 总结 | summary | 1 | 四大核心一句话总结 + 通用流程可复用菜系 + 金句 |\n| 版权 | copyright | 1 | 版权说明：基于SOP整理，保留原技术细节，仅作结构重组与原理提炼 |\n\n硬约束：\n- 四大核心道(味/质/和/色)必选，每页需填写本菜具体应用及反面后果\n- 所有危险操作(热油、高压锅、明火)必须标注⚠️\n- 补充之道仅当菜品有独特原理时使用\n- 最少15页，最多18页\n- seq连续，封面=1\n\n## 二、输出 JSON 格式\n\n严格输出以下 JSON（无 markdown 包裹）：\n\n{"slides": [\n  {"seq":1, "heading":"[菜名]SOP的道与术", "page_type":"cover", "layout_hint":"full_bleed", "visual_weight":"high", "key_points":["菜品研发部","SOP技术文档"]},\n  {"seq":2, "heading":"目录", "page_type":"toc", "layout_hint":"three_column", "visual_weight":"low", "key_points":["烹饪之道","操作之术","通用流程","技术附录"]},\n  {"seq":3, "heading":"味之道", "page_type":"principle", "layout_hint":"two_column", "visual_weight":"medium", "key_points":["主味型","调味比例","复合味叠加","本菜应用","反面后果"]},\n  {"seq":"N", "heading":"总结", "page_type":"summary", "layout_hint":"single_focus", "visual_weight":"high", "key_points":["四大核心总结","可复用菜系","金句"]}\n]}\n\n\n## 内容密度约束（PPT专用）\n- key_points 每条 8-20 字，精炼短语，服务于幻灯片视觉呈现\n- heading 不超过 15 字\n- 禁止将完整段落或长句塞入 key_points（过于臃肿）\n- 禁止仅用单个模糊词汇填充 key_points（过于简单）\n\n字段说明：\n- seq: 页码（封面=1，总结=最后）\n- heading: 页面标题\n- page_type: 从 VI index.md 的 26 种类型中选择，栏目结构表已指定推荐类型\n- layout_hint: 从 single_focus/two_column/two_column_asymmetric/three_column/hero_grid/mixed_grid/dashboard/timeline/horizontal_split/full_bleed 中选择\n- visual_weight: low/medium/high\n- key_points: 该页核心要点（3-5个字符串）\n- 仅输出 JSON，不输出其他文字',
                 1, '{}', 7),
                ('seed-c4-yanxi', 'col5', '综合PPT',
                 '【PPT专用】你是资深教学PPT设计师。请严格依据研学手册的章节内容，生成一份PPT。\n\n## 页面类型来源\n从 VI 索引文件（index.md）的"页面类型"表格中选择 page_type。共 26 种可选类型。选择最匹配教学内容特征的类型。需要某类型的详细布局规范时，读取该类型对应的 .md 文件。\n\n## 设计规范来源\n- 设计原则：参考 VI 索引的"设计原则"表格（7项）\n- 设计元素：参考 VI 索引的"设计元素"表格（8项），获取颜色/字号/圆角等具体参数\n- 页面类型规范：读取对应的页面类型 .md 文件\n\n## 你的任务\n根据研学手册内容，按 SKILL 模板定义的八章结构，为每页幻灯片选择匹配的 page_type 和 layout，生成结构化 JSON 大纲。\n\n## 内容密度约束（PPT专用）\n每页幻灯片承载1个核心观点。key_points 每条 8-20 字，精炼可扫读。禁止过于简单（单字填充）或过于冗长（完整段落塞入）。',
                 '【PPT专用 · 请严格遵循以下栏目结构和输出格式】\n\n## 一、栏目章节结构（必须严格遵循）\n\n本内容类型为"研学手册"，固定八章结构：\n\n| 章节 | page_type | 页数 | 说明 |\n|------|-----------|------|------|\n| 封面 | cover | 1 | 菜名 + 核心技术定位 + 菜品特点 + 版本号 |\n| 目录 | toc | 1 | 八大章节导航列表 |\n| 一、风味与质地预置 | content | ≥1 | 香气构成表 + 口感三阶递进(mermaid) + 色泽形成路径(mermaid) |\n| 二、烹饪原理清单 | content | ≥1 | 核心化学知识点表格：烹饪化学原理、应用位置、作用 |\n| 三、深度剖析SOP | technique | ≥4 | 总流程图(mermaid) + 关键步骤三栏卡片(操作与观察/科学原理与技法要义/迁移思考与风险规避) |\n| 四、食材科学档案 | food_archive | ≥2 | 核心食材/调料深度卡片：角色定位、黄金参数、作用机理、替代与风险 |\n| 五、专项技能工具箱 | skill_card | 2 | 可迁移技法卡片：技法描述(mermaid流程图)、本菜应用、科学本质、可迁移场景 |\n| 六、故障诊断与复盘 | troubleshoot | ≥1 | 诊断树(mermaid) + 解决方案对照表 + 厨师笔记 |\n| 七、总结 | summary | 1 | 从一道菜到一套方法论：科学原理总结 + 可迁移能力 |\n| 八、结语 | closing | 1 | 致谢 + 版本信息 |\n\n硬约束：\n- 八章结构不可省略\n- 深度剖析SOP至少4个关键步骤，每个独占一页\n- 食材科学档案至少2种核心食材/调料，每种独占一页\n- 专项技能工具箱固定2个可迁移技法\n- 所有mermaid图表必须保留\n- 最少12页，最多30页\n- seq连续，封面=1\n\n## 二、输出 JSON 格式\n\n严格输出以下 JSON（无 markdown 包裹）：\n\n{"slides": [\n  {"seq":1, "heading":"菜品名", "page_type":"cover", "layout_hint":"full_bleed", "visual_weight":"high", "key_points":["核心技术定位","菜品特点","版本号"]},\n  {"seq":2, "heading":"目录", "page_type":"toc", "layout_hint":"three_column", "visual_weight":"low", "key_points":["风味质地","烹饪原理","SOP剖析","食材档案","技能工具箱","故障复盘","总结","结语"]},\n  {"seq":3, "heading":"风味与质地预置", "page_type":"content", "layout_hint":"two_column", "visual_weight":"medium", "key_points":["香气构成","口感三阶递进","色泽形成路径"]},\n  {"seq":"N", "heading":"结语", "page_type":"closing", "layout_hint":"single_focus", "visual_weight":"high", "key_points":["致谢","版本信息"]}\n]}\n\n\n## 内容密度约束（PPT专用）\n- key_points 每条 8-20 字，精炼短语，服务于幻灯片视觉呈现\n- heading 不超过 15 字\n- 禁止将完整段落或长句塞入 key_points（过于臃肿）\n- 禁止仅用单个模糊词汇填充 key_points（过于简单）\n\n字段说明：\n- seq: 页码（封面=1，结语=最后）\n- heading: 页面标题\n- page_type: 从 VI index.md 的 26 种类型中选择，栏目结构表已指定推荐类型\n- layout_hint: 从 single_focus/two_column/two_column_asymmetric/three_column/hero_grid/mixed_grid/dashboard/timeline/horizontal_split/full_bleed 中选择\n- visual_weight: low/medium/high\n- key_points: 该页核心要点（3-5个字符串）\n- 仅输出 JSON，不输出其他文字',
                 1, '{}', 8),
            ]
            for d in defaults:
                conn.execute(
                    "INSERT INTO column_configs (id, column_id, label, prompt, skill, has_template, rules, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    d
                )
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
        # Seed speech_configs if empty
        try:
            sc_count = conn.execute("SELECT COUNT(*) FROM speech_configs WHERE workspace_id IS NULL").fetchone()[0]
            if sc_count == 0:
                defaults = [
                    ('seed-speech-doc', '文档演讲',
                     '【作用】Stage 4 (col6) — 根据 Stage 2 生成的文档内容，撰写口播演讲稿。\n'
                     '【输入】Stage 2 输出的培训文档\n'
                     '【编写要点】定义演讲风格（亲切/正式/教学）、结构（开场白→主体→结束语）、语言特征（口语化/节奏感/停顿标记）。',
                     '【作用】定义演讲稿的输出格式模板。\n'
                     '【编写要点】用 Markdown 结构标注段落/停顿/强调，可指定字数范围或时长估算。',
                     1),
                    ('seed-speech-analysis', '分析演讲',
                     '【作用】Stage 4 (col6) — 根据分析文档内容，撰写深度分析演讲稿。\n'
                     '【输入】分析类文档（如技术分析、市场分析）\n'
                     '【编写要点】侧重于逻辑清晰、层层递进、突出原理与要点，适合专业听众。',
                     '【作用】定义分析类演讲稿的输出格式模板。\n'
                     '【编写要点】标注逻辑层次（总→分→总）、关键数据强调方式、专业术语处理。',
                     2),
                    ('seed-speech-comprehensive', '综合演讲',
                     '【作用】Stage 4 (col6) — 根据综合文档内容，撰写系统全面的演讲稿。\n'
                     '【输入】综合类培训文档\n'
                     '【编写要点】兼顾理论深度与实践指导，平衡专业性与可理解性，适合教学场景。',
                     '【作用】定义综合类演讲稿的输出格式模板。\n'
                     '【编写要点】标注理论与实践的交替节奏、案例引入方式、互动环节设计。',
                     3),
                ]
                for d in defaults:
                    conn.execute(
                        "INSERT INTO speech_configs (id, label, prompt, skill, sort_order) VALUES (?, ?, ?, ?, ?)",
                        d
                    )
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
        try:
            tc_count = conn.execute("SELECT COUNT(*) FROM tts_configs WHERE workspace_id IS NULL").fetchone()[0]
            if tc_count == 0:
                tts_defaults = [
                    ('seed-tts-doc', '文档语音',
                     '【作用】Stage 4 (col7) — 将演讲稿转为语音播报的角色提示词，控制语音的语气和表达风格。\n'
                     '【输入】Stage 4 生成的演讲稿文本\n'
                     '【编写要点】定义语音角色（培训讲师/解说员等）、语气（亲切/专业/激昂）、语速/停顿等表达特征。此提示词直接影响 TTS 合成效果。',
                     '', 1),
                    ('seed-tts-analysis', '分析语音',
                     '【作用】Stage 4 (col7) — 将分析类演讲稿转为语音播报的角色提示词。\n'
                     '【输入】分析类演讲稿\n'
                     '【编写要点】侧重于逻辑表达（语速适中、重音强调关键数据）、专业但不生硬。',
                     '', 2),
                    ('seed-tts-comprehensive', '综合语音',
                     '【作用】Stage 4 (col7) — 将综合类演讲稿转为语音播报的角色提示词。\n'
                     '【输入】综合类演讲稿\n'
                     '【编写要点】平衡教学感与亲和力，适合长时间培训场景的语音表达。',
                     '', 3),
                ]
                for d in tts_defaults:
                    conn.execute(
                        "INSERT INTO tts_configs (id, label, prompt, skill, sort_order) VALUES (?, ?, ?, ?, ?)",
                        d
                    )
        except Exception:
            pass

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

    # Migrate: add payment_ref to payment_records (user-submitted payment proof)
    try:
        pr_cols = [r[1] for r in conn.execute("PRAGMA table_info(payment_records)").fetchall()]
        if "payment_ref" not in pr_cols:
            conn.execute("ALTER TABLE payment_records ADD COLUMN payment_ref TEXT DEFAULT ''")
    except Exception as e:
        print(f"[DB] Warning: could not add payment_ref to payment_records: {e}")

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
