'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/components/ui/use-toast'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Upload,
  FileText,
  PenLine,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Sparkles,
  X,
  Bot,
} from 'lucide-react'

type Step = 1 | 2 | 3

type QuestionCard = {
  id: string
  stem: string
  questionType: string
  options?: string[]
  correctAnswer?: string
  explanation?: string
  difficulty: string
  points: number
}

const step2Schema = z.object({
  title: z.string().min(1, 'Title is required'),
  totalQuestions: z.number().min(1).max(500),
  easyCount: z.number().min(0),
  mediumCount: z.number().min(0),
  hardCount: z.number().min(0),
  easyPoints: z.number().min(1),
  mediumPoints: z.number().min(1),
  hardPoints: z.number().min(1),
  aiInstructions: z.string().optional(),
  includesMCQ: z.boolean(),
  includesTrueFalse: z.boolean(),
  includesShortAnswer: z.boolean(),
  includesMultipleResponse: z.boolean(),
  includesFillBlank: z.boolean(),
  includesEssay: z.boolean(),
  includesLongAnswer: z.boolean(),
  includesMatching: z.boolean(),
})

type AIModelChoice = {
  id: string
  label: string
  provider: string
  model: string
  isDefault?: boolean
}

type Step2Form = z.infer<typeof step2Schema>
type Step3Form = { questionsPerAttempt: number; passMark: number; access: string }  // minimal, kept for compat

