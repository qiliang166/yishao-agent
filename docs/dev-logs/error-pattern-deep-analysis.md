# 一勺笔录(SOP)智能体 — 重复错误与连锁问题深度分析

**日期**: 2026-06-24 | **分析范围**: 全部 121 个提交

---

## 一、"拆东墙补西墙" 实例链

### 链 1：保存按钮 — 3 次提交、14 小时、2 次回归

```
06-23 16:13  7bf1243  feat: save buttons show dirty state
                 ↓
              创建 getSaveBtnLabel() / getSaveBtnClass()
              引入 savedFlash 全局状态用于保存闪烁反馈
                 ↓
              ⚠️ 埋下隐患：savedFlash 是全局单例，被 8+ 个按钮共享
                 ↓
06-24 06:13  c6862c0  fix: save button state (14小时后)
                 ↓
              用户报告：空内容的保存按钮显示"已保存"
              修复：在 getSaveBtnLabel 中添加 !content.trim() 检查
                 ↓
              ⚠️ 只修了用户报告的 A 问题，没检查 B/C/D 按钮
              ⚠️ savedFlash 优先判断仍在第一位，仍是全局共享
                 ↓
06-24 06:21  ec629fb  fix: remove global savedFlash (8分钟后!)
                 ↓
              用户报告：任意按钮闪烁 → 全部按钮显示"已保存"
              修复：savedFlash 从 getSaveBtnLabel 移除，保留在 CSS class
```

**关键数据**：

| 指标 | 值 |
|------|-----|
| 功能→第一次回归 | 14 小时 |
| 第一次修复→第二次回归 | 8 分钟 |
| 总修复轮次 | 2 次 |
| 根因 | 第一次修复只看了用户报告的问题点，未检查全局状态的所有消费者 |

### 链 2：模型选择器 — 3 次提交、44 分钟→12 小时、2 次回归

```
06-23 17:04  172ac86  feat: model persistence + batch generate
                 ↓
              7 个独立模型选择器：step1Model, s2SopModel, s2DaoModel, s2YanxiModel,
                                  s3SopModel, s3DaoPptModel, s3YanxiPptModel
              每个有独立守卫：if (!s2SopModel) setS2SopModel(defVal)
                 ↓
              ✅ 每个模型独立工作正常
                 ↓
06-23 17:48  31a2684  fix: listProviders default overwrite (44分钟后)
                 ↓
              问题：listProviders() 完成后，defVal 覆盖了用户已选择的模型
              "修复"：将 7 个独立守卫合并为 1 个 hasModelOverride
              if (!hasModelOverride) { setAllModels(defVal) }
                 ↓
              ⚠️ 简化了逻辑，但破坏了独立性的设计意图
              ⚠️ 7 个独立状态被 1 个统一开关控制
                 ↓
06-24 06:29  36a6ff1  fix: functional setState (12小时后)
                 ↓
              用户报告：选择任意一个模型 → 其余 6 个全部联动变化
              修复：恢复独立守卫，但改用函数式 setState
              setS2SopModel(prev => prev || defVal)
```

**关键数据**：

| 指标 | 值 |
|------|-----|
| 功能→第一次修复 | 44 分钟 |
| 第一次修复→回归发现 | 12 小时 |
| 修复方式 | 完全重写前一个"修复"的逻辑 |
| 根因 | 用简化逻辑替换分布式守卫，未理解原设计意图 |

### 链 3：Stage 1 按钮独立性 — 3 次提交每次说"真正独立"

```
06-23  cadd82a  fix: Stage 1 three-source independence — "fully isolated"
06-23  fefbe89  fix: Stage 1 buttons independent per source (1a/1b/1c)
06-23  0c983b1  fix: Stage 1 buttons "truly independent" — only self-disabled
```

**语言本身就是证据**："independent" → "independent per source" → "**truly** independent"

3 次提交解决同一个问题，每次声称解决了，实际都没完全解决。

### 链 4：模板弹窗 UI — 17 次提交、3 次架构翻转

```
06-23  67532f8  feat: card-based TemplateManager (初版)
           ↓
        行内展开编辑器模式
           ↓
06-23  f63ecda  fix: remove expand/dropdown editor → modal with drag+resize
           ↓
        推倒重来：展开 → 弹窗
           ↓
        后续 15 个提交全是弹窗的补救性修复
        (布局×5 + 拖拽×4 + 缩略图×6)
```

