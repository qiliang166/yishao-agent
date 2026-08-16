import { emitAuthEvent } from '../contexts/AuthContext'

const BASE = ''
const TOKEN_KEY = 'auth_token'

let _onLicenseRequired: (() => void) | null = null

export function setOnLicenseRequired(fn: (() => void) | null) {
  _onLicenseRequired = fn
}

let _onNoProvider: (() => void) | null = null

export function setOnNoProvider(fn: (() => void) | null) {
  _onNoProvider = fn
}

export function notifyNoProvider() {
  _onNoProvider?.()
}

function getAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('settings_token') || localStorage.getItem(TOKEN_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

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

    // Attach JWT token for all /api/ requests
    const headers: Record<string, string> = { ...getAuthHeaders() }
    if (fetchOpts.headers) {
      Object.assign(headers, fetchOpts.headers as Record<string, string>)
    }
    if (!headers['Content-Type'] && !(fetchOpts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }

    const res = await fetch(BASE + path, { ...fetchOpts, headers, signal: ctrl.signal })
    const data = await res.json()
    if (!res.ok) {
      if (res.status === 401 && data.detail && (data.detail.includes('权限已变更') || data.detail.includes('请重新登录'))) {
        emitAuthEvent('token_version_mismatch')
      }
      if (res.status === 403 && data.code === 'LICENSE_REQUIRED' && _onLicenseRequired) {
        _onLicenseRequired()
      }
      throw new Error(data.detail || `服务器错误 (${res.status})`)
    }
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

async function requestBlob(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<Blob> {
  const ctrl = new AbortController()
  const existingSignal = options?.signal
  if (existingSignal) {
    existingSignal.addEventListener('abort', () => ctrl.abort())
  }
  const timeoutMs = options?.timeoutMs ?? 30000
  let timer: any = null
  if (timeoutMs > 0) {
    timer = setTimeout(() => ctrl.abort(), timeoutMs)
  }
  try {
    const { timeoutMs: _, ...fetchOpts } = (options || {})
    const headers: Record<string, string> = { ...getAuthHeaders() }
    if (fetchOpts.headers) {
      Object.assign(headers, fetchOpts.headers as Record<string, string>)
    }
    const res = await fetch(BASE + path, { ...fetchOpts, headers, signal: ctrl.signal })
    if (!res.ok) {
      const text = await res.text()
      let msg = text
      try { msg = JSON.parse(text).detail || msg } catch {}
      throw new Error(msg || `服务器错误 (${res.status})`)
    }
    return await res.blob()
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
  volume?: number
  speed?: number
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
  point_cost_deci?: number
  is_downloadable?: number
  preview_requires_unlock?: number
  copied_from_project_id?: string
  workspace_id?: string
  category_id?: string
  author_id?: string
  category_name?: string
  author_name?: string
  created_by?: string
  created_by_name?: string
  created_at: string
  updated_at: string
}

export interface Workspace {
  id: string
  name: string
  status: string
  description: string
  logo: string
  created_by?: string
  created_at: string
  updated_at: string
  role_ids?: string[]
  project_count?: number
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
  // Workspaces
  listWorkspaces: (page?: number, pageSize?: number, opts?: { mine?: boolean }) => {
    const params = new URLSearchParams()
    if (page) params.set('page', String(page))
    if (pageSize) params.set('page_size', String(pageSize))
    if (opts?.mine) params.set('mine', '1')
    const qs = params.toString()
    return request(`/api/workspaces${qs ? '?' + qs : ''}`).then(d => d as { workspaces: Workspace[]; total: number; page: number; page_size: number })
  },
  getWorkspace: (id: string) => request(`/api/workspaces/${id}`) as Promise<Workspace>,
  createWorkspace: (name: string, description?: string, logo?: string, status?: string, roleIds?: string[], sourceWorkspaceId?: string) =>
    request('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description || '', logo: logo || '', status: status || 'draft', role_ids: roleIds, source_workspace_id: sourceWorkspaceId || undefined }),
    }) as Promise<Workspace>,
  updateWorkspace: (id: string, data: {name?: string; status?: string; description?: string; logo?: string; role_ids?: string[]}) =>
    request(`/api/workspaces/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  deleteWorkspace: (id: string) => request(`/api/workspaces/${id}`, { method: 'DELETE' }),
  exportWorkspaceConfigs: (wid: string) =>
    request(`/api/workspaces/${encodeURIComponent(wid)}/export-configs`).then(d => d as { workspace_id: string; exported_at: string; configs: Record<string, any[]> }),
  importWorkspaceConfigs: (wid: string, data: { configs: Record<string, any[]> }) =>
    request(`/api/workspaces/${encodeURIComponent(wid)}/import-configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(d => d as { ok: boolean; applied: Record<string, number> }),
  exportWorkspaceFull: (wid: string, projectIds?: string[]) => {
    const params = projectIds && projectIds.length > 0
      ? `?project_ids=${encodeURIComponent(projectIds.join(','))}`
      : ''
    return fetch(`${BASE}/api/workspaces/${encodeURIComponent(wid)}/export${params}`, { headers: getAuthHeaders() })
      .then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ detail: '导出失败' }))
          throw new Error((err as any).detail || '导出失败')
        }
        return r.blob()
      })
  },
  importWorkspaceFull: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return request('/api/workspaces/import', { method: 'POST', body: fd, timeoutMs: 120_000 })
      .then(d => d as { ok: boolean; workspace_id: string; applied: Record<string, number> })
  },

  // Projects
  listProjects: (page?: number, pageSize?: number, workspaceId?: string) => {
    const params = new URLSearchParams()
    if (page) params.set('page', String(page))
    if (pageSize) params.set('page_size', String(pageSize))
    if (workspaceId) params.set('workspace_id', workspaceId)
    const qs = params.toString()
    return request(`/api/projects${qs ? '?' + qs : ''}`).then(d => d as { projects: Project[]; total: number; page: number; page_size: number })
  },
  getProject: (id: string) => request(`/api/projects/${id}`),
  listProjectVideos: (id: string) => request(`/api/projects/${id}/videos`),
  createProject: (name: string, workspaceId: string, opts?: { point_cost_deci?: number; is_downloadable?: number; preview_requires_unlock?: number; category_id?: string; author_id?: string }) =>
    request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, workspace_id: workspaceId, source_type: 'text', ...opts }),
    }),
  updateProject: (id: string, data: {name?: string; status?: string; storage_path?: string; is_locked?: number; point_cost_deci?: number; is_downloadable?: number; preview_requires_unlock?: number; category_id?: string; author_id?: string}) =>
    request(`/api/projects/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  deleteProject: (id: string) => request(`/api/projects/${id}`, { method: 'DELETE' }),

  // Project categories (per-workspace)
  listCategories: (workspaceId: string) =>
    request(`/api/workspaces/${workspaceId}/categories`).then(d => d as { categories: { id: string; name: string; sort_order: number }[] }),
  createCategory: (workspaceId: string, name: string) =>
    request(`/api/workspaces/${workspaceId}/categories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }),
  updateCategory: (workspaceId: string, categoryId: string, name: string) =>
    request(`/api/workspaces/${workspaceId}/categories/${categoryId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }),
  deleteCategory: (workspaceId: string, categoryId: string) =>
    request(`/api/workspaces/${workspaceId}/categories/${categoryId}`, { method: 'DELETE' }),

  // Authors (global attribution)
  listAuthors: () =>
    request('/api/authors').then(d => d as { authors: { id: string; name: string; intro: string; license_text: string; created_at: string }[] }),
  listAuthorOptions: () =>
    request('/api/authors/options').then(d => d as { authors: { id: string; name: string }[] }),
  getAuthorPublic: (authorId: string) =>
    request(`/api/authors/${authorId}/public`).then(d => d as { id: string; name: string; intro: string; license_text: string }),
  createAuthor: (data: { name: string; intro?: string; license_text?: string }) =>
    request('/api/authors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateAuthor: (authorId: string, data: { name?: string; intro?: string; license_text?: string }) =>
    request(`/api/authors/${authorId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteAuthor: (authorId: string) =>
    request(`/api/authors/${authorId}`, { method: 'DELETE' }),
  // Signed author / contract
  getAuthorProfile: (authorId: string) =>
    request(`/api/authors/${authorId}/profile`).then(d => d as { id: string; name: string; intro: string; license_text: string; photo_url: string; contract_status: string }),
  getAuthorWorks: (authorId: string) =>
    request(`/api/authors/${authorId}/works`).then(d => d as { works: { id: string; name: string; point_cost_deci: number; download_count: number; storage_path: string }[] }),
  updateAuthorPhoto: (authorId: string, photo_url: string) =>
    request(`/api/authors/${authorId}/photo`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo_url }) }),
  // Member author self-service
  applyAuthor: (data: { name: string; intro?: string; photo_url?: string; note?: string }) =>
    request('/api/member/apply-author', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  myAuthorStatus: () =>
    request('/api/member/my-author-status'),
  myAuthorRevenue: (page?: number, pageSize?: number) =>
    request(`/api/member/my-author-revenue?page=${page || 1}&page_size=${pageSize || 50}`),
  myAuthorPayouts: () =>
    request('/api/member/my-author-payouts'),
  uploadRecipeFile: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const token = localStorage.getItem('auth_token') || ''
    const res = await fetch('/api/member/upload-recipe-file', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || '上传失败')
    }
    return res.json() as Promise<{ ok: boolean; url: string; filename: string; size: number }>
  },
  submitRecipe: (data: { name: string; description?: string; cover_url?: string; files_json?: string; point_cost_deci?: number }) =>
    request('/api/member/submit-recipe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  mySubmissions: () =>
    request('/api/member/my-submissions'),
  // Admin: author contract
  adminAuthorsPending: () =>
    request('/api/admin/authors/pending').then(d => d as { authors: any[] }),
  adminApproveAuthor: (authorId: string, data: { revenue_share?: number; cash_share?: number; points_per_yuan?: number; contract_note?: string }) =>
    request(`/api/admin/authors/${authorId}/approve`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  adminRejectAuthor: (authorId: string, note?: string) =>
    request(`/api/admin/authors/${authorId}/reject`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) }),
  adminUpdateContract: (authorId: string, data: { revenue_share?: number; cash_share?: number; points_per_yuan?: number; contract_status?: string; contract_note?: string }) =>
    request(`/api/admin/authors/${authorId}/contract`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  // Admin: revenue & payouts
  adminAuthorRevenue: (authorId: string, settled?: number) =>
    request(`/api/admin/authors/${authorId}/revenue?settled=${settled ?? 0}`),
  adminCreatePayout: (authorId: string, data: { period_start: string; period_end: string; note?: string }) =>
    request(`/api/admin/authors/${authorId}/payout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  adminPayouts: (authorId?: string) =>
    request(`/api/admin/authors/payouts${authorId ? `?author_id=${authorId}` : ''}`),
  adminRevenueStats: () =>
    request('/api/admin/stats/revenue'),
  // Admin: recipe submissions
  adminSubmissions: (status?: string) =>
    request(`/api/admin/submissions?status=${status || 'all'}`).then(d => d as { submissions: any[] }),
  adminSubmissionsPending: () =>
    request('/api/admin/submissions/pending').then(d => d as { submissions: any[] }),
  adminApproveSubmission: (submissionId: string, data: { point_cost_deci?: number; category_id?: string }) =>
    request(`/api/admin/submissions/${submissionId}/approve`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  adminRejectSubmission: (submissionId: string, review_note: string) =>
    request(`/api/admin/submissions/${submissionId}/reject`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ review_note }) }),
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
  saveFileToProject: (projectId: string, filename: string, content: string, encoding?: string, subdir?: string, targetDir?: string) =>
    request(`/api/projects/${projectId}/save-file`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ filename, content, ...(encoding ? { encoding } : {}), ...(subdir ? { subdir } : {}), ...(targetDir ? { target_dir: targetDir } : {}) }),
    }),
  listProjectDirs: (projectId: string, subdir?: string) =>
    request(`/api/projects/${projectId}/directories${subdir ? `?subdir=${encodeURIComponent(subdir)}` : ''}`),
  backfillProjectFiles: () =>
    request('/api/backfill-project-files', { method: 'POST' }),

  // Filesystem browser (unscoped, for save dialog)
  listFsDirs: (path?: string) =>
    request(`/api/fs/dirs${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  createFsDir: (parent: string, name: string) =>
    request('/api/fs/mkdir', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ parent, name }),
    }),

  // Video
  downloadVideo: (url: string, cookiesPath?: string, projectId?: string, asrModel?: string, asrProviderId?: string) => request('/api/video/download', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url, cookies_path: cookiesPath || null, project_id: projectId || null, asr_model: asrModel || 'fun-asr', asr_provider_id: asrProviderId || null}),
  }),
  uploadVideo: async (file: File, projectId?: string, asrModel?: string, asrProviderId?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (projectId) formData.append('project_id', projectId)
    if (asrModel) formData.append('asr_model', asrModel)
    if (asrProviderId) formData.append('asr_provider_id', asrProviderId)
    const res = await fetch('/api/video/upload', { method: 'POST', body: formData, headers: getAuthHeaders() })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Upload failed')
    return data as { task_id: string }
  },
  uploadCookies: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/video/upload-cookies', { method: 'POST', body: formData, headers: getAuthHeaders() })
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
  updateVoice: (id: string, data: { name?: string; provider_id?: string; voice_id?: string; description?: string; is_default?: number; volume?: number; speed?: number }) =>
    request(`/api/voices/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  deleteVoice: (id: string) => request(`/api/voices/${id}`, { method: 'DELETE' }),
  previewVoice: (id: string) => request(`/api/voices/${id}/preview`, { method: 'POST', timeoutMs: 120000 }),
  cloneVoice: (name: string, model: string, audioFile: File, providerId?: string) => {
    const fd = new FormData()
    fd.append('name', name)
    fd.append('model', model)
    fd.append('audio', audioFile)
    if (providerId) fd.append('provider_id', providerId)
    return request('/api/voices/clone', { method: 'POST', body: fd })
  },
  designVoice: (name: string, model: string, voicePrompt: string, previewText: string, providerId?: string) =>
    request(`/api/voices/design${providerId ? `?provider_id=${encodeURIComponent(providerId)}` : ''}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ name, model, voice_prompt: voicePrompt, preview_text: previewText }),
    }),
  listClonedVoices: (providerId?: string) =>
    request(`/api/voices/clones${providerId ? `?provider_id=${encodeURIComponent(providerId)}` : ''}`).then(d => d.clones),
  deleteClonedVoice: (voiceId: string) => request(`/api/voices/clone/${voiceId}`, { method: 'DELETE' }),

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
  getImageProvider: (id: string) => request(`/api/image/providers/${id}`).then(d => d as ImageProvider),
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
      timeoutMs: 0,
    }),
  // LLM streaming generate (SSE)
  llmGenerateStream: async function* (data: {
    provider_id: string; model: string; system_prompt: string;
    user_message: string; temperature?: number; signal?: AbortSignal
  }): AsyncGenerator<string, void, unknown> {
    const res = await fetch('/api/llm/generate-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
      signal: data.signal,
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

  // Site config (from activation server)
  getSiteConfig: () => request('/api/site-config').then(d => d as {
    pricing_html: string; announce_html: string; announce_enabled: string; purchase_enabled: string;
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
  listTemplatesForStage: (stageType: string) =>
    request(`/api/templates/for-stage/${encodeURIComponent(stageType)}`).then(d => d.templates),

  // Project files
  getProjectFiles: (projectId: string) =>
    request(`/api/projects/${projectId}/files`),
  deleteProjectFile: (projectId: string, filename: string) =>
    request(`/api/projects/${projectId}/files/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
  downloadFile: (projectId: string, filename: string) => {
    window.open(`${BASE}/api/download/${encodeURIComponent(filename)}?project_id=${encodeURIComponent(projectId)}`, '_blank')
  },
  /** Download a file via direct <a> tag — browser handles streaming natively, no memory pressure for large files. */
  downloadWithName: async (url: string, filename: string) => {
    const token = localStorage.getItem('auth_token')
    const fullUrl = url.startsWith('http') ? url : `${BASE}${url}`
    const separator = fullUrl.includes('?') ? '&' : '?'
    const finalUrl = token ? `${fullUrl}${separator}token=${encodeURIComponent(token)}` : fullUrl
    const a = document.createElement('a')
    a.href = finalUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  },
  downloadAllFiles: (projectId: string) => {
    window.open(`${BASE}/api/projects/${projectId}/download-all`, '_blank')
  },
  downloadSelectedFiles: async (projectId: string, files: {filename:string, download_url?:string, display_name?:string}[]) => {
    const token = localStorage.getItem('auth_token')
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
    const res = await fetch(`${BASE}/api/projects/${projectId}/download-selected`, {
      method: 'POST', headers,
      body: JSON.stringify({ files }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    // Extract filename from Content-Disposition header (RFC 5987)
    let filename = 'download.zip'
    const cd = res.headers.get('Content-Disposition')
    if (cd) {
      const match = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="?([^";]+)"?/)
      if (match) filename = decodeURIComponent(match[1])
    }
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = objUrl; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(objUrl)
  },
  /** 跨项目批量下载：勾选文件打进一个 zip，按项目名分文件夹（会员下载页用） */
  downloadBatch: async (projects: { project_id: string; files: { filename: string; download_url?: string; display_name?: string }[] }[]) => {
    const token = localStorage.getItem('auth_token')
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
    const res = await fetch(`${BASE}/api/member/download-batch`, {
      method: 'POST', headers,
      body: JSON.stringify({ projects }),
    })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const err = await res.json()
        if (err?.detail) msg = err.detail
      } catch { /* 非 JSON 错误体，保留 HTTP 状态码 */ }
      throw new Error(msg)
    }
    let filename = 'download.zip'
    const cd = res.headers.get('Content-Disposition')
    if (cd) {
      const match = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="?([^";]+)"?/)
      if (match) filename = decodeURIComponent(match[1])
    }
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = objUrl; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(objUrl)
  },
  /** 会员下载页预览地址：统一走后端端点，均带 project_id 以统计阅读次数 */
  previewFileUrl: (projectId: string, file: { filename: string; download_url?: string }) => {
    const token = localStorage.getItem('auth_token')
    const pid = `project_id=${encodeURIComponent(projectId)}`
    const tok = token ? `&token=${encodeURIComponent(token)}` : ''
    if (file.download_url && file.download_url.startsWith('/api/exports/')) {
      const sep = file.download_url.includes('?') ? '&' : '?'
      return `${BASE}${file.download_url}${sep}${pid}${tok}`
    }
    const q = `${pid}&filename=${encodeURIComponent(file.filename)}`
    return `${BASE}/api/member/preview-file?${q}${tok}`
  },
  /** 预览文本内容：统一走后端端点，均带 project_id 以统计阅读次数 */
  previewFileText: async (projectId: string, file: { filename: string; download_url?: string }) => {
    const pid = `project_id=${encodeURIComponent(projectId)}`
    const token = localStorage.getItem('auth_token')
    const tok = token ? `&token=${encodeURIComponent(token)}` : ''
    if (file.download_url && file.download_url.startsWith('/api/exports/')) {
      const sep = file.download_url.includes('?') ? '&' : '?'
      const res = await fetch(`${BASE}${file.download_url}${sep}${pid}${tok}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.text()
    }
    const q = `project_id=${encodeURIComponent(projectId)}&filename=${encodeURIComponent(file.filename)}`
    const res = await fetch(`${BASE}/api/member/preview-file?${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.text()
  },

  // PPT
  generateOutline: (content: string, templateId?: string, providerId?: string, model?: string, columnId?: string, signal?: AbortSignal, temperature?: number, tempOutline?: number, tempKeyword?: number, tempResearch?: number, tempFill?: number, tempStageOutline?: number, tempStageGeneration?: number, tempStageReview?: number, projectId?: string) =>
    request('/api/ppt/outline', { method: 'POST', headers: {'Content-Type': 'application/json'}, timeoutMs: 1200000, body: JSON.stringify({content, template_id: templateId || '', provider_id: providerId || '', model: model || '', column_id: columnId || 'col4', project_id: projectId || null, temperature: temperature ?? 0.3, temp_outline: tempOutline || 0, temp_keyword: tempKeyword || 0, temp_research: tempResearch || 0, temp_fill: tempFill || 0, temp_stage_outline: tempStageOutline || 0, temp_stage_generation: tempStageGeneration || 0, temp_stage_review: tempStageReview || 0}), signal })
      .then(d => d as { outline_json: any[]; outline_text: string }),

  convertOutlineToJson: (text: string, originalJson: any[], providerId: string, model: string) =>
    request('/api/ppt/outline/convert', { method: 'POST', headers: {'Content-Type': 'application/json'}, timeoutMs: 120000, body: JSON.stringify({content: text, slide_plan: originalJson, provider_id: providerId, model: model}) })
      .then(d => d as { outline_json: any[] }),

  generatePPTPlan: (content: string, templateId?: string, providerId?: string, model?: string, columnId?: string, signal?: AbortSignal, temperature?: number, tempKeyword?: number, tempResearch?: number, tempOutline?: number, tempFill?: number, tempCards?: number, tempHtml?: number, tempStageOutline?: number, tempStageGeneration?: number, tempStageReview?: number) =>
    request('/api/ppt/plan', { method: 'POST', headers: {'Content-Type': 'application/json'}, timeoutMs: 1200000, body: JSON.stringify({content, template_id: templateId || '', provider_id: providerId || '', model: model || '', column_id: columnId || 'col4', temperature: temperature ?? 0.3, temp_keyword: tempKeyword || 0, temp_research: tempResearch || 0, temp_outline: tempOutline || 0, temp_fill: tempFill || 0, temp_cards: tempCards || 0, temp_html: tempHtml || 0, temp_stage_outline: tempStageOutline || 0, temp_stage_generation: tempStageGeneration || 0, temp_stage_review: tempStageReview || 0}), signal }),

  generatePPT: (content: string, templateId?: string, branding?: Record<string, string>, projectId?: string, providerId?: string, model?: string, slidePlan?: any[], signal?: AbortSignal, columnId?: string, colorScheme?: string, temperature?: number, tempKeyword?: number, tempResearch?: number, tempOutline?: number, tempFill?: number, tempCards?: number, tempHtml?: number, tempSvgBatch?: number, tempSvgSingle?: number, tempReview?: number, tempFix?: number, tempHolistic?: number, tempHolisticFix?: number, tempStageOutline?: number, tempStageGeneration?: number, tempStageReview?: number, forceRegenerate?: boolean) =>
    request('/api/ppt/generate', { method: 'POST', headers: {'Content-Type': 'application/json'}, timeoutMs: 1200000, body: JSON.stringify({content, template_id: templateId || '', branding, project_id: projectId || null, provider_id: providerId || '', model: model || '', slide_plan: slidePlan || null, column_id: columnId || '', color_scheme: colorScheme || 'deep-blue', temperature: temperature ?? 0.3, temp_keyword: tempKeyword || 0, temp_research: tempResearch || 0, temp_outline: tempOutline || 0, temp_fill: tempFill || 0, temp_cards: tempCards || 0, temp_html: tempHtml || 0, temp_svg_batch: tempSvgBatch || 0, temp_svg_single: tempSvgSingle || 0, temp_review: tempReview || 0, temp_fix: tempFix || 0, temp_holistic: tempHolistic || 0, temp_holistic_fix: tempHolisticFix || 0, temp_stage_outline: tempStageOutline || 0, temp_stage_generation: tempStageGeneration || 0, temp_stage_review: tempStageReview || 0, force_regenerate: forceRegenerate || false}), signal }),

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

  // Workspace-level scenario file overrides (separate path: /api/scenarios/{wsId}/{colId}/{filename})
  getWorkspaceScenarioFile: (wsId: string, colId: string, filename: string) =>
    request(`/api/ws-scenarios/${encodeURIComponent(wsId)}/${encodeURIComponent(colId)}/${encodeURIComponent(filename)}`)
      .then(d => d as { content: string; source: 'workspace' | 'shared' }),
  saveWorkspaceScenarioFile: (wsId: string, colId: string, filename: string, content: string) =>
    request(`/api/ws-scenarios/${encodeURIComponent(wsId)}/${encodeURIComponent(colId)}/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }).then(d => d as { ok: boolean }),
  deleteWorkspaceScenarioFile: (wsId: string, colId: string, filename: string) =>
    request(`/api/ws-scenarios/${encodeURIComponent(wsId)}/${encodeURIComponent(colId)}/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }).then(d => d as { ok: boolean; deleted: boolean }),

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
    timeoutMs?: number
  }) => {
    const { signal, timeoutMs, ...body } = data
    return request('/api/ppt/edit-slide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
      timeoutMs,
    }).then(d => d as { ok: boolean; slide_seq: number; html?: string; error?: string; detail?: string; violation?: string })
  },

  // Save slide images to project directory
  saveSlideImages: (runId: string) =>
    request(`/api/ppt/save-images/${encodeURIComponent(runId)}`, { method: 'POST' })
      .then(d => d as { ok: boolean; saved: number; files: string[]; dir: string; detail?: string }),

  // Download slide images as zip (returns blob for browser download)
  downloadSlideImages: async (runId: string): Promise<Blob> => {
    const token = localStorage.getItem('auth_token')
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
    const resp = await fetch(`/api/ppt/save-images/${encodeURIComponent(runId)}?download=true`, { method: 'POST', headers })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return resp.blob()
  },

  // No-op placeholder (edits now write directly to index.html)
  saveEdit: (runId: string) =>
    request(`/api/ppt/save-edit/${encodeURIComponent(runId)}`, { method: 'POST' })
      .then(d => d as { ok: boolean; saved: boolean }),

  // Restore index.html from index_backup.html
  restoreFromBackup: (runId: string) =>
    request(`/api/ppt/discard-edit/${encodeURIComponent(runId)}`, { method: 'POST' })
      .then(d => d as { ok: boolean; restored: boolean }),

  // Direct source edit — write full HTML document to preview
  editSlideSource: (runId: string, html: string) =>
    request(`/api/ppt/slide-source/${encodeURIComponent(runId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    }).then(d => d as { ok: boolean; saved: boolean }),

  // Regenerate selected slides through the standard HTML pipeline.
  // Writes to index_regenerated.html (never overwrites index.html).
  regenerateSlide: (data: {
    run_id: string
    slide_seqs: number[]
    provider_id?: string
    model?: string
    column_id?: string
  }) =>
    request('/api/ppt/regenerate-slide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      timeoutMs: 300000,
    }).then(d => d as { ok: boolean; slide_seqs: number[]; preview_url: string; partial_url: string; slides: {seq:number;html:string}[]; html: string }),

  // Splice regenerated slides into existing draft (targeted replacement)
  spliceSlides: (runId: string, slides: {seq:number;html:string}[]) =>
    request(`/api/ppt/splice-slides/${encodeURIComponent(runId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides }),
    }).then(d => d as { ok: boolean; replaced: number; total: number }),

  // Poll regenerate progress log
  getRegenerateLog: (runId: string) =>
    request(`/api/ppt/regenerate-log/${encodeURIComponent(runId)}`).then(d => d as { log: string; done: boolean }),

  // Persist/restore regenerate-tab state (survives modal close/reopen)
  getRegenerateState: (runId: string) =>
    request(`/api/ppt/regenerate-state/${encodeURIComponent(runId)}`).then(d => d as { state: { page_input?: string; new_page_url?: string; new_page_partial_url?: string; regenerated_slides?: {seq:number;html:string}[] } | null }),
  saveRegenerateState: (runId: string, state: { page_input?: string; new_page_url?: string; new_page_partial_url?: string; regenerated_slides?: {seq:number;html:string}[] }) =>
    request(`/api/ppt/regenerate-state/${encodeURIComponent(runId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) }).then(d => d as { ok: boolean }),
  clearRegenerateState: (runId: string) =>
    request(`/api/ppt/regenerate-state/${encodeURIComponent(runId)}`, { method: 'DELETE' }).then(d => d as { ok: boolean }),

  // Load existing PPT results for a project (survives page reload / timeout)
  listPptResults: (projectId: string) =>
    request(`/api/projects/${encodeURIComponent(projectId)}/ppt-results`).then(d => d.results as any[]),

  // PPT generation progress polling
  getPptStatus: (projectId: string) =>
    request(`/api/projects/${encodeURIComponent(projectId)}/ppt-status`),

  getPptLog: (projectId: string) =>
    request(`/api/projects/${encodeURIComponent(projectId)}/ppt-log`).then(d => (d as any).logs || []),

  // SOP Export
  exportSOP: (content: string, branding?: Record<string, string>, projectId?: string) =>
    request('/api/export/sop', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({content, branding, project_id: projectId || null}) }),

  // TTS
  ttsSplit: (text: string, maxChunk?: number, mode?: string) =>
    request('/api/tts/split', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text, max_chunk: maxChunk || 290, mode: mode || 'chars'}) }),
  ttsSynthesize: (text: string, model?: string, voiceId?: string, volume?: number, speed?: number, projectId?: string, providerId?: string, voiceName?: string, sourceName?: string) =>
    request('/api/tts/synthesize', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text, model: model || 'cosyvoice-v3-flash', voice_id: voiceId, volume: volume || 50, speed: speed || 1.0, project_id: projectId || null, provider_id: providerId || null, voice_name: voiceName || null, source_name: sourceName || null}), timeoutMs: 120000 }),

  // TTS History
  listTtsHistory: (projectId: string) =>
    request(`/api/projects/${projectId}/tts-history`),
  updateTtsHistory: (id: number, name: string) =>
    request(`/api/tts-history/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name}) }),
  deleteTtsHistory: (id: number) =>
    request(`/api/tts-history/${id}`, { method: 'DELETE' }),

  // Logo upload
  uploadLogo: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/upload/logo', { method: 'POST', body: formData, headers: getAuthHeaders() })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Upload failed')
    return data as { filename: string; url: string }
  },

  // File system
  openFolder: (path: string) =>
    request('/api/open-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) }),

  // Column Configs
  listColumnConfigs: (workspaceId?: string) => {
    const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ''
    return request(`/api/column-configs${qs}`).then(d => d.configs)
  },
  updateColumnConfig: (id: string, data: { prompt?: string; skill?: string; rules?: string }) =>
    request(`/api/column-configs/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  // Speech Configs (independent table)
  listSpeechConfigs: (workspaceId?: string) => {
    const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ''
    return request(`/api/speech-configs${qs}`).then(d => d.configs)
  },
  updateSpeechConfig: (id: string, data: { prompt?: string; skill?: string }) =>
    request(`/api/speech-configs/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  // TTS Configs (voice synthesis, independent from speech_configs)
  listTtsConfigs: (workspaceId?: string) => {
    const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ''
    return request(`/api/tts-configs${qs}`).then(d => d.configs)
  },
  updateTtsConfig: (id: string, data: { prompt?: string; skill?: string }) =>
    request(`/api/tts-configs/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  // Core Prompt Configs (factory seed docs for 33 PPT generation prompts)
  listCorePromptConfigs: (workspaceId?: string) => {
    const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ''
    return request(`/api/core-prompt-configs${qs}`).then(d => d.configs)
  },
  updateCorePromptConfig: (id: string, data: { content?: string; label?: string; stage?: string }) =>
    request(`/api/core-prompt-configs/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }),
  copySeedConfigs: (workspaceId: string) =>
    request(`/api/workspaces/${workspaceId}/copy-seed-configs`, { method: 'POST' }),
  toggleTemplateEnabled: (templateId: string) =>
    request(`/api/templates/${encodeURIComponent(templateId)}/toggle-enabled`, { method: 'PUT' }).then(d => d as { ok: boolean; enabled: boolean }),

  // Template CRUD
  createTemplate: (data: { name: string; style_id: string; group: string }) =>
    request('/api/templates', { method: 'POST', body: JSON.stringify(data) }).then(d => d as { ok: boolean; template: any }),

  updateTemplate: (templateId: string, data: { name?: string; group?: string }) =>
    request(`/api/templates/${encodeURIComponent(templateId)}`, { method: 'PUT', body: JSON.stringify(data) }).then(d => d as { ok: boolean; template: any }),

  deleteTemplate: (templateId: string) =>
    request(`/api/templates/${encodeURIComponent(templateId)}`, { method: 'DELETE' }).then(d => d as { ok: boolean }),

  exportTemplate: async (templateId: string) => {
    const blob = await requestBlob(`/api/templates/${encodeURIComponent(templateId)}/export`)
    const disposition = (blob as any).name || `template-${templateId}.zip`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = disposition
    a.click()
    URL.revokeObjectURL(url)
  },

  importTemplate: (file: File, overwrite?: boolean, newStyleId?: string) => {
    const fd = new FormData()
    fd.append('file', file)
    let url = '/api/templates/import'
    const params = new URLSearchParams()
    if (overwrite) params.append('overwrite', 'true')
    if (newStyleId) params.append('style_id', newStyleId)
    if (params.toString()) url += '?' + params.toString()
    return request(url, { method: 'POST', body: fd }).then(d => d as { ok: boolean; template: any })
  },

  // Source Materials (multi-format input)
  listMaterials: (projectId: string) =>
    request(`/api/projects/${projectId}/materials`).then(d => d.materials || []),
  addMaterial: (projectId: string, data: { source_type: string; source_name?: string; raw_content?: string; processed_content?: string }) =>
    request(`/api/projects/${projectId}/materials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  uploadMaterial: async (projectId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/projects/${projectId}/materials/upload`, { method: 'POST', body: formData, headers: getAuthHeaders() })
    if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed')
    return res.json()
  },
  deleteMaterial: (projectId: string, materialId: string) =>
    request(`/api/projects/${projectId}/materials/${materialId}`, { method: 'DELETE' }),
  updateMaterial: (projectId: string, materialId: string, data: Record<string, string>) =>
    request(`/api/projects/${projectId}/materials/${materialId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  // Project Items (dynamic output steps)
  listProjectItems: (projectId: string, outputMode?: string) => {
    const qs = outputMode ? `?output_mode=${encodeURIComponent(outputMode)}` : ''
    return request(`/api/projects/${projectId}/items${qs}`).then(d => d.items || [])
  },
  createProjectItem: (projectId: string, data: Record<string, any>) =>
    request(`/api/projects/${projectId}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateProjectItem: (projectId: string, itemId: string, data: Record<string, any>) =>
    request(`/api/projects/${projectId}/items/${itemId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteProjectItem: (projectId: string, itemId: string) =>
    request(`/api/projects/${projectId}/items/${itemId}`, { method: 'DELETE' }),
  copyProjectItems: (projectId: string, sourceProjectId: string) =>
    request(`/api/projects/${projectId}/items/copy-from/${sourceProjectId}`, { method: 'POST' }),
  initProjectItemsFromFactory: (projectId: string) =>
    request(`/api/projects/${projectId}/items/init-from-factory`, { method: 'POST' }),

  // Project Item Results
  listItemResults: (projectId: string, itemId: string) =>
    request(`/api/projects/${projectId}/items/${itemId}/results`).then(d => d.results || []),
  saveItemResult: (projectId: string, itemId: string, data: { content: string; content_type?: string; file_path?: string; quality_score?: number }) =>
    request(`/api/projects/${projectId}/items/${itemId}/results`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  // Project Copy (project itself is the template)
  copyProject: (projectId: string) =>
    request(`/api/projects/${projectId}/copy`, { method: 'POST' }),

  // Batch Import / Execute
  downloadBatchTemplate: async () => {
    const headers = getAuthHeaders()
    const res = await fetch(`${BASE}/api/batch/template`, { headers })
    if (!res.ok) throw new Error('下载模板失败')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'batch_import_template.xlsx'; a.click()
    URL.revokeObjectURL(url)
  },
  previewBatchImport: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return request('/api/batch/preview-import', { method: 'POST', body: fd })
  },
  batchImport: (rows: Record<string, any>[], workspaceId?: string) =>
    request('/api/batch/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows, workspace_id: workspaceId || '' }) }),
  batchProjectsStatus: (workspaceId?: string) => {
    const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ''
    return request(`/api/batch/projects-status${qs}`).then(d => d.projects || [])
  },
  batchExecute: (projectSteps: Record<string, any>, startTime: string, endTime: string, workspaceId?: string, templateIds?: Record<string, string>) =>
    request('/api/batch/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_steps: projectSteps, start_time: startTime, end_time: endTime, workspace_id: workspaceId || '', template_ids: templateIds || {} }) }),
  batchStatus: (batchId: string) =>
    request(`/api/batch/status/${batchId}`),
  batchCancel: (batchId: string) =>
    request(`/api/batch/cancel/${batchId}`, { method: 'POST' }),
  projectBatchStatus: (projectId: string) =>
    request(`/api/batch/project-batch/${projectId}`),
  batchActive: (workspaceId?: string) =>
    request(`/api/batch/active${workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ''}`).then(d => d.batches),

  // Downloads
  getDownloadInfo: () => request('/api/download/info'),

  // Version
  getVersion: () => request('/api/version'),
  checkUpdate: () => request('/api/check-update'),
  downloadUpdate: (downloadUrl?: string) =>
    request('/api/download-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ download_url: downloadUrl || '' }),
    }),

  // License
  activateLicense: (key: string) =>
    request('/api/license/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    }),
  getLicenseStatus: () =>
    request('/api/license/status'),
  deactivateLicense: () =>
    request('/api/license/deactivate', { method: 'POST' }),

  // Backup
  downloadBackup: async () => {
    const headers = getAuthHeaders()
    const res = await fetch('/api/backup-database', { headers })
    if (!res.ok) throw new Error('下载失败')
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'yishao-backup.db'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  },
  downloadFullBackup: async () => {
    const headers = getAuthHeaders()
    const res = await fetch('/api/backup-full', { headers })
    if (!res.ok) throw new Error('下载失败')
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'yishao-full-backup.zip'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  },

  // Prompt Studio
  getDefaultProvider: () =>
    request('/api/prompt-studio/default-provider').then(d => d as { provider_id: string; model: string; name: string; available: boolean }),
  generatePrompts: (data: { industry_topic: string; purpose_description: string; reference_workspace_id?: string; provider_id?: string; model?: string }) =>
    request('/api/prompt-studio/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      timeoutMs: 300000,
    }).then(d => d as { configs: Record<string, any[]>; provider: { id: string; model: string } }),
  getPromptStudioProgress: () =>
    request('/api/prompt-studio/generate-progress').then(d => d as { lines: string[] }),
  applyPrompts: (data: { workspace_id: string; configs: Record<string, any[]> }) =>
    request('/api/prompt-studio/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(d => d as { ok: boolean; applied: Record<string, number> }),

  // Prompt Studio saved configs
  listPromptSaves: () =>
    request('/api/prompt-studio/saves').then(d => d as { saves: { id: string; name: string; industry_topic: string; purpose_description: string; provider_info: any; created_at: string; updated_at: string }[] }),
  getPromptSave: (id: string) =>
    request(`/api/prompt-studio/saves/${encodeURIComponent(id)}`).then(d => d as { save: any }),
  createPromptSave: (data: { name: string; industry_topic: string; purpose_description: string; configs: Record<string, any[]>; provider_info?: any }) =>
    request('/api/prompt-studio/saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(d => d as { ok: boolean; id: string }),
  updatePromptSave: (id: string, data: { name?: string; configs?: Record<string, any[]> }) =>
    request(`/api/prompt-studio/saves/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(d => d as { ok: boolean }),
  deletePromptSave: (id: string) =>
    request(`/api/prompt-studio/saves/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(d => d as { ok: boolean }),
  getPromptStudioTemplates: () =>
    request('/api/prompt-studio/templates').then(d => d as { system_prompt: string; user_message: string }),
  updatePromptStudioTemplate: (name: string, content: string) =>
    request(`/api/prompt-studio/templates/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }).then(d => d as { ok: boolean }),

  // Members
  listPendingMembers: (page?: number, pageSize?: number) => {
    const params = new URLSearchParams()
    if (page) params.set('page', String(page))
    if (pageSize) params.set('page_size', String(pageSize))
    const qs = params.toString()
    return request('/api/members/pending' + (qs ? '?' + qs : '')).then(d => d as { members: any[]; total: number; page: number; page_size: number })
  },
  approveMember: (userId: string, durationDays?: number, note?: string, pointsGranted?: number) =>
    request('/api/members/' + userId + '/approve', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_days: durationDays || 30, note: note || '', points_granted: pointsGranted }),
    }).then(d => d as { ok: boolean; message: string; expires_at: string }),
  rejectMember: (userId: string, reason?: string) =>
    request('/api/members/' + userId + '/reject', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || '' }),
    }).then(d => d as { ok: boolean; message: string }),
  recordPayment: (userId: string, data: { amount_cents: number; plan_name: string; duration_days: number; payment_method?: string; note?: string }) =>
    request('/api/members/' + userId + '/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(d => d as { ok: boolean; expires_before: string; expires_after: string }),
  updateUserExpiry: (userId: string, expiresAt: string | null) =>
    request('/api/members/' + userId + '/expiry', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_at: expiresAt }),
    }).then(d => d as { ok: boolean; expires_at: string | null }),
  listPayments: (userId: string, page?: number, pageSize?: number, q?: string) => {
    const params = new URLSearchParams()
    if (page) params.set('page', String(page))
    if (pageSize) params.set('page_size', String(pageSize))
    if (q) params.set('q', q)
    const qs = params.toString()
    return request('/api/members/' + userId + '/payments' + (qs ? '?' + qs : '')).then(d => d as { payments: any[]; total: number; page: number; page_size: number })
  },
  memberRenew: (data: {
    username: string; password: string; plan_type?: string;
    plan_id?: string; payment_method?: string; payment_ref?: string;
  }) =>
    request('/api/member/renew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(d => d as { ok: boolean; message: string }),

  memberUpgrade: (data: {
    payment_method?: string; payment_ref?: string;
  }) =>
    request('/api/member/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(d => d as { ok: boolean; message: string; duration_days?: number }),

  listPendingUpgrades: () =>
    request('/api/members/pending-upgrades').then(d => d as { members: any[]; total: number }),

  approveUpgrade: (userId: string, pointsGranted?: number) =>
    request('/api/members/' + userId + '/approve-upgrade', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points_granted: pointsGranted }),
    }).then(d => d as { ok: boolean; message: string; role: string }),

  listPendingRenewals: () =>
    request('/api/members/pending-renewals').then(d => d as { members: any[]; total: number }),

  approveRenewal: (userId: string, pointsGranted?: number) =>
    request('/api/members/' + userId + '/approve-renewal', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points_granted: pointsGranted }),
    }).then(d => d as { ok: boolean; message: string; expires_at: string; plan_name: string; points_granted_deci: number }),

  rejectUpgrade: (userId: string, reason?: string) =>
    request('/api/members/' + userId + '/reject-upgrade', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || '' }),
    }).then(d => d as { ok: boolean; message: string }),

  rejectRenewal: (userId: string, reason?: string) =>
    request('/api/members/' + userId + '/reject-renewal', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || '' }),
    }).then(d => d as { ok: boolean; message: string }),

  listMyPayments: () =>
    request('/api/member/my-payments').then(d => d as { payments: any[] }),

  // Roles
  listRoles: (userType?: string) => {
    const qs = userType ? '?user_type=' + encodeURIComponent(userType) : ''
    return request('/api/roles' + qs).then(d => d.roles as any[])
  },
  createRole: (data: { name: string; description?: string; user_type: string }) =>
    request('/api/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(d => d as any),
  updateRole: (id: string, data: { name?: string; description?: string }) =>
    request('/api/roles/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(d => d as any),
  deleteRole: (id: string) =>
    request('/api/roles/' + id, { method: 'DELETE' }),
  getRole: (id: string) =>
    request('/api/roles/' + id).then(d => d as any),
  addRolePermission: (roleId: string, permission: string) =>
    request('/api/roles/' + roleId + '/permissions/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission }),
    }).then(d => d as any),
  removeRolePermission: (roleId: string, permission: string) =>
    request('/api/roles/' + roleId + '/permissions/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission }),
    }).then(d => d as any),

  // Users
  listUsers: (params?: { user_type?: string; status?: string; search?: string; page?: number; page_size?: number }) => {
    const qs = new URLSearchParams()
    if (params?.user_type) qs.set('user_type', params.user_type)
    if (params?.status) qs.set('status', params.status)
    if (params?.search) qs.set('search', params.search)
    if (params?.page) qs.set('page', String(params.page))
    if (params?.page_size) qs.set('page_size', String(params.page_size))
    const q = qs.toString()
    return request('/api/users' + (q ? '?' + q : '')).then(d => d as { users: any[]; total: number; page: number; page_size: number })
  },
  getUser: (id: string) =>
    request('/api/users/' + id).then(d => d as any),
  createUser: (data: { username: string; password: string; display_name: string; user_type: string; email?: string }) =>
    request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(d => d as any),
  updateUser: (id: string, data: { display_name?: string; email?: string; is_active?: number; admin_note?: string }) =>
    request('/api/users/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(d => d as any),
  deleteUser: (id: string) =>
    request('/api/users/' + id, { method: 'DELETE' }),
  toggleUserActive: (userId: string) =>
    request('/api/users/' + userId + '/active', { method: 'PUT' }).then(d => d as any),
  batchUpdateUsers: (data: {user_ids: string[], updates: Record<string, any>}) =>
    request('/api/users/batch', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    }).then(d => d as {ok: boolean, message: string, count: number}),
  batchDeleteUsers: (data: {user_ids: string[]}) =>
    request('/api/users/batch-delete', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    }).then(d => d as {ok: boolean, message: string, count: number}),
  batchGrantPoints: (data: {user_ids: string[], amount_deci: number, note?: string}) =>
    request('/api/users/batch-grant-points', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    }).then(d => d as {ok: boolean, message: string, count: number}),
  addUserRole: (userId: string, roleId: string) =>
    request('/api/users/' + userId + '/roles/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: roleId }),
    }).then(d => d as any),
  removeUserRole: (userId: string, roleId: string) =>
    request('/api/users/' + userId + '/roles/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: roleId }),
    }).then(d => d as any),
  getUserWorkspaces: (userId: string) =>
    request('/api/users/' + userId + '/workspaces').then(d => d.workspaces as any[]),
  addUserWorkspaces: (userId: string, workspaceIds: string[]) =>
    request('/api/users/' + userId + '/workspaces/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_ids: workspaceIds }),
    }).then(d => d as any),
  removeUserWorkspace: (userId: string, workspaceId: string) =>
    request('/api/users/' + userId + '/workspaces/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId }),
    }).then(d => d as any),

  resetUserPassword: (userId: string, password: string) =>
    request('/api/users/' + userId + '/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).then(d => d as { ok: boolean }),

  changePassword: (oldPassword: string, newPassword: string) =>
    request('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    }).then(d => d as { ok: boolean }),

  // ── Points system ──

  getMyPoints: () =>
    request('/api/member/points').then(d => d as {
      balance_deci: number; balance_display: string; expires_at: string | null;
      points_per_yuan: number; unlocked_count: number;
    }),

  getMyPointsTransactions: (page?: number, pageSize?: number) => {
    const qs = new URLSearchParams()
    if (page) qs.set('page', String(page))
    if (pageSize) qs.set('page_size', String(pageSize))
    const q = qs.toString()
    return request('/api/member/points/transactions' + (q ? '?' + q : ''))
      .then(d => d as { transactions: any[]; total: number; page: number; page_size: number })
  },

  getDownloadableProjects: () =>
    request('/api/member/downloadable-projects').then(d => d as {
      projects: { id: string; name: string; point_cost_deci: number; workspace_id: string;
        category_name: string; author_id: string; author_name: string;
        unlocked: { is_unlocked: boolean; unlocked_at: string | null; expires_at: string | null };
        files: { filename: string; display_name: string; size: number; ext: string; category: string; download_url: string }[];
      }[]
    }),

  getMyUnlockedProjects: () =>
    request('/api/member/unlocked-projects').then(d => d as { unlocked: any[] }),

  canDownload: (files: { project_id: string; filename: string }[]) =>
    request('/api/member/can-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    }).then(d => d as {
      need_unlock: any[]; already_unlocked: any[]; not_downloadable: any[];
      total_cost_deci: number; balance_deci: number; can_afford: boolean;
      is_admin?: boolean;
    }),

  unlockProjects: (projectIds: string[]) =>
    request('/api/member/unlock-projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_ids: projectIds }),
    }).then(d => d as {
      unlocked: any[]; already_unlocked: string[];
      total_spent_deci: number; balance_after_deci: number;
    }),

  // Admin points
  getUserPoints: (userId: string) =>
    request('/api/members/' + userId + '/points').then(d => d as {
      balance_deci: number; balance_display: string; expires_at: string | null;
      transactions: any[]; unlocked: any[];
    }),

  setUserPoints: (userId: string, balanceDeci: number, note?: string) =>
    request('/api/members/' + userId + '/points', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance_deci: balanceDeci, note }),
    }).then(d => d as { ok: boolean; balance_deci: number; balance_display: string }),

  grantPoints: (userId: string, amountDeci: number, note?: string) =>
    request('/api/members/' + userId + '/points/grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_deci: amountDeci, note }),
    }).then(d => d as { ok: boolean; balance_deci: number; balance_display: string; granted_deci: number; rate: number }),

  // Download stats
  getDownloadStatsByProject: () =>
    request('/api/admin/stats/downloads/projects').then(d => d as { projects: any[] }),

  getDownloadStatsByMember: () =>
    request('/api/admin/stats/downloads/members').then(d => d as { members: any[] }),

  // ── Booklets (电子成册) ──
  listBooklets: () =>
    request('/api/booklets').then(d => d.booklets as {
      id: string; owner_id: string; owner_role: string; book_type: string
      title: string; subtitle: string; chapter_count: number
      is_recommended: boolean; updated_at: string
    }[]),
  cloneBooklet: (id: string) =>
    request(`/api/booklets/${id}/clone`, { method: 'POST' }),
  publicListBooklets: (q?: string, page?: number, pageSize?: number) =>
    request(`/api/public/booklets?q=${encodeURIComponent(q || '')}&page=${page || 1}&page_size=${pageSize || 50}`),
  createBooklet: (title: string, bookType: string) =>
    request('/api/booklets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, book_type: bookType }) }),
  getBooklet: (id: string) =>
    request(`/api/booklets/${id}`),
  updateBooklet: (id: string, data: { title?: string; subtitle?: string; author?: string; cover?: any; chapters?: any[]; is_recommended?: boolean }) =>
    request(`/api/booklets/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteBooklet: (id: string) =>
    request(`/api/booklets/${id}`, { method: 'DELETE' }),
  bookletAvailableContent: (bookType: string, workspaceId?: string, categoryId?: string) => {
    const params = [`book_type=${encodeURIComponent(bookType)}`]
    if (workspaceId) params.push(`workspace_id=${encodeURIComponent(workspaceId)}`)
    if (categoryId) params.push(`category_id=${encodeURIComponent(categoryId)}`)
    return request(`/api/booklets/available-content?${params.join('&')}`)
  },
  bookletContentItem: (projectId: string, sourceType: string, sourceKey: string) =>
    request(`/api/booklets/content-item?project_id=${encodeURIComponent(projectId)}&source_type=${encodeURIComponent(sourceType)}&source_key=${encodeURIComponent(sourceKey)}`)
      .then(d => d as { content: string; content_format: 'md' | 'html' }),
  bookletThemes: () =>
    request('/api/booklets/themes').then(d => d.themes as {
      id: string; name: string; source: 'builtin' | 'style_tmpl'
      colors: { primary: string; accent: string; bg: string; text: string; card_bg?: string; font?: string }
    }[]),
  bookletCoverPreview: (body: {
    book_type: string; title: string; subtitle: string; author: string;
    org: string; date_text: string; flyleaf_text: string; back_cover_text: string;
    logo_url: string; theme_id: string; theme_colors: Record<string, string>;
    desk_none: boolean; vi_mode: boolean; page_hf?: Record<string, any>;
  }) =>
    request('/api/booklets/cover-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(d => (d as { doc: string }).doc),
  renderBooklet: async (id: string, renderMode?: string, download = true) => {
    const body = JSON.stringify({ render_mode: renderMode || undefined, download })
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' }
    const res = await fetch(`/api/booklets/${id}/render`, {
      method: 'POST',
      headers,
      body,
    })
    if (!res.ok) {
      let detail = `服务器错误 (${res.status})`
      try { detail = (await res.json()).detail || detail } catch { /* not json */ }
      throw new Error(detail)
    }
    return res.text()
  },
  getBookletDownloadCost: (id: string) =>
    request(`/api/booklets/${id}/download-cost`).then(d => d as {
      cost_deci: number; project_count: number
      projects: { id: string; name: string; cost_deci: number }[]
      balance_deci: number; can_afford: boolean
      is_super_admin: boolean; is_owner: boolean
    }),
  downloadBooklet: async (id: string) => {
    const res = await fetch(`/api/booklets/${id}/render`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ render_mode: 'standard' }),
    })
    if (!res.ok) {
      let detail = `服务器错误 (${res.status})`
      try { detail = (await res.json()).detail || detail } catch { /* not json */ }
      throw new Error(detail)
    }
    return res.text()
  },
  bookletPageMap: (id: string) =>
    request(`/api/booklets/${id}/page-map`).then(d => d as {
      book_type: string; fixed: string[]
      fixed_docs?: Record<string, string>
      chapters: { chapter_id: string; title: string; kind: 'prose' | 'fulldoc' | 'embed' | 'locked'; page_count: number; docs?: string[]; project_id?: string; point_cost_deci?: number }[]
    }),
  bookletImportFile: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/booklets/import-file', { method: 'POST', body: formData, headers: getAuthHeaders() })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '导入失败')
    return data as { markdown: string; filename: string }
  },

  // ── Sales System ──

  listPlans: () =>
    request('/api/plans').then(d => d as {
      plans: { id: number; name: string; price_yuan: number; duration_days: number | null; features: string[] }[]
    }),

  createOrder: (data: { phone: string; plan_type_id: number }) =>
    request('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(d => d as { ok: boolean; order_no: string; amount_yuan: number; plan_name: string }),

  getOrder: (orderNo: string) =>
    request(`/api/orders/${encodeURIComponent(orderNo)}`).then(d => d as {
      order_no: string; phone: string; plan_name: string; amount_yuan: number;
      status: string; payment_ref: string; license_key?: string;
      created_at: string; updated_at: string;
    }),

  updatePaymentRef: (orderNo: string, paymentRef: string) =>
    request(`/api/orders/${encodeURIComponent(orderNo)}/payment-ref`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_ref: paymentRef }),
    }).then(d => d as { ok: boolean; status: string }),

  getQrcodeUrls: () =>
    request('/api/payment-config').then(d => d as { wechat_qr: string; alipay_qr: string }),
}
