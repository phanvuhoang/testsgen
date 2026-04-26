'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Trophy, Phone, Users, CheckCircle2, XCircle, ChevronRight, RotateCcw, Home, Volume2, VolumeX, QrCode, LogOut, Wifi, Zap } from 'lucide-react'
import { useAudio } from '../../useAudio'
import QRCode from 'qrcode'

// ─── Types ───────────────────────────────────────────────────────────────────
type Question = {
  id: string; stem: string; questionType: string
  options: string[] | string | null; correctAnswer: string
  explanation: string | null; difficulty: string
  points: number; topic: string | null; tags: string | null
  sortOrder: number; imageUrl?: string | null
}
type GameshowConfig = {
  id: string; shareCode: string; name: string; type: string
  playMode: 'SINGLE' | 'LOCAL' | 'ONLINE' | 'BUZZ'; selectionMode: 'LINEAR' | 'FREE_CHOICE'
  scoringMode: 'SPEED_ACCURACY' | 'ACCURACY_ONLY'; questionsCount: number | null
  timeLimitSeconds: number; enableLifelines: boolean; lifelines: string | null
  shuffleQuestions: boolean; showLeaderboard: boolean; clickStartToCount: boolean
  buzzerMode: boolean; manualScoring: boolean; buzzButton: boolean
  betEnabled: boolean; betTimes: number; betMultiple: number; betWrongAnswer: string
  maxPlayers: number; shortLink: string | null; quizSetTitle: string; questions: Question[]
}
type Player = {
  id: string; nickname: string; avatarColor: string
  score: number; correctCount: number; wrongCount: number; streak: number
  usedLifelines: string[]
  lastPointsEarned?: number
}
type LifelineType = '5050' | 'phone' | 'audience'
type Phase = 'setup' | 'lobby' | 'join' | 'waiting' | 'intro' | 'select' | 'question' | 'reveal' | 'scoring' | 'leaderboard' | 'gameover'

// ─── Colors ──────────────────────────────────────────────────────────────────
const PLAYER_COLORS = ['#6366f1', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

// ─── Tone SFX ────────────────────────────────────────────────────────────────
function playTone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime)
    gain.gain.setValueAtTime(vol, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.start(); osc.stop(ctx.currentTime + dur)
  } catch {}
}
const TONE = {
  tick: () => playTone(800, 0.05, 'square', 0.1),
  lifeline: () => { playTone(440, 0.1); setTimeout(() => playTone(550, 0.2), 100) },
}

// ─── Utilities ───────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
  return a
}
function parseOptions(q: Question): string[] {
  if (!q.options) return []
  if (Array.isArray(q.options)) return q.options as string[]
  if (typeof q.options === 'string') {
    try { const p = JSON.parse(q.options); return Array.isArray(p) ? p : [] } catch { return (q.options as string).split('|') }
  }
  return []
}
function getCorrectAnswers(q: Question): string[] {
  return q.correctAnswer.split('||').map(s => s.trim()).filter(Boolean)
}
function getPoints(d: string) { if (d === 'HARD') return 50; if (d === 'MEDIUM') return 25; return 10 }

