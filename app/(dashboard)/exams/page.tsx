'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
import { FolderOpen, Plus, Calendar, BookOpen, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Project = {
  id: string
  name: string
  code: string
  description?: string | null
  status: string
  createdAt: string
  _count: { sessions: number }
  createdBy: { name: string }
}

export default function ExamsPage() {
  const { toast } = useToast()
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/projects')
      if (res.ok) setProjects(await res.json())
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/projects/${deleteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setProjects((prev) => prev.filter((p) => p.id !== deleteId))
      toast({ title: 'Project deleted' })
    } catch {
      toast({ title: 'Failed to delete project', variant: 'destructive' })
    } finally {
      setIsDeleting(false)
      setDeleteId(null)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Exam Projects</h1>
          <p className="text-gray-500">Manage professional exam papers</p>
        </div>
        <Button asChild className="bg-[#028a39] hover:bg-[#026d2e] text-white">
          <Link href="/exams/new">
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="bg-blue-50 rounded-full p-6 mb-4">
            <FolderOpen className="h-12 w-12 text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold mb-2">No projects yet</h2>
          <p className="text-gray-500 mb-6 text-center max-w-md">
            Create your first exam project to get started with AI-powered question generation.
          </p>
          <Button asChild className="bg-[#028a39] hover:bg-[#026d2e] text-white">
            <Link href="/exams/new">
              <Plus className="h-4 w-4 mr-2" />
              Create Project
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{project.name}</CardTitle>
                    <CardDescription className="mt-0.5 font-mono text-xs">{project.code}</CardDescription>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Badge variant={project.status === 'ACTIVE' ? 'success' : 'secondary'}>
                      {project.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteId(project.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
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

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the project and all its sessions, questions, and exam data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? 'Deleting...' : 'Delete Project'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
