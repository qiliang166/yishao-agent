# 平台行业无关化重构 | 2026-06-27

## 变更概要

将平台从餐饮领域专用系统重构为行业无关的通用内容生成平台。所有烹饪领域硬编码移除，新增通用数据模型（素材→内容项→结果），项目自身可作为配置模板复制。

## 文件变更

| 操作 | 文件 |
|------|------|
| 修改 | `backend/database.py` — 新增 source_materials/project_items/project_item_results 三表 + 一次性数据迁移 + 通用种子数据替换 |
| 修改 | `backend/models.py` — 新增 SourceMaterial/ProjectItem/ProjectItemResult 的 Pydantic 模型，移除领域注释 |
| 修改 | `backend/app.py` — 新增 12 个 REST 端点（素材/内容项/结果 CRUD + 项目复制），移除 col_to_step 硬编码和 fallback 查询 |
| 新增 | `backend/services/file_parser.py` — 多格式文件解析服务 (.docx/.xlsx/.csv/.pdf/.txt/.md) |
| 修改 | `backend/services/ppt_service.py` — 移除 col_label_map、food_archive、skill_card |
| 修改 | `backend/services/ppt_designer.py` — 删除 build_food_archive() 和 build_skill_card() |
| 修改 | `frontend/src/pages/HomePage.tsx` — 项目创建支持从已有项目复制配置 |
| 修改 | `frontend/src/pages/ProjectPage.tsx` — STAGES 标签/提示词/占位符全部泛化 |
| 修改 | `frontend/src/pages/TemplateManager.tsx` — 移除 food_archive/skill_card 页面类型 |
| 修改 | `frontend/src/pages/ProjSettingsPage.tsx` — 列组标签泛化 |
| 修改 | `frontend/src/pages/PromptManager.tsx` — 分类标签泛化 |
| 修改 | `frontend/src/pages/SettingsPage.tsx` — 移除 "Chef Zhang" 占位符 |
| 修改 | `frontend/src/components/TeachingDocPanel.tsx` — 标签/默认提示词泛化 |
| 修改 | `frontend/src/App.tsx` — Logo 改为 ⚡ |
| 修改 | `frontend/src/services/api.ts` — 新增 12 个 API 函数 |
| 删除 | `backend/ppt_agent/` — 旧插件目录 |
| 删除 | `backend/services/ppt_engine/` — 旧 PPT 引擎 |
| 删除 | `backend/services/html_renderer.py` — 旧 HTML 渲染器 |
| 删除 | `frontend/src/components/SlideOutlineEditor/` — 旧组件 |

## 自审清单

| # | 检查项 | 状态 |
|---|--------|------|
| 1 | 类型安全 | ✅ TS 编译 + Vite build 通过 |
| 2 | 错误处理 | ✅ API 端点有 try/finally 确保 DB 关闭，前端有 try/catch + toast |
| 3 | 日志 | ✅ 无新增日志（无需） |
| 4 | API 契约 | ✅ 新旧端点均返回 dict(row)，Pydantic 模型定义完整 |
| 5 | 数据库 | ✅ 一次性迁移幂等（检查 cc_count>0 && pi_count==0），旧表保留 |
| 6 | 不影响已有功能 | ✅ 旧 API 保留，回归测试 8 个 GET 端点全部通过 |

## API 端点验证

| 端点 | 方法 | 状态 | 备注 |
|------|------|------|------|
| GET /api/projects | GET | ✅ | |
| GET /api/llm/providers | GET | ✅ | |
| GET /api/tts/providers | GET | ✅ | |
| GET /api/templates | GET | ✅ | |
| GET /api/prompts | GET | ✅ | |
| GET /api/prompts/export | GET | ✅ | |
| GET /api/settings | GET | ✅ | |
| GET /api/ppt/styles | GET | ✅ | |
| GET /api/projects/{id}/materials | GET | ✅ | 新端点 |
| POST /api/projects/{id}/materials | POST | ✅ | 新端点，含空字符串边界测试 |
| GET /api/projects/{id}/items | GET | ✅ | 新端点 |
| POST /api/projects/{id}/items | POST | ✅ | 新端点，含最小字段 + 依赖链测试 |
| GET /api/projects/{id}/items/{item_id}/results | GET | ✅ | 新端点 |
| POST /api/projects/{id}/items/{item_id}/results | POST | ✅ | 新端点 |
| POST /api/projects/{id}/copy | POST | ✅ | 新端点，含子项目 content items 复制验证 |
| DELETE .../materials/{id} | DELETE | ✅ | |
| DELETE .../items/{id} | DELETE | ✅ | |
| DELETE .../projects/{id} | DELETE | ✅ | |

## 前端验证

- TypeScript 编译: ✅ 无错误
- Vite 构建: ✅ 392.71 KB JS + 18.17 KB CSS

## 已知未完成

- ProjectPage 仍使用旧 STAGES 管线结构（标签已泛化），未切换到新的 project_items 网格布局
- 新 API（listMaterials/listProjectItems 等）已在 api.ts 中定义但 ProjectPage 未调用
