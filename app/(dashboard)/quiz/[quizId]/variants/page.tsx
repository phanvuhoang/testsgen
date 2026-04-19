'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Share2,
  Layers,
  BarChart2,
} from 'lucide-react'

type Variant = {
  id: string
  name: string
  description: string | null
  questionsPerAttempt: number | null
  timeLimitMinutes: number | null
  passMark: number | null
  randomizeQuestions: boolean | null
  displayMode: string | null
  questionFilter: string | null
  createdAt: string
}

type QuizSet = {
  id: string
  title: string
  shareCode: string
  questionsPerAttempt: number
  timeLimitMinutes: number | null
  passMark: number
  randomizeQuestions: boolean
  displayMode: string
}

const emptyForm = {
  name: '',
  description: '',
  questionsPerAttempt: '',
  timeLimitMinutes: '',
  passMark: '',
  randomizeQuestions: '',
  displayMode: '',
  poolTags: '',
  maxQuestions: '',
  shuffleAnswerOptions: 'false',
  fixedQuestionIds: '',
}

export default function QuizVariantsPage() {
  const params = useParams()
  const { toast } = useToast()

  const [variants, setVariants] = useState<Variant[]>([])
  const [quizSet, setQuizSet] = useState<QuizSet | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [varRes, qsRes] = await Promise.all([
        fetch(`/api/quiz-sets/${params.quizId}/variants`),
        fetch(`/api/quiz-sets/${params.quizId}`),
      ])
      if (varRes.ok) setVariants(await varRes.json())
      if (qsRes.ok) setQuizSet(await qsRes.json())
    } catch {
      toast({ title: 'Failed to load variants', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowDialog(true)
  }

  const openEdit = (v: Variant) => {
    setEditingId(v.id)
    const qf = v.questionFilter ? JSON.parse(v.questionFilter) : {}
    const anyV = v as any
    setForm({
      name: v.name,
      description: v.description ?? '',
      questionsPerAttempt: v.questionsPerAttempt != null ? String(v.questionsPerAttempt) : '',
      timeLimitMinutes: v.timeLimitMinutes != null ? String(v.timeLimitMinutes) : '',
      passMark: v.passMark != null ? String(v.passMark) : '',
      randomizeQuestions: v.randomizeQuestions != null ? String(v.randomizeQuestions) : '',
      displayMode: v.displayMode ?? '',
      poolTags: qf.poolTags?.join(',') ?? '',
      maxQuestions: qf.maxQuestions != null ? String(qf.maxQuestions) : '',
      shuffleAnswerOptions: String(anyV.shuffleAnswerOptions ?? false),
      fixedQuestionIds: anyV.fixedQuestionIds ? (() => { try { return JSON.parse(anyV.fixedQuestionIds).join(',') } catch { return anyV.fixedQuestionIds } })() : '',
    })
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Variant name is required', variant: 'destructive' })
      return
    }
    setIsSaving(true)
    try {
      const poolTags = form.poolTags.trim()
        ? form.poolTags.split(',').map((t) => t.trim()).filter(Boolean)
        : undefined
      const maxQuestions = form.maxQuestions ? parseInt(form.maxQuestions) : undefined
      const questionFilter = (poolTags || maxQuestions) ? { poolTags, maxQuestions } : null

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        questionsPerAttempt: form.questionsPerAttempt ? parseInt(form.questionsPerAttempt) : null,
        timeLimitMinutes: form.timeLimitMinutes ? parseInt(form.timeLimitMinutes) : null,
        passMark: form.passMark ? parseInt(form.passMark) : null,
        randomizeQuestions: form.randomizeQuestions === 'true' ? true : form.randomizeQuestions === 'false' ? false : null,
        displayMode: form.displayMode || null,
        questionFilter,
        shuffleAnswerOptions: form.shuffleAnswerOptions === 'true',
        fixedQuestionIds: form.fixedQuestionIds.trim()
          ? JSON.stringify(form.fixedQuestionIds.split(',').map(s => s.trim()).filter(Boolean))
          : null,
      }

      const url = editingId
        ? `/api/quiz-sets/${params.quizId}/variants/${editingId}`
        : `/api/quiz-sets/${params.quizId}/variants`
      const method = editingId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      const saved = await res.json()

      if (editingId) {
        setVariants((prev) => prev.map((v) => (v.id === editingId ? saved : v)))
        toast({ title: 'Variant updated' })
      } else {
        setVariants((prev) => [...prev, saved])
        toast({ title: 'Variant created' })
      }
      setShowDialog(false)
    } catch {
      toast({ title: 'Failed to save variant', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this variant?')) return
    try {
      const res = await fetch(`/api/quiz-sets/${params.quizId}/variants/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setVariants((prev) => prev.filter((v) => v.id !== id))
      toast({ title: 'Variant deleted' })
    } catch {
      toast({ title: 'Failed to delete variant', variant: 'destructive' })
    }
  }

  const getShareLink = (v: Variant) => {
    if (!quizSet || typeof window === 'undefined') return ''
    // Variant share link encodes the variantId as a query param
    return `${window.location.origin}/q/${quizSet.shareCode}?variant=${v.id}`
  }

  const copyShareLink = (v: Variant) => {
    navigator.clipboard.writeText(getShareLink(v))
    toast({ title: 'Share link copied!' })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            Quiz Variants
          </h1>
          {quizSet && (
            <p className="text-gray-500 text-sm mt-0.5">{quizSet.title}</p>
          )}
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Variant
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && variants.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Layers className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="font-medium text-gray-600">No variants yet</p>
            <p className="text-sm text-gray-400 mb-4">
              Create variants to offer different versions of this quiz with different settings
            </p>
            <Button variant="outline" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create first variant
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {variants.map((v) => {
          const qf = v.questionFilter ? JSON.parse(v.questionFilter) : null
          return (
            <Card key={v.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-gray-900">{v.name}</h3>
                      {v.questionsPerAttempt != null && (
                        <Badge variant="outline">{v.questionsPerAttempt} questions</Badge>
                      )}
                      {v.timeLimitMinutes != null && (
                        <Badge variant="outline">{v.timeLimitMinutes} min</Badge>
                      )}
                      {v.passMark != null && (
                        <Badge variant="outline">Pass: {v.passMark}%</Badge>
                      )}
                      {v.displayMode && (
                        <Badge variant="secondary">{v.displayMode === 'ONE_AT_ONCE' ? 'One at a time' : 'All at once'}</Badge>
                      )}
                    </div>
                    {v.description && (
                      <p className="text-sm text-gray-500 mb-2">{v.description}</p>
                    )}
                    {qf && (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        {qf.poolTags?.length > 0 && (
                          <span>Pools: {qf.poolTags.join(', ')}</span>
                        )}
                        {qf.maxQuestions && (
                          <span>Max {qf.maxQuestions} questions</span>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Inherits unset settings from parent quiz
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyShareLink(v)}
                      title="Copy share link"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(`/quiz/${params.quizId}/variants/${v.id}/analytics`, '_blank')}
                      title="View analytics"
                    >
                      <BarChart2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(v)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(v.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Variant' : 'New Variant'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Variant Name *</Label>
              <Input
                placeholder="e.g. Hard Mode, Variant B, 30-Question Version"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                placeholder="Optional description..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="min-h-[60px]"
              />
            </div>

            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Override Settings (leave blank to inherit from parent)
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">Questions per attempt</Label>
                <Input
                  type="number"
                  placeholder="inherit"
                  value={form.questionsPerAttempt}
                  onChange={(e) => setForm({ ...form, questionsPerAttempt: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Time limit (minutes)</Label>
                <Input
                  type="number"
                  placeholder="inherit"
                  value={form.timeLimitMinutes}
                  onChange={(e) => setForm({ ...form, timeLimitMinutes: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Pass mark (%)</Label>
                <Input
                  type="number"
                  placeholder="inherit"
                  value={form.passMark}
                  onChange={(e) => setForm({ ...form, passMark: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Randomize questions</Label>
                <Select
                  value={form.randomizeQuestions}
                  onValueChange={(v) => setForm({ ...form, randomizeQuestions: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="inherit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Inherit from parent</SelectItem>
                    <SelectItem value="true">Yes — randomize</SelectItem>
                    <SelectItem value="false">No — fixed order</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-sm">Display mode</Label>
              <Select
                value={form.displayMode}
                onValueChange={(v) => setForm({ ...form, displayMode: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="inherit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Inherit from parent</SelectItem>
                  <SelectItem value="ONE_AT_ONCE">One at a time</SelectItem>
                  <SelectItem value="ALL_AT_ONCE">All on one page</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Question Filter (optional)
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">Pool tags (comma-separated)</Label>
                <Input
                  placeholder="Pool A, Pool B"
                  value={form.poolTags}
                  onChange={(e) => setForm({ ...form, poolTags: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Max questions to draw</Label>
                <Input
                  type="number"
                  placeholder="all"
                  value={form.maxQuestions}
                  onChange={(e) => setForm({ ...form, maxQuestions: e.target.value })}
                />
              </div>
            </div>

            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Class / Fixed Question Set
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-sm">Fixed question IDs for this class (comma-separated)</Label>
                <Textarea
                  placeholder="Leave empty to use question pool/random selection. Paste specific question IDs to use the same questions for all students in this variant."
                  value={form.fixedQuestionIds}
                  onChange={(e) => setForm({ ...form, fixedQuestionIds: e.target.value })}
                  className="min-h-[60px] text-xs"
                />
                <p className="text-xs text-gray-400">All students assigned this variant will receive the same questions in this set.</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="shuffleAnswerOptions"
                  checked={form.shuffleAnswerOptions === 'true'}
                  onChange={(e) => setForm({ ...form, shuffleAnswerOptions: e.target.checked ? 'true' : 'false' })}
                />
                <Label htmlFor="shuffleAnswerOptions" className="text-sm font-normal">
                  Shuffle answer option order per student (same questions, different answer order)
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Variant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
