'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Pencil, Trash2, Save, X, GripVertical, Tag } from 'lucide-react'

type Topic = {
  id: string
  name: string
  description: string | null
  sortOrder: number
}

export default function TopicsPage() {
  const params = useParams()
  const { toast } = useToast()
  const [topics, setTopics] = useState<Topic[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '' })

  useEffect(() => { fetchTopics() }, [])

  const fetchTopics = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/topics`)
      if (res.ok) setTopics(await res.json())
    } finally {
      setIsLoading(false)
    }
  }

  const handleAdd = async () => {
    if (!form.name.trim()) return
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, sortOrder: topics.length }),
      })
      if (!res.ok) throw new Error()
      const t = await res.json()
      setTopics(prev => [...prev, t])
      setIsAdding(false)
      setForm({ name: '', description: '' })
      toast({ title: 'Topic added' })
    } catch {
      toast({ title: 'Failed to add topic', variant: 'destructive' })
    }
  }

  const handleSave = async (id: string) => {
    const t = topics.find(x => x.id === id)
    if (!t) return
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/topics/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(t),
      })
      if (!res.ok) throw new Error()
      setEditingId(null)
      toast({ title: 'Topic updated' })
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this topic?')) return
    const res = await fetch(`/api/sessions/${params.sessionId}/topics/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setTopics(prev => prev.filter(t => t.id !== id))
      toast({ title: 'Topic deleted' })
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-lg font-semibold">Topics</h2>
          <p className="text-sm text-gray-500">Optional topic areas (e.g. CIT, PIT, VAT) — used for exam section planning</p>
        </div>
        <Button onClick={() => setIsAdding(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />Add Topic
        </Button>
      </div>

      {isAdding && (
        <Card className="mb-4 border-primary mt-4">
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Topic Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Corporate Income Tax (CIT)" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="h-16" placeholder="Brief description of this topic area..." />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setIsAdding(false)}><X className="h-4 w-4 mr-1" />Cancel</Button>
              <Button size="sm" onClick={handleAdd}><Save className="h-4 w-4 mr-1" />Add</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3 mt-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : topics.length === 0 ? (
        <div className="text-center py-12 text-gray-500 mt-4">
          <Tag className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No topics defined</p>
          <p className="text-sm mt-1">Topics are optional — add them to organize your exam sections by subject area.</p>
        </div>
      ) : (
        <div className="space-y-2 mt-4">
          {topics.map((t, idx) => (
            <Card key={t.id}>
              <CardContent className="p-4">
                {editingId === t.id ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Topic Name</Label>
                      <Input value={t.name} onChange={e => setTopics(prev => prev.map(x => x.id === t.id ? { ...x, name: e.target.value } : x))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Textarea value={t.description ?? ''} onChange={e => setTopics(prev => prev.map(x => x.id === t.id ? { ...x, description: e.target.value } : x))} className="h-16" />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => handleSave(t.id)}><Save className="h-4 w-4 mr-1" />Save</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <GripVertical className="h-5 w-5 text-gray-300 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-400">{String(idx + 1).padStart(2, '0')}</span>
                        <h3 className="font-semibold text-sm">{t.name}</h3>
                      </div>
                      {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(t.id)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(t.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
