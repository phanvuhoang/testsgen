'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Pencil, Trash2, Save, ChevronDown, ChevronUp, BookOpen, Loader2, X, Wand2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RichTextEditor } from '@/components/ui/rich-text-editor'

type ParsedQuestion = {
  id: string
  title: string | null
  content: string
  answer: string | null
  questionType: string
  topicId: string | null
  topicName: string | null
  sectionId: string | null
  sectionName: string | null
  syllabusCode: string | null
  difficulty: string
  isManual: boolean
  documentId: string | null
}

const questionTypeLabels: Record<string, string> = {
  MCQ_SINGLE: 'MCQ (single)',
  MCQ_MULTIPLE: 'MCQ (multi)',
  FILL_BLANK: 'Fill blank',
  SHORT_ANSWER: 'Short answer',
  ESSAY: 'Essay',
  SCENARIO: 'Scenario',
  CASE_STUDY: 'Case study',
  OTHER: 'Other',
}

const difficultyColors: Record<string, string> = {
  EASY: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HARD: 'bg-red-100 text-red-700',
}

function hasHtml(text: string | null | undefined): boolean {
  if (!text) return false
  return /<[a-z][\s\S]*>/i.test(text)
}

const HTML_TABLE_CLASSES = '[&_table]:border-collapse [&_table]:w-full [&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-xs [&_td]:border [&_td]:border-gray-100 [&_td]:px-2 [&_td]:py-1 [&_td]:text-xs [&_p]:mb-1'
const HTML_TABLE_GREEN = '[&_table]:border-collapse [&_table]:w-full [&_th]:border [&_th]:border-green-200 [&_th]:bg-green-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-xs [&_td]:border [&_td]:border-green-100 [&_td]:px-2 [&_td]:py-1 [&_td]:text-xs [&_p]:mb-1'

