import { useState, useEffect } from 'react'

// ── Types ──

interface Dimension {
  label: string
  desc: string
}

interface Chapter {
  label: string
  example: string
}

type ImageRole = 'background' | 'hero' | 'content' | 'grid'

interface ImageDef {
  role: ImageRole
  hint: string
  opacity: number
}

type ChartType = 'bar' | 'line' | 'pie' | 'radar' | 'scatter' | 'donut' | 'area'

interface ChartDef {
  type: ChartType
  title: string
  hint: string
}

type CardRole = 'hero' | 'metric' | 'summary' | 'left' | 'right'
  | 'card_0' | 'card_1' | 'card_2' | 'card_3' | 'card_4'
  | 'step_1' | 'step_2' | 'step_3' | 'step_4' | 'step_5'

interface CardDef {
  role: CardRole
  content_hint: string
}

type PageType =
  | 'cover' | 'toc' | 'section' | 'chapter'
  | 'content' | 'data' | 'data_hero'
  | 'technique' | 'principle' | 'process_flow' | 'process_timeline' | 'timeline'
  | 'comparison' | 'duo_compare' | 'table' | 'grid_cards' | 'image_grid' | 'quote'
  | 'image_hero' | 'food_archive' | 'skill_card' | 'troubleshoot' | 'appendix'
  | 'chart' | 'diagram'
  | 'copyright' | 'closing' | 'summary'

type LayoutHint = 'single_focus' | 'single_column' | 'two_column' | 'two_column_asymmetric' | 'three_column'
  | 'quad_grid' | 'hero_grid' | 'mixed_grid' | 'dashboard' | 'timeline' | 'vertical_steps'
  | 'horizontal_split' | 'horizontal_steps' | 'full_bleed' | 'media_text' | 'matrix_2x2' | 'profile_grid' | 'data_table'

type VisualWeight = 'low' | 'medium' | 'high'

interface PageDef {
  id: string
  type: PageType
  heading: string
  layout_hint: LayoutHint
  visual_weight: VisualWeight
  dimensions?: Dimension[]
  titleFormat?: string
  subtitle?: string
  description?: string
  metaFields?: string[]
  metaExamples?: string[]
  chapters?: Chapter[]
  images?: ImageDef[]
  charts?: ChartDef[]
  cards?: CardDef[]
}

// ── Card role config ──

const CARD_ROLES: { role: CardRole; label: string; hint: string; group: string }[] = [
  { role: 'hero', label: '主卡片', hint: '页面核心内容区，面积最大', group: '主要' },
  { role: 'metric', label: '指标卡', hint: 'KPI/数字展示', group: '主要' },
  { role: 'summary', label: '总结卡', hint: '结论/摘要', group: '主要' },
  { role: 'left', label: '左栏', hint: '双栏布局左侧，▲ 前缀 + 钢蓝顶条', group: '双栏' },
  { role: 'right', label: '右栏', hint: '双栏布局右侧，▼ 前缀 + 铜陶顶条', group: '双栏' },
  { role: 'card_0', label: '卡片1', hint: '内容卡片，chart-0 色条', group: '多卡' },
  { role: 'card_1', label: '卡片2', hint: '内容卡片，chart-1 色条', group: '多卡' },
  { role: 'card_2', label: '卡片3', hint: '内容卡片，chart-2 色条', group: '多卡' },
  { role: 'card_3', label: '卡片4', hint: '内容卡片，chart-3 色条', group: '多卡' },
  { role: 'card_4', label: '卡片5', hint: '内容卡片，chart-4 色条', group: '多卡' },
  { role: 'step_1', label: '步骤1', hint: '流程步骤，圆形编号① + 连接线', group: '流程' },
  { role: 'step_2', label: '步骤2', hint: '流程步骤，圆形编号② + 连接线', group: '流程' },
  { role: 'step_3', label: '步骤3', hint: '流程步骤，圆形编号③ + 连接线', group: '流程' },
  { role: 'step_4', label: '步骤4', hint: '流程步骤，圆形编号④ + 连接线', group: '流程' },
  { role: 'step_5', label: '步骤5', hint: '流程步骤，圆形编号⑤ + 连接线', group: '流程' },
]

const CARD_ROLE_LABEL: Record<string, string> = {}
CARD_ROLES.forEach(r => { CARD_ROLE_LABEL[r.role] = r.label })

const CARD_ROLE_GROUP_ORDER = ['主要', '双栏', '多卡', '流程']

// ── Which card role groups are relevant per page type ──
const PAGE_CARD_GROUPS: Record<string, string[]> = {
  cover: ['主要'],
  section: ['主要'],
  summary: ['主要'],
  closing: ['主要'],
  copyright: ['主要'],
  toc: [],
  content: ['主要', '双栏', '多卡'],
  technique: ['主要', '多卡'],
  principle: ['主要', '多卡'],
  data: ['主要', '多卡'],
  data_hero: ['主要'],
  comparison: ['双栏'],
  duo_compare: ['双栏'],
  timeline: ['流程'],
  process_flow: ['流程'],
  process_timeline: ['流程'],
  table: ['主要'],
  grid_cards: ['多卡'],
  image_grid: ['主要'],
  image_hero: ['主要'],
  quote: ['主要'],
  food_archive: ['主要', '多卡'],
  skill_card: ['主要', '多卡'],
  troubleshot: ['主要', '流程'],
  chart: ['主要'],
  diagram: ['主要'],
  appendix: ['主要', '多卡'],
  chapter: ['主要'],
}

function allowedRolesForType(t: PageType): CardRole[] {
  const groups = PAGE_CARD_GROUPS[t] || ['主要', '双栏', '多卡']
  return CARD_ROLES.filter(r => groups.includes(r.group)).map(r => r.role)
}

function defaultCardRole(t: PageType): CardRole {
  const allowed = allowedRolesForType(t)
  return allowed[0] || 'hero'
}

// ── Layout → visual preview description ──

