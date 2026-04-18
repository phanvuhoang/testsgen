'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Play, BarChart2, Loader2 } from 'lucide-react'

type MockExam = {
  id: string
  name: string
  duration: number
  passMark: number
  status: string
  _count: { attempts: number }
}

type Section = { id: string; name: string; questionsInBank: number }

export default function MockExamsPage() {
  const params = useParams()
  const { toast } = useToast()
  const [exams, setExams] = useState<MockExam[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState({
    name: '',
    duration: 120,
    instructions: '',
    passMark: 50,
    passMessage: 'Congratulations! You passed.',
    failMessage: 'Unfortunately you did not pass. Please try again.',
    sectionDraws: {} as Record<string, number>,
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    const [examsRes, sectionsRes] = await Promise.all([
      fetch(`/api/sessions/${params.sessionId}/mock-exams`),
      fetch(`/api/sessions/${params.sessionId}/sections`),
    ])
    if (examsRes.ok) setExams(await examsRes.json())
    if (sectionsRes.ok) {
      const secs: Section[] = await sectionsRes.json()
      setSections(secs)
      const draws: Record<string, number> = {}
      secs.forEach((s) => { draws[s.id] = Math.min(5, s.questionsInBank) })
      setForm((prev) => ({ ...prev, sectionDraws: draws }))
    }
    setIsLoading(false)
  }

  const handleCreate = async () => {
    setIsCreating(true)
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/mock-exams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          duration: form.duration,
          instructions: form.instructions,
          passMark: form.passMark,
          passMessage: form.passMessage,
          failMessage: form.failMessage,
          sectionDraws: Object.entries(form.sectionDraws).map(([sectionId, count]) => ({ sectionId, questionsToDrawCount: count })),
        }),
      })
      if (!res.ok) throw new Error()
      const exam = await res.json()
      setExams((prev) => [exam, ...prev])
      setShowCreate(false)
      toast({ title: 'Mock exam created' })
    } catch {
      toast({ title: 'Failed to create exam', variant: 'destructive' })
    } finally {
      setIsCreating(false)
    }
  }

  const publishToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'
    const res = await fetch(`/api/sessions/${params.sessionId}/mock-exams/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setExams((prev) => prev.map((e) => e.id === id ? { ...e, status: newStatus } : e))
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Mock Exams</h2>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Mock Exam
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : exams.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          No mock exams yet. Create one from the question bank.
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <Card key={exam.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{exam.name}</h3>
                    <Badge variant={exam.status === 'PUBLISHED' ? 'success' : 'secondary'}>
                      {exam.status}
                    </Badge>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-500">
                    <span>{exam.duration} min</span>
                    <span>Pass: {exam.passMark}%</span>
                    <span>{exam._count.attempts} attempts</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => publishToggle(exam.id, exam.status)}>
                    {exam.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/exams/${params.projectId}/${params.sessionId}/mock-exams/${exam.id}/results`}>
                      <BarChart2 className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link href={`/exams/${params.projectId}/${params.sessionId}/mock-exams/${exam.id}/take`}>
                      <Play className="h-4 w-4 mr-1" />Take
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Mock Exam</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Exam Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Mock Exam 1 — June 2026" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Duration (minutes)</Label>
                <Input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label>Pass Mark (%)</Label>
                <Input type="number" value={form.passMark} onChange={(e) => setForm({ ...form, passMark: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Instructions</Label>
              <Textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} className="min-h-[80px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Pass Message</Label>
                <Textarea value={form.passMessage} onChange={(e) => setForm({ ...form, passMessage: e.target.value })} className="min-h-[60px]" />
              </div>
              <div className="space-y-1">
                <Label>Fail Message</Label>
                <Textarea value={form.failMessage} onChange={(e) => setForm({ ...form, failMessage: e.target.value })} className="min-h-[60px]" />
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Questions to draw per section</Label>
              <div className="space-y-2">
                {sections.map((sec) => (
                  <div key={sec.id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm">{sec.name}</span>
                    <span className="text-xs text-gray-500">(max {sec.questionsInBank})</span>
                    <Input
                      type="number"
                      value={form.sectionDraws[sec.id] || 0}
                      max={sec.questionsInBank}
                      onChange={(e) => setForm({ ...form, sectionDraws: { ...form.sectionDraws, [sec.id]: Number(e.target.value) } })}
                      className="w-20 h-8"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