**3 次架构决策**都在代码中做出，而非在原型中验证：
1. 行内展开编辑器 → 废弃
2. 下拉展开 → 废弃  
3. 弹窗+拖拽+缩放 → 17 次提交后才稳定

---

## 二、"丢三落四"模式分析

### 模式：改了 A 函数，忘记 B/C/D 调用者

| 被修改的函数/逻辑 | 实际消费者数量 | 修改时考虑到的 | 遗漏的 |
|------|------|------|------|
| `getSaveBtnLabel()` | 8+ 个保存按钮 | 1 个（用户报告的） | 7+ 个其他 Stage 的保存按钮 |
| `savedFlash` 全局状态 | 所有保存按钮的 label + class | 仅 class | label 判断逻辑 |
| 模型默认值加载 `defVal` | 7 个独立模型选择器 | 全部（但用统一开关） | 每个模型的独立状态保护 |
| `doBatchGenerate()` | 3 个数据源的生成结果 | 流程本身 | 每个 `doGenerate` 的返回值检查 |
| `setGenerating` 异步状态 | 3 个 Stage 2 按钮 + 3 个 Stage 4 按钮 | Stage 2 | Stage 4 |
| `PUT /api/column-configs` | rules 更新 + skill 更新 | rules 更新流程 | skill 自动覆写用户数据 |

### 为什么会"丢三落四"？

```
原因 1: 1517 行单文件 ProjectPage.tsx
       → 无法一眼看到所有消费者
       → 修改依赖脑内记忆，而非工具搜索

原因 2: 修改前不做 grep
       → 不知道有哪些地方调用了这个函数/状态
       → 凭感觉修改

原因 3: 用户报告什么就修什么
       → 用户说"教学文档的保存按钮坏了" → 只修教学文档的
       → 不检查文案提取/输出课件/语音课件的保存按钮

原因 4: 没有自动化测试
       → 修完无法自动验证所有消费者
       → 依赖人工逐个点击测试
```

---

## 三、"新功能引发旧问题" 实例

### 实例 1：模型持久化（新功能）→ 选择器独立性损坏（旧功能）

```
172ac86 feat: 新增模型持久化 → 7 个独立选择器正常工作 ✅
    ↓
31a2684 fix: 修复持久化的默认值覆盖问题 → 破坏了独立性 ❌
    ↓
36a6ff1 fix: 恢复独立性 → 但用了和最初不同的实现方式 ⚠️
```

**链条**：新功能(模型持久化) → 带出 bug(默认值覆盖) → 修 bug 引入新 bug(独立性损坏) → 再修 → 代码和最初版本已经不同

### 实例 2：保存 dirty state（新功能）→ 按钮状态系统损坏（旧功能）

```
7bf1243 feat: 新增 dirty state 检测 → 保存按钮状态正常 ✅
    ↓
  (中间经历了 c6862c0 的 column-config skill 修复，顺带修了空内容问题)
    ↓
ec629fb fix: savedFlash 联动问题 → 重写了状态判断逻辑 ⚠️
```

**链条**：新功能(dirty state) 的副作用(savedFlash) 在后续迭代中破坏了状态系统

### 实例 3：PPT 规则系统（新功能）→ SKILL 数据丢失（旧数据）

```
0033163 feat: PPT 规则系统 → 每次 rules 更新自动生成 skill ✅
    ↓
539d9e9 feat: 自动生成 prompt+skill → 加强自动化 ✅
    ↓
  (用户手动修改了 c4-dao 的 SKILL，写了 2705 字)
    ↓
c6862c0 fix: 用户发现 SKILL 被覆盖 → 添加保护条件 ⚠️
```

**链条**：自动化功能(规则→skill)没有考虑用户手动编辑的场景，静默覆盖用户数据

### 实例 4：批量生成（新功能）→ 结果反馈损坏（旧功能）

```
172ac86 feat: 批量生成按钮 ✅
    ↓
  (代码中 doGenerate 始终在内部 catch 错误返回 null)
    ↓
20600d8 fix: 发现 Promise.all([null,null,null]) 仍报告成功 ❌
```

**链条**：新功能(批量生成)依赖了旧函数(doGenerate)的错误处理约定，但未检查旧函数的实际返回值

---

## 四、重复错误分类统计

