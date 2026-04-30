'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Trophy, CheckCircle2, XCircle, ChevronRight, RotateCcw, Home, Volume2, VolumeX } from 'lucide-react'
import { useAudio } from '../../useAudio'
import QRCode from 'qrcode'

// ─── Types ───────────────────────────────────────────────────────────────────
type Question = {
  id: string; stem: string; questionType: string
  options: string[] | string | null; correctAnswer: string
  explanation: string | null; difficulty: string; imageUrl?: string | null
}
type GameshowConfig = {
  id: string; shareCode: string; name: string; type: string
  playMode: 'SINGLE' | 'LOCAL' | 'ONLINE' | 'BUZZ'
  selectionMode: 'LINEAR' | 'FREE_CHOICE'
  questionsCount: number | null; timeLimitSeconds: number
  shuffleQuestions: boolean; showLeaderboard: boolean
  clickStartToCount: boolean; maxPlayers: number
  shortLink: string | null; coverImage: string | null; quizSetTitle: string
  questions: Question[]
  wheelSegments: number; wheelMinPoints: number; wheelMaxPoints: number; wheelDeductOnWrong: boolean
  deductOnWrong?: boolean; allowOthersOnIncorrect?: boolean
}
type Player = {
  id: string; nickname: string; avatarColor: string
  score: number; correctCount: number; wrongCount: number; lastPointsEarned: number
}
type Phase = 'setup' | 'lobby' | 'join' | 'waiting' | 'spin' | 'question' | 'reveal' | 'leaderboard' | 'gameover'

// ─── Constants ────────────────────────────────────────────────────────────────
const PLAYER_COLORS = ['#6366f1','#ef4444','#f59e0b','#10b981','#8b5cf6','#ec4899','#06b6d4','#84cc16']
const WHEEL_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#6366f1','#ec4899','#8b5cf6','#14b8a6','#f43f5e','#84cc16','#a855f7']
const ANS_COLORS = ['bg-red-600 hover:bg-red-500','bg-blue-600 hover:bg-blue-500','bg-yellow-500 hover:bg-yellow-400','bg-green-600 hover:bg-green-500','bg-purple-600 hover:bg-purple-500','bg-orange-600 hover:bg-orange-500']

// ─── Utilities ────────────────────────────────────────────────────────────────
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
function normalize(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
}
function randPoints(min: number, max: number): number {
  const step = 50
  const steps = Math.floor((max - min) / step)
  return min + Math.floor(Math.random() * (steps + 1)) * step
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
function Confetti() {
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    id: i, color: ['#ff0','#f0f','#0ff','#0f0','#f60','#60f'][i % 6],
    left: `${Math.random() * 100}%`, delay: `${Math.random() * 0.5}s`, duration: `${0.8 + Math.random() * 0.6}s`,
  }))
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {pieces.map(p => (
        <div key={p.id} className="absolute w-2 h-2 rounded-sm"
          style={{ left: p.left, top: '-8px', backgroundColor: p.color, animation: `fall ${p.duration} ease-in ${p.delay} forwards` }} />
      ))}
      <style>{`@keyframes fall{to{transform:translateY(100vh) rotate(720deg);opacity:0;}}`}</style>
    </div>
  )
}

// ─── TimerRing ─────────────────────────────────────────────────────────────────
function TimerRing({ timeLeft, maxTime }: { timeLeft: number; maxTime: number }) {
  const pct = timeLeft / maxTime; const r = 28; const c = 2 * Math.PI * r
  const color = pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#eab308' : '#ef4444'
  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="80" height="80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#374151" strokeWidth="6" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={c} strokeDashoffset={c - c * pct} style={{ transition: 'stroke-dashoffset 1s linear,stroke 0.3s' }} />
      </svg>
      <span className={`text-2xl font-black z-10 ${pct < 0.25 ? 'text-red-400 animate-pulse' : 'text-white'}`}>{timeLeft}</span>
    </div>
  )
}

// ─── LobbyQR ──────────────────────────────────────────────────────────────────
function LobbyQR({ url }: { url: string }) {
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => { if (url) QRCode.toDataURL(url, { margin: 1, width: 280 }).then(setQr).catch(() => {}) }, [url])
  if (!qr) return <div className="w-48 h-48 mx-auto bg-white/20 rounded-2xl animate-pulse mb-2" />
  return <img src={qr} alt="QR Code" className="w-56 h-56 mx-auto rounded-2xl border-4 border-white/40 mb-2" />
}

