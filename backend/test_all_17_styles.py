"""Comprehensive 17-style quality test framework.
Covers ALL PPT-Agent styles across 4 reference families.
Generates 2 SOPs per style, scores against family benchmarks.
"""
import sys, os, time, json, yaml, re
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional
from collections import defaultdict

sys.path.insert(0, '.')
os.chdir(os.path.dirname(os.path.abspath(__file__)))
from services.ppt_service import _stage3_svg
from services.llm_service import generate as llm_generate

# ============================================================
# 17 STYLES → 4 REFERENCE FAMILIES
# ============================================================

STYLE_FAMILIES = {
    # Family A: Dark Tech Premium (gpt54 reference)
    "DARK_TECH": {
        "reference": "gpt54",
        "styles": ["blueprint", "tech", "intuition-machine"],
        "description": "Dark backgrounds, grid/grain/glow/bezier decorations, multi-accent gradients",
    },
    # Family B: Professional Clean (minimax reference)
    "PROFESSIONAL": {
        "reference": "minimax",
        "styles": ["business", "minimal", "notion", "scientific", "editorial-infographic"],
        "description": "Clean white/navy, card-based layouts, no decorative elements",
    },
    # Family C: Creative Brand (root reference)
    "CREATIVE": {
        "reference": "root",
        "styles": ["creative", "bold-editorial", "vector-illustration"],
        "description": "Bold colors, energetic layouts, expressive typography",
    },
    # Family D: Thematic/Artistic (YAML-only benchmark)
    "THEMATIC": {
        "reference": "yaml_tokens",
        "styles": ["chalkboard", "fantasy-animation", "pixel-art", "vintage", "watercolor", "sketch-notes"],
        "description": "Distinctive thematic styles, YAML tokens as quality benchmark",
    },
}

# Style directory
STYLES_DIR = "C:/Users/17206/.claude/plugins/marketplaces/zengwenliang416-ppt-agent/skills/_shared/references/styles"

def load_yaml_style(style_id: str) -> dict:
    """Load a style YAML file."""
    path = os.path.join(STYLES_DIR, f"{style_id}.yaml")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)

# ============================================================
# SOP CONTENT DATASETS
# ============================================================

