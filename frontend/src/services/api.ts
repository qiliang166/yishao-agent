const BASE = ''

async function request(path: string, options?: RequestInit & { timeoutMs?: number }) {
  const ctrl = new AbortController()
  const existingSignal = options?.signal
  if (existingSignal) {
    existingSignal.addEventListener('abort', () => ctrl.abort())
  }

  // Auto-abort after timeout (default 30s, 0 = no timeout)
  const timeoutMs = options?.timeoutMs ?? 30000
  let timer: any = null
  if (timeoutMs > 0) {
    timer = setTimeout(() => ctrl.abort(), timeoutMs)
  }

  try {
    // Remove custom field before passing to fetch
    const { timeoutMs: _, ...fetchOpts } = (options || {})
    const res = await fetch(BASE + path, { ...fetchOpts, signal: ctrl.signal })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || `服务器错误 (${res.status})`)
    return data
  } catch (e: any) {
    if (e.name === 'AbortError') {
      throw new Error('请求超时或已取消')
    }
    if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
      throw new Error('无法连接服务器，请确认后端是否正常运行')
    }
    throw e
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export interface LLMProvider {
  id: string
  name: string
  api_key: string
  base_url: string
  models: string[]
  is_enabled: number
}

export interface TTSProvider {
  id: string
  name: string
  api_key: string
  base_url: string
  models: string[]
  is_enabled: number
  is_default?: number
}

export interface ASRProvider {
  id: string
  name: string
  api_key: string
  base_url: string
  models: string[]
  is_enabled: number
  is_default?: number
}

export interface ImageProvider {
  id: string
  name: string
  api_key: string
  base_url: string
  models: string[]
  is_enabled: number
  is_default?: number
}

export interface Voice {
  id: string
  name: string
  provider_id: string
  voice_id: string
  description: string
  preview_audio_path: string
  is_default: number
  created_at: string
}

export interface Project {
  id: string
  project_code?: string
  name: string
  status: string
  source_type: string
  storage_path?: string
  is_locked?: number
  copied_from_project_id?: string
  created_at: string
  updated_at: string
}

export interface Prompt {
  id: string
  name: string
  category: string
  system_prompt: string
  skill_template: string
  is_default: number
  created_at: string
  updated_at: string
}

export interface PromptVersion {
  version: string
  system_prompt: string
  skill_template: string
  change_note: string
  created_at: string
}

export interface PromptDetail extends Prompt {
  versions: PromptVersion[]
}

export interface DiffResult {
  system_prompt_diff: string
  skill_template_diff: string
}

export interface StyleItem {
  id: string
  name: string
  group: string
  mood: string
  keywords: string[]
  colors: {
    primary: string
    accent: string
    background: string
    text: string
  }
}

