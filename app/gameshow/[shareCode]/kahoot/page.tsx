'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Trophy, CheckCircle2, XCircle, ChevronRight, RotateCcw, Home, Wifi, Volume2, VolumeX, QrCode, LogOut, Zap } from 'lucide-react'
import { useAudio } from '../../useAudio'
import QRCode from 'qrcode'

// ─── Types ───────────────────────────────────────────────────────────────────
type Question = {
  id: string; stem: string; questionType: string; options: string[] | string | null
  correctAnswer: string; explanation: string | null; difficulty: string; imageUrl?: string | null
}
type GameshowConfig = {
  id: string; shareCode: string; name: string; type: string
  playMode: 'SINGLE' | 'LOCAL' | 'ONLINE' | 'BUZZ'; selectionMode: 'LINEAR' | 'FREE_CHOICE'
  scoringMode: 'SPEED_ACCURACY' | 'ACCURACY_ONLY'; questionsCount: number | null
  timeLimitSeconds: number; enableStreak: boolean; streakBonus: number
  shuffleQuestions: boolean; showLeaderboard: boolean; clickStartToCount: boolean
  buzzerMode: boolean; manualScoring: boolean; buzzButton: boolean
  betEnabled: boolean; betTimes: number; betMultiple: number; betWrongAnswer: string
  deductOnWrong?: boolean; allowOthersOnIncorrect?: boolean
  maxPlayers: number; shortLink: string | null; coverImage: string | null; quizSetTitle: string; questions: Question[]
}
type Player = {
  id: string; nickname: string; avatarColor: string
  score: number; correctCount: number; wrongCount: number; streak: number; bestStreak: number
  lastPointsEarned: number
}
type Phase = 'setup' | 'lobby' | 'join' | 'waiting' | 'question' | 'reveal' | 'scoring' | 'leaderboard' | 'gameover' | 'select'

// ─── Colors ──────────────────────────────────────────────────────────────────
const KAHOOT_COLORS = [
  { bg: 'bg-red-500 hover:bg-red-400', label: 'bg-red-500', icon: '🔴', text: 'text-white', border: 'border-red-600' },
  { bg: 'bg-blue-500 hover:bg-blue-400', label: 'bg-blue-500', icon: '🔵', text: 'text-white', border: 'border-blue-600' },
  { bg: 'bg-yellow-400 hover:bg-yellow-300', label: 'bg-yellow-400', icon: '🟡', text: 'text-black', border: 'border-yellow-500' },
  { bg: 'bg-green-500 hover:bg-green-400', label: 'bg-green-500', icon: '🟢', text: 'text-white', border: 'border-green-600' },
]
const PLAYER_COLORS = ['#6366f1','#ef4444','#f59e0b','#10b981','#8b5cf6','#ec4899','#06b6d4','#84cc16']

// ─── Utilities ───────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]; for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]] }; return a
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
  return s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d')
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
function Confetti() {
  const pieces = Array.from({ length: 30 }, (_,i) => ({
    id: i, color: ['#ff0','#f0f','#0ff','#0f0','#f60','#60f'][i%6],
    left: `${Math.random()*100}%`, delay: `${Math.random()*0.5}s`, duration: `${0.8+Math.random()*0.6}s`,
  }))
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {pieces.map(p => (
        <div key={p.id} className="absolute w-2 h-2 rounded-sm"
          style={{ left:p.left, top:'-8px', backgroundColor:p.color, animation:`fall ${p.duration} ease-in ${p.delay} forwards` }} />
      ))}
      <style>{`@keyframes fall{to{transform:translateY(100vh) rotate(720deg);opacity:0;}}`}</style>
    </div>
  )
}

// ─── Timer Ring ────────────────────────────────────────────────────────────────
function TimerRing({ timeLeft, maxTime }: { timeLeft:number; maxTime:number }) {
  const pct = timeLeft/maxTime; const r=28; const c=2*Math.PI*r
  const color = pct>0.5?'#22c55e':pct>0.25?'#eab308':'#ef4444'
  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="80" height="80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#374151" strokeWidth="6"/>
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={c} strokeDashoffset={c-c*pct} style={{transition:'stroke-dashoffset 1s linear,stroke 0.3s'}}/>
      </svg>
      <span className={`text-2xl font-black z-10 ${pct<0.25?'text-red-400 animate-pulse':'text-white'}`}>{timeLeft}</span>
    </div>
  )
}