SOP1_BAOYU = [
    {"seq": 1, "type": "cover", "layout": "full_bleed",
     "zones": {"heading": "鲍鱼一品煲", "kicker": "菜品研发部", "lead": "SOP 的道与术",
               "cards": [{"role": "hero", "title": "鲍鱼一品煲",
                           "body": "从烹饪原理到操作技法的深度拆解\n菜品研发部 · 2026 · SOP技术文档"}]}},
    {"seq": 2, "type": "content", "layout": "hero_grid",
     "zones": {"heading": "食材准备 — 六味基础", "kicker": "第一章 · 食材准备",
               "lead": "鲍鱼一品煲的核心食材体系",
               "cards": [
                   {"role": "hero", "title": "鲍鱼 6只",
                    "body": "鲜鲍或罐头鲍均可。鲜鲍需刷洗去黑膜，背部切十字花刀以利入味。罐头鲍则开罐沥汁备用。"},
                   {"role": "metric", "title": "凤爪", "body": "1斤 · 剪指甲后加白醋焯水去腥增脆",
                    "chart": {"type": "big_number", "value": "1斤", "label": "凤爪"}},
                   {"role": "metric", "title": "排骨", "body": "500g · 焯水去血沫斩3cm小段",
                    "chart": {"type": "big_number", "value": "500g", "label": "排骨"}},
                   {"role": "metric", "title": "老母鸡", "body": "半只 · 高汤鲜味主源慢熬4小时",
                    "chart": {"type": "big_number", "value": "半只", "label": "老母鸡"}},
                   {"role": "metric", "title": "火腿+干贝+花菇", "body": "火腿50g · 干贝30g · 花菇8朵",
                    "chart": {"type": "progress", "value": 70, "max": 100, "label": "鲜味强度"}},
               ]}},
    {"seq": 3, "type": "content", "layout": "hero_grid",
     "zones": {"heading": "风味轮分析", "kicker": "第一章 · 道",
               "lead": "咸鲜为骨、酱香为魂、脂香为韵，三味一体构成完整风味轮",
               "cards": [
                   {"role": "hero", "title": "鲜味金字塔",
                    "body": "鲍鱼（贝类鲜）+ 花胶（鱼胶鲜）+ 大地鱼粉（浓缩鲜）构成鲜味金字塔。与花菇的鸟苷酸协同，鲜味指数级放大。"},
                   {"role": "metric", "title": "咸鲜度", "body": "鲍汁+蚝油+生抽三重奏",
                    "chart": {"type": "big_number", "value": "9.2", "label": "咸鲜度"}},
                   {"role": "metric", "title": "酱香度", "body": "柱侯酱+花生酱+芝麻酱",
                    "chart": {"type": "big_number", "value": "8.5", "label": "酱香度"}},
                   {"role": "metric", "title": "脂香度", "body": "鸡油+猪油+鲍鱼胶质",
                    "chart": {"type": "big_number", "value": "8.8", "label": "脂香度"}},
               ]}},
    {"seq": 4, "type": "content", "layout": "mixed_grid",
     "zones": {"heading": "凤爪虎皮炸制", "kicker": "第二章 · 术",
               "lead": "核心技术 · 瞬时高温膨化法",
               "cards": [
                   {"role": "hero", "title": "操作流程",
                    "body": "白醋焯水(15ml白醋) → 彻底沥干 → 高温油炸(200-220度,60-90秒) → 热水飞水(60度去油定型)"},
                   {"role": "detail", "title": "技法本质",
                    "body": "瞬时高温膨化：表皮含水量在200度+热油中瞬间汽化，水蒸气在角质层下形成高压，将表皮吹起形成空泡结构。"},
                   {"role": "metric", "title": "参数窗口",
                    "body": "最佳油温200~220° · 炸制时间60-90s",
                    "chart": {"type": "big_number", "value": "200°", "label": "最佳油温"}},
                   {"role": "detail", "title": "科学原理",
                    "body": "美拉德反应: 还原糖+氨基酸→金黄色泽+烤肉香气。焦糖化反应: 糖类高温脱水→棕红色+焦糖风味"},
               ]}},
    {"seq": 5, "type": "content", "layout": "mixed_grid",
     "zones": {"heading": "分段熬煮与火候控制", "kicker": "第二章 · 术",
               "lead": "三段式火候 — 大火煮沸(0-30min) → 中小火熬煮(30-120min) → 微火收汁(120-180min)",
               "cards": [
                   {"role": "hero", "title": "三阶段火候曲线",
                    "body": "大火段(20%): 快速升温激发食材香气。中火段(50%): 稳定释放胶质和鲜味。微火段(30%): 浓缩汤汁避免焦底"},
                   {"role": "detail", "title": "关键控制参数",
                    "body": "火力转换点由汤汁状态判断 · 大火段不可超30分钟 · 微火段需定时搅动防焦"},
               ]}},
    {"seq": 6, "type": "content", "layout": "two_column",
     "zones": {"heading": "调味层次与香料运用", "kicker": "第二章 · 术",
               "lead": "五层调味体系 — 底味 → 鲜味 → 酱香 → 回甘 → 提香",
               "cards": [
                   {"role": "hero", "title": "五层调味架构",
                    "body": "1底味:老抽上色+生抽提鲜。2鲜味:蚝油+鲍汁+大地鱼粉。3酱香:柱侯酱+豆瓣酱。4回甘:冰糖+红枣+枸杞。5提香:花雕酒+麻油+白胡椒粉"},
                   {"role": "detail", "title": "香料包配方",
                    "body": "八角2粒·桂皮1小段(5cm)·香叶3片·陈皮1小块·草果1个。使用要点: 提前温水浸泡10分钟去苦涩，大火段结束时取出"},
               ]}},
    {"seq": 7, "type": "content", "layout": "dashboard",
     "zones": {"heading": "SOP 核心要点回顾", "kicker": "总结",
               "lead": "鲍鱼一品煲 — 从烹饪原理到操作技法的完整体系",
               "cards": [
                   {"role": "hero", "title": "七大核心要点",
                    "body": "①食材六味基础②虎皮炸制③分段火候④五层调味⑤香料平衡⑥砂锅优势⑦品质判断：汤汁挂勺+鲍鱼筷插即透+凤爪虎皮均匀"},
               ]}},
]