export const api = {
  // Projects
  listProjects: (page?: number, pageSize?: number) => {
    const params = new URLSearchParams()
    if (page) params.set('page', String(page))
    if (pageSize) params.set('page_size', String(pageSize))
    const qs = params.toString()
    return request(`/api/projects${qs ? '?' + qs : ''}`).then(d => d as { projects: Project[]; total: number; page: number; page_size: number })
  },
  getProject: (id: string) => request(`/api/projects/${id}`),
  listProjectVideos: (id: string) => request(`/api/projects/${id}/videos`),
  createProject: (name: string) =>
    request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, source_type: 'text' }),
    }),
  updateProject: (id: string, data: {name?: string; status?: string; storage_path?: string; is_locked?: number}) =>
    request(`/api/projects/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  deleteProject: (id: string) => request(`/api/projects/${id}`, { method: 'DELETE' }),
  batchDeleteProjects: (ids: string[]) =>
    request('/api/projects/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }),

  // Step results
  getSteps: (projectId: string) => request(`/api/projects/${projectId}/steps`).then(d => d.steps),
  saveStep: (projectId: string, stepName: string, content: string, contentType: string = 'markdown') =>
    request(`/api/projects/${projectId}/steps/${stepName}`, {
      method: 'PUT', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ step_name: stepName, content, content_type: contentType }),
    }),

  // File save to project
  saveFileToProject: (projectId: string, filename: string, content: string) =>
    request(`/api/projects/${projectId}/save-file`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ filename, content }),
    }),

  // Video
  downloadVideo: (url: string, cookiesPath?: string, projectId?: string, asrModel?: string, asrProviderId?: string) => request('/api/video/download', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url, cookies_path: cookiesPath || null, project_id: projectId || null, asr_model: asrModel || 'fun-asr', asr_provider_id: asrProviderId || null}),
  }),
  uploadCookies: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/video/upload-cookies', { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Upload failed')
    return data as { cookies_path: string; filename: string }
  },
  getVideoProgress: (taskId: string) => request(`/api/video/progress/${taskId}`),
  extractSubtitles: (taskId: string, projectId: string) => request('/api/video/extract-subtitles', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({task_id: taskId, project_id: projectId}),
  }),

  // LLM Providers
  listProviders: () => request('/api/llm/providers').then(d => d.providers as LLMProvider[]),
  createProvider: (data: { name: string; api_key: string; base_url: string; models: string[] }) =>
    request('/api/llm/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updateProvider: (id: string, data: { name: string; api_key: string; base_url: string; models: string[] }) =>
    request(`/api/llm/providers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteProvider: (id: string) => request(`/api/llm/providers/${id}`, { method: 'DELETE' }),
  testProvider: (id: string) => request(`/api/llm/providers/${id}/test`, { method: 'POST' }),

  // TTS Providers
  listTtsProviders: () => request('/api/tts/providers').then(d => d.providers as TTSProvider[]),
  createTtsProvider: (data: { name: string; api_key: string; base_url: string; models: string[]; is_default?: number }) =>
    request('/api/tts/providers', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  updateTtsProvider: (id: string, data: { name: string; api_key: string; base_url: string; models: string[]; is_default?: number }) =>
    request(`/api/tts/providers/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  deleteTtsProvider: (id: string) => request(`/api/tts/providers/${id}`, { method: 'DELETE' }),
  testTtsProvider: (id: string) => request(`/api/tts/providers/${id}/test`, { method: 'POST' }),

  // Voices
  listVoices: (providerId?: string) =>
    request(`/api/voices${providerId ? `?provider_id=${encodeURIComponent(providerId)}` : ''}`).then(d => d.voices as Voice[]),
  createVoice: (data: { name: string; provider_id: string; voice_id: string; description?: string; is_default?: number }) =>
    request('/api/voices', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  updateVoice: (id: string, data: { name?: string; provider_id?: string; voice_id?: string; description?: string; is_default?: number }) =>
    request(`/api/voices/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  deleteVoice: (id: string) => request(`/api/voices/${id}`, { method: 'DELETE' }),
  previewVoice: (id: string) => request(`/api/voices/${id}/preview`, { method: 'POST' }),

  // ASR Providers
  listAsrProviders: () => request('/api/asr/providers').then(d => d.providers as ASRProvider[]),
  createAsrProvider: (data: { name: string; api_key: string; base_url: string; models: string[]; is_default?: number }) =>
    request('/api/asr/providers', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  updateAsrProvider: (id: string, data: { name: string; api_key: string; base_url: string; models: string[]; is_default?: number }) =>
    request(`/api/asr/providers/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  deleteAsrProvider: (id: string) => request(`/api/asr/providers/${id}`, { method: 'DELETE' }),
  testAsrProvider: (id: string) => request(`/api/asr/providers/${id}/test`, { method: 'POST' }),

  // Image Providers
  listImageProviders: () => request('/api/image/providers').then(d => d.providers as ImageProvider[]),
  createImageProvider: (data: { name: string; api_key: string; base_url: string; models: string[]; is_default?: number }) =>
    request('/api/image/providers', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  updateImageProvider: (id: string, data: { name: string; api_key: string; base_url: string; models: string[]; is_default?: number }) =>
    request(`/api/image/providers/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  deleteImageProvider: (id: string) => request(`/api/image/providers/${id}`, { method: 'DELETE' }),
  testImageProvider: (id: string) => request(`/api/image/providers/${id}/test`, { method: 'POST' }),

  // Image Generation
  generateImage: (data: {
    prompt: string; provider_id?: string; model?: string; size?: string; n?: number;
    negative_prompt?: string; prompt_extend?: boolean; watermark?: boolean; seed?: number;
    reference_images?: string[];
  }) =>
    request('/api/image/generate', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),

  // LLM calls
  llmGenerate: (data: {
    provider_id: string; model: string; system_prompt: string;
    user_message: string; temperature?: number; signal?: AbortSignal
  }) =>
    request('/api/llm/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: data.signal,
    }),
  // LLM streaming generate (SSE)
  llmGenerateStream: async function* (data: {
    provider_id: string; model: string; system_prompt: string;
    user_message: string; temperature?: number
  }): AsyncGenerator<string, void, unknown> {
    const res = await fetch('/api/llm/generate-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
      throw new Error(err.detail || `HTTP ${res.status}`)
    }
    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6)
          if (payload === '[DONE]') return
          try {
            const parsed = JSON.parse(payload)
            if (parsed.error) throw new Error(parsed.error)
            if (parsed.content) yield parsed.content
          } catch (e: any) {
            if (e.message && !e.message.includes('JSON')) throw e
          }
        }
      }
    }
  },

  llmRefine: (data: {
    provider_id: string; model: string; instruction: string;
    selected_text: string; full_context?: string
  }) =>
    request('/api/llm/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  // Settings
  getSettings: () => request('/api/settings'),
  updateSettings: (data: Record<string, string>) =>
    request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  // Password verification
  verifyPassword: (password: string) =>
    request('/api/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }),

  // Prompts
  listPrompts: (category?: string) => {
    const params = category ? `?category=${encodeURIComponent(category)}` : ''
    return request(`/api/prompts${params}`).then(d => d.prompts as Prompt[])
  },
  createPrompt: (data: { name: string; category: string; system_prompt?: string; skill_template?: string }) =>
    request('/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(d => d as Prompt & { versions?: PromptVersion[] }),
  getPrompt: (id: string) =>
    request(`/api/prompts/${id}`).then(d => d as PromptDetail),
  updatePrompt: (id: string, data: { name?: string; category?: string; system_prompt?: string; skill_template?: string; change_note?: string }) =>
    request(`/api/prompts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(d => d as Prompt & { versions?: PromptVersion[] }),
  deletePrompt: (id: string) =>
    request(`/api/prompts/${id}`, { method: 'DELETE' }),
  getPromptVersions: (id: string) =>
    request(`/api/prompts/${id}/versions`).then(d => d.versions as PromptVersion[]),
  rollbackPrompt: (id: string, version: string) =>
    request(`/api/prompts/${id}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version }),
    }).then(d => d as PromptDetail),
  diffPrompt: (id: string, version_a: string, version_b: string) =>
    request(`/api/prompts/${id}/diff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version_a, version_b }),
    }).then(d => d as DiffResult),
  setDefaultPrompt: (id: string) =>
    request(`/api/prompts/${id}/set-default`, { method: 'POST' }),
  exportPrompts: () =>
    request('/api/prompts/export'),
  importPrompts: (data: any[]) =>
    request('/api/prompts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    }),

  // Templates
  listTemplates: (type?: string) => request(`/api/templates${type ? `?type=${encodeURIComponent(type)}` : ''}`).then(d => d.templates),
  createTemplate: (data: {name: string; type: string; file_path?: string; prompt?: string; skill?: string; rules?: string; linked_skill_id?: string; branding_config?: string}) =>
    request('/api/templates', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  updateTemplate: (id: string, data: {name: string; type: string; file_path?: string; prompt?: string; skill?: string; rules?: string; linked_skill_id?: string; branding_config?: string}) =>
    request(`/api/templates/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  deleteTemplate: (id: string) => request(`/api/templates/${id}`, { method: 'DELETE' }),
  setDefaultTemplate: (id: string) => request(`/api/templates/${id}/set-default`, { method: 'POST' }),
  resetTemplateThumbnail: (templateId: string) =>
    request(`/api/templates/${encodeURIComponent(templateId)}/reset-thumbnail`, { method: 'POST' }),
  uploadTemplateThumbnail: async (templateId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}/upload-thumbnail`, { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Upload failed')
    return data as { ok: boolean; thumbnail_path: string; filename: string }
  },
  uploadTemplateFile: async (templateId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}/upload`, { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Upload failed')
    return data as { ok: boolean; file_path: string; filename: string }
  },
  previewSlides: (templateId: string) =>
    request(`/api/templates/${encodeURIComponent(templateId)}/preview-slides`, { method: 'POST' }).then(d => d.slides as string[]),
  getSlidesContent: (templateId: string) =>
    request(`/api/templates/${encodeURIComponent(templateId)}/slides-content`),
  getSlideThumbUrl: (templateId: string) =>
    `${BASE}/api/templates/${encodeURIComponent(templateId)}/slide-thumb`,
  previewTemplate: (templateId: string) =>
    `${BASE}/api/templates/${encodeURIComponent(templateId)}/file`,
  slideUrl: (slidePath: string) =>
    `${BASE}/api/slides/${slidePath}`,
  listTemplatesForStage: (stageType: string) =>
    request(`/api/templates/for-stage/${encodeURIComponent(stageType)}`).then(d => d.templates),

  // Project files
  getProjectFiles: (projectId: string) =>
    request(`/api/projects/${projectId}/files`),

  // PPT
  generateOutline: (content: string, templateId?: string, providerId?: string, model?: string, columnId?: string, signal?: AbortSignal, temperature?: number, tempOutline?: number, tempKeyword?: number, tempResearch?: number, tempFill?: number, tempStageOutline?: number, tempStageGeneration?: number, tempStageReview?: number) =>
    request('/api/ppt/outline', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({content, template_id: templateId || '', provider_id: providerId || '', model: model || '', column_id: columnId || 'col4', temperature: temperature ?? 0.3, temp_outline: tempOutline || 0, temp_keyword: tempKeyword || 0, temp_research: tempResearch || 0, temp_fill: tempFill || 0, temp_stage_outline: tempStageOutline || 0, temp_stage_generation: tempStageGeneration || 0, temp_stage_review: tempStageReview || 0}), signal })
      .then(d => d as { outline_json: any[]; outline_text: string }),

  convertOutlineToJson: (text: string, originalJson: any[], providerId: string, model: string) =>
    request('/api/ppt/outline/convert', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({content: text, slide_plan: originalJson, provider_id: providerId, model: model}) })
      .then(d => d as { outline_json: any[] }),

  generatePPTPlan: (content: string, templateId?: string, providerId?: string, model?: string, columnId?: string, signal?: AbortSignal, temperature?: number, tempKeyword?: number, tempResearch?: number, tempOutline?: number, tempFill?: number, tempCards?: number, tempHtml?: number, tempStageOutline?: number, tempStageGeneration?: number, tempStageReview?: number) =>
    request('/api/ppt/plan', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({content, template_id: templateId || '', provider_id: providerId || '', model: model || '', column_id: columnId || 'col4', temperature: temperature ?? 0.3, temp_keyword: tempKeyword || 0, temp_research: tempResearch || 0, temp_outline: tempOutline || 0, temp_fill: tempFill || 0, temp_cards: tempCards || 0, temp_html: tempHtml || 0, temp_stage_outline: tempStageOutline || 0, temp_stage_generation: tempStageGeneration || 0, temp_stage_review: tempStageReview || 0}), signal }),

  generatePPT: (content: string, templateId?: string, branding?: Record<string, string>, projectId?: string, providerId?: string, model?: string, slidePlan?: any[], signal?: AbortSignal, columnId?: string, colorScheme?: string, temperature?: number, tempKeyword?: number, tempResearch?: number, tempOutline?: number, tempFill?: number, tempCards?: number, tempHtml?: number, tempSvgBatch?: number, tempSvgSingle?: number, tempReview?: number, tempFix?: number, tempHolistic?: number, tempHolisticFix?: number, tempStageOutline?: number, tempStageGeneration?: number, tempStageReview?: number) =>
    request('/api/ppt/generate', { method: 'POST', headers: {'Content-Type': 'application/json'}, timeoutMs: 600000, body: JSON.stringify({content, template_id: templateId || '', branding, project_id: projectId || null, provider_id: providerId || '', model: model || '', slide_plan: slidePlan || null, column_id: columnId || '', color_scheme: colorScheme || 'deep-blue', temperature: temperature ?? 0.3, temp_keyword: tempKeyword || 0, temp_research: tempResearch || 0, temp_outline: tempOutline || 0, temp_fill: tempFill || 0, temp_cards: tempCards || 0, temp_html: tempHtml || 0, temp_svg_batch: tempSvgBatch || 0, temp_svg_single: tempSvgSingle || 0, temp_review: tempReview || 0, temp_fix: tempFix || 0, temp_holistic: tempHolistic || 0, temp_holistic_fix: tempHolisticFix || 0, temp_stage_outline: tempStageOutline || 0, temp_stage_generation: tempStageGeneration || 0, temp_stage_review: tempStageReview || 0}), signal }),

  // PPT Styles (17 PPT-Agent YAML styles)
  listStyles: () => request('/api/ppt/styles').then(d => d.styles as StyleItem[]),

  // VI & Prompt file editor (directory-aware)
  getStyleVI: (styleId: string, colorScheme?: string) =>
    request(`/api/ppt/styles/${encodeURIComponent(styleId)}/vi` + (colorScheme ? `?color_scheme=${encodeURIComponent(colorScheme)}` : '')).then(d => d as { content: string; exists: boolean }),
  saveStyleVI: (styleId: string, content: string) =>
    request(`/api/ppt/styles/${encodeURIComponent(styleId)}/vi`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }),
  getStylePrompt: (styleId: string) =>
    request(`/api/ppt/styles/${encodeURIComponent(styleId)}/prompt`).then(d => d as { content: string; exists: boolean }),
  saveStylePrompt: (styleId: string, content: string) =>
    request(`/api/ppt/styles/${encodeURIComponent(styleId)}/prompt`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }),
  listColorSchemes: (styleId: string) =>
    request(`/api/ppt/styles/${encodeURIComponent(styleId)}/color-schemes`).then(d => d.color_schemes as {id: string; label: string; primary: string; accent: string; background: string; text: string; card_bg: string}[]),

  // VI sub-files (directory structure)
  listStyleVIFiles: (styleId: string) =>
    request(`/api/ppt/styles/${encodeURIComponent(styleId)}/vi/files`).then(d => d as { files: {name: string; size: number; section: string}[]; exists: boolean }),
  getStyleVISection: (styleId: string, section: string, colorScheme?: string) =>
    request(`/api/ppt/styles/${encodeURIComponent(styleId)}/vi/${encodeURIComponent(section)}` + (colorScheme ? `?color_scheme=${encodeURIComponent(colorScheme)}` : '')).then(d => d as { content: string; exists: boolean; section: string }),
  saveStyleVISection: (styleId: string, section: string, content: string) =>
    request(`/api/ppt/styles/${encodeURIComponent(styleId)}/vi/${encodeURIComponent(section)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }),
  // Page types (scanned from VI directory)
  getPageTypes: (styleId: string) =>
    request(`/api/ppt/styles/${encodeURIComponent(styleId)}/page-types`).then(d => d.page_types as {type: string; label: string; purpose: string}[]),

  // Scenario prompt files (per-column design rule overrides)
  listScenarioFiles: (columnId: string) =>
    request(`/api/scenarios/${encodeURIComponent(columnId)}/files`).then(d => d as {files: {name: string; size: number; source: string}[]; column_id: string}),
  getScenarioFile: (columnId: string, filename: string) =>
    request(`/api/scenarios/${encodeURIComponent(columnId)}/files/${encodeURIComponent(filename)}`).then(d => d as {content: string; exists: boolean; filename: string}),
  saveScenarioFile: (columnId: string, filename: string, content: string) =>
    request(`/api/scenarios/${encodeURIComponent(columnId)}/files/${encodeURIComponent(filename)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }),

  exportSvgZip: (runId: string) => `${BASE}/api/ppt/export-zip/${encodeURIComponent(runId)}`,

  // PPT Preview URL
  previewUrl: (runId: string) => `${BASE}/api/exports/${encodeURIComponent(runId)}/index.html`,

  // PPT Slide Recolor — direct color replacement (no AI)
  recolorSlide: (data: {
    run_id: string
    slide_seq: number
    style?: string
    color_scheme?: string
  }) =>
    request('/api/ppt/recolor-slide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(d => d as { ok: boolean; changed: boolean; message?: string }),

  // PPT Slide Editing (natural language → LLM edit → code check → save)
  editSlide: (data: {
    run_id: string
    slide_seq: number
    instruction: string
    provider_id?: string
    model?: string
    style?: string
    color_scheme?: string
    signal?: AbortSignal
  }) =>
    request('/api/ppt/edit-slide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: data.signal,
    }).then(d => d as { ok: boolean; slide_seq: number; html?: string; error?: string; detail?: string; violation?: string }),

  // Save slide images to project directory
  saveSlideImages: (runId: string) =>
    request(`/api/ppt/save-images/${encodeURIComponent(runId)}`, { method: 'POST' })
      .then(d => d as { ok: boolean; saved: number; files: string[]; dir: string; detail?: string }),

  // Commit edit preview to real index.html
  saveEdit: (runId: string) =>
    request(`/api/ppt/save-edit/${encodeURIComponent(runId)}`, { method: 'POST' })
      .then(d => d as { ok: boolean; saved: boolean }),

  // Discard edit preview
  discardEdit: (runId: string) =>
    request(`/api/ppt/discard-edit/${encodeURIComponent(runId)}`, { method: 'POST' })
      .then(d => d as { ok: boolean; discarded: boolean }),

  // Direct source edit — write full HTML document to preview
  editSlideSource: (runId: string, html: string) =>
    request(`/api/ppt/slide-source/${encodeURIComponent(runId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    }).then(d => d as { ok: boolean; saved: boolean }),

  // Load existing PPT results for a project (survives page reload / timeout)
  listPptResults: (projectId: string) =>
    request(`/api/projects/${encodeURIComponent(projectId)}/ppt-results`).then(d => d.results as any[]),

  // PPT generation progress polling
  getPptStatus: (projectId: string) =>
    request(`/api/projects/${encodeURIComponent(projectId)}/ppt-status`),

  // SOP Export
  exportSOP: (content: string, branding?: Record<string, string>, projectId?: string) =>
    request('/api/export/sop', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({content, branding, project_id: projectId || null}) }),

  // TTS
  ttsSynthesize: (text: string, model?: string, voiceId?: string, volume?: number, speed?: number, projectId?: string, providerId?: string) =>
    request('/api/tts/synthesize', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text, model: model || 'cosyvoice-v3-flash', voice_id: voiceId, volume: volume || 50, speed: speed || 1.0, project_id: projectId || null, provider_id: providerId || null}) }),

  // Logo upload
  uploadLogo: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/upload/logo', { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Upload failed')
    return data as { filename: string; url: string }
  },

  // File system
  openFolder: (path: string) =>
    request('/api/open-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) }),

  // Column Configs
  listColumnConfigs: () => request('/api/column-configs').then(d => d.configs),
  updateColumnConfig: (id: string, data: { prompt?: string; skill?: string; rules?: string }) =>
    request(`/api/column-configs/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  analyzeTemplate: (templateId: string, stageType: string = 'daoPpt', providerId: string = '', model: string = '') => {
    const params = new URLSearchParams({ stage_type: stageType })
    if (providerId) params.set('provider_id', providerId)
    if (model) params.set('model', model)
    return request(`/api/templates/${encodeURIComponent(templateId)}/analyze?${params.toString()}`, { method: 'POST' })
  },
  toggleTemplateEnabled: (templateId: string) =>
    request(`/api/templates/${encodeURIComponent(templateId)}/toggle-enabled`, { method: 'PUT' }).then(d => d as { ok: boolean; enabled: boolean }),
  uploadColumnTemplate: async (id: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/column-configs/${id}/upload-template`, { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Upload failed')
    return data as { ok: boolean; path: string; content?: string }
  },

  // Source Materials (multi-format input)
  listMaterials: (projectId: string) =>
    request(`/api/projects/${projectId}/materials`).then(d => d.materials || []),
  addMaterial: (projectId: string, data: { source_type: string; source_name?: string; raw_content?: string; processed_content?: string }) =>
    request(`/api/projects/${projectId}/materials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  uploadMaterial: async (projectId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/projects/${projectId}/materials/upload`, { method: 'POST', body: formData })
    if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed')
    return res.json()
  },
  deleteMaterial: (projectId: string, materialId: string) =>
    request(`/api/projects/${projectId}/materials/${materialId}`, { method: 'DELETE' }),
  updateMaterial: (projectId: string, materialId: string, data: Record<string, string>) =>
    request(`/api/projects/${projectId}/materials/${materialId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  // Project Items (dynamic output steps)
  listProjectItems: (projectId: string) =>
    request(`/api/projects/${projectId}/items`).then(d => d.items || []),
  createProjectItem: (projectId: string, data: Record<string, any>) =>
    request(`/api/projects/${projectId}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateProjectItem: (projectId: string, itemId: string, data: Record<string, any>) =>
    request(`/api/projects/${projectId}/items/${itemId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteProjectItem: (projectId: string, itemId: string) =>
    request(`/api/projects/${projectId}/items/${itemId}`, { method: 'DELETE' }),
  copyProjectItems: (projectId: string, sourceProjectId: string) =>
    request(`/api/projects/${projectId}/items/copy-from/${sourceProjectId}`, { method: 'POST' }),

  // Project Item Results
  listItemResults: (projectId: string, itemId: string) =>
    request(`/api/projects/${projectId}/items/${itemId}/results`).then(d => d.results || []),
  saveItemResult: (projectId: string, itemId: string, data: { content: string; content_type?: string; file_path?: string; quality_score?: number }) =>
    request(`/api/projects/${projectId}/items/${itemId}/results`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  // Project Copy (project itself is the template)
  copyProject: (projectId: string) =>
    request(`/api/projects/${projectId}/copy`, { method: 'POST' }),

  // Version
  getVersion: () => request('/api/version'),
  checkUpdate: () => request('/api/check-update'),
  downloadUpdate: (downloadUrl?: string) =>
    request('/api/download-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ download_url: downloadUrl || '' }),
    }),
}