// ─── SpinWheel SVG ────────────────────────────────────────────────────────────
function SpinWheelSVG({ segments, rotation, spinning, onSpinEnd }: {
  segments: { label: string; color: string }[]
  rotation: number; spinning: boolean; onSpinEnd?: () => void
}) {
  const n = segments.length
  const cx = 160, cy = 160, r = 148
  const sliceAngle = (2 * Math.PI) / n

  return (
    <div className="relative" style={{ width: 320, height: 320 }}>
      {/* Pointer arrow at top */}
      <div className="absolute left-1/2 -translate-x-1/2 z-10" style={{ top: -10 }}>
        <div style={{
          width: 0, height: 0,
          borderLeft: '14px solid transparent',
          borderRight: '14px solid transparent',
          borderTop: '28px solid #fbbf24',
          filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))',
        }} />
      </div>
      <svg width={320} height={320}
        style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? 'transform 4s cubic-bezier(0.17,0.67,0.12,1)' : 'none' }}
        onTransitionEnd={onSpinEnd}
      >
        {segments.map((seg, i) => {
          const start = i * sliceAngle - Math.PI / 2
          const end = start + sliceAngle
          const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start)
          const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end)
          const large = sliceAngle > Math.PI ? 1 : 0
          const mid = start + sliceAngle / 2
          const tr = r * 0.65
          const tx = cx + tr * Math.cos(mid), ty = cy + tr * Math.sin(mid)
          const rotDeg = (mid + Math.PI / 2) * (180 / Math.PI)
          return (
            <g key={i}>
              <path d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`}
                fill={seg.color} stroke="#111827" strokeWidth={2} />
              <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
                fill="white" fontSize={n > 10 ? 10 : 13} fontWeight="bold"
                transform={`rotate(${rotDeg},${tx},${ty})`}
                style={{ pointerEvents: 'none' }}>
                {seg.label}
              </text>
            </g>
          )
        })}
        <circle cx={cx} cy={cy} r={22} fill="#111827" stroke="#374151" strokeWidth={3} />
        <circle cx={cx} cy={cy} r={9} fill="#fbbf24" />
      </svg>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function SpinWheelPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const shareCode = params.shareCode as string
  const joinRoomCode = searchParams.get('room')

  const [config, setConfig] = useState<GameshowConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [musicEnabled, setMusicEnabled] = useState(true)
  const audio = useAudio(musicEnabled)

  const [phase, setPhase] = useState<Phase>('setup')
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState(30)
  const [timerRunning, setTimerRunning] = useState(false)
  const [questionStartTime, setQuestionStartTime] = useState(0)
  const [showConfetti, setShowConfetti] = useState(false)

  // Wheel state
  const [segmentValues, setSegmentValues] = useState<number[]>([])
  const [wheelRotation, setWheelRotation] = useState(0)
  const [wheelSpinning, setWheelSpinning] = useState(false)
  const [spunPoints, setSpunPoints] = useState(0)
  const [spunSegIdx, setSpunSegIdx] = useState(0)
  const [showCustomWheel, setShowCustomWheel] = useState(false)

  // Answer state
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [fillAnswer, setFillAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)

  // Players
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0)
  const [setupNames, setSetupNames] = useState([''])

  // Online
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [joinNickname, setJoinNickname] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinLoading, setJoinLoading] = useState(false)
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [onlineLobbyPlayers, setOnlineLobbyPlayers] = useState<{ id: string; nickname: string }[]>([])

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const revealTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lobbyPollRef = useRef<NodeJS.Timeout | null>(null)
  const evsRef = useRef<EventSource | null>(null)
  const submittedRef = useRef(false)
  const currentIdxRef = useRef(0)
  const configRef = useRef<GameshowConfig | null>(null)

  useEffect(() => { submittedRef.current = submitted }, [submitted])
  useEffect(() => { currentIdxRef.current = currentIdx }, [currentIdx])
  useEffect(() => { configRef.current = config }, [config])

  const currentQuestion = questions[currentIdx]
  const currentPlayer = players[currentPlayerIdx]
  const isLocal = config?.playMode === 'LOCAL'
  const isBuzz = config?.playMode === 'BUZZ'
  const isOnline = config?.playMode === 'ONLINE'
  const isFillBlank = currentQuestion?.questionType === 'FILL_BLANK' || currentQuestion?.questionType === 'SHORT_ANSWER'

  function buildSegmentValues(cfg: GameshowConfig): number[] {
    return Array.from({ length: cfg.wheelSegments }, () => randPoints(cfg.wheelMinPoints, cfg.wheelMaxPoints))
  }

  // ─── Fetch config ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/gameshow/${shareCode}`).then(r => r.json()).then(async data => {
      if (data.error) { setError(data.error); setLoading(false); return }
      if (data.type !== 'SPINWHEEL') { setError('This gameshow is not a Spin Wheel game'); setLoading(false); return }
      setConfig(data)
      setSegmentValues(buildSegmentValues(data))

      if ((data.playMode === 'ONLINE' || data.playMode === 'BUZZ') && joinRoomCode) {
        setLoading(false); setPhase('join')
      } else if ((data.playMode === 'ONLINE' || data.playMode === 'BUZZ') && !joinRoomCode) {
        try {
          const res = await fetch(`/api/gameshow/${shareCode}/session`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
          })
          const sData = await res.json()
          const gs = sData.gameState ? (typeof sData.gameState === 'string' ? JSON.parse(sData.gameState) : sData.gameState) : {}
          const allQs: Question[] = data.questions ?? []
          const ordered = gs.questionOrder?.length
            ? gs.questionOrder.map((id: string) => allQs.find((q: Question) => q.id === id)).filter(Boolean) as Question[]
            : allQs
          setQuestions(ordered.length > 0 ? ordered : allQs)
          setRoomCode(sData.roomCode)
          setPhase('lobby')
          audio.playBg('opening', 0.5)
        } catch { setError('Failed to create game session') }
        setLoading(false)
      } else {
        setLoading(false)
      }
    }).catch(() => { setError('Failed to load gameshow'); setLoading(false) })
  }, [shareCode])

  useEffect(() => { if (phase === 'setup' && !loading && !joinRoomCode) audio.playBg('opening', 0.5) }, [phase, loading])

  // B2d: Ensure Local/Buzz Multiplayer starts with at least 2 player inputs
  useEffect(() => {
    if ((config?.playMode === 'LOCAL' || config?.playMode === 'BUZZ') && phase === 'setup' && setupNames.length < 2) {
      setSetupNames(prev => [...prev, ''])
    }
  }, [config?.playMode, phase])
  useEffect(() => { if (phase === 'gameover') { audio.stopAll(); audio.playBg('podium', 0.7) } }, [phase])
  useEffect(() => { if (phase === 'leaderboard') { audio.stopAll(); audio.playBg('leaderboard', 0.6) } }, [phase])

  // Lobby polling
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

  // Online player SSE
  useEffect(() => {
    if (!joinRoomCode || !myPlayerId) return
    let cancelled = false
    const es = new EventSource(`/api/gameshow/${shareCode}/session/${joinRoomCode}/events`)
    evsRef.current = es
    es.onmessage = (event) => {
      if (cancelled) return
      try {
        const msg = JSON.parse(event.data)
        if (msg.type !== 'state') return
        const gs = msg.gameState
        if (!gs) return
        if (gs.phase === 'question') {
          setCurrentIdx(gs.currentQuestionIndex ?? 0)
          setPhase('question')
          const cfg = configRef.current
          const elapsed = (Date.now() - (gs.questionStartTime ?? Date.now())) / 1000
          setTimeLeft(Math.max(1, Math.round((cfg?.timeLimitSeconds ?? 30) - elapsed)))
          setTimerRunning(true)
          setSubmitted(false); setSelectedAnswer(null); setFillAnswer('')
        }
        if (gs.phase === 'spin') { setSpunPoints(gs.spunPoints ?? 0); setPhase('spin') }
        if (gs.phase === 'reveal') { setPhase('reveal') }
        if (gs.phase === 'leaderboard') { setPhase('leaderboard') }
        if (gs.phase === 'gameover') { setPhase('gameover') }
      } catch {}
    }
    return () => { cancelled = true; es.close() }
  }, [joinRoomCode, myPlayerId])

  // Timer countdown
  useEffect(() => {
    if (!timerRunning) return
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!)
          setTimerRunning(false)
          if (!submittedRef.current) handleAnswer(null)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current!)
  }, [timerRunning])

  // ─── Game flow helpers ─────────────────────────────────────────────────────
  function saveAnalytics(questionId: string, answer: string, correct: boolean, pts: number, elapsedMs: number) {
    try {
      fetch('/api/gameshow/analytics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameshowId: config?.id, gameType: 'SPINWHEEL',
          playerNickname: currentPlayer?.nickname,
          questionId, answer, correct, points: pts, elapsedMs,
        })
      }).catch(() => {})
    } catch {}
  }

  function enterSpin(qIdx: number, playerIdx?: number) {
    setCurrentIdx(qIdx)
    if (playerIdx !== undefined) setCurrentPlayerIdx(playerIdx)
    setSpunPoints(0)
    setWheelSpinning(false)
    setSelectedAnswer(null)
    setFillAnswer('')
    setSubmitted(false)
    setIsCorrect(null)
    audio.stopAll()
    audio.playBg('selecting', 0.5)
    setPhase('spin')
  }

  function startGame() {
    audio.stopAll()
    const cfg = config!
    let qs = [...cfg.questions]
    if (cfg.questionsCount && cfg.questionsCount < qs.length) qs = qs.slice(0, cfg.questionsCount)
    if (cfg.shuffleQuestions) qs = shuffle(qs)
    setQuestions(qs)

    let initialPlayers: Player[]
    if (isLocal || isBuzz) {
      const names = setupNames.map((n, i) => n.trim() || `Player ${i + 1}`)
      initialPlayers = names.map((name, i) => ({
        id: `local-${i}`, nickname: name, avatarColor: PLAYER_COLORS[i % PLAYER_COLORS.length],
        score: 0, correctCount: 0, wrongCount: 0, lastPointsEarned: 0,
      }))
    } else {
      initialPlayers = [{ id: 'solo', nickname: 'You', avatarColor: PLAYER_COLORS[0], score: 0, correctCount: 0, wrongCount: 0, lastPointsEarned: 0 }]
    }
    setPlayers(initialPlayers)
    setCurrentPlayerIdx(0)
    enterSpin(0, 0)
  }

  function handleSpin() {
    if (wheelSpinning) return
    const n = segmentValues.length
    const segIdx = Math.floor(Math.random() * n)
    const sliceDeg = 360 / n
    // Segment i center is at (i+0.5)*sliceDeg degrees from top (clockwise) in SVG-space
    // After CSS rotate(R deg), segment i is at (i+0.5)*sliceDeg + R from top
    // For pointer at top: (segIdx+0.5)*sliceDeg + R ≡ 0 (mod 360)
    // R ≡ -(segIdx+0.5)*sliceDeg (mod 360)
    const centerAngle = (segIdx + 0.5) * sliceDeg
    const targetMod = ((-(centerAngle % 360)) % 360 + 360) % 360
    const minTotal = wheelRotation + 360 * 5
    const k = Math.ceil((minTotal - targetMod) / 360)
    const newRotation = k * 360 + targetMod

    setSpunSegIdx(segIdx)
    setSpunPoints(segmentValues[segIdx])
    setWheelRotation(newRotation)
    setWheelSpinning(true)
    audio.stop('selecting')
  }

  function onWheelSpinEnd() {
    if (!wheelSpinning) return
    setWheelSpinning(false)
    // Brief pause to show result, then go to question
    setTimeout(() => {
      const cfg = configRef.current!
      setTimeLeft(cfg.timeLimitSeconds)
      setTimerRunning(!cfg.clickStartToCount)
      setQuestionStartTime(Date.now())
      audio.stopAll()
      audio.playBg('game-play', 0.4)
      setPhase('question')
    }, 1500)
  }

  function handleAnswer(answer: string | null) {
    if (submittedRef.current) return
    clearInterval(timerRef.current!)
    setTimerRunning(false)
    setSubmitted(true)

    const q = questions[currentIdxRef.current]
    const correct = answer !== null && getCorrectAnswers(q).some(ca => normalize(ca) === normalize(answer))
    setSelectedAnswer(answer)
    setIsCorrect(correct)

    const pts = correct ? spunPoints : ((config?.wheelDeductOnWrong || config?.deductOnWrong) ? -spunPoints : 0)
    const elapsed = Date.now() - questionStartTime

    if (correct) { audio.playOnce('win', 0.7); setShowConfetti(true); setTimeout(() => setShowConfetti(false), 2000) }
    else audio.playOnce('lost', 0.7)

    setPlayers(prev => prev.map((p, i) => i !== currentPlayerIdx ? p : {
      ...p, score: p.score + pts,
      correctCount: p.correctCount + (correct ? 1 : 0),
      wrongCount: p.wrongCount + (correct ? 0 : 1),
      lastPointsEarned: pts,
    }))

    if (answer !== null) saveAnalytics(q.id, answer, correct, pts, elapsed)

    setPhase('reveal')
    revealTimeoutRef.current = setTimeout(advanceFromReveal, 3500)
  }

  function advanceFromReveal() {
    clearTimeout(revealTimeoutRef.current!)
    const isLastQ = currentIdx >= questions.length - 1

    if (isLocal || isBuzz) {
      const nextPlayerIdx = (currentPlayerIdx + 1) % players.length
      // B2d: Each turn uses a different question (advance always, not just on round end)
      const nextQIdx = currentIdx + 1
      if (nextQIdx >= questions.length) {
        // No more questions — end the game
        config?.showLeaderboard ? setPhase('leaderboard') : setPhase('gameover')
        return
      }
      enterSpin(nextQIdx, nextPlayerIdx)
      return
    }

    // SINGLE / ONLINE
    if (isLastQ) {
      config?.showLeaderboard ? setPhase('leaderboard') : setPhase('gameover')
      return
    }
    enterSpin(currentIdx + 1)
  }

  // ─── Online join ───────────────────────────────────────────────────────────
  async function handleJoin() {
    if (!joinNickname.trim()) { setJoinError('Enter a nickname'); return }
    setJoinLoading(true); setJoinError(null)
    try {
      const res = await fetch(`/api/gameshow/${shareCode}/session/${joinRoomCode}/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: joinNickname.trim() })
      })
      const data = await res.json()
      if (data.error) { setJoinError(data.error); setJoinLoading(false); return }
      setMyPlayerId(data.playerId)
      setPhase('waiting')
    } catch { setJoinError('Failed to join'); setJoinLoading(false) }
  }

  // ─── Loading / Error ───────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <Loader2 className="h-10 w-10 animate-spin text-pink-400" />
    </div>
  )
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
      <div className="text-center"><XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" /><p className="text-lg font-semibold">{error}</p></div>
    </div>
  )

  // Build display segments
  const wheelDisplaySegments = segmentValues.map((val, i) => ({
    label: val >= 1000 ? `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k` : String(val),
    color: WHEEL_COLORS[i % WHEEL_COLORS.length],
  }))

  // ═══ SETUP ════════════════════════════════════════════════════════════════
  if (phase === 'setup') {
    const isMulti = isLocal || isBuzz
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-pink-950 to-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-gray-900 rounded-2xl shadow-2xl p-6 border border-pink-800/40">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">🎡</div>
            <h1 className="text-2xl font-black text-white">{config?.name}</h1>
            <p className="text-pink-400 text-sm mt-1">{config?.quizSetTitle}</p>
            <Badge className="mt-2 bg-pink-700 text-white">{config?.playMode} · Spin Wheel</Badge>
          </div>

          {isMulti && (
            <div className="space-y-2 mb-4">
              <p className="text-gray-400 text-sm font-medium">Players</p>
              {setupNames.map((name, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      disabled={i === 0}
                      onClick={() => setSetupNames(prev => { const n=[...prev]; [n[i-1],n[i]]=[n[i],n[i-1]]; return n })}
                      className="text-pink-400 hover:text-pink-200 disabled:opacity-20 leading-none px-1 text-xs"
                      title="Move up"
                    >▲</button>
                    <button
                      disabled={i === setupNames.length - 1}
                      onClick={() => setSetupNames(prev => { const n=[...prev]; [n[i],n[i+1]]=[n[i+1],n[i]]; return n })}
                      className="text-pink-400 hover:text-pink-200 disabled:opacity-20 leading-none px-1 text-xs"
                      title="Move down"
                    >▼</button>
                  </div>
                  <Input value={name} onChange={e => setSetupNames(prev => prev.map((n, j) => j === i ? e.target.value : n))}
                    placeholder={`Player ${i + 1}`} className="bg-gray-800 border-gray-700 text-white flex-1"
                    onKeyDown={e => e.key === 'Enter' && startGame()} />
                  {setupNames.length > 2 && (
                    <Button size="sm" variant="ghost" className="text-gray-400 hover:text-red-400"
                      onClick={() => setSetupNames(prev => prev.filter((_, j) => j !== i))}>✕</Button>
                  )}
                </div>
              ))}
              {setupNames.length < (config?.maxPlayers ?? 8) && (
                <Button size="sm" variant="outline" className="w-full border-gray-700 text-gray-400"
                  onClick={() => setSetupNames(prev => [...prev, ''])}>+ Add Player</Button>
              )}
            </div>
          )}

          <div className="bg-gray-800/60 rounded-xl p-3 mb-4 space-y-1 text-xs text-gray-400">
            <div className="flex justify-between"><span>Segments</span><span className="text-white font-semibold">{config?.wheelSegments}</span></div>
            <div className="flex justify-between"><span>Points range</span><span className="text-white font-semibold">{config?.wheelMinPoints} – {config?.wheelMaxPoints}</span></div>
            <div className="flex justify-between"><span>Deduct on wrong</span>
              <span className={config?.wheelDeductOnWrong ? 'text-red-400 font-semibold' : 'text-green-400 font-semibold'}>
                {config?.wheelDeductOnWrong ? 'Yes (can go negative)' : 'No'}
              </span>
            </div>
            <div className="flex justify-between"><span>Time limit</span><span className="text-white font-semibold">{config?.timeLimitSeconds}s per question</span></div>
            <div className="flex justify-between"><span>Questions</span><span className="text-white font-semibold">{config?.questionsCount ?? config?.questions.length}</span></div>
          </div>

          {/* Wheel preview + segment customization */}
          <div className="flex justify-center mb-2 opacity-80">
            <SpinWheelSVG segments={wheelDisplaySegments} rotation={0} spinning={false} />
          </div>

          <button
            onClick={() => setShowCustomWheel(v => !v)}
            className="w-full text-xs text-pink-300 hover:text-pink-100 mb-3 flex items-center justify-center gap-1"
          >
            {showCustomWheel ? '▲' : '▼'} {showCustomWheel ? 'Hide' : 'Customize'} segment values
          </button>

          {showCustomWheel && (
            <div className="bg-gray-800/70 rounded-xl p-3 mb-4 border border-gray-700">
              <p className="text-xs text-gray-400 mb-2">Edit point value for each segment (drag to reorder — coming soon):</p>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {segmentValues.map((val, i) => (
                  <div key={i} className="text-center">
                    <div className="text-xs mb-1 font-bold" style={{ color: WHEEL_COLORS[i % WHEEL_COLORS.length] }}>
                      {i + 1}
                    </div>
                    <Input
                      type="number" value={val} min={0} step={50}
                      onChange={e => {
                        const v = Math.max(0, parseInt(e.target.value) || 0)
                        setSegmentValues(prev => prev.map((s, j) => j === i ? v : s))
                      }}
                      className="h-8 text-xs text-center bg-gray-700 border-gray-600 text-white px-1"
                    />
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" className="w-full text-xs border-gray-600 text-gray-400 h-7"
                onClick={() => { if (config) setSegmentValues(buildSegmentValues(config)) }}>
                ↺ Regenerate randomly from min/max
              </Button>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={() => setMusicEnabled(m => !m)} variant="outline" size="sm" className="border-gray-700 text-gray-400">
              {musicEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button onClick={startGame} className="flex-1 bg-pink-600 hover:bg-pink-500 text-white font-bold text-lg py-5">
              🎡 Start Game
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ═══ JOIN ═════════════════════════════════════════════════════════════════
  if (phase === 'join') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 to-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-gray-900 rounded-2xl p-6 border border-pink-800/40">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🎡</div>
            <h2 className="text-xl font-bold text-white">Join Spin Wheel</h2>
            <p className="text-gray-400 text-sm">Room: <span className="text-pink-400 font-bold">{joinRoomCode}</span></p>
          </div>
          <Input value={joinNickname} onChange={e => setJoinNickname(e.target.value)}
            placeholder="Your nickname" maxLength={20} className="bg-gray-800 border-gray-700 text-white mb-3"
            onKeyDown={e => e.key === 'Enter' && handleJoin()} />
          {joinError && <p className="text-red-400 text-sm mb-3">{joinError}</p>}
          <Button onClick={handleJoin} disabled={joinLoading} className="w-full bg-pink-600 hover:bg-pink-500 text-white font-bold">
            {joinLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join Game'}
          </Button>
        </div>
      </div>
    )
  }

  // ═══ WAITING ══════════════════════════════════════════════════════════════
  if (phase === 'waiting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 to-gray-950 flex items-center justify-center">
        <div className="text-center text-white">
          <Loader2 className="h-10 w-10 animate-spin text-pink-400 mx-auto mb-4" />
          <p className="text-lg font-semibold">Waiting for host to start…</p>
          <p className="text-gray-400 text-sm mt-1">Room: {joinRoomCode}</p>
        </div>
      </div>
    )
  }

  // ═══ LOBBY ════════════════════════════════════════════════════════════════
  if (phase === 'lobby') {
    const joinUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/gameshow/${shareCode}?room=${roomCode}`
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-pink-950 to-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-gray-900 rounded-2xl p-6 border border-pink-800/40 text-center">
          <div className="text-4xl mb-2">🎡</div>
          <h1 className="text-2xl font-black text-white mb-1">{config?.name}</h1>
          <p className="text-gray-400 text-sm mb-2">Room code</p>
          <p className="text-pink-400 font-mono text-4xl font-black mb-4 tracking-widest">{roomCode}</p>
          <LobbyQR url={joinUrl} />
          <p className="text-gray-300 text-sm mb-4">Players joined: <span className="text-pink-400 font-bold">{onlineLobbyPlayers.length}</span></p>
          {onlineLobbyPlayers.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center mb-4">
              {onlineLobbyPlayers.map(p => <Badge key={p.id} className="bg-pink-700 text-white">{p.nickname}</Badge>)}
            </div>
          )}
          <Button onClick={startGame} disabled={onlineLobbyPlayers.length === 0}
            className="w-full bg-pink-600 hover:bg-pink-500 text-white font-bold">
            Start Game ({onlineLobbyPlayers.length} players)
          </Button>
        </div>
      </div>
    )
  }

  // ═══ SPIN ═════════════════════════════════════════════════════════════════
  if (phase === 'spin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-pink-950 to-gray-950 flex flex-col items-center justify-center p-4 gap-6">
        {/* Player badge */}
        {(isLocal || isBuzz) && currentPlayer && (
          <div className="text-center">
            <span className="inline-block px-4 py-1.5 rounded-full text-sm font-bold text-white shadow-lg"
              style={{ backgroundColor: currentPlayer.avatarColor }}>
              {currentPlayer.nickname}'s turn
            </span>
          </div>
        )}

        <div className="text-center">
          <h2 className="text-white text-xl font-bold">Question {currentIdx + 1} of {questions.length}</h2>
          <p className="text-gray-400 text-sm mt-1">
            {wheelSpinning ? 'Spinning…' : spunPoints > 0 ? `You landed on ${spunPoints.toLocaleString()} pts!` : 'Spin the wheel to reveal your point value!'}
          </p>
        </div>

        <SpinWheelSVG
          segments={wheelDisplaySegments}
          rotation={wheelRotation}
          spinning={wheelSpinning}
          onSpinEnd={onWheelSpinEnd}
        />

        {spunPoints > 0 && !wheelSpinning && (
          <div className="text-center animate-pulse">
            <div className="text-5xl font-black text-yellow-400">{spunPoints.toLocaleString()}</div>
            <div className="text-gray-300 text-sm">points at stake</div>
            {config?.wheelDeductOnWrong && (
              <div className="text-red-400 text-xs mt-1">−{spunPoints.toLocaleString()} if wrong</div>
            )}
          </div>
        )}

        {!wheelSpinning && spunPoints === 0 && (
          <Button onClick={handleSpin} size="lg"
            className="bg-pink-600 hover:bg-pink-500 text-white font-black text-xl px-12 py-6 rounded-2xl shadow-xl">
            SPIN! 🎡
          </Button>
        )}

        {wheelSpinning && (
          <div className="text-pink-300 text-lg font-bold animate-pulse">Spinning…</div>
        )}

        {/* Mini scoreboard for local */}
        {players.length > 1 && (
          <div className="flex gap-3">
            {players.map((p, i) => (
              <div key={p.id} className={`text-center px-3 py-1 rounded-lg ${i === currentPlayerIdx ? 'bg-pink-700' : 'bg-gray-800'}`}>
                <div className="text-white text-xs font-semibold">{p.nickname}</div>
                <div className="text-yellow-400 text-xs font-bold">{p.score.toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ═══ QUESTION ═════════════════════════════════════════════════════════════
  if (phase === 'question' && currentQuestion) {
    const opts = parseOptions(currentQuestion)
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col">
        {/* Header */}
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-gray-400 text-xs">Q{currentIdx + 1}/{questions.length}</div>
            {(isLocal || isBuzz) && currentPlayer && (
              <div className="text-sm font-bold truncate" style={{ color: currentPlayer.avatarColor }}>
                {currentPlayer.nickname}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className="bg-yellow-600 text-white font-bold text-sm px-3">🎡 {spunPoints.toLocaleString()} pts</Badge>
            {config?.wheelDeductOnWrong && (
              <Badge className="bg-red-900/60 text-red-300 text-xs">−{spunPoints} if wrong</Badge>
            )}
          </div>
          <TimerRing timeLeft={timeLeft} maxTime={config?.timeLimitSeconds ?? 30} />
        </div>

        <div className="flex-1 flex flex-col px-4 py-6 max-w-2xl mx-auto w-full">
          {currentQuestion.imageUrl && (
            <img src={currentQuestion.imageUrl} alt="" className="w-full max-h-48 object-contain rounded-xl mb-4" />
          )}
          <div className="bg-gray-900 rounded-2xl p-5 mb-6 border border-gray-800">
            <div className="text-white text-lg font-semibold leading-relaxed"
              dangerouslySetInnerHTML={{ __html: currentQuestion.stem }} />
          </div>

          {config?.clickStartToCount && !timerRunning && !submitted && (
            <Button onClick={() => setTimerRunning(true)}
              className="w-full bg-pink-600 hover:bg-pink-500 text-white font-bold mb-4">
              Start Timer
            </Button>
          )}

          {isFillBlank ? (
            <div className="space-y-3">
              <Input value={fillAnswer} onChange={e => setFillAnswer(e.target.value)}
                placeholder="Your answer…" disabled={submitted}
                className="bg-gray-800 border-gray-700 text-white text-lg"
                onKeyDown={e => e.key === 'Enter' && !submitted && handleAnswer(fillAnswer)} />
              <Button onClick={() => handleAnswer(fillAnswer)} disabled={submitted || !fillAnswer.trim()}
                className="w-full bg-pink-600 hover:bg-pink-500 text-white font-bold">
                Submit Answer
              </Button>
            </div>
          ) : (
            <div className={`grid ${opts.length <= 2 ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
              {opts.map((opt, i) => (
                <button key={i} onClick={() => !submitted && handleAnswer(opt)} disabled={submitted}
                  className={`${ANS_COLORS[i % ANS_COLORS.length]} text-white font-bold rounded-2xl p-4 text-left transition-all disabled:opacity-60
                    ${selectedAnswer === opt ? 'ring-4 ring-white scale-95' : 'hover:scale-[1.02] active:scale-95'}`}>
                  <span className="text-xs opacity-70 block mb-1">{String.fromCharCode(65 + i)}</span>
                  <span>{opt}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ═══ REVEAL ═══════════════════════════════════════════════════════════════
  if (phase === 'reveal' && currentQuestion) {
    const opts = parseOptions(currentQuestion)
    const correctAnswers = getCorrectAnswers(currentQuestion)
    const pts = isCorrect ? spunPoints : ((config?.wheelDeductOnWrong || config?.deductOnWrong) ? -spunPoints : 0)
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 gap-6">
        {showConfetti && isCorrect && <Confetti />}

        <div className={`text-center ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
          {isCorrect
            ? <CheckCircle2 className="h-20 w-20 mx-auto mb-3" />
            : <XCircle className="h-20 w-20 mx-auto mb-3" />
          }
          <div className="text-3xl font-black">{isCorrect ? 'Correct! 🎉' : 'Wrong!'}</div>
          <div className={`text-3xl font-black mt-2 ${pts > 0 ? 'text-yellow-400' : pts < 0 ? 'text-red-400' : 'text-gray-400'}`}>
            {pts > 0 ? `+${pts.toLocaleString()}` : pts < 0 ? pts.toLocaleString() : '0'} pts
          </div>
        </div>

        {opts.length > 0 && (
          <div className="w-full max-w-md space-y-2">
            {opts.map((opt, i) => {
              const isCor = correctAnswers.includes(opt)
              const isSel = selectedAnswer === opt
              return (
                <div key={i} className={`rounded-xl p-3 text-sm font-semibold flex items-center gap-2
                  ${isCor ? 'bg-green-700 text-white' : isSel ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-400'}`}>
                  {isCor ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : isSel ? <XCircle className="h-4 w-4 shrink-0" /> : <span className="w-4" />}
                  {opt}
                </div>
              )
            })}
          </div>
        )}

        {!opts.length && selectedAnswer && (
          <div className="w-full max-w-md bg-gray-800 rounded-xl p-3 text-sm">
            <span className="text-gray-400">Your answer: </span>
            <span className={isCorrect ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>{selectedAnswer}</span>
            {!isCorrect && <div className="mt-1 text-gray-400">Correct: <span className="text-green-400">{correctAnswers.join(', ')}</span></div>}
          </div>
        )}

        {currentQuestion.explanation && (
          <div className="w-full max-w-md bg-gray-800/60 rounded-xl p-3 text-gray-300 text-sm border border-gray-700"
            dangerouslySetInnerHTML={{ __html: currentQuestion.explanation }} />
        )}

        <Button onClick={() => { clearTimeout(revealTimeoutRef.current!); advanceFromReveal() }}
          className="bg-pink-600 hover:bg-pink-500 text-white font-bold px-8">
          Continue <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    )
  }

  // ═══ LEADERBOARD ══════════════════════════════════════════════════════════
  if (phase === 'leaderboard') {
    const sorted = [...players].sort((a, b) => b.score - a.score)
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
        <Trophy className="h-12 w-12 text-yellow-400 mb-3" />
        <h2 className="text-2xl font-black text-white mb-6">Leaderboard</h2>
        <div className="w-full max-w-md space-y-3 mb-8">
          {sorted.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 bg-gray-900 rounded-xl px-4 py-3 border border-gray-800">
              <span className={`text-lg font-black w-8 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-500'}`}>
                #{i + 1}
              </span>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: p.avatarColor }}>{p.nickname[0].toUpperCase()}</div>
              <span className="flex-1 text-white font-semibold">{p.nickname}</span>
              <span className={`font-black ${p.score < 0 ? 'text-red-400' : 'text-yellow-400'}`}>{p.score.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <Button onClick={() => setPhase('gameover')} className="bg-pink-600 hover:bg-pink-500 text-white font-bold px-8">
          See Final Results
        </Button>
      </div>
    )
  }

  // ═══ GAMEOVER ═════════════════════════════════════════════════════════════
  if (phase === 'gameover') {
    const sorted = [...players].sort((a, b) => b.score - a.score)
    const winner = sorted[0]
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-pink-950 to-gray-950 flex flex-col items-center justify-center p-6">
        <Confetti />
        <div className="text-6xl mb-3">🎡</div>
        <Trophy className="h-16 w-16 text-yellow-400 mb-2" />
        <h2 className="text-3xl font-black text-white mb-1">Game Over!</h2>
        {winner && (
          <p className="text-pink-300 text-lg mb-6">
            🏆 {winner.nickname} wins with {winner.score.toLocaleString()} pts!
          </p>
        )}
        <div className="w-full max-w-md space-y-2 mb-8">
          {sorted.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 bg-gray-900/80 rounded-xl px-4 py-3">
              <span className={`text-lg font-black w-8 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-500'}`}>
                #{i + 1}
              </span>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: p.avatarColor }}>{p.nickname[0].toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-semibold">{p.nickname}</div>
                <div className="text-gray-400 text-xs">{p.correctCount}✓ {p.wrongCount}✗</div>
              </div>
              <span className={`font-black ${p.score < 0 ? 'text-red-400' : 'text-yellow-400'}`}>{p.score.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <Button onClick={() => window.location.reload()} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800">
            <RotateCcw className="h-4 w-4 mr-2" /> Play Again
          </Button>
          <Button onClick={() => { window.location.href = '/' }} className="bg-pink-600 hover:bg-pink-500 text-white">
            <Home className="h-4 w-4 mr-2" /> Home
          </Button>
        </div>
      </div>
    )
  }

  return null
}
