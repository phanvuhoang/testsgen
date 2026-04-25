'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, RefreshCw, Sparkles, BookOpen, Save, ChevronDown } from 'lucide-react'

type Section = { id: string; name: string; questionType: string }
type Topic = { id: string; name: string; isOverall: boolean; parentId: string | null }
type ParsedSampleQ = {
  id: string
  title: string | null
  content: string
  topicId: string | null
  topicName: string | null
  sectionId: string | null
  syllabusCode: string | null
}
type AIModel = { id: string; label: string }

function parseSyllabusIssues(syllabusCode: string | null): { code: string; issues: string[] } {
  if (!syllabusCode) return { code: '', issues: [] }
  const parts = syllabusCode.split(' | Issues: ')
  return {
    code: parts[0]?.trim() || '',
    issues: parts[1] ? parts[1].split(',').map(s => s.trim()).filter(Boolean) : [],
  }
}

export default function ManualPage() {
  const params = useParams()
  const { toast } = useToast()
  const sessionId = params.sessionId as string

  const [sections, setSections] = useState<Section[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [sampleQuestions, setSampleQuestions] = useState<ParsedSampleQ[]>([])
  const [aiModels, setAIModels] = useState<AIModel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [samplePopoverOpen, setSamplePopoverOpen] = useState(false)

  // Step 1
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [selectedTopicId, setSelectedTopicId] = useState('__all__')

  // Step 2
  const [caseText, setCaseText] = useState('')
  const [selectedSampleId, setSelectedSampleId] = useState('')

  // Step 3
  const [selectedModel, setSelectedModel] = useState('claudible:1')
  const [isRegenNumbers, setIsRegenNumbers] = useState(false)
  const [isGeneratingQA, setIsGeneratingQA] = useState(false)
  const [generatedResult, setGeneratedResult] = useState<{questionPrompt: string; modelAnswer: string | null} | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/sessions/${sessionId}/sections`).then(r => r.ok ? r.json() : []),
      fetch(`/api/sessions/${sessionId}/topics`).then(r => r.ok ? r.json() : []),
      fetch(`/api/sessions/${sessionId}/parsed-questions`).then(r => r.ok ? r.json() : []),
      fetch('/api/ai-models').catch(() => ({ ok: false })),
    ]).then(([secs, tops, samples, modelRes]) => {
      setSections(secs)
      setTopics(tops.filter((t: Topic) => !t.isOverall))
      setSampleQuestions(samples)
      if ('ok' in modelRes && (modelRes as Response).ok) {
        (modelRes as Response).json().then(setAIModels)
      }
    }).finally(() => setIsLoading(false))
  }, [sessionId])

  const selectedTopic = topics.find(t => t.id === selectedTopicId)
  const selectedSection = sections.find(s => s.id === selectedSectionId)

  // Filter samples by selected section and topic
  const relevantSamples = sampleQuestions.filter(sq => {
    if (selectedSectionId && sq.sectionId && sq.sectionId !== selectedSectionId) return false
    if (!selectedTopicId || selectedTopicId === '__all__') return true
    return sq.topicId === selectedTopicId
  })

  const selectedSample = sampleQuestions.find(s => s.id === selectedSampleId)

  const handleLoadSample = (sampleId: string) => {
    setSelectedSampleId(sampleId)
    setSamplePopoverOpen(false)
    const sample = sampleQuestions.find(s => s.id === sampleId)
    if (!sample) return
    const content = sample.content.replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    const answerIdx = content.search(/\n(answer|solution|working|a\.|b\.)/i)
    setCaseText(answerIdx > 0 ? content.slice(0, answerIdx).trim() : content)
  }

  const handleRegenNumbers = async () => {
    if (!caseText.trim()) return
    setIsRegenNumbers(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenNumbers', caseText, sectionId: selectedSectionId, modelId: selectedModel }),
      })
      const data = await res.json()
      if (data.result) setCaseText(data.result)
    } catch {
      toast({ title: 'Failed to regenerate numbers', variant: 'destructive' })
    } finally {
      setIsRegenNumbers(false)
    }
  }

  const handleGenerateQA = async () => {
    if (!caseText.trim()) return
    setIsGeneratingQA(true)
    setGeneratedResult(null)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateQA',
          caseText,
          sectionId: selectedSectionId,
          modelId: selectedModel,
          topicName: selectedTopic?.name,
        }),
      })
      const data = await res.json()
      if (data.result) setGeneratedResult(data.result)
    } catch {
      toast({ title: 'Failed to generate Q&A', variant: 'destructive' })
    } finally {
      setIsGeneratingQA(false)
    }
  }

  const handleSaveToBank = async () => {
    if (!generatedResult || !selectedSectionId) return
    setIsSaving(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionId: selectedSectionId,
          stem: `${caseText}\n\n${generatedResult.questionPrompt}`,
          questionType: selectedSection?.questionType || 'SCENARIO',
          modelAnswer: generatedResult.modelAnswer,
          topic: selectedTopic?.name,
          status: 'NEEDS_REVIEW',
        }),
      })
      if (!res.ok) throw new Error()
      toast({ title: 'Saved to Question Bank' })
      setGeneratedResult(null)
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Manual Question Creator</h2>
        <p className="text-sm text-gray-500">Enter a case scenario, optionally load from sample questions, then generate a question & answer.</p>
      </div>

      {/* Step 1: Section + Topic */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Step 1 — Section & Topic</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Section</Label>
              <Select value={selectedSectionId} onValueChange={v => { setSelectedSectionId(v); setSelectedSampleId('') }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select section..." /></SelectTrigger>
                <SelectContent>
                  {sections.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Topic <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Select value={selectedTopicId} onValueChange={v => { setSelectedTopicId(v); setSelectedSampleId('') }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select topic..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-xs">Any topic</SelectItem>
                  {topics.map(t => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.parentId ? `↳ ${t.name}` : t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Case Input */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Step 2 — Case / Scenario</p>
          {relevantSamples.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Load from Sample Question <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Popover open={samplePopoverOpen} onOpenChange={setSamplePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-8 text-xs justify-between w-full ${selectedSampleId ? 'border-[#028a39] text-[#028a39]' : ''}`}
                  >
                    {selectedSample
                      ? (selectedSample.title || selectedSample.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 50) + '…')
                      : `Select a sample to load… (${relevantSamples.length} available)`}
                    <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96 p-2" align="start">
                  <p className="text-xs font-semibold text-gray-500 mb-2">
                    Sample questions <span className="font-normal text-gray-400">(click to load case scenario)</span>
                  </p>
                  <div className="space-y-0.5 max-h-64 overflow-y-auto">
                    {relevantSamples.map(sq => {
                      const { code, issues } = parseSyllabusIssues(sq.syllabusCode)
                      const contentPreview = sq.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)
                      const isSelected = selectedSampleId === sq.id
                      return (
                        <div
                          key={sq.id}
                          className={`px-2 py-2 rounded cursor-pointer transition-colors ${isSelected ? 'bg-green-50 border border-green-200' : 'hover:bg-gray-50'}`}
                          onClick={() => handleLoadSample(sq.id)}
                          title={contentPreview}
                        >
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
                      )
                    })}
                  </div>
                  {selectedSampleId && (
                    <button
                      className="mt-2 text-xs text-gray-400 hover:text-gray-600 w-full text-left"
                      onClick={() => { setSelectedSampleId(''); setSamplePopoverOpen(false) }}
                    >
                      Clear selection
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Case / Scenario text</Label>
            <Textarea
              value={caseText}
              onChange={e => setCaseText(e.target.value)}
              placeholder="Enter the case scenario with all relevant data (amounts, dates, entity details, transactions)..."
              className="min-h-[200px] text-xs font-mono"
            />
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Generate buttons */}
      {caseText.trim() && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Step 3 — Generate</p>

            {aiModels.length > 0 && (
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0">AI Model</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {aiModels.map(m => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenNumbers}
                disabled={isRegenNumbers || isGeneratingQA}
                className="flex-1"
              >
                {isRegenNumbers ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                Regenerate Numbers
              </Button>
              <Button
                size="sm"
                onClick={handleGenerateQA}
                disabled={isGeneratingQA || isRegenNumbers}
                className="flex-1 bg-[#028a39] hover:bg-[#027030] text-white"
              >
                {isGeneratingQA ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                Generate Question & Answer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result panel */}
      {generatedResult && (
        <Card className="border-[#028a39]">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#028a39] flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" /> Generated Result
              </p>
              <Button
                size="sm"
                onClick={handleSaveToBank}
                disabled={isSaving || !selectedSectionId}
                className="bg-[#028a39] hover:bg-[#027030] text-white"
              >
                {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                Save to Question Bank
              </Button>
            </div>
            <div className="space-y-2">
              <div className="p-3 bg-gray-50 rounded border text-xs font-medium [&_table]:border-collapse [&_table]:w-full [&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-gray-100 [&_td]:px-2 [&_td]:py-1 [&_p]:mb-1">
                {/<[a-z][\s\S]*>/i.test(generatedResult.questionPrompt)
                  ? <div dangerouslySetInnerHTML={{ __html: generatedResult.questionPrompt }} />
                  : <pre className="whitespace-pre-wrap font-sans">{generatedResult.questionPrompt}</pre>
                }
              </div>
              {generatedResult.modelAnswer && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded text-xs">
                  <p className="font-semibold text-amber-900 mb-1">Model Answer / Working</p>
                  <div
                    className="text-amber-900 [&_table]:border-collapse [&_table]:w-full [&_th]:border [&_th]:border-amber-200 [&_th]:bg-amber-100 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-amber-100 [&_td]:px-2 [&_td]:py-1"
                    dangerouslySetInnerHTML={{ __html: generatedResult.modelAnswer }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
