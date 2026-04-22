'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/components/ui/use-toast'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sparkles, Loader2, CheckCircle2, ChevronDown, ChevronUp, RefreshCw, BookOpen, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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
  qtRows: (QTypeRow & { generateCount: number })[]  // generateCount = how many to generate per type
  topicRows: (TopicRow & { generateCount: number })[]
  referenceQuestionId?: string
  customInstructions?: string
}

type GeneratedQ = {
  id: string
  stem: string
  questionType: string
  options?: string[]
  correctAnswer?: string
  markingScheme?: string
  topic?: string
  difficulty: string
  marks: number
}

type ParsedSampleQ = { id: string; title: string | null; content: string; questionType: string }

const qtypeLabels: Record<string, string> = {
  MCQ_SINGLE: 'MCQ (1 correct)', MCQ_MULTIPLE: 'MCQ (multi)', FILL_BLANK: 'Fill blank',
  SHORT_ANSWER: 'Short answer', ESSAY: 'Essay', SCENARIO: 'Scenario', CASE_STUDY: 'Case study', OTHER: 'Other',
}

const docTypeLabels: Record<string, string> = {
  SYLLABUS: 'Syllabus', TAX_REGULATIONS: 'Regulations', SAMPLE_QUESTIONS: 'Sample Questions',
  STUDY_MATERIAL: 'Study Material', RATES_TARIFF: 'Rates/Tariff', OTHER: 'Other',
}

