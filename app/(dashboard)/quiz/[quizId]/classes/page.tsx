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
import { Palette } from 'lucide-react'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
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
  // Feedback
  feedbackShowCorrect: boolean
  feedbackShowAnswer: boolean
  feedbackShowExplanation: boolean
  passMessage: string | null
  failMessage: string | null
  // Content
  introText: string | null
  conclusionText: string | null
  // Access
  accessType: string | null
  passcode: string | null
  // Certificate
  certificateEnabled: boolean
  certificateTitle: string | null
  certificateMessage: string | null
  certificateBorderColor: string | null
  certificateFont: string | null
  certificateShowScore: boolean
  certificateShowDate: boolean
  certificateIssuerName: string | null
  certificateIssuerTitle: string | null
  // Results display
  showAnswers: boolean
  showScore: boolean
  showCorrectAnswers: boolean
  // Question filters
  easyCount: number | null
  mediumCount: number | null
  hardCount: number | null
  questionTypeMix: string | null
  filterTopics: string | null
  filterTags: string | null
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
  // Feedback
  feedbackShowCorrect: 'false',
  feedbackShowAnswer: 'false',
  feedbackShowExplanation: 'false',
  passMessage: '',
  failMessage: '',
  // Content
  introText: '',
  conclusionText: '',
  // Access
  accessType: 'PUBLIC',
  passcode: '',
  // Certificate
  certificateEnabled: 'false',
  certificateTitle: 'Certificate of Completion',
  certificateMessage: '',
  certificateBorderColor: '#028a39',
  certificateFont: 'Georgia',
  certificateShowScore: 'true',
  certificateShowDate: 'true',
  certificateIssuerName: '',
  certificateIssuerTitle: '',
  // Results display
  showAnswers: 'true',
  showScore: 'true',
  showCorrectAnswers: 'true',
  // Question filters
  easyCount: '',
  mediumCount: '',
  hardCount: '',
  questionTypeMix: '',
  filterTopics: '',
  filterTags: '',
}

type SettingsTab = 'general' | 'questions' | 'feedback' | 'content' | 'access' | 'certificate' | 'email'

