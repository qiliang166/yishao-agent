import { useState, useRef } from 'react'

export interface StageTemps {
  sop: number           // Tab 1: SOP 生成+导出
  keyword: number       // Tab 2: 提取关键词搜资料
  research: number      // Tab 2: 深度理解内容主题
  outline: number       // Tab 2: 规划类型标题要点
  fill: number          // Tab 2: 给每页写正文
  cards: number         // Tab 3: 布局卡片数量
  html: number          // Tab 3: 逐页写HTML
  svg_batch: number     // Tab 4: 批量画SVG矢量图
  svg_single: number    // Tab 4: 单页失败单独补画
  review: number        // Tab 4: 逐页打分检查质量
  fix: number           // Tab 4: 低于7分的重新画
  holistic: number      // Tab 4: 跨页检查统一性
  holistic_fix: number  // Tab 4: 不一致的重新修
  // Stage-level group overrides (send these to backend as temp_stage_*)
  stageOutline: number    // 大纲阶段 → keyword, research, outline, fill
  stageGeneration: number  // 生成阶段 → cards, html, svg_batch, svg_single
  stageReview: number     // 审核阶段 → review, fix, holistic, holistic_fix
}

export const DEFAULT_STAGE_TEMPS: StageTemps = {
  sop: 0.3,
  keyword: 0.3,
  research: 0.7,
  outline: 1.0,
  fill: 1.0,
  cards: 0.7,
  html: 0.8,
  svg_batch: 0.7,
  svg_single: 0.7,
  review: 0.3,
  fix: 0.7,
  holistic: 0.3,
  holistic_fix: 0.7,
  stageOutline: 0,
  stageGeneration: 0,
  stageReview: 0,
}

// Maps: stage-level field → per-step fields it overrides
export const STAGE_TO_STEPS: Record<string, (keyof StageTemps)[]> = {
  stageOutline: ['keyword', 'research', 'outline', 'fill'],
  stageGeneration: ['cards', 'html', 'svg_batch', 'svg_single'],
  stageReview: ['review', 'fix', 'holistic', 'holistic_fix'],
}

interface Props {
  open: boolean
  initialTemps: StageTemps
  onApply: (temps: StageTemps) => void
  onClose: () => void
}

type TabKey = 'stages' | 'sop' | 'outline' | 'generation' | 'review'

interface SliderDef {
  key: keyof StageTemps
  label: string
  defaultVal: number
}

const TAB_DEFS: { key: TabKey; label: string; desc: string; sliders: SliderDef[] }[] = [
  {
    key: 'stages',
    label: '阶段速设',
    desc: '一键设置每个阶段的温度。0 表示使用分步温度（见右侧标签页）。建议：大纲 0.3 / 生成 0.7 / 审核 0.3',
    sliders: [
      { key: 'stageOutline', label: '大纲阶段（关键词→分析→规划→填充）', defaultVal: 0.3 },
      { key: 'stageGeneration', label: '生成阶段（结构→HTML→SVG渲染）', defaultVal: 0.7 },
      { key: 'stageReview', label: '审核阶段（检查→修复→跨页统一）', defaultVal: 0.3 },
    ],
  },
  {
    key: 'sop',
    label: '内容生成',
    desc: '从原始内容生成标准化文档',
    sliders: [
      { key: 'sop', label: '内容生成', defaultVal: 0.3 },
    ],
  },
  {
    key: 'outline',
    label: '生成大纲',
    desc: '关键词提取 → 深度分析 → 大纲规划 → 内容填充',
    sliders: [
      { key: 'keyword', label: '提取关键词搜资料', defaultVal: 0.3 },
      { key: 'research', label: '深度理解内容主题', defaultVal: 0.7 },
      { key: 'outline', label: '规划类型标题要点', defaultVal: 1.0 },
      { key: 'fill', label: '给每页写正文', defaultVal: 1.0 },
    ],
  },
  {
    key: 'generation',
    label: '合成PPT',
    desc: '结构规划 → HTML生成',
    sliders: [
      { key: 'cards', label: '布局卡片数量', defaultVal: 0.7 },
      { key: 'html', label: '逐页写 HTML', defaultVal: 0.8 },
    ],
  },
  {
    key: 'review',
    label: '后台自动',
    desc: 'SVG 批量渲染 + 逐页审核修复 + 跨页一致性检查',
    sliders: [
      { key: 'svg_batch', label: '批量画 SVG 矢量图', defaultVal: 0.7 },
      { key: 'svg_single', label: '单页失败单独补画', defaultVal: 0.7 },
      { key: 'review', label: '逐页打分检查质量', defaultVal: 0.3 },
      { key: 'fix', label: '低于7分的重新画', defaultVal: 0.7 },
      { key: 'holistic', label: '跨页检查统一性', defaultVal: 0.3 },
      { key: 'holistic_fix', label: '不一致的重新修', defaultVal: 0.7 },
    ],
  },
]

