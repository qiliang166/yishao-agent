"""Batch generate tokens.yaml for 12 pending styles from data/styles/*.yaml keywords."""
import yaml, os, sys

STYLES_DIR = 'data/styles'
VI_DIR = 'resources/vi'

# ── Per-style color scheme definitions (extracted from mood/brief keywords) ──
SCHEMES = {
    'minimal': {
        'light-minimal': {
            'label': '暖灰极简',
            'primary': '#374151',
            'secondary': '#6b7280',
            'accent': '#3b82f6',
            'background': '#fafaf9',
            'text': '#1f2937',
            'card_bg': '#ffffff',
            'chart_colors': ['#3b82f6', '#6366f1', '#8b5cf6', '#10b981', '#f59e0b'],
            'semantic': {'positive': '#10b981', 'negative': '#ef4444'},
            'persona_hint': '暖灰底色（#fafaf9）配蓝色点缀（#3b82f6），极简克制。白色卡片形成微弱层次递进，色彩占比不超过5%。',
        },
    },
    'blueprint': {
        'classic-blueprint': {
            'label': '经典蓝图',
            'primary': '#0c4a6e',
            'secondary': '#164e63',
            'accent': '#38bdf8',
            'background': '#082f49',
            'text': '#e2e8f0',
            'card_bg': '#0c3d5c',
            'chart_colors': ['#38bdf8', '#7dd3fc', '#bae6fd', '#fbbf24', '#f59e0b'],
            'semantic': {'positive': '#38bdf8', 'negative': '#f87171'},
            'persona_hint': '深蓝底（#082f49）+ 浅蓝网格线，模拟工程蓝图。白色线条半透明度≤8%，直角色卡配发光边框营造技术氛围。',
        },
    },
    'bold-editorial': {
        'magazine-bw': {
            'label': '杂志黑白',
            'primary': '#000000',
            'secondary': '#333333',
            'accent': '#ff2d55',
            'background': '#ffffff',
            'text': '#111111',
            'card_bg': '#f5f5f5',
            'chart_colors': ['#ff2d55', '#007aff', '#ff9500', '#34c759', '#af52de'],
            'semantic': {'positive': '#34c759', 'negative': '#ff2d55'},
            'persona_hint': '纯黑（#000000）+ 纯白（#ffffff）+ 鲜红强调（#ff2d55）。零圆角，3px 黑色实线边框，硬偏移阴影模拟杂志封面视觉冲击。',
        },
    },
    'chalkboard': {
        'green-chalkboard': {
            'label': '经典绿板',
            'primary': '#2d5a27',
            'secondary': '#3d7a37',
            'accent': '#f5f5dc',
            'background': '#1a3a1a',
            'text': '#e8e8d0',
            'card_bg': '#234723',
            'chart_colors': ['#f5f5dc', '#ffeb99', '#ffb3b3', '#b3d9ff', '#ffcc99'],
            'semantic': {'positive': '#7ec87e', 'negative': '#ff6b6b'},
            'persona_hint': '深绿黑板底色（#1a3a1a）+ 粉笔白文字（#f5f5dc）。2px虚线边框模拟粉笔画，彩色粉笔辅助色（黄/粉/蓝/橙）。',
        },
    },
    'editorial-infographic': {
        'editorial-cream': {
            'label': '编辑米白',
            'primary': '#1a1a2e',
            'secondary': '#16213e',
            'accent': '#e63946',
            'background': '#faf8f5',
            'text': '#2d2d2d',
            'card_bg': '#ffffff',
            'chart_colors': ['#e63946', '#1a1a2e', '#457b9d', '#e9c46a', '#2a9d8f'],
            'semantic': {'positive': '#2a9d8f', 'negative': '#e63946'},
            'persona_hint': '米白底（#faf8f5）+ 深蓝文字 + 信号红强调（#e63946）。DM Serif 衬线标题传递编辑权威，微圆角6px+淡阴影。',
        },
    },
    'fantasy-animation': {
        'starry-night': {
            'label': '星夜奇幻',
            'primary': '#1a0533',
            'secondary': '#2d1b69',
            'accent': '#f0c040',
            'background': '#0d0221',
            'text': '#e8ddff',
            'card_bg': '#1f1045',
            'chart_colors': ['#f0c040', '#c084fc', '#f472b6', '#60a5fa', '#34d399'],
            'semantic': {'positive': '#f0c040', 'negative': '#f87171'},
            'persona_hint': '深紫夜蓝色底（#0d0221）+ 金色光芒（#f0c040）模拟奇幻魔法美学。圆角20px，半透明边框泛金色光晕，色彩占比≤8%。',
        },
    },
    'intuition-machine': {
        'hud-neon': {
            'label': 'HUD霓虹',
            'primary': '#0a0a0a',
            'secondary': '#141414',
            'accent': '#00e676',
            'background': '#050505',
            'text': '#e0ffe0',
            'card_bg': '#0d0d0d',
            'chart_colors': ['#00e676', '#ff4081', '#448aff', '#ffab00', '#00e5ff'],
            'semantic': {'positive': '#00e676', 'negative': '#ff4081'},
            'persona_hint': '纯黑底（#050505）+ 霓虹绿（#00e676）+ 热粉（#ff4081）。半透明边框4%透明度模拟HUD界面，Space Grotesk几何感字体。',
        },
    },
    'pixel-art': {
        'retro-pixel': {
            'label': '复古像素',
            'primary': '#222034',
            'secondary': '#3f3f74',
            'accent': '#99e550',
            'background': '#1a1a2e',
            'text': '#d0e0d0',
            'card_bg': '#2a2a3e',
            'chart_colors': ['#99e550', '#ff0040', '#ffcc00', '#00ccff', '#ff88aa'],
            'semantic': {'positive': '#99e550', 'negative': '#ff0040'},
            'persona_hint': '8-bit游戏美学，深紫黑底（#222034）+ 霓虹绿强调（#99e550）。零圆角，硬像素阴影（4px 4px），像素字体 Press Start 2P / VT323。',
        },
    },
    'scientific': {
        'academic-blue': {
            'label': '学术蓝调',
            'primary': '#1565c0',
            'secondary': '#1976d2',
            'accent': '#ff7043',
            'background': '#fafcff',
            'text': '#1a2332',
            'card_bg': '#ffffff',
            'chart_colors': ['#1565c0', '#ff7043', '#2e7d32', '#f9a825', '#6a1b9a'],
            'semantic': {'positive': '#2e7d32', 'negative': '#c62828'},
            'persona_hint': '学术蓝（#1565c0）+ 暖橙强调（#ff7043）。白底 + Merriweather 衬线标题，窄圆角4px+细边框1px，等宽字体展示数据。',
        },
    },
    'sketch-notes': {
        'notebook-warm': {
            'label': '手帐暖纸',
            'primary': '#2c2c2c',
            'secondary': '#4a4a4a',
            'accent': '#e63946',
            'background': '#fdf8ef',
            'text': '#2c2c2c',
            'card_bg': '#fffbeb',
            'chart_colors': ['#e63946', '#457b9d', '#e9c46a', '#2a9d8f', '#f4a261'],
            'semantic': {'positive': '#2a9d8f', 'negative': '#e63946'},
            'persona_hint': '暖纸色底（#fdf8ef）+ 钢笔黑（#2c2c2c）+ 红色记号笔（#e63946）。2px实线边框，硬偏移阴影（3px 3px），手写字体模拟真实笔记本。',
        },
    },
    'vector-illustration': {
        'flat-modern': {
            'label': '扁平现代',
            'primary': '#2d3436',
            'secondary': '#636e72',
            'accent': '#0984e3',
            'background': '#f5f6fa',
            'text': '#2d3436',
            'card_bg': '#ffffff',
            'chart_colors': ['#0984e3', '#00b894', '#fdcb6e', '#e17055', '#6c5ce7'],
            'semantic': {'positive': '#00b894', 'negative': '#e17055'},
            'persona_hint': '炭黑底色（#2d3436）+ 鲜艳蓝强调（#0984e3）+ 珊瑚/薄荷/紫辅助。圆角16px，图案透明度4%，扁平矢量美学。',
        },
    },
    'watercolor': {
        'watercolor-dream': {
            'label': '水彩梦境',
            'primary': '#5c6bc0',
            'secondary': '#ec407a',
            'accent': '#26a69a',
            'background': '#faf7fc',
            'text': '#2d2035',
            'card_bg': '#ffffff',
            'chart_colors': ['#5c6bc0', '#ec407a', '#26a69a', '#ffa726', '#ab47bc'],
            'semantic': {'positive': '#26a69a', 'negative': '#ec407a'},
            'persona_hint': '薰衣草蓝（#5c6bc0）+ 玫瑰红（#ec407a）+ 薄荷绿（#26a69a）。大圆角24px，柔和彩色阴影，渐变色融合营造水彩晕染感。',
        },
    },
}

