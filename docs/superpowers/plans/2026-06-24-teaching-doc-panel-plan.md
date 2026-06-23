# TeachingDocPanel 自治组件 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 ProjectPage.tsx 抽出 Stage 2 的三个重复子栏目为自治的 TeachingDocPanel 组件，消灭共享状态导致的联动 bug

**Architecture:** 三步 TDD — 先搭测试基础设施 + 写失败测试 → 实现 TeachingDocPanel 使测试通过 → 修改 ProjectPage.tsx 接入新组件并保留批量生成

**Tech Stack:** React 18 + TypeScript + Vitest + @testing-library/react + jsdom

## Global Constraints

- docType 为 'sop' | 'dao' | 'yanxi'，对应 step key: step2_sop / step2_daoshuyi / step2_yanxi
- 模型持久化 key: `_model_s2_{sop|dao|yanxi}`
- 模型默认值必须使用函数式 setState: `(prev) => prev || defVal`
- 异步生成必须使用 try/catch/finally 模板
- onRefresh 回调在生成/保存成功后调用，父组件重新 api.getSteps()
- 保留 Stage 2 sub tabs，一次只渲染一个 Panel
- 批量生成通过 forwardRef + useImperativeHandle 暴露 triggerGenerate

## 每步自检三问

每个关键步骤完成后，必须回答三问：

1. **我改了什么？** — 列出本步骤修改的具体文件、函数、state
2. **会影响什么？** — grep 所有引用，列出消费者清单，确认影响范围
3. **怎么验证没坏？** — 具体的验证命令和预期结果

---

### Task 1: 测试基础设施 + 3 个失败测试

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/components/__tests__/TeachingDocPanel.test.tsx`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `TeachingDocPanel` 组件存根（空的 props 接口）供测试引用

#### Step 1.1: 安装测试依赖

```bash
cd frontend && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

#### Step 1.2: 创建 vitest.config.ts

```typescript
// frontend/vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
```

#### Step 1.3: 创建全局 test setup

```typescript
// frontend/src/test/setup.ts
import '@testing-library/jest-dom'
```

#### Step 1.4: 添加 test 脚本

在 `frontend/package.json` 的 `"scripts"` 中添加：

```json
"test": "vitest run",
"test:watch": "vitest"
```

#### Step 1.5: 创建 TeachingDocPanel 存根

```typescript
// frontend/src/components/TeachingDocPanel.tsx （最小存根）
import { forwardRef, useImperativeHandle } from 'react'

export interface TeachingDocPanelProps {
  docType: 'sop' | 'dao' | 'yanxi'
  projectId: string
  steps: Record<string, string>
  savedSteps: Record<string, string>
  prompt: string
  skill: string
  llmProviders: { id: string; name: string; is_enabled: boolean; models: string[] }[]
  onRefresh: () => void
}

const TeachingDocPanel = forwardRef<any, TeachingDocPanelProps>((_props, _ref) => {
  return <div>TeachingDocPanel stub</div>
})

export default TeachingDocPanel
```

#### Step 1.6: 写 3 个失败测试

