'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { Sparkles, ArrowLeft, BookOpen, Puzzle } from 'lucide-react'

type Available = {
  projects: {
    id: string
    name: string
    code: string
    sessions: {
      id: string
      name: string
      _count: { documents: number; questions: number; parsedQuestions: number }
    }[]
  }[]
  quizSets: {
    id: string
    title: string
    _count: { documents: number; questions: number }
  }[]
}

export default function NewStudyPrepPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [available, setAvailable] = useState<Available | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    sessionId: '',
    quizSetId: '',
    targetExam: '',
    examDate: '',
    targetScore: '',
    weeklyHours: '',
    language: 'en',
  })

  useEffect(() => {
    fetch('/api/study-prep/available-sources')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setAvailable(d))
      .finally(() => setLoading(false))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.sessionId && !form.quizSetId) {
      toast({ title: 'Pick at least one source (Module 1 session or Module 2 quiz set).', variant: 'destructive' })
      return
    }
    if (!form.name.trim()) {
      toast({ title: 'Please enter a name.', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const r = await fetch('/api/study-prep/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          sessionId: form.sessionId || null,
          quizSetId: form.quizSetId || null,
          targetExam: form.targetExam.trim() || null,
          examDate: form.examDate || null,
          targetScore: form.targetScore.trim() || null,
          weeklyHours: form.weeklyHours ? Number(form.weeklyHours) : null,
          language: form.language,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed to create prep set')
      router.push(`/study-prep/${j.id}`)
    } catch (e: any) {
      toast({ title: 'Failed to create prep set', description: e.message, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link href="/study-prep"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
      </Button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          New Study Prep Set
        </h1>
        <p className="text-gray-500">Pick the existing sources and the AI will generate study assets from them.</p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basics</CardTitle>
            <CardDescription>Name and goals — you can refine later.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. VTCA December 2026 — Advanced Tax Prep"
                required
              />
            </div>
            <div>
              <Label htmlFor="desc">Description</Label>
              <Textarea
                id="desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Short note about who this prep is for, what to focus on, etc."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="targetExam">Target exam</Label>
                <Input
                  id="targetExam"
                  value={form.targetExam}
                  onChange={(e) => setForm({ ...form, targetExam: e.target.value })}
                  placeholder="e.g. ICAEW Tax Compliance"
                />
              </div>
              <div>
                <Label htmlFor="examDate">Exam date</Label>
                <Input
                  id="examDate"
                  type="date"
                  value={form.examDate}
                  onChange={(e) => setForm({ ...form, examDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="targetScore">Target score / level</Label>
                <Input
                  id="targetScore"
                  value={form.targetScore}
                  onChange={(e) => setForm({ ...form, targetScore: e.target.value })}
                  placeholder='e.g. "75%" or "Pass with merit"'
                />
              </div>
              <div>
                <Label htmlFor="weeklyHours">Available hours / week</Label>
                <Input
                  id="weeklyHours"
                  type="number"
                  min={1}
                  value={form.weeklyHours}
                  onChange={(e) => setForm({ ...form, weeklyHours: e.target.value })}
                  placeholder="e.g. 10"
                />
              </div>
              <div>
                <Label htmlFor="lang">Output language</Label>
                <select
                  id="lang"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                >
                  <option value="en">English</option>
                  <option value="vi">Tiếng Việt</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sources</CardTitle>
            <CardDescription>
              Pick a Module 1 session and / or a Module 2 quiz set. All uploaded documents and questions inside become source material for Module 3.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <>
                <div>
                  <Label className="flex items-center gap-1">
                    <BookOpen className="h-4 w-4" /> Module 1 — Exam Session
                  </Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.sessionId}
                    onChange={(e) => setForm({ ...form, sessionId: e.target.value })}
                  >
                    <option value="">— None —</option>
                    {available?.projects?.flatMap((p) =>
                      p.sessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {p.name} / {s.name} ({s._count.documents} docs · {s._count.questions} Qs · {s._count.parsedQuestions} past Qs)
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <Label className="flex items-center gap-1">
                    <Puzzle className="h-4 w-4" /> Module 2 — Quiz Set
                  </Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.quizSetId}
                    onChange={(e) => setForm({ ...form, quizSetId: e.target.value })}
                  >
                    <option value="">— None —</option>
                    {available?.quizSets?.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.title} ({q._count.documents} docs · {q._count.questions} Qs)
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-gray-500">
                  At least one source is required. You can edit a prep set later, but the linked session / quiz set is fixed.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild variant="ghost" type="button"><Link href="/study-prep">Cancel</Link></Button>
          <Button type="submit" disabled={submitting} className="bg-[#028a39] hover:bg-[#026d2e] text-white">
            {submitting ? 'Creating…' : 'Create Prep Set'}
          </Button>
        </div>
      </form>
    </div>
  )
}
