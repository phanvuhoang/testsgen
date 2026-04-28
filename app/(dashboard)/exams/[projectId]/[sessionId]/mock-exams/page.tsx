'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Play, BarChart2, Loader2, ChevronUp, ChevronDown, ChevronRight, Wand2, ListChecks, Settings2, X } from 'lucide-react'

type MockExam = {
  id: string; name: string; duration: number; passMark: number; status: string
  _count: { attempts: number }
}

type Section = {
  id: string; name: string; questionsInExam: number; questionsInBank: number
  questionTypes: string | null; topicBreakdown: string | null
}

type DraftSection = {
  sectionId: string; name: string; drawCount: number
  questionTypes: string | null; topicBreakdown: string | null
}

type BankQ = { id: string; stem: string; questionType: string; topic: string | null; status: string }
type SampleQ = { id: string; title: string | null; content: string; questionType: string; topicName: string | null; syllabusCode: string | null; sectionId?: string | null }
type TopicRow = { topicName: string; count: number }
type TypeRow = { type: string; count: number }

const QUESTION_TYPE_OPTIONS = [
  { value: 'MCQ_SINGLE', label: 'MCQ (Single)' },
  { value: 'MCQ_MULTIPLE', label: 'MCQ (Multiple)' },
  { value: 'SHORT_ANSWER', label: 'Short Answer' },
  { value: 'SCENARIO', label: 'Scenario' },
  { value: 'ESSAY', label: 'Essay' },
  { value: 'FILL_BLANK', label: 'Fill in the Blank' },
]

function parseSyllabusIssues(sc: string | null) {
  if (!sc) return { code: '', issues: [] as string[] }
  const parts = sc.split(' | Issues: ')
  return { code: parts[0]?.trim() || '', issues: parts[1] ? parts[1].split(',').map(s => s.trim()).filter(Boolean) : [] }
}