```typescript
// frontend/src/components/__tests__/TeachingDocPanel.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import TeachingDocPanel from '../TeachingDocPanel'

// Mock api module
vi.mock('../../services/api', () => ({
  api: {
    llmGenerate: vi.fn(),
    saveStep: vi.fn(),
    saveFileToProject: vi.fn(),
  },
}))

// Mock useModal
vi.mock('../ModalProvider', () => ({
  useModal: () => ({ toast: vi.fn(), confirm: vi.fn(), prompt: vi.fn() }),
}))

const defaultProps = {
  docType: 'sop' as const,
  projectId: 'test-1',
  steps: {
    raw_video: 'test video content',
    raw_text: 'test text content',
    raw_file: 'test file content',
    step2_sop: 'existing sop content',
    _model_s2_sop: 'provider1:model-a',
  },
  savedSteps: {
    step2_sop: 'existing sop content',
  },
  prompt: 'test system prompt',
  skill: 'test skill template',
  llmProviders: [
    { id: 'provider1', name: 'Provider 1', is_enabled: true, models: ['model-a', 'model-b'] },
    { id: 'provider2', name: 'Provider 2', is_enabled: true, models: ['model-c'] },
  ],
  onRefresh: vi.fn(),
}

describe('TeachingDocPanel', () => {
  it('生成按钮独立 — 点击生成不影饷其他按钮状态', async () => {
    render(<TeachingDocPanel {...defaultProps} />)
    const genBtn = screen.getByText(/AI 生成/)
    fireEvent.click(genBtn)
    // 生成中按钮文字变化
    expect(screen.getByText(/生成中/)).toBeDefined()
    // 数据源选择器仍可用（未被生成影响）
    const sourceSelect = screen.getByRole('combobox', { name: /数据来源/ })
    expect(sourceSelect).not.toBeDisabled()
  })

  it('空内容时保存按钮不显示"已保存"', () => {
    render(<TeachingDocPanel {...defaultProps} docType="dao" steps={{}} savedSteps={{}} />)
    // 保存按钮存在
    const saveBtn = screen.getByText(/保存/)
    expect(saveBtn).toBeDefined()
    // 保存按钮不显示"已保存"
    expect(screen.queryByText('✓ 已保存')).toBeNull()
  })

  it('修改模型选择器不影饷其他 Panel 的模型值', async () => {
    const { rerender } = render(<TeachingDocPanel {...defaultProps} />)
    const modelSelect = screen.getByRole('combobox', { name: /大模型/ })
    // 初始值来自 steps 中的持久化值
    expect((modelSelect as HTMLSelectElement).value).toBe('provider1:model-a')
    // 切换模型
    fireEvent.change(modelSelect, { target: { value: 'provider2:model-c' } })
    expect((modelSelect as HTMLSelectElement).value).toBe('provider2:model-c')
    // 用不同的 docType 重新渲染，模型值独立
    rerender(<TeachingDocPanel {...defaultProps} docType="dao" steps={{
      ...defaultProps.steps,
      _model_s2_dao: 'provider1:model-b',
    }} />)
    const daoModelSelect = screen.getByRole('combobox', { name: /大模型/ })
    expect((daoModelSelect as HTMLSelectElement).value).toBe('provider1:model-b')
  })
})
```

#### Step 1.7: 运行测试 — 预期 FAIL

```bash
cd frontend && npx vitest run
```

预期 3 个测试全部失败（存根组件无法通过测试）。

#### 三问自检

1. **我改了什么？** — 新建 4 个文件（vitest.config.ts / setup.ts / TeachingDocPanel存根 / 测试文件），修改 package.json 添加 test 脚本。**没有修改任何已有业务代码。**
2. **会影响什么？** — 新增依赖包，不影响已有功能。TeachingDocPanel 存根不会被任何现有代码引用。
3. **怎么验证没坏？** — `npm run build` 仍通过；`npx vitest run` 显示 3 fail（证明测试有效）

#### Step 1.8: 提交

```bash
git add frontend/vitest.config.ts frontend/src/test/ frontend/src/components/TeachingDocPanel.tsx frontend/src/components/__tests__/TeachingDocPanel.test.tsx frontend/package.json frontend/package-lock.json
git commit -m "test: add Vitest setup + 3 failing tests for TeachingDocPanel"
```

---

### Task 2: 实现 TeachingDocPanel

**Files:**
- Modify: `frontend/src/components/TeachingDocPanel.tsx` （完整实现替换存根）

**Interfaces:**
- Consumes: `TeachingDocPanelProps`（Task 1 定义）
- Consumes: `api.llmGenerate`, `api.saveStep`, `api.saveFileToProject`（from services/api）
- Consumes: `useModal`（from components/ModalProvider）
- Produces: `triggerGenerate()` via `useImperativeHandle`

#### Step 2.1: 实现组件

完整代码（替换存根内容）：