function describeLayout(layout: LayoutHint, cards: CardDef[]): string {
  const names = cards.map(c => CARD_ROLE_LABEL[c.role] || c.role)
  const descs: Record<LayoutHint, string> = {
    full_bleed: '全屏居中，垂直排列',
    single_focus: '居中单卡，~900px 宽，核心观点',
    single_column: '单栏全内容区，条目垂直排列，边距统一',
    two_column: `左右等分双栏：${names.join(' | ')}`,
    two_column_asymmetric: `左宽右窄（62%/38%）：${names.join(' | ')}`,
    three_column: `三等分网格：${names.join(' · ')}，色条 chart-0/1/2 轮换`,
    quad_grid: `2×2 四象限：${names.join(' · ')}`,
    hero_grid: `左大右小：${names[0]}主导 + ${names.slice(1).join('、') || '?'}支撑`,
    mixed_grid: `顶行全宽${names[0]} + 底行${names.slice(1).join('、') || '多卡'}`,
    dashboard: `仪表盘：顶行指标卡 → 底行总结`,
    timeline: `时间线流程：${names.join(' → ')}`,
    vertical_steps: `垂直步骤：${names.join(' ↓ ')}`,
    horizontal_split: `顶全宽 + 底行并列`,
    horizontal_steps: `水平步骤流：${names.join(' → ')}`,
    media_text: `图文混排：${names.join(' | ')}`,
    matrix_2x2: `矩阵分析：四象限+轴标签`,
    profile_grid: `人物网格：${names.join(' · ')}，头像+姓名+职位`,
    data_table: `数据表格：${names.join(' | ')}，多行多列结构化数据`,
  }
  return descs[layout] || ''
}

// ── Layout defaults ──

const LAYOUT_DEFAULT_CARDS: Record<LayoutHint, CardRole[]> = {
  single_focus: ['hero'],
  single_column: ['hero'],
  two_column: ['left', 'right'],
  two_column_asymmetric: ['hero', 'right'],
  three_column: ['card_0', 'card_1', 'card_2'],
  quad_grid: ['card_0', 'card_1', 'card_2', 'card_3'],
  hero_grid: ['hero', 'card_0', 'card_1'],
  mixed_grid: ['hero', 'card_0', 'card_1', 'card_2'],
  dashboard: ['metric', 'metric', 'metric', 'card_0'],
  timeline: ['step_1', 'step_2', 'step_3', 'step_4', 'step_5'],
  vertical_steps: ['step_1', 'step_2', 'step_3', 'step_4'],
  horizontal_split: ['left', 'right'],
  horizontal_steps: ['step_1', 'step_2', 'step_3', 'step_4'],
  full_bleed: ['hero'],
  media_text: ['hero', 'card_0'],
  matrix_2x2: ['card_0', 'card_1', 'card_2', 'card_3'],
  profile_grid: ['card_0', 'card_1', 'card_2'],
  data_table: ['card_0', 'card_1', 'card_2', 'card_3'],
}

function defaultCardsForLayout(layout: LayoutHint): CardDef[] {
  return (LAYOUT_DEFAULT_CARDS[layout] || ['hero']).map(role => ({ role, content_hint: '' }))
}

// ── Page type → standard layout（与后端 ppt_service.py PAGE_TYPE_LAYOUT_MAP 同源）──
// 单一真源：切换/新建页面类型时的标准布局，避免残留旧类型布局。
// 结构页（cover/toc/section/summary/closing/copyright）为代码填充，保持既有值不变。
const TYPE_DEFAULT_LAYOUT: Record<PageType, LayoutHint> = {
  // 结构页 — 代码填充，零 LLM
  cover: 'full_bleed',
  toc: 'single_column',
  section: 'full_bleed',
  summary: 'single_focus',
  closing: 'single_focus',
  copyright: 'single_focus',
  // 内容 / 展示类 — 与后端 PAGE_TYPE_LAYOUT_MAP 对齐
  chapter: 'hero_grid',
  content: 'hero_grid',
  data: 'dashboard',
  data_hero: 'single_focus',
  technique: 'vertical_steps',
  principle: 'two_column_asymmetric',
  process_flow: 'timeline',
  process_timeline: 'timeline',
  timeline: 'timeline',
  comparison: 'two_column',
  duo_compare: 'two_column',
  table: 'data_table',
  grid_cards: 'hero_grid',
  image_grid: 'quad_grid',
  quote: 'single_focus',
  image_hero: 'media_text',
  food_archive: 'hero_grid',
  skill_card: 'profile_grid',
  troubleshoot: 'data_table',
  appendix: 'single_column',
  // 后端无静态映射（走内容分析）— 前端给合理默认
  chart: 'dashboard',
  diagram: 'single_focus',
}

// ── Image role config ──

const IMAGE_ROLES: { role: ImageRole; label: string; hint: string }[] = [
  { role: 'background', label: '背景图', hint: '全页背景，{{IMAGE_URL}} 占位' },
  { role: 'hero', label: '主图', hint: '大面积展示图，55-75% 区域' },
  { role: 'content', label: '内容插图', hint: '卡片配图/技法示意图' },
  { role: 'grid', label: '网格图', hint: '均匀网格图片单元' },
]

const IMAGE_ROLE_LABEL: Record<ImageRole, string> = Object.fromEntries(
  IMAGE_ROLES.map(r => [r.role, r.label])
) as Record<ImageRole, string>

const IMAGE_ROLE_PAGES: Record<ImageRole, PageType[]> = {
  background: ['cover', 'section', 'summary', 'closing'],
  hero: ['image_hero', 'content', 'data_hero'],
  content: ['content', 'technique', 'principle', 'food_archive', 'skill_card', 'diagram'],
  grid: ['image_grid', 'grid_cards'],
}

// ── Chart type config ──

