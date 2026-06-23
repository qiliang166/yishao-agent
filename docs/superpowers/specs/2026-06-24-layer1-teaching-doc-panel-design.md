# TeachingDocPanel 自治组件 — 设计文档

**日期**: 2026-06-24 | **状态**: 待审核

---

## 目标

从 ProjectPage.tsx（1517行）中抽出 Stage 2 的三个重复子栏目，变成自治的 `TeachingDocPanel` 组件。每个 Panel 管理自己的全部操作状态（生成、保存、模型选择、数据源选择），父组件不再参与。

## 核心设计决策

- ✅ Panel 自己管理：模型选择、数据源选择、生成状态、保存按钮状态
- ✅ Panel 自己调用：`api.llmGenerate`、`api.saveStep`（含模型持久化 `_model_s2_*`）
- ✅ 保留 Stage 2 的 sub tabs（2a/2b/2c），一次只渲染一个 Panel
- ✅ 右侧文本编辑区移入 Panel 内部，不再被三个子栏目共享
- ❌ 父组件不再：持有各子栏目的模型 state、数据源 state、参与生成/保存逻辑

## UX 决策：保留标签切换

5 个 Stage 全部使用 sub tabs 切换子栏目（1a/1b/1c、2a/2b/2c、3a/3b/3c）。保持此一致性。

右侧编辑区原来被三个子栏目共享，改为移入每个 Panel 内部。切换标签时各 Panel 保持自己独立的状态。

## 组件接口

```typescript
interface TeachingDocPanelProps {
  docType: 'sop' | 'dao' | 'yanxi'      // 哪种文档
  projectId: string                       // 项目 ID
  steps: Record<string, string>           // 全步骤数据（Panel 按需读数据源内容 + 回显已生成文本）
  savedSteps: Record<string, string>      // 已保存版本快照（用于 dirty state 判断）
  prompt: string                          // 从 column config 取
  skill: string                           // 从 column config 取
  llmProviders: LLMProvider[]             // 可选模型列表
  onRefresh: () => void                   // 生成或保存后，通知父组件重新 api.getSteps()
}
```

## 内部状态（父组件不可见）

```typescript
const [model, setModel] = useState('')            // 当前模型（provider_id:model_name）
const [dataSource, setDataSource] = useState('video')  // 数据源选择（video / text / file）
const [content, setContent] = useState('')        // 生成的文本内容
const [generating, setGenerating] = useState(false)
const [savedFlash, setSavedFlash] = useState(0)   // 保存按钮闪烁（仅此 Panel 范围内）
```

## 内部操作（父组件不参与）

### 模型选择

```
用户选模型:
  → setModel(value)
  → api.saveStep(projectId, '_model_s2_{docType}', value)  // 持久化
  → 不需要通知父组件
```

### 初始化加载

```
Panel 挂载:
  → 从 steps 中读取已持久化的模型值（steps['_model_s2_sop'] 等）
  → 用函数式 setState：(prev) => prev || persistedValue || providerDefault
  → 数据源默认 'video'
```

### 生成操作

```
handleGenerate():
  取 prompt + skill + model + 数据源内容(steps['raw_video'/'raw_text'/'raw_file'])
  → setGenerating(true)
  → try { result = await api.llmGenerate(...) }
     → if (result != null) {
         setContent(result.content)
         await api.saveStep(projectId, 'step2_{docType}', result.content)
         onRefresh()  // 通知父组件
       }
  → catch { toast 错误 }
  → finally { setGenerating(false) }
```

### 保存操作

```
handleSave():
  → api.saveStep(projectId, 'step2_{docType}', content)
  → setSavedFlash(Date.now()) → 1.5s 后清除
  → onRefresh()  // 通知父组件更新 savedSteps
```

### 保存到项目文件

```
handleSaveToProject():
  → api.saveFileToProject(projectId, filename, content)
  → toast 结果
```

## 父组件瘦身

从 ProjectPage.tsx 删除：

| 删除内容 | 说明 |
|------|------|
| `doGenerate` 函数（~68行） | Panel 自己调 api.llmGenerate |
| `s2SopModel` / `s2DaoModel` / `s2YanxiModel` | Panel 内部管理 |
| `s2SopDataSource` / `s2DaoDataSource` / `s2YanxiDataSource` | Panel 内部管理 |
| `step2Generating` state | Panel 内部管理 |
| 2a/2b/2c 三段重复 JSX（~200行） | 改为一个 `<TeachingDocPanel />` |
| 右侧共享编辑区 JSX（~30行） | 移入 Panel 内部 |
| **合计减少约 290 行** | |

Stage 2 的三段 JSX 变为：

```tsx
{stage === 2 && (
  <div className="panel-grid">
    {/* 左侧：当前 sub 对应的自治 Panel */}
    <div className="panel-left">
      <div className="card">
        {sub === '2a' && <TeachingDocPanel ref={sopRef} docType="sop" ... />}
        {sub === '2b' && <TeachingDocPanel ref={daoRef} docType="dao" ... />}
        {sub === '2c' && <TeachingDocPanel ref={yanxiRef} docType="yanxi" ... />}
      </div>
    </div>
    {/* 右侧不再需要——编辑区已在 Panel 内部 */}
  </div>
)}
```

注意：Panel 包含自己的文本编辑区和操作按钮（在左侧 Panel 内），原来的右侧编辑面板不再需要——Stage 2 整体布局从"左配置+右编辑"变为"单 Panel 自包含"。

## 批量生成处理

批量生成按钮在 Stage 1。父组件通过 ref 触发三个 Panel：

```tsx
// 父组件持有三个 ref
const sopRef = useRef<{ triggerGenerate: () => void }>(null)
const daoRef = useRef<{ triggerGenerate: () => void }>(null)
const yanxiRef = useRef<{ triggerGenerate: () => void }>(null)

// 批量生成（父组件保留 batchGenerating state 和按钮）
const handleBatchGenerate = async () => {
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

Panel 通过 `forwardRef` + `useImperativeHandle` 暴露 `triggerGenerate`。

## 文件变更

| 文件 | 操作 |
|------|------|
| `frontend/src/components/TeachingDocPanel.tsx` | 新建（~200行） |
| `frontend/src/components/__tests__/TeachingDocPanel.test.tsx` | 新建（3个测试） |
| `frontend/src/pages/ProjectPage.tsx` | 修改（删 ~290 行，加 ~40 行） |

## 验收标准

1. TypeScript 编译通过
2. 三个 Panel 的生成按钮互不干扰
3. 三个 Panel 的保存按钮互不干扰（含 savedFlash 独立）
4. 三个 Panel 的模型选择器互不干扰（含持久化独立）
5. Stage 1 "生成所有文案"按钮仍可触发三个 Panel 批量生成
6. Stage 1 生成 → Stage 2 数据源内容正确显示
7. 已有功能回归：Stage 2 生成后 Stage 3 能读取 step2_* 内容
8. 前端 build 通过