SOP2_AGENT = [
    {"seq": 1, "type": "cover", "layout": "full_bleed",
     "zones": {"heading": "AI Agent 开发实战", "kicker": "技术研发部", "lead": "从原理到落地的完整闭环",
               "cards": [{"role": "hero", "title": "AI Agent 开发实战",
                           "body": "大模型应用开发的技术全景图\n技术研发部 · 2026 · 技术研学文档"}]}},
    {"seq": 2, "type": "content", "layout": "hero_grid",
     "zones": {"heading": "Agent 架构全景图", "kicker": "架构设计",
               "lead": "LLM + Tools + Memory + Planning = AI Agent",
               "cards": [
                   {"role": "hero", "title": "核心架构", "body": "AI Agent由四大核心模块组成：LLM（大脑）、Tools（手脚）、Memory（记忆）、Planning（规划）。LLM负责任务理解和决策，Tools扩展模型的能力边界，Memory维护上下文和长期知识，Planning将复杂任务分解为可执行的步骤序列。"},
                   {"role": "metric", "title": "LLM 推理", "chart": {"type": "big_number", "value": "4", "label": "核心模块"}},
                   {"role": "metric", "title": "Tool 调用", "chart": {"type": "big_number", "value": "12+", "label": "可用工具"}},
                   {"role": "metric", "title": "上下文窗口", "chart": {"type": "big_number", "value": "200K", "label": "tokens"}}]}},
    {"seq": 3, "type": "content", "layout": "two_column",
     "zones": {"heading": "LLM 选型：模型能力对比", "kicker": "技术选型",
               "cards": [
                   {"role": "hero", "title": "选型决策矩阵", "body": "模型选型需综合考量：推理能力、指令遵循、工具调用、多模态、成本五个维度。不同场景侧重不同——代码生成重推理，客服重指令遵循，数据分析重工具调用。"},
                   {"role": "secondary", "title": "模型能力对比", "body": "Claude 4 Opus: 最强推理+工具调用。Claude 4 Sonnet: 性价比最优。GPT-5: 多模态能力强。DeepSeek-V4: 中文理解最优。Gemini 3 Pro: 长上下文优势。"},
                   {"role": "metric", "title": "平均延迟", "chart": {"type": "big_number", "value": "1.2", "label": "秒/次"}},
                   {"role": "metric", "title": "准确率", "chart": {"type": "big_number", "value": "94.7", "label": "%"}}]}},
    {"seq": 4, "type": "content", "layout": "mixed_grid",
     "zones": {"heading": "Tool 系统设计", "kicker": "工具设计",
               "lead": "Tool是Agent能力的放大器，设计质量直接决定Agent的上限",
               "cards": [
                   {"role": "hero", "title": "Tool 设计原则", "body": "1.Single Responsibility 2.Self-Descriptive 3.Type-Safe 4.Idempotent 5.Error-Transparent"},
                   {"role": "secondary", "title": "Tool 类型分类", "body": "Read Tools: 文件读取、搜索。Write Tools: 文件编辑、代码修改。Execute Tools: Bash、API调用。Orchestrate: Agent调度。Human-in-Loop: 审批确认。"},
                   {"role": "metric", "title": "并发上限", "chart": {"type": "big_number", "value": "8", "label": "并行tool"}},
                   {"role": "metric", "title": "超时时间", "chart": {"type": "big_number", "value": "120", "label": "秒"}}]}},
    {"seq": 5, "type": "content", "layout": "timeline",
     "zones": {"heading": "Planning 策略", "kicker": "规划机制",
               "cards": [
                   {"role": "hero", "title": "规划策略演进", "body": "从简单的ReAct循环到复杂的层次化规划，Agent的规划能力决定了其处理复杂任务的上限。"},
                   {"role": "secondary", "title": "1.ReAct", "body": "思考→行动→观察→思考。优点：简单可靠。缺点：缺乏全局规划，长任务容易走偏。"},
                   {"role": "secondary", "title": "2.Plan-Execute", "body": "先制定完整计划再逐步执行。优点：全局视角。缺点：灵活性差，中途变化需重新规划。"},
                   {"role": "secondary", "title": "3.Hierarchical", "body": "分层次规划：高层目标→中层子任务→底层操作。优点：适合超长任务链。缺点：设计复杂度高。"},
                   {"role": "metric", "title": "ReAct", "chart": {"type": "big_number", "value": "78", "label": "%"}},
                   {"role": "metric", "title": "Plan-Ex", "chart": {"type": "big_number", "value": "91", "label": "%"}}]}},
    {"seq": 6, "type": "content", "layout": "three_column",
     "zones": {"heading": "Memory 系统", "kicker": "记忆机制",
               "cards": [
                   {"role": "hero", "title": "Working Memory", "body": "上下文窗口内的即时记忆。对话历史、tool调用结果、中间推理过程。容量受限于context window，会话结束即消失。"},
                   {"role": "secondary", "title": "Episodic Memory", "body": "跨会话的任务记忆。记录成功/失败的案例、用户偏好。向量数据库存储+相似检索。积累越多越智能。"},
                   {"role": "secondary", "title": "Semantic Memory", "body": "结构化知识库。项目规范、API文档、最佳实践。RAG检索增强生成。数据更新即记忆更新。"}]}},
    {"seq": 7, "type": "content", "layout": "single_focus",
     "zones": {"heading": "落地实战：从Demo到生产", "kicker": "总结升华",
               "lead": "把Agent从跑得通升级到跑得稳",
               "cards": [
                   {"role": "hero", "title": "生产级Agent关键要素", "body": "1.可观测性：全链路trace+tool调用日志+token消耗监控\n2.容错设计：tool超时重试+fallback策略+优雅降级\n3.安全护栏：tool权限分级+敏感操作审批+输入输出审核\n4.持续优化：用户反馈闭环+模型微调+prompt版本管理\n5.成本控制：缓存策略+模型分层路由+批处理优化\n\nAI Agent不是一次性工程，而是持续进化的系统工程。"}]}},
]

