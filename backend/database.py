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
                 '## 文档结构（固定 8 页，不可增减）\n\n'
                 '| 章节 | page_type | 页数 | 说明 |\n'
                 '|------|-----------|------|------|\n'
                 '| 封面 | cover | 1 | 文档标题 + 副标题 + 元数据（日期/分类/标签/版本）+ 品牌信息 |\n'
                 '| 目录 | toc | 1 | 各章节标题及对应页码 |\n'
                 '| 概述 | content | 1 | 正文段落 + 要点列表 |\n'
                 '| 数据表格 | table | 1 | 结构化数据表格，列数由内容决定 |\n'
                 '| 数据图表 | chart | 1 | 可视化图表（大数字/进度条/柱状图/环形图） |\n'
                 '| 结构示意 | diagram | 1 | SVG 示意图 + 标注说明 |\n'
                 '| 流程步骤 | flowchart | 1 | 步骤节点 + 连接箭头 + 描述 |\n'
                 '| 结尾 | closing | 1 | 感谢语 + 行动号召 + 品牌信息 |\n\n'
                 '硬约束：\n'
                 '- 共 8 页，不可多不可少\n'
                 '- seq 从 1 开始连续编号\n'
                 '- page_type 必须是上述 8 个值之一\n'
                 '- JSON 输出格式：\n'
                 '```json\n'
                 '{"slides":[\n'
                 '  {"seq":1,"heading":"...","page_type":"cover","key_points":["日期","分类","标签","版本"]},\n'
                 '  {"seq":2,"heading":"目录","page_type":"toc","key_points":[]},\n'
                 '  {"seq":3,"heading":"...","page_type":"content","key_points":["要点1","要点2","要点3"]},\n'
                 '  {"seq":4,"heading":"...","page_type":"table","key_points":["列1","列2","列3"]},\n'
                 '  {"seq":5,"heading":"...","page_type":"chart","key_points":["指标1","指标2"]},\n'
                 '  {"seq":6,"heading":"...","page_type":"diagram","key_points":["标注1","标注2"]},\n'
                 '  {"seq":7,"heading":"...","page_type":"flowchart","key_points":["步骤1","步骤2","步骤3"]},\n'
                 '  {"seq":8,"heading":"感谢聆听","page_type":"closing","key_points":[]}\n'
                 ']}\n'
                 '```\n'
                 '- key_points 为字符串数组，对应各页面的维度/列名/标签\n'
                 '- heading 不超过 20 字符',
                 1, '{"canvas": {"width": 794, "height": 1123}}', 2),
            ]
            for d in defaults:
                conn.execute(
                    "INSERT INTO column_configs (id, column_id, label, prompt, skill, has_template, rules, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    d
                )
        # Clean up old presets and seed style-business template
        try:
            _json = __import__('json')
            conn.execute("DELETE FROM templates WHERE type='preset'")
            existing_styles = conn.execute("SELECT COUNT(*) FROM templates WHERE type='style'").fetchone()[0]
            if existing_styles == 0:
                _styles = [
                    ('style-business', '商务专业', 'style',
                     '', '', '',
                     _json.dumps({"style_id":"business","group":"Professional"}, ensure_ascii=False),
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

        conn.commit()
    finally:
        conn.close()
    print(f"[DB] Initialized at {DB_PATH}")


if __name__ == "__main__":
    init_db()
