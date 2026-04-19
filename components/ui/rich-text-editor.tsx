'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Bold, Italic, Underline, Link2, List } from 'lucide-react'
import { cn } from '@/lib/utils'

// A lightweight toolbar-based Markdown rich text editor.
// Stores as Markdown, renders to HTML via markdownToHtml()

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
}

export function RichTextEditor({ value, onChange, placeholder, rows = 3, className }: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const wrapSelection = (before: string, after: string) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end)
    const newVal = value.slice(0, start) + before + selected + after + value.slice(end)
    onChange(newVal)
    // Re-position cursor after React re-render
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + before.length, end + before.length)
    }, 0)
  }

  const insertLink = () => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end) || 'link text'
    const url = prompt('Enter URL:', 'https://')
    if (!url) return
    const newVal = value.slice(0, start) + `[${selected}](${url})` + value.slice(end)
    onChange(newVal)
  }

  const insertList = () => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const newVal = value.slice(0, start) + '\n- ' + value.slice(start)
    onChange(newVal)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + 3, start + 3)
    }, 0)
  }

  return (
    <div className={cn('border rounded-md overflow-hidden', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 bg-gray-50 border-b">
        <ToolbarBtn title="Bold (**text**)" onClick={() => wrapSelection('**', '**')}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Italic (*text*)" onClick={() => wrapSelection('*', '*')}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Underline" onClick={() => wrapSelection('<u>', '</u>')}>
          <Underline className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <div className="w-px h-4 bg-gray-300 mx-1" />
        <ToolbarBtn title="Insert link" onClick={insertLink}>
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Bullet list" onClick={insertList}>
          <List className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <span className="ml-auto text-xs text-gray-400 pr-1">Markdown</span>
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-y"
      />
    </div>
  )
}

function ToolbarBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
    >
      {children}
    </button>
  )
}

// Convert Markdown subset to HTML for display.
// Supports: **bold**, *italic*, <u>underline</u>, [text](url), - bullet lists, newlines
export function markdownToHtml(md: string): string {
  if (!md) return ''

  // Escape HTML first (except angle brackets we use for <u> tag)
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Restore allowed tags
  html = html
    .replace(/&lt;u&gt;/g, '<u>')
    .replace(/&lt;\/u&gt;/g, '</u>')

  // Inline: **bold**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Inline: *italic* (not **)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">$1</a>')

  // Bullet lists: lines starting with "- "
  const lines = html.split('\n')
  const result: string[] = []
  let inList = false
  for (const line of lines) {
    if (line.startsWith('- ')) {
      if (!inList) { result.push('<ul class="list-disc pl-5 my-1">'); inList = true }
      result.push(`<li>${line.slice(2)}</li>`)
    } else {
      if (inList) { result.push('</ul>'); inList = false }
      result.push(line)
    }
  }
  if (inList) result.push('</ul>')

  // Paragraphs: blank lines become <br><br>, other newlines become <br>
  return result
    .join('\n')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
}