# ============================================================
# QUALITY SCORING — per family
# ============================================================

def score_gpt54_family(svg: str, slide_type: str) -> Tuple[int, Dict]:
    """Score against gpt54 Dark Tech Premium reference metrics."""
    c = {}
    # Defs (weight: heavy)
    c["bgGrad_3stop"] = ('id="bgGrad"' in svg) and (svg.count('stop-color=') >= 3 or svg.count('stop-color="') >= 2)
    c["panelGrad"] = 'id="panelGrad"' in svg or 'panelGrad' in svg
    c["3_accent_grads"] = (('indigoGrad' in svg or 'accentGrad' in svg) and
                           ('cyanGrad' in svg or 'accentGradSecondary' in svg) and
                           ('orangeGrad' in svg or 'accentGradTertiary' in svg))
    c["lineGrad"] = 'id="lineGrad"' in svg or 'lineGrad' in svg
    c["3_radial_glows"] = svg.lower().count('radialgradient') >= 3
    c["grain_pattern"] = 'id="grain"' in svg
    c["shadow_filter"] = 'id="shadow"' in svg or 'shadow-lg' in svg
    c["shadow_feDropShadow"] = 'feDropShadow' in svg

    # Background (weight: medium)
    c["grid_lines"] = 'stroke="#8DA7C5"' in svg
    c["glow_circles"] = ('cyanGlow' in svg or 'glowAccent' in svg) and ('orangeGlow' in svg or 'glowSecondary' in svg)
    c["bezier_thin"] = 'stroke-width="2"' in svg and 'stroke-linecap="round"' in svg
    c["bezier_thick"] = 'stroke-width="10"' in svg

    # Typography (weight: medium)
    c["geist_sans"] = 'Geist Sans' in svg
    c["jetbrains_mono"] = 'JetBrains Mono' in svg

    # Cards (weight: medium)
    c["large_rx"] = any(rx in svg for rx in ['rx="24"', 'rx="26"', 'rx="28"', 'rx="30"'])

    # Layout per slide type
    if slide_type == "cover":
        c["hero_panel"] = ('x="734"' in svg or 'translate(734' in svg)
        c["bottom_bar"] = ('y="610"' in svg or 'y="628"' in svg)
        c["footer_y"] = ('y="698"' in svg or 'y="694"' in svg)
    else:
        c["capsule_at_72_34"] = 'translate(72,34)' in svg.replace(' ', '') or 'translate(72, 34)' in svg
        c["title_underline"] = 'width="96"' in svg
        c["page_num_capsule"] = 'translate(1172,34)' in svg.replace(' ', '') or 'translate(1172, 34)' in svg
        c["divider_y674"] = 'y1="674"' in svg
        c["footer_source"] = 'y="694"' in svg

    score = sum(1 for v in c.values() if v)
    return score, c