const CHART_TYPES: { type: ChartType; label: string; hint: string }[] = [
  { type: 'bar', label: '柱状图', hint: '分类对比，多组并列' },
  { type: 'line', label: '折线图', hint: '趋势变化，时间序列' },
  { type: 'pie', label: '饼图', hint: '占比分布，部分与整体' },
  { type: 'donut', label: '环形图', hint: '饼图变体，中间可放总计' },
  { type: 'radar', label: '雷达图', hint: '多维评估，能力分布' },
  { type: 'scatter', label: '散点图', hint: '相关性分析，分布模式' },
  { type: 'area', label: '面积图', hint: '数量累积，趋势叠加' },
]

const CHART_PAGE_TYPES: PageType[] = ['data', 'data_hero', 'comparison', 'duo_compare', 'chart']

// ── Page type groups ──

const PT_GROUPS: { label: string; types: { type: PageType; label: string; hint: string }[] }[] = [
  {
    label: '开篇',
    types: [
      { type: 'cover', label: '封面', hint: '开场全屏视觉，主标题+副标题+背景图' },
    ],
  },
  {
    label: '导航',
    types: [
      { type: 'toc', label: '目录', hint: '内容导航与章节概览' },
      { type: 'section', label: '章节分隔', hint: '章节过渡页，深色全屏背景' },
      { type: 'chapter', label: '章节页', hint: '新章节起始，含编号标题概述' },
    ],
  },
  {
    label: '内容',
    types: [
      { type: 'content', label: '内容页', hint: '通用内容展示，多卡片布局' },
      { type: 'technique', label: '技法页', hint: '展示单一步骤/方法/技法' },
      { type: 'principle', label: '原则页', hint: '展示设计原则/理念' },
      { type: 'quote', label: '引言页', hint: '名言/引述/金句展示' },
    ],
  },
  {
    label: '数据',
    types: [
      { type: 'data', label: '数据页', hint: '数据可视化，图表+指标卡片' },
      { type: 'data_hero', label: '数据突出', hint: '大数字和关键指标为核心' },
    ],
  },
  {
    label: '图表',
    types: [
      { type: 'chart', label: '图表页', hint: '数据图表、统计可视化，SVG 图表为主' },
      { type: 'diagram', label: '图示页', hint: '示意图、结构图、插图说明' },
    ],
  },
  {
    label: '流程',
    types: [
      { type: 'process_flow', label: '流程图', hint: '流程步骤与分支逻辑' },
      { type: 'process_timeline', label: '流程时间线', hint: '流程+时间线结合' },
      { type: 'timeline', label: '时间线', hint: '时间序列事件/里程碑' },
    ],
  },
  {
    label: '对比',
    types: [
      { type: 'comparison', label: '对比页', hint: '横向对比' },
      { type: 'duo_compare', label: '双项对比', hint: '两方案深度对比' },
    ],
  },
  {
    label: '展示',
    types: [
      { type: 'table', label: '表格页', hint: '结构化表格数据' },
      { type: 'grid_cards', label: '网格卡片', hint: '均匀网格等权重卡片' },
      { type: 'image_grid', label: '图片网格', hint: '均匀网格多张图片' },
      { type: 'image_hero', label: '图片突出', hint: '大面积图片+文字叠层' },
    ],
  },
  {
    label: '特殊',
    types: [
      { type: 'food_archive', label: '美食档案', hint: '菜品/食谱详情卡片' },
      { type: 'skill_card', label: '技能卡片', hint: '技能/能力展示' },
      { type: 'troubleshoot', label: '问题排查', hint: '故障排查步骤' },
      { type: 'appendix', label: '附录页', hint: '补充参考资料' },
    ],
  },
  {
    label: '结尾',
    types: [
      { type: 'copyright', label: '版权页', hint: '版权声明和法律信息' },
      { type: 'closing', label: '结尾页', hint: '感谢+联系方式' },
      { type: 'summary', label: '总结页', hint: '核心要点回顾与总结' },
    ],
  },
]

const ALL_PAGE_TYPES = PT_GROUPS.flatMap(g => g.types)

const PAGE_LABEL_MAP: Record<string, string> = {}
const PAGE_HINT_MAP: Record<string, string> = {}
ALL_PAGE_TYPES.forEach(t => {
  PAGE_LABEL_MAP[t.type] = t.label
  PAGE_HINT_MAP[t.type] = t.hint
})

// ── Layout hints ──

const LAYOUT_GROUPS: { label: string; layouts: { type: LayoutHint; label: string }[] }[] = [
  { label: '全屏 & 焦点', layouts: [
    { type: 'full_bleed', label: '全屏出血' },
    { type: 'single_focus', label: '单一焦点' },
  ]},
  { label: '线性序列', layouts: [
    { type: 'single_column', label: '单栏列表' },
    { type: 'timeline', label: '时间线' },
    { type: 'vertical_steps', label: '垂直步骤' },
    { type: 'horizontal_steps', label: '水平步骤流' },
  ]},
  { label: '并列对比', layouts: [
    { type: 'two_column', label: '双栏对比' },
    { type: 'two_column_asymmetric', label: '双栏非对称' },
    { type: 'three_column', label: '三栏并列' },
    { type: 'quad_grid', label: '2×2 四象限' },
  ]},
  { label: '层级网格', layouts: [
    { type: 'hero_grid', label: '英雄网格' },
    { type: 'mixed_grid', label: '混合网格' },
    { type: 'horizontal_split', label: '水平分割' },
  ]},
  { label: '数据 & 媒体', layouts: [
    { type: 'dashboard', label: '仪表盘' },
    { type: 'matrix_2x2', label: '矩阵分析' },
    { type: 'data_table', label: '数据表格' },
    { type: 'media_text', label: '图文混排' },
    { type: 'profile_grid', label: '人物网格' },
  ]},
]

// ── Helpers ──

let _pageCounter = 0
function newPageId() { return `p${++_pageCounter}_${Date.now()}` }

