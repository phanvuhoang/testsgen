'use client'

import { useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
}

// Convert basic markdown to HTML for display/storage compatibility
export function markdownToHtml(text: string): string {
  if (!text) return ''
  // If already looks like HTML, return as-is
  if (text.includes('<') && text.includes('>')) return text
  // Otherwise do basic markdown conversion
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, '<br>')
}

export function RichTextEditor({ value, onChange, placeholder, rows = 4, className }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isInitialized = useRef(false)

  // Initialize content once
  useEffect(() => {
    if (editorRef.current && !isInitialized.current) {
      editorRef.current.innerHTML = value ? markdownToHtml(value) : ''
      isInitialized.current = true
    }
  }, [])

  const exec = useCallback((command: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }, [onChange])

  const handleInput = useCallback(() => {
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }, [onChange])

  const insertImage = useCallback(() => {
    const url = prompt('Enter image URL:')
    if (url) exec('insertImage', url)
  }, [exec])

  const insertLink = useCallback(() => {
    const url = prompt('Enter URL:', 'https://')
    if (url) exec('createLink', url)
  }, [exec])

  const insertTable = useCallback(() => {
    const rowCount = parseInt(prompt('Number of rows:', '3') ?? '3')
    const colCount = parseInt(prompt('Number of columns:', '3') ?? '3')
    if (!rowCount || !colCount) return
    let html = '<table border="1" style="border-collapse:collapse;width:100%;margin:8px 0"><tbody>'
    for (let r = 0; r < rowCount; r++) {
      html += '<tr>'
      for (let c = 0; c < colCount; c++) {
        html += '<td style="border:1px solid #d1d5db;padding:6px 8px;min-width:60px">&nbsp;</td>'
      }
      html += '</tr>'
    }
    html += '</tbody></table><br>'
    exec('insertHTML', html)
  }, [exec])

  const insertMath = useCallback(() => {
    const formula = prompt('Enter LaTeX formula (e.g. x^2 + y^2 = z^2):')
    if (formula) {
      exec('insertHTML', `<span class="math-formula" style="font-family:monospace;background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:0.9em">\\(${formula}\\)</span>`)
    }
  }, [exec])

  const embedVideo = useCallback(() => {
    const url = prompt('Enter YouTube or video embed URL:')
    if (!url) return
    // Extract YouTube ID
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
    if (ytMatch) {
      exec('insertHTML', `<iframe width="400" height="225" src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen style="max-width:100%;margin:8px 0;display:block"></iframe><br>`)
    } else {
      exec('insertHTML', `<iframe src="${url}" width="400" height="225" frameborder="0" style="max-width:100%;margin:8px 0;display:block"></iframe><br>`)
    }
  }, [exec])

  const minHeight = `${rows * 1.8}rem`

  return (
    <div className={cn('border rounded-md overflow-hidden', className)}>
      {/* Toolbar row */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 bg-gray-50 border-b text-xs">
        {/* Text style */}
        <ToolBtn title="Bold" onClick={() => exec('bold')}><b>B</b></ToolBtn>
        <ToolBtn title="Italic" onClick={() => exec('italic')}><i>I</i></ToolBtn>
        <ToolBtn title="Underline" onClick={() => exec('underline')}><u>U</u></ToolBtn>
        <ToolBtn title="Strikethrough" onClick={() => exec('strikeThrough')}><s>S</s></ToolBtn>
        <Sep />
        {/* Alignment */}
        <ToolBtn title="Align Left" onClick={() => exec('justifyLeft')}>≡←</ToolBtn>
        <ToolBtn title="Align Center" onClick={() => exec('justifyCenter')}>≡</ToolBtn>
        <ToolBtn title="Align Right" onClick={() => exec('justifyRight')}>≡→</ToolBtn>
        <ToolBtn title="Justify" onClick={() => exec('justifyFull')}>≡≡</ToolBtn>
        <Sep />
        {/* Lists */}
        <ToolBtn title="Bullet List" onClick={() => exec('insertUnorderedList')}>• List</ToolBtn>
        <ToolBtn title="Numbered List" onClick={() => exec('insertOrderedList')}>1. List</ToolBtn>
        <Sep />
        {/* Indent */}
        <ToolBtn title="Indent" onClick={() => exec('indent')}>→|</ToolBtn>
        <ToolBtn title="Outdent" onClick={() => exec('outdent')}>|←</ToolBtn>
        <Sep />
        {/* Font size */}
        <select
          title="Font size"
          className="text-xs border rounded px-1 py-0.5 bg-white h-6"
          onChange={e => { if (e.target.value) exec('fontSize', e.target.value) }}
          defaultValue=""
        >
          <option value="" disabled>Size</option>
          {[1,2,3,4,5,6,7].map(n => <option key={n} value={String(n)}>Size {n}</option>)}
        </select>
        {/* Font color */}
        <input
          type="color"
          title="Font color"
          className="h-6 w-6 rounded border border-gray-200 cursor-pointer p-0"
          onChange={e => exec('foreColor', e.target.value)}
        />
        <input
          type="color"
          title="Highlight color"
          className="h-6 w-6 rounded border border-gray-200 cursor-pointer p-0 bg-yellow-100"
          onChange={e => exec('hiliteColor', e.target.value)}
        />
        <Sep />
        {/* Insert */}
        <ToolBtn title="Insert Link" onClick={insertLink}>🔗</ToolBtn>
        <ToolBtn title="Insert Image" onClick={insertImage}>🖼</ToolBtn>
        <ToolBtn title="Embed Video" onClick={embedVideo}>▶️</ToolBtn>
        <ToolBtn title="Insert Math" onClick={insertMath}>∑</ToolBtn>
        <ToolBtn title="Insert Table" onClick={insertTable}>⊞</ToolBtn>
        <Sep />
        <ToolBtn title="Remove Formatting" onClick={() => exec('removeFormat')}>✕</ToolBtn>
      </div>
      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        className="p-3 outline-none text-sm"
        style={{ minHeight, maxHeight: '400px', overflowY: 'auto' }}
        data-placeholder={placeholder}
      />
      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        [contenteditable] table { border-collapse: collapse; }
        [contenteditable] td { border: 1px solid #d1d5db; padding: 4px 8px; }
      `}</style>
    </div>
  )
}

function ToolBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className="px-1.5 py-0.5 rounded hover:bg-gray-200 text-gray-600 transition-colors h-6 min-w-6 text-xs"
    >
      {children}
    </button>
  )
}

function Sep() {
  return <div className="w-px h-4 bg-gray-300 mx-0.5" />
}
