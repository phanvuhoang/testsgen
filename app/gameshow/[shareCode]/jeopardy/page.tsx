'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Trophy, CheckCircle2, XCircle, ChevronRight, RotateCcw,
  Home, Zap, Volume2, VolumeX, QrCode, Play, LogOut,
} from 'lucide-react'
import QRCode from 'qrcode'
import { useAudio } from '../../useAudio'

// ─── Types ────────────────────────────────────────────────────────────────────
type Question = {
  id: string; stem: string; questionType: string; options: string[] | string | null
  correctAnswer: string; explanation: string | null; difficulty: string
  topic?: string | null; imageUrl?: string | null
}
type GameshowConfig = {
  id: string; shareCode: string; name: string; type: string
  playMode: 'SINGLE' | 'LOCAL' | 'ONLINE'; selectionMode: 'LINEAR' | 'FREE_CHOICE'
  scoringMode: 'SPEED_ACCURACY' | 'ACCURACY_ONLY'; questionsCount: number | null
  timeLimitSeconds: number; responseSeconds: number; answerRevealSeconds: number
  shuffleQuestions: boolean; showLeaderboard: boolean; maxPlayers: number
  categoriesCount: number; tiersPerCategory: number; tierPoints: string | null
  quizSetTitle: string; questions: Question[]
  clickStartToCount: boolean; manualScoring: boolean; shortLink: string | null
}
type Player = { id: string; nickname: string; avatarColor: string; score: number; correctCount: number; wrongCount: number }
type TileState = 'available' | 'answered'
type BoardTile = { questionId: string; category: string; points: number; state: TileState }
type Phase = 'setup' | 'board' | 'question' | 'buzzer' | 'respond' | 'reveal' | 'scoring' | 'linear_question' | 'leaderboard' | 'gameover'