export default function SamplesPage() {
  const params = useParams()
  const { toast } = useToast()
  const [questions, setQuestions] = useState<ParsedQuestion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<ParsedQuestion>>({})
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ title: '', content: '', answer: '', questionType: 'MCQ_SINGLE', difficulty: 'MEDIUM' })
  const [isSaving, setIsSaving] = useState(false)
  const [topics, setTopics] = useState<{ id: string; name: string; isOverall: boolean; parentId: string | null }[]>([])
  const [sections, setSections] = useState<{ id: string; name: string }[]>([])

  // Filter state
  const [search, setSearch] = useState('')
  const [filterTopicId, setFilterTopicId] = useState('__all__')
  const [filterSectionId, setFilterSectionId] = useState('__all__')
  const [filterType, setFilterType] = useState('__all__')

  // Bulk select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  // Reprocess state
  const [aiModels, setAiModels] = useState<{ id: string; label: string }[]>([])
  const [reprocessModel, setReprocessModel] = useState('claudible:1')
  const [isReprocessing, setIsReprocessing] = useState(false)

  useEffect(() => {
    fetchQuestions()
    fetch(`/api/sessions/${params.sessionId}/topics`).then(r => r.ok ? r.json() : []).then(setTopics).catch(() => {})
    fetch(`/api/sessions/${params.sessionId}/sections`).then(r => r.ok ? r.json() : []).then(setSections).catch(() => {})
    fetch('/api/ai-models').then(r => r.ok ? r.json() : []).then(setAiModels).catch(() => {})
  }, [])

  const fetchQuestions = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/parsed-questions`)
      if (res.ok) setQuestions(await res.json())
    } finally {
      setIsLoading(false)
    }
  }

  // Client-side filtering
  const filteredQuestions = questions.filter(q => {
    if (search && !q.content.toLowerCase().includes(search.toLowerCase()) && !(q.title ?? '').toLowerCase().includes(search.toLowerCase())) return false
    if (filterTopicId !== '__all__' && q.topicId !== filterTopicId) return false
    if (filterSectionId !== '__all__' && q.sectionId !== filterSectionId) return false
    if (filterType !== '__all__' && q.questionType !== filterType) return false
    return true
  })

  const clearFilters = () => {
    setSearch('')
    setFilterTopicId('__all__')
    setFilterSectionId('__all__')
    setFilterType('__all__')
  }

  const hasFilters = search || filterTopicId !== '__all__' || filterSectionId !== '__all__' || filterType !== '__all__'

  // Bulk select helpers
  const allFilteredSelected = filteredQuestions.length > 0 && filteredQuestions.every(q => selectedIds.has(q.id))
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredQuestions.map(q => q.id)))
    }
  }
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} selected questions?`)) return
    setIsBulkDeleting(true)
    const count = selectedIds.size
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          fetch(`/api/sessions/${params.sessionId}/parsed-questions/${id}`, { method: 'DELETE' })
        )
      )
      setQuestions(prev => prev.filter(q => !selectedIds.has(q.id)))
      setSelectedIds(new Set())
      toast({ title: `Deleted ${count} questions` })
    } catch {
      toast({ title: 'Bulk delete failed', variant: 'destructive' })
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const handleAddManual = async () => {
    if (!addForm.content.trim()) return
    setIsSaving(true)
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/parsed-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...addForm, isManual: true }),
      })
      if (!res.ok) throw new Error()
      const q = await res.json()
      setQuestions(prev => [...prev, q])
      setAddOpen(false)
      setAddForm({ title: '', content: '', answer: '', questionType: 'MCQ_SINGLE', difficulty: 'MEDIUM' })
      toast({ title: 'Sample question added' })
    } catch {
      toast({ title: 'Failed to add', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    const res = await fetch(`/api/sessions/${params.sessionId}/parsed-questions/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    if (res.ok) {
      const updated = await res.json()
      setQuestions(prev => prev.map(q => q.id === editingId ? { ...q, ...updated } : q))
      setEditingId(null)
      toast({ title: 'Updated' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this sample question?')) return
    const res = await fetch(`/api/sessions/${params.sessionId}/parsed-questions/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setQuestions(prev => prev.filter(q => q.id !== id))
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
      toast({ title: 'Deleted' })
    }
  }

  const handleReprocess = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Reprocess ${selectedIds.size} selected sample(s) with AI? This will reformat content/answer as HTML and extract syllabus codes.`)) return
    setIsReprocessing(true)
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/parsed-questions/reprocess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), modelId: reprocessModel }),
      })
      if (!res.ok) throw new Error()
      const updated: ParsedQuestion[] = await res.json()
      setQuestions(prev => prev.map(q => {
        const u = updated.find(u => u.id === q.id)
        return u ? { ...q, ...u } : q
      }))
      setSelectedIds(new Set())
      toast({ title: `Reprocessed ${updated.length} question(s)` })
    } catch {
      toast({ title: 'Reprocess failed', variant: 'destructive' })
    } finally {
      setIsReprocessing(false)
    }
  }

  const nonOverallTopics = topics.filter(t => !t.isOverall)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Sample Questions</h2>
          <p className="text-sm text-gray-500">{questions.length} questions — parsed from documents or manually added</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Add Sample
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          className="h-8 text-xs w-48"
        />
        <Select value={filterTopicId} onValueChange={setFilterTopicId}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All Topics" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">All Topics</SelectItem>
            {nonOverallTopics.map(t => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                {t.parentId ? `↳ ${t.name}` : t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSectionId} onValueChange={setFilterSectionId}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All Sections" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">All Sections</SelectItem>
            {sections.map(s => (
              <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">All Types</SelectItem>
            {Object.entries(questionTypeLabels).map(([v, l]) => (
              <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs text-gray-500">
            <X className="h-3 w-3 mr-1" />Clear
          </Button>
        )}
      </div>

      {/* Bulk actions header */}
      {!isLoading && questions.length > 0 && (
        <div className="flex items-center gap-3 mb-2 px-1">
          <Checkbox
            checked={allFilteredSelected}
            onCheckedChange={toggleSelectAll}
            className="h-3.5 w-3.5"
          />
          <span className="text-xs text-gray-500">
            Showing {filteredQuestions.length} of {questions.length} questions
            {selectedIds.size > 0 && ` — ${selectedIds.size} selected`}
          </span>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              {aiModels.length > 0 && (
                <Select value={reprocessModel} onValueChange={setReprocessModel}>
                  <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {aiModels.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleReprocess}
                disabled={isReprocessing || isBulkDeleting}
                className="h-7 text-xs border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                {isReprocessing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wand2 className="h-3 w-3 mr-1" />}
                Reprocess ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={isBulkDeleting || isReprocessing}
                className="h-7 text-xs"
              >
                {isBulkDeleting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
                Delete ({selectedIds.size})
              </Button>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BookOpen className="h-12 w-12 mx-auto mb-3" />
          <p className="font-medium">{questions.length === 0 ? 'No sample questions yet' : 'No questions match filters'}</p>
          <p className="text-sm mt-1">
            {questions.length === 0
              ? 'Upload a Sample Questions document and click "Parse", or add manually'
              : 'Try clearing the filters'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredQuestions.map((q, idx) => (
            <Card key={q.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedIds.has(q.id)}
                    onCheckedChange={() => toggleSelect(q.id)}
                    className="h-3.5 w-3.5 mt-1 shrink-0"
                  />
                  <span className="text-xs font-mono text-gray-300 mt-1 w-6 shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {q.title && <span className="font-semibold text-sm">{q.title}</span>}
                      <Badge variant="outline" className="text-xs">{questionTypeLabels[q.questionType] ?? q.questionType}</Badge>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${difficultyColors[q.difficulty] ?? ''}`}>{q.difficulty}</span>
                      {q.isManual && <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">Manual</span>}
                      {q.topicName && <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{q.topicName}</span>}
                      {q.sectionName && <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded">{q.sectionName}</span>}
                    </div>
                    {hasHtml(q.content) ? (
                      <div
                        className={`text-sm text-gray-700 ${expandedId !== q.id ? 'line-clamp-2' : ''} ${HTML_TABLE_CLASSES}`}
                        dangerouslySetInnerHTML={{ __html: q.content }}
                      />
                    ) : (
                      <p className={`text-sm text-gray-700 ${expandedId !== q.id ? 'line-clamp-2' : 'whitespace-pre-wrap'}`}>{q.content}</p>
                    )}
                    {expandedId === q.id && q.answer && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
                        <span className="font-medium text-green-800 text-xs">Answer/Explanation:</span>
                        {hasHtml(q.answer) ? (
                          <div
                            className={`text-green-900 text-xs mt-1 ${HTML_TABLE_GREEN}`}
                            dangerouslySetInnerHTML={{ __html: q.answer }}
                          />
                        ) : (
                          <p className="text-green-900 text-xs mt-1 whitespace-pre-wrap">{q.answer}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                    >
                      {expandedId === q.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditingId(q.id)
                        setEditForm({ content: q.content, answer: q.answer ?? '', questionType: q.questionType, difficulty: q.difficulty })
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-500"
                      onClick={() => handleDelete(q.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {editingId === q.id && (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Content</Label>
                      <RichTextEditor
                        key={`content-${editingId}`}
                        value={editForm.content ?? ''}
                        onChange={v => setEditForm(p => ({ ...p, content: v }))}
                        placeholder="Question content..."
                        rows={5}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Answer / Explanation</Label>
                      <RichTextEditor
                        key={`answer-${editingId}`}
                        value={editForm.answer ?? ''}
                        onChange={v => setEditForm(p => ({ ...p, answer: v }))}
                        placeholder="Answer/explanation..."
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={editForm.questionType ?? 'MCQ_SINGLE'} onValueChange={v => setEditForm(p => ({ ...p, questionType: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(questionTypeLabels).map(([v, l]) => (
                            <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={editForm.difficulty ?? 'MEDIUM'} onValueChange={v => setEditForm(p => ({ ...p, difficulty: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EASY" className="text-xs">Easy</SelectItem>
                          <SelectItem value="MEDIUM" className="text-xs">Medium</SelectItem>
                          <SelectItem value="HARD" className="text-xs">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button size="sm" onClick={handleSaveEdit}>
                        <Save className="h-3 w-3 mr-1" />Save
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add manual sample dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add Sample Question</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Input
                value={addForm.title}
                onChange={e => setAddForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Title (optional, e.g. Example 1)"
                className="h-8 text-sm col-span-1"
              />
              <Select value={addForm.questionType} onValueChange={v => setAddForm(p => ({ ...p, questionType: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(questionTypeLabels).map(([v, l]) => (
                    <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={addForm.difficulty} onValueChange={v => setAddForm(p => ({ ...p, difficulty: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EASY" className="text-xs">Easy</SelectItem>
                  <SelectItem value="MEDIUM" className="text-xs">Medium</SelectItem>
                  <SelectItem value="HARD" className="text-xs">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Question Content *</Label>
              <RichTextEditor
                value={addForm.content}
                onChange={v => setAddForm(p => ({ ...p, content: v }))}
                placeholder="Paste or type the question here (including options if MCQ)..."
                rows={6}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Answer / Explanation</Label>
              <RichTextEditor
                value={addForm.answer}
                onChange={v => setAddForm(p => ({ ...p, answer: v }))}
                placeholder="Answer, marking scheme, or explanation..."
                rows={3}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAddManual} disabled={!addForm.content.trim() || isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Add Question
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
