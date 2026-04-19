'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  BookOpen,
  Clock,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Award,
} from 'lucide-react'

type QuizInfo = {
  title: string
  description: string | null
  questionsPerAttempt: number
  timeLimitMinutes: number | null
  passMark: number
  identifyBy: string
  access: string
  displayMode: string
  showAnswers: boolean
  showScore: boolean
  showCorrectAnswers: boolean
  passMessage: string | null
  failMessage: string | null
  introText: string | null
  conclusionText: string | null
  // Per-question feedback
  feedbackShowCorrect: boolean
  feedbackShowAnswer: boolean
  feedbackShowExplanation: boolean
  // Certificate
  certificateEnabled: boolean
  certificateTitle: string | null
  certificateMessage: string | null
  // Theme
  themeColor: string | null
  themeFont: string | null
  themeLogo: string | null
  // Anti-cheat
  disableRightClick: boolean
  disableCopyPaste: boolean
  disableTranslate: boolean
  disablePrint: boolean
}

type Question = {
  id: string
  quizQuestionId: string
  stem: string
  questionType: string
  options: string[] | { left: string[]; right: string[] } | null
  correctAnswer: string | null
  explanation: string | null
  points: number
}

type FeedbackState = {
  isCorrect: boolean
  correctAnswer: string
  explanation: string | null
}

type Phase = 'landing' | 'passcode' | 'quiz' | 'submitted' | 'results'

