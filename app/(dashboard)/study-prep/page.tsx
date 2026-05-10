'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Sparkles, Plus, Trash2, Calendar, FileText, BookOpen, Puzzle } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type PrepSet = {
  id: string
  name: string
  description: string | null
  targetExam: string | null
  examDate: string | null
  language: string | null
  updatedAt: string
  session: { id: string; name: string; project: { id: string; name: string } } | null
  quizSet: { id: string; title: string } | null
  createdBy: { id: string; name: string }
  _count: { studyPlans: number; studyMaterials: number; mockExamPlans: number }
}

export default function StudyPrepPage() {
  const { toast } = useToast()
  const [sets, setSets] = useState<PrepSet[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/study-prep/sets')
      if (r.ok) setSets(await r.json())
    } finally { setLoading(false) }
  }

  async function handleDelete() {
    if (!deleteId) return
    setBusy(true)
    try {
      const r = await fetch(`/api/study-prep/sets/${deleteId}`, { method: 'DELETE' })
      if (!r.ok) throw new Error()
      setSets((s) => s.filter((x) => x.id !== deleteId))
      toast({ title: 'Prep set deleted' })
    } catch {
      toast({ title: 'Failed to delete', variant: 'destructive' })
    } finally {
      setBusy(false)
      setDeleteId(null)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Study Prep Sets
          </h1>
          <p className="text-gray-500">
            Generate study plans, “secret sauce” notes, and mock-exam plans from your Module 1 / Module 2 sources.
          </p>
        </div>
        <Button asChild className="bg-[#028a39] hover:bg-[#026d2e] text-white">
          <Link href="/study-prep/new">
            <Plus className="h-4 w-4 mr-2" />
            New Prep Set
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : sets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="bg-emerald-50 rounded-full p-6 mb-4">
            <Sparkles className="h-12 w-12 text-emerald-500" />
          </div>
          <h2 className="text-lg font-semibold mb-2">No prep sets yet</h2>
          <p className="text-gray-500 mb-6 text-center max-w-md">
            Pick an existing exam session or quiz set as the source — Module 3 will turn it into a study plan, condensed notes, and a mock-exam plan.
          </p>
          <Button asChild className="bg-[#028a39] hover:bg-[#026d2e] text-white">
            <Link href="/study-prep/new">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Prep Set
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sets.map((s) => (
            <Card key={s.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{s.name}</CardTitle>
                    {s.targetExam && (
                      <CardDescription className="mt-0.5 truncate">{s.targetExam}</CardDescription>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-400 hover:text-red-600"
                    onClick={() => setDeleteId(s.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1 mb-3">
                  {s.session && (
                    <Badge variant="secondary" className="font-normal">
                      <BookOpen className="h-3 w-3 mr-1" />
                      {s.session.project.name} / {s.session.name}
                    </Badge>
                  )}
                  {s.quizSet && (
                    <Badge variant="secondary" className="font-normal">
                      <Puzzle className="h-3 w-3 mr-1" />
                      {s.quizSet.title}
                    </Badge>
                  )}
                  {s.language && (
                    <Badge variant="outline" className="font-normal">
                      {s.language === 'vi' ? 'Tiếng Việt' : 'English'}
                    </Badge>
                  )}
                </div>
                {s.examDate && (
                  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Exam: {formatDate(s.examDate)}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                  <span>Plans: {s._count.studyPlans}</span>
                  <span>Notes: {s._count.studyMaterials}</span>
                  <span>Mock plans: {s._count.mockExamPlans}</span>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/study-prep/${s.id}`}>
                    <FileText className="h-4 w-4 mr-2" />
                    Open
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this prep set?</AlertDialogTitle>
            <AlertDialogDescription>
              All generated study plans, materials, and mock-exam plans inside this set will be deleted.
              The original source documents and questions in Module 1 / Module 2 are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {busy ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