export default function ClassesPage() {
  const params = useParams()
  const { toast } = useToast()
  const [classes, setClasses] = useState<QuizClass[]>([])
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [quizSetDefaults, setQuizSetDefaults] = useState<Record<string, any>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingClass, setEditingClass] = useState<QuizClass | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [isSaving, setIsSaving] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general')

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [classRes, qRes, qsRes] = await Promise.all([
        fetch(`/api/quiz-sets/${params.quizId}/classes`),
        fetch(`/api/quiz-sets/${params.quizId}/questions`),
        fetch(`/api/quiz-sets/${params.quizId}`),
      ])
      if (classRes.ok) setClasses(await classRes.json())
      if (qRes.ok) {
        const qData = await qRes.json()
        setQuestions(qData.questions || qData || [])
      }
      if (qsRes.ok) {
        const qsData = await qsRes.json()
        setQuizSetDefaults(qsData)
      }
    } catch (err) {
      toast({ title: 'Failed to load classes', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const openNew = () => {
    setEditingClass(null)
    // Pre-populate with QuizSet defaults so new Class inherits them
    const qs = quizSetDefaults
    setForm({
      ...emptyForm,
      timeLimitMinutes: qs.timeLimitMinutes?.toString() ?? '',
      questionsPerAttempt: qs.questionsPerAttempt?.toString() ?? '',
      passMark: qs.passMark?.toString() ?? '',
      randomizeQuestions: String(qs.randomizeQuestions ?? true),
      shuffleAnswerOptions: String(qs.shuffleAnswerOptions ?? false),
      disablePrevButton: String(qs.disablePrevButton ?? false),
      displayMode: qs.displayMode ?? 'ONE_AT_ONCE',
      requireLogin: String(qs.requireLogin ?? false),
      maxAttempts: qs.maxAttempts?.toString() ?? '',
      feedbackShowCorrect: String(qs.feedbackShowCorrect ?? false),
      feedbackShowAnswer: String(qs.feedbackShowAnswer ?? false),
      feedbackShowExplanation: String(qs.feedbackShowExplanation ?? false),
      showAnswers: String(qs.showAnswers ?? true),
      showScore: String(qs.showScore ?? true),
      showCorrectAnswers: String(qs.showCorrectAnswers ?? true),
      passMessage: qs.passMessage ?? '',
      failMessage: qs.failMessage ?? '',
      introText: qs.introText ?? '',
      conclusionText: qs.conclusionText ?? '',
    })
    setSettingsTab('general')
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
      // Feedback
      feedbackShowCorrect: String(c.feedbackShowCorrect ?? false),
      feedbackShowAnswer: String(c.feedbackShowAnswer ?? false),
      feedbackShowExplanation: String(c.feedbackShowExplanation ?? false),
      passMessage: c.passMessage ?? '',
      failMessage: c.failMessage ?? '',
      // Content
      introText: c.introText ?? '',
      conclusionText: c.conclusionText ?? '',
      // Access
      accessType: c.accessType ?? 'PUBLIC',
      passcode: c.passcode ?? '',
      // Certificate
      certificateEnabled: String(c.certificateEnabled ?? false),
      certificateTitle: c.certificateTitle ?? 'Certificate of Completion',
      certificateMessage: c.certificateMessage ?? '',
      certificateBorderColor: c.certificateBorderColor ?? '#028a39',
      certificateFont: c.certificateFont ?? 'Georgia',
      certificateShowScore: String(c.certificateShowScore ?? true),
      certificateShowDate: String(c.certificateShowDate ?? true),
      certificateIssuerName: c.certificateIssuerName ?? '',
      certificateIssuerTitle: c.certificateIssuerTitle ?? '',
      // Results display
      showAnswers: String(c.showAnswers ?? true),
      showScore: String(c.showScore ?? true),
      showCorrectAnswers: String(c.showCorrectAnswers ?? true),
      // Question filters
      easyCount: c.easyCount?.toString() ?? '',
      mediumCount: c.mediumCount?.toString() ?? '',
      hardCount: c.hardCount?.toString() ?? '',
      questionTypeMix: c.questionTypeMix ?? '',
      filterTopics: c.filterTopics ? JSON.parse(c.filterTopics).join(', ') : '',
      filterTags: c.filterTags ? JSON.parse(c.filterTags).join(', ') : '',
    })
    setSettingsTab('general')
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
        // Feedback
        feedbackShowCorrect: form.feedbackShowCorrect === 'true',
        feedbackShowAnswer: form.feedbackShowAnswer === 'true',
        feedbackShowExplanation: form.feedbackShowExplanation === 'true',
        passMessage: form.passMessage.trim() || null,
        failMessage: form.failMessage.trim() || null,
        // Content
        introText: form.introText.trim() || null,
        conclusionText: form.conclusionText.trim() || null,
        // Access
        accessType: form.accessType,
        passcode: form.passcode.trim() || null,
        // Certificate
        certificateEnabled: form.certificateEnabled === 'true',
        certificateTitle: form.certificateTitle.trim() || null,
        certificateMessage: form.certificateMessage.trim() || null,
        certificateBorderColor: form.certificateBorderColor || null,
        certificateFont: form.certificateFont || null,
        certificateShowScore: form.certificateShowScore === 'true',
        certificateShowDate: form.certificateShowDate === 'true',
        certificateIssuerName: form.certificateIssuerName.trim() || null,
        certificateIssuerTitle: form.certificateIssuerTitle.trim() || null,
        // Results display
        showAnswers: form.showAnswers === 'true',
        showScore: form.showScore === 'true',
        showCorrectAnswers: form.showCorrectAnswers === 'true',
        // Question filters
        easyCount: form.easyCount ? parseInt(form.easyCount) : null,
        mediumCount: form.mediumCount ? parseInt(form.mediumCount) : null,
        hardCount: form.hardCount ? parseInt(form.hardCount) : null,
        questionTypeMix: form.questionTypeMix || null,
        filterTopics: form.filterTopics.trim() ? JSON.stringify(form.filterTopics.split(',').map(s => s.trim()).filter(Boolean)) : null,
        filterTags: form.filterTags.trim() ? JSON.stringify(form.filterTags.split(',').map(s => s.trim()).filter(Boolean)) : null,
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

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'questions', label: 'Questions' },
    { key: 'feedback', label: 'Feedback' },
    { key: 'content', label: 'Content' },
    { key: 'access', label: 'Access' },
    { key: 'certificate', label: 'Certificate' },
    { key: 'email', label: 'Email' },
  ]

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
          <div className="flex gap-1 border-b mb-4 flex-wrap">
            {tabs.map(({ key, label }) => (
              <button key={key} onClick={() => setSettingsTab(key)}
                className={`px-3 py-1.5 text-sm rounded-t capitalize border-b-2 transition-colors ${settingsTab === key ? 'border-primary text-primary font-medium' : 'border-transparent text-gray-500'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* General tab */}
          {settingsTab === 'general' && (
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
            </div>
          )}

          {/* Questions tab */}
          {settingsTab === 'questions' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Questions Per Attempt (blank = all)</Label>
                <Input type="number" min="1" value={form.questionsPerAttempt} onChange={e => setForm({ ...form, questionsPerAttempt: e.target.value })} />
              </div>
              <div className="space-y-2">
                {[
                  { key: 'randomizeQuestions', label: 'Randomize question order for each attempt' },
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

              {form.randomizeQuestions === 'false' && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    Fixed Questions for This Class
                    <span className="font-normal text-gray-400 ml-2">
                      ({form.fixedQuestionIds.length} selected
                      {form.questionsPerAttempt ? ` / max ${form.questionsPerAttempt}` : ''})
                    </span>
                  </Label>
                  <p className="text-xs text-gray-400">When randomize is off, you can select specific questions. All students in this class will get the same set.</p>
                  <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
                    {questions.filter(q => q.questionType !== 'TEXT_BLOCK').map(q => (
                      <div key={q.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                        <Checkbox
                          id={`q-${q.id}`}
                          checked={form.fixedQuestionIds.includes(q.id)}
                          onCheckedChange={c => {
                            if (c) {
                              const maxSelect = form.questionsPerAttempt ? parseInt(form.questionsPerAttempt) : undefined
                              if (maxSelect && form.fixedQuestionIds.length >= maxSelect) {
                                toast({ title: `Maximum ${maxSelect} questions allowed`, variant: 'destructive' })
                                return
                              }
                              setForm({ ...form, fixedQuestionIds: [...form.fixedQuestionIds, q.id] })
                            } else {
                              setForm({ ...form, fixedQuestionIds: form.fixedQuestionIds.filter(id => id !== q.id) })
                            }
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

              {/* Question Selection Filters */}
              <div className="border-t pt-3 mt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Question Selection Filters (optional)
                </p>
                <p className="text-xs text-gray-400 mb-3">
                  Leave blank to let the system auto-select. Fill in to enforce specific counts.
                </p>

                {/* Difficulty counts */}
                <div className="space-y-2 mb-3">
                  <Label className="text-sm">Questions by difficulty</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs text-gray-500">Easy</Label>
                      <Input type="number" min="0" placeholder="Auto"
                        value={form.easyCount}
                        onChange={e => setForm({ ...form, easyCount: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Medium</Label>
                      <Input type="number" min="0" placeholder="Auto"
                        value={form.mediumCount}
                        onChange={e => setForm({ ...form, mediumCount: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Hard</Label>
                      <Input type="number" min="0" placeholder="Auto"
                        value={form.hardCount}
                        onChange={e => setForm({ ...form, hardCount: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Question type mix */}
                <div className="space-y-1.5 mb-3">
                  <Label className="text-sm">Questions by type</Label>
                  <p className="text-xs text-gray-400">Set how many questions of each type to include. Leave 0 or blank to not restrict that type.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { type: 'MCQ', label: 'MCQ (single correct)' },
                      { type: 'MULTIPLE_RESPONSE', label: 'Multiple correct' },
                      { type: 'TRUE_FALSE', label: 'True / False' },
                      { type: 'FILL_BLANK', label: 'Fill in the blank' },
                      { type: 'SHORT_ANSWER', label: 'Short answer' },
                      { type: 'ESSAY', label: 'Essay' },
                    ].map(({ type, label }) => {
                      const mix: Record<string, string> = form.questionTypeMix ? (() => { try { return JSON.parse(form.questionTypeMix) } catch { return {} } })() : {}
                      return (
                        <div key={type} className="flex items-center gap-2">
                          <Label className="text-xs w-36 shrink-0">{label}</Label>
                          <Input
                            type="number" min="0" placeholder="—" className="h-7 text-xs"
                            value={mix[type] ?? ''}
                            onChange={e => {
                              const newMix = { ...mix }
                              if (e.target.value) newMix[type] = e.target.value
                              else delete newMix[type]
                              setForm({ ...form, questionTypeMix: Object.keys(newMix).length > 0 ? JSON.stringify(newMix) : '' })
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Topics filter */}
                <div className="space-y-1.5 mb-3">
                  <Label className="text-sm">Filter by Topics</Label>
                  <p className="text-xs text-gray-400">Only include questions matching these topics. Comma-separated.</p>
                  <Input
                    placeholder="e.g. Algebra, World War II, Cell Biology"
                    value={form.filterTopics}
                    onChange={e => setForm({ ...form, filterTopics: e.target.value })}
                  />
                </div>

                {/* Tags filter */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Filter by Tags</Label>
                  <p className="text-xs text-gray-400">Only include questions with these tags. Comma-separated.</p>
                  <Input
                    placeholder="e.g. math, grade10, equations"
                    value={form.filterTags}
                    onChange={e => setForm({ ...form, filterTags: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Feedback tab */}
          {settingsTab === 'feedback' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Per-question feedback</p>
                <p className="text-xs text-gray-500 mb-2">
                  In &quot;one at a time&quot; mode, choose what to show the student immediately after they answer each question.
                </p>
                <div className="space-y-2">
                  {[
                    { key: 'feedbackShowCorrect', label: 'Indicate if the student\'s response was correct or incorrect' },
                    { key: 'feedbackShowAnswer', label: 'Display the correct answer' },
                    { key: 'feedbackShowExplanation', label: 'Show the explanation (if there is one)' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox id={key} checked={form[key as keyof typeof form] === 'true'}
                        onCheckedChange={c => setForm({ ...form, [key]: c ? 'true' : 'false' })} />
                      <Label htmlFor={key} className="font-normal text-sm">{label}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Results page</p>
                <p className="text-xs text-gray-500 mb-2">What to show students on the results screen after submission.</p>
                <div className="space-y-2">
                  {[
                    { key: 'showScore', label: 'Show the student their score' },
                    { key: 'showAnswers', label: 'Show the student their answers' },
                    { key: 'showCorrectAnswers', label: 'Show correct answers alongside student answers' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox id={`res-${key}`} checked={form[key as keyof typeof form] === 'true'}
                        onCheckedChange={c => setForm({ ...form, [key]: c ? 'true' : 'false' })} />
                      <Label htmlFor={`res-${key}`} className="font-normal text-sm">{label}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <Label>Pass message (shown when student passes)</Label>
                  <RichTextEditor
                    rows={2}
                    placeholder="Congratulations! You passed."
                    value={form.passMessage}
                    onChange={v => setForm({ ...form, passMessage: v })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fail message (shown when student fails)</Label>
                  <RichTextEditor
                    rows={2}
                    placeholder="You did not reach the passing score. Please try again."
                    value={form.failMessage}
                    onChange={v => setForm({ ...form, failMessage: v })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Content tab */}
          {settingsTab === 'content' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Introduction (shown before quiz starts)</Label>
                <RichTextEditor
                  rows={3}
                  placeholder="Welcome to this quiz. Read all questions carefully before answering."
                  value={form.introText}
                  onChange={v => setForm({ ...form, introText: v })}
                />
                <p className="text-xs text-gray-400">Supports **bold**, *italic*, [links](url), - bullet lists</p>
              </div>
              <div className="space-y-1.5">
                <Label>Conclusion Text (shown after submission)</Label>
                <RichTextEditor
                  rows={2}
                  placeholder="Thank you for completing this quiz."
                  value={form.conclusionText}
                  onChange={v => setForm({ ...form, conclusionText: v })}
                />
              </div>
            </div>
          )}

          {/* Access tab */}
          {settingsTab === 'access' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox id="requireLogin" checked={form.requireLogin === 'true'}
                  onCheckedChange={c => setForm({ ...form, requireLogin: c ? 'true' : 'false' })} />
                <Label htmlFor="requireLogin" className="font-normal">Require students to log in before taking this quiz</Label>
              </div>
              <p className="text-xs text-gray-400">When unchecked, anyone with the class link can take the quiz as a guest.</p>
              <div className="space-y-1.5">
                <Label>Who can take this class</Label>
                <Select value={form.accessType} onValueChange={v => setForm({ ...form, accessType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PUBLIC">Anyone (public)</SelectItem>
                    <SelectItem value="PASSCODE">Anyone with passcode</SelectItem>
                    <SelectItem value="PRIVATE">Private (login required)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.accessType === 'PASSCODE' && (
                <div className="space-y-1.5">
                  <Label>Passcode</Label>
                  <Input placeholder="Enter passcode..." value={form.passcode} onChange={e => setForm({ ...form, passcode: e.target.value })} />
                </div>
              )}
            </div>
          )}

          {/* Certificate tab */}
          {settingsTab === 'certificate' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox id="certificateEnabled" checked={form.certificateEnabled === 'true'}
                  onCheckedChange={c => setForm({ ...form, certificateEnabled: c ? 'true' : 'false' })} />
                <Label htmlFor="certificateEnabled" className="font-normal">
                  Issue a certificate upon quiz completion (when student passes)
                </Label>
              </div>

              {form.certificateEnabled === 'true' && (
                <div className="space-y-4 pl-4 border-l-2 border-primary/30">
                  <div className="space-y-1.5">
                    <Label>Certificate Title</Label>
                    <Input
                      placeholder="Certificate of Completion"
                      value={form.certificateTitle}
                      onChange={e => setForm({ ...form, certificateTitle: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Certificate Message</Label>
                    <RichTextEditor
                      rows={3}
                      placeholder="This is to certify that {name} has successfully completed {quiz}."
                      value={form.certificateMessage}
                      onChange={v => setForm({ ...form, certificateMessage: v })}
                    />
                    <p className="text-xs text-gray-500">
                      Use <code className="bg-gray-100 px-1 rounded">{'{name}'}</code> for student name and{' '}
                      <code className="bg-gray-100 px-1 rounded">{'{quiz}'}</code> for quiz title.
                    </p>
                  </div>

                  <div className="pt-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-3">
                      <Palette className="h-3.5 w-3.5" /> Certificate Design
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Border / Accent Color</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={form.certificateBorderColor}
                            onChange={e => setForm({ ...form, certificateBorderColor: e.target.value })}
                            className="h-9 w-12 rounded border border-input cursor-pointer p-0.5"
                          />
                          <Input
                            value={form.certificateBorderColor}
                            onChange={e => setForm({ ...form, certificateBorderColor: e.target.value })}
                            className="h-9 flex-1 font-mono text-sm"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Certificate Font</Label>
                        <Select value={form.certificateFont} onValueChange={v => setForm({ ...form, certificateFont: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Georgia">Georgia (Classic)</SelectItem>
                            <SelectItem value="Times New Roman">Times New Roman (Formal)</SelectItem>
                            <SelectItem value="Palatino Linotype">Palatino (Elegant)</SelectItem>
                            <SelectItem value="Arial">Arial (Modern)</SelectItem>
                            <SelectItem value="Garamond">Garamond (Literary)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Issuer Name (signature line)</Label>
                        <Input
                          placeholder="e.g. John Smith"
                          value={form.certificateIssuerName}
                          onChange={e => setForm({ ...form, certificateIssuerName: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Issuer Title</Label>
                        <Input
                          placeholder="e.g. Course Director"
                          value={form.certificateIssuerTitle}
                          onChange={e => setForm({ ...form, certificateIssuerTitle: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2 mt-3">
                      {[
                        { key: 'certificateShowScore', label: 'Show student score on certificate' },
                        { key: 'certificateShowDate', label: 'Show issue date on certificate' },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center gap-2">
                          <Checkbox id={key} checked={form[key as keyof typeof form] === 'true'}
                            onCheckedChange={c => setForm({ ...form, [key]: c ? 'true' : 'false' })} />
                          <Label htmlFor={key} className="font-normal text-sm">{label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Email tab */}
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