```typescript
// frontend/src/components/TeachingDocPanel.tsx
import { useState, forwardRef, useImperativeHandle, useCallback } from 'react'
import { api } from '../services/api'
import { useModal } from './ModalProvider'

export interface TeachingDocPanelProps {
  docType: 'sop' | 'dao' | 'yanxi'
  projectId: string
  steps: Record<string, string>
  savedSteps: Record<string, string>
  prompt: string
  skill: string
  llmProviders: { id: string; name: string; is_enabled: boolean; models: string[] }[]
  onRefresh: () => void
}

const DOC_LABELS: Record<string, string> = {
  sop: 'SOP文案', dao: '道与术文案', yanxi: '研学手册文案',
}
const DOC_COLORS: Record<string, string> = {
  sop: 'var(--success)', dao: 'var(--purple)', yanxi: 'var(--warning)',
}
const DOC_ICONS: Record<string, string> = {
  sop: '📃', dao: '💡', yanxi: '📖',
}
const STEP_KEYS: Record<string, string> = {
  sop: 'step2_sop', dao: 'step2_daoshuyi', yanxi: 'step2_yanxi',
}
const MODEL_KEYS: Record<string, string> = {
  sop: '_model_s2_sop', dao: '_model_s2_dao', yanxi: '_model_s2_yanxi',
}
const DEFAULT_PROMPTS: Record<string, string> = {
  sop: '请将以下食谱内容整理为标准操作流程(SOP)文案。按步骤、操作、标准、备注四列整理。',
  dao: '请分析以下食谱内容的道（原理、烹饪哲学）与术（具体技巧、手法）。',
  yanxi: '请将以下食谱内容整理为研学手册文案，包含背景知识、动手步骤、观察要点。',
}

const TeachingDocPanel = forwardRef<{ triggerGenerate: () => void }, TeachingDocPanelProps>(({
  docType, projectId, steps, savedSteps, prompt, skill, llmProviders, onRefresh,
}, ref) => {
  const modal = useModal()

  // ── Internal state ──
  const persistedModel = steps[MODEL_KEYS[docType]] || ''
  const [model, setModel] = useState(persistedModel)
  const [dataSource, setDataSource] = useState('video')
  const [generating, setGenerating] = useState(false)
  const [savedFlash, setSavedFlash] = useState(0)

  const stepKey = STEP_KEYS[docType]
  const content = steps[stepKey] || ''
  const savedContent = savedSteps[stepKey] || ''

  // ── Initialize model default on first mount ──
  if (!model) {
    const defProvider = llmProviders.find(p => p.is_enabled)
    const defModels = Array.isArray(defProvider?.models) ? defProvider.models : []
    const defVal = defProvider && defModels.length > 0 ? `${defProvider.id}:${defModels[0]}` : ''
    if (defVal) setModel(defVal)
  }

  // ── Data source text ──
  const getSourceText = (src: string) => {
    switch (src) {
      case 'video': return steps.raw_video || ''
      case 'text': return steps.raw_text || ''
      case 'file': return steps.raw_file || ''
      default: return ''
    }
  }

  // ── Generate ──
  const handleGenerate = useCallback(async () => {
    const sourceText = getSourceText(dataSource)
    if (!sourceText || !model) return
    setGenerating(true)
    try {
      const [pid, mdl] = model.split(':')
      const systemPrompt = prompt || DEFAULT_PROMPTS[docType]
      const userMessage = skill
        ? `请将以下内容按指定格式整理：\n\n${sourceText}\n\n输出格式要求：\n${skill}`
        : sourceText
      const result: any = await api.llmGenerate({
        provider_id: pid, model: mdl,
        system_prompt: systemPrompt, user_message: userMessage,
      })
      if (result?.content) {
        await api.saveStep(projectId, stepKey, result.content)
        onRefresh()
      }
    } catch (e: any) {
      modal.toast(`生成失败: ${e.message}`, 'error')
    } finally {
      setGenerating(false)
    }
  }, [dataSource, model, prompt, skill, docType, projectId, stepKey, onRefresh])

  // ── Save ──
  const handleSave = useCallback(async () => {
    await api.saveStep(projectId, stepKey, content)
    setSavedFlash(Date.now())
    setTimeout(() => setSavedFlash(0), 1500)
    onRefresh()
  }, [projectId, stepKey, content, onRefresh])

  // ── Clear ──
  const handleClear = useCallback(async () => {
    await api.saveStep(projectId, stepKey, '')
    onRefresh()
  }, [projectId, stepKey, onRefresh])

  // ── Save to project file ──
  const handleSaveToProject = useCallback(async () => {
    if (!content) return
    try {
      const label = DOC_LABELS[docType]
      const resp = await api.saveFileToProject(projectId, `${label}.txt`, content)
      modal.toast(`已保存到 ${resp.path}`, 'success')
    } catch (e: any) {
      modal.toast('保存失败: ' + e.message, 'error')
    }
  }, [projectId, content, docType])

  // ── Model change ──
  const handleModelChange = useCallback((val: string) => {
    setModel(val)
    api.saveStep(projectId, MODEL_KEYS[docType], val)
  }, [projectId, docType])

  // ── Expose triggerGenerate for batch ──
  useImperativeHandle(ref, () => ({ triggerGenerate: handleGenerate }), [handleGenerate])

  // ── Button helpers ──
  const getSaveLabel = () => {
    if (!content.trim()) return '💾 保存'
    if (content !== savedContent) return '💾 保存'
    return '✓ 已保存'
  }
  const getSaveClass = () => {
    if (savedFlash) return 'btn-saved-flash'
    if (!content.trim() || content !== savedContent) return 'btn-dirty'
    return ''
  }

  const label = DOC_LABELS[docType]
  const color = DOC_COLORS[docType]
  const icon = DOC_ICONS[docType]
  const sourceText = {
    video: steps.raw_video ? '已有内容' : '暂无内容',
    text: steps.raw_text ? '已有内容' : '暂无内容',
    file: steps.raw_file ? '已有内容' : '暂无内容',
  }

  return (
    <>
      <div className="card-title" style={{ color }}>{icon} {label}生成</div>
      <div className="card-hint">基于文案提取结果，使用栏目配置中设定的提示词和SKILL生成{label}</div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
        <label className="form-label" htmlFor={`ds-${docType}`}>数据来源</label>
        <select id={`ds-${docType}`} className="form-select" style={{ marginBottom: 6 }}
          value={dataSource} onChange={e => setDataSource(e.target.value)}
          aria-label="数据来源">
          <option value="video">视频提取 — {sourceText.video}</option>
          <option value="text">文字输入 — {sourceText.text}</option>
          <option value="file">文件上传 — {sourceText.file}</option>
        </select>
      </div>
      <label className="form-label" htmlFor={`model-${docType}`}>大模型</label>
      <select id={`model-${docType}`} className="form-select" style={{ marginBottom: 8 }}
        value={model} onChange={e => handleModelChange(e.target.value)}
        aria-label="大模型">
        <option value="">选择模型...</option>
        {llmProviders.filter(p => p.is_enabled).map(p =>
          (Array.isArray(p.models) ? p.models : []).map((m: string) => (
            <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
          ))
        )}
      </select>
      <button className="btn btn-primary btn-sm w-full"
        disabled={!getSourceText(dataSource) || !model || generating}
        onClick={handleGenerate}>
        {generating ? '⏳ 生成中...' : `⚙ AI 生成 ${label}`}
      </button>

      {/* Content textarea */}
      <textarea className="form-textarea" style={{ flex: 1, minHeight: 120, marginTop: 12 }}
        value={content}
        onChange={e => {
          // Write to steps via parent re-fetch pattern — use api.saveStep then refresh
        }}
        placeholder={`点击生成按钮，AI生成后在此编辑...`}
        readOnly
      />

      {/* Action buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
          {docType === 'sop' ? '编辑完成后保存，即可供「标准SOP」栏目引用'
            : docType === 'dao' ? '编辑完成后保存，即可供「合成PPT」栏目引用'
              : '编辑完成后保存，即可供「合成PPT」「口播文案」栏目引用'}
        </span>
        <span style={{ display: 'flex', gap: 5 }}>
          <button className="btn btn-ghost btn-sm" onClick={handleClear}
            disabled={!content}>✕ 清空</button>
          <button className="btn btn-ghost btn-sm" onClick={handleSaveToProject}
            disabled={!content}>📥 保存到项目</button>
          <button className={`btn btn-primary btn-sm ${getSaveClass()}`}
            onClick={handleSave}>{getSaveLabel()}</button>
        </span>
      </div>
    </>
  )
})

export default TeachingDocPanel
```

