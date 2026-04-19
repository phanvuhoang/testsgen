'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/components/ui/use-toast'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
  Sparkles,
  Loader2,
  FileSpreadsheet,
  X,
  Copy,
} from 'lucide-react'

type Question = {
  id: string
  stem: string
  questionType: string
  options: string[] | { left: string[]; right: string[] } | null
  correctAnswer: string | null
  explanation: string | null
  difficulty: string
  points: number
  sortOrder: number
  poolTag: string | null
  createdAt: string
}

type AIModel = {
  id: string
  label: string
  provider: string
  model: string
}

const ALL_QUESTION_TYPES = [
  { value: 'MCQ', label: 'Multiple Choice (choose one)' },
  { value: 'MULTIPLE_RESPONSE', label: 'Multiple Response (choose many)' },
  { value: 'TRUE_FALSE', label: 'True/False' },
  { value: 'FILL_BLANK', label: 'Fill in the Blank' },
  { value: 'MATCHING', label: 'Matching' },
  { value: 'TEXT_BLOCK', label: 'Text Block / Header' },
  { value: 'ESSAY', label: 'Essay (ungraded)' },
  { value: 'LONG_ANSWER', label: 'Long Answer (ungraded)' },
  { value: 'SHORT_ANSWER', label: 'Short Answer' },
]

const TYPE_LABEL: Record<string, string> = {
  MCQ: 'MCQ',
  MULTIPLE_RESPONSE: 'Multi-select',
  TRUE_FALSE: 'True/False',
  FILL_BLANK: 'Fill blank',
  MATCHING: 'Matching',
  TEXT_BLOCK: 'Text block',
  ESSAY: 'Essay',
  LONG_ANSWER: 'Long answer',
  SHORT_ANSWER: 'Short answer',
}

