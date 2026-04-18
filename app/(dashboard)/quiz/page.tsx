import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Plus,
  Puzzle,
  Share2,
  BarChart2,
  Copy,
  Users,
  Clock,
  Star,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

async function getQuizSets(userId: string, role: string) {
  return db.quizSet.findMany({
    where: role === 'ADMIN' ? {} : { createdById: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          questions: true,
          attempts: true,
        },
      },
    },
  })
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'success' | 'secondary' | 'outline'> = {
    OPEN: 'success',
    CLOSED: 'secondary',
    DRAFT: 'outline',
  }
  return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>
}

export default async function QuizPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const quizSets = await getQuizSets(session.user.id, session.user.role)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Quiz Sets</h1>
          <p className="text-gray-500">Create and manage AI-generated quizzes</p>
        </div>
        <Button asChild>
          <Link href="/quiz/new">
            <Plus className="h-4 w-4 mr-2" />
            Create New Quiz Set
          </Link>
        </Button>
      </div>

      {quizSets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="bg-purple-50 rounded-full p-6 mb-4">
            <Puzzle className="h-12 w-12 text-purple-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No quiz sets yet</h2>
          <p className="text-gray-500 mb-6 text-center max-w-md">
            Create your first quiz set by uploading a document or building questions manually.
          </p>
          <Button asChild>
            <Link href="/quiz/new">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Quiz Set
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {quizSets.map((quiz) => (
            <Card key={quiz.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base leading-tight">{quiz.title}</CardTitle>
                  <StatusBadge status={quiz.status} />
                </div>
                {quiz.description && (
                  <CardDescription className="text-xs line-clamp-2">{quiz.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-lg font-bold text-gray-900">{quiz._count.questions}</p>
                    <p className="text-xs text-gray-500">Questions</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-lg font-bold text-gray-900">{quiz._count.attempts}</p>
                    <p className="text-xs text-gray-500">Attempts</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-lg font-bold text-gray-900">{quiz.passMark}%</p>
                    <p className="text-xs text-gray-500">Pass Mark</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 mb-3 text-xs text-gray-500">
                  <Copy className="h-3 w-3" />
                  <span className="font-mono">{quiz.shareCode}</span>
                  <span className="ml-1">· Created {formatDate(quiz.createdAt)}</span>
                </div>

                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link href={`/quiz/${quiz.id}/questions`}>Edit</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/quiz/${quiz.id}/results`}>
                      <BarChart2 className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/quiz/${quiz.id}/share`}>
                      <Share2 className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
