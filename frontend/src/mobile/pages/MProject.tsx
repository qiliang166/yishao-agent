import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../services/api'
import { MTopBar, mToast } from '../MobileApp'

interface ProjectFile {
  filename: string
  display_name?: string
  type?: string
  category?: string
  size?: number
  modified?: number
  download_url?: string
  audio_url?: string
}

export default function MProject() {
  const { id } = useParams<{ id: string }>()
  const [projectName, setProjectName] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [playingAudio, setPlayingAudio] = useState('')

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playingUrlRef = useRef('')
  const audioPlayingRef = useRef(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const proj = await api.getProject(id) as any
        if (!cancelled && proj != null) {
          if (proj.name) setProjectName(proj.name)
          if (proj.workspace_id) setWorkspaceId(proj.workspace_id)
        }
        const data = await api.getProjectFiles(id) as any
        if (!cancelled && data != null && Array.isArray(data.files)) {
          setFiles(data.files)
          const cats = [...new Set<string>(data.files.map((f: any) => f.category || f.type || '其他'))]
          setExpandedGroups(new Set(cats))
        }
      } catch (e: any) {
        if (!cancelled) mToast(`加载失败: ${e?.message || e}`, 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  // 离开页面停止音频
  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
  }, [])

  const _stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    audioRef.current = null
    setPlayingAudio('')
    playingUrlRef.current = ''
    audioPlayingRef.current = false
  }

  const handleAudioToggle = (audioUrl: string) => {
    // 不同音频 → 停旧播新
    if (playingUrlRef.current !== audioUrl) {
      _stopAudio()
      const a = new Audio(audioUrl)
      audioRef.current = a
      setPlayingAudio(audioUrl)
      playingUrlRef.current = audioUrl
      audioPlayingRef.current = true
      a.play().catch(() => {
        setPlayingAudio('')
        playingUrlRef.current = ''
        audioPlayingRef.current = false
      })
      a.onended = () => {
        setPlayingAudio('')
        audioPlayingRef.current = false
      }
      return
    }

    // 同一音频 → 切换
    if (audioPlayingRef.current) {
      audioRef.current?.pause()
      setPlayingAudio('')
      audioPlayingRef.current = false
    } else {
      if (audioRef.current?.ended) {
        const a = new Audio(audioUrl)
        audioRef.current = a
        a.onended = () => {
          setPlayingAudio('')
          audioPlayingRef.current = false
        }
        a.play().catch(() => {
          setPlayingAudio('')
          playingUrlRef.current = ''
          audioPlayingRef.current = false
        })
      } else {
        audioRef.current?.play().catch(() => {
          setPlayingAudio('')
          playingUrlRef.current = ''
          audioPlayingRef.current = false
        })
      }
      setPlayingAudio(audioUrl)
      audioPlayingRef.current = true
    }
  }

  const handleDownload = async (f: ProjectFile) => {
    try {
      const dlName = f.display_name || f.filename
      if (f.download_url) {
        await api.downloadWithName(f.download_url, dlName)
      } else {
        await api.downloadWithName(
          `/api/download/${encodeURIComponent(f.filename)}?project_id=${encodeURIComponent(id || '')}`,
          dlName
        )
      }
    } catch (e: any) {
      mToast(`下载失败: ${e?.message || e}`, 'error')
    }
  }

  const isHtml = (f: ProjectFile) => (f.filename || '').toLowerCase().endsWith('.html')

  const handlePreview = async (f: ProjectFile) => {
    const url = f.download_url
    if (!url) {
      mToast('该文件不支持预览', 'error')
      return
    }
    // exports 端点公开且 inline，直接开新窗口
    if (url.startsWith('/api/exports/')) {
      window.open(url, '_blank')
      return
    }
    // download 端点需带 token 且强制 attachment → 取 blob 后以 HTML 打开
    const win = window.open('', '_blank')
    try {
      const token = localStorage.getItem('auth_token')
      const resp = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const blobUrl = URL.createObjectURL(new Blob([blob], { type: 'text/html' }))
      if (win != null) {
        win.location.href = blobUrl
      } else {
        window.open(blobUrl, '_blank')
      }
    } catch (e: any) {
      if (win != null) win.close()
      mToast(`预览失败: ${e?.message || e}`, 'error')
    }
  }

  const formatSize = (bytes?: number) => {
    if (bytes == null) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  const grouped: Record<string, ProjectFile[]> = {}
  for (const f of files) {
    const cat = f.category || f.type || '其他'
    ;(grouped[cat] ??= []).push(f)
  }

  return (
    <>
      <MTopBar title={projectName || '项目详情'} back={workspaceId ? `/ws/${workspaceId}` : '/'} />
      <div className="m-content">
        {loading ? (
          <div className="m-loading">加载中…</div>
        ) : files.length === 0 ? (
          <div className="m-empty">暂无文件</div>
        ) : (
          Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([cat, list]) => {
            const expanded = expandedGroups.has(cat)
            return (
              <div key={cat}>
                <div className="m-group-head" onClick={() => {
                  setExpandedGroups(prev => {
                    const s = new Set(prev)
                    expanded ? s.delete(cat) : s.add(cat)
                    return s
                  })
                }}>
                  <span>{expanded ? '▼' : '▶'}</span>
                  <span>{cat}</span>
                  <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 12 }}>({list.length})</span>
                </div>
                {expanded && list.map(f => {
                  const isAudio = f.type === 'MP3' || f.type === 'Audio'
                  const audioUrl = f.audio_url
                    ? ((f.audio_url as string).startsWith('/') ? f.audio_url : '/' + (f.audio_url as string).replace(/^\//, ''))
                    : ''
                  const isPlaying = !!audioUrl && playingAudio === audioUrl
                  return (
                    <div key={f.download_url || f.filename} className="m-file-row">
                      <div className="m-file-name">
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.display_name || f.filename}</div>
                        <div className="m-file-meta">
                          {f.modified ? new Date(f.modified * 1000).toLocaleDateString('zh-CN') : ''}
                          {f.size != null ? ` · ${formatSize(f.size)}` : ''}
                        </div>
                      </div>
                      {isAudio && audioUrl && (
                        <button className="m-icon-btn"
                          onClick={e => { e.stopPropagation(); handleAudioToggle(audioUrl) }}
                          title={isPlaying ? '暂停' : '播放'}>
                          {isPlaying ? '⏸' : '▶'}
                        </button>
                      )}
                      {isHtml(f) && (
                        <button className="m-icon-btn"
                          onClick={e => { e.stopPropagation(); handlePreview(f) }}
                          title="预览">👁</button>
                      )}
                      <button className="m-icon-btn"
                        onClick={e => { e.stopPropagation(); handleDownload(f) }}
                        title="下载">⬇</button>
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