function emptyPage(type: PageType, layout?: LayoutHint): PageDef {
  const lh = layout || TYPE_DEFAULT_LAYOUT[type] || 'hero_grid'
  const base: PageDef = {
    id: newPageId(),
    type,
    heading: PAGE_LABEL_MAP[type] || type,
    layout_hint: lh,
    visual_weight: 'medium',
    cards: defaultCardsForLayout(lh),
  }
  if (type === 'cover') {
    base.titleFormat = ''
    base.subtitle = ''
    base.description = ''
    base.metaFields = ['']
    base.metaExamples = ['']
    base.visual_weight = 'high'
    base.images = [{ role: 'background', hint: '', opacity: 30 }]
    base.cards = [{ role: 'hero', content_hint: '主标题+副标题+基础信息+内容简述' }]
  } else if (type === 'toc') {
    base.chapters = [{ label: '', example: '' }]
    base.visual_weight = 'low'
  } else if (type === 'closing' || type === 'copyright') {
    base.description = ''
    base.cards = [{ role: 'hero', content_hint: '结尾内容' }]
  } else if (type === 'summary') {
    base.visual_weight = 'high'
    base.images = [{ role: 'background', hint: '', opacity: 30 }]
  } else if (type === 'section') {
    base.visual_weight = 'high'
    base.images = [{ role: 'background', hint: '', opacity: 30 }]
    base.cards = [{ role: 'hero', content_hint: '章节标题+编号' }]
  } else if (type === 'data_hero') {
    base.visual_weight = 'high'
    base.images = [{ role: 'hero', hint: '', opacity: 100 }]
  } else if (type === 'image_hero') {
    base.visual_weight = 'high'
    base.images = [{ role: 'hero', hint: '', opacity: 100 }]
  } else if (type === 'image_grid') {
    base.images = [{ role: 'grid', hint: '', opacity: 100 }, { role: 'grid', hint: '', opacity: 100 }]
  } else if (type === 'grid_cards') {
    base.images = [{ role: 'grid', hint: '', opacity: 100 }]
  } else if (type === 'content' || type === 'technique') {
    base.images = [{ role: 'content', hint: '', opacity: 100 }]
  } else if (type === 'food_archive') {
    base.images = [{ role: 'content', hint: '', opacity: 100 }]
  } else if (type === 'skill_card') {
    base.images = [{ role: 'content', hint: '', opacity: 100 }]
  } else if (type === 'principle') {
    base.images = [{ role: 'content', hint: '', opacity: 100 }]
  } else if (type === 'chart') {
    base.visual_weight = 'high'
    base.charts = [{ type: 'bar', title: '', hint: '' }]
  } else if (type === 'diagram') {
    base.visual_weight = 'medium'
    base.images = [{ role: 'content', hint: '', opacity: 100 }]
  } else {
    base.dimensions = [{ label: '', desc: '' }]
  }
  // Charts for data/comparison/chart types
  if (CHART_PAGE_TYPES.includes(type)) {
    if (!base.charts || base.charts.length === 0) {
      base.charts = [{ type: 'bar', title: '', hint: '' }]
    }
  }
  return base
}

function _dimChange(dims: Dimension[], idx: number, field: 'label' | 'desc', val: string): Dimension[] {
  return dims.map((d, i) => (i === idx ? { ...d, [field]: val } : d))
}

function _strArrChange(arr: string[], idx: number, val: string): string[] {
  return arr.map((s, i) => (i === idx ? val : s))
}

function _chapterChange(chapters: Chapter[], idx: number, field: 'label' | 'example', val: string): Chapter[] {
  return chapters.map((c, i) => (i === idx ? { ...c, [field]: val } : c))
}

function _imgChange(imgs: ImageDef[], idx: number, field: 'role' | 'hint' | 'opacity', val: string): ImageDef[] {
  return imgs.map((img, i) => (i === idx ? { ...img, [field]: field === 'opacity' ? Number(val) : val } as ImageDef : img))
}

function _chartChange(charts: ChartDef[], idx: number, field: 'type' | 'title' | 'hint', val: string): ChartDef[] {
  return charts.map((c, i) => (i === idx ? { ...c, [field]: val } as ChartDef : c))
}

function _cardChange(cards: CardDef[], idx: number, field: 'role' | 'content_hint', val: string): CardDef[] {
  return cards.map((c, i) => (i === idx ? { ...c, [field]: val } as CardDef : c))
}

// ── Group card roles for display ──
function groupCardRoles(pageType?: PageType): { group: string; roles: CardRole[] }[] {
  const allowedGroups = pageType ? (PAGE_CARD_GROUPS[pageType] || ['主要', '双栏', '多卡']) : ['主要', '双栏', '多卡', '流程']
  const map: Record<string, CardRole[]> = {}
  CARD_ROLES.forEach(r => {
    if (!allowedGroups.includes(r.group)) return
    if (!map[r.group]) map[r.group] = []
    map[r.group].push(r.role)
  })
  return CARD_ROLE_GROUP_ORDER
    .filter(g => map[g] && map[g].length > 0)
    .map(group => ({ group, roles: map[group] }))
}

// ── Component ──

interface Props {
  initialSkill: string
  onSaved: (skill: string) => void
}

