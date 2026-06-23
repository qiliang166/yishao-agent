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
        # Seed column configs if empty
        existing = conn.execute("SELECT COUNT(*) FROM column_configs").fetchone()[0]
        if existing == 0:
            RULES_COL4 = """{"design_rules":{"color_discipline":"从模板母版中提取实际配色方案。配色应克制，不超过3种功能色（主色/底色/点缀色）。底色不可用纯白 #FFFFFF，字色不可用纯黑 #000000。保持模板原有配色，不做重新设计。","font_discipline":"从模板占位符中提取实际字体和字号。字体应有清晰的三级分工：标题（最大最粗）、二级标题（中等粗细）、正文（常规）。保持模板原有字体设置，不做重新设计。","layout_discipline":"从模板母版中提取实际版式列表。版式应覆盖内容结构所需的所有页面类型，各版式之间应有清晰的视觉层次区分。","slide_discipline":"从模板中提取实际幻灯片尺寸和比例。保持模板原有尺寸。","branding_discipline":"从模板中识别品牌区域（页脚/页眉/logo位置）。保持模板原有的品牌信息位置。","typography_spec":{"body_font_size_pt":{"extract":"母版 bodyStyle 中最频繁字号；若无则检查占位符 defRPr[@sz]","fallback":18,"rationale":"ISO/IEC 29500 默认 18pt"},"title_font_size_pt":{"extract":"母版 titleStyle 字号；若无则检查布局标题占位符 defRPr[@sz]","fallback":36,"rationale":"国开标准标题 >= 36pt"},"line_height_ratio":{"extract":"母版 bodyPr.normAutofit.fontScale；若无则 para.pPr.lnSpc.spcPct/100000","fallback":1.2,"rationale":"国开标准行距 1.0-1.5 倍，SJ/T 11841.6.1 推荐 >= 1.2"}}},"layout_types":[{"id":"cover","name":"封面","zones":["title","subtitle","date"],"description":"菜品名 + 类型 + 日期"},{"id":"toc","name":"目录页","zones":["heading","items"],"description":"章节概览列表"},{"id":"technique","name":"技法分析页","zones":["heading","operation","principle","params"],"description":"单个技法的深度分析"},{"id":"comparison","name":"对比页","zones":["heading","left","right"],"description":"传统 vs 创新对比"},{"id":"key_params","name":"关键参数页","zones":["heading","big_number","label","notes"],"description":"大字数据 + 参数说明"},{"id":"summary","name":"总结页","zones":["review","key_points","signature"],"description":"核心技法回顾 + 署名"}],"components":{"fonts":{"title":{"size":"36-44pt","weight":"bold","color":"primary"},"heading":{"size":"24-30pt","weight":"600","color":"primary"},"body":{"size":"14-18pt","weight":"400","color":"text"},"annotation":{"size":"10-12pt","weight":"400","color":"muted"}},"grid":{"margins":{"top":"1.5cm","bottom":"1.5cm","left":"2cm","right":"2cm"},"columns":2,"gap":"0.5cm"},"callouts":[{"id":"tip","name":"小提示","style":"左边框绿色，浅绿背景","usage":"补充技巧或优化建议"},{"id":"warning","name":"安全红线","style":"左边框琥珀色，浅琥珀背景","usage":"涉及温度、油溅、消毒等安全要点"},{"id":"key_point","name":"关键点","style":"左边框主题色，浅主题色背景","usage":"核心技法或不可省略的步骤"},{"id":"quote","name":"引用","style":"左边框灰色，斜体","usage":"引用经典菜谱或师传口诀"}],"stats":[{"id":"big_number","name":"大字数据","description":"大号数字 + 下方标签，用于突出关键参数"},{"id":"comparison","name":"对比","description":"左右并排数据对比"},{"id":"steps_bar","name":"步骤条","description":"横向步骤进度条，用于流程概览"}],"pipeline":[{"id":"horizontal","name":"横向流程","description":"左→右箭头链，用于线性步骤"},{"id":"vertical","name":"纵向时间线","description":"上→下时间线"},{"id":"branch","name":"判断分支","description":"条件判断→分支处理，用于故障诊断"}]},"content_spec":"# {菜品名} — 道与术解析\n\n## 封面\n- 菜品名\n- 菜品类型\n- 解析日期\n\n## 技法深度分析\n### {技法名}\n- 操作要点\n- 科学原理\n- 关键参数\n\n（每个技法一页）\n\n## 总结\n- 核心技法回顾","image_rules":{"types":[{"id":"technique_demo","name":"技法演示图","ratio":"16:9","description":"关键技法操作示意"},{"id":"ingredient_shot","name":"食材特写","ratio":"4:3","description":"核心食材高清特写"},{"id":"process_flow","name":"流程图","ratio":"16:9","description":"步骤流程可视化"},{"id":"final_dish","name":"成品图","ratio":"16:9","description":"菜品成品展示"}],"generation_prompt":"你是食物摄影专家。请为以下内容生成配图：{context}。风格：专业厨房场景、自然光、高分辨率。比例：{ratio}。","placement":"每张幻灯片最多 1 张配图。封面和总结页可用全幅背景图，内容页为内嵌图（占 1/2 或 1/3 版面）。"},"clarification_questions":[{"id":"q1","question":"受众是谁？分享场景？","why":"决定语言风格和深度"},{"id":"q2","question":"分享时长？","why":"15分钟≈10页，30分钟≈20页"},{"id":"q3","question":"有没有原始素材（文档/数据/旧菜谱）？","why":"有素材就基于素材，没有就搭骨架"},{"id":"q4","question":"有没有图片？放在哪？","why":"确定图片路径和命名规则"},{"id":"q5","question":"模板的配色风格是否符合内容主题？需要调整吗？","why":"确认配色方向与内容调性一致"},{"id":"q6","question":"有没有硬约束（必须包含/禁止出现的内容）？","why":"避免返工"}],"design_principles":[{"id":"restraint","rule":"克制优于炫技","detail":"装饰仅用于强调，不喧宾夺主"},{"id":"structure","rule":"结构优于装饰","detail":"靠字号对比+网格留白，不用阴影/浮动卡片"},{"id":"font_hierarchy","rule":"字体三级分工","detail":"衬线=观点(标题) / 非衬线=信息(正文) / 等宽=元数据"},{"id":"image_first","rule":"图片是第一公民","detail":"图片优先占据视觉焦点，文字围绕图片布局"},{"id":"rhythm","rule":"节奏靠页面交替","detail":"封面/目录页与内容页交替出现，连续3页同类型=P0错误"},{"id":"terminology","rule":"术语统一","detail":"同一概念全文使用相同术语，不中英混翻"}],"page_rhythm":{"sequence":["cover","toc","content*N","summary"],"alternation_rule":"内容页之间应有节奏变化，避免连续3页同一版式","p0_violation":"连续3页同一版式类型 = P0 阻断性错误"},"checklist":{"p0_must_pass":[{"id":"P0-1","item":"所有幻灯片版式类型在 layout_types 定义范围内"},{"id":"P0-2","item":"配色符合 color_discipline 约束（不超过3种功能色，底色非纯白，字色非纯黑）"},{"id":"P0-3","item":"每页内容不超出对应版式的 zones 定义"},{"id":"P0-4","item":"字号在 components.fonts 定义的范围内"},{"id":"P0-5","item":"图片比例符合 image_rules.types 中的规定"},{"id":"P0-6","item":"无连续3页同一版式类型（page_rhythm 硬约束）"}],"p1_should_pass":[{"id":"P1-1","item":"封面包含全部必需元素（title, subtitle, date）"},{"id":"P1-2","item":"内容页标题与正文层级正确"},{"id":"P1-3","item":"配图与内容语义匹配"},{"id":"P1-4","item":"字重阶梯正确应用（标题最粗、二级中等、正文常规）"},{"id":"P1-5","item":"callout 类型选择恰当（tip/warning/key_point/quote）"}],"p2_suggested":[{"id":"P2-1","item":"无单页文字过密（超过 3 个要点则分页）"},{"id":"P2-2","item":"整体页数在合理范围（8-20页）"},{"id":"P2-3","item":"同页面不超过 3 种颜色"}],"p3_optional":[{"id":"P3-1","item":"页面节奏合理：cover → toc → content×N → summary"},{"id":"P3-2","item":"stats 组件使用恰当（big_number/comparison/steps_bar）"},{"id":"P3-3","item":"pipeline 组件正确表达流程关系"}]},"analysis_rules":"你是PPT模板分析专家。请分析下方PPTX结构，在以下约束框架内输出：\n\n1. 识别每张幻灯片对应的版式类型（cover/toc/technique/comparison/key_params/summary）\n2. 提取每个占位符的内容分区归属\n3. 从模板母版中提取实际配色方案（主色/底色/点缀色），按 color_discipline 规则审视\n4. 从模板占位符中提取实际字体设置（名称/字号/粗细），按 font_discipline 规则审视\n5. 基于以上分析，生成该模板专属的完整 prompt 和 SKILL\n\n约束：\n- 版式类型必须在栏目定义的 layout_types 范围内\n- 从模板中提取实际颜色和字体，不预设配色方案\n- 输出格式必须符合栏目的 content_spec 规范\n- 遵守 design_principles 中的所有铁律\n- 遵守 page_rhythm 中的页面节奏规则\n- prompt 应完整包含：角色设定、从模板提取的实际样式描述（颜色/字体/版式）、内容规范引用、版式选择规则、输出格式要求\n- skill 应为完整的 Markdown 模板，包含 content_spec 规定的完整结构\n- 输出JSON格式：{prompt, skill}"}"""
            RULES_COL5 = """{"design_rules":{"color_discipline":"从模板母版中提取实际配色方案。配色应克制，不超过3种功能色（主色/底色/点缀色）。底色不可用纯白 #FFFFFF，字色不可用纯黑 #000000。保持模板原有配色，不做重新设计。","font_discipline":"从模板占位符中提取实际字体和字号。字体应有清晰的三级分工：标题（最大最粗）、二级标题（中等粗细）、正文（常规）。保持模板原有字体设置，不做重新设计。","layout_discipline":"从模板母版中提取实际版式列表。版式应覆盖内容结构所需的所有页面类型，各版式之间应有清晰的视觉层次区分。","slide_discipline":"从模板中提取实际幻灯片尺寸和比例。保持模板原有尺寸。","branding_discipline":"从模板中识别品牌区域（页脚/页眉/logo位置）。保持模板原有的品牌信息位置。","typography_spec":{"body_font_size_pt":{"extract":"母版 bodyStyle 中最频繁字号；若无则检查占位符 defRPr[@sz]","fallback":18,"rationale":"ISO/IEC 29500 默认 18pt"},"title_font_size_pt":{"extract":"母版 titleStyle 字号；若无则检查布局标题占位符 defRPr[@sz]","fallback":36,"rationale":"国开标准标题 >= 36pt"},"line_height_ratio":{"extract":"母版 bodyPr.normAutofit.fontScale；若无则 para.pPr.lnSpc.spcPct/100000","fallback":1.2,"rationale":"国开标准行距 1.0-1.5 倍，SJ/T 11841.6.1 推荐 >= 1.2"}}},"layout_types":[{"id":"cover","name":"封面","zones":["title","subtitle","date","author"],"description":"菜品名 + 实训日期 + 制作人"},{"id":"toc","name":"目录页","zones":["heading","chapters"],"description":"六大章节概览"},{"id":"content","name":"教学页","zones":["heading","steps","image"],"description":"教学步骤 + 配图说明"},{"id":"food_archive","name":"食材档案页","zones":["food_name","params","mechanism","substitutes"],"description":"食材科学档案卡片"},{"id":"skill_card","name":"技法卡片页","zones":["skill_name","description","flowchart","migration"],"description":"技法流程图+迁移应用"},{"id":"troubleshoot","name":"故障诊断页","zones":["problem","cause","solution","prevention"],"description":"常见问题诊断与解决"},{"id":"closing","name":"收束页","zones":["summary","signature"],"description":"总结 + 署名"}],"components":{"fonts":{"title":{"size":"36-44pt","weight":"bold","color":"primary"},"heading":{"size":"24-30pt","weight":"600","color":"primary"},"body":{"size":"14-18pt","weight":"400","color":"text"},"annotation":{"size":"10-12pt","weight":"400","color":"muted"}},"grid":{"margins":{"top":"1.5cm","bottom":"1.5cm","left":"2cm","right":"2cm"},"columns":2,"gap":"0.5cm"},"callouts":[{"id":"tip","name":"小提示","style":"左边框绿色，浅绿背景","usage":"补充技巧或优化建议"},{"id":"warning","name":"安全红线","style":"左边框琥珀色，浅琥珀背景","usage":"涉及温度、油溅、消毒等安全要点"},{"id":"key_point","name":"关键点","style":"左边框主题色，浅主题色背景","usage":"核心技法或不可省略的步骤"},{"id":"quote","name":"引用","style":"左边框灰色，斜体","usage":"引用经典菜谱或师传口诀"}],"stats":[{"id":"big_number","name":"大字数据","description":"大号数字 + 下方标签，用于突出关键参数"},{"id":"comparison","name":"对比","description":"左右并排数据对比"},{"id":"steps_bar","name":"步骤条","description":"横向步骤进度条，用于流程概览"}],"pipeline":[{"id":"horizontal","name":"横向流程","description":"左→右箭头链，用于线性步骤"},{"id":"vertical","name":"纵向时间线","description":"上→下时间线"},{"id":"branch","name":"判断分支","description":"条件判断→分支处理，用于故障诊断"}]},"content_spec":"# 菜肴研习手册：{菜品名}\n\n## 一、风味与质地预置\n### 香气构成\n| 香气类型 | 来源食材 | 强度 | 备注 |\n|----------|----------|------|------|\n\n### 口感三阶递进\n入口初感 → 咀嚼中段 → 回味余韵\n\n## 二、烹饪原理清单\n| 烹饪化学原理 | 应用位置 | 作用 |\n|--------------|----------|------|\n\n## 三、深度剖析SOP\n### 关键步骤深度卡片\n**步骤一：{步骤名}**\n| 维度 | 内容 |\n|------|------|\n| 操作与观察 | |\n| 科学原理与技法要义 | |\n| 迁移思考与风险规避 | |\n\n## 四、食材科学档案\n### 食材档案：{食材名}\n| 维度 | 内容 |\n|------|------|\n| 角色 | |\n| 黄金参数 | |\n| 作用机理 | |\n| 替代与风险 | |\n\n## 五、专项技能工具箱\n### 技法卡片：{技法名}\n| 维度 | 内容 |\n|------|------|\n| 技法描述 | |\n| 本菜应用 | |\n| 科学本质 | |\n| 可迁移至 | |\n\n## 六、故障诊断与学习复盘\n### 常见缺陷诊断树\n| 常见问题 | 原因分析 | 解决方案 | 预防措施 |\n|----------|----------|----------|----------|","image_rules":{"types":[{"id":"food_archive","name":"食材档案图","ratio":"4:3","description":"食材科学档案配图"},{"id":"technique_card","name":"技法卡片图","ratio":"16:9","description":"技法流程可视化"},{"id":"troubleshooting_diagram","name":"故障诊断图","ratio":"16:9","description":"分支判断流程图"},{"id":"step_illustration","name":"步骤示意图","ratio":"16:9","description":"关键步骤操作示意"}],"generation_prompt":"你是食物摄影与教学图表专家。请为以下内容生成配图：{context}。风格：专业厨房场景、科学教学模式、自然光、高分辨率。比例：{ratio}。","placement":"每张幻灯片最多 1 张配图。封面和收束页可用全幅背景图，教学页和食材档案页为内嵌图（占 1/2 版面）。"},"clarification_questions":[{"id":"q1","question":"受众是谁？分享场景？","why":"决定语言风格和深度"},{"id":"q2","question":"分享时长？","why":"15分钟≈10页，30分钟≈20页"},{"id":"q3","question":"有没有原始素材（文档/数据/旧菜谱）？","why":"有素材就基于素材，没有就搭骨架"},{"id":"q4","question":"有没有图片？放在哪？","why":"确定图片路径和命名规则"},{"id":"q5","question":"模板的配色风格是否符合内容主题？需要调整吗？","why":"确认配色方向与内容调性一致"},{"id":"q6","question":"有没有硬约束（必须包含/禁止出现的内容）？","why":"避免返工"}],"design_principles":[{"id":"restraint","rule":"克制优于炫技","detail":"装饰仅用于强调，不喧宾夺主"},{"id":"structure","rule":"结构优于装饰","detail":"靠字号对比+网格留白，不用阴影/浮动卡片"},{"id":"font_hierarchy","rule":"字体三级分工","detail":"衬线=观点(标题) / 非衬线=信息(正文) / 等宽=元数据"},{"id":"image_first","rule":"图片是第一公民","detail":"图片优先占据视觉焦点，文字围绕图片布局"},{"id":"rhythm","rule":"节奏靠页面交替","detail":"封面/目录页与内容页交替出现，连续3页同类型=P0错误"},{"id":"terminology","rule":"术语统一","detail":"同一概念全文使用相同术语，不中英混翻"}],"page_rhythm":{"sequence":["cover","toc","content*N","closing"],"alternation_rule":"内容页之间应有节奏变化，避免连续3页同一版式","p0_violation":"连续3页同一版式类型 = P0 阻断性错误"},"checklist":{"p0_must_pass":[{"id":"P0-1","item":"所有幻灯片版式类型在 layout_types 定义范围内"},{"id":"P0-2","item":"配色符合 color_discipline 约束（不超过3种功能色，底色非纯白，字色非纯黑）"},{"id":"P0-3","item":"每页内容不超出对应版式的 zones 定义"},{"id":"P0-4","item":"字号在 components.fonts 定义的范围内"},{"id":"P0-5","item":"图片比例符合 image_rules.types 中的规定"},{"id":"P0-6","item":"无连续3页同一版式类型（page_rhythm 硬约束）"}],"p1_should_pass":[{"id":"P1-1","item":"封面包含全部必需元素（title, subtitle, date, author）"},{"id":"P1-2","item":"六大章节结构完整，不可省略任何章节"},{"id":"P1-3","item":"配图与内容语义匹配"},{"id":"P1-4","item":"字重阶梯正确应用（标题最粗、二级中等、正文常规）"},{"id":"P1-5","item":"callout 类型选择恰当（tip/warning/key_point/quote）"}],"p2_suggested":[{"id":"P2-1","item":"无单页文字过密（超过 3 个要点则分页）"},{"id":"P2-2","item":"整体页数在合理范围（12-30页，六大章节）"},{"id":"P2-3","item":"同页面不超过 3 种颜色"}],"p3_optional":[{"id":"P3-1","item":"页面节奏合理：cover → toc → content×N → closing"},{"id":"P3-2","item":"stats 组件使用恰当（big_number/comparison/steps_bar）"},{"id":"P3-3","item":"pipeline 组件正确表达流程关系"}]},"analysis_rules":"你是PPT模板分析专家。请分析下方PPTX结构，在以下约束框架内输出：\n\n1. 识别每张幻灯片对应的版式类型（cover/toc/content/food_archive/skill_card/troubleshoot/closing）\n2. 提取每个占位符的内容分区归属\n3. 从模板母版中提取实际配色方案（主色/底色/点缀色），按 color_discipline 规则审视\n4. 从模板占位符中提取实际字体设置（名称/字号/粗细），按 font_discipline 规则审视\n5. 基于以上分析，生成该模板专属的完整 prompt 和 SKILL\n\n约束：\n- 版式类型必须在栏目定义的 layout_types 范围内\n- 从模板中提取实际颜色和字体，不预设配色方案\n- 输出格式必须符合栏目的 content_spec 规范（六大章节不可省略）\n- 遵守 design_principles 中的所有铁律\n- 遵守 page_rhythm 中的页面节奏规则\n- prompt 应完整包含：角色设定、从模板提取的实际样式描述（颜色/字体/版式）、内容规范引用、版式选择规则、输出格式要求\n- skill 应为完整的 Markdown 模板，包含六大章节结构、表格、mermaid 图表占位符\n- 输出JSON格式：{prompt, skill}"}"""
            defaults = [
                ('c1-text', 'col1', '直接输入', '你是国家高级烹饪技师、菜谱SOP规范整理专家。请将用户手打输入的食谱笔记整理为标准SOP文档。', '## 菜名\n**菜名**：\n...', 0, '{}', 0),
                ('c1-video', 'col1', '视频链接', '你是国家高级烹饪技师、菜谱SOP规范整理专家。请根据视频相关内容提取完整的食谱SOP文档。', '## 菜名\n**菜名**：\n...', 0, '{}', 1),
                ('c1-file', 'col1', '导入文件', '你是国家高级烹饪技师、菜谱SOP规范整理专家。请从上传文件中提取完整食谱内容，整理为标准SOP文档。', '## 菜名\n**菜名**：\n...', 0, '{}', 2),
                ('c2-sop', 'col2', 'SOP 文案', '你是一名国家高级烹饪技师 & 食品科学与工程硕士及美食鉴赏专家。请根据下方提供的研发笔记内容，完成以下三个任务，并按指定的格式输出。要求输出的口吻要谦虚，不要以点评的角度去评判，要以学习者客观的分析、客观的叙述的口吻去分析和总结，整理成逻辑正确、并通行的谦逊做优化方案，不可以以专家自居。\n\n## 任务要求\n\n### 任务一：提取原始SOP（阅读笔记）\n- 识别研发笔记中的错字和表述不当之处，直接修正，不要标注或说明修改了什么。\n- 不得违背原稿大意，尤其不得更改原件中的任何配比。\n- 对于原稿件中无法判别真实表述的内容，保留原文并在括号内简要标注，如"小马兜（原文如此）"，不要使用【备注】【修正说明】等长篇标注格式。\n- 按下方【第一部分：阅读笔记 输出格式】输出。\n\n### 任务二：总结分析与改进建议（分析笔记）\n- 以"国家高级烹饪技师 & 食品科学与工程硕士的技能分析菜谱"的身份，对这道菜进行总结技法以及原理分析，客观谦逊的口吻。\n- 从传统与创新角度给出修改意见，要求科学严谨、有理有据。\n- 按下方【第二部分：优化总结 输出格式】输出。\n\n### 任务三：输出优化版SOP（优化笔记）\n- 结合任务一的原始内容和任务二的改进建议，按【第三部分：研发笔记（优化版） 输出格式】输出一份优化后的SOP。\n- 优化版SOP中可以调整配比、增减食材、修改步骤等，但需在相应位置用【优化说明：...】注明修改理由。\n\n最终输出顺序：第一部分 → 第二部分 → 第三部分，每个部分之间用一行 `---` 分隔。直接输出结果，不要添加任何开场白、说明文字或任务介绍。', '## 第一部分：阅读笔记\n\n**标题：** {菜品名}学习笔记\n**编写日期：** {YYYY-MM-DD}\n**菜品类型：** {热菜/凉菜/汤羹等}\n**菜品主材：** {主要食材名称}\n\n### 一、菜肴信息\n\n| 项目 | 内容 |\n|------|------|\n| 菜肴名称 | |\n| 菜肴类型 | |\n| 菜肴地域 | |\n| 成品特征 | |\n| 出品标准 | |\n| 特点 | |\n\n### 二、食材清单（按一份例牌，注明份量基准）\n\n| 序号 | 食材类型 | 食材名称 | 品牌 | 加工说明 | 加工要求 | 用量 | 单位 |\n|------|----------|----------|------|----------|----------|------|------|\n| 1 | | | | | | | |\n\n> 说明：如需批量预制，可按比例放大。\n\n### 三、操作步骤\n\n| 序号 | 关键词 | 工具与器皿 | 操作说明 | 注意事项 |\n|------|--------|-----------|----------|----------|\n| 1 | | | | |\n\n### 四、出品标准与关键控制点\n\n| 指标 | 要求 |\n|------|------|\n| 色泽 | |\n| 香气 | |\n| 口感 | |\n| 口味 | |\n| 温度 | |\n\n**关键技巧总结：**\n-\n\n---\n\n## 第二部分：分析总结\n\n### 一、总体分析\n\n**优点：**\n1.\n\n**可改进之处：**\n1.\n\n### 二、修改思路\n\n#### 1. {方面一}\n- 原问题：\n- 建议修改：\n- 理由：\n\n#### 2. {方面二}\n- 原问题：\n- 建议修改：\n- 理由：\n\n### 三、总结\n\n\n---\n\n## 第三部分：研发笔记（优化版）\n\n**标题：** {菜品名}学习笔记（优化版）\n**编写日期：** {YYYY-MM-DD}\n**菜品类型：** {热菜/凉菜/汤羹等}\n**菜品主材：** {主要食材名称}\n\n### 一、菜肴信息\n\n| 项目 | 内容 |\n|------|------|\n| 菜肴名称 | |\n| 菜肴类型 | |\n| 菜肴地域 | |\n| 成品特征 | |\n| 出品标准 | |\n| 特点 | |\n\n### 二、食材清单（按一份例牌，注明份量基准）\n\n| 序号 | 食材类型 | 食材名称 | 品牌 | 加工说明 | 加工要求 | 用量 | 单位 | 参考成本 | 单位 |\n|------|----------|----------|------|----------|----------|------|------|------|------|\n| 1 | | | | | | | | | |\n\n> 说明：如需批量预制，可按比例放大。\n\n### 三、操作步骤\n\n| 序号 | 工具与器皿 | 关键词 | 操作说明 | 注意事项 |\n|------|-----------|--------|----------|----------|\n| 1 | | | | |\n\n### 四、出品标准与关键控制点\n\n| 指标 | 要求 |\n|------|------|\n| 色泽 | |\n| 香气 | |\n| 口感 | |\n| 口味 | |\n| 温度 | |\n\n**关键技巧总结：**\n-\n\n### 五、与原版的主要改进对比\n\n| 原版问题 | 优化方案 |\n|----------|----------|\n| | |', 0, '{}', 3),
                ('c2-dao', 'col2', '道与术文案', '你是国家级烹饪大师、食品科学家。请对食谱SOP进行道与术深度解析。直接输出解析内容，不要添加任何开场白、问候语或任务说明。', '# {菜品名称} — 道与术解析', 0, '{}', 4),
                ('c2-yanxi', 'col2', '研学手册文案', '你是一位集以下身份于一体的专家：国家级烹饪大师（精通中餐、西餐）、食品科学家（擅长烹饪化学、物理变化、食品安全）、技法和标准化流程的美食技术专家，《粤厨宝典》知识传承者、资深教学设计师。你的任务是根据用户提供的食谱信息，生成一份专业、可落地、兼具科学深度与实操指导的《菜肴研习手册》。\n\n核心原则：\n1. 忠实原文：采集表中已填写的内容必须直接采用，不得篡改。\n2. 标记缺失：原文未提及但关键的参数，用 [原文未提及，建议：XXX] 明确标出，不得凭空编造。\n3. 服务对象：手册必须服务于专业厨房；使用图标 📘专业厨房 ⚠️安全红线 💡小提示。\n4. 原理显性化：每个关键步骤必须解释背后的烹饪化学/物理原理，用"本质上是……"句式揭示底层逻辑。\n5. 感官化语言：多用比喻、类比（如"像芝麻粒大小的气泡""敲击时如薄瓷碎裂"）。\n6. 安全红线：涉及温度、消毒、油溅、中心熟成温度等，必须用 ⚠️ 明确警示。\n\n请严格按照以下 SKILL 模板结构直接输出，不要添加任何开场白、问候语或自我介绍。\n\n输出格式硬性约束：你必须完全按照下方 SKILL 模板的六个章节（一至六）结构和顺序输出，表格列和 mermaid 图表必须保留。禁止自行创建章节、合并章节、省略任何章节。你只需要将模板中的占位符（如 {菜品名称}、[步骤名称] 等）替换为实际内容，在表格空白处填入具体数据，但不得改变任何章节的结构、标题和顺序。', '# 菜肴研习手册：{菜品名称}\n\n## 一、风味与质地预置\n\n### 香气构成\n| 香气类型 | 来源食材 | 强度 | 备注 |\n|----------|----------|------|------|\n| | | ████░ | |\n\n### 口感三阶递进\n```mermaid\nflowchart LR\n    A[入口初感] --> B[咀嚼中段] --> C[回味余韵]\n```\n\n### 色泽形成路径\n```mermaid\nflowchart LR\n    A[原料本色] --> B[加热变色] --> C[调味上色] --> D[成品色泽]\n```\n\n## 二、烹饪原理清单\n\n| 烹饪化学原理 | 应用位置 | 作用 |\n|--------------|----------|------|\n| 美拉德反应 | | |\n| 焦糖化反应 | | |\n\n## 三、深度剖析SOP\n\n### 总体步骤流程\n```mermaid\nflowchart LR\n    A[备料] --> B[预处理] --> C[烹饪] --> D[调味] --> E[出品]\n```\n\n### 关键步骤深度卡片\n\n**步骤一：[步骤名称]**\n\n| 维度 | 内容 |\n|------|------|\n| 操作与观察 | |\n| 科学原理与技法要义 | 核心技法：\n本质上是……\n⚠️关键参数： |\n| 迁移思考与风险规避 | 举一反三：\n若失败：\n测试实验： |\n\n**步骤二：[步骤名称]**\n（同上结构）\n\n**步骤三：[步骤名称]**\n（同上结构）\n\n**步骤四：[步骤名称]**\n（同上结构）\n\n## 四、食材科学档案\n\n### 食材档案01：[食材名称]\n| 维度 | 内容 |\n|------|------|\n| 角色 | |\n| 黄金参数 | |\n| 作用机理 | |\n| 替代与风险 | |\n\n### 食材档案02：[食材名称]\n（同上结构）\n\n## 五、专项技能工具箱\n\n### 技法卡片01：[技法名称]\n```mermaid\nflowchart LR\n    A[步骤一] -->|关键动作| B[步骤二] -->|关键动作| C[步骤三]\n```\n\n| 维度 | 内容 |\n|------|------|\n| 技法描述 | |\n| 本菜应用 | |\n| 科学本质 | |\n| 可迁移至 | |\n\n### 技法卡片02：[技法名称]\n```mermaid\nflowchart TD\n    A{判断条件}\n    A -->|是| B[操作A]\n    A -->|否| C[操作B]\n```\n\n| 维度 | 内容 |\n|------|------|\n| 技法描述 | |\n| 本菜应用 | |\n| 科学本质 | |\n| 可迁移至 | |\n\n## 六、故障诊断与学习复盘\n\n### 常见缺陷诊断树\n```mermaid\nflowchart TD\n    A{缺陷现象} -->|原因A| B[解决方案A]\n    A -->|原因B| C[解决方案B]\n    A -->|原因C| D[解决方案C]\n```\n\n### 解决方案对照表\n| 常见问题 | 原因分析 | 解决方案 | 预防措施 |\n|----------|----------|----------|----------|\n| | | | |\n\n> 📘专业厨房 ⚠️安全红线 💡小提示', 0, '{}', 5),
                ('c3-sop', 'col3', 'SOP 生成+导出', '你是一个餐饮标准化专家。请根据食谱笔记，编写SOP。', '| 步骤 | 操作 | 标准 |\n|------|------|------|', 1, '{}', 6),
                ('c4-dao', 'col4', '道与术 PPT', '你是国家级烹饪大师、食品科学家兼PPT内容设计专家。请根据道与术解析文案，生成一份专业PPT。\n\n## 约束规则\n- 版式：封面→目录→技法分析×N→总结。连续3页同一版式=P0错误\n- 配色：使用模板实际配色方案。配色应克制，不超过3种功能色，底色禁用#FFF，字色禁用#000\n- 字体三级：标题=bold 36-44pt / 标题=600 24-30pt / 正文=400 14-18pt\n- 配图：每页最多1张，技法页可配技法演示图(16:9)或食材特写(4:3)\n- 组件：使用 tip/warning/key_point callout，big_number/comparison/steps_bar stats\n- 页数：8-20页\n- 口吻：客观、谦逊，不以专家自居\n\n直接输出PPT内容，严格按下方SKILL模板结构。', '## {菜品名} — 道与术解析\n\n### 封面\n- 菜品名：{菜品名}\n- 菜品类型：{类型}\n- 解析日期：{日期}\n\n---\n\n### 目录\n1. 技法深度分析\n   - {技法一}\n   - {技法二}\n2. 关键参数\n3. 传统 vs 创新对比\n4. 总结\n\n---\n\n### {技法一} — 操作要点\n| 维度 | 内容 |\n|------|------|\n| 操作步骤 | |\n| 关键观察 | |\n| 注意事项 | |\n\n> 💡 小提示：\n\n### {技法一} — 科学原理\n| 维度 | 内容 |\n|------|------|\n| 核心技法 | |\n| 科学本质 | |\n| ⚠️ 关键参数 | |\n\n---\n\n### {技法二} — 操作要点\n（同上结构）\n\n### {技法二} — 科学原理\n（同上结构）\n\n---\n\n### 关键参数\n| 参数 | 数值 | 说明 |\n|------|------|------|\n| | | |\n\n---\n\n### 传统 vs 创新\n| 维度 | 传统做法 | 创新优化 |\n|------|----------|----------|\n| | | |\n\n---\n\n### 总结\n- 核心技法回顾：\n- 学习要点：\n- 迁移应用：', 1, RULES_COL4, 7),
                ('c4-yanxi', 'col5', '研学手册 PPT', '你是集国家级烹饪大师、食品科学家、教学设计师于一体的专家。请根据研学手册内容，生成一份专业教学PPT。\n\n## 约束规则\n- 版式：封面→目录→教学×N→食材档案×N→技法卡片×N→故障诊断→收束。连续3页同一版式=P0错误\n- 配色：仅从5套预设中选择，底色禁用#FFF，字色禁用#000\n- 字体三级：标题=bold 36-44pt / 标题=600 24-30pt / 正文=400 14-18pt\n- 配图：每页最多1张，食材档案配4:3特写，技法卡片配16:9流程图\n- 组件：使用 tip/warning/key_point callout，pipeline 表达流程关系\n- 页数：12-30页，六大章节结构不可省略\n- 口吻：客观、科学、谦逊\n- 使用图标 📘专业厨房 ⚠️安全红线 💡小提示\n\n直接输出PPT内容，严格按下方SKILL模板的六大章节结构。', '# 菜肴研习手册：{菜品名}\n\n## 一、风味与质地预置\n\n### 香气构成\n| 香气类型 | 来源食材 | 强度 | 备注 |\n|----------|----------|------|------|\n| | | | |\n\n### 口感三阶递进\n入口初感 → 咀嚼中段 → 回味余韵\n\n---\n\n## 二、烹饪原理清单\n\n| 烹饪化学原理 | 应用位置 | 作用 |\n|--------------|----------|------|\n| 美拉德反应 | | |\n| 焦糖化反应 | | |\n\n---\n\n## 三、深度剖析SOP\n\n### {步骤一}\n| 维度 | 内容 |\n|------|------|\n| 操作与观察 | |\n| 科学原理与技法要义 | 核心技法：\n本质上是……\n⚠️关键参数： |\n| 迁移思考与风险规避 | 举一反三：\n若失败：\n测试实验： |\n\n### {步骤二}\n（同上）\n\n---\n\n## 四、食材科学档案\n\n### {食材一}\n| 维度 | 内容 |\n|------|------|\n| 角色 | |\n| 黄金参数 | |\n| 作用机理 | |\n| 替代与风险 | |\n\n---\n\n## 五、专项技能工具箱\n\n### {技法一}\n| 维度 | 内容 |\n|------|------|\n| 技法描述 | |\n| 本菜应用 | |\n| 科学本质 | |\n| 可迁移至 | |\n\n---\n\n## 六、故障诊断与学习复盘\n\n| 常见问题 | 原因分析 | 解决方案 | 预防措施 |\n|----------|----------|----------|----------|\n| | | | |\n\n> 📘专业厨房 ⚠️安全红线 💡小提示', 1, RULES_COL5, 8),
                ('c5-koubo', 'col6', '口播稿生成', '你是一个短视频口播稿专家。请生成口播稿。', '# 口播稿\n\n【开场】\n【内容】\n【结尾】', 0, '{}', 9),
            ]
            for d in defaults:
                conn.execute(
                    "INSERT INTO column_configs (id, column_id, label, prompt, skill, has_template, rules, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    d
                )
        conn.commit()
    finally:
        conn.close()
    print(f"[DB] Initialized at {DB_PATH}")


if __name__ == "__main__":
    init_db()
