const BASE = ''

async function request(path: string, options?: RequestInit) {
  const res = await fetch(BASE + path, options)
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Request failed')
  return data
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
  name: string
  status: string
  source_type: string
  storage_path?: string
  is_locked?: number
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

  // LLM calls
  llmGenerate: (data: {
    provider_id: string; model: string; system_prompt: string;
    user_message: string; temperature?: number
  }) =>
    request('/api/llm/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
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
  listTemplatesForStage: (stageType: string) =>
    request(`/api/templates/for-stage/${encodeURIComponent(stageType)}`).then(d => d.templates),

  // PPT
  generatePPT: (content: string, templateId?: string, branding?: Record<string, string>, projectId?: string) =>
    request('/api/ppt/generate', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({content, template_id: templateId || '', branding, project_id: projectId || null}) }),

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
  uploadColumnTemplate: async (id: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/column-configs/${id}/upload-template`, { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Upload failed')
    return data as { ok: boolean; path: string; content?: string }
  },

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
