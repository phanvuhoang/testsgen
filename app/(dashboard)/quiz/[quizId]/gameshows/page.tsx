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
import { Loader2, Plus, Trash2, ExternalLink, Copy, Gamepad2, Pencil, BarChart2, ChevronDown, ChevronUp, Square, Download } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ImagePicker } from '@/components/ui/image-picker'

type GameshowType = 'WWTBAM' | 'KAHOOT' | 'JEOPARDY' | 'SPINWHEEL'
type PlayMode = 'SINGLE' | 'LOCAL' | 'ONLINE' | 'BUZZ'
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
  buzzButton: boolean
  manualScoring: boolean
  betEnabled: boolean
  betTimes: number
  betMultiple: number
  betWrongAnswer: string
  shortLink: string | null
  coverImage?: string | null
  categoryNames?: string | null
  jeopardyTags?: string | null
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
  SPINWHEEL: '🎡 Spin Wheel',
}

const TYPE_COLORS: Record<GameshowType, string> = {
  WWTBAM: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  KAHOOT: 'bg-purple-50 border-purple-200 text-purple-800',
  JEOPARDY: 'bg-blue-50 border-blue-200 text-blue-800',
  SPINWHEEL: 'bg-pink-50 border-pink-200 text-pink-800',
}

const PLAY_MODE_LABELS: Record<PlayMode, string> = {
  SINGLE: 'Single Player',
  LOCAL: 'Local Multiplayer',
  ONLINE: 'Online Multiplayer',
  BUZZ: 'Buzz — First to Answer',
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
  buzzButton: 'false',
  manualScoring: 'false',
  betEnabled: 'false',
  betTimes: '1',
  betMultiple: '2',
  betWrongAnswer: 'NO_DEDUCTION',
  shortLink: '',
  coverImage: '',
  categoryNames: '[]',
  jeopardyTags: '{}',
  // SpinWheel settings
  wheelSegments: '8',
  wheelMinPoints: '100',
  wheelMaxPoints: '1000',
  wheelDeductOnWrong: 'false',
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
  const [analyticsGameshow, setAnalyticsGameshow] = useState<Gameshow | null>(null)
  const [analyticsData, setAnalyticsData] = useState<any>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(new Set())
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null)
  const [exportingSessionId, setExportingSessionId] = useState<string | null>(null)

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
      buzzButton: String((g as any).buzzButton ?? false),
      manualScoring: String(g.manualScoring ?? false),
      betEnabled: String((g as any).betEnabled ?? false),
      betTimes: String((g as any).betTimes ?? 1),
      betMultiple: String((g as any).betMultiple ?? 2),
      betWrongAnswer: (g as any).betWrongAnswer ?? 'NO_DEDUCTION',
      shortLink: g.shortLink ?? '',
      coverImage: g.coverImage ?? '',
      categoryNames: g.categoryNames ?? '[]',
      jeopardyTags: g.jeopardyTags ?? '{}',
      wheelSegments: String((g as any).wheelSegments ?? 8),
      wheelMinPoints: String((g as any).wheelMinPoints ?? 100),
      wheelMaxPoints: String((g as any).wheelMaxPoints ?? 1000),
      wheelDeductOnWrong: String((g as any).wheelDeductOnWrong ?? false),
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
        buzzButton: (form as any).buzzButton === 'true',
        manualScoring: (form as any).manualScoring === 'true',
        betEnabled: (form as any).betEnabled === 'true',
        betTimes: parseInt((form as any).betTimes) || 1,
        betMultiple: parseFloat((form as any).betMultiple) || 2.0,
        betWrongAnswer: (form as any).betWrongAnswer || 'NO_DEDUCTION',
        shortLink: (form as any).shortLink?.trim() || null,
        coverImage: (form as any).coverImage?.trim() || null,
        categoryNames: (form as any).categoryNames || '[]',
        jeopardyTags: (form as any).jeopardyTags || '{}',
        wheelSegments: parseInt((form as any).wheelSegments) || 8,
        wheelMinPoints: parseInt((form as any).wheelMinPoints) || 100,
        wheelMaxPoints: parseInt((form as any).wheelMaxPoints) || 1000,
        wheelDeductOnWrong: (form as any).wheelDeductOnWrong === 'true',
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

  const deleteAnalyticsSession = async (sessionId: string) => {
    if (!confirm('Delete this session? This cannot be undone.')) return
    setDeletingSessionId(sessionId)
    try {
      const res = await fetch(`/api/gameshow/analytics/session/${sessionId}`, { method: 'DELETE' })
      if (res.ok) {
        setAnalyticsData((prev: any) => prev ? {
          ...prev,
          sessions: prev.sessions.filter((s: any) => s.sessionId !== sessionId),
          total: prev.total - 1,
        } : prev)
      }
    } catch {}
    setDeletingSessionId(null)
  }

  const endAnalyticsSession = async (session: any) => {
    if (!analyticsGameshow) return
    setEndingSessionId(session.sessionId)
    try {
      const res = await fetch(`/api/gameshow/${analyticsGameshow.shareCode}/session/${session.roomCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'FINISHED', gameState: { phase: 'gameover' } }),
      })
      if (res.ok) {
        setAnalyticsData((prev: any) => prev ? {
          ...prev,
          sessions: prev.sessions.map((s: any) => s.sessionId === session.sessionId ? { ...s, status: 'FINISHED' } : s),
        } : prev)
      }
    } catch {}
    setEndingSessionId(null)
  }

  const exportSession = async (session: any) => {
    setExportingSessionId(session.sessionId)
    try {
      // Fetch question details
      const qRes = await fetch(`/api/quiz-sets/${params.quizId}/questions`)
      const allQs: any[] = qRes.ok ? await qRes.json() : []
      const qMap = new Map(allQs.map((q: any) => [q.id, q]))

      const rows: string[][] = []
      const players: any[] = [...(session.players ?? [])].sort((a: any, b: any) => b.score - a.score)

      // Header
      const playerCols = players.flatMap((p: any) => [p.nickname + ' (answer)', p.nickname + ' (result)', p.nickname + ' (pts)', p.nickname + ' (time)'])
      rows.push(['Question', 'Correct Answer', ...playerCols])

      // Gather all questionIds from all players
      const allQIds: string[] = []
      players.forEach((p: any) => {
        ;(p.answers ?? []).forEach((a: any) => { if (!allQIds.includes(a.questionId)) allQIds.push(a.questionId) })
      })

      allQIds.forEach(qId => {
        const q = qMap.get(qId)
        const questionText = q?.stem ?? qId
        const correctAnswer = q?.correctAnswer ?? ''
        const playerData = players.flatMap((p: any) => {
          const ans = (p.answers ?? []).find((a: any) => a.questionId === qId)
          if (!ans) return ['', '', '', '']
          const pts = ans.pointsEarned ?? ans.points ?? 0
          const ms = ans.responseTimeMs || ans.elapsedMs || 0
          const timeStr = ms ? `${(ms / 1000).toFixed(1)}s` : ''
          return [ans.answer ?? '', ans.correct ? 'Correct' : 'Wrong', String(pts), timeStr]
        })
        rows.push([questionText, correctAnswer, ...playerData])
      })

      // Summary row
      rows.push(['', 'TOTAL', ...players.flatMap((p: any) => ['', '', String(p.score), ''])])

      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `session-${session.roomCode}-results.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
    setExportingSessionId(null)
  }

  const openAnalytics = async (g: Gameshow) => {
    setAnalyticsGameshow(g)
    setAnalyticsData(null)
    setAnalyticsLoading(true)
    try {
      const res = await fetch(`/api/gameshow/analytics?gameshowId=${g.id}`)
      const data = await res.json()
      setAnalyticsData(data)
    } catch {}
    setAnalyticsLoading(false)
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
              {type === 'JEOPARDY' && 'Category board, point tiers, turn-based multiplayer'}
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
                    <Button size="sm" variant="outline" onClick={() => openAnalytics(g)} title="Analytics">
                      <BarChart2 className="h-3.5 w-3.5" />
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
                    <SelectItem value="SPINWHEEL">🎡 Spin Wheel — Spin to earn points</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Play Mode</Label>
                <Select value={form.playMode} onValueChange={v => { const m = v as PlayMode; setForm({ ...form, playMode: m, ...(m === 'BUZZ' ? { clickStartToCount: 'true' } : {}) }) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SINGLE">👤 Single Player — Solo quiz experience</SelectItem>
                    <SelectItem value="LOCAL">👥 Local Multiplayer — Multiple players, same device</SelectItem>
                    <SelectItem value="ONLINE">🌐 Online Multiplayer — Real-time, different devices</SelectItem>
                    <SelectItem value="BUZZ">⚡ Buzz — First to answer wins the question</SelectItem>
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
                {form.clickStartToCount === 'true' && (
                  <div className="ml-4 pl-3 border-l-2 border-gray-200 space-y-3">
                    <BoolCheckbox k="betEnabled" label="Bet — players can wager on questions" />
                    {(form as any).betEnabled === 'true' && (
                      <div className="space-y-3 pl-3 border-l-2 border-yellow-200">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Times — bets per player per session (≥ 1)</Label>
                          <Input type="number" min="1" value={(form as any).betTimes}
                            onChange={e => setForm({ ...form, betTimes: e.target.value } as any)}
                            className="h-7 text-xs w-24" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Multiple — points multiplier when correct (e.g. 2 = double)</Label>
                          <Input type="number" min="1.1" step="0.5" value={(form as any).betMultiple}
                            onChange={e => setForm({ ...form, betMultiple: e.target.value } as any)}
                            className="h-7 text-xs w-24" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Wrong answer penalty</Label>
                          <Select value={(form as any).betWrongAnswer} onValueChange={v => setForm({ ...form, betWrongAnswer: v } as any)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NO_DEDUCTION" className="text-xs">No deduction — wrong bet costs nothing</SelectItem>
                              <SelectItem value="ONE_X" className="text-xs">1× deduction — lose base points</SelectItem>
                              <SelectItem value="MULTIPLE" className="text-xs">Multiple deduction — lose multiplied points</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {form.playMode === 'BUZZ' && <BoolCheckbox k="buzzButton" label="Buzz button — players press a dedicated Buzz button before choosing their answer" />}
                {form.playMode === 'LOCAL' && <BoolCheckbox k="manualScoring" label="Manual score adjustment — host adjusts points after each question" />}
                {(form.playMode === 'ONLINE' || form.playMode === 'BUZZ' || form.playMode === 'LOCAL') && (
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

              {/* SpinWheel-specific */}
              {form.type === 'SPINWHEEL' && (
                <div className="space-y-3 pt-2 border-t">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Spin Wheel Settings</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Wheel segments</Label>
                      <Input type="number" min="4" max="20"
                        value={(form as any).wheelSegments}
                        onChange={e => setForm({ ...form, wheelSegments: e.target.value } as any)}
                        className="h-7 text-xs" />
                      <p className="text-xs text-gray-400">Default = no. of questions</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Min points per segment</Label>
                      <Input type="number" min="10" step="10"
                        value={(form as any).wheelMinPoints}
                        onChange={e => setForm({ ...form, wheelMinPoints: e.target.value } as any)}
                        className="h-7 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Max points per segment</Label>
                      <Input type="number" min="10" step="50"
                        value={(form as any).wheelMaxPoints}
                        onChange={e => setForm({ ...form, wheelMaxPoints: e.target.value } as any)}
                        className="h-7 text-xs" />
                    </div>
                  </div>
                  <BoolCheckbox k="wheelDeductOnWrong" label="Deduct spun points on wrong answer (players can go negative)" />
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
                  {/* Category names — only for Jeopardy */}
                  {form.type === 'JEOPARDY' && (
                    <div className="space-y-2">
                      <Label className="text-xs">Category Names</Label>
                      {Array.from({ length: parseInt(form.categoriesCount) || 5 }).map((_, i) => {
                        let names: string[] = []
                        try { names = JSON.parse((form as any).categoryNames || '[]') } catch {}
                        const val = names[i] || `Category ${i + 1}`
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-20">Category {i + 1}</span>
                            <Input
                              value={val}
                              onChange={e => {
                                let arr: string[] = []
                                try { arr = JSON.parse((form as any).categoryNames || '[]') } catch {}
                                arr = [...arr]
                                arr[i] = e.target.value
                                setForm({ ...form, categoryNames: JSON.stringify(arr) } as any)
                              }}
                              className="h-7 text-xs"
                              placeholder={`Category ${i + 1}`}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Answer reveal time (seconds)</Label>
                    <Input type="number" min="2" max="15" value={form.answerRevealSeconds}
                      onChange={e => setForm({ ...form, answerRevealSeconds: e.target.value })} />
                  </div>
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
                            {form.type === 'JEOPARDY' && (() => {
                              let tags: Record<string, {category: number, tier: number}> = {}
                              try { tags = JSON.parse((form as any).jeopardyTags || '{}') } catch {}
                              const tag = tags[q.id] || { category: 1, tier: 1 }
                              return (
                                <div className="flex gap-1 ml-2">
                                  <Select value={String(tag.category)} onValueChange={v => {
                                    let t: Record<string, any> = {}; try { t = JSON.parse((form as any).jeopardyTags || '{}') } catch {}
                                    t[q.id] = { ...tag, category: Number(v) }
                                    setForm({ ...form, jeopardyTags: JSON.stringify(t) } as any)
                                  }}>
                                    <SelectTrigger className="h-6 w-24 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {Array.from({ length: parseInt(form.categoriesCount) || 5 }, (_, i) => {
                                        let names: string[] = []; try { names = JSON.parse((form as any).categoryNames || '[]') } catch {}
                                        return <SelectItem key={i+1} value={String(i+1)} className="text-xs">{names[i] || `Cat ${i+1}`}</SelectItem>
                                      })}
                                    </SelectContent>
                                  </Select>
                                  <Select value={String(tag.tier)} onValueChange={v => {
                                    let t: Record<string, any> = {}; try { t = JSON.parse((form as any).jeopardyTags || '{}') } catch {}
                                    t[q.id] = { ...tag, tier: Number(v) }
                                    setForm({ ...form, jeopardyTags: JSON.stringify(t) } as any)
                                  }}>
                                    <SelectTrigger className="h-6 w-20 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {Array.from({ length: parseInt(form.tiersPerCategory) || 5 }, (_, i) => (
                                        <SelectItem key={i+1} value={String(i+1)} className="text-xs">Tier {i+1}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )
                            })()}
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
              <div className="space-y-1.5 pt-2 border-t">
                <Label>Cover Image <span className="text-gray-400 font-normal text-xs">(shown on lobby/waiting screen)</span></Label>
                <ImagePicker
                  value={(form as any).coverImage || undefined}
                  onChange={(url) => setForm({ ...form, coverImage: url ?? '' } as any)}
                />
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

      {/* Analytics Dialog */}
      {analyticsGameshow && (
        <Dialog open={!!analyticsGameshow} onOpenChange={open => !open && setAnalyticsGameshow(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-[#028a39]" />
                Analytics — {analyticsGameshow.name}
              </DialogTitle>
            </DialogHeader>
            {analyticsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : !analyticsData || analyticsData.total === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No sessions yet</p>
                <p className="text-sm mt-1">Analytics data will appear here after the first game session.</p>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-black text-[#028a39]">{analyticsData.total}</div>
                    <div className="text-xs text-gray-500 mt-1">Sessions</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-black text-[#028a39]">
                      {analyticsData.sessions?.reduce((s: number, ses: any) => s + (ses.players?.length ?? 0), 0) ?? 0}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Total Players</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-black text-[#028a39]">
                      {(() => {
                        const allPlayers = analyticsData.sessions?.flatMap((s: any) => s.players ?? []) ?? []
                        const total = allPlayers.reduce((s: number, p: any) => s + (p.correctCount ?? 0) + (p.wrongCount ?? 0), 0)
                        const correct = allPlayers.reduce((s: number, p: any) => s + (p.correctCount ?? 0), 0)
                        return total > 0 ? `${Math.round(correct / total * 100)}%` : '—'
                      })()}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Accuracy</div>
                  </div>
                </div>
                {(analyticsData.sessions ?? []).map((session: any, si: number) => (
                  <div key={session.sessionId} className="border rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b flex-wrap">
                      <span className="font-semibold text-sm">Session {si + 1}</span>
                      <span className="text-xs text-gray-400 font-mono">{session.roomCode}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${session.status === 'FINISHED' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>{session.status}</span>
                      <span className="text-xs text-gray-400 ml-auto">{new Date(session.createdAt).toLocaleDateString('vi-VN')} {new Date(session.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
                      {session.status !== 'FINISHED' && (
                        <Button
                          size="sm" variant="ghost"
                          className="h-6 text-xs text-orange-500 hover:text-orange-700 hover:bg-orange-50 ml-1"
                          disabled={endingSessionId === session.sessionId}
                          onClick={() => endAnalyticsSession(session)}
                        >
                          {endingSessionId === session.sessionId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
                          <span className="ml-1">End</span>
                        </Button>
                      )}
                      <Button
                        size="sm" variant="ghost"
                        className="h-6 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                        disabled={exportingSessionId === session.sessionId}
                        onClick={() => exportSession(session)}
                      >
                        {exportingSessionId === session.sessionId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                        <span className="ml-1">Export</span>
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="h-6 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 ml-1"
                        disabled={deletingSessionId === session.sessionId}
                        onClick={() => deleteAnalyticsSession(session.sessionId)}
                      >
                        {deletingSessionId === session.sessionId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        <span className="ml-1">Delete</span>
                      </Button>
                    </div>
                    {session.players && session.players.length > 0 ? (
                      <div className="divide-y">
                        {[...session.players].sort((a: any, b: any) => b.score - a.score).map((p: any, rank: number) => {
                          const pKey = `${session.sessionId}-${p.nickname}`
                          const isExpanded = expandedPlayers.has(pKey)
                          const answers: any[] = p.answers ?? []
                          return (
                            <div key={rank}>
                              <div className="flex items-center gap-3 px-4 py-2">
                                <span className="text-sm font-bold text-gray-400 w-6">#{rank + 1}</span>
                                <span className="font-medium text-sm flex-1">{p.nickname}</span>
                                <span className="text-xs text-gray-500">{p.correctCount}✓ {p.wrongCount}✗</span>
                                <span className="font-bold text-[#028a39] text-sm">{p.score} pts</span>
                                {answers.length > 0 && (
                                  <Button
                                    variant="ghost" size="icon" className="h-6 w-6"
                                    onClick={() => setExpandedPlayers(prev => {
                                      const s = new Set(prev)
                                      s.has(pKey) ? s.delete(pKey) : s.add(pKey)
                                      return s
                                    })}
                                  >
                                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                  </Button>
                                )}
                              </div>
                              {isExpanded && answers.length > 0 && (
                                <div className="px-4 pb-3 bg-gray-50/50">
                                  <table className="w-full text-xs border-collapse">
                                    <thead>
                                      <tr className="text-gray-500">
                                        <th className="text-left py-1 pr-2 font-medium">Q#</th>
                                        <th className="text-left py-1 pr-2 font-medium">Answer</th>
                                        <th className="text-center py-1 pr-2 font-medium">Result</th>
                                        <th className="text-right py-1 pr-2 font-medium">Points</th>
                                        <th className="text-right py-1 font-medium">Time</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {answers.map((ans: any, ai: number) => (
                                        <tr key={ai} className="border-t border-gray-100">
                                          <td className="py-1 pr-2 text-gray-400">Q{ai + 1}</td>
                                          <td className="py-1 pr-2 max-w-[120px] truncate" title={ans.answer ?? ''}>{ans.answer ?? '—'}</td>
                                          <td className="py-1 pr-2 text-center">{ans.correct ? <span className="text-green-600 font-bold">✓</span> : <span className="text-red-500 font-bold">✗</span>}</td>
                                          <td className="py-1 pr-2 text-right text-[#028a39] font-medium">+{ans.pointsEarned ?? ans.points ?? 0}</td>
                                          <td className="py-1 text-right text-gray-400">{(ans.responseTimeMs || ans.elapsedMs) ? `${((ans.responseTimeMs || ans.elapsedMs) / 1000).toFixed(1)}s` : '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-sm text-gray-400">No players recorded</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

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
