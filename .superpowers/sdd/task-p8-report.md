# Phase 8 Report: Step 4 Output Generation

**Date:** 2026-06-22
**Project:** 一勺笔录 Agent (d:/YISHAOAGENT)
**Base Commit:** 8d31b4e (feat: 添加流水线工作台)

## Summary

Implemented Step 4 (输出) of the pipeline workbench: PPT generation, SOP document export, voiceover script generation, and TTS speech synthesis.

## Files Created

| File | Purpose |
|------|---------|
| `backend/services/ppt_service.py` | PPTX generation from markdown using python-pptx |
| `backend/services/export_service.py` | DOCX export from markdown using python-docx |

## Files Modified

| File | Changes |
|------|---------|
| `backend/app.py` | Added PPT, SOP, download, TTS, and audio serving routes; added `EXPORT_DIR`/`AUDIO_DIR` constants; imported `FileResponse` and `SynthesizeRequest` |
| `backend/requirements.txt` | Added `python-pptx>=0.6.23`, `python-docx>=1.1.0`, `httpx>=0.27.0` |
| `frontend/src/services/api.ts` | Added `generatePPT`, `exportSOP`, `ttsSynthesize` API methods |
| `frontend/src/pages/ProjectPage.tsx` | Replaced Step 4 placeholder with full UI (PPT generation, SOP export, voiceover + TTS) |

## New API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ppt/generate` | Generate PPTX from markdown content |
| POST | `/api/export/sop` | Export SOP as DOCX document |
| GET | `/api/download/{filename}` | Download generated files |
| POST | `/api/tts/synthesize` | Synthesize speech via DashScope TTS |
| GET | `/api/audio/{filename}` | Serve synthesized audio |

## Step 4 UI Sections

1. **PPT Generation** -- Two rows (道与术 PPT, 研习手册 PPT), shared template/branding config, generate buttons with download links
2. **SOP Export** -- Source from SOP document, template/branding inputs, export button with download link
3. **Voiceover + TTS** -- Two rows (道与术口播稿, 研习手册口播稿), generate voiceover (LLM with 口播稿 category), textarea editing, TTS synthesis, audio player

**Status gating:** Step 4 is enabled only when all three step3 sub-steps (step3_daoshuyi, step3_yanxi, step3_sop) are marked done.

## Verification Results

- `npx tsc --noEmit` -- 0 errors
- Backend `from app import app` -- import successful
- `python-pptx`, `python-docx`, `httpx` -- installed successfully
- `POST /api/ppt/generate` -- returns `{"filename":"ppt_*.pptx","download_url":"/api/download/ppt_*.pptx"}`
- `POST /api/export/sop` -- returns `{"filename":"sop_*.docx","download_url":"/api/download/sop_*.docx"}`
- `GET /api/download/{filename}` -- returns file with correct content type, HTTP 200
