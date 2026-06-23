# CLAUDE.md — 编码强制规则

## 规则 1：修改前查引用

修改任何函数、状态变量、CSS 类名前，必须先 `grep` 搜索所有引用，列出完整消费者清单，确认影响范围后再动手改。

## 规则 2：异步生成操作模板

任何包含 `await` 的 onClick 处理函数必须使用以下模板：

```typescript
const handleGenerate = async () => {
  setGenerating(true)
  try {
    const result = await doGenerate(params)
    if (result != null) {
      setContent(result)
    }
  } catch (e) {
    toast(`生成失败: ${e}`, 'error')
  } finally {
    setGenerating(false)
  }
}
```

必须包含：`try` + `null` 检查 + `catch` 错误提示 + `finally` 恢复状态。四项缺一不可。

## 规则 3：模型/配置默认值模板

多个独立选择器（模型、数据源等）的默认值设置，必须每个独立使用函数式 setState：

```typescript
// ✅ 正确：每个独立守卫
setModel1((prev: string) => prev || defVal)
setModel2((prev: string) => prev || defVal)
setModel3((prev: string) => prev || defVal)

// ❌ 禁止：统一开关控制多个独立状态
// if (!hasOverride) { setAllModels(defVal) }
```

## 规则 4：返回值空值检查

调用可能返回 `null`、`undefined` 或可能抛出异常的函数后，必须逐项检查每个结果后再使用。禁止 `Promise.all` 后不检查就报告成功。

## 规则 5：全局状态隔离

全局共享状态（如 `savedFlash`、`loading`、`generating`）只能在视觉层面使用（CSS class），禁止参与业务逻辑判断（label 文本、条件渲染内容）。

## 规则 6：同类组件同步检查

修改某个 Stage 的按钮/选择器/保存逻辑后，必须主动检查其他 Stage 的同类组件是否也需要同步修改。

## 规则 7：理解后再修改

修改一段代码前，先通过 `git log` 和上下文注释理解它为什么写成现在这样。如果觉得"可以简化"，先确认当初的设计意图。禁止不理解原设计就重写。