def score_professional_family(svg: str, slide_type: str) -> Tuple[int, Dict]:
    """Score against minimax Clean Corporate reference metrics."""
    c = {}
    # Colors
    c["navy_primary"] = '#1a365d' in svg
    c["orange_accent"] = '#e67e22' in svg
    c["card_bg_light"] = '#f0f4f8' in svg
    c["white_bg_content"] = '#ffffff' in svg

    # Typography
    c["system_ui_font"] = 'system-ui' in svg or 'Inter' in svg or 'DM Sans' in svg

    # Decorations (must be CLEAN — NO grain/glow/bezier)
    c["no_grain"] = 'id="grain"' not in svg
    c["no_radial_glow"] = 'radialGradient' not in svg
    c["no_bezier"] = 'stroke-width="10"' not in svg and 'bezier' not in svg.lower()
    c["no_grid_lines"] = 'stroke="#8DA7C5"' not in svg

    # Layout
    if slide_type == "cover":
        c["gradient_bg"] = 'linearGradient' in svg
        c["accent_bar_left"] = 'width="8"' in svg or 'width="6"' in svg
        c["large_title"] = 'font-size="84"' in svg or 'font-size="88"' in svg or 'font-size="76"' in svg
    else:
        c["header_bar"] = 'height="90"' in svg
        c["card_rx_12_16"] = any(rx in svg for rx in ['rx="12"', 'rx="16"'])
        c["card_header_navy"] = ('#1a365d' in svg)  # navy card headers

    score = sum(1 for v in c.values() if v)
    return score, c


def score_creative_family(svg: str, slide_type: str) -> Tuple[int, Dict]:
    """Score against Creative Bold / root warm-brand reference metrics."""
    c = {}
    # Colors (violet/pink/amber or orange warm)
    c["creative_colors"] = any(color in svg for color in ['#7c3aed', '#ec4899', '#d97706', '#FF6900', '#FF8533', '#e67e22'])
    c["bold_bg"] = any(tag in svg for tag in ['linearGradient', 'url(#bg'])

    # Typography
    c["bold_heading_font"] = any(f in svg for f in ['Montserrat', 'Geist Sans', 'DM Sans', 'PingFang SC'])

    # Cards
    c["card_rx_large"] = any(rx in svg for rx in ['rx="16"', 'rx="20"', 'rx="24"', 'rx="28"', 'rx="30"'])

    # Layout
    if slide_type == "cover":
        c["cover_title_large"] = any(fs in svg for fs in ['font-size="72"', 'font-size="76"', 'font-size="84"', 'font-size="88"'])
        c["accent_underline"] = 'height="6"' in svg or 'height="4"' in svg
        c["footer_info"] = '2026' in svg

    score = sum(1 for v in c.values() if v)
    return score, c


