'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  CheckCircle2, XCircle, Clock, Search,
  Trophy, TrendingUp, Eye, BookOpen, Award
} from 'lucide-react'

type AttemptRecord = {
  id: string
  quizSetId: string
  quizSetTitle: string
  quizSetShareCode: string
  startedAt: string
  submittedAt: string | null
  totalScore: number | null
  maxScore: number | null
  status: string
  passMark: number | null
}

type AnswerDetail = {
  id: string
  quizQuestionId: string | null
  answer: string | null
  isCorrect: boolean | null
  marksAwarded: number | null
  quizQuestion: {
    stem: string
    correctAnswer: string | null
    explanation: string | null
    questionType: string
    options: string[] | null
    points: number
  } | null
}

type AttemptDetail = AttemptRecord & {
  answers: AnswerDetail[]
  quizSet: { title: string; passMark: number | null; feedbackShowAnswer: boolean; feedbackShowExplanation: boolean }
}

export default function MyResultsPage() {
  const { toast } = useToast()
  const [attempts, setAttempts] = useState<AttemptRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedAttempt, setSelectedAttempt] = useState<AttemptDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => { fetchMyAttempts() }, [])

  const fetchMyAttempts = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/my-results')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAttempts(data.attempts || [])
    } catch {
      toast({ title: 'Failed to load results', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const viewDetail = async (attempt: AttemptRecord) => {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/my-results/${attempt.id}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSelectedAttempt({ ...attempt, ...data })
    } catch {
      toast({ title: 'Failed to load details', variant: 'destructive' })
    } finally {
      setLoadingDetail(false)
    }
  }

  const submitted = attempts.filter(a => a.status === 'SUBMITTED' || a.status === 'GRADED')
  const avgScore = submitted.length > 0
    ? Math.round(submitted.reduce((sum, a) => {
        if (!a.maxScore || a.maxScore === 0) return sum
        return sum + ((a.totalScore ?? 0) / a.maxScore * 100)
      }, 0) / submitted.length)
    : null
  const bestScore = submitted.length > 0
    ? Math.max(...submitted.map(a => a.maxScore ? Math.round((a.totalScore ?? 0) / a.maxScore * 100) : 0))
    : null
  const passCount = submitted.filter(a => {
    if (!a.passMark || !a.maxScore || a.maxScore === 0) return false
    return ((a.totalScore ?? 0) / a.maxScore * 100) >= a.passMark
  }).length
  const passRate = submitted.length > 0 ? Math.round(passCount / submitted.length * 100) : null

  const filtered = attempts.filter(a =>
    !search || a.quizSetTitle.toLowerCase().includes(search.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold mb-6">My Results</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Attempts', value: attempts.length, icon: BookOpen },
          { label: 'Average Score', value: avgScore != null ? `${avgScore}%` : '—', icon: TrendingUp },
          { label: 'Best Score', value: bestScore != null ? `${bestScore}%` : '—', icon: Trophy },
          { label: 'Pass Rate', value: passRate != null ? `${passRate}%` : '—', icon: Award },
        ].map(s => {
          const Icon = s.icon
          return (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className="h-8 w-8 text-primary shrink-0" />
                <div>
                  <p className="text-xl font-bold">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search quiz..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Attempts list */}
      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-500">No attempts yet. Take a quiz to see your results here.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(attempt => {
            const pct = attempt.totalScore != null && attempt.maxScore != null && attempt.maxScore > 0
              ? Math.round(attempt.totalScore / attempt.maxScore * 100) : null
            const passed = pct != null && attempt.passMark != null ? pct >= attempt.passMark : null
            const isSubmitted = attempt.status === 'SUBMITTED' || attempt.status === 'GRADED'
            return (
              <Card key={attempt.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{attempt.quizSetTitle}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {attempt.submittedAt
                        ? new Date(attempt.submittedAt).toLocaleString()
                        : new Date(attempt.startedAt).toLocaleString() + ' (in progress)'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {pct != null && (
                      <span className={`text-xl font-bold ${passed === true ? 'text-green-600' : passed === false ? 'text-red-600' : 'text-gray-800'}`}>
                        {pct}%
                      </span>
                    )}
                    {attempt.totalScore != null && attempt.maxScore != null && (
                      <span className="text-sm text-gray-400">{attempt.totalScore}/{attempt.maxScore}</span>
                    )}
                    {passed === true && <Badge className="bg-green-100 text-green-700 border-green-200">Passed</Badge>}
                    {passed === false && <Badge className="bg-red-100 text-red-700 border-red-200">Failed</Badge>}
                    {!isSubmitted && <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>}
                    {isSubmitted && (
                      <Button size="sm" variant="outline" onClick={() => viewDetail(attempt)} disabled={loadingDetail}>
                        <Eye className="h-4 w-4 mr-1" />View Details
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selectedAttempt} onOpenChange={() => setSelectedAttempt(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedAttempt?.quizSetTitle} — Detailed Results
            </DialogTitle>
          </DialogHeader>
          {selectedAttempt?.answers && (
            <div className="space-y-3 mt-2">
              {/* Summary */}
              <div className="flex gap-4 p-3 bg-gray-50 rounded-lg text-sm">
                <span>Score: <strong>{selectedAttempt.totalScore}/{selectedAttempt.maxScore}</strong></span>
                {selectedAttempt.maxScore && selectedAttempt.maxScore > 0 && (
                  <span>Percentage: <strong>{Math.round((selectedAttempt.totalScore ?? 0) / selectedAttempt.maxScore * 100)}%</strong></span>
                )}
                <span>Correct: <strong className="text-green-600">{selectedAttempt.answers.filter(a => a.isCorrect).length}</strong></span>
                <span>Wrong: <strong className="text-red-600">{selectedAttempt.answers.filter(a => a.isCorrect === false).length}</strong></span>
              </div>
              {/* Per-question breakdown */}
              {selectedAttempt.answers.map((ans, i) => (
                <div key={ans.id} className={`p-3 rounded-lg border ${ans.isCorrect === true ? 'border-green-200 bg-green-50' : ans.isCorrect === false ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                  <div className="flex items-start gap-2 mb-1">
                    {ans.isCorrect === true ? <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" /> :
                     ans.isCorrect === false ? <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" /> :
                     <div className="h-4 w-4" />}
                    <p className="text-sm font-medium text-gray-800">
                      <span className="text-gray-400 mr-1">Q{i+1}.</span>
                      {ans.quizQuestion?.stem || '(deleted)'}
                    </p>
                  </div>
                  <div className="ml-6 space-y-1 text-sm">
                    <p><span className="text-gray-500">Your answer:</span> <span className="font-medium">{ans.answer || '(blank)'}</span></p>
                    {ans.quizQuestion?.correctAnswer && (
                      <p><span className="text-gray-500">Correct answer:</span> <span className="font-medium text-green-700">{ans.quizQuestion.correctAnswer.replace(/\|\|/g, ' or ')}</span></p>
                    )}
                    {ans.quizQuestion?.explanation && (
                      <p className="text-gray-500 italic text-xs">{ans.quizQuestion.explanation}</p>
                    )}
                    {ans.marksAwarded != null && <p className="text-xs text-gray-400">Marks: {ans.marksAwarded}/{ans.quizQuestion?.points ?? '?'}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
