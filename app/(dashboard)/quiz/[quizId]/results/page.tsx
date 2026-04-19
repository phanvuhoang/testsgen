'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Download, Search, Users, TrendingUp, CheckCircle2, Award, Eye, BarChart2, Mail, ChevronDown, Trash2
} from 'lucide-react'

type AnswerDetail = {
  id: string
  quizQuestionId: string | null
  answer: string | null
  isCorrect: boolean | null
  marksAwarded: number | null
  quizQuestion: {
    stem: string
    correctAnswer: string | null
    questionType: string
  } | null
}

type Attempt = {
  id: string
  guestName: string | null
  guestEmail: string | null
  user: { name: string; email: string } | null
  startedAt: string
  submittedAt: string | null
  totalScore: number | null
  maxScore: number | null
  status: string
  answers?: AnswerDetail[]
}

type Stats = {
  total: number
  submitted: number
  avgScore: number | null
  passCount: number | null
  passRate: number | null
  questionStats?: Array<{
    stem: string
    correctCount: number
    totalCount: number
    pct: number
    topWrongAnswer: string | null
  }>
}

export default function QuizResultsPage() {
  const params = useParams()
  const { toast } = useToast()
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedAttempt, setSelectedAttempt] = useState<Attempt | null>(null)
  const [loadingAnswers, setLoadingAnswers] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/quiz-sets/${params.quizId}/attempts`)
      if (res.ok) {
        const data = await res.json()
        setAttempts(data.attempts || [])
        setStats(data.stats || null)
      }
    } catch {
      toast({ title: 'Failed to load results', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleExport = async () => {
    const res = await fetch(`/api/quiz-sets/${params.quizId}/attempts/export`)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'results.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const viewAnswers = async (attempt: Attempt) => {
    if (attempt.answers) {
      setSelectedAttempt(attempt)
      return
    }
    setLoadingAnswers(true)
    try {
      const res = await fetch(`/api/quiz-sets/${params.quizId}/attempts/${attempt.id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedAttempt({ ...attempt, answers: data.answers })
      }
    } catch {
      toast({ title: 'Failed to load answers', variant: 'destructive' })
    } finally {
      setLoadingAnswers(false)
    }
  }

  const handleSendAll = async (scoreType: 'score' | 'analytics' | 'comprehensive') => {
    const eligibleAttempts = filtered.filter(a => a.status === 'SUBMITTED' || a.status === 'GRADED')
    if (!confirm(`Send ${scoreType} results to all students who submitted? This will send ${eligibleAttempts.length} emails.`)) return
    setIsSending(true)
    try {
      const selectedIds = eligibleAttempts.map(a => a.id)
      const res = await fetch(`/api/quiz-sets/${params.quizId}/attempts/send-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scoreType, attemptIds: selectedIds })
      })
      const data = await res.json()
      toast({ title: `Sent ${data.sent} emails${data.failed > 0 ? `, ${data.failed} failed` : ''}` })
    } catch {
      toast({ title: 'Failed to send emails', variant: 'destructive' })
    } finally {
      setIsSending(false)
    }
  }

  const handleDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} submission(s)? This cannot be undone.`)) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/quiz-sets/${params.quizId}/attempts/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptIds: Array.from(selectedIds) })
      })
      const data = await res.json()
      toast({ title: `Deleted ${data.deleted} submission(s)` })
      setSelectedIds(new Set())
      fetchData()
    } catch {
      toast({ title: 'Failed to delete', variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSendOne = async (attemptId: string) => {
    const type = prompt('Send type: score, analytics, or comprehensive?', 'comprehensive')
    if (!type) return
    setIsSending(true)
    try {
      const res = await fetch(`/api/quiz-sets/${params.quizId}/attempts/${attemptId}/send-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scoreType: type })
      })
      const data = await res.json()
      if (data.success) toast({ title: 'Email sent!' })
      else toast({ title: data.error || 'Failed', variant: 'destructive' })
    } catch {
      toast({ title: 'Failed to send email', variant: 'destructive' })
    } finally {
      setIsSending(false)
    }
  }

  const filtered = attempts.filter((a) => {
    const name = a.user?.name || a.guestName || ''
    const email = a.user?.email || a.guestEmail || ''
    return !search || name.toLowerCase().includes(search.toLowerCase()) || email.toLowerCase().includes(search.toLowerCase())
  })

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Results & Analytics</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />Export CSV
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected ({selectedIds.size})
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isSending}>
                <Mail className="h-4 w-4 mr-2" />
                Send Results
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleSendAll('comprehensive')}>
                📄 Comprehensive (recommended)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSendAll('analytics')}>
                📋 Analytics (correct/incorrect per question)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSendAll('score')}>
                📊 Score only
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Attempts', value: stats.total ?? 0, icon: Users },
            { label: 'Submitted', value: stats.submitted ?? 0, icon: CheckCircle2 },
            { label: 'Average Score', value: stats.avgScore != null ? `${stats.avgScore}%` : '—', icon: TrendingUp },
            { label: 'Pass Rate', value: stats.passRate != null ? `${stats.passRate}%` : '—', icon: Award },
          ].map((s) => {
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
      )}

      {/* Per-Question Analysis */}
      {stats?.questionStats && stats.questionStats.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-primary" />
              Per-Question Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3">#</th>
                    <th className="text-left p-3">Question</th>
                    <th className="text-right p-3">Correct</th>
                    <th className="text-right p-3">% Correct</th>
                    <th className="text-left p-3">Most Common Wrong Answer</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stats.questionStats.map((qs, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="p-3 text-gray-400">{i + 1}</td>
                      <td className="p-3 max-w-xs truncate" title={qs.stem}>{qs.stem}</td>
                      <td className="p-3 text-right">{qs.correctCount}/{qs.totalCount}</td>
                      <td className="p-3 text-right">
                        <span className={qs.pct >= 70 ? 'text-green-600 font-semibold' : qs.pct >= 40 ? 'text-yellow-600 font-semibold' : 'text-red-600 font-semibold'}>
                          {qs.pct}%
                        </span>
                      </td>
                      <td className="p-3 text-gray-400 text-xs">{qs.topWrongAnswer || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attempts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Attempts ({filtered.length})</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="Search by name/email..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No attempts yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-3 w-10">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every(a => selectedIds.has(a.id))}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(filtered.map(a => a.id)))
                          else setSelectedIds(new Set())
                        }}
                      />
                    </th>
                    <th className="text-left p-3">Name</th>
                    <th className="text-left p-3">Email</th>
                    <th className="text-right p-3">Score</th>
                    <th className="text-right p-3">%</th>
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-right p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((attempt) => {
                    const pct = attempt.totalScore !== null && attempt.maxScore != null && attempt.maxScore > 0
                      ? Math.round((attempt.totalScore / attempt.maxScore) * 100)
                      : null
                    return (
                      <tr key={attempt.id} className="hover:bg-gray-50">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(attempt.id)}
                            onChange={(e) => {
                              const next = new Set(selectedIds)
                              if (e.target.checked) next.add(attempt.id)
                              else next.delete(attempt.id)
                              setSelectedIds(next)
                            }}
                          />
                        </td>
                        <td className="p-3 font-medium">{attempt.user?.name || attempt.guestName || 'Guest'}</td>
                        <td className="p-3 text-gray-500">{attempt.user?.email || attempt.guestEmail || '—'}</td>
                        <td className="p-3 text-right">
                          {attempt.totalScore !== null && attempt.maxScore !== null ? `${attempt.totalScore}/${attempt.maxScore}` : '—'}
                        </td>
                        <td className="p-3 text-right font-semibold">{pct !== null ? `${pct}%` : '—'}</td>
                        <td className="p-3 text-gray-500">{new Date(attempt.startedAt).toLocaleDateString()}</td>
                        <td className="p-3">
                          <Badge variant={attempt.status === 'SUBMITTED' || attempt.status === 'GRADED' ? 'success' : 'secondary'}>
                            {attempt.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-right">
                          {(attempt.status === 'SUBMITTED' || attempt.status === 'GRADED') && (
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => viewAnswers(attempt)} disabled={loadingAnswers}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" title="Send result email" onClick={() => handleSendOne(attempt.id)} disabled={isSending}>
                                <Mail className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Answer detail dialog */}
      <Dialog open={!!selectedAttempt} onOpenChange={() => setSelectedAttempt(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedAttempt?.user?.name || selectedAttempt?.guestName || 'Guest'} — Answer Details
            </DialogTitle>
          </DialogHeader>
          {selectedAttempt?.answers && (
            <div className="space-y-3 mt-2">
              {selectedAttempt.answers.map((ans, i) => (
                <div key={ans.id} className={`p-3 rounded-lg border ${ans.isCorrect ? 'border-green-200 bg-green-50' : ans.isCorrect === false ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-gray-800">
                      <span className="text-gray-400 mr-1">Q{i + 1}.</span>
                      {ans.quizQuestion?.stem || '(deleted question)'}
                    </p>
                    {ans.isCorrect !== null && (
                      <Badge variant={ans.isCorrect ? 'success' : 'destructive'} className="shrink-0">
                        {ans.isCorrect ? 'Correct' : 'Incorrect'}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm space-y-0.5">
                    <p><span className="text-gray-500">Student answer:</span> <span className="font-medium">{ans.answer || '(blank)'}</span></p>
                    {ans.quizQuestion?.correctAnswer && (
                      <p><span className="text-gray-500">Correct answer:</span> <span className="font-medium text-green-700">{ans.quizQuestion.correctAnswer}</span></p>
                    )}
                    {ans.marksAwarded !== null && (
                      <p><span className="text-gray-500">Marks:</span> {ans.marksAwarded}</p>
                    )}
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
