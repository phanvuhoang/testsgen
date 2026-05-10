'use client'

import { useEffect, useRef, useState } from 'react'

// Lightweight Mermaid renderer using ESM CDN import (no extra npm dep needed).
// Falls back to a code block if Mermaid fails to load (e.g. offline VPS).
export function MermaidView({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    if (!source) return
    let cancelled = false
    ;(async () => {
      try {
        // Build URL as a string so TS / bundler don't try to resolve it.
        const cdnUrl =
          'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'
        const mod: any = await import(/* webpackIgnore: true */ /* @vite-ignore */ cdnUrl)
        const mermaid = mod.default ?? mod
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          themeVariables: { primaryColor: '#028a39', primaryTextColor: '#fff' },
          securityLevel: 'loose',
        })
        const id = 'mm-' + Math.random().toString(36).slice(2)
        const { svg } = await mermaid.render(id, source)
        if (!cancelled) setSvg(svg)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e))
      }
    })()
    return () => { cancelled = true }
  }, [source])

  if (!source) {
    return (
      <p className="text-sm text-gray-400 italic">
        No mindmap was generated for this asset.
      </p>
    )
  }

  if (error) {
    return (
      <div>
        <p className="text-xs text-amber-600 mb-2">
          Couldn’t render mindmap visually ({error}). Showing source instead.
        </p>
        <pre className="bg-gray-50 border rounded p-3 text-xs overflow-x-auto">{source}</pre>
      </div>
    )
  }

  return (
    <div ref={ref} className="w-full overflow-x-auto">
      {svg
        ? <div dangerouslySetInnerHTML={{ __html: svg }} />
        : <p className="text-sm text-gray-400">Rendering mindmap…</p>}
    </div>
  )
}
