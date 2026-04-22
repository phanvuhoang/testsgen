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
import { Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronRight, Star, Tag } from 'lucide-react'

type Topic = {
  id: string
  name: string
  description: string | null
  sortOrder: number
  isOverall: boolean
  parentId: string | null
  children?: Topic[]
}

type FormState = { name: string; description: string; isOverall?: boolean; parentId?: string | null }

const emptyForm: FormState = { name: '', description: '' }

export default function TopicsPage() {
  const params = useParams()
  const { toast } = useToast()
  const [topics, setTopics] = useState<Topic[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [addingForm, setAddingForm] = useState<{ parentId: string | null; isOverall?: boolean } | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => { fetchTopics() }, [])

  const fetchTopics = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/topics`)
      if (res.ok) setTopics(await res.json())
    } finally { setIsLoading(false) }
  }

  const handleAdd = async () => {
    if (!form.name.trim()) return
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description || null,
          isOverall: addingForm?.isOverall ?? false,
          parentId: addingForm?.parentId ?? null,
          sortOrder: topics.filter(t => t.parentId === (addingForm?.parentId ?? null)).length,
        }),
      })
      if (!res.ok) throw new Error()
      toast({ title: 'Topic added' })
      setAddingForm(null)
      setForm(emptyForm)
      fetchTopics()
    } catch { toast({ title: 'Failed to add', variant: 'destructive' }) }
  }

  const handleSaveEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/topics/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), description: form.description || null }),
      })
      if (!res.ok) throw new Error()
      setEditingId(null)
      setForm(emptyForm)
      fetchTopics()
      toast({ title: 'Topic updated' })
    } catch { toast({ title: 'Failed to update', variant: 'destructive' }) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this topic and all its sub-topics?')) return
    const res = await fetch(`/api/sessions/${params.sessionId}/topics/${id}`, { method: 'DELETE' })
    if (res.ok) { fetchTopics(); toast({ title: 'Deleted' }) }
  }

  const overallTopic = topics.find(t => t.isOverall)
  const rootTopics = topics.filter(t => !t.isOverall && !t.parentId)
  const hasOverall = !!overallTopic

  const renderAddForm = (label = 'Add') => (
    <div className="border rounded-lg p-3 space-y-2 bg-gray-50/50 mt-2">
      <div className="space-y-1">
        <Label className="text-xs">{label} Name *</Label>
        <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Corporate Income Tax (CIT)" className="h-8" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Description (optional)</Label>
        <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="h-14 text-sm" />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={() => { setAddingForm(null); setForm(emptyForm) }}><X className="h-3 w-3 mr-1" />Cancel</Button>
        <Button size="sm" onClick={handleAdd}><Save className="h-3 w-3 mr-1" />Save</Button>
      </div>
    </div>
  )

  const renderTopic = (t: Topic, isChild = false) => {
    const isEditing = editingId === t.id
    const isCollapsible = (t.children?.length ?? 0) > 0
    const isCollapsed = collapsed.has(t.id)

    return (
      <div key={t.id} className={isChild ? 'ml-6 border-l-2 border-gray-200 pl-3' : ''}>
        <Card className={t.isOverall ? 'border-amber-300 bg-amber-50/30' : ''}>
          <CardContent className="p-3">
            {isEditing ? (
              <div className="space-y-2">
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="h-8" />
                <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="h-14 text-sm" />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => { setEditingId(null); setForm(emptyForm) }}>Cancel</Button>
                  <Button size="sm" onClick={() => handleSaveEdit(t.id)}><Save className="h-3 w-3 mr-1" />Save</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                {t.isOverall && <Star className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />}
                {isCollapsible && (
                  <button onClick={() => setCollapsed(prev => { const s = new Set(prev); s.has(t.id) ? s.delete(t.id) : s.add(t.id); return s })} className="mt-0.5">
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </button>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    {t.isOverall && <span className="text-xs font-bold text-amber-600 uppercase tracking-wide">Overall Topic</span>}
                    <span className={`font-semibold text-sm ${t.isOverall ? 'text-amber-800' : ''}`}>{t.name}</span>
                  </div>
                  {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                  {(t.children?.length ?? 0) > 0 && <p className="text-xs text-gray-400 mt-0.5">{t.children!.length} sub-topic{t.children!.length !== 1 ? 's' : ''}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {!t.isOverall && !isChild && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => { setAddingForm({ parentId: t.id }); setForm(emptyForm) }}>
                      <Plus className="h-3 w-3 mr-1" />Sub-topic
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingId(t.id); setForm({ name: t.name, description: t.description ?? '' }) }}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => handleDelete(t.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        {/* Add sub-topic form */}
        {addingForm?.parentId === t.id && renderAddForm('Sub-topic')}
        {/* Children */}
        {!isCollapsed && t.children && t.children.length > 0 && (
          <div className="mt-1 space-y-1">
            {t.children.map(child => renderTopic(child, true))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Topics</h2>
          <p className="text-sm text-gray-500">Optional — define subject areas for this exam session</p>
        </div>
        <Button onClick={() => { setAddingForm({ parentId: null }); setForm(emptyForm) }} size="sm">
          <Plus className="h-4 w-4 mr-2" />Add Topic
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="space-y-3">
          {/* Overall Topic section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold text-gray-700">Overall Topic</span>
              {!hasOverall && (
                <Button variant="outline" size="sm" className="h-6 text-xs ml-auto" onClick={() => { setAddingForm({ parentId: null, isOverall: true }); setForm(emptyForm) }}>
                  <Plus className="h-3 w-3 mr-1" />Set Overall Topic
                </Button>
              )}
            </div>
            {overallTopic ? (
              renderTopic(overallTopic)
            ) : (
              <div className="border-2 border-dashed border-amber-200 rounded-lg p-4 text-center text-sm text-gray-400">
                No overall topic set. Example: &quot;Vietnamese Tax Regulations 2026&quot;
              </div>
            )}
            {addingForm?.isOverall && renderAddForm('Overall Topic')}
          </div>

          {/* Root Topics */}
          <div>
            <div className="flex items-center gap-2 mb-2 mt-4">
              <Tag className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-700">Topics</span>
            </div>
            {rootTopics.length === 0 && !addingForm ? (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center text-sm text-gray-400">
                No topics yet. Add topics like CIT, PIT, VAT, etc.
              </div>
            ) : (
              <div className="space-y-2">
                {rootTopics.map(t => renderTopic(t))}
                {addingForm && !addingForm.isOverall && !addingForm.parentId && renderAddForm()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
