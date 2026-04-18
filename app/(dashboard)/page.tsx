import { auth } from '@/auth'
import { db } from '@/lib/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  FolderOpen,
  Puzzle,
  Users,
  Activity,
  Plus,
  ArrowRight,
  BookOpen,
  TrendingUp,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

async function getDashboardStats(userId: string, role: string) {
  const [projectCount, quizSetCount, attemptCount, recentAttempts] = await Promise.all([
    db.project.count(role === 'ADMIN' ? {} : { where: { createdById: userId } }),
    db.quizSet.count(role === 'ADMIN' ? {} : { where: { createdById: userId } }),
    db.attempt.count({
      where: {
        startedAt: {
          gte: new Date(new Date().setDate(new Date().getDate() - 30)),
        },
      },
    }),
    db.attempt.findMany({
      take: 10,
      orderBy: { startedAt: 'desc' },
      include: {
        mockExam: { select: { name: true } },
        quizSet: { select: { title: true } },
        user: { select: { name: true } },
      },
    }),
  ])

  return { projectCount, quizSetCount, attemptCount, recentAttempts }
}

async function getStudentDashboard(userId: string) {
  const [mockExams, myAttempts] = await Promise.all([
    db.mockExam.findMany({
      where: { status: 'PUBLISHED' },
      include: {
        session: {
          include: { project: { select: { name: true } } },
        },
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    }),
    db.attempt.findMany({
      where: { userId },
      include: {
        mockExam: { select: { name: true } },
        quizSet: { select: { title: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 10,
    }),
  ])

  return { mockExams, myAttempts }
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const isStudent = session.user.role === 'STUDENT'

  if (isStudent) {
    const { mockExams, myAttempts } = await getStudentDashboard(session.user.id)

    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {session.user.name}</h1>
          <p className="text-gray-500">Your learning dashboard</p>
        </div>

        {/* Available Mock Exams */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Exams</h2>
          {mockExams.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BookOpen className="h-12 w-12 text-gray-300 mb-4" />
                <p className="text-gray-500">No exams available yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mockExams.map((exam) => (
                <Card key={exam.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-base">{exam.name}</CardTitle>
                    <CardDescription>{exam.session.project.name}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">{exam.duration} min</span>
                      <Button size="sm" asChild>
                        <Link href={`/exams/${exam.session.projectId}/${exam.sessionId}/mock-exams/${exam.id}/take`}>
                          Start Exam
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Take Quiz by Code */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Take a Quiz</CardTitle>
            <CardDescription>Enter a quiz share code to take a quiz</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter quiz code..."
                className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                id="quiz-code-input"
              />
              <Button
                onClick={() => {
                  const input = document.getElementById('quiz-code-input') as HTMLInputElement
                  if (input.value) window.location.href = `/quiz/${input.value}`
                }}
              >
                Go
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Attempts */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Attempts</h2>
          {myAttempts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Activity className="h-8 w-8 text-gray-300 mb-2" />
                <p className="text-gray-500 text-sm">No attempts yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {myAttempts.map((attempt) => (
                <Card key={attempt.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium text-sm">
                        {attempt.mockExam?.name || attempt.quizSet?.title || 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-500">{formatDateTime(attempt.startedAt)}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={attempt.status === 'SUBMITTED' || attempt.status === 'GRADED' ? 'success' : 'secondary'}>
                        {attempt.status}
                      </Badge>
                      {attempt.totalScore !== null && attempt.maxScore !== null && (
                        <p className="text-sm font-semibold mt-1">
                          {Math.round((attempt.totalScore / attempt.maxScore) * 100)}%
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const { projectCount, quizSetCount, attemptCount, recentAttempts } = await getDashboardStats(
    session.user.id,
    session.user.role
  )

  const stats = [
    {
      title: 'Total Projects',
      value: projectCount,
      icon: FolderOpen,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: 'Quiz Sets',
      value: quizSetCount,
      icon: Puzzle,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      title: 'Attempts This Month',
      value: attemptCount,
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      title: 'Active Users',
      value: 0,
      icon: Users,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Welcome back, {session.user.name}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/exams/new">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/quiz/new">
              <Plus className="h-4 w-4 mr-2" />
              New Quiz Set
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${stat.bg}`}>
                    <Icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    <p className="text-sm text-gray-500">{stat.title}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Module Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-blue-50 p-3 rounded-lg">
                <BookOpen className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <CardTitle>Module 1 — Exam Projects</CardTitle>
                <CardDescription>Manage professional exam papers and mock exams</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/exams" className="flex items-center justify-center gap-2">
                Go to Exam Projects
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-purple-50 p-3 rounded-lg">
                <Puzzle className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <CardTitle>Module 2 — Quiz Generator</CardTitle>
                <CardDescription>Create and share AI-generated quizzes</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/quiz" className="flex items-center justify-center gap-2">
                Go to Quiz Generator
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Last 10 attempts across all tests and quizzes</CardDescription>
        </CardHeader>
        <CardContent>
          {recentAttempts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Activity className="h-8 w-8 text-gray-300 mb-2" />
              <p className="text-gray-500 text-sm">No recent activity</p>
            </div>
          ) : (
            <div className="divide-y">
              {recentAttempts.map((attempt) => (
                <div key={attempt.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {attempt.user?.name || attempt.guestName || 'Guest'} —{' '}
                      {attempt.mockExam?.name || attempt.quizSet?.title || 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-500">{formatDateTime(attempt.startedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        attempt.status === 'SUBMITTED' || attempt.status === 'GRADED'
                          ? 'success'
                          : 'secondary'
                      }
                    >
                      {attempt.status}
                    </Badge>
                    {attempt.totalScore !== null && attempt.maxScore !== null && (
                      <span className="text-sm font-semibold">
                        {Math.round((attempt.totalScore / attempt.maxScore) * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
