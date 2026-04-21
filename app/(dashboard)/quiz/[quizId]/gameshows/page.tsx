'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/use-toast'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Loader2, Plus, Trash2, ExternalLink, Copy, Gamepad2, Pencil, BarChart2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type GameshowType = 'WWTBAM' | 'KAHOOT' | 'JEOPARDY'
type PlayMode = 'SINGLE' | 'LOCAL' | 'ONLINE'
type SelectionMode = 'LINEAR' | 'FREE_CHOICE'
type ScoringMode = 'SPEED_ACCURACY' | 'ACCURACY_ONLY'

type Gameshow = {
  id: string
  name: string
  description: string | null
  shareCode: string
  type: GameshowType
  playMode: PlayMode
  selectionMode: SelectionMode
  scoringMode: ScoringMode
  questionsCount: number | null
  fixedQuestionIds: string | null
  timeLimitSeconds: number
  enableLifelines: boolean
  enableStreak: boolean
  streakBonus: number
  categoriesCount: number
  tiersPerCategory: number
  maxPlayers: number
  requireLogin: boolean
  shuffleQuestions: boolean
  showLeaderboard: boolean
  clickStartToCount: boolean
  buzzerMode: boolean
  shortLink: string | null
  createdAt: string
  _count?: { sessions: number }
}

type QuizQuestion = {
  id: string
  stem: string
  questionType: string
  difficulty: string
  topic: string | null
}

const TYPE_LABELS: Record<GameshowType, string> = {
  WWTBAM: '🏆 Who Wants to be a Millionaire',
  KAHOOT: '🎮 Kahoot',
  JEOPARDY: '📋 Jeopardy',
}

const TYPE_COLORS: Record<GameshowType, string> = {
  WWTBAM: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  KAHOOT: 'bg-purple-50 border-purple-200 text-purple-800',
  JEOPARDY: 'bg-blue-50 border-blue-200 text-blue-800',
}

const PLAY_MODE_LABELS: Record<PlayMode, string> = {
  SINGLE: 'Single Player',
  LOCAL: 'Local Multiplayer',
  ONLINE: 'Online Multiplayer',
}

const emptyForm = {
  name: '',
  description: '',
  type: 'KAHOOT' as GameshowType,
  playMode: 'SINGLE' as PlayMode,
  selectionMode: 'LINEAR' as SelectionMode,
  scoringMode: 'SPEED_ACCURACY' as ScoringMode,
  questionsCount: '10',
  questionSelectionMode: 'RANDOM' as 'RANDOM' | 'FIXED',
  timeLimitSeconds: '20',
  answerRevealSeconds: '4',
  responseSeconds: '10',
  enableLifelines: 'true',
  enableStreak: 'true',
  streakBonus: '50',
  categoriesCount: '5',
  tiersPerCategory: '5',
  maxPlayers: '10',
  requireLogin: 'false',
  shuffleQuestions: 'true',
  showLeaderboard: 'true',
  clickStartToCount: 'false',
  buzzerMode: 'false',
  shortLink: '',
}

