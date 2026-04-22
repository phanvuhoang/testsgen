'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/components/ui/use-toast'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Pencil,
  Trash2,
  X,
  BookOpen,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type Section = {
  id: string
  name: string
  questionType: string
  marksPerQuestion: number
  questionsInBank: number
  questionsInExam: number
  aiInstructions: string | null
  questionTypes: string | null
  topicBreakdown: string | null
}

type QTypeRow = { type: string; count: number; marksEach: number }
type TopicRow = { topicId?: string; topicName: string; count: number }

type SectionGenConfig = {
  sectionId: string
  enabled: boolean
  totalCount: number
  qtRows: (QTypeRow & { generateCount: number })[]
  topicRows: (TopicRow & { generateCount: number })[]
  referenceQuestionId?: string
  customInstructions?: string
}

type GeneratedQuestion = {
  id: string
  stem: string
  questionType: string
  options: string[] | null
  correctAnswer: string | null
  markingScheme: string | null
  modelAnswer: string | null
  topic: string | null
  difficulty: string
  marks: number
  status: string
  sectionId: string | null
  section?: { id: string; name: string } | null
}

type ParsedSampleQ = { id: string; title: string | null; content: string; questionType: string }

// ─── Constants ───────────────────────────────────────────────────────────────

const qtypeLabels: Record<string, string> = {
  MCQ_SINGLE: 'MCQ (1 correct)',
  MCQ_MULTIPLE: 'MCQ (multi)',
  FILL_BLANK: 'Fill blank',
  SHORT_ANSWER: 'Short answer',
  ESSAY: 'Essay',
  SCENARIO: 'Scenario',
  CASE_STUDY: 'Case study',
  OTHER: 'Other',
}

const docTypeLabels: Record<string, string> = {
  SYLLABUS: 'Syllabus',
  TAX_REGULATIONS: 'Regulations',
  SAMPLE_QUESTIONS: 'Sample Questions',
  STUDY_MATERIAL: 'Study Material',
  RATES_TARIFF: 'Rates/Tariff',
  OTHER: 'Other',
}

