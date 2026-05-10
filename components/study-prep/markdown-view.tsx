'use client'

// Tiny dependency-free Markdown -> HTML renderer.
// Good enough for Study Prep outputs (headings, lists, tables, bold/italic,
// inline code, fenced code, links, citations [doc:id] / [q:id]).
// We avoid adding a heavyweight markdown lib to keep the deploy tiny.

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]!))
}

function renderInline(text: string): string {
  let out = escapeHtml(text)
  // citations
  out = out.replace(/\[(doc|q):([A-Za-z0-9_-]+)\]/g,
    '<span class="inline-block px-1 py-0.5 mx-0.5 rounded bg-emerald-50 text-emerald-700 text-xs font-mono">$1:$2</span>')
  // bold
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  // italic
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  // inline code
  out = out.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-gray-100 rounded text-xs">$1</code>')
  // links
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>')
  return out
}

function renderTable(lines: string[]): string {
  // Lines: header, separator, body...
  const splitRow = (l: string) =>
    l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
  const header = splitRow(lines[0])
  const body = lines.slice(2).map(splitRow)
  return `<table class="border-collapse my-3 text-sm"><thead><tr>${
    header.map((h) => `<th class="border px-3 py-1.5 bg-gray-50 text-left font-semibold">${renderInline(h)}</th>`).join('')
  }</tr></thead><tbody>${
    body.map((r) =>
      `<tr>${r.map((c) => `<td class="border px-3 py-1.5 align-top">${renderInline(c)}</td>`).join('')}</tr>`
    ).join('')
  }</tbody></table>`
}

function isTableLine(s: string): boolean {
  return /^\s*\|.*\|\s*$/.test(s)
}

function renderMarkdown(md: string): string {
  const lines = md.split(/\r?\n/)
  const html: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Fenced code blocks
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, '').trim()
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      i++ // skip closing fence
      html.push(`<pre class="bg-gray-50 border rounded p-3 text-xs overflow-x-auto my-3"><code data-lang="${escapeHtml(lang)}">${escapeHtml(buf.join('\n'))}</code></pre>`)
      continue
    }

    // Tables
    if (isTableLine(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const buf: string[] = []
      while (i < lines.length && (isTableLine(lines[i]) || /^\s*\|[\s:|-]+\|\s*$/.test(lines[i]))) {
        buf.push(lines[i])
        i++
      }
      html.push(renderTable(buf))
      continue
    }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.+)$/)
    if (h) {
      const lvl = h[1].length
      const sizes = ['text-2xl', 'text-xl', 'text-lg', 'text-base', 'text-sm', 'text-sm']
      html.push(`<h${lvl} class="${sizes[lvl-1]} font-semibold mt-4 mb-2 text-gray-900">${renderInline(h[2])}</h${lvl}>`)
      i++; continue
    }

    // Lists (group consecutive list items)
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line)
      const items: string[] = []
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) {
        const m = lines[i].match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/)
        if (m) items.push(`<li class="ml-5 my-0.5">${renderInline(m[1])}</li>`)
        i++
      }
      html.push(ordered
        ? `<ol class="list-decimal pl-3 my-2">${items.join('')}</ol>`
        : `<ul class="list-disc pl-3 my-2">${items.join('')}</ul>`)
      continue
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      html.push(`<blockquote class="border-l-4 border-emerald-300 pl-3 my-2 text-gray-700 italic">${renderInline(buf.join(' '))}</blockquote>`)
      continue
    }

    // Horizontal rule
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      html.push('<hr class="my-4 border-gray-200" />')
      i++; continue
    }

    // Paragraph (collect until blank)
    if (line.trim() === '') {
      i++; continue
    }
    const buf: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^#{1,6}\s+/.test(lines[i]) &&
           !/^```/.test(lines[i]) &&
           !/^\s*[-*]\s+/.test(lines[i]) &&
           !/^\s*\d+\.\s+/.test(lines[i]) &&
           !isTableLine(lines[i])) {
      buf.push(lines[i]); i++
    }
    html.push(`<p class="my-2 leading-relaxed">${renderInline(buf.join(' '))}</p>`)
  }
  return html.join('\n')
}

export function MarkdownView({ source }: { source: string }) {
  if (!source) return <p className="text-sm text-gray-400 italic">Empty.</p>
  const html = renderMarkdown(source)
  return (
    <div
      className="prose-sm max-w-none text-gray-800"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
