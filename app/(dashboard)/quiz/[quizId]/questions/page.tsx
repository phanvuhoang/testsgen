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

type AIModel = {
  id: string
  label: string
  provider: string
  model: string
}

export default function QuizQuestionsPage() {
  const params = useParams()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [questions, setQuestions] = useState<Question[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Question>>({})
  // Documents state
  const [documents, setDocuments] = useState<{ id: string; fileName: string; fileType: string; fileSize: number }[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [isUploadingDoc, setIsUploadingDoc] = useState(false)
  const [isDeletingDoc, setIsDeletingDoc] = useState<string | null>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

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

  // Import state
  const [isImporting, setIsImporting] = useState(false)

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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') break
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
      if (fileInputRef.current) fileInputRef.current.value = ''
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Documents Panel (always visible) */}
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
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocUpload(f); }}
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
            ref={docInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocUpload(f) }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => docInputRef.current?.click()}
            disabled={isUploadingDoc}
          >
            {isUploadingDoc ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Upload Document
          </Button>

          {/* Import TestMoz */}
          <input
            ref={fileInputRef}
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
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            Import Questions
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

          {/* Add Manual */}
          <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
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
                  ? 'Optional: add specific topic, chapter, or instructions to focus the questions...'
                  : 'Paste document content, paste text, or describe the topic to generate questions about...'}
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
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Question types</Label>
                <div className="flex gap-1.5 flex-wrap pt-1">
                  {['MCQ', 'TRUE_FALSE', 'SHORT_ANSWER'].map((type) => (
                    <button
                      key={type}
                      onClick={() => toggleAIType(type)}
                      disabled={isGenerating}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        aiTypes.includes(type)
                          ? 'bg-[#028a39] text-white border-[#028a39]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#028a39]'
                      }`}
                    >
                      {type === 'MCQ' ? 'MCQ' : type === 'TRUE_FALSE' ? 'True/False' : 'Short Answer'}
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
            <SelectItem value="all">All</SelectItem>
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
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="MCQ">MCQ</SelectItem>
            <SelectItem value="TRUE_FALSE">True/False</SelectItem>
            <SelectItem value="SHORT_ANSWER">Short Answer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        {filtered.length} / {questions.length} questions
      </p>

      {/* Add Question Form */}
      {isAdding && (
        <Card className="mb-4 border-[#028a39]/40">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-sm">New Question</h3>
            <Textarea
              placeholder="Question content..."
              value={newQuestion.stem}
              onChange={(e) => setNewQuestion({ ...newQuestion, stem: e.target.value })}
              className="min-h-[80px]"
            />
            <div className="grid grid-cols-3 gap-2">
              <Select
                value={newQuestion.questionType}
                onValueChange={(v) => setNewQuestion({ ...newQuestion, questionType: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MCQ">MCQ</SelectItem>
                  <SelectItem value="TRUE_FALSE">True/False</SelectItem>
                  <SelectItem value="SHORT_ANSWER">Short Answer</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={newQuestion.difficulty}
                onValueChange={(v) => setNewQuestion({ ...newQuestion, difficulty: v })}
              >
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
                  placeholder="Correct answer (enter the exact text of the correct option)"
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
              <Button variant="outline" size="sm" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-[#028a39] hover:bg-[#026d2e] text-white"
                onClick={handleAddQuestion}
              >
                Add
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
          <p className="text-xs mt-1">Use AI to generate, import from TestMoz Excel, or add manually</p>
        </div>
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
                  {expandedId === q.id ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
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
                              placeholder={`Option ${String.fromCharCode(65 + i)}`}
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
                  ) : (
                    <div className="space-y-2 text-sm">
                      {q.options &&
                        q.options.map((opt, i) => (
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
                      {q.correctAnswer && !q.options && (
                        <p className="text-[#028a39] font-medium">Answer: {q.correctAnswer}</p>
                      )}
                      {q.explanation && (
                        <div className="mt-2 p-3 bg-blue-50 rounded text-blue-800 text-xs">
                          <p className="font-semibold mb-1">Explanation</p>
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
