'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Trophy, Phone, Users, CheckCircle2, XCircle, ChevronRight, RotateCcw, Home, Volume2, VolumeX, QrCode, LogOut } from 'lucide-react'
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
  playMode: 'SINGLE' | 'LOCAL' | 'ONLINE'; selectionMode: 'LINEAR' | 'FREE_CHOICE'
  scoringMode: 'SPEED_ACCURACY' | 'ACCURACY_ONLY'; questionsCount: number | null
  timeLimitSeconds: number; enableLifelines: boolean; lifelines: string | null
  shuffleQuestions: boolean; showLeaderboard: boolean; clickStartToCount: boolean
  maxPlayers: number; shortLink: string | null; quizSetTitle: string; questions: Question[]
}
type Player = {
  id: string; nickname: string; avatarColor: string
  score: number; correctCount: number; wrongCount: number; streak: number
  usedLifelines: string[]
}
type LifelineType = '5050' | 'phone' | 'audience'
type Phase = 'setup' | 'intro' | 'select' | 'question' | 'reveal' | 'leaderboard' | 'gameover'

// ─── Tone SFX (for non-music sounds only) ───────────────────────────────────
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

// ─── Main Component ──────────────────────────────────────────────────────────
export default function WwtbamPage() {
  const params = useParams()
  const shareCode = params.shareCode as string

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

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const timeCountPlayedRef = useRef(false)
  const currentQuestion = questions[currentIdx]
  const currentPlayer = players[currentPlayerIdx]

  // Fetch config
  useEffect(() => {
    fetch(`/api/gameshow/${shareCode}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        if (data.type !== 'WWTBAM') { setError('This gameshow is not a WWTBAM game'); return }
        setConfig(data)
        setLoading(false)
      })
      .catch(() => setError('Failed to load gameshow'))
  }, [shareCode])

  // Play opening music on setup screen
  useEffect(() => {
    if (phase === 'setup' && !loading) audio.playBg('opening', 0.5)
  }, [phase, loading])

  // Timer effect
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

  const handleTimeout = () => {
    setIsCorrect(false)
    setPhase('reveal')
    audio.stopAll()
    audio.playOnce('lost', 0.9)
  }

  const startGame = () => {
    if (!config) return
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
    setPhase('intro')
    setTimeout(() => beginQuestion(0), 1800)
  }

  const beginQuestion = (idx: number, qs?: Question[]) => {
    const qList = qs || questions
    setCurrentIdx(idx)
    setSelectedAnswer(null); setIsCorrect(null)
    setEliminatedOptions([]); setPhoneAnswer(null)
    setAudienceData(null); setShowLifelineResult(false)
    setTimeLeft(config?.timeLimitSeconds ?? 30)
    setQuestionStartTime(Date.now())
    timeCountPlayedRef.current = false
    setPhase('question')

    // Audio: if clickStartToCount, play wait music; else play game music
    if (config?.clickStartToCount) {
      audio.playBg('wait', 0.5)
      setTimerRunning(false)
    } else {
      audio.playBg('game-play', 0.55)
      setTimerRunning(true)
    }
  }

  const handleStartCount = () => {
    // User clicks Start — stop wait music, start game music + timer
    audio.stop('wait')
    audio.playBg('game-play', 0.55)
    setQuestionStartTime(Date.now())
    setTimerRunning(true)
  }

  const handleAnswer = (answer: string) => {
    if (selectedAnswer || phase !== 'question') return
    if (config?.clickStartToCount && !timerRunning) return // must click Start first
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
    const pts = config?.scoringMode === 'ACCURACY_ONLY'
      ? (correct ? base : 0)
      : (correct ? Math.round(base * (0.3 + 0.7 * timePct)) : 0)

    setSelectedAnswer(answer); setIsCorrect(correct)
    setPlayers(prev => prev.map((p, i) => i !== currentPlayerIdx ? p : {
      ...p, score: p.score + pts,
      correctCount: correct ? p.correctCount + 1 : p.correctCount,
      wrongCount: !correct ? p.wrongCount + 1 : p.wrongCount,
      streak: correct ? p.streak + 1 : 0,
    }))

    if (correct) audio.playOnce('win', 0.9)
    else audio.playOnce('lost', 0.9)
    setTimeout(() => setPhase('reveal'), 1500)
  }

  const advanceFromLeaderboard = (isLastQ: boolean) => {
    audio.stop('leaderboard')
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
    if (config?.showLeaderboard && players.length > 0) {
      audio.playBg('leaderboard', 0.6)
      setPhase('leaderboard')
      setTimeout(() => advanceFromLeaderboard(isLastQ), 5000)
    } else {
      advanceFromLeaderboard(isLastQ)
    }
  }

  // Free Choice: navigate to select phase
  const goToSelect = () => {
    setTimerRunning(false)
    audio.stopAll()
    audio.playBg('selecting', 0.5)
    setPhase('select')
  }

  // Lifelines
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

  // QR code generation
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

  // ─── Music toggle button ────────────────────────────────────────────────────
  const MusicBtn = () => (
    <button onClick={() => setMusicEnabled(v => !v)}
      className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition-all"
      title={musicEnabled ? 'Mute music' : 'Enable music'}>
      {musicEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </button>
  )

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
            {/* QR + join link */}
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
    return (
      <div className="relative min-h-screen bg-[#0a0a2e] text-white p-4">
        <MusicBtn />
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-yellow-300">
                {config?.playMode === 'LOCAL' ? `${currentPlayer?.nickname}'s Turn` : 'Choose Your Question'}
              </h2>
              <p className="text-blue-300 text-sm">Score: {currentPlayer?.score ?? 0} pts</p>
            </div>
            {/* Exit to leaderboard */}
            <Button size="sm" variant="outline"
              onClick={() => { audio.stopAll(); audio.playBg('leaderboard', 0.6); setPhase('leaderboard'); setTimeout(() => setPhase('gameover'), 5000) }}
              className="border-red-500/50 text-red-400 hover:bg-red-900/20">
              <LogOut className="h-4 w-4 mr-1" /> Exit
            </Button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {questions.map((q, idx) => {
              const done = answeredQuestions.has(q.id)
              return (
                <button key={q.id} disabled={done}
                  onClick={() => {
                    if (!done) {
                      setAnsweredQuestions(prev => new Set(Array.from(prev).concat(q.id)))
                      audio.stop('selecting')
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
              <Button onClick={() => { audio.stopAll(); setPhase('gameover') }}
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
            <div className="text-sm text-blue-300">{currentPlayer?.score ?? 0} pts</div>
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

            {/* Start button overlay */}
            {waitingForStart && (
              <div className="flex justify-center mb-6">
                <Button onClick={handleStartCount}
                  className="bg-yellow-400 hover:bg-yellow-300 text-black font-black text-lg px-10 py-5 rounded-2xl shadow-lg">
                  ▶ Start Timer
                </Button>
              </div>
            )}

            {/* Options */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${waitingForStart ? 'opacity-60 pointer-events-none' : ''}`}>
              {options.map((option, i) => {
                const letter = ['A', 'B', 'C', 'D'][i]
                const isElim = eliminatedOptions.includes(option)
                return (
                  <button key={option} disabled={isElim || !!selectedAnswer || waitingForStart}
                    onClick={() => !isElim && handleAnswer(option)}
                    className={`flex items-center gap-3 p-3 sm:p-4 rounded-xl border-2 text-left font-medium transition-all duration-200
                      ${isElim ? 'opacity-20 cursor-not-allowed bg-gray-800 border-gray-700'
                               : 'bg-[#0d1b5e] border-blue-500/50 hover:bg-[#1a2f7e] hover:border-yellow-400 hover:scale-[1.02] cursor-pointer active:scale-[0.98]'}`}>
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-400 text-black font-black text-sm flex items-center justify-center">{letter}</span>
                    <span className="text-sm sm:text-base">{option}</span>
                  </button>
                )
              })}
            </div>

            {/* Lifelines */}
            {config?.enableLifelines && (
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

    return (
      <div className="relative min-h-screen bg-[#0a0a2e] text-white flex flex-col items-center justify-center p-4">
        <MusicBtn />
        <div className="w-full max-w-2xl">
          <div className={`text-center p-6 rounded-2xl mb-6 border-2 ${isCorrect ? 'bg-green-900/40 border-green-500' : 'bg-red-900/40 border-red-500'}`}>
            {isCorrect
              ? <><CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-2" /><p className="text-2xl font-black text-green-300">CORRECT!</p></>
              : <><XCircle className="h-12 w-12 text-red-400 mx-auto mb-2" /><p className="text-2xl font-black text-red-300">WRONG!</p></>
            }
            <p className="text-yellow-300 font-bold mt-2">{currentPlayer?.score ?? 0} pts total</p>
          </div>

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

          {config?.playMode === 'LOCAL' && players.length > 1 && (
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
            {isFreeChoice && (
              <Button onClick={goToSelect} variant="outline"
                className="flex-1 border-blue-500/30 text-blue-300 hover:bg-blue-900/20">
                Back to Board
              </Button>
            )}
            <Button onClick={handleNext}
              className={`${isFreeChoice ? 'flex-1' : 'w-full'} bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-lg py-6`}>
              {isFreeChoice ? 'Next' : (currentIdx >= questions.length - 1 ? 'See Final Results' : 'Next Question')}
              <ChevronRight className="h-5 w-5 ml-1" />
            </Button>
          </div>
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
          <div className="text-center space-y-3">
            <p className="text-blue-300 text-sm">Auto-continuing in 5 seconds…</p>
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
        </div>
      </div>
    )
  }

  // ─── GAME OVER ────────────────────────────────────────────────────────────
  if (phase === 'gameover') {
    // Play final music when reaching gameover
    useEffect(() => { audio.stopAll() }, [])
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
            <Button onClick={() => { setPhase('setup'); setSetupNames([setupNames[0] || '']) }}
              variant="outline" className="flex-1 border-blue-500/30 text-blue-300 hover:bg-blue-900/30">
              <RotateCcw className="h-4 w-4 mr-2" /> Play Again
            </Button>
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
