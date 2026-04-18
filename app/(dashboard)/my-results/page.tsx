'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import {
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  ExternalLink,
  Trophy,
  TrendingUp,
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

export default function MyResultsPage() {
  const { toast } = useToast()
  const [attempts, setAttempts] = useState<AttemptRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchMyAttempts()
  }, [])

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

  const filtered = attempts.filter((a) =>
    !search || a.quizSetTitle.toLowerCase().includes(search.toLowerCase())
  )

  const submittedAttempts = attempts.filter(
    (a) => a.status === 'SUBMITTED' || a.status === 'GRADED'
  )
  const avgScore =
    submittedAttempts.length > 0
      ? Math.round(
          submittedAttempts
            .filter((a) => a.totalScore !== null && a.maxScore)
            .reduce(
              (sum, a) => sum + Math.round(((a.totalScore ?? 0) / (a.maxScore ?? 1)) * 100),
              0
            ) / submittedAttempts.filter((a) => a.totalScore !== null && a.maxScore).length || 0
        )
      : null

  const passCount = submittedAttempts.filter((a) => {
    if (a.totalScore === null || !a.maxScore || a.passMark === null) return false
    const pct = Math.round((a.totalScore / a.maxScore) * 100)
    return pct >= a.passMark
  }).length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold">My Quiz Results</h1>
        <p className="text-sm text-gray-500 mt-1">
          All quizzes you have taken
        </p>
      </div>

      {/* Summary Stats */}
      {!isLoading && attempts.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Trophy className="h-8 w-8 text-primary shrink-0" />
              <div>
                <p className="text-xl font-bold">{attempts.length}</p>
                <p className="text-xs text-gray-500">Total Attempts</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-primary shrink-0" />
              <div>
                <p className="text-xl font-bold">
                  {avgScore !== null ? `${avgScore}%` : '—'}
                </p>
                <p className="text-xs text-gray-500">Average Score</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-primary shrink-0" />
              <div>
                <p className="text-xl font-bold">{passCount}</p>
                <p className="text-xs text-gray-500">Passed</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by quiz title..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Attempts List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Trophy className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No quiz attempts yet</p>
          <p className="text-xs mt-1">Take a quiz to see your results here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((attempt) => {
            const pct =
              attempt.totalScore !== null &&
              attempt.maxScore != null &&
              attempt.maxScore > 0
                ? Math.round((attempt.totalScore / attempt.maxScore) * 100)
                : null

            const passed =
              pct !== null && attempt.passMark !== null
                ? pct >= attempt.passMark
                : null

            const isSubmitted =
              attempt.status === 'SUBMITTED' || attempt.status === 'GRADED'

            const duration =
              attempt.submittedAt && attempt.startedAt
                ? Math.round(
                    (new Date(attempt.submittedAt).getTime() -
                      new Date(attempt.startedAt).getTime()) /
                      60000
                  )
                : null

            return (
              <Card key={attempt.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {passed === true && (
                          <CheckCircle2 className="h-4 w-4 text-[#028a39] shrink-0" />
                        )}
                        {passed === false && (
                          <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                        )}
                        {passed === null && (
                          <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                        )}
                        <p className="font-medium text-sm truncate">
                          {attempt.quizSetTitle}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>
                          {new Date(attempt.startedAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        {duration !== null && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {duration} min
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {isSubmitted && pct !== null ? (
                        <div className="text-right">
                          <p
                            className={`text-2xl font-bold ${
                              passed === true
                                ? 'text-[#028a39]'
                                : passed === false
                                ? 'text-red-500'
                                : 'text-gray-700'
                            }`}
                          >
                            {pct}%
                          </p>
                          <p className="text-xs text-gray-500">
                            {attempt.totalScore}/{attempt.maxScore} pts
                          </p>
                        </div>
                      ) : (
                        <Badge variant="secondary">{attempt.status}</Badge>
                      )}

                      {isSubmitted && (
                        <Badge
                          variant={
                            passed === true
                              ? 'success'
                              : passed === false
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {passed === true ? 'PASSED' : passed === false ? 'FAILED' : 'DONE'}
                        </Badge>
                      )}

                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/q/${attempt.quizSetShareCode}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