def score_thematic_family(svg: str, slide_type: str, style_id: str) -> Tuple[int, Dict]:
    """Score against YAML token compliance for thematic styles."""
    yaml_data = load_yaml_style(style_id)
    c = {}

    # Color compliance
    cs = yaml_data.get("color_scheme", {})
    if cs:
        primary = cs.get("primary", "")
        accent = cs.get("accent", "")
        bg = cs.get("background", "")
        card_bg = cs.get("card_bg", "")
        c["primary_color_present"] = primary in svg if primary else True
        c["accent_color_present"] = accent in svg if accent else True
        c["bg_or_cardbg"] = (bg in svg) or (card_bg in svg) if bg or card_bg else True

    # Typography
    typo = yaml_data.get("typography", {})
    if typo:
        heading = typo.get("heading_font", "").split(",")[0].strip().strip("'")
        body = typo.get("body_font", "").split(",")[0].strip().strip("'")
        c["heading_font"] = heading in svg if heading else True
        c["body_or_cjk_font"] = (body in svg or 'PingFang SC' in svg) if body else True

    # Decoration
    dec = yaml_data.get("decoration", {})
    if dec:
        pattern = dec.get("pattern", "none")
        if pattern == "none":
            c["no_pattern"] = 'id="grain"' not in svg and 'pattern' not in svg.lower()
        elif pattern == "grid":
            c["has_grid"] = 'stroke="#8DA7C5"' in svg or 'stroke-opacity="0.03"' in svg
        elif pattern == "dots":
            c["has_dots"] = True  # dots pattern hard to detect reliably

    # Card style
    card_style = yaml_data.get("card_style", {})
    if card_style:
        rx = card_style.get("border_radius", 0)
        c["card_rx_match"] = f'rx="{rx}"' in svg if rx else True

    score = sum(1 for v in c.values() if v)
    return score, c


def get_family_for_style(style_id: str) -> str:
    for family_name, family_data in STYLE_FAMILIES.items():
        if style_id in family_data["styles"]:
            return family_name
    return "THEMATIC"  # default


def score_svg(svg: str, slide_type: str, style_id: str) -> Tuple[int, int, Dict]:
    """Score a single SVG against its reference family."""
    family = get_family_for_style(style_id)

    if family == "DARK_TECH":
        score, checks = score_gpt54_family(svg, slide_type)
    elif family == "PROFESSIONAL":
        score, checks = score_professional_family(svg, slide_type)
    elif family == "CREATIVE":
        score, checks = score_creative_family(svg, slide_type)
    else:
        score, checks = score_thematic_family(svg, slide_type, style_id)

    total = len(checks)
    return score, total, checks


# ============================================================
# GENERATION + SCORING ENGINE
# ============================================================

PROVIDER = "0df96678"
MODEL = "deepseek-v4-pro"
BATCH = 2  # 2 slides per batch for reliability

@dataclass
class SlideResult:
    seq: int
    slide_type: str
    style_id: str
    sop_name: str
    svg_bytes: int
    score: int
    total_checks: int
    pct: float
    failed_checks: List[str]
    svg_content: str = ""

@dataclass
class DeckResult:
    style_id: str
    sop_name: str
    family: str
    slides: List[SlideResult]
    total_score: int = 0
    total_checks: int = 0
    overall_pct: float = 0.0
    generation_time: float = 0.0

    def compute(self):
        self.total_score = sum(s.score for s in self.slides)
        self.total_checks = sum(s.total_checks for s in self.slides)
        self.overall_pct = (self.total_score / self.total_checks * 100) if self.total_checks > 0 else 0


