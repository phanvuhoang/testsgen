'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
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
  playMode: 'SINGLE' | 'LOCAL' | 'ONLINE' | 'BUZZ'; selectionMode: 'LINEAR' | 'FREE_CHOICE'
  scoringMode: 'SPEED_ACCURACY' | 'ACCURACY_ONLY'; questionsCount: number | null
  timeLimitSeconds: number; responseSeconds: number; answerRevealSeconds: number
  shuffleQuestions: boolean; showLeaderboard: boolean; maxPlayers: number
  categoriesCount: number; tiersPerCategory: number; tierPoints: string | null
  categoryNames?: string | null
  quizSetTitle: string; questions: Question[]
  clickStartToCount: boolean; manualScoring: boolean; shortLink: string | null
  buzzerMode: boolean; buzzButton: boolean
  betEnabled: boolean; betTimes: number; betMultiple: number; betWrongAnswer: string
}
type Player = {
  id: string; nickname: string; avatarColor: string; score: number; correctCount: number; wrongCount: number
  lastPointsEarned?: number
}
type TileState = 'available' | 'answered'
type BoardTile = { questionId: string; category: string; points: number; state: TileState }
type Phase = 'setup' | 'lobby' | 'join' | 'waiting' | 'board' | 'question' | 'buzzer' | 'respond' | 'reveal' | 'scoring' | 'linear_question' | 'leaderboard' | 'gameover'

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
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const PLAYER_COLORS = ['#6366f1', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

// ─── LobbyQR ─────────────────────────────────────────────────────────────────
function LobbyQR({ url }: { url: string }) {
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    if (url) QRCode.toDataURL(url, { margin: 1, width: 280 }).then(setQr).catch(() => {})
  }, [url])
  if (!qr) return <div className="w-48 h-48 mx-auto bg-white/20 rounded-2xl animate-pulse mb-2" />
  return <img src={qr} alt="QR Code" className="w-56 h-56 mx-auto rounded-2xl border-4 border-white/40 mb-2" />
}

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
  const searchParams = useSearchParams()
  const shareCode = params.shareCode as string
  // ?room=ROOMCODE → player is joining an existing online session
  const joinRoomCode = searchParams.get('room')

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

  // Buzzer (local/single only)
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

  // Answered questions tracking
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set())
  const [scoringAdjustments, setScoringAdjustments] = useState<Record<string, number>>({})

  // QR code (setup screen)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)

  // Audio
  const [musicEnabled, setMusicEnabled] = useState(true)
  const audio = useAudio(musicEnabled)
  const timeCountPlayedRef = useRef(false)
  const leaderboardTimerRef = useRef<NodeJS.Timeout | null>(null)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const isAnsweredRef = useRef(false)
  const responseTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Online multiplayer state
  const [joinNickname, setJoinNickname] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinLoading, setJoinLoading] = useState(false)
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [onlineLobbyPlayers, setOnlineLobbyPlayers] = useState<{ id: string; nickname: string }[]>([])
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const lobbyPollRef = useRef<NodeJS.Timeout | null>(null)

  // Online player personal score tracking
  const [myLastPts, setMyLastPts] = useState(0)
  const [myTotalScore, setMyTotalScore] = useState(0)

  // Online player submitted overlay state
  const [submitted, setSubmitted] = useState(false)

  // BUZZ play mode (online) state
  type BuzzState = { playerId: string; playerNickname: string; answer: string | null; isCorrect: boolean | null; isBuzzing?: boolean }
  const [buzzState, setBuzzState] = useState<BuzzState | null>(null)
  const [disabledOptions, setDisabledOptions] = useState<string[]>([])
  const [disabledPlayerIds, setDisabledPlayerIds] = useState<string[]>([])
  const [hasBuzzed, setHasBuzzed] = useState(false)
  const [buzzTimeRemaining, setBuzzTimeRemaining] = useState(0)
  // Bet mechanism
  const [betsRemaining, setBetsRemaining] = useState(0)
  const [isBetting, setIsBetting] = useState(false)

  // Refs for stale closure safety
  const roomCodeRef = useRef<string | null>(null)
  const evsRef = useRef<EventSource | null>(null)
  const configRef = useRef<GameshowConfig | null>(null)
  const submittedRef = useRef(false)
  // For Jeopardy we track currentQuestionId instead of index
  const currentQIdRef = useRef<string | null>(null)

  // Sync refs
  useEffect(() => { roomCodeRef.current = roomCode }, [roomCode])
  useEffect(() => { configRef.current = config }, [config])
  useEffect(() => { submittedRef.current = submitted }, [submitted])
  useEffect(() => { currentQIdRef.current = currentQuestion?.id ?? null }, [currentQuestion])

  const isFreeChoice = config?.selectionMode === 'FREE_CHOICE'

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

  // ─── Fetch config — detect join vs admin flow ────────────────────────────
  useEffect(() => {
    fetch(`/api/gameshow/${shareCode}`)
      .then(r => r.json())
      .then(async data => {
        if (data.error) { setError(data.error); setLoading(false); return }
        if (data.type !== 'JEOPARDY') { setError('This gameshow is not a Jeopardy game'); setLoading(false); return }
        setConfig(data)
        if (data.betEnabled && data.betTimes) setBetsRemaining(data.betTimes)

        if ((data.playMode === 'ONLINE' || data.playMode === 'BUZZ') && joinRoomCode) {
          // Player joining existing room
          setLoading(false)
          setPhase('join')
        } else if ((data.playMode === 'ONLINE' || data.playMode === 'BUZZ') && !joinRoomCode) {
          // Admin: auto-create online session
          try {
            const res = await fetch(`/api/gameshow/${shareCode}/session`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
            })
            const sData = await res.json()
            const allQs: Question[] = data.questions ?? []
            setQuestions(allQs)
            setRoomCode(sData.roomCode)
            setOnlineLobbyPlayers([])
            setPhase('lobby')
            audio.playBg('opening', 0.5)
          } catch {
            setError('Failed to create game session')
          }
          setLoading(false)
        } else {
          // Setup QR code for non-online modes
          const joinUrl = data.shortLink || `${window.location.origin}/gameshow/${data.shareCode}`
          QRCode.toDataURL(joinUrl, { margin: 1, width: 200 }).then(setQrDataUrl).catch(() => {})
          audio.playBg('opening', 0.5)
          setLoading(false)
        }
      })
      .catch(() => { setError('Failed to load gameshow'); setLoading(false) })
  }, [shareCode])

  // ─── Online lobby polling ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'lobby' || !roomCode) return
    const poll = async () => {
      try {
        const res = await fetch(`/api/gameshow/${shareCode}/session/${roomCode}`)
        const data = await res.json()
        if (data.players) setOnlineLobbyPlayers(data.players.map((p: any) => ({ id: p.id, nickname: p.nickname })))
      } catch {}
    }
    poll()
    lobbyPollRef.current = setInterval(poll, 2000)
    return () => clearInterval(lobbyPollRef.current!)
  }, [phase, roomCode])

  // ─── Online player: subscribe to SSE after joining room ──────────────────
  useEffect(() => {
    if (!joinRoomCode || !myPlayerId) return
    let cancelled = false

    const init = async () => {
      try {
        const res = await fetch(`/api/gameshow/${shareCode}/session/${joinRoomCode}`)
        const data = await res.json()
        if (cancelled || !data.gameshow) return
        const qs: Question[] = data.gameshow.quizSet?.questions ?? []
        setQuestions(qs)
        if (data.players) setOnlineLobbyPlayers(data.players.map((p: any) => ({ id: p.id, nickname: p.nickname })))
      } catch {}

      if (cancelled) return
      const es = new EventSource(`/api/gameshow/${shareCode}/session/${joinRoomCode}/events`)
      evsRef.current = es

      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type !== 'state') return

          // Sync players from server
          if (msg.players) {
            setOnlineLobbyPlayers(msg.players.map((p: any) => ({ id: p.id, nickname: p.nickname })))
            setPlayers(msg.players.map((p: any, i: number) => ({
              id: p.id, nickname: p.nickname,
              avatarColor: PLAYER_COLORS[i % PLAYER_COLORS.length],
              score: p.score ?? 0,
              correctCount: p.correctCount ?? 0, wrongCount: p.wrongCount ?? 0,
              lastPointsEarned: p.lastPointsEarned ?? 0,
            })))
            const myIdx = msg.players.findIndex((p: any) => p.id === myPlayerId)
            if (myIdx >= 0) setCurrentPlayerIdx(myIdx)
          }

          const gs = msg.gameState
          if (!gs) return

          if (gs.phase === 'board') {
            clearInterval(timerRef.current!)
            // Update board state from server if answeredQuestionIds provided
            if (gs.answeredQuestionIds) {
              setAnsweredQuestions(new Set(gs.answeredQuestionIds))
              setBoard(prev => prev.map(col => col.map(tile =>
                gs.answeredQuestionIds.includes(tile.questionId) ? { ...tile, state: 'answered' as TileState } : tile
              )))
            }
            setPhase('waiting') // Player sees "waiting for host to pick"
          } else if (gs.phase === 'question') {
            const qId = gs.currentQuestionId
            const tilePoints = gs.currentTilePoints ?? 100
            const startTime = gs.questionStartTime ?? Date.now()
            const elapsed = (Date.now() - startTime) / 1000
            const cfg = configRef.current
            const remaining = Math.max(1, Math.round((cfg?.timeLimitSeconds ?? 30) - elapsed))
            // buzzContinue: admin pressed Continue — reset all players' states
            const isBuzzContinue = gs.buzzContinue === true
            // Only reset if this is a NEW question (or buzzContinue)
            const isNewQuestion = isBuzzContinue || qId !== currentQIdRef.current || !submittedRef.current
            if (isNewQuestion) {
              setCurrentQuestion(null)
              setCurrentTilePoints(tilePoints)
              setTextAnswer('')
              setSelectedMCQ(null)
              setIsCorrect(null)
              setSubmitted(false)
              setMyLastPts(0)
              isAnsweredRef.current = false
              timeCountPlayedRef.current = false
              setBuzzState(null); setHasBuzzed(false); setIsBetting(false)
            }
            // Always sync buzz/disabled state
            if (gs.buzzState !== undefined) {
              setBuzzState(gs.buzzState ?? null)
              if (gs.buzzState !== null && cfg?.playMode === 'BUZZ') {
                clearInterval(timerRef.current!)
                setTimerRunning(false)
              }
            }
            if (gs.disabledOptions !== undefined) setDisabledOptions(gs.disabledOptions ?? [])
            if (gs.disabledPlayerIds !== undefined) setDisabledPlayerIds(gs.disabledPlayerIds ?? [])
            setQuestionTimeLeft(remaining)
            setPhase('question')
            // Look up question by id — use functional update to access latest questions
            setQuestions(prev => {
              const q = prev.find(q => q.id === qId)
              if (q) setCurrentQuestion(q)
              return prev
            })
          } else if (gs.phase === 'reveal') {
            clearInterval(timerRef.current!)
            setPhase('reveal')
          } else if (gs.phase === 'leaderboard') {
            clearInterval(timerRef.current!)
            audio.playBg('leaderboard', 0.6)
            setPhase('leaderboard')
          } else if (gs.phase === 'gameover') {
            clearInterval(timerRef.current!)
            setPhase('gameover')
          }
        } catch {}
      }
    }

    init()
    return () => { cancelled = true; evsRef.current?.close(); evsRef.current = null }
  }, [myPlayerId, joinRoomCode, shareCode])

  // BUZZ play mode: admin subscribes to SSE for real-time player buzz/answer notifications
  useEffect(() => {
    if (!roomCode || joinRoomCode || config?.playMode !== 'BUZZ') return
    const es = new EventSource(`/api/gameshow/${shareCode}/session/${roomCode}/events`)
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type !== 'state') return
        const gs = msg.gameState
        if (gs) {
          if (gs.buzzState !== undefined) setBuzzState(gs.buzzState ?? null)
          if (gs.disabledOptions !== undefined) setDisabledOptions(gs.disabledOptions ?? [])
          if (gs.disabledPlayerIds !== undefined) setDisabledPlayerIds(gs.disabledPlayerIds ?? [])
        }
        if (msg.players) {
          setPlayers(msg.players.map((p: any, i: number) => ({
            id: p.id, nickname: p.nickname, avatarColor: PLAYER_COLORS[i % PLAYER_COLORS.length],
            score: p.score ?? 0, correctCount: p.correctCount ?? 0, wrongCount: p.wrongCount ?? 0,
            lastPointsEarned: p.lastPointsEarned ?? 0,
          })))
        }
      } catch {}
    }
    return () => es.close()
  }, [roomCode, config?.playMode, shareCode, joinRoomCode])

  // ─── Build board from questions ──────────────────────────────────────────
  const buildBoard = (qs: Question[], cfg: GameshowConfig) => {
    const numCats = cfg.categoriesCount
    const numTiers = cfg.tiersPerCategory
    let points: number[] = [10, 25, 50, 100, 200]
    try { if (cfg.tierPoints) points = JSON.parse(cfg.tierPoints) } catch {}
    points = points.slice(0, numTiers)
    setTierPoints(points)

    let configuredNames: string[] = []
    try { if (cfg.categoryNames) configuredNames = JSON.parse(cfg.categoryNames) } catch {}
    const topicSet = new Set(qs.map(q => q.topic).filter(Boolean) as string[])
    const topicList = Array.from(topicSet)
    const catNames: string[] = []
    for (let i = 0; i < numCats; i++) {
      catNames.push(configuredNames[i] || topicList[i] || `Category ${i + 1}`)
    }
    setCategories(catNames)

    let jTags: Record<string, { category: number, tier: number }> = {}
    try { if ((cfg as any).jeopardyTags) jTags = JSON.parse((cfg as any).jeopardyTags) } catch {}
    const hasTagging = Object.keys(jTags).length > 0

    if (hasTagging) {
      const grid: BoardTile[][] = Array.from({ length: numCats }, () => Array(numTiers).fill(null))
      const usedSlots = new Set<string>()
      for (const q of qs) {
        const tag = jTags[q.id]
        if (!tag) continue
        const ci = tag.category - 1
        const ti = tag.tier - 1
        if (ci >= 0 && ci < numCats && ti >= 0 && ti < numTiers && !usedSlots.has(`${ci}-${ti}`)) {
          grid[ci][ti] = { questionId: q.id, category: catNames[ci], points: points[ti] ?? (ti + 1) * 100, state: 'available' }
          usedSlots.add(`${ci}-${ti}`)
        }
      }
      const untagged = qs.filter(q => !jTags[q.id])
      let ui = 0
      for (let ci = 0; ci < numCats; ci++) {
        for (let ti = 0; ti < numTiers; ti++) {
          if (!grid[ci][ti] && ui < untagged.length) {
            grid[ci][ti] = { questionId: untagged[ui].id, category: catNames[ci], points: points[ti] ?? (ti + 1) * 100, state: 'available' }
            ui++
          }
          if (!grid[ci][ti]) {
            grid[ci][ti] = { questionId: '', category: catNames[ci], points: points[ti] ?? 0, state: 'answered' }
          }
        }
      }
      setBoard(grid)
    } else {
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
  }

  const startGame = async () => {
    if (!config) return
    // BUZZ/ONLINE mode: create session and go to lobby (admin does not play)
    if (config.playMode === 'ONLINE' || config.playMode === 'BUZZ') {
      try {
        const res = await fetch(`/api/gameshow/${shareCode}/session`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
        })
        const data = await res.json()
        setRoomCode(data.roomCode)
        setOnlineLobbyPlayers([])
        setPhase('lobby')
      } catch { setError('Failed to create game session') }
      return
    }
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
      audio.playBg('selecting', 0.5)
    } else {
      setPhase('linear_question')
      showLinearQuestion(qs, 0, config)
    }
  }

  // ─── Online admin: build board and start lobby ────────────────────────────
  const buildBoardForOnline = (qs: Question[], cfg: GameshowConfig) => {
    const numCats = cfg.categoriesCount
    const numTiers = cfg.tiersPerCategory
    let points: number[] = [10, 25, 50, 100, 200]
    try { if (cfg.tierPoints) points = JSON.parse(cfg.tierPoints) } catch {}
    points = points.slice(0, numTiers)
    setTierPoints(points)

    let configuredNames: string[] = []
    try { if (cfg.categoryNames) configuredNames = JSON.parse(cfg.categoryNames) } catch {}
    const topicSet = new Set(qs.map(q => q.topic).filter(Boolean) as string[])
    const topicList = Array.from(topicSet)
    const catNames: string[] = []
    for (let i = 0; i < numCats; i++) {
      catNames.push(configuredNames[i] || topicList[i] || `Category ${i + 1}`)
    }
    setCategories(catNames)

    let jTags: Record<string, { category: number, tier: number }> = {}
    try { if ((cfg as any).jeopardyTags) jTags = JSON.parse((cfg as any).jeopardyTags) } catch {}
    const hasTagging = Object.keys(jTags).length > 0

    if (hasTagging) {
      const grid: BoardTile[][] = Array.from({ length: numCats }, () => Array(numTiers).fill(null))
      const usedSlots = new Set<string>()
      for (const q of qs) {
        const tag = jTags[q.id]
        if (!tag) continue
        const ci = tag.category - 1
        const ti = tag.tier - 1
        if (ci >= 0 && ci < numCats && ti >= 0 && ti < numTiers && !usedSlots.has(`${ci}-${ti}`)) {
          grid[ci][ti] = { questionId: q.id, category: catNames[ci], points: points[ti] ?? (ti + 1) * 100, state: 'available' }
          usedSlots.add(`${ci}-${ti}`)
        }
      }
      const untagged = qs.filter(q => !jTags[q.id])
      let ui = 0
      for (let ci = 0; ci < numCats; ci++) {
        for (let ti = 0; ti < numTiers; ti++) {
          if (!grid[ci][ti] && ui < untagged.length) {
            grid[ci][ti] = { questionId: untagged[ui].id, category: catNames[ci], points: points[ti] ?? (ti + 1) * 100, state: 'available' }
            ui++
          }
          if (!grid[ci][ti]) {
            grid[ci][ti] = { questionId: '', category: catNames[ci], points: points[ti] ?? 0, state: 'answered' }
          }
        }
      }
      setBoard(grid)
    } else {
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
    setBuzzState(null); setDisabledOptions([]); setDisabledPlayerIds([]); setHasBuzzed(false); setIsBetting(false)
    timeCountPlayedRef.current = false
    const timeLimit = activeConfig?.timeLimitSeconds ?? 30
    setQuestionTimeLeft(timeLimit)

    if (activeConfig?.clickStartToCount) {
      setTimerRunning(false)
      audio.playBg('wait', 0.5)
      setPhase('linear_question')
    } else {
      if (activeConfig?.playMode === 'LOCAL') {
        setRespondingPlayerIdx(currentPlayerIdx)
        setResponseTimeLeft(activeConfig?.timeLimitSeconds ?? 30)
        setPhase('respond')
        startResponseTimer()
      } else {
        audio.playBg('game-play', 0.55)
        setTimerRunning(true)
        setPhase('linear_question')
      }
    }
  }, [config, tierPoints, currentPlayerIdx])

  const selectBoardTile = (catIdx: number, tierIdx: number) => {
    const tile = board[catIdx]?.[tierIdx]
    if (!tile || tile.state !== 'available') return
    const q = questions.find(q => q.id === tile.questionId)
    if (!q) return

    const rc = roomCodeRef.current
    const isOnlineAdmin = !!rc && !joinRoomCode

    isAnsweredRef.current = false
    setCurrentQuestion(q)
    setCurrentTilePoints(tile.points)
    setCurrentTileCategory(categories[catIdx])
    setTextAnswer('')
    setSelectedMCQ(null)
    setIsCorrect(null)
    setBuzzOrder([])
    setRespondingPlayerIdx(null)
    setBuzzState(null); setDisabledOptions([]); setDisabledPlayerIds([]); setHasBuzzed(false); setIsBetting(false)
    timeCountPlayedRef.current = false
    const timeLimit = config?.timeLimitSeconds ?? 30
    setQuestionTimeLeft(timeLimit)

    if (isOnlineAdmin) {
      // Broadcast question to all players via PATCH
      const startTime = Date.now()
      fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameState: {
            phase: 'question',
            currentQuestionId: q.id,
            currentTilePoints: tile.points,
            questionStartTime: startTime,
            buzzState: null,
            disabledOptions: [],
            disabledPlayerIds: [],
          }
        })
      }).catch(() => {})
      // Admin sees the question but cannot answer — start timer
      setSubmitted(false)
      isAnsweredRef.current = true // admin can't answer - mark as answered to prevent answer UI
      setQuestionTimeLeft(timeLimit)
      audio.playBg('game-play', 0.55)
      setTimerRunning(true)
      setPhase('question')
      return
    }

    if (config?.clickStartToCount) {
      setTimerRunning(false)
      audio.playBg('wait', 0.5)
      setPhase('question')
    } else {
      if (config?.playMode === 'LOCAL') {
        setRespondingPlayerIdx(currentPlayerIdx)
        setResponseTimeLeft(config?.timeLimitSeconds ?? 30)
        setPhase('respond')
        startResponseTimer()
      } else {
        audio.playBg('game-play', 0.55)
        setTimerRunning(true)
        setPhase('question')
      }
    }
  }

  // ─── Timer effect ─────────────────────────────────────────────────────────
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

  const handleQuestionTimeout = useCallback(() => {
    const rc = roomCodeRef.current

    if (joinRoomCode) {
      // Online player: timer ran out — just mark submitted, wait for SSE reveal
      if (!submittedRef.current) {
        setIsCorrect(false)
        setSubmitted(true)
      }
      return
    }

    // Guard: if player already answered, don't override
    if (isAnsweredRef.current && !rc) return

    audio.stopAll()
    audio.stopTimeCount()

    if (rc && !joinRoomCode) {
      // Online admin: fetch scores then broadcast reveal
      fetch(`/api/gameshow/${shareCode}/session/${rc}`).then(r => r.json()).then(data => {
        if (data.players) setPlayers(data.players.map((p: any, i: number) => ({
          id: p.id, nickname: p.nickname, avatarColor: PLAYER_COLORS[i % PLAYER_COLORS.length],
          score: p.score ?? 0, correctCount: p.correctCount ?? 0, wrongCount: p.wrongCount ?? 0,
          lastPointsEarned: p.lastPointsEarned ?? 0,
        })))
      }).catch(() => {})
      fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameState: { phase: 'reveal' } })
      }).catch(() => {})
      audio.playOnce('lost', 0.9)
      setIsCorrect(false)
      setTimeout(() => setPhase('reveal'), 800)
      return
    }

    // Local/single
    audio.playOnce('lost', 0.9)
    setIsCorrect(false)
    setPhase('reveal')
  }, [joinRoomCode, shareCode])

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
    if (!currentQuestion) return
    const isBuzzMode = config?.playMode === 'BUZZ'
    if (isBuzzMode && buzzState && buzzState.playerId !== myPlayerId) return
    if (isBuzzMode && config?.buzzButton && !hasBuzzed) return
    if (disabledOptions.includes(answer)) return
    // Online player: submit via API
    if (joinRoomCode && myPlayerId) {
      isAnsweredRef.current = true
      clearInterval(timerRef.current!)
      setTimerRunning(false)
      audio.stopAll()
      audio.stopTimeCount()
      const corrects = getCorrectAnswers(currentQuestion)
      const correct = corrects.some(c => normalize(c) === normalize(answer))
      setIsCorrect(correct)
      const elapsed = (config!.timeLimitSeconds - questionTimeLeft)
      const basePoints = currentTilePoints
      let pts = config?.scoringMode === 'ACCURACY_ONLY'
        ? (correct ? basePoints : 0)
        : correct ? Math.round(basePoints * (0.5 + 0.5 * (1 - elapsed / config!.timeLimitSeconds))) : 0
      if (isBetting) {
        if (correct) pts = Math.round(pts * (config?.betMultiple ?? 2))
        else { const wa = config?.betWrongAnswer ?? 'NO_DEDUCTION'; pts = wa === '1x' ? -basePoints : wa === 'Multiple' ? -Math.round(basePoints * (config?.betMultiple ?? 2)) : 0 }
        setBetsRemaining(prev => Math.max(0, prev - 1)); setIsBetting(false)
      }
      setMyLastPts(pts)
      setMyTotalScore(prev => prev + pts)
      setSubmitted(true)
      if (correct) audio.playOnce('win', 0.9)
      else audio.playOnce('lost', 0.9)
      fetch(`/api/gameshow/${shareCode}/session/${joinRoomCode}/answer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: myPlayerId,
          questionId: currentQuestion.id,
          answer,
          responseTimeMs: Math.round(elapsed * 1000),
          isCorrect: correct,
          pointsEarned: pts,
          bet: isBetting
        })
      }).then(r => r.json()).then(data => {
        if (isBuzzMode && data.ok === false && data.reason === 'already_buzzed') {
          isAnsweredRef.current = false
          setSubmitted(false); setIsCorrect(null)
        }
      }).catch(() => {})
      return
    }

    // Local / single player
    isAnsweredRef.current = true
    clearInterval(timerRef.current!)
    setTimerRunning(false)
    audio.stopAll()
    audio.stopTimeCount()
    const corrects = getCorrectAnswers(currentQuestion)
    const correct = corrects.some(c => normalize(c) === normalize(answer))
    setIsCorrect(correct)
    const elapsed = (config!.timeLimitSeconds - questionTimeLeft)
    const basePoints = currentTilePoints
    let pts = config?.scoringMode === 'ACCURACY_ONLY'
      ? (correct ? basePoints : 0)
      : correct ? Math.round(basePoints * (0.5 + 0.5 * (1 - elapsed / config!.timeLimitSeconds))) : 0
    if (isBetting) {
      if (correct) pts = Math.round(pts * (config?.betMultiple ?? 2))
      else { const wa = config?.betWrongAnswer ?? 'NO_DEDUCTION'; pts = wa === '1x' ? -basePoints : wa === 'Multiple' ? -Math.round(basePoints * (config?.betMultiple ?? 2)) : 0 }
      setBetsRemaining(prev => Math.max(0, prev - 1)); setIsBetting(false)
    }
    setPlayers(prev => prev.map((p, i) => {
      if (i !== currentPlayerIdx) return p
      return { ...p, score: p.score + pts, correctCount: correct ? p.correctCount + 1 : p.correctCount, wrongCount: !correct ? p.wrongCount + 1 : p.wrongCount }
    }))
    if (correct) audio.playOnce('win', 0.9)
    else audio.playOnce('lost', 0.9)
    setPhase('reveal')
  }

  // BUZZ play mode: player presses the dedicated Buzz button
  const handleBuzzButton = async () => {
    if (!myPlayerId || !joinRoomCode || buzzState) return
    setHasBuzzed(true)
    try {
      const res = await fetch(`/api/gameshow/${shareCode}/session/${joinRoomCode}/buzz`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: myPlayerId })
      })
      const data = await res.json()
      if (data.ok === false) setHasBuzzed(false)
    } catch { setHasBuzzed(false) }
  }

  // BUZZ play mode: admin clicks Continue (wrong answer → others can try)
  const handleBuzzContinue = () => {
    const rc = roomCodeRef.current
    const wrongAnswer = buzzState?.answer
    const wrongPlayerId = buzzState?.playerId
    const newDisabledOpts = wrongAnswer ? [...disabledOptions, wrongAnswer] : disabledOptions
    const newDisabledPlayers = wrongPlayerId ? [...disabledPlayerIds, wrongPlayerId] : disabledPlayerIds
    const totalTime = config?.timeLimitSeconds ?? 30
    const resumeMs = (totalTime - buzzTimeRemaining) * 1000
    const resumeStartTime = Date.now() - resumeMs
    setDisabledOptions(newDisabledOpts); setDisabledPlayerIds(newDisabledPlayers)
    setBuzzState(null)
    setIsCorrect(null)
    setQuestionTimeLeft(buzzTimeRemaining); timeCountPlayedRef.current = false
    isAnsweredRef.current = true // admin still can't answer
    if (rc && currentQuestion) {
      fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameState: {
            phase: 'question',
            currentQuestionId: currentQuestion.id,
            currentTilePoints,
            questionStartTime: resumeStartTime,
            buzzState: null,
            disabledOptions: newDisabledOpts,
            disabledPlayerIds: newDisabledPlayers,
            buzzContinue: true,
          }
        })
      }).catch(() => {})
    }
    setTimerRunning(true)
    setPhase('question')
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

    const rc = roomCodeRef.current
    const isOnlineAdmin = !!rc && !joinRoomCode

    if (isOnlineAdmin) {
      // Check if all board tiles done
      const allDone = board.every(col => col.every(t => t.state === 'answered'))
      if (allDone) {
        fetch(`/api/gameshow/${shareCode}/session/${rc}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameState: { phase: 'gameover' } }) }).catch(() => {})
        setPhase('gameover')
        return
      }
      // Go back to board — broadcast board state with updated answeredQuestionIds
      const answeredIds = Array.from(answeredQuestions)
      fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameState: { phase: 'board', answeredQuestionIds: answeredIds } })
      }).catch(() => {})
      setPhase('board')
      audio.playBg('selecting', 0.5)
      return
    }

    const isLinear = config?.selectionMode === 'LINEAR'
    if (isLinear) {
      const next = linearIdx + 1
      setLinearIdx(next)
      showLinearQuestion(questions, next)
    } else {
      const allDone = board.every(col => col.every(t => t.state === 'answered'))
      if (allDone) { setPhase('gameover'); return }
      setPhase('board')
      audio.playBg('selecting', 0.5)
    }
  }, [config, linearIdx, questions, board, showLinearQuestion, audio, joinRoomCode, shareCode, answeredQuestions])

  const handleNext = () => {
    const rc = roomCodeRef.current
    const isOnlineAdmin = !!rc && !joinRoomCode

    if (isOnlineAdmin) {
      // Mark tile done and go back to board (broadcast)
      markTileDone()
      const newAnswered = new Set(Array.from(answeredQuestions).concat(currentQuestion?.id ?? ''))
      const allDone = board.every(col => col.every(t =>
        t.state === 'answered' || (currentQuestion && t.questionId === currentQuestion.id)
      ))
      if (allDone) {
        fetch(`/api/gameshow/${shareCode}/session/${rc}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameState: { phase: 'gameover' } }) }).catch(() => {})
        setPhase('gameover')
        return
      }
      if (config?.showLeaderboard) {
        fetch(`/api/gameshow/${shareCode}/session/${rc}`).then(r => r.json()).then(data => {
          if (data.players) setPlayers(data.players.map((p: any, i: number) => ({
            id: p.id, nickname: p.nickname, avatarColor: PLAYER_COLORS[i % PLAYER_COLORS.length],
            score: p.score ?? 0, correctCount: p.correctCount ?? 0, wrongCount: p.wrongCount ?? 0,
            lastPointsEarned: p.lastPointsEarned ?? 0,
          })))
        }).catch(() => {})
        fetch(`/api/gameshow/${shareCode}/session/${rc}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameState: { phase: 'leaderboard' } }) }).catch(() => {})
        audio.playBg('leaderboard', 0.6)
        setPhase('leaderboard')
      } else {
        advanceFromLeaderboard()
      }
      return
    }

    markTileDone()
    // Rotate player turn in LOCAL mode
    if (config?.playMode === 'LOCAL' && players.length > 1) {
      setCurrentPlayerIdx(prev => (prev + 1) % players.length)
    }
    // LOCAL + manualScoring
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

  const handleExitToGameover = () => {
    audio.stopAll()
    if (leaderboardTimerRef.current) clearTimeout(leaderboardTimerRef.current)
    clearInterval(timerRef.current!)
    const rc = roomCodeRef.current
    if (rc && !joinRoomCode) {
      fetch(`/api/gameshow/${shareCode}/session/${rc}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameState: { phase: 'gameover' }, status: 'FINISHED' }) }).catch(() => {})
    }
    setPhase('gameover')
  }

  // ─── Online join handlers ─────────────────────────────────────────────────
  const handleJoinRoom = async () => {
    if (!joinNickname.trim() || !joinRoomCode) return
    setJoinLoading(true); setJoinError(null)
    try {
      const res = await fetch(`/api/gameshow/${shareCode}/session/${joinRoomCode}/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: joinNickname.trim(), avatarColor: PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)] })
      })
      const data = await res.json()
      if (data.error) { setJoinError(data.error); setJoinLoading(false); return }
      setMyPlayerId(data.player.id)
      setPhase('waiting')
    } catch { setJoinError('Connection error. Please try again.') }
    setJoinLoading(false)
  }

  const hostStartGame = async () => {
    if (!roomCode || !config) return
    clearInterval(lobbyPollRef.current!)
    // Build the board for admin
    const qs = [...config.questions]
    buildBoardForOnline(qs, config)
    // Broadcast board phase to players
    try {
      await fetch(`/api/gameshow/${shareCode}/session/${roomCode}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameState: { phase: 'board', answeredQuestionIds: [] }, status: 'ACTIVE' })
      })
    } catch {}
    audio.playBg('selecting', 0.5)
    setPhase('board')
  }

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

  // ─── JOIN (player device) ─────────────────────────────────────────────────
  if (phase === 'join') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#060b2e] to-[#0d1b5e] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-6xl mb-2">📋</div>
            <h1 className="text-4xl font-black text-yellow-300 tracking-widest">JEOPARDY!</h1>
            <p className="text-blue-300 mt-1">{config?.name}</p>
          </div>
          <div className="bg-[#0d1b5e] border border-blue-500/30 rounded-3xl p-6 shadow-2xl">
            <div className="text-center mb-4">
              <p className="text-blue-300 text-sm">Room</p>
              <div className="text-3xl font-black text-yellow-300 tracking-widest">{joinRoomCode}</div>
            </div>
            <h2 className="font-bold text-white mb-3">Enter your name</h2>
            <Input value={joinNickname} onChange={e => setJoinNickname(e.target.value)}
              placeholder="Your nickname..."
              className="bg-[#0a0a2e] border-blue-500/30 text-white placeholder:text-blue-400 rounded-xl mb-4"
              onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
            />
            {joinError && <p className="text-red-400 text-sm mb-3 text-center">{joinError}</p>}
            <Button onClick={handleJoinRoom} disabled={!joinNickname.trim() || joinLoading}
              className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-lg py-6 rounded-2xl">
              {joinLoading ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'Join Game!'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ─── WAITING (player joined, waiting for host) ────────────────────────────
  if (phase === 'waiting') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#060b2e] to-[#0d1b5e] flex items-center justify-center p-4 text-white">
        <div className="text-center max-w-sm w-full">
          <div className="text-6xl mb-2">📋</div>
          <h1 className="text-4xl font-black text-yellow-300 tracking-widest mb-1">JEOPARDY!</h1>
          <h2 className="text-xl font-black mb-1 mt-4">You're in!</h2>
          <p className="text-blue-300 mb-6">Waiting for the host to pick a question…</p>
          <div className="bg-white/10 rounded-2xl p-4 mb-4">
            <p className="text-sm text-blue-200 mb-2">Players in the room ({onlineLobbyPlayers.length}):</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {onlineLobbyPlayers.map((p, i) => (
                <div key={p.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${p.id === myPlayerId ? 'bg-yellow-400/30 border border-yellow-400/50' : 'bg-white/10'}`}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ backgroundColor: PLAYER_COLORS[i % PLAYER_COLORS.length] }}>{p.nickname[0]?.toUpperCase()}</div>
                  <span className="font-medium">{p.nickname}</span>
                  {p.id === myPlayerId && <span className="text-xs text-yellow-300 ml-auto">You</span>}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-blue-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Waiting for host to pick a question…</span>
          </div>
        </div>
      </div>
    )
  }

  // ─── LOBBY (host sees room code, QR, player list) ─────────────────────────
  if (phase === 'lobby') {
    const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/gameshow/${shareCode}?room=${roomCode}` : ''
    return (
      <div className="relative min-h-screen bg-gradient-to-b from-[#060b2e] to-[#0d1b5e] flex items-center justify-center p-4 text-white">
        <MusicBtn />
        <div className="text-center max-w-sm w-full">
          <div className="text-6xl mb-2">📋</div>
          <h1 className="text-4xl font-black text-yellow-300 tracking-widest mb-4">JEOPARDY!</h1>
          <h2 className="text-xl font-black mb-1">Room Code</h2>
          <div className="text-5xl font-black tracking-widest bg-white/10 rounded-2xl py-3 mb-3">{roomCode}</div>
          <p className="text-blue-200 text-xs mb-1">Players scan to join:</p>
          {roomCode && <p className="text-xs opacity-60 mb-2 break-all px-2">{joinUrl}</p>}
          {roomCode && <LobbyQR url={joinUrl} />}
          <div className="bg-white/10 rounded-2xl p-3 mt-3 mb-3">
            <p className="text-sm text-blue-200 mb-2">Players waiting ({onlineLobbyPlayers.length}/{config?.maxPlayers ?? 8}):</p>
            {onlineLobbyPlayers.length === 0
              ? <p className="text-xs text-blue-300 italic">No players yet — share the QR code!</p>
              : <div className="flex flex-wrap gap-2 justify-center">
                {onlineLobbyPlayers.map((p) => (
                  <span key={p.id} className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium">{p.nickname}</span>
                ))}
              </div>
            }
          </div>
          <Button onClick={hostStartGame}
            className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-black text-lg py-5 rounded-2xl">
            {onlineLobbyPlayers.length === 0 ? "Start Game!" : `Start Game! (${onlineLobbyPlayers.length} players)`}
          </Button>
        </div>
      </div>
    )
  }

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
            </div>
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
    const rc = roomCodeRef.current
    const isOnlineAdmin = !!rc && !joinRoomCode
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
              {isOnlineAdmin && onlineLobbyPlayers.length > 0 && players.length === 0 && (
                <div className="text-blue-300 text-sm">{onlineLobbyPlayers.length} players connected</div>
              )}
            </div>
            {(isFreeChoice || isOnlineAdmin) && (
              <Button size="sm" variant="outline"
                onClick={handleExitToGameover}
                className="border-red-500/50 text-red-400 hover:bg-red-900/30 gap-1">
                <LogOut className="h-3.5 w-3.5" /> End Game
              </Button>
            )}
          </div>

          {isOnlineAdmin && (
            <p className="text-center text-blue-300 text-sm mb-3">Click a tile to show it to all players</p>
          )}

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

  // ─── QUESTION (Single player / Online player) ───────────────────────────────────────────────
  if ((phase === 'question' || phase === 'linear_question') && currentQuestion) {
    const options = parseOptions(currentQuestion)
    const isMCQ = options.length > 0
    const maxTime = config?.timeLimitSeconds ?? 30
    const timerPct = (questionTimeLeft / maxTime) * 100
    const timerColor = timerPct > 50 ? 'bg-blue-400' : timerPct > 25 ? 'bg-yellow-400' : 'bg-red-500'
    const waiting = config?.clickStartToCount && !timerRunning
    const rc = roomCodeRef.current
    const isOnlineAdmin = !!rc && !joinRoomCode

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
            <div className="text-sm text-blue-300">
              {joinRoomCode ? myTotalScore : (players[currentPlayerIdx]?.score ?? 0)} pts
            </div>
          </div>
          <div className="h-2 bg-gray-700 rounded-full mb-6">
            <div className={`h-full ${timerColor} rounded-full transition-all duration-1000`} style={{ width: `${timerPct}%` }} />
          </div>

          {/* Question */}
          <div className="bg-[#0d1b5e] border-2 border-blue-500/50 rounded-2xl p-5 mb-6 text-center shadow-2xl">
            {currentQuestion.imageUrl && <img src={currentQuestion.imageUrl} alt="" className="max-h-40 mx-auto mb-3 rounded-xl" />}
            <p className="text-lg sm:text-xl font-semibold leading-relaxed">{currentQuestion.stem}</p>
          </div>

          {/* Online admin: skip time / waiting indicator */}
          {isOnlineAdmin && config?.playMode !== 'BUZZ' && (
            <div className="flex justify-center mb-4">
              <button
                onClick={() => { clearInterval(timerRef.current!); setQuestionTimeLeft(0); handleQuestionTimeout() }}
                className="text-xs text-blue-400 hover:text-blue-200 border border-blue-500/30 px-4 py-1.5 rounded-full transition-all hover:bg-blue-900/40"
              >
                ⏭ End Question Early
              </button>
            </div>
          )}

          {/* BUZZ play mode: admin panel */}
          {config?.playMode === 'BUZZ' && isOnlineAdmin && (
            <div className="bg-[#0d1b5e] border border-yellow-500/30 rounded-2xl p-4 mb-4">
              {buzzState?.answer !== null && buzzState?.answer !== undefined ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-yellow-300 font-black text-lg flex items-center gap-2">
                      <Zap className="h-5 w-5"/>{buzzState.playerNickname}
                    </p>
                    <p className="text-white text-sm">answered: <span className="font-bold">{buzzState.answer}</span></p>
                  </div>
                  <Button onClick={() => {
                    clearInterval(timerRef.current!)
                    setBuzzTimeRemaining(questionTimeLeft)
                    setTimerRunning(false)
                    const rc = roomCodeRef.current
                    if (rc) fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
                      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ gameState: { phase: 'reveal' } })
                    }).catch(() => {})
                    setPhase('reveal')
                  }} className="bg-yellow-400 hover:bg-yellow-300 text-black font-black px-6 py-3 rounded-2xl">
                    Result
                  </Button>
                </div>
              ) : buzzState?.isBuzzing ? (
                <p className="text-yellow-300 font-bold text-center animate-pulse">
                  <Zap className="h-4 w-4 inline mr-1"/>{buzzState.playerNickname} buzzed in! Waiting for answer…
                </p>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-blue-400 text-sm">Waiting for a player to answer…</p>
                  <button onClick={() => { clearInterval(timerRef.current!); setQuestionTimeLeft(0); handleQuestionTimeout() }}
                    className="text-xs text-blue-400 hover:text-blue-200 underline">Skip</button>
                </div>
              )}
            </div>
          )}

          {/* Bet stars (before Start button, for players) */}
          {waiting && config?.betEnabled && betsRemaining > 0 && !isOnlineAdmin && (
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="flex gap-1">
                {Array.from({length: betsRemaining}).map((_, i) => (
                  <button key={i} onClick={() => { if (i === 0) setIsBetting(v => !v) }}
                    className={`text-2xl transition-all ${isBetting && i === 0 ? 'scale-125' : 'opacity-50 hover:opacity-80'}`}
                    title={i === 0 ? (isBetting ? 'Cancel bet' : 'Bet on this question!') : 'Available for later'}>⭐</button>
                ))}
              </div>
              {isBetting && <span className="text-yellow-300 text-sm font-bold">×{config.betMultiple} if correct!</span>}
            </div>
          )}

          {/* BUZZ play mode: Buzz button for player */}
          {config?.playMode === 'BUZZ' && !!joinRoomCode && config?.buzzButton && !buzzState && !submitted && !disabledPlayerIds.includes(myPlayerId || '') && (
            <div className="flex justify-center mb-4">
              <button onClick={handleBuzzButton} disabled={hasBuzzed}
                className="px-10 py-5 rounded-2xl bg-red-500 hover:bg-red-400 active:scale-95 border-4 border-red-700 text-white font-black text-2xl shadow-[0_8px_0_#991b1b] active:shadow-[0_2px_0_#991b1b] active:translate-y-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                <Zap className="h-6 w-6 inline mr-2"/>BUZZ!
              </button>
            </div>
          )}

          {/* BUZZ play mode: eliminated player overlay */}
          {config?.playMode === 'BUZZ' && !!joinRoomCode && disabledPlayerIds.includes(myPlayerId || '') && (
            <div className="fixed inset-0 bg-[#060b2e]/85 flex items-center justify-center z-40">
              <div className="text-center p-6 rounded-2xl bg-[#0d1b5e] border-2 border-red-500/40 max-w-xs w-full mx-4">
                <XCircle className="h-10 w-10 text-red-400 mx-auto mb-2"/>
                <p className="text-red-300 font-black text-xl mb-1">Wrong Answer!</p>
                <p className="text-blue-300 text-sm">Others are still answering…</p>
                <p className="text-xs text-blue-400 mt-3">Waiting for host to reveal…</p>
              </div>
            </div>
          )}

          {/* BUZZ play mode: player overlay — someone else answered */}
          {config?.playMode === 'BUZZ' && !!joinRoomCode && buzzState && buzzState.playerId !== myPlayerId && !submitted && !disabledPlayerIds.includes(myPlayerId || '') && (
            <div className="fixed inset-0 bg-[#060b2e]/85 flex items-center justify-center z-40">
              <div className="text-center p-6 rounded-2xl bg-[#0d1b5e] border-2 border-yellow-500/40 max-w-xs w-full mx-4">
                <Zap className="h-10 w-10 text-yellow-400 mx-auto mb-2 animate-pulse"/>
                <p className="text-yellow-300 font-black text-xl mb-1">{buzzState.playerNickname}</p>
                <p className="text-blue-300 text-sm">answered first!</p>
                <p className="text-xs text-blue-400 mt-3">Waiting for host to reveal result…</p>
              </div>
            </div>
          )}

          {/* Online player: submitted overlay */}
          {submitted && !!joinRoomCode && (
            <div className="fixed inset-0 bg-[#060b2e]/90 flex items-center justify-center z-50">
              <div className={`text-center p-8 rounded-3xl border-2 max-w-xs w-full mx-4 shadow-2xl ${isCorrect ? 'bg-green-900/60 border-green-500' : 'bg-red-900/60 border-red-500'}`}>
                <div className="text-6xl mb-3">{isCorrect ? '✅' : '❌'}</div>
                <p className={`text-2xl font-black mb-2 ${isCorrect ? 'text-green-300' : 'text-red-300'}`}>
                  {isCorrect ? 'Correct!' : 'Wrong!'}
                </p>
                {myLastPts > 0 && (
                  <p className="text-yellow-300 font-bold text-lg mb-1">+${myLastPts}</p>
                )}
                <p className="text-white/70 text-sm mb-4">Total: <strong className="text-white">${myTotalScore}</strong></p>
                <Loader2 className="h-4 w-4 animate-spin text-blue-300 mx-auto mb-1" />
                <p className="text-blue-300 text-xs">Waiting for host to reveal…</p>
              </div>
            </div>
          )}

          {waiting && !isOnlineAdmin ? (
            <div className="flex flex-col items-center gap-4">
              <p className="text-blue-300 text-sm">Press Start when ready to begin the timer</p>
              <Button onClick={handleStartTimer}
                className="bg-yellow-400 hover:bg-yellow-300 text-black font-black text-lg px-10 py-5 rounded-2xl gap-2">
                <Play className="h-5 w-5" /> Start Timer
              </Button>
            </div>
          ) : isMCQ ? (
            /* MCQ options — disabled and view-only for online admin */
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${config?.playMode === 'BUZZ' && !!joinRoomCode && ((config?.buzzButton && !hasBuzzed && !buzzState) || (!!buzzState && buzzState.playerId !== myPlayerId) || disabledPlayerIds.includes(myPlayerId || '')) ? 'opacity-60 pointer-events-none' : ''}`}>
              {options.map((opt, i) => {
                const isDisabledOpt = disabledOptions.includes(opt)
                return (
                  <button key={opt} onClick={() => !isOnlineAdmin && !isDisabledOpt && handleSingleAnswer(opt)}
                    disabled={submitted || isOnlineAdmin || isDisabledOpt || (!!joinRoomCode && disabledPlayerIds.includes(myPlayerId || ''))}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left font-medium transition-all
                      ${isOnlineAdmin ? 'bg-[#0d1b5e] border-blue-500/30 opacity-80 cursor-default'
                      : isDisabledOpt ? 'bg-gray-900 border-gray-700 opacity-30 cursor-not-allowed line-through'
                      : 'bg-[#0d1b5e] border-blue-500/50 hover:bg-[#1a2f8e] hover:border-yellow-400 hover:scale-[1.02] active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'}`}>
                    <span className="w-7 h-7 rounded-full bg-yellow-400 text-black font-black text-xs flex items-center justify-center flex-shrink-0">
                      {isDisabledOpt ? '✗' : ['A', 'B', 'C', 'D'][i]}
                    </span>
                    <span className="text-sm">{opt}</span>
                  </button>
                )
              })}
              {isOnlineAdmin && config?.playMode !== 'BUZZ' && (
                <p className="col-span-2 text-center text-blue-400 text-xs mt-1">Players are answering — options shown for reference</p>
              )}
            </div>
          ) : isOnlineAdmin && config?.playMode !== 'BUZZ' ? (
            <div className="text-center text-blue-300 py-8">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-sm">Players are answering…</p>
            </div>
          ) : !isOnlineAdmin ? (
            <div className={`flex gap-3 ${config?.playMode === 'BUZZ' && !!joinRoomCode && ((config?.buzzButton && !hasBuzzed && !buzzState) || (!!buzzState && buzzState.playerId !== myPlayerId) || disabledPlayerIds.includes(myPlayerId || '')) ? 'opacity-60 pointer-events-none' : ''}`}>
              <Input value={textAnswer} onChange={e => setTextAnswer(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && textAnswer.trim() && handleSingleAnswer(textAnswer)}
                placeholder="Type your answer..." autoFocus disabled={submitted}
                className="bg-[#0d1b5e] border-blue-500/30 text-white placeholder:text-blue-400 rounded-xl text-lg py-6" />
              <Button onClick={() => textAnswer.trim() && handleSingleAnswer(textAnswer)}
                disabled={!textAnswer.trim() || submitted}
                className="bg-yellow-400 text-black font-bold hover:bg-yellow-300 rounded-xl px-6">
                Submit
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  // ─── RESPOND PHASE (local multiplayer) ────────────────────────────────────
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
    const rc = roomCodeRef.current
    const isOnlineAdmin = !!rc && !joinRoomCode

    return (
      <div className="relative min-h-screen bg-[#060b2e] text-white flex flex-col items-center justify-center p-4">
        <MusicBtn />
        <div className="w-full max-w-lg">

          {/* Online player reveal */}
          {joinRoomCode ? (
            <div className={`text-center p-6 rounded-2xl mb-6 border-2 ${isCorrect === true ? 'bg-green-900/40 border-green-500' : isCorrect === false ? 'bg-red-900/40 border-red-500' : 'bg-gray-900/40 border-gray-500'}`}>
              {isCorrect === true
                ? <><CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-2" /><p className="text-2xl font-black text-green-300">Correct! +${myLastPts}</p></>
                : isCorrect === false
                ? <><XCircle className="h-12 w-12 text-red-400 mx-auto mb-2" /><p className="text-2xl font-black text-red-300">Wrong!</p></>
                : <><XCircle className="h-12 w-12 text-gray-400 mx-auto mb-2" /><p className="text-2xl font-black text-gray-300">Time&apos;s Up!</p></>
              }
              <div className="mt-3 bg-black/20 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">Correct answer:</p>
                <p className="text-yellow-300 font-bold">{corrects.join(' / ')}</p>
              </div>
              {currentQuestion.explanation && (
                <div className="mt-2 bg-blue-900/30 rounded-xl p-3 text-sm text-blue-200">
                  💡 {currentQuestion.explanation}
                </div>
              )}
              <p className="text-white/60 text-sm mt-2">Total: ${myTotalScore}</p>
              <div className="flex items-center justify-center gap-2 text-blue-300 mt-3">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-xs">Waiting for host to advance…</span>
              </div>
            </div>
          ) : (
            /* Admin / local reveal */
            <>
              {isOnlineAdmin ? (
                <div className="text-center p-6 rounded-2xl mb-6 border-2 bg-[#0d1b5e] border-blue-500/40">
                  <CheckCircle2 className="h-12 w-12 text-blue-400 mx-auto mb-2" />
                  <p className="text-2xl font-black text-blue-200">Answer Revealed</p>
                  <div className="mt-3 bg-black/30 rounded-xl p-3 text-sm">
                    <p className="text-gray-400 text-xs mb-1">Correct answer:</p>
                    <p className="text-yellow-300 font-bold">{corrects.join(' / ')}</p>
                  </div>
                </div>
              ) : (
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
              )}

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

              {/* BUZZ mode: who answered and their result */}
              {config?.playMode === 'BUZZ' && !joinRoomCode && buzzState && (
                <div className={`rounded-2xl p-4 mb-4 border-2 ${buzzState.isCorrect ? 'bg-green-900/30 border-green-500/50' : 'bg-red-900/30 border-red-500/50'}`}>
                  <div className="flex items-center gap-3">
                    <Zap className="h-5 w-5 text-yellow-400 flex-shrink-0"/>
                    <div>
                      <p className="font-bold text-white">{buzzState.playerNickname}</p>
                      <p className="text-sm text-gray-300">answered: <span className="font-bold">{buzzState.answer}</span></p>
                    </div>
                    <div className="ml-auto">
                      {buzzState.isCorrect
                        ? <CheckCircle2 className="h-6 w-6 text-green-400"/>
                        : <XCircle className="h-6 w-6 text-red-400"/>}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                {config?.playMode === 'BUZZ' && buzzState?.isCorrect === false && currentQuestion &&
                  parseOptions(currentQuestion).filter(opt => ![...disabledOptions, buzzState?.answer].filter(Boolean).includes(opt)).length > 1 && (
                  <Button onClick={handleBuzzContinue}
                    className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-4 rounded-2xl">
                    Continue
                  </Button>
                )}
                <Button onClick={handleNext} className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-5 rounded-2xl text-lg">
                  {isFreeChoice ? 'Back to Board' : 'Next Question'} <ChevronRight className="h-5 w-5 ml-1" />
                </Button>
              </div>
            </>
          )}
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
    const rc = roomCodeRef.current
    const isOnlineAdmin = !!rc && !joinRoomCode
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
          {joinRoomCode ? (
            <div className="flex items-center justify-center gap-2 text-blue-300 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Waiting for host…</span>
            </div>
          ) : (
            <div className="text-center space-y-3">
              {!isOnlineAdmin && <p className="text-blue-300 text-sm">Auto-continuing in 5 seconds…</p>}
              <div className="flex gap-3 justify-center">
                <Button onClick={advanceFromLeaderboard} className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-8 py-4 rounded-2xl">
                  Continue <ChevronRight className="h-5 w-5 ml-1" />
                </Button>
                {(isFreeChoice || isOnlineAdmin) && (
                  <Button onClick={handleExitToGameover} variant="outline"
                    className="border-red-500/50 text-red-400 hover:bg-red-900/30 px-6 py-4 rounded-2xl gap-1">
                    <LogOut className="h-4 w-4" /> End Game
                  </Button>
                )}
              </div>
            </div>
          )}
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
            {!joinRoomCode && (
              <Button onClick={() => { audio.stopAll(); setPhase('setup'); setSetupNames([setupNames[0] || '']); audio.playBg('opening', 0.5) }}
                variant="outline" className="flex-1 border-blue-500/30 text-blue-300 hover:bg-blue-900/30 rounded-2xl">
                <RotateCcw className="h-4 w-4 mr-2" /> Play Again
              </Button>
            )}
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
