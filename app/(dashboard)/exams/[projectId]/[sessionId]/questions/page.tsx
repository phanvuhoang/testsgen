'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { Search, Download, Pencil, Trash2, ChevronDown, ChevronUp, Check, ThumbsUp, AlertCircle } from 'lucide-react'

type Question = {
  id: string
  stem: string
  questionType: string
  options: string[] | null
  correctAnswer: string | null
  markingScheme: string | null
  modelAnswer: string | null
  topic: string | null
  difficulty: string
  status: string
  marks: number
  section: { id: string; name: string }
}

const difficultyColor: Record<string, string> = {
  EASY: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HARD: 'bg-red-100 text-red-800',
}

export default function ExamQuestionsPage() {
  const params = useParams()
  const { toast } = useToast()
  const [questions, setQuestions] = useState<Question[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [difficultyFilter, setDifficultyFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Question>>({})

  useEffect(() => {
    fetchQuestions()
  }, [])

  const fetchQuestions = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/questions`)
      if (res.ok) setQuestions(await res.json())
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/questions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...updated } : q)))
      setEditingId(null)
      toast({ title: 'Question updated' })
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this question?')) return
    const res = await fetch(`/api/sessions/${params.sessionId}/questions/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setQuestions((prev) => prev.filter((q) => q.id !== id))
      toast({ title: 'Question deleted' })
    }
  }

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'APPROVED' ? 'NEEDS_REVIEW' : 'APPROVED'
    const res = await fetch(`/api/sessions/${params.sessionId}/questions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, status: newStatus } : q))
    }
  }

  const handleExport = async () => {
    const res = await fetch(`/api/sessions/${params.sessionId}/questions?format=json`)
    if (!res.ok) return
    const data = await res.json()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'questions.json'
    a.click()
  }

  // Unique sections from questions
  const allSections = Array.from(new Set(questions.map((q) => q.section?.id))).map((id) => {
    const q = questions.find((q) => q.section?.id === id)
    return { id: id || '', name: q?.section?.name || 'Unknown' }
  })

  const filtered = questions.filter((q) => {
    if (search && !q.stem.toLowerCase().includes(search.toLowerCase())) return false
    if (sectionFilter !== 'all' && q.section?.id !== sectionFilter) return false
    if (difficultyFilter !== 'all' && q.difficulty !== difficultyFilter) return false
    if (statusFilter !== 'all' && q.status !== statusFilter) return false
    return true
  })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Question Bank</h2>
          <p className="text-sm text-gray-500">{filtered.length} of {questions.length} questions</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export JSON
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search questions..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={sectionFilter} onValueChange={setSectionFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Section" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {allSections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Difficulty" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="EASY">Easy</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HARD">Hard</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="NEEDS_REVIEW">Needs Review</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">No questions found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((q) => (
            <Card key={q.id} className="overflow-hidden">
              <div
                className="p-4 flex items-start justify-between gap-2 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-2">{q.stem}</p>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-gray-400">{q.section?.name}</span>
                    <Badge variant="outline" className="text-xs py-0">{q.questionType.replace(/_/g, ' ')}</Badge>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${difficultyColor[q.difficulty]}`}>{q.difficulty}</span>
                    <span className="text-xs text-gray-500">{q.marks}m</span>
                    {q.topic && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{q.topic}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleStatus(q.id, q.status) }}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                      q.status === 'APPROVED'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-yellow-50 text-yellow-700'
                    }`}
                  >
                    {q.status === 'APPROVED' ? <ThumbsUp className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                    {q.status === 'APPROVED' ? 'Approved' : 'Review'}
                  </button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditingId(q.id); setEditForm(q); setExpandedId(q.id) }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={(e) => { e.stopPropagation(); handleDelete(q.id) }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                  {expandedId === q.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>

              {expandedId === q.id && (
                <div className="border-t p-4 bg-gray-50">
                  {editingId === q.id ? (
                    <div className="space-y-3">
                      <Textarea
                        value={editForm.stem || ''}
                        onChange={(e) => setEditForm({ ...editForm, stem: e.target.value })}
                        className="min-h-[80px]"
                      />
                      {q.options && (
                        <div className="space-y-1">
                          {(editForm.options || q.options).map((opt: string, i: number) => (
                            <Input key={i} value={opt} onChange={(e) => {
                              const opts = [...(editForm.options || q.options || [])]
                              opts[i] = e.target.value
                              setEditForm({ ...editForm, options: opts })
                            }} />
                          ))}
                          <Input value={editForm.correctAnswer || ''} onChange={(e) => setEditForm({ ...editForm, correctAnswer: e.target.value })} placeholder="Correct answer" />
                        </div>
                      )}
                      <Textarea value={editForm.markingScheme || ''} onChange={(e) => setEditForm({ ...editForm, markingScheme: e.target.value })} placeholder="Marking scheme..." />
                      <Textarea value={editForm.modelAnswer || ''} onChange={(e) => setEditForm({ ...editForm, modelAnswer: e.target.value })} placeholder="Model answer..." />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                        <Button size="sm" onClick={() => handleSave(q.id)}>
                          <Check className="h-4 w-4 mr-1" />Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 text-sm">
                      {q.options?.map((opt, i) => (
                        <div key={i} className={`px-3 py-1.5 rounded ${opt === q.correctAnswer ? 'bg-primary/10 text-primary font-medium' : 'text-gray-700'}`}>
                          {String.fromCharCode(65 + i)}. {opt} {opt === q.correctAnswer && '✓'}
                        </div>
                      ))}
                      {!q.options && q.correctAnswer && (
                        <div className="p-2 bg-primary/10 rounded text-primary text-xs"><strong>Answer:</strong> {q.correctAnswer}</div>
                      )}
                      {q.markingScheme && (
                        <div className="p-3 bg-blue-50 rounded text-blue-900">
                          <p className="text-xs font-semibold mb-1">Marking Scheme</p>
                          <p className="text-xs whitespace-pre-wrap">{q.markingScheme}</p>
                        </div>
                      )}
                      {q.modelAnswer && (
                        <div className="p-3 bg-gray-100 rounded">
                          <p className="text-xs font-semibold mb-1">Model Answer</p>
                          <p className="text-xs whitespace-pre-wrap">{q.modelAnswer}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