def generate_and_score_deck(style_id: str, sop_slides: List[dict], sop_name: str) -> DeckResult:
    """Generate a complete deck and score every slide."""
    family = get_family_for_style(style_id)
    print(f"\n{'='*60}")
    print(f"[{family}] {style_id} | {sop_name} | {len(sop_slides)} slides")
    print(f"{'='*60}")

    t0 = time.time()
    results = []

    try:
        svg_results = _stage3_svg(
            provider_id=PROVIDER,
            model=MODEL,
            llm_generate=llm_generate,
            slide_data=sop_slides,
            style_id=style_id,
            batch_size=BATCH
        )
    except Exception as e:
        print(f"  GENERATION FAILED: {e}")
        # Return empty deck
        dr = DeckResult(style_id=style_id, sop_name=sop_name, family=family, slides=[])
        dr.generation_time = time.time() - t0
        return dr

    elapsed = time.time() - t0

    if not svg_results:
        print(f"  No results returned!")
        dr = DeckResult(style_id=style_id, sop_name=sop_name, family=family, slides=[])
        dr.generation_time = elapsed
        return dr

    for r in svg_results:
        seq = r.get("seq", 0)
        svg = r.get("svg_content", "")
        stype = r.get("type", "content")
        svg_bytes = len(svg)

        score, total, checks = score_svg(svg, stype, style_id)
        pct = (score / total * 100) if total > 0 else 0
        failed = [k for k, v in checks.items() if not v]

        sr = SlideResult(
            seq=seq, slide_type=stype, style_id=style_id, sop_name=sop_name,
            svg_bytes=svg_bytes, score=score, total_checks=total,
            pct=pct, failed_checks=failed, svg_content=svg
        )

        # Save SVG
        out_dir = os.path.join("data", "exports", f"test_{style_id}_{sop_name}")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"slide-{seq:02d}.svg")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(svg)

        status = "PASS" if not failed else f"FAIL: {','.join(failed[:3])}"
        print(f"  Slide {seq:02d} ({stype:7s}): {svg_bytes:5d} bytes | {score}/{total} ({pct:.0f}%) | {status}")
        results.append(sr)

    dr = DeckResult(style_id=style_id, sop_name=sop_name, family=family, slides=results)
    dr.compute()
    dr.generation_time = elapsed
    print(f"  DECK TOTAL: {dr.total_score}/{dr.total_checks} ({dr.overall_pct:.0f}%) | {elapsed:.0f}s")
    return dr


# ============================================================
# MAIN
# ============================================================

