'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { Plus, Puzzle, Share2, BarChart2, Copy, Trash2, Sparkles, PenLine, FileSpreadsheet, Loader2, ChevronDown } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type QuizSet = {
  id: string
  title: string
  description?: string | null
  status: string
  shareCode: string
  passMark: number
  createdAt: string
  _count: { questions: number; attempts: number }
}

export default function QuizPage() {
  const { toast } = useToast()
  const router = useRouter()
  const importRef = useRef<HTMLInputElement>(null)

  const [quizSets, setQuizSets] = useState<QuizSet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)

  useEffect(() => {
    fetchQuizSets()
  }, [])

  // Close menu on outside click
  useEffect(() => {
    if (!showCreateMenu) return
    const handler = () => setShowCreateMenu(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showCreateMenu])

  const fetchQuizSets = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/quiz-sets')
      if (res.ok) {
        const data = await res.json()
        setQuizSets(Array.isArray(data) ? data : (data.quizSets ?? []))
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/quiz-sets/${deleteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setQuizSets((prev) => prev.filter((q) => q.id !== deleteId))
      toast({ title: 'Quiz set deleted' })
    } catch {
      toast({ title: 'Failed to delete quiz set', variant: 'destructive' })
    } finally {
      setIsDeleting(false)
      setDeleteId(null)
    }
  }

  const copyShareLink = (shareCode: string) => {
    const url = `${window.location.origin}/q/${shareCode}`
    navigator.clipboard.writeText(url)
    toast({ title: 'Link copied to clipboard' })
  }

  const handleImportExcel = async (file: File) => {
    setIsImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/quiz-sets/import-excel', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      toast({
        title: `Imported quiz set`,
        description: data.title ? `"${data.title}" created` : undefined,
      })
      fetchQuizSets()
      if (data.id) {
        router.push(`/quiz/${data.id}/questions`)
      }
    } catch (err) {
      toast({ title: 'Import failed', description: String(err), variant: 'destructive' })
    } finally {
      setIsImporting(false)
      if (importRef.current) importRef.current.value = ''
    }
  }

  const statusVariant: Record<string, 'success' | 'secondary' | 'outline'> = {
    OPEN: 'success',
    CLOSED: 'secondary',
    DRAFT: 'outline',
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Quiz Sets</h1>
          <p className="text-gray-500">Create and manage AI-generated quizzes</p>
        </div>

        {/* Create actions */}
        <div className="flex items-center gap-2">
          {/* Import Excel */}
          <input
            ref={importRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImportExcel(file)
            }}
          />
          <Button
            variant="outline"
            onClick={() => importRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            Import from Excel
          </Button>

          {/* Create with AI */}
          <Button asChild className="bg-[#028a39] hover:bg-[#026d2e] text-white">
            <Link href="/quiz/new">
              <Sparkles className="h-4 w-4 mr-2" />
              Create with AI
            </Link>
          </Button>

          {/* Create Manually */}
          <Button asChild variant="outline">
            <Link href="/quiz/new?mode=manual">
              <PenLine className="h-4 w-4 mr-2" />
              Create Manually
            </Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-28 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : quizSets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="bg-purple-50 rounded-full p-6 mb-4">
            <Puzzle className="h-12 w-12 text-purple-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No quiz sets yet</h2>
          <p className="text-gray-500 mb-6 text-center max-w-md">
            Create your first quiz set with AI, import from Excel, or build questions manually.
          </p>
          <div className="flex gap-3 flex-wrap justify-center">
            <Button asChild className="bg-[#028a39] hover:bg-[#026d2e] text-white">
              <Link href="/quiz/new">
                <Sparkles className="h-4 w-4 mr-2" />
                Create with AI
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/quiz/new?mode=manual">
                <PenLine className="h-4 w-4 mr-2" />
                Create Manually
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => importRef.current?.click()}
              disabled={isImporting}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Import from Excel
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {quizSets.map((quiz) => (
            <Card key={quiz.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base leading-tight truncate">{quiz.title}</CardTitle>
                    {quiz.description && (
                      <CardDescription className="text-xs line-clamp-2 mt-0.5">{quiz.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant={statusVariant[quiz.status] ?? 'secondary'}>{quiz.status}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteId(quiz.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 mb-3 text-center">
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
                  <span className="font-mono truncate max-w-[100px]">{quiz.shareCode}</span>
                  <span className="ml-auto">{formatDate(quiz.createdAt)}</span>
                </div>

                <div className="flex gap-1.5">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link href={`/quiz/${quiz.id}/questions`}>Edit</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link href={`/quiz/${quiz.id}/settings`}>Settings</Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyShareLink(quiz.shareCode)}
                    title="Copy share link"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button asChild size="sm" variant="outline" title="Results">
                    <Link href={`/quiz/${quiz.id}/results`}>
                      <BarChart2 className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quiz Set</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the quiz set and all its questions and attempt data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? 'Deleting...' : 'Delete Quiz Set'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
