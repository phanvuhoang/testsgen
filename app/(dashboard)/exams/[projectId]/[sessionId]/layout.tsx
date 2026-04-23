import Link from 'next/link'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redirect, notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

const tabs = [
  { label: 'Topics', href: 'topics' },
  { label: 'Documents', href: 'documents' },
  { label: 'Samples', href: 'samples' },
  { label: 'Sections', href: 'sections' },
  { label: 'Generate', href: 'generate' },
  { label: 'Manual', href: 'manual' },
  { label: 'Question Bank', href: 'questions' },
  { label: 'Mock Exams', href: 'mock-exams' },
  { label: 'Variables', href: 'variables' },
]

export default async function SessionLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { projectId: string; sessionId: string }
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const examSession = await db.session.findUnique({
    where: { id: params.sessionId },
    include: { project: { select: { name: true, code: true } } },
  })

  if (!examSession) notFound()

  return (
    <div className="flex flex-col min-h-screen">
      {/* Session Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/exams/${params.projectId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{examSession.project.name}</span>
              <span className="text-gray-300">/</span>
              <h1 className="font-semibold">{examSession.name}</h1>
              <Badge variant={examSession.status === 'ACTIVE' ? 'success' : 'secondary'}>
                {examSession.status}
              </Badge>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={`/exams/${params.projectId}/${params.sessionId}/${tab.href}`}
              className="px-4 py-2 text-sm rounded-lg whitespace-nowrap transition-colors hover:bg-gray-100 text-gray-600 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}
