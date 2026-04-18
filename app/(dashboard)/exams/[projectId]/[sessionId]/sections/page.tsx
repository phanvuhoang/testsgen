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
}

const questionTypes = [
  { value: 'MCQ_SINGLE', label: 'MCQ (Single Answer)' },
  { value: 'MCQ_MULTIPLE', label: 'MCQ (Multiple Answers)' },
  { value: 'SCENARIO', label: 'Scenario-Based' },
  { value: 'ESSAY', label: 'Long Form Essay' },
  { value: 'SHORT_ANSWER', label: 'Short Answer' },
]

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

  const totalMarks = sections.reduce(
    (sum, s) => sum + s.marksPerQuestion * s.questionsInExam,
    0
  )

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

  const updateSection = (id: string, field: keyof Section, value: string | number) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    )
  }

  const SectionForm = ({ data, onChange }: { data: Partial<Section>; onChange: (field: string, val: string | number) => void }) => (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 space-y-1">
        <Label className="text-xs">Section Name</Label>
        <Input value={data.name || ''} onChange={(e) => onChange('name', e.target.value)} placeholder="e.g. Section A" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Question Type</Label>
        <Select value={data.questionType || 'MCQ_SINGLE'} onValueChange={(v) => onChange('questionType', v)}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {questionTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Marks per Question</Label>
        <Input type="number" value={data.marksPerQuestion || 1} onChange={(e) => onChange('marksPerQuestion', Number(e.target.value))} className="h-9" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Questions in Exam</Label>
        <Input type="number" value={data.questionsInExam || 10} onChange={(e) => onChange('questionsInExam', Number(e.target.value))} className="h-9" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Questions in Bank</Label>
        <Input type="number" value={data.questionsInBank || 40} onChange={(e) => onChange('questionsInBank', Number(e.target.value))} className="h-9" />
      </div>
      <div className="col-span-2 space-y-1">
        <Label className="text-xs">Topics (comma-separated)</Label>
        <Input value={data.topics || ''} onChange={(e) => onChange('topics', e.target.value)} placeholder="e.g. Tax rates, Definitions, VAT" />
      </div>
      <div className="col-span-2 space-y-1">
        <Label className="text-xs">Instructions</Label>
        <Textarea value={data.instructions || ''} onChange={(e) => onChange('instructions', e.target.value)} className="h-16" />
      </div>
      <div className="col-span-2 space-y-1">
        <Label className="text-xs">AI Instructions (optional)</Label>
        <Textarea value={data.aiInstructions || ''} onChange={(e) => onChange('aiInstructions', e.target.value)} className="h-16" placeholder="e.g. Focus on Decree 70/2025..." />
      </div>
    </div>
  )

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
          {sections.map((sec) => (
            <Card key={sec.id}>
              <CardContent className="p-4">
                {editingId === sec.id ? (
                  <>
                    <SectionForm
                      data={sec}
                      onChange={(field, val) => updateSection(sec.id, field as keyof Section, val)}
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
                        <Badge variant="outline" className="text-xs">
                          {questionTypes.find((t) => t.value === sec.questionType)?.label}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                        <span>{sec.marksPerQuestion} marks/q × {sec.questionsInExam}q = <strong>{sec.marksPerQuestion * sec.questionsInExam} marks</strong></span>
                        <span>Bank: {sec.questionsInBank} questions</span>
                        {sec.topics && <span>Topics: {sec.topics}</span>}
                      </div>
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
          ))}
        </div>
      )}
    </div>
  )
}
