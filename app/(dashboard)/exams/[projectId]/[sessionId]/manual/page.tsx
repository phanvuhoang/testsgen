'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Sparkles, BookOpen, Save, ChevronDown, X } from 'lucide-react'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { Checkbox } from '@/components/ui/checkbox'

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

function extractCaseText(sample: ParsedSampleQ): string {
  const content = sample.content.replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const answerIdx = content.search(/\n(answer|solution|working|a\.|b\.)/i)
  return answerIdx > 0 ? content.slice(0, answerIdx).trim() : content
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

  // Step 2 — now supports multiple selected sample IDs
  const [caseText, setCaseText] = useState('')
  const [selectedSampleIds, setSelectedSampleIds] = useState<string[]>([])

  // Step 3
  const [selectedModel, setSelectedModel] = useState('')
  const [optRegenNumbers, setOptRegenNumbers] = useState(true)
  const [optUpdateYear, setOptUpdateYear] = useState(true)
  const [optUpdateRegulations, setOptUpdateRegulations] = useState(true)
  const [optMix, setOptMix] = useState(true)
  const [isGeneratingQA, setIsGeneratingQA] = useState(false)
  const [generatedResult, setGeneratedResult] = useState<{questionPrompt: string; modelAnswer: string | null} | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [replaceSample, setReplaceSample] = useState(false)

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
        (modelRes as Response).json().then((data: { id: string; label: string; isDefault?: boolean }[]) => {
          setAIModels(data)
          const def = (data.find(m => m.isDefault) || data[0])?.id || ''
          if (def) setSelectedModel(def)
        })
      }
    }).finally(() => setIsLoading(false))
  }, [sessionId])

  const selectedTopic = topics.find(t => t.id === selectedTopicId)
  const selectedSection = sections.find(s => s.id === selectedSectionId)

  const relevantSamples = sampleQuestions.filter(sq => {
    if (selectedSectionId && sq.sectionId && sq.sectionId !== selectedSectionId) return false
    if (!selectedTopicId || selectedTopicId === '__all__') return true
    return sq.topicId === selectedTopicId
  })

  const selectedSamples = sampleQuestions.filter(s => selectedSampleIds.includes(s.id))
  const isMultiSelect = selectedSampleIds.length >= 2

  const handleToggleSample = (sampleId: string) => {
    const sample = sampleQuestions.find(s => s.id === sampleId)
    if (!sample) return

    setSelectedSampleIds(prev => {
      if (prev.includes(sampleId)) {
        const next = prev.filter(id => id !== sampleId)
        // rebuild caseText from remaining selected samples
        if (next.length === 1) {
          const remaining = sampleQuestions.find(s => s.id === next[0])
          if (remaining) setCaseText(extractCaseText(remaining))
        } else if (next.length === 0) {
          setCaseText('')
        }
        return next
      } else {
        const next = [...prev, sampleId]
        // For single selection, load its text; for multi, combine all
        if (next.length === 1) {
          setCaseText(extractCaseText(sample))
        }
        // For multi-select, case text is managed by the user or left as-is
        // (they see the list of selected samples; AI will mix them)
        return next
      }
    })
    if (selectedSampleIds.length === 0) setSamplePopoverOpen(false)
  }

  const handleClearSamples = () => {
    setSelectedSampleIds([])
    setCaseText('')
    setSamplePopoverOpen(false)
  }

  const handleGenerateQA = async () => {
    if (!caseText.trim() && selectedSampleIds.length === 0) return
    setIsGeneratingQA(true)
    setGeneratedResult(null)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateQA',
          caseText,
          // pass all selected sample contents for mix mode
          sampleContents: isMultiSelect
            ? selectedSamples.map(s => extractCaseText(s))
            : undefined,
          sectionId: selectedSectionId,
          modelId: selectedModel,
          topicName: selectedTopic?.name,
          regenNumbers: optRegenNumbers,
          updateYear: optUpdateYear,
          updateRegulations: optUpdateRegulations,
          mix: isMultiSelect ? optMix : false,
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
      const stemContent = `${caseText}\n\n${generatedResult.questionPrompt}`
      const firstSampleId = selectedSampleIds[0]
      const [bankRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}/questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sectionId: selectedSectionId,
            stem: stemContent,
            questionType: selectedSection?.questionType || 'SCENARIO',
            modelAnswer: generatedResult.modelAnswer,
            topic: selectedTopic?.name,
            status: 'NEEDS_REVIEW',
          }),
        }),
        replaceSample && firstSampleId
          ? fetch(`/api/sessions/${sessionId}/parsed-questions/${firstSampleId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: stemContent,
                answer: generatedResult.modelAnswer ?? '',
                topicName: selectedTopic?.name ?? null,
                sectionId: selectedSectionId,
                sectionName: selectedSection?.name ?? null,
              }),
            })
          : Promise.resolve(null),
      ])
      if (!bankRes.ok) throw new Error()
      toast({ title: replaceSample && firstSampleId ? 'Saved to bank & sample replaced' : 'Saved to Question Bank' })
      setGeneratedResult(null)
      setReplaceSample(false)
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
              <Select value={selectedSectionId} onValueChange={v => { setSelectedSectionId(v); handleClearSamples() }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select section..." /></SelectTrigger>
                <SelectContent>
                  {sections.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Topic <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Select value={selectedTopicId} onValueChange={v => { setSelectedTopicId(v); handleClearSamples() }}>
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
            <div className="space-y-2">
              <Label className="text-xs">Load from Sample Question <span className="text-gray-400 font-normal">(optional — select one or more)</span></Label>

              {/* Selected samples chips */}
              {selectedSamples.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedSamples.map(s => (
                    <div key={s.id} className="flex items-center gap-1 px-2 py-0.5 bg-green-50 border border-green-200 rounded-full text-xs text-green-800">
                      <span className="max-w-[180px] truncate">
                        {s.title || s.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 40) + '…'}
                      </span>
                      <button onClick={() => handleToggleSample(s.id)} className="ml-0.5 hover:text-red-600">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {selectedSamples.length > 1 && (
                    <button onClick={handleClearSamples} className="text-xs text-gray-400 hover:text-red-500 px-1">
                      Clear all
                    </button>
                  )}
                </div>
              )}

              <Popover open={samplePopoverOpen} onOpenChange={setSamplePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-8 text-xs justify-between w-full ${selectedSampleIds.length > 0 ? 'border-[#028a39] text-[#028a39]' : ''}`}
                  >
                    {selectedSampleIds.length === 0
                      ? `Select sample(s) to load… (${relevantSamples.length} available)`
                      : `${selectedSampleIds.length} sample${selectedSampleIds.length > 1 ? 's' : ''} selected — click to add more`}
                    <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-2" align="start">
                  <p className="text-xs font-semibold text-gray-500 mb-1">
                    Sample questions <span className="font-normal text-gray-400">(click to toggle selection)</span>
                  </p>
                  <p className="text-xs text-blue-600 mb-2">
                    Selecting 2+ samples enables the <strong>Mix</strong> option — AI will blend their cases into one new question.
                  </p>
                  <div className="space-y-0.5 max-h-64 overflow-y-auto">
                    {relevantSamples.map(sq => {
                      const { code, issues } = parseSyllabusIssues(sq.syllabusCode)
                      const contentPreview = sq.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)
                      const isSelected = selectedSampleIds.includes(sq.id)
                      return (
                        <div
                          key={sq.id}
                          className={`px-2 py-2 rounded cursor-pointer transition-colors border ${isSelected ? 'bg-green-50 border-green-300' : 'border-transparent hover:bg-gray-50'}`}
                          onClick={() => handleToggleSample(sq.id)}
                          title={contentPreview}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${isSelected ? 'bg-[#028a39] border-[#028a39]' : 'border-gray-300'}`}>
                              {isSelected && <span className="text-white text-[10px] leading-none">✓</span>}
                            </div>
                            <div className="min-w-0">
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
                        </div>
                      )
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Multi-sample info banner */}
              {isMultiSelect && (
                <div className="text-xs p-2 bg-blue-50 border border-blue-100 rounded text-blue-700">
                  <strong>{selectedSamples.length} samples selected.</strong> The AI will mix their case data to create a new scenario.
                  You can also edit the Case text below to guide the mix further.
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs font-semibold">
              Case / Scenario text
              {isMultiSelect && <span className="font-normal text-gray-400 ml-1">(optional — AI uses selected samples directly when Mix is enabled)</span>}
            </Label>
            <RichTextEditor
              value={caseText}
              onChange={setCaseText}
              placeholder="Enter the case scenario with all relevant data (amounts, dates, entity details, transactions)..."
              rows={8}
            />
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Generate options */}
      {(caseText.trim() || selectedSampleIds.length > 0) && (
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

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox id="regenNumbers" checked={optRegenNumbers} onCheckedChange={v => setOptRegenNumbers(!!v)} />
                  <Label htmlFor="regenNumbers" className="text-xs cursor-pointer">Regenerate numbers</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="updateYear" checked={optUpdateYear} onCheckedChange={v => setOptUpdateYear(!!v)} />
                  <Label htmlFor="updateYear" className="text-xs cursor-pointer">Update year</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="updateRegs" checked={optUpdateRegulations} onCheckedChange={v => setOptUpdateRegulations(!!v)} />
                  <Label htmlFor="updateRegs" className="text-xs cursor-pointer">Update regulations</Label>
                </div>
                {/* Mix checkbox — only visible when 2+ samples are selected */}
                {isMultiSelect && (
                  <div className="flex items-center gap-2">
                    <Checkbox id="optMix" checked={optMix} onCheckedChange={v => setOptMix(!!v)} />
                    <Label htmlFor="optMix" className="text-xs cursor-pointer font-semibold text-blue-700">
                      Mix <span className="font-normal text-gray-500">(blend the {selectedSamples.length} selected cases into one new scenario)</span>
                    </Label>
                  </div>
                )}
              </div>
              <Button
                size="sm"
                onClick={handleGenerateQA}
                disabled={isGeneratingQA || (!caseText.trim() && selectedSampleIds.length === 0)}
                className="bg-[#028a39] hover:bg-[#027030] text-white"
              >
                {isGeneratingQA ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                Generate Questions & Answers
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result panel */}
      {generatedResult && (
        <Card className="border-[#028a39]">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-semibold text-[#028a39] flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" /> Generated Result
              </p>
              <div className="flex items-center gap-3">
                {selectedSampleIds.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Checkbox id="replaceSample" checked={replaceSample} onCheckedChange={v => setReplaceSample(!!v)} />
                    <Label htmlFor="replaceSample" className="text-xs cursor-pointer text-gray-600">
                      Replace sample{selectedSampleIds.length > 1 ? ` (first selected)` : ''}
                    </Label>
                  </div>
                )}
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