#### Step 2.2: 运行测试

```bash
cd frontend && npx vitest run
```

预期部分通过（存根被替换但 textarea 是 readOnly，数据源 select 需 aria-label 匹配）。

#### Step 2.3: 修复 textarea 使其可编辑

将 textarea 的 `readOnly` 去掉，改为受控组件，在 onChange 中直接调用 api.saveStep：

```typescript
// 替换 textarea 为：
<textarea className="form-textarea" style={{ flex: 1, minHeight: 120, marginTop: 12 }}
  value={content}
  onChange={async e => {
    await api.saveStep(projectId, stepKey, e.target.value)
    onRefresh()
  }}
  placeholder="点击生成按钮，AI生成后在此编辑..."
/>
```

#### Step 2.4: 再次运行测试 — 预期 PASS

```bash
cd frontend && npx vitest run
```

预期全部通过。

#### 三问自检

1. **我改了什么？** — 替换 TeachingDocPanel.tsx 存根为完整实现（~230行）。自管理 state：model/dataSource/generating/savedFlash。自调 API：llmGenerate/saveStep/saveFileToProject。暴露 triggerGenerate 给批量生成。
2. **会影响什么？** — grep 确认：TeachingDocPanel 尚未被任何其他文件 import（仍只有测试文件引用）。api 调用签名与旧 `doGenerate` 一致。model 持久化 key 与旧代码一致（`_model_s2_{docType}`）。
3. **怎么验证没坏？** — `npx vitest run` 3/3 通过；`npx tsc --noEmit` 无错误