export default function PublicQuizPage() {
  const params = useParams()
  const shareCode = params.shareCode as string
  const printRef = useRef<HTMLDivElement>(null)

  const [phase, setPhase] = useState<Phase>('landing')
  const [quiz, setQuiz] = useState<QuizInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // User info
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [passcode, setPasscode] = useState('')

  // Quiz state
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  // Multiple response: store as comma-separated selected options
  const [multiAnswers, setMultiAnswers] = useState<Record<string, string[]>>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Matching answers: { [quizQuestionId]: { [leftItem]: rightItem } }
  const [matchingAnswers, setMatchingAnswers] = useState<Record<string, Record<string, string>>>({})

  // Per-question feedback
  const [questionFeedback, setQuestionFeedback] = useState<Record<string, FeedbackState>>({})
  const [showFeedbackForId, setShowFeedbackForId] = useState<string | null>(null)

  // Results
  const [results, setResults] = useState<{
    totalScore: number
    maxScore: number
    pct: number
    passed: boolean
    answers: Array<{ questionId: string; stem: string; answer: string; isCorrect: boolean; correctAnswer: string; explanation: string; marksAwarded: number }>
  } | null>(null)

  useEffect(() => {
    loadQuiz()
  }, [shareCode])

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer)
          handleSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [timeLeft])

  // Apply theme color as CSS variable
  useEffect(() => {
    if (quiz?.themeColor) {
      document.documentElement.style.setProperty('--primary', hexToHsl(quiz.themeColor))
    }
    return () => {
      document.documentElement.style.removeProperty('--primary')
    }
  }, [quiz?.themeColor])

  // Anti-cheat
  useEffect(() => {
    if (!quiz || phase !== 'quiz') return
    const handlers: Array<[string, EventListener]> = []
    if (quiz.disableRightClick) {
      const h: EventListener = (e) => e.preventDefault()
      document.addEventListener('contextmenu', h)
      handlers.push(['contextmenu', h])
    }
    if (quiz.disableCopyPaste) {
      const hc: EventListener = (e) => e.preventDefault()
      const hp: EventListener = (e) => e.preventDefault()
      document.addEventListener('copy', hc)
      document.addEventListener('paste', hp)
      handlers.push(['copy', hc], ['paste', hp])
    }
    return () => {
      handlers.forEach(([event, handler]) => document.removeEventListener(event, handler))
    }
  }, [quiz, phase])

  function hexToHsl(hex: string): string {
    // Convert hex to HSL string for CSS custom property
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (!result) return '142 76% 28%'
    let r = parseInt(result[1], 16) / 255
    let g = parseInt(result[2], 16) / 255
    let b = parseInt(result[3], 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    let h = 0, s = 0, l = (max + min) / 2
    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
        case g: h = ((b - r) / d + 2) / 6; break
        case b: h = ((r - g) / d + 4) / 6; break
      }
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
  }

  const loadQuiz = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/quiz/${shareCode}`)
      if (!res.ok) throw new Error('Quiz not found')
      const data = await res.json()
      setQuiz(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setIsLoading(false)
    }
  }

  const startQuiz = async () => {
    const identifyValue = quiz?.identifyBy === 'NAME' ? name : quiz?.identifyBy === 'EMAIL' ? email : identifier
    if (!identifyValue) return

    setIsLoading(true)
    try {
      const res = await fetch(`/api/quiz/${shareCode}/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: name,
          guestEmail: email,
          passcode: quiz?.access === 'PASSCODE' ? passcode : undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to start')
      }
      const data = await res.json()
      setAttemptId(data.attemptId)
      setQuestions(data.questions)
      if (quiz?.timeLimitMinutes) {
        setTimeLeft(quiz.timeLimitMinutes * 60)
      }
      setPhase('quiz')
    } catch (e) {
      setError(String(e))
    } finally {
      setIsLoading(false)
    }
  }

  const shouldShowFeedback = (quiz: QuizInfo) =>
    quiz.displayMode === 'ONE_AT_ONCE' &&
    (quiz.feedbackShowCorrect || quiz.feedbackShowAnswer || quiz.feedbackShowExplanation)

  const saveAnswer = async (questionId: string, answer: string) => {
    if (!attemptId) return
    setAnswers((prev) => ({ ...prev, [questionId]: answer }))
    await fetch(`/api/quiz/${shareCode}/attempt/${attemptId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizQuestionId: questionId, answer }),
    })

    // Per-question feedback (only in ONE_AT_ONCE mode)
    if (quiz && shouldShowFeedback(quiz)) {
      const q = questions.find((q) => q.quizQuestionId === questionId)
      if (q) {
        // Compute locally
        let isCorrect = false
        const correctAnswer = q.correctAnswer ?? ''
        if (q.questionType === 'MCQ' || q.questionType === 'TRUE_FALSE') {
          isCorrect = answer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()
        } else if (q.questionType === 'SHORT_ANSWER' || q.questionType === 'FILL_BLANK') {
          isCorrect = answer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()
        } else if (q.questionType === 'MULTIPLE_RESPONSE') {
          // For multiple response, compare sorted arrays
          const userSet = answer.split('||').map((s) => s.trim().toLowerCase()).sort()
          const correctSet = correctAnswer.split('||').map((s) => s.trim().toLowerCase()).sort()
          isCorrect = JSON.stringify(userSet) === JSON.stringify(correctSet)
        }
        const feedback: FeedbackState = {
          isCorrect,
          correctAnswer,
          explanation: q.explanation ?? null,
        }
        setQuestionFeedback((prev) => ({ ...prev, [questionId]: feedback }))
        setShowFeedbackForId(questionId)
      }
    }
  }

  const saveMatchingAnswer = async (questionId: string, updatedPairs: Record<string, string>) => {
    setMatchingAnswers((prev) => ({ ...prev, [questionId]: updatedPairs }))
    // Build answer as JSON: [[left, right], ...]
    const answer = JSON.stringify(Object.entries(updatedPairs))
    setAnswers((a) => ({ ...a, [questionId]: answer }))
    if (attemptId) {
      await fetch(`/api/quiz/${shareCode}/attempt/${attemptId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizQuestionId: questionId, answer }),
      })
    }
  }

  const toggleMultiAnswer = async (questionId: string, opt: string) => {
    if (!attemptId) return
    setMultiAnswers((prev) => {
      const current = prev[questionId] || []
      const next = current.includes(opt)
        ? current.filter((o) => o !== opt)
        : [...current, opt]
      const answer = next.join('||')
      // Persist
      fetch(`/api/quiz/${shareCode}/attempt/${attemptId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizQuestionId: questionId, answer }),
      })
      setAnswers((a) => ({ ...a, [questionId]: answer }))
      return { ...prev, [questionId]: next }
    })
  }

  const handleSubmit = async () => {
    if (!attemptId) return
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/quiz/${shareCode}/attempt/${attemptId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      // Normalize results structure
      setResults({
        totalScore: data.earnedPoints ?? data.totalScore ?? 0,
        maxScore: data.totalPoints ?? data.maxScore ?? 0,
        pct: data.score ?? data.pct ?? 0,
        passed: data.passed ?? false,
        answers: (data.answers || []).map((a: {
          questionId?: string; stem?: string; answer?: string; correct?: boolean; isCorrect?: boolean;
          correctAnswer?: string; explanation?: string; marksAwarded?: number; earnedPoints?: number
        }) => ({
          questionId: a.questionId || '',
          stem: a.stem || '',
          answer: a.answer || '',
          isCorrect: a.isCorrect ?? a.correct ?? false,
          correctAnswer: a.correctAnswer || '',
          explanation: a.explanation || '',
          marksAwarded: a.marksAwarded ?? a.earnedPoints ?? 0,
        })),
      })
      setPhase('results')
    } catch {
      setError('Failed to submit exam')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePrintCertificate = () => {
    if (!quiz || !results) return
    const studentName = name || email || identifier || 'Student'
    const certTitle = quiz.certificateTitle || 'Certificate of Completion'
    const certMessage = (quiz.certificateMessage || 'This is to certify that {name} has successfully completed {quiz}.')
      .replace('{name}', studentName)
      .replace('{quiz}', quiz.title)
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${certTitle}</title>
          <style>
            @page { size: landscape; margin: 1in; }
            body {
              font-family: Georgia, serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: white;
            }
            .cert {
              border: 8px double #028a39;
              padding: 60px 80px;
              text-align: center;
              max-width: 800px;
              width: 100%;
            }
            .cert-title {
              font-size: 42px;
              color: #028a39;
              margin-bottom: 16px;
              font-weight: bold;
            }
            .cert-subtitle {
              font-size: 18px;
              color: #666;
              margin-bottom: 40px;
            }
            .cert-name {
              font-size: 32px;
              font-weight: bold;
              color: #111;
              margin: 24px 0;
              border-bottom: 2px solid #028a39;
              padding-bottom: 12px;
              display: inline-block;
              min-width: 300px;
            }
            .cert-message {
              font-size: 16px;
              color: #444;
              margin: 24px 0;
              line-height: 1.6;
            }
            .cert-score {
              font-size: 22px;
              color: #028a39;
              font-weight: bold;
              margin: 16px 0;
            }
            .cert-date {
              font-size: 14px;
              color: #888;
              margin-top: 40px;
            }
          </style>
        </head>
        <body>
          <div class="cert">
            <div class="cert-title">${certTitle}</div>
            <div class="cert-subtitle">This is to certify that</div>
            <div class="cert-name">${studentName}</div>
            <div class="cert-message">${certMessage}</div>
            <div class="cert-score">Score: ${results.pct}%</div>
            <div class="cert-date">Issued on ${date}</div>
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 500)
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

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

  const primaryStyle = quiz?.themeColor
    ? { '--quiz-primary': quiz.themeColor } as React.CSSProperties
    : {}
  const fontStyle = quiz?.themeFont
    ? { fontFamily: quiz.themeFont }
    : {}

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Error</h2>
            <p className="text-gray-500">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!quiz) return null

  /* Landing */
  if (phase === 'landing') {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-primary-50 to-white flex items-center justify-center p-4"
        style={fontStyle}
      >
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center pb-4">
            {quiz.themeLogo && (
              <img
                src={quiz.themeLogo}
                alt={`${quiz.title} logo`}
                className="h-12 object-contain mx-auto mb-4"
              />
            )}
            {!quiz.themeLogo && (
              <div className="bg-primary/10 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <BookOpen className="h-8 w-8 text-primary" />
              </div>
            )}
            <CardTitle className="text-2xl">{quiz.title}</CardTitle>
            {quiz.description && <p className="text-gray-500 mt-2">{quiz.description}</p>}
            {quiz.introText && (
              <p className="text-gray-600 mt-3 text-sm bg-gray-50 rounded p-3 text-left">{quiz.introText}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="font-bold text-lg">{quiz.questionsPerAttempt}</p>
                <p className="text-gray-500">Questions</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="font-bold text-lg">{quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes}m` : '∞'}</p>
                <p className="text-gray-500">Time Limit</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="font-bold text-lg">{quiz.passMark}%</p>
                <p className="text-gray-500">Pass Mark</p>
              </div>
            </div>

            <div className="space-y-3">
              {(quiz.identifyBy === 'NAME' || quiz.identifyBy === 'EMAIL') && (
                <div>
                  <Label>Your name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" />
                </div>
              )}
              {quiz.identifyBy === 'EMAIL' && (
                <div>
                  <Label>Email address</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" />
                </div>
              )}
              {quiz.identifyBy === 'ID' && (
                <div>
                  <Label>Student ID</Label>
                  <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Enter your ID" />
                </div>
              )}
              {quiz.access === 'PASSCODE' && (
                <div>
                  <Label>Passcode</Label>
                  <Input value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="Enter passcode" />
                </div>
              )}
            </div>

            <Button className="w-full" onClick={startQuiz} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Start Quiz
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  /* Quiz */
  if (phase === 'quiz') {
    const isOneAtATime = quiz.displayMode === 'ONE_AT_ONCE'
    const currentQ = questions[currentIndex]
    const progress = ((currentIndex + 1) / questions.length) * 100
    const answeredCount = Object.keys(answers).length
    const hasFeedback = shouldShowFeedback(quiz)
    const currentFeedback = currentQ && showFeedbackForId === currentQ.quizQuestionId
      ? questionFeedback[currentQ.quizQuestionId]
      : null

    // If an option already starts with "A. " or "A) " etc, don't add prefix again to avoid "A.A. ..."
    const hasBuiltinPrefix = (opt: string): boolean => /^[A-Za-z][.)][\s)]/.test(opt)

    const renderQuestionInput = (q: Question, inAllAtOnce = false) => {
      const qId = q.quizQuestionId
      const options = Array.isArray(q.options) ? q.options as string[] : null

      return (
        <>
          {/* TEXT_BLOCK: just display, no input */}
          {q.questionType === 'TEXT_BLOCK' && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded text-blue-800 italic text-sm">
              {q.stem}
            </div>
          )}

          {q.questionType === 'MCQ' && options && (
            <RadioGroup
              name={`rg-${qId}`}
              value={answers[qId] || ''}
              onValueChange={(v) => saveAnswer(qId, v)}
            >
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                  <RadioGroupItem value={opt} id={`q${qId}-opt-${i}`} />
                  <Label htmlFor={`q${qId}-opt-${i}`} className="cursor-pointer flex-1">
                    {hasBuiltinPrefix(opt) ? opt : (
                      <><span className="font-medium mr-2">{String.fromCharCode(65 + i)}.</span>{opt}</>
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}

          {q.questionType === 'MULTIPLE_RESPONSE' && options && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 mb-3">Select all that apply</p>
              {options.map((opt, i) => {
                const selected = (multiAnswers[qId] || []).includes(opt)
                return (
                  <div
                    key={i}
                    onClick={() => toggleMultiAnswer(qId, opt)}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selected ? 'border-primary bg-primary/5' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                      selected ? 'border-primary bg-primary' : 'border-gray-400'
                    }`}>
                      {selected && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                    <span className="text-sm">
                      {hasBuiltinPrefix(opt) ? opt : (
                        <><span className="font-medium mr-2">{String.fromCharCode(65 + i)}.</span>{opt}</>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {q.questionType === 'FILL_BLANK' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Fill in the blank</p>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Your answer..."
                value={answers[qId] || ''}
                onChange={(e) => saveAnswer(qId, e.target.value)}
              />
            </div>
          )}

          {q.questionType === 'ESSAY' && (
            <Textarea
              placeholder="Write your answer here..."
              value={answers[qId] || ''}
              onChange={(e) => saveAnswer(qId, e.target.value)}
              className="min-h-[180px]"
            />
          )}

          {q.questionType === 'LONG_ANSWER' && (
            <Textarea
              placeholder="Write your answer here..."
              value={answers[qId] || ''}
              onChange={(e) => saveAnswer(qId, e.target.value)}
              className="min-h-[180px]"
            />
          )}

          {q.questionType === 'TRUE_FALSE' && (
            <div className="grid grid-cols-2 gap-3">
              {['True', 'False'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => saveAnswer(qId, opt)}
                  className={`p-4 rounded-lg border-2 font-medium text-lg transition-colors ${
                    answers[qId] === opt
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {q.questionType === 'SHORT_ANSWER' && (
            <Textarea
              placeholder="Type your answer here..."
              value={answers[qId] || ''}
              onChange={(e) => saveAnswer(qId, e.target.value)}
              className="min-h-[120px]"
            />
          )}

          {q.questionType === 'MATCHING' && (() => {
            const opts = parseMatchingOptions(q.options)
            const currentPairs = matchingAnswers[qId] || {}
            return (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Match each item on the left with the correct item on the right.</p>
                {opts.left.map((leftItem, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1 p-2 bg-gray-50 rounded border text-sm font-medium">{leftItem}</div>
                    <span className="text-gray-400">→</span>
                    <select
                      className="flex-1 border rounded px-2 py-2 text-sm"
                      value={currentPairs[leftItem] || ''}
                      onChange={(e) => {
                        const updated = { ...currentPairs, [leftItem]: e.target.value }
                        saveMatchingAnswer(qId, updated)
                      }}
                    >
                      <option value="">Select...</option>
                      {opts.right.map((rightItem, j) => (
                        <option key={j} value={rightItem}>{rightItem}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )
          })()}
        </>
      )
    }

    return (
      <div className="min-h-screen bg-gray-50" style={{ ...primaryStyle, ...fontStyle }}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b shadow-sm">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {quiz.themeLogo && (
                <img src={quiz.themeLogo} alt="logo" className="h-8 w-auto object-contain" />
              )}
              <div>
                <p className="text-sm font-medium">{quiz.title}</p>
                <p className="text-xs text-gray-500">
                  {isOneAtATime
                    ? `Question ${currentIndex + 1} of ${questions.length}`
                    : `${answeredCount} of ${questions.length} answered`}
                </p>
              </div>
            </div>
            {timeLeft !== null && (
              <div className={`flex items-center gap-2 font-mono text-sm ${timeLeft < 300 ? 'text-red-600' : ''}`}>
                <Clock className="h-4 w-4" />
                {formatTime(timeLeft)}
              </div>
            )}
          </div>
          {isOneAtATime && <Progress value={progress} className="h-1 rounded-none" />}
        </div>

        <div className="max-w-3xl mx-auto p-4 space-y-4">
          {isOneAtATime ? (
            /* One at a time */
            currentQ && (
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-gray-500 mb-2">Question {currentIndex + 1}</p>
                  <p className="text-base font-medium mb-6 leading-relaxed">{currentQ.stem}</p>

                  {renderQuestionInput(currentQ)}

                  {/* Per-question feedback panel */}
                  {hasFeedback && currentFeedback && (
                    <div className={`mt-4 p-3 rounded-lg border ${
                      currentFeedback.isCorrect
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                    }`}>
                      {quiz.feedbackShowCorrect && (
                        <div className={`flex items-center gap-2 font-medium mb-1 ${
                          currentFeedback.isCorrect ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {currentFeedback.isCorrect ? (
                            <><CheckCircle2 className="h-4 w-4" /> Correct!</>
                          ) : (
                            <><XCircle className="h-4 w-4" /> Incorrect</>
                          )}
                        </div>
                      )}
                      {quiz.feedbackShowAnswer && currentFeedback.correctAnswer && (
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Correct answer: </span>
                          {currentFeedback.correctAnswer}
                        </p>
                      )}
                      {quiz.feedbackShowExplanation && currentFeedback.explanation && (
                        <p className="text-sm text-gray-600 mt-1 italic">
                          {currentFeedback.explanation}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between mt-6">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCurrentIndex((i) => Math.max(0, i - 1))
                        setShowFeedbackForId(null)
                      }}
                      disabled={currentIndex === 0}
                    >
                      <ChevronLeft className="h-4 w-4 mr-2" />
                      Previous
                    </Button>
                    {currentIndex < questions.length - 1 ? (
                      <Button onClick={() => {
                        setCurrentIndex((i) => i + 1)
                        setShowFeedbackForId(null)
                      }}>
                        Next
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          if (confirm(`Submit exam? You have answered ${answeredCount} of ${questions.length} questions.`)) {
                            handleSubmit()
                          }
                        }}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Submit Quiz
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          ) : (
            /* All at once */
            <>
              {questions.map((q, i) => (
                <Card key={q.id}>
                  <CardContent className="p-6">
                    <p className="text-sm text-gray-500 mb-2">Question {i + 1}</p>
                    <p className="text-base font-medium mb-4 leading-relaxed">{q.stem}</p>
                    {renderQuestionInput(q, true)}
                  </CardContent>
                </Card>
              ))}

              <Button
                className="w-full"
                size="lg"
                onClick={() => {
                  if (confirm(`Submit quiz? ${answeredCount} of ${questions.length} questions answered.`)) {
                    handleSubmit()
                  }
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Submit Quiz
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  /* Results */
  if (phase === 'results' && results) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" style={fontStyle}>
        <div className="max-w-2xl w-full space-y-4">
          <Card>
            <CardContent className="py-8 text-center">
              {quiz.themeLogo && (
                <img src={quiz.themeLogo} alt="logo" className="h-10 object-contain mx-auto mb-4" />
              )}
              {results.passed ? (
                <CheckCircle2 className="h-16 w-16 text-primary mx-auto mb-4" />
              ) : (
                <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
              )}
              {quiz.showScore && (
                <>
                  <div className="text-4xl font-bold mb-1">{results.pct}%</div>
                  <div className="text-gray-500 mb-2">
                    {results.totalScore} / {results.maxScore} points
                  </div>
                </>
              )}
              <Badge
                variant={results.passed ? 'success' : 'destructive'}
                className="text-base px-4 py-1"
              >
                {results.passed ? 'PASSED ✓' : 'FAILED ✗'}
              </Badge>
              {results.passed && quiz.passMessage && (
                <p className="mt-4 text-primary font-medium">{quiz.passMessage}</p>
              )}
              {!results.passed && quiz.failMessage && (
                <p className="mt-4 text-red-600">{quiz.failMessage}</p>
              )}
              {quiz.conclusionText && (
                <p className="mt-4 text-gray-600 text-sm">{quiz.conclusionText}</p>
              )}

              {/* Certificate button */}
              {quiz.certificateEnabled && results.passed && (
                <div className="mt-6">
                  <Button
                    onClick={handlePrintCertificate}
                    className="bg-[#028a39] hover:bg-[#026d2e] text-white"
                  >
                    <Award className="h-4 w-4 mr-2" />
                    Download Certificate
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {quiz.showAnswers && results.answers && (
            <div className="space-y-3">
              {results.answers.map((ans, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {quiz.showCorrectAnswers && (
                        ans.isCorrect ? (
                          <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                        )
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-sm mb-2">Q{i + 1}. {ans.stem}</p>
                        <p className="text-sm">
                          <span className="text-gray-500">Your answer: </span>
                          <span className={quiz.showCorrectAnswers ? (ans.isCorrect ? 'text-primary' : 'text-red-600') : ''}>
                            {ans.answer || 'Not answered'}
                          </span>
                        </p>
                        {quiz.showCorrectAnswers && !ans.isCorrect && ans.correctAnswer && (
                          <p className="text-sm">
                            <span className="text-gray-500">Correct: </span>
                            <span className="text-primary font-medium">{ans.correctAnswer}</span>
                          </p>
                        )}
                        {ans.explanation && (
                          <p className="text-xs text-gray-500 mt-2 p-2 bg-gray-50 rounded">
                            {ans.explanation}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}
