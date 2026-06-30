import { useState, useRef, useEffect } from 'react'
import { api } from '../services/api'

interface Message {
  role: 'user' | 'system'
  text: string
  ok?: boolean
}

interface Props {
  runId: string
  slideCount: number
  providerId?: string
  model?: string
  onSlideEdited: () => void
}

export default function SlideEditPanel({ runId, slideCount, providerId, model, onSlideEdited }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [slideSeq, setSlideSeq] = useState(1)
  const [editing, setEditing] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || editing) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setEditing(true)

    try {
      const result = await api.editSlide({
        run_id: runId,
        slide_seq: slideSeq,
        instruction: text,
        provider_id: providerId,
        model,
        timeoutMs: 120000,
      })

      if (result.ok) {
        setMessages(prev => [...prev, { role: 'system', text: '已修改，预览已刷新', ok: true }])
        onSlideEdited()
      } else {
        const errType = result.error || 'unknown'
        const detail = result.detail || result.violation || '未知错误'
        let hint = ''
        if (errType === 'content_overflow') {
          hint = '💡 建议：减少内容条目，或指定使用更多卡片的布局'
        } else if (errType === 'container_violation') {
          hint = '💡 建议：说明内容区应使用标准 60px 边距'
        } else if (errType === 'fullscreen_mask') {
          hint = '💡 建议：删除覆盖层或改为半透明'
        } else if (errType === 'no_change') {
          hint = '💡 建议：更具体地描述要修改的内容'
        } else if (errType === 'parse_error') {
          hint = '💡 建议：换一种说法描述修改要求'
        } else if (errType === 'chat_reply') {
          hint = '💡 AI 无法直接修改，请换一种更具体的方式描述'
        }
        setMessages(prev => [...prev, { role: 'system', text: `拒绝：${detail}\n${hint}`, ok: false }])
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'system', text: `出错：${e.message || e}`, ok: false }])
    } finally {
      setEditing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{
      width: 300, display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid var(--border)',
      background: 'var(--bg-secondary, #f8f9fa)',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        fontSize: 13, fontWeight: 600, color: 'var(--text)',
      }}>
        聊天编辑
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 20 }}>
            输入修改要求，如：<br />
            "把标题字号改大到 42px"<br />
            "第三张卡片背景改成浅蓝色"<br />
            "删除底部的备注文字"
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            padding: '6px 10px', borderRadius: 8, fontSize: 12,
            lineHeight: 1.5, whiteSpace: 'pre-wrap',
            background: msg.role === 'user'
              ? 'var(--primary, #2563eb)'
              : msg.ok === false
                ? '#fef2f2'
                : '#f0fdf4',
            color: msg.role === 'user'
              ? '#fff'
              : msg.ok === false
                ? '#991b1b'
                : '#166534',
            border: msg.role === 'system' ? `1px solid ${msg.ok === false ? '#fecaca' : '#bbf7d0'}` : 'none',
          }}>
            {msg.text}
          </div>
        ))}
        {editing && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>
            ⏳ 正在编辑...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
        {/* Slide selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>第</span>
          <input
            type="number"
            min={1}
            max={slideCount}
            value={slideSeq}
            onChange={e => setSlideSeq(Math.max(1, Math.min(slideCount, parseInt(e.target.value) || 1)))}
            style={{
              width: 48, padding: '3px 6px', fontSize: 12,
              border: '1px solid var(--border)', borderRadius: 4,
              background: 'var(--bg)', color: 'var(--text)',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>页</span>
        </div>
        {/* Text input + send */}
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="修改要求..."
            disabled={editing}
            style={{
              flex: 1, padding: '6px 10px', fontSize: 12,
              border: '1px solid var(--border)', borderRadius: 6,
              background: 'var(--bg)', color: 'var(--text)',
            }}
          />
          <button
            onClick={handleSend}
            disabled={editing || !input.trim()}
            className="btn btn-primary btn-sm"
            style={{ fontSize: 12, padding: '6px 12px' }}
          >
            {editing ? '...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}