export default function NewQuizPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [step, setStep] = useState<Step>(1)
  const [source, setSource] = useState<'upload' | 'paste' | 'manual' | null>(null)
  const [aiModels, setAIModels] = useState<AIModelChoice[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')

  // Handle ?mode=manual: pre-select manual mode and jump to step 2
  useEffect(() => {
    if (searchParams.get('mode') === 'manual') {
      setSource('manual')
      setStep(2)
    }
    // Fetch available AI models
    fetch('/api/ai-models')
      .then((r) => r.json())
      .then((data: AIModelChoice[]) => {
        setAIModels(data)
        const def = (data.find(m => m.isDefault) || data[0])?.id || ''
        if (def) setSelectedModel(def)
      })
      .catch(() => {})
  }, [])
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [pastedText, setPastedText] = useState('')
  const [uploadedDocId, setUploadedDocId] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [quizSetId, setQuizSetId] = useState<string | null>(null)
  const [createdQuizSetId, setCreatedQuizSetId] = useState<string | null>(null)
  const [generatedQuestions, setGeneratedQuestions] = useState<QuestionCard[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationComplete, setGenerationComplete] = useState(false)
  const [genProgress, setGenProgress] = useState(0)
  const [genTotal, setGenTotal] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Save/restore generation progress to localStorage so it persists across tab closes
  const saveProgressToStorage = (qsId: string, progress: number, total: number, done: boolean) => {
    try {
      localStorage.setItem(
        `tg_gen_${qsId}`,
        JSON.stringify({ progress, total, done, ts: Date.now() })
      )
    } catch {}
  }

  const clearProgressFromStorage = (qsId: string) => {
    try { localStorage.removeItem(`tg_gen_${qsId}`) } catch {}
  }

  const step2Form = useForm<Step2Form>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      title: '',
      totalQuestions: 100,
      easyCount: 20,
      mediumCount: 60,
      hardCount: 20,
      easyPoints: 1,
      mediumPoints: 2,
      hardPoints: 3,
      aiInstructions: '',
      includesMCQ: true,
      includesTrueFalse: false,
      includesShortAnswer: false,
      includesMultipleResponse: false,
      includesFillBlank: false,
      includesEssay: false,
      includesLongAnswer: false,
      includesMatching: false,
    },
  })

  const handleFileUpload = async (file: File) => {
    setIsUploading(true)
    try {
      // Step 1: Create a temporary quiz set to attach the document to,
      // OR just store the file for later upload after quiz set creation.
      // We'll store file locally and upload after quiz set is created.
      setUploadedFile(file)
      setUploadedDocId('pending') // mark as pending
      toast({ title: 'File ready', description: `${file.name} will be uploaded with the quiz` })
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' })
    } finally {
      setIsUploading(false)
    }
  }

  const handleStep2Submit = async (data: Step2Form) => {
    if (source === 'manual') {
      // Create quiz set without generation, go directly to questions page
      try {
        const res = await fetch('/api/quiz-sets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: data.title,
            questionsPerAttempt: 10,
            passMark: 50,
            access: 'PUBLIC',
          }),
        })
        if (!res.ok) throw new Error()
        const quiz = await res.json()
        router.push(`/quiz/${quiz.id}/questions`)
      } catch {
        toast({ title: 'Failed to create quiz set', variant: 'destructive' })
      }
      return
    }

    // AI / upload / paste: create quiz set with sensible defaults then generate
    try {
      const res = await fetch('/api/quiz-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          questionsPerAttempt: data.totalQuestions,
          passMark: 50,
          access: 'PUBLIC',
          randomizeQuestions: true,
          displayMode: 'ONE_AT_ONCE',
          easyPercent: Math.round((data.easyCount / data.totalQuestions) * 100),
          mediumPercent: Math.round((data.mediumCount / data.totalQuestions) * 100),
          hardPercent: Math.round((data.hardCount / data.totalQuestions) * 100),
        }),
      })
      if (!res.ok) throw new Error()
      const quiz = await res.json()
      setQuizSetId(quiz.id)
      setCreatedQuizSetId(quiz.id)
      setStep(3)

      // Upload document if file was chosen
      let resolvedDocId: string | null = null
      if (source === 'upload' && uploadedFile && uploadedDocId === 'pending') {
        try {
          const formData = new FormData()
          formData.append('file', uploadedFile)
          const docRes = await fetch(`/api/quiz-sets/${quiz.id}/documents`, {
            method: 'POST',
            body: formData,
          })
          if (docRes.ok) {
            const doc = await docRes.json()
            resolvedDocId = doc.id
            setUploadedDocId(doc.id)
          }
        } catch {}
      }

      startGeneration(quiz.id, data, {} as Step3Form, resolvedDocId)
    } catch {
      toast({ title: 'Failed to create quiz set', variant: 'destructive' })
    }
  }

  const startGeneration = async (qsId: string, step2Data: Step2Form, step3Data: Step3Form, docId?: string | null) => {
    setIsGenerating(true)
    setGeneratedQuestions([])
    setGenProgress(0)
    setGenTotal(step2Data.totalQuestions)
    saveProgressToStorage(qsId, 0, step2Data.totalQuestions, false)
    try {
      const res = await fetch(`/api/quiz-sets/${qsId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          // Use documentIds array (new API) if we have a DB doc ID
          documentIds: docId ? [docId] : undefined,
          pastedText: source === 'paste' ? pastedText : undefined,
          totalQuestions: step2Data.totalQuestions,
          easyCount: step2Data.easyCount,
          mediumCount: step2Data.mediumCount,
          hardCount: step2Data.hardCount,
          easyPoints: step2Data.easyPoints,
          mediumPoints: step2Data.mediumPoints,
          hardPoints: step2Data.hardPoints,
          aiInstructions: step2Data.aiInstructions,
          questionTypes: [
            step2Data.includesMCQ && 'MCQ',
            step2Data.includesTrueFalse && 'TRUE_FALSE',
            step2Data.includesShortAnswer && 'SHORT_ANSWER',
            step2Data.includesMultipleResponse && 'MULTIPLE_RESPONSE',
            step2Data.includesFillBlank && 'FILL_BLANK',
            step2Data.includesEssay && 'ESSAY',
            step2Data.includesLongAnswer && 'LONG_ANSWER',
            step2Data.includesMatching && 'MATCHING',
          ].filter(Boolean),
          modelId: selectedModel,
        }),
      })

      if (!res.ok || !res.body) throw new Error('Generation failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let savedCount = 0

      const processLine = (line: string) => {
        if (!line.startsWith('data: ')) return
        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          setGenerationComplete(true)
          saveProgressToStorage(qsId, savedCount, step2Data.totalQuestions, true)
          return
        }
        try {
          const event = JSON.parse(data)
          if (event.type === 'question' && event.question) {
            setGeneratedQuestions((prev) => [...prev, event.question])
            savedCount++
            setGenProgress(savedCount)
            saveProgressToStorage(qsId, savedCount, step2Data.totalQuestions, false)
          } else if (event.type === 'complete') {
            setGenerationComplete(true)
            saveProgressToStorage(qsId, savedCount, step2Data.totalQuestions, true)
          } else if (event.type === 'error') {
            throw new Error(event.message)
          }
        } catch {
          // ignore parse errors for non-JSON lines
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          // Flush any remaining buffered data
          if (buffer.trim()) processLine(buffer.trim())
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          processLine(line)
        }
      }
    } catch (e) {
      toast({ title: 'Generation failed', description: String(e), variant: 'destructive' })
    } finally {
      setIsGenerating(false)
    }
  }

  const stepLabels = ['Choose Source', 'AI Config', 'Generating']
  const progressValue = (step / 3) * 100

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create New Quiz Set</h1>
        <p className="text-gray-500">Step {step} of 3 — {stepLabels[step - 1]}</p>
      </div>

      <Progress value={progressValue} className="mb-6 h-2" />

      {/* Step 1: Source */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Choose content source</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { id: 'upload', icon: Upload, title: 'Upload Document', desc: 'PDF, DOCX, or TXT file' },
              { id: 'paste', icon: FileText, title: 'Paste Text', desc: 'Paste regulations or notes' },
              { id: 'manual', icon: PenLine, title: 'Build Manually', desc: 'Add questions by hand' },
            ].map((opt) => {
              const Icon = opt.icon
              return (
                <button
                  key={opt.id}
                  onClick={() => setSource(opt.id as typeof source)}
                  className={`p-6 rounded-lg border-2 text-left transition-all ${
                    source === opt.id
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Icon className={`h-8 w-8 mb-3 ${source === opt.id ? 'text-primary' : 'text-gray-400'}`} />
                  <p className="font-semibold">{opt.title}</p>
                  <p className="text-sm text-gray-500">{opt.desc}</p>
                </button>
              )
            })}
          </div>

          {source === 'upload' && (
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files[0]
                if (file) handleFileUpload(file)
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(file)
                }}
              />
              {isUploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
              ) : uploadedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                  <span className="font-medium">{uploadedFile.name}</span>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="font-medium text-gray-700">Drop your file here or click to browse</p>
                  <p className="text-sm text-gray-500 mt-1">PDF, DOCX, TXT up to 20MB</p>
                </>
              )}
            </div>
          )}

          {source === 'paste' && (
            <div>
              <Textarea
                placeholder="Paste your study material here..."
                className="min-h-[200px]"
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
              />
              {pastedText && (
                <p className="text-xs text-gray-500 mt-1">{pastedText.length.toLocaleString()} characters</p>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => setStep(2)}
              disabled={
                !source ||
                (source === 'upload' && !uploadedFile) ||
                (source === 'paste' && !pastedText.trim())
              }
            >
              Continue
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: AI Generation Config */}
      {step === 2 && (
        <form onSubmit={step2Form.handleSubmit(handleStep2Submit)} className="space-y-6">
          <div className="space-y-2">
            <Label>Quiz Title</Label>
            <Input placeholder="e.g. Vietnamese Tax Law 2025" {...step2Form.register('title')} />
            {step2Form.formState.errors.title && (
              <p className="text-sm text-destructive">{step2Form.formState.errors.title.message}</p>
            )}
          </div>

          {source !== 'manual' && (
            <>
              <div className="space-y-2">
                <Label>Total questions to generate</Label>
                <Input
                  type="number"
                  {...step2Form.register('totalQuestions', { valueAsNumber: true })}
                />
              </div>

              <div>
                <Label className="mb-3 block">Difficulty breakdown</Label>
                <div className="grid grid-cols-3 gap-4">
                  {(['easy', 'medium', 'hard'] as const).map((level) => (
                    <Card key={level}>
                      <CardContent className="p-4">
                        <p className="text-sm font-medium capitalize mb-2">{level}</p>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs">Count</Label>
                            <Input
                              type="number"
                              {...step2Form.register(`${level}Count` as keyof Step2Form, { valueAsNumber: true })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Points</Label>
                            <Input
                              type="number"
                              {...step2Form.register(`${level}Points` as keyof Step2Form, { valueAsNumber: true })}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {(() => {
                  const vals = step2Form.watch()
                  const total = (vals.easyCount || 0) * (vals.easyPoints || 0) +
                    (vals.mediumCount || 0) * (vals.mediumPoints || 0) +
                    (vals.hardCount || 0) * (vals.hardPoints || 0)
                  return (
                    <p className="text-sm text-gray-500 mt-2">
                      Will generate {(vals.easyCount || 0) + (vals.mediumCount || 0) + (vals.hardCount || 0)} questions worth up to {total} points
                    </p>
                  )
                })()}
              </div>

              <div>
                <Label className="mb-2 block">Question types to generate</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { field: 'includesMCQ', label: 'Multiple Choice (one answer)' },
                    { field: 'includesMultipleResponse', label: 'Multiple Response (many answers)' },
                    { field: 'includesTrueFalse', label: 'True / False' },
                    { field: 'includesShortAnswer', label: 'Short Answer' },
                    { field: 'includesFillBlank', label: 'Fill in the Blank' },
                    { field: 'includesEssay', label: 'Essay (ungraded)' },
                    { field: 'includesLongAnswer', label: 'Long Answer (ungraded)' },
                    { field: 'includesMatching', label: 'Matching' },
                  ].map((opt) => (
                    <div key={opt.field} className="flex items-center gap-2">
                      <Checkbox
                        id={opt.field}
                        checked={step2Form.watch(opt.field as keyof Step2Form) as boolean}
                        onCheckedChange={(checked) =>
                          step2Form.setValue(opt.field as keyof Step2Form, checked as boolean)
                        }
                      />
                      <Label htmlFor={opt.field} className="text-sm">{opt.label}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Bot className="h-4 w-4" /> AI Model</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select AI model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {aiModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                    ))}
                    {aiModels.length === 0 && (
                      // Fallback: server will resolve to AI_MODEL_GENERATION env var when this is sent
                      <SelectItem value="deepseek:server-default">DeepSeek (Default)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Additional AI instructions (optional)</Label>
                <Textarea
                  placeholder="e.g. Focus on legal penalties, deadlines, and specific percentages..."
                  {...step2Form.register('aiInstructions')}
                />
              </div>
            </>
          )}

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button type="submit">
              {source === 'manual' ? 'Create Quiz' : 'Continue'}
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </form>
      )}

      {/* Step 3: Generation */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {generationComplete ? 'Generation complete' : 'Generating questions...'}
              </h2>
              <p className="text-gray-500 text-sm">
                {isGenerating
                  ? `${genProgress} of ${genTotal} questions generated`
                  : `Done — ${generatedQuestions.length} questions saved`}
              </p>
            </div>
            {isGenerating && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
            {generationComplete && <CheckCircle2 className="h-6 w-6 text-primary" />}
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <Progress
              value={genTotal > 0 ? Math.round((genProgress / genTotal) * 100) : 0}
              className="h-3"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>{genTotal > 0 ? Math.round((genProgress / genTotal) * 100) : 0}%</span>
              <span>{genProgress}/{genTotal} questions</span>
            </div>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {generatedQuestions.map((q, i) => (
              <Card key={q.id || i} className="animate-fade-in">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium">{q.stem}</p>
                    <div className="flex gap-1 shrink-0">
                      <Badge variant="outline" className="text-xs">{q.difficulty}</Badge>
                      <Badge variant="secondary" className="text-xs">{q.points}pts</Badge>
                    </div>
                  </div>
                  {q.options && q.options.length > 0 && (
                    <div className="space-y-1">
                      {q.options.map((opt, j) => (
                        <div
                          key={j}
                          className={`text-xs px-2 py-1 rounded ${
                            opt === q.correctAnswer ? 'bg-primary/10 text-primary' : 'text-gray-600'
                          }`}
                        >
                          {String.fromCharCode(65 + j)}. {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {isGenerating && (
              <Card>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2" />
                    <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3" />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {generationComplete && quizSetId && (
            <div className="flex gap-2 justify-end">
              <Button variant="outline" asChild>
                <a href={`/quiz/${quizSetId}/questions`}>View Question Bank</a>
              </Button>
              <Button asChild>
                <a href={`/quiz/${quizSetId}/share`}>Share Quiz</a>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
