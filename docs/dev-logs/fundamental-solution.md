# 根本性解决方案

**日期**: 2026-06-24 | **基于**: 121 提交、34 个错误、4 条拆东墙补西墙链的分析

---

## 诊断

所有问题的根源不是"某次修改不小心"，而是**代码结构本身让错误必然发生**：

- 1517 行单文件 → 改一处无法知道影响面 → 拆东墙必补西墙
- 0 个测试 → 每次验证靠人工 → 丢三落四不可避
- 无类型约束 → 状态共享无编译检查 → 联动 bug 反复出现
- 无代码模板 → 异步逻辑每次手写 → try/finally 被遗漏

---

## 方案：三层重构

### 第一层：组件拆分（消除"改A坏B"）

将 1517 行的 `ProjectPage.tsx` 拆分为：

```
frontend/src/pages/ProjectPage/
├── index.tsx                    # ~100行，路由+项目数据加载
├── Stage1TextExtraction.tsx     # ~150行，文案提取
├── Stage2TeachingDocs.tsx       # ~200行，教学文档
├── Stage3OutputCourseware.tsx   # ~150行，输出课件
├── Stage4VoiceCourseware.tsx    # ~150行，语音课件
├── Stage5OutputList.tsx         # ~80行，输出列表
├── hooks/
│   ├── useSaveState.ts          # 保存按钮状态（替代 savedFlash）
│   ├── useModelSelector.ts      # 模型选择+持久化
│   ├── useAsyncGenerate.ts      # 异步生成+loading+错误处理
│   └── useStepData.ts           # 步骤数据读写
└── types.ts                     # 接口定义
```

**关键规则**：
- 每个 Stage 组件**只管理自己的状态**
- 共享逻辑通过 hooks 复用，**不是通过全局变量**
- 组件间通过 props 传递，接口在 `types.ts` 中明确定义

### 第二层：自动化测试（消除"丢三落四"）

```
frontend/src/pages/ProjectPage/
├── __tests__/
│   ├── Stage1.test.tsx          # 三个数据源独立生成
│   ├── Stage2.test.tsx          # 三个子栏目独立生成+保存
│   ├── Stage3.test.tsx          # PPT/SOP 输出
│   ├── Stage4.test.tsx          # 口播+语音合成
│   ├── useSaveState.test.ts     # 保存按钮状态逻辑
│   ├── useModelSelector.test.ts # 模型选择独立性
│   └── useAsyncGenerate.test.ts # 异步生成 try/finally
```

**覆盖的核心场景**（从实际 bug 中提取）：

| 测试用例 | 防御的 bug |
|------|------|
| Stage2 三个生成按钮独立禁用/恢复 | A8 按钮联动 |
| 保存按钮空内容不显示"已保存" | A1 空内容误显 |
| 7 个模型选择器独立设置不联动 | A3 模型覆盖 |
| 批量生成任一失败不影响其他 | A4 假成功 |
| 生成中按钮显示 loading 状态 | A5 无加载态 |
| 生成异常时按钮恢复可点击 | A5 finally 缺失 |

### 第三层：代码生成模板（消除"忘了写finally"）

创建 `.claude/code-templates/` 或 CLAUDE.md 规则：

```typescript
// 异步生成操作模板 — 任何 async onClick 必须使用此模式
const handleGenerate = async () => {
  setGenerating(true)       // ✅ 必须：设置 loading
  try {
    const result = await doGenerate(params)
    if (result != null) {   // ✅ 必须：检查 null
      setContent(result)
    }
  } catch (e) {
    toast('生成失败: ' + e.message, 'error')  // ✅ 必须：错误提示
  } finally {
    setGenerating(false)    // ✅ 必须：恢复状态
  }
}
```

```typescript
// 模型默认值设置模板 — 任何初始化必须使用函数式 setState
useEffect(() => {
  if (defVal) {
    setModel1((prev: string) => prev || defVal)  // ✅ 独立守卫
    setModel2((prev: string) => prev || defVal)  // ✅ 独立守卫
    // ❌ 禁止: if (!hasOverride) { setAllModels(defVal) }
  }
}, [defVal])
```

---

## 实施路线

### Phase 1：止血（今天，~2h）

不改变功能，只加保护：

1. **CLAUDE.md 添加强制规则**（15min）
   - 修改任何函数前，必须 `grep` 所有引用并列出消费者
   - 异步 onClick 必须使用 try/finally 模板
   - 模型默认值必须使用函数式 setState
   
2. **添加冒烟测试**（1.5h）
   - 3 个最核心的测试：Stage2 按钮独立性、保存按钮状态、模型选择器独立性
   - 运行命令：`cd frontend && npx vitest run`

### Phase 2：治本（本周，~8h）

3. **拆分 ProjectPage.tsx**（5h）
   - 先抽 hooks（useSaveState / useModelSelector / useAsyncGenerate）
   - 再拆组件（Stage1-5）
   - 每拆一个，运行冒烟测试验证

4. **补全测试**（3h）
   - 按上表覆盖 6 个核心场景

### Phase 3：防复发（下周，~4h）

5. **TypeScript 严格模式**（1h）
   - `tsconfig.json` 启用 `strict: true`
   - 消除所有 any 类型

6. **CI 流水线**（2h）
   - 每次 push 自动运行测试
   - 测试不通过禁止合并

7. **拆分后端 app.py**（可选，~2h）
   - 94KB 的 app.py 同样需要拆分为路由模块

---

## 效果预估

| 指标 | 改造前 | 改造后 |
|------|--------|--------|
| 单文件行数 | 1517 行 | 最大 200 行 |
| 修改前消费者可见性 | 依赖脑记 | grep + 接口定义 |
| 回归发现方式 | 用户报告 | 自动化测试（秒级） |
| 异步代码正确性 | 依赖记忆 | 模板强制 |
| 新功能→回归概率 | ~60% | <10% |
| fix 提交占比 | 45% | <15% |

---

## 为什么这是"根本性"的

之前的修复都在**代码层面**改 bug——这次改的是**产生 bug 的系统**：

- 拆分组件 → 改了 A 不会不小心碰到 B
- Hooks 复用 → 不会出现 7 个选择器用 7 种不同写法
- 测试覆盖 → 改了之后 30 秒知道有没有破坏什么
- 模板约束 → 不会忘记写 finally
- 类型严格 → 编译期就发现状态共享问题
