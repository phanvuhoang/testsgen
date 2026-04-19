'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Plus, Pencil, Trash2, Copy, Share2, Users, BarChart2, Settings, ExternalLink
} from 'lucide-react'

type QuizClass = {
  id: string
  name: string
  description: string | null
  shareCode: string
  timeLimitMinutes: number | null
  questionsPerAttempt: number | null
  passMark: number | null
  randomizeQuestions: boolean
  shuffleAnswerOptions: boolean
  disablePrevButton: boolean
  displayMode: string | null
  requireLogin: boolean
  maxAttempts: number | null
  fixedQuestionIds: string | null
  autoSendResults: boolean
  autoSendResultType: string | null
  createdAt: string
  _count?: { attempts: number }
}

type QuizQuestion = {
  id: string
  stem: string
  questionType: string
  sortOrder: number
}

const emptyForm = {
  name: '',
  description: '',
  timeLimitMinutes: '',
  questionsPerAttempt: '',
  passMark: '',
  randomizeQuestions: 'true',
  shuffleAnswerOptions: 'false',
  disablePrevButton: 'false',
  displayMode: 'ONE_AT_ONCE',
  requireLogin: 'false',
  maxAttempts: '',
  fixedQuestionIds: [] as string[],
  autoSendResults: 'false',
  autoSendResultType: 'comprehensive',
}

