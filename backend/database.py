import os
import sqlite3
import shutil
from datetime import datetime, timedelta

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

        # Migrate column_configs for column split (existing DBs)
        try:
            conn.execute("UPDATE column_configs SET column_id='col5', sort_order=8 WHERE id='c4-yanxi' AND column_id='col4'")
            conn.execute("UPDATE column_configs SET column_id='col6', sort_order=9 WHERE id='c5-koubo' AND column_id='col5'")
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
            _svg_gen_path = _os.path.join(_prompts_dir, "svg-generator.md")
            _bento_path = _os.path.join(_prompts_dir, "bento-grid-layout.md")
            _outline_path = _os.path.join(_prompts_dir, "outline-architect.md")
            _cognitive_path = _os.path.join(_prompts_dir, "cognitive-design-principles.md")

            _svg_gen_content = ""
            _bento_content = ""
            _outline_content = ""
            _cognitive_content = ""
            if _os.path.exists(_svg_gen_path):
                with open(_svg_gen_path, "r", encoding="utf-8") as _f:
                    _svg_gen_content = _f.read()
            if _os.path.exists(_bento_path):
                with open(_bento_path, "r", encoding="utf-8") as _f:
                    _bento_content = _f.read()
            if _os.path.exists(_outline_path):
                with open(_outline_path, "r", encoding="utf-8") as _f:
                    _outline_content = _f.read()
            if _os.path.exists(_cognitive_path):
                with open(_cognitive_path, "r", encoding="utf-8") as _f:
                    _cognitive_content = _f.read()

            if _svg_gen_content or _bento_content or _outline_content or _cognitive_content:
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
                            if _svg_gen_content and "svg_generator_prompt" not in _rules:
                                _rules["svg_generator_prompt"] = _svg_gen_content
                                _updated = True
                            if _bento_content and "bento_layout_prompt" not in _rules:
                                _rules["bento_layout_prompt"] = _bento_content
                                _updated = True
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
        existing = conn.execute("SELECT COUNT(*) FROM column_configs").fetchone()[0]
        if existing == 0:
            defaults = [
                ('c1-input', 'col1', '素材输入', '请根据用户提供的内容，整理为标准文档格式。', '', 0, '{}', 0),
                ('c2-text', 'col2', '文档生成', '请根据素材内容生成一份完整的文档。', '', 0, '{}', 1),
                ('c3-ppt', 'col3', 'PPT 生成', '请根据文档内容生成一份演示文稿。', '', 1, '{}', 2),
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

        conn.commit()
    finally:
        conn.close()
    print(f"[DB] Initialized at {DB_PATH}")


if __name__ == "__main__":
    init_db()
