import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { api } from '../services/api'

interface ModalCtx {
  confirm: (message: string) => Promise<boolean>
  prompt: (message: string, defaultValue?: string, description?: string) => Promise<string | null>
  saveFile: (options: {
    title: string
    defaultFilename: string
    projectId: string
    projectName?: string
  }) => Promise<{ filename: string; directory: string } | null>
  toast: (message: string, type: 'success' | 'error') => void
}
const ModalContext = createContext<ModalCtx | null>(null)
export const useModal = () => useContext(ModalContext)!

interface ConfirmState { message: string; resolve: (v: boolean) => void }
interface PromptState { message: string; description?: string; defaultValue: string; resolve: (v: string | null) => void }
interface SaveFileState {
  title: string
  defaultFilename: string
  projectId: string
  projectName?: string
  resolve: (v: { filename: string; directory: string } | null) => void
}
interface ToastItem { id: number; message: string; type: 'success' | 'error' }

let toastId = 0

export function ModalProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [promptState, setPromptState] = useState<PromptState | null>(null)
  const [promptValue, setPromptValue] = useState('')
  const [saveFileState, setSaveFileState] = useState<SaveFileState | null>(null)
  const [filename, setFilename] = useState('')
  const [targetPath, setTargetPath] = useState('')
  const [dirs, setDirs] = useState<string[]>([])
  const [parentDir, setParentDir] = useState<string | null>(null)
  const [loadingDirs, setLoadingDirs] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const confirm = useCallback((message: string) =>
    new Promise<boolean>(resolve => setConfirmState({ message, resolve }))
  , [])

  const prompt = useCallback((message: string, defaultValue = '', description?: string) =>
    new Promise<string | null>(resolve => {
      setPromptState({ message, description, defaultValue, resolve })
      setPromptValue(defaultValue)
    })
  , [])

  const loadDirs = async (path: string) => {
    setLoadingDirs(true)
    try {
      const result = await api.listFsDirs(path)
      if (result?.ok) {
        setDirs(result.dirs || [])
        setParentDir(result.parent !== undefined ? result.parent : null)
        setTargetPath(result.path || path)
      }
    } catch {
      setDirs([])
      setParentDir(null)
    } finally {
      setLoadingDirs(false)
    }
  }

  const saveFile = useCallback((options: {
    title: string
    defaultFilename: string
    projectId: string
    projectName?: string
  }) =>
    new Promise<{ filename: string; directory: string } | null>(async resolve => {
      setSaveFileState({ ...options, resolve })
      setFilename(options.defaultFilename)
      setShowBrowser(false)
      // Get project root as default path
      try {
        const projResult = await api.listProjectDirs(options.projectId, '')
        if (projResult?.ok && projResult.base) {
          setTargetPath(projResult.base)
          await loadDirs(projResult.base)
          return
        }
      } catch { /* fall through */ }
      loadDirs('')
    })
  , [])

  const handleBrowse = () => {
    if (!showBrowser) {
      loadDirs(targetPath)
    }
    setShowBrowser(!showBrowser)
  }

  const handleEnterDir = (dir: string) => {
    const newPath = targetPath.replace(/[\\/]+$/, '') + '\\' + dir
    loadDirs(newPath)
  }

  const handleGoParent = () => {
    if (parentDir !== null) {
      loadDirs(parentDir)
    }
  }

  const handleCreateFolder = async () => {
    if (!targetPath) return
    const name = await prompt('新建文件夹', '', `在 ${targetPath} 下创建`)
    if (!name) return
    try {
      const result = await api.createFsDir(targetPath, name)
      if (result?.ok) {
        toast('文件夹已创建', 'success')
        loadDirs(targetPath)
      }
    } catch (e: any) {
      toast(`创建失败: ${e?.message || e}`, 'error')
    }
  }

  const toast = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  return (
    <ModalContext.Provider value={{ confirm, prompt, saveFile, toast }}>
      {children}

      {/* Confirm Dialog */}
      {confirmState && (
        <div className="dialog-overlay" onClick={() => { confirmState.resolve(false); setConfirmState(null) }}>
          <div className="dialog-box" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">确认操作</div>
            <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 16, color: 'var(--text)' }}>
              {confirmState.message}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { confirmState.resolve(false); setConfirmState(null) }}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={() => { confirmState.resolve(true); setConfirmState(null) }}>确认</button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Dialog */}
      {promptState && (
        <div className="dialog-overlay" onClick={() => { promptState.resolve(null); setPromptState(null) }}>
          <div className="dialog-box" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">{promptState.message}</div>
            {promptState.description && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)', marginBottom: 10, lineHeight: 1.5 }}>{promptState.description}</p>
            )}
            <input
              className="form-input"
              value={promptValue}
              onChange={e => setPromptValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { promptState.resolve(promptValue); setPromptState(null) } }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { promptState.resolve(null); setPromptState(null) }}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={() => { promptState.resolve(promptValue); setPromptState(null) }}>确认</button>
            </div>
          </div>
        </div>
      )}

      {/* Save File Dialog */}
      {saveFileState && (
        <div className="dialog-overlay" onClick={() => { saveFileState.resolve(null); setSaveFileState(null) }}>
          <div className="dialog-box save-file-dialog" onClick={e => e.stopPropagation()}>
            <div className="dialog-title">{saveFileState.title}</div>

            {/* Path row */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                保存路径:
              </label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  className="form-input"
                  value={targetPath}
                  onChange={e => setTargetPath(e.target.value)}
                  style={{ fontSize: 10, flex: 1 }}
                />
                <button className="btn btn-ghost btn-sm" onClick={handleBrowse} title="浏览文件夹"
                  style={{ background: showBrowser ? 'var(--bg-secondary, #f1f5f9)' : undefined }}>
                  📂
                </button>
              </div>
            </div>

            {/* Collapsible folder browser */}
            {showBrowser && (
              <div className="folder-browser">
                {loadingDirs ? (
                  <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>加载中...</div>
                ) : (
                  <>
                    {parentDir !== null && (
                      <div className="folder-item" onClick={handleGoParent}>📁 ..</div>
                    )}
                    {dirs.map(d => (
                      <div key={d} className="folder-item" onClick={() => handleEnterDir(d)}>📁 {d}</div>
                    ))}
                    <div className="folder-item" onClick={handleCreateFolder}
                      style={{ color: 'var(--primary)', fontWeight: 500 }}>
                      📂 新建文件夹
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Filename row */}
            <div style={{ marginBottom: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                文件名:
              </label>
              <input
                className="form-input"
                value={filename}
                onChange={e => setFilename(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { saveFileState.resolve({ filename, directory: targetPath }); setSaveFileState(null) } }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { saveFileState.resolve(null); setSaveFileState(null) }}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={() => { saveFileState.resolve({ filename, directory: targetPath }); setSaveFileState(null) }}>确认保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Container */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast-item toast-${t.type}`}>{t.message}</div>
          ))}
        </div>
      )}
    </ModalContext.Provider>
  )
}