### 按错误类型重复次数

| 错误类型 | 重复次数 | 涉及提交 | 典型表现 |
|------|------|------|------|
| **状态共享导致联动** | **5 次** | `cadd82a`/`fefbe89`/`0c983b1`/`69e1bc2`/`64a9c4c`/`ec629fb`/`36a6ff1`/`31a2684` | 按钮/选择器互相干扰 |
| **修复不完整需二次修复** | **4 次** | `ec629fb`(←`c6862c0`)/`36a6ff1`(←`31a2684`)/`0c983b1`(←`fefbe89`)/`20600d8`(←`172ac86`) | 每次修完 8 分钟~12 小时后发现新问题 |
| **UI 方案推翻重来** | **3 次** | 弹窗架构 ×3 (展开→下拉→弹窗) | 代码实现后才发现交互不合适 |
| **CSS 同一效果尝试多种方案** | **6 次** | 缩略图间距 (padding/inset/aspect-ratio/transform/box-border) | 对 CSS 布局机制不熟悉 |
| **AI 问候语抑制** | **3 次** | `53741fc`/`2315af3`/`f2d7c66` | 逐个 prompt 添加抑制指令 |
| **Prompt 模板升级** | **4 次** | `139ba96`/`81fc902`/`fb74818`/`9423fed` | 每个子栏目独立升级 |

### 按时间线：修复→再修复 间隔

| 第一次修复 | 第二次修复 | 间隔 | 说明 |
|------|------|------|------|
| `c6862c0` (save btn empty fix) | `ec629fb` (savedFlash fix) | **8 分钟** | 修复后用户立即发现新问题 |
| `31a2684` (model default fix) | `36a6ff1` (cross-overwrite fix) | **12 小时** | 过了一晚用户才发现 |
| `fefbe89` (Stage1 btn v1) | `0c983b1` (Stage1 btn v2) | **同一天** | 连续修复同一问题 |
| `69e1bc2` (Stage2 btn) | `64a9c4c` (Stage2 dropdown) | **同一天** | 修复按钮后才发现下拉框也不独立 |

---

## 五、核心病灶：ProjectPage.tsx 的 37 次修改

```
文件: frontend/src/pages/ProjectPage.tsx
行数: 1517 行
被修改: 37 次提交
fix 提交: 18/37 = 49%
```

**时间线分析**：

```
06-22  初始创建 + 4 次 feat (搭建骨架)
06-23  20 次提交 (密集开发) 
         ├── 10 次 feat (新功能)
         ├── 7 次 fix (按钮独立性 ×3, 保存 ×1, 模型 ×1, 硬编码 ×1, 数据源 ×1)
         └── 3 次其他
06-24  7 次提交 (几乎全是修复!)
         ├── 6 次 fix (保存 ×2, 模型 ×2, 批量 ×1, SKILL ×1)
         └── 1 次 feat
```

**趋势显而易见**：06-23 是功能开发日，06-24 全天都在修前一天留下的 bug。

---

## 六、根因与预防

### 五个最频繁的失败模式

| # | 失败模式 | 发生次数 | 为什么每次都发生 | 预防 |
|---|------|------|------|------|
| 1 | **修改函数不查所有调用处** | 8+ | 文件太大（1517行），依赖脑记 | 改前 `grep` 函数名，列出所有消费者 |
| 2 | **用户报告A只修A** | 6+ | 修复紧追用户反馈，无暇顾及影响面 | 修完后主动检查同类组件（所有 Stage） |
| 3 | **简化逻辑破坏设计** | 3 | 不理解原设计的意图就动手改 | 改前读注释/git log，理解为什么写成这样 |
| 4 | **异步状态管理不完整** | 4 | 只写了 `setXxx(true)` 忘了 `finally` | 异步操作模板化：try/finally 强制 |
| 5 | **UI方案在代码中验证** | 17+ | 没有原型阶段，直接写代码 | 重大交互变更先原型后代码 |

### 若不加预防的预测

以当前 1517 行 ProjectPage.tsx 的增长速度（37 次修改/2天），如果继续不拆分、不加测试：

- 每新增 1 个功能 → 平均引入 0.6 个回归 bug
- 每修复 1 个 bug → 平均需要 1.5 次提交才能彻底修好
- 06-24 全天修 bug 的模式将在每个新功能日之后重复
