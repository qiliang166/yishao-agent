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

## 规则 8：共享代码改动后重建全部产物

修改 `backend/app.py`、`backend/database.py` 或 `frontend/src/` 下的文件后，**必须同时重建**：
- `build_server.ps1` → `yishao-agent-server.zip`
- `build_desktop.ps1` → `YishaoAgent-Setup.exe`

两个产物共享同一份代码，改一个不重建另一个 = 遗漏 bug。禁止只重建一个就说"完成"。

## 规则 9：构建产物自动验证与模块发现

### 服务端构建 (build_server.ps1)
- 打包完成后自动调用 `verify_build.ps1`，对比 `git ls-files` 与构建输出，任何遗漏文件导致构建失败
- 目录结构从实际文件树自动发现，不硬编码目录列表

### 桌面端构建 (build_desktop.ps1)
- `prepare_build.py` 自动扫描 `backend/` 所有 `.py` 文件并注入 PyInstaller `hiddenimports`
- 构建前验证 `frontend/dist/`、`backend/resources/`、`backend/data/styles/`、`backend/data/templates/` 存在且非空
- `build.spec` 不再手动维护 backend 模块列表 — 全部由 `prepare_build.py` 自动发现

### 新增/重命名模块后
- 新增或重命名 `backend/` 下的 Python 文件后，无需手动更新 `build.spec` 的 `hiddenimports`
- 如果新增了静态资源目录（如 `backend/data/新目录/`），需要同步更新：
  1. `verify_build.ps1` 中的静态数据检查（第 46 行）
  2. `build.spec` 中的 `backend_datas` 列表
  3. `build_desktop.ps1` 中的预构建验证目录列表
