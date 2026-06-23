# TeachingDocPanel 自治组件 — 设计文档

**日期**: 2026-06-24 | **状态**: 待审核

---

## 目标

从 ProjectPage.tsx（1517行）中抽出 Stage 2 的三个重复子栏目，变成自治的 `TeachingDocPanel` 组件。每个 Panel 管理自己的全部操作状态，父组件不再参与生成/保存/模型选择过程。

## 核心设计决策：自治而非受控

Panel 不是父组件的"木偶"，而是一个完整的独立单元：

- ✅ Panel 自己管理：模型选择、数据源选择、生成状态、保存按钮状态
- ✅ Panel 自己调用：`api.llmGenerate`、`api.saveStep`
- ❌ 父组件不再：持有每个子栏目的模型 state、管理生成流程、参与保存逻辑

## 组件接口

```typescript
interface TeachingDocPanelProps {
  docType: 'sop' | 'dao' | 'yanxi'      // 哪种文档
  projectId: string                       // 项目 ID
  steps: Record<string, string>           // 全步骤数据（Panel 按需读取）
  savedSteps: Record<string, string>      // 已保存版本快照
  prompt: string                          // 从 column config 取
  skill: string                           // 从 column config 取
  llmProviders: LLMProvider[]             // 可选模型列表
  onSave: () => void                      // 保存后通知父组件刷新 savedSteps
}
```

## 内部状态（父组件不可见）

```typescript
const [model, setModel] = useState('')            // 当前模型
const [dataSource, setDataSource] = useState('')  // 数据源选择
const [content, setContent] = useState('')        // 生成的文本内容
const [generating, setGenerating] = useState(false)
```

## 内部操作（父组件不参与）

```
handleGenerate():
  取 prompt + skill + model + 数据源内容
  → setGenerating(true)
  → try { result = await api.llmGenerate(...) }
     → if (result != null) setContent(result)
  → catch { toast 错误 }
  → finally { setGenerating(false) }

handleSave():
  setGenerating(false)  // 先确保生成状态清除
  → api.saveStep(projectId, key, content)
  → onSave()  // 通知父组件
```

## 父组件瘦身

从 ProjectPage.tsx 删除：

| 删除内容 | 行数 |
|------|------|
| `doGenerate` 函数 | ~68 行 |
| 7 个模型 state（`s2SopModel`/`s2DaoModel`/`s2YanxiModel`/...） | ~7 行 |
| 3 个数据源 state（`s2SopDataSource`/`s2DaoDataSource`/`s2YanxiDataSource`）| ~3 行 |
| `step2Generating` state | ~1 行 |
| Stage 2 的三段重复 JSX | ~200 行 |
| **合计** | **~280 行减少** |

Stage 2 的 JSX 变为：

```tsx
{stage === 2 && (
  <div className="stage-content">
    <TeachingDocPanel docType="sop" ... />
    <TeachingDocPanel docType="dao" ... />
    <TeachingDocPanel docType="yanxi" ... />
  </div>
)}
```

## 批量生成处理

自治 Panel 后，父组件无法直接调 `doGenerate`（不再持有模型和数据源）。方案：

```tsx
// Panel 暴露 triggerGenerate ref
const sopRef = useRef<{ triggerGenerate: () => void }>(null)
const daoRef = useRef<{ triggerGenerate: () => void }>(null)
const yanxiRef = useRef<{ triggerGenerate: () => void }>(null)

// 批量生成：依次触发三个 Panel
const handleBatchGenerate = () => {
  sopRef.current?.triggerGenerate()
  daoRef.current?.triggerGenerate()
  yanxiRef.current?.triggerGenerate()
}
```

Panel 通过 `useImperativeHandle` 暴露 `triggerGenerate`。

## 文件变更

| 文件 | 操作 |
|------|------|
| `frontend/src/components/TeachingDocPanel.tsx` | 新建 |
| `frontend/src/components/__tests__/TeachingDocPanel.test.tsx` | 新建 |
| `frontend/src/pages/ProjectPage.tsx` | 修改（删 ~280 行，加 ~30 行） |

## 验收标准

1. TypeScript 编译通过
2. 三个 Panel 的生成按钮互不干扰
3. 三个 Panel 的保存按钮互不干扰
4. 三个 Panel 的模型选择器互不干扰
5. 已有功能回归：Stage 1 生成 → Stage 2 用的数据源内容正确
6. 前端 build 通过
