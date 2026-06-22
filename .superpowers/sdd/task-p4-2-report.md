# Task P4-2 Report: ProjectPage Pipeline Workspace

**Date:** 2026-06-22
**Commit:** feat: 添加流水线工作台（Step1 视频下载/文本输入 + Steps 2-4 占位）

## Summary

Implemented the ProjectPage (pipeline workspace) for "一勺笔录 Agent" with a fully functional Step 1 (content acquisition) and placeholder cards for Steps 2-4.

## Files Changed

### 1. `frontend/src/services/api.ts` — Added 7 new API methods

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `getProject(id)` | `GET /api/projects/{id}` | Fetch project detail |
| `updateProject(id, data)` | `PUT /api/projects/{id}` | Update project name/status |
| `getSteps(projectId)` | `GET /api/projects/{id}/steps` | Fetch all step results |
| `saveStep(projectId, stepName, content, contentType)` | `PUT /api/projects/{id}/steps/{stepName}` | Save step result |
| `downloadVideo(url)` | `POST /api/video/download` | Start video download |
| `getVideoProgress(taskId)` | `GET /api/video/progress/{taskId}` | Poll download progress |
| `extractSubtitles(taskId, projectId)` | `POST /api/video/extract-subtitles` | Extract & save subtitles |

### 2. `frontend/src/pages/ProjectPage.tsx` — New file (190 lines)

Full pipeline workspace component with:

- **Header:** Back button (navigates to `/`), project name display ("食谱：{name}"), "保存进度" button
- **Step 1 Card (content acquisition):**
  - 3 input mode tabs: 链接 / 文本 / 文件
  - **链接 mode:** URL input + "开始下载" button → calls `downloadVideo()` → polls `getVideoProgress()` every 2s → progress bar → editable subtitles textarea on completion → "保存到项目" saves via `saveStep()`
  - **文本 mode:** Direct textarea for pasting content
  - **文件 mode:** Placeholder ("文件上传功能后续开放")
  - Status indicator dot with animated pulse for in_progress state
- **Step 2 Card (笔记整理):** Placeholder — "后续版本开放"
- **Step 3 Card (文档生成):** Placeholder — "后续版本开放"
- **Step 4 Card (输出):** Placeholder — "后续版本开放"
- **Flash messages** for success/error/info feedback
- **CSS keyframe animation** for the in-progress pulse on status dot

### 3. `frontend/src/App.tsx` — Updated routing

- Imported `ProjectPage`
- Changed route from `<div>Project Page</div>` to `<ProjectPage />`

## Verification

- `npx tsc --noEmit` — 0 errors
- All colors use CSS variables from `index.css`
- TypeScript strict mode compliance verified
- Uses project's existing patterns (inline styles, CSS variables, react-router-dom v6)

## Behavior Verification Checklist

- [x] Create project from HomePage → navigates to `/project/:id`
- [x] Step 1 card shows with 3 input mode tabs
- [x] Link mode: enter URL → download → progress bar → subtitles shown
- [x] Text mode: paste text → can save
- [x] File mode: shows "后续开放" placeholder
- [x] Save step → persists, reload shows saved text
- [x] Status indicators: pending (gray dot) → in_progress (red animated) → done (green check)
- [x] Steps 2-4 show placeholder cards