function TempSlider({ label, value, defaultVal, onChange }: {
  label: string
  value: number
  defaultVal: number
  onChange: (v: number) => void
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ fontSize: 12 }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>默认 {defaultVal.toFixed(1)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ flex: 1 }}
        />
        <input
          type="number"
          min={0}
          max={2}
          step={0.1}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          style={{ width: 48, fontSize: 12, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-secondary)', color: 'var(--text-primary)', textAlign: 'center' }}
        />
      </div>
    </div>
  )
}

export default function Stage3TempSettings({ open, initialTemps, onApply, onClose }: Props) {
  const [temps, setTemps] = useState<StageTemps>({ ...initialTemps })
  const [tab, setTab] = useState<TabKey>('stages')
  const overlayMouseDownRef = useRef(false)

  if (!open) return null

  const current = TAB_DEFS.find(t => t.key === tab)!

  const setTemp = (key: keyof StageTemps, val: number) => {
    setTemps(prev => {
      const next = { ...prev, [key]: val }
      // Cascade stage-level slider to all per-step values in that stage
      if (key in STAGE_TO_STEPS) {
        for (const stepKey of STAGE_TO_STEPS[key]) {
          ;(next as any)[stepKey] = val
        }
      }
      return next
    })
  }

  return (
    <div className="dialog-overlay"
        onMouseDown={(e: any) => { overlayMouseDownRef.current = e.target === e.currentTarget }}
        onClick={() => { if (overlayMouseDownRef.current) onClose() }}>
      <div className="dialog-box" style={{ width: 440, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="dialog-title">温度设置</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
          分别控制每个 AI 步骤的温度。0=保守严谨，1=标准，2=最大创意
        </div>

        {/* Tab buttons */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8, flexWrap: 'wrap' }}>
          {TAB_DEFS.map(t => (
            <button
              key={t.key}
              className={`btn btn-${tab === t.key ? 'primary' : 'ghost'} btn-sm`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content - scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12, minHeight: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>{current.desc}</div>
          {current.sliders.map(s => (
            <TempSlider
              key={s.key}
              label={s.label}
              value={temps[s.key]}
              defaultVal={s.defaultVal}
              onChange={v => setTemp(s.key, v)}
            />
          ))}
        </div>

        {/* Quick presets */}
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>快速预设:</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setTemps({ ...DEFAULT_STAGE_TEMPS })}>
            推荐默认
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            const all = { ...temps }
            Object.keys(all).forEach(k => { (all as any)[k] = 0.3 })
            setTemps(all as StageTemps)
          }}>全部 0.3</button>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            const all = { ...temps }
            Object.keys(all).forEach(k => { (all as any)[k] = 0.7 })
            setTemps(all as StageTemps)
          }}>全部 0.7</button>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            const all = { ...temps }
            Object.keys(all).forEach(k => { (all as any)[k] = 1.0 })
            setTemps(all as StageTemps)
          }}>全部 1.0</button>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={() => onApply(temps)}>应用</button>
        </div>
      </div>
    </div>
  )
}
