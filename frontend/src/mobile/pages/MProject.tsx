import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../services/api'
import { MTopBar, mToast } from '../MobileApp'
import SvgIcon from '../../components/SvgIcon'

interface ProjectFile {
  filename: string
  display_name?: string
  type?: string
  category?: string
  size?: number
  modified?: number
  download_url?: string
  audio_url?: string
  source_name?: string
}

const withToken = (url: string) => {
  const token = localStorage.getItem('auth_token')
  if (!token) return url
  return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token)
}

// 预览类型判定：所有文件都可预览（office 走系统打开）
const kindOf = (f: ProjectFile): string => {
  if (f.type === 'MP3' || f.type === 'Audio') return 'audio'
  if (!f.download_url) return 'material' // 素材记录（内容在数据库）
  const n = (f.filename || '').toLowerCase()
  if (n.endsWith('.html') || n.endsWith('.htm')) return 'html'
  if (n.endsWith('.txt') || f.type === 'Text') return 'text'
  if (/\.(png|jpe?g|gif|svg|webp|bmp)$/.test(n)) return 'image'
  if (n.endsWith('.mp4') || f.type === 'Video') return 'video'
  // docx/pptx 及其他未知格式 → 交给系统/微信打开
  return 'office'
}

export default function MProject() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
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

  const normalizedAudioUrl = (f: ProjectFile) => {
    if (!f.audio_url) return ''
    return (f.audio_url as string).startsWith('/') ? f.audio_url : '/' + (f.audio_url as string).replace(/^\//, '')
  }

  const handleDownload = async (f: ProjectFile) => {
    try {
      const pid = id || ''
      const dlUrl = f.download_url || `/api/download/${encodeURIComponent(f.filename)}?project_id=${encodeURIComponent(pid)}`
      const token = localStorage.getItem('auth_token')
      const sep = dlUrl.includes('?') ? '&' : '?'
      const finalUrl = token ? `${dlUrl}${sep}token=${encodeURIComponent(token)}` : dlUrl

      // 检查解锁状态（与桌面端同流程：canDownload → unlock → download）
      const check = await api.canDownload([{ project_id: pid, filename: f.filename }])
      if (check == null) { mToast('操作失败，请重试', 'error'); return }

      if (check.is_admin) {
        window.open(finalUrl, '_blank')
        return
      }

      if (check.need_unlock && check.need_unlock.length > 0) {
        const item = check.need_unlock[0]
        const cost = item.point_cost_deci != null ? (item.point_cost_deci / 10).toFixed(1) : '?'
        const balance = check.balance_deci != null ? (check.balance_deci / 10).toFixed(1) : '?'
        const ok = window.confirm(`下载「${f.display_name || f.filename}」需消耗 ${cost} 积分（余额 ${balance} 积分），确认下载？`)
        if (!ok) return
        await api.unlockProjects([pid])
        window.open(finalUrl, '_blank')
        return
      }

      if (check.already_unlocked && check.already_unlocked.length > 0) {
        window.open(finalUrl, '_blank')
        return
      }

      if (check.not_downloadable && check.not_downloadable.length > 0) {
        mToast('该项目未开放积分解锁下载，请联系管理员', 'error')
        return
      }

      mToast('无法下载，请重试', 'error')
    } catch (e: any) {
      mToast(`下载失败: ${e?.message || e}`, 'error')
    }
  }

  const openPreview = (f: ProjectFile) => {
    const kind = kindOf(f)
    if (kind === 'office') {
      // 浏览器无法渲染 office → 直接打开文件地址：
      // 微信内置浏览器弹出文件预览页（可选打开方式），普通浏览器触发下载并在通知栏显示
      // 安全：只允许本站 /api/ 相对路径
      if (!f.download_url || !f.download_url.startsWith('/api/') || f.download_url.startsWith('//')) {
        mToast('该文件暂不支持预览', 'error')
        return
      }
      mToast('正在打开文件，如浏览器提示请选择打开方式（微信/WPS）')
      window.location.href = withToken(f.download_url)
      return
    }
    const src = kind === 'audio' ? normalizedAudioUrl(f) : (f.download_url || '')
    const q = new URLSearchParams({
      kind,
      src,
      name: f.display_name || f.filename,
      pid: id || '',
    })
    if (kind === 'material') q.set('sn', f.source_name || f.filename)
    navigate(`/preview?${q.toString()}`)
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
                  <span><SvgIcon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} /></span>
                  <span>{cat}</span>
                  <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 12 }}>({list.length})</span>
                </div>
                {expanded && list.map(f => {
                  const isAudio = f.type === 'MP3' || f.type === 'Audio'
                  const audioUrl = normalizedAudioUrl(f)
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
                          <SvgIcon name={isPlaying ? 'x-mark' : 'play'} size={14} />
                        </button>
                      )}
                      <button className="m-icon-btn"
                        onClick={e => { e.stopPropagation(); openPreview(f) }}
                        title="预览"><SvgIcon name="eye" size={14} /></button>
                      {f.download_url && (
                        <button className="m-icon-btn"
                          onClick={e => { e.stopPropagation(); handleDownload(f) }}
                          title="下载">⬇</button>
                      )}
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