export default function GeneratePage() {
  const params = useParams()
  const { toast } = useToast()
  const [sections, setSections] = useState<Section[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sectionConfigs, setSectionConfigs] = useState<Record<string, SectionGenConfig>>({})
  const [expandedSec, setExpandedSec] = useState<Set<string>>(new Set())
  const [extraInstructions, setExtraInstructions] = useState('')
  const [selectedModel, setSelectedModel] = useState('deepseek:deepseek-reasoner')
  const [aiModels, setAIModels] = useState<{id: string; label: string}[]>([])
  const [docSummary, setDocSummary] = useState<{type: string; count: number}[]>([])
  const [sampleQuestions, setSampleQuestions] = useState<ParsedSampleQ[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generated, setGenerated] = useState<GeneratedQ[]>([])
  const [isDone, setIsDone] = useState(false)
  const [progress, setProgress] = useState(0)
  const [totalToGen, setTotalToGen] = useState(0)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const JOB_KEY = `generate_job_${params.sessionId}`

  useEffect(() => {
    fetchData()
    // Check for resumable job
    const savedJob = localStorage.getItem(JOB_KEY)
    if (savedJob) {
      setActiveJobId(savedJob)
      pollJobStatus(savedJob)
    }
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [secRes, docRes, sampleRes, modelRes] = await Promise.all([
        fetch(`/api/sessions/${params.sessionId}/sections`),
        fetch(`/api/sessions/${params.sessionId}/documents`),
        fetch(`/api/sessions/${params.sessionId}/parsed-questions`),
        fetch('/api/ai-models').catch(() => ({ ok: false })),
      ])
      if (secRes.ok) {
        const data: Section[] = await secRes.json()
        setSections(data)
        const configs: Record<string, SectionGenConfig> = {}
        data.forEach(sec => {
          let qtRows: (QTypeRow & { generateCount: number })[] = []
          let topicRows: (TopicRow & { generateCount: number })[] = []
          try { if (sec.questionTypes) { const parsed = JSON.parse(sec.questionTypes); qtRows = parsed.map((r: QTypeRow) => ({ ...r, generateCount: r.count })) } } catch {}
          try { if (sec.topicBreakdown) { const parsed = JSON.parse(sec.topicBreakdown); topicRows = parsed.map((r: TopicRow) => ({ ...r, generateCount: r.count })) } } catch {}
          if (qtRows.length === 0) qtRows = [{ type: sec.questionType, count: sec.questionsInExam || 15, marksEach: sec.marksPerQuestion, generateCount: sec.questionsInBank || 20 }]
          configs[sec.id] = { sectionId: sec.id, enabled: false, totalCount: sec.questionsInBank || 20, qtRows, topicRows }
        })
        setSectionConfigs(configs)
      }
      if (docRes.ok) {
        const docs: any[] = await docRes.json()
        const typeCount: Record<string, number> = {}
        for (const d of docs) { typeCount[d.fileType] = (typeCount[d.fileType] || 0) + 1 }
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
    } finally { setIsLoading(false) }
  }

  const pollJobStatus = async (jobId: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/sessions/${params.sessionId}/generate-jobs/${jobId}`)
        if (!res.ok) { localStorage.removeItem(JOB_KEY); return }
        const job = await res.json()
        setProgress(job.progress || 0)
        setTotalToGen(job.total || 0)
        if (job.status === 'DONE') {
          setIsDone(true)
          setIsGenerating(false)
          localStorage.removeItem(JOB_KEY)
          // Refresh generated questions
          const qRes = await fetch(`/api/sessions/${params.sessionId}/questions?limit=50&orderBy=createdAt_desc`)
          if (qRes.ok) setGenerated(await qRes.json())
        } else if (job.status === 'FAILED') {
          setIsGenerating(false)
          localStorage.removeItem(JOB_KEY)
          toast({ title: 'Generation failed', description: job.error || 'Unknown error', variant: 'destructive' })
        } else {
          pollRef.current = setTimeout(poll, 2000)
        }
      } catch { pollRef.current = setTimeout(poll, 3000) }
    }
    poll()
  }

  const handleGenerate = async () => {
    const enabledConfigs = Object.values(sectionConfigs).filter(c => c.enabled)
    if (enabledConfigs.length === 0) {
      toast({ title: 'Select at least one section', variant: 'destructive' })
      return
    }
    clearTimeout(pollRef.current!)
    setIsGenerating(true)
    setGenerated([])
    setIsDone(false)
    setProgress(0)

    const total = enabledConfigs.reduce((s, c) => s + c.totalCount, 0)
    setTotalToGen(total)

    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections: enabledConfigs.map(c => ({
            sectionId: c.sectionId,
            count: c.totalCount,
            qtRows: c.qtRows,
            topicRows: c.topicRows,
            referenceQuestionId: c.referenceQuestionId,
            customInstructions: c.customInstructions,
          })),
          extraInstructions,
          modelId: selectedModel,
        }),
      })

      if (!res.ok || !res.body) throw new Error('Generation failed')

      // Check if response returns a jobId (background mode)
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const data = await res.json()
        if (data.jobId) {
          setActiveJobId(data.jobId)
          localStorage.setItem(JOB_KEY, data.jobId)
          pollJobStatus(data.jobId)
          return
        }
      }

      // Streaming mode (existing behavior)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let genCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') { setIsDone(true); break }
            try {
              const q = JSON.parse(data)
              if (!q.error) {
                setGenerated(prev => [...prev, q])
                genCount++
                setProgress(genCount)
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      toast({ title: 'Generation failed', description: String(e), variant: 'destructive' })
    } finally {
      setIsGenerating(false)
    }
  }

  const updateConfig = (sectionId: string, updates: Partial<SectionGenConfig>) => {
    setSectionConfigs(prev => ({ ...prev, [sectionId]: { ...prev[sectionId], ...updates } }))
  }

  const enabledCount = Object.values(sectionConfigs).filter(c => c.enabled).length
  const totalCount = Object.values(sectionConfigs).filter(c => c.enabled).reduce((s, c) => s + c.totalCount, 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Generate Questions</h2>
        <p className="text-sm text-gray-500">Configure how many questions to generate per section, type, and topic</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Config Panel — 3 cols */}
        <div className="lg:col-span-3 space-y-4">
          {isLoading ? (
            <div className="space-y-3">{Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : sections.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No sections defined. Add sections first.</div>
          ) : (
            <>
              {/* AI Context summary */}
              {docSummary.length > 0 && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs font-semibold text-green-800 mb-1">AI Context:</p>
                  <div className="flex flex-wrap gap-1">
                    {docSummary.map(({type, count}) => (
                      <span key={type} className="text-xs px-2 py-0.5 bg-white border border-green-200 rounded-full text-green-700">
                        {docTypeLabels[type] ?? type} ({count})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 text-sm">
                <button onClick={() => setSectionConfigs(prev => { const n={...prev}; Object.keys(n).forEach(k => { n[k]={...n[k],enabled:true} }); return n })} className="text-primary hover:underline">Select all</button>
                <span className="text-gray-300">|</span>
                <button onClick={() => setSectionConfigs(prev => { const n={...prev}; Object.keys(n).forEach(k => { n[k]={...n[k],enabled:false} }); return n })} className="text-gray-500 hover:underline">Deselect all</button>
              </div>

              {sections.map(sec => {
                const cfg = sectionConfigs[sec.id]
                if (!cfg) return null
                const isExpanded = expandedSec.has(sec.id)
                return (
                  <Card key={sec.id} className={cfg.enabled ? 'border-primary' : ''}>
                    <CardContent className="p-4">
                      {/* Header row */}
                      <div className="flex items-center gap-3">
                        <Checkbox checked={cfg.enabled} onCheckedChange={v => updateConfig(sec.id, { enabled: !!v })} />
                        <div className="flex-1">
                          <span className="font-medium text-sm">{sec.name}</span>
                          <div className="flex gap-1 mt-0.5">
                            <Badge variant="outline" className="text-xs">{sec.questionType.replace(/_/g, ' ')}</Badge>
                            <span className="text-xs text-gray-400">Bank: {cfg.totalCount} q</span>
                          </div>
                        </div>
                        {cfg.enabled && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedSec(prev => { const s = new Set(prev); s.has(sec.id) ? s.delete(sec.id) : s.add(sec.id); return s })}>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>

                      {/* Expanded config */}
                      {cfg.enabled && isExpanded && (
                        <div className="mt-3 pt-3 border-t space-y-4">
                          {/* Total bank count */}
                          <div className="flex items-center gap-3">
                            <Label className="text-xs w-32 shrink-0">Total to generate</Label>
                            <Input type="number" min={1} value={cfg.totalCount}
                              onChange={e => updateConfig(sec.id, { totalCount: Number(e.target.value) || 1 })}
                              className="h-7 w-20 text-xs" />
                            <span className="text-xs text-gray-400">questions into bank</span>
                          </div>

                          {/* Per question type breakdown */}
                          {cfg.qtRows.length > 0 && (
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold">Per Question Type</Label>
                              <div className="text-xs text-gray-400 mb-1">For each type: how many questions to generate</div>
                              {cfg.qtRows.map((row, i) => (
                                <div key={i} className="grid grid-cols-[1fr_80px] gap-2 items-center">
                                  <span className="text-xs">{qtypeLabels[row.type] ?? row.type} <span className="text-gray-400">(exam: {row.count} × {row.marksEach}m)</span></span>
                                  <Input type="number" min={0} value={row.generateCount}
                                    onChange={e => {
                                      const rows = [...cfg.qtRows]
                                      rows[i] = { ...rows[i], generateCount: Number(e.target.value) || 0 }
                                      updateConfig(sec.id, { qtRows: rows, totalCount: rows.reduce((s, r) => s + r.generateCount, 0) })
                                    }}
                                    className="h-7 text-xs" />
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
                                  <span className="text-xs">{row.topicName} <span className="text-gray-400">(exam: {row.count})</span></span>
                                  <Input type="number" min={0} value={row.generateCount}
                                    onChange={e => {
                                      const rows = [...cfg.topicRows]
                                      rows[i] = { ...rows[i], generateCount: Number(e.target.value) || 0 }
                                      updateConfig(sec.id, { topicRows: rows })
                                    }}
                                    className="h-7 text-xs" />
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Reference sample question */}
                          {sampleQuestions.length > 0 && (
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold">Reference Sample Question <span className="font-normal text-gray-400">(optional — AI mimics this style)</span></Label>
                              <Select value={cfg.referenceQuestionId ?? 'none'} onValueChange={v => updateConfig(sec.id, { referenceQuestionId: v === 'none' ? undefined : v })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="No reference — use general style" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none" className="text-xs">No reference</SelectItem>
                                  {sampleQuestions.map(sq => (
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
                            <Textarea value={cfg.customInstructions ?? ''}
                              onChange={e => updateConfig(sec.id, { customInstructions: e.target.value })}
                              className="h-14 text-xs" placeholder="e.g. Focus on Decree 70/2025, avoid pure calculation..." />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}

              {/* Model selector */}
              <div className="space-y-2">
                <Label className="text-xs">AI Model</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {aiModels.length > 0 ? aiModels.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>) : (
                      <>
                        <SelectItem value="deepseek:deepseek-reasoner">DeepSeek Reasoner (Default)</SelectItem>
                        <SelectItem value="openrouter:qwen/qwen3-plus">Qwen3 Plus</SelectItem>
                        <SelectItem value="anthropic:claude-sonnet-4-5">Claude Sonnet</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Global extra instructions</Label>
                <Textarea placeholder="e.g. Only reference regulations effective from 2025..." value={extraInstructions} onChange={e => setExtraInstructions(e.target.value)} className="min-h-[80px] text-sm" />
              </div>

              {enabledCount > 0 && (
                <p className="text-sm text-gray-600">Generate <strong>{totalCount}</strong> questions across <strong>{enabledCount}</strong> section{enabledCount !== 1 ? 's' : ''}</p>
              )}

              <Button className="w-full" onClick={handleGenerate} disabled={isGenerating || enabledCount === 0}>
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                {isGenerating ? 'Generating...' : 'Generate Questions'}
              </Button>
            </>
          )}
        </div>

        {/* Progress + Results Panel — 2 cols */}
        <div className="lg:col-span-2">
          {(isGenerating || generated.length > 0 || activeJobId) && (
            <div className="space-y-3 sticky top-6">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">Generated Questions</h3>
                <div className="flex items-center gap-2">
                  {isGenerating && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  {isDone && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  <span className="text-xs text-gray-500">{progress} / {totalToGen || '?'}</span>
                </div>
              </div>

              {totalToGen > 0 && (
                <Progress value={totalToGen > 0 ? (progress / totalToGen) * 100 : 0} className="h-2" />
              )}

              {isGenerating && totalToGen > 0 && (
                <p className="text-xs text-gray-500 text-center">You can close this tab — generation continues in background. Come back to check progress.</p>
              )}

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {generated.map((q, i) => (
                  <Card key={q.id || i} className="text-xs">
                    <CardContent className="p-3">
                      <p className="font-medium line-clamp-2 mb-1">{q.stem}</p>
                      <div className="flex gap-1 flex-wrap">
                        <Badge variant="outline" className="text-xs py-0">{q.questionType?.replace(/_/g, ' ')}</Badge>
                        <Badge variant="outline" className="text-xs py-0">{q.difficulty}</Badge>
                        {q.topic && <span className="text-gray-400">{q.topic}</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {isGenerating && <div className="h-12 flex items-center justify-center text-gray-400 text-xs"><Loader2 className="h-4 w-4 animate-spin mr-2" />Generating...</div>}
              </div>

              {isDone && (
                <div className="text-center">
                  <p className="text-sm text-primary font-medium">✓ {progress} questions saved to question bank</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => window.location.href = `${window.location.pathname.replace('/generate', '/questions')}`}>
                    View Question Bank →
                  </Button>
                </div>
              )}
            </div>
          )}

          {!isGenerating && generated.length === 0 && !activeJobId && (
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
