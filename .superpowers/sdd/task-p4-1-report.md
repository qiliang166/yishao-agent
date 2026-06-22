# Phase 4 Task 1 Report: Video Download & Subtitle Extraction

**Date:** 2026-06-22
**Commit:** feat: 添加视频下载服务（yt-dlp + 字幕提取 + Whisper 语音识别兜底）

## Summary

Added a backend video processing service with three API endpoints for video download, progress polling, and subtitle extraction, integrated with the project step_results system.

## Files Changed

| File | Action | Purpose |
|---|---|---|
| `backend/services/video_service.py` | **Created** | Core service: async video download via yt-dlp, SRT/VTT subtitle parsing, Whisper fallback |
| `backend/app.py` | **Modified** | Added 3 video API endpoints (lines 335-382) |
| `backend/requirements.txt` | **Modified** | Added `yt-dlp>=2024.0.0` |

## API Endpoints Added

| Method | Path | Function |
|---|---|---|
| `POST` | `/api/video/download` | Start async download, returns `{task_id}` for polling |
| `GET` | `/api/video/progress/{task_id}` | Poll download progress (status, progress%, message, results) |
| `POST` | `/api/video/extract-subtitles` | Extract subtitles from completed task, auto-save to step_results as step1 |

## Design Decisions

1. **Async via threading.Thread**: Downloads run in daemon threads to avoid blocking the FastAPI event loop. Progress is tracked via a module-level dict.
2. **yt-dlp CLI (not Python API)**: More reliable, always up-to-date with site changes, avoids API-incompatibility issues.
3. **Subtitle fallback chain**: Built-in subtitles (SRT/VTT/ASS) -> auto-generated captions -> Whisper speech-to-text
4. **Graceful degradation**: If yt-dlp not installed, returns a user-friendly error message rather than crashing
5. **Chinese-first language priority**: Subtitle languages ordered `zh-Hans,zh-CN,zh,en`

## Verification

- `video_service.py` imports successfully
- `data/videos/` directory auto-created on first import
- `app.py` syntax valid, all imports resolve
- yt-dlp v2026.6.9 installed

## Edge Cases Handled

- yt-dlp not installed: clear error message with install instructions
- Download timeout (5 min): caught and reported
- No built-in subtitles: falls back to auto-generated captions
- No captions either: attempts Whisper transcription
- Unicode decode errors in subtitle files: attempts gbk encoding fallback
- Task ID not found in progress store: returns `{status: "not_found"}`
- Video not yet complete when extracting: returns error status

## Testing Instructions

```bash
# 1. Start backend
cd d:/YISHAOAGENT/backend && python app.py

# 2. Start a download (public short video example)
curl -X POST http://localhost:8765/api/video/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=jNQXAC9IVRw"}'

# 3. Poll progress (replace <task_id> with actual ID from step 2)
curl http://localhost:8765/api/video/progress/<task_id>

# 4. Extract subtitles to project step1
curl -X POST http://localhost:8765/api/video/extract-subtitles \
  -H "Content-Type: application/json" \
  -d '{"task_id":"<task_id>","project_id":"<project_id>"}'
```
