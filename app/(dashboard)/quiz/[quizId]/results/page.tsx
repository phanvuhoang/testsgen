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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Download, Search, Users, TrendingUp, Clock, Award } from 'lucide-react'

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
  totalAttempts: number
  avgScore: number
  minScore: number
  maxScore: number
  avgTimeMinutes: number
  passRate: number
  histogram: { range: string; count: number }[]
  questionAnalytics: {
    id: string
    stem: string
    correctRate: number
    attemptRate: number
  }[]
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

  const handleExport = async (format: 'points' | 'responses') => {
    const res = await fetch(`/api/quiz-sets/${params.quizId}/attempts/export?format=${format}`)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `results-${format}.csv`
    a.click()
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
        <h1 className="text-2xl font-bold">Results</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('points')}>
            <Download className="h-4 w-4 mr-2" />
            Point Grid CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('responses')}>
            <Download className="h-4 w-4 mr-2" />
            Response Grid CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Attempts', value: stats.totalAttempts, icon: Users },
            { label: 'Average Score', value: `${stats.avgScore.toFixed(1)}%`, icon: TrendingUp },
            { label: 'Avg Time', value: `${stats.avgTimeMinutes.toFixed(0)} min`, icon: Clock },
            { label: 'Pass Rate', value: `${stats.passRate.toFixed(1)}%`, icon: Award },
          ].map((s) => {
            const Icon = s.icon
            return (
              <Card key={s.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Icon className="h-8 w-8 text-primary" />
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

      {/* Histogram */}
      {stats?.histogram && stats.histogram.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.histogram}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#028a39" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
                    <th className="text-left p-3">Started</th>
                    <th className="text-left p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((attempt) => {
                    const pct = attempt.totalScore !== null && attempt.maxScore
                      ? Math.round((attempt.totalScore / attempt.maxScore) * 100)
                      : null
                    return (
                      <tr key={attempt.id} className="hover:bg-gray-50">
                        <td className="p-3 font-medium">
                          {attempt.user?.name || attempt.guestName || 'Guest'}
                        </td>
                        <td className="p-3 text-gray-500">
                          {attempt.user?.email || attempt.guestEmail || '-'}
                        </td>
                        <td className="p-3 text-right">
                          {attempt.totalScore !== null && attempt.maxScore !== null
                            ? `${attempt.totalScore}/${attempt.maxScore}`
                            : '-'}
                        </td>
                        <td className="p-3 text-right font-semibold">
                          {pct !== null ? `${pct}%` : '-'}
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
