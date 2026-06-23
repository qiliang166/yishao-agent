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

        # Migrate column_configs for column split (existing DBs)
        conn.execute("UPDATE column_configs SET column_id='col5', sort_order=8 WHERE id='c4-yanxi' AND column_id='col4'")
        conn.execute("UPDATE column_configs SET column_id='col6', sort_order=9 WHERE id='c5-koubo' AND column_id='col5'")

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
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Seed column configs if empty
        existing = conn.execute("SELECT COUNT(*) FROM column_configs").fetchone()[0]
        if existing == 0:
            defaults = [
                ('c1-text', 'col1', '直接输入', '你是国家高级烹饪技师、菜谱SOP规范整理专家。请将用户手打输入的食谱笔记整理为标准SOP文档。', '## 菜名\n**菜名**：\n...', 0, 0),
                ('c1-video', 'col1', '视频链接', '你是国家高级烹饪技师、菜谱SOP规范整理专家。请根据视频相关内容提取完整的食谱SOP文档。', '## 菜名\n**菜名**：\n...', 0, 1),
                ('c1-file', 'col1', '导入文件', '你是国家高级烹饪技师、菜谱SOP规范整理专家。请从上传文件中提取完整食谱内容，整理为标准SOP文档。', '## 菜名\n**菜名**：\n...', 0, 2),
                ('c2-sop', 'col2', 'SOP 文案', '你是一名国家高级烹饪技师 & 食品科学与工程硕士及美食鉴赏专家。请根据下方提供的研发笔记内容，完成以下三个任务，并按指定的格式输出。要求输出的口吻要谦虚，不要以点评的角度去评判，要以学习者客观的分析、客观的叙述的口吻去分析和总结，整理成逻辑正确、并通行的谦逊做优化方案，不可以以专家自居。\n\n## 任务要求\n\n### 任务一：提取原始SOP（阅读笔记）\n- 识别研发笔记中的错字和表述不当之处，直接修正，不要标注或说明修改了什么。\n- 不得违背原稿大意，尤其不得更改原件中的任何配比。\n- 对于原稿件中无法判别真实表述的内容，保留原文并在括号内简要标注，如"小马兜（原文如此）"，不要使用【备注】【修正说明】等长篇标注格式。\n- 按下方【第一部分：阅读笔记 输出格式】输出。\n\n### 任务二：总结分析与改进建议（分析笔记）\n- 以"国家高级烹饪技师 & 食品科学与工程硕士的技能分析菜谱"的身份，对这道菜进行总结技法以及原理分析，客观谦逊的口吻。\n- 从传统与创新角度给出修改意见，要求科学严谨、有理有据。\n- 按下方【第二部分：优化总结 输出格式】输出。\n\n### 任务三：输出优化版SOP（优化笔记）\n- 结合任务一的原始内容和任务二的改进建议，按【第三部分：研发笔记（优化版） 输出格式】输出一份优化后的SOP。\n- 优化版SOP中可以调整配比、增减食材、修改步骤等，但需在相应位置用【优化说明：...】注明修改理由。\n\n最终输出顺序：第一部分 → 第二部分 → 第三部分，每个部分之间用一行 `---` 分隔。直接输出结果，不要添加任何开场白、说明文字或任务介绍。', '## 第一部分：阅读笔记\n\n**标题：** {菜品名}学习笔记\n**编写日期：** {YYYY-MM-DD}\n**菜品类型：** {热菜/凉菜/汤羹等}\n**菜品主材：** {主要食材名称}\n\n### 一、菜肴信息\n\n| 项目 | 内容 |\n|------|------|\n| 菜肴名称 | |\n| 菜肴类型 | |\n| 菜肴地域 | |\n| 成品特征 | |\n| 出品标准 | |\n| 特点 | |\n\n### 二、食材清单（按一份例牌，注明份量基准）\n\n| 序号 | 食材类型 | 食材名称 | 品牌 | 加工说明 | 加工要求 | 用量 | 单位 |\n|------|----------|----------|------|----------|----------|------|------|\n| 1 | | | | | | | |\n\n> 说明：如需批量预制，可按比例放大。\n\n### 三、操作步骤\n\n| 序号 | 关键词 | 工具与器皿 | 操作说明 | 注意事项 |\n|------|--------|-----------|----------|----------|\n| 1 | | | | |\n\n### 四、出品标准与关键控制点\n\n| 指标 | 要求 |\n|------|------|\n| 色泽 | |\n| 香气 | |\n| 口感 | |\n| 口味 | |\n| 温度 | |\n\n**关键技巧总结：**\n-\n\n---\n\n## 第二部分：分析总结\n\n### 一、总体分析\n\n**优点：**\n1.\n\n**可改进之处：**\n1.\n\n### 二、修改思路\n\n#### 1. {方面一}\n- 原问题：\n- 建议修改：\n- 理由：\n\n#### 2. {方面二}\n- 原问题：\n- 建议修改：\n- 理由：\n\n### 三、总结\n\n\n---\n\n## 第三部分：研发笔记（优化版）\n\n**标题：** {菜品名}学习笔记（优化版）\n**编写日期：** {YYYY-MM-DD}\n**菜品类型：** {热菜/凉菜/汤羹等}\n**菜品主材：** {主要食材名称}\n\n### 一、菜肴信息\n\n| 项目 | 内容 |\n|------|------|\n| 菜肴名称 | |\n| 菜肴类型 | |\n| 菜肴地域 | |\n| 成品特征 | |\n| 出品标准 | |\n| 特点 | |\n\n### 二、食材清单（按一份例牌，注明份量基准）\n\n| 序号 | 食材类型 | 食材名称 | 品牌 | 加工说明 | 加工要求 | 用量 | 单位 | 参考成本 | 单位 |\n|------|----------|----------|------|----------|----------|------|------|------|------|\n| 1 | | | | | | | | | |\n\n> 说明：如需批量预制，可按比例放大。\n\n### 三、操作步骤\n\n| 序号 | 工具与器皿 | 关键词 | 操作说明 | 注意事项 |\n|------|-----------|--------|----------|----------|\n| 1 | | | | |\n\n### 四、出品标准与关键控制点\n\n| 指标 | 要求 |\n|------|------|\n| 色泽 | |\n| 香气 | |\n| 口感 | |\n| 口味 | |\n| 温度 | |\n\n**关键技巧总结：**\n-\n\n### 五、与原版的主要改进对比\n\n| 原版问题 | 优化方案 |\n|----------|----------|\n| | |', 0, 3),
                ('c2-dao', 'col2', '道与术文案', '你是国家级烹饪大师、食品科学家。请对食谱SOP进行道与术深度解析。直接输出解析内容，不要添加任何开场白、问候语或任务说明。', '# {菜品名称} — 道与术解析', 0, 4),
                ('c2-yanxi', 'col2', '研学手册文案', '你是一位集以下身份于一体的专家：国家级烹饪大师（精通中餐、西餐）、食品科学家（擅长烹饪化学、物理变化、食品安全）、技法和标准化流程的美食技术专家，《粤厨宝典》知识传承者、资深教学设计师。你的任务是根据用户提供的食谱信息，生成一份专业、可落地、兼具科学深度与实操指导的《菜肴研习手册》。\n\n核心原则：\n1. 忠实原文：采集表中已填写的内容必须直接采用，不得篡改。\n2. 标记缺失：原文未提及但关键的参数，用 [原文未提及，建议：XXX] 明确标出，不得凭空编造。\n3. 服务对象：手册必须服务于专业厨房；使用图标 📘专业厨房 ⚠️安全红线 💡小提示。\n4. 原理显性化：每个关键步骤必须解释背后的烹饪化学/物理原理，用"本质上是……"句式揭示底层逻辑。\n5. 感官化语言：多用比喻、类比（如"像芝麻粒大小的气泡""敲击时如薄瓷碎裂"）。\n6. 安全红线：涉及温度、消毒、油溅、中心熟成温度等，必须用 ⚠️ 明确警示。\n\n请严格按照以下 SKILL 模板结构直接输出，不要添加任何开场白、问候语或自我介绍。\n\n输出格式硬性约束：你必须完全按照下方 SKILL 模板的六个章节（一至六）结构和顺序输出，表格列和 mermaid 图表必须保留。禁止自行创建章节、合并章节、省略任何章节。你只需要将模板中的占位符（如 {菜品名称}、[步骤名称] 等）替换为实际内容，在表格空白处填入具体数据，但不得改变任何章节的结构、标题和顺序。', '# 菜肴研习手册：{菜品名称}\n\n## 一、风味与质地预置\n\n### 香气构成\n| 香气类型 | 来源食材 | 强度 | 备注 |\n|----------|----------|------|------|\n| | | ████░ | |\n\n### 口感三阶递进\n```mermaid\nflowchart LR\n    A[入口初感] --> B[咀嚼中段] --> C[回味余韵]\n```\n\n### 色泽形成路径\n```mermaid\nflowchart LR\n    A[原料本色] --> B[加热变色] --> C[调味上色] --> D[成品色泽]\n```\n\n## 二、烹饪原理清单\n\n| 烹饪化学原理 | 应用位置 | 作用 |\n|--------------|----------|------|\n| 美拉德反应 | | |\n| 焦糖化反应 | | |\n\n## 三、深度剖析SOP\n\n### 总体步骤流程\n```mermaid\nflowchart LR\n    A[备料] --> B[预处理] --> C[烹饪] --> D[调味] --> E[出品]\n```\n\n### 关键步骤深度卡片\n\n**步骤一：[步骤名称]**\n\n| 维度 | 内容 |\n|------|------|\n| 操作与观察 | |\n| 科学原理与技法要义 | 核心技法：\n本质上是……\n⚠️关键参数： |\n| 迁移思考与风险规避 | 举一反三：\n若失败：\n测试实验： |\n\n**步骤二：[步骤名称]**\n（同上结构）\n\n**步骤三：[步骤名称]**\n（同上结构）\n\n**步骤四：[步骤名称]**\n（同上结构）\n\n## 四、食材科学档案\n\n### 食材档案01：[食材名称]\n| 维度 | 内容 |\n|------|------|\n| 角色 | |\n| 黄金参数 | |\n| 作用机理 | |\n| 替代与风险 | |\n\n### 食材档案02：[食材名称]\n（同上结构）\n\n## 五、专项技能工具箱\n\n### 技法卡片01：[技法名称]\n```mermaid\nflowchart LR\n    A[步骤一] -->|关键动作| B[步骤二] -->|关键动作| C[步骤三]\n```\n\n| 维度 | 内容 |\n|------|------|\n| 技法描述 | |\n| 本菜应用 | |\n| 科学本质 | |\n| 可迁移至 | |\n\n### 技法卡片02：[技法名称]\n```mermaid\nflowchart TD\n    A{判断条件}\n    A -->|是| B[操作A]\n    A -->|否| C[操作B]\n```\n\n| 维度 | 内容 |\n|------|------|\n| 技法描述 | |\n| 本菜应用 | |\n| 科学本质 | |\n| 可迁移至 | |\n\n## 六、故障诊断与学习复盘\n\n### 常见缺陷诊断树\n```mermaid\nflowchart TD\n    A{缺陷现象} -->|原因A| B[解决方案A]\n    A -->|原因B| C[解决方案B]\n    A -->|原因C| D[解决方案C]\n```\n\n### 解决方案对照表\n| 常见问题 | 原因分析 | 解决方案 | 预防措施 |\n|----------|----------|----------|----------|\n| | | | |\n\n> 📘专业厨房 ⚠️安全红线 💡小提示', 0, 5),
                ('c3-sop', 'col3', 'SOP 生成+导出', '你是一个餐饮标准化专家。请根据食谱笔记，编写SOP。', '| 步骤 | 操作 | 标准 |\n|------|------|------|', 1, 6),
                ('c4-dao', 'col4', '道与术 PPT', '你是一个PPT内容设计专家。请将道与术文案转化为PPT大纲。', '## 标题页\n## 内容页', 1, 7),
                ('c4-yanxi', 'col5', '研学手册 PPT', '你是一个教学PPT设计专家。请将研学手册内容转化为PPT。', '## 封面\n## 教学页', 1, 8),
                ('c5-koubo', 'col6', '口播稿生成', '你是一个短视频口播稿专家。请生成口播稿。', '# 口播稿\n\n【开场】\n【内容】\n【结尾】', 0, 9),
            ]
            for d in defaults:
                conn.execute(
                    "INSERT INTO column_configs (id, column_id, label, prompt, skill, has_template, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    d
                )
        conn.commit()
    finally:
        conn.close()
    print(f"[DB] Initialized at {DB_PATH}")


if __name__ == "__main__":
    init_db()
