'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import {
  ArrowLeft, Sparkles, BookOpen, Puzzle, Calendar, FileText, Wand2,
  ClipboardList, Lightbulb, BarChart3, Loader2,
} from 'lucide-react'
import { AssetCard, type StudyAsset } from '@/components/study-prep/asset-card'

type PrepSet = {
  id: string
  name: string
  description: string | null
  targetExam: string | null
  examDate: string | null
  targetScore: string | null
  weeklyHours: number | null
  language: string | null
  session: {
    id: string
    name: string
    project: { id: string; name: string }
    documents: { id: string; fileName: string; fileType: string }[]
    topics: { id: string; name: string; isOverall: boolean }[]
    _count: { questions: number; parsedQuestions: number; mockExams: number; sections: number }
  } | null
  quizSet: {
    id: string
    title: string
    documents: { id: string; fileName: string; fileType: string }[]
    _count: { questions: number }
  } | null
  studyPlans: StudyAsset[]
  studyMaterials: StudyAsset[]
  mockExamPlans: StudyAsset[]
  createdBy: { id: string; name: string }
}

type Model = { id: string; label: string; isDefault?: boolean }

export default function PrepSetDetailPage({ params }: { params: { id: string } }) {
  const { toast } = useToast()
  const [prep, setPrep] = useState<PrepSet | null>(null)
  const [loading, setLoading] = useState(true)
  const [models, setModels] = useState<Model[]>([])
  const [modelId, setModelId] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState<{ kind: string | null }>({ kind: null })

  const refetch = useCallback(async () => {
    const r = await fetch(`/api/study-prep/sets/${params.id}`)
    if (r.ok) setPrep(await r.json())
  }, [params.id])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/study-prep/sets/${params.id}`).then((r) => r.ok ? r.json() : null),
      fetch('/api/ai-models').then((r) => r.ok ? r.json() : []),
    ]).then(([p, m]) => {
      setPrep(p)
      setModels(m || [])
      const def = (m || []).find((x: Model) => x.isDefault)
      if (def) setModelId(def.id)
    }).finally(() => setLoading(false))
  }, [params.id])

  async function generate(kind: 'plans' | 'materials' | 'mock-plans') {
    setBusy({ kind })
    try {
      const r = await fetch(`/api/study-prep/sets/${params.id}/${kind}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: modelId || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Generation failed')
      toast({ title: 'Generated', description: j.title || 'Asset created' })
      await refetch()
    } catch (e: any) {
      toast({ title: 'Generation failed', description: e.message, variant: 'destructive' })
    } finally {
      setBusy({ kind: null })
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-32 w-full mb-4" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!prep) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-red-600">Prep set not found.</p>
        <Button asChild className="mt-3"><Link href="/study-prep">Back</Link></Button>
      </div>
    )
  }

  const totalDocs =
    (prep.session?.documents?.length || 0) +
    (prep.quizSet?.documents?.length || 0)
  const totalQuestions =
    (prep.session?._count.questions || 0) +
    (prep.session?._count.parsedQuestions || 0) +
    (prep.quizSet?._count.questions || 0)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link href="/study-prep"><ArrowLeft className="h-4 w-4 mr-1" /> All Prep Sets</Link>
      </Button>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            {prep.name}
          </h1>
          {prep.targetExam && <p className="text-gray-600 mt-1">{prep.targetExam}</p>}
          {prep.description && <p className="text-gray-500 text-sm mt-0.5">{prep.description}</p>}
          <div className="flex flex-wrap gap-2 mt-2">
            {prep.session && (
              <Badge variant="secondary" className="font-normal">
                <BookOpen className="h-3 w-3 mr-1" />
                {prep.session.project.name} / {prep.session.name}
              </Badge>
            )}
            {prep.quizSet && (
              <Badge variant="secondary" className="font-normal">
                <Puzzle className="h-3 w-3 mr-1" />
                {prep.quizSet.title}
              </Badge>
            )}
            {prep.examDate && (
              <Badge variant="outline" className="font-normal">
                <Calendar className="h-3 w-3 mr-1" />
                Exam: {new Date(prep.examDate).toLocaleDateString()}
              </Badge>
            )}
            {prep.targetScore && <Badge variant="outline" className="font-normal">Target: {prep.targetScore}</Badge>}
            {prep.weeklyHours && <Badge variant="outline" className="font-normal">{prep.weeklyHours}h / week</Badge>}
            <Badge variant="outline" className="font-normal">
              {prep.language === 'vi' ? 'Tiếng Việt' : 'English'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Sources summary */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Sources</CardTitle>
          <CardDescription>
            {totalDocs} document(s) and {totalQuestions} question(s) feed every generator below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {prep.session && (
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                  <BookOpen className="h-3 w-3" /> Module 1 — {prep.session.project.name} / {prep.session.name}
                </p>
                <p className="text-xs text-gray-500 mb-1">
                  {prep.session.documents.length} documents · {prep.session._count.questions} questions · {prep.session._count.parsedQuestions} past questions
                </p>
                <div className="flex flex-wrap gap-1">
                  {prep.session.documents.slice(0, 8).map((d) => (
                    <Badge key={d.id} variant="outline" className="font-normal text-xs">
                      {d.fileName}
                    </Badge>
                  ))}
                  {prep.session.documents.length > 8 && (
                    <Badge variant="outline" className="font-normal text-xs">
                      +{prep.session.documents.length - 8} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
            {prep.quizSet && (
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                  <Puzzle className="h-3 w-3" /> Module 2 — {prep.quizSet.title}
                </p>
                <p className="text-xs text-gray-500 mb-1">
                  {prep.quizSet.documents.length} documents · {prep.quizSet._count.questions} quiz questions
                </p>
                <div className="flex flex-wrap gap-1">
                  {prep.quizSet.documents.slice(0, 8).map((d) => (
                    <Badge key={d.id} variant="outline" className="font-normal text-xs">
                      {d.fileName}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Generator panel */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" /> Generate
          </CardTitle>
          <CardDescription>Run the AI on the linked sources to create a new asset.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700">Model</label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
              >
                <option value="">Server default</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}{m.isDefault ? ' ★' : ''}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-700">Extra notes for the AI (optional)</label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder='e.g. "Focus on Vietnam CIT and PIT only" or "Student is weak on transfer pricing — go deeper there".'
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => generate('plans')}
              disabled={!!busy.kind}
              className="bg-[#028a39] hover:bg-[#026d2e] text-white"
            >
              {busy.kind === 'plans' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ClipboardList className="h-4 w-4 mr-2" />}
              Generate Study Plan
            </Button>
            <Button
              onClick={() => generate('materials')}
              disabled={!!busy.kind}
              variant="outline"
            >
              {busy.kind === 'materials' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lightbulb className="h-4 w-4 mr-2" />}
              Generate Secret-Sauce Notes
            </Button>
            <Button
              onClick={() => generate('mock-plans')}
              disabled={!!busy.kind}
              variant="outline"
            >
              {busy.kind === 'mock-plans' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-2" />}
              Generate Mock Exam Plan
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Generation uses the same AI provider as Modules 1 & 2 — set in Admin → Settings.
            Results are saved as drafts you can edit.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans">
            <ClipboardList className="h-4 w-4 mr-1" />
            Plans ({prep.studyPlans.length})
          </TabsTrigger>
          <TabsTrigger value="materials">
            <Lightbulb className="h-4 w-4 mr-1" />
            Secret-Sauce Notes ({prep.studyMaterials.length})
          </TabsTrigger>
          <TabsTrigger value="mock">
            <BarChart3 className="h-4 w-4 mr-1" />
            Mock Exam Plans ({prep.mockExamPlans.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-4 space-y-4">
          {prep.studyPlans.length === 0 ? (
            <EmptyHint kind="study plan" />
          ) : prep.studyPlans.map((p) => (
            <AssetCard
              key={p.id}
              asset={p}
              apiBase="/api/study-prep/plans"
              onChanged={refetch}
              onDeleted={refetch}
            />
          ))}
        </TabsContent>
        <TabsContent value="materials" className="mt-4 space-y-4">
          {prep.studyMaterials.length === 0 ? (
            <EmptyHint kind="secret-sauce notes" />
          ) : prep.studyMaterials.map((m) => (
            <AssetCard
              key={m.id}
              asset={m}
              apiBase="/api/study-prep/materials"
              onChanged={refetch}
              onDeleted={refetch}
            />
          ))}
        </TabsContent>
        <TabsContent value="mock" className="mt-4 space-y-4">
          {prep.mockExamPlans.length === 0 ? (
            <EmptyHint kind="mock exam plan" />
          ) : prep.mockExamPlans.map((m) => (
            <AssetCard
              key={m.id}
              asset={m}
              apiBase="/api/study-prep/mock-plans"
              hasMindmap={false}
              onChanged={refetch}
              onDeleted={refetch}
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function EmptyHint({ kind }: { kind: string }) {
  return (
    <Card>
      <CardContent className="py-8 flex flex-col items-center text-center">
        <FileText className="h-8 w-8 text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">
          No {kind} yet — use the Generate panel above.
        </p>
      </CardContent>
    </Card>
  )
}
