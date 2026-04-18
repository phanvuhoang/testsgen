'use client'

import { useEffect, useState } from 'react'
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
  passMessage: string | null
  failMessage: string | null
}

type Question = {
  id: string
  quizQuestionId: string
  stem: string
  questionType: string
  options: string[] | null
  correctAnswer: string | null
  points: number
}

type Phase = 'landing' | 'passcode' | 'quiz' | 'submitted' | 'results'

export default function PublicQuizPage() {
  const params = useParams()
  const shareCode = params.shareCode as string

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

  const saveAnswer = async (questionId: string, answer: string) => {
    if (!attemptId) return
    setAnswers((prev) => ({ ...prev, [questionId]: answer }))
    await fetch(`/api/quiz/${shareCode}/attempt/${attemptId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizQuestionId: questionId, answer }),
    })
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
      setResults(data)
      setPhase('results')
    } catch {
      setError('Failed to submit exam')
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

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
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center pb-4">
            <div className="bg-primary/10 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">{quiz.title}</CardTitle>
            {quiz.description && <p className="text-gray-500 mt-2">{quiz.description}</p>}
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

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b shadow-sm">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{quiz.title}</p>
              <p className="text-xs text-gray-500">
                {isOneAtATime
                  ? `Question ${currentIndex + 1} of ${questions.length}`
                  : `${answeredCount} of ${questions.length} answered`}
              </p>
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

                  {currentQ.questionType === 'MCQ' && currentQ.options && (
                    <RadioGroup
                      value={answers[currentQ.quizQuestionId] || ''}
                      onValueChange={(v) => saveAnswer(currentQ.quizQuestionId, v)}
                    >
                      {currentQ.options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value={opt} id={`q${currentQ.quizQuestionId}-opt-${i}`} />
                          <Label htmlFor={`q${currentQ.quizQuestionId}-opt-${i}`} className="cursor-pointer flex-1">
                            <span className="font-medium mr-2">{String.fromCharCode(65 + i)}.</span>
                            {opt}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}

                  {currentQ.questionType === 'MULTIPLE_RESPONSE' && currentQ.options && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 mb-3">Select all that apply</p>
                      {currentQ.options.map((opt, i) => {
                        const selected = (multiAnswers[currentQ.quizQuestionId] || []).includes(opt)
                        return (
                          <div
                            key={i}
                            onClick={() => toggleMultiAnswer(currentQ.quizQuestionId, opt)}
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
                              <span className="font-medium mr-2">{String.fromCharCode(65 + i)}.</span>
                              {opt}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {currentQ.questionType === 'FILL_BLANK' && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">Fill in the blank</p>
                      <input
                        type="text"
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="Your answer..."
                        value={answers[currentQ.quizQuestionId] || ''}
                        onChange={(e) => saveAnswer(currentQ.quizQuestionId, e.target.value)}
                      />
                    </div>
                  )}

                  {currentQ.questionType === 'ESSAY' && (
                    <Textarea
                      placeholder="Write your answer here..."
                      value={answers[currentQ.quizQuestionId] || ''}
                      onChange={(e) => saveAnswer(currentQ.quizQuestionId, e.target.value)}
                      className="min-h-[180px]"
                    />
                  )}

                  {currentQ.questionType === 'TRUE_FALSE' && (
                    <div className="grid grid-cols-2 gap-3">
                      {['True', 'False'].map((opt) => (
                        <button
                          key={opt}
                          onClick={() => saveAnswer(currentQ.quizQuestionId, opt)}
                          className={`p-4 rounded-lg border-2 font-medium text-lg transition-colors ${
                            answers[currentQ.quizQuestionId] === opt
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {currentQ.questionType === 'SHORT_ANSWER' && (
                    <Textarea
                      placeholder="Type your answer here..."
                      value={answers[currentQ.quizQuestionId] || ''}
                      onChange={(e) => saveAnswer(currentQ.quizQuestionId, e.target.value)}
                      className="min-h-[120px]"
                    />
                  )}

                  <div className="flex justify-between mt-6">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                      disabled={currentIndex === 0}
                    >
                      <ChevronLeft className="h-4 w-4 mr-2" />
                      Previous
                    </Button>
                    {currentIndex < questions.length - 1 ? (
                      <Button onClick={() => setCurrentIndex((i) => i + 1)}>
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

                    {q.questionType === 'MCQ' && q.options && (
                      <RadioGroup
                        value={answers[q.quizQuestionId] || ''}
                        onValueChange={(v) => saveAnswer(q.quizQuestionId, v)}
                      >
                        {q.options.map((opt, j) => (
                          <div key={j} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
                            <RadioGroupItem value={opt} id={`q${q.quizQuestionId}-opt${j}`} />
                            <Label htmlFor={`q${q.quizQuestionId}-opt${j}`} className="cursor-pointer">
                              {String.fromCharCode(65 + j)}. {opt}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    )}

                    {q.questionType === 'MULTIPLE_RESPONSE' && q.options && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-gray-500 mb-2">Select all that apply</p>
                        {q.options.map((opt, j) => {
                          const selected = (multiAnswers[q.quizQuestionId] || []).includes(opt)
                          return (
                            <div
                              key={j}
                              onClick={() => toggleMultiAnswer(q.quizQuestionId, opt)}
                              className={`flex items-center gap-3 p-2 rounded border cursor-pointer transition-colors ${
                                selected ? 'border-primary bg-primary/5' : 'hover:bg-gray-50'
                              }`}
                            >
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                                selected ? 'border-primary bg-primary' : 'border-gray-400'
                              }`}>
                                {selected && <span className="text-white text-xs font-bold">✓</span>}
                              </div>
                              <span className="text-sm">{String.fromCharCode(65 + j)}. {opt}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {q.questionType === 'FILL_BLANK' && (
                      <input
                        type="text"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="Your answer..."
                        value={answers[q.quizQuestionId] || ''}
                        onChange={(e) => saveAnswer(q.quizQuestionId, e.target.value)}
                      />
                    )}

                    {q.questionType === 'ESSAY' && (
                      <Textarea
                        placeholder="Write your answer here..."
                        value={answers[q.quizQuestionId] || ''}
                        onChange={(e) => saveAnswer(q.quizQuestionId, e.target.value)}
                        className="min-h-[140px]"
                      />
                    )}

                    {q.questionType === 'TRUE_FALSE' && (
                      <div className="flex gap-3">
                        {['True', 'False'].map((opt) => (
                          <button
                            key={opt}
                            onClick={() => saveAnswer(q.quizQuestionId, opt)}
                            className={`flex-1 p-3 rounded-lg border-2 font-medium transition-colors ${
                              answers[q.quizQuestionId] === opt
                                ? 'border-primary bg-primary/5 text-primary'
                                : 'border-gray-200'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}

                    {q.questionType === 'SHORT_ANSWER' && (
                      <Textarea
                        placeholder="Type your answer..."
                        value={answers[q.quizQuestionId] || ''}
                        onChange={(e) => saveAnswer(q.quizQuestionId, e.target.value)}
                      />
                    )}
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full space-y-4">
          <Card>
            <CardContent className="py-8 text-center">
              {results.passed ? (
                <CheckCircle2 className="h-16 w-16 text-primary mx-auto mb-4" />
              ) : (
                <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
              )}
              <div className="text-4xl font-bold mb-1">{results.pct}%</div>
              <div className="text-gray-500 mb-2">
                {results.totalScore} / {results.maxScore} points
              </div>
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
            </CardContent>
          </Card>

          {quiz.showAnswers && results.answers && (
            <div className="space-y-3">
              {results.answers.map((ans, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {ans.isCorrect ? (
                        <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-sm mb-2">Q{i + 1}. {ans.stem}</p>
                        <p className="text-sm">
                          <span className="text-gray-500">Your answer: </span>
                          <span className={ans.isCorrect ? 'text-primary' : 'text-red-600'}>
                            {ans.answer || 'Not answered'}
                          </span>
                        </p>
                        {!ans.isCorrect && ans.correctAnswer && (
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
