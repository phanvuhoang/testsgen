'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Eye, Users, TrendingUp, CheckCircle2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ClassAnalyticsPage() {
  const params = useParams()
  const [data, setData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedAttempt, setSelectedAttempt] = useState<any>(null)

  useEffect(() => {
    fetch(`/api/quiz-sets/${params.quizId}/classes/${params.classId}/analytics`)
      .then(r => r.json()).then(setData).finally(() => setIsLoading(false))
  }, [])

  if (isLoading) return <div className="p-6"><Skeleton className="h-64" /></div>
  if (!data) return <div className="p-6 text-gray-500">Failed to load</div>

  const { attempts = [], stats = {} } = data

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/quiz/${params.quizId}/classes`}>
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back to Classes</Button>
        </Link>
        <h1 className="text-xl font-bold">Class Analytics</h1>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total', value: stats.total ?? 0, icon: Users },
          { label: 'Submitted', value: stats.submitted ?? 0, icon: CheckCircle2 },
          { label: 'Avg Score', value: stats.avgScore != null ? `${stats.avgScore}%` : '—', icon: TrendingUp },
        ].map(s => {
          const Icon = s.icon
          return (
            <Card key={s.label}><CardContent className="p-4 flex items-center gap-3">
              <Icon className="h-8 w-8 text-primary" />
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-gray-500">{s.label}</p></div>
            </CardContent></Card>
          )
        })}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Attempts</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Email</th>
                <th className="text-right p-3">Score</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {attempts.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-gray-400">No attempts yet</td></tr>
              )}
              {attempts.map((a: any) => {
                const pct = a.maxScore > 0 ? Math.round((a.totalScore ?? 0) / a.maxScore * 100) : null
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="p-3">{a.user?.name || a.guestName || 'Guest'}</td>
                    <td className="p-3 text-gray-400">{a.user?.email || a.guestEmail || '—'}</td>
                    <td className="p-3 text-right font-semibold">{pct != null ? `${pct}%` : '—'}</td>
                    <td className="p-3"><Badge>{a.status}</Badge></td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSelectedAttempt(a)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedAttempt} onOpenChange={() => setSelectedAttempt(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedAttempt?.user?.name || selectedAttempt?.guestName || 'Guest'} — Answers</DialogTitle>
          </DialogHeader>
          {selectedAttempt?.answers?.map((ans: any, i: number) => (
            <div key={ans.id} className={`p-3 rounded border mb-2 ${ans.isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-sm font-medium">Q{i+1}. {ans.quizQuestion?.stem}</p>
              <p className="text-sm mt-1">Answer: <strong>{ans.answer || '(blank)'}</strong></p>
              {ans.quizQuestion?.correctAnswer && <p className="text-sm text-green-700">Correct: {ans.quizQuestion.correctAnswer}</p>}
            </div>
          ))}
        </DialogContent>
      </Dialog>
    </div>
  )
}