const difficultyColors: Record<string, string> = {
  EASY: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HARD: 'bg-red-100 text-red-700',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GeneratePage() {
  const params = useParams()
  const { toast } = useToast()
  const sessionId = params.sessionId as string
  const projectId = params.projectId as string

  // Config state
  const [sections, setSections] = useState<Section[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sectionConfigs, setSectionConfigs] = useState<Record<string, SectionGenConfig>>({})
  const [expandedSec, setExpandedSec] = useState<Set<string>>(new Set())
  const [extraInstructions, setExtraInstructions] = useState('')
  const [selectedModel, setSelectedModel] = useState('deepseek:deepseek-reasoner')
  const [aiModels, setAIModels] = useState<{ id: string; label: string }[]>([])
  const [docSummary, setDocSummary] = useState<{ type: string; count: number }[]>([])
  const [sampleQuestions, setSampleQuestions] = useState<ParsedSampleQ[]>([])

  // Job / generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<string>('')
  const [progress, setProgress] = useState(0)
  const [totalToGen, setTotalToGen] = useState(0)
  const [isDone, setIsDone] = useState(false)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Results state
  const [generated, setGenerated] = useState<GeneratedQuestion[]>([])
  const [expandedQId, setExpandedQId] = useState<string | null>(null)
  const [editingQ, setEditingQ] = useState<Record<string, Partial<GeneratedQuestion>>>({})
  const [savingQId, setSavingQId] = useState<string | null>(null)
  const [regenQId, setRegenQId] = useState<string | null>(null)
  const [deletingQId, setDeletingQId] = useState<string | null>(null)

  // ─── Fetch initial data ────────────────────────────────────────────────────

  useEffect(() => {
    fetchData()
    checkForActiveJob()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [secRes, docRes, sampleRes, modelRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}/sections`),
        fetch(`/api/sessions/${sessionId}/documents`),
        fetch(`/api/sessions/${sessionId}/parsed-questions`),
        fetch('/api/ai-models').catch(() => ({ ok: false })),
      ])

      if (secRes.ok) {
        const data: Section[] = await secRes.json()
        setSections(data)
        const configs: Record<string, SectionGenConfig> = {}
        data.forEach((sec) => {
          let qtRows: (QTypeRow & { generateCount: number })[] = []
          let topicRows: (TopicRow & { generateCount: number })[] = []
          try {
            if (sec.questionTypes) {
              const parsed = JSON.parse(sec.questionTypes)
              qtRows = parsed.map((r: QTypeRow) => ({ ...r, generateCount: r.count }))
            }
          } catch {}
          try {
            if (sec.topicBreakdown) {
              const parsed = JSON.parse(sec.topicBreakdown)
              topicRows = parsed.map((r: TopicRow) => ({ ...r, generateCount: r.count }))
            }
          } catch {}
          if (qtRows.length === 0) {
            qtRows = [
              {
                type: sec.questionType,
                count: sec.questionsInExam || 15,
                marksEach: sec.marksPerQuestion,
                generateCount: sec.questionsInBank || 20,
              },
            ]
          }
          configs[sec.id] = {
            sectionId: sec.id,
            enabled: false,
            totalCount: sec.questionsInBank || 20,
            qtRows,
            topicRows,
          }
        })
        setSectionConfigs(configs)
      }

      if (docRes.ok) {
        const docs: any[] = await docRes.json()
        const typeCount: Record<string, number> = {}
        for (const d of docs) {
          typeCount[d.fileType] = (typeCount[d.fileType] || 0) + 1
        }
        setDocSummary(Object.entries(typeCount).map(([type, count]) => ({ type, count })))
      }

      if (sampleRes.ok) {
        const samples: ParsedSampleQ[] = await sampleRes.json()
        setSampleQuestions(samples.slice(0, 50))
      }

      if ('ok' in modelRes && modelRes.ok) {
        const models = await (modelRes as Response).json()
        setAIModels(models)
      }
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Check for active background job on mount (no localStorage) ────────────

  const checkForActiveJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/generate-jobs?active=1`)
      if (!res.ok) return
      const jobs: any[] = await res.json()
      if (jobs.length > 0) {
        const job = jobs[0]
        setActiveJobId(job.id)
        setProgress(job.progress || 0)
        setTotalToGen(job.total || 0)
        setJobStatus(job.status)
        if (job.status === 'RUNNING' || job.status === 'PENDING') {
          setIsGenerating(true)
          pollJobStatus(job.id)
        } else if (job.status === 'DONE') {
          setIsDone(true)
          fetchRecentQuestions()
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // ─── Fetch generated questions ─────────────────────────────────────────────

  const fetchRecentQuestions = async (limit = 100) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/questions?limit=${limit}`)
      if (res.ok) {
        const data = await res.json()
        setGenerated(data)
      }
    } catch {}
  }

  // ─── Poll job status ───────────────────────────────────────────────────────

  const pollJobStatus = useCallback(
    (jobId: string) => {
      const poll = async () => {
        try {
          const res = await fetch(`/api/sessions/${sessionId}/generate-jobs/${jobId}`)
          if (!res.ok) {
            setIsGenerating(false)
            return
          }
          const job = await res.json()
          setProgress(job.progress || 0)
          setTotalToGen(job.total || 0)
          setJobStatus(job.status)

          if (job.status === 'DONE') {
            setIsDone(true)
            setIsGenerating(false)
            await fetchRecentQuestions()
            toast({ title: `✓ ${job.progress} questions generated`, description: 'Saved to question bank.' })
          } else if (job.status === 'FAILED') {
            setIsGenerating(false)
            toast({
              title: 'Generation failed',
              description: job.error || 'An unknown error occurred',
              variant: 'destructive',
            })
          } else {
            pollRef.current = setTimeout(poll, 2000)
          }
        } catch {
          pollRef.current = setTimeout(poll, 3000)
        }
      }
      poll()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId]
  )

  // ─── Start generation ──────────────────────────────────────────────────────

  const handleGenerate = async () => {
    const enabledConfigs = Object.values(sectionConfigs).filter((c) => c.enabled)
    if (enabledConfigs.length === 0) {
      toast({ title: 'Select at least one section', variant: 'destructive' })
      return
    }

    if (pollRef.current) clearTimeout(pollRef.current)
    setIsGenerating(true)
    setGenerated([])
    setIsDone(false)
    setProgress(0)
    setActiveJobId(null)

    // Build sectionConfigs payload
    const sectionConfigsPayload = enabledConfigs.map((c) => ({
      sectionId: c.sectionId,
      count: c.totalCount,
      qtRows: c.qtRows,
      topicRows: c.topicRows,
      referenceQuestionId: c.referenceQuestionId,
      customInstructions: c.customInstructions,
    }))

    try {
      // 1. Create the job record in DB
      const jobRes = await fetch(`/api/sessions/${sessionId}/generate-jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionConfigs: sectionConfigsPayload,
          extraInstructions,
          modelId: selectedModel,
        }),
      })

      if (!jobRes.ok) throw new Error('Failed to create generation job')
      const job = await jobRes.json()
      setActiveJobId(job.id)
      setTotalToGen(job.total || 0)

      // 2. Fire-and-forget: trigger the /run route (don't await)
      fetch(`/api/sessions/${sessionId}/generate-jobs/${job.id}/run`, { method: 'POST' }).catch(() => {})

      // 3. Start polling
      pollJobStatus(job.id)
    } catch (e) {
      setIsGenerating(false)
      toast({ title: 'Failed to start generation', description: String(e), variant: 'destructive' })
    }
  }

  // ─── Cancel job ───────────────────────────────────────────────────────────

  const handleCancelJob = async () => {
    if (!activeJobId) return
    if (pollRef.current) clearTimeout(pollRef.current)
    try {
      await fetch(`/api/sessions/${sessionId}/generate-jobs/${activeJobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'FAILED' }),
      })
    } catch {}
    setIsGenerating(false)
    setJobStatus('FAILED')
    toast({ title: 'Generation cancelled' })
    // Fetch whatever was generated so far
    await fetchRecentQuestions()
  }

  // ─── Edit helpers ──────────────────────────────────────────────────────────

  const getEditState = (q: GeneratedQuestion): GeneratedQuestion => ({
    ...q,
    ...(editingQ[q.id] || {}),
  })

  const updateEdit = (qId: string, updates: Partial<GeneratedQuestion>) => {
    setEditingQ((prev) => ({ ...prev, [qId]: { ...(prev[qId] || {}), ...updates } }))
  }

  const handleSaveQuestion = async (q: GeneratedQuestion) => {
    const edits = editingQ[q.id]
    if (!edits || Object.keys(edits).length === 0) {
      setExpandedQId(null)
      return
    }
    setSavingQId(q.id)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/questions/${q.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edits),
      })
      if (!res.ok) throw new Error('Save failed')
      const updated = await res.json()
      setGenerated((prev) => prev.map((item) => (item.id === q.id ? { ...item, ...updated } : item)))
      setEditingQ((prev) => {
        const n = { ...prev }
        delete n[q.id]
        return n
      })
      setExpandedQId(null)
      toast({ title: 'Question saved' })
    } catch (e) {
      toast({ title: 'Save failed', description: String(e), variant: 'destructive' })
    } finally {
      setSavingQId(null)
    }
  }

  const handleRegenQuestion = async (q: GeneratedQuestion) => {
    setRegenQId(q.id)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/questions/${q.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: selectedModel }),
      })
      if (!res.ok) throw new Error('Regeneration failed')
      const updated = await res.json()
      setGenerated((prev) => prev.map((item) => (item.id === q.id ? { ...item, ...updated } : item)))
      // Clear any stale edits for this question
      setEditingQ((prev) => {
        const n = { ...prev }
        delete n[q.id]
        return n
      })
      if (expandedQId === q.id) setExpandedQId(null)
      toast({ title: 'Question regenerated' })
    } catch (e) {
      toast({ title: 'Regeneration failed', description: String(e), variant: 'destructive' })
    } finally {
      setRegenQId(null)
    }
  }

  const handleDeleteQuestion = async (q: GeneratedQuestion) => {
    if (!confirm('Delete this question? This cannot be undone.')) return
    setDeletingQId(q.id)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/questions/${q.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setGenerated((prev) => prev.filter((item) => item.id !== q.id))
      if (expandedQId === q.id) setExpandedQId(null)
      toast({ title: 'Question deleted' })
    } catch (e) {
      toast({ title: 'Delete failed', description: String(e), variant: 'destructive' })
    } finally {
      setDeletingQId(null)
    }
  }

  // ─── Config helpers ────────────────────────────────────────────────────────

  const updateConfig = (sectionId: string, updates: Partial<SectionGenConfig>) => {
    setSectionConfigs((prev) => ({ ...prev, [sectionId]: { ...prev[sectionId], ...updates } }))
  }

  const enabledCount = Object.values(sectionConfigs).filter((c) => c.enabled).length
  const totalCount = Object.values(sectionConfigs)
    .filter((c) => c.enabled)
    .reduce((s, c) => s + c.totalCount, 0)

  const questionsUrl = `/exams/${projectId}/${sessionId}/questions`

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Generate Questions</h2>
        <p className="text-sm text-gray-500">
          Configure how many questions to generate per section, type, and topic
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Config Panel (3 cols) ── */}
        <div className="lg:col-span-3 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : sections.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No sections defined. Add sections first.</div>
          ) : (
            <>
              {/* AI context summary */}
              {docSummary.length > 0 && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs font-semibold text-green-800 mb-1">AI Context:</p>
                  <div className="flex flex-wrap gap-1">
                    {docSummary.map(({ type, count }) => (
                      <span
                        key={type}
                        className="text-xs px-2 py-0.5 bg-white border border-green-200 rounded-full text-green-700"
                      >
                        {docTypeLabels[type] ?? type} ({count})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Select/Deselect all */}
              <div className="flex gap-3 text-sm">
                <button
                  onClick={() =>
                    setSectionConfigs((prev) => {
                      const n = { ...prev }
                      Object.keys(n).forEach((k) => {
                        n[k] = { ...n[k], enabled: true }
                      })
                      return n
                    })
                  }
                  className="text-[#028a39] hover:underline"
                >
                  Select all
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() =>
                    setSectionConfigs((prev) => {
                      const n = { ...prev }
                      Object.keys(n).forEach((k) => {
                        n[k] = { ...n[k], enabled: false }
                      })
                      return n
                    })
                  }
                  className="text-gray-500 hover:underline"
                >
                  Deselect all
                </button>
              </div>

              {/* Section cards */}
              {sections.map((sec) => {
                const cfg = sectionConfigs[sec.id]
                if (!cfg) return null
                const isExpanded = expandedSec.has(sec.id)
                return (
                  <Card key={sec.id} className={cfg.enabled ? 'border-[#028a39]' : ''}>
                    <CardContent className="p-4">
                      {/* Header row */}
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={cfg.enabled}
                          onCheckedChange={(v) => updateConfig(sec.id, { enabled: !!v })}
                        />
                        <div className="flex-1">
                          <span className="font-medium text-sm">{sec.name}</span>
                          <div className="flex gap-1 mt-0.5">
                            <Badge variant="outline" className="text-xs">
                              {sec.questionType.replace(/_/g, ' ')}
                            </Badge>
                            <span className="text-xs text-gray-400">Bank: {cfg.totalCount} q</span>
                          </div>
                        </div>
                        {cfg.enabled && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              setExpandedSec((prev) => {
                                const s = new Set(prev)
                                s.has(sec.id) ? s.delete(sec.id) : s.add(sec.id)
                                return s
                              })
                            }
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>

                      {/* Expanded config */}
                      {cfg.enabled && isExpanded && (
                        <div className="mt-3 pt-3 border-t space-y-4">
                          {/* Total count */}
                          <div className="flex items-center gap-3">
                            <Label className="text-xs w-32 shrink-0">Total to generate</Label>
                            <Input
                              type="number"
                              min={1}
                              value={cfg.totalCount}
                              onChange={(e) =>
                                updateConfig(sec.id, { totalCount: Number(e.target.value) || 1 })
                              }
                              className="h-7 w-20 text-xs"
                            />
                            <span className="text-xs text-gray-400">questions into bank</span>
                          </div>

                          {/* Per question type breakdown */}
                          {cfg.qtRows.length > 0 && (
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold">Per Question Type</Label>
                              <div className="text-xs text-gray-400 mb-1">
                                For each type: how many questions to generate
                              </div>
                              {cfg.qtRows.map((row, i) => (
                                <div key={i} className="grid grid-cols-[1fr_80px] gap-2 items-center">
                                  <span className="text-xs">
                                    {qtypeLabels[row.type] ?? row.type}{' '}
                                    <span className="text-gray-400">
                                      (exam: {row.count} × {row.marksEach}m)
                                    </span>
                                  </span>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={row.generateCount}
                                    onChange={(e) => {
                                      const rows = [...cfg.qtRows]
                                      rows[i] = { ...rows[i], generateCount: Number(e.target.value) || 0 }
                                      updateConfig(sec.id, {
                                        qtRows: rows,
                                        totalCount: rows.reduce((s, r) => s + r.generateCount, 0),
                                      })
                                    }}
                                    className="h-7 text-xs"
                                  />
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Per topic breakdown */}
                          {cfg.topicRows.length > 0 && (
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold">Per Topic</Label>
                              {cfg.topicRows.map((row, i) => (
                                <div key={i} className="grid grid-cols-[1fr_80px] gap-2 items-center">
                                  <span className="text-xs">
                                    {row.topicName}{' '}
                                    <span className="text-gray-400">(exam: {row.count})</span>
                                  </span>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={row.generateCount}
                                    onChange={(e) => {
                                      const rows = [...cfg.topicRows]
                                      rows[i] = { ...rows[i], generateCount: Number(e.target.value) || 0 }
                                      updateConfig(sec.id, { topicRows: rows })
                                    }}
                                    className="h-7 text-xs"
                                  />
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Reference sample question */}
                          {sampleQuestions.length > 0 && (
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold">
                                Reference Sample Question{' '}
                                <span className="font-normal text-gray-400">
                                  (optional — AI mimics this style)
                                </span>
                              </Label>
                              <Select
                                value={cfg.referenceQuestionId ?? 'none'}
                                onValueChange={(v) =>
                                  updateConfig(sec.id, {
                                    referenceQuestionId: v === 'none' ? undefined : v,
                                  })
                                }
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="No reference — use general style" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none" className="text-xs">
                                    No reference
                                  </SelectItem>
                                  {sampleQuestions.map((sq) => (
                                    <SelectItem key={sq.id} value={sq.id} className="text-xs">
                                      {sq.title ?? sq.content.slice(0, 60) + '...'}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {/* Section-specific instructions */}
                          <div className="space-y-1">
                            <Label className="text-xs">Additional instructions for this section</Label>
                            <Textarea
                              value={cfg.customInstructions ?? ''}
                              onChange={(e) =>
                                updateConfig(sec.id, { customInstructions: e.target.value })
                              }
                              className="h-14 text-xs"
                              placeholder="e.g. Focus on Decree 70/2025, avoid pure calculation..."
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}

              {/* AI Model selector */}
              <div className="space-y-2">
                <Label className="text-xs">AI Model</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
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
                        <SelectItem value="deepseek:deepseek-reasoner">
                          DeepSeek Reasoner (Default)
                        </SelectItem>
                        <SelectItem value="openrouter:qwen/qwen3-plus">Qwen3 Plus</SelectItem>
                        <SelectItem value="anthropic:claude-sonnet-4-5">Claude Sonnet</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Global extra instructions */}
              <div className="space-y-2">
                <Label className="text-xs">Global extra instructions</Label>
                <Textarea
                  placeholder="e.g. Only reference regulations effective from 2025..."
                  value={extraInstructions}
                  onChange={(e) => setExtraInstructions(e.target.value)}
                  className="min-h-[80px] text-sm"
                />
              </div>

              {enabledCount > 0 && (
                <p className="text-sm text-gray-600">
                  Generate <strong>{totalCount}</strong> questions across <strong>{enabledCount}</strong>{' '}
                  section{enabledCount !== 1 ? 's' : ''}
                </p>
              )}

              <Button
                className="w-full bg-[#028a39] hover:bg-[#026d2d] text-white"
                onClick={handleGenerate}
                disabled={isGenerating || enabledCount === 0}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {isGenerating ? 'Generating...' : 'Generate Questions'}
              </Button>
            </>
          )}
        </div>

        {/* ── Results Panel (2 cols) ── */}
        <div className="lg:col-span-2">
          {isGenerating || generated.length > 0 || activeJobId ? (
            <div className="space-y-3 sticky top-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">
                  Generated Questions
                  {generated.length > 0 && (
                    <span className="ml-1 font-normal text-gray-500">({generated.length})</span>
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  {isGenerating && <Loader2 className="h-4 w-4 animate-spin text-[#028a39]" />}
                  {isDone && <CheckCircle2 className="h-4 w-4 text-[#028a39]" />}
                  {(isGenerating || isDone) && totalToGen > 0 && (
                    <span className="text-xs text-gray-500">
                      {progress} / {totalToGen}
                    </span>
                  )}
                  {generated.length > 0 && (
                    <a
                      href={questionsUrl}
                      className="text-xs text-[#028a39] hover:underline flex items-center gap-1"
                    >
                      <BookOpen className="h-3 w-3" />
                      View in Bank
                    </a>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {totalToGen > 0 && (
                <Progress
                  value={totalToGen > 0 ? (progress / totalToGen) * 100 : 0}
                  className="h-2"
                />
              )}

              {/* Running status banner */}
              {isGenerating && (
                <div className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs text-green-700">
                    Running in background — safe to close this tab
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                    onClick={handleCancelJob}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              )}

              {/* Done banner */}
              {isDone && !isGenerating && (
                <div className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-[#028a39] font-medium">
                    ✓ {progress || generated.length} questions saved to bank
                  </p>
                  <a
                    href={questionsUrl}
                    className="text-xs text-[#028a39] font-semibold hover:underline"
                  >
                    View all →
                  </a>
                </div>
              )}

              {/* Question list */}
              <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                {generated.map((q, i) => {
                  const isExpanded = expandedQId === q.id
                  const editState = getEditState(q)
                  const isRegen = regenQId === q.id
                  const isDeleting = deletingQId === q.id
                  const isSaving = savingQId === q.id
                  const hasEdits = !!(editingQ[q.id] && Object.keys(editingQ[q.id]).length > 0)
                  const optionsArray = Array.isArray(editState.options) ? editState.options : []
                  const isMCQ = editState.questionType?.startsWith('MCQ')

                  return (
                    <Card
                      key={q.id}
                      className={`text-xs transition-all ${isExpanded ? 'ring-1 ring-[#028a39]' : ''} ${
                        isRegen || isDeleting ? 'opacity-60' : ''
                      }`}
                    >
                      <CardContent className="p-3">
                        {/* Question header row */}
                        <div className="flex items-start gap-2">
                          <span className="text-gray-400 shrink-0 font-mono text-[11px] mt-0.5">
                            Q{i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-xs leading-snug ${
                                isExpanded ? '' : 'line-clamp-2'
                              } cursor-pointer`}
                              onClick={() => setExpandedQId(isExpanded ? null : q.id)}
                            >
                              {q.stem}
                            </p>
                            <div className="flex gap-1 flex-wrap mt-1">
                              <Badge variant="outline" className="text-[10px] py-0 px-1">
                                {(q.questionType || '').replace(/_/g, ' ')}
                              </Badge>
                              {q.difficulty && (
                                <span
                                  className={`text-[10px] px-1.5 py-0 rounded-full font-medium ${
                                    difficultyColors[q.difficulty] || 'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {q.difficulty}
                                </span>
                              )}
                              {q.topic && (
                                <span className="text-[10px] text-gray-400 truncate max-w-[120px]">
                                  {q.topic}
                                </span>
                              )}
                              {q.marks && (
                                <span className="text-[10px] text-gray-400">{q.marks}m</span>
                              )}
                            </div>
                          </div>
                          {/* Action buttons */}
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-gray-400 hover:text-[#028a39]"
                              title="Edit"
                              onClick={() => setExpandedQId(isExpanded ? null : q.id)}
                              disabled={isRegen || isDeleting}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-gray-400 hover:text-blue-600"
                              title="Regenerate"
                              onClick={() => handleRegenQuestion(q)}
                              disabled={isRegen || isDeleting || isGenerating}
                            >
                              {isRegen ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-gray-400 hover:text-red-600"
                              title="Delete"
                              onClick={() => handleDeleteQuestion(q)}
                              disabled={isRegen || isDeleting}
                            >
                              {isDeleting ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Expanded edit form */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t space-y-3">
                            {/* Stem */}
                            <div className="space-y-1">
                              <Label className="text-[11px] font-semibold text-gray-600">
                                Question Stem
                              </Label>
                              <Textarea
                                value={editState.stem}
                                onChange={(e) => updateEdit(q.id, { stem: e.target.value })}
                                className="text-xs min-h-[80px]"
                              />
                            </div>

                            {/* MCQ options */}
                            {isMCQ && optionsArray.length > 0 && (
                              <div className="space-y-1">
                                <Label className="text-[11px] font-semibold text-gray-600">Options</Label>
                                {optionsArray.map((opt, oi) => (
                                  <div key={oi} className="flex items-center gap-2">
                                    <span className="text-[11px] text-gray-400 w-4 shrink-0">
                                      {String.fromCharCode(65 + oi)}.
                                    </span>
                                    <Input
                                      value={opt}
                                      onChange={(e) => {
                                        const newOpts = [...optionsArray]
                                        newOpts[oi] = e.target.value
                                        updateEdit(q.id, { options: newOpts })
                                      }}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Correct answer */}
                            <div className="space-y-1">
                              <Label className="text-[11px] font-semibold text-gray-600">
                                Correct Answer
                              </Label>
                              <Input
                                value={editState.correctAnswer || ''}
                                onChange={(e) => updateEdit(q.id, { correctAnswer: e.target.value })}
                                className="h-7 text-xs"
                                placeholder="e.g. A, or full answer text"
                              />
                            </div>

                            {/* Marking scheme */}
                            <div className="space-y-1">
                              <Label className="text-[11px] font-semibold text-gray-600">
                                Marking Scheme / Explanation
                              </Label>
                              <Textarea
                                value={editState.markingScheme || ''}
                                onChange={(e) => updateEdit(q.id, { markingScheme: e.target.value })}
                                className="text-xs min-h-[60px]"
                              />
                            </div>

                            {/* Topic + Difficulty row */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-[11px] font-semibold text-gray-600">Topic</Label>
                                <Input
                                  value={editState.topic || ''}
                                  onChange={(e) => updateEdit(q.id, { topic: e.target.value })}
                                  className="h-7 text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px] font-semibold text-gray-600">
                                  Difficulty
                                </Label>
                                <Select
                                  value={editState.difficulty || 'MEDIUM'}
                                  onValueChange={(v) => updateEdit(q.id, { difficulty: v })}
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="EASY" className="text-xs">
                                      Easy
                                    </SelectItem>
                                    <SelectItem value="MEDIUM" className="text-xs">
                                      Medium
                                    </SelectItem>
                                    <SelectItem value="HARD" className="text-xs">
                                      Hard
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            {/* Save / Cancel buttons */}
                            <div className="flex gap-2 pt-1">
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-[#028a39] hover:bg-[#026d2d] text-white"
                                onClick={() => handleSaveQuestion(q)}
                                disabled={isSaving || !hasEdits}
                              >
                                {isSaving ? (
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : null}
                                Save changes
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setEditingQ((prev) => {
                                    const n = { ...prev }
                                    delete n[q.id]
                                    return n
                                  })
                                  setExpandedQId(null)
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}

                {/* Generating skeleton placeholder */}
                {isGenerating && (
                  <div className="h-12 flex items-center justify-center text-gray-400 text-xs">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Generating questions...
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <Sparkles className="h-12 w-12 mb-3" />
              <p className="text-sm">Generated questions will appear here</p>
              <p className="text-xs mt-1">Select sections and click Generate</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