export default function QuizQuestionsPage() {
  const params = useParams()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importFileRef = useRef<HTMLInputElement>(null)

  const [questions, setQuestions] = useState<Question[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Question>>({})
  // Matching edit state
  const [editMatchLeft, setEditMatchLeft] = useState<string[]>([])
  const [editMatchRight, setEditMatchRight] = useState<string[]>([])

  // Documents state
  const [documents, setDocuments] = useState<{ id: string; fileName: string; fileType: string; fileSize: number }[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [isUploadingDoc, setIsUploadingDoc] = useState(false)
  const [isDeletingDoc, setIsDeletingDoc] = useState<string | null>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  // Add question form
  const [isAdding, setIsAdding] = useState(false)
  const [newQuestion, setNewQuestion] = useState({
    stem: '',
    questionType: 'MCQ',
    options: ['', '', '', ''],
    correctAnswer: '',
    explanation: '',
    difficulty: 'MEDIUM',
    points: 2,
    poolTag: '',
    // Matching state
    matchLeft: ['', ''],
    matchRight: ['', ''],
  })

  // AI generate state
  const [showAIPanel, setShowAIPanel] = useState(false)
  const [aiModels, setAIModels] = useState<AIModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('deepseek:deepseek-reasoner')
  const [aiTopic, setAITopic] = useState('')
  const [aiCount, setAICount] = useState(10)
  const [aiTypes, setAITypes] = useState<string[]>(['MCQ'])
  const [aiInstructions, setAIInstructions] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState(0)
  const [genTotal, setGenTotal] = useState(0)
  const [genStatus, setGenStatus] = useState('')

  // Import from Excel state
  const [isImporting, setIsImporting] = useState(false)

  // Import from Quiz state
  type QuizSetSummary = { id: string; title: string; questionCount: number }
  type QuizQuestionSummary = { id: string; stem: string; questionType: string; difficulty: string; points: number }
  const [showImportQuizDialog, setShowImportQuizDialog] = useState(false)
  const [importQuizSearch, setImportQuizSearch] = useState('')
  const [importQuizSets, setImportQuizSets] = useState<QuizSetSummary[]>([])
  const [importQuizLoading, setImportQuizLoading] = useState(false)
  const [selectedSourceQuiz, setSelectedSourceQuiz] = useState<QuizSetSummary | null>(null)
  const [sourceQuestions, setSourceQuestions] = useState<QuizQuestionSummary[]>([])
  const [sourceQuestionsLoading, setSourceQuestionsLoading] = useState(false)
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([])
  const [isImportingFromQuiz, setIsImportingFromQuiz] = useState(false)

  useEffect(() => {
    fetchQuestions()
    fetchAIModels()
    fetchDocuments()
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

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`/api/quiz-sets/${params.quizId}/documents`)
      if (res.ok) setDocuments(await res.json())
    } catch {}
  }

  const handleDocUpload = async (file: File) => {
    setIsUploadingDoc(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/quiz-sets/${params.quizId}/documents`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error()
      const doc = await res.json()
      setDocuments((prev) => [doc, ...prev])
      setSelectedDocIds((prev) => [...prev, doc.id])
      toast({ title: `Document "${file.name}" uploaded` })
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' })
    } finally {
      setIsUploadingDoc(false)
    }
  }

  const handleDocDelete = async (docId: string) => {
    setIsDeletingDoc(docId)
    try {
      await fetch(`/api/quiz-sets/${params.quizId}/documents/${docId}`, { method: 'DELETE' })
      setDocuments((prev) => prev.filter((d) => d.id !== docId))
      setSelectedDocIds((prev) => prev.filter((id) => id !== docId))
    } catch {
      toast({ title: 'Failed to delete document', variant: 'destructive' })
    } finally {
      setIsDeletingDoc(null)
    }
  }

  const fetchAIModels = async () => {
    try {
      const res = await fetch('/api/ai-models')
      if (!res.ok) return
      const data: AIModel[] = await res.json()
      setAIModels(data)
    } catch {}
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
      // Build options/correctAnswer for MATCHING
      let patchData = { ...editForm }
      if (editForm.questionType === 'MATCHING') {
        patchData = {
          ...patchData,
          options: { left: editMatchLeft, right: editMatchRight },
          correctAnswer: editForm.correctAnswer || '',
        }
      }
      const res = await fetch(`/api/quiz-sets/${params.quizId}/questions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchData),
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

  // Build options payload for add form
  const buildAddPayload = () => {
    const qt = newQuestion.questionType
    let options: unknown = null
    let correctAnswer: string | null = newQuestion.correctAnswer || null
    let points = newQuestion.points

    if (qt === 'MCQ' || qt === 'MULTIPLE_RESPONSE') {
      options = newQuestion.options.filter((o) => o.trim())
    } else if (qt === 'MATCHING') {
      options = { left: newQuestion.matchLeft, right: newQuestion.matchRight }
    } else if (qt === 'TRUE_FALSE') {
      options = ['True', 'False']
    } else if (qt === 'TEXT_BLOCK') {
      options = null
      correctAnswer = null
      points = 0
    } else {
      options = null
    }

    return {
      stem: newQuestion.stem,
      questionType: qt,
      options,
      correctAnswer,
      explanation: newQuestion.explanation || null,
      difficulty: newQuestion.difficulty,
      points,
      poolTag: newQuestion.poolTag || null,
    }
  }

  const handleAddQuestion = async () => {
    if (!newQuestion.stem.trim()) {
      toast({ title: 'Question text is required', variant: 'destructive' })
      return
    }
    try {
      const payload = buildAddPayload()
      const res = await fetch(`/api/quiz-sets/${params.quizId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      const q = await res.json()
      setQuestions((prev) => [...prev, q])
      setIsAdding(false)
      resetNewQuestion()
      toast({ title: 'Question added' })
    } catch {
      toast({ title: 'Failed to add question', variant: 'destructive' })
    }
  }

  const resetNewQuestion = () => {
    setNewQuestion({
      stem: '',
      questionType: 'MCQ',
      options: ['', '', '', ''],
      correctAnswer: '',
      explanation: '',
      difficulty: 'MEDIUM',
      points: 2,
      poolTag: '',
      matchLeft: ['', ''],
      matchRight: ['', ''],
    })
  }

  // ── AI Generate ──────────────────────────────────────────────────────────────
  const handleAIGenerate = async () => {
    if (!aiTopic.trim() && selectedDocIds.length === 0) {
      toast({ title: 'Enter a topic or select a document first', variant: 'destructive' })
      return
    }
    setIsGenerating(true)
    setGenProgress(0)
    setGenTotal(aiCount)
    setGenStatus('Connecting to AI...')

    try {
      const easy = Math.round(aiCount * 0.2)
      const hard = Math.round(aiCount * 0.2)
      const medium = aiCount - easy - hard

      const res = await fetch(`/api/quiz-sets/${params.quizId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: aiTopic || undefined,
          documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
          totalQuestions: aiCount,
          easyCount: easy,
          mediumCount: medium,
          hardCount: hard,
          questionTypes: aiTypes,
          aiInstructions: aiInstructions || undefined,
          modelId: selectedModel,
        }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'AI connection error')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const newQs: Question[] = []

      const processSSELine = (line: string) => {
        if (!line.startsWith('data: ')) return
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') return
        try {
          const event = JSON.parse(payload)
          if (event.type === 'start') setGenStatus(event.message)
          if (event.type === 'question') {
            newQs.push(event.question)
            setGenProgress(event.progress)
            setGenStatus(`Generated ${event.progress}/${event.total} questions...`)
          }
          if (event.type === 'complete') {
            setGenStatus(`Done: ${event.count} questions`)
            setQuestions((prev) => [...prev, ...newQs])
          }
          if (event.type === 'error') throw new Error(event.message)
        } catch {}
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          // Flush remaining buffer
          if (buffer.trim()) processSSELine(buffer.trim())
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) processSSELine(line)
      }

      toast({ title: `Generated ${newQs.length} questions with AI` })
      setShowAIPanel(false)
      setAITopic('')
    } catch (err) {
      toast({
        title: 'Generation failed',
        description: String(err),
        variant: 'destructive',
      })
    } finally {
      setIsGenerating(false)
      setGenStatus('')
    }
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  const handleExport = async (format: 'testmoz' | 'csv' = 'testmoz') => {
    const res = await fetch(`/api/quiz-sets/${params.quizId}/questions/export?format=${format}`)
    if (!res.ok) {
      toast({ title: 'Export failed', variant: 'destructive' })
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = format === 'csv' ? 'questions.csv' : 'questions_testmoz.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Import ───────────────────────────────────────────────────────────────────
  const handleImport = async (file: File) => {
    setIsImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/quiz-sets/${params.quizId}/questions/import`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      toast({
        title: `Imported ${data.imported} questions`,
        description: data.errors?.length ? `${data.errors.length} rows skipped` : undefined,
      })
      fetchQuestions()
    } catch (err) {
      toast({ title: 'Import failed', description: String(err), variant: 'destructive' })
    } finally {
      setIsImporting(false)
      if (importFileRef.current) importFileRef.current.value = ''
    }
  }

  // ── Import from Quiz ─────────────────────────────────────────────────────────
  const openImportQuizDialog = async () => {
    setShowImportQuizDialog(true)
    setSelectedSourceQuiz(null)
    setSourceQuestions([])
    setSelectedQuestionIds([])
    setImportQuizSearch('')
    await searchImportQuizSets('')
  }

  const searchImportQuizSets = async (q: string) => {
    setImportQuizLoading(true)
    try {
      const res = await fetch(`/api/quiz-sets/${params.quizId}/import-questions?search=${encodeURIComponent(q)}`)
      if (res.ok) setImportQuizSets(await res.json())
    } catch {}
    setImportQuizLoading(false)
  }

  const selectSourceQuiz = async (qs: QuizSetSummary) => {
    setSelectedSourceQuiz(qs)
    setSelectedQuestionIds([])
    setSourceQuestionsLoading(true)
    try {
      const res = await fetch(`/api/quiz-sets/${qs.id}/questions`)
      if (res.ok) {
        const data: QuizQuestionSummary[] = await res.json()
        setSourceQuestions(data)
      }
    } catch {}
    setSourceQuestionsLoading(false)
  }

  const handleImportFromQuiz = async () => {
    if (!selectedSourceQuiz || selectedQuestionIds.length === 0) return
    setIsImportingFromQuiz(true)
    try {
      const res = await fetch(`/api/quiz-sets/${params.quizId}/import-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceQuizSetId: selectedSourceQuiz.id,
          questionIds: selectedQuestionIds,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      toast({ title: `Imported ${data.imported} questions successfully` })
      fetchQuestions()
      setShowImportQuizDialog(false)
    } catch (err) {
      toast({ title: 'Import failed', description: String(err), variant: 'destructive' })
    } finally {
      setIsImportingFromQuiz(false)
    }
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

  const toggleAIType = (type: string) => {
    setAITypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  // Parse matching options
  const parseMatchingOptions = (options: unknown): { left: string[]; right: string[] } => {
    if (!options) return { left: [], right: [] }
    if (typeof options === 'string') {
      try { return JSON.parse(options) } catch { return { left: [], right: [] } }
    }
    if (typeof options === 'object' && !Array.isArray(options)) {
      return options as { left: string[]; right: string[] }
    }
    return { left: [], right: [] }
  }

  // Render question content for viewing
  const renderQuestionView = (q: Question) => {
    if (q.questionType === 'TEXT_BLOCK') {
      return (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded text-blue-800 text-sm italic">
          {q.stem}
        </div>
      )
    }

    if (q.questionType === 'MATCHING') {
      const opts = parseMatchingOptions(q.options)
      let pairs: string[][] = []
      try {
        pairs = q.correctAnswer ? JSON.parse(q.correctAnswer) : []
      } catch {}
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Left</p>
              {opts.left.map((l, i) => (
                <div key={i} className="text-sm px-2 py-1 bg-gray-100 rounded mb-1">{l}</div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Right</p>
              {opts.right.map((r, i) => (
                <div key={i} className="text-sm px-2 py-1 bg-gray-100 rounded mb-1">{r}</div>
              ))}
            </div>
          </div>
          {pairs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Correct matches</p>
              {pairs.map(([l, r], i) => (
                <div key={i} className="text-xs text-[#028a39]">{l} → {r}</div>
              ))}
            </div>
          )}
        </div>
      )
    }

    const options = Array.isArray(q.options) ? q.options as string[] : null

    return (
      <div className="space-y-2 text-sm">
        {options && options.map((opt, i) => (
          <div
            key={i}
            className={`px-3 py-1.5 rounded text-sm ${
              opt === q.correctAnswer
                ? 'bg-[#028a39]/10 text-[#028a39] font-medium'
                : 'text-gray-700'
            }`}
          >
            {String.fromCharCode(65 + i)}. {opt}
            {opt === q.correctAnswer && ' ✓'}
          </div>
        ))}
        {q.correctAnswer && !options && (
          <p className="text-[#028a39] font-medium">Answer: {q.correctAnswer}</p>
        )}
        {q.explanation && (
          <div className="mt-2 p-3 bg-blue-50 rounded text-blue-800 text-xs">
            <p className="font-semibold mb-1">Explanation</p>
            {q.explanation}
          </div>
        )}
      </div>
    )
  }

  // Render edit form for a question
  const renderEditForm = (q: Question) => {
    const qt = editForm.questionType || q.questionType
    const options = Array.isArray(editForm.options) ? editForm.options as string[] : (Array.isArray(q.options) ? q.options as string[] : null)

    return (
      <div className="space-y-3">
        {/* Question text */}
        <Textarea
          value={editForm.stem || ''}
          onChange={(e) => setEditForm({ ...editForm, stem: e.target.value })}
          className="min-h-[80px]"
          placeholder="Question text..."
        />

        {/* Type + Difficulty + Points */}
        <div className="grid grid-cols-3 gap-2">
          <Select
            value={qt}
            onValueChange={(v) => {
              const newEditForm = { ...editForm, questionType: v }
              setEditForm(newEditForm)
              if (v === 'MATCHING') {
                const mo = parseMatchingOptions(q.options)
                setEditMatchLeft(mo.left.length ? mo.left : ['', ''])
                setEditMatchRight(mo.right.length ? mo.right : ['', ''])
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ALL_QUESTION_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={editForm.difficulty || q.difficulty}
            onValueChange={(v) => setEditForm({ ...editForm, difficulty: v })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="EASY">Easy</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HARD">Hard</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="Points"
            value={editForm.points ?? q.points}
            onChange={(e) => setEditForm({ ...editForm, points: Number(e.target.value) })}
          />
        </div>

        {/* Pool tag */}
        <Input
          placeholder="Question Pool (optional)"
          value={editForm.poolTag ?? q.poolTag ?? ''}
          onChange={(e) => setEditForm({ ...editForm, poolTag: e.target.value })}
          className="h-8 text-xs"
        />

        {/* Type-specific fields */}
        {(qt === 'MCQ' || qt === 'MULTIPLE_RESPONSE') && options && (
          <div className="space-y-1">
            {options.map((opt: string, i: number) => (
              <Input
                key={i}
                value={opt}
                onChange={(e) => {
                  const opts = [...(Array.isArray(editForm.options) ? editForm.options as string[] : options)]
                  opts[i] = e.target.value
                  setEditForm({ ...editForm, options: opts })
                }}
                placeholder={`Option ${String.fromCharCode(65 + i)}`}
                className="h-8 text-xs"
              />
            ))}
            <Input
              value={editForm.correctAnswer || ''}
              onChange={(e) => setEditForm({ ...editForm, correctAnswer: e.target.value })}
              placeholder={qt === 'MULTIPLE_RESPONSE' ? 'Correct answers (separated by ||)' : 'Correct answer (exact text)'}
              className="h-8 text-xs"
            />
          </div>
        )}

        {qt === 'TRUE_FALSE' && (
          <Input
            value={editForm.correctAnswer || ''}
            onChange={(e) => setEditForm({ ...editForm, correctAnswer: e.target.value })}
            placeholder="Correct answer: True or False"
            className="h-8 text-xs"
          />
        )}

        {(qt === 'SHORT_ANSWER' || qt === 'FILL_BLANK') && (
          <Input
            value={editForm.correctAnswer || ''}
            onChange={(e) => setEditForm({ ...editForm, correctAnswer: e.target.value })}
            placeholder="Correct answer"
            className="h-8 text-xs"
          />
        )}

        {qt === 'MATCHING' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Left items</Label>
                {editMatchLeft.map((v, i) => (
                  <Input
                    key={i}
                    value={v}
                    onChange={(e) => {
                      const l = [...editMatchLeft]; l[i] = e.target.value; setEditMatchLeft(l)
                    }}
                    placeholder={`Left ${i + 1}`}
                    className="h-8 text-xs mb-1"
                  />
                ))}
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditMatchLeft([...editMatchLeft, ''])}>
                  + Add left
                </Button>
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Right items</Label>
                {editMatchRight.map((v, i) => (
                  <Input
                    key={i}
                    value={v}
                    onChange={(e) => {
                      const r = [...editMatchRight]; r[i] = e.target.value; setEditMatchRight(r)
                    }}
                    placeholder={`Right ${i + 1}`}
                    className="h-8 text-xs mb-1"
                  />
                ))}
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditMatchRight([...editMatchRight, ''])}>
                  + Add right
                </Button>
              </div>
            </div>
            <Input
              value={editForm.correctAnswer || ''}
              onChange={(e) => setEditForm({ ...editForm, correctAnswer: e.target.value })}
              placeholder='Correct pairs JSON e.g. [["A","1"],["B","2"]]'
              className="h-8 text-xs font-mono"
            />
          </div>
        )}

        {/* Explanation */}
        {qt !== 'TEXT_BLOCK' && (
          <Textarea
            value={editForm.explanation || ''}
            onChange={(e) => setEditForm({ ...editForm, explanation: e.target.value })}
            placeholder="Explanation (optional)..."
            className="min-h-[60px] text-xs"
          />
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-[#028a39] hover:bg-[#026d2e] text-white"
            onClick={() => handleSaveEdit(q.id)}
          >
            <Check className="h-4 w-4 mr-1" />
            Save
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Documents Panel */}
      {documents.length > 0 && (
        <Card className="mb-4 border-gray-200">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-gray-500" />
                Uploaded Documents ({documents.length})
              </span>
              <input
                ref={docInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocUpload(f); e.target.value = '' }}
              />
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => docInputRef.current?.click()} disabled={isUploadingDoc}>
                {isUploadingDoc ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                Add Document
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="flex flex-wrap gap-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border cursor-pointer transition-colors ${
                    selectedDocIds.includes(doc.id)
                      ? 'bg-[#028a39]/10 border-[#028a39] text-[#028a39]'
                      : 'bg-gray-50 border-gray-200 text-gray-600'
                  }`}
                  onClick={() =>
                    setSelectedDocIds((prev) =>
                      prev.includes(doc.id) ? prev.filter((id) => id !== doc.id) : [...prev, doc.id]
                    )
                  }
                >
                  <FileSpreadsheet className="h-3 w-3" />
                  <span className="max-w-[160px] truncate">{doc.fileName}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDocDelete(doc.id) }}
                    disabled={isDeletingDoc === doc.id}
                    className="ml-1 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            {selectedDocIds.length > 0 && (
              <p className="text-xs text-[#028a39] mt-2">{selectedDocIds.length} document(s) selected for AI generation</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold">Question Bank</h1>
        <div className="flex gap-2 flex-wrap">
          {/* Upload Document for AI */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocUpload(f); e.target.value = '' }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingDoc}
          >
            {isUploadingDoc ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Upload Document
          </Button>

          {/* Import Excel */}
          <input
            ref={importFileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImport(file)
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => importFileRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            Import Excel
          </Button>

          {/* Export */}
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => handleExport('testmoz')}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export TestMoz
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
          </div>

          {/* AI Generate */}
          <Button
            size="sm"
            className="bg-[#028a39] hover:bg-[#026d2e] text-white"
            onClick={() => setShowAIPanel((v) => !v)}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Generate with AI
          </Button>

          {/* Import from Quiz */}
          <Button variant="outline" size="sm" onClick={openImportQuizDialog}>
            <Copy className="h-4 w-4 mr-2" />
            Import from Quiz
          </Button>

          {/* Add Manual */}
          <Button variant="outline" size="sm" onClick={() => { setIsAdding(true); resetNewQuestion() }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Question
          </Button>
        </div>
      </div>

      {/* AI Generate Panel */}
      {showAIPanel && (
        <Card className="mb-5 border-[#028a39]/40 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#028a39]" />
                Generate Questions with AI
              </CardTitle>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAIPanel(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Model Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">AI Model</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select AI model..." />
                </SelectTrigger>
                <SelectContent>
                  {aiModels.length > 0 ? (
                    aiModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))
                  ) : (
                    <>
                      <SelectItem value="deepseek:deepseek-reasoner">DeepSeek Reasoner (Default)</SelectItem>
                      <SelectItem value="openrouter:xiaomi/mimo-v2-pro">OpenRouter — xiaomi/mimo-v2-pro</SelectItem>
                      <SelectItem value="openrouter:qwen/qwen3-plus">OpenRouter — qwen/qwen3-plus</SelectItem>
                      <SelectItem value="anthropic:claude-haiku-4-5">Anthropic — Claude Haiku 4.5</SelectItem>
                      <SelectItem value="anthropic:claude-sonnet-4-5">Anthropic — Claude Sonnet 4.5</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Documents context */}
            {documents.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Source Documents (click to select)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {documents.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      disabled={isGenerating}
                      onClick={() =>
                        setSelectedDocIds((prev) =>
                          prev.includes(doc.id) ? prev.filter((id) => id !== doc.id) : [...prev, doc.id]
                        )
                      }
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        selectedDocIds.includes(doc.id)
                          ? 'bg-[#028a39] text-white border-[#028a39]'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      {doc.fileName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Topic */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">
                Topic / Additional Content
                {documents.length === 0 && <span className="text-red-500 ml-1">*</span>}
              </Label>
              <Textarea
                placeholder={documents.length > 0
                  ? 'Optional: add specific topic, chapter, or instructions...'
                  : 'Paste document content, paste text, or describe the topic...'}
                className="min-h-[100px] text-sm"
                value={aiTopic}
                onChange={(e) => setAITopic(e.target.value)}
                disabled={isGenerating}
              />
              {documents.length === 0 && !aiTopic.trim() && (
                <p className="text-xs text-amber-600">Tip: Upload a document first or paste content here</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Number of questions */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Number of questions</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={aiCount}
                  onChange={(e) => setAICount(Number(e.target.value))}
                  className="h-9"
                  disabled={isGenerating}
                />
              </div>

              {/* Question types */}
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs text-gray-600">Question types</Label>
                <div className="flex gap-1.5 flex-wrap pt-1">
                  {ALL_QUESTION_TYPES.filter(t => t.value !== 'TEXT_BLOCK').map((t) => (
                    <button
                      key={t.value}
                      onClick={() => toggleAIType(t.value)}
                      disabled={isGenerating}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        aiTypes.includes(t.value)
                          ? 'bg-[#028a39] text-white border-[#028a39]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#028a39]'
                      }`}
                    >
                      {TYPE_LABEL[t.value] || t.value}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Extra instructions */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Additional instructions (optional)</Label>
              <Input
                placeholder="e.g. Focus on chapter 3, formal language..."
                value={aiInstructions}
                onChange={(e) => setAIInstructions(e.target.value)}
                className="h-9 text-sm"
                disabled={isGenerating}
              />
            </div>

            {/* Progress */}
            {isGenerating && (
              <div className="space-y-2">
                <Progress value={genTotal > 0 ? (genProgress / genTotal) * 100 : 0} className="h-1.5" />
                <p className="text-xs text-gray-500">{genStatus}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAIPanel(false)}
                disabled={isGenerating}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-[#028a39] hover:bg-[#026d2e] text-white min-w-[120px]"
                onClick={handleAIGenerate}
                disabled={isGenerating || (selectedDocIds.length === 0 && !aiTopic.trim())}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate {aiCount} Questions
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
            <SelectItem value="all">All Difficulties</SelectItem>
            <SelectItem value="EASY">Easy</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HARD">Hard</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {ALL_QUESTION_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        {filtered.length} / {questions.length} questions
      </p>

      {/* Add Question Form (Modal-like inline panel) */}
      {isAdding && (
        <Card className="mb-4 border-[#028a39]/40 shadow-md">
          <CardHeader className="pb-2 pt-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Plus className="h-4 w-4 text-[#028a39]" />
              Add New Question
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsAdding(false)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {/* Question type selector */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-1">
              {ALL_QUESTION_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setNewQuestion({ ...newQuestion, questionType: t.value, options: ['', '', '', ''], correctAnswer: '', matchLeft: ['', ''], matchRight: ['', ''] })}
                  className={`text-xs px-2.5 py-1.5 rounded border transition-colors text-left ${
                    newQuestion.questionType === t.value
                      ? 'bg-[#028a39] text-white border-[#028a39]'
                      : 'border-gray-200 text-gray-600 hover:border-[#028a39]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Question text */}
            <Textarea
              placeholder={newQuestion.questionType === 'TEXT_BLOCK' ? 'Header / instruction text...' : 'Question text...'}
              value={newQuestion.stem}
              onChange={(e) => setNewQuestion({ ...newQuestion, stem: e.target.value })}
              className="min-h-[80px]"
            />

            {/* Difficulty, Points */}
            {newQuestion.questionType !== 'TEXT_BLOCK' && (
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={newQuestion.difficulty}
                  onValueChange={(v) => setNewQuestion({ ...newQuestion, difficulty: v })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
                  className="h-9"
                />
              </div>
            )}

            {/* Pool tag */}
            <Input
              placeholder="Question Pool (optional) e.g. Pool A, Chapter 1"
              value={newQuestion.poolTag}
              onChange={(e) => setNewQuestion({ ...newQuestion, poolTag: e.target.value })}
              className="h-9 text-sm"
            />

            {/* MCQ / MULTIPLE_RESPONSE options */}
            {(newQuestion.questionType === 'MCQ' || newQuestion.questionType === 'MULTIPLE_RESPONSE') && (
              <div className="space-y-2">
                <Label className="text-xs text-gray-600">Options</Label>
                {newQuestion.options.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      value={opt}
                      onChange={(e) => {
                        const opts = [...newQuestion.options]
                        opts[i] = e.target.value
                        setNewQuestion({ ...newQuestion, options: opts })
                      }}
                      className="h-9"
                    />
                    {newQuestion.options.length > 2 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={() => {
                          const opts = newQuestion.options.filter((_, j) => j !== i)
                          setNewQuestion({ ...newQuestion, options: opts })
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setNewQuestion({ ...newQuestion, options: [...newQuestion.options, ''] })}
                >
                  + Add option
                </Button>
                <Input
                  placeholder={newQuestion.questionType === 'MULTIPLE_RESPONSE' ? 'Correct answers (separated by ||)' : 'Correct answer (exact text of correct option)'}
                  value={newQuestion.correctAnswer}
                  onChange={(e) => setNewQuestion({ ...newQuestion, correctAnswer: e.target.value })}
                  className="h-9"
                />
              </div>
            )}

            {/* TRUE_FALSE */}
            {newQuestion.questionType === 'TRUE_FALSE' && (
              <div className="space-y-2">
                <Label className="text-xs text-gray-600">Correct answer</Label>
                <div className="flex gap-2">
                  {['True', 'False'].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setNewQuestion({ ...newQuestion, correctAnswer: opt })}
                      className={`flex-1 py-2 rounded border font-medium text-sm transition-colors ${
                        newQuestion.correctAnswer === opt
                          ? 'bg-[#028a39] text-white border-[#028a39]'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* FILL_BLANK / SHORT_ANSWER */}
            {(newQuestion.questionType === 'FILL_BLANK' || newQuestion.questionType === 'SHORT_ANSWER') && (
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Correct answer</Label>
                <Input
                  placeholder="Correct answer"
                  value={newQuestion.correctAnswer}
                  onChange={(e) => setNewQuestion({ ...newQuestion, correctAnswer: e.target.value })}
                  className="h-9"
                />
              </div>
            )}

            {/* MATCHING */}
            {newQuestion.questionType === 'MATCHING' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-600 mb-1 block">Left items</Label>
                    {newQuestion.matchLeft.map((v, i) => (
                      <div key={i} className="flex gap-1 mb-1">
                        <Input
                          value={v}
                          onChange={(e) => {
                            const l = [...newQuestion.matchLeft]; l[i] = e.target.value
                            setNewQuestion({ ...newQuestion, matchLeft: l })
                          }}
                          placeholder={`Left ${i + 1}`}
                          className="h-8 text-sm"
                        />
                        {newQuestion.matchLeft.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                            const l = newQuestion.matchLeft.filter((_, j) => j !== i)
                            setNewQuestion({ ...newQuestion, matchLeft: l })
                          }}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setNewQuestion({ ...newQuestion, matchLeft: [...newQuestion.matchLeft, ''] })}>
                      + Add
                    </Button>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600 mb-1 block">Right items</Label>
                    {newQuestion.matchRight.map((v, i) => (
                      <div key={i} className="flex gap-1 mb-1">
                        <Input
                          value={v}
                          onChange={(e) => {
                            const r = [...newQuestion.matchRight]; r[i] = e.target.value
                            setNewQuestion({ ...newQuestion, matchRight: r })
                          }}
                          placeholder={`Right ${i + 1}`}
                          className="h-8 text-sm"
                        />
                        {newQuestion.matchRight.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                            const r = newQuestion.matchRight.filter((_, j) => j !== i)
                            setNewQuestion({ ...newQuestion, matchRight: r })
                          }}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setNewQuestion({ ...newQuestion, matchRight: [...newQuestion.matchRight, ''] })}>
                      + Add
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Correct pairs (JSON)</Label>
                  <Input
                    placeholder='e.g. [["A","1"],["B","2"]]'
                    value={newQuestion.correctAnswer}
                    onChange={(e) => setNewQuestion({ ...newQuestion, correctAnswer: e.target.value })}
                    className="h-9 font-mono text-xs"
                  />
                  <p className="text-xs text-gray-500">Format: array of [left, right] pairs</p>
                </div>
              </div>
            )}

            {/* Explanation (not for TEXT_BLOCK) */}
            {newQuestion.questionType !== 'TEXT_BLOCK' && (
              <Textarea
                placeholder="Explanation (optional)..."
                value={newQuestion.explanation}
                onChange={(e) => setNewQuestion({ ...newQuestion, explanation: e.target.value })}
                className="min-h-[60px] text-sm"
              />
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-[#028a39] hover:bg-[#026d2e] text-white"
                onClick={handleAddQuestion}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Question
              </Button>
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
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No questions yet</p>
          <p className="text-xs mt-1">Use AI to generate, import from Excel, or add manually</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((q, index) => {
            // Find the original index (sort order number)
            const questionNumber = (q.sortOrder ?? 0) + 1

            return (
              <Card key={q.id} className="overflow-hidden">
                <div
                  className="p-4 flex items-start justify-between gap-2 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Question number badge */}
                    <span className="shrink-0 mt-0.5 bg-gray-100 text-gray-700 text-xs font-bold rounded px-1.5 py-0.5 min-w-[2rem] text-center">
                      #{questionNumber}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-2">{q.stem}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <Badge variant="outline" className="text-xs py-0">{TYPE_LABEL[q.questionType] || q.questionType}</Badge>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${difficultyColor[q.difficulty] || 'bg-gray-100 text-gray-600'}`}>
                          {q.difficulty}
                        </span>
                        <span className="text-xs text-gray-500">{q.points} pts</span>
                        {q.poolTag && (
                          <Badge variant="secondary" className="text-xs py-0 bg-purple-100 text-purple-700">
                            {q.poolTag}
                          </Badge>
                        )}
                        {q.questionType === 'TEXT_BLOCK' && (
                          <Badge className="text-xs py-0 bg-blue-100 text-blue-700 border-blue-200">
                            non-interactive
                          </Badge>
                        )}
                      </div>
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
                        setEditForm({ ...q })
                        setExpandedId(q.id)
                        // Init matching state
                        if (q.questionType === 'MATCHING') {
                          const mo = parseMatchingOptions(q.options)
                          setEditMatchLeft(mo.left.length ? mo.left : ['', ''])
                          setEditMatchRight(mo.right.length ? mo.right : ['', ''])
                        }
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
                    {expandedId === q.id ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </div>

                {expandedId === q.id && (
                  <div className="border-t p-4 bg-gray-50">
                    {editingId === q.id ? renderEditForm(q) : renderQuestionView(q)}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Import from Quiz Dialog */}
      <Dialog open={showImportQuizDialog} onOpenChange={setShowImportQuizDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5" />
              Import Questions from Another Quiz
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col gap-4 py-2">
            {!selectedSourceQuiz ? (
              // Step 1: Select quiz set
              <>
                <div className="space-y-2">
                  <Label>Search Quiz Sets</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search by title..."
                      value={importQuizSearch}
                      onChange={(e) => setImportQuizSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchImportQuizSets(importQuizSearch)}
                    />
                    <Button variant="outline" onClick={() => searchImportQuizSets(importQuizSearch)} disabled={importQuizLoading}>
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {importQuizLoading && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  )}
                  {!importQuizLoading && importQuizSets.length === 0 && (
                    <p className="text-center text-gray-400 py-8">No other quiz sets found</p>
                  )}
                  {importQuizSets.map((qs) => (
                    <Card
                      key={qs.id}
                      className="cursor-pointer hover:border-primary transition-colors"
                      onClick={() => selectSourceQuiz(qs)}
                    >
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{qs.title}</p>
                          <p className="text-sm text-gray-500">{qs.questionCount} questions</p>
                        </div>
                        <ChevronDown className="h-4 w-4 text-gray-400 -rotate-90" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            ) : (
              // Step 2: Select questions from chosen quiz
              <>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedSourceQuiz(null)}>
                    <ChevronDown className="h-4 w-4 rotate-90" />
                    Back
                  </Button>
                  <div>
                    <p className="font-semibold">{selectedSourceQuiz.title}</p>
                    <p className="text-xs text-gray-500">{selectedSourceQuiz.questionCount} questions</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedQuestionIds.length === sourceQuestions.length) {
                        setSelectedQuestionIds([])
                      } else {
                        setSelectedQuestionIds(sourceQuestions.map((q) => q.id))
                      }
                    }}
                  >
                    {selectedQuestionIds.length === sourceQuestions.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  {selectedQuestionIds.length > 0 && (
                    <span className="text-sm text-primary font-medium">{selectedQuestionIds.length} selected</span>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {sourceQuestionsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : (
                    sourceQuestions.map((q) => (
                      <div
                        key={q.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedQuestionIds.includes(q.id)
                            ? 'border-primary bg-primary/5'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() =>
                          setSelectedQuestionIds((prev) =>
                            prev.includes(q.id) ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                          )
                        }
                      >
                        <Checkbox
                          checked={selectedQuestionIds.includes(q.id)}
                          onCheckedChange={() => {}}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-2">{q.stem}</p>
                          <div className="flex gap-1.5 mt-1">
                            <Badge variant="outline" className="text-xs">{TYPE_LABEL[q.questionType] || q.questionType}</Badge>
                            <Badge variant="outline" className="text-xs">{q.difficulty}</Badge>
                            <Badge variant="secondary" className="text-xs">{q.points}pt</Badge>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportQuizDialog(false)}>Cancel</Button>
            {selectedSourceQuiz && (
              <Button
                onClick={handleImportFromQuiz}
                disabled={selectedQuestionIds.length === 0 || isImportingFromQuiz}
                className="bg-[#028a39] hover:bg-[#026d2e] text-white"
              >
                {isImportingFromQuiz ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</>
                ) : (
                  <>Import {selectedQuestionIds.length} Question{selectedQuestionIds.length !== 1 ? 's' : ''}</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