export default function GameshowsPage() {
  const params = useParams()
  const { toast } = useToast()
  const [gameshows, setGameshows] = useState<Gameshow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingGameshow, setEditingGameshow] = useState<Gameshow | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [isSaving, setIsSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [settingsTab, setSettingsTab] = useState('general')
  const [allQuestions, setAllQuestions] = useState<QuizQuestion[]>([])
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(false)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/quiz-sets/${params.quizId}/gameshows`)
      if (res.ok) setGameshows(await res.json())
    } catch (err) {
      toast({ title: 'Failed to load gameshows', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const fetchQuestions = async () => {
    if (allQuestions.length > 0) return // already loaded
    setLoadingQuestions(true)
    try {
      const res = await fetch(`/api/quiz-sets/${params.quizId}/questions`)
      if (res.ok) {
        const data = await res.json()
        setAllQuestions(Array.isArray(data) ? data : (data.questions ?? []))
      }
    } catch {}
    setLoadingQuestions(false)
  }

  const openNew = () => {
    setEditingGameshow(null)
    setForm({ ...emptyForm })
    setSelectedQuestionIds([])
    setSettingsTab('general')
    setDialogOpen(true)
    fetchQuestions()
  }

  const openEdit = (g: Gameshow) => {
    setEditingGameshow(g)
    let fixedIds: string[] = []
    try { if (g.fixedQuestionIds) fixedIds = JSON.parse(g.fixedQuestionIds) } catch {}
    setSelectedQuestionIds(fixedIds)
    setForm({
      name: g.name,
      description: g.description ?? '',
      type: g.type,
      playMode: g.playMode,
      selectionMode: g.selectionMode,
      scoringMode: g.scoringMode,
      questionsCount: g.questionsCount?.toString() ?? '',
      questionSelectionMode: fixedIds.length > 0 ? 'FIXED' : 'RANDOM',
      timeLimitSeconds: g.timeLimitSeconds.toString(),
      answerRevealSeconds: '4',
      responseSeconds: '10',
      enableLifelines: String(g.enableLifelines),
      enableStreak: String(g.enableStreak),
      streakBonus: g.streakBonus.toString(),
      categoriesCount: g.categoriesCount.toString(),
      tiersPerCategory: g.tiersPerCategory.toString(),
      maxPlayers: g.maxPlayers.toString(),
      requireLogin: String(g.requireLogin),
      shuffleQuestions: String(g.shuffleQuestions),
      showLeaderboard: String((g as any).showLeaderboard ?? true),
      clickStartToCount: String(g.clickStartToCount ?? false),
      buzzerMode: String(g.buzzerMode ?? false),
      shortLink: g.shortLink ?? '',
    })
    setSettingsTab('general')
    setDialogOpen(true)
    fetchQuestions()
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' })
      return
    }
    setIsSaving(true)
    try {
      const isFixed = form.questionSelectionMode === 'FIXED' && selectedQuestionIds.length > 0
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        type: form.type,
        playMode: form.playMode,
        selectionMode: form.selectionMode,
        scoringMode: form.scoringMode,
        questionsCount: isFixed ? selectedQuestionIds.length : (form.questionsCount ? parseInt(form.questionsCount) : null),
        fixedQuestionIds: isFixed ? JSON.stringify(selectedQuestionIds) : null,
        timeLimitSeconds: parseInt(form.timeLimitSeconds),
        answerRevealSeconds: parseInt(form.answerRevealSeconds),
        responseSeconds: parseInt(form.responseSeconds),
        enableLifelines: form.enableLifelines === 'true',
        enableStreak: form.enableStreak === 'true',
        streakBonus: parseInt(form.streakBonus),
        categoriesCount: parseInt(form.categoriesCount),
        tiersPerCategory: parseInt(form.tiersPerCategory),
        maxPlayers: parseInt(form.maxPlayers),
        requireLogin: form.requireLogin === 'true',
        shuffleQuestions: form.shuffleQuestions === 'true',
        showLeaderboard: form.showLeaderboard === 'true',
        clickStartToCount: form.clickStartToCount === 'true',
        buzzerMode: (form as any).buzzerMode === 'true',
        shortLink: (form as any).shortLink?.trim() || null,
      }

      let res: Response
      if (editingGameshow) {
        res = await fetch(`/api/quiz-sets/${params.quizId}/gameshows/${editingGameshow.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch(`/api/quiz-sets/${params.quizId}/gameshows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) throw new Error('Save failed')
      await fetchData()
      setDialogOpen(false)
      toast({ title: editingGameshow ? 'Gameshow updated' : 'Gameshow created' })
    } catch (err) {
      toast({ title: 'Failed to save', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/quiz-sets/${params.quizId}/gameshows/${deleteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      await fetchData()
      setDeleteId(null)
      toast({ title: 'Gameshow deleted' })
    } catch {
      toast({ title: 'Failed to delete', variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  const copyLink = (shareCode: string) => {
    const url = `${window.location.origin}/gameshow/${shareCode}`
    navigator.clipboard.writeText(url)
    toast({ title: 'Link copied!' })
  }

  const BoolCheckbox = ({ k, label }: { k: string; label: string }) => (
    <div className="flex items-center gap-2">
      <Checkbox
        id={k}
        checked={form[k as keyof typeof form] === 'true'}
        onCheckedChange={c => setForm({ ...form, [k]: c ? 'true' : 'false' })}
      />
      <Label htmlFor={k} className="font-normal text-sm">{label}</Label>
    </div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gamepad2 className="h-6 w-6 text-[#028a39]" />
            Gameshows
          </h1>
          <p className="text-sm text-gray-500 mt-1">Create interactive gameshow experiences from your quiz questions</p>
        </div>
        <Button onClick={openNew} className="bg-[#028a39] hover:bg-[#026d2e] text-white gap-2">
          <Plus className="h-4 w-4" /> New Gameshow
        </Button>
      </div>

      {/* Game type cards explanation */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {(['KAHOOT', 'WWTBAM', 'JEOPARDY'] as GameshowType[]).map(type => (
          <div key={type} className={`rounded-lg border p-3 ${TYPE_COLORS[type]}`}>
            <div className="font-semibold text-sm">{TYPE_LABELS[type]}</div>
            <div className="text-xs mt-1 opacity-75">
              {type === 'KAHOOT' && 'Fast-paced color buttons, streaks, live leaderboard'}
              {type === 'WWTBAM' && 'Progressive difficulty, lifelines, dramatic reveals'}
              {type === 'JEOPARDY' && 'Category board, point tiers, buzzer competition'}
            </div>
          </div>
        ))}
      </div>

      {/* Gameshows list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : gameshows.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Gamepad2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No gameshows yet</p>
          <p className="text-sm mt-1">Create your first gameshow to engage students in a fun way</p>
          <Button onClick={openNew} className="mt-4 bg-[#028a39] hover:bg-[#026d2e] text-white">
            <Plus className="h-4 w-4 mr-2" /> Create Gameshow
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {gameshows.map(g => (
            <Card key={g.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{g.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_COLORS[g.type]}`}>
                        {TYPE_LABELS[g.type]}
                      </span>
                      <Badge variant="outline" className="text-xs">{PLAY_MODE_LABELS[g.playMode]}</Badge>
                    </div>
                    {g.description && <p className="text-sm text-gray-500 mt-1 truncate">{g.description}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>{g.questionsCount ? `${g.questionsCount} questions` : 'All questions'}</span>
                      <span>⏱ {g.timeLimitSeconds}s/question</span>
                      {g.playMode !== 'SINGLE' && <span>👥 Up to {g.maxPlayers} players</span>}
                      {g._count && <span>🎮 {g._count.sessions} sessions played</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm" variant="outline"
                      onClick={() => copyLink(g.shareCode)}
                      title="Copy game link"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button asChild size="sm" variant="outline" title="Open game">
                      <a href={`/gameshow/${g.shareCode}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(g)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => setDeleteId(g.id)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingGameshow ? 'Edit Gameshow' : 'New Gameshow'}</DialogTitle>
          </DialogHeader>

          <Tabs value={settingsTab} onValueChange={setSettingsTab}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="gameplay">Gameplay</TabsTrigger>
              <TabsTrigger value="questions">Questions</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            {/* General Tab */}
            <TabsContent value="general" className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Science Quiz Kahoot" />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
              </div>
              <div className="space-y-1.5">
                <Label>Game Style</Label>
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as GameshowType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KAHOOT">🎮 Kahoot — Fast-paced color buttons</SelectItem>
                    <SelectItem value="WWTBAM">🏆 Who Wants to Be a Millionaire</SelectItem>
                    <SelectItem value="JEOPARDY">📋 Jeopardy — Category board</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Play Mode</Label>
                <Select value={form.playMode} onValueChange={v => setForm({ ...form, playMode: v as PlayMode })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SINGLE">👤 Single Player — Solo quiz experience</SelectItem>
                    <SelectItem value="LOCAL">👥 Local Multiplayer — Multiple players, same device</SelectItem>
                    <SelectItem value="ONLINE">🌐 Online Multiplayer — Real-time, different devices</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Question Order</Label>
                <Select value={form.selectionMode} onValueChange={v => setForm({ ...form, selectionMode: v as SelectionMode })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LINEAR">📶 Linear — Q1 → Q2 → Q3 in order</SelectItem>
                    <SelectItem value="FREE_CHOICE">🎯 Free Choice — Player selects next question</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* Gameplay Tab */}
            <TabsContent value="gameplay" className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label>Scoring Mode</Label>
                <Select value={form.scoringMode} onValueChange={v => setForm({ ...form, scoringMode: v as ScoringMode })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SPEED_ACCURACY">⚡ Speed + Accuracy — Faster = more points</SelectItem>
                    <SelectItem value="ACCURACY_ONLY">🎯 Accuracy Only — Flat points for correct</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Timer per question (seconds)</Label>
                <div className="flex gap-2 flex-wrap">
                  {['10', '20', '30', '45', '60', '90'].map(s => (
                    <Button key={s} size="sm" variant={form.timeLimitSeconds === s ? 'default' : 'outline'}
                      className={form.timeLimitSeconds === s ? 'bg-[#028a39] text-white' : ''}
                      onClick={() => setForm({ ...form, timeLimitSeconds: s })}>
                      {s}s
                    </Button>
                  ))}
                </div>
                <Input
                  type="number" min="5" max="300"
                  value={form.timeLimitSeconds}
                  onChange={e => setForm({ ...form, timeLimitSeconds: e.target.value })}
                  placeholder="Custom (seconds)"
                />
              </div>
              <div className="space-y-2 pt-2 border-t">
                <BoolCheckbox k="shuffleQuestions" label="Shuffle question order" />
                <BoolCheckbox k="showLeaderboard" label="Show leaderboard after each question (top 10 players)" />
                <BoolCheckbox k="clickStartToCount" label="Click Start button to begin timer (wait before timing starts)" />
                {form.playMode === 'ONLINE' && <BoolCheckbox k="buzzerMode" label="Buzz mode — players race to press buzz button to answer first" />}
                {form.playMode !== 'SINGLE' && (
                  <div className="space-y-1.5">
                    <Label>Max players (up to 100)</Label>
                    <Input
                      type="number" min="2" max="100"
                      value={form.maxPlayers}
                      onChange={e => setForm({ ...form, maxPlayers: e.target.value })}
                      placeholder="e.g. 30"
                    />
                    <p className="text-xs text-gray-400">SSE polling handles ~50 concurrent players well; up to 100 is supported.</p>
                  </div>
                )}
              </div>

              {/* WWTBAM-specific */}
              {form.type === 'WWTBAM' && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">WWTBAM Settings</p>
                  <BoolCheckbox k="enableLifelines" label="Enable lifelines (50:50, Phone, Audience)" />
                </div>
              )}

              {/* Kahoot-specific */}
              {form.type === 'KAHOOT' && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Kahoot Settings</p>
                  <BoolCheckbox k="enableStreak" label="Enable streak bonus" />
                  {form.enableStreak === 'true' && (
                    <div className="space-y-1.5">
                      <Label>Streak bonus points per consecutive correct</Label>
                      <Input type="number" min="10" value={form.streakBonus} onChange={e => setForm({ ...form, streakBonus: e.target.value })} />
                    </div>
                  )}
                </div>
              )}

              {/* Jeopardy-specific */}
              {form.type === 'JEOPARDY' && (
                <div className="space-y-3 pt-2 border-t">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Jeopardy Board Settings</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Categories</Label>
                      <Select value={form.categoriesCount} onValueChange={v => setForm({ ...form, categoriesCount: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['3','4','5','6'].map(n => <SelectItem key={n} value={n}>{n} categories</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tiers per category</Label>
                      <Select value={form.tiersPerCategory} onValueChange={v => setForm({ ...form, tiersPerCategory: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['3','4','5','6'].map(n => <SelectItem key={n} value={n}>{n} tiers</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Answer reveal time (seconds)</Label>
                    <Input type="number" min="2" max="15" value={form.answerRevealSeconds}
                      onChange={e => setForm({ ...form, answerRevealSeconds: e.target.value })} />
                  </div>
                  {form.playMode !== 'SINGLE' && (
                    <div className="space-y-1.5">
                      <Label>Response time after buzz (seconds)</Label>
                      <Input type="number" min="5" max="30" value={form.responseSeconds}
                        onChange={e => setForm({ ...form, responseSeconds: e.target.value })} />
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Questions Tab */}
            <TabsContent value="questions" className="space-y-4 pt-4">
              <div className="space-y-3">
                <Label>Question Selection</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, questionSelectionMode: 'RANDOM' })}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      form.questionSelectionMode === 'RANDOM'
                        ? 'border-[#028a39] bg-green-50 text-[#028a39]'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold text-sm">🎲 Random</div>
                    <div className="text-xs text-gray-500 mt-0.5">Use all questions, shuffle if enabled</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, questionSelectionMode: 'FIXED' })}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      form.questionSelectionMode === 'FIXED'
                        ? 'border-[#028a39] bg-green-50 text-[#028a39]'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold text-sm">📌 Fixed Set</div>
                    <div className="text-xs text-gray-500 mt-0.5">Choose specific questions in order</div>
                  </button>
                </div>
              </div>

              {form.questionSelectionMode === 'FIXED' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Select Questions ({selectedQuestionIds.length} selected)</Label>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setSelectedQuestionIds(allQuestions.map(q => q.id))} className="text-xs h-7">
                        All
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSelectedQuestionIds([])} className="text-xs h-7">
                        None
                      </Button>
                    </div>
                  </div>
                  {loadingQuestions ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    </div>
                  ) : (
                    <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
                      {allQuestions.length === 0 ? (
                        <div className="text-center text-gray-400 text-sm py-6">No questions found</div>
                      ) : allQuestions.map((q, idx) => {
                        const checked = selectedQuestionIds.includes(q.id)
                        const order = selectedQuestionIds.indexOf(q.id)
                        return (
                          <label key={q.id} className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                            checked ? 'bg-green-50' : ''
                          }`}>
                            <Checkbox
                              checked={checked}
                              onCheckedChange={c => {
                                if (c) {
                                  setSelectedQuestionIds(prev => [...prev, q.id])
                                } else {
                                  setSelectedQuestionIds(prev => prev.filter(id => id !== q.id))
                                }
                              }}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {checked && (
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#028a39] text-white text-xs flex items-center justify-center font-bold">
                                    {order + 1}
                                  </span>
                                )}
                                <span className="text-sm font-medium leading-snug">{idx + 1}. {q.stem}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-gray-400">{q.questionType}</span>
                                <span className="text-xs text-gray-400">·</span>
                                <span className="text-xs text-gray-400">{q.difficulty}</span>
                                {q.topic && <><span className="text-xs text-gray-400">·</span><span className="text-xs text-gray-400">{q.topic}</span></>}
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  {selectedQuestionIds.length > 0 && (
                    <p className="text-xs text-gray-500">Questions will be played in the order selected (top = first).</p>
                  )}
                </div>
              )}

              {form.questionSelectionMode === 'RANDOM' && (
                <div className="space-y-1.5">
                  <Label>Number of questions (blank = all)</Label>
                  <Input
                    type="number" min="1"
                    value={form.questionsCount}
                    onChange={e => setForm({ ...form, questionsCount: e.target.value })}
                    placeholder="Use all questions"
                  />
                </div>
              )}
            </TabsContent>

            {/* Advanced Tab */}
            <TabsContent value="advanced" className="space-y-4 pt-4">
              <BoolCheckbox k="requireLogin" label="Require login to play" />
              <p className="text-xs text-gray-400">
                If enabled, players must be logged in. If disabled, anyone with the link can play as a guest.
              </p>
              <div className="space-y-1.5 pt-2 border-t">
                <Label>Short link (optional)</Label>
                <Input
                  value={(form as any).shortLink ?? ''}
                  onChange={e => setForm({ ...form, shortLink: e.target.value } as any)}
                  placeholder="e.g. https://s.example.com/abc123"
                />
                <p className="text-xs text-gray-400">If set, this URL is shown instead of the full game link and used for the QR code.</p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-[#028a39] hover:bg-[#026d2e] text-white">
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingGameshow ? 'Save Changes' : 'Create Gameshow'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Gameshow?</AlertDialogTitle>
            <AlertDialogDescription>This will delete the gameshow and all its session data. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700 text-white">
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
