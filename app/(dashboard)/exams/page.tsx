import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FolderOpen, Plus, Calendar, BookOpen } from 'lucide-react'
import { formatDate } from '@/lib/utils'

async function getProjects(userId: string, role: string) {
  return db.project.findMany({
    where: role === 'ADMIN' ? {} : role === 'TEACHER' ? { createdById: userId } : {},
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { sessions: true } },
      createdBy: { select: { name: true } },
    },
  })
}

export default async function ExamsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const projects = await getProjects(session.user.id, session.user.role)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Exam Projects</h1>
          <p className="text-gray-500">Manage professional exam papers</p>
        </div>
        {(session.user.role === 'ADMIN' || session.user.role === 'TEACHER') && (
          <Button asChild>
            <Link href="/exams/new">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Link>
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="bg-blue-50 rounded-full p-6 mb-4">
            <FolderOpen className="h-12 w-12 text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold mb-2">No projects yet</h2>
          <p className="text-gray-500 mb-6 text-center max-w-md">
            Create your first exam project to get started with AI-powered question generation.
          </p>
          {(session.user.role === 'ADMIN' || session.user.role === 'TEACHER') && (
            <Button asChild>
              <Link href="/exams/new">
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    <CardDescription className="mt-0.5 font-mono text-xs">{project.code}</CardDescription>
                  </div>
                  <Badge variant={project.status === 'ACTIVE' ? 'success' : 'secondary'}>
                    {project.status}
                  </Badge>
                </div>
                {project.description && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{project.description}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                  <div className="flex items-center gap-1">
                    <BookOpen className="h-4 w-4" />
                    {project._count.sessions} session{project._count.sessions !== 1 ? 's' : ''}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {formatDate(project.createdAt)}
                  </div>
                </div>
                <Button asChild size="sm" className="w-full" variant="outline">
                  <Link href={`/exams/${project.id}`}>View Sessions</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