export default function ClassesPage() {
  const params = useParams()
  const { toast } = useToast()
  const [classes, setClasses] = useState<QuizClass[]>([])
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingClass, setEditingClass] = useState<QuizClass | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [isSaving, setIsSaving] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'basic' | 'questions' | 'access' | 'email'>('basic')

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [classRes, qRes] = await Promise.all([
        fetch(`/api/quiz-sets/${params.quizId}/classes`),
        fetch(`/api/quiz-sets/${params.quizId}/questions`)
      ])
      if (classRes.ok) setClasses(await classRes.json())
      if (qRes.ok) {
        const qData = await qRes.json()
        setQuestions(qData.questions || qData || [])
      }
    } catch (err) {
      toast({ title: 'Failed to load classes', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const openNew = () => {
    setEditingClass(null)
    setForm({ ...emptyForm })
    setSettingsTab('basic')
    setDialogOpen(true)
  }

  const openEdit = (c: QuizClass) => {
    setEditingClass(c)
    setForm({
      name: c.name,
      description: c.description ?? '',
      timeLimitMinutes: c.timeLimitMinutes?.toString() ?? '',
      questionsPerAttempt: c.questionsPerAttempt?.toString() ?? '',
      passMark: c.passMark?.toString() ?? '',
      randomizeQuestions: String(c.randomizeQuestions),
      shuffleAnswerOptions: String(c.shuffleAnswerOptions),
      disablePrevButton: String(c.disablePrevButton),
      displayMode: c.displayMode ?? 'ONE_AT_ONCE',
      requireLogin: String(c.requireLogin),
      maxAttempts: c.maxAttempts?.toString() ?? '',
      fixedQuestionIds: c.fixedQuestionIds ? JSON.parse(c.fixedQuestionIds) : [],
      autoSendResults: String(c.autoSendResults),
      autoSendResultType: c.autoSendResultType ?? 'comprehensive',
    })
    setSettingsTab('basic')
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: 'Class name is required', variant: 'destructive' }); return }
    setIsSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        timeLimitMinutes: form.timeLimitMinutes ? parseInt(form.timeLimitMinutes) : null,
        questionsPerAttempt: form.questionsPerAttempt ? parseInt(form.questionsPerAttempt) : null,
        passMark: form.passMark ? parseInt(form.passMark) : null,
        randomizeQuestions: form.randomizeQuestions === 'true',
        shuffleAnswerOptions: form.shuffleAnswerOptions === 'true',
        disablePrevButton: form.disablePrevButton === 'true',
        displayMode: form.displayMode,
        requireLogin: form.requireLogin === 'true',
        maxAttempts: form.maxAttempts ? parseInt(form.maxAttempts) : null,
        fixedQuestionIds: form.fixedQuestionIds.length > 0 ? form.fixedQuestionIds : null,
        autoSendResults: form.autoSendResults === 'true',
        autoSendResultType: form.autoSendResultType,
      }

      const url = editingClass
        ? `/api/quiz-sets/${params.quizId}/classes/${editingClass.id}`
        : `/api/quiz-sets/${params.quizId}/classes`
      const method = editingClass ? 'PATCH' : 'POST'

      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      toast({ title: editingClass ? 'Class updated' : 'Class created' })
      setDialogOpen(false)
      fetchData()
    } catch {
      toast({ title: 'Failed to save class', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this class? All its attempt data will be lost.')) return
    try {
      await fetch(`/api/quiz-sets/${params.quizId}/classes/${id}`, { method: 'DELETE' })
      toast({ title: 'Class deleted' })
      fetchData()
    } catch {
      toast({ title: 'Failed to delete', variant: 'destructive' })
    }
  }

  const copyLink = (shareCode: string) => {
    const url = `${window.location.origin}/q/${shareCode}`
    navigator.clipboard.writeText(url)
    toast({ title: 'Link copied!' })
  }

  if (isLoading) return <div className="p-6"><Skeleton className="h-64" /></div>

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Classes</h1>
          <p className="text-sm text-gray-500 mt-1">Each class shares the same question bank but has its own settings, link, and analytics.</p>
        </div>
        <Button onClick={openNew} className="bg-primary text-white hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />New Class
        </Button>
      </div>

      {classes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">No classes yet. Create a class to share a customized version of this quiz with a group.</p>
            <Button onClick={openNew} className="bg-primary text-white">Create First Class</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {classes.map(c => (
            <Card key={c.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{c.name}</h3>
                    <Badge variant="secondary">{c._count?.attempts ?? 0} attempts</Badge>
                  </div>
                  {c.description && <p className="text-sm text-gray-500 truncate">{c.description}</p>}
                  <div className="flex gap-3 text-xs text-gray-400 mt-1">
                    {c.timeLimitMinutes && <span>⏱ {c.timeLimitMinutes}m</span>}
                    {c.passMark && <span>🎯 Pass: {c.passMark}%</span>}
                    {c.requireLogin && <span>🔒 Login required</span>}
                    {c.fixedQuestionIds && <span>📌 Fixed questions</span>}
                  </div>
                  <p className="text-xs text-gray-300 font-mono mt-1 truncate">/q/{c.shareCode}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" title="Copy link" onClick={() => copyLink(c.shareCode)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" title="Open quiz" onClick={() => window.open(`/q/${c.shareCode}`, '_blank')}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" title="Edit settings" onClick={() => openEdit(c)}>
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" title="View analytics" onClick={() => window.open(`/quiz/${params.quizId}/classes/${c.id}/analytics`, '_blank')}>
                    <BarChart2 className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" title="Delete" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Settings Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClass ? `Edit Class: ${editingClass.name}` : 'New Class'}</DialogTitle>
          </DialogHeader>

          {/* Tab nav */}
          <div className="flex gap-1 border-b mb-4">
            {(['basic', 'questions', 'access', 'email'] as const).map(tab => (
              <button key={tab} onClick={() => setSettingsTab(tab)}
                className={`px-3 py-1.5 text-sm rounded-t capitalize border-b-2 transition-colors ${settingsTab === tab ? 'border-primary text-primary font-medium' : 'border-transparent text-gray-500'}`}>
                {tab}
              </button>
            ))}
          </div>

          {settingsTab === 'basic' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Class Name *</Label>
                <Input placeholder="e.g. Class A — Spring 2026" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input placeholder="Optional description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Time Limit (minutes, blank = unlimited)</Label>
                  <Input type="number" min="1" placeholder="e.g. 60" value={form.timeLimitMinutes} onChange={e => setForm({ ...form, timeLimitMinutes: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Pass Mark (%)</Label>
                  <Input type="number" min="0" max="100" placeholder="e.g. 70" value={form.passMark} onChange={e => setForm({ ...form, passMark: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Max Attempts (blank = unlimited)</Label>
                  <Input type="number" min="1" value={form.maxAttempts} onChange={e => setForm({ ...form, maxAttempts: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Display Mode</Label>
                  <Select value={form.displayMode} onValueChange={v => setForm({ ...form, displayMode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ONE_AT_ONCE">One at a time</SelectItem>
                      <SelectItem value="ALL_AT_ONCE">All at once</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { key: 'shuffleAnswerOptions', label: 'Shuffle answer option order per student' },
                  { key: 'disablePrevButton', label: 'Disable "Previous" button (forward-only navigation)' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Checkbox id={key} checked={form[key as keyof typeof form] === 'true'}
                      onCheckedChange={c => setForm({ ...form, [key]: c ? 'true' : 'false' })} />
                    <Label htmlFor={key} className="font-normal text-sm">{label}</Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {settingsTab === 'questions' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Questions Per Attempt (blank = all)</Label>
                <Input type="number" min="1" value={form.questionsPerAttempt} onChange={e => setForm({ ...form, questionsPerAttempt: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="randomizeQ" checked={form.randomizeQuestions === 'true'}
                  onCheckedChange={c => setForm({ ...form, randomizeQuestions: c ? 'true' : 'false' })} />
                <Label htmlFor="randomizeQ" className="font-normal">Randomize question order for each attempt</Label>
              </div>

              {form.randomizeQuestions === 'false' && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    Fixed Questions for This Class
                    <span className="font-normal text-gray-400 ml-2">({form.fixedQuestionIds.length} selected)</span>
                  </Label>
                  <p className="text-xs text-gray-400">When randomize is off, you can select specific questions. All students in this class will get the same set.</p>
                  <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
                    {questions.filter(q => q.questionType !== 'TEXT_BLOCK').map(q => (
                      <div key={q.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                        <Checkbox
                          id={`q-${q.id}`}
                          checked={form.fixedQuestionIds.includes(q.id)}
                          onCheckedChange={c => {
                            if (c) setForm({ ...form, fixedQuestionIds: [...form.fixedQuestionIds, q.id] })
                            else setForm({ ...form, fixedQuestionIds: form.fixedQuestionIds.filter(id => id !== q.id) })
                          }}
                        />
                        <Label htmlFor={`q-${q.id}`} className="font-normal text-sm truncate cursor-pointer">
                          <span className="text-gray-400 mr-1 text-xs">{q.questionType}</span>
                          {q.stem}
                        </Label>
                      </div>
                    ))}
                  </div>
                  {form.fixedQuestionIds.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, fixedQuestionIds: [] })}>Clear selection</Button>
                  )}
                </div>
              )}
            </div>
          )}

          {settingsTab === 'access' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox id="requireLogin" checked={form.requireLogin === 'true'}
                  onCheckedChange={c => setForm({ ...form, requireLogin: c ? 'true' : 'false' })} />
                <Label htmlFor="requireLogin" className="font-normal">Require students to log in before taking this quiz</Label>
              </div>
              <p className="text-xs text-gray-400">When unchecked, anyone with the class link can take the quiz as a guest.</p>
            </div>
          )}

          {settingsTab === 'email' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox id="autoSend" checked={form.autoSendResults === 'true'}
                  onCheckedChange={c => setForm({ ...form, autoSendResults: c ? 'true' : 'false' })} />
                <Label htmlFor="autoSend" className="font-normal">Automatically send results email when student submits</Label>
              </div>
              {form.autoSendResults === 'true' && (
                <div className="pl-6 space-y-1.5">
                  <Label>Result type to send</Label>
                  <Select value={form.autoSendResultType} onValueChange={v => setForm({ ...form, autoSendResultType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="score">Score only</SelectItem>
                      <SelectItem value="analytics">Analytics (correct/incorrect per question)</SelectItem>
                      <SelectItem value="comprehensive">Comprehensive (answers + explanations)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-primary text-white">
              {isSaving ? 'Saving...' : editingClass ? 'Update Class' : 'Create Class'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
