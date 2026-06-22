import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface ModalCtx {
  confirm: (message: string) => Promise<boolean>
  prompt: (message: string, defaultValue?: string) => Promise<string | null>
  toast: (message: string, type: 'success' | 'error') => void
}
const ModalContext = createContext<ModalCtx | null>(null)
export const useModal = () => useContext(ModalContext)!

interface ConfirmState { message: string; resolve: (v: boolean) => void }
interface PromptState { message: string; defaultValue: string; resolve: (v: string | null) => void }
interface ToastItem { id: number; message: string; type: 'success' | 'error' }

let toastId = 0

export function ModalProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [promptState, setPromptState] = useState<PromptState | null>(null)
  const [promptValue, setPromptValue] = useState('')
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const confirm = useCallback((message: string) =>
    new Promise<boolean>(resolve => setConfirmState({ message, resolve }))
  , [])

  const prompt = useCallback((message: string, defaultValue = '') =>
    new Promise<string | null>(resolve => {
      setPromptState({ message, defaultValue, resolve })
      setPromptValue(defaultValue)
    })
  , [])

  const toast = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  return (
    <ModalContext.Provider value={{ confirm, prompt, toast }}>
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