export default function MockExamsPage() {
  const params = useParams()
  const { toast } = useToast()
  const sessionId = params.sessionId as string

  const [exams, setExams] = useState<MockExam[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)

  // Dialog state
  const [showCreate, setShowCreate] = useState(false)
  const [createStep, setCreateStep] = useState<1 | 2>(1)
  const [createMode, setCreateMode] = useState<'auto' | 'manual'>('auto')
  const [isLoadingQs, setIsLoadingQs] = useState(false)

  // Step 1 — editable section draft
  const [draftSections, setDraftSections] = useState<DraftSection[]>([])

  // Step 1 — per-section topic/type breakdown (editable)
  const [expandedSectionCfg, setExpandedSectionCfg] = useState<string | null>(null)
  const [sectionTopicRows, setSectionTopicRows] = useState<Record<string, TopicRow[]>>({})
  const [sectionTypeRows, setSectionTypeRows] = useState<Record<string, TypeRow[]>>({})

  // Step 2 Manual — questions per section
  const [bankQsBySection, setBankQsBySection] = useState<Record<string, BankQ[]>>({})
  const [sampleQsBySection, setSampleQsBySection] = useState<Record<string, SampleQ[]>>({})
  const [manualSelected, setManualSelected] = useState<Record<string, Set<string>>>({})
  const [expandedSecId, setExpandedSecId] = useState<string | null>(null)

  // Exam form
  const [form, setForm] = useState({
    name: '', duration: 120, instructions: '', passMark: 50,
    passMessage: 'Congratulations! You passed.',
    failMessage: 'Unfortunately you did not pass. Please try again.',
  })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setIsLoading(true)
    const [examsRes, sectionsRes] = await Promise.all([
      fetch(`/api/sessions/${sessionId}/mock-exams`),
      fetch(`/api/sessions/${sessionId}/sections`),
    ])
    if (examsRes.ok) setExams(await examsRes.json())
    if (sectionsRes.ok) setSections(await sectionsRes.json())
    setIsLoading(false)
  }

  const openCreate = () => {
    setDraftSections(sections.map(s => ({
      sectionId: s.id,
      name: s.name,
      drawCount: s.questionsInExam || 5,
      questionTypes: s.questionTypes,
      topicBreakdown: s.topicBreakdown,
    })))
    // Initialize per-section topic/type rows from existing section config
    const initTopics: Record<string, TopicRow[]> = {}
    const initTypes: Record<string, TypeRow[]> = {}
    for (const s of sections) {
      try { initTopics[s.id] = s.topicBreakdown ? JSON.parse(s.topicBreakdown).map((t: any) => ({ topicName: t.topicName, count: t.count || 1 })) : [] } catch { initTopics[s.id] = [] }
      try { initTypes[s.id] = s.questionTypes ? JSON.parse(s.questionTypes).map((t: any) => ({ type: t.type, count: t.count || 1 })) : [] } catch { initTypes[s.id] = [] }
    }
    setSectionTopicRows(initTopics)
    setSectionTypeRows(initTypes)
    setExpandedSectionCfg(null)
    setForm({ name: '', duration: 120, instructions: '', passMark: 50, passMessage: 'Congratulations! You passed.', failMessage: 'Unfortunately you did not pass. Please try again.' })
    setManualSelected({})
    setCreateStep(1)
    setCreateMode('auto')
    setShowCreate(true)
  }

  const moveSection = (idx: number, dir: -1 | 1) => {
    const next = idx + dir
    if (next < 0 || next >= draftSections.length) return
    setDraftSections(prev => {
      const arr = [...prev]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr
    })
  }

  const handleNextStep = async () => {
    if (createStep === 1) {
      if (createMode === 'auto') {
        await handleCreate()
      } else {
        setCreateStep(2)
        await loadQuestionsForManual()
      }
    }
  }

  const loadQuestionsForManual = async () => {
    if (Object.keys(bankQsBySection).length > 0) return // already loaded
    setIsLoadingQs(true)
    try {
      const [bankRes, samplesRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}/questions`),
        fetch(`/api/sessions/${sessionId}/parsed-questions`),
      ])
      const bank: BankQ[] = bankRes.ok ? await bankRes.json() : []
      const samples: SampleQ[] = samplesRes.ok ? await samplesRes.json() : []

      const bByS: Record<string, BankQ[]> = {}
      const sByS: Record<string, SampleQ[]> = {}
      for (const ds of draftSections) {
        bByS[ds.sectionId] = bank.filter(q => (q as any).sectionId === ds.sectionId)
        sByS[ds.sectionId] = samples.filter(q => !q.sectionId || q.sectionId === ds.sectionId)
      }
      setBankQsBySection(bByS)
      setSampleQsBySection(sByS)
      // Pre-select based on drawCount
      const sel: Record<string, Set<string>> = {}
      for (const ds of draftSections) sel[ds.sectionId] = new Set()
      setManualSelected(sel)
      if (draftSections.length > 0) setExpandedSecId(draftSections[0].sectionId)
    } finally {
      setIsLoadingQs(false)
    }
  }

  const toggleManualQ = (sectionId: string, qId: string) => {
    setManualSelected(prev => {
      const set = new Set(prev[sectionId] || [])
      if (set.has(qId)) set.delete(qId); else set.add(qId)
      return { ...prev, [sectionId]: set }
    })
  }

  const getDrawCount = (ds: DraftSection): number => {
    if (createMode === 'manual') return manualSelected[ds.sectionId]?.size || 0
    return ds.drawCount
  }

  const getEffectiveDraw = (sectionId: string, baseCount: number): number => {
    const topics = sectionTopicRows[sectionId] || []
    const types = sectionTypeRows[sectionId] || []
    if (topics.length > 0) return topics.reduce((s, t) => s + t.count, 0)
    if (types.length > 0) return types.reduce((s, t) => s + t.count, 0)
    return baseCount
  }

  const handleCreate = async () => {
    if (!form.name.trim()) { toast({ title: 'Enter exam name', variant: 'destructive' }); return }
    setIsCreating(true)
    try {
      const sectionDraws = draftSections.map(ds => ({
        sectionId: ds.sectionId,
        questionsToDrawCount: createMode === 'manual' ? getDrawCount(ds) : getEffectiveDraw(ds.sectionId, ds.drawCount),
        topicBreakdown: createMode !== 'manual' && (sectionTopicRows[ds.sectionId]?.length > 0)
          ? JSON.stringify(sectionTopicRows[ds.sectionId]) : null,
        questionTypes: createMode !== 'manual' && (sectionTypeRows[ds.sectionId]?.length > 0)
          ? JSON.stringify(sectionTypeRows[ds.sectionId]) : null,
      }))
      const res = await fetch(`/api/sessions/${sessionId}/mock-exams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, sectionDraws }),
      })
      if (!res.ok) throw new Error()
      const exam = await res.json()
      setExams(prev => [exam, ...prev])
      setShowCreate(false)
      toast({ title: 'Mock exam created' })
    } catch {
      toast({ title: 'Failed to create exam', variant: 'destructive' })
    } finally {
      setIsCreating(false)
    }
  }

  const publishToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'
    const res = await fetch(`/api/sessions/${sessionId}/mock-exams/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) setExams(prev => prev.map(e => e.id === id ? { ...e, status: newStatus } : e))
  }

  const getSectionTypesBadges = (ds: DraftSection) => {
    if (!ds.questionTypes) return null
    try {
      const rows: { type: string; count: number; marksEach: number }[] = JSON.parse(ds.questionTypes)
      return rows.map((r, i) => (
        <span key={i} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
          {r.type.replace('MCQ_SINGLE','MCQ').replace('MCQ_MULTIPLE','MCQ-Multi').replace('SHORT_ANSWER','Short').replace('SCENARIO','Scenario').replace('CASE_STUDY','Case')} ×{r.count}
        </span>
      ))
    } catch { return null }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Mock Exams</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />Create Mock Exam
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-24 w-full"/>)}</div>
      ) : exams.length === 0 ? (
        <div className="text-center py-16 text-gray-500">No mock exams yet. Create one from the question bank.</div>
      ) : (
        <div className="space-y-3">
          {exams.map(exam => (
            <Card key={exam.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{exam.name}</h3>
                    <Badge variant={exam.status === 'PUBLISHED' ? 'success' : 'secondary'}>{exam.status}</Badge>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-500">
                    <span>{exam.duration} min</span>
                    <span>Pass: {exam.passMark}%</span>
                    <span>{exam._count.attempts} attempts</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => publishToggle(exam.id, exam.status)}>
                    {exam.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/exams/${params.projectId}/${sessionId}/mock-exams/${exam.id}/results`}>
                      <BarChart2 className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link href={`/exams/${params.projectId}/${sessionId}/mock-exams/${exam.id}/take`}>
                      <Play className="h-4 w-4 mr-1" />Take
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Create Dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Create Mock Exam
              <span className="text-xs font-normal text-gray-400 ml-2">Step {createStep} of 2</span>
            </DialogTitle>
          </DialogHeader>

          {/* Step 1 — Section Requirements */}
          {createStep === 1 && (
            <div className="space-y-4">
              {/* Exam metadata */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label>Exam Name *</Label>
                  <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Mock Exam 1 — June 2026" />
                </div>
                <div className="space-y-1">
                  <Label>Duration (minutes)</Label>
                  <Input type="number" value={form.duration} onChange={e => setForm({...form, duration: Number(e.target.value)})} />
                </div>
                <div className="space-y-1">
                  <Label>Pass Mark (%)</Label>
                  <Input type="number" value={form.passMark} onChange={e => setForm({...form, passMark: Number(e.target.value)})} />
                </div>
              </div>

              {/* Section list */}
              <div>
                <Label className="mb-2 block text-sm font-semibold">Section Requirements</Label>
                <p className="text-xs text-gray-400 mb-3">Reorder via ↑↓. Click <Settings2 className="inline h-3 w-3" /> to set per-topic or per-type question counts.</p>
                {draftSections.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No sections defined. Add sections first.</p>
                ) : (
                  <div className="space-y-2">
                    {draftSections.map((ds, idx) => {
                      const isExpanded = expandedSectionCfg === ds.sectionId
                      const topicRows = sectionTopicRows[ds.sectionId] || []
                      const typeRows = sectionTypeRows[ds.sectionId] || []
                      const hasBreakdown = topicRows.length > 0 || typeRows.length > 0
                      const effectiveDraw = getEffectiveDraw(ds.sectionId, ds.drawCount)
                      return (
                        <div key={ds.sectionId} className="border rounded-lg overflow-hidden">
                          {/* Section header row */}
                          <div className="flex items-center gap-2 p-3 bg-gray-50">
                            <div className="flex flex-col gap-0.5">
                              <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 disabled:opacity-30"
                                onClick={() => moveSection(idx, -1)} disabled={idx === 0}><ChevronUp className="h-3 w-3"/></button>
                              <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 disabled:opacity-30"
                                onClick={() => moveSection(idx, 1)} disabled={idx === draftSections.length - 1}><ChevronDown className="h-3 w-3"/></button>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{ds.name}</p>
                              {hasBreakdown && (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {topicRows.map((t, i) => <span key={i} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{t.topicName} ×{t.count}</span>)}
                                  {typeRows.map((t, i) => <span key={i} className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">{t.type.replace('MCQ_SINGLE','MCQ').replace('MCQ_MULTIPLE','MCQ-M').replace('SHORT_ANSWER','Short')} ×{t.count}</span>)}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Label className="text-xs text-gray-500">Draw:</Label>
                              {hasBreakdown ? (
                                <span className="text-sm font-bold text-[#028a39] w-10 text-center">{effectiveDraw}</span>
                              ) : (
                                <Input type="number" min={0} value={ds.drawCount}
                                  onChange={e => setDraftSections(prev => prev.map((s, i) => i === idx ? {...s, drawCount: Number(e.target.value)||0} : s))}
                                  className="w-14 h-7 text-xs text-center" />
                              )}
                              <span className="text-xs text-gray-400">q</span>
                              <button
                                onClick={() => setExpandedSectionCfg(isExpanded ? null : ds.sectionId)}
                                className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${isExpanded ? 'bg-[#028a39] text-white' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}
                                title="Configure topic/type breakdown"
                              >
                                <Settings2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Expandable config panel */}
                          {isExpanded && (
                            <div className="border-t p-3 bg-white">
                              <div className="grid grid-cols-2 gap-4">
                                {/* Topic breakdown */}
                                <div>
                                  <p className="text-xs font-semibold text-gray-600 mb-1.5">By Topic</p>
                                  <div className="space-y-1.5">
                                    {topicRows.map((row, i) => (
                                      <div key={i} className="flex items-center gap-1">
                                        <Input value={row.topicName} placeholder="Topic name"
                                          onChange={e => setSectionTopicRows(prev => ({ ...prev, [ds.sectionId]: prev[ds.sectionId].map((r, j) => j === i ? {...r, topicName: e.target.value} : r) }))}
                                          className="flex-1 h-7 text-xs" />
                                        <Input type="number" value={row.count} min={1}
                                          onChange={e => setSectionTopicRows(prev => ({ ...prev, [ds.sectionId]: prev[ds.sectionId].map((r, j) => j === i ? {...r, count: Number(e.target.value)||1} : r) }))}
                                          className="w-12 h-7 text-xs text-center" />
                                        <button onClick={() => setSectionTopicRows(prev => ({ ...prev, [ds.sectionId]: prev[ds.sectionId].filter((_, j) => j !== i) }))} className="text-gray-300 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                                      </div>
                                    ))}
                                    <button onClick={() => setSectionTopicRows(prev => ({ ...prev, [ds.sectionId]: [...(prev[ds.sectionId] || []), {topicName: '', count: 1}] }))}
                                      className="text-xs text-[#028a39] hover:text-[#026d2d]">+ Add topic</button>
                                  </div>
                                </div>
                                {/* Question type breakdown */}
                                <div>
                                  <p className="text-xs font-semibold text-gray-600 mb-1.5">By Question Type</p>
                                  <div className="space-y-1.5">
                                    {typeRows.map((row, i) => (
                                      <div key={i} className="flex items-center gap-1">
                                        <Select value={row.type} onValueChange={v => setSectionTypeRows(prev => ({ ...prev, [ds.sectionId]: prev[ds.sectionId].map((r, j) => j === i ? {...r, type: v} : r) }))}>
                                          <SelectTrigger className="flex-1 h-7 text-xs"><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            {QUESTION_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                          </SelectContent>
                                        </Select>
                                        <Input type="number" value={row.count} min={1}
                                          onChange={e => setSectionTypeRows(prev => ({ ...prev, [ds.sectionId]: prev[ds.sectionId].map((r, j) => j === i ? {...r, count: Number(e.target.value)||1} : r) }))}
                                          className="w-12 h-7 text-xs text-center" />
                                        <button onClick={() => setSectionTypeRows(prev => ({ ...prev, [ds.sectionId]: prev[ds.sectionId].filter((_, j) => j !== i) }))} className="text-gray-300 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                                      </div>
                                    ))}
                                    <button onClick={() => setSectionTypeRows(prev => ({ ...prev, [ds.sectionId]: [...(prev[ds.sectionId] || []), {type: 'SCENARIO', count: 1}] }))}
                                      className="text-xs text-[#028a39] hover:text-[#026d2d]">+ Add type</button>
                                  </div>
                                </div>
                              </div>
                              {hasBreakdown && (
                                <p className="text-xs text-gray-400 mt-2 text-right">
                                  Will draw <strong className="text-[#028a39]">{effectiveDraw} questions</strong> from this section
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  Total: <strong>{draftSections.reduce((s, d) => s + getEffectiveDraw(d.sectionId, d.drawCount), 0)} questions</strong>
                </p>
              </div>

              {/* Mode selection */}
              <div>
                <Label className="mb-2 block text-sm font-semibold">Creation Mode</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setCreateMode('auto')}
                    className={`p-3 border-2 rounded-lg text-left transition-all ${createMode === 'auto' ? 'border-[#028a39] bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Wand2 className="h-4 w-4 text-[#028a39]"/>
                      <span className="text-sm font-semibold">Automatic</span>
                    </div>
                    <p className="text-xs text-gray-500">App randomly draws questions from the question bank (matching section & topic requirements)</p>
                  </button>
                  <button
                    onClick={() => setCreateMode('manual')}
                    className={`p-3 border-2 rounded-lg text-left transition-all ${createMode === 'manual' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <ListChecks className="h-4 w-4 text-blue-600"/>
                      <span className="text-sm font-semibold">Manual</span>
                    </div>
                    <p className="text-xs text-gray-500">Browse and select questions from the bank and processed samples for each section</p>
                  </button>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button
                  onClick={handleNextStep}
                  disabled={!form.name.trim() || draftSections.length === 0 || isCreating}
                  className={createMode === 'auto' ? 'bg-[#028a39] hover:bg-[#027030] text-white' : ''}
                >
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : null}
                  {createMode === 'auto'
                    ? <><Wand2 className="h-4 w-4 mr-1"/>Create Automatically</>
                    : <>Select Questions <ChevronRight className="h-4 w-4 ml-1"/></>}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2 — Manual Question Selection */}
          {createStep === 2 && createMode === 'manual' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setCreateStep(1)} className="text-xs text-gray-500 hover:text-gray-700">← Back</button>
                <span className="text-sm font-semibold">Select Questions per Section</span>
              </div>
              <p className="text-xs text-gray-500">
                Click questions to include them. The count shown per section = how many will be drawn for this exam.
                Unchecked questions remain in the bank for future exams.
              </p>

              {isLoadingQs ? (
                <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin"/><span className="text-sm">Loading questions…</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {draftSections.map(ds => {
                    const bankQs = bankQsBySection[ds.sectionId] || []
                    const sampleQs = sampleQsBySection[ds.sectionId] || []
                    const sel = manualSelected[ds.sectionId] || new Set()
                    const isExpanded = expandedSecId === ds.sectionId
                    return (
                      <div key={ds.sectionId} className="border rounded-lg overflow-hidden">
                        <button
                          className="w-full p-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 text-left"
                          onClick={() => setExpandedSecId(isExpanded ? null : ds.sectionId)}
                        >
                          <div>
                            <span className="text-sm font-medium">{ds.name}</span>
                            <span className="ml-2 text-xs text-gray-400">
                              {sel.size} selected · {bankQs.length} bank · {sampleQs.length} samples
                            </span>
                          </div>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400"/> : <ChevronDown className="h-4 w-4 text-gray-400"/>}
                        </button>

                        {isExpanded && (
                          <div className="p-2 max-h-72 overflow-y-auto space-y-1">
                            {bankQs.length > 0 && (
                              <>
                                <p className="text-xs font-semibold text-gray-400 px-1 pt-1">Question Bank ({bankQs.length})</p>
                                {bankQs.map(q => (
                                  <div
                                    key={q.id}
                                    className={`flex items-start gap-2 p-2 rounded cursor-pointer transition-colors ${sel.has(q.id) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}
                                    onClick={() => toggleManualQ(ds.sectionId, q.id)}
                                  >
                                    <Checkbox checked={sel.has(q.id)} onCheckedChange={() => toggleManualQ(ds.sectionId, q.id)} className="mt-0.5 shrink-0"/>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex gap-1 items-center mb-0.5">
                                        <span className={`text-xs px-1 py-0.5 rounded ${q.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{q.status}</span>
                                        <span className="text-xs text-gray-400">{q.questionType.replace('MCQ_SINGLE','MCQ').replace('SHORT_ANSWER','Short')}</span>
                                        {q.topic && <span className="text-xs text-[#028a39]">[{q.topic}]</span>}
                                      </div>
                                      <p className="text-xs text-gray-700 line-clamp-2">{q.stem.replace(/<[^>]+>/g,' ').trim().slice(0,100)}…</p>
                                    </div>
                                  </div>
                                ))}
                              </>
                            )}
                            {sampleQs.length > 0 && (
                              <>
                                <p className="text-xs font-semibold text-gray-400 px-1 pt-2">Processed Samples ({sampleQs.length})</p>
                                {sampleQs.map(q => {
                                  const { code, issues } = parseSyllabusIssues(q.syllabusCode)
                                  return (
                                    <div
                                      key={q.id}
                                      className={`flex items-start gap-2 p-2 rounded cursor-pointer transition-colors ${sel.has(q.id) ? 'bg-amber-50 border border-amber-200' : 'hover:bg-gray-50'}`}
                                      onClick={() => toggleManualQ(ds.sectionId, q.id)}
                                      title={q.content.replace(/<[^>]+>/g,' ').trim().slice(0,300)}
                                    >
                                      <Checkbox checked={sel.has(q.id)} onCheckedChange={() => toggleManualQ(ds.sectionId, q.id)} className="mt-0.5 shrink-0"/>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap gap-1 mb-0.5">
                                          {q.topicName && <span className="text-xs text-[#028a39]">[{q.topicName}]</span>}
                                          {code && <span className="text-xs px-1 bg-blue-50 text-blue-700 rounded font-mono">{code}</span>}
                                          {issues.slice(0,2).map(iss => <span key={iss} className="text-xs px-1 bg-amber-50 text-amber-700 rounded">{iss}</span>)}
                                        </div>
                                        <p className="text-xs text-gray-700 line-clamp-2">
                                          {q.title || q.content.replace(/<[^>]+>/g,' ').trim().slice(0,100)}…
                                        </p>
                                      </div>
                                    </div>
                                  )
                                })}
                              </>
                            )}
                            {bankQs.length === 0 && sampleQs.length === 0 && (
                              <p className="text-xs text-gray-400 italic text-center py-4">No questions available for this section yet.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2 border-t">
                <Button variant="outline" onClick={() => setCreateStep(1)}>← Back</Button>
                <Button onClick={handleCreate} disabled={isCreating}>
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : null}
                  Create Exam ({draftSections.reduce((s,d)=>s+(manualSelected[d.sectionId]?.size||0),0)} questions)
                </Button>
              </div>
            </div>
          )}

        </DialogContent>
      </Dialog>
    </div>
  )
}