export default function Col45StructureEditor({ initialSkill, onSaved }: Props) {
  const [pages, setPages] = useState<PageDef[]>(() => parseSkill(initialSkill))
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    onSaved(buildSkill())
  }, [pages])

  function parseSkill(skill: string): PageDef[] {
    try {
      const raw = JSON.parse(skill)
      const arr = Array.isArray(raw) ? raw : (raw.slides || [])
      return arr.map((p: any, i: number) => {
        const t = (p.page_type || 'content') as PageType
        const lh = (p.layout_hint || 'hero_grid') as LayoutHint
        const def: PageDef = {
          id: newPageId(),
          type: t,
          heading: p.heading || `第${i + 1}页`,
          layout_hint: lh,
          visual_weight: (p.visual_weight || 'medium') as VisualWeight,
        }
        if (t === 'cover') {
          def.metaFields = (p.key_points || []).length > 0 ? p.key_points : ['']
          def.metaExamples = p.examples || []
          while (def.metaExamples!.length < def.metaFields!.length) def.metaExamples!.push('')
          if (def.metaExamples!.length > def.metaFields!.length) def.metaExamples = def.metaExamples!.slice(0, def.metaFields!.length)
          def.titleFormat = p.title_format || ''
          def.subtitle = p.subtitle || ''
          def.description = p.description || ''
        } else if (t === 'toc') {
          const chapters = p.chapters || []
          def.chapters = chapters.length > 0
            ? chapters.map((ch: any) => ({ label: ch.label || '', example: ch.example || '' }))
            : [{ label: '', example: '' }]
        } else if (t === 'closing' || t === 'copyright') {
          def.description = p.description || ''
        } else {
          const kps: string[] = p.key_points || []
          const descs: string[] = p.examples || []
          def.dimensions = kps.map((k: string, i: number) => ({ label: k, desc: descs[i] || '' }))
          if (def.dimensions.length === 0) def.dimensions = [{ label: '', desc: '' }]
        }
        // Parse images
        if (Array.isArray(p.images)) {
          def.images = p.images.map((img: any) => ({
            role: (img.role || 'content') as ImageRole,
            hint: img.hint || '',
            opacity: typeof img.opacity === 'number' ? img.opacity : (img.role === 'background' ? 30 : 100),
          }))
        }
        // Parse charts
        if (Array.isArray(p.charts)) {
          def.charts = p.charts.map((ch: any) => ({
            type: (ch.type || 'bar') as ChartType,
            title: ch.title || '',
            hint: ch.hint || '',
          }))
        }
        // Parse cards
        if (Array.isArray(p.cards)) {
          def.cards = p.cards.map((c: any) => ({
            role: (c.role || 'hero') as CardRole,
            content_hint: c.content_hint || '',
          }))
        } else {
          def.cards = defaultCardsForLayout(lh)
        }
        return def
      })
    } catch {
      return [
        emptyPage('cover'),
        emptyPage('toc'),
        emptyPage('content'),
        emptyPage('table'),
        emptyPage('chart'),
        emptyPage('summary'),
        emptyPage('closing'),
      ]
    }
  }

  function buildSkill(): string {
    const slides = pages.map((p, i) => {
      const s: any = {
        seq: i + 1,
        heading: p.heading,
        page_type: p.type,
        layout_hint: p.layout_hint,
        visual_weight: p.visual_weight,
      }
      if (p.type === 'cover') {
        s.key_points = (p.metaFields || []).filter(f => f.trim()).map(f => f.trim())
        const examples = (p.metaExamples || []).map(e => e.trim()).filter(e => e !== '')
        if (examples.length > 0) s.examples = examples
        s.title_format = p.titleFormat || p.heading || ''
        s.subtitle = p.subtitle || ''
        s.description = p.description || ''
      } else if (p.type === 'toc') {
        const chapters = (p.chapters || []).filter(c => c.label.trim()).map(c => ({
          label: c.label.trim(),
          example: (c.example || '').trim(),
        }))
        if (chapters.length > 0) s.chapters = chapters
      } else if (p.type === 'closing' || p.type === 'copyright') {
        if (p.description) s.description = p.description
      } else {
        const dims = (p.dimensions || []).filter(d => d.label.trim())
        s.key_points = dims.map(d => d.label.trim())
        const descs = dims.map(d => (d.desc || '').trim()).filter(d => d !== '')
        if (descs.length > 0) s.examples = descs
      }
      // Serialize images
      const imgs = (p.images || []).filter(img => img.hint.trim() || img.role)
      if (imgs.length > 0) {
        s.images = imgs.map(img => ({ role: img.role, hint: img.hint.trim(), opacity: img.opacity }))
      }
      // Serialize charts
      const charts = (p.charts || []).filter(ch => ch.title.trim() || ch.hint.trim())
      if (charts.length > 0) {
        s.charts = charts.map(ch => ({ type: ch.type, title: ch.title.trim(), hint: ch.hint.trim() }))
      }
      // Serialize cards
      const cards = (p.cards || []).filter(c => c.content_hint.trim() || c.role)
      if (cards.length > 0) {
        s.cards = cards.map(c => ({ role: c.role, content_hint: c.content_hint.trim() }))
      }
      return s
    })
    return JSON.stringify(slides, null, 2)
  }

  // ── Page mutations ──
  const addPage = (type: PageType) => setPages(prev => [...prev, emptyPage(type)])
  const removePage = (id: string) => setPages(prev => prev.filter(p => p.id !== id))
  const movePage = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= pages.length) return
    setPages(prev => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }
  const setPageType = (id: string, type: PageType) => {
    setPages(prev => prev.map(p => {
      if (p.id !== id) return p
      // 不继承旧 layout_hint — 用新类型的标准布局，避免残留（heading 保留）
      const fresh = emptyPage(type)
      return { ...fresh, id: p.id, heading: p.heading }
    }))
  }
  const setHeading = (id: string, v: string) => setPages(prev => prev.map(p => p.id === id ? { ...p, heading: v } : p))
  const setLayout = (id: string, v: LayoutHint) => {
    setPages(prev => prev.map(p => {
      if (p.id !== id) return p
      return { ...p, layout_hint: v, cards: defaultCardsForLayout(v) }
    }))
  }
  const setWeight = (id: string, v: VisualWeight) => setPages(prev => prev.map(p => p.id === id ? { ...p, visual_weight: v } : p))

  const addDim = (id: string) => setPages(prev => prev.map(p =>
    p.id === id ? { ...p, dimensions: [...(p.dimensions || []), { label: '', desc: '' }] } : p))
  const setDim = (id: string, idx: number, field: 'label' | 'desc', v: string) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, dimensions: _dimChange(p.dimensions || [], idx, field, v) } : p))
  const removeDim = (id: string, idx: number) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, dimensions: (p.dimensions || []).filter((_, i) => i !== idx) } : p))

  const addChapter = (id: string) => setPages(prev => prev.map(p =>
    p.id === id ? { ...p, chapters: [...(p.chapters || []), { label: '', example: '' }] } : p))
  const setChapter = (id: string, idx: number, field: 'label' | 'example', v: string) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, chapters: _chapterChange(p.chapters || [], idx, field, v) } : p))
  const removeChapter = (id: string, idx: number) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, chapters: (p.chapters || []).filter((_, i) => i !== idx) } : p))

  // Image mutations
  const addImage = (id: string, role: ImageRole) => setPages(prev => prev.map(p =>
    p.id === id ? { ...p, images: [...(p.images || []), { role, hint: '', opacity: role === 'background' ? 30 : 100 }] } : p))
  const setImage = (id: string, idx: number, field: 'role' | 'hint' | 'opacity', v: string) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, images: _imgChange(p.images || [], idx, field, v) } : p))
  const removeImage = (id: string, idx: number) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, images: (p.images || []).filter((_, i) => i !== idx) } : p))

  // Chart mutations
  const addChart = (id: string) => setPages(prev => prev.map(p =>
    p.id === id ? { ...p, charts: [...(p.charts || []), { type: 'bar' as ChartType, title: '', hint: '' }] } : p))
  const setChart = (id: string, idx: number, field: 'type' | 'title' | 'hint', v: string) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, charts: _chartChange(p.charts || [], idx, field, v) } : p))
  const removeChart = (id: string, idx: number) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, charts: (p.charts || []).filter((_, i) => i !== idx) } : p))

  // Card mutations
  const addCard = (id: string) => setPages(prev => prev.map(p => {
    if (p.id !== id) return p
    const dRole = defaultCardRole(p.type)
    return { ...p, cards: [...(p.cards || []), { role: dRole, content_hint: '' }] }
  }))
  const setCard = (id: string, idx: number, field: 'role' | 'content_hint', v: string) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, cards: _cardChange(p.cards || [], idx, field, v) } : p))
  const removeCard = (id: string, idx: number) =>
    setPages(prev => prev.map(p => p.id === id ? { ...p, cards: (p.cards || []).filter((_, i) => i !== idx) } : p))

  const toggleCollapse = (id: string) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))

  // ── Styles ──
  const pageNumStyle: React.CSSProperties = { fontWeight: 600, fontSize: 11, minWidth: 36, color: 'var(--text-secondary)' }
  const inputStyle: React.CSSProperties = { fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)' }
  const selectStyle: React.CSSProperties = { fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)' }
  const btnStyle: React.CSSProperties = { fontSize: 10, padding: '2px 6px', borderRadius: 3 }
  const dimLabelStyle: React.CSSProperties = { fontSize: 10, minWidth: 30, color: 'var(--text-secondary)' }
  const groupLabelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', padding: '2px 6px 0' }
  const sectionLabelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3 }

  const showImagesFor = (t: PageType) => {
    for (const [, types] of Object.entries(IMAGE_ROLE_PAGES)) {
      if (types.includes(t)) return true
    }
    return false
  }

  const availableRoles = (t: PageType): ImageRole[] => {
    const roles: ImageRole[] = []
    for (const [role, types] of Object.entries(IMAGE_ROLE_PAGES)) {
      if (types.includes(t)) roles.push(role as ImageRole)
    }
    return roles
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="form-label" style={{ margin: 0 }}>
        PPT 结构编辑器 — 页面/卡片级编排，配置布局、图片、图表
      </div>

      {pages.map((p, idx) => {
        const isCollapsed = collapsed[p.id] === true
        const roles = availableRoles(p.type)
        const cardGroups = groupCardRoles(p.type)
        const layoutPreview = describeLayout(p.layout_hint, p.cards || [])
        return (
          <div key={p.id} style={{
            border: '1px solid var(--border)', borderRadius: 4,
            padding: '8px 10px', background: 'var(--bg-secondary)',
          }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={pageNumStyle}>第{idx + 1}页</span>
              <select value={p.type} onChange={e => setPageType(p.id, e.target.value as PageType)} style={selectStyle}>
                {PT_GROUPS.map(g => (
                  <optgroup key={g.label} label={`── ${g.label} ──`}>
                    {g.types.map(t => <option key={t.type} value={t.type}>{t.label} ({t.type})</option>)}
                  </optgroup>
                ))}
              </select>
              <input value={p.heading} onChange={e => setHeading(p.id, e.target.value)}
                placeholder="页面标题" style={{ ...inputStyle, flex: 1 }} />
              <select value={p.layout_hint} onChange={e => setLayout(p.id, e.target.value as LayoutHint)}
                style={{ ...selectStyle, width: 90 }} title="布局">
                {LAYOUT_GROUPS.map(g => (
                  <optgroup key={g.label} label={`── ${g.label} ──`}>
                    {g.layouts.map(l => <option key={l.type} value={l.type}>{l.label}</option>)}
                  </optgroup>
                ))}
              </select>
              <select value={p.visual_weight} onChange={e => setWeight(p.id, e.target.value as VisualWeight)}
                style={{ ...selectStyle, width: 52 }} title="视觉权重">
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
              <button onClick={() => movePage(idx, -1)} disabled={idx === 0} style={btnStyle} title="上移">↑</button>
              <button onClick={() => movePage(idx, 1)} disabled={idx === pages.length - 1} style={btnStyle} title="下移">↓</button>
              <button onClick={() => toggleCollapse(p.id)} style={{ ...btnStyle, fontSize: 10 }} title="折叠">
                {isCollapsed ? '▶' : '▼'}
              </button>
              <button onClick={() => removePage(p.id)}
                style={{ ...btnStyle, color: 'var(--danger)', border: '1px solid var(--danger)', background: 'transparent' }}>
                删除
              </button>
            </div>

            {!isCollapsed && (
              <>
                <div className="form-hint" style={{ marginBottom: 6 }}>
                  {PAGE_HINT_MAP[p.type]} | 布局: {LAYOUT_GROUPS.flatMap(g => g.layouts).find(l => l.type === p.layout_hint)?.label} | 权重: {p.visual_weight}
                </div>

                {/* ── Cards section ── */}
                <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px dashed var(--border)' }}>
                  <div style={sectionLabelStyle}>
                    卡片编排 ({LAYOUT_GROUPS.flatMap(g => g.layouts).find(l => l.type === p.layout_hint)?.label}
                    {LAYOUT_DEFAULT_CARDS[p.layout_hint] ? ` — 默认: ${LAYOUT_DEFAULT_CARDS[p.layout_hint].map(r => CARD_ROLE_LABEL[r]).join('+')}` : ''})
                  </div>
                  {/* Layout preview description */}
                  {layoutPreview && (
                    <div style={{
                      fontSize: 10, color: 'var(--accent)', marginBottom: 6,
                      padding: '3px 8px', background: 'rgba(var(--primary-rgb),0.04)',
                      borderRadius: 3, lineHeight: 1.5,
                    }}>
                      {layoutPreview}
                    </div>
                  )}
                  {/* Show card role hints when no allowed roles */}
                  {cardGroups.length === 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, fontStyle: 'italic' }}>
                      此页面类型不使用卡片编排（结构由模板固定）
                    </div>
                  )}
                  {(p.cards || []).map((c, ci) => (
                    <div key={ci} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
                      <span style={dimLabelStyle}>卡片{ci + 1}</span>
                      <select value={c.role}
                        onChange={e => setCard(p.id, ci, 'role', e.target.value)}
                        style={{ ...selectStyle, width: 80 }}>
                        {cardGroups.map(g => (
                          <optgroup key={g.group} label={`── ${g.group} ──`}>
                            {g.roles.map(r => <option key={r} value={r}>{CARD_ROLE_LABEL[r]}</option>)}
                          </optgroup>
                        ))}
                      </select>
                      <input value={c.content_hint}
                        onChange={e => setCard(p.id, ci, 'content_hint', e.target.value)}
                        placeholder={c.role === 'hero' ? '核心内容提示（如：主要观点概述）' :
                          c.role === 'metric' ? '指标提示（如：季度营收数据）' :
                          c.role.startsWith('card_') ? '卡片内容提示' :
                          c.role.startsWith('step_') ? '步骤内容提示' :
                          c.role === 'left' ? '左侧内容提示 — ▲ 优势/正面' :
                          c.role === 'right' ? '右侧内容提示 — ▼ 劣势/反面' : '内容提示'}
                        style={{ ...inputStyle, flex: 1 }} />
                      <button onClick={() => removeCard(p.id, ci)}
                        style={{ fontSize: 11, padding: '1px 4px', color: 'var(--danger)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                        ×
                      </button>
                    </div>
                  ))}
                  {cardGroups.length > 0 && (
                    <button onClick={() => addCard(p.id)}
                      style={{ fontSize: 9, padding: '2px 6px', marginTop: 2 }}>
                      + 添加卡片
                    </button>
                  )}
                </div>

                {/* cover: title / subtitle / meta fields / description */}
                {p.type === 'cover' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <div className="form-hint" style={{ marginBottom: 2 }}>标题格式</div>
                      <input value={p.titleFormat || ''}
                        onChange={e => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, titleFormat: e.target.value } : pp))}
                        placeholder="标题模板（如：{菜名} — SOP的道与术）" style={{ ...inputStyle, width: '100%' }} />
                    </div>
                    <div>
                      <div className="form-hint" style={{ marginBottom: 2 }}>副标题</div>
                      <input value={p.subtitle || ''}
                        onChange={e => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, subtitle: e.target.value } : pp))}
                        placeholder="副标题（如：{工艺特征}的精要解析）" style={{ ...inputStyle, width: '100%' }} />
                    </div>
                    <div>
                      <div className="form-hint" style={{ marginBottom: 2 }}>基础信息</div>
                      {(p.metaFields || []).map((f, fi) => (
                        <div key={fi} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
                          <span style={dimLabelStyle}>标签{fi + 1}</span>
                          <input value={f}
                            onChange={e => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, metaFields: _strArrChange(pp.metaFields || [], fi, e.target.value) } : pp))}
                            placeholder="标签（如：菜品研发部）" style={{ ...inputStyle, flex: 1 }} />
                          <input value={(p.metaExamples || [])[fi] || ''}
                            onChange={e => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, metaExamples: _strArrChange(pp.metaExamples || [], fi, e.target.value) } : pp))}
                            placeholder="说明（可选）" style={{ ...inputStyle, flex: 2 }} />
                          <button
                            onClick={() => setPages(prev => prev.map(pp => pp.id === p.id ? {
                              ...pp,
                              metaFields: (pp.metaFields || []).filter((_, i) => i !== fi),
                              metaExamples: (pp.metaExamples || []).filter((_, i) => i !== fi),
                            } : pp))}
                            style={{ fontSize: 11, padding: '1px 4px', color: 'var(--danger)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                            ×
                          </button>
                        </div>
                      ))}
                      <button onClick={() => setPages(prev => prev.map(pp => pp.id === p.id ? {
                        ...pp,
                        metaFields: [...(pp.metaFields || []), ''],
                        metaExamples: [...(pp.metaExamples || []), ''],
                      } : pp))}
                        style={{ fontSize: 10, padding: '2px 6px', alignSelf: 'flex-start', marginTop: 2 }}>
                        + 添加标签
                      </button>
                    </div>
                    <div>
                      <div className="form-hint" style={{ marginBottom: 2 }}>内容简述</div>
                      <textarea value={p.description || ''}
                        onChange={e => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, description: e.target.value } : pp))}
                        placeholder="内容简述，AI 自动从正文提炼"
                        rows={2}
                        style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
                    </div>
                  </div>
                )}

                {/* toc: chapter list */}
                {p.type === 'toc' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {(p.chapters || []).map((c, ci) => (
                      <div key={ci} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={dimLabelStyle}>章节{ci + 1}</span>
                        <input value={c.label}
                          onChange={e => setChapter(p.id, ci, 'label', e.target.value)}
                          placeholder="章节标题" style={{ ...inputStyle, flex: 1 }} />
                        <input value={c.example || ''}
                          onChange={e => setChapter(p.id, ci, 'example', e.target.value)}
                          placeholder="说明（可选）" style={{ ...inputStyle, flex: 2 }} />
                        <button onClick={() => removeChapter(p.id, ci)}
                          style={{ fontSize: 11, padding: '1px 4px', color: 'var(--danger)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                          ×
                        </button>
                      </div>
                    ))}
                    <button onClick={() => addChapter(p.id)}
                      style={{ fontSize: 10, padding: '2px 6px', alignSelf: 'flex-start', marginTop: 2 }}>
                      + 添加章节
                    </button>
                  </div>
                )}

                {/* closing / copyright: description */}
                {(p.type === 'closing' || p.type === 'copyright') && (
                  <div>
                    <div className="form-hint" style={{ marginBottom: 2 }}>说明</div>
                    <textarea value={p.description || ''}
                      onChange={e => setPages(prev => prev.map(pp => pp.id === p.id ? { ...pp, description: e.target.value } : pp))}
                      placeholder="结尾页说明（给大模型看的背景信息）"
                      rows={2}
                      style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
                  </div>
                )}

                {/* all other types: dimensions (key_points + examples) */}
                {p.type !== 'cover' && p.type !== 'toc' && p.type !== 'closing' && p.type !== 'copyright' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {(p.dimensions || []).map((d, di) => (
                      <div key={di} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={dimLabelStyle}>要点{di + 1}</span>
                        <input value={d.label} onChange={e => setDim(p.id, di, 'label', e.target.value)}
                          placeholder="关键点标签（如：主味型、调味比例）" style={{ ...inputStyle, flex: 1 }} />
                        <input value={d.desc} onChange={e => setDim(p.id, di, 'desc', e.target.value)}
                          placeholder="说明/举例（给大模型看）" style={{ ...inputStyle, flex: 2 }} />
                        <button onClick={() => removeDim(p.id, di)}
                          style={{ fontSize: 11, padding: '1px 4px', color: 'var(--danger)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                          ×
                        </button>
                      </div>
                    ))}
                    <button onClick={() => addDim(p.id)}
                      style={{ fontSize: 10, padding: '2px 6px', alignSelf: 'flex-start', marginTop: 2 }}>
                      + 添加要点
                    </button>
                  </div>
                )}

                {/* ── Images section ── */}
                {showImagesFor(p.type) && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                    <div style={sectionLabelStyle}>图片配置</div>
                    {(p.images || []).map((img, ii) => (
                      <div key={ii} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
                        <span style={dimLabelStyle}>图片{ii + 1}</span>
                        <select value={img.role}
                          onChange={e => setImage(p.id, ii, 'role', e.target.value)}
                          style={{ ...selectStyle, width: 70 }}>
                          {roles.map(r => <option key={r} value={r}>{IMAGE_ROLE_LABEL[r]}</option>)}
                        </select>
                        <input value={img.hint}
                          onChange={e => setImage(p.id, ii, 'hint', e.target.value)}
                          placeholder={
                            img.role === 'background' ? '背景图描述（如：深色木质纹理，柔光）' :
                            img.role === 'hero' ? '主图描述（如：成品菜肴特写，暖光俯拍）' :
                            img.role === 'content' ? '插图描述（如：食材处理步骤示意）' :
                            '网格图描述（如：多角度成品展示）'
                          }
                          style={{ ...inputStyle, flex: 1 }} />
                        <span style={{ fontSize: 9, color: 'var(--text-secondary)', minWidth: 16, textAlign: 'right' }}>{img.opacity}%</span>
                        <input type="range" min="0" max="100" value={img.opacity}
                          onChange={e => setImage(p.id, ii, 'opacity', e.target.value)}
                          style={{ width: 60, height: 14, margin: 0 }} title="透明度" />
                        <button onClick={() => removeImage(p.id, ii)}
                          style={{ fontSize: 11, padding: '1px 4px', color: 'var(--danger)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                          ×
                        </button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                      {roles.filter(r => !(p.images || []).some(img => img.role === r)).length > 0 && (
                        roles.filter(r => !(p.images || []).some(img => img.role === r)).map(r => (
                          <button key={r} onClick={() => addImage(p.id, r)}
                            style={{ fontSize: 9, padding: '2px 6px' }}>
                            + {IMAGE_ROLE_LABEL[r]}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* ── Charts section ── */}
                {CHART_PAGE_TYPES.includes(p.type) && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                    <div style={sectionLabelStyle}>图表配置</div>
                    {(p.charts || []).map((ch, ci) => (
                      <div key={ci} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={dimLabelStyle}>图表{ci + 1}</span>
                        <select value={ch.type}
                          onChange={e => setChart(p.id, ci, 'type', e.target.value)}
                          style={{ ...selectStyle, width: 70 }}>
                          {CHART_TYPES.map(ct => <option key={ct.type} value={ct.type}>{ct.label}</option>)}
                        </select>
                        <input value={ch.title}
                          onChange={e => setChart(p.id, ci, 'title', e.target.value)}
                          placeholder="图表标题（如：季度营收对比）"
                          style={{ ...inputStyle, width: 140 }} />
                        <input value={ch.hint}
                          onChange={e => setChart(p.id, ci, 'hint', e.target.value)}
                          placeholder="图表说明（如：按季度分组的销售额与利润率）"
                          style={{ ...inputStyle, flex: 1 }} />
                        <button onClick={() => removeChart(p.id, ci)}
                          style={{ fontSize: 11, padding: '1px 4px', color: 'var(--danger)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                          ×
                        </button>
                      </div>
                    ))}
                    <button onClick={() => addChart(p.id)}
                      style={{ fontSize: 9, padding: '2px 6px', marginTop: 2 }}>
                      + 添加图表
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}

      {/* Add page buttons grouped */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {PT_GROUPS.map(g => (
          <div key={g.label}>
            <div style={groupLabelStyle}>{g.label}</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
              {g.types.map(t => (
                <button key={t.type} onClick={() => addPage(t.type)}
                  style={{ fontSize: 10, padding: '3px 8px' }} title={t.hint}>
                  + {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