// ─── Utilities ─────────────────────────────────────────────────────────────────
function parseOptions(q: Question): string[] {
  if (!q.options) return []
  if (Array.isArray(q.options)) return q.options as string[]
  if (typeof q.options === 'string') {
    try {
      const parsed = JSON.parse(q.options)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return (q.options as string).split('|')
    }
  }
  return []
}
function getCorrectAnswers(q: Question): string[] {
  return q.correctAnswer.split('||').map(s => s.trim()).filter(Boolean)
}
function normalize(s: string) {
  return s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const PLAYER_COLORS = ['#6366f1', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899']

// ─── Buzzer Button ─────────────────────────────────────────────────────────────
function BuzzerButton({ onClick, disabled, label = 'BUZZ IN' }: { onClick: () => void; disabled: boolean; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative w-36 h-36 rounded-full border-8 font-black text-xl transition-all select-none
        ${disabled
          ? 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed'
          : 'bg-red-500 border-red-700 text-white hover:bg-red-400 active:scale-95 active:bg-red-600 cursor-pointer shadow-[0_8px_0_#991b1b] hover:shadow-[0_6px_0_#991b1b] active:shadow-[0_2px_0_#991b1b] active:translate-y-1'
        }`}
    >
      {label}
    </button>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function JeopardyPage() {
  const params = useParams()
  const shareCode = params.shareCode as string

  const [config, setConfig] = useState<GameshowConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [phase, setPhase] = useState<Phase>('setup')
  const [questions, setQuestions] = useState<Question[]>([])
  const [board, setBoard] = useState<BoardTile[][]>([]) // [categoryIdx][tierIdx]
  const [categories, setCategories] = useState<string[]>([])
  const [tierPoints, setTierPoints] = useState<number[]>([10, 25, 50, 100, 200])

  // Current question state
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [currentTilePoints, setCurrentTilePoints] = useState(0)
  const [currentTileCategory, setCurrentTileCategory] = useState('')
  const [linearIdx, setLinearIdx] = useState(0)

  // Buzzer
  const [buzzOrder, setBuzzOrder] = useState<{ playerIdx: number; timeMs: number }[]>([])
  const [buzzerOpen, setBuzzerOpen] = useState(false)
  const [buzzerOpenTime, setBuzzerOpenTime] = useState(0)
  const [respondingPlayerIdx, setRespondingPlayerIdx] = useState<number | null>(null)
  const [responseTimeLeft, setResponseTimeLeft] = useState(10)

  // Answer
  const [textAnswer, setTextAnswer] = useState('')
  const [selectedMCQ, setSelectedMCQ] = useState<string | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [questionTimeLeft, setQuestionTimeLeft] = useState(30)
  const [timerRunning, setTimerRunning] = useState(false)

  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0)
  const [setupNames, setSetupNames] = useState([''])

  // Answered questions tracking for Free Choice
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set())
  const [scoringAdjustments, setScoringAdjustments] = useState<Record<string,number>>({})

  // QR code
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)

  // Audio
  const [musicEnabled, setMusicEnabled] = useState(true)
  const audio = useAudio(musicEnabled)
  const timeCountPlayedRef = useRef(false)
  const leaderboardTimerRef = useRef<NodeJS.Timeout | null>(null)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const isAnsweredRef = useRef(false)  // guards against timeout firing after answer
  const responseTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Music toggle button
  const MusicBtn = () => (
    <button
      onClick={() => setMusicEnabled(v => !v)}
      className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
      title={musicEnabled ? 'Mute music' : 'Unmute music'}
    >
      {musicEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
    </button>
  )

  // Fetch config
  useEffect(() => {
    fetch(`/api/gameshow/${shareCode}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        if (data.type !== 'JEOPARDY') { setError('This gameshow is not a Jeopardy game'); return }
        setConfig(data)
        setLoading(false)
        // Generate QR code for room join URL
        const joinUrl = data.shortLink || `${window.location.origin}/gameshow/${data.shareCode}`
        QRCode.toDataURL(joinUrl, { margin: 1, width: 200 }).then(setQrDataUrl).catch(() => {})
        // Play opening music
        audio.playBg('opening', 0.5)
      })
      .catch(() => setError('Failed to load gameshow'))
  }, [shareCode])

  // Build board from questions
  const buildBoard = (qs: Question[], cfg: GameshowConfig) => {
    const numCats = cfg.categoriesCount
    const numTiers = cfg.tiersPerCategory
    let points: number[] = [10, 25, 50, 100, 200]
    try { if (cfg.tierPoints) points = JSON.parse(cfg.tierPoints) } catch {}
    points = points.slice(0, numTiers)
    setTierPoints(points)

    const topicSet = new Set(qs.map(q => q.topic).filter(Boolean) as string[])
    const topicList = Array.from(topicSet)
    const catNames: string[] = []
    for (let i = 0; i < numCats; i++) {
      catNames.push(topicList[i] || `Category ${i + 1}`)
    }
    setCategories(catNames)

    const shuffledQs = shuffle(qs)
    const boardData: BoardTile[][] = catNames.map((cat, ci) =>
      points.map((pts, ti) => {
        const qIdx = ci * numTiers + ti
        const q = shuffledQs[qIdx % shuffledQs.length]
        return { questionId: q.id, category: cat, points: pts, state: 'available' as TileState }
      })
    )
    setBoard(boardData)
  }

  const startGame = () => {
    if (!config) return
    const names = setupNames.filter(n => n.trim())
    if (!names.length) return

    audio.stopAll()

    let qs = [...config.questions]
    if (config.shuffleQuestions) qs = shuffle(qs)
    if (config.questionsCount && config.questionsCount < qs.length) qs = qs.slice(0, config.questionsCount)
    setQuestions(qs)
    setAnsweredQuestions(new Set())

    const newPlayers: Player[] = names.map((n, i) => ({
      id: `p${i}`, nickname: n.trim() || `Player ${i + 1}`,
      avatarColor: PLAYER_COLORS[i % PLAYER_COLORS.length],
      score: 0, correctCount: 0, wrongCount: 0
    }))
    setPlayers(newPlayers)
    setCurrentPlayerIdx(0)
    setLinearIdx(0)

    if (config.selectionMode === 'FREE_CHOICE') {
      buildBoard(qs, config)
      setPhase('board')
      // Play selecting-question music on board
      audio.playBg('selecting', 0.5)
    } else {
      setPhase('linear_question')
      showLinearQuestion(qs, 0, config)
    }
  }

  const showLinearQuestion = useCallback((qs: Question[], idx: number, cfg?: GameshowConfig | null) => {
    const activeConfig = cfg || config
    const q = qs[idx]
    if (!q) { audio.stopAll(); setPhase('gameover'); return }
    isAnsweredRef.current = false
    setCurrentQuestion(q)
    const tpoints = tierPoints
    const pts = tpoints[Math.min(Math.floor(idx / Math.max(1, qs.length / tpoints.length)), tpoints.length - 1)] || 10
    setCurrentTilePoints(pts)
    setCurrentTileCategory('')
    setTextAnswer('')
    setSelectedMCQ(null)
    setIsCorrect(null)
    setBuzzOrder([])
    setRespondingPlayerIdx(null)
    timeCountPlayedRef.current = false
    const timeLimit = activeConfig?.timeLimitSeconds ?? 30
    setQuestionTimeLeft(timeLimit)

    if (activeConfig?.clickStartToCount) {
      setTimerRunning(false)
      audio.playBg('wait', 0.5)
      setPhase('linear_question')
    } else {
      if (activeConfig?.playMode !== 'SINGLE') {
        // Multiplayer linear: show question then open buzzer, timer NOT running yet
        setTimerRunning(false)
        setPhase('linear_question')
        openBuzzerPhase()
      } else {
        // Single player: start timer immediately
        audio.playBg('game-play', 0.55)
        setTimerRunning(true)
        setPhase('linear_question')
      }
    }
  }, [config, tierPoints])

  const selectBoardTile = (catIdx: number, tierIdx: number) => {
    const tile = board[catIdx]?.[tierIdx]
    if (!tile || tile.state !== 'available') return
    const q = questions.find(q => q.id === tile.questionId)
    if (!q) return
    isAnsweredRef.current = false
    setCurrentQuestion(q)
    setCurrentTilePoints(tile.points)
    setCurrentTileCategory(categories[catIdx])
    setTextAnswer('')
    setSelectedMCQ(null)
    setIsCorrect(null)
    setBuzzOrder([])
    setRespondingPlayerIdx(null)
    timeCountPlayedRef.current = false
    const timeLimit = config?.timeLimitSeconds ?? 30
    setQuestionTimeLeft(timeLimit)

    if (config?.clickStartToCount) {
      setTimerRunning(false)
      audio.playBg('wait', 0.5)
      // Always go to question phase; for multiplayer will open buzzer on Start click
      setPhase(config?.playMode === 'SINGLE' ? 'question' : 'question')
    } else {
      if (config?.playMode !== 'SINGLE') {
        // Multiplayer: show question then open buzzer (timer NOT running until buzz)
        setTimerRunning(false)
        setPhase('question')
        openBuzzerPhase()
      } else {
        // Single player: start timer immediately
        audio.playBg('game-play', 0.55)
        setTimerRunning(true)
        setPhase('question')
      }
    }
  }

  // Timer effect — only runs when timerRunning=true
  useEffect(() => {
    if (!timerRunning) return
    clearInterval(timerRef.current!)
    timerRef.current = setInterval(() => {
      setQuestionTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          setTimerRunning(false)
          handleQuestionTimeout()
          return 0
        }
        if (prev <= 5 && !timeCountPlayedRef.current) {
          timeCountPlayedRef.current = true
          audio.playTimeCount()
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current!)
  }, [timerRunning])

  const handleStartTimer = () => {
    audio.stop('wait')
    audio.playBg('game-play', 0.55)
    setTimerRunning(true)
  }

  const handleQuestionTimeout = () => {
    // Guard: if player already answered, don't override their result
    if (isAnsweredRef.current) return
    audio.stopAll()
    audio.stopTimeCount()
    audio.playOnce('lost', 0.9)
    setIsCorrect(false)
    setPhase('reveal')
  }

  const openBuzzerPhase = () => {
    setBuzzerOpen(true)
    setBuzzOrder([])
    setBuzzerOpenTime(Date.now())
    setRespondingPlayerIdx(null)
    setPhase('buzzer')
  }

  const handleBuzzIn = (playerIdx: number) => {
    if (!buzzerOpen) return
    const elapsed = Date.now() - buzzerOpenTime
    setBuzzOrder(prev => {
      if (prev.some(b => b.playerIdx === playerIdx)) return prev
      const newOrder = [...prev, { playerIdx, timeMs: elapsed }]
      if (newOrder.length === 1) {
        setBuzzerOpen(false)
        setRespondingPlayerIdx(playerIdx)
        setResponseTimeLeft(config?.responseSeconds ?? 10)
        setPhase('respond')
        startResponseTimer()
      }
      return newOrder
    })
  }

  const startResponseTimer = () => {
    clearInterval(responseTimerRef.current!)
    responseTimerRef.current = setInterval(() => {
      setResponseTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(responseTimerRef.current!)
          handleResponse(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleResponse = (correct: boolean) => {
    isAnsweredRef.current = true
    clearInterval(responseTimerRef.current!)
    audio.stopAll()
    setIsCorrect(correct)
    const pts = correct ? currentTilePoints : 0
    if (correct) {
      audio.playOnce('win', 0.9)
      setPlayers(prev => prev.map((p, i) => {
        if (i !== respondingPlayerIdx) return p
        return { ...p, score: p.score + pts, correctCount: p.correctCount + 1 }
      }))
    } else {
      audio.playOnce('lost', 0.9)
      if (respondingPlayerIdx !== null) {
        setPlayers(prev => prev.map((p, i) => {
          if (i !== respondingPlayerIdx) return p
          return { ...p, score: p.score - Math.floor(currentTilePoints * 0.25), wrongCount: p.wrongCount + 1 }
        }))
      }
    }
    setPhase('reveal')
  }

  const handleSingleAnswer = (answer: string) => {
    isAnsweredRef.current = true
    clearInterval(timerRef.current!)
    setTimerRunning(false)
    audio.stopAll()
    audio.stopTimeCount()
    const corrects = getCorrectAnswers(currentQuestion!)
    const correct = corrects.some(c => normalize(c) === normalize(answer))
    setIsCorrect(correct)
    const elapsed = (config!.timeLimitSeconds - questionTimeLeft)
    const basePoints = currentTilePoints
    const pts = config?.scoringMode === 'ACCURACY_ONLY'
      ? (correct ? basePoints : 0)
      : correct ? Math.round(basePoints * (0.5 + 0.5 * (1 - elapsed / config!.timeLimitSeconds))) : 0
    setPlayers(prev => prev.map((p, i) => {
      if (i !== currentPlayerIdx) return p
      return { ...p, score: p.score + pts, correctCount: correct ? p.correctCount + 1 : p.correctCount, wrongCount: !correct ? p.wrongCount + 1 : p.wrongCount }
    }))
    if (correct) audio.playOnce('win', 0.9)
    else audio.playOnce('lost', 0.9)
    setPhase('reveal')
  }

  const markTileDone = () => {
    if (!currentQuestion) return
    setBoard(prev => prev.map(col => col.map(tile =>
      tile.questionId === currentQuestion.id ? { ...tile, state: 'answered' } : tile
    )))
    setAnsweredQuestions(prev => new Set(Array.from(prev).concat(currentQuestion.id)))
  }

  const advanceFromLeaderboard = useCallback(() => {
    audio.stopAll()
    if (leaderboardTimerRef.current) clearTimeout(leaderboardTimerRef.current)

    const isLinear = config?.selectionMode === 'LINEAR'
    if (isLinear) {
      const next = linearIdx + 1
      setLinearIdx(next)
      showLinearQuestion(questions, next)
    } else {
      // Check board completeness
      const allDone = board.every(col => col.every(t => t.state === 'answered'))
      if (allDone) { setPhase('gameover'); return }
      setPhase('board')
      audio.playBg('selecting', 0.5)
    }
  }, [config, linearIdx, questions, board, showLinearQuestion, audio])

  const handleNext = () => {
    markTileDone()
    // LOCAL + manualScoring: show scoring adjustment screen first
    if (config?.playMode === 'LOCAL' && players.length > 1 && config?.manualScoring) {
      setScoringAdjustments({})
      setPhase('scoring')
      return
    }
    if (config?.showLeaderboard && players.length > 0) {
      audio.playBg('leaderboard', 0.6)
      setPhase('leaderboard')
      leaderboardTimerRef.current = setTimeout(() => advanceFromLeaderboard(), 5000)
    } else {
      advanceFromLeaderboard()
    }
  }

  const confirmScoring = () => {
    if (Object.keys(scoringAdjustments).length > 0) {
      setPlayers(prev => prev.map(p => ({ ...p, score: p.score + (scoringAdjustments[p.id] ?? 0) })))
    }
    if (config?.showLeaderboard && players.length > 0) {
      audio.playBg('leaderboard', 0.6)
      setPhase('leaderboard')
      leaderboardTimerRef.current = setTimeout(() => advanceFromLeaderboard(), 5000)
    } else {
      advanceFromLeaderboard()
    }
  }

  // Exit to gameover (Free Choice)
  const handleExitToGameover = () => {
    audio.stopAll()
    if (leaderboardTimerRef.current) clearTimeout(leaderboardTimerRef.current)
    clearInterval(timerRef.current!)
    setPhase('gameover')
  }

  const isFreeChoice = config?.selectionMode === 'FREE_CHOICE'

  // ─── Loading / Error ──────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#060b2e] flex items-center justify-center">
      <Loader2 className="h-10 w-10 animate-spin text-yellow-400" />
    </div>
  )
  if (error) return (
    <div className="min-h-screen bg-[#060b2e] flex items-center justify-center text-white">
      <div className="text-center"><XCircle className="h-12 w-12 mx-auto mb-4 text-red-400" /><p>{error}</p></div>
    </div>
  )

  // ─── SETUP ─────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    const maxP = config?.playMode === 'SINGLE' ? 1 : (config?.maxPlayers ?? 4)
    const joinUrl = config?.shortLink || `${window.location.origin}/gameshow/${config?.shareCode}`
    return (
      <div className="relative min-h-screen bg-[#060b2e] flex items-center justify-center p-4">
        <MusicBtn />
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-6xl mb-2">📋</div>
            <h1 className="text-4xl font-black text-yellow-300 tracking-widest">JEOPARDY!</h1>
            <p className="text-blue-300 mt-2 text-sm">{config?.name}</p>
          </div>
          <div className="bg-[#0d1b5e] border border-blue-500/30 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-white font-bold text-lg mb-4">
              {config?.playMode === 'SINGLE' ? 'Enter your name' : `Players (up to ${maxP})`}
            </h2>
            <div className="space-y-3 mb-4">
              {setupNames.map((name, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PLAYER_COLORS[i % PLAYER_COLORS.length] }} />
                  <Input
                    value={name}
                    onChange={e => { const n = [...setupNames]; n[i] = e.target.value; setSetupNames(n) }}
                    placeholder={config?.playMode === 'SINGLE' ? 'Your name...' : `Player ${i + 1}...`}
                    className="bg-[#0a0a2e] border-blue-500/30 text-white placeholder:text-blue-400 rounded-xl"
                  />
                </div>
              ))}
            </div>
            {config?.playMode !== 'SINGLE' && setupNames.length < maxP && (
              <Button variant="outline" size="sm" onClick={() => setSetupNames([...setupNames, ''])}
                className="w-full mb-4 border-blue-500/30 text-blue-300 hover:bg-blue-900/30">+ Add Player</Button>
            )}
            <div className="text-xs text-blue-400 mb-4 space-y-1">
              <div>📊 {config?.questionsCount ?? config?.questions?.length ?? 0} questions</div>
              <div>📋 {config?.categoriesCount} categories × {config?.tiersPerCategory} tiers</div>
              {config?.playMode !== 'SINGLE' && <div>🔔 Buzzer mode: first to buzz in answers</div>}
            </div>
            {/* QR / Join URL for multiplayer */}
            {config?.playMode !== 'SINGLE' && (
              <div className="mb-4 p-3 bg-[#0a0a2e] rounded-xl border border-blue-500/20">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-blue-400 mb-1">Join link</p>
                    <p className="text-xs text-white truncate font-mono">{joinUrl}</p>
                  </div>
                  {qrDataUrl && (
                    <button onClick={() => setShowQr(v => !v)}
                      className="flex-shrink-0 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                      <QrCode className="h-5 w-5 text-white" />
                    </button>
                  )}
                </div>
                {showQr && qrDataUrl && (
                  <div className="mt-3 flex justify-center">
                    <img src={qrDataUrl} alt="QR Code" className="w-40 h-40 rounded-lg" />
                  </div>
                )}
              </div>
            )}
            <Button onClick={startGame} disabled={!setupNames.some(n => n.trim())}
              className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-lg py-6 rounded-2xl">
              Start Game
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ─── BOARD ──────────────────────────────────────────────────────────────────
  if (phase === 'board') {
    return (
      <div className="relative min-h-screen bg-[#060b2e] text-white p-2 sm:p-4">
        <MusicBtn />
        <div className="max-w-4xl mx-auto">
          {/* Scores + Exit */}
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <div className="flex flex-wrap gap-2">
              {players.map(p => (
                <div key={p.id} className="flex items-center gap-2 bg-[#0d1b5e] px-3 py-1.5 rounded-xl border border-blue-500/30">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.avatarColor }} />
                  <span className="text-sm font-medium">{p.nickname}</span>
                  <span className="text-yellow-300 font-bold text-sm">{p.score}</span>
                </div>
              ))}
            </div>
            {isFreeChoice && (
              <Button size="sm" variant="outline"
                onClick={handleExitToGameover}
                className="border-red-500/50 text-red-400 hover:bg-red-900/30 gap-1">
                <LogOut className="h-3.5 w-3.5" /> End Game
              </Button>
            )}
          </div>

          {/* Board grid */}
          <div className="overflow-x-auto">
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${categories.length}, minmax(80px, 1fr))` }}>
              {/* Category headers */}
              {categories.map(cat => (
                <div key={cat} className="bg-[#0d1b5e] border border-blue-500/50 rounded-lg p-2 text-center font-black text-xs sm:text-sm text-yellow-300 uppercase tracking-wide min-h-[60px] flex items-center justify-center">
                  {cat}
                </div>
              ))}
              {/* Tiles by tier */}
              {tierPoints.map((pts, tierIdx) =>
                categories.map((_, catIdx) => {
                  const tile = board[catIdx]?.[tierIdx]
                  const done = tile?.state === 'answered'
                  return (
                    <button
                      key={`${catIdx}-${tierIdx}`}
                      disabled={done}
                      onClick={() => selectBoardTile(catIdx, tierIdx)}
                      className={`rounded-lg border-2 min-h-[60px] sm:min-h-[80px] flex items-center justify-center font-black text-lg sm:text-2xl transition-all
                        ${done
                          ? 'bg-gray-900 border-gray-800 text-gray-700 cursor-not-allowed'
                          : 'bg-[#0d1b5e] border-blue-500/60 text-yellow-300 hover:bg-[#1a2f8e] hover:border-yellow-400 hover:scale-105 cursor-pointer active:scale-95'
                        }`}
                    >
                      {done ? '' : `$${pts}`}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── QUESTION (Single player) ───────────────────────────────────────────────
  if ((phase === 'question' || phase === 'linear_question') && currentQuestion) {
    const options = parseOptions(currentQuestion)
    const isMCQ = options.length > 0
    const maxTime = config?.timeLimitSeconds ?? 30
    const timerPct = (questionTimeLeft / maxTime) * 100
    const timerColor = timerPct > 50 ? 'bg-blue-400' : timerPct > 25 ? 'bg-yellow-400' : 'bg-red-500'
    const waiting = config?.clickStartToCount && !timerRunning

    return (
      <div className="relative min-h-screen bg-[#060b2e] text-white flex flex-col p-4">
        <MusicBtn />
        <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col justify-center">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              {currentTileCategory && <Badge className="bg-blue-900 text-blue-300 border border-blue-500/30">{currentTileCategory}</Badge>}
              <span className="ml-2 text-yellow-400 font-bold">${currentTilePoints}</span>
            </div>
            <div className={`text-2xl font-black ${questionTimeLeft <= 5 && timerRunning ? 'text-red-400 animate-pulse' : 'text-white'}`}>
              ⏱ {questionTimeLeft}
            </div>
            <div className="text-sm text-blue-300">{players[currentPlayerIdx]?.score ?? 0} pts</div>
          </div>
          <div className="h-2 bg-gray-700 rounded-full mb-6">
            <div className={`h-full ${timerColor} rounded-full transition-all duration-1000`} style={{ width: `${timerPct}%` }} />
          </div>

          {/* Question */}
          <div className="bg-[#0d1b5e] border-2 border-blue-500/50 rounded-2xl p-5 mb-6 text-center shadow-2xl">
            {currentQuestion.imageUrl && <img src={currentQuestion.imageUrl} alt="" className="max-h-40 mx-auto mb-3 rounded-xl" />}
            <p className="text-lg sm:text-xl font-semibold leading-relaxed">{currentQuestion.stem}</p>
          </div>

          {/* Click-Start-to-count overlay */}
          {waiting ? (
            <div className="flex flex-col items-center gap-4">
              <p className="text-blue-300 text-sm">Press Start when ready to begin the timer</p>
              <Button onClick={handleStartTimer}
                className="bg-yellow-400 hover:bg-yellow-300 text-black font-black text-lg px-10 py-5 rounded-2xl gap-2">
                <Play className="h-5 w-5" /> Start Timer
              </Button>
            </div>
          ) : (
            /* Answer */
            isMCQ ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {options.map((opt, i) => (
                  <button key={opt} onClick={() => handleSingleAnswer(opt)}
                    className="flex items-center gap-3 p-4 rounded-xl border-2 bg-[#0d1b5e] border-blue-500/50 hover:bg-[#1a2f8e] hover:border-yellow-400 text-left font-medium transition-all hover:scale-[1.02] active:scale-95">
                    <span className="w-7 h-7 rounded-full bg-yellow-400 text-black font-black text-xs flex items-center justify-center flex-shrink-0">
                      {['A', 'B', 'C', 'D'][i]}
                    </span>
                    <span className="text-sm">{opt}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex gap-3">
                <Input value={textAnswer} onChange={e => setTextAnswer(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && textAnswer.trim() && handleSingleAnswer(textAnswer)}
                  placeholder="Type your answer..." autoFocus
                  className="bg-[#0d1b5e] border-blue-500/30 text-white placeholder:text-blue-400 rounded-xl text-lg py-6" />
                <Button onClick={() => textAnswer.trim() && handleSingleAnswer(textAnswer)}
                  disabled={!textAnswer.trim()}
                  className="bg-yellow-400 text-black font-bold hover:bg-yellow-300 rounded-xl px-6">
                  Submit
                </Button>
              </div>
            )
          )}
        </div>
      </div>
    )
  }

  // ─── BUZZER PHASE (Multiplayer) ─────────────────────────────────────────────
  if (phase === 'buzzer' && currentQuestion) {
    return (
      <div className="relative min-h-screen bg-[#060b2e] text-white flex flex-col p-4">
        <MusicBtn />
        <div className="max-w-2xl mx-auto w-full">
          <div className="bg-[#0d1b5e] border-2 border-blue-500/50 rounded-2xl p-5 mb-6 text-center">
            <div className="flex items-center justify-between mb-3">
              {currentTileCategory && <Badge className="bg-blue-900 text-blue-300">{currentTileCategory}</Badge>}
              <span className="text-yellow-400 font-bold">${currentTilePoints}</span>
            </div>
            {currentQuestion.imageUrl && <img src={currentQuestion.imageUrl} alt="" className="max-h-40 mx-auto mb-3 rounded-xl" />}
            <p className="text-lg font-semibold">{currentQuestion.stem}</p>
          </div>

          <div className="text-center mb-6">
            <p className="text-blue-300 mb-4 font-medium">
              {buzzerOpen ? '🔔 BUZZ IN — First to answer!' : '⏳ Waiting...'}
            </p>
            <div className="flex flex-wrap justify-center gap-6">
              {players.map((p, idx) => {
                const hasBuzzed = buzzOrder.some(b => b.playerIdx === idx)
                const buzzPos = buzzOrder.findIndex(b => b.playerIdx === idx)
                return (
                  <div key={p.id} className="flex flex-col items-center gap-2">
                    <BuzzerButton
                      onClick={() => handleBuzzIn(idx)}
                      disabled={!buzzerOpen || hasBuzzed}
                      label={hasBuzzed ? `#${buzzPos + 1}` : 'BUZZ'}
                    />
                    <div className="text-sm font-bold" style={{ color: p.avatarColor }}>{p.nickname}</div>
                    <div className="text-xs text-gray-400">{p.score} pts</div>
                  </div>
                )
              })}
            </div>
          </div>

          {buzzOrder.length > 0 && (
            <div className="bg-[#0d1b5e] rounded-xl p-3 border border-blue-500/30">
              <p className="text-xs text-blue-400 uppercase mb-2">Buzz Order</p>
              {buzzOrder.map((b, i) => (
                <div key={i} className="flex items-center justify-between py-1 text-sm">
                  <span>{i + 1}. {players[b.playerIdx]?.nickname}</span>
                  <span className="text-yellow-400">{(b.timeMs / 1000).toFixed(2)}s</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── RESPOND PHASE ────────────────────────────────────────────────────────
  if (phase === 'respond' && currentQuestion && respondingPlayerIdx !== null) {
    const responder = players[respondingPlayerIdx]
    const options = parseOptions(currentQuestion)
    const isMCQ = options.length > 0

    return (
      <div className="relative min-h-screen bg-[#060b2e] text-white flex flex-col p-4">
        <MusicBtn />
        <div className="max-w-2xl mx-auto w-full">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 bg-yellow-400 text-black px-4 py-2 rounded-full font-black">
              <Zap className="h-4 w-4" />
              {responder.nickname} — {responseTimeLeft}s to answer!
            </div>
          </div>

          <div className="bg-[#0d1b5e] border-2 border-yellow-400 rounded-2xl p-5 mb-6 text-center">
            <p className="text-lg font-semibold">{currentQuestion.stem}</p>
            <p className="text-yellow-400 font-bold mt-2">${currentTilePoints}</p>
          </div>

          {isMCQ ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {options.map((opt, i) => (
                <button key={opt}
                  onClick={() => {
                    const corrects = getCorrectAnswers(currentQuestion)
                    const correct = corrects.some(c => normalize(c) === normalize(opt))
                    handleResponse(correct)
                  }}
                  className="flex items-center gap-3 p-4 rounded-xl border-2 bg-[#0d1b5e] border-blue-500/50 hover:bg-[#1a2f8e] hover:border-yellow-400 text-left font-medium transition-all hover:scale-[1.02] active:scale-95">
                  <span className="w-7 h-7 rounded-full bg-yellow-400 text-black font-black text-xs flex items-center justify-center">{['A', 'B', 'C', 'D'][i]}</span>
                  <span className="text-sm">{opt}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-3">
              <Input value={textAnswer} onChange={e => setTextAnswer(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && textAnswer.trim()) {
                    const corrects = getCorrectAnswers(currentQuestion)
                    const correct = corrects.some(c => normalize(c) === normalize(textAnswer))
                    handleResponse(correct)
                  }
                }}
                placeholder="Type your answer..." autoFocus
                className="bg-[#0d1b5e] border-yellow-400 text-white placeholder:text-blue-400 rounded-xl text-lg py-6" />
              <Button
                onClick={() => {
                  if (!textAnswer.trim()) return
                  const corrects = getCorrectAnswers(currentQuestion)
                  const correct = corrects.some(c => normalize(c) === normalize(textAnswer))
                  handleResponse(correct)
                }}
                disabled={!textAnswer.trim()}
                className="bg-yellow-400 text-black font-bold hover:bg-yellow-300 rounded-xl px-6">
                Submit
              </Button>
            </div>
          )}

          {!isMCQ && (
            <div className="mt-4 flex gap-3 justify-center">
              <Button onClick={() => handleResponse(true)} className="bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl px-6">
                <CheckCircle2 className="h-4 w-4 mr-2" /> Mark Correct
              </Button>
              <Button onClick={() => handleResponse(false)} className="bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl px-6">
                <XCircle className="h-4 w-4 mr-2" /> Mark Wrong
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── REVEAL ──────────────────────────────────────────────────────────────
  if (phase === 'reveal' && currentQuestion) {
    const corrects = getCorrectAnswers(currentQuestion)
    return (
      <div className="relative min-h-screen bg-[#060b2e] text-white flex flex-col items-center justify-center p-4">
        <MusicBtn />
        <div className="w-full max-w-lg">
          <div className={`text-center p-6 rounded-2xl mb-6 border-2 ${isCorrect ? 'bg-green-900/40 border-green-500' : 'bg-red-900/40 border-red-500'}`}>
            {isCorrect
              ? <><CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-2" /><p className="text-2xl font-black text-green-300">Correct! +${currentTilePoints}</p></>
              : <><XCircle className="h-12 w-12 text-red-400 mx-auto mb-2" /><p className="text-2xl font-black text-red-300">Wrong!</p></>
            }
            <div className="mt-3 bg-black/20 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Correct answer:</p>
              <p className="text-yellow-300 font-bold">{corrects.join(' / ')}</p>
            </div>
          </div>

          {currentQuestion.explanation && (
            <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-3 mb-5 text-sm text-blue-200">
              💡 {currentQuestion.explanation}
            </div>
          )}

          <div className="bg-[#0d1b5e] rounded-2xl p-4 mb-5">
            <p className="text-xs uppercase tracking-wide text-blue-400 font-semibold mb-3">Scoreboard</p>
            {[...players].sort((a, b) => b.score - a.score).map((p, rank) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-blue-500/20 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{['🥇', '🥈', '🥉'][rank] || `${rank + 1}.`}</span>
                  <span className="text-sm font-medium">{p.nickname}</span>
                </div>
                <span className="text-yellow-300 font-bold">${p.score}</span>
              </div>
            ))}
          </div>

          <Button onClick={handleNext} className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-5 rounded-2xl text-lg">
            {isFreeChoice ? 'Back to Board' : 'Next Question'} <ChevronRight className="h-5 w-5 ml-1" />
          </Button>
        </div>
      </div>
    )
  }

  // ─── SCORING (Local Multiplayer manual score adjustment) ───────────────────────
  if (phase === 'scoring') {
    return (
      <div className="relative min-h-screen bg-[#060b2e] text-white flex flex-col items-center justify-center p-4">
        <MusicBtn />
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">📊</div>
            <h2 className="text-2xl font-black text-yellow-400">Score Adjustment</h2>
            <p className="text-blue-300 text-sm mt-1">Adjust points for this question.</p>
          </div>
          <div className="bg-[#0d1b5e] rounded-2xl p-4 space-y-3 mb-4 border border-blue-500/30">
            {players.map(p => {
              const adj = scoringAdjustments[p.id] ?? 0
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2 border-b border-blue-500/20 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{p.nickname}</p>
                    <p className="text-xs text-blue-400">Base: {p.score} pts{adj !== 0 ? ` · Adj: ${adj > 0 ? '+' : ''}${adj}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setScoringAdjustments(prev => ({ ...prev, [p.id]: (prev[p.id] ?? 0) - 50 }))}
                      className="w-9 h-9 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-300 font-black text-lg flex items-center justify-center">−</button>
                    <span className={`w-14 text-center font-black text-lg ${adj > 0 ? 'text-green-400' : adj < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {adj > 0 ? `+${adj}` : adj === 0 ? '0' : adj}
                    </span>
                    <button onClick={() => setScoringAdjustments(prev => ({ ...prev, [p.id]: (prev[p.id] ?? 0) + 50 }))}
                      className="w-9 h-9 rounded-full bg-green-500/20 hover:bg-green-500/40 text-green-300 font-black text-lg flex items-center justify-center">+</button>
                  </div>
                  <div className="w-16 text-right">
                    <span className="font-black text-yellow-300">{p.score + (scoringAdjustments[p.id] ?? 0)}</span>
                    <span className="text-xs text-blue-400 block">total</span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-2 mb-3">
            {[-200, -100, -50, 50, 100, 200].map(v => (
              <button key={v} onClick={() => {
                const p = players[currentPlayerIdx]
                if (p) setScoringAdjustments(prev => ({ ...prev, [p.id]: (prev[p.id] ?? 0) + v }))
              }} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${v > 0 ? 'bg-green-600/30 hover:bg-green-600/50 text-green-300' : 'bg-red-600/30 hover:bg-red-600/50 text-red-300'}`}>
                {v > 0 ? `+${v}` : v}
              </button>
            ))}
          </div>
          <p className="text-xs text-blue-400 text-center mb-4">Quick buttons → <span className="text-yellow-300">{players[currentPlayerIdx]?.nickname}</span></p>
          <Button onClick={confirmScoring} className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-lg py-5 rounded-2xl">
            Confirm & Continue <ChevronRight className="h-5 w-5 ml-1" />
          </Button>
        </div>
      </div>
    )
  }

  // ─── LEADERBOARD ────────────────────────────────────────────────────────────
  if (phase === 'leaderboard') {
    const sorted = [...players].sort((a, b) => b.score - a.score).slice(0, 10)
    return (
      <div className="relative min-h-screen bg-[#060b2e] text-white flex flex-col items-center justify-center p-4">
        <MusicBtn />
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">🏆</div>
            <h2 className="text-3xl font-black text-yellow-400">Leaderboard</h2>
          </div>
          <div className="bg-[#0d1560] rounded-2xl p-4 space-y-2 mb-6 border border-yellow-500/30">
            {sorted.map((p, rank) => (
              <div key={p.id} className={`flex items-center justify-between py-2.5 px-3 rounded-xl transition-all ${rank === 0 ? 'bg-yellow-500/20 border border-yellow-500/40' : rank === 1 ? 'bg-gray-400/10 border border-gray-600/30' : rank === 2 ? 'bg-orange-500/10 border border-orange-600/30' : 'bg-blue-900/20'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-xl w-8 text-center">{rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}`}</span>
                  <span className="font-bold text-sm">{p.nickname}</span>
                </div>
                <span className="text-yellow-400 font-black text-lg">{p.score.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="text-center space-y-3">
            <p className="text-blue-300 text-sm">Auto-continuing in 5 seconds…</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={advanceFromLeaderboard} className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-8 py-4 rounded-2xl">
                Continue <ChevronRight className="h-5 w-5 ml-1" />
              </Button>
              {isFreeChoice && (
                <Button onClick={handleExitToGameover} variant="outline"
                  className="border-red-500/50 text-red-400 hover:bg-red-900/30 px-6 py-4 rounded-2xl gap-1">
                  <LogOut className="h-4 w-4" /> End Game
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── GAME OVER ─────────────────────────────────────────────────────────────
  if (phase === 'gameover') {
    const sorted = [...players].sort((a, b) => b.score - a.score)
    return (
      <div className="relative min-h-screen bg-[#060b2e] text-white flex items-center justify-center p-4">
        <MusicBtn />
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <Trophy className="h-16 w-16 text-yellow-400 mx-auto mb-3" />
            <h1 className="text-3xl font-black text-yellow-300">Final Results!</h1>
            <p className="text-blue-300 mt-1">{config?.name}</p>
          </div>
          <div className="space-y-3 mb-8">
            {sorted.map((p, rank) => (
              <div key={p.id} className={`rounded-2xl p-5 border-2 ${rank === 0 ? 'bg-yellow-900/30 border-yellow-400' : rank === 1 ? 'bg-gray-700/30 border-gray-400' : 'bg-[#0d1b5e] border-blue-500/30'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{['🥇', '🥈', '🥉'][rank] || `${rank + 1}.`}</span>
                    <div>
                      <div className="font-bold">{p.nickname}</div>
                      <div className="text-xs text-gray-400">{p.correctCount} correct · {p.wrongCount} wrong</div>
                    </div>
                  </div>
                  <div className="text-2xl font-black text-yellow-300">${p.score}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <Button onClick={() => { audio.stopAll(); setPhase('setup'); setSetupNames([setupNames[0] || '']); audio.playBg('opening', 0.5) }}
              variant="outline" className="flex-1 border-blue-500/30 text-blue-300 hover:bg-blue-900/30 rounded-2xl">
              <RotateCcw className="h-4 w-4 mr-2" /> Play Again
            </Button>
            <Button onClick={() => window.close()}
              variant="outline" className="flex-1 border-blue-500/30 text-blue-300 hover:bg-blue-900/30 rounded-2xl">
              <Home className="h-4 w-4 mr-2" /> Exit
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
