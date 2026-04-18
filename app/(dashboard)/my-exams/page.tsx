import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Clock, Play } from 'lucide-react'

export default async function MyExamsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const mockExams = await db.mockExam.findMany({
    where: { status: 'PUBLISHED' },
    include: {
      session: {
        include: { project: { select: { name: true, id: true } } },
      },
      _count: { select: { attempts: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">My Exams</h1>
        <p className="text-gray-500">Available mock exams to take</p>
      </div>

      {mockExams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <BookOpen className="h-16 w-16 text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold mb-2">No exams available</h2>
          <p className="text-gray-500">Check back later for published exams.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mockExams.map((exam) => (
            <Card key={exam.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="text-base">{exam.name}</CardTitle>
                <p className="text-sm text-gray-500">{exam.session.project.name}</p>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 text-sm text-gray-500 mb-4">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {exam.duration} min
                  </div>
                  <div>Pass: {exam.passMark}%</div>
                  <div>{exam._count.attempts} attempts</div>
                </div>
                {exam.instructions && (
                  <p className="text-xs text-gray-500 mb-4 line-clamp-2">{exam.instructions}</p>
                )}
                <Button asChild size="sm" className="w-full">
                  <Link href={`/exams/${exam.session.project.id}/${exam.sessionId}/mock-exams/${exam.id}/take`}>
                    <Play className="h-4 w-4 mr-2" />
                    Start Exam
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
