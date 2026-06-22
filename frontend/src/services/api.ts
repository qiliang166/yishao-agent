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

export interface Project {
  id: string
  name: string
  status: string
  source_type: string
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
  listProjects: () => request('/api/projects').then(d => d.projects as Project[]),
  getProject: (id: string) => request(`/api/projects/${id}`),
  createProject: (name: string) =>
    request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, source_type: 'text' }),
    }),
  updateProject: (id: string, data: {name?: string; status?: string}) =>
    request(`/api/projects/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  deleteProject: (id: string) => request(`/api/projects/${id}`, { method: 'DELETE' }),

  // Step results
  getSteps: (projectId: string) => request(`/api/projects/${projectId}/steps`).then(d => d.steps),
  saveStep: (projectId: string, stepName: string, content: string, contentType: string = 'markdown') =>
    request(`/api/projects/${projectId}/steps/${stepName}`, {
      method: 'PUT', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ step_name: stepName, content, content_type: contentType }),
    }),

  // Video
  downloadVideo: (url: string) => request('/api/video/download', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url}),
  }),
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
  createTemplate: (data: {name: string; type: string; file_path?: string; linked_skill_id?: string; branding_config?: string}) =>
    request('/api/templates', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  updateTemplate: (id: string, data: {name: string; type: string; file_path?: string; linked_skill_id?: string; branding_config?: string}) =>
    request(`/api/templates/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  deleteTemplate: (id: string) => request(`/api/templates/${id}`, { method: 'DELETE' }),
  setDefaultTemplate: (id: string) => request(`/api/templates/${id}/set-default`, { method: 'POST' }),

  // PPT
  generatePPT: (content: string, templateId?: string, branding?: Record<string, string>) =>
    request('/api/ppt/generate', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({content, template_id: templateId || '', branding}) }),

  // SOP Export
  exportSOP: (content: string, branding?: Record<string, string>) =>
    request('/api/export/sop', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({content, branding}) }),

  // TTS
  ttsSynthesize: (text: string, model?: string, voiceId?: string, volume?: number, speed?: number) =>
    request('/api/tts/synthesize', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text, model: model || 'cosyvoice-v3-flash', voice_id: voiceId, volume: volume || 50, speed: speed || 1.0}) }),
}
