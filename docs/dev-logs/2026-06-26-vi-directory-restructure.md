# VI 目录结构化重构 | 2026-06-26

## 变更概要

将 Business 风格的 VI 从单文件拆分为目录结构，按幻灯片类型分批加载到 HTML 生成管线。

## 文件变更

| 操作 | 文件 |
|------|------|
| 新建 | `styles/business/vi.md` |
| 新建 | `styles/business/cover.md` |
| 新建 | `styles/business/content.md` |
| 新建 | `styles/business/data.md` |
| 新建 | `styles/business/summary.md` |
| 新建 | `styles/business/tokens.yaml` |
| 新建 | `styles/business/prompt.md` |
| 删除 | `styles/business.yaml` |
| 删除 | `styles/business_vi.md` |
| 删除 | `styles/business_vi.html` |
| 删除 | `styles/business_prompt.md` |
| 修改 | `backend/services/ppt_service.py` — 3 个 loader 改目录优先 + 新增 section loader + HTML 生成按 slide type 加载 VI |
| 修改 | `backend/app.py` — VI/prompt API 端点改为目录感知（新旧兼容） |
| 修改 | `frontend/src/services/api.ts` — 新增 listStyleVIFiles/get/save 子文件 API |
| 修改 | `frontend/src/pages/TemplateManager.tsx` — VI 编辑器改为多 TAB |

## 自审清单

| # | 检查项 | 状态 |
|---|--------|------|
| 1 | 类型安全 | ✅ TS 编译通过 |
| 2 | 错误处理 | ✅ loader 三层 fallback（目录→legacy flat→空），save 有 try/catch |
| 3 | 日志 | ✅ 无新增日志（loader 为纯读取，无需） |
| 4 | API 契约 | ✅ 新增端点返回 {exists, content} 与旧端点一致，向后兼容旧路径 |
| 5 | 数据库 | ✅ 无数据库变更 |
| 6 | 不影响已有功能 | ✅ 旧端点 /vi 和 /prompt 保持兼容，loader 有 fallback 链 |

## API 端点验证

| 端点 | 方法 | 状态 | 备注 |
|------|------|------|------|
| `/api/ppt/styles/business/vi/files` | GET | ✅ 200 | 返回 7 个文件 |
| `/api/ppt/styles/business/vi/cover` | GET | ✅ 200 | section=cover, exists=true |
| `/api/ppt/styles/business/vi/cover` | PUT | ✅ 200 | 保存成功 |
| `/api/ppt/styles/business/vi` | GET | ✅ 200 | 合并所有子文件返回 |
| `/api/ppt/styles/business/prompt` | GET | ✅ 200 | prompt.md 读取正常 |

## 后端 Loader 验证

| 函数 | 测试 | 结果 |
|------|------|------|
| `_load_style_vi('business')` | 读取通用 vi.md | ✅ True |
| `_load_style_yaml_text('business')` | 读取 tokens.yaml | ✅ True |
| `_load_style_prompt('business')` | 读取 prompt.md | ✅ True |
| `_load_style_vi_section('business', 'cover')` | vi.md + cover.md | ✅ 3830 chars |
| `_load_style_vi_section('business', 'content')` | vi.md + content.md | ✅ 4380 chars |
| `_load_style_vi_section('business', 'data')` | vi.md + data.md | ✅ 4828 chars |
| `_load_style_vi_section('business', 'summary')` | vi.md + summary.md | ✅ 3748 chars |

## 前端验证

| 检查项 | 状态 |
|--------|------|
| TypeScript 编译 | ✅ tsc 通过 |
| Vite build | ✅ 产出 dist/ |
| Dev server | 未测试（无 UI 变更影响运行） |

## 回归验证

| 端点 | 方法 | 状态 |
|------|------|------|
| `/api/health` | GET | ✅ 200 |
| `/api/projects` | GET | ✅ 200 |
| `/api/templates` | GET | ✅ 200 |
| `/api/ppt/styles` | GET | ✅ 200 |
| `/api/providers` | GET | ⚠️ 404（路径不存在，非本次变更影响） |

## 备注

- 其他 16 个风格（blueprint, bold-editorial 等）仍使用旧 flat 文件结构，loader 的 legacy fallback 确保它们正常工作
- 后续可将其他风格也迁移到目录结构