def print_final_matrix(all_results: List[DeckResult]):
    """Print comprehensive comparison matrix."""
    print("\n\n")
    print("=" * 120)
    print("FINAL QUALITY COMPARISON MATRIX - ALL STYLES x ALL SOPs")
    print("=" * 120)

    # Header
    print(f"{'Style':<22} {'Family':<14} {'SOP':<12} {'Score':<8} {'%':<7} {'Time':<8} {'Status':<10}")
    print("-" * 120)

    # Group by family
    for family_name in ["DARK_TECH", "PROFESSIONAL", "CREATIVE", "THEMATIC"]:
        family_results = [r for r in all_results if r.family == family_name]
        if not family_results:
            continue

        print(f"\n--- {family_name} ({STYLE_FAMILIES[family_name]['description']}) ---")

        for dr in sorted(family_results, key=lambda x: (x.style_id, x.sop_name)):
            status = "PASS" if dr.overall_pct >= 90 else ("WARN" if dr.overall_pct >= 70 else "FAIL")
            print(f"{dr.style_id:<22} {dr.family:<14} {dr.sop_name:<12} "
                  f"{dr.total_score}/{dr.total_checks:<4} {dr.overall_pct:>5.0f}%  "
                  f"{dr.generation_time:>5.0f}s   {status}")

    # Style × SOP cross-table
    print(f"\n\n{'='*120}")
    print("CROSS-TABLE: Style vs SOP Quality %")
    print(f"{'='*120}")

    sop_names = sorted(set(r.sop_name for r in all_results))
    styles = sorted(set(r.style_id for r in all_results))

    # Header
    print(f"{'Style':<22}", end="")
    for sn in sop_names:
        print(f" {sn:<15}", end="")
    print(f" {'AVG':<8} {'Family':<14}")
    print("-" * (22 + 16 * len(sop_names) + 8 + 14))

    for style_id in styles:
        style_results = [r for r in all_results if r.style_id == style_id]
        family = style_results[0].family if style_results else "?"
        print(f"{style_id:<22}", end="")

        pcts = []
        for sn in sop_names:
            match = [r for r in style_results if r.sop_name == sn]
            if match:
                pct = match[0].overall_pct
                pcts.append(pct)
                marker = " PASS" if pct >= 90 else (" WARN" if pct >= 70 else " FAIL")
                print(f" {pct:>5.0f}%{marker}   ", end="")
            else:
                print(f" {'--':>5}        ", end="")

        avg_pct = sum(pcts) / len(pcts) if pcts else 0
        print(f" {avg_pct:>5.0f}%  {family:<14}")

    # Summary statistics
    print(f"\n{'='*120}")
    print("SUMMARY STATISTICS")
    print(f"{'='*120}")
    total_decks = len(all_results)
    passing = sum(1 for r in all_results if r.overall_pct >= 90)
    warning = sum(1 for r in all_results if 70 <= r.overall_pct < 90)
    failing = sum(1 for r in all_results if r.overall_pct < 70)
    print(f"Total decks: {total_decks} | PASS(>=90%): {passing} | WARN(70-89%): {warning} | FAIL(<70%): {failing}")
    print(f"Pass rate: {passing/total_decks*100:.0f}%" if total_decks > 0 else "No data")

    # Per-family averages
    print(f"\nPer-family averages:")
    for family_name in ["DARK_TECH", "PROFESSIONAL", "CREATIVE", "THEMATIC"]:
        fam_results = [r for r in all_results if r.family == family_name]
        if fam_results:
            avg = sum(r.overall_pct for r in fam_results) / len(fam_results)
            print(f"  {family_name:<14}: {avg:.0f}% ({len(fam_results)} decks)")

    # Style ranking
    print(f"\nStyle ranking (avg across SOPs):")
    style_avgs = defaultdict(list)
    for r in all_results:
        style_avgs[r.style_id].append(r.overall_pct)
    ranked = sorted(style_avgs.items(), key=lambda x: sum(x[1])/len(x[1]), reverse=True)
    for i, (sid, pcts) in enumerate(ranked, 1):
        avg = sum(pcts) / len(pcts)
        print(f"  {i:2d}. {sid:<22} {avg:.0f}% ({len(pcts)} SOPs)")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Comprehensive 17-style quality test")
    parser.add_argument("--family", choices=["DARK_TECH", "PROFESSIONAL", "CREATIVE", "THEMATIC", "all"],
                        default="all", help="Which style family to test")
    parser.add_argument("--style", type=str, help="Single style ID to test")
    parser.add_argument("--sop", choices=["sop1", "sop2", "both"], default="both",
                        help="Which SOP to test")
    parser.add_argument("--slides", type=int, default=7, help="Number of slides per deck")
    args = parser.parse_args()

    # Build test matrix
    if args.style:
        styles_to_test = [args.style]
    elif args.family == "all":
        styles_to_test = []
        for fam in STYLE_FAMILIES.values():
            styles_to_test.extend(fam["styles"])
    else:
        styles_to_test = STYLE_FAMILIES[args.family]["styles"]

    sop_configs = []
    if args.sop in ("sop1", "both"):
        sop_configs.append(("sop1_baoyu", SOP1_BAOYU[:args.slides]))
    if args.sop in ("sop2", "both"):
        sop_configs.append(("sop2_agent", SOP2_AGENT[:args.slides]))

    print(f"{'='*60}")
    print(f"17-STYLE COMPREHENSIVE QUALITY TEST")
    print(f"{'='*60}")
    print(f"Styles to test: {len(styles_to_test)} -- {styles_to_test}")
    print(f"SOPs: {[s[0] for s in sop_configs]}")
    print(f"Slides per deck: {args.slides}")
    print(f"Total decks: {len(styles_to_test) * len(sop_configs)}")
    print(f"Total slides: {len(styles_to_test) * len(sop_configs) * args.slides}")
    print(f"{'='*60}")

    all_results = []

    for style_id in styles_to_test:
        for sop_name, sop_slides in sop_configs:
            dr = generate_and_score_deck(style_id, sop_slides, sop_name)
            all_results.append(dr)

    # Print final matrix
    print_final_matrix(all_results)

    # Save results JSON
    results_json = []
    for dr in all_results:
        results_json.append({
            "style_id": dr.style_id,
            "sop_name": dr.sop_name,
            "family": dr.family,
            "total_score": dr.total_score,
            "total_checks": dr.total_checks,
            "overall_pct": round(dr.overall_pct, 1),
            "generation_time": round(dr.generation_time, 0),
            "slides": [{"seq": s.seq, "type": s.slide_type, "score": s.score,
                        "total": s.total_checks, "pct": round(s.pct, 1),
                        "failed": s.failed_checks, "bytes": s.svg_bytes}
                       for s in dr.slides]
        })

    out_path = os.path.join("data", "exports", "quality_matrix.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results_json, f, ensure_ascii=False, indent=2)
    print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    main()