#### Step 2.5: 提交

```bash
git add frontend/src/components/TeachingDocPanel.tsx
git commit -m "feat: implement autonomous TeachingDocPanel component"
```

---

### Task 3: 修改 ProjectPage.tsx 接入组件

**Files:**
- Modify: `frontend/src/pages/ProjectPage.tsx` (~220 lines deleted, ~50 lines added)

**Interfaces:**
- Consumes: `TeachingDocPanel` 组件 + `TeachingDocPanelProps` 类型
- Produces: 三个 ref（`sopRef`, `daoRef`, `yanxiRef`）给 `doBatchGenerate` 使用

#### Step 3.1: 添加 import

在 ProjectPage.tsx 顶部添加：

```typescript
import TeachingDocPanel from '../components/TeachingDocPanel'
import type { TeachingDocPanelProps } from '../components/TeachingDocPanel'
```

#### Step 3.2: 删除 Stage 2 的 state

删除以下 state 声明：
- `s2SopModel` / `s2DaoModel` / `s2YanxiModel` (line 143-145)
- `s2SopDataSource` / `s2DaoDataSource` / `s2YanxiDataSource` (line 146-148)
- `step2Generating` (line 136)

#### Step 3.3: 删除 `doGenerate` 函数（约 line 390-402）

#### Step 3.4: 删除 `getStage2Source` 函数（约 line 333-340）

#### Step 3.5: 添加三个 ref

在 ProjectPage 函数体内，其他 state 附近添加：

```typescript
const sopRef = useRef<{ triggerGenerate: () => void }>(null)
const daoRef = useRef<{ triggerGenerate: () => void }>(null)
const yanxiRef = useRef<{ triggerGenerate: () => void }>(null)
```

#### Step 3.6: 重写 `doBatchGenerate`

```typescript
const doBatchGenerate = async () => {
  setBatchGenerating(true)
  try {
    sopRef.current?.triggerGenerate()
    daoRef.current?.triggerGenerate()
    yanxiRef.current?.triggerGenerate()
  } finally {
    setBatchGenerating(false)
  }
}
```

#### Step 3.7: 替换 Stage 2 JSX

替换 Stage 2 的全部 JSX（约 line 928-1078）：

