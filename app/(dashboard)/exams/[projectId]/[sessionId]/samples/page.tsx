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
import { useToast } from '@/components/ui/use-toast'
import { Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronUp, BookOpen, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type ParsedQuestion = {
  id: string
  title: string | null
  content: string
  answer: string | null
  questionType: string
  topicName: string | null
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

  useEffect(() => {
    fetchQuestions()
    fetch(`/api/sessions/${params.sessionId}/topics`).then(r => r.ok ? r.json() : []).then(setTopics).catch(() => {})
    fetch(`/api/sessions/${params.sessionId}/sections`).then(r => r.ok ? r.json() : []).then(setSections).catch(() => {})
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
      toast({ title: 'Deleted' })
    }
  }

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

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BookOpen className="h-12 w-12 mx-auto mb-3" />
          <p className="font-medium">No sample questions yet</p>
          <p className="text-sm mt-1">Upload a Sample Questions document and click "Parse", or add manually</p>
        </div>
      ) : (
        <div className="space-y-2">
          {questions.map((q, idx) => (
            <Card key={q.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
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
                    <p className={`text-sm text-gray-700 ${expandedId !== q.id ? 'line-clamp-2' : 'whitespace-pre-wrap'}`}>{q.content}</p>
                    {expandedId === q.id && q.answer && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
                        <span className="font-medium text-green-800 text-xs">Answer/Explanation:</span>
                        <p className="text-green-900 text-xs mt-1 whitespace-pre-wrap">{q.answer}</p>
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
                    <Textarea
                      value={editForm.content ?? ''}
                      onChange={e => setEditForm(p => ({ ...p, content: e.target.value }))}
                      className="text-sm min-h-[100px]"
                      placeholder="Question content..."
                    />
                    <Textarea
                      value={editForm.answer ?? ''}
                      onChange={e => setEditForm(p => ({ ...p, answer: e.target.value }))}
                      className="text-sm min-h-[60px]"
                      placeholder="Answer/explanation..."
                    />
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
              <Textarea
                value={addForm.content}
                onChange={e => setAddForm(p => ({ ...p, content: e.target.value }))}
                className="min-h-[150px] text-sm font-mono"
                placeholder="Paste or type the question here (including options if MCQ)..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Answer / Explanation</Label>
              <Textarea
                value={addForm.answer}
                onChange={e => setAddForm(p => ({ ...p, answer: e.target.value }))}
                className="min-h-[80px] text-sm"
                placeholder="Answer, marking scheme, or explanation..."
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
