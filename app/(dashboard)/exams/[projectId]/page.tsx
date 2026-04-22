import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, ArrowLeft, Calendar, BookOpen, FileText } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { CopySessionButton } from '@/components/copy-session-dialog'
import { SessionRenameButton, SessionDeleteButton } from '@/components/session-actions'

export default async function ProjectPage({ params }: { params: { projectId: string } }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const project = await db.project.findUnique({
    where: { id: params.projectId },
    include: {
      sessions: {
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { documents: true, questions: true, mockExams: true } },
        },
      },
      createdBy: { select: { name: true } },
    },
  })

  if (!project) notFound()

  const sessionStatusColor: Record<string, string> = {
    DRAFT: 'secondary',
    ACTIVE: 'success',
    ARCHIVED: 'outline',
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/exams">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <Badge variant="outline" className="font-mono">{project.code}</Badge>
          </div>
          {project.description && <p className="text-gray-500 text-sm">{project.description}</p>}
        </div>
        <Button asChild>
          <Link href={`/exams/${project.id}/new-session`}>
            <Plus className="h-4 w-4 mr-2" />
            New Session
          </Link>
        </Button>
      </div>

      {project.sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="bg-blue-50 rounded-full p-6 mb-4">
            <Calendar className="h-12 w-12 text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold mb-2">No sessions yet</h2>
          <p className="text-gray-500 mb-6">Create your first exam session to upload documents and generate questions.</p>
          <Button asChild>
            <Link href={`/exams/${project.id}/new-session`}>
              <Plus className="h-4 w-4 mr-2" />
              Create Session
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {project.sessions.map((sess) => (
            <Card key={sess.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{sess.name}</h3>
                    <Badge variant={(sessionStatusColor[sess.status] || 'secondary') as 'secondary' | 'success' | 'outline'}>
                      {sess.status}
                    </Badge>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span><FileText className="h-3 w-3 inline mr-1" />{sess._count.documents} docs</span>
                    <span><BookOpen className="h-3 w-3 inline mr-1" />{sess._count.questions} questions</span>
                    <span>{sess._count.mockExams} exams</span>
                    {sess.startDate && (
                      <span><Calendar className="h-3 w-3 inline mr-1" />{formatDate(sess.startDate)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <SessionRenameButton session={{ id: sess.id, name: sess.name }} />
                  <SessionDeleteButton session={{ id: sess.id, name: sess.name }} />
                  <CopySessionButton
                    sourceSession={{ id: sess.id, name: sess.name }}
                    allSessions={project.sessions.map(s => ({ id: s.id, name: s.name }))}
                  />
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/exams/${project.id}/${sess.id}/documents`}>Open</Link>
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
