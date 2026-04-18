'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Plus,
  Search,
  Download,
  Upload,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react'

type Question = {
  id: string
  stem: string
  questionType: string
  options: string[] | null
  correctAnswer: string | null
  explanation: string | null
  difficulty: string
  points: number
  createdAt: string
}

export default function QuizQuestionsPage() {
  const params = useParams()
  const { toast } = useToast()
  const [questions, setQuestions] = useState<Question[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Question>>({})
  const [isAdding, setIsAdding] = useState(false)
  const [newQuestion, setNewQuestion] = useState({
    stem: '',
    questionType: 'MCQ',
    options: ['', '', '', ''],
    correctAnswer: '',
    explanation: '',
    difficulty: 'MEDIUM',
    points: 2,
  })

  useEffect(() => {
    fetchQuestions()
  }, [])

  const fetchQuestions = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/quiz-sets/${params.quizId}/questions`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setQuestions(data)
    } catch {
      toast({ title: 'Failed to load questions', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this question?')) return
    try {
      const res = await fetch(`/api/quiz-sets/${params.quizId}/questions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setQuestions((prev) => prev.filter((q) => q.id !== id))
      toast({ title: 'Question deleted' })
    } catch {
      toast({ title: 'Failed to delete', variant: 'destructive' })
    }
  }

  const handleSaveEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/quiz-sets/${params.quizId}/questions/${id}`, {
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

  const handleAddQuestion = async () => {
    try {
      const res = await fetch(`/api/quiz-sets/${params.quizId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newQuestion,
          options: newQuestion.questionType === 'MCQ' ? newQuestion.options : null,
        }),
      })
      if (!res.ok) throw new Error()
      const q = await res.json()
      setQuestions((prev) => [q, ...prev])
      setIsAdding(false)
      toast({ title: 'Question added' })
    } catch {
      toast({ title: 'Failed to add question', variant: 'destructive' })
    }
  }

  const handleExport = async () => {
    const res = await fetch(`/api/quiz-sets/${params.quizId}/questions/export`)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'questions.csv'
    a.click()
  }

  const filtered = questions.filter((q) => {
    if (search && !q.stem.toLowerCase().includes(search.toLowerCase())) return false
    if (difficultyFilter !== 'all' && q.difficulty !== difficultyFilter) return false
    if (typeFilter !== 'all' && q.questionType !== typeFilter) return false
    return true
  })

  const difficultyColor: Record<string, string> = {
    EASY: 'bg-green-100 text-green-800',
    MEDIUM: 'bg-yellow-100 text-yellow-800',
    HARD: 'bg-red-100 text-red-800',
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Question Bank</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Question
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search questions..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All difficulties</SelectItem>
            <SelectItem value="EASY">Easy</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HARD">Hard</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="MCQ">MCQ</SelectItem>
            <SelectItem value="TRUE_FALSE">True/False</SelectItem>
            <SelectItem value="SHORT_ANSWER">Short Answer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-sm text-gray-500 mb-4">{filtered.length} of {questions.length} questions</p>

      {/* Add Question Form */}
      {isAdding && (
        <Card className="mb-4 border-primary">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold">New Question</h3>
            <Textarea
              placeholder="Question stem..."
              value={newQuestion.stem}
              onChange={(e) => setNewQuestion({ ...newQuestion, stem: e.target.value })}
              className="min-h-[80px]"
            />
            <div className="grid grid-cols-3 gap-2">
              <Select value={newQuestion.questionType} onValueChange={(v) => setNewQuestion({ ...newQuestion, questionType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MCQ">MCQ</SelectItem>
                  <SelectItem value="TRUE_FALSE">True/False</SelectItem>
                  <SelectItem value="SHORT_ANSWER">Short Answer</SelectItem>
                </SelectContent>
              </Select>
              <Select value={newQuestion.difficulty} onValueChange={(v) => setNewQuestion({ ...newQuestion, difficulty: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EASY">Easy</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HARD">Hard</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Points"
                value={newQuestion.points}
                onChange={(e) => setNewQuestion({ ...newQuestion, points: Number(e.target.value) })}
              />
            </div>
            {newQuestion.questionType === 'MCQ' && (
              <div className="space-y-2">
                {newQuestion.options.map((opt, i) => (
                  <Input
                    key={i}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    value={opt}
                    onChange={(e) => {
                      const opts = [...newQuestion.options]
                      opts[i] = e.target.value
                      setNewQuestion({ ...newQuestion, options: opts })
                    }}
                  />
                ))}
                <Input
                  placeholder="Correct answer (e.g. A)"
                  value={newQuestion.correctAnswer}
                  onChange={(e) => setNewQuestion({ ...newQuestion, correctAnswer: e.target.value })}
                />
              </div>
            )}
            <Textarea
              placeholder="Explanation (optional)..."
              value={newQuestion.explanation}
              onChange={(e) => setNewQuestion({ ...newQuestion, explanation: e.target.value })}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setIsAdding(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAddQuestion}>Add Question</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Questions List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
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
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">{q.questionType}</Badge>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${difficultyColor[q.difficulty]}`}>
                      {q.difficulty}
                    </span>
                    <span className="text-xs text-gray-500">{q.points} pts</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingId(q.id)
                      setEditForm(q)
                      setExpandedId(q.id)
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-red-500"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(q.id)
                    }}
                  >
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
                            <Input
                              key={i}
                              value={opt}
                              onChange={(e) => {
                                const opts = [...(editForm.options || q.options || [])]
                                opts[i] = e.target.value
                                setEditForm({ ...editForm, options: opts })
                              }}
                            />
                          ))}
                          <Input
                            value={editForm.correctAnswer || ''}
                            onChange={(e) => setEditForm({ ...editForm, correctAnswer: e.target.value })}
                            placeholder="Correct answer"
                          />
                        </div>
                      )}
                      <Textarea
                        value={editForm.explanation || ''}
                        onChange={(e) => setEditForm({ ...editForm, explanation: e.target.value })}
                        placeholder="Explanation..."
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                        <Button size="sm" onClick={() => handleSaveEdit(q.id)}>
                          <Check className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 text-sm">
                      {q.options && q.options.map((opt, i) => (
                        <div
                          key={i}
                          className={`px-3 py-1.5 rounded ${
                            opt === q.correctAnswer ? 'bg-primary/10 text-primary font-medium' : 'text-gray-700'
                          }`}
                        >
                          {String.fromCharCode(65 + i)}. {opt}
                          {opt === q.correctAnswer && ' ✓'}
                        </div>
                      ))}
                      {q.correctAnswer && !q.options && (
                        <p className="text-primary font-medium">Answer: {q.correctAnswer}</p>
                      )}
                      {q.explanation && (
                        <div className="mt-2 p-3 bg-blue-50 rounded text-blue-800">
                          <p className="font-medium text-xs mb-1">Explanation</p>
                          {q.explanation}
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
