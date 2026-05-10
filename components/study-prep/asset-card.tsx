'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { Pencil, Save, X, Trash2, Download, FileText, Network } from 'lucide-react'
import { MarkdownView } from './markdown-view'
import { MermaidView } from './mermaid-view'

export type StudyAsset = {
  id: string
  title: string
  status: string
  content: string
  mindmap?: string | null
  structured?: any
  generatedBy?: string | null
  createdAt: string
  updatedAt: string
}

type Props = {
  asset: StudyAsset
  apiBase: string         // e.g. /api/study-prep/plans
  hasMindmap?: boolean
  onChanged: () => void
  onDeleted: () => void
}

export function AssetCard({ asset, apiBase, hasMindmap = true, onChanged, onDeleted }: Props) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(asset.title)
  const [draftContent, setDraftContent] = useState(asset.content)
  const [draftMindmap, setDraftMindmap] = useState(asset.mindmap || '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const r = await fetch(`${apiBase}/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draftTitle,
          content: draftContent,
          ...(hasMindmap ? { mindmap: draftMindmap || null } : {}),
        }),
      })
      if (!r.ok) throw new Error()
      toast({ title: 'Saved' })
      setEditing(false)
      onChanged()
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  async function togglePublished() {
    const next = asset.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'
    const r = await fetch(`${apiBase}/${asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    if (r.ok) {
      toast({ title: `Marked as ${next.toLowerCase()}` })
      onChanged()
    } else {
      toast({ title: 'Failed', variant: 'destructive' })
    }
  }

  async function remove() {
    if (!confirm('Delete this asset? This cannot be undone.')) return
    const r = await fetch(`${apiBase}/${asset.id}`, { method: 'DELETE' })
    if (r.ok) {
      toast({ title: 'Deleted' })
      onDeleted()
    } else {
      toast({ title: 'Failed', variant: 'destructive' })
    }
  }

  function downloadMd() {
    const blob = new Blob([`# ${asset.title}\n\n${asset.content}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${asset.title.replace(/[^\w-]+/g, '_')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex-1 min-w-0">
            {editing ? (
              <Input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="font-semibold"
              />
            ) : (
              <CardTitle className="text-base truncate">{asset.title}</CardTitle>
            )}
            <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-2">
              <Badge variant={asset.status === 'PUBLISHED' ? 'success' : 'secondary'}>
                {asset.status}
              </Badge>
              {asset.generatedBy && <span>by {asset.generatedBy}</span>}
              <span>· updated {new Date(asset.updatedAt).toLocaleString()}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!editing ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
                <Button size="sm" variant="outline" onClick={togglePublished}>
                  {asset.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                </Button>
                <Button size="sm" variant="outline" onClick={downloadMd}>
                  <Download className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={remove} className="text-red-600 hover:text-red-700">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={save} disabled={busy} className="bg-[#028a39] hover:bg-[#026d2e] text-white">
                  <Save className="h-4 w-4 mr-1" /> {busy ? 'Saving…' : 'Save'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraftContent(asset.content); setDraftTitle(asset.title); setDraftMindmap(asset.mindmap || '') }}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="view">
          <TabsList>
            <TabsTrigger value="view"><FileText className="h-4 w-4 mr-1" /> View</TabsTrigger>
            {hasMindmap && <TabsTrigger value="mindmap"><Network className="h-4 w-4 mr-1" /> Mindmap</TabsTrigger>}
          </TabsList>
          <TabsContent value="view" className="mt-4">
            {editing ? (
              <Textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                rows={24}
                className="font-mono text-xs"
              />
            ) : (
              <MarkdownView source={asset.content} />
            )}
          </TabsContent>
          {hasMindmap && (
            <TabsContent value="mindmap" className="mt-4">
              {editing ? (
                <Textarea
                  value={draftMindmap}
                  onChange={(e) => setDraftMindmap(e.target.value)}
                  rows={12}
                  className="font-mono text-xs"
                  placeholder="Mermaid mindmap source (starts with `mindmap`)"
                />
              ) : (
                <MermaidView source={asset.mindmap || ''} />
              )}
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  )
}