# ── Typography overrides per style ──
TYPOGRAPHY = {
    'blueprint': {
        'heading_font': "JetBrains Mono, 'SF Mono', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        'body_font': "JetBrains Mono, 'SF Mono', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    },
    'bold-editorial': {
        'heading_font': "Playfair Display, Georgia, 'PingFang SC', 'Microsoft YaHei', serif",
        'body_font': "Source Sans 3, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif",
        'cover_title': {'size': '62-72px', 'weight': 900},
    },
    'chalkboard': {
        'heading_font': "Caveat, Patrick Hand, 'PingFang SC', 'Microsoft YaHei', cursive",
        'body_font': "Caveat, Patrick Hand, 'PingFang SC', 'Microsoft YaHei', cursive",
    },
    'editorial-infographic': {
        'heading_font': "DM Serif Display, Georgia, 'PingFang SC', 'Microsoft YaHei', serif",
        'body_font': "Source Sans 3, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    },
    'fantasy-animation': {
        'heading_font': "Cinzel, Georgia, 'PingFang SC', 'Microsoft YaHei', serif",
        'body_font': "Quicksand, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    },
    'intuition-machine': {
        'heading_font': "Space Grotesk, Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif",
        'body_font': "Space Grotesk, Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    },
    'pixel-art': {
        'heading_font': "VT323, 'Press Start 2P', 'PingFang SC', 'Microsoft YaHei', monospace",
        'body_font': "VT323, 'Press Start 2P', 'PingFang SC', 'Microsoft YaHei', monospace",
    },
    'scientific': {
        'heading_font': "Merriweather, Georgia, 'PingFang SC', 'Microsoft YaHei', serif",
        'body_font': "Source Sans 3, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    },
    'sketch-notes': {
        'heading_font': "Architects Daughter, Kalam, 'PingFang SC', 'Microsoft YaHei', cursive",
        'body_font': "Kalam, 'PingFang SC', 'Microsoft YaHei', cursive",
    },
    'vector-illustration': {
        'heading_font': "Poppins, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif",
        'body_font': "Nunito, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    },
    'watercolor': {
        'heading_font': "Cormorant Garamond, Georgia, 'PingFang SC', 'Microsoft YaHei', serif",
        'body_font': "Lato, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    },
}

# ── Card style overrides per style ──
CARD_STYLES = {
    'blueprint': {'border_radius': 4, 'shadow': '0 0 8px rgba(56,189,248,0.15)', 'border': '1px solid rgba({{text_rgb}}, 0.08)'},
    'bold-editorial': {'border_radius': 0, 'shadow': '4px 4px 0 rgba(0,0,0,0.8)', 'border': '3px solid {{primary}}'},
    'chalkboard': {'border_radius': 2, 'shadow': 'none', 'border': '2px dashed rgba({{text_rgb}}, 0.25)'},
    'editorial-infographic': {'border_radius': 6, 'shadow': '1px 4px 12px rgba(0,0,0,0.08)', 'border': '1px solid rgba({{text_rgb}}, 0.09)'},
    'fantasy-animation': {'border_radius': 20, 'shadow': '0 4px 20px rgba(240,192,64,0.15)', 'border': '1px solid rgba({{text_rgb}}, 0.06)'},
    'intuition-machine': {'border_radius': 2, 'shadow': '0 0 12px rgba(0,230,118,0.1)', 'border': '1px solid rgba({{text_rgb}}, 0.04)'},
    'pixel-art': {'border_radius': 0, 'shadow': '4px 4px 0 rgba(0,0,0,0.4)', 'border': '2px solid {{primary}}'},
    'scientific': {'border_radius': 4, 'shadow': '0 2px 8px rgba(0,0,0,0.06)', 'border': '1px solid rgba({{text_rgb}}, 0.1)'},
    'sketch-notes': {'border_radius': 2, 'shadow': '3px 3px 0 rgba(0,0,0,0.1)', 'border': '2px solid {{text}}'},
    'vector-illustration': {'border_radius': 16, 'shadow': '0 4px 12px rgba(0,0,0,0.08)', 'border': '1px solid rgba({{text_rgb}}, 0.06)'},
    'watercolor': {'border_radius': 24, 'shadow': '0 6px 20px rgba(92,107,192,0.12)', 'border': '1px solid rgba({{text_rgb}}, 0.05)'},
}

# ── Elevation overrides ──
ELEVATIONS = {
    'blueprint': {'shadow_sm': '0 0 4px rgba(56,189,248,0.08)', 'shadow_md': '0 0 8px rgba(56,189,248,0.15)', 'shadow_lg': '0 0 20px rgba(56,189,248,0.25)'},
    'bold-editorial': {'shadow_sm': 'none', 'shadow_md': '4px 4px 0 #000000', 'shadow_lg': '8px 8px 0 #000000'},
    'pixel-art': {'shadow_sm': '2px 2px 0 rgba(0,0,0,0.3)', 'shadow_md': '4px 4px 0 rgba(0,0,0,0.4)', 'shadow_lg': '8px 8px 0 rgba(0,0,0,0.5)'},
    'sketch-notes': {'shadow_sm': '2px 2px 0 rgba(0,0,0,0.06)', 'shadow_md': '3px 3px 0 rgba(0,0,0,0.1)', 'shadow_lg': '5px 5px 0 rgba(0,0,0,0.12)'},
    'watercolor': {'shadow_sm': '0 2px 8px rgba(92,107,192,0.06)', 'shadow_md': '0 6px 20px rgba(92,107,192,0.12)', 'shadow_lg': '0 12px 36px rgba(92,107,192,0.2)'},
}


def _is_dark(scheme):
    """Determine if a scheme is light or dark based on background luminance."""
    bg = scheme.get('background', '#ffffff')
    try:
        r, g, b = int(bg[1:3], 16), int(bg[3:5], 16), int(bg[5:7], 16)
        lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        return lum <= 128
    except:
        return False


def build_tokens(sid):
    """Generate tokens.yaml for a style ID."""
    schemes = SCHEMES.get(sid, {})
    if not schemes:
        print(f'  SKIP {sid}: no scheme defined')
        return None

    first_scheme = list(schemes.keys())[0]
    default_scheme = schemes[first_scheme]
    is_dark = _is_dark(default_scheme)

    # Determine base dir: dark → copy from business, light → copy from notion
    base_style = 'business' if is_dark else 'notion'

    # text_rgb from default scheme
    t = default_scheme['text'].lstrip('#')
    text_rgb = f'{int(t[0:2],16)},{int(t[2:4],16)},{int(t[4:6],16)}'

    # Typography
    typo = {
        'heading_font': "Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif",
        'body_font': "Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif",
        'cover_title': {'size': '58-65px', 'weight': 700},
        'page_title': {'size': '36-44px', 'weight': 700},
        'card_title': {'size': '20-24px', 'weight': 600},
        'body': {'size': '15-18px', 'weight': 400},
        'caption': {'size': '12-14px', 'weight': 400},
        'line_height': {'heading': '1.15-1.25', 'body': '1.6-1.8'},
        'letter_spacing': {'heading': '0.5~1px'},
    }
    if sid in TYPOGRAPHY:
        typo.update(TYPOGRAPHY[sid])

    # Card style
    cs = CARD_STYLES.get(sid, {
        'border_radius': 8,
        'shadow': '0 4px 16px rgba(0,0,0,0.08)' if not is_dark else '0 4px 16px rgba(0,0,0,0.4)',
        'border': '1px solid rgba({{text_rgb}}, 0.08)',
        'gap': 24,
        'left_stripe_width': 3 if not is_dark else 4,
    })
    cs.setdefault('gap', 24)
    cs.setdefault('left_stripe_width', 3)

    # Elevation
    elev = ELEVATIONS.get(sid, {
        'shadow_sm': f'0 2px 4px rgba({text_rgb}, 0.06)',
        'shadow_md': cs.get('shadow', f'0 4px 16px rgba({text_rgb}, 0.1)'),
        'shadow_lg': f'0 12px 40px rgba({text_rgb}, 0.15)',
    })

    # Slide type overrides — depends on light vs dark
    cover_text = '#ffffff' if is_dark else '{{primary}}'
    cover_bg = '{{primary}}' if is_dark else '{{background}}'

    # Gradients
    gradients = {
        'hero_bg': 'linear-gradient(135deg, {{primary}} 0%, {{secondary}} 100%)',
        'card_highlight': f'linear-gradient(180deg, {{{{card_bg}}}} 0%, {{{{primary}}}} 100%)' if is_dark
        else 'linear-gradient(180deg, {{card_bg}} 0%, rgba({{primary_rgb}}, 0.04) 100%)',
    }

    # Decoration layers
    layers_dark = ['背景层', '网格纹理层', '结构层', '内容层', '发光层']
    layers_light = ['背景层', '点阵纹理层', '结构层', '内容层', '标识层']

    token = {
        'color_scheme': first_scheme,
        'document_colors': {
            'header_blue': '{{chart_0}}',
            'header_bronze': '{{chart_1}}',
            'text_rgb': text_rgb,
            'white': '#ffffff',
        },
        'color_schemes': schemes,
        'typography': typo,
        'card_style': cs,
        'gradients': gradients,
        'elevation': elev,
        'slide_type_overrides': {
            'cover': {
                'card_bg': cover_bg,
                'text': cover_text,
                'heading_scale': 1.3,
                'layout': 'full_bleed',
                'no_card_container': True,
            },
            'quote': {
                'card_bg': '{{primary}}',
                'text': '#ffffff',
                'body_font_style': 'italic',
                'layout': 'single_focus',
            },
            'data': {
                'heading_scale': 0.9,
                'layout': 'dashboard',
            },
            'section': {
                'background': '{{primary}}',
                'text': '#ffffff',
                'layout': 'full_bleed',
            },
            'summary': {
                'background': '{{primary}}',
                'text': '#ffffff',
                'heading_scale': 1.1,
                'layout': 'full_bleed',
                'copyright': '© YYYY Company Name. All rights reserved.',
                'copyright_size': '11-12px',
                'copyright_opacity': '0.4-0.5',
            },
            'content': {
                'background': '{{background}}',
                'layout': 'mixed_grid',
            },
            'document': {
                'page_width': 794,
                'page_height': 1123,
                'page_unit': 'px',
                'print_width': 210,
                'print_height': 297,
                'print_unit': 'mm',
                'background': '{{background}}',
                'layout': 'single_focus',
                'no_card_container': True,
                'table_border': '1px solid rgba({{text_rgb}}, 0.12)',
                'cell_border': '1px solid rgba({{text_rgb}}, 0.06)',
                'header_font_size': '12-13px',
                'data_font_size': '12px',
                'label_font_size': '13px',
                'footer_font_size': '11-12px',
                'min_row_height': 26,
                'print_margin': '12mm 14mm',
                'decoration_circle_opacity': '0.03-0.05',
                'accent_stripe_height': 5,
            },
        },
        'layout_types': [
            {'id': 'full_bleed', 'cards': '1-3', 'description': '垂直居中，全屏', 'use': '封面、章节分隔、总结'},
            {'id': 'three_column', 'cards': 3, 'description': '水平等分，每栏 ~373px', 'use': '并列要点、三大优势'},
            {'id': 'two_column', 'cards': 2, 'description': '水平等分，每栏 ~550px', 'use': '对比分析、优劣对比'},
            {'id': 'two_column_asymmetric', 'cards': 2, 'description': '左宽 62% + 右窄 38%', 'use': '主次内容、问题+方案'},
            {'id': 'dashboard', 'cards': '3-5', 'description': '顶行 metric 卡 + 底行 summary', 'use': '数据总览、KPI 展示'},
            {'id': 'mixed_grid', 'cards': '3-4', 'description': '顶行 hero(全宽) + 底行 2-3 小卡', 'use': '核心观点+支撑论据'},
            {'id': 'hero_grid', 'cards': '2-4', 'description': '左 hero 大卡 + 右 1-2 小卡堆叠', 'use': '论点+数据佐证'},
            {'id': 'single_focus', 'cards': 1, 'description': '居中大卡 ~900px', 'use': '核心结论、金句'},
            {'id': 'timeline', 'cards': '2-5', 'description': '水平排列，步骤节点+连接线', 'use': '流程步骤、时间线'},
            {'id': 'horizontal_split', 'cards': '3-4', 'description': '顶全宽 hero + 底行 2-3 小卡', 'use': '标题+支撑指标'},
        ],
        'card_roles': [
            {'role': 'hero', 'visual': '大卡，大面积，核心信息', 'required': ['title', 'body'], 'optional': ['chart']},
            {'role': 'metric', 'visual': '居中大数字/进度条，顶部短色条', 'required': ['chart'], 'optional': []},
            {'role': 'card_0', 'visual': '标准卡，色条(chart_colors[0])', 'required': ['title or body'], 'optional': ['chart']},
            {'role': 'card_1', 'visual': '标准卡，色条(chart_colors[1])', 'required': ['title or body'], 'optional': ['chart']},
            {'role': 'card_2', 'visual': '标准卡，色条(chart_colors[2])', 'required': ['title or body'], 'optional': ['chart']},
            {'role': 'card_3', 'visual': '标准卡，色条(chart_colors[3])', 'required': ['title or body'], 'optional': ['chart']},
            {'role': 'card_4', 'visual': '标准卡，色条(chart_colors[4])', 'required': ['title or body'], 'optional': ['chart']},
            {'role': 'left', 'visual': '钢蓝顶条 + ▲ 前缀', 'required': ['title', 'body'], 'optional': ['chart'], 'use': '双栏对比左/正面/优势'},
            {'role': 'right', 'visual': '铜陶顶条 + ▼ 前缀', 'required': ['title', 'body'], 'optional': ['chart'], 'use': '双栏对比右/反面/劣势'},
            {'role': 'summary', 'visual': '全宽浅色/半透明卡', 'required': ['title or body'], 'optional': ['chart'], 'use': '数据总结、页面收尾'},
            {'role': 'step_N', 'visual': '圆形编号 + 标题 + 描述', 'required': ['title', 'body'], 'optional': [], 'use': '时间线步骤 1~5'},
        ],
        'decoration': {
            'accent_stripe': '3px solid {{accent}}',
            'title_underline': '40×2px {{accent}}',
            'page_dot': '5px {{accent}}',
            'layers': layers_dark if is_dark else layers_light,
            'types': [
                {'id': 'type_a', 'name': '几何风格', 'description': '半透明几何图形 + 顶部色条 + 标题短线 + 页码'},
                {'id': 'type_b', 'name': '纹理风格', 'description': '网格纹理 + 渐变光晕 + 发光边框'},
            ],
        },
        'icons': {
            'style': 'outline',
            'stroke_width': '1.5px',
            'card_size': 20,
            'hero_size': 36,
            'metric_size': 16,
            'color_rule': '跟随所在卡片的 chart_color, opacity: 0.85',
        },
        'illustrations': {
            'label_align': 'text-anchor=middle, label_x=graphic_cx',
            'label_spacing': '≥22px from graphic bottom to label baseline',
            'guide_spacing': '≥20px',
            'min_stroke': '1px',
            'min_font': '14px',
        },
        'quality_checklist': [
            '5 层结构完整', '≥3 个 SVG 元素', '≥4 种不同 chart_color', '≥1 个半透明几何装饰',
            '每卡: SVG图标 + 标题 + 正文', '数字→图表形态', '顶部 accent 色条', '标题短线',
            '页码(dot + 页号)', '标题色正确', '正文 text 色', '卡片 card_bg 色',
            '背景 background 色', '字体 typography token', '圆角正确', '阴影 elevation token',
            '插图标签居中', '插图间距 ≥22px', '插图字号 ≥14px', 'SVG描边 ≥1px',
            '封面/总结无卡片容器', '色条轮换',
        ],
        'font_thresholds': {
            'slide_title': {'min': 28, 'max': 44},
            'card_title': {'min': 18, 'max': 32},
            'body': {'min': 14, 'max': 20},
            'label': {'min': 14, 'max': 14},
            'absolute_min': 14,
        },
        'safe_area': {'x_min': 40, 'y_min': 28, 'y_max': 710},
        'visual_richness': {
            'min_svg_elements': 3, 'min_colors': 4, 'min_cards': 3,
            'min_decorations': 2, 'min_layers': 5,
        },
        'block_types': {
            'header': {'description': '文档头部', 'colspan': 'full', 'font_size': '12-14px', 'color': 'rgba({{text_rgb}}, 0.55)', 'border_bottom': '1px solid rgba({{text_rgb}}, 0.08)', 'columns': '2-4'},
            'title': {'description': '文档主标题', 'colspan': 'full', 'background': 'linear-gradient(135deg, {{primary}} 0%, {{secondary}} 100%)', 'color': '#ffffff', 'font_size': '20-24px', 'font_weight': 700, 'letter_spacing': '2-3px', 'border_bottom': '2px solid {{accent}}'},
            'info_block': {'description': '键值对信息表', 'colspan': 'auto', 'label_bg': '{{card_bg}}', 'label_color': '{{accent}}', 'label_weight': 600, 'value_bg': '{{background}}', 'value_color': '{{text}}', 'font_size': '13-14px', 'image_placeholder_bg': '{{card_bg}}', 'image_placeholder_border': '1.5px dashed rgba({{text_rgb}}, 0.15)', 'image_placeholder_radius': 6},
            'table_block': {'description': '多列数据网格', 'colspan': 'auto', 'header_bg_default': '{{chart_1}}', 'header_bg_alt_0': '{{chart_0}}', 'header_bg_alt_2': '{{chart_2}}', 'header_color': '#ffffff', 'header_weight': 600, 'header_font_size': '12-13px', 'data_bg': '{{background}}', 'data_bg_alt': 'rgba({{text_rgb}}, 0.02)', 'data_font_size': '12px', 'row_height': 26, 'border': '1px solid rgba({{text_rgb}}, 0.06)', 'header_border_top': '2px solid rgba({{text_rgb}}, 0.1)', 'header_rotation': 'chart_1 → chart_0 → chart_2'},
            'text_block': {'description': '自由段落文字', 'colspan': 'full', 'background': '{{background}}', 'color': '{{text}}', 'font_size': '14-16px', 'line_height': 1.8, 'border_top': '1px solid rgba({{text_rgb}}, 0.08)'},
            'list_block': {'description': '编号或项目符号列表', 'colspan': 'full', 'number_color': '{{accent}}', 'number_weight': 600, 'number_size': '14px', 'item_color': '{{text}}', 'item_size': '14px', 'styles': ['ordered', 'bullet', 'checkbox'], 'border_top': '1px solid rgba({{text_rgb}}, 0.08)'},
            'closing': {'description': '文档收束区域', 'colspan': 'full', 'background': '{{card_bg}}', 'color': '{{text}}', 'font_size': '13-14px', 'border_top': '1.5px solid rgba({{text_rgb}}, 0.1)', 'layouts': ['center', 'split']},
            'footer': {'description': '文档底部声明区', 'colspan': 'full', 'background': '{{card_bg}}', 'color': 'rgba({{text_rgb}}, 0.45)', 'font_size': '11-12px', 'line_height': 1.7, 'border_top': '1.5px solid rgba({{text_rgb}}, 0.1)', 'align': 'center'},
        },
    }

    return token, base_style


# ── MAIN ──
pending = ['minimal','blueprint','bold-editorial','chalkboard','editorial-infographic',
           'fantasy-animation','intuition-machine','pixel-art','scientific',
           'sketch-notes','vector-illustration','watercolor']

for sid in pending:
    result = build_tokens(sid)
    if result is None:
        continue
    token, base_style = result

    # Ensure directory
    vi_dir = os.path.join(VI_DIR, sid)
    os.makedirs(vi_dir, exist_ok=True)

    # Write tokens.yaml
    out_path = os.path.join(vi_dir, 'tokens.yaml')
    with open(out_path, 'w', encoding='utf-8') as f:
        # Header comment
        name = token['color_schemes'][token['color_scheme']].get('label', sid)
        f.write(f'# {name} — Design Tokens\n')
        f.write('# 程序解析用，所有色值/字号/间距的精确数值\n')
        f.write('# 颜色变量: {{primary}}, {{primary_rgb}}, {{accent}}, {{chart_0}}, 等\n\n')
        yaml.dump(token, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    # Determine is_dark for template base
    first_scheme_name = list(token['color_schemes'].keys())[0]
    first_scheme = token['color_schemes'][first_scheme_name]
    is_dark = _is_dark(first_scheme)
    print(f'  Wrote {sid}/tokens.yaml ({first_scheme.get("label","")}, {\"dark\" if is_dark else \"light\"}) — template base: {base_style}')

print(f'\nDone: {len(pending)} tokens.yaml files generated')
