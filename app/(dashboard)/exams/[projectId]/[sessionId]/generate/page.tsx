'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useToast } from '@/components/ui/use-toast'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  X,
  BookOpen,
  ListChecks,
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

type Topic = {
  id: string
  name: string
  parentId: string | null
  isOverall: boolean
  children?: Topic[]
}

type ParsedSampleQ = {
  id: string
  title: string | null
  content: string
  questionType: string
  topicId: string | null
  topicName: string | null
  sectionId: string | null
  syllabusCode: string | null
}

function parseSyllabusIssues(syllabusCode: string | null): { code: string; issues: string[] } {
  if (!syllabusCode) return { code: '', issues: [] }
  const parts = syllabusCode.split(' | Issues: ')
  return {
    code: parts[0]?.trim() || '',
    issues: parts[1] ? parts[1].split(',').map(s => s.trim()).filter(Boolean) : [],
  }
}

/** Per-section generate config — replaces the old qtRows/topicRows approach */
type SectionGenConfig = {
  sectionId: string
  enabled: boolean
  // 1. Number to generate (default 2)
  count: number
  // 2. Selected topic IDs (required ≥1, empty = AI picks randomly)
  selectedTopicIds: string[]
  // 3. Selected question types (empty = AI picks randomly)
  selectedQuestionTypes: string[]
  // 4. Syllabus code (optional)
  syllabusCode: string
  // 5. Selected sample question IDs (empty = auto-filter by topic)
  selectedSampleIds: string[]
  // 6. Issues (comma-separated → parsed to array on send)
  issues: string
  // 6b. Excluding issues (comma-separated → DO NOT test these)
  excludingIssues: string
  // 7. Difficulty level
  difficultyLevel: 'STANDARD' | 'EASY' | 'HARD' | 'MIXED'
  // 8. Additional instructions
  customInstructions: string
  // 9. Calculation marks split (0 = no split)
  calculationMarks: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const QUESTION_TYPES = [
  { value: 'MCQ_SINGLE',   label: 'MCQ – Single answer' },
  { value: 'MCQ_MULTIPLE', label: 'MCQ – Multiple answers' },
  { value: 'FILL_BLANK',   label: 'Fill in the blank' },
  { value: 'SHORT_ANSWER', label: 'Short answer' },
  { value: 'ESSAY',        label: 'Essay' },
  { value: 'SCENARIO',     label: 'Scenario-based' },
  { value: 'CASE_STUDY',   label: 'Case study' },
  { value: 'OTHER',        label: 'Other' },
]

const DIFFICULTY_OPTIONS = [
  { value: 'STANDARD', label: 'Standard (same as sample exam)' },
  { value: 'EASY',     label: 'Easy' },
  { value: 'HARD',     label: 'Hard' },
  { value: 'MIXED',    label: 'Mixed (20% Easy / 50% Med / 30% Hard)' },
]

const docTypeLabels: Record<string, string> = {
  SYLLABUS: 'Syllabus',
  TAX_REGULATIONS: 'Regulations',
  SAMPLE_QUESTIONS: 'Sample Qs',
  STUDY_MATERIAL: 'Study Material',
  RATES_TARIFF: 'Rates/Tariff',
  OTHER: 'Other',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GeneratePage() {
  const params = useParams()
  const { toast } = useToast()
  const sessionId = params.sessionId as string
  const projectId = params.projectId as string

  // Data
  const [sections, setSections] = useState<Section[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [flatTopics, setFlatTopics] = useState<Topic[]>([])
  const [sampleQuestions, setSampleQuestions] = useState<ParsedSampleQ[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [docSummary, setDocSummary] = useState<{ type: string; count: number }[]>([])
  const [aiModels, setAIModels] = useState<{ id: string; label: string }[]>([])

  // Config
  const [sectionConfigs, setSectionConfigs] = useState<Record<string, SectionGenConfig>>({})
  const [expandedSec, setExpandedSec] = useState<Set<string>>(new Set())
  const [extraInstructions, setExtraInstructions] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [generateLanguage, setGenerateLanguage] = useState<'ENG' | 'VIE'>('ENG')
  const [assumedDate, setAssumedDate] = useState('')

  // Job / generation
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<string>('')
  const [progress, setProgress] = useState(0)
  const [totalToGen, setTotalToGen] = useState(0)
  const [isDone, setIsDone] = useState(false)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // ─── Init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchData()
    checkForActiveJob()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [secRes, topicRes, docRes, sampleRes, modelRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}/sections`),
        fetch(`/api/sessions/${sessionId}/topics`),
        fetch(`/api/sessions/${sessionId}/documents`),
        fetch(`/api/sessions/${sessionId}/parsed-questions`),
        fetch('/api/ai-models').catch(() => ({ ok: false })),
      ])

      if (secRes.ok) {
        const data: Section[] = await secRes.json()
        setSections(data)
        const configs: Record<string, SectionGenConfig> = {}
        data.forEach((sec) => {
          configs[sec.id] = {
            sectionId: sec.id,
            enabled: false,
            count: 2,
            selectedTopicIds: [],
            selectedQuestionTypes: [],
            syllabusCode: '',
            selectedSampleIds: [],
            issues: '',
            excludingIssues: '',
            difficultyLevel: 'STANDARD',
            customInstructions: '',
            calculationMarks: 0,
          }
        })
        setSectionConfigs(configs)
      }

      if (topicRes.ok) {
        const data: Topic[] = await topicRes.json()
        const nonOverall = data.filter((t) => !t.isOverall)
        setTopics(nonOverall)
        // Flat list for easy lookup: parents + children
        const flat: Topic[] = []
        nonOverall.forEach((t) => {
          if (!t.parentId) {
            flat.push(t)
            if (t.children) {
              t.children.forEach((c) => flat.push(c))
            }
          }
        })
        setFlatTopics(flat)
      }

      if (docRes.ok) {
        const docs: any[] = await docRes.json()
        const typeCount: Record<string, number> = {}
        docs.forEach((d) => { typeCount[d.fileType] = (typeCount[d.fileType] || 0) + 1 })
        setDocSummary(Object.entries(typeCount).map(([type, count]) => ({ type, count })))
      }

      if (sampleRes.ok) {
        const samples: ParsedSampleQ[] = await sampleRes.json()
        setSampleQuestions(samples)
      }

      if ('ok' in modelRes && modelRes.ok) {
        const models: { id: string; label: string; isDefault?: boolean }[] = await (modelRes as Response).json()
        setAIModels(models)
        const def = (models.find(m => m.isDefault) || models[0])?.id || ''
        if (def) setSelectedModel(def)
      }
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Active job resume ────────────────────────────────────────────────────

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
          setProgress(job.progress || 0)
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const pollJobStatus = useCallback(
    (jobId: string) => {
      const poll = async () => {
        try {
          const res = await fetch(`/api/sessions/${sessionId}/generate-jobs/${jobId}`)
          if (!res.ok) { setIsGenerating(false); return }
          const job = await res.json()
          setProgress(job.progress || 0)
          setTotalToGen(job.total || 0)
          setJobStatus(job.status)
          if (job.status === 'DONE') {
            setIsDone(true)
            setIsGenerating(false)
            toast({ title: `✓ ${job.progress} questions generated`, description: 'Saved to question bank.' })
          } else if (job.status === 'FAILED') {
            setIsGenerating(false)
            toast({ title: 'Generation stopped', description: job.error || 'Job was cancelled or failed.', variant: 'destructive' })
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

  // ─── Generate ─────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    const enabledConfigs = Object.values(sectionConfigs).filter((c) => c.enabled)
    if (enabledConfigs.length === 0) {
      toast({ title: 'Select at least one section', variant: 'destructive' })
      return
    }

    if (pollRef.current) clearTimeout(pollRef.current)
    setIsGenerating(true)
    setIsDone(false)
    setProgress(0)
    setActiveJobId(null)

    const sectionConfigsPayload = enabledConfigs.map((c) => {
      const topicObjs = flatTopics.filter((t) => c.selectedTopicIds.includes(t.id))
      return {
        sectionId: c.sectionId,
        count: c.count,
        selectedTopicIds: c.selectedTopicIds,
        selectedTopicNames: topicObjs.map((t) => t.name),
        selectedQuestionTypes: c.selectedQuestionTypes,
        syllabusCode: c.syllabusCode || undefined,
        selectedSampleIds: c.selectedSampleIds,
        issues: c.issues
          ? c.issues.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        excludingIssues: c.excludingIssues
          ? c.excludingIssues.split(',').map((s: string) => s.trim()).filter(Boolean)
          : undefined,
        difficultyLevel: c.difficultyLevel,
        customInstructions: c.customInstructions || undefined,
        calculationMarks: c.calculationMarks || 0,
      }
    })

    const total = sectionConfigsPayload.reduce((s, c) => s + c.count, 0)

    try {
      const jobRes = await fetch(`/api/sessions/${sessionId}/generate-jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionConfigs: sectionConfigsPayload,
          extraInstructions,
          modelId: selectedModel,
          total,
          language: generateLanguage,
          assumedDate: assumedDate || undefined,
        }),
      })
      if (!jobRes.ok) throw new Error('Failed to create generation job')
      const job = await jobRes.json()
      setActiveJobId(job.id)
      setTotalToGen(job.total || total)
      fetch(`/api/sessions/${sessionId}/generate-jobs/${job.id}/run`, { method: 'POST' }).catch(() => {})
      pollJobStatus(job.id)
    } catch (e) {
      setIsGenerating(false)
      toast({ title: 'Failed to start generation', description: String(e), variant: 'destructive' })
    }
  }

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
  }

  // ─── Config helpers ───────────────────────────────────────────────────────

  const updateConfig = (sectionId: string, updates: Partial<SectionGenConfig>) => {
    setSectionConfigs((prev) => ({ ...prev, [sectionId]: { ...prev[sectionId], ...updates } }))
  }

  const toggleTopicId = (sectionId: string, topicId: string) => {
    const cfg = sectionConfigs[sectionId]
    if (!cfg) return
    const has = cfg.selectedTopicIds.includes(topicId)
    updateConfig(sectionId, {
      selectedTopicIds: has
        ? cfg.selectedTopicIds.filter((id) => id !== topicId)
        : [...cfg.selectedTopicIds, topicId],
    })
  }

  const toggleQType = (sectionId: string, qtype: string) => {
    const cfg = sectionConfigs[sectionId]
    if (!cfg) return
    const has = cfg.selectedQuestionTypes.includes(qtype)
    updateConfig(sectionId, {
      selectedQuestionTypes: has
        ? cfg.selectedQuestionTypes.filter((t) => t !== qtype)
        : [...cfg.selectedQuestionTypes, qtype],
    })
  }

  const toggleSampleId = (sectionId: string, sampleId: string) => {
    const cfg = sectionConfigs[sectionId]
    if (!cfg) return
    const has = cfg.selectedSampleIds.includes(sampleId)
    updateConfig(sectionId, {
      selectedSampleIds: has
        ? cfg.selectedSampleIds.filter((id) => id !== sampleId)
        : [...cfg.selectedSampleIds, sampleId],
    })
  }

  const enabledCount = Object.values(sectionConfigs).filter((c) => c.enabled).length
  const totalCount = Object.values(sectionConfigs)
    .filter((c) => c.enabled)
    .reduce((s, c) => s + c.count, 0)

  const questionsUrl = `/exams/${projectId}/${sessionId}/questions`

  // ─── Render helpers ───────────────────────────────────────────────────────

  /** Flat list of non-overall topics for a section config multi-select */
  const TopicMultiSelect = ({ sectionId }: { sectionId: string }) => {
    const cfg = sectionConfigs[sectionId]
    if (!cfg) return null
    const selectedCount = cfg.selectedTopicIds.length

    // Get sample questions relevant to selected topics (for sample select)
    const relevantSamples = sampleQuestions.filter((sq) => {
      if (cfg.selectedTopicIds.length === 0) return true
      return sq.topicId ? cfg.selectedTopicIds.includes(sq.topicId) : false
    })

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`h-8 text-xs justify-between w-full ${selectedCount > 0 ? 'border-[#028a39] text-[#028a39]' : ''}`}
          >
            {selectedCount === 0
              ? 'Select topics (optional — AI picks randomly if none)'
              : `${selectedCount} topic${selectedCount > 1 ? 's' : ''} selected`}
            <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <p className="text-xs font-semibold text-gray-500 mb-2">Select topics / sub-topics</p>
          {flatTopics.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No topics defined. Add topics first.</p>
          ) : (
            <div className="space-y-0.5 max-h-52 overflow-y-auto">
              {flatTopics.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleTopicId(sectionId, t.id)}
                >
                  <Checkbox
                    checked={cfg.selectedTopicIds.includes(t.id)}
                    onCheckedChange={() => toggleTopicId(sectionId, t.id)}
                  />
                  <span className={`text-xs ${t.parentId ? 'pl-3 text-gray-600' : 'font-medium'}`}>
                    {t.parentId ? `↳ ${t.name}` : t.name}
                  </span>
                </div>
              ))}
            </div>
          )}
          {cfg.selectedTopicIds.length > 0 && (
            <button
              className="mt-2 text-xs text-gray-400 hover:text-gray-600 w-full text-left"
              onClick={() => updateConfig(sectionId, { selectedTopicIds: [] })}
            >
              Clear all
            </button>
          )}
        </PopoverContent>
      </Popover>
    )
  }

  /** Question type multi-select */
  const QTypeMultiSelect = ({ sectionId }: { sectionId: string }) => {
    const cfg = sectionConfigs[sectionId]
    if (!cfg) return null
    const selectedCount = cfg.selectedQuestionTypes.length

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`h-8 text-xs justify-between w-full ${selectedCount > 0 ? 'border-[#028a39] text-[#028a39]' : ''}`}
          >
            {selectedCount === 0
              ? 'Select question types (optional — AI picks randomly if none)'
              : `${selectedCount} type${selectedCount > 1 ? 's' : ''} selected`}
            <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <p className="text-xs font-semibold text-gray-500 mb-2">Select question types</p>
          <div className="space-y-0.5">
            {QUESTION_TYPES.map((qt) => (
              <div
                key={qt.value}
                className="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-50 cursor-pointer"
                onClick={() => toggleQType(sectionId, qt.value)}
              >
                <Checkbox
                  checked={cfg.selectedQuestionTypes.includes(qt.value)}
                  onCheckedChange={() => toggleQType(sectionId, qt.value)}
                />
                <span className="text-xs">{qt.label}</span>
              </div>
            ))}
          </div>
          {cfg.selectedQuestionTypes.length > 0 && (
            <button
              className="mt-2 text-xs text-gray-400 hover:text-gray-600 w-full text-left"
              onClick={() => updateConfig(sectionId, { selectedQuestionTypes: [] })}
            >
              Clear all
            </button>
          )}
        </PopoverContent>
      </Popover>
    )
  }

  /** Sample question multi-select, pre-filtered by selected topics */
  const SampleMultiSelect = ({ sectionId }: { sectionId: string }) => {
    const cfg = sectionConfigs[sectionId]
    if (!cfg || sampleQuestions.length === 0) return null

    const relevantSamples = sampleQuestions.filter((sq) => {
      // Section filter: only show samples tagged to this section (or untagged)
      if (sq.sectionId && sq.sectionId !== sectionId) return false
      // Topic filter: only show samples matching selected topics (or untagged)
      if (cfg.selectedTopicIds.length === 0) return true
      return sq.topicId ? cfg.selectedTopicIds.includes(sq.topicId) : true
    })

    const selectedCount = cfg.selectedSampleIds.length

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`h-8 text-xs justify-between w-full ${selectedCount > 0 ? 'border-[#028a39] text-[#028a39]' : ''}`}
          >
            {selectedCount === 0
              ? relevantSamples.length > 0
                ? `Auto (${relevantSamples.length} sample${relevantSamples.length > 1 ? 's' : ''} from selected topics)`
                : 'No samples available for selected topics'
              : `${selectedCount} sample${selectedCount > 1 ? 's' : ''} selected`}
            <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <p className="text-xs font-semibold text-gray-500 mb-1">
            Sample questions{' '}
            <span className="font-normal text-gray-400">
              (AI will generate in the same style)
            </span>
          </p>
          <p className="text-xs text-gray-400 italic mb-2">
            If none selected, AI uses all samples matching the selected topics automatically.
          </p>
          <div className="space-y-0.5 max-h-52 overflow-y-auto">
            {relevantSamples.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No parsed samples for selected topics.</p>
            ) : (
              relevantSamples.map((sq) => {
                const { code, issues } = parseSyllabusIssues(sq.syllabusCode)
                const contentPreview = sq.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)
                return (
                  <div
                    key={sq.id}
                    className="flex items-start gap-2 px-1 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleSampleId(sectionId, sq.id)}
                    title={contentPreview}
                  >
                    <Checkbox
                      checked={cfg.selectedSampleIds.includes(sq.id)}
                      onCheckedChange={() => toggleSampleId(sectionId, sq.id)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1 mb-0.5">
                        {sq.topicName && (
                          <span className="text-xs text-[#028a39] font-medium">[{sq.topicName}]</span>
                        )}
                        {code && (
                          <span className="text-xs px-1 py-0.5 bg-blue-50 text-blue-700 rounded font-mono">{code}</span>
                        )}
                        {issues.map(issue => (
                          <span key={issue} className="text-xs px-1 py-0.5 bg-amber-50 text-amber-700 rounded">{issue}</span>
                        ))}
                      </div>
                      <span className="text-xs text-gray-700 line-clamp-2">
                        {sq.title || sq.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 80) + '…'}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
          {cfg.selectedSampleIds.length > 0 && (
            <button
              className="mt-2 text-xs text-gray-400 hover:text-gray-600 w-full text-left"
              onClick={() => updateConfig(sectionId, { selectedSampleIds: [] })}
            >
              Clear selection (revert to auto)
            </button>
          )}
        </PopoverContent>
      </Popover>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Generate Questions</h2>
        <p className="text-sm text-gray-500">
          Configure generation parameters per section, then start the AI generation job.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Config Panel ── */}
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
              {/* AI context */}
              {docSummary.length > 0 && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs font-semibold text-green-800 mb-1">AI Context:</p>
                  <div className="flex flex-wrap gap-1">
                    {docSummary.map(({ type, count }) => (
                      <span key={type} className="text-xs px-2 py-0.5 bg-white border border-green-200 rounded-full text-green-700">
                        {docTypeLabels[type] ?? type} ({count})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Language toggle */}
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold shrink-0">Generate language:</Label>
                <div className="flex rounded-md border overflow-hidden">
                  {(['ENG', 'VIE'] as const).map(lang => (
                    <button
                      key={lang}
                      onClick={() => setGenerateLanguage(lang)}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        generateLanguage === lang
                          ? 'bg-[#028a39] text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {lang === 'ENG' ? '🇬🇧 English' : '🇻🇳 Tiếng Việt'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Select/deselect all */}
              <div className="flex gap-3 text-sm">
                <button
                  onClick={() => setSectionConfigs((prev) => {
                    const n = { ...prev }
                    Object.keys(n).forEach((k) => { n[k] = { ...n[k], enabled: true } })
                    return n
                  })}
                  className="text-[#028a39] hover:underline"
                >
                  Select all
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => setSectionConfigs((prev) => {
                    const n = { ...prev }
                    Object.keys(n).forEach((k) => { n[k] = { ...n[k], enabled: false } })
                    return n
                  })}
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
                      {/* Header */}
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={cfg.enabled}
                          onCheckedChange={(v) => {
                            updateConfig(sec.id, { enabled: !!v })
                            if (v && !expandedSec.has(sec.id)) {
                              setExpandedSec((prev) => { const s = new Set(prev); s.add(sec.id); return s })
                            }
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm">{sec.name}</span>
                          <div className="flex gap-2 mt-0.5 flex-wrap">
                            {cfg.selectedTopicIds.length > 0 && (
                              <span className="text-xs text-[#028a39]">
                                {cfg.selectedTopicIds.length} topic{cfg.selectedTopicIds.length > 1 ? 's' : ''}
                              </span>
                            )}
                            {cfg.selectedQuestionTypes.length > 0 && (
                              <span className="text-xs text-purple-600">
                                {cfg.selectedQuestionTypes.length} type{cfg.selectedQuestionTypes.length > 1 ? 's' : ''}
                              </span>
                            )}
                            <span className="text-xs text-gray-400">{cfg.count} to generate</span>
                          </div>
                        </div>
                        {cfg.enabled && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => setExpandedSec((prev) => {
                              const s = new Set(prev)
                              s.has(sec.id) ? s.delete(sec.id) : s.add(sec.id)
                              return s
                            })}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>

                      {/* Expanded config */}
                      {cfg.enabled && isExpanded && (
                        <div className="mt-4 pt-4 border-t space-y-4">

                          {/* 1. Number to generate */}
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">Number of questions to generate</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={1}
                                max={100}
                                value={cfg.count}
                                onChange={(e) => updateConfig(sec.id, { count: Math.max(1, Number(e.target.value) || 1) })}
                                className="h-8 w-20 text-sm"
                              />
                              <span className="text-xs text-gray-400">questions (default: 2)</span>
                            </div>
                          </div>

                          {/* Marks split */}
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                              Each question generated will have{' '}
                              <span className="text-gray-400 font-normal">(optional)</span>
                            </Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={0}
                                max={sec.marksPerQuestion}
                                step={0.5}
                                value={cfg.calculationMarks}
                                onChange={e => updateConfig(sec.id, { calculationMarks: Number(e.target.value) || 0 })}
                                className="h-8 w-20 text-sm"
                                placeholder="0"
                              />
                              <span className="text-xs text-gray-500">
                                marks for Calculation
                                {cfg.calculationMarks > 0 && sec.marksPerQuestion > 0 && (
                                  <span className="ml-1 text-[#028a39]">
                                    + {Math.max(0, sec.marksPerQuestion - cfg.calculationMarks)} marks Theory
                                  </span>
                                )}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400">
                              Out of {sec.marksPerQuestion} marks per question. Leave 0 to let AI decide.
                            </p>
                          </div>

                          {/* 2. Topics */}
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                              Topics / Sub-topics <span className="text-gray-400 font-normal">(select ≥1, or AI picks randomly)</span>
                            </Label>
                            <TopicMultiSelect sectionId={sec.id} />
                            {cfg.selectedTopicIds.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {flatTopics
                                  .filter((t) => cfg.selectedTopicIds.includes(t.id))
                                  .map((t) => (
                                    <span
                                      key={t.id}
                                      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded border border-green-200"
                                    >
                                      {t.name}
                                      <button
                                        onClick={() => toggleTopicId(sec.id, t.id)}
                                        className="hover:text-red-500"
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    </span>
                                  ))}
                              </div>
                            )}
                          </div>

                          {/* 3. Question types */}
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                              Question type <span className="text-gray-400 font-normal">(optional — AI picks randomly if none)</span>
                            </Label>
                            <QTypeMultiSelect sectionId={sec.id} />
                            {cfg.selectedQuestionTypes.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {cfg.selectedQuestionTypes.map((qt) => {
                                  const label = QUESTION_TYPES.find((q) => q.value === qt)?.label ?? qt
                                  return (
                                    <span
                                      key={qt}
                                      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded border border-purple-200"
                                    >
                                      {label}
                                      <button onClick={() => toggleQType(sec.id, qt)} className="hover:text-red-500">
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          {/* 4. Syllabus code */}
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                              Syllabus code <span className="text-gray-400 font-normal">(optional, e.g. A1, B2.3)</span>
                            </Label>
                            <Input
                              value={cfg.syllabusCode}
                              onChange={(e) => updateConfig(sec.id, { syllabusCode: e.target.value })}
                              placeholder="e.g. A1, B2, C3.1"
                              className="h-8 text-xs"
                            />
                          </div>

                          {/* 5. Sample questions */}
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                              Sample questions to refer{' '}
                              <span className="text-gray-400 font-normal">(AI mimics style of selected samples)</span>
                            </Label>
                            <SampleMultiSelect sectionId={sec.id} />
                          </div>

                          {/* 6. Issues */}
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">
                              About issue(s){' '}
                              <span className="text-gray-400 font-normal">(optional, comma-separated)</span>
                            </Label>
                            <Input
                              value={cfg.issues}
                              onChange={(e) => updateConfig(sec.id, { issues: e.target.value })}
                              placeholder="e.g. late filing penalty, CIT rate change, VAT on services"
                              className="h-8 text-xs"
                            />
                            <p className="text-xs text-gray-400">
                              Focus questions on these specific issues within the selected topics
                            </p>
                          </div>

                          {/* 6b. Excluding issues */}
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">
                              Excluding issue(s){' '}
                              <span className="font-normal text-gray-400">(comma-separated — DO NOT test these)</span>
                            </Label>
                            <Input
                              className="h-7 text-xs"
                              value={cfg.excludingIssues}
                              onChange={(e) => updateConfig(sec.id, { excludingIssues: e.target.value })}
                              placeholder="e.g. charitable donation, related party threshold"
                            />
                            <p className="text-xs text-gray-400">
                              These issues will be excluded even if present in regulations or syllabus
                            </p>
                          </div>

                          {/* 7. Difficulty */}
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">Difficulty level</Label>
                            <Select
                              value={cfg.difficultyLevel}
                              onValueChange={(v) =>
                                updateConfig(sec.id, { difficultyLevel: v as SectionGenConfig['difficultyLevel'] })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DIFFICULTY_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* 8. Additional instructions */}
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">Additional instructions</Label>
                            <Textarea
                              value={cfg.customInstructions}
                              onChange={(e) => updateConfig(sec.id, { customInstructions: e.target.value })}
                              placeholder="Any specific instructions for this section's generation…"
                              className="text-xs min-h-[70px]"
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}

              {/* Assumed date */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">
                  Assumed exam date <span className="text-gray-400 font-normal">(optional — AI uses this as "today" for date-sensitive rules)</span>
                </Label>
                <Input
                  type="date"
                  value={assumedDate}
                  onChange={(e) => setAssumedDate(e.target.value)}
                  className="h-8 text-xs w-48"
                />
              </div>

              {/* Global instructions */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Global additional instructions</Label>
                <Textarea
                  value={extraInstructions}
                  onChange={(e) => setExtraInstructions(e.target.value)}
                  placeholder="Instructions applied to all sections…"
                  className="text-xs min-h-[60px]"
                />
              </div>

              {/* AI model + Generate button */}
              <div className="space-y-2">
                {aiModels.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs shrink-0">AI Model</Label>
                    <Select value={selectedModel} onValueChange={setSelectedModel}>
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {aiModels.map((m) => (
                          <SelectItem key={m.id} value={m.id} className="text-xs">
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || enabledCount === 0}
                  className="w-full bg-[#028a39] hover:bg-[#027030] text-white"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate {enabledCount > 0 ? `${totalCount} questions` : '— select sections'}
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* ── Results Panel ── */}
        <div className="lg:col-span-2 space-y-3">
          {/* Job progress */}
          {(isGenerating || jobStatus === 'DONE' || jobStatus === 'FAILED') && (
            <Card>
              <CardContent className="p-4 space-y-3">
                {isGenerating && (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-[#028a39]">
                        <Loader2 className="h-3.5 w-3.5 inline-block animate-spin mr-1" />
                        Generating…
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-red-500 hover:text-red-700"
                        onClick={handleCancelJob}
                      >
                        Cancel
                      </Button>
                    </div>
                    <Progress value={totalToGen > 0 ? (progress / totalToGen) * 100 : 0} className="h-2" />
                    <p className="text-xs text-gray-500">
                      {progress} / {totalToGen || '?'} questions
                    </p>
                    <p className="text-xs text-gray-400 italic">
                      Running in background — safe to close this tab.
                    </p>
                  </>
                )}
                {!isGenerating && jobStatus === 'DONE' && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#028a39]" />
                    <span className="text-sm font-medium text-[#028a39]">
                      Done — {progress} questions generated
                    </span>
                  </div>
                )}
                {!isGenerating && jobStatus === 'FAILED' && (
                  <p className="text-sm text-red-500">Generation stopped or failed.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Completion card */}
          {isDone && (
            <Card>
              <CardContent className="p-4 flex flex-col items-center gap-3 text-center">
                <CheckCircle2 className="h-8 w-8 text-[#028a39]" />
                <p className="text-sm font-medium">{progress} questions saved to Question Bank</p>
                <a
                  href={questionsUrl}
                  className="flex items-center gap-1 text-sm text-[#028a39] hover:underline font-medium"
                >
                  <BookOpen className="h-4 w-4" /> View Question Bank →
                </a>
              </CardContent>
            </Card>
          )}

          {/* Empty state when no job yet */}
          {!isGenerating && !isDone && (
            <div className="text-center py-10 text-gray-400">
              <ListChecks className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Configure sections and generate</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
