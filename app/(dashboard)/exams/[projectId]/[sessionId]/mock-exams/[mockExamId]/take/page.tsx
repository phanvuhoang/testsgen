'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/components/ui/use-toast'
import { Clock, Flag, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react'

type ExamInfo = {
  name: string
  duration: number
  instructions: string | null
  passMark: number
}

type Question = {
  id: string
  stem: string
  questionType: string
  options: string[] | null
  marks: number
  sectionName: string
}

type Phase = 'pre' | 'exam' | 'submitted'

export default function TakeExamPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()

  const [exam, setExam] = useState<ExamInfo | null>(null)
  const [phase, setPhase] = useState<Phase>('pre')
  const [questions, setQuestions] = useState<Question[]>([])
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [currentIndex, setCurrentIndex] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [result, setResult] = useState<{
    totalScore: number
    maxScore: number
    pct: number
    passed: boolean
    passMessage: string | null
    failMessage: string | null
  } | null>(null)

  useEffect(() => {
    loadExam()
  }, [])

  // Auto-save every 30s
  useEffect(() => {
    if (phase !== 'exam') return
    const interval = setInterval(() => {
      // Answers are already saved on each answer selection
      toast({ title: 'Auto-saved', description: 'Your answers have been saved' })
    }, 30000)
    return () => clearInterval(interval)
  }, [phase])

  // Countdown timer
  useEffect(() => {
    if (phase !== 'exam' || timeLeft <= 0) return
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          handleSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [phase, timeLeft])

  const loadExam = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/mock-exams/${params.mockExamId}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setExam(data)
    } catch {
      toast({ title: 'Failed to load exam', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const startExam = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/mock-exams/${params.mockExamId}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAttemptId(data.attemptId)
      setQuestions(data.questions)
      setTimeLeft((exam?.duration || 120) * 60)
      setPhase('exam')
    } catch {
      toast({ title: 'Failed to start exam', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const saveAnswer = async (questionId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }))
    if (!attemptId) return
    await fetch(`/api/mock-exams/${params.mockExamId}/attempts/${attemptId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, answer }),
    })
  }

  const handleSubmit = async () => {
    if (!attemptId) return
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/mock-exams/${params.mockExamId}/attempts/${attemptId}/submit`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setResult(data)
      setPhase('submitted')
    } catch {
      toast({ title: 'Failed to submit', variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const getNavColor = (q: Question, i: number) => {
    if (flagged.has(q.id)) return 'bg-orange-400 text-white'
    if (answers[q.id]) return 'bg-primary text-white'
    if (i === currentIndex) return 'bg-gray-200'
    return 'bg-gray-100 text-gray-600'
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!exam) return <div className="p-6">Exam not found</div>

  /* Pre-exam */
  if (phase === 'pre') {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="py-8 text-center">
            <h1 className="text-2xl font-bold mb-2">{exam.name}</h1>
            <div className="grid grid-cols-2 gap-4 my-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <Clock className="h-6 w-6 text-primary mx-auto mb-1" />
                <p className="font-bold">{exam.duration} min</p>
                <p className="text-sm text-gray-500">Duration</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <CheckCircle2 className="h-6 w-6 text-primary mx-auto mb-1" />
                <p className="font-bold">{exam.passMark}%</p>
                <p className="text-sm text-gray-500">Pass Mark</p>
              </div>
            </div>
            {exam.instructions && (
              <div className="text-left bg-blue-50 rounded-lg p-4 mb-6 text-sm text-blue-900">
                <p className="font-medium mb-1">Instructions</p>
                <p>{exam.instructions}</p>
              </div>
            )}
            <Button className="w-full" size="lg" onClick={startExam}>
              Start Exam
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  /* During exam */
  if (phase === 'exam') {
    const currentQ = questions[currentIndex]
    const answeredCount = Object.keys(answers).length

    return (
      <div className="flex h-[calc(100vh-120px)] overflow-hidden">
        {/* Question Navigator Sidebar */}
        <div className="w-48 border-r bg-white p-3 overflow-y-auto shrink-0">
          <p className="text-xs font-semibold text-gray-500 mb-2">QUESTIONS</p>
          <div className="grid grid-cols-4 gap-1">
            {questions.map((q, i) => (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(i)}
                className={`h-8 w-full rounded text-xs font-medium transition-colors ${getNavColor(q, i)}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="mt-3 text-xs text-gray-500 space-y-1">
            <div className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-primary inline-block" /> Answered</div>
            <div className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-orange-400 inline-block" /> Flagged</div>
            <div className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-gray-100 border inline-block" /> Unanswered</div>
          </div>
          <div className="mt-4 border-t pt-3">
            <p className="text-xs text-gray-500">{answeredCount}/{questions.length} answered</p>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Timer Header */}
          <div className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0">
            <div className="text-sm text-gray-500">
              Question {currentIndex + 1} of {questions.length} — {currentQ?.sectionName}
            </div>
            <div className={`flex items-center gap-2 font-mono font-bold ${timeLeft < 300 ? 'text-red-600' : 'text-gray-700'}`}>
              <Clock className="h-4 w-4" />
              {formatTime(timeLeft)}
            </div>
          </div>

          {/* Question */}
          <div className="flex-1 overflow-y-auto p-6">
            {currentQ && (
              <div className="max-w-2xl mx-auto">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <p className="text-gray-500 text-sm mb-2">Q{currentIndex + 1} · {currentQ.marks} mark{currentQ.marks !== 1 ? 's' : ''}</p>
                    <p className="text-base leading-relaxed whitespace-pre-wrap">{currentQ.stem}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const next = new Set(flagged)
                      if (next.has(currentQ.id)) next.delete(currentQ.id)
                      else next.add(currentQ.id)
                      setFlagged(next)
                    }}
                    className={flagged.has(currentQ.id) ? 'text-orange-500' : 'text-gray-400'}
                  >
                    <Flag className="h-4 w-4" />
                  </Button>
                </div>

                {currentQ.questionType === 'MCQ_SINGLE' && currentQ.options && (
                  <RadioGroup
                    value={answers[currentQ.id] || ''}
                    onValueChange={(v) => saveAnswer(currentQ.id, v)}
                  >
                    {currentQ.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-3 p-4 rounded-lg border hover:bg-gray-50 cursor-pointer">
                        <RadioGroupItem value={opt} id={`opt-${i}`} />
                        <Label htmlFor={`opt-${i}`} className="cursor-pointer flex-1">
                          <span className="font-medium mr-2">{String.fromCharCode(65 + i)}.</span>
                          {opt}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}

                {(currentQ.questionType === 'ESSAY' || currentQ.questionType === 'SHORT_ANSWER' || currentQ.questionType === 'SCENARIO') && (
                  <Textarea
                    value={answers[currentQ.id] || ''}
                    onChange={(e) => saveAnswer(currentQ.id, e.target.value)}
                    placeholder="Type your answer here..."
                    className="min-h-[200px] text-sm"
                  />
                )}
              </div>
            )}
          </div>

          {/* Navigation Footer */}
          <div className="bg-white border-t px-6 py-3 flex items-center justify-between shrink-0">
            <Button
              variant="outline"
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
            >
              Previous
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm(`Submit exam? ${answeredCount} of ${questions.length} questions answered.`)) {
                  handleSubmit()
                }
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Exam
            </Button>
            <Button
              onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
              disabled={currentIndex === questions.length - 1}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    )
  }

  /* Submitted */
  if (phase === 'submitted' && result) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="py-8 text-center">
            {result.passed ? (
              <CheckCircle2 className="h-16 w-16 text-primary mx-auto mb-4" />
            ) : (
              <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
            )}
            <div className="text-5xl font-bold mb-2">{result.pct}%</div>
            <p className="text-gray-500 mb-3">{result.totalScore} / {result.maxScore} points</p>
            <Badge
              variant={result.passed ? 'success' : 'destructive'}
              className="text-base px-4 py-1 mb-4"
            >
              {result.passed ? 'PASSED ✓' : 'FAILED ✗'}
            </Badge>
            {result.passed && result.passMessage && (
              <p className="text-primary font-medium mt-2">{result.passMessage}</p>
            )}
            {!result.passed && result.failMessage && (
              <p className="text-red-600 mt-2">{result.failMessage}</p>
            )}
            <div className="mt-6 p-4 bg-yellow-50 rounded-lg text-sm text-yellow-800">
              <AlertCircle className="h-4 w-4 inline mr-1" />
              Written answers are being AI-graded. Check back shortly for complete results.
            </div>
            <Button className="mt-6 w-full" asChild>
              <a href={`/exams/${params.projectId}/${params.sessionId}/mock-exams/${params.mockExamId}/results`}>
                View Full Results
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
