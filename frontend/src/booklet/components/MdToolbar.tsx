import { RefObject, useRef } from 'react'
import { useModal } from '../../components/ModalProvider'

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement>
  value: string
  onChange: (next: string) => void
}

const IMG_MAX_BYTES = 2 * 1024 * 1024

/** Markdown 插入工具栏 — 按钮向光标处写入语法，用户不必记 Markdown */
export default function MdToolbar({ textareaRef, value, onChange }: Props) {
  const { prompt, toast } = useModal()
  const imgRef = useRef<HTMLInputElement>(null)

  const insert = (before: string, after = '', placeholder = '') => {
    const ta = textareaRef.current
    const start = ta ? ta.selectionStart : value.length
    const end = ta ? ta.selectionEnd : value.length
    const selectedText = value.slice(start, end) || placeholder
    const next = value.slice(0, start) + before + selectedText + after + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      if (!ta) return
      ta.focus()
      const pos = start + before.length + selectedText.length
      ta.setSelectionRange(start + before.length, pos)
    })
  }

  const insertBlock = (block: string) => {
    const ta = textareaRef.current
    const start = ta ? ta.selectionStart : value.length
    const needsNl = start > 0 && value[start - 1] !== '\n' ? '\n\n' : '\n'
    const next = value.slice(0, start) + needsNl + block + '\n' + value.slice(start)
    onChange(next)
    requestAnimationFrame(() => { ta?.focus() })
  }

  const handleTable = async () => {
    const spec = await prompt('表格尺寸（行x列，例如 3x3）', '3x3')
    if (spec == null) return
    const m = spec.trim().match(/^(\d{1,2})\s*[xX×*]\s*(\d{1,2})$/)
    if (!m) { toast('格式不对，请输入如 3x3', 'error'); return }
    const rows = Math.min(parseInt(m[1], 10), 30)
    const cols = Math.min(parseInt(m[2], 10), 12)
    if (rows < 1 || cols < 1) { toast('行列数至少为 1', 'error'); return }
    const header = '| ' + Array.from({ length: cols }, (_, i) => `列${i + 1}`).join(' | ') + ' |'
    const sep = '|' + Array.from({ length: cols }, () => ' --- ').join('|') + '|'
    const body = Array.from({ length: rows }, () =>
      '| ' + Array.from({ length: cols }, () => '　').join(' | ') + ' |').join('\n')
    insertBlock(`${header}\n${sep}\n${body}`)
  }

  const handleImage = (file: File) => {
    if (file.size > IMG_MAX_BYTES) {
      toast('图片超过 2MB，请压缩后再插入', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const uri = typeof reader.result === 'string' ? reader.result : ''
      if (!uri.startsWith('data:image/')) { toast('不是有效的图片文件', 'error'); return }
      insertBlock(`![图片](${uri})`)
      toast('图片已插入（随册子自包含保存）', 'success')
    }
    reader.onerror = () => toast('读取图片失败', 'error')
    reader.readAsDataURL(file)
  }

  const btn = (label: string, title: string, onClick: () => void) => (
    <button className="btn btn-ghost btn-sm" title={title} type="button"
      style={{ fontSize: 11, padding: '2px 8px' }} onClick={onClick}>{label}</button>
  )

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6, flexShrink: 0 }}>
      {btn('B', '加粗', () => insert('**', '**', '加粗文字'))}
      {btn('H2', '大标题', () => insert('\n## ', '', '标题'))}
      {btn('H3', '小标题', () => insert('\n### ', '', '标题'))}
      {btn('• 列表', '无序列表', () => insertBlock('- 第一项\n- 第二项\n- 第三项'))}
      {btn('1. 列表', '有序列表', () => insertBlock('1. 第一项\n2. 第二项\n3. 第三项'))}
      {btn('❝ 引用', '引用块', () => insert('\n> ', '', '引用内容'))}
      {btn('▦ 表格', '插入表格', () => { void handleTable() })}
      {btn('🖼 图片', '插入本地图片（≤2MB，自动内嵌）', () => imgRef.current?.click())}
      <input ref={imgRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImage(f); e.target.value = '' }} />
    </div>
  )
}