// ─── LobbyQR (large QR for Online lobby screen) ─────────────────────────────────
function LobbyQR({ url }: { url: string }) {
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    if (url) QRCode.toDataURL(url, { margin: 1, width: 280 }).then(setQr).catch(() => {})
  }, [url])
  if (!qr) return <div className="w-48 h-48 mx-auto bg-white/20 rounded-2xl animate-pulse mb-2" />
  return <img src={qr} alt="QR Code" className="w-56 h-56 mx-auto rounded-2xl border-4 border-white/40 mb-2" />
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function KahootPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const shareCode = params.shareCode as string
  // ?room=ROOMCODE → player is joining an existing online session
  const joinRoomCode = searchParams.get('room')

  const [config, setConfig] = useState<GameshowConfig|null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string|null>(null)
  const [musicEnabled, setMusicEnabled] = useState(true)

  const audio = useAudio(musicEnabled)

  const [phase, setPhase] = useState<Phase>('setup')
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState(30)
  const [questionStartTime, setQuestionStartTime] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')

  const [selectedAnswer, setSelectedAnswer] = useState<string|null>(null)
  const [selectedMultiple, setSelectedMultiple] = useState<string[]>([])
  const [fillAnswer, setFillAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState<boolean|null>(null)
  const [distribution, setDistribution] = useState<Record<string,number>>({})

  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0)
  const [setupNames, setSetupNames] = useState([''])
  const [roomCode, setRoomCode] = useState<string|null>(null)
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set())

  // Online multiplayer — join flow (player device)
  const [joinNickname, setJoinNickname] = useState('')
  const [joinError, setJoinError] = useState<string|null>(null)
  const [joinLoading, setJoinLoading] = useState(false)
  const [myPlayerId, setMyPlayerId] = useState<string|null>(null)
  const [onlineLobbyPlayers, setOnlineLobbyPlayers] = useState<{id:string;nickname:string}[]>([])
  const [onlineSessionStarted, setOnlineSessionStarted] = useState(false)
  const lobbyPollRef = useRef<NodeJS.Timeout|null>(null)
  // Local multiplayer scoring phase
  const [scoringAdjustments, setScoringAdjustments] = useState<Record<string,number>>({})
  const [scoringNotes, setScoringNotes] = useState('')

  // Online player personal score tracking (players[] is empty on player devices)
  const [myLastPts, setMyLastPts] = useState(0)
  const [myTotalScore, setMyTotalScore] = useState(0)
  const [myStreak, setMyStreak] = useState(0)

  // Exit game confirm
  const [exitConfirm, setExitConfirm] = useState(false)

  // Buzz mode state (local multiplayer legacy)
  const [buzzedPlayer, setBuzzedPlayer] = useState<number|null>(null)
  const [buzzerOpen, setBuzzerOpen] = useState(false)
  const [showBuzz, setShowBuzz] = useState(false)
  // BUZZ play mode (online) state
  type BuzzState = { playerId: string; playerNickname: string; answer: string | null; isCorrect: boolean | null; isBuzzing?: boolean }
  const [buzzState, setBuzzState] = useState<BuzzState|null>(null)
  const [disabledOptions, setDisabledOptions] = useState<string[]>([])
  const [disabledPlayerIds, setDisabledPlayerIds] = useState<string[]>([])
  const [hasBuzzed, setHasBuzzed] = useState(false) // player pressed buzz button
  const [buzzTimeRemaining, setBuzzTimeRemaining] = useState(0) // admin: time left when Result clicked
  const [buzzWrongPending, setBuzzWrongPending] = useState(false) // admin: wrong answer, waiting for Continue or Reveal
  // Bet mechanism
  const [betsRemaining, setBetsRemaining] = useState(0)
  const [isBetting, setIsBetting] = useState(false)
  // B2b: Local multiplayer pass-on-incorrect state
  const [passAttemptedPlayerIds, setPassAttemptedPlayerIds] = useState<Set<string>>(new Set())
  const [passWrongOptions, setPassWrongOptions] = useState<string[]>([])
  const [passShowPicker, setPassShowPicker] = useState(false)

  const timerRef = useRef<NodeJS.Timeout|null>(null)
  const revealTimeoutRef = useRef<NodeJS.Timeout|null>(null)
  const leaderboardTimeoutRef = useRef<NodeJS.Timeout|null>(null)
  const timeCountPlayedRef = useRef(false)
  const roomCodeRef = useRef<string|null>(null)
  const evsRef = useRef<EventSource|null>(null)
  const configRef = useRef<GameshowConfig|null>(null)
  // Ref to always read current submitted state (avoids stale closure in timer)
  const submittedRef = useRef(false)
  // Ref to always read current question index (avoids stale closure in SSE handler)
  const currentIdxRef = useRef(0)
  // Wall-clock sync: keep questionStartTime in a ref for timer effect closure
  const questionStartTimeRef = useRef(0)
  const currentQuestion = questions[currentIdx]
  const currentPlayer = players[currentPlayerIdx]
  const isMultiple = currentQuestion?.questionType === 'MULTIPLE_RESPONSE'
  const isFillBlank = currentQuestion?.questionType === 'FILL_BLANK' || currentQuestion?.questionType === 'SHORT_ANSWER'
  const isFreeChoice = config?.selectionMode === 'FREE_CHOICE'
  const waitingForStart = (config?.clickStartToCount || config?.playMode === 'BUZZ') && !timerRunning && phase === 'question'
  const isBuzzerMode = config?.buzzerMode && config?.playMode === 'ONLINE'

  // Sync refs
  useEffect(() => { roomCodeRef.current = roomCode }, [roomCode])
  useEffect(() => { configRef.current = config }, [config])
  useEffect(() => { submittedRef.current = submitted }, [submitted])
  useEffect(() => { currentIdxRef.current = currentIdx }, [currentIdx])
  useEffect(() => { questionStartTimeRef.current = questionStartTime }, [questionStartTime])

  // Fetch config — detect join vs admin flow
  useEffect(() => {
    fetch(`/api/gameshow/${shareCode}`).then(r=>r.json()).then(async data => {
      if (data.error){setError(data.error);setLoading(false);return}
      if (data.type!=='KAHOOT'){setError('This gameshow is not a Kahoot game');setLoading(false);return}
      setConfig(data)
      if (data.betEnabled && data.betTimes) setBetsRemaining(data.betTimes)
      if ((data.playMode==='ONLINE' || data.playMode==='BUZZ') && joinRoomCode) {
        // Player joining existing room
        setLoading(false)
        setPhase('join')
      } else if ((data.playMode==='ONLINE' || data.playMode==='BUZZ') && !joinRoomCode) {
        // Admin: auto-create online session, skip name entry screen
        try {
          const res = await fetch(`/api/gameshow/${shareCode}/session`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({})
          })
          const sData = await res.json()
          // Use server's authoritative questionOrder to stay in sync with players
          const gs = sData.gameState ? (typeof sData.gameState==='string' ? JSON.parse(sData.gameState) : sData.gameState) : {}
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
    }).catch(()=>{setError('Failed to load gameshow');setLoading(false)})
  }, [shareCode])

  // Opening music
  useEffect(() => { if (phase==='setup'&&!loading&&!joinRoomCode) audio.playBg('opening', 0.5) }, [phase, loading])

  // B2c: Ensure Local Multiplayer starts with at least 2 player inputs
  useEffect(() => {
    if ((config?.playMode === 'LOCAL' || config?.playMode === 'BUZZ') && phase === 'setup' && setupNames.length < 2) {
      setSetupNames(prev => [...prev, ''])
    }
  }, [config?.playMode, phase])

  // Podium music on gameover
  useEffect(() => { if (phase === 'gameover') { audio.stopAll(); audio.playBg('podium', 0.7) } }, [phase])

  // Online lobby polling — host polls for players joining the room
  useEffect(() => {
    if (phase!=='lobby'||!roomCode) return
    const poll = async () => {
      try {
        const res = await fetch(`/api/gameshow/${shareCode}/session/${roomCode}`)
        const data = await res.json()
        if (data.players) setOnlineLobbyPlayers(data.players.map((p:any)=>({id:p.id,nickname:p.nickname})))
      } catch {}
    }
    poll()
    lobbyPollRef.current = setInterval(poll, 2000)
    return () => clearInterval(lobbyPollRef.current!)
  }, [phase, roomCode])

  // Online player: subscribe to SSE after joining room — follow admin's game state
  useEffect(() => {
    if (!joinRoomCode || !myPlayerId) return
    let cancelled = false

    const init = async () => {
      try {
        const res = await fetch(`/api/gameshow/${shareCode}/session/${joinRoomCode}`)
        const data = await res.json()
        if (cancelled || !data.gameshow) return
        const qs = data.gameshow.quizSet?.questions ?? []
        const gs = data.gameState ? (typeof data.gameState==='string' ? JSON.parse(data.gameState) : data.gameState) : {}
        const orderedQs = gs?.questionOrder
          ? gs.questionOrder.map((id:string)=>qs.find((q:any)=>q.id===id)).filter(Boolean)
          : qs
        setQuestions(orderedQs)
        if (data.players) setOnlineLobbyPlayers(data.players.map((p:any)=>({id:p.id,nickname:p.nickname})))
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
            setOnlineLobbyPlayers(msg.players.map((p:any)=>({id:p.id,nickname:p.nickname})))
            setPlayers(msg.players.map((p:any, i:number)=>({
              id: p.id, nickname: p.nickname,
              avatarColor: PLAYER_COLORS[i % PLAYER_COLORS.length],
              score: p.score ?? 0,
              correctCount: p.correctCount ?? 0, wrongCount: p.wrongCount ?? 0,
              streak: p.streak ?? 0, bestStreak: p.bestStreak ?? 0,
              lastPointsEarned: p.lastPointsEarned ?? 0,
            })))
            const myIdx = msg.players.findIndex((p:any)=>p.id===myPlayerId)
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
            // buzzContinue: admin pressed Continue (wrong answer) — reset all players' states
            const isBuzzContinue = gs.buzzContinue === true
            const isNewQuestion = isBuzzContinue || idx !== currentIdxRef.current || !submittedRef.current
            if (isNewQuestion) {
              setCurrentIdx(idx)
              setSelectedAnswer(null); setSelectedMultiple([]); setFillAnswer('')
              setSubmitted(false); setIsCorrect(null); setDistribution({})
              setMyLastPts(0)
              timeCountPlayedRef.current = false
              setBuzzState(null); setHasBuzzed(false)
              if (idx !== currentIdxRef.current) setIsBetting(false)
            }
            // Always sync buzz/disabled state
            if (gs.buzzState !== undefined) {
              setBuzzState(gs.buzzState ?? null)
              // Pause local timer when someone buzzes in BUZZ mode
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
            // In BUZZ mode: admin broadcasts timerStarted:true to start all players' timers
            if (gs.timerStarted === true && cfg?.playMode === 'BUZZ') {
              const actualStart = gs.questionStartTime ?? Date.now()
              const actualElapsed = (Date.now() - actualStart) / 1000
              const actualRemaining = Math.max(1, Math.round((cfg?.timeLimitSeconds ?? 30) - actualElapsed))
              setTimeLeft(actualRemaining)
              setTimerRunning(true)
            } else if (gs.timerStarted === false && cfg?.playMode === 'BUZZ') {
              clearInterval(timerRef.current!)
              setTimerRunning(false)
            }
          } else if (gs.phase === 'reveal') {
            clearInterval(timerRef.current!)
            setPhase('reveal')
          } else if (gs.phase === 'leaderboard') {
            clearInterval(timerRef.current!)
            audio.playBg('leaderboard', 0.6)
            setPhase('leaderboard')
          } else if (gs.phase === 'select') {
            clearInterval(timerRef.current!)
            if (gs.answeredQuestionIds) setAnsweredQuestions(new Set(gs.answeredQuestionIds))
            setPhase('waiting')
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

  // BUZZ play mode: admin subscribes to SSE to receive real-time player buzz/answer notifications
  useEffect(() => {
    if (!roomCode || joinRoomCode || config?.playMode !== 'BUZZ') return
    const es = new EventSource(`/api/gameshow/${shareCode}/session/${roomCode}/events`)
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type !== 'state') return
        const gs = msg.gameState
        if (gs) {
          if (gs.buzzState !== undefined) {
            setBuzzState(gs.buzzState ?? null)
            // Stop admin timer when a player has answered — only if DB says question phase
            if (gs.buzzState?.answer != null && gs.phase === 'question') {
              clearInterval(timerRef.current!)
              setTimerRunning(false)
            }
          }
          if (gs.disabledOptions !== undefined) setDisabledOptions(gs.disabledOptions ?? [])
          if (gs.disabledPlayerIds !== undefined) setDisabledPlayerIds(gs.disabledPlayerIds ?? [])
        }
        if (msg.players) {
          setPlayers(msg.players.map((p: any, i: number) => ({
            id: p.id, nickname: p.nickname, avatarColor: PLAYER_COLORS[i % PLAYER_COLORS.length],
            score: p.score ?? 0, correctCount: p.correctCount ?? 0, wrongCount: p.wrongCount ?? 0,
            streak: p.streak ?? 0, bestStreak: p.bestStreak ?? 0, lastPointsEarned: p.lastPointsEarned ?? 0,
          })))
        }
      } catch {}
    }
    return () => es.close()
  }, [roomCode, config?.playMode, shareCode, joinRoomCode])

  // Timer for normal mode — auto-starts when question begins
  useEffect(() => {
    if (phase !== 'question' || submitted) return
    if (config?.clickStartToCount || isBuzzerMode) return
    clearInterval(timerRef.current!)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev<=5&&!timeCountPlayedRef.current){timeCountPlayedRef.current=true;audio.playTimeCount()}
        if (prev<=1){
          clearInterval(timerRef.current!)
          handleTimeout()
          return 0
        }
        return prev-1
      })
    }, 1000)
    return ()=>clearInterval(timerRef.current!)
  }, [phase, currentIdx])

  // Timer for clickStartToCount / buzz mode — starts when timerRunning becomes true
  // Uses wall-clock (questionStartTimeRef) so host and player displays stay in sync
  useEffect(() => {
    if (!timerRunning) return
    clearInterval(timerRef.current!)
    timerRef.current = setInterval(() => {
      const maxTime = configRef.current?.timeLimitSeconds ?? 30
      const elapsed = (Date.now() - questionStartTimeRef.current) / 1000
      const remaining = Math.max(0, Math.round(maxTime - elapsed))
      if (remaining <= 5 && !timeCountPlayedRef.current) { timeCountPlayedRef.current = true; audio.playTimeCount() }
      if (remaining <= 0) { clearInterval(timerRef.current!); setTimeLeft(0); handleTimeout(); return }
      setTimeLeft(remaining)
    }, 500)
    return ()=>clearInterval(timerRef.current!)
  }, [timerRunning])

  const handleTimeout = useCallback(() => {
    if (submittedRef.current) return  // Use ref to always read current submitted state
    audio.stopAll(); audio.stopTimeCount()
    const rc = roomCodeRef.current
    if (joinRoomCode) {
      // Online player: timer ran out without answering — just mark as not answered, wait for SSE
      setIsCorrect(false); setSubmitted(true)
      return
    }
    // Admin or local: play lost sound, mark incorrect
    audio.playOnce('lost', 0.9)
    setIsCorrect(false); setSubmitted(true)
    buildDistribution()
    if (rc) {
      // Online admin: fetch latest scores then broadcast reveal
      fetch(`/api/gameshow/${shareCode}/session/${rc}`).then(r=>r.json()).then(data=>{
        if (data.players) setPlayers(data.players.map((p:any,i:number)=>({
          id:p.id,nickname:p.nickname,avatarColor:PLAYER_COLORS[i%PLAYER_COLORS.length],
          score:p.score??0,correctCount:p.correctCount??0,wrongCount:p.wrongCount??0,
          streak:p.streak??0,bestStreak:p.bestStreak??0,lastPointsEarned:p.lastPointsEarned??0,
        })))
      }).catch(()=>{})
      fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ gameState: { phase: 'reveal' } })
      }).catch(()=>{})
      revealTimeoutRef.current = setTimeout(()=>setPhase('reveal'), 800)
    } else {
      // Local/single mode
      revealTimeoutRef.current = setTimeout(()=>setPhase('reveal'), 800)
    }
  }, [joinRoomCode, shareCode])

  const buildDistribution = () => {
    if (!currentQuestion) return
    const opts = parseOptions(currentQuestion)
    const dist: Record<string,number>={};let total=100
    opts.forEach((o,i)=>{
      const isC=getCorrectAnswers(currentQuestion).some(c=>c.toLowerCase()===o.toLowerCase())
      const v=isC?Math.round(35+Math.random()*30):Math.round(5+Math.random()*20)
      dist[o]=Math.min(v,total-(opts.length-i-1)*2);total-=dist[o]
    })
    setDistribution(dist)
  }

  const computePoints=(correct:boolean, elapsed:number):number=>{
    if(!correct){
      // Deduct base points on wrong answer if option enabled
      return config?.deductOnWrong ? -1000 : 0
    }
    if(config?.scoringMode==='ACCURACY_ONLY')return 1000
    const maxTime=config?.timeLimitSeconds??30
    return Math.round(1000*(0.3+0.7*Math.max(0,(maxTime-elapsed)/maxTime)))
  }

  const handleAnswer=(answer:string)=>{
    if(submitted||phase!=='question'||waitingForStart)return
    const isBuzzMode = config?.playMode === 'BUZZ'
    // BUZZ mode: if another player already has buzzState, block answer
    if(isBuzzMode && buzzState && buzzState.playerId !== myPlayerId) return
    // BUZZ mode with buzzButton: player must buzz first
    if(isBuzzMode && config?.buzzButton && !hasBuzzed) return
    // Disable options check
    if(disabledOptions.includes(answer)) return
    if(passWrongOptions.includes(answer)) return
    clearInterval(timerRef.current!)
    audio.stopAll(); audio.stopTimeCount()
    const elapsed=(Date.now()-questionStartTime)/1000
    const corrects=getCorrectAnswers(currentQuestion)
    const correct=corrects.some(c=>normalize(c)===normalize(answer))
    const streakBonus=config?.enableStreak&&correct?(currentPlayer?.streak??0)*(config?.streakBonus??50):0
    let pts=computePoints(correct,elapsed)+streakBonus
    // Apply bet multiplier
    if(isBetting) {
      if(correct) {
        pts = Math.round(pts * (config?.betMultiple ?? 2))
      } else {
        const wa = config?.betWrongAnswer ?? 'NO_DEDUCTION'
        if(wa === 'ONE_X') pts = -1000
        else if(wa === 'MULTIPLE') pts = -Math.round(1000 * (config?.betMultiple ?? 2))
        else pts = 0
      }
      setBetsRemaining(prev => Math.max(0, prev - 1))
      setIsBetting(false)
    }
    setSelectedAnswer(answer); setIsCorrect(correct); setSubmitted(true)
    setAnsweredQuestions(prev=>new Set(Array.from(prev).concat(currentQuestion.id)))
    buildDistribution()
    updatePlayer(correct,pts)
    if(correct){audio.playOnce('win',0.9);if((currentPlayer?.streak??0)>=2)setShowConfetti(true);setTimeout(()=>setShowConfetti(false),1500)}
    else audio.playOnce('lost',0.9)

    // B2b: Local Multiplayer — pass to next player on incorrect (single-answer flow only)
    if (!correct && config?.playMode === 'LOCAL' && config?.allowOthersOnIncorrect && players.length > 1 && !joinRoomCode) {
      const newAttempted = new Set(passAttemptedPlayerIds)
      if (currentPlayer) newAttempted.add(currentPlayer.id)
      const remaining = players.filter(p => !newAttempted.has(p.id))
      setPassAttemptedPlayerIds(newAttempted)
      setPassWrongOptions(prev => Array.from(new Set([...prev, answer])))
      if (remaining.length > 0) {
        setPassShowPicker(true)
        setTimerRunning(false) // pause timer while host picks
        // Don't end question — host will pick next player or Continue
        return
      }
    }
    if(joinRoomCode && myPlayerId) {
      // Online player: track local score + submit to server
      setMyLastPts(pts)
      setMyTotalScore(prev => prev + pts)
      setMyStreak(prev => correct ? prev + 1 : 0)
      fetch(`/api/gameshow/${shareCode}/session/${joinRoomCode}/answer`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ playerId: myPlayerId, questionId: currentQuestion.id, answer, responseTimeMs: Math.round(elapsed*1000), isCorrect: correct, pointsEarned: pts, bet: isBetting })
      }).then(r=>r.json()).then(data=>{
        if(isBuzzMode && data.ok === false && data.reason === 'already_buzzed') {
          // Race: another player was first — revert our answer
          setSubmitted(false); setSelectedAnswer(null); setIsCorrect(null)
        }
      }).catch(()=>{})
      return
    }
    saveAnalytics(currentQuestion.id, answer, correct, pts, elapsed * 1000)
    revealTimeoutRef.current = setTimeout(()=>setPhase('reveal'),1200)
  }

  const handleMultipleSubmit=()=>{
    if(submitted||phase!=='question'||waitingForStart)return
    clearInterval(timerRef.current!)
    audio.stopAll(); audio.stopTimeCount()
    const elapsed=(Date.now()-questionStartTime)/1000
    const corrects=getCorrectAnswers(currentQuestion)
    const correct=corrects.length===selectedMultiple.length&&corrects.every(c=>selectedMultiple.some(s=>normalize(s)===normalize(c)))
    let pts=computePoints(correct,elapsed)
    if(isBetting) {
      if(correct) pts = Math.round(pts * (config?.betMultiple ?? 2))
      else { const wa=config?.betWrongAnswer??'NO_DEDUCTION'; pts = wa==='ONE_X'?-1000:wa==='MULTIPLE'?-Math.round(1000*(config?.betMultiple??2)):0 }
      setBetsRemaining(prev=>Math.max(0,prev-1)); setIsBetting(false)
    }
    const answerStr=selectedMultiple.join('||')
    setIsCorrect(correct); setSubmitted(true)
    setAnsweredQuestions(prev=>new Set(Array.from(prev).concat(currentQuestion.id)))
    buildDistribution(); updatePlayer(correct,pts)
    if(correct){audio.playOnce('win',0.9);setShowConfetti(true);setTimeout(()=>setShowConfetti(false),1500)}
    else audio.playOnce('lost',0.9)
    if(joinRoomCode && myPlayerId) {
      setMyLastPts(pts)
      setMyTotalScore(prev => prev + pts)
      setMyStreak(prev => correct ? prev + 1 : 0)
      fetch(`/api/gameshow/${shareCode}/session/${joinRoomCode}/answer`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ playerId: myPlayerId, questionId: currentQuestion.id, answer: answerStr, responseTimeMs: Math.round(elapsed*1000), isCorrect: correct, pointsEarned: pts })
      }).catch(()=>{})
      return
    }
    saveAnalytics(currentQuestion.id, answerStr, correct, pts, elapsed * 1000)
    revealTimeoutRef.current = setTimeout(()=>setPhase('reveal'),1200)
  }

  const handleFillSubmit=()=>{
    if(submitted||phase!=='question'||!fillAnswer.trim()||waitingForStart)return
    clearInterval(timerRef.current!)
    audio.stopAll(); audio.stopTimeCount()
    const elapsed=(Date.now()-questionStartTime)/1000
    const corrects=getCorrectAnswers(currentQuestion)
    const correct=corrects.some(c=>normalize(c)===normalize(fillAnswer))
    let pts=computePoints(correct,elapsed)
    if(isBetting) {
      if(correct) pts = Math.round(pts * (config?.betMultiple ?? 2))
      else { const wa=config?.betWrongAnswer??'NO_DEDUCTION'; pts = wa==='ONE_X'?-1000:wa==='MULTIPLE'?-Math.round(1000*(config?.betMultiple??2)):0 }
      setBetsRemaining(prev=>Math.max(0,prev-1)); setIsBetting(false)
    }
    setIsCorrect(correct); setSubmitted(true)
    setAnsweredQuestions(prev=>new Set(Array.from(prev).concat(currentQuestion.id)))
    buildDistribution(); updatePlayer(correct,pts)
    if(correct){audio.playOnce('win',0.9);setShowConfetti(true);setTimeout(()=>setShowConfetti(false),1500)}
    else audio.playOnce('lost',0.9)
    if(joinRoomCode && myPlayerId) {
      setMyLastPts(pts)
      setMyTotalScore(prev => prev + pts)
      setMyStreak(prev => correct ? prev + 1 : 0)
      fetch(`/api/gameshow/${shareCode}/session/${joinRoomCode}/answer`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ playerId: myPlayerId, questionId: currentQuestion.id, answer: fillAnswer, responseTimeMs: Math.round(elapsed*1000), isCorrect: correct, pointsEarned: pts })
      }).catch(()=>{})
      return
    }
    saveAnalytics(currentQuestion.id, fillAnswer, correct, pts, elapsed * 1000)
    revealTimeoutRef.current = setTimeout(()=>setPhase('reveal'),1200)
  }

  const updatePlayer=(correct:boolean,pts:number)=>{
    setPlayers(prev=>prev.map((p,i)=>{
      if(i!==currentPlayerIdx)return p
      const newStreak=correct?p.streak+1:0
      return{...p,score:p.score+pts,correctCount:correct?p.correctCount+1:p.correctCount,wrongCount:!correct?p.wrongCount+1:p.wrongCount,streak:newStreak,bestStreak:Math.max(p.bestStreak,newStreak),lastPointsEarned:pts}
    }))
  }

  // B2b: Local Multiplayer — host picks next player to attempt the question
  // Timer continues from where it stopped (timeLeft is preserved when picker shows)
  const passToPlayer = (playerIdx: number) => {
    setPassShowPicker(false)
    setSubmitted(false)
    setSelectedAnswer(null)
    setIsCorrect(null)
    setCurrentPlayerIdx(playerIdx)
    // Recompute questionStartTime so the timer resumes from current timeLeft
    const maxTime = config?.timeLimitSeconds ?? 30
    const newStart = Date.now() - (maxTime - timeLeft) * 1000
    setQuestionStartTime(newStart)
    questionStartTimeRef.current = newStart
    setTimerRunning(true)
  }
  // B2b: Host skips remaining players and reveals
  const passContinue = () => {
    setPassShowPicker(false)
    setPassAttemptedPlayerIds(new Set())
    setPassWrongOptions([])
    revealTimeoutRef.current = setTimeout(() => setPhase('reveal'), 200)
  }

  const saveAnalytics = (questionId: string, answer: string, correct: boolean, pts: number, elapsedMs: number) => {
    try {
      fetch('/api/gameshow/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameshowId: config?.id,
          gameType: 'KAHOOT',
          playerNickname: currentPlayer?.nickname,
          questionId, answer, correct, points: pts, elapsedMs,
        })
      }).catch(() => {})
    } catch {}
  }

  // Online: player submits join form
  const handleJoinRoom = async () => {
    if(!joinNickname.trim()||!joinRoomCode) return
    setJoinLoading(true); setJoinError(null)
    try {
      const res = await fetch(`/api/gameshow/${shareCode}/session/${joinRoomCode}/join`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ nickname: joinNickname.trim(), avatarColor: PLAYER_COLORS[Math.floor(Math.random()*PLAYER_COLORS.length)] })
      })
      const data = await res.json()
      if (data.error) { setJoinError(data.error); setJoinLoading(false); return }
      setMyPlayerId(data.player.id)
      setPhase('waiting')
    } catch { setJoinError('Connection error. Please try again.') }
    setJoinLoading(false)
  }

  // Online admin: start game — broadcast phase to all players
  const hostStartGame = async () => {
    if(!roomCode) return
    clearInterval(lobbyPollRef.current!)
    if(isFreeChoice) {
      try {
        await fetch(`/api/gameshow/${shareCode}/session/${roomCode}`, {
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ gameState: { phase: 'select' }, status: 'ACTIVE' })
        })
      } catch {}
      audio.playBg('selecting',0.5); setPhase('select')
    } else {
      const startTime = Date.now()
      try {
        await fetch(`/api/gameshow/${shareCode}/session/${roomCode}`, {
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ gameState: { phase: 'question', currentQuestionIndex: 0, questionStartTime: startTime, buzzState: null, disabledOptions: [], disabledPlayerIds: [], timerStarted: false }, status: 'ACTIVE' })
        })
      } catch {}
      beginQuestion(0)
    }
  }

  const startGame=async()=>{
    if(!config)return
    const names=setupNames.filter(n=>n.trim())
    if(!names.length)return
    let qs=[...config.questions]
    if(config.shuffleQuestions)qs=shuffle(qs)
    if(config.questionsCount&&config.questionsCount<qs.length)qs=qs.slice(0,config.questionsCount)
    setQuestions(qs)
    const newPlayers:Player[]=names.map((n,i)=>({
      id:`p${i}`,nickname:n.trim()||`Player ${i+1}`,avatarColor:PLAYER_COLORS[i%PLAYER_COLORS.length],
      score:0,correctCount:0,wrongCount:0,streak:0,bestStreak:0,lastPointsEarned:0,
    }))
    setPlayers(newPlayers); setCurrentPlayerIdx(0); setCurrentIdx(0)
    setAnsweredQuestions(new Set())
    audio.stop('opening')

    if(config.playMode==='ONLINE'){
      try{
        const res=await fetch(`/api/gameshow/${shareCode}/session`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})})
        const data=await res.json()
        setRoomCode(data.roomCode)
        setOnlineLobbyPlayers([])
        setPhase('lobby'); return
      }catch{}
    }
    if(config.selectionMode === 'FREE_CHOICE') {
      audio.playBg('selecting', 0.5)
      setPhase('select')
    } else {
      beginQuestion(0,qs)
    }
  }

  const beginQuestion=(idx:number,qs?:Question[])=>{
    // Cancel any pending reveal or leaderboard timeouts
    clearTimeout(revealTimeoutRef.current!)
    clearTimeout(leaderboardTimeoutRef.current!)
    // Always clear any running timer first to prevent double-ticking or stale intervals
    clearInterval(timerRef.current!)
    setTimerRunning(false)
    setCurrentIdx(idx)
    setSelectedAnswer(null); setSelectedMultiple([]); setFillAnswer('')
    setSubmitted(false); setIsCorrect(null); setDistribution({})
    setTimeLeft(config?.timeLimitSeconds??30)
    setQuestionStartTime(Date.now())
    timeCountPlayedRef.current=false
    // Reset buzz state (local multiplayer legacy + BUZZ play mode)
    setBuzzedPlayer(null); setBuzzerOpen(false); setShowBuzz(false)
    setBuzzState(null); setDisabledOptions([]); setDisabledPlayerIds([]); setHasBuzzed(false); setIsBetting(false)
    setPassAttemptedPlayerIds(new Set()); setPassWrongOptions([]); setPassShowPicker(false)
    setPhase('question')

    if(config?.clickStartToCount){
      audio.playBg('wait',0.5)
      setTimerRunning(false)
    } else if(isBuzzerMode){
      // Buzz mode: show question, open buzzer, don't start timer yet
      audio.playBg('wait',0.5)
      setBuzzerOpen(true)
      setShowBuzz(true)
      setTimerRunning(false)
    } else {
      audio.playBg('kahoot-play',0.55)
      // Timer will auto-start via useEffect on [phase, currentIdx]
    }
  }

  const handleBuzz=(playerIdx:number)=>{
    if(!buzzerOpen||buzzedPlayer!==null)return
    setBuzzedPlayer(playerIdx)
    setBuzzerOpen(false)
    setCurrentPlayerIdx(playerIdx)
    // Start timer now that a player has buzzed
    audio.stop('wait')
    audio.playBg('kahoot-play',0.55)
    setQuestionStartTime(Date.now())
    setTimerRunning(true)
    clearInterval(timerRef.current!)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev<=5&&!timeCountPlayedRef.current){timeCountPlayedRef.current=true;audio.playTimeCount()}
        if (prev<=1){clearInterval(timerRef.current!);handleTimeout();return 0}
        return prev-1
      })
    }, 1000)
  }

  const handleStartCount=()=>{
    audio.stop('wait')
    audio.playBg('kahoot-play',0.55)
    const startTime = Date.now()
    setQuestionStartTime(startTime)
    questionStartTimeRef.current = startTime
    setTimerRunning(true)
    clearInterval(timerRef.current!)
    timeCountPlayedRef.current = false
    timerRef.current = setInterval(() => {
      const maxTime = configRef.current?.timeLimitSeconds ?? 30
      const elapsed = (Date.now() - questionStartTimeRef.current) / 1000
      const remaining = Math.max(0, Math.round(maxTime - elapsed))
      if (remaining <= 5 && !timeCountPlayedRef.current) { timeCountPlayedRef.current = true; audio.playTimeCount() }
      if (remaining <= 0) { clearInterval(timerRef.current!); setTimeLeft(0); handleTimeout(); return }
      setTimeLeft(remaining)
    }, 500)
    // In BUZZ mode: broadcast timer start to players
    const rc = roomCodeRef.current
    if (rc && configRef.current?.playMode === 'BUZZ') {
      fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameState: { timerStarted: true, questionStartTime: startTime } })
      }).catch(() => {})
    }
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
      if (data.ok === false) setHasBuzzed(false) // someone else was faster
    } catch { setHasBuzzed(false) }
  }

  // BUZZ play mode: admin clicks Continue (wrong answer → others can try, timer resumes)
  const handleBuzzContinue = () => {
    const rc = roomCodeRef.current
    const wrongAnswer = buzzState?.answer
    const wrongPlayerId = buzzState?.playerId
    const newDisabledOpts = wrongAnswer ? [...disabledOptions, wrongAnswer] : disabledOptions
    const newDisabledPlayers = wrongPlayerId ? [...disabledPlayerIds, wrongPlayerId] : disabledPlayerIds
    // Resume timer from where it was paused (buzzTimeRemaining captured when Result was clicked)
    const totalTime = config?.timeLimitSeconds ?? 30
    const resumeMs = (totalTime - buzzTimeRemaining) * 1000
    const resumeStartTime = Date.now() - resumeMs

    setDisabledOptions(newDisabledOpts)
    setDisabledPlayerIds(newDisabledPlayers)
    setBuzzState(null)
    setBuzzWrongPending(false)
    setSubmitted(false); setSelectedAnswer(null); setIsCorrect(null)
    setTimeLeft(buzzTimeRemaining)
    timeCountPlayedRef.current = false
    if (rc) {
      fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameState: { phase: 'question', currentQuestionIndex: currentIdx, questionStartTime: resumeStartTime, buzzState: null, disabledOptions: newDisabledOpts, disabledPlayerIds: newDisabledPlayers, buzzContinue: true, timerStarted: true } })
      }).catch(() => {})
    }
    setTimerRunning(true)
    setPhase('question')
  }

  const advanceFromLeaderboard=(isLast:boolean)=>{
    audio.stop('leaderboard')
    const rc = roomCodeRef.current
    const isOnlineAdmin = !!rc && !joinRoomCode
    if(isOnlineAdmin) {
      if(isLast) {
        fetch(`/api/gameshow/${shareCode}/session/${rc}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameState:{phase:'gameover'}})}).catch(()=>{})
        setPhase('gameover'); return
      }
      if(isFreeChoice) {
        fetch(`/api/gameshow/${shareCode}/session/${rc}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameState:{phase:'select'}})}).catch(()=>{})
        audio.playBg('selecting',0.5); setPhase('select'); return
      }
      const nextIdx = currentIdx+1
      const startTime = Date.now()
      fetch(`/api/gameshow/${shareCode}/session/${rc}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameState:{phase:'question',currentQuestionIndex:nextIdx,questionStartTime:startTime,buzzState:null,disabledOptions:[],disabledPlayerIds:[],timerStarted:false}})}).catch(()=>{})
      beginQuestion(nextIdx); return
    }
    if(config?.playMode==='LOCAL'&&players.length>1){
      const next=(currentPlayerIdx+1)%players.length
      setCurrentPlayerIdx(next)
      if(isLast&&next===0){setPhase('gameover');return}
      if(isFreeChoice){audio.playBg('selecting',0.5);setPhase('select')}
      else beginQuestion(isLast?0:currentIdx+1)
    } else {
      if(isLast){setPhase('gameover');return}
      if(isFreeChoice){audio.playBg('selecting',0.5);setPhase('select')}
      else beginQuestion(currentIdx+1)
    }
  }

  const handleNext=()=>{
    audio.stopAll()
    const rc = roomCodeRef.current
    const isOnlineAdmin = !!rc && !joinRoomCode
    // For online admin FREE_CHOICE: mark current question done before computing isLast
    // (admin never goes through handleAnswer, so answered set must be updated here)
    let newAnswered = answeredQuestions
    if(isFreeChoice && isOnlineAdmin && currentQuestion) {
      newAnswered = new Set(Array.from(answeredQuestions).concat(currentQuestion.id))
      setAnsweredQuestions(newAnswered)
    }
    const allAnswered=newAnswered.size>=questions.length
    const isLast=isFreeChoice?allAnswered:currentIdx>=questions.length-1
    if(isOnlineAdmin) {
      if(isLast) {
        fetch(`/api/gameshow/${shareCode}/session/${rc}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameState:{phase:'gameover'}})}).catch(()=>{})
        setPhase('gameover'); return
      }
      if(config?.showLeaderboard) {
        // Fetch latest player scores for leaderboard display
        fetch(`/api/gameshow/${shareCode}/session/${rc}`).then(r=>r.json()).then(data=>{
          if(data.players) setPlayers(data.players.map((p:any,i:number)=>({id:p.id,nickname:p.nickname,avatarColor:PLAYER_COLORS[i%PLAYER_COLORS.length],score:p.score??0,correctCount:p.correctCount??0,wrongCount:p.wrongCount??0,streak:p.streak??0,bestStreak:p.bestStreak??0,lastPointsEarned:p.lastPointsEarned??0})))
        }).catch(()=>{})
        fetch(`/api/gameshow/${shareCode}/session/${rc}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameState:{phase:'leaderboard',buzzState:null,disabledOptions:[],disabledPlayerIds:[]}})}).catch(()=>{})
        setBuzzState(null); setDisabledOptions([]); setDisabledPlayerIds([])
        audio.playBg('leaderboard',0.6); setPhase('leaderboard')
      } else {
        advanceFromLeaderboard(isLast)
      }
      return
    }
    // LOCAL mode with manualScoring enabled: show manual scoring screen before leaderboard
    if(config?.playMode==='LOCAL'&&players.length>1&&config?.manualScoring){
      setScoringAdjustments({})
      setScoringNotes('')
      setPhase('scoring')
      return
    }
    if(config?.showLeaderboard&&players.length>0){
      audio.playBg('leaderboard',0.6)
      setPhase('leaderboard')
      leaderboardTimeoutRef.current = setTimeout(()=>advanceFromLeaderboard(isLast),5000)
    } else {
      advanceFromLeaderboard(isLast)
    }
  }

  const confirmScoring=()=>{
    const allAnswered=answeredQuestions.size>=questions.length
    const isLast=isFreeChoice?allAnswered:currentIdx>=questions.length-1
    // Apply manual score adjustments
    if(Object.keys(scoringAdjustments).length>0){
      setPlayers(prev=>prev.map(p=>({
        ...p,
        score: p.score + (scoringAdjustments[p.id]??0)
      })))
    }
    if(config?.showLeaderboard){
      audio.playBg('leaderboard',0.6)
      setPhase('leaderboard')
      leaderboardTimeoutRef.current = setTimeout(()=>advanceFromLeaderboard(isLast),5000)
    } else {
      advanceFromLeaderboard(isLast)
    }
  }

  const generateQr=async()=>{
    const url=`${window.location.origin}/gameshow/${shareCode}`
    try{setQrDataUrl(await QRCode.toDataURL(url,{margin:1,width:200}))}catch{}
    setShowQr(true)
  }

  if(loading)return(<div className="min-h-screen bg-[#6366f1] flex items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-white"/></div>)
  if(error)return(<div className="min-h-screen bg-[#6366f1] flex items-center justify-center text-white"><div className="text-center"><XCircle className="h-12 w-12 mx-auto mb-4 opacity-70"/><p>{error}</p></div></div>)

  const MusicBtn=()=>(
    <button onClick={()=>setMusicEnabled(v=>!v)}
      className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition-all"
      title={musicEnabled?'Mute':'Unmute'}>
      {musicEnabled?<Volume2 className="h-4 w-4"/>:<VolumeX className="h-4 w-4"/>}
    </button>
  )

  // ─── SETUP ──────────────────────────────────────────────────────────────────
  if(phase==='setup'){
    const maxP=config?.playMode==='SINGLE'?1:(config?.maxPlayers??4)
    const gameUrl=typeof window!=='undefined'?`${window.location.origin}/gameshow/${shareCode}`:''
    return(
      <div className="relative min-h-screen bg-gradient-to-b from-[#6366f1] to-[#4f46e5] flex items-center justify-center p-4">
        <MusicBtn/>
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-7xl mb-2">🎮</div>
            <h1 className="text-4xl font-black text-white tracking-tight">Kahoot!</h1>
            <p className="text-indigo-200 mt-1">{config?.name}</p>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-2xl">
            <h2 className="font-bold text-gray-800 mb-4">{config?.playMode==='SINGLE'?'Enter your name':`Player names (up to ${maxP})`}</h2>
            <div className="space-y-3 mb-4">
              {setupNames.map((name,i)=>(
                <div key={i} className="flex gap-2 items-center">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{backgroundColor:PLAYER_COLORS[i%PLAYER_COLORS.length]}}/>
                  <Input value={name} onChange={e=>{const n=[...setupNames];n[i]=e.target.value;setSetupNames(n)}}
                    placeholder={config?.playMode==='SINGLE'?'Your name...':`Player ${i+1}...`} className="rounded-xl"/>
                </div>
              ))}
            </div>
            {config?.playMode!=='SINGLE'&&setupNames.length<maxP&&(
              <Button variant="outline" size="sm" onClick={()=>setSetupNames([...setupNames,''])}
                className="w-full mb-4 rounded-xl border-dashed">+ Add Player</Button>
            )}
            <div className="text-xs text-gray-500 mb-4 space-y-1">
              <div>📊 {config?.questionsCount??config?.questions?.length??0} questions · ⏱ {config?.timeLimitSeconds}s each</div>
              {config?.enableStreak&&<div>🔥 Streak bonus: +{config.streakBonus} pts per consecutive correct</div>}
              {config?.clickStartToCount&&<div>▶ Click Start to begin timer</div>}
            </div>
            {config?.playMode!=='SINGLE'&&(
              <div className="mb-4 p-3 bg-gray-50 rounded-xl">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-gray-500 truncate flex-1">{config?.shortLink||gameUrl}</div>
                  <button onClick={generateQr} className="flex-shrink-0 p-1.5 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-600 transition-all">
                    <QrCode className="h-4 w-4"/>
                  </button>
                </div>
              </div>
            )}
            {showQr&&qrDataUrl&&(
              <div className="mb-4 flex flex-col items-center gap-2">
                <img src={qrDataUrl} alt="QR Code" className="w-32 h-32 rounded-lg border-2 border-indigo-300"/>
                <button onClick={()=>setShowQr(false)} className="text-xs text-indigo-500 underline">Close</button>
              </div>
            )}
            <Button onClick={startGame} disabled={!setupNames.some(n=>n.trim())}
              className="w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold text-lg py-6 rounded-2xl">
              Let's Play!
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ─── LOBBY ──────────────────────────────────────────────────────────────────
  // ─── JOIN (player device scanned QR / opened link with ?room=) ───────────────
  if(phase==='join'){
    return(
      <div className="min-h-screen bg-gradient-to-b from-[#6366f1] to-[#4f46e5] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-6xl mb-2">🎮</div>
            <h1 className="text-3xl font-black text-white">Kahoot!</h1>
            <p className="text-indigo-200 mt-1">{config?.name}</p>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-2xl">
            <div className="text-center mb-4">
              <p className="text-gray-500 text-sm">Room</p>
              <div className="text-3xl font-black text-[#6366f1] tracking-widest">{joinRoomCode}</div>
            </div>
            <h2 className="font-bold text-gray-800 mb-3">Enter your name</h2>
            <Input value={joinNickname} onChange={e=>setJoinNickname(e.target.value)}
              placeholder="Your nickname..." className="rounded-xl mb-4"
              onKeyDown={e=>e.key==='Enter'&&handleJoinRoom()}
            />
            {joinError&&<p className="text-red-500 text-sm mb-3 text-center">{joinError}</p>}
            <Button onClick={handleJoinRoom} disabled={!joinNickname.trim()||joinLoading}
              className="w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold text-lg py-6 rounded-2xl">
              {joinLoading?<Loader2 className="h-5 w-5 animate-spin mx-auto"/>:'Join Game!'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ─── WAITING (player joined, waiting for host to start) ───────────────────────
  if(phase==='waiting'){
    return(
      <div className="min-h-screen bg-gradient-to-b from-[#6366f1] to-[#4f46e5] flex items-center justify-center p-4 text-white">
        <div className="text-center max-w-sm w-full">
          {config?.coverImage
            ? <img src={config.coverImage} alt={config?.name ?? ''} className="h-28 w-full object-cover rounded-2xl mb-3"/>
            : <div className="text-6xl mb-4 animate-bounce">🎮</div>
          }
          <h2 className="text-2xl font-black mb-1">You're in!</h2>
          <p className="text-indigo-200 mb-6">Waiting for the host…</p>
          <div className="bg-white/20 rounded-2xl p-4 mb-4">
            <p className="text-sm text-indigo-200 mb-2">Players in the room ({onlineLobbyPlayers.length}):</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {onlineLobbyPlayers.map((p,i)=>(
                <div key={p.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${p.id===myPlayerId?'bg-yellow-400/30 border border-yellow-400/50':'bg-white/10'}`}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{backgroundColor:PLAYER_COLORS[i%PLAYER_COLORS.length]}}>{p.nickname[0]?.toUpperCase()}</div>
                  <span className="font-medium">{p.nickname}</span>
                  {p.id===myPlayerId&&<span className="text-xs text-yellow-300 ml-auto">You</span>}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-indigo-300">
            <Loader2 className="h-4 w-4 animate-spin"/>
            <span className="text-sm">Waiting for host…</span>
          </div>
        </div>
      </div>
    )
  }

  // ─── LOBBY (host sees room code, QR, player list) ─────────────────────────────
  if(phase==='lobby'){
    const joinUrl=typeof window!=='undefined'?`${window.location.origin}/gameshow/${shareCode}?room=${roomCode}`:''
    return(
      <div className="relative min-h-screen bg-gradient-to-b from-[#6366f1] to-[#4f46e5] flex items-center justify-center p-4 text-white">
        <MusicBtn/>
        <div className="text-center max-w-sm w-full">
          {config?.coverImage
            ? <img src={config.coverImage} alt={config.name} className="h-32 w-full object-cover rounded-2xl mb-3"/>
            : <div className="text-4xl mb-2">🎮</div>
          }
          <h2 className="text-xl font-black mb-1">Room Code</h2>
          <div className="text-5xl font-black tracking-widest bg-white/20 rounded-2xl py-3 mb-3">{roomCode}</div>
          <p className="text-indigo-200 text-xs mb-1">Players scan to join:</p>
          {roomCode && <p className="text-xs opacity-60 mb-2 break-all px-2">{joinUrl}</p>}
          {roomCode && <LobbyQR url={joinUrl}/>}
          <div className="bg-white/10 rounded-2xl p-3 mt-3 mb-3">
            <p className="text-sm text-indigo-200 mb-2">Players waiting ({onlineLobbyPlayers.length}/{config?.maxPlayers??8}):</p>
            {onlineLobbyPlayers.length===0
              ?<p className="text-xs text-indigo-300 italic">No players yet — share the QR code!</p>
              :<div className="flex flex-wrap gap-2 justify-center">
                {onlineLobbyPlayers.map((p,i)=>(
                  <span key={p.id} className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium">{p.nickname}</span>
                ))}
              </div>
            }
          </div>
          <Button onClick={hostStartGame}
            className="w-full bg-white text-[#6366f1] font-black text-lg py-5 rounded-2xl hover:bg-indigo-50">
            {onlineLobbyPlayers.length === 0 ? "Let's Play!" : `Let's Play! (${onlineLobbyPlayers.length} players)`}
          </Button>
        </div>
      </div>
    )
  }

    // ─── SELECT (Free Choice) ────────────────────────────────────────────────────
  if(phase==='select'){
    const allAnswered=answeredQuestions.size>=questions.length
    return(
      <div className="relative min-h-screen bg-[#1a1a2e] text-white p-4">
        <MusicBtn/>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">{config?.playMode==='LOCAL'?`${currentPlayer?.nickname}'s Turn`:'Choose a Question'}</h2>
              <p className="text-indigo-300 text-sm">{answeredQuestions.size}/{questions.length} done &middot; {currentPlayer?.score??0} pts</p>
            </div>
            <Button size="sm" variant="outline"
              onClick={()=>{
                audio.stopAll()
                const rc=roomCodeRef.current
                if(rc&&!joinRoomCode){
                  fetch(`/api/gameshow/${shareCode}/session/${rc}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameState:{phase:'gameover'},status:'FINISHED'})}).catch(()=>{})
                }
                setPhase('gameover')
              }}
              className="border-red-500/50 text-red-400 hover:bg-red-900/20">
              <LogOut className="h-4 w-4 mr-1"/>End Game
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {questions.map((q,idx)=>{
              const done=answeredQuestions.has(q.id)
              const col=KAHOOT_COLORS[idx%4]
              return(
                <button key={q.id} disabled={done}
                  onClick={()=>{
                    if(!done){
                      audio.stop('selecting')
                      const rc = roomCodeRef.current
                      if(rc && !joinRoomCode) {
                        const startTime = Date.now()
                        fetch(`/api/gameshow/${shareCode}/session/${rc}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameState:{phase:'question',currentQuestionIndex:idx,questionStartTime:startTime,timerStarted:false,buzzState:null,disabledOptions:[],disabledPlayerIds:[]}})}).catch(()=>{})
                      }
                      beginQuestion(idx)
                    }
                  }}
                  className={`p-4 rounded-2xl border-4 flex flex-col items-center gap-1 transition-all ${done?'bg-gray-800 border-gray-700 opacity-40 cursor-not-allowed':`${col.bg} ${col.border} hover:scale-[1.03] cursor-pointer`}`}>
                  <span className="text-2xl">{done?'✓':col.icon}</span>
                  <span className={`font-bold text-sm ${done?'text-gray-500':col.text}`}>Q{idx+1}</span>
                </button>
              )
            })}
          </div>
          {allAnswered&&(
            <div className="mt-6 text-center">
              <Button onClick={()=>{audio.stopAll();setPhase('gameover')}}
                className="bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold px-8 py-4">
                <Trophy className="h-5 w-5 mr-2"/>See Final Results
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── QUESTION ────────────────────────────────────────────────────────────────
  if(phase==='question'&&currentQuestion){
    const options=parseOptions(currentQuestion)
    const maxTime=config?.timeLimitSeconds??30

    return(
      <div className="relative min-h-screen bg-[#1a1a2e] flex flex-col">
        <MusicBtn/>
        {showConfetti&&<Confetti/>}
        {/* Top bar */}
        <div className="bg-[#16213e] px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="text-sm text-indigo-300">
              {isFreeChoice?`${answeredQuestions.size+1}/${questions.length}`:`Q${currentIdx+1}/${questions.length}`}
              {config?.playMode==='LOCAL'&&<span className="ml-2 text-yellow-300">— {currentPlayer?.nickname}</span>}
            </div>
            {waitingForStart
              ?<span className="text-yellow-400 font-bold text-sm animate-pulse">⏸ Waiting…</span>
              :<TimerRing timeLeft={timeLeft} maxTime={maxTime}/>
            }
            {/* Score: hide for online admin (no meaningful personal score); show for players/local */}
            {(!roomCode || joinRoomCode) && (
              <div className="text-right">
                <div className="text-white font-bold">{joinRoomCode ? myTotalScore : (currentPlayer?.score ?? 0)}</div>
                <div className="text-xs text-indigo-400">pts</div>
              </div>
            )}
          </div>
        </div>

        {/* Question */}
        <div className="bg-[#16213e] px-4 pb-4">
          <div className="max-w-2xl mx-auto">
            {currentQuestion.imageUrl&&<img src={currentQuestion.imageUrl} alt="" className="max-h-40 mx-auto mb-3 rounded-xl mt-3"/>}
            <h2 className="text-white text-lg sm:text-xl font-bold text-center leading-snug py-3">{currentQuestion.stem}</h2>
            {isMultiple&&<p className="text-center text-indigo-400 text-xs">Select all correct answers</p>}
          </div>
        </div>

        {/* Bet stars (before Start button, for players who can answer) */}
        {waitingForStart && config?.betEnabled && betsRemaining > 0 && !(!!roomCode && !joinRoomCode) && (
          <div className="flex items-center justify-center gap-2 py-2 bg-[#1a1a2e]">
            <div className="flex gap-1">
              {Array.from({length: betsRemaining}).map((_,i) => (
                <button key={i} onClick={() => { if(i === 0) setIsBetting(v => !v) }}
                  className={`text-2xl transition-all ${isBetting && i === 0 ? 'scale-125' : 'opacity-50 hover:opacity-80'}`}
                  title={i === 0 ? (isBetting ? 'Cancel bet' : 'Bet on this question!') : 'Available for later'}>⭐</button>
              ))}
            </div>
            {isBetting && <span className="text-yellow-300 text-sm font-bold">×{config.betMultiple} if correct!</span>}
          </div>
        )}

        {/* Start button (clickStartToCount mode):
            - BUZZ mode: only admin (host) sees this
            - ONLINE mode: only host sees this — players wait
            - LOCAL/SINGLE: player sees this */}
        {waitingForStart&&!isBuzzerMode&&(
          config?.playMode==='BUZZ' ? !joinRoomCode&&!!roomCode
          : config?.playMode==='ONLINE' ? !joinRoomCode&&!!roomCode
          : !joinRoomCode&&!roomCode
        )&&(
          <div className="flex justify-center py-4 bg-[#1a1a2e]">
            <Button onClick={handleStartCount}
              className="bg-[#6366f1] hover:bg-[#4f46e5] text-white font-black text-lg px-10 py-5 rounded-2xl shadow-lg">
              ▶ Start Timer
            </Button>
          </div>
        )}

        {/* Buzz buttons (buzzerMode + Online) */}
        {showBuzz&&isBuzzerMode&&(
          <div className="bg-[#0f0f1e] p-4 border-t border-indigo-500/20">
            <p className="text-center text-indigo-300 text-sm font-bold mb-3">
              {buzzedPlayer===null?'🔔 BUZZ IN first to answer!':'⚡ '+players[buzzedPlayer]?.nickname+' buzzed in!'}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {players.map((p,idx)=>(
                <button key={p.id}
                  onClick={()=>handleBuzz(idx)}
                  disabled={!buzzerOpen||buzzedPlayer!==null}
                  className={`relative px-6 py-4 rounded-2xl border-4 font-black text-lg transition-all select-none
                    ${buzzedPlayer===idx?'bg-yellow-400 border-yellow-300 text-black scale-110 shadow-lg shadow-yellow-400/40'
                    :buzzedPlayer!==null?'bg-gray-800 border-gray-700 text-gray-500 opacity-40'
                    :buzzerOpen?'bg-red-500 border-red-700 text-white hover:bg-red-400 active:scale-95 cursor-pointer shadow-[0_6px_0_#991b1b] active:shadow-[0_2px_0_#991b1b] active:translate-y-1'
                    :'bg-gray-700 border-gray-600 text-gray-400 cursor-not-allowed'}`}
                >
                  <Zap className="h-5 w-5 inline mr-1"/>{p.nickname}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* BUZZ play mode: admin notification box — shows who buzzed/answered */}
        {config?.playMode === 'BUZZ' && !joinRoomCode && !!roomCode && (
          <div className="px-4 pb-4">
            <div className={`rounded-2xl p-4 border-2 ${buzzState?.answer != null ? 'bg-yellow-900/20 border-yellow-500/50' : 'bg-[#0f0f1e] border-indigo-500/20'}`}>
              {buzzState?.answer !== null && buzzState?.answer !== undefined ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-yellow-300 font-black text-lg flex items-center gap-2">
                      <Zap className="h-5 w-5"/>{buzzState.playerNickname}
                    </p>
                    <p className="text-white text-sm">answered: <span className="font-bold">{buzzState.answer}</span></p>
                  </div>
                  <Button onClick={() => {
                    setBuzzTimeRemaining(timeLeft)
                    clearInterval(timerRef.current!)
                    setTimerRunning(false)
                    if (buzzState?.isCorrect !== false) {
                      // Correct: broadcast reveal to all players then show reveal
                      const rc = roomCodeRef.current
                      if (rc) fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ gameState: { phase: 'reveal' } })
                      }).catch(() => {})
                      setPhase('reveal')
                    } else {
                      // Wrong: show pending overlay — host chooses Continue or Reveal Answer
                      setBuzzWrongPending(true)
                    }
                  }} className="bg-yellow-400 hover:bg-yellow-300 text-black font-black px-6 py-3 rounded-2xl">
                    Result
                  </Button>
                </div>
              ) : buzzState?.isBuzzing ? (
                <p className="text-yellow-300 font-bold text-center animate-pulse">
                  <Zap className="h-4 w-4 inline mr-1"/>{buzzState.playerNickname} buzzed in! Waiting for answer…
                </p>
              ) : (
                <p className="text-indigo-400 text-sm text-center">Waiting for a player to answer…</p>
              )}
            </div>
          </div>
        )}

        {/* BUZZ play mode: Buzz button for player (buzzButton setting) — only when timer is running */}
        {config?.playMode === 'BUZZ' && !!joinRoomCode && config?.buzzButton && timerRunning && !buzzState && !submitted && !disabledPlayerIds.includes(myPlayerId || '') && (
          <div className="flex justify-center py-4 bg-[#0f0f1e]">
            <button onClick={handleBuzzButton} disabled={hasBuzzed}
              className="px-10 py-5 rounded-2xl bg-red-500 hover:bg-red-400 active:scale-95 border-4 border-red-700 text-white font-black text-2xl shadow-[0_8px_0_#991b1b] active:shadow-[0_2px_0_#991b1b] active:translate-y-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              <Zap className="h-6 w-6 inline mr-2"/>BUZZ!
            </button>
          </div>
        )}

        {/* BUZZ play mode: player overlay — someone else answered (not shown to eliminated players) */}
        {config?.playMode === 'BUZZ' && !!joinRoomCode && buzzState && buzzState.playerId !== myPlayerId && !submitted && !disabledPlayerIds.includes(myPlayerId || '') && (
          <div className="fixed inset-0 bg-[#0f0f1e]/85 flex items-center justify-center z-40">
            <div className="text-center p-6 rounded-2xl bg-[#16213e] border-2 border-yellow-500/40 max-w-xs w-full mx-4">
              <Zap className="h-10 w-10 text-yellow-400 mx-auto mb-2 animate-pulse"/>
              <p className="text-yellow-300 font-black text-xl mb-1">{buzzState.playerNickname}</p>
              <p className="text-indigo-300 text-sm">answered first!</p>
              <p className="text-xs text-indigo-400 mt-3">Waiting for host to reveal result…</p>
            </div>
          </div>
        )}

        {/* BUZZ play mode: eliminated player overlay — answered wrong, others still playing */}
        {config?.playMode === 'BUZZ' && !!joinRoomCode && disabledPlayerIds.includes(myPlayerId || '') && (
          <div className="fixed inset-0 bg-[#0f0f1e]/85 flex items-center justify-center z-40">
            <div className="text-center p-6 rounded-2xl bg-[#16213e] border-2 border-red-500/40 max-w-xs w-full mx-4">
              <XCircle className="h-10 w-10 text-red-400 mx-auto mb-2"/>
              <p className="text-red-300 font-black text-xl mb-1">Wrong Answer!</p>
              <p className="text-indigo-300 text-sm">Others are still answering…</p>
              <p className="text-xs text-indigo-400 mt-3">Waiting for host to reveal…</p>
            </div>
          </div>
        )}

        {/* B2b — Local Multiplayer pass-on-incorrect picker */}
        {passShowPicker && config?.playMode === 'LOCAL' && !joinRoomCode && (
          <div className="fixed inset-0 bg-[#0f0f1e]/90 flex items-center justify-center z-50 p-4">
            <div className="bg-[#16213e] border-2 border-yellow-500/40 rounded-3xl p-6 max-w-md w-full">
              <p className="text-yellow-300 font-black text-xl mb-2 text-center">Wrong answer!</p>
              <p className="text-indigo-200 text-sm text-center mb-4">
                Pick a player to attempt this question, or Continue to skip.
              </p>
              <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                {players.map((p, idx) => {
                  const attempted = passAttemptedPlayerIds.has(p.id)
                  return (
                    <button
                      key={p.id}
                      disabled={attempted}
                      onClick={() => passToPlayer(idx)}
                      className={`w-full text-left p-3 rounded-xl border-2 flex items-center gap-3 transition-all ${
                        attempted
                          ? 'bg-gray-800/50 border-gray-700 opacity-50 cursor-not-allowed'
                          : 'bg-indigo-900/40 border-indigo-500/40 hover:border-yellow-400 hover:bg-indigo-900/60'
                      }`}
                    >
                      <span
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white"
                        style={{ backgroundColor: p.avatarColor }}
                      >
                        {p.nickname.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="font-bold text-white">{p.nickname}</span>
                      {attempted && <span className="ml-auto text-xs text-gray-400">already tried</span>}
                    </button>
                  )
                })}
              </div>
              <Button
                onClick={passContinue}
                className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black"
              >
                Continue (skip remaining)
              </Button>
            </div>
          </div>
        )}

        {/* Online player: submitted overlay — show result while waiting for host */}
        {submitted && !!joinRoomCode && (
          <div className="fixed inset-0 bg-[#0f0f1e]/90 flex items-center justify-center z-50">
            <div className={`text-center p-8 rounded-3xl border-2 max-w-xs w-full mx-4 shadow-2xl ${isCorrect ? 'bg-green-900/60 border-green-500' : 'bg-red-900/60 border-red-500'}`}>
              <div className="text-6xl mb-3">{isCorrect ? '✅' : '❌'}</div>
              <p className={`text-2xl font-black mb-2 ${isCorrect ? 'text-green-300' : 'text-red-300'}`}>
                {isCorrect ? 'Correct!' : 'Wrong!'}
              </p>
              {myLastPts > 0 && (
                <p className="text-yellow-300 font-bold text-lg mb-1">+{myLastPts} pts</p>
              )}
              {myStreak >= 2 && (
                <p className="text-orange-400 text-sm font-bold mb-1">🔥 {myStreak} streak!</p>
              )}
              <p className="text-white/70 text-sm mb-4">Total: <strong className="text-white">{myTotalScore}</strong> pts</p>
              <Loader2 className="h-4 w-4 animate-spin text-indigo-300 mx-auto mb-1"/>
              <p className="text-indigo-300 text-xs">Waiting for host to reveal…</p>
            </div>
          </div>
        )}

        {/* Online admin: Skip timer button */}
        {!joinRoomCode && !!roomCode && !submitted && phase === 'question' && (
          <div className="flex justify-center py-2">
            <button
              onClick={() => { clearInterval(timerRef.current!); setTimeLeft(0); handleTimeout() }}
              className="text-xs text-indigo-400 hover:text-indigo-200 border border-indigo-500/30 px-4 py-1.5 rounded-full transition-all hover:bg-indigo-900/40"
            >
              ⏭ Skip Time Count
            </button>
          </div>
        )}

        {/* Online admin: show question but disable answering */}
        {/* Answers */}
        <div className="flex-1 p-4">
          <div className="max-w-2xl mx-auto h-full flex flex-col justify-center">
            <div className={(waitingForStart||showBuzz&&buzzedPlayer===null||(!joinRoomCode&&!!roomCodeRef.current)||(config?.playMode==='BUZZ'&&!!joinRoomCode&&disabledPlayerIds.includes(myPlayerId||''))||(config?.playMode==='BUZZ'&&!!joinRoomCode&&config?.buzzButton&&!hasBuzzed&&!buzzState&&!disabledPlayerIds.includes(myPlayerId||''))||(config?.playMode==='BUZZ'&&!!joinRoomCode&&!!buzzState&&buzzState.playerId!==myPlayerId&&!disabledPlayerIds.includes(myPlayerId||'')))?'opacity-60 pointer-events-none':''}>
              {isFillBlank?(
                <div className="space-y-4">
                  <Input value={fillAnswer} onChange={e=>setFillAnswer(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&handleFillSubmit()} placeholder="Type your answer..."
                    disabled={submitted}
                    className="text-center text-lg py-6 rounded-2xl bg-white text-gray-800 font-bold border-4 border-indigo-400"/>
                  <Button onClick={handleFillSubmit} disabled={submitted||!fillAnswer.trim()}
                    className="w-full bg-[#6366f1] text-white font-black text-lg py-6 rounded-2xl">Submit Answer</Button>
                </div>
              ):isMultiple?(
                <div className="space-y-3">
                  {options.map((opt,i)=>{
                    const col=KAHOOT_COLORS[i%4];const checked=selectedMultiple.includes(opt)
                    return(
                      <button key={opt} disabled={submitted}
                        onClick={()=>{if(!submitted)setSelectedMultiple(prev=>checked?prev.filter(x=>x!==opt):[...prev,opt])}}
                        className={`w-full flex items-center gap-3 p-4 rounded-2xl border-4 text-left transition-all ${col.bg} ${col.border} ${checked?'scale-[0.98] opacity-90':'hover:scale-[1.01]'}`}>
                        <span className="text-xl">{col.icon}</span>
                        <span className={`font-bold ${col.text}`}>{opt}</span>
                        {checked&&<CheckCircle2 className={`ml-auto h-5 w-5 ${col.text}`}/>}
                      </button>
                    )
                  })}
                  <Button onClick={handleMultipleSubmit} disabled={submitted||selectedMultiple.length===0}
                    className="w-full bg-white text-[#6366f1] font-black text-lg py-4 rounded-2xl mt-2">
                    Submit ({selectedMultiple.length} selected)
                  </Button>
                </div>
              ):(
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {options.map((opt,i)=>{
                    const col=KAHOOT_COLORS[i%4];const isSel=selectedAnswer===opt
                    const isDisabledOpt = disabledOptions.includes(opt) || passWrongOptions.includes(opt)
                    return(
                      <button key={opt} disabled={submitted||isDisabledOpt||disabledPlayerIds.includes(myPlayerId||'')} onClick={()=>handleAnswer(opt)}
                        className={`flex items-center gap-3 p-4 sm:p-5 rounded-2xl border-4 text-left font-bold transition-all active:scale-95
                          ${submitted&&isSel?'opacity-90 scale-[0.97]':''}
                          ${submitted&&!isSel?'opacity-50':''}
                          ${isDisabledOpt?'opacity-30 cursor-not-allowed line-through':''}
                          ${!submitted&&!isDisabledOpt?'hover:scale-[1.02] cursor-pointer':'cursor-not-allowed'}
                          ${col.bg} ${col.border}`}>
                        <span className="text-2xl flex-shrink-0">{isDisabledOpt?'❌':col.icon}</span>
                        <span className={`text-sm sm:text-base ${col.text}`}>{opt}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            {config?.enableStreak&&(currentPlayer?.streak??0)>=2&&(
              <div className="mt-4 text-center">
                <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  🔥 {currentPlayer?.streak} streak! +{(currentPlayer?.streak??0)*(config?.streakBonus??50)} bonus
                </span>
              </div>
            )}
          </div>
        </div>

        {/* BUZZ mode: wrong answer pending — host picks Continue or Reveal Answer */}
        {config?.playMode === 'BUZZ' && !joinRoomCode && !!roomCode && buzzWrongPending && buzzState && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-[#1a1a2e] border-2 border-red-500/60 rounded-3xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
              <XCircle className="h-14 w-14 text-red-400 mx-auto mb-3"/>
              <h2 className="text-2xl font-black text-red-300 mb-1">Wrong Answer!</h2>
              <p className="text-white font-bold mb-1">{buzzState.playerNickname}</p>
              <p className="text-gray-300 text-sm mb-6">answered: <span className="font-bold text-white">"{buzzState.answer}"</span></p>
              <div className="flex flex-col gap-3">
                {options.filter(opt => ![...disabledOptions, buzzState.answer].filter(Boolean).includes(opt)).length > 1 && (
                  <Button onClick={() => handleBuzzContinue()}
                    className="bg-orange-500 hover:bg-orange-400 text-white font-bold py-4 rounded-2xl text-lg">
                    Continue (Resume Timer)
                  </Button>
                )}
                <Button onClick={() => {
                  setBuzzWrongPending(false)
                  const rc = roomCodeRef.current
                  if (rc) fetch(`/api/gameshow/${shareCode}/session/${rc}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gameState: { phase: 'reveal' } })
                  }).catch(() => {})
                  setPhase('reveal')
                }} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl text-lg">
                  Reveal Answer
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── REVEAL ──────────────────────────────────────────────────────────────────
  if(phase==='reveal'&&currentQuestion){
    const options=parseOptions(currentQuestion)
    const corrects=getCorrectAnswers(currentQuestion)
    const maxDist=Math.max(...Object.values(distribution),1)

    return(
      <div className="relative min-h-screen bg-[#1a1a2e] text-white flex flex-col p-4">
        <MusicBtn/>
        <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col">

          {/* Admin: neutral "Correct Answer" banner (no "Wrong" text) */}
          {/* Player: show their result */}
          {joinRoomCode ? (
            // Online player reveal: show their answer + correct answer + explanation
            <div className={`p-5 rounded-2xl mb-4 border-2 mt-4 ${isCorrect===true?'bg-green-900/40 border-green-500':isCorrect===false?'bg-red-900/40 border-red-500':'bg-[#16213e] border-gray-700'}`}>
              <div className="text-center mb-3">
                {isCorrect===null
                  ?<p className="text-xl font-black text-gray-300">Time's Up!</p>
                  :isCorrect
                  ?<><CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-1"/><p className="text-xl font-black text-green-300">Correct!</p></>
                  :<><XCircle className="h-10 w-10 text-red-400 mx-auto mb-1"/><p className="text-xl font-black text-red-300">Wrong!</p></>
                }
                {myLastPts > 0 && <p className="text-yellow-300 font-bold">+{myLastPts} pts</p>}
                {myStreak >= 2 && <p className="text-orange-400 text-sm">🔥 {myStreak} streak!</p>}
                <p className="text-white/60 text-xs mt-1">Total: {myTotalScore} pts</p>
              </div>
              <div className="bg-black/30 rounded-xl p-3 text-sm">
                <p className="text-gray-400 text-xs mb-1">Correct answer:</p>
                <p className="text-green-300 font-bold">{corrects.join(', ')}</p>
                {currentQuestion.explanation && (
                  <p className="text-indigo-200 text-xs mt-2">💡 {currentQuestion.explanation}</p>
                )}
              </div>
              <div className="flex items-center justify-center gap-2 text-indigo-300 mt-3">
                <Loader2 className="h-3 w-3 animate-spin"/>
                <span className="text-xs">Waiting for host to advance…</span>
              </div>
            </div>
          ) : (
            // Admin / local: neutral "time's up" banner with correct answer
            <div className="bg-[#16213e] border border-indigo-500/30 rounded-2xl p-5 mb-4 mt-4">
              <div className="text-center mb-2">
                {isCorrect
                  ?<><CheckCircle2 className="h-8 w-8 text-green-400 mx-auto mb-1"/><p className="text-lg font-black text-green-300">Correct!</p></>
                  :<p className="text-lg font-black text-indigo-300">Time's Up</p>
                }
              </div>
              <p className="text-center text-sm text-gray-300">Correct answer: <span className="text-green-300 font-bold">{corrects.join(', ')}</span></p>
            </div>
          )}

          {!joinRoomCode && Object.keys(distribution).length>0&&(
            <div className="space-y-2 mb-4">
              {options.map((opt,i)=>{
                const col=KAHOOT_COLORS[i%4]
                const isC=corrects.some(c=>c.toLowerCase()===opt.toLowerCase())
                const pct=distribution[opt]??0
                return(
                  <div key={opt} className="flex items-center gap-2">
                    <span className="text-lg flex-shrink-0">{col.icon}</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-7 overflow-hidden relative">
                      <div className={`h-full rounded-full ${isC?'bg-green-500':col.label}`} style={{width:`${(pct/maxDist)*100}%`,minWidth:pct>0?'2rem':'0'}}/>
                      <span className="absolute inset-0 flex items-center px-2 text-xs font-bold text-white">{opt.slice(0,20)}{opt.length>20?'…':''}</span>
                    </div>
                    <span className="text-xs text-gray-400 w-8">{pct}%</span>
                    {isC&&<CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0"/>}
                  </div>
                )
              })}
            </div>
          )}

          {!joinRoomCode && currentQuestion.explanation&&(
            <div className="bg-indigo-900/40 border border-indigo-500/30 rounded-xl p-3 mb-3 text-xs text-indigo-200">
              💡 {currentQuestion.explanation}
            </div>
          )}

          {/* Top 10 leaderboard (admin only) */}
          {!joinRoomCode && (
          <div className="bg-[#16213e] rounded-2xl p-4 mb-4">
            <p className="text-xs text-indigo-400 font-semibold mb-2 uppercase tracking-wide">Top {Math.min(players.length, 10)}</p>
            {[...players].sort((a,b)=>b.score-a.score).slice(0,10).map((p,rank)=>(
              <div key={p.id} className={`flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0`}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{['🥇','🥈','🥉'][rank]||`${rank+1}.`}</span>
                  <span className="text-sm font-medium">{p.nickname}</span>
                  {p.streak>=2&&<span className="text-xs text-orange-400">🔥{p.streak}</span>}
                </div>
                <div className="text-right">
                  <span className="text-yellow-300 font-bold">{p.score}</span>
                  {p.lastPointsEarned>0&&<span className="text-green-400 text-xs ml-1">(+{p.lastPointsEarned})</span>}
                </div>
              </div>
            ))}
          </div>
          )}

          {/* BUZZ mode reveal: show who answered and their result */}
          {config?.playMode === 'BUZZ' && !joinRoomCode && buzzState && (
            <div className={`rounded-2xl p-4 mb-3 border-2 ${buzzState.isCorrect ? 'bg-green-900/30 border-green-500/50' : 'bg-red-900/30 border-red-500/50'}`}>
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

          {joinRoomCode ? (
            // Player: no next button, just waiting
            null
          ) : (
            <>
              {exitConfirm && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                  <div className="bg-[#16213e] rounded-2xl p-6 max-w-sm w-full mx-4 border border-red-500/40">
                    <p className="text-white font-bold text-center mb-2">Exit Game?</p>
                    <p className="text-indigo-300 text-sm text-center mb-4">This will end the game for all players.</p>
                    <div className="flex gap-3">
                      <Button variant="outline" className="flex-1 border-indigo-500/30 text-indigo-300" onClick={() => setExitConfirm(false)}>Cancel</Button>
                      <Button className="flex-1 bg-red-600 hover:bg-red-500 text-white" onClick={() => {
                        setExitConfirm(false)
                        const rc = roomCodeRef.current
                        if (rc) fetch(`/api/gameshow/${shareCode}/session/${rc}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameState:{phase:'gameover'},status:'FINISHED'})}).catch(()=>{})
                        audio.stopAll(); setPhase('gameover')
                      }}>Exit Game</Button>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                {isFreeChoice&&(
                  <Button onClick={()=>{
                    clearTimeout(leaderboardTimeoutRef.current!);audio.stopAll()
                    const rc=roomCodeRef.current
                    // Mark current question answered (admin can't answer, so we track here)
                    const na=currentQuestion?new Set(Array.from(answeredQuestions).concat(currentQuestion.id)):answeredQuestions
                    if(currentQuestion)setAnsweredQuestions(na)
                    if(rc)fetch(`/api/gameshow/${shareCode}/session/${rc}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameState:{phase:'select',answeredQuestionIds:Array.from(na)}})}).catch(()=>{})
                    audio.playBg('selecting',0.5);setPhase('select')
                  }}
                    variant="outline" className="border-indigo-500/30 text-indigo-300 hover:bg-indigo-900/20">
                    Board
                  </Button>
                )}
                {/* BUZZ mode: Continue — only when more than 1 option hasn't been tried yet */}
                {config?.playMode === 'BUZZ' && buzzState?.isCorrect === false &&
                  options.filter(opt => ![...disabledOptions, buzzState.answer].filter(Boolean).includes(opt)).length > 1 && (
                  <Button onClick={handleBuzzContinue}
                    className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-4 rounded-2xl">
                    Continue
                  </Button>
                )}
                <Button onClick={() => setExitConfirm(true)}
                  variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-900/20">
                  <LogOut className="h-4 w-4 mr-1"/>Exit
                </Button>
                <Button onClick={handleNext}
                  className={`flex-1 bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold py-5 rounded-2xl text-lg`}>
                  {currentIdx>=questions.length-1?'Final Results':'Next Question'} <ChevronRight className="h-5 w-5 ml-1"/>
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ─── LEADERBOARD ─────────────────────────────────────────────────────────────
  // ─── SCORING (Local Multiplayer manual score adjustment) ───────────────────────
  if(phase==='scoring'){
    const allAnswered=answeredQuestions.size>=questions.length
    const isLast=isFreeChoice?allAnswered:currentIdx>=questions.length-1
    return(
      <div className="min-h-screen bg-[#1a1a2e] text-white flex flex-col items-center justify-center p-4">
        <MusicBtn/>
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">📊</div>
            <h2 className="text-2xl font-black text-white">Score Adjustment</h2>
            <p className="text-indigo-300 text-sm mt-1">
              Manually adjust scores for Q{currentIdx+1}. Base scores already applied.
            </p>
          </div>
          <div className="bg-[#16213e] rounded-2xl p-4 space-y-3 mb-4">
            {players.map(p=>{
              const adj=scoringAdjustments[p.id]??0
              return(
                <div key={p.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-700/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{p.nickname}</p>
                    <p className="text-xs text-gray-400">Base: {p.score} pts{adj!==0?` · Adj: ${adj>0?'+':''}${adj}`:''}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={()=>setScoringAdjustments(prev=>({...prev,[p.id]:(prev[p.id]??0)-50}))}
                      className="w-9 h-9 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-300 font-black text-lg flex items-center justify-center transition-all">−</button>
                    <span className={`w-14 text-center font-black text-lg ${adj>0?'text-green-400':adj<0?'text-red-400':'text-gray-400'}`}>
                      {adj>0?`+${adj}`:adj===0?'0':adj}
                    </span>
                    <button onClick={()=>setScoringAdjustments(prev=>({...prev,[p.id]:(prev[p.id]??0)+50}))}
                      className="w-9 h-9 rounded-full bg-green-500/20 hover:bg-green-500/40 text-green-300 font-black text-lg flex items-center justify-center transition-all">+</button>
                  </div>
                  <div className="w-16 text-right">
                    <span className="font-black text-yellow-300">{p.score+(scoringAdjustments[p.id]??0)}</span>
                    <span className="text-xs text-gray-400 block">total</span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-2 mb-3">
            {[-200,-100,-50,50,100,200].map(v=>(
              <button key={v} onClick={()=>{
                if(players[currentPlayerIdx])
                  setScoringAdjustments(prev=>({...prev,[players[currentPlayerIdx].id]:(prev[players[currentPlayerIdx].id]??0)+v}))
              }} className={`flex-1 py-2 rounded-xl text-xs font-bold ${v>0?'bg-green-600/30 hover:bg-green-600/50 text-green-300':'bg-red-600/30 hover:bg-red-600/50 text-red-300'} transition-all`}>
                {v>0?`+${v}`:v}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 text-center mb-4">Quick buttons apply to current player: <span className="text-yellow-300">{players[currentPlayerIdx]?.nickname}</span></p>
          <Button onClick={confirmScoring}
            className="w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold text-lg py-5 rounded-2xl">
            {isLast?'Final Results ✓':'Confirm & Continue'} <ChevronRight className="h-5 w-5 ml-1"/>
          </Button>
        </div>
      </div>
    )
  }

  if(phase==='leaderboard'){
    const allAnswered=answeredQuestions.size>=questions.length
    const isLast=isFreeChoice?allAnswered:currentIdx>=questions.length-1
    const sorted=[...players].sort((a,b)=>b.score-a.score).slice(0,10)
    return(
      <div className="relative min-h-screen bg-[#1a1a2e] text-white flex flex-col items-center justify-center p-4">
        <MusicBtn/>
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">🏆</div>
            <h2 className="text-3xl font-black text-yellow-300">Leaderboard</h2>
            <p className="text-indigo-300 text-sm mt-1">
              {isFreeChoice?`${answeredQuestions.size}/${questions.length} done`:`After Q${currentIdx+1} of ${questions.length}`}
            </p>
          </div>
          <div className="bg-[#16213e] rounded-2xl p-4 space-y-2 mb-6">
            {sorted.map((p,rank)=>(
              <div key={p.id} className={`flex items-center justify-between py-2.5 px-3 rounded-xl ${rank===0?'bg-yellow-500/20 border border-yellow-500/40':rank===1?'bg-gray-400/10 border border-gray-600/30':rank===2?'bg-orange-500/10 border border-orange-600/30':'bg-gray-800/40'} ${p.id===players[currentPlayerIdx]?.id?'ring-2 ring-[#6366f1]':''}`}>
                <div className="flex items-center gap-3">
                  <span className="text-xl w-8 text-center">{rank===0?'🥇':rank===1?'🥈':rank===2?'🥉':`${rank+1}`}</span>
                  <div><span className="font-bold text-sm">{p.nickname}</span>{p.streak>=2&&<span className="text-xs text-orange-400 ml-1">🔥{p.streak}</span>}</div>
                </div>
                <span className="text-yellow-300 font-black text-lg">{p.score.toLocaleString()}</span>
              </div>
            ))}
          </div>
          {joinRoomCode ? (
            // Online player: wait for host to advance
            <div className="flex items-center justify-center gap-2 text-indigo-300 py-4">
              <Loader2 className="h-4 w-4 animate-spin"/>
              <span className="text-sm">Waiting for host…</span>
            </div>
          ) : (
            <div className="text-center space-y-3">
              {!roomCodeRef.current && <p className="text-indigo-300 text-sm">Auto-continuing in 5 seconds…</p>}
              <div className="flex gap-3">
                <Button onClick={()=>advanceFromLeaderboard(isLast)}
                  className="flex-1 bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold py-4 rounded-2xl">
                  {isLast?'Final Results':isFreeChoice?'Continue':'Next Q'} <ChevronRight className="h-5 w-5 ml-1"/>
                </Button>
                {isFreeChoice&&!isLast&&(
                  <Button onClick={()=>{audio.stop('leaderboard');setPhase('gameover')}}
                    variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-900/20 rounded-2xl">
                    <LogOut className="h-4 w-4 mr-1"/>Exit
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── GAME OVER ────────────────────────────────────────────────────────────────
  if(phase==='gameover'){
    const sorted=[...players].sort((a,b)=>b.score-a.score).slice(0,10)
    return(
      <div className="relative min-h-screen bg-gradient-to-b from-[#6366f1] to-[#4f46e5] flex items-center justify-center p-4 overflow-hidden">
        <Confetti/>
        <MusicBtn/>
        <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}@keyframes popIn{0%{transform:scale(0.5);opacity:0}70%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}`}</style>
        <div className="w-full max-w-lg text-white relative z-10">
          <div className="text-center mb-6">
            <Trophy className="h-20 w-20 text-yellow-300 mx-auto mb-3" style={{animation:'popIn 0.6s ease forwards'}}/>
            <h1 className="text-4xl font-black" style={{animation:'popIn 0.6s ease 0.1s both'}}>Final Results!</h1>
            <p className="text-indigo-200 mt-1">{config?.name}</p>
          </div>
          <div className="space-y-3 mb-6">
            {sorted.map((p,rank)=>(
              <div key={p.id}
                style={{animation:`slideUp 0.4s ease ${0.15+rank*0.07}s both`}}
                className={`rounded-2xl p-4 border-2 ${rank===0?'bg-yellow-400/30 border-yellow-400 shadow-lg shadow-yellow-400/20':rank===1?'bg-white/15 border-white/30':rank===2?'bg-orange-500/20 border-orange-400/50':'bg-white/5 border-white/10'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{['🥇','🥈','🥉'][rank]||`${rank+1}.`}</span>
                    <div>
                      <div className="font-bold text-lg">{p.nickname}</div>
                      <div className="text-xs opacity-70">{p.correctCount}/{questions.length} correct · best streak {p.bestStreak}🔥</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-black ${rank===0?'text-3xl text-yellow-300':rank===1?'text-2xl text-gray-200':'text-xl text-white'}`}>{p.score}</div>
                    <div className="text-xs opacity-60">pts</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            {!joinRoomCode && (
              <Button onClick={()=>{audio.stop('podium');setPhase('setup');setSetupNames([setupNames[0]||''])}}
                variant="outline" className="flex-1 border-white/30 text-white hover:bg-white/10 rounded-2xl">
                <RotateCcw className="h-4 w-4 mr-2"/>Play Again
              </Button>
            )}
            <Button onClick={()=>window.close()} variant="outline"
              className="flex-1 border-white/30 text-white hover:bg-white/10 rounded-2xl">
              <Home className="h-4 w-4 mr-2"/>Exit
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