// ─── LobbyQR ─────────────────────────────────────────────────────────────────
function LobbyQR({ url }: { url: string }) {
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    if (url) QRCode.toDataURL(url, { margin: 1, width: 280 }).then(setQr).catch(() => {})
  }, [url])
  if (!qr) return <div className="w-48 h-48 mx-auto bg-white/20 rounded-2xl animate-pulse mb-2" />
  return <img src={qr} alt="QR Code" className="w-56 h-56 mx-auto rounded-2xl border-4 border-white/40 mb-2" />
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function WwtbamPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const shareCode = params.shareCode as string
  // ?room=ROOMCODE → player is joining an existing online session
  const joinRoomCode = searchParams.get('room')

  const [config, setConfig] = useState<GameshowConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [musicEnabled, setMusicEnabled] = useState(true)

  const audio = useAudio(musicEnabled)

  // Game state
  const [phase, setPhase] = useState<Phase>('setup')
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [timeLeft, setTimeLeft] = useState(30)
  const [questionStartTime, setQuestionStartTime] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [eliminatedOptions, setEliminatedOptions] = useState<string[]>([])
  const [phoneAnswer, setPhoneAnswer] = useState<string | null>(null)
  const [audienceData, setAudienceData] = useState<Record<string, number> | null>(null)
  const [showLifelineResult, setShowLifelineResult] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')

  // Players
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0)
  const [setupNames, setSetupNames] = useState([''])
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set())
  const [scoringAdjustments, setScoringAdjustments] = useState<Record<string, number>>({})

  // Online multiplayer — join flow (player device)
  const [joinNickname, setJoinNickname] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinLoading, setJoinLoading] = useState(false)
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [onlineLobbyPlayers, setOnlineLobbyPlayers] = useState<{ id: string; nickname: string }[]>([])
  const lobbyPollRef = useRef<NodeJS.Timeout | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)

  // Online player personal score tracking
  const [myLastPts, setMyLastPts] = useState(0)
  const [myTotalScore, setMyTotalScore] = useState(0)

  // Online player submitted overlay state (separate from answeredRef)
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

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const timeCountPlayedRef = useRef(false)
  // answeredRef: guards timeout / double-answer for all modes
  const answeredRef = useRef(false)
  // submittedRef: synced copy of submitted for stale-closure-safe SSE handler
  const submittedRef = useRef(false)
  // currentIdxRef: synced copy for SSE handler
  const currentIdxRef = useRef(0)
  const roomCodeRef = useRef<string | null>(null)
  const evsRef = useRef<EventSource | null>(null)
  const configRef = useRef<GameshowConfig | null>(null)

  const currentQuestion = questions[currentIdx]
  const currentPlayer = players[currentPlayerIdx]

  // Sync refs
  useEffect(() => { roomCodeRef.current = roomCode }, [roomCode])
  useEffect(() => { configRef.current = config }, [config])
  useEffect(() => { submittedRef.current = submitted }, [submitted])
  useEffect(() => { currentIdxRef.current = currentIdx }, [currentIdx])

  // ─── Fetch config — detect join vs admin flow ────────────────────────────
  useEffect(() => {
    fetch(`/api/gameshow/${shareCode}`)
      .then(r => r.json())
      .then(async data => {
        if (data.error) { setError(data.error); setLoading(false); return }
        if (data.type !== 'WWTBAM') { setError('This gameshow is not a WWTBAM game'); setLoading(false); return }
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
            const gs = sData.gameState ? (typeof sData.gameState === 'string' ? JSON.parse(sData.gameState) : sData.gameState) : {}
            const serverOrder: string[] = gs.questionOrder ?? []
            const allQs: Question[] = data.questions ?? []
            const orderedQs = serverOrder.length > 0
              ? serverOrder.map((id: string) => allQs.find(q => q.id === id)).filter(Boolean) as Question[]
              : allQs
            setQuestions(orderedQs.length > 0 ? orderedQs : allQs)
            setRoomCode(sData.roomCode)
            setOnlineLobbyPlayers([])
            setPhase('lobby')
            audio.playBg('opening', 0.5)
          } catch {
            setError('Failed to create game session')
          }
          setLoading(false)
        } else {
          setLoading(false)
        }
      })
      .catch(() => { setError('Failed to load gameshow'); setLoading(false) })
  }, [shareCode])

  // Play opening music on setup screen (non-online)
  useEffect(() => {
    if (phase === 'setup' && !loading && !joinRoomCode) audio.playBg('opening', 0.5)
  }, [phase, loading])

  // ─── Stop audio on gameover ──────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'gameover') audio.stopAll()
  }, [phase])

  // ─── Online lobby polling — host polls for players joining ───────────────
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

  // ─── Online player: subscribe to SSE after joining room ─────────────────
  useEffect(() => {
    if (!joinRoomCode || !myPlayerId) return
    let cancelled = false

    const init = async () => {
      try {
        const res = await fetch(`/api/gameshow/${shareCode}/session/${joinRoomCode}`)
        const data = await res.json()
        if (cancelled || !data.gameshow) return
        const qs = data.gameshow.quizSet?.questions ?? []
        const gs = data.gameState ? (typeof data.gameState === 'string' ? JSON.parse(data.gameState) : data.gameState) : {}
        const orderedQs = gs?.questionOrder
          ? gs.questionOrder.map((id: string) => qs.find((q: any) => q.id === id)).filter(Boolean)
          : qs
        setQuestions(orderedQs)
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
              streak: p.streak ?? 0, usedLifelines: [],
              lastPointsEarned: p.lastPointsEarned ?? 0,
            })))
            const myIdx = msg.players.findIndex((p: any) => p.id === myPlayerId)
            if (myIdx >= 0) setCurrentPlayerIdx(myIdx)
          }

          const gs = msg.gameState
          if (!gs) return

          if (gs.phase === 'question') {
            const idx = gs.currentQuestionIndex ?? 0
            const startTime = gs.questionStartTime ?? Date.now()
            const elapsed = (Date.now() - startTime) / 1000
            const cfg = configRef.current
            const remaining = Math.max(1, Math.round((cfg?.timeLimitSeconds ?? 30) - elapsed))
            // buzzContinue: admin pressed Continue — reset all players' states
            const isBuzzContinue = gs.buzzContinue === true
            const isNewQuestion = isBuzzContinue || idx !== currentIdxRef.current || !submittedRef.current
            if (isNewQuestion) {
              setCurrentIdx(idx)
              setSelectedAnswer(null)
              setSubmitted(false); setIsCorrect(null)
              setMyLastPts(0)
              answeredRef.current = false
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
            setTimeLeft(remaining)
            setQuestionStartTime(startTime)
            setPhase('question')
          } else if (gs.phase === 'reveal') {
            clearInterval(timerRef.current!)
            setPhase('reveal')
          } else if (gs.phase === 'select') {
            clearInterval(timerRef.current!)
            if (gs.answeredQuestionIds) setAnsweredQuestions(new Set(gs.answeredQuestionIds))
            setPhase('waiting')
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
            streak: p.streak ?? 0, usedLifelines: [], lastPointsEarned: p.lastPointsEarned ?? 0,
          })))
        }
      } catch {}
    }
    return () => es.close()
  }, [roomCode, config?.playMode, shareCode, joinRoomCode])

  // ─── Timer effect ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!timerRunning || phase !== 'question' || !config) return
    timeCountPlayedRef.current = false
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 5 && !timeCountPlayedRef.current) {
          timeCountPlayedRef.current = true
          audio.playTimeCount()
        }
        if (prev <= 1) { clearInterval(timerRef.current!); handleTimeout(); return 0 }
        TONE.tick()
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current!)
  }, [timerRunning, phase, currentIdx, config])

  // ─── handleTimeout ───────────────────────────────────────────────────────
  const handleTimeout = useCallback(() => {
    if (answeredRef.current) return
    answeredRef.current = true
    audio.stopAll()
    audio.stopTimeCount()

    const rc = roomCodeRef.current

    if (joinRoomCode) {
      // Online player: timer ran out — just mark submitted, wait for SSE reveal
      setIsCorrect(false)
      setSubmitted(true)
      return
    }

    // Admin or local: play lost sound
    audio.playOnce('lost', 0.9)
    setIsCorrect(false)

    if (rc) {
      // Online admin: fetch latest scores then broadcast reveal
      fetch(`/api/gameshow/${shareCode}/session/${rc}`).then(r => r.json()).then(data => {
        if (data.players) setPlayers(data.players.map((p: any, i: number) => ({
          id: p.id, nickname: p.nickname, avatarColor: PLAYER_COLORS[i % PLAYER_COLORS.length],
          score: p.score ?? 0, correctCount: p.correctCount ?? 0, wrongCount: p.wrongCount ?? 0,
          streak: p.streak ?? 0, usedLifelines: [], lastPointsEarned: p.lastPointsEarned ?? 0,
        })))
      }).catch(() => {})
      fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameState: { phase: 'reveal' } })
      }).catch(() => {})
      setTimeout(() => setPhase('reveal'), 800)
    } else {
      // Local/single mode
      setPhase('reveal')
    }
  }, [joinRoomCode, shareCode])

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
    if (names.length === 0) return
    let qs = [...config.questions]
    if (config.shuffleQuestions) qs = shuffle(qs)
    if (config.questionsCount && config.questionsCount < qs.length) qs = qs.slice(0, config.questionsCount)
    setQuestions(qs)
    setPlayers(names.map((n, i) => ({
      id: `p${i}`, nickname: n.trim() || `Player ${i + 1}`,
      avatarColor: ['#028a39', '#6366f1', '#f59e0b', '#ef4444'][i] || '#028a39',
      score: 0, correctCount: 0, wrongCount: 0, streak: 0, usedLifelines: [],
    })))
    setCurrentPlayerIdx(0); setCurrentIdx(0)
    setAnsweredQuestions(new Set())
    audio.stop('opening')
    if (config.selectionMode === 'FREE_CHOICE') {
      audio.playBg('selecting', 0.5)
      setPhase('select')
    } else {
      setPhase('intro')
      setTimeout(() => beginQuestion(0), 1800)
    }
  }

  const beginQuestion = (idx: number, qs?: Question[]) => {
    setCurrentIdx(idx)
    setSelectedAnswer(null); setIsCorrect(null)
    setEliminatedOptions([]); setPhoneAnswer(null)
    setAudienceData(null); setShowLifelineResult(false)
    setTimeLeft(config?.timeLimitSeconds ?? 30)
    setQuestionStartTime(Date.now())
    timeCountPlayedRef.current = false
    answeredRef.current = false
    setSubmitted(false)
    setBuzzState(null); setDisabledOptions([]); setDisabledPlayerIds([]); setHasBuzzed(false); setIsBetting(false)
    setPhase('question')

    if (config?.clickStartToCount) {
      audio.playBg('wait', 0.5)
      setTimerRunning(false)
    } else {
      audio.playBg('game-play', 0.55)
      setTimerRunning(true)
    }
  }

  const handleStartCount = () => {
    audio.stop('wait')
    audio.playBg('game-play', 0.55)
    setQuestionStartTime(Date.now())
    setTimerRunning(true)
  }

  const handleAnswer = (answer: string) => {
    if (answeredRef.current || selectedAnswer || phase !== 'question') return
    if (config?.clickStartToCount && !timerRunning) return
    // Online admin cannot answer
    if (!!roomCodeRef.current && !joinRoomCode) return
    const isBuzzMode = config?.playMode === 'BUZZ'
    if (isBuzzMode && buzzState && buzzState.playerId !== myPlayerId) return
    if (isBuzzMode && config?.buzzButton && !hasBuzzed) return
    if (disabledOptions.includes(answer)) return
    answeredRef.current = true
    clearInterval(timerRef.current!)
    audio.stopAll()
    audio.stopTimeCount()

    const q = currentQuestion
    const corrects = getCorrectAnswers(q)
    const correct = corrects.some(c => c.toLowerCase() === answer.toLowerCase())
    const elapsed = (Date.now() - questionStartTime) / 1000
    const totalTime = config?.timeLimitSeconds ?? 30
    const timePct = Math.max(0, (totalTime - elapsed) / totalTime)
    const base = getPoints(q.difficulty)
    let pts = config?.scoringMode === 'ACCURACY_ONLY'
      ? (correct ? base : 0)
      : (correct ? Math.round(base * (0.3 + 0.7 * timePct)) : 0)
    // Apply bet multiplier
    if (isBetting) {
      if (correct) pts = Math.round(pts * (config?.betMultiple ?? 2))
      else { const wa = config?.betWrongAnswer ?? 'NO_DEDUCTION'; pts = wa === '1x' ? -base : wa === 'Multiple' ? -Math.round(base * (config?.betMultiple ?? 2)) : 0 }
      setBetsRemaining(prev => Math.max(0, prev - 1)); setIsBetting(false)
    }

    setSelectedAnswer(answer); setIsCorrect(correct)

    if (joinRoomCode && myPlayerId) {
      // Online player: track local score + submit to server
      setMyLastPts(pts)
      setMyTotalScore(prev => prev + pts)
      setSubmitted(true)
      if (correct) audio.playOnce('win', 0.9)
      else audio.playOnce('lost', 0.9)
      fetch(`/api/gameshow/${shareCode}/session/${joinRoomCode}/answer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: myPlayerId, questionId: currentQuestion.id, answer, responseTimeMs: Math.round(elapsed * 1000), isCorrect: correct, pointsEarned: pts, bet: isBetting })
      }).then(r => r.json()).then(data => {
        if (isBuzzMode && data.ok === false && data.reason === 'already_buzzed') {
          answeredRef.current = false
          setSubmitted(false); setSelectedAnswer(null); setIsCorrect(null)
        }
      }).catch(() => {})
      return
    }

    setPlayers(prev => prev.map((p, i) => i !== currentPlayerIdx ? p : {
      ...p, score: p.score + pts,
      correctCount: correct ? p.correctCount + 1 : p.correctCount,
      wrongCount: !correct ? p.wrongCount + 1 : p.wrongCount,
      streak: correct ? p.streak + 1 : 0,
    }))
    setAnsweredQuestions(prev => new Set(Array.from(prev).concat(currentQuestion.id)))
    saveAnalytics(currentQuestion.id, answer, correct, pts, (Date.now() - questionStartTime))

    if (correct) audio.playOnce('win', 0.9)
    else audio.playOnce('lost', 0.9)
    setTimeout(() => setPhase('reveal'), 1500)
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
    setSelectedAnswer(null); setIsCorrect(null)
    setTimeLeft(buzzTimeRemaining); timeCountPlayedRef.current = false; answeredRef.current = false
    if (rc) {
      fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameState: { phase: 'question', currentQuestionIndex: currentIdx, questionStartTime: resumeStartTime, buzzState: null, disabledOptions: newDisabledOpts, disabledPlayerIds: newDisabledPlayers, buzzContinue: true } })
      }).catch(() => {})
    }
    setTimerRunning(true)
    setPhase('question')
  }

  const advanceFromLeaderboard = (isLastQ: boolean) => {
    audio.stop('leaderboard')
    const rc = roomCodeRef.current
    const isOnlineAdmin = !!rc && !joinRoomCode

    if (isOnlineAdmin) {
      if (isLastQ) {
        fetch(`/api/gameshow/${shareCode}/session/${rc}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameState: { phase: 'gameover' } }) }).catch(() => {})
        setPhase('gameover'); return
      }
      if (config?.selectionMode === 'FREE_CHOICE') {
        fetch(`/api/gameshow/${shareCode}/session/${rc}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameState: { phase: 'select' } }) }).catch(() => {})
        audio.playBg('selecting', 0.5); setPhase('select'); return
      }
      const nextIdx = currentIdx + 1
      const startTime = Date.now()
      fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameState: { phase: 'question', currentQuestionIndex: nextIdx, questionStartTime: startTime, buzzState: null, disabledOptions: [], disabledPlayerIds: [] } })
      }).catch(() => {})
      beginQuestion(nextIdx); return
    }

    const isLocal = config?.playMode === 'LOCAL'
    const isFreeChoice = config?.selectionMode === 'FREE_CHOICE'
    if (isLocal) {
      const next = (currentPlayerIdx + 1) % players.length
      if (isLastQ && next === 0) { setPhase('gameover'); return }
      setCurrentPlayerIdx(next)
      if (isFreeChoice) { audio.playBg('selecting', 0.5); setPhase('select') }
      else beginQuestion(isLastQ ? 0 : currentIdx + 1)
    } else {
      if (isLastQ) { setPhase('gameover'); return }
      if (isFreeChoice) { audio.playBg('selecting', 0.5); setPhase('select') }
      else beginQuestion(currentIdx + 1)
    }
  }

  const handleNext = () => {
    const isLastQ = answeredQuestions.size >= questions.length ||
      (config?.selectionMode === 'LINEAR' && currentIdx >= questions.length - 1)
    setTimerRunning(false)
    audio.stopAll()

    const rc = roomCodeRef.current
    const isOnlineAdmin = !!rc && !joinRoomCode

    if (isOnlineAdmin) {
      if (isLastQ) {
        fetch(`/api/gameshow/${shareCode}/session/${rc}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameState: { phase: 'gameover' } }) }).catch(() => {})
        setPhase('gameover'); return
      }
      if (config?.showLeaderboard) {
        fetch(`/api/gameshow/${shareCode}/session/${rc}`).then(r => r.json()).then(data => {
          if (data.players) setPlayers(data.players.map((p: any, i: number) => ({
            id: p.id, nickname: p.nickname, avatarColor: PLAYER_COLORS[i % PLAYER_COLORS.length],
            score: p.score ?? 0, correctCount: p.correctCount ?? 0, wrongCount: p.wrongCount ?? 0,
            streak: p.streak ?? 0, usedLifelines: [], lastPointsEarned: p.lastPointsEarned ?? 0,
          })))
        }).catch(() => {})
        fetch(`/api/gameshow/${shareCode}/session/${rc}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameState: { phase: 'leaderboard' } }) }).catch(() => {})
        audio.playBg('leaderboard', 0.6); setPhase('leaderboard')
      } else {
        advanceFromLeaderboard(isLastQ)
      }
      return
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
      setTimeout(() => advanceFromLeaderboard(isLastQ), 5000)
    } else {
      advanceFromLeaderboard(isLastQ)
    }
  }

  const confirmScoring = () => {
    const isLastQ = answeredQuestions.size >= questions.length ||
      (config?.selectionMode === 'LINEAR' && currentIdx >= questions.length - 1)
    if (Object.keys(scoringAdjustments).length > 0) {
      setPlayers(prev => prev.map(p => ({ ...p, score: p.score + (scoringAdjustments[p.id] ?? 0) })))
    }
    if (config?.showLeaderboard && players.length > 0) {
      audio.playBg('leaderboard', 0.6)
      setPhase('leaderboard')
      setTimeout(() => advanceFromLeaderboard(isLastQ), 5000)
    } else {
      advanceFromLeaderboard(isLastQ)
    }
  }

  const goToSelect = () => {
    setTimerRunning(false)
    audio.stopAll()
    const rc = roomCodeRef.current
    const isOnlineAdmin = !!rc && !joinRoomCode
    // Mark current question as answered (admin never goes through handleAnswer)
    const newAnswered = currentQuestion
      ? new Set(Array.from(answeredQuestions).concat(currentQuestion.id))
      : answeredQuestions
    if (currentQuestion) setAnsweredQuestions(newAnswered)

    if (newAnswered.size >= questions.length) {
      if (isOnlineAdmin) {
        fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameState: { phase: 'gameover' }, status: 'FINISHED' })
        }).catch(() => {})
      }
      setPhase('gameover')
      return
    }
    if (isOnlineAdmin) {
      fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameState: { phase: 'select', answeredQuestionIds: Array.from(newAnswered) } })
      }).catch(() => {})
    }
    audio.playBg('selecting', 0.5)
    setPhase('select')
  }

  const saveAnalytics = (questionId: string, answer: string, correct: boolean, pts: number, elapsedMs: number) => {
    try {
      fetch('/api/gameshow/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameshowId: config?.id,
          gameType: 'WWTBAM',
          playerNickname: currentPlayer?.nickname,
          questionId, answer, correct, points: pts, elapsedMs,
        })
      }).catch(() => {})
    } catch {}
  }

  // ─── Online join handlers ────────────────────────────────────────────────
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
    if (!roomCode) return
    clearInterval(lobbyPollRef.current!)
    if (config?.selectionMode === 'FREE_CHOICE') {
      // FREE_CHOICE: go to select screen so admin can pick questions
      try {
        await fetch(`/api/gameshow/${shareCode}/session/${roomCode}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameState: { phase: 'select', questionOrder: questions.map(q => q.id), answeredQuestionIds: [] }, status: 'ACTIVE' })
        })
      } catch {}
      audio.playBg('selecting', 0.5)
      setPhase('select')
    } else {
      const startTime = Date.now()
      try {
        await fetch(`/api/gameshow/${shareCode}/session/${roomCode}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameState: { phase: 'question', currentQuestionIndex: 0, questionStartTime: startTime, questionOrder: questions.map(q => q.id), buzzState: null, disabledOptions: [], disabledPlayerIds: [] }, status: 'ACTIVE' })
        })
      } catch {}
      beginQuestion(0)
    }
  }

  // ─── Lifelines ───────────────────────────────────────────────────────────
  const useFiftyFifty = () => {
    if (!currentQuestion) return
    TONE.lifeline()
    const opts = parseOptions(currentQuestion)
    const corrects = getCorrectAnswers(currentQuestion)
    const wrongs = opts.filter(o => !corrects.includes(o))
    setEliminatedOptions(shuffle(wrongs).slice(0, Math.min(2, wrongs.length - 1)))
    updateLifeline('5050')
  }
  const usePhone = () => {
    if (!currentQuestion) return
    TONE.lifeline()
    setPhoneAnswer(getCorrectAnswers(currentQuestion)[0])
    setShowLifelineResult(true); updateLifeline('phone')
    setTimeout(() => setShowLifelineResult(false), 4000)
  }
  const useAudience = () => {
    if (!currentQuestion) return
    TONE.lifeline()
    const opts = parseOptions(currentQuestion)
    const corrects = getCorrectAnswers(currentQuestion)
    const data: Record<string, number> = {}; let rem = 100
    opts.forEach((o, i) => {
      const isC = corrects.includes(o)
      const v = isC ? Math.round(40 + Math.random() * 30) : Math.round(5 + Math.random() * 15)
      data[o] = Math.min(v, rem - (opts.length - i - 1) * 5); rem -= data[o]
    })
    setAudienceData(data); setShowLifelineResult(true); updateLifeline('audience')
  }
  const updateLifeline = (type: LifelineType) => {
    setPlayers(prev => prev.map((p, i) => i !== currentPlayerIdx ? p : { ...p, usedLifelines: [...p.usedLifelines, type] }))
  }
  const hasLifeline = (type: LifelineType) => !(currentPlayer?.usedLifelines || []).includes(type)

  const generateQr = async () => {
    const url = `${window.location.origin}/gameshow/${shareCode}`
    try { setQrDataUrl(await QRCode.toDataURL(url, { margin: 1, width: 200 })) } catch {}
    setShowQr(true)
  }

  const safeZones = questions.length > 0
    ? [Math.floor(questions.length * 0.2), Math.floor(questions.length * 0.5)] : []

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a2e]">
      <Loader2 className="h-10 w-10 animate-spin text-yellow-400" />
    </div>
  )
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a2e] text-white">
      <div className="text-center"><XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" /><p>{error}</p></div>
    </div>
  )

  const MusicBtn = () => (
    <button onClick={() => setMusicEnabled(v => !v)}
      className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition-all"
      title={musicEnabled ? 'Mute music' : 'Enable music'}>
      {musicEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </button>
  )

  // ─── JOIN (player device) ─────────────────────────────────────────────────
  if (phase === 'join') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a2e] to-[#0d1b5e] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-yellow-400 text-xs font-bold tracking-widest uppercase mb-2">Who Wants to Be a</div>
            <h1 className="text-3xl font-black text-yellow-300">MILLIONAIRE</h1>
            <p className="text-blue-300 mt-1">{config?.name}</p>
          </div>
          <div className="bg-[#0d1b5e] border border-blue-500/30 rounded-3xl p-6 shadow-2xl">
            <div className="text-center mb-4">
              <p className="text-blue-300 text-sm">Room</p>
              <div className="text-3xl font-black text-yellow-300 tracking-widest">{joinRoomCode}</div>
            </div>
            <h2 className="font-bold text-white mb-3">Enter your name</h2>
            <Input value={joinNickname} onChange={e => setJoinNickname(e.target.value)}
              placeholder="Your nickname..." className="bg-[#0a0a2e] border-blue-500/30 text-white placeholder:text-blue-400 rounded-xl mb-4"
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
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a2e] to-[#0d1b5e] flex items-center justify-center p-4 text-white">
        <div className="text-center max-w-sm w-full">
          <div className="text-yellow-400 text-xs font-bold tracking-widest uppercase mb-2">Who Wants to Be a</div>
          <h1 className="text-3xl font-black text-yellow-300 mb-1">MILLIONAIRE</h1>
          <h2 className="text-xl font-black mb-1 mt-4">You're in!</h2>
          <p className="text-blue-300 mb-6">Waiting for the host…</p>
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
            <span className="text-sm">Waiting for host…</span>
          </div>
        </div>
      </div>
    )
  }

  // ─── LOBBY (host sees room code, QR, player list) ─────────────────────────
  if (phase === 'lobby') {
    const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/gameshow/${shareCode}?room=${roomCode}` : ''
    return (
      <div className="relative min-h-screen bg-gradient-to-b from-[#0a0a2e] to-[#0d1b5e] flex items-center justify-center p-4 text-white">
        <MusicBtn />
        <div className="text-center max-w-sm w-full">
          <div className="text-yellow-400 text-xs font-bold tracking-widest uppercase mb-2">Who Wants to Be a</div>
          <h1 className="text-3xl font-black text-yellow-300 mb-4">MILLIONAIRE</h1>
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

  // ─── SETUP ────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    const maxP = config?.playMode === 'SINGLE' ? 1 : (config?.maxPlayers ?? 4)
    const gameUrl = typeof window !== 'undefined' ? `${window.location.origin}/gameshow/${shareCode}` : ''
    return (
      <div className="relative min-h-screen bg-[#0a0a2e] flex items-center justify-center p-4">
        <MusicBtn />
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-yellow-400 text-xs font-bold tracking-widest uppercase mb-2">Who Wants to Be a</div>
            <h1 className="text-3xl sm:text-4xl font-black text-yellow-300">MILLIONAIRE</h1>
            <p className="text-blue-300 text-sm mt-2">{config?.name}</p>
          </div>
          <div className="bg-[#0d1b5e] border border-blue-500/30 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-white font-bold text-lg mb-4">
              {config?.playMode === 'SINGLE' ? 'Enter your name' : `Players (up to ${maxP})`}
            </h2>
            <div className="space-y-3 mb-6">
              {setupNames.map((name, i) => (
                <Input key={i} value={name}
                  onChange={e => { const n = [...setupNames]; n[i] = e.target.value; setSetupNames(n) }}
                  placeholder={config?.playMode === 'SINGLE' ? 'Your name...' : `Player ${i + 1} name...`}
                  className="bg-[#0a0a2e] border-blue-500/30 text-white placeholder:text-blue-400" />
              ))}
            </div>
            {config?.playMode !== 'SINGLE' && setupNames.length < maxP && (
              <Button variant="outline" size="sm" onClick={() => setSetupNames([...setupNames, ''])}
                className="w-full mb-4 border-blue-500/30 text-blue-300 hover:bg-blue-900/30">+ Add Player</Button>
            )}
            <div className="text-xs text-blue-400 mb-4 space-y-1">
              <div>📊 {config?.questions?.length ?? 0} questions · ⏱ {config?.timeLimitSeconds}s each</div>
              {config?.enableLifelines && <div>💡 Lifelines: 50:50, Phone, Audience</div>}
              {config?.clickStartToCount && <div>▶ Click Start to begin timer</div>}
            </div>
            {config?.playMode !== 'SINGLE' && (
              <div className="mb-4 p-3 bg-black/20 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-blue-300 truncate flex-1">{config?.shortLink || gameUrl}</div>
                  <button onClick={generateQr}
                    className="ml-2 flex-shrink-0 p-1.5 rounded-lg bg-blue-900/50 hover:bg-blue-900 text-blue-300 transition-all">
                    <QrCode className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            {showQr && qrDataUrl && (
              <div className="mb-4 flex flex-col items-center gap-2">
                <img src={qrDataUrl} alt="QR Code" className="w-32 h-32 rounded-lg border-2 border-blue-400" />
                <button onClick={() => setShowQr(false)} className="text-xs text-blue-400 underline">Close QR</button>
              </div>
            )}
            <Button onClick={startGame} disabled={!setupNames.some(n => n.trim())}
              className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-lg py-6">
              Start Game
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ─── INTRO ────────────────────────────────────────────────────────────────
  if (phase === 'intro') return (
    <div className="relative min-h-screen bg-[#0a0a2e] flex items-center justify-center">
      <MusicBtn />
      <div className="text-center animate-pulse">
        <div className="text-yellow-300 text-4xl sm:text-6xl font-black">WWTBAM</div>
        <div className="text-blue-300 mt-4 text-xl">Get ready...</div>
      </div>
    </div>
  )

  // ─── SELECT (Free Choice) ─────────────────────────────────────────────────
  if (phase === 'select') {
    const allAnswered = answeredQuestions.size >= questions.length
    const rc = roomCodeRef.current
    const isOnlineAdmin = !!rc && !joinRoomCode
    return (
      <div className="relative min-h-screen bg-[#0a0a2e] text-white p-4">
        <MusicBtn />
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-yellow-300">
                {config?.playMode === 'LOCAL' ? `${currentPlayer?.nickname}'s Turn` : 'Choose Your Question'}
              </h2>
              <p className="text-blue-300 text-sm">
                {answeredQuestions.size}/{questions.length} done · {currentPlayer?.score ?? 0} pts
              </p>
            </div>
            <Button size="sm" variant="outline"
              onClick={() => {
                audio.stopAll()
                const rc = roomCodeRef.current
                if (rc && !joinRoomCode) {
                  fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gameState: { phase: 'gameover' }, status: 'FINISHED' })
                  }).catch(() => {})
                }
                setPhase('gameover')
              }}
              className="border-red-500/50 text-red-400 hover:bg-red-900/20">
              <LogOut className="h-4 w-4 mr-1" /> End Game
            </Button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {questions.map((q, idx) => {
              const done = answeredQuestions.has(q.id)
              return (
                <button key={q.id} disabled={done}
                  onClick={() => {
                    if (!done) {
                      audio.stop('selecting')
                      if (isOnlineAdmin) {
                        const startTime = Date.now()
                        fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ gameState: { phase: 'question', currentQuestionIndex: idx, questionStartTime: startTime } })
                        }).catch(() => {})
                      }
                      beginQuestion(idx)
                    }
                  }}
                  className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center text-xs font-bold transition-all ${
                    done ? 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
                         : 'bg-[#0d1b5e] border-blue-500/50 text-white hover:bg-[#1a2f7e] hover:border-yellow-400 hover:scale-105 cursor-pointer'
                  }`}>
                  <span className="text-lg">{idx + 1}</span>
                  <span className={`text-[10px] mt-1 ${done ? 'text-gray-600' : 'text-yellow-400'}`}>
                    {done ? '✓' : `${getPoints(q.difficulty)}pts`}
                  </span>
                </button>
              )
            })}
          </div>
          {allAnswered && (
            <div className="mt-6 text-center">
              <Button onClick={() => {
                audio.stopAll()
                const rc2 = roomCodeRef.current
                if (rc2 && !joinRoomCode) {
                  fetch(`/api/gameshow/${shareCode}/session/${rc2}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gameState: { phase: 'gameover' }, status: 'FINISHED' })
                  }).catch(() => {})
                }
                setPhase('gameover')
              }}
                className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-8 py-4">
                <Trophy className="h-5 w-5 mr-2" /> See Final Results
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── QUESTION ─────────────────────────────────────────────────────────────
  if (phase === 'question' && currentQuestion) {
    const options = parseOptions(currentQuestion)
    const maxTime = config?.timeLimitSeconds ?? 30
    const timerPct = (timeLeft / maxTime) * 100
    const timerColor = timerPct > 50 ? 'bg-green-400' : timerPct > 25 ? 'bg-yellow-400' : 'bg-red-500'
    const waitingForStart = config?.clickStartToCount && !timerRunning
    const rc = roomCodeRef.current
    const isOnlineAdmin = !!rc && !joinRoomCode

    return (
      <div className="relative min-h-screen bg-[#0a0a2e] text-white flex flex-col">
        <MusicBtn />
        {/* Header */}
        <div className="bg-[#0d1b5e] border-b border-blue-500/30 px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="text-sm text-blue-300">
              Q{currentIdx + 1}/{questions.length}
              {config?.playMode === 'LOCAL' && <span className="ml-2 text-yellow-300">— {currentPlayer?.nickname}</span>}
            </div>
            <div className="flex items-center gap-2">
              {waitingForStart
                ? <span className="text-yellow-400 font-bold text-sm animate-pulse">⏸ Waiting…</span>
                : <span className={`text-xl font-black ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-yellow-300'}`}>{timeLeft}</span>
              }
            </div>
            {(!roomCode || joinRoomCode) && (
              <div className="text-sm text-blue-300">
                {joinRoomCode ? myTotalScore : (currentPlayer?.score ?? 0)} pts
              </div>
            )}
          </div>
          <div className="max-w-2xl mx-auto mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className={`h-full ${timerColor} transition-all duration-1000`}
              style={{ width: waitingForStart ? '100%' : `${timerPct}%` }} />
          </div>
        </div>

        {/* Safe zone */}
        {safeZones.includes(currentIdx) && (
          <div className="bg-yellow-900/30 border-b border-yellow-500/30 px-4 py-1.5 text-center text-xs text-yellow-300">
            🔒 Safe Zone!
          </div>
        )}

        {/* Online admin: skip time button */}
        {isOnlineAdmin && !answeredRef.current && (
          <div className="flex justify-center py-2">
            <button
              onClick={() => { clearInterval(timerRef.current!); setTimeLeft(0); handleTimeout() }}
              className="text-xs text-blue-400 hover:text-blue-200 border border-blue-500/30 px-4 py-1.5 rounded-full transition-all hover:bg-blue-900/40"
            >
              ⏭ Skip Time Count
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <Badge variant="outline" className="text-blue-300 border-blue-500/30">{currentQuestion.difficulty}</Badge>
              <span className="text-yellow-400 font-bold">{getPoints(currentQuestion.difficulty)} pts</span>
            </div>

            {/* Question box */}
            <div className="bg-[#0d1b5e] border-2 border-blue-500/50 rounded-2xl p-5 mb-6 text-center shadow-2xl">
              {currentQuestion.imageUrl && <img src={currentQuestion.imageUrl} alt="" className="max-h-40 mx-auto mb-3 rounded-lg" />}
              <p className="text-lg sm:text-xl font-semibold leading-relaxed">{currentQuestion.stem}</p>
            </div>

            {/* Bet stars (before Start button, for players) */}
            {waitingForStart && config?.betEnabled && betsRemaining > 0 && !isOnlineAdmin && (
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

            {/* Start button overlay */}
            {waitingForStart && !isOnlineAdmin && (
              <div className="flex justify-center mb-6">
                <Button onClick={handleStartCount}
                  className="bg-yellow-400 hover:bg-yellow-300 text-black font-black text-lg px-10 py-5 rounded-2xl shadow-lg">
                  ▶ Start Timer
                </Button>
              </div>
            )}

            {/* BUZZ play mode: admin panel — shows who buzzed/answered */}
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
                      setBuzzTimeRemaining(timeLeft)
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
                  <p className="text-blue-400 text-sm text-center">Waiting for a player to answer…</p>
                )}
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
              <div className="fixed inset-0 bg-[#0a0a2e]/85 flex items-center justify-center z-40">
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
              <div className="fixed inset-0 bg-[#0a0a2e]/85 flex items-center justify-center z-40">
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
              <div className="fixed inset-0 bg-[#0a0a2e]/90 flex items-center justify-center z-50">
                <div className={`text-center p-8 rounded-3xl border-2 max-w-xs w-full mx-4 shadow-2xl ${isCorrect ? 'bg-green-900/60 border-green-500' : 'bg-red-900/60 border-red-500'}`}>
                  <div className="text-6xl mb-3">{isCorrect ? '✅' : '❌'}</div>
                  <p className={`text-2xl font-black mb-2 ${isCorrect ? 'text-green-300' : 'text-red-300'}`}>
                    {isCorrect ? 'Correct!' : 'Wrong!'}
                  </p>
                  {myLastPts > 0 && (
                    <p className="text-yellow-300 font-bold text-lg mb-1">+{myLastPts} pts</p>
                  )}
                  <p className="text-white/70 text-sm mb-4">Total: <strong className="text-white">{myTotalScore}</strong> pts</p>
                  <Loader2 className="h-4 w-4 animate-spin text-blue-300 mx-auto mb-1" />
                  <p className="text-blue-300 text-xs">Waiting for host to reveal…</p>
                </div>
              </div>
            )}

            {/* Options — visible to all; disabled for online admin */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${(waitingForStart && !isOnlineAdmin) || (config?.playMode === 'BUZZ' && !!joinRoomCode && config?.buzzButton && !hasBuzzed && !buzzState) || (config?.playMode === 'BUZZ' && !!joinRoomCode && !!buzzState && buzzState.playerId !== myPlayerId) || (config?.playMode === 'BUZZ' && !!joinRoomCode && disabledPlayerIds.includes(myPlayerId || '')) ? 'opacity-60 pointer-events-none' : ''}`}>
              {options.map((option, i) => {
                const letter = ['A', 'B', 'C', 'D'][i]
                const isElim = eliminatedOptions.includes(option)
                const isDisabledOpt = disabledOptions.includes(option)
                return (
                  <button key={option} disabled={isElim || isDisabledOpt || !!selectedAnswer || (waitingForStart && !isOnlineAdmin) || isOnlineAdmin || (!!joinRoomCode && disabledPlayerIds.includes(myPlayerId || ''))}
                    onClick={() => !isElim && !isDisabledOpt && !isOnlineAdmin && handleAnswer(option)}
                    className={`flex items-center gap-3 p-3 sm:p-4 rounded-xl border-2 text-left font-medium transition-all duration-200
                      ${isElim || isDisabledOpt ? 'opacity-20 cursor-not-allowed bg-gray-800 border-gray-700 line-through'
                      : isOnlineAdmin ? 'bg-[#0d1b5e] border-blue-500/30 opacity-75 cursor-default'
                               : 'bg-[#0d1b5e] border-blue-500/50 hover:bg-[#1a2f7e] hover:border-yellow-400 hover:scale-[1.02] cursor-pointer active:scale-[0.98]'}`}>
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-400 text-black font-black text-sm flex items-center justify-center">{isDisabledOpt ? '✗' : letter}</span>
                    <span className="text-sm sm:text-base">{option}</span>
                  </button>
                )
              })}
            </div>
            {isOnlineAdmin && config?.playMode !== 'BUZZ' && (
              <p className="text-center text-blue-400 text-xs mt-3">Players are answering — options shown for reference</p>
            )}

            {/* Lifelines — only in non-online mode */}
            {config?.enableLifelines && !joinRoomCode && !isOnlineAdmin && (
              <div className="flex justify-center gap-3 mt-6">
                {(['5050', 'phone', 'audience'] as LifelineType[]).map(ll => {
                  const available = hasLifeline(ll)
                  const icons: Record<LifelineType, any> = { '5050': null, 'phone': Phone, 'audience': Users }
                  const colors: Record<LifelineType, string> = { '5050': 'text-yellow-400 border-yellow-400', 'phone': 'text-blue-400 border-blue-400', 'audience': 'text-purple-400 border-purple-400' }
                  const handlers: Record<LifelineType, () => void> = { '5050': useFiftyFifty, 'phone': usePhone, 'audience': useAudience }
                  const Icon = icons[ll]
                  return (
                    <button key={ll} disabled={!available} onClick={handlers[ll]}
                      className={`px-4 py-2 rounded-full text-sm font-bold border-2 transition-all ${
                        available ? colors[ll] + ' hover:bg-white/10' : 'border-gray-700 text-gray-600 cursor-not-allowed opacity-40'
                      }`}>
                      {Icon ? <Icon className="h-4 w-4" /> : ll}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Lifeline results */}
            {showLifelineResult && phoneAnswer && (
              <div className="mt-4 bg-blue-900/50 border border-blue-400 rounded-xl p-4 text-center">
                <Phone className="h-5 w-5 text-blue-400 mx-auto mb-1" />
                <p className="text-sm text-blue-200">Phone-a-friend says: <span className="text-yellow-300 font-bold">"{phoneAnswer}"</span></p>
              </div>
            )}
            {showLifelineResult && audienceData && (
              <div className="mt-4 bg-purple-900/50 border border-purple-400 rounded-xl p-4">
                <p className="text-sm text-center text-purple-200 mb-3">👥 Audience Poll</p>
                {Object.entries(audienceData).map(([opt, pct]) => (
                  <div key={opt} className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-white w-24 truncate">{opt}</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-white w-8">{pct}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── REVEAL ──────────────────────────────────────────────────────────────
  if (phase === 'reveal' && currentQuestion) {
    const options = parseOptions(currentQuestion)
    const corrects = getCorrectAnswers(currentQuestion)
    const isFreeChoice = config?.selectionMode === 'FREE_CHOICE'
    const rc = roomCodeRef.current
    const isOnlineAdmin = !!rc && !joinRoomCode

    return (
      <div className="relative min-h-screen bg-[#0a0a2e] text-white flex flex-col items-center justify-center p-4">
        <MusicBtn />
        <div className="w-full max-w-2xl">

          {/* Online player reveal */}
          {joinRoomCode ? (
            <div className={`text-center p-6 rounded-2xl mb-6 border-2 ${isCorrect === true ? 'bg-green-900/40 border-green-500' : isCorrect === false ? 'bg-red-900/40 border-red-500' : 'bg-gray-900/40 border-gray-500'}`}>
              {isCorrect === true
                ? <><CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-2" /><p className="text-2xl font-black text-green-300">CORRECT!</p></>
                : isCorrect === false
                ? <><XCircle className="h-12 w-12 text-red-400 mx-auto mb-2" /><p className="text-2xl font-black text-red-300">WRONG!</p></>
                : <><XCircle className="h-12 w-12 text-gray-400 mx-auto mb-2" /><p className="text-2xl font-black text-gray-300">Time&apos;s Up!</p></>
              }
              {myLastPts > 0 && <p className="text-yellow-300 font-bold mt-2">+{myLastPts} pts</p>}
              <p className="text-white/60 text-sm mt-1">Total: {myTotalScore} pts</p>
              <div className="mt-3 bg-black/30 rounded-xl p-3 text-sm">
                <p className="text-gray-400 text-xs mb-1">Correct answer:</p>
                <p className="text-yellow-300 font-bold">{corrects.join(', ')}</p>
                {currentQuestion.explanation && (
                  <p className="text-blue-200 text-xs mt-2">💡 {currentQuestion.explanation}</p>
                )}
              </div>
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
                    <p className="text-yellow-300 font-bold">{getCorrectAnswers(currentQuestion).join(', ')}</p>
                  </div>
                </div>
              ) : (
                <div className={`text-center p-6 rounded-2xl mb-6 border-2 ${isCorrect ? 'bg-green-900/40 border-green-500' : 'bg-red-900/40 border-red-500'}`}>
                  {isCorrect
                    ? <><CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-2" /><p className="text-2xl font-black text-green-300">CORRECT!</p></>
                    : <><XCircle className="h-12 w-12 text-red-400 mx-auto mb-2" /><p className="text-2xl font-black text-red-300">WRONG!</p></>
                  }
                  <p className="text-yellow-300 font-bold mt-2">{currentPlayer?.score ?? 0} pts total</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {options.map((opt, i) => {
                  const letter = ['A', 'B', 'C', 'D'][i]
                  const isCorr = corrects.some(c => c.toLowerCase() === opt.toLowerCase())
                  const isSel = selectedAnswer?.toLowerCase() === opt.toLowerCase()
                  return (
                    <div key={opt} className={`flex items-center gap-3 p-3 rounded-xl border-2 ${isCorr ? 'bg-green-900/40 border-green-500' : isSel ? 'bg-red-900/40 border-red-500' : 'bg-gray-800/50 border-gray-700'}`}>
                      <span className={`flex-shrink-0 w-8 h-8 rounded-full font-black text-sm flex items-center justify-center ${isCorr ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-400'}`}>{letter}</span>
                      <span className={`text-sm ${isCorr ? 'text-green-300 font-bold' : 'text-gray-400'}`}>{opt}</span>
                      {isCorr && <CheckCircle2 className="h-4 w-4 text-green-400 ml-auto" />}
                    </div>
                  )
                })}
              </div>

              {currentQuestion.explanation && (
                <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-4 mb-6 text-sm text-blue-200">
                  💡 {currentQuestion.explanation}
                </div>
              )}

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

              {/* Online admin: top players */}
              {isOnlineAdmin && players.length > 0 && (
                <div className="bg-[#0d1b5e] rounded-xl p-4 mb-6">
                  <p className="text-xs text-blue-400 uppercase mb-2">Top Players</p>
                  {[...players].sort((a, b) => b.score - a.score).slice(0, 5).map((p, rank) => (
                    <div key={p.id} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-sm">{['🥇', '🥈', '🥉'][rank] || `${rank + 1}.`}</span>
                        <span className="text-white text-sm">{p.nickname}</span>
                      </div>
                      <span className="text-yellow-300 font-bold">{p.score} pts</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Local multiplayer scores */}
              {config?.playMode === 'LOCAL' && players.length > 1 && !isOnlineAdmin && (
                <div className="bg-[#0d1b5e] rounded-xl p-4 mb-6">
                  {[...players].sort((a, b) => b.score - a.score).map((p, rank) => (
                    <div key={p.id} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-sm">{rank + 1}.</span>
                        <span className="text-white text-sm">{p.nickname}</span>
                        {p.id === currentPlayer?.id && <Badge className="text-xs bg-yellow-400 text-black">current</Badge>}
                      </div>
                      <span className="text-yellow-300 font-bold">{p.score} pts</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                {/* BUZZ mode: Continue lets others try after a wrong answer */}
                {config?.playMode === 'BUZZ' && buzzState?.isCorrect === false &&
                  options.filter(opt => ![...disabledOptions, buzzState?.answer].filter(Boolean).includes(opt)).length > 1 && (
                  <Button onClick={handleBuzzContinue}
                    className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-4 rounded-2xl">
                    Continue
                  </Button>
                )}
                {isFreeChoice ? (
                  <Button onClick={goToSelect}
                    className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-lg py-6">
                    {answeredQuestions.size >= questions.length
                      ? <><Trophy className="h-5 w-5 mr-2" />Final Results</>
                      : <>Back to Board <ChevronRight className="h-5 w-5 ml-1" /></>}
                  </Button>
                ) : (
                  <Button onClick={handleNext}
                    className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-lg py-6">
                    {currentIdx >= questions.length - 1 ? 'See Final Results' : 'Next Question'}
                    <ChevronRight className="h-5 w-5 ml-1" />
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ─── LEADERBOARD ──────────────────────────────────────────────────────────
  if (phase === 'leaderboard') {
    const isFreeChoice = config?.selectionMode === 'FREE_CHOICE'
    const allAnswered = answeredQuestions.size >= questions.length
    const isLastQ = isFreeChoice ? allAnswered : currentIdx >= questions.length - 1
    const sorted = [...players].sort((a, b) => b.score - a.score).slice(0, 10)
    return (
      <div className="relative min-h-screen bg-[#0a0a2e] text-white flex flex-col items-center justify-center p-4">
        <MusicBtn />
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">🏆</div>
            <h2 className="text-3xl font-black text-yellow-400">Leaderboard</h2>
            <p className="text-blue-300 text-sm mt-1">
              {isFreeChoice ? `${answeredQuestions.size}/${questions.length} questions done` : `After Q${currentIdx + 1} of ${questions.length}`}
            </p>
          </div>
          <div className="bg-[#0d1b5e] rounded-2xl p-4 space-y-2 mb-6 border border-blue-800">
            {sorted.map((p, rank) => (
              <div key={p.id} className={`flex items-center justify-between py-2.5 px-3 rounded-xl ${rank === 0 ? 'bg-yellow-500/20 border border-yellow-500/40' : rank === 1 ? 'bg-gray-400/10 border border-gray-600/30' : rank === 2 ? 'bg-orange-500/10 border border-orange-600/30' : 'bg-blue-900/20'}`}>
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
              {!roomCodeRef.current && <p className="text-blue-300 text-sm">Auto-continuing in 5 seconds…</p>}
              <div className="flex gap-3">
                <Button onClick={() => advanceFromLeaderboard(isLastQ)}
                  className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-4 rounded-2xl">
                  {isLastQ ? 'Final Results' : isFreeChoice ? 'Continue' : 'Next Q'} <ChevronRight className="h-5 w-5 ml-1" />
                </Button>
                {isFreeChoice && !isLastQ && (
                  <Button onClick={() => { audio.stop('leaderboard'); setPhase('gameover') }}
                    variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-900/20 rounded-2xl">
                    <LogOut className="h-4 w-4 mr-1" /> Exit
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── SCORING (Local Multiplayer manual score adjustment) ──────────────────
  if (phase === 'scoring') {
    const isLastQ = answeredQuestions.size >= questions.length ||
      (config?.selectionMode === 'LINEAR' && currentIdx >= questions.length - 1)
    return (
      <div className="relative min-h-screen bg-[#0a0a2e] text-white flex flex-col items-center justify-center p-4">
        <MusicBtn />
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">📊</div>
            <h2 className="text-2xl font-black text-yellow-300">Score Adjustment</h2>
            <p className="text-blue-300 text-sm mt-1">Q{currentIdx + 1} — Adjust points before continuing.</p>
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
            {isLastQ ? 'Final Results ✓' : 'Confirm & Continue'} <ChevronRight className="h-5 w-5 ml-1" />
          </Button>
        </div>
      </div>
    )
  }

  // ─── GAME OVER ────────────────────────────────────────────────────────────
  if (phase === 'gameover') {
    const sorted = [...players].sort((a, b) => b.score - a.score)
    return (
      <div className="relative min-h-screen bg-[#0a0a2e] text-white flex items-center justify-center p-4">
        <MusicBtn />
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <Trophy className="h-16 w-16 text-yellow-400 mx-auto mb-3" />
            <h1 className="text-3xl font-black text-yellow-300">Game Over!</h1>
            {config?.name && <p className="text-blue-300 text-sm mt-1">{config.name}</p>}
          </div>
          <div className="space-y-3 mb-8">
            {sorted.map((p, rank) => (
              <div key={p.id} className={`rounded-2xl p-5 border-2 ${rank === 0 ? 'bg-yellow-900/30 border-yellow-400' : rank === 1 ? 'bg-gray-700/30 border-gray-400' : rank === 2 ? 'bg-orange-900/30 border-orange-600' : 'bg-[#0d1b5e] border-blue-500/30'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}.`}</span>
                    <div>
                      <div className="font-bold">{p.nickname}</div>
                      <div className="text-xs text-gray-400">{p.correctCount}/{questions.length} correct</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-yellow-300">{p.score}</div>
                    <div className="text-xs text-gray-400">pts</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            {!joinRoomCode && (
              <Button onClick={() => { setPhase('setup'); setSetupNames([setupNames[0] || '']) }}
                variant="outline" className="flex-1 border-blue-500/30 text-blue-300 hover:bg-blue-900/30">
                <RotateCcw className="h-4 w-4 mr-2" /> Play Again
              </Button>
            )}
            <Button onClick={() => window.close()} variant="outline"
              className="flex-1 border-blue-500/30 text-blue-300 hover:bg-blue-900/30">
              <Home className="h-4 w-4 mr-2" /> Exit
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
