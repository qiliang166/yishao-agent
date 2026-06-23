# Layer 2: 自动化回归测试 — 设计文档

**日期**: 2026-06-24 | **状态**: 待审核

---

## 目标

为最容易重复出现的回归 bug 建立自动化安全网。改代码后跑一条命令，30 秒内知道有没有破坏已有功能。

## 技术选型

| 项 | 选择 | 原因 |
|----|------|------|
| 测试框架 | Vitest | Vite 原生，零配置，与现有构建系统兼容 |
| 组件测试 | @testing-library/react | React 官方推荐，按用户行为测试 |
| DOM 断言 | @testing-library/jest-dom | 语义化断言（toBeDisabled、toHaveTextContent） |
| DOM 环境 | jsdom | 纯 Node.js 环境运行，无需浏览器 |

## Mock 策略

需要 mock 的模块：

| 模块 | 原因 |
|------|------|
| `react-router-dom` (useParams) | 组件依赖路由参数 projectId |
| `../../services/api` | 不需要真实后端，控制返回值 |
| `lucide-react` | 图标组件在测试中不需要渲染 |

提供 `renderWithProviders` 包装函数注入以上 mock。

## 测试场景

### 测试 1：生成按钮独立性

**防御**: A8（按钮联动）

```
场景: Stage 2 有三个生成按钮（SOP/道与术/研学）
操作: 点击"生成SOP文案"按钮
验证: "生成道与术文案"按钮未被禁用
验证: "生成研学手册文案"按钮未被禁用
```

### 测试 2：保存按钮状态

**防御**: A1/A2（空内容误显、全局联动闪烁）

```
场景: 文本框内容为空
验证: 保存按钮不显示"已保存"
验证: 保存按钮显示"保存"

场景: 内容与已保存版本不同
验证: 保存按钮显示"保存"（脏状态）
```

### 测试 3：模型选择器独立

**防御**: A3（模型联动覆盖）

```
场景: 7 个模型选择器各自有独立值
操作: 修改 Stage 2 SOP 的模型
验证: Stage 2 道与术的模型值不变
验证: Stage 2 研学的模型值不变
验证: Stage 3 的模型值不变
```

## 文件结构

```
frontend/
├── vitest.config.ts                    # 新增：Vitest 配置
├── package.json                        # 修改：添加测试依赖和脚本
├── src/
│   ├── test/
│   │   ├── setup.ts                    # 新增：全局 mock 配置
│   │   └── test-utils.tsx              # 新增：renderWithProviders
│   └── pages/
│       └── __tests__/
│           └── ProjectPage.test.tsx     # 新增：3 个测试用例
```

## 验收标准

1. `npm test` 命令可运行
2. 3 个测试全部通过
3. 修改代码后，若引入同类回归，至少 1 个测试失败
