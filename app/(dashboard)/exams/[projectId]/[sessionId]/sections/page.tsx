'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Pencil, Trash2, Save, X, GripVertical } from 'lucide-react'

type Section = {
  id: string
  name: string
  instructions: string | null
  questionType: string
  marksPerQuestion: number
  questionsInExam: number
  questionsInBank: number
  topics: string | null
  aiInstructions: string | null
  sortOrder: number
  questionTypes: string | null
  topicBreakdown: string | null
}

const allQuestionTypes = [
  { value: 'MCQ_SINGLE', label: 'Multiple Choice (single answer)' },
  { value: 'MCQ_MULTIPLE', label: 'Multiple Choice (multiple answers)' },
  { value: 'FILL_BLANK', label: 'Fill in the Blank' },
  { value: 'SHORT_ANSWER', label: 'Short Answer' },
  { value: 'ESSAY', label: 'Long Form Essay' },
  { value: 'SCENARIO', label: 'Scenario-Based' },
  { value: 'CASE_STUDY', label: 'Case Study' },
  { value: 'OTHER', label: 'Other' },
]

type QTypeRow = { type: string; count: number; marksEach: number }
type TopicRow = { topicName: string; count: number }

const SectionForm = ({ data, onChange }: { data: Partial<Section>; onChange: (field: string, val: any) => void }) => {
  const [qtRows, setQtRows] = useState<QTypeRow[]>(() => {
    try {
      return data.questionTypes
        ? JSON.parse(data.questionTypes)
        : [{ type: 'MCQ_SINGLE', count: data.questionsInExam ?? 15, marksEach: data.marksPerQuestion ?? 2 }]
    } catch {
      return [{ type: 'MCQ_SINGLE', count: data.questionsInExam ?? 15, marksEach: data.marksPerQuestion ?? 2 }]
    }
  })
  const [topicRows, setTopicRows] = useState<TopicRow[]>(() => {
    try {
      return data.topicBreakdown ? JSON.parse(data.topicBreakdown) : []
    } catch {
      return []
    }
  })

  const updateQtRows = (rows: QTypeRow[]) => {
    setQtRows(rows)
    onChange('questionTypes', JSON.stringify(rows))
    const totalQ = rows.reduce((s, r) => s + r.count, 0)
    onChange('questionsInExam', totalQ)
    onChange('marksPerQuestion', rows[0]?.marksEach ?? 1)
  }

  const updateTopicRows = (rows: TopicRow[]) => {
    setTopicRows(rows)
    onChange('topicBreakdown', JSON.stringify(rows))
  }

  const totalQ = qtRows.reduce((s, r) => s + r.count, 0)
  const totalPts = qtRows.reduce((s, r) => s + r.count * r.marksEach, 0)

  return (
    <div className="space-y-4">
      {/* Basic info */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Section Name *</Label>
          <Input value={data.name || ''} onChange={e => onChange('name', e.target.value)} placeholder="e.g. Section A — Multiple Choice" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Questions in Bank</Label>
          <Input type="number" value={data.questionsInBank || 40} onChange={e => onChange('questionsInBank', Number(e.target.value))} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Exam summary</Label>
          <div className="h-9 flex items-center text-sm text-gray-600 font-medium">
            {totalQ} questions · {totalPts} marks
          </div>
        </div>
      </div>

      {/* Question Type Breakdown */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">Question Types</Label>
          <Button type="button" variant="outline" size="sm" className="h-6 text-xs"
            onClick={() => updateQtRows([...qtRows, { type: 'MCQ_SINGLE', count: 5, marksEach: 1 }])}>
            <Plus className="h-3 w-3 mr-1" />Add Type
          </Button>
        </div>
        {qtRows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_80px_80px_32px] gap-2 items-center">
            <Select value={row.type} onValueChange={v => updateQtRows(qtRows.map((r, j) => j === i ? { ...r, type: v } : r))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {allQuestionTypes.map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" value={row.count} min={1}
              onChange={e => updateQtRows(qtRows.map((r, j) => j === i ? { ...r, count: Number(e.target.value) || 1 } : r))}
              className="h-8 text-xs" placeholder="Count" />
            <Input type="number" value={row.marksEach} min={0} step={0.5}
              onChange={e => updateQtRows(qtRows.map((r, j) => j === i ? { ...r, marksEach: Number(e.target.value) || 1 } : r))}
              className="h-8 text-xs" placeholder="Marks" />
            {qtRows.length > 1 ? (
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-400"
                onClick={() => updateQtRows(qtRows.filter((_, j) => j !== i))}>
                <X className="h-3 w-3" />
              </Button>
            ) : <div />}
          </div>
        ))}
        <div className="text-xs text-gray-400">Count = questions in exam · Marks = marks per question</div>
      </div>

      {/* Topic Breakdown (optional) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">Topic Breakdown <span className="font-normal text-gray-400">(optional)</span></Label>
          <Button type="button" variant="outline" size="sm" className="h-6 text-xs"
            onClick={() => updateTopicRows([...topicRows, { topicName: '', count: 1 }])}>
            <Plus className="h-3 w-3 mr-1" />Add Topic
          </Button>
        </div>
        {topicRows.length === 0 && <p className="text-xs text-gray-400">e.g. 4 questions on CIT, 4 on PIT, 2 on VAT</p>}
        {topicRows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_80px_32px] gap-2 items-center">
            <Input value={row.topicName} placeholder="Topic name (e.g. CIT)"
              onChange={e => updateTopicRows(topicRows.map((r, j) => j === i ? { ...r, topicName: e.target.value } : r))}
              className="h-8 text-xs" />
            <Input type="number" value={row.count} min={1}
              onChange={e => updateTopicRows(topicRows.map((r, j) => j === i ? { ...r, count: Number(e.target.value) || 1 } : r))}
              className="h-8 text-xs" placeholder="Count" />
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-400"
              onClick={() => updateTopicRows(topicRows.filter((_, j) => j !== i))}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Instructions */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Instructions</Label>
          <Textarea value={data.instructions || ''} onChange={e => onChange('instructions', e.target.value)} className="h-16" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">AI Instructions <span className="text-gray-400 font-normal">(optional)</span></Label>
          <Textarea value={data.aiInstructions || ''} onChange={e => onChange('aiInstructions', e.target.value)} className="h-16" placeholder="e.g. Focus on Decree 70/2025, avoid calculation questions..." />
        </div>
      </div>
    </div>
  )
}

export default function SectionsPage() {
  const params = useParams()
  const { toast } = useToast()
  const [sections, setSections] = useState<Section[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Section>>({
    name: '',
    questionType: 'MCQ_SINGLE',
    questionTypes: null,
    topicBreakdown: null,
    marksPerQuestion: 2,
    questionsInExam: 15,
    questionsInBank: 60,
    topics: '',
    instructions: '',
    aiInstructions: '',
  })

  useEffect(() => {
    fetchSections()
  }, [])

  const fetchSections = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/sections`)
      if (res.ok) setSections(await res.json())
    } finally {
      setIsLoading(false)
    }
  }

  const totalMarks = sections.reduce((sum, s) => {
    if (s.questionTypes) {
      try {
        const rows: QTypeRow[] = JSON.parse(s.questionTypes)
        return sum + rows.reduce((a, r) => a + r.count * r.marksEach, 0)
      } catch {}
    }
    return sum + s.marksPerQuestion * s.questionsInExam
  }, 0)

  const handleAdd = async () => {
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, sortOrder: sections.length }),
      })
      if (!res.ok) throw new Error()
      const sec = await res.json()
      setSections((prev) => [...prev, sec])
      setIsAdding(false)
      setForm({
        name: '',
        questionType: 'MCQ_SINGLE',
        questionTypes: null,
        topicBreakdown: null,
        marksPerQuestion: 2,
        questionsInExam: 15,
        questionsInBank: 60,
        topics: '',
        instructions: '',
        aiInstructions: '',
      })
      toast({ title: 'Section added' })
    } catch {
      toast({ title: 'Failed to add section', variant: 'destructive' })
    }
  }

  const handleSave = async (id: string) => {
    const sec = sections.find((s) => s.id === id)
    if (!sec) return
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/sections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sec),
      })
      if (!res.ok) throw new Error()
      setEditingId(null)
      toast({ title: 'Section updated' })
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this section?')) return
    const res = await fetch(`/api/sessions/${params.sessionId}/sections/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setSections((prev) => prev.filter((s) => s.id !== id))
      toast({ title: 'Section deleted' })
    }
  }

  const updateSection = (id: string, field: string, value: any) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    )
  }

  const getSectionSummary = (sec: Section) => {
    if (sec.questionTypes) {
      try {
        const rows: QTypeRow[] = JSON.parse(sec.questionTypes)
        const totalQ = rows.reduce((s, r) => s + r.count, 0)
        const totalPts = rows.reduce((s, r) => s + r.count * r.marksEach, 0)
        return { totalQ, totalPts, rows }
      } catch {}
    }
    return {
      totalQ: sec.questionsInExam,
      totalPts: sec.marksPerQuestion * sec.questionsInExam,
      rows: [{ type: sec.questionType, count: sec.questionsInExam, marksEach: sec.marksPerQuestion }],
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Exam Sections</h2>
          <p className="text-sm text-gray-500">
            Total exam marks: <strong className="text-primary">{totalMarks}</strong>
          </p>
        </div>
        <Button onClick={() => setIsAdding(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Section
        </Button>
      </div>

      {/* Add Form */}
      {isAdding && (
        <Card className="mb-4 border-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">New Section</CardTitle>
          </CardHeader>
          <CardContent>
            <SectionForm
              data={form}
              onChange={(field, val) => setForm((prev) => ({ ...prev, [field]: val }))}
            />
            <div className="flex gap-2 mt-3 justify-end">
              <Button variant="outline" size="sm" onClick={() => setIsAdding(false)}>
                <X className="h-4 w-4 mr-1" />Cancel
              </Button>
              <Button size="sm" onClick={handleAdd}>
                <Save className="h-4 w-4 mr-1" />Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : sections.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No sections defined yet. Add sections to structure your exam.
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map((sec) => {
            const summary = getSectionSummary(sec)
            return (
              <Card key={sec.id}>
                <CardContent className="p-4">
                  {editingId === sec.id ? (
                    <>
                      <SectionForm
                        data={sec}
                        onChange={(field, val) => updateSection(sec.id, field, val)}
                      />
                      <div className="flex gap-2 mt-3 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                        <Button size="sm" onClick={() => handleSave(sec.id)}>
                          <Save className="h-4 w-4 mr-1" />Save
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-start gap-3">
                      <GripVertical className="h-5 w-5 text-gray-300 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-sm">{sec.name}</h3>
                          <span className="text-xs text-gray-500">{summary.totalQ}q · {summary.totalPts} marks</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-1">
                          {summary.rows.map((r, i) => (
                            <Badge key={i} variant="outline" className="text-xs font-normal">
                              {allQuestionTypes.find(t => t.value === r.type)?.label ?? r.type} ×{r.count} ({r.marksEach}m)
                            </Badge>
                          ))}
                        </div>
                        {sec.topicBreakdown && (() => {
                          try {
                            const tRows: TopicRow[] = JSON.parse(sec.topicBreakdown)
                            if (tRows.length === 0) return null
                            return (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {tRows.map((t, i) => (
                                  <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                    {t.topicName} ×{t.count}
                                  </span>
                                ))}
                              </div>
                            )
                          } catch {
                            return null
                          }
                        })()}
                        <div className="text-xs text-gray-400 mt-1">Bank: {sec.questionsInBank} questions</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(sec.id)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(sec.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
