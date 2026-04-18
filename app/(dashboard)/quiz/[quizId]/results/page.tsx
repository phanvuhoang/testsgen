'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { Download, Search, Users, TrendingUp, CheckCircle2, Award } from 'lucide-react'

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
}

type Stats = {
  total: number
  submitted: number
  avgScore: number | null
  passCount: number | null
  passRate: number | null
}

export default function QuizResultsPage() {
  const params = useParams()
  const { toast } = useToast()
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

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
    a.download = `results.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = attempts.filter((a) => {
    const name = a.user?.name || a.guestName || ''
    const email = a.user?.email || a.guestEmail || ''
    return (
      !search ||
      name.toLowerCase().includes(search.toLowerCase()) ||
      email.toLowerCase().includes(search.toLowerCase())
    )
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
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Attempts', value: stats.total ?? 0, icon: Users },
            { label: 'Submitted', value: stats.submitted ?? 0, icon: CheckCircle2 },
            {
              label: 'Average Score',
              value: stats.avgScore != null ? `${stats.avgScore}%` : '—',
              icon: TrendingUp,
            },
            {
              label: 'Pass Rate',
              value: stats.passRate != null ? `${stats.passRate}%` : '—',
              icon: Award,
            },
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

      {/* Attempts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Attempts ({filtered.length})
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name/email..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
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
                    <th className="text-left p-3">Name</th>
                    <th className="text-left p-3">Email</th>
                    <th className="text-right p-3">Score</th>
                    <th className="text-right p-3">%</th>
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((attempt) => {
                    const pct =
                      attempt.totalScore !== null &&
                      attempt.maxScore != null &&
                      attempt.maxScore > 0
                        ? Math.round((attempt.totalScore / attempt.maxScore) * 100)
                        : null
                    return (
                      <tr key={attempt.id} className="hover:bg-gray-50">
                        <td className="p-3 font-medium">
                          {attempt.user?.name || attempt.guestName || 'Guest'}
                        </td>
                        <td className="p-3 text-gray-500">
                          {attempt.user?.email || attempt.guestEmail || '—'}
                        </td>
                        <td className="p-3 text-right">
                          {attempt.totalScore !== null && attempt.maxScore !== null
                            ? `${attempt.totalScore}/${attempt.maxScore}`
                            : '—'}
                        </td>
                        <td className="p-3 text-right font-semibold">
                          {pct !== null ? `${pct}%` : '—'}
                        </td>
                        <td className="p-3 text-gray-500">
                          {new Date(attempt.startedAt).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={
                              attempt.status === 'SUBMITTED' || attempt.status === 'GRADED'
                                ? 'success'
                                : 'secondary'
                            }
                          >
                            {attempt.status}
                          </Badge>
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
    </div>
  )
}
