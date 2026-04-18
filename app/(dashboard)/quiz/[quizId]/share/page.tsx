'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { Copy, Share2, ExternalLink, Code } from 'lucide-react'

type QuizSet = {
  id: string
  title: string
  shareCode: string
  status: string
  access: string
  expiresAt: string | null
  questionsPerAttempt: number
  timeLimitMinutes: number | null
}

export default function QuizSharePage() {
  const params = useParams()
  const { toast } = useToast()
  const [quiz, setQuiz] = useState<QuizSet | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/quiz-sets/${params.quizId}`)
      .then((r) => r.json())
      .then((d) => setQuiz(d))
      .finally(() => setIsLoading(false))
  }, [params.quizId])

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
  const quizUrl = quiz ? `${appUrl}/q/${quiz.shareCode}` : ''
  const embedCode = quiz
    ? `<iframe src="${appUrl}/q/${quiz.shareCode}" width="100%" height="600" frameborder="0"></iframe>`
    : ''

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: `${label} copied to clipboard` })
  }

  const toggleStatus = async () => {
    if (!quiz) return
    const newStatus = quiz.status === 'OPEN' ? 'CLOSED' : 'OPEN'
    const res = await fetch(`/api/quiz-sets/${params.quizId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setQuiz({ ...quiz, status: newStatus })
      toast({ title: `Quiz ${newStatus === 'OPEN' ? 'opened' : 'closed'}` })
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!quiz) return <div className="p-6">Quiz not found</div>

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Share Quiz</h1>
        <p className="text-gray-500">{quiz.title}</p>
      </div>

      {/* Status Toggle */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Quiz Status</p>
              <p className="text-sm text-gray-500">
                {quiz.status === 'OPEN' ? 'Accepting responses' : 'Not accepting responses'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{quiz.status}</span>
              <Switch
                checked={quiz.status === 'OPEN'}
                onCheckedChange={toggleStatus}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quiz URL */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Quiz URL
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={quizUrl} readOnly className="font-mono text-sm" />
            <Button variant="outline" size="icon" onClick={() => copy(quizUrl, 'URL')}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" asChild>
              <a href={quizUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Share code:</span>
            <code className="bg-gray-100 px-2 py-0.5 rounded font-mono">{quiz.shareCode}</code>
            <Button variant="ghost" size="sm" className="h-6" onClick={() => copy(quiz.shareCode, 'Share code')}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Embed Code */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Code className="h-4 w-4" />
            Embed Code
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <pre className="bg-gray-100 rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
              {embedCode}
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => copy(embedCode, 'Embed code')}
            >
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quiz Settings Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quiz Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500">Questions per attempt</p>
              <p className="font-medium">{quiz.questionsPerAttempt}</p>
            </div>
            <div>
              <p className="text-gray-500">Time limit</p>
              <p className="font-medium">{quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} min` : 'Unlimited'}</p>
            </div>
            <div>
              <p className="text-gray-500">Access</p>
              <p className="font-medium">{quiz.access}</p>
            </div>
            <div>
              <p className="text-gray-500">Expires</p>
              <p className="font-medium">{quiz.expiresAt ? new Date(quiz.expiresAt).toLocaleDateString() : 'Never'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
