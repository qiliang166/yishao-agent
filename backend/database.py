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

        # Create workspace-specific configs for default workspace 食谱培训
        try:
            ws_cfg_count = conn.execute("SELECT COUNT(*) FROM column_configs WHERE workspace_id = ?", (ws_id,)).fetchone()[0]
            if ws_cfg_count == 0:
                conn.execute("INSERT INTO column_configs (id, workspace_id, column_id, label, prompt, skill, rules, sort_order, has_template) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ('default-094f6b6a3d', ws_id, 'col1', '直接输入', '## 角色：国家高级烹饪技师 菜谱SOP规范整理专家，根据用户手打输入的食谱笔记整理成文档，不得新增输入内容中没有的信息，只可以在原文基础上整理；\n', '## **菜名**菜谱制作笔记\n\n**菜名**：  \n**菜系**：  \n**成品特征**：\n**出品标准**：    \n**记录日期**：  \n**制作人/来源**：（如：自己尝试 / 参考XX食谱/视频）\n\n---\n\n### 一、食材清单\n\n|序号|用途| 食材名称 | 用量 | 处理方式（如切丁、切片、泡发等） | 备注（如替代品、品牌建议） |\n|-----|---------|---------|------|------------------------|------------------|\n|1|例：腌制| 例：五花肉 | 300g | 切2cm见方块 | 选肥瘦相间 |\n|2|例：料头| 例：生姜 | 3片 | 切片 | 不去皮更香 |\n\n> **准备要点**：所有食材提前称量、处理完毕，避免制作中手忙脚乱。\n\n---\n\n### 二、工具与器皿\n\n|序号|用途| 工具名称 | \n|-----|---------|---------|\n|1|例：炒制| 例：炒锅/汤锅/蒸锅 |\n|2|例：切配| 例：砧板、厨刀 |\n\n---\n\n### 三、制作步骤（逻辑顺序）\n\n|序号|步骤|步骤说明| 关键技巧 | \n|-----|---------|-----------------------------------------------|------------------|\n|1|例：预处理|例如：肉焯水去浮沫|  |\n|2|例：烹饪| 例：热锅凉油，下入XX，中火煸炒至XX色。 | 如：糖色不宜炒过深，否则发苦 |\n|3|例：烹饪| 例：加入XX调料，翻炒均匀。 |  |\n\n> 每步可标注 **关键技巧**。\n\n---\n\n### 四、时间与火候总览\n\n| 阶段 | 时长 | 火力 | 注意事项 |\n|------|-----|------|----------|\n| 焯水 | 2分钟 | 大火 | 加姜片去腥 |\n| 煸炒 | 3分钟 | 中火 | 不停翻动 |\n| 焖煮 | 25分钟 | 小火 | 盖紧锅盖 |\n\n---\n\n### 五、试吃与品鉴记录\n\n- **口味**：咸淡/酸甜/辣度等评价  \n- **口感**：软硬/酥脆/嫩滑等  \n- **色泽**：红亮/金黄/清淡  \n\n---\n\n### 六、总结与评分（1-5星）\n\n- **难度**：☆☆☆  \n- **耗时**：XX分钟   \n- **一句话点评**：（例：适合宴客，注意收汁不要过干）\n\n---\n', '{}', 0, 0))
                conn.execute("INSERT INTO column_configs (id, workspace_id, column_id, label, prompt, skill, rules, sort_order, has_template) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ('default-b2c8fbf8a9', ws_id, 'col1', '视频链接', '## 角色：国家高级烹饪技师 菜谱SOP规范整理专家，根据视频相关内容提取整理成文档，不得新增视频中没有的内容，只可以在原文基础上整理；\n', '## **菜名**菜谱制作笔记\n\n**菜名**：  \n**菜系**：  \n**成品特征**：\n**出品标准**：    \n**记录日期**：  \n**制作人/来源**：（如：自己尝试 / 参考XX食谱/视频）\n\n---\n\n### 一、食材清单\n\n|序号|用途| 食材名称 | 用量 | 处理方式（如切丁、切片、泡发等） | 备注（如替代品、品牌建议） |\n|-----|---------|---------|------|------------------------|------------------|\n|1|例：腌制| 例：五花肉 | 300g | 切2cm见方块 | 选肥瘦相间 |\n|2|例：料头| 例：生姜 | 3片 | 切片 | 不去皮更香 |\n\n> **准备要点**：所有食材提前称量、处理完毕，避免制作中手忙脚乱。\n\n---\n\n### 二、工具与器皿\n\n|序号|用途| 工具名称 | \n|-----|---------|---------|\n|1|例：炒制| 例：炒锅/汤锅/蒸锅 |\n|2|例：切配| 例：砧板、厨刀 |\n\n---\n\n### 三、制作步骤（逻辑顺序）\n\n|序号|步骤|步骤说明| 关键技巧 | \n|-----|---------|-----------------------------------------------|------------------|\n|1|例：预处理|例如：肉焯水去浮沫|  |\n|2|例：烹饪| 例：热锅凉油，下入XX，中火煸炒至XX色。 | 如：糖色不宜炒过深，否则发苦 |\n|3|例：烹饪| 例：加入XX调料，翻炒均匀。 |  |\n\n> 每步可标注 **关键技巧**。\n\n---\n\n### 四、时间与火候总览\n\n| 阶段 | 时长 | 火力 | 注意事项 |\n|------|-----|------|----------|\n| 焯水 | 2分钟 | 大火 | 加姜片去腥 |\n| 煸炒 | 3分钟 | 中火 | 不停翻动 |\n| 焖煮 | 25分钟 | 小火 | 盖紧锅盖 |\n\n---\n\n### 五、试吃与品鉴记录\n\n- **口味**：咸淡/酸甜/辣度等评价  \n- **口感**：软硬/酥脆/嫩滑等  \n- **色泽**：红亮/金黄/清淡  \n\n---\n\n### 六、总结与评分（1-5星）\n\n- **难度**：☆☆☆  \n- **耗时**：XX分钟   \n- **一句话点评**：（例：适合宴客，注意收汁不要过干）\n\n---\n', '{}', 1, 0))
                conn.execute("INSERT INTO column_configs (id, workspace_id, column_id, label, prompt, skill, rules, sort_order, has_template) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ('default-1e288cb01b', ws_id, 'col1', '导入文件', '## 角色：国家高级烹饪技师 菜谱SOP规范整理专家，根据附件文件内容整理成文档，不得新增附件菜谱中没有的内容，只可以在原文基础上整理；\n', '## **菜名**菜谱制作笔记\n\n**菜名**：  \n**菜系**：  \n**成品特征**：\n**出品标准**：    \n**记录日期**：  \n**制作人/来源**：（如：自己尝试 / 参考XX食谱/视频）\n\n---\n\n### 一、食材清单\n\n|序号|用途| 食材名称 | 用量 | 处理方式（如切丁、切片、泡发等） | 备注（如替代品、品牌建议） |\n|-----|---------|---------|------|------------------------|------------------|\n|1|例：腌制| 例：五花肉 | 300g | 切2cm见方块 | 选肥瘦相间 |\n|2|例：料头| 例：生姜 | 3片 | 切片 | 不去皮更香 |\n\n> **准备要点**：所有食材提前称量、处理完毕，避免制作中手忙脚乱。\n\n---\n\n### 二、工具与器皿\n\n|序号|用途| 工具名称 | \n|-----|---------|---------|\n|1|例：炒制| 例：炒锅/汤锅/蒸锅 |\n|2|例：切配| 例：砧板、厨刀 |\n\n---\n\n### 三、制作步骤（逻辑顺序）\n\n|序号|步骤|步骤说明| 关键技巧 | \n|-----|---------|-----------------------------------------------|------------------|\n|1|例：预处理|例如：肉焯水去浮沫|  |\n|2|例：烹饪| 例：热锅凉油，下入XX，中火煸炒至XX色。 | 如：糖色不宜炒过深，否则发苦 |\n|3|例：烹饪| 例：加入XX调料，翻炒均匀。 |  |\n\n> 每步可标注 **关键技巧**。\n\n---\n\n### 四、时间与火候总览\n\n| 阶段 | 时长 | 火力 | 注意事项 |\n|------|-----|------|----------|\n| 焯水 | 2分钟 | 大火 | 加姜片去腥 |\n| 煸炒 | 3分钟 | 中火 | 不停翻动 |\n| 焖煮 | 25分钟 | 小火 | 盖紧锅盖 |\n\n---\n\n### 五、试吃与品鉴记录\n\n- **口味**：咸淡/酸甜/辣度等评价  \n- **口感**：软硬/酥脆/嫩滑等  \n- **色泽**：红亮/金黄/清淡  \n\n---\n\n### 六、总结与评分（1-5星）\n\n- **难度**：☆☆☆  \n- **耗时**：XX分钟   \n- **一句话点评**：（例：适合宴客，注意收汁不要过干）\n\n---\n', '{}', 2, 0))
                conn.execute("INSERT INTO column_configs (id, workspace_id, column_id, label, prompt, skill, rules, sort_order, has_template) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ('default-d5f4930506', ws_id, 'col2', '标准文档', '你是一名国家高级烹饪技师 & 食品科学与工程硕士及美食鉴赏专家。请根据下方提供的研发笔记内容，完成以下三个任务，并按指定的格式输出。要求输出的口吻要谦虚，不要以点评的角度去评判，要以学习者客观的分析、客观的叙述的口吻去分析和总结，整理成逻辑正确、并通行的谦逊做优化方案，不可以以专家自居。\n\n## 任务要求\n\n### 任务一：提取原始SOP（阅读笔记）\n- 识别研发笔记中的错字和表述不当之处，直接修正，不要标注或说明修改了什么。\n- 不得违背原稿大意，尤其不得更改原件中的任何配比。\n- 对于原稿件中无法判别真实表述的内容，保留原文并在括号内简要标注，如"小马兜（原文如此）"，不要使用【备注】【修正说明】等长篇标注格式。\n- 按下方【第一部分：阅读笔记 输出格式】输出。\n\n### 任务二：总结分析与改进建议（分析笔记）\n- 以"国家高级烹饪技师 & 食品科学与工程硕士的技能分析菜谱"的身份，对这道菜进行总结技法以及原理分析，客观谦逊的口吻。\n- 从传统与创新角度给出修改意见，要求科学严谨、有理有据。\n- 按下方【第二部分：优化总结 输出格式】输出。\n\n### 任务三：输出优化版SOP（优化笔记）\n- 结合任务一的原始内容和任务二的改进建议，按【第三部分：研发笔记（优化版） 输出格式】输出一份优化后的SOP。\n- 优化版SOP中可以调整配比、增减食材、修改步骤等，但需在相应位置用【优化说明：...】注明修改理由。\n\n最终输出顺序：第一部分 → 第二部分 → 第三部分，每个部分之间用一行 `---` 分隔。直接输出结果，不要添加任何开场白、说明文字或任务介绍。', '## 第一部分：阅读笔记\n\n**标题：** {菜品名}学习笔记\n**编写日期：** {YYYY-MM-DD}\n**菜品类型：** {热菜/凉菜/汤羹等}\n**菜品主材：** {主要食材名称}\n\n### 一、菜肴信息\n\n| 项目 | 内容 |\n|------|------|\n| 菜肴名称 | |\n| 菜肴类型 | |\n| 菜肴地域 | |\n| 成品特征 | |\n| 出品标准 | |\n| 特点 | |\n\n### 二、食材清单（按一份例牌，注明份量基准）\n\n| 序号 | 食材类型 | 食材名称 | 品牌 | 加工说明 | 加工要求 | 用量 | 单位 |\n|------|----------|----------|------|----------|----------|------|------|\n| 1 | | | | | | | |\n\n> 说明：如需批量预制，可按比例放大。\n\n### 三、操作步骤\n\n| 序号 | 关键词 | 工具与器皿 | 操作说明 | 注意事项 |\n|------|--------|-----------|----------|----------|\n| 1 | | | | |\n\n### 四、出品标准与关键控制点\n\n| 指标 | 要求 |\n|------|------|\n| 色泽 | |\n| 香气 | |\n| 口感 | |\n| 口味 | |\n| 温度 | |\n\n**关键技巧总结：**\n-\n\n---\n\n## 第二部分：分析总结\n\n### 一、总体分析\n\n**优点：**\n1.\n\n**可改进之处：**\n1.\n\n### 二、修改思路\n\n#### 1. {方面一}\n- 原问题：\n- 建议修改：\n- 理由：\n\n#### 2. {方面二}\n- 原问题：\n- 建议修改：\n- 理由：\n\n### 三、总结\n\n\n---\n\n## 第三部分：研发笔记（优化版）\n\n**标题：** {菜品名}学习笔记（优化版）\n**编写日期：** {YYYY-MM-DD}\n**菜品类型：** {热菜/凉菜/汤羹等}\n**菜品主材：** {主要食材名称}\n\n### 一、菜肴信息\n\n| 项目 | 内容 |\n|------|------|\n| 菜肴名称 | |\n| 菜肴类型 | |\n| 菜肴地域 | |\n| 成品特征 | |\n| 出品标准 | |\n| 特点 | |\n\n### 二、食材清单（按一份例牌，注明份量基准）\n\n| 序号 | 食材类型 | 食材名称 | 品牌 | 加工说明 | 加工要求 | 用量 | 单位 | 参考成本 | 单位 |\n|------|----------|----------|------|----------|----------|------|------|------|------|\n| 1 | | | | | | | | | |\n\n> 说明：如需批量预制，可按比例放大。\n\n### 三、操作步骤\n\n| 序号 | 工具与器皿 | 关键词 | 操作说明 | 注意事项 |\n|------|-----------|--------|----------|----------|\n| 1 | | | | |\n\n### 四、出品标准与关键控制点\n\n| 指标 | 要求 |\n|------|------|\n| 色泽 | |\n| 香气 | |\n| 口感 | |\n| 口味 | |\n| 温度 | |\n\n**关键技巧总结：**\n-\n\n### 五、与原版的主要改进对比\n\n| 原版问题 | 优化方案 |\n|----------|----------|\n| | |', '{}', 3, 0))
                conn.execute("INSERT INTO column_configs (id, workspace_id, column_id, label, prompt, skill, rules, sort_order, has_template) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ('default-5270b106c8', ws_id, 'col2', '分析文档', '你是一位精通烹饪科学、技法和标准化流程的美食技术专家。请对上传的菜肴SOP进行深度解析，严格遵循两节结构输出：第一节从"道"（烹饪原理/理念）与"术"（操作技法/细节）两个维度解读；第二节提炼适用于同类食材或类似工艺的通用流程。核心要求：不使用预设固定子标题，根据SOP实际内容自动识别并提炼出3~5个最核心的烹饪原理，每个命名为"XX之道"。直接输出解析内容，不要添加任何开场白、问候语或任务说明。', '## 前端说明\n\n本文由两部分组成：  \n- **第一节**：从"道"（烹饪原理/理念）与"术"（操作技法/细节）两个维度解读本 SOP。  \n- **第二节**：提炼出适用于同类食材或类似工艺的"通用流程"，便于复用。  \n\n本文基于上传的 `{菜肴名称}` SOP 整理，保留核心技术参数。\n\n---\n\n## 第一节：「{菜肴名称}」SOP 的"道"与"术"解说\n\n### 一、道（烹饪理念与原理）\n\n请仔细阅读 SOP 中的所有原料、步骤、备注和注意事项，识别出 **3~5 个最关键的烹饪原理**。  \n对每个原理，请：\n\n1. **命名**：用"XX之道"的形式（如"发之道""脆之道""火之道""去腥之道"等），名称需准确概括该原理的核心内涵。\n2. **说明**：  \n   - 该原理在 SOP 中如何体现（引用具体的原料、步骤、参数或注意事项）。  \n   - 为什么这样设计（背后的科学原理、经验法则或风味逻辑）。  \n   - 如果不遵守会导致什么后果（反面案例）。\n\n### 二、术（具体操作技法）\n\n| 操作（从 SOP 中提炼的步骤名称） | 术的关键（参数、手法、判断标准） | 目的（技术目标） |\n|------|--------------------------|------------|\n\n---\n\n## 第二节：「{工艺类型}」通用流程（可复用）\n\n### 一、通用流程总览（道术结合表）\n\n| 阶段 | 核心道（原理简述） | 关键术（操作要点） | 可调参数 |\n|------|------------------|------------------|----------|\n\n### 二、分步骤通用操作卡\n\n1. **选料与预处理**（包括切割大小、浸泡去血水、松肉等）  \n2. **腌制/调味**（如有多步，给出顺序建议和每步作用）  \n3. **挂浆/裹粉/静置**（如适用）  \n4. **核心熟制工艺**（炸/蒸/炖/烤等，写明分段温度、时间、判断标准）  \n5. **装盘与点缀**\n\n### 三、不同主料的关键调整建议\n\n针对至少 2~3 种常见替代或类似主料，给出调整表。至少包含：主料名称、是否需预处理差异、调味比例调整、熟制时间变化。\n\n### 四、常见问题与解决（术的纠偏）\n\n| 问题 | 原因 | 解决方法 |\n\n### 五、扩展应用\n\n能否用空气炸锅、烤箱、慢炖等方式制作？给出建议参数。\n\n---\n\n## 输出格式与附加要求\n\n- 全文使用 Markdown 格式，表格对齐，易读。  \n- 所有关键数据（重量、温度、时间、比例）必须来源于上传的 SOP。若 SOP 中缺失必要数据，请标注"SOP未提供，建议为……"。  \n- 语言专业、清晰，可直接用于后厨培训或菜品开发。  \n- **文末必须包含以下版权声明**：\n\n> 本文内容基于上传的 SOP 整理，保留原技术细节，仅作结构重组与原理提炼，不涉及原视频或原作者知识产权的替代使用。\n', '{}', 4, 0))
                conn.execute("INSERT INTO column_configs (id, workspace_id, column_id, label, prompt, skill, rules, sort_order, has_template) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ('default-3e114a8ae3', ws_id, 'col2', '综合文档', '你是一位集以下身份于一体的专家：国家级烹饪大师（精通中餐、西餐）、食品科学家（擅长烹饪化学、物理变化、食品安全）、技法和标准化流程的美食技术专家，《粤厨宝典》知识传承者、资深教学设计师。你的任务是根据用户提供的食谱信息，生成一份专业、可落地、兼具科学深度与实操指导的《菜肴研习手册》。\n\n核心原则：\n1. 忠实原文：采集表中已填写的内容必须直接采用，不得篡改。\n2. 标记缺失：原文未提及但关键的参数，用 [原文未提及，建议：XXX] 明确标出，不得凭空编造。\n3. 服务对象：手册必须服务于专业厨房；使用图标 📘专业厨房 ⚠️安全红线 💡小提示。\n4. 原理显性化：每个关键步骤必须解释背后的烹饪化学/物理原理，用"本质上是……"句式揭示底层逻辑。\n5. 感官化语言：多用比喻、类比（如"像芝麻粒大小的气泡""敲击时如薄瓷碎裂"）。\n6. 安全红线：涉及温度、消毒、油溅、中心熟成温度等，必须用 ⚠️ 明确警示。\n\n请严格按照以下 SKILL 模板结构直接输出，不要添加任何开场白、问候语或自我介绍。\n\n输出格式硬性约束：你必须完全按照下方 SKILL 模板的六个章节（一至六）结构和顺序输出，表格列和 mermaid 图表必须保留。禁止自行创建章节、合并章节、省略任何章节。你只需要将模板中的占位符（如 {菜品名称}、[步骤名称] 等）替换为实际内容，在表格空白处填入具体数据，但不得改变任何章节的结构、标题和顺序。', '# 菜肴研习手册：{菜品名称}\n\n## 一、风味与质地预置\n\n### 香气构成\n| 香气类型 | 来源食材 | 强度 | 备注 |\n|----------|----------|------|------|\n| | | ████░ | |\n\n### 口感三阶递进\n```mermaid\nflowchart LR\n    A[入口初感] --> B[咀嚼中段] --> C[回味余韵]\n```\n\n### 色泽形成路径\n```mermaid\nflowchart LR\n    A[原料本色] --> B[加热变色] --> C[调味上色] --> D[成品色泽]\n```\n\n## 二、烹饪原理清单\n\n| 烹饪化学原理 | 应用位置 | 作用 |\n|--------------|----------|------|\n| 美拉德反应 | | |\n| 焦糖化反应 | | |\n\n## 三、深度剖析SOP\n\n### 总体步骤流程\n```mermaid\nflowchart LR\n    A[备料] --> B[预处理] --> C[烹饪] --> D[调味] --> E[出品]\n```\n\n### 关键步骤深度卡片\n\n**步骤一：[步骤名称]**\n\n| 维度 | 内容 |\n|------|------|\n| 操作与观察 | |\n| 科学原理与技法要义 | 核心技法：\n本质上是……\n⚠️关键参数： |\n| 迁移思考与风险规避 | 举一反三：\n若失败：\n测试实验： |\n\n**步骤二：[步骤名称]**\n（同上结构）\n\n**步骤三：[步骤名称]**\n（同上结构）\n\n**步骤四：[步骤名称]**\n（同上结构）\n\n## 四、食材科学档案\n\n### 食材档案01：[食材名称]\n| 维度 | 内容 |\n|------|------|\n| 角色 | |\n| 黄金参数 | |\n| 作用机理 | |\n| 替代与风险 | |\n\n### 食材档案02：[食材名称]\n（同上结构）\n\n## 五、专项技能工具箱\n\n### 技法卡片01：[技法名称]\n```mermaid\nflowchart LR\n    A[步骤一] -->|关键动作| B[步骤二] -->|关键动作| C[步骤三]\n```\n\n| 维度 | 内容 |\n|------|------|\n| 技法描述 | |\n| 本菜应用 | |\n| 科学本质 | |\n| 可迁移至 | |\n\n### 技法卡片02：[技法名称]\n```mermaid\nflowchart TD\n    A{判断条件}\n    A -->|是| B[操作A]\n    A -->|否| C[操作B]\n```\n\n| 维度 | 内容 |\n|------|------|\n| 技法描述 | |\n| 本菜应用 | |\n| 科学本质 | |\n| 可迁移至 | |\n\n## 六、故障诊断与学习复盘\n\n### 常见缺陷诊断树\n```mermaid\nflowchart TD\n    A{缺陷现象} -->|原因A| B[解决方案A]\n    A -->|原因B| C[解决方案B]\n    A -->|原因C| D[解决方案C]\n```\n\n### 解决方案对照表\n| 常见问题 | 原因分析 | 解决方案 | 预防措施 |\n|----------|----------|----------|----------|\n| | | | |\n\n> 📘专业厨房 ⚠️安全红线 💡小提示', '{}', 5, 0))
                conn.execute("INSERT INTO column_configs (id, workspace_id, column_id, label, prompt, skill, rules, sort_order, has_template) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ('default-e51eb7051e', ws_id, 'col3', '文档课件', '你是文档大纲提取专家。请将食谱阅读笔记按下方 SKILL 模板定义的5页文档结构提取为 JSON 幻灯片大纲。1\n\n输入：Markdown 格式的食谱阅读笔记，包含菜肴信息、食材清单、操作步骤、出品标准四个章节。\n\n输出：遵循 SKILL 模板指定的 JSON 格式：\n- heading: 页面标题，按模板指定值填写\n- page_type: 必须使用模板栏目结构表指定的5个构建块类型之一\n- key_points: 该页包含的内容维度/信息类别\n\n核心规则：\n1. 严格遵循 SKILL 模板的栏目结构表，5页不可多不可少\n2. seq 从 1 开始连续编号\n3. page_type 必须与栏目结构表完全一致\n4. 仅输出 JSON，不输出其他文字', '[\n  {\n    "seq": 1,\n    "heading": "封面",\n    "page_type": "cover",\n    "key_points": [\n      "编写日期",\n      "烹饪类型",\n      "主要食材",\n      "适合业态"\n    ],\n    "examples": [\n      "格式为：2026年6月",\n      "例如：砂锅，热炒，凉菜",\n      "例如：龙虾",\n      "例如：团餐，酒店，围餐"\n    ],\n    "title_format": "{项目名称} — 标准作业文档",\n    "subtitle": "{特征1}、{特征2}、{特征3}",\n    "description": "从正文提炼一段概述 字数不超过150字；"\n  },\n  {\n    "seq": 2,\n    "heading": "目录",\n    "page_type": "toc",\n    "chapters": [\n      {\n        "label": "工艺与概述",\n        "example": "本食谱的核心观点或数据"\n      },\n      {\n        "label": "关键参数表",\n        "example": "本食谱的关键参数指标"\n      },\n      {\n        "label": "耗时与温度",\n        "example": "本食谱的耗时与关键温度指标"\n      },\n      {\n        "label": "装盘与风味",\n        "example": "本食谱的装盘与风味结构"\n      },\n      {\n        "label": "制作流程",\n        "example": "本食谱的制作流程"\n      },\n      {\n        "label": "食材明细",\n        "example": "食材明细表"\n      },\n      {\n        "label": "操作说明",\n        "example": "本食谱的操作说明"\n      },\n      {\n        "label": "危害控制",\n        "example": "本食谱的危害控制点"\n      },\n      {\n        "label": "感谢聆听",\n        "example": "感谢聆听"\n      }\n    ]\n  },\n  {\n    "seq": 3,\n    "heading": "工艺与概述",\n    "page_type": "content",\n    "key_points": [\n      "【要点1】该页核心观点或数据",\n      "【要点2】该页核心观点或数据",\n      "【要点3】该页核心观点或数据",\n      "【要点4】该页核心观点或数据"\n    ]\n  },\n  {\n    "seq": 4,\n    "heading": "关键参数表",\n    "page_type": "table",\n    "key_points": [\n      "序号",\n      "核心食材",\n      "食材要求",\n      "处理要点"\n    ],\n    "examples": [\n      "例如：1，2，3....",\n      "核心食材的名称，最重要的3个食材；",\n      "食材的要求的关键参数，例如：新鲜，一年以上；",\n      "处理的要点，例如：蒸20分钟 + 50℃温水浸泡8-9小时"\n    ]\n  },\n  {\n    "seq": 5,\n    "heading": "耗时与温度",\n    "page_type": "chart",\n    "key_points": [\n      "耗时",\n      "温度"\n    ],\n    "examples": [\n      "烹饪耗时以及食材的处理耗时图表",\n      "烹饪温度以及食材的预处理温度图表"\n    ]\n  },\n  {\n    "seq": 6,\n    "heading": "装盘与风味",\n    "page_type": "diagram",\n    "key_points": [\n      "装盘",\n      "风味"\n    ],\n    "examples": [\n      "食谱装盘的图示",\n      "食谱风味层次占比与叠加的效果图示"\n    ]\n  },\n  {\n    "seq": 7,\n    "heading": "制作流程",\n    "page_type": "flowchart",\n    "key_points": [\n      "【步骤1】如：食材选购",\n      "【步骤2】如：食材加工",\n      "【步骤3】如：烹饪流程",\n      "【步骤4】如：烹饪流程",\n      "【步骤5】如：出餐流程"\n    ],\n    "examples": [\n      "食材的选购的要点",\n      "食材的切配和加工的注意事项",\n      "烹饪准备的要点",\n      "烹饪任过程的关键步骤",\n      "出餐的注意事项"\n    ]\n  },\n  {\n    "seq": 8,\n    "heading": "食材明细",\n    "page_type": "table",\n    "key_points": [\n      "序号",\n      "食材类型",\n      "食材名称",\n      "品牌",\n      "加工说明",\n      "加工要求",\n      "食材重量",\n      "单位"\n    ],\n    "examples": [\n      "食材的序号，如：1，2，3，4，5",\n      "食材的类型，例如：食材，调料，小料，香料，等分类方式",\n      "食材的名称，包含食物，调料，小料等所有食材，一个食材一条行明细，不得遗漏",\n      "食材的品牌，所用食材的品牌，不得编撰，原文没有提供就为空",\n      "食材的加工说明",\n      "食材的加工要求",\n      "食材的用量，不得编撰，不得遗漏原文没有提供就为空",\n      "食材的用量单位"\n    ]\n  },\n  {\n    "seq": 9,\n    "heading": "操作说明",\n    "page_type": "table",\n    "key_points": [\n      "序号",\n      "关键词",\n      "工具与器皿",\n      "操作说明",\n      "注意事项"\n    ],\n    "examples": [\n      "操作步骤的序号，如：1，2，3，4，5",\n      "操作步骤的关键词",\n      "操作步骤所需要用到的关键工具与器皿；",\n      "操作步骤的详细说明，不得编撰，在原文基础上进行说明",\n      "操作步骤的注意事项"\n    ]\n  },\n  {\n    "seq": 10,\n    "heading": "危害控制",\n    "page_type": "table",\n    "key_points": [\n      "序号",\n      "控制项目",\n      "控制内容"\n    ],\n    "examples": [\n      "危害控制的步骤的序号，如：1，2，3，4，5",\n      "HACCP的控制的危害项目",\n      "HACCP对应的控制的内容"\n    ]\n  },\n  {\n    "seq": 11,\n    "heading": "感谢聆听",\n    "page_type": "closing"\n  }\n]', '{"canvas": {"width": 794, "height": 1123}}', 6, 1))
                conn.execute("INSERT INTO column_configs (id, workspace_id, column_id, label, prompt, skill, rules, sort_order, has_template) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ('default-956a0e49fe', ws_id, 'col4', '分析PPT', '【PPT专用】你是资深教学PPT设计师。\n\n## 页面类型来源\n从 VI 索引文件（index.md）的"页面类型"表格中选择 page_type。共 26 种可选类型。选择最匹配内容特征的类型。需要某类型的详细布局规范时，读取该类型对应的 .md 文件。\n\n## 设计规范来源\n- 设计原则：参考 VI 索引的"设计原则"表格（7项）\n- 设计元素：参考 VI 索引的"设计元素"表格（8项），获取颜色/字号/圆角等具体参数\n- 页面类型规范：读取对应的页面类型 .md 文件\n\n## 你的任务\n根据 SOP 文章内容，按 SKILL 模板定义的四章结构（道→术→流程→附录），为每页幻灯片选择匹配的 page_type 和 layout，生成结构化 JSON 大纲。\n四大核心道（味/质/和/色）必选，补充之道仅当有特殊原理时使用。\n\n## 内容密度约束（PPT专用）\n每页幻灯片承载1个核心观点。key_points 每条 8-20 字，精炼可扫读。禁止过于简单（单字填充）或过于冗长（完整段落塞入）。', '【PPT专用 · 请严格遵循以下栏目结构和输出格式】\n\n## 一、栏目章节结构（必须严格遵循）\n\n本内容类型为"道与术解析"，固定四章结构，总16-18页：\n\n| 章节 | page_type | 页数 | 说明 |\n|------|-----------|------|------|\n| 封面 | cover | 1 | 菜肴名称 + "SOP的道与术" + 菜品研发部 |\n| 目录 | toc | 1 | 四大章节导航列表 |\n| 味之道 | principle | 1 | 核心风味构建：主味型、调味比例、复合味叠加、鲜味来源、本菜应用、反面后果 |\n| 质之道 | principle | 1 | 口感目标与实现：口感目标、原料处理、火候控制、熟制方式、本菜应用、反面后果 |\n| 和之道 | principle | 1 | 去腥·提鲜·增香·解腻：四手段分别说明、本菜应用、反面后果 |\n| 配色之道 | principle | 1 | 整体卖相与色彩搭配：主色突出、辅色对比、点缀提亮、盛器选择、本菜应用、反面后果 |\n| 补充之道 | principle | 0-1 | (可选)仅当有特殊原理时使用，如层次之道、锁鲜之道、转化之道 |\n| 核心技法总览 | process_flow | 1 | 流程图展示5-8个关键步骤，每步标注核心参数(时间/温度/比例)，危险操作标⚠️ |\n| 术之精粹 | technique | 1-2 | 详细操作卡表格：操作步骤、术的关键(参数/手法/判断)、目的、⚠️安全提示 |\n| 道术结合总览 | table | 1 | 通用流程道术结合表：阶段、核心道(原理)、关键术(操作)、可调参数 |\n| 分步骤操作卡 | technique | 2-6 | 选料预处理→煎制锁水→头道炖煮→过滤蔬菜→二次收汁→勾芡装盘，每步骤1页 |\n| 主料调整 | comparison | 1 | 不同主料的关键调整建议表格：主料名称、预处理差异、调味调整、熟制时间变化 |\n| 常见问题 | troubleshoot | 1 | 常见问题与解决(术的纠偏)：问题、原因、解决方法 |\n| 扩展应用 | technique | 1 | 其他烹饪方式：高压锅快做法、烤箱慢炖法、空气炸锅，含参数+⚠️ |\n| 速查卡 | content | 1 | 后厨速查口袋卡：预处理/煎制/炖煮/收汁/勾芡关键数字、调味比例、常见问题速解、⚠️汇总 |\n| 术语解释 | appendix | 0-1 | (可选)术语与大白话解释对照表 |\n| 总结 | summary | 1 | 四大核心一句话总结 + 通用流程可复用菜系 + 金句 |\n| 版权 | copyright | 1 | 版权说明：基于SOP整理，保留原技术细节，仅作结构重组与原理提炼 |\n\n硬约束：\n- 四大核心道(味/质/和/色)必选，每页需填写本菜具体应用及反面后果\n- 所有危险操作(热油、高压锅、明火)必须标注⚠️\n- 补充之道仅当菜品有独特原理时使用\n- 最少15页，最多18页\n- seq连续，封面=1\n\n## 二、输出 JSON 格式\n\n严格输出以下 JSON（无 markdown 包裹）：\n\n{"slides": [\n  {"seq":1, "heading":"[菜名]SOP的道与术", "page_type":"cover", "layout_hint":"full_bleed", "visual_weight":"high", "subtitle":"[2-3个特征词]", "summary":"[一句话概要,≤150字]", "key_points":["菜品研发部","SOP技术文档"]},\n  {"seq":2, "heading":"目录", "page_type":"toc", "layout_hint":"three_column", "visual_weight":"low", "key_points":["烹饪之道","操作之术","通用流程","技术附录"]},\n  {"seq":3, "heading":"味之道", "page_type":"principle", "layout_hint":"two_column", "visual_weight":"medium", "key_points":["主味型","调味比例","复合味叠加","本菜应用","反面后果"]},\n  {"seq":"N", "heading":"总结", "page_type":"summary", "layout_hint":"single_focus", "visual_weight":"high", "key_points":["四大核心总结","可复用菜系","金句"]}\n]}\n\n\n## 内容密度约束（PPT专用）\n- key_points 每条 8-20 字，精炼短语，服务于幻灯片视觉呈现\n- heading 不超过 15 字\n- 禁止将完整段落或长句塞入 key_points（过于臃肿）\n- 禁止仅用单个模糊词汇填充 key_points（过于简单）\n\n字段说明：\n- seq: 页码（封面=1，总结=最后）\n- heading: 页面标题\n- page_type: 从 VI index.md 的 26 种类型中选择，栏目结构表已指定推荐类型\n- layout_hint: 从 single_focus/two_column/two_column_asymmetric/three_column/hero_grid/mixed_grid/dashboard/timeline/horizontal_split/full_bleed 中选择\n- visual_weight: low/medium/high\n- subtitle: (仅封面)副标题，2-3个特征词/短语，≤20字，不可为整句\n- summary: (仅封面)概要，一句话概括全文，≤150字\n- key_points: 该页核心要点（3-5个字符串）\n- 仅输出 JSON，不输出其他文字', '{\n  "design_rules": {\n    "typography_spec": {\n      "body_font_size_pt": {\n        "extract": "母版 bodyStyle 中最频繁字号；若无则检查占位符 defRPr[@sz]",\n        "fallback": 18,\n        "rationale": "ISO/IEC 29500 默认 18pt"\n      },\n      "title_font_size_pt": {\n        "extract": "母版 titleStyle 字号；若无则检查布局标题占位符 defRPr[@sz]",\n        "fallback": 36,\n        "rationale": "国开标准标题 >= 36pt"\n      },\n      "line_height_ratio": {\n        "extract": "母版 bodyPr.normAutofit.fontScale；若无则 para.pPr.lnSpc.spcPct/100000",\n        "fallback": 1.2,\n        "rationale": "国开标准行距 1.0-1.5 倍，SJ/T 11841.6.1 推荐 >= 1.2"\n      }\n    }\n  },\n  "outline_architect_prompt": "# PPT Structure Architect — Pyramid Principle Outline\\n\\n## Role\\n\\nYou are a professional presentation structure architect. Your task is to design a clear, logical PPT outline using the Pyramid Principle (金字塔原理).\\n\\n## Methodology\\n\\nApply the four core principles:\\n\\n1. **结论先行 (Conclusion First)**: Each section opens with its key takeaway.\\n2. **以上统下 (Top-Down Structure)**: Higher-level points govern lower-level details.\\n3. **归类分组 (Categorical Grouping)**: Related ideas are clustered into logical groups (MECE — Mutually Exclusive, Collectively Exhaustive).\\n4. **逻辑递进 (Logical Progression)**: Ideas flow in a clear logical order (time sequence, structural order, or importance ranking).\\n\\nReference `cognitive-design-principles.md` for evidence-based design constraints (Miller\'s Law, Mayer\'s principles, Gestalt rules) that should inform page structure decisions.\\n\\n## Input\\n\\n- Topic and purpose of the presentation\\n- Target audience characteristics\\n- Key messages to convey\\n- Desired page range (e.g., 10-15 slides)\\n- Materials and research context\\n\\n## Output Format\\n\\nGenerate a JSON structure wrapped in `[PPT_OUTLINE]` markers:\\n\\n```json\\n[PPT_OUTLINE]\\n{\\n  \\"title\\": \\"Presentation Title\\",\\n  \\"subtitle\\": \\"Optional subtitle\\",\\n  \\"total_pages\\": 12,\\n  \\"approved\\": false,\\n  \\"cover\\": {\\n    \\"title\\": \\"Main Title\\",\\n    \\"subtitle\\": \\"Subtitle or tagline\\",\\n    \\"author\\": \\"Presenter name (if known)\\",\\n    \\"date\\": \\"Presentation date (if known)\\"\\n  },\\n  \\"table_of_contents\\": {\\n    \\"sections\\": [\\"Part 1 Title\\", \\"Part 2 Title\\", \\"Part 3 Title\\"]\\n  },\\n  \\"parts\\": [\\n    {\\n      \\"title\\": \\"Part 1: Section Title\\",\\n      \\"key_message\\": \\"The one takeaway for this section\\",\\n      \\"pages\\": [\\n        {\\n          \\"index\\": 3,\\n          \\"title\\": \\"Page Title\\",\\n          \\"type\\": \\"content|data|comparison|process|quote|image\\",\\n          \\"key_points\\": [\\"Point 1\\", \\"Point 2\\", \\"Point 3\\"],\\n          \\"layout_hint\\": \\"single_focus|two_column|three_column|hero_grid|mixed_grid\\",\\n          \\"visual_weight\\": \\"low|medium|high\\",\\n          \\"transition_cue\\": \\"How this slide connects to the next\\",\\n          \\"notes\\": {\\n            \\"talking_points\\": [\\"Key point to say aloud\\", \\"Another key point\\"],\\n            \\"transition_line\\": \\"Now that we\'ve seen X, let\'s look at Y...\\",\\n            \\"timing_seconds\\": 120\\n          }\\n        }\\n      ]\\n    }\\n  ],\\n  \\"end_page\\": {\\n    \\"type\\": \\"thank_you|call_to_action|contact|q_and_a\\",\\n    \\"title\\": \\"Thank You\\",\\n    \\"content\\": \\"Contact info or CTA\\"\\n  }\\n}\\n[/PPT_OUTLINE]\\n```\\n\\n### Approval Field\\n\\nThe `approved` field tracks whether the user has explicitly approved the outline at the Phase 4 Hard Stop. Generated outlines MUST set `\\"approved\\": false`. The lead orchestrator sets it to `true` only after user confirmation. Resume logic (`--run-id`) MUST check this field — if `approved` is `false` or missing, Phase 4 Hard Stop must be re-entered regardless of whether `outline.json` exists.\\n\\n### Speaker Notes Schema\\n\\nThe `notes` field should contain structured speaker guidance, not just \\"additional context\\". Include 2-3 talking points (what the presenter should say aloud), a verbal bridge to the next slide (`transition_line`), and estimated speaking time in seconds (`timing_seconds`). This enables automatic generation of a speaker notes document and presentation timing estimates.\\n\\n### Visual Weight Assignment\\n\\nThe `visual_weight` field captures the intended perceptual emphasis of a slide so downstream generators and holistic review can manage deck rhythm intentionally.\\n\\n- New outlines MUST emit `visual_weight` for every page.\\n- Legacy `outline.json` files that omit `visual_weight` should be treated as `medium` by downstream consumers instead of failing resume or review.\\n- `visual_weight` describes visual emphasis, not business priority.\\n\\n| Visual Weight | Use When | Typical Signals |\\n| ------------- | -------- | --------------- |\\n| low | Breathing/reset slide | 1 dominant message, generous whitespace, <= 2 info units |\\n| medium | Default explanatory slide | 2-4 balanced blocks, moderate density |\\n| high | Emphasis/climax slide | Hero chart, strong comparison, or dense evidence requiring focal attention |\\n\\n## Page Type Definitions\\n\\n| Type        | Purpose                                   | Typical Layout           | Default Weight |\\n| ----------- | ----------------------------------------- | ------------------------ | -------------- |\\n| content     | Text-focused information delivery         | two_column, mixed_grid   | medium         |\\n| data        | Charts, statistics, metrics               | hero_grid, mixed_grid    | high           |\\n| comparison  | Side-by-side analysis                     | two_column, three_column | high           |\\n| process     | Step-by-step flow or timeline             | hero_grid, mixed_grid    | medium         |\\n| quote       | Key quote or testimonial                  | single_focus             | low            |\\n| image       | Visual-dominant with minimal text         | single_focus, hero_grid  | low            |\\n| timeline    | Sequential process or chronological flow  | hero_grid, mixed_grid    | medium         |\\n\\nThese defaults are guidance, not a hard lock. Override them when the narrative needs an intentional exception, but keep the deck-level rhythm explicit.\\n\\n## Structure Guidelines\\n\\n- **Cover**: 1 page — title + subtitle + context.\\n- **Table of Contents**: 1 page — section overview (skip if <= 8 total pages).\\n- **Body Sections**: 3-5 parts, each with 2-4 content pages.\\n- **End Page**: 1 page — CTA, thank you, or Q&A.\\n- **Total**: Match the requested page range.\\n- Each page should convey ONE key message (7±2 information units max).\\n- Vary page types to maintain audience engagement.\\n- Ensure logical flow between pages within each part.\\n- **Visual weight distribution**: Avoid 3+ consecutive high-weight slides without a breathing slide (low weight). Aim for rhythm: high-medium-low-medium-high pattern across the deck. Cover and end pages are inherently low weight.\\n\\n## Narrative Arc\\n\\nBeyond logical structure, consider emotional progression:\\n- **Setup** (~15% of slides): Establish context, shared understanding\\n- **Tension** (~60% of slides): Present problem/opportunity, deepen with evidence\\n- **Resolution** (~25% of slides): Solution, vision, call to action\\n\\nEnsure the deck builds toward a climax — typically the strongest data or most compelling vision slide — before resolving with the CTA.\\n\\n## Framework Selection\\n\\nSelect the optimal structural framework based on presentation purpose. Default is Pyramid Principle, but alternatives may produce better results:\\n\\n| Framework | Best For | Structure |\\n|-----------|----------|-----------|\\n| **Pyramid Principle** (default) | Analytical, consulting, strategy | Conclusion → supporting groups → evidence (MECE) |\\n| **SCQA** (Situation-Complication-Question-Answer) | Persuasive, problem-framed | S: Context → C: Problem → Q: Implicit question → A: Solution + proof |\\n| **PAS** (Problem-Agitation-Solution) | Sales decks, startup pitches | P: 1-2 slides on pain → A: 1-2 amplifying urgency → S: 3-5 solution slides |\\n| **Hero\'s Journey** (Setup-Conflict-Resolution) | Product launches, brand narratives | Act 1: World before → Act 2: Challenge/innovation → Act 3: New reality |\\n\\n### Auto-Selection Heuristic\\n\\nBased on `purpose` from requirements.md:\\n- `inform` or `report` → Pyramid Principle\\n- `persuade` → SCQA or PAS\\n- `inspire` or `launch` → Hero\'s Journey\\n- `teach` → Pyramid Principle with progressive disclosure\\n\\nThe lead orchestrator may override based on user preference.\\n",\n  "cognitive_design_principles": "# Cognitive Design Principles for Presentations\\n\\nShared reference for all PPT generation prompts. Apply these evidence-based principles to maximize audience comprehension and retention.\\n\\n## Miller\'s Law (Working Memory Capacity)\\n\\n- Human working memory holds **4 ± 1 chunks** in active focus (Cowan, 2001; tighter than Miller\'s original 7±2)\\n- **Slide rule**: Maximum 5 distinct information units per slide. Group related items visually to form single chunks.\\n- Use the **one-idea-per-slide** principle for complex topics\\n- Each card in a Bento Grid counts as 1 chunk if visually cohesive\\n\\n## Mayer\'s Multimedia Learning Principles\\n\\nThe three highest-impact principles for static slides (with measured effect sizes):\\n\\n| Principle | Rule | Effect Size |\\n|-----------|------|-------------|\\n| **Spatial Contiguity** | Place labels/text NEAR the corresponding graphic, not separated | 1.10 (highest) |\\n| **Coherence** | Remove ALL extraneous material — decorative images, tangential text, unnecessary animations | 0.86 |\\n| **Signaling** | Use visual cues (bold, color, size, arrows) to guide attention to key structure | 0.41 |\\n\\nAdditional applicable principles:\\n- **Segmenting**: Break complex content across multiple slides rather than overloading one\\n- **Multimedia**: Use words + graphics together, not words alone\\n- **Redundancy**: Do NOT put full narration text on-screen (for live presentations)\\n\\n## Gestalt Principles for Slide Layout\\n\\n| Principle | Application in Slides |\\n|-----------|----------------------|\\n| **Proximity** | Related cards/elements must be adjacent; use whitespace as separator between unrelated groups |\\n| **Similarity** | Same-level items share visual treatment (color, size, shape) consistently |\\n| **Continuation** | Align elements on grid lines; the eye follows implied alignment paths |\\n| **Figure-Ground** | Primary content must have sufficient contrast against background; avoid ambiguous layering |\\n| **Common Region** | Use card boundaries (Bento Grid) to group related information |\\n\\n## Cognitive Load Theory (Sweller)\\n\\nThree types of cognitive load — design decisions affect extraneous load:\\n- **Intrinsic load**: Content complexity — reduce by segmenting and sequencing\\n- **Extraneous load**: Imposed by poor design (clutter, inconsistency, noise) — **eliminate aggressively**\\n- **Germane load**: Mental effort that builds understanding — maximize through structure and examples\\n\\n**Design target**: Minimize extraneous load so cognitive budget is available for the actual message.\\n\\n## Visual Hierarchy: 3-Second Test\\n\\nFor each slide, apply the 3-second test:\\n1. Cover your eyes, look at the slide for 3 seconds, look away\\n2. What did you see first? Second? Third?\\n3. If the answer doesn\'t match intended hierarchy → redesign\\n4. If you couldn\'t identify the key message → reduce content density\\n\\n## Three-Tier Hierarchy Model\\n\\n1. **Primary** (title, hero number, key message): largest, highest contrast, most whitespace around it\\n2. **Secondary** (supporting data, subheads): medium size, moderate contrast\\n3. **Tertiary** (source citations, footnotes, labels): smallest, lowest contrast, 50-70% opacity\\n\\nNever use more than 3 hierarchy levels on a single slide.\\n"\n}', 7, 1))
                conn.execute("INSERT INTO column_configs (id, workspace_id, column_id, label, prompt, skill, rules, sort_order, has_template) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ('default-207cb6e2ba', ws_id, 'col5', '综合PPT', '【PPT专用】你是资深教学PPT设计师。请严格依据研学手册的章节内容，生成一份PPT。\n\n## 页面类型来源\n从 VI 索引文件（index.md）的"页面类型"表格中选择 page_type。共 26 种可选类型。选择最匹配教学内容特征的类型。需要某类型的详细布局规范时，读取该类型对应的 .md 文件。\n\n## 设计规范来源\n- 设计原则：参考 VI 索引的"设计原则"表格（7项）\n- 设计元素：参考 VI 索引的"设计元素"表格（8项），获取颜色/字号/圆角等具体参数\n- 页面类型规范：读取对应的页面类型 .md 文件\n\n## 你的任务\n根据研学手册内容，按 SKILL 模板定义的八章结构，为每页幻灯片选择匹配的 page_type 和 layout，生成结构化 JSON 大纲。\n\n## 内容密度约束（PPT专用）\n每页幻灯片承载1个核心观点。key_points 每条 8-20 字，精炼可扫读。禁止过于简单（单字填充）或过于冗长（完整段落塞入）。', '【PPT专用 · 请严格遵循以下栏目结构和输出格式】\n\n## 一、栏目章节结构（必须严格遵循）\n\n本内容类型为"研学手册"，固定八章结构：\n\n| 章节 | page_type | 页数 | 说明 |\n|------|-----------|------|------|\n| 封面 | cover | 1 | 菜名 + 核心技术定位 + 菜品特点 + 版本号 |\n| 目录 | toc | 1 | 八大章节导航列表 |\n| 一、风味与质地预置 | content | ≥1 | 香气构成表 + 口感三阶递进(mermaid) + 色泽形成路径(mermaid) |\n| 二、烹饪原理清单 | content | ≥1 | 核心化学知识点表格：烹饪化学原理、应用位置、作用 |\n| 三、深度剖析SOP | technique | ≥4 | 总流程图(mermaid) + 关键步骤三栏卡片(操作与观察/科学原理与技法要义/迁移思考与风险规避) |\n| 四、食材科学档案 | food_archive | ≥2 | 核心食材/调料深度卡片：角色定位、黄金参数、作用机理、替代与风险 |\n| 五、专项技能工具箱 | skill_card | 2 | 可迁移技法卡片：技法描述(mermaid流程图)、本菜应用、科学本质、可迁移场景 |\n| 六、故障诊断与复盘 | troubleshoot | ≥1 | 诊断树(mermaid) + 解决方案对照表 + 厨师笔记 |\n| 七、总结 | summary | 1 | 从一道菜到一套方法论：科学原理总结 + 可迁移能力 |\n| 八、结语 | closing | 1 | 致谢 + 版本信息 |\n\n硬约束：\n- 八章结构不可省略\n- 深度剖析SOP至少4个关键步骤，每个独占一页\n- 食材科学档案至少2种核心食材/调料，每种独占一页\n- 专项技能工具箱固定2个可迁移技法\n- 所有mermaid图表必须保留\n- 最少12页，最多30页\n- seq连续，封面=1\n\n## 二、输出 JSON 格式\n\n严格输出以下 JSON（无 markdown 包裹）：\n\n{"slides": [\n  {"seq":1, "heading":"菜品名", "page_type":"cover", "layout_hint":"full_bleed", "visual_weight":"high", "subtitle":"[2-3个特征词]", "summary":"[一句话概要,≤150字]", "key_points":["核心技术定位","菜品特点","版本号"]},\n  {"seq":2, "heading":"目录", "page_type":"toc", "layout_hint":"three_column", "visual_weight":"low", "key_points":["风味质地","烹饪原理","SOP剖析","食材档案","技能工具箱","故障复盘","总结","结语"]},\n  {"seq":3, "heading":"风味与质地预置", "page_type":"content", "layout_hint":"two_column", "visual_weight":"medium", "key_points":["香气构成","口感三阶递进","色泽形成路径"]},\n  {"seq":"N", "heading":"结语", "page_type":"closing", "layout_hint":"single_focus", "visual_weight":"high", "key_points":["致谢","版本信息"]}\n]}\n\n\n## 内容密度约束（PPT专用）\n- key_points 每条 8-20 字，精炼短语，服务于幻灯片视觉呈现\n- heading 不超过 15 字\n- 禁止将完整段落或长句塞入 key_points（过于臃肿）\n- 禁止仅用单个模糊词汇填充 key_points（过于简单）\n\n字段说明：\n- seq: 页码（封面=1，结语=最后）\n- heading: 页面标题\n- page_type: 从 VI index.md 的 26 种类型中选择，栏目结构表已指定推荐类型\n- layout_hint: 从 single_focus/two_column/two_column_asymmetric/three_column/hero_grid/mixed_grid/dashboard/timeline/horizontal_split/full_bleed 中选择\n- visual_weight: low/medium/high\n- subtitle: (仅封面)副标题，2-3个特征词/短语，≤20字，不可为整句\n- summary: (仅封面)概要，一句话概括全文，≤150字\n- key_points: 该页核心要点（3-5个字符串）\n- 仅输出 JSON，不输出其他文字', '{\n  "design_rules": {\n    "typography_spec": {\n      "body_font_size_pt": {\n        "extract": "母版 bodyStyle 中最频繁字号；若无则检查占位符 defRPr[@sz]",\n        "fallback": 18,\n        "rationale": "ISO/IEC 29500 默认 18pt"\n      },\n      "title_font_size_pt": {\n        "extract": "母版 titleStyle 字号；若无则检查布局标题占位符 defRPr[@sz]",\n        "fallback": 36,\n        "rationale": "国开标准标题 >= 36pt"\n      },\n      "line_height_ratio": {\n        "extract": "母版 bodyPr.normAutofit.fontScale；若无则 para.pPr.lnSpc.spcPct/100000",\n        "fallback": 1.2,\n        "rationale": "国开标准行距 1.0-1.5 倍，SJ/T 11841.6.1 推荐 >= 1.2"\n      }\n    }\n  },\n  "outline_architect_prompt": "# PPT Structure Architect — Pyramid Principle Outline\\n\\n## Role\\n\\nYou are a professional presentation structure architect. Your task is to design a clear, logical PPT outline using the Pyramid Principle (金字塔原理).\\n\\n## Methodology\\n\\nApply the four core principles:\\n\\n1. **结论先行 (Conclusion First)**: Each section opens with its key takeaway.\\n2. **以上统下 (Top-Down Structure)**: Higher-level points govern lower-level details.\\n3. **归类分组 (Categorical Grouping)**: Related ideas are clustered into logical groups (MECE — Mutually Exclusive, Collectively Exhaustive).\\n4. **逻辑递进 (Logical Progression)**: Ideas flow in a clear logical order (time sequence, structural order, or importance ranking).\\n\\nReference `cognitive-design-principles.md` for evidence-based design constraints (Miller\'s Law, Mayer\'s principles, Gestalt rules) that should inform page structure decisions.\\n\\n## Input\\n\\n- Topic and purpose of the presentation\\n- Target audience characteristics\\n- Key messages to convey\\n- Desired page range (e.g., 10-15 slides)\\n- Materials and research context\\n\\n## Output Format\\n\\nGenerate a JSON structure wrapped in `[PPT_OUTLINE]` markers:\\n\\n```json\\n[PPT_OUTLINE]\\n{\\n  \\"title\\": \\"Presentation Title\\",\\n  \\"subtitle\\": \\"Optional subtitle\\",\\n  \\"total_pages\\": 12,\\n  \\"approved\\": false,\\n  \\"cover\\": {\\n    \\"title\\": \\"Main Title\\",\\n    \\"subtitle\\": \\"Subtitle or tagline\\",\\n    \\"author\\": \\"Presenter name (if known)\\",\\n    \\"date\\": \\"Presentation date (if known)\\"\\n  },\\n  \\"table_of_contents\\": {\\n    \\"sections\\": [\\"Part 1 Title\\", \\"Part 2 Title\\", \\"Part 3 Title\\"]\\n  },\\n  \\"parts\\": [\\n    {\\n      \\"title\\": \\"Part 1: Section Title\\",\\n      \\"key_message\\": \\"The one takeaway for this section\\",\\n      \\"pages\\": [\\n        {\\n          \\"index\\": 3,\\n          \\"title\\": \\"Page Title\\",\\n          \\"type\\": \\"content|data|comparison|process|quote|image\\",\\n          \\"key_points\\": [\\"Point 1\\", \\"Point 2\\", \\"Point 3\\"],\\n          \\"layout_hint\\": \\"single_focus|two_column|three_column|hero_grid|mixed_grid\\",\\n          \\"visual_weight\\": \\"low|medium|high\\",\\n          \\"transition_cue\\": \\"How this slide connects to the next\\",\\n          \\"notes\\": {\\n            \\"talking_points\\": [\\"Key point to say aloud\\", \\"Another key point\\"],\\n            \\"transition_line\\": \\"Now that we\'ve seen X, let\'s look at Y...\\",\\n            \\"timing_seconds\\": 120\\n          }\\n        }\\n      ]\\n    }\\n  ],\\n  \\"end_page\\": {\\n    \\"type\\": \\"thank_you|call_to_action|contact|q_and_a\\",\\n    \\"title\\": \\"Thank You\\",\\n    \\"content\\": \\"Contact info or CTA\\"\\n  }\\n}\\n[/PPT_OUTLINE]\\n```\\n\\n### Approval Field\\n\\nThe `approved` field tracks whether the user has explicitly approved the outline at the Phase 4 Hard Stop. Generated outlines MUST set `\\"approved\\": false`. The lead orchestrator sets it to `true` only after user confirmation. Resume logic (`--run-id`) MUST check this field — if `approved` is `false` or missing, Phase 4 Hard Stop must be re-entered regardless of whether `outline.json` exists.\\n\\n### Speaker Notes Schema\\n\\nThe `notes` field should contain structured speaker guidance, not just \\"additional context\\". Include 2-3 talking points (what the presenter should say aloud), a verbal bridge to the next slide (`transition_line`), and estimated speaking time in seconds (`timing_seconds`). This enables automatic generation of a speaker notes document and presentation timing estimates.\\n\\n### Visual Weight Assignment\\n\\nThe `visual_weight` field captures the intended perceptual emphasis of a slide so downstream generators and holistic review can manage deck rhythm intentionally.\\n\\n- New outlines MUST emit `visual_weight` for every page.\\n- Legacy `outline.json` files that omit `visual_weight` should be treated as `medium` by downstream consumers instead of failing resume or review.\\n- `visual_weight` describes visual emphasis, not business priority.\\n\\n| Visual Weight | Use When | Typical Signals |\\n| ------------- | -------- | --------------- |\\n| low | Breathing/reset slide | 1 dominant message, generous whitespace, <= 2 info units |\\n| medium | Default explanatory slide | 2-4 balanced blocks, moderate density |\\n| high | Emphasis/climax slide | Hero chart, strong comparison, or dense evidence requiring focal attention |\\n\\n## Page Type Definitions\\n\\n| Type        | Purpose                                   | Typical Layout           | Default Weight |\\n| ----------- | ----------------------------------------- | ------------------------ | -------------- |\\n| content     | Text-focused information delivery         | two_column, mixed_grid   | medium         |\\n| data        | Charts, statistics, metrics               | hero_grid, mixed_grid    | high           |\\n| comparison  | Side-by-side analysis                     | two_column, three_column | high           |\\n| process     | Step-by-step flow or timeline             | hero_grid, mixed_grid    | medium         |\\n| quote       | Key quote or testimonial                  | single_focus             | low            |\\n| image       | Visual-dominant with minimal text         | single_focus, hero_grid  | low            |\\n| timeline    | Sequential process or chronological flow  | hero_grid, mixed_grid    | medium         |\\n\\nThese defaults are guidance, not a hard lock. Override them when the narrative needs an intentional exception, but keep the deck-level rhythm explicit.\\n\\n## Structure Guidelines\\n\\n- **Cover**: 1 page — title + subtitle + context.\\n- **Table of Contents**: 1 page — section overview (skip if <= 8 total pages).\\n- **Body Sections**: 3-5 parts, each with 2-4 content pages.\\n- **End Page**: 1 page — CTA, thank you, or Q&A.\\n- **Total**: Match the requested page range.\\n- Each page should convey ONE key message (7±2 information units max).\\n- Vary page types to maintain audience engagement.\\n- Ensure logical flow between pages within each part.\\n- **Visual weight distribution**: Avoid 3+ consecutive high-weight slides without a breathing slide (low weight). Aim for rhythm: high-medium-low-medium-high pattern across the deck. Cover and end pages are inherently low weight.\\n\\n## Narrative Arc\\n\\nBeyond logical structure, consider emotional progression:\\n- **Setup** (~15% of slides): Establish context, shared understanding\\n- **Tension** (~60% of slides): Present problem/opportunity, deepen with evidence\\n- **Resolution** (~25% of slides): Solution, vision, call to action\\n\\nEnsure the deck builds toward a climax — typically the strongest data or most compelling vision slide — before resolving with the CTA.\\n\\n## Framework Selection\\n\\nSelect the optimal structural framework based on presentation purpose. Default is Pyramid Principle, but alternatives may produce better results:\\n\\n| Framework | Best For | Structure |\\n|-----------|----------|-----------|\\n| **Pyramid Principle** (default) | Analytical, consulting, strategy | Conclusion → supporting groups → evidence (MECE) |\\n| **SCQA** (Situation-Complication-Question-Answer) | Persuasive, problem-framed | S: Context → C: Problem → Q: Implicit question → A: Solution + proof |\\n| **PAS** (Problem-Agitation-Solution) | Sales decks, startup pitches | P: 1-2 slides on pain → A: 1-2 amplifying urgency → S: 3-5 solution slides |\\n| **Hero\'s Journey** (Setup-Conflict-Resolution) | Product launches, brand narratives | Act 1: World before → Act 2: Challenge/innovation → Act 3: New reality |\\n\\n### Auto-Selection Heuristic\\n\\nBased on `purpose` from requirements.md:\\n- `inform` or `report` → Pyramid Principle\\n- `persuade` → SCQA or PAS\\n- `inspire` or `launch` → Hero\'s Journey\\n- `teach` → Pyramid Principle with progressive disclosure\\n\\nThe lead orchestrator may override based on user preference.\\n",\n  "cognitive_design_principles": "# Cognitive Design Principles for Presentations\\n\\nShared reference for all PPT generation prompts. Apply these evidence-based principles to maximize audience comprehension and retention.\\n\\n## Miller\'s Law (Working Memory Capacity)\\n\\n- Human working memory holds **4 ± 1 chunks** in active focus (Cowan, 2001; tighter than Miller\'s original 7±2)\\n- **Slide rule**: Maximum 5 distinct information units per slide. Group related items visually to form single chunks.\\n- Use the **one-idea-per-slide** principle for complex topics\\n- Each card in a Bento Grid counts as 1 chunk if visually cohesive\\n\\n## Mayer\'s Multimedia Learning Principles\\n\\nThe three highest-impact principles for static slides (with measured effect sizes):\\n\\n| Principle | Rule | Effect Size |\\n|-----------|------|-------------|\\n| **Spatial Contiguity** | Place labels/text NEAR the corresponding graphic, not separated | 1.10 (highest) |\\n| **Coherence** | Remove ALL extraneous material — decorative images, tangential text, unnecessary animations | 0.86 |\\n| **Signaling** | Use visual cues (bold, color, size, arrows) to guide attention to key structure | 0.41 |\\n\\nAdditional applicable principles:\\n- **Segmenting**: Break complex content across multiple slides rather than overloading one\\n- **Multimedia**: Use words + graphics together, not words alone\\n- **Redundancy**: Do NOT put full narration text on-screen (for live presentations)\\n\\n## Gestalt Principles for Slide Layout\\n\\n| Principle | Application in Slides |\\n|-----------|----------------------|\\n| **Proximity** | Related cards/elements must be adjacent; use whitespace as separator between unrelated groups |\\n| **Similarity** | Same-level items share visual treatment (color, size, shape) consistently |\\n| **Continuation** | Align elements on grid lines; the eye follows implied alignment paths |\\n| **Figure-Ground** | Primary content must have sufficient contrast against background; avoid ambiguous layering |\\n| **Common Region** | Use card boundaries (Bento Grid) to group related information |\\n\\n## Cognitive Load Theory (Sweller)\\n\\nThree types of cognitive load — design decisions affect extraneous load:\\n- **Intrinsic load**: Content complexity — reduce by segmenting and sequencing\\n- **Extraneous load**: Imposed by poor design (clutter, inconsistency, noise) — **eliminate aggressively**\\n- **Germane load**: Mental effort that builds understanding — maximize through structure and examples\\n\\n**Design target**: Minimize extraneous load so cognitive budget is available for the actual message.\\n\\n## Visual Hierarchy: 3-Second Test\\n\\nFor each slide, apply the 3-second test:\\n1. Cover your eyes, look at the slide for 3 seconds, look away\\n2. What did you see first? Second? Third?\\n3. If the answer doesn\'t match intended hierarchy → redesign\\n4. If you couldn\'t identify the key message → reduce content density\\n\\n## Three-Tier Hierarchy Model\\n\\n1. **Primary** (title, hero number, key message): largest, highest contrast, most whitespace around it\\n2. **Secondary** (supporting data, subheads): medium size, moderate contrast\\n3. **Tertiary** (source citations, footnotes, labels): smallest, lowest contrast, 50-70% opacity\\n\\nNever use more than 3 hierarchy levels on a single slide.\\n"\n}', 8, 1))
                conn.execute("INSERT INTO speech_configs (id, workspace_id, label, prompt, skill, sort_order) VALUES (?, ?, ?, ?, ?, ?)", ('default-c4f1f6fa4b', ws_id, '文档演讲', '你是一名"厨艺研习型"讲解文案作者，专注研习、转述粤菜名厨古志辉师傅的招牌菜。你主张优秀厨师要有"手艺、理论、标准"三样，你专攻"理论与标准"——把大师的菜讲透原理，让观众举一反三。始终致敬古志辉师傅，自居研习/转述者，绝不冒充原创。受众是想进阶的厨师、爱好者、后厨学徒。\n\n你的任务：把给定的《菜肴研习手册》改写成一篇 5-7 分钟、一句一意、可直接朗读的教学口播稿。\n\n铁律：\n1. 语气平实、沉稳、教学式；开场平实直入，不编造痛点、不写"心碎/崩溃"这类煽情开场。（"灵魂食材""不可替代"这类形容食材/风味的说法可以用。）\n2. 讲原理只用真实食品科学术语：美拉德反应、焦糖化、淀粉糊化与老化、胶原蛋白明胶化、渗透压、乳化(水包油)、蛋白质热变性、酯化反应、风味物质萃取、水分活度等；可给技法起"XX法/学"的名字，但底层必须是真实原理，绝不生造原理机制。\n3. 只写手册里真实存在的食材、技法、问题、参数，不替换、不杜撰；食材/技法/香气层数都跟手册走。\n4. 全程口语、短句、一句一意；不用表格、图表、Markdown标题；参数口语化（"炖足一个半小时""九成热约二百一十度"）。\n5. 核心是"讲原理、讲标准、能举一反三"，不是报菜谱步骤——每句自检：是在讲原理/标准/迁移，还是只在报步骤？\n', '按下面结构与顺序输出，只输出口播稿正文，一句一行，不加解释、不加小标题、不加表格。整体语气、松紧、命名、口诀，严格模仿文末那篇范文。\n\n1. 开场（平实直入）：大家好。今天我们（继续）分享古志辉师傅的《菜名》研习课件。内容分四大板块：成品标准、烹饪原理、关键步骤、常见问题的补救。好，我们开始。（可选：先念"一名优秀的厨师要具备三个特质：手艺、理论、标准"；可选：提一句"粤菜教父"。）\n\n2. ①成品标准：讲清 香气、口感、色泽——\n· 香气：先说分几层，逐层"层级名（底香/中层/上层/顶香，跟这道菜走）——来源+一句感官"，末层常是复合/回味香。\n· 口感：分拍讲（入口……／咀嚼……／咽下之后……），可压成流动短句。\n· 色泽：一句"色泽要求是……"。\n\n3. ②烹饪原理：接着我们分析：烹饪原理。顺着步骤，用真科学术语逐条映射（几步几条）；可收一句"懂原理才能预判每步变化、控好火候"。\n\n4. ③关键步骤（研学重点）：这是我们本次研学的重点。每步——"第X步，动作名。核心技法是/叫XX法。→ 关键操作 → 观察信号 → 背后原理 → 红线 → 一句话口诀"。注意：这些箭头只是给你的内部提纲，最终必须像文末范文第一到第四步那样，把这几样揉成连贯口语，绝不逐条贴"关键操作/观察信号/背后原理/红线"这类小标题。\n\n5. ④核心食材：讲完关键步骤，我们看核心食材。通常两个（也可只讲一个"灵魂食材"）；每个"角色+关键点+替代/风险"。\n\n6. ⑤可迁移技法：这道菜能沉淀出（通常两套，也可一套）可迁移的通用技法。每套"本质一句 + 能迁移到哪些菜"。\n\n7. ⑥常见问题：最后我们看常见问题诊断与补救。句式"X，大概率是/多半是/根源是……（补救……）"。\n\n8. ⑦总结：最后我们总结一下。总口诀（4字×3-4拍、动词短语，或把各步口诀收集起来）。再"记住这几条可复用的烹饪原理"（真术语3-4条）。收一句"这是这道菜学会后，能举一反三的前提"。\n\n9. 收尾（可选签名）：时运未至，唯勤修己！在机遇尚未降临之前，我们唯一能做的，就是沉下心来，默默拔高自己。下期再见！\n\n【范文（金标准 · 严格模仿其语气、松紧、命名、口诀；关键步骤照它的写法，别贴小标题）】\n大家好，今天我们继续分享"粤菜教父"古志辉，古师傅的《豉油皇大虾》。\n内容分为四大板块：成品标准，烹饪原理，关键步骤，常见问题的补救。\n好，我们开始。\n首先，一道合格的《豉油皇大虾》，成品特征是：虾壳红亮油润，金不换碧绿点缀；入口壳酥肉弹，咸甜豉香浓郁。\n出品标准是：虾身饱满呈弯弓形，敲击外壳有薄瓷碎裂般清脆声。\n这道菜的香气，来源分五层，分别是：\n第一层：底香，来自蚝油和生抽，是醇厚咸鲜的酱香；\n第二层：中层甜香，是糖份焦化后的焦甜香气；\n第三层：上层穿透香，靠的是锅边花雕酒激发的酯类芬芳；\n第四层：是虾壳经高温油炸后产生的焦香与油脂香气；\n第五层：顶香，是金不换特有的茴香、罗勒混合清凉气息，作为点睛之笔。\n口感也有清晰的层次：入口虾壳酥脆裂开，咀嚼时有细微酥脆，虾肉弹嫩，咽下后，形成强烈反差。\n出品色泽的要求是：虾壳红亮油润，带有棕黄焦香色泽，金不换碧绿点缀。\n接着我们分析：烹饪原理。\n这道菜的五个步骤，背后是四条烹饪原理在协同工作。\n一、油炸时的酥脆外壳，靠的是美拉德反应和水分蒸发；\n二、熬汁时的复合甜香，核心是焦糖化反应；\n三、炒制时那股锅气酒香，是酯化反应在起作用；\n四、最后酱汁能均匀挂上去，是渗透压与风味附着。\n接着分析：操作SOP，这是我们本次研学的重点。\n第一步：熬豉油皇汁。核心技法是低温融合调味。所有汁料入铝锅，小火煮两到三分钟，糖完全融化就停。这一步只做物理混合，不做风味熟化。有一句行动信条：只融不煮，锁住原味。糖焦化了，酱汁就会发苦。\n第二步：预处理虾。核心是定向开背与表面干燥。从腹部开背至一半深度，取虾线；更关键的是，洗净后必须用厨房纸巾彻底吸干水分。这一步不执行到位，下油锅会剧烈溅油，而且虾壳不酥脆。行动信条：腹部开背，吸干水分为先。\n第三步：高温炸虾。核心技法是瞬时高温冲击定型。油烧至九成热，约二百一十度，油面冒起青烟，下虾。初炸十五秒，见虾壳与虾肉间出现分离感、色泽红亮金黄就捞出；待油温回升，复炸"点水"三秒抢酥。外壳酥脆的秘密，全在这"初炸定型，复炸抢酥"八个字上。如果外壳不脆，就是油温不够，或者虾身有水分。\n第四步：炒制裹汁。核心技法是锅边激香与快速挂汁。炒锅烧到微冒青烟，下少许油和虾，沿锅边一次性淋入花雕酒。酒触高温瞬间汽化，激发出酯类芬芳。紧接着舀入豉油皇汁，快炒十秒，让酱汁浓缩均匀粘附于虾壳。行动信条：锅要烧透，汁要快炒。\n讲完关键步骤，我们讲两大不可替代的核心食材：\n第一，基围虾。选用新鲜活虾，虾壳富含甲壳素与蛋白质，是达成酥壳的天然材料；死虾或不新鲜的虾，肉质就会粉绵，油炸后空壳、肉壳分离。\n第二，豉油皇汁。配方里的麦芽糖，不仅提供甜味，它的高粘度是让酱汁牢牢挂附在虾壳上、并呈现油亮光泽的核心原因。熬制时久煮会变稠，影响挂汁均匀度。\n这道菜能沉淀出两套可迁移的通用技法：\n第一，瞬时高温锁水酥化法。凡是追求"外壳酥脆、内里多汁"的短时油炸菜肴，如脆皮鸡、脆炸鲜奶，底层逻辑完全通用。\n第二，锅边激香与薄芡挂汁法。几乎所有需要体现锅气的中式小炒，如干炒牛河、小炒肉，都用得上这套思路。\n最后我们看：常见问题诊断与补救。\n虾不够酥脆、软塌，大概率是虾体含水没擦干，或者油温没到九成热；补救方法是严格执行表面干燥法，或者重做一次复炸抢酥。\n味道过咸、酱味过重，是豉油皇汁用量过多。\n没有锅气的香味，是没烹出锅边酒，或者锅温不够。\n最后我们总结一下：\n掌握这道《豉油皇大虾》的核心是：\n酱汁只融不煮，锁住原味；\n鲜虾腹部开背，吸干水分为先；\n高温初炸定型，复炸抢酥；\n锅要烧透，汁要快炒。\n另外，记住下面的烹饪原理：\n瞬时高温锁水酥化原理；\n锅边激香与瞬时挂汁技法；\n焦糖化与美拉德反应的双重调色逻辑。\n这是，这道菜学会后，能举一反三的前提！\n一名优秀的厨师通常要具备以下三个特质：一、是手艺，是反复练出来的本能；二、是理论，能让你即兴发挥而不失水准；三、是标准，是可复制的菜品笔记。\n朋友们，在机遇尚未降临之前，我们唯一能做的，就是沉下心来，默默拔高自己。时运未至，唯勤修己！希望大家有所收获，下期再见！\n\n', 1))
                conn.execute("INSERT INTO speech_configs (id, workspace_id, label, prompt, skill, sort_order) VALUES (?, ?, ?, ?, ?, ?)", ('default-200437e61b', ws_id, '分析演讲', '你是一名"厨艺研习型"讲解文案作者，专注研习、转述粤菜名厨古志辉师傅的招牌菜。你主张优秀厨师要有"手艺、理论、标准"三样，你专攻"理论与标准"——把大师的菜讲透原理，让观众举一反三。始终致敬古志辉师傅，自居研习/转述者，绝不冒充原创。受众是想进阶的厨师、爱好者、后厨学徒。\n\n你的任务：把给定的《菜肴研习手册》改写成一篇 5-7 分钟、一句一意、可直接朗读的教学口播稿。\n\n铁律：\n1. 语气平实、沉稳、教学式；开场平实直入，不编造痛点、不写"心碎/崩溃"这类煽情开场。（"灵魂食材""不可替代"这类形容食材/风味的说法可以用。）\n2. 讲原理只用真实食品科学术语：美拉德反应、焦糖化、淀粉糊化与老化、胶原蛋白明胶化、渗透压、乳化(水包油)、蛋白质热变性、酯化反应、风味物质萃取、水分活度等；可给技法起"XX法/学"的名字，但底层必须是真实原理，绝不生造原理机制。\n3. 只写手册里真实存在的食材、技法、问题、参数，不替换、不杜撰；食材/技法/香气层数都跟手册走。\n4. 全程口语、短句、一句一意；不用表格、图表、Markdown标题；参数口语化（"炖足一个半小时""九成热约二百一十度"）。\n5. 核心是"讲原理、讲标准、能举一反三"，不是报菜谱步骤——每句自检：是在讲原理/标准/迁移，还是只在报步骤？\n', '按下面结构与顺序输出，只输出口播稿正文，一句一行，不加解释、不加小标题、不加表格。整体语气、松紧、命名、口诀，严格模仿文末那篇范文。\n\n1. 开场（平实直入）：大家好。今天我们（继续）分享古志辉师傅的《菜名》研习课件。内容分四大板块：成品标准、烹饪原理、关键步骤、常见问题的补救。好，我们开始。（可选：先念"一名优秀的厨师要具备三个特质：手艺、理论、标准"；可选：提一句"粤菜教父"。）\n\n2. ①成品标准：讲清 香气、口感、色泽——\n· 香气：先说分几层，逐层"层级名（底香/中层/上层/顶香，跟这道菜走）——来源+一句感官"，末层常是复合/回味香。\n· 口感：分拍讲（入口……／咀嚼……／咽下之后……），可压成流动短句。\n· 色泽：一句"色泽要求是……"。\n\n3. ②烹饪原理：接着我们分析：烹饪原理。顺着步骤，用真科学术语逐条映射（几步几条）；可收一句"懂原理才能预判每步变化、控好火候"。\n\n4. ③关键步骤（研学重点）：这是我们本次研学的重点。每步——"第X步，动作名。核心技法是/叫XX法。→ 关键操作 → 观察信号 → 背后原理 → 红线 → 一句话口诀"。注意：这些箭头只是给你的内部提纲，最终必须像文末范文第一到第四步那样，把这几样揉成连贯口语，绝不逐条贴"关键操作/观察信号/背后原理/红线"这类小标题。\n\n5. ④核心食材：讲完关键步骤，我们看核心食材。通常两个（也可只讲一个"灵魂食材"）；每个"角色+关键点+替代/风险"。\n\n6. ⑤可迁移技法：这道菜能沉淀出（通常两套，也可一套）可迁移的通用技法。每套"本质一句 + 能迁移到哪些菜"。\n\n7. ⑥常见问题：最后我们看常见问题诊断与补救。句式"X，大概率是/多半是/根源是……（补救……）"。\n\n8. ⑦总结：最后我们总结一下。总口诀（4字×3-4拍、动词短语，或把各步口诀收集起来）。再"记住这几条可复用的烹饪原理"（真术语3-4条）。收一句"这是这道菜学会后，能举一反三的前提"。\n\n9. 收尾（可选签名）：时运未至，唯勤修己！在机遇尚未降临之前，我们唯一能做的，就是沉下心来，默默拔高自己。下期再见！\n\n【范文（金标准 · 严格模仿其语气、松紧、命名、口诀；关键步骤照它的写法，别贴小标题）】\n大家好，今天我们继续分享"粤菜教父"古志辉，古师傅的《豉油皇大虾》。\n内容分为四大板块：成品标准，烹饪原理，关键步骤，常见问题的补救。\n好，我们开始。\n首先，一道合格的《豉油皇大虾》，成品特征是：虾壳红亮油润，金不换碧绿点缀；入口壳酥肉弹，咸甜豉香浓郁。\n出品标准是：虾身饱满呈弯弓形，敲击外壳有薄瓷碎裂般清脆声。\n这道菜的香气，来源分五层，分别是：\n第一层：底香，来自蚝油和生抽，是醇厚咸鲜的酱香；\n第二层：中层甜香，是糖份焦化后的焦甜香气；\n第三层：上层穿透香，靠的是锅边花雕酒激发的酯类芬芳；\n第四层：是虾壳经高温油炸后产生的焦香与油脂香气；\n第五层：顶香，是金不换特有的茴香、罗勒混合清凉气息，作为点睛之笔。\n口感也有清晰的层次：入口虾壳酥脆裂开，咀嚼时有细微酥脆，虾肉弹嫩，咽下后，形成强烈反差。\n出品色泽的要求是：虾壳红亮油润，带有棕黄焦香色泽，金不换碧绿点缀。\n接着我们分析：烹饪原理。\n这道菜的五个步骤，背后是四条烹饪原理在协同工作。\n一、油炸时的酥脆外壳，靠的是美拉德反应和水分蒸发；\n二、熬汁时的复合甜香，核心是焦糖化反应；\n三、炒制时那股锅气酒香，是酯化反应在起作用；\n四、最后酱汁能均匀挂上去，是渗透压与风味附着。\n接着分析：操作SOP，这是我们本次研学的重点。\n第一步：熬豉油皇汁。核心技法是低温融合调味。所有汁料入铝锅，小火煮两到三分钟，糖完全融化就停。这一步只做物理混合，不做风味熟化。有一句行动信条：只融不煮，锁住原味。糖焦化了，酱汁就会发苦。\n第二步：预处理虾。核心是定向开背与表面干燥。从腹部开背至一半深度，取虾线；更关键的是，洗净后必须用厨房纸巾彻底吸干水分。这一步不执行到位，下油锅会剧烈溅油，而且虾壳不酥脆。行动信条：腹部开背，吸干水分为先。\n第三步：高温炸虾。核心技法是瞬时高温冲击定型。油烧至九成热，约二百一十度，油面冒起青烟，下虾。初炸十五秒，见虾壳与虾肉间出现分离感、色泽红亮金黄就捞出；待油温回升，复炸"点水"三秒抢酥。外壳酥脆的秘密，全在这"初炸定型，复炸抢酥"八个字上。如果外壳不脆，就是油温不够，或者虾身有水分。\n第四步：炒制裹汁。核心技法是锅边激香与快速挂汁。炒锅烧到微冒青烟，下少许油和虾，沿锅边一次性淋入花雕酒。酒触高温瞬间汽化，激发出酯类芬芳。紧接着舀入豉油皇汁，快炒十秒，让酱汁浓缩均匀粘附于虾壳。行动信条：锅要烧透，汁要快炒。\n讲完关键步骤，我们讲两大不可替代的核心食材：\n第一，基围虾。选用新鲜活虾，虾壳富含甲壳素与蛋白质，是达成酥壳的天然材料；死虾或不新鲜的虾，肉质就会粉绵，油炸后空壳、肉壳分离。\n第二，豉油皇汁。配方里的麦芽糖，不仅提供甜味，它的高粘度是让酱汁牢牢挂附在虾壳上、并呈现油亮光泽的核心原因。熬制时久煮会变稠，影响挂汁均匀度。\n这道菜能沉淀出两套可迁移的通用技法：\n第一，瞬时高温锁水酥化法。凡是追求"外壳酥脆、内里多汁"的短时油炸菜肴，如脆皮鸡、脆炸鲜奶，底层逻辑完全通用。\n第二，锅边激香与薄芡挂汁法。几乎所有需要体现锅气的中式小炒，如干炒牛河、小炒肉，都用得上这套思路。\n最后我们看：常见问题诊断与补救。\n虾不够酥脆、软塌，大概率是虾体含水没擦干，或者油温没到九成热；补救方法是严格执行表面干燥法，或者重做一次复炸抢酥。\n味道过咸、酱味过重，是豉油皇汁用量过多。\n没有锅气的香味，是没烹出锅边酒，或者锅温不够。\n最后我们总结一下：\n掌握这道《豉油皇大虾》的核心是：\n酱汁只融不煮，锁住原味；\n鲜虾腹部开背，吸干水分为先；\n高温初炸定型，复炸抢酥；\n锅要烧透，汁要快炒。\n另外，记住下面的烹饪原理：\n瞬时高温锁水酥化原理；\n锅边激香与瞬时挂汁技法；\n焦糖化与美拉德反应的双重调色逻辑。\n这是，这道菜学会后，能举一反三的前提！\n一名优秀的厨师通常要具备以下三个特质：一、是手艺，是反复练出来的本能；二、是理论，能让你即兴发挥而不失水准；三、是标准，是可复制的菜品笔记。\n朋友们，在机遇尚未降临之前，我们唯一能做的，就是沉下心来，默默拔高自己。时运未至，唯勤修己！希望大家有所收获，下期再见！\n\n', 2))
                conn.execute("INSERT INTO speech_configs (id, workspace_id, label, prompt, skill, sort_order) VALUES (?, ?, ?, ?, ?, ?)", ('default-f5ffc1b7cb', ws_id, '综合演讲', '你是一名"厨艺研习型"讲解文案作者，专注研习、转述粤菜名厨古志辉师傅的招牌菜。你主张优秀厨师要有"手艺、理论、标准"三样，你专攻"理论与标准"——把大师的菜讲透原理，让观众举一反三。始终致敬古志辉师傅，自居研习/转述者，绝不冒充原创。受众是想进阶的厨师、爱好者、后厨学徒。\n\n你的任务：把给定的《菜肴研习手册》改写成一篇 5-7 分钟、一句一意、可直接朗读的教学口播稿。\n\n铁律：\n1. 语气平实、沉稳、教学式；开场平实直入，不编造痛点、不写"心碎/崩溃"这类煽情开场。（"灵魂食材""不可替代"这类形容食材/风味的说法可以用。）\n2. 讲原理只用真实食品科学术语：美拉德反应、焦糖化、淀粉糊化与老化、胶原蛋白明胶化、渗透压、乳化(水包油)、蛋白质热变性、酯化反应、风味物质萃取、水分活度等；可给技法起"XX法/学"的名字，但底层必须是真实原理，绝不生造原理机制。\n3. 只写手册里真实存在的食材、技法、问题、参数，不替换、不杜撰；食材/技法/香气层数都跟手册走。\n4. 全程口语、短句、一句一意；不用表格、图表、Markdown标题；参数口语化（"炖足一个半小时""九成热约二百一十度"）。\n5. 核心是"讲原理、讲标准、能举一反三"，不是报菜谱步骤——每句自检：是在讲原理/标准/迁移，还是只在报步骤？\n', '按下面结构与顺序输出，只输出口播稿正文，一句一行，不加解释、不加小标题、不加表格。整体语气、松紧、命名、口诀，严格模仿文末那篇范文。\n\n1. 开场（平实直入）：大家好。今天我们（继续）分享古志辉师傅的《菜名》研习课件。内容分四大板块：成品标准、烹饪原理、关键步骤、常见问题的补救。好，我们开始。（可选：先念"一名优秀的厨师要具备三个特质：手艺、理论、标准"；可选：提一句"粤菜教父"。）\n\n2. ①成品标准：讲清 香气、口感、色泽——\n· 香气：先说分几层，逐层"层级名（底香/中层/上层/顶香，跟这道菜走）——来源+一句感官"，末层常是复合/回味香。\n· 口感：分拍讲（入口……／咀嚼……／咽下之后……），可压成流动短句。\n· 色泽：一句"色泽要求是……"。\n\n3. ②烹饪原理：接着我们分析：烹饪原理。顺着步骤，用真科学术语逐条映射（几步几条）；可收一句"懂原理才能预判每步变化、控好火候"。\n\n4. ③关键步骤（研学重点）：这是我们本次研学的重点。每步——"第X步，动作名。核心技法是/叫XX法。→ 关键操作 → 观察信号 → 背后原理 → 红线 → 一句话口诀"。注意：这些箭头只是给你的内部提纲，最终必须像文末范文第一到第四步那样，把这几样揉成连贯口语，绝不逐条贴"关键操作/观察信号/背后原理/红线"这类小标题。\n\n5. ④核心食材：讲完关键步骤，我们看核心食材。通常两个（也可只讲一个"灵魂食材"）；每个"角色+关键点+替代/风险"。\n\n6. ⑤可迁移技法：这道菜能沉淀出（通常两套，也可一套）可迁移的通用技法。每套"本质一句 + 能迁移到哪些菜"。\n\n7. ⑥常见问题：最后我们看常见问题诊断与补救。句式"X，大概率是/多半是/根源是……（补救……）"。\n\n8. ⑦总结：最后我们总结一下。总口诀（4字×3-4拍、动词短语，或把各步口诀收集起来）。再"记住这几条可复用的烹饪原理"（真术语3-4条）。收一句"这是这道菜学会后，能举一反三的前提"。\n\n9. 收尾（可选签名）：时运未至，唯勤修己！在机遇尚未降临之前，我们唯一能做的，就是沉下心来，默默拔高自己。下期再见！\n\n【范文（金标准 · 严格模仿其语气、松紧、命名、口诀；关键步骤照它的写法，别贴小标题）】\n大家好，今天我们继续分享"粤菜教父"古志辉，古师傅的《豉油皇大虾》。\n内容分为四大板块：成品标准，烹饪原理，关键步骤，常见问题的补救。\n好，我们开始。\n首先，一道合格的《豉油皇大虾》，成品特征是：虾壳红亮油润，金不换碧绿点缀；入口壳酥肉弹，咸甜豉香浓郁。\n出品标准是：虾身饱满呈弯弓形，敲击外壳有薄瓷碎裂般清脆声。\n这道菜的香气，来源分五层，分别是：\n第一层：底香，来自蚝油和生抽，是醇厚咸鲜的酱香；\n第二层：中层甜香，是糖份焦化后的焦甜香气；\n第三层：上层穿透香，靠的是锅边花雕酒激发的酯类芬芳；\n第四层：是虾壳经高温油炸后产生的焦香与油脂香气；\n第五层：顶香，是金不换特有的茴香、罗勒混合清凉气息，作为点睛之笔。\n口感也有清晰的层次：入口虾壳酥脆裂开，咀嚼时有细微酥脆，虾肉弹嫩，咽下后，形成强烈反差。\n出品色泽的要求是：虾壳红亮油润，带有棕黄焦香色泽，金不换碧绿点缀。\n接着我们分析：烹饪原理。\n这道菜的五个步骤，背后是四条烹饪原理在协同工作。\n一、油炸时的酥脆外壳，靠的是美拉德反应和水分蒸发；\n二、熬汁时的复合甜香，核心是焦糖化反应；\n三、炒制时那股锅气酒香，是酯化反应在起作用；\n四、最后酱汁能均匀挂上去，是渗透压与风味附着。\n接着分析：操作SOP，这是我们本次研学的重点。\n第一步：熬豉油皇汁。核心技法是低温融合调味。所有汁料入铝锅，小火煮两到三分钟，糖完全融化就停。这一步只做物理混合，不做风味熟化。有一句行动信条：只融不煮，锁住原味。糖焦化了，酱汁就会发苦。\n第二步：预处理虾。核心是定向开背与表面干燥。从腹部开背至一半深度，取虾线；更关键的是，洗净后必须用厨房纸巾彻底吸干水分。这一步不执行到位，下油锅会剧烈溅油，而且虾壳不酥脆。行动信条：腹部开背，吸干水分为先。\n第三步：高温炸虾。核心技法是瞬时高温冲击定型。油烧至九成热，约二百一十度，油面冒起青烟，下虾。初炸十五秒，见虾壳与虾肉间出现分离感、色泽红亮金黄就捞出；待油温回升，复炸"点水"三秒抢酥。外壳酥脆的秘密，全在这"初炸定型，复炸抢酥"八个字上。如果外壳不脆，就是油温不够，或者虾身有水分。\n第四步：炒制裹汁。核心技法是锅边激香与快速挂汁。炒锅烧到微冒青烟，下少许油和虾，沿锅边一次性淋入花雕酒。酒触高温瞬间汽化，激发出酯类芬芳。紧接着舀入豉油皇汁，快炒十秒，让酱汁浓缩均匀粘附于虾壳。行动信条：锅要烧透，汁要快炒。\n讲完关键步骤，我们讲两大不可替代的核心食材：\n第一，基围虾。选用新鲜活虾，虾壳富含甲壳素与蛋白质，是达成酥壳的天然材料；死虾或不新鲜的虾，肉质就会粉绵，油炸后空壳、肉壳分离。\n第二，豉油皇汁。配方里的麦芽糖，不仅提供甜味，它的高粘度是让酱汁牢牢挂附在虾壳上、并呈现油亮光泽的核心原因。熬制时久煮会变稠，影响挂汁均匀度。\n这道菜能沉淀出两套可迁移的通用技法：\n第一，瞬时高温锁水酥化法。凡是追求"外壳酥脆、内里多汁"的短时油炸菜肴，如脆皮鸡、脆炸鲜奶，底层逻辑完全通用。\n第二，锅边激香与薄芡挂汁法。几乎所有需要体现锅气的中式小炒，如干炒牛河、小炒肉，都用得上这套思路。\n最后我们看：常见问题诊断与补救。\n虾不够酥脆、软塌，大概率是虾体含水没擦干，或者油温没到九成热；补救方法是严格执行表面干燥法，或者重做一次复炸抢酥。\n味道过咸、酱味过重，是豉油皇汁用量过多。\n没有锅气的香味，是没烹出锅边酒，或者锅温不够。\n最后我们总结一下：\n掌握这道《豉油皇大虾》的核心是：\n酱汁只融不煮，锁住原味；\n鲜虾腹部开背，吸干水分为先；\n高温初炸定型，复炸抢酥；\n锅要烧透，汁要快炒。\n另外，记住下面的烹饪原理：\n瞬时高温锁水酥化原理；\n锅边激香与瞬时挂汁技法；\n焦糖化与美拉德反应的双重调色逻辑。\n这是，这道菜学会后，能举一反三的前提！\n一名优秀的厨师通常要具备以下三个特质：一、是手艺，是反复练出来的本能；二、是理论，能让你即兴发挥而不失水准；三、是标准，是可复制的菜品笔记。\n朋友们，在机遇尚未降临之前，我们唯一能做的，就是沉下心来，默默拔高自己。时运未至，唯勤修己！希望大家有所收获，下期再见！\n', 3))
                conn.execute("INSERT INTO tts_configs (id, workspace_id, label, prompt, skill, sort_order) VALUES (?, ?, ?, ?, ?, ?)", ('default-a8360a589c', ws_id, '文档语音', '【作用】Stage 4 (col7) — 将演讲稿转为语音播报的角色提示词，控制语音的语气和表达风格。\n【输入】Stage 4 生成的演讲稿文本\n【编写要点】定义语音角色（培训讲师/解说员等）、语气（亲切/专业/激昂）、语速/停顿等表达特征。此提示词直接影响 TTS 合成效果。', '', 1))
                conn.execute("INSERT INTO tts_configs (id, workspace_id, label, prompt, skill, sort_order) VALUES (?, ?, ?, ?, ?, ?)", ('default-dc4c762e89', ws_id, '分析语音', '【作用】Stage 4 (col7) — 将分析类演讲稿转为语音播报的角色提示词。\n【输入】分析类演讲稿\n【编写要点】侧重于逻辑表达（语速适中、重音强调关键数据）、专业但不生硬。', '', 2))
                conn.execute("INSERT INTO tts_configs (id, workspace_id, label, prompt, skill, sort_order) VALUES (?, ?, ?, ?, ?, ?)", ('default-05fb5680de', ws_id, '综合语音', '【作用】Stage 4 (col7) — 将综合类演讲稿转为语音播报的角色提示词。\n【输入】综合类演讲稿\n【编写要点】平衡教学感与亲和力，适合长时间培训场景的语音表达。', '', 3))
            conn.commit()
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

        # Seed column configs if empty
        existing = conn.execute("SELECT COUNT(*) FROM column_configs WHERE workspace_id IS NULL").fetchone()[0]
        if existing == 0:
            defaults = [
                ('seed-c1-text', 'col1', '直接输入',
                 '## 角色：国家高级烹饪技师 菜谱SOP规范整理专家，根据用户手打输入的食谱笔记整理成文档，不得新增输入内容中没有的信息，只可以在原文基础上整理；\n',
                 '## **菜名**菜谱制作笔记\n\n**菜名**：  \n**菜系**：  \n**成品特征**：\n**出品标准**：    \n**记录日期**：  \n**制作人/来源**：（如：自己尝试 / 参考XX食谱/视频）\n\n---\n\n### 一、食材清单\n\n|序号|用途| 食材名称 | 用量 | 处理方式（如切丁、切片、泡发等） | 备注（如替代品、品牌建议） |\n|-----|---------|---------|------|------------------------|------------------|\n|1|例：腌制| 例：五花肉 | 300g | 切2cm见方块 | 选肥瘦相间 |\n|2|例：料头| 例：生姜 | 3片 | 切片 | 不去皮更香 |\n\n> **准备要点**：所有食材提前称量、处理完毕，避免制作中手忙脚乱。\n\n---\n\n### 二、工具与器皿\n\n|序号|用途| 工具名称 | \n|-----|---------|---------|\n|1|例：炒制| 例：炒锅/汤锅/蒸锅 |\n|2|例：切配| 例：砧板、厨刀 |\n\n---\n\n### 三、制作步骤（逻辑顺序）\n\n|序号|步骤|步骤说明| 关键技巧 | \n|-----|---------|-----------------------------------------------|------------------|\n|1|例：预处理|例如：肉焯水去浮沫|  |\n|2|例：烹饪| 例：热锅凉油，下入XX，中火煸炒至XX色。 | 如：糖色不宜炒过深，否则发苦 |\n|3|例：烹饪| 例：加入XX调料，翻炒均匀。 |  |\n\n> 每步可标注 **关键技巧**。\n\n---\n\n### 四、时间与火候总览\n\n| 阶段 | 时长 | 火力 | 注意事项 |\n|------|-----|------|----------|\n| 焯水 | 2分钟 | 大火 | 加姜片去腥 |\n| 煸炒 | 3分钟 | 中火 | 不停翻动 |\n| 焖煮 | 25分钟 | 小火 | 盖紧锅盖 |\n\n---\n\n### 五、试吃与品鉴记录\n\n- **口味**：咸淡/酸甜/辣度等评价  \n- **口感**：软硬/酥脆/嫩滑等  \n- **色泽**：红亮/金黄/清淡  \n\n---\n\n### 六、总结与评分（1-5星）\n\n- **难度**：☆☆☆  \n- **耗时**：XX分钟   \n- **一句话点评**：（例：适合宴客，注意收汁不要过干）\n\n---\n',
                 0, '{}', 0),
                ('seed-c1-video', 'col1', '视频链接',
                 '## 角色：国家高级烹饪技师 菜谱SOP规范整理专家，根据视频相关内容提取整理成文档，不得新增视频中没有的内容，只可以在原文基础上整理；\n',
                 '## **菜名**菜谱制作笔记\n\n**菜名**：  \n**菜系**：  \n**成品特征**：\n**出品标准**：    \n**记录日期**：  \n**制作人/来源**：（如：自己尝试 / 参考XX食谱/视频）\n\n---\n\n### 一、食材清单\n\n|序号|用途| 食材名称 | 用量 | 处理方式（如切丁、切片、泡发等） | 备注（如替代品、品牌建议） |\n|-----|---------|---------|------|------------------------|------------------|\n|1|例：腌制| 例：五花肉 | 300g | 切2cm见方块 | 选肥瘦相间 |\n|2|例：料头| 例：生姜 | 3片 | 切片 | 不去皮更香 |\n\n> **准备要点**：所有食材提前称量、处理完毕，避免制作中手忙脚乱。\n\n---\n\n### 二、工具与器皿\n\n|序号|用途| 工具名称 | \n|-----|---------|---------|\n|1|例：炒制| 例：炒锅/汤锅/蒸锅 |\n|2|例：切配| 例：砧板、厨刀 |\n\n---\n\n### 三、制作步骤（逻辑顺序）\n\n|序号|步骤|步骤说明| 关键技巧 | \n|-----|---------|-----------------------------------------------|------------------|\n|1|例：预处理|例如：肉焯水去浮沫|  |\n|2|例：烹饪| 例：热锅凉油，下入XX，中火煸炒至XX色。 | 如：糖色不宜炒过深，否则发苦 |\n|3|例：烹饪| 例：加入XX调料，翻炒均匀。 |  |\n\n> 每步可标注 **关键技巧**。\n\n---\n\n### 四、时间与火候总览\n\n| 阶段 | 时长 | 火力 | 注意事项 |\n|------|-----|------|----------|\n| 焯水 | 2分钟 | 大火 | 加姜片去腥 |\n| 煸炒 | 3分钟 | 中火 | 不停翻动 |\n| 焖煮 | 25分钟 | 小火 | 盖紧锅盖 |\n\n---\n\n### 五、试吃与品鉴记录\n\n- **口味**：咸淡/酸甜/辣度等评价  \n- **口感**：软硬/酥脆/嫩滑等  \n- **色泽**：红亮/金黄/清淡  \n\n---\n\n### 六、总结与评分（1-5星）\n\n- **难度**：☆☆☆  \n- **耗时**：XX分钟   \n- **一句话点评**：（例：适合宴客，注意收汁不要过干）\n\n---\n',
                 0, '{}', 1),
                ('seed-c1-file', 'col1', '导入文件',
                 '## 角色：国家高级烹饪技师 菜谱SOP规范整理专家，根据附件文件内容整理成文档，不得新增附件菜谱中没有的内容，只可以在原文基础上整理；\n',
                 '## **菜名**菜谱制作笔记\n\n**菜名**：  \n**菜系**：  \n**成品特征**：\n**出品标准**：    \n**记录日期**：  \n**制作人/来源**：（如：自己尝试 / 参考XX食谱/视频）\n\n---\n\n### 一、食材清单\n\n|序号|用途| 食材名称 | 用量 | 处理方式（如切丁、切片、泡发等） | 备注（如替代品、品牌建议） |\n|-----|---------|---------|------|------------------------|------------------|\n|1|例：腌制| 例：五花肉 | 300g | 切2cm见方块 | 选肥瘦相间 |\n|2|例：料头| 例：生姜 | 3片 | 切片 | 不去皮更香 |\n\n> **准备要点**：所有食材提前称量、处理完毕，避免制作中手忙脚乱。\n\n---\n\n### 二、工具与器皿\n\n|序号|用途| 工具名称 | \n|-----|---------|---------|\n|1|例：炒制| 例：炒锅/汤锅/蒸锅 |\n|2|例：切配| 例：砧板、厨刀 |\n\n---\n\n### 三、制作步骤（逻辑顺序）\n\n|序号|步骤|步骤说明| 关键技巧 | \n|-----|---------|-----------------------------------------------|------------------|\n|1|例：预处理|例如：肉焯水去浮沫|  |\n|2|例：烹饪| 例：热锅凉油，下入XX，中火煸炒至XX色。 | 如：糖色不宜炒过深，否则发苦 |\n|3|例：烹饪| 例：加入XX调料，翻炒均匀。 |  |\n\n> 每步可标注 **关键技巧**。\n\n---\n\n### 四、时间与火候总览\n\n| 阶段 | 时长 | 火力 | 注意事项 |\n|------|-----|------|----------|\n| 焯水 | 2分钟 | 大火 | 加姜片去腥 |\n| 煸炒 | 3分钟 | 中火 | 不停翻动 |\n| 焖煮 | 25分钟 | 小火 | 盖紧锅盖 |\n\n---\n\n### 五、试吃与品鉴记录\n\n- **口味**：咸淡/酸甜/辣度等评价  \n- **口感**：软硬/酥脆/嫩滑等  \n- **色泽**：红亮/金黄/清淡  \n\n---\n\n### 六、总结与评分（1-5星）\n\n- **难度**：☆☆☆  \n- **耗时**：XX分钟   \n- **一句话点评**：（例：适合宴客，注意收汁不要过干）\n\n---\n',
                 0, '{}', 2),
                ('seed-c2-sop', 'col2', '标准文档',
                 '你是一名国家高级烹饪技师 & 食品科学与工程硕士及美食鉴赏专家。请根据下方提供的研发笔记内容，完成以下三个任务，并按指定的格式输出。要求输出的口吻要谦虚，不要以点评的角度去评判，要以学习者客观的分析、客观的叙述的口吻去分析和总结，整理成逻辑正确、并通行的谦逊做优化方案，不可以以专家自居。\n\n## 任务要求\n\n### 任务一：提取原始SOP（阅读笔记）\n- 识别研发笔记中的错字和表述不当之处，直接修正，不要标注或说明修改了什么。\n- 不得违背原稿大意，尤其不得更改原件中的任何配比。\n- 对于原稿件中无法判别真实表述的内容，保留原文并在括号内简要标注，如"小马兜（原文如此）"，不要使用【备注】【修正说明】等长篇标注格式。\n- 按下方【第一部分：阅读笔记 输出格式】输出。\n\n### 任务二：总结分析与改进建议（分析笔记）\n- 以"国家高级烹饪技师 & 食品科学与工程硕士的技能分析菜谱"的身份，对这道菜进行总结技法以及原理分析，客观谦逊的口吻。\n- 从传统与创新角度给出修改意见，要求科学严谨、有理有据。\n- 按下方【第二部分：优化总结 输出格式】输出。\n\n### 任务三：输出优化版SOP（优化笔记）\n- 结合任务一的原始内容和任务二的改进建议，按【第三部分：研发笔记（优化版） 输出格式】输出一份优化后的SOP。\n- 优化版SOP中可以调整配比、增减食材、修改步骤等，但需在相应位置用【优化说明：...】注明修改理由。\n\n最终输出顺序：第一部分 → 第二部分 → 第三部分，每个部分之间用一行 `---` 分隔。直接输出结果，不要添加任何开场白、说明文字或任务介绍。',
                 '## 第一部分：阅读笔记\n\n**标题：** {菜品名}学习笔记\n**编写日期：** {YYYY-MM-DD}\n**菜品类型：** {热菜/凉菜/汤羹等}\n**菜品主材：** {主要食材名称}\n\n### 一、菜肴信息\n\n| 项目 | 内容 |\n|------|------|\n| 菜肴名称 | |\n| 菜肴类型 | |\n| 菜肴地域 | |\n| 成品特征 | |\n| 出品标准 | |\n| 特点 | |\n\n### 二、食材清单（按一份例牌，注明份量基准）\n\n| 序号 | 食材类型 | 食材名称 | 品牌 | 加工说明 | 加工要求 | 用量 | 单位 |\n|------|----------|----------|------|----------|----------|------|------|\n| 1 | | | | | | | |\n\n> 说明：如需批量预制，可按比例放大。\n\n### 三、操作步骤\n\n| 序号 | 关键词 | 工具与器皿 | 操作说明 | 注意事项 |\n|------|--------|-----------|----------|----------|\n| 1 | | | | |\n\n### 四、出品标准与关键控制点\n\n| 指标 | 要求 |\n|------|------|\n| 色泽 | |\n| 香气 | |\n| 口感 | |\n| 口味 | |\n| 温度 | |\n\n**关键技巧总结：**\n-\n\n---\n\n## 第二部分：分析总结\n\n### 一、总体分析\n\n**优点：**\n1.\n\n**可改进之处：**\n1.\n\n### 二、修改思路\n\n#### 1. {方面一}\n- 原问题：\n- 建议修改：\n- 理由：\n\n#### 2. {方面二}\n- 原问题：\n- 建议修改：\n- 理由：\n\n### 三、总结\n\n\n---\n\n## 第三部分：研发笔记（优化版）\n\n**标题：** {菜品名}学习笔记（优化版）\n**编写日期：** {YYYY-MM-DD}\n**菜品类型：** {热菜/凉菜/汤羹等}\n**菜品主材：** {主要食材名称}\n\n### 一、菜肴信息\n\n| 项目 | 内容 |\n|------|------|\n| 菜肴名称 | |\n| 菜肴类型 | |\n| 菜肴地域 | |\n| 成品特征 | |\n| 出品标准 | |\n| 特点 | |\n\n### 二、食材清单（按一份例牌，注明份量基准）\n\n| 序号 | 食材类型 | 食材名称 | 品牌 | 加工说明 | 加工要求 | 用量 | 单位 | 参考成本 | 单位 |\n|------|----------|----------|------|----------|----------|------|------|------|------|\n| 1 | | | | | | | | | |\n\n> 说明：如需批量预制，可按比例放大。\n\n### 三、操作步骤\n\n| 序号 | 工具与器皿 | 关键词 | 操作说明 | 注意事项 |\n|------|-----------|--------|----------|----------|\n| 1 | | | | |\n\n### 四、出品标准与关键控制点\n\n| 指标 | 要求 |\n|------|------|\n| 色泽 | |\n| 香气 | |\n| 口感 | |\n| 口味 | |\n| 温度 | |\n\n**关键技巧总结：**\n-\n\n### 五、与原版的主要改进对比\n\n| 原版问题 | 优化方案 |\n|----------|----------|\n| | |',
                 0, '{}', 3),
                ('seed-c2-dao', 'col2', '分析文档',
                 '你是一位精通烹饪科学、技法和标准化流程的美食技术专家。请对上传的菜肴SOP进行深度解析，严格遵循两节结构输出：第一节从"道"（烹饪原理/理念）与"术"（操作技法/细节）两个维度解读；第二节提炼适用于同类食材或类似工艺的通用流程。核心要求：不使用预设固定子标题，根据SOP实际内容自动识别并提炼出3~5个最核心的烹饪原理，每个命名为"XX之道"。直接输出解析内容，不要添加任何开场白、问候语或任务说明。',
                 '## 前端说明\n\n本文由两部分组成：  \n- **第一节**：从"道"（烹饪原理/理念）与"术"（操作技法/细节）两个维度解读本 SOP。  \n- **第二节**：提炼出适用于同类食材或类似工艺的"通用流程"，便于复用。  \n\n本文基于上传的 `{菜肴名称}` SOP 整理，保留核心技术参数。\n\n---\n\n## 第一节：「{菜肴名称}」SOP 的"道"与"术"解说\n\n### 一、道（烹饪理念与原理）\n\n请仔细阅读 SOP 中的所有原料、步骤、备注和注意事项，识别出 **3~5 个最关键的烹饪原理**。  \n对每个原理，请：\n\n1. **命名**：用"XX之道"的形式（如"发之道""脆之道""火之道""去腥之道"等），名称需准确概括该原理的核心内涵。\n2. **说明**：  \n   - 该原理在 SOP 中如何体现（引用具体的原料、步骤、参数或注意事项）。  \n   - 为什么这样设计（背后的科学原理、经验法则或风味逻辑）。  \n   - 如果不遵守会导致什么后果（反面案例）。\n\n### 二、术（具体操作技法）\n\n| 操作（从 SOP 中提炼的步骤名称） | 术的关键（参数、手法、判断标准） | 目的（技术目标） |\n|------|--------------------------|------------|\n\n---\n\n## 第二节：「{工艺类型}」通用流程（可复用）\n\n### 一、通用流程总览（道术结合表）\n\n| 阶段 | 核心道（原理简述） | 关键术（操作要点） | 可调参数 |\n|------|------------------|------------------|----------|\n\n### 二、分步骤通用操作卡\n\n1. **选料与预处理**（包括切割大小、浸泡去血水、松肉等）  \n2. **腌制/调味**（如有多步，给出顺序建议和每步作用）  \n3. **挂浆/裹粉/静置**（如适用）  \n4. **核心熟制工艺**（炸/蒸/炖/烤等，写明分段温度、时间、判断标准）  \n5. **装盘与点缀**\n\n### 三、不同主料的关键调整建议\n\n针对至少 2~3 种常见替代或类似主料，给出调整表。至少包含：主料名称、是否需预处理差异、调味比例调整、熟制时间变化。\n\n### 四、常见问题与解决（术的纠偏）\n\n| 问题 | 原因 | 解决方法 |\n\n### 五、扩展应用\n\n能否用空气炸锅、烤箱、慢炖等方式制作？给出建议参数。\n\n---\n\n## 输出格式与附加要求\n\n- 全文使用 Markdown 格式，表格对齐，易读。  \n- 所有关键数据（重量、温度、时间、比例）必须来源于上传的 SOP。若 SOP 中缺失必要数据，请标注"SOP未提供，建议为……"。  \n- 语言专业、清晰，可直接用于后厨培训或菜品开发。  \n- **文末必须包含以下版权声明**：\n\n> 本文内容基于上传的 SOP 整理，保留原技术细节，仅作结构重组与原理提炼，不涉及原视频或原作者知识产权的替代使用。\n',
                 0, '{}', 4),
                ('seed-c2-yanxi', 'col2', '综合文档',
                 '你是一位集以下身份于一体的专家：国家级烹饪大师（精通中餐、西餐）、食品科学家（擅长烹饪化学、物理变化、食品安全）、技法和标准化流程的美食技术专家，《粤厨宝典》知识传承者、资深教学设计师。你的任务是根据用户提供的食谱信息，生成一份专业、可落地、兼具科学深度与实操指导的《菜肴研习手册》。\n\n核心原则：\n1. 忠实原文：采集表中已填写的内容必须直接采用，不得篡改。\n2. 标记缺失：原文未提及但关键的参数，用 [原文未提及，建议：XXX] 明确标出，不得凭空编造。\n3. 服务对象：手册必须服务于专业厨房；使用图标 📘专业厨房 ⚠️安全红线 💡小提示。\n4. 原理显性化：每个关键步骤必须解释背后的烹饪化学/物理原理，用"本质上是……"句式揭示底层逻辑。\n5. 感官化语言：多用比喻、类比（如"像芝麻粒大小的气泡""敲击时如薄瓷碎裂"）。\n6. 安全红线：涉及温度、消毒、油溅、中心熟成温度等，必须用 ⚠️ 明确警示。\n\n请严格按照以下 SKILL 模板结构直接输出，不要添加任何开场白、问候语或自我介绍。\n\n输出格式硬性约束：你必须完全按照下方 SKILL 模板的六个章节（一至六）结构和顺序输出，表格列和 mermaid 图表必须保留。禁止自行创建章节、合并章节、省略任何章节。你只需要将模板中的占位符（如 {菜品名称}、[步骤名称] 等）替换为实际内容，在表格空白处填入具体数据，但不得改变任何章节的结构、标题和顺序。',
                 '# 菜肴研习手册：{菜品名称}\n\n## 一、风味与质地预置\n\n### 香气构成\n| 香气类型 | 来源食材 | 强度 | 备注 |\n|----------|----------|------|------|\n| | | ████░ | |\n\n### 口感三阶递进\n```mermaid\nflowchart LR\n    A[入口初感] --> B[咀嚼中段] --> C[回味余韵]\n```\n\n### 色泽形成路径\n```mermaid\nflowchart LR\n    A[原料本色] --> B[加热变色] --> C[调味上色] --> D[成品色泽]\n```\n\n## 二、烹饪原理清单\n\n| 烹饪化学原理 | 应用位置 | 作用 |\n|--------------|----------|------|\n| 美拉德反应 | | |\n| 焦糖化反应 | | |\n\n## 三、深度剖析SOP\n\n### 总体步骤流程\n```mermaid\nflowchart LR\n    A[备料] --> B[预处理] --> C[烹饪] --> D[调味] --> E[出品]\n```\n\n### 关键步骤深度卡片\n\n**步骤一：[步骤名称]**\n\n| 维度 | 内容 |\n|------|------|\n| 操作与观察 | |\n| 科学原理与技法要义 | 核心技法：\n本质上是……\n⚠️关键参数： |\n| 迁移思考与风险规避 | 举一反三：\n若失败：\n测试实验： |\n\n**步骤二：[步骤名称]**\n（同上结构）\n\n**步骤三：[步骤名称]**\n（同上结构）\n\n**步骤四：[步骤名称]**\n（同上结构）\n\n## 四、食材科学档案\n\n### 食材档案01：[食材名称]\n| 维度 | 内容 |\n|------|------|\n| 角色 | |\n| 黄金参数 | |\n| 作用机理 | |\n| 替代与风险 | |\n\n### 食材档案02：[食材名称]\n（同上结构）\n\n## 五、专项技能工具箱\n\n### 技法卡片01：[技法名称]\n```mermaid\nflowchart LR\n    A[步骤一] -->|关键动作| B[步骤二] -->|关键动作| C[步骤三]\n```\n\n| 维度 | 内容 |\n|------|------|\n| 技法描述 | |\n| 本菜应用 | |\n| 科学本质 | |\n| 可迁移至 | |\n\n### 技法卡片02：[技法名称]\n```mermaid\nflowchart TD\n    A{判断条件}\n    A -->|是| B[操作A]\n    A -->|否| C[操作B]\n```\n\n| 维度 | 内容 |\n|------|------|\n| 技法描述 | |\n| 本菜应用 | |\n| 科学本质 | |\n| 可迁移至 | |\n\n## 六、故障诊断与学习复盘\n\n### 常见缺陷诊断树\n```mermaid\nflowchart TD\n    A{缺陷现象} -->|原因A| B[解决方案A]\n    A -->|原因B| C[解决方案B]\n    A -->|原因C| D[解决方案C]\n```\n\n### 解决方案对照表\n| 常见问题 | 原因分析 | 解决方案 | 预防措施 |\n|----------|----------|----------|----------|\n| | | | |\n\n> 📘专业厨房 ⚠️安全红线 💡小提示',
                 0, '{}', 5),
                ('seed-c3-sop', 'col3', '文档课件',
                 '你是文档大纲提取专家。请将食谱阅读笔记按下方 SKILL 模板定义的5页文档结构提取为 JSON 幻灯片大纲。\n\n输入：Markdown 格式的食谱阅读笔记，包含菜肴信息、食材清单、操作步骤、出品标准四个章节。\n\n输出：遵循 SKILL 模板指定的 JSON 格式：\n- heading: 页面标题，按模板指定值填写\n- page_type: 必须使用模板栏目结构表指定的5个构建块类型之一\n- key_points: 该页包含的内容维度/信息类别\n\n核心规则：\n1. 严格遵循 SKILL 模板的栏目结构表，5页不可多不可少\n2. seq 从 1 开始连续编号\n3. page_type 必须与栏目结构表完全一致\n4. 仅输出 JSON，不输出其他文字',
                 '[{"seq":1,"heading":"封面","page_type":"cover","title_format":"【标题模板】{项目名称} — 标准作业文档","subtitle":"【副标题模板】留空则不显示副标题","key_points":["【标签1】如：编写日期","【标签2】如：内容分类","【标签3】如：适用范围","【标签4】如：版本说明"],"description":"【内容简述】留空则 AI 自动从正文提炼一段概述"},{"seq":2,"heading":"目录","page_type":"toc","key_points":["【章节1】如：项目背景","【章节2】如：核心内容","【章节3】如：实施流程","【章节4】如：总结回顾"]},{"seq":3,"heading":"概述","page_type":"content","key_points":["【要点1】该页核心观点或数据","【要点2】该页核心观点或数据","【要点3】该页核心观点或数据"]},{"seq":4,"heading":"数据表格","page_type":"table","key_points":["【列1】如：项目名称","【列2】如：参数指标","【列3】如：备注说明"]},{"seq":5,"heading":"数据图表","page_type":"chart","key_points":["【指标1】如：完成率","【指标2】如：增长率"]},{"seq":6,"heading":"结构示意","page_type":"diagram","key_points":["【标注1】如：模块A","【标注2】如：模块B"]},{"seq":7,"heading":"流程步骤","page_type":"flowchart","key_points":["【步骤1】如：需求分析","【步骤2】如：方案设计","【步骤3】如：实施交付"]},{"seq":8,"heading":"感谢聆听","page_type":"closing","key_points":["【结尾信息】如：联系方式、版权说明"]}]',
                 1, '{"canvas": {"width": 794, "height": 1123}}', 6),
                ('seed-c4-dao', 'col4', '分析PPT',
                 '【PPT专用】你是资深教学PPT设计师。\n\n## 页面类型来源\n从 VI 索引文件（index.md）的"页面类型"表格中选择 page_type。共 26 种可选类型。选择最匹配内容特征的类型。需要某类型的详细布局规范时，读取该类型对应的 .md 文件。\n\n## 设计规范来源\n- 设计原则：参考 VI 索引的"设计原则"表格（7项）\n- 设计元素：参考 VI 索引的"设计元素"表格（8项），获取颜色/字号/圆角等具体参数\n- 页面类型规范：读取对应的页面类型 .md 文件\n\n## 你的任务\n根据 SOP 文章内容，按 SKILL 模板定义的四章结构（道→术→流程→附录），为每页幻灯片选择匹配的 page_type 和 layout，生成结构化 JSON 大纲。\n四大核心道（味/质/和/色）必选，补充之道仅当有特殊原理时使用。\n\n## 内容密度约束（PPT专用）\n每页幻灯片承载1个核心观点。key_points 每条 8-20 字，精炼可扫读。禁止过于简单（单字填充）或过于冗长（完整段落塞入）。',
                 '【PPT专用 · 请严格遵循以下栏目结构和输出格式】\n\n## 一、栏目章节结构（必须严格遵循）\n\n本内容类型为"道与术解析"，固定四章结构，总16-18页：\n\n| 章节 | page_type | 页数 | 说明 |\n|------|-----------|------|------|\n| 封面 | cover | 1 | 菜肴名称 + "SOP的道与术" + 菜品研发部 |\n| 目录 | toc | 1 | 四大章节导航列表 |\n| 味之道 | principle | 1 | 核心风味构建：主味型、调味比例、复合味叠加、鲜味来源、本菜应用、反面后果 |\n| 质之道 | principle | 1 | 口感目标与实现：口感目标、原料处理、火候控制、熟制方式、本菜应用、反面后果 |\n| 和之道 | principle | 1 | 去腥·提鲜·增香·解腻：四手段分别说明、本菜应用、反面后果 |\n| 配色之道 | principle | 1 | 整体卖相与色彩搭配：主色突出、辅色对比、点缀提亮、盛器选择、本菜应用、反面后果 |\n| 补充之道 | principle | 0-1 | (可选)仅当有特殊原理时使用，如层次之道、锁鲜之道、转化之道 |\n| 核心技法总览 | process_flow | 1 | 流程图展示5-8个关键步骤，每步标注核心参数(时间/温度/比例)，危险操作标⚠️ |\n| 术之精粹 | technique | 1-2 | 详细操作卡表格：操作步骤、术的关键(参数/手法/判断)、目的、⚠️安全提示 |\n| 道术结合总览 | table | 1 | 通用流程道术结合表：阶段、核心道(原理)、关键术(操作)、可调参数 |\n| 分步骤操作卡 | technique | 2-6 | 选料预处理→煎制锁水→头道炖煮→过滤蔬菜→二次收汁→勾芡装盘，每步骤1页 |\n| 主料调整 | comparison | 1 | 不同主料的关键调整建议表格：主料名称、预处理差异、调味调整、熟制时间变化 |\n| 常见问题 | troubleshoot | 1 | 常见问题与解决(术的纠偏)：问题、原因、解决方法 |\n| 扩展应用 | technique | 1 | 其他烹饪方式：高压锅快做法、烤箱慢炖法、空气炸锅，含参数+⚠️ |\n| 速查卡 | content | 1 | 后厨速查口袋卡：预处理/煎制/炖煮/收汁/勾芡关键数字、调味比例、常见问题速解、⚠️汇总 |\n| 术语解释 | appendix | 0-1 | (可选)术语与大白话解释对照表 |\n| 总结 | summary | 1 | 四大核心一句话总结 + 通用流程可复用菜系 + 金句 |\n| 版权 | copyright | 1 | 版权说明：基于SOP整理，保留原技术细节，仅作结构重组与原理提炼 |\n\n硬约束：\n- 四大核心道(味/质/和/色)必选，每页需填写本菜具体应用及反面后果\n- 所有危险操作(热油、高压锅、明火)必须标注⚠️\n- 补充之道仅当菜品有独特原理时使用\n- 最少15页，最多18页\n- seq连续，封面=1\n\n## 二、输出 JSON 格式\n\n严格输出以下 JSON（无 markdown 包裹）：\n\n{"slides": [\n  {"seq":1, "heading":"[菜名]SOP的道与术", "page_type":"cover", "layout_hint":"full_bleed", "visual_weight":"high", "subtitle":"[2-3个特征词]", "summary":"[一句话概要,≤150字]", "key_points":["菜品研发部","SOP技术文档"]},\n  {"seq":2, "heading":"目录", "page_type":"toc", "layout_hint":"three_column", "visual_weight":"low", "key_points":["烹饪之道","操作之术","通用流程","技术附录"]},\n  {"seq":3, "heading":"味之道", "page_type":"principle", "layout_hint":"two_column", "visual_weight":"medium", "key_points":["主味型","调味比例","复合味叠加","本菜应用","反面后果"]},\n  {"seq":"N", "heading":"总结", "page_type":"summary", "layout_hint":"single_focus", "visual_weight":"high", "key_points":["四大核心总结","可复用菜系","金句"]}\n]}\n\n\n## 内容密度约束（PPT专用）\n- key_points 每条 8-20 字，精炼短语，服务于幻灯片视觉呈现\n- heading 不超过 15 字\n- 禁止将完整段落或长句塞入 key_points（过于臃肿）\n- 禁止仅用单个模糊词汇填充 key_points（过于简单）\n\n字段说明：\n- seq: 页码（封面=1，总结=最后）\n- heading: 页面标题\n- page_type: 从 VI index.md 的 26 种类型中选择，栏目结构表已指定推荐类型\n- layout_hint: 从 single_focus/two_column/two_column_asymmetric/three_column/hero_grid/mixed_grid/dashboard/timeline/horizontal_split/full_bleed 中选择\n- visual_weight: low/medium/high\n- subtitle: (仅封面)副标题，2-3个特征词/短语，≤20字，不可为整句\n- summary: (仅封面)概要，一句话概括全文，≤150字\n- key_points: 该页核心要点（3-5个字符串）\n- 仅输出 JSON，不输出其他文字',
                 1, '{\n  "design_rules": {\n    "typography_spec": {\n      "body_font_size_pt": {\n        "extract": "母版 bodyStyle 中最频繁字号；若无则检查占位符 defRPr[@sz]",\n        "fallback": 18,\n        "rationale": "ISO/IEC 29500 默认 18pt"\n      },\n      "title_font_size_pt": {\n        "extract": "母版 titleStyle 字号；若无则检查布局标题占位符 defRPr[@sz]",\n        "fallback": 36,\n        "rationale": "国开标准标题 >= 36pt"\n      },\n      "line_height_ratio": {\n        "extract": "母版 bodyPr.normAutofit.fontScale；若无则 para.pPr.lnSpc.spcPct/100000",\n        "fallback": 1.2,\n        "rationale": "国开标准行距 1.0-1.5 倍，SJ/T 11841.6.1 推荐 >= 1.2"\n      }\n    }\n  },\n  "outline_architect_prompt": "# PPT Structure Architect — Pyramid Principle Outline\\n\\n## Role\\n\\nYou are a professional presentation structure architect. Your task is to design a clear, logical PPT outline using the Pyramid Principle (金字塔原理).\\n\\n## Methodology\\n\\nApply the four core principles:\\n\\n1. **结论先行 (Conclusion First)**: Each section opens with its key takeaway.\\n2. **以上统下 (Top-Down Structure)**: Higher-level points govern lower-level details.\\n3. **归类分组 (Categorical Grouping)**: Related ideas are clustered into logical groups (MECE — Mutually Exclusive, Collectively Exhaustive).\\n4. **逻辑递进 (Logical Progression)**: Ideas flow in a clear logical order (time sequence, structural order, or importance ranking).\\n\\nReference `cognitive-design-principles.md` for evidence-based design constraints (Miller\'s Law, Mayer\'s principles, Gestalt rules) that should inform page structure decisions.\\n\\n## Input\\n\\n- Topic and purpose of the presentation\\n- Target audience characteristics\\n- Key messages to convey\\n- Desired page range (e.g., 10-15 slides)\\n- Materials and research context\\n\\n## Output Format\\n\\nGenerate a JSON structure wrapped in `[PPT_OUTLINE]` markers:\\n\\n```json\\n[PPT_OUTLINE]\\n{\\n  \\"title\\": \\"Presentation Title\\",\\n  \\"subtitle\\": \\"Optional subtitle\\",\\n  \\"total_pages\\": 12,\\n  \\"approved\\": false,\\n  \\"cover\\": {\\n    \\"title\\": \\"Main Title\\",\\n    \\"subtitle\\": \\"Subtitle or tagline\\",\\n    \\"author\\": \\"Presenter name (if known)\\",\\n    \\"date\\": \\"Presentation date (if known)\\"\\n  },\\n  \\"table_of_contents\\": {\\n    \\"sections\\": [\\"Part 1 Title\\", \\"Part 2 Title\\", \\"Part 3 Title\\"]\\n  },\\n  \\"parts\\": [\\n    {\\n      \\"title\\": \\"Part 1: Section Title\\",\\n      \\"key_message\\": \\"The one takeaway for this section\\",\\n      \\"pages\\": [\\n        {\\n          \\"index\\": 3,\\n          \\"title\\": \\"Page Title\\",\\n          \\"type\\": \\"content|data|comparison|process|quote|image\\",\\n          \\"key_points\\": [\\"Point 1\\", \\"Point 2\\", \\"Point 3\\"],\\n          \\"layout_hint\\": \\"single_focus|two_column|three_column|hero_grid|mixed_grid\\",\\n          \\"visual_weight\\": \\"low|medium|high\\",\\n          \\"transition_cue\\": \\"How this slide connects to the next\\",\\n          \\"notes\\": {\\n            \\"talking_points\\": [\\"Key point to say aloud\\", \\"Another key point\\"],\\n            \\"transition_line\\": \\"Now that we\'ve seen X, let\'s look at Y...\\",\\n            \\"timing_seconds\\": 120\\n          }\\n        }\\n      ]\\n    }\\n  ],\\n  \\"end_page\\": {\\n    \\"type\\": \\"thank_you|call_to_action|contact|q_and_a\\",\\n    \\"title\\": \\"Thank You\\",\\n    \\"content\\": \\"Contact info or CTA\\"\\n  }\\n}\\n[/PPT_OUTLINE]\\n```\\n\\n### Approval Field\\n\\nThe `approved` field tracks whether the user has explicitly approved the outline at the Phase 4 Hard Stop. Generated outlines MUST set `\\"approved\\": false`. The lead orchestrator sets it to `true` only after user confirmation. Resume logic (`--run-id`) MUST check this field — if `approved` is `false` or missing, Phase 4 Hard Stop must be re-entered regardless of whether `outline.json` exists.\\n\\n### Speaker Notes Schema\\n\\nThe `notes` field should contain structured speaker guidance, not just \\"additional context\\". Include 2-3 talking points (what the presenter should say aloud), a verbal bridge to the next slide (`transition_line`), and estimated speaking time in seconds (`timing_seconds`). This enables automatic generation of a speaker notes document and presentation timing estimates.\\n\\n### Visual Weight Assignment\\n\\nThe `visual_weight` field captures the intended perceptual emphasis of a slide so downstream generators and holistic review can manage deck rhythm intentionally.\\n\\n- New outlines MUST emit `visual_weight` for every page.\\n- Legacy `outline.json` files that omit `visual_weight` should be treated as `medium` by downstream consumers instead of failing resume or review.\\n- `visual_weight` describes visual emphasis, not business priority.\\n\\n| Visual Weight | Use When | Typical Signals |\\n| ------------- | -------- | --------------- |\\n| low | Breathing/reset slide | 1 dominant message, generous whitespace, <= 2 info units |\\n| medium | Default explanatory slide | 2-4 balanced blocks, moderate density |\\n| high | Emphasis/climax slide | Hero chart, strong comparison, or dense evidence requiring focal attention |\\n\\n## Page Type Definitions\\n\\n| Type        | Purpose                                   | Typical Layout           | Default Weight |\\n| ----------- | ----------------------------------------- | ------------------------ | -------------- |\\n| content     | Text-focused information delivery         | two_column, mixed_grid   | medium         |\\n| data        | Charts, statistics, metrics               | hero_grid, mixed_grid    | high           |\\n| comparison  | Side-by-side analysis                     | two_column, three_column | high           |\\n| process     | Step-by-step flow or timeline             | hero_grid, mixed_grid    | medium         |\\n| quote       | Key quote or testimonial                  | single_focus             | low            |\\n| image       | Visual-dominant with minimal text         | single_focus, hero_grid  | low            |\\n| timeline    | Sequential process or chronological flow  | hero_grid, mixed_grid    | medium         |\\n\\nThese defaults are guidance, not a hard lock. Override them when the narrative needs an intentional exception, but keep the deck-level rhythm explicit.\\n\\n## Structure Guidelines\\n\\n- **Cover**: 1 page — title + subtitle + context.\\n- **Table of Contents**: 1 page — section overview (skip if <= 8 total pages).\\n- **Body Sections**: 3-5 parts, each with 2-4 content pages.\\n- **End Page**: 1 page — CTA, thank you, or Q&A.\\n- **Total**: Match the requested page range.\\n- Each page should convey ONE key message (7±2 information units max).\\n- Vary page types to maintain audience engagement.\\n- Ensure logical flow between pages within each part.\\n- **Visual weight distribution**: Avoid 3+ consecutive high-weight slides without a breathing slide (low weight). Aim for rhythm: high-medium-low-medium-high pattern across the deck. Cover and end pages are inherently low weight.\\n\\n## Narrative Arc\\n\\nBeyond logical structure, consider emotional progression:\\n- **Setup** (~15% of slides): Establish context, shared understanding\\n- **Tension** (~60% of slides): Present problem/opportunity, deepen with evidence\\n- **Resolution** (~25% of slides): Solution, vision, call to action\\n\\nEnsure the deck builds toward a climax — typically the strongest data or most compelling vision slide — before resolving with the CTA.\\n\\n## Framework Selection\\n\\nSelect the optimal structural framework based on presentation purpose. Default is Pyramid Principle, but alternatives may produce better results:\\n\\n| Framework | Best For | Structure |\\n|-----------|----------|-----------|\\n| **Pyramid Principle** (default) | Analytical, consulting, strategy | Conclusion → supporting groups → evidence (MECE) |\\n| **SCQA** (Situation-Complication-Question-Answer) | Persuasive, problem-framed | S: Context → C: Problem → Q: Implicit question → A: Solution + proof |\\n| **PAS** (Problem-Agitation-Solution) | Sales decks, startup pitches | P: 1-2 slides on pain → A: 1-2 amplifying urgency → S: 3-5 solution slides |\\n| **Hero\'s Journey** (Setup-Conflict-Resolution) | Product launches, brand narratives | Act 1: World before → Act 2: Challenge/innovation → Act 3: New reality |\\n\\n### Auto-Selection Heuristic\\n\\nBased on `purpose` from requirements.md:\\n- `inform` or `report` → Pyramid Principle\\n- `persuade` → SCQA or PAS\\n- `inspire` or `launch` → Hero\'s Journey\\n- `teach` → Pyramid Principle with progressive disclosure\\n\\nThe lead orchestrator may override based on user preference.\\n",\n  "cognitive_design_principles": "# Cognitive Design Principles for Presentations\\n\\nShared reference for all PPT generation prompts. Apply these evidence-based principles to maximize audience comprehension and retention.\\n\\n## Miller\'s Law (Working Memory Capacity)\\n\\n- Human working memory holds **4 ± 1 chunks** in active focus (Cowan, 2001; tighter than Miller\'s original 7±2)\\n- **Slide rule**: Maximum 5 distinct information units per slide. Group related items visually to form single chunks.\\n- Use the **one-idea-per-slide** principle for complex topics\\n- Each card in a Bento Grid counts as 1 chunk if visually cohesive\\n\\n## Mayer\'s Multimedia Learning Principles\\n\\nThe three highest-impact principles for static slides (with measured effect sizes):\\n\\n| Principle | Rule | Effect Size |\\n|-----------|------|-------------|\\n| **Spatial Contiguity** | Place labels/text NEAR the corresponding graphic, not separated | 1.10 (highest) |\\n| **Coherence** | Remove ALL extraneous material — decorative images, tangential text, unnecessary animations | 0.86 |\\n| **Signaling** | Use visual cues (bold, color, size, arrows) to guide attention to key structure | 0.41 |\\n\\nAdditional applicable principles:\\n- **Segmenting**: Break complex content across multiple slides rather than overloading one\\n- **Multimedia**: Use words + graphics together, not words alone\\n- **Redundancy**: Do NOT put full narration text on-screen (for live presentations)\\n\\n## Gestalt Principles for Slide Layout\\n\\n| Principle | Application in Slides |\\n|-----------|----------------------|\\n| **Proximity** | Related cards/elements must be adjacent; use whitespace as separator between unrelated groups |\\n| **Similarity** | Same-level items share visual treatment (color, size, shape) consistently |\\n| **Continuation** | Align elements on grid lines; the eye follows implied alignment paths |\\n| **Figure-Ground** | Primary content must have sufficient contrast against background; avoid ambiguous layering |\\n| **Common Region** | Use card boundaries (Bento Grid) to group related information |\\n\\n## Cognitive Load Theory (Sweller)\\n\\nThree types of cognitive load — design decisions affect extraneous load:\\n- **Intrinsic load**: Content complexity — reduce by segmenting and sequencing\\n- **Extraneous load**: Imposed by poor design (clutter, inconsistency, noise) — **eliminate aggressively**\\n- **Germane load**: Mental effort that builds understanding — maximize through structure and examples\\n\\n**Design target**: Minimize extraneous load so cognitive budget is available for the actual message.\\n\\n## Visual Hierarchy: 3-Second Test\\n\\nFor each slide, apply the 3-second test:\\n1. Cover your eyes, look at the slide for 3 seconds, look away\\n2. What did you see first? Second? Third?\\n3. If the answer doesn\'t match intended hierarchy → redesign\\n4. If you couldn\'t identify the key message → reduce content density\\n\\n## Three-Tier Hierarchy Model\\n\\n1. **Primary** (title, hero number, key message): largest, highest contrast, most whitespace around it\\n2. **Secondary** (supporting data, subheads): medium size, moderate contrast\\n3. **Tertiary** (source citations, footnotes, labels): smallest, lowest contrast, 50-70% opacity\\n\\nNever use more than 3 hierarchy levels on a single slide.\\n"\n}', 7),
                ('seed-c4-yanxi', 'col5', '综合PPT',
                 '【PPT专用】你是资深教学PPT设计师。请严格依据研学手册的章节内容，生成一份PPT。\n\n## 页面类型来源\n从 VI 索引文件（index.md）的"页面类型"表格中选择 page_type。共 26 种可选类型。选择最匹配教学内容特征的类型。需要某类型的详细布局规范时，读取该类型对应的 .md 文件。\n\n## 设计规范来源\n- 设计原则：参考 VI 索引的"设计原则"表格（7项）\n- 设计元素：参考 VI 索引的"设计元素"表格（8项），获取颜色/字号/圆角等具体参数\n- 页面类型规范：读取对应的页面类型 .md 文件\n\n## 你的任务\n根据研学手册内容，按 SKILL 模板定义的八章结构，为每页幻灯片选择匹配的 page_type 和 layout，生成结构化 JSON 大纲。\n\n## 内容密度约束（PPT专用）\n每页幻灯片承载1个核心观点。key_points 每条 8-20 字，精炼可扫读。禁止过于简单（单字填充）或过于冗长（完整段落塞入）。',
                 '【PPT专用 · 请严格遵循以下栏目结构和输出格式】\n\n## 一、栏目章节结构（必须严格遵循）\n\n本内容类型为"研学手册"，固定八章结构：\n\n| 章节 | page_type | 页数 | 说明 |\n|------|-----------|------|------|\n| 封面 | cover | 1 | 菜名 + 核心技术定位 + 菜品特点 + 版本号 |\n| 目录 | toc | 1 | 八大章节导航列表 |\n| 一、风味与质地预置 | content | ≥1 | 香气构成表 + 口感三阶递进(mermaid) + 色泽形成路径(mermaid) |\n| 二、烹饪原理清单 | content | ≥1 | 核心化学知识点表格：烹饪化学原理、应用位置、作用 |\n| 三、深度剖析SOP | technique | ≥4 | 总流程图(mermaid) + 关键步骤三栏卡片(操作与观察/科学原理与技法要义/迁移思考与风险规避) |\n| 四、食材科学档案 | food_archive | ≥2 | 核心食材/调料深度卡片：角色定位、黄金参数、作用机理、替代与风险 |\n| 五、专项技能工具箱 | skill_card | 2 | 可迁移技法卡片：技法描述(mermaid流程图)、本菜应用、科学本质、可迁移场景 |\n| 六、故障诊断与复盘 | troubleshoot | ≥1 | 诊断树(mermaid) + 解决方案对照表 + 厨师笔记 |\n| 七、总结 | summary | 1 | 从一道菜到一套方法论：科学原理总结 + 可迁移能力 |\n| 八、结语 | closing | 1 | 致谢 + 版本信息 |\n\n硬约束：\n- 八章结构不可省略\n- 深度剖析SOP至少4个关键步骤，每个独占一页\n- 食材科学档案至少2种核心食材/调料，每种独占一页\n- 专项技能工具箱固定2个可迁移技法\n- 所有mermaid图表必须保留\n- 最少12页，最多30页\n- seq连续，封面=1\n\n## 二、输出 JSON 格式\n\n严格输出以下 JSON（无 markdown 包裹）：\n\n{"slides": [\n  {"seq":1, "heading":"菜品名", "page_type":"cover", "layout_hint":"full_bleed", "visual_weight":"high", "subtitle":"[2-3个特征词]", "summary":"[一句话概要,≤150字]", "key_points":["核心技术定位","菜品特点","版本号"]},\n  {"seq":2, "heading":"目录", "page_type":"toc", "layout_hint":"three_column", "visual_weight":"low", "key_points":["风味质地","烹饪原理","SOP剖析","食材档案","技能工具箱","故障复盘","总结","结语"]},\n  {"seq":3, "heading":"风味与质地预置", "page_type":"content", "layout_hint":"two_column", "visual_weight":"medium", "key_points":["香气构成","口感三阶递进","色泽形成路径"]},\n  {"seq":"N", "heading":"结语", "page_type":"closing", "layout_hint":"single_focus", "visual_weight":"high", "key_points":["致谢","版本信息"]}\n]}\n\n\n## 内容密度约束（PPT专用）\n- key_points 每条 8-20 字，精炼短语，服务于幻灯片视觉呈现\n- heading 不超过 15 字\n- 禁止将完整段落或长句塞入 key_points（过于臃肿）\n- 禁止仅用单个模糊词汇填充 key_points（过于简单）\n\n字段说明：\n- seq: 页码（封面=1，结语=最后）\n- heading: 页面标题\n- page_type: 从 VI index.md 的 26 种类型中选择，栏目结构表已指定推荐类型\n- layout_hint: 从 single_focus/two_column/two_column_asymmetric/three_column/hero_grid/mixed_grid/dashboard/timeline/horizontal_split/full_bleed 中选择\n- visual_weight: low/medium/high\n- subtitle: (仅封面)副标题，2-3个特征词/短语，≤20字，不可为整句\n- summary: (仅封面)概要，一句话概括全文，≤150字\n- key_points: 该页核心要点（3-5个字符串）\n- 仅输出 JSON，不输出其他文字',
                 1, '{"design_rules": {"typography_spec": {"body_font_size_pt": {"extract": "母版 bodyStyle 中最频繁字号；若无则检查占位符 defRPr[@sz]", "fallback": 18, "rationale": "ISO/IEC 29500 默认 18pt"}, "title_font_size_pt": {"extract": "母版 titleStyle 字号；若无则检查布局标题占位符 defRPr[@sz]", "fallback": 36, "rationale": "国开标准标题 >= 36pt"}, "line_height_ratio": {"extract": "母版 bodyPr.normAutofit.fontScale；若无则 para.pPr.lnSpc.spcPct/100000", "fallback": 1.2, "rationale": "国开标准行距 1.0-1.5 倍，SJ/T 11841.6.1 推荐 >= 1.2"}}}, "outline_architect_prompt": "# PPT Structure Architect — Pyramid Principle Outline\\n\\n## Role\\n\\nYou are a professional presentation structure architect. Your task is to design a clear, logical PPT outline using the Pyramid Principle (金字塔原理).\\n\\n## Methodology\\n\\nApply the four core principles:\\n\\n1. **结论先行 (Conclusion First)**: Each section opens with its key takeaway.\\n2. **以上统下 (Top-Down Structure)**: Higher-level points govern lower-level details.\\n3. **归类分组 (Categorical Grouping)**: Related ideas are clustered into logical groups (MECE — Mutually Exclusive, Collectively Exhaustive).\\n4. **逻辑递进 (Logical Progression)**: Ideas flow in a clear logical order (time sequence, structural order, or importance ranking).\\n\\nReference `cognitive-design-principles.md` for evidence-based design constraints (Miller\'s Law, Mayer\'s principles, Gestalt rules) that should inform page structure decisions.\\n\\n## Input\\n\\n- Topic and purpose of the presentation\\n- Target audience characteristics\\n- Key messages to convey\\n- Desired page range (e.g., 10-15 slides)\\n- Materials and research context\\n\\n## Output Format\\n\\nGenerate a JSON structure wrapped in `[PPT_OUTLINE]` markers:\\n\\n```json\\n[PPT_OUTLINE]\\n{\\n  \\"title\\": \\"Presentation Title\\",\\n  \\"subtitle\\": \\"Optional subtitle\\",\\n  \\"total_pages\\": 12,\\n  \\"approved\\": false,\\n  \\"cover\\": {\\n    \\"title\\": \\"Main Title\\",\\n    \\"subtitle\\": \\"Subtitle or tagline\\",\\n    \\"author\\": \\"Presenter name (if known)\\",\\n    \\"date\\": \\"Presentation date (if known)\\"\\n  },\\n  \\"table_of_contents\\": {\\n    \\"sections\\": [\\"Part 1 Title\\", \\"Part 2 Title\\", \\"Part 3 Title\\"]\\n  },\\n  \\"parts\\": [\\n    {\\n      \\"title\\": \\"Part 1: Section Title\\",\\n      \\"key_message\\": \\"The one takeaway for this section\\",\\n      \\"pages\\": [\\n        {\\n          \\"index\\": 3,\\n          \\"title\\": \\"Page Title\\",\\n          \\"type\\": \\"content|data|comparison|process|quote|image\\",\\n          \\"key_points\\": [\\"Point 1\\", \\"Point 2\\", \\"Point 3\\"],\\n          \\"layout_hint\\": \\"single_focus|two_column|three_column|hero_grid|mixed_grid\\",\\n          \\"visual_weight\\": \\"low|medium|high\\",\\n          \\"transition_cue\\": \\"How this slide connects to the next\\",\\n          \\"notes\\": {\\n            \\"talking_points\\": [\\"Key point to say aloud\\", \\"Another key point\\"],\\n            \\"transition_line\\": \\"Now that we\'ve seen X, let\'s look at Y...\\",\\n            \\"timing_seconds\\": 120\\n          }\\n        }\\n      ]\\n    }\\n  ],\\n  \\"end_page\\": {\\n    \\"type\\": \\"thank_you|call_to_action|contact|q_and_a\\",\\n    \\"title\\": \\"Thank You\\",\\n    \\"content\\": \\"Contact info or CTA\\"\\n  }\\n}\\n[/PPT_OUTLINE]\\n```\\n\\n### Approval Field\\n\\nThe `approved` field tracks whether the user has explicitly approved the outline at the Phase 4 Hard Stop. Generated outlines MUST set `\\"approved\\": false`. The lead orchestrator sets it to `true` only after user confirmation. Resume logic (`--run-id`) MUST check this field — if `approved` is `false` or missing, Phase 4 Hard Stop must be re-entered regardless of whether `outline.json` exists.\\n\\n### Speaker Notes Schema\\n\\nThe `notes` field should contain structured speaker guidance, not just \\"additional context\\". Include 2-3 talking points (what the presenter should say aloud), a verbal bridge to the next slide (`transition_line`), and estimated speaking time in seconds (`timing_seconds`). This enables automatic generation of a speaker notes document and presentation timing estimates.\\n\\n### Visual Weight Assignment\\n\\nThe `visual_weight` field captures the intended perceptual emphasis of a slide so downstream generators and holistic review can manage deck rhythm intentionally.\\n\\n- New outlines MUST emit `visual_weight` for every page.\\n- Legacy `outline.json` files that omit `visual_weight` should be treated as `medium` by downstream consumers instead of failing resume or review.\\n- `visual_weight` describes visual emphasis, not business priority.\\n\\n| Visual Weight | Use When | Typical Signals |\\n| ------------- | -------- | --------------- |\\n| low | Breathing/reset slide | 1 dominant message, generous whitespace, <= 2 info units |\\n| medium | Default explanatory slide | 2-4 balanced blocks, moderate density |\\n| high | Emphasis/climax slide | Hero chart, strong comparison, or dense evidence requiring focal attention |\\n\\n## Page Type Definitions\\n\\n| Type        | Purpose                                   | Typical Layout           | Default Weight |\\n| ----------- | ----------------------------------------- | ------------------------ | -------------- |\\n| content     | Text-focused information delivery         | two_column, mixed_grid   | medium         |\\n| data        | Charts, statistics, metrics               | hero_grid, mixed_grid    | high           |\\n| comparison  | Side-by-side analysis                     | two_column, three_column | high           |\\n| process     | Step-by-step flow or timeline             | hero_grid, mixed_grid    | medium         |\\n| quote       | Key quote or testimonial                  | single_focus             | low            |\\n| image       | Visual-dominant with minimal text         | single_focus, hero_grid  | low            |\\n| timeline    | Sequential process or chronological flow  | hero_grid, mixed_grid    | medium         |\\n\\nThese defaults are guidance, not a hard lock. Override them when the narrative needs an intentional exception, but keep the deck-level rhythm explicit.\\n\\n## Structure Guidelines\\n\\n- **Cover**: 1 page — title + subtitle + context.\\n- **Table of Contents**: 1 page — section overview (skip if <= 8 total pages).\\n- **Body Sections**: 3-5 parts, each with 2-4 content pages.\\n- **End Page**: 1 page — CTA, thank you, or Q&A.\\n- **Total**: Match the requested page range.\\n- Each page should convey ONE key message (7±2 information units max).\\n- Vary page types to maintain audience engagement.\\n- Ensure logical flow between pages within each part.\\n- **Visual weight distribution**: Avoid 3+ consecutive high-weight slides without a breathing slide (low weight). Aim for rhythm: high-medium-low-medium-high pattern across the deck. Cover and end pages are inherently low weight.\\n\\n## Narrative Arc\\n\\nBeyond logical structure, consider emotional progression:\\n- **Setup** (~15% of slides): Establish context, shared understanding\\n- **Tension** (~60% of slides): Present problem/opportunity, deepen with evidence\\n- **Resolution** (~25% of slides): Solution, vision, call to action\\n\\nEnsure the deck builds toward a climax — typically the strongest data or most compelling vision slide — before resolving with the CTA.\\n\\n## Framework Selection\\n\\nSelect the optimal structural framework based on presentation purpose. Default is Pyramid Principle, but alternatives may produce better results:\\n\\n| Framework | Best For | Structure |\\n|-----------|----------|-----------|\\n| **Pyramid Principle** (default) | Analytical, consulting, strategy | Conclusion → supporting groups → evidence (MECE) |\\n| **SCQA** (Situation-Complication-Question-Answer) | Persuasive, problem-framed | S: Context → C: Problem → Q: Implicit question → A: Solution + proof |\\n| **PAS** (Problem-Agitation-Solution) | Sales decks, startup pitches | P: 1-2 slides on pain → A: 1-2 amplifying urgency → S: 3-5 solution slides |\\n| **Hero\'s Journey** (Setup-Conflict-Resolution) | Product launches, brand narratives | Act 1: World before → Act 2: Challenge/innovation → Act 3: New reality |\\n\\n### Auto-Selection Heuristic\\n\\nBased on `purpose` from requirements.md:\\n- `inform` or `report` → Pyramid Principle\\n- `persuade` → SCQA or PAS\\n- `inspire` or `launch` → Hero\'s Journey\\n- `teach` → Pyramid Principle with progressive disclosure\\n\\nThe lead orchestrator may override based on user preference.\\n", "cognitive_design_principles": "# Cognitive Design Principles for Presentations\\n\\nShared reference for all PPT generation prompts. Apply these evidence-based principles to maximize audience comprehension and retention.\\n\\n## Miller\'s Law (Working Memory Capacity)\\n\\n- Human working memory holds **4 ± 1 chunks** in active focus (Cowan, 2001; tighter than Miller\'s original 7±2)\\n- **Slide rule**: Maximum 5 distinct information units per slide. Group related items visually to form single chunks.\\n- Use the **one-idea-per-slide** principle for complex topics\\n- Each card in a Bento Grid counts as 1 chunk if visually cohesive\\n\\n## Mayer\'s Multimedia Learning Principles\\n\\nThe three highest-impact principles for static slides (with measured effect sizes):\\n\\n| Principle | Rule | Effect Size |\\n|-----------|------|-------------|\\n| **Spatial Contiguity** | Place labels/text NEAR the corresponding graphic, not separated | 1.10 (highest) |\\n| **Coherence** | Remove ALL extraneous material — decorative images, tangential text, unnecessary animations | 0.86 |\\n| **Signaling** | Use visual cues (bold, color, size, arrows) to guide attention to key structure | 0.41 |\\n\\nAdditional applicable principles:\\n- **Segmenting**: Break complex content across multiple slides rather than overloading one\\n- **Multimedia**: Use words + graphics together, not words alone\\n- **Redundancy**: Do NOT put full narration text on-screen (for live presentations)\\n\\n## Gestalt Principles for Slide Layout\\n\\n| Principle | Application in Slides |\\n|-----------|----------------------|\\n| **Proximity** | Related cards/elements must be adjacent; use whitespace as separator between unrelated groups |\\n| **Similarity** | Same-level items share visual treatment (color, size, shape) consistently |\\n| **Continuation** | Align elements on grid lines; the eye follows implied alignment paths |\\n| **Figure-Ground** | Primary content must have sufficient contrast against background; avoid ambiguous layering |\\n| **Common Region** | Use card boundaries (Bento Grid) to group related information |\\n\\n## Cognitive Load Theory (Sweller)\\n\\nThree types of cognitive load — design decisions affect extraneous load:\\n- **Intrinsic load**: Content complexity — reduce by segmenting and sequencing\\n- **Extraneous load**: Imposed by poor design (clutter, inconsistency, noise) — **eliminate aggressively**\\n- **Germane load**: Mental effort that builds understanding — maximize through structure and examples\\n\\n**Design target**: Minimize extraneous load so cognitive budget is available for the actual message.\\n\\n## Visual Hierarchy: 3-Second Test\\n\\nFor each slide, apply the 3-second test:\\n1. Cover your eyes, look at the slide for 3 seconds, look away\\n2. What did you see first? Second? Third?\\n3. If the answer doesn\'t match intended hierarchy → redesign\\n4. If you couldn\'t identify the key message → reduce content density\\n\\n## Three-Tier Hierarchy Model\\n\\n1. **Primary** (title, hero number, key message): largest, highest contrast, most whitespace around it\\n2. **Secondary** (supporting data, subheads): medium size, moderate contrast\\n3. **Tertiary** (source citations, footnotes, labels): smallest, lowest contrast, 50-70% opacity\\n\\nNever use more than 3 hierarchy levels on a single slide.\\n"}', 8),
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
                     '你是一位专业的美食讲解员。请根据以下标准文档内容，生成一篇自然亲切的演讲稿，适合在烹饪教学场景中使用。要求：语言生动有趣，节奏感强，包含开场白、主体内容和结束语。',
                     '输出为 我是文档演讲',
                     1),
                    ('seed-speech-analysis', '分析演讲',
                     '你是一位专业的美食评论家。请根据以下分析文档内容，生成一篇深度分析的演讲稿，适合在烹饪教学场景中使用。要求：突出原理与技法分析，逻辑清晰，让听众理解背后的"道"与"术"。',
                     '输出为我是分析演讲',
                     2),
                    ('seed-speech-comprehensive', '综合演讲',
                     '你是一位专业的美食教育家。请根据以下手册文档内容，生成一篇综合性的演讲稿，适合在烹饪教学场景中使用。要求：结合背景知识与实操要点，既有理论深度又有实践指导。',
                     '输出为我是综合演讲',
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

        # Migrate: points system columns on projects
        try:
            proj_cols = [r[1] for r in conn.execute("PRAGMA table_info(projects)").fetchall()]
            if "point_cost_deci" not in proj_cols:
                conn.execute("ALTER TABLE projects ADD COLUMN point_cost_deci INTEGER NOT NULL DEFAULT 5")
            if "is_downloadable" not in proj_cols:
                conn.execute("ALTER TABLE projects ADD COLUMN is_downloadable INTEGER NOT NULL DEFAULT 0")
            if "download_count" not in proj_cols:
                conn.execute("ALTER TABLE projects ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0")
        except Exception as e:
            print(f"[DB] Warning: could not add points columns to projects: {e}")

        # Migrate: points_granted_deci on payment_records
        try:
            pr_cols = [r[1] for r in conn.execute("PRAGMA table_info(payment_records)").fetchall()]
            if "points_granted_deci" not in pr_cols:
                conn.execute("ALTER TABLE payment_records ADD COLUMN points_granted_deci INTEGER NOT NULL DEFAULT 0")
        except Exception as e:
            print(f"[DB] Warning: could not add points_granted_deci to payment_records: {e}")

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
    except Exception as e:
        print(f"[DB] Warning: could not add points columns to projects: {e}")

    # Migrate: points_granted_deci on payment_records
    try:
        pr_cols = [r[1] for r in conn.execute("PRAGMA table_info(payment_records)").fetchall()]
        if "points_granted_deci" not in pr_cols:
            conn.execute("ALTER TABLE payment_records ADD COLUMN points_granted_deci INTEGER NOT NULL DEFAULT 0")
    except Exception as e:
        print(f"[DB] Warning: could not add points_granted_deci to payment_records: {e}")

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