```tsx
{/* ====== STAGE 2: 教学文档 ====== */}
{stage === 2 && (
  <div className="panel-grid">
    <div className="panel-left">
      <div className="card">
        {sub === '2a' && (
          <TeachingDocPanel ref={sopRef} docType="sop" projectId={id!}
            steps={steps} savedSteps={savedSteps}
            prompt={stage2Prompts.sop?.prompt || ''}
            skill={stage2Prompts.sop?.skill || ''}
            llmProviders={llmProviders}
            onRefresh={() => api.getSteps(id!).then((s: any[]) => {
              const map: Record<string, string> = {}
              s.forEach((x: any) => { map[x.step_name] = x.content })
              setSteps(map)
              setSavedSteps({...map})
            })} />
        )}
        {sub === '2b' && (
          <TeachingDocPanel ref={daoRef} docType="dao" projectId={id!}
            steps={steps} savedSteps={savedSteps}
            prompt={stage2Prompts.dao?.prompt || ''}
            skill={stage2Prompts.dao?.skill || ''}
            llmProviders={llmProviders}
            onRefresh={() => api.getSteps(id!).then((s: any[]) => {
              const map: Record<string, string> = {}
              s.forEach((x: any) => { map[x.step_name] = x.content })
              setSteps(map)
              setSavedSteps({...map})
            })} />
        )}
        {sub === '2c' && (
          <TeachingDocPanel ref={yanxiRef} docType="yanxi" projectId={id!}
            steps={steps} savedSteps={savedSteps}
            prompt={stage2Prompts.yanxi?.prompt || ''}
            skill={stage2Prompts.yanxi?.skill || ''}
            llmProviders={llmProviders}
            onRefresh={() => api.getSteps(id!).then((s: any[]) => {
              const map: Record<string, string> = {}
              s.forEach((x: any) => { map[x.step_name] = x.content })
              setSteps(map)
              setSavedSteps({...map})
            })} />
        )}
      </div>
    </div>
  </div>
)}
```

#### Step 3.8: 修改批量生成按钮的 disabled 条件

将 Stage 1 批量生成按钮（约 line 910）的 disabled 改为：

```tsx
disabled={batchGenerating || (!steps.raw_video && !steps.raw_text && !steps.raw_file)}
```

#### Step 3.9: 删除 `hasModelOverride` 中对 Stage 2 模型的处理

在 `useEffect` 中（约 line 185-202），删除 `hasModelOverride` 变量以及所有 Stage 2 模型的恢复逻辑（`_model_s2_sop`/`_model_s2_dao`/`_model_s2_yanxi`），因为这些现在由 TeachingDocPanel 自己管理。同时删除 `listProviders` 回调中设置 Stage 2 模型默认值的代码（line 304-306）。

#### 三问自检（修改完成后、验证前执行）

1. **我改了什么？** — 删除：`doGenerate`(68行) / `getStage2Source`(8行) / 7个Stage2专用state / Stage2三段JSX(~200行) / 右侧编辑面板(~30行)。新增：3个ref / 简化版`doBatchGenerate` / TeachingDocPanel JSX(~60行)。修改：批量按钮disabled条件 / useEffect中删除Stage2模型恢复逻辑。
2. **会影响什么？** — grep 确认删除的函数/state已无引用。`doBatchGenerate` 仍被Stage 1批量按钮调用（签名不变）。`steps`/`savedSteps` 仍通过 `onRefresh` 同步，Stage 3 读取 `step2_*` 路径不变。`stage2Prompts` 保留并传给Panel。
3. **怎么验证没坏？** — 见下方 Step 3.10-3.12 三重验证

#### Step 3.10: 验证编译

```bash
cd frontend && npx tsc --noEmit
```

#### Step 3.11: 验证 build

```bash
cd frontend && npm run build
```

#### Step 3.12: 运行测试

```bash
cd frontend && npx vitest run
```

#### Step 3.13: 提交

```bash
git add frontend/src/pages/ProjectPage.tsx
git commit -m "refactor: replace Stage 2 inline code with autonomous TeachingDocPanel"
```

---

### Task 4: 全流程验证 + 最终提交

#### Step 4.1: 后端 API 回归验证

```bash
curl -s http://localhost:8765/api/health && echo "OK"
curl -s http://localhost:8765/api/projects | head -c 100
```

#### Step 4.2: 前端 build 确认

```bash
cd frontend && npm run build
```

#### Step 4.3: TypeScript 编译确认

```bash
cd frontend && npx tsc --noEmit
```

#### Step 4.4: 测试确认

```bash
cd frontend && npx vitest run
```

#### Step 4.5: 提交 + 推送

```bash
git add -A
git commit -m "chore: final verification — all tests pass, build ok"
git push
```
