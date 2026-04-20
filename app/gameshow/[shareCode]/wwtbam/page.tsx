'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Loader2, Trophy, Phone, Users, Minus, CheckCircle2, XCircle, ChevronRight, RotateCcw, Home } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────
type Question = {
  id: string
  stem: string
  questionType: string
  options: string | null
  correctAnswer: string
  explanation: string | null
  difficulty: string
  points: number
  topic: string | null
  tags: string | null
  sortOrder: number
  imageUrl?: string | null
}

type GameshowConfig = {
  id: string
  shareCode: string
  name: string
  type: string
  playMode: 'SINGLE' | 'LOCAL' | 'ONLINE'
  selectionMode: 'LINEAR' | 'FREE_CHOICE'
  scoringMode: 'SPEED_ACCURACY' | 'ACCURACY_ONLY'
  questionsCount: number | null
  timeLimitSeconds: number
  enableLifelines: boolean
  lifelines: string | null
  shuffleQuestions: boolean
  maxPlayers: number
  quizSetTitle: string
  questions: Question[]
}

type Player = {
  id: string
  nickname: string
  avatarColor: string
  score: number
  correctCount: number
  wrongCount: number
  streak: number
  usedLifelines?: string[]
}

type LifelineType = '5050' | 'phone' | 'audience'

// ─── Sound Effects (Web Audio API) ─────────────────────────────────────────
function playTone(freq: number, duration: number, type: OscillatorType = 'sine', vol = 0.3) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    gain.gain.setValueAtTime(vol, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
  } catch {}
}
const SFX = {
  correct: () => { playTone(523, 0.15); setTimeout(() => playTone(659, 0.15), 150); setTimeout(() => playTone(784, 0.3), 300) },
  wrong: () => { playTone(220, 0.4, 'sawtooth', 0.2) },
  tick: () => playTone(800, 0.05, 'square', 0.1),
  lifeline: () => { playTone(440, 0.1); setTimeout(() => playTone(550, 0.2), 100) },
  final: () => { [523,659,784,1047].forEach((f,i) => setTimeout(() => playTone(f, 0.3), i*200)) },
}

// ─── Utility ────────────────────────────────────────────────────────────────
function getPoints(difficulty: string) {
  if (difficulty === 'HARD') return 50
  if (difficulty === 'MEDIUM') return 25
  return 10
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function parseOptions(q: Question): string[] {
  if (!q.options) return []
  try { return JSON.parse(q.options) } catch { return q.options.split('|') }
}

function getCorrectAnswers(q: Question): string[] {
  return q.correctAnswer.split('||').map(s => s.trim()).filter(Boolean)
}

// ─── Phase types ─────────────────────────────────────────────────────────────
type Phase =
  | 'setup'        // Player setup screen
  | 'intro'        // Game intro animation
  | 'select'       // FREE_CHOICE: show question grid
  | 'question'     // Show question + options + timer
  | 'reveal'       // Show answer result
  | 'gameover'     // Final results

// ─── Main Component ──────────────────────────────────────────────────────────
export default function WwtbamPage() {
  const params = useParams()
  const shareCode = params.shareCode as string

  const [config, setConfig] = useState<GameshowConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Game state
  const [phase, setPhase] = useState<Phase>('setup')
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [timeLeft, setTimeLeft] = useState(30)
  const [questionStartTime, setQuestionStartTime] = useState(0)
  const [eliminatedOptions, setEliminatedOptions] = useState<string[]>([])
  const [phoneAnswer, setPhoneAnswer] = useState<string | null>(null)
  const [audienceData, setAudienceData] = useState<Record<string, number> | null>(null)
  const [showLifelineResult, setShowLifelineResult] = useState(false)

  // Players
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0)
  const [setupNames, setSetupNames] = useState([''])
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set())

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const currentQuestion = questions[currentIdx]
  const currentPlayer = players[currentPlayerIdx]

  // Fetch config
  useEffect(() => {
    fetch(`/api/gameshow/${shareCode}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        if (data.type !== 'WWTBAM') {
          setError('This gameshow is not a WWTBAM game')
          return
        }
        setConfig(data)
        setLoading(false)
      })
      .catch(() => setError('Failed to load gameshow'))
  }, [shareCode])

  // Timer
  useEffect(() => {
    if (phase !== 'question' || !config) return
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          handleTimeout()
          return 0
        }
        if (prev <= 5) SFX.tick()
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current!)
  }, [phase, currentIdx, config])

  const handleTimeout = () => {
    setIsCorrect(false)
    setPhase('reveal')
    SFX.wrong()
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
      id: `p${i}`,
      nickname: n.trim() || `Player ${i + 1}`,
      avatarColor: ['#028a39','#6366f1','#f59e0b','#ef4444'][i] || '#028a39',
      score: 0,
      correctCount: 0,
      wrongCount: 0,
      streak: 0,
      usedLifelines: [],
    })))
    setCurrentPlayerIdx(0)
    setCurrentIdx(0)
    setAnsweredQuestions(new Set())
    setPhase('intro')
    setTimeout(() => beginQuestion(0), 1800)
  }

  const beginQuestion = (idx: number) => {
    setCurrentIdx(idx)
    setSelectedAnswer(null)
    setIsCorrect(null)
    setEliminatedOptions([])
    setPhoneAnswer(null)
    setAudienceData(null)
    setShowLifelineResult(false)
    setTimeLeft(config?.timeLimitSeconds ?? 30)
    setQuestionStartTime(Date.now())
    setPhase('question')
  }

  const handleAnswer = (answer: string) => {
    if (selectedAnswer || phase !== 'question') return
    clearInterval(timerRef.current!)

    const q = currentQuestion
    const corrects = getCorrectAnswers(q)
    const correct = corrects.some(c => c.toLowerCase() === answer.toLowerCase())
    const elapsed = (Date.now() - questionStartTime) / 1000
    const totalTime = config?.timeLimitSeconds ?? 30
    const timeRemainingPct = Math.max(0, (totalTime - elapsed) / totalTime)
    const basePoints = getPoints(q.difficulty)
    const pts = config?.scoringMode === 'ACCURACY_ONLY'
      ? (correct ? basePoints : 0)
      : (correct ? Math.round(basePoints * (0.3 + 0.7 * timeRemainingPct)) : 0)

    setSelectedAnswer(answer)
    setIsCorrect(correct)

    // Update player
    setPlayers(prev => prev.map((p, i) => {
      if (i !== currentPlayerIdx) return p
      return {
        ...p,
        score: p.score + pts,
        correctCount: correct ? p.correctCount + 1 : p.correctCount,
        wrongCount: !correct ? p.wrongCount + 1 : p.wrongCount,
        streak: correct ? p.streak + 1 : 0,
      }
    }))

    if (correct) SFX.correct()
    else SFX.wrong()

    setTimeout(() => setPhase('reveal'), 1500)
  }

  const handleNext = () => {
    const isLastQ = currentIdx >= questions.length - 1
    const isLocal = config?.playMode === 'LOCAL'

    if (isLocal) {
      const nextPlayerIdx = (currentPlayerIdx + 1) % players.length
      if (isLastQ && nextPlayerIdx === 0) {
        SFX.final()
        setPhase('gameover')
        return
      }
      setCurrentPlayerIdx(nextPlayerIdx)
      if (config?.selectionMode === 'FREE_CHOICE') {
        setPhase('select')
      } else {
        const nextIdx = isLastQ ? 0 : currentIdx + 1
        beginQuestion(nextIdx)
      }
    } else {
      if (isLastQ) {
        SFX.final()
        setPhase('gameover')
        return
      }
      if (config?.selectionMode === 'FREE_CHOICE') {
        setPhase('select')
      } else {
        beginQuestion(currentIdx + 1)
      }
    }
  }

  // Lifelines
  const useFiftyFifty = () => {
    if (!currentQuestion) return
    SFX.lifeline()
    const options = parseOptions(currentQuestion)
    const corrects = getCorrectAnswers(currentQuestion)
    const wrongs = options.filter(o => !corrects.includes(o))
    const toEliminate = shuffle(wrongs).slice(0, Math.min(2, wrongs.length - 1))
    setEliminatedOptions(toEliminate)
    updateLifeline('5050')
  }

  const usePhone = () => {
    if (!currentQuestion) return
    SFX.lifeline()
    const corrects = getCorrectAnswers(currentQuestion)
    setPhoneAnswer(corrects[0])
    setShowLifelineResult(true)
    updateLifeline('phone')
    setTimeout(() => setShowLifelineResult(false), 4000)
  }

  const useAudience = () => {
    if (!currentQuestion) return
    SFX.lifeline()
    const options = parseOptions(currentQuestion)
    const corrects = getCorrectAnswers(currentQuestion)
    const data: Record<string, number> = {}
    let remaining = 100
    options.forEach((o, i) => {
      if (i === options.length - 1) { data[o] = remaining; return }
      const isCorrect = corrects.includes(o)
      const pct = isCorrect
        ? Math.round(40 + Math.random() * 30)
        : Math.round(5 + Math.random() * 15)
      data[o] = Math.min(pct, remaining - (options.length - i - 1) * 5)
      remaining -= data[o]
    })
    setAudienceData(data)
    setShowLifelineResult(true)
    updateLifeline('audience')
  }

  const updateLifeline = (type: LifelineType) => {
    setPlayers(prev => prev.map((p, i) => {
      if (i !== currentPlayerIdx) return p
      return { ...p, usedLifelines: [...(p.usedLifelines || []), type] }
    }))
  }

  const hasLifeline = (type: LifelineType) =>
    !(currentPlayer?.usedLifelines || []).includes(type)

  // Safe zone calculation
  const safeZoneIndices = questions.length > 0
    ? [Math.floor(questions.length * 0.2), Math.floor(questions.length * 0.5)]
    : []

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a2e]">
      <Loader2 className="h-10 w-10 animate-spin text-yellow-400" />
    </div>
  )
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a2e] text-white">
      <div className="text-center">
        <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-lg">{error}</p>
      </div>
    </div>
  )

  // ─── PHASE: SETUP ─────────────────────────────────────────────────────────
  if (phase === 'setup') {
    const maxPlayers = config?.playMode === 'SINGLE' ? 1 : (config?.maxPlayers ?? 4)
    return (
      <div className="min-h-screen bg-[#0a0a2e] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Title */}
          <div className="text-center mb-8">
            <div className="text-yellow-400 text-xs font-bold tracking-widest uppercase mb-2">Who Wants to Be a</div>
            <h1 className="text-3xl sm:text-4xl font-black text-yellow-300 drop-shadow-lg">MILLIONAIRE</h1>
            <p className="text-blue-300 text-sm mt-2">{config?.name}</p>
          </div>

          <div className="bg-[#0d1b5e] border border-blue-500/30 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-white font-bold text-lg mb-4">
              {config?.playMode === 'SINGLE' ? 'Enter your name' : `Players (up to ${maxPlayers})`}
            </h2>
            <div className="space-y-3 mb-6">
              {setupNames.map((name, i) => (
                <Input
                  key={i}
                  value={name}
                  onChange={e => {
                    const next = [...setupNames]
                    next[i] = e.target.value
                    setSetupNames(next)
                  }}
                  placeholder={config?.playMode === 'SINGLE' ? 'Your name...' : `Player ${i + 1} name...`}
                  className="bg-[#0a0a2e] border-blue-500/30 text-white placeholder:text-blue-400"
                />
              ))}
            </div>
            {config?.playMode !== 'SINGLE' && setupNames.length < maxPlayers && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSetupNames([...setupNames, ''])}
                className="w-full mb-4 border-blue-500/30 text-blue-300 hover:bg-blue-900/30"
              >
                + Add Player
              </Button>
            )}
            <div className="text-xs text-blue-400 mb-4 space-y-1">
              <div>📊 {questions.length > 0 ? questions.length : (config?.questionsCount ?? config?.questions?.length ?? 0)} questions</div>
              <div>⏱ {config?.timeLimitSeconds}s per question</div>
              {config?.enableLifelines && <div>💡 Lifelines: 50:50, Phone, Audience</div>}
            </div>
            <Button
              onClick={startGame}
              disabled={!setupNames.some(n => n.trim())}
              className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-lg py-6"
            >
              Start Game
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ─── PHASE: INTRO ─────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <div className="min-h-screen bg-[#0a0a2e] flex items-center justify-center">
        <div className="text-center animate-pulse">
          <div className="text-yellow-300 text-4xl sm:text-6xl font-black">WWTBAM</div>
          <div className="text-blue-300 mt-4 text-xl">Get ready...</div>
        </div>
      </div>
    )
  }

  // ─── PHASE: SELECT (Free Choice) ──────────────────────────────────────────
  if (phase === 'select') {
    return (
      <div className="min-h-screen bg-[#0a0a2e] text-white p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-yellow-300">
              {config?.playMode === 'LOCAL' ? `${currentPlayer?.nickname}'s Turn` : 'Choose Your Question'}
            </h2>
            <div className="flex justify-center gap-4 mt-2 text-sm text-blue-300">
              <span>Score: {currentPlayer?.score ?? 0} pts</span>
              {config?.playMode === 'LOCAL' && (
                <span>Players: {players.map(p => `${p.nickname}: ${p.score}`).join(' | ')}</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {questions.map((q, idx) => {
              const done = answeredQuestions.has(q.id)
              return (
                <button
                  key={q.id}
                  disabled={done}
                  onClick={() => {
                    if (!done) {
                      setAnsweredQuestions(prev => new Set(Array.from(prev).concat(q.id)))
                      beginQuestion(idx)
                    }
                  }}
                  className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center text-xs font-bold transition-all ${
                    done
                      ? 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
                      : 'bg-[#0d1b5e] border-blue-500/50 text-white hover:bg-[#1a2f7e] hover:border-yellow-400 hover:scale-105 cursor-pointer'
                  }`}
                >
                  <span className="text-lg">{idx + 1}</span>
                  <span className={`text-[10px] mt-1 ${done ? 'text-gray-600' : 'text-yellow-400'}`}>
                    {done ? '✓' : `${getPoints(q.difficulty)}pts`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ─── PHASE: QUESTION ─────────────────────────────────────────────────────
  if (phase === 'question' && currentQuestion) {
    const options = parseOptions(currentQuestion)
    const corrects = getCorrectAnswers(currentQuestion)
    const maxTime = config?.timeLimitSeconds ?? 30
    const timerPct = (timeLeft / maxTime) * 100
    const timerColor = timerPct > 50 ? 'bg-green-400' : timerPct > 25 ? 'bg-yellow-400' : 'bg-red-500'

    return (
      <div className="min-h-screen bg-[#0a0a2e] text-white flex flex-col">
        {/* Header */}
        <div className="bg-[#0d1b5e] border-b border-blue-500/30 px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="text-sm text-blue-300">
              Q{currentIdx + 1}/{questions.length}
              {config?.playMode === 'LOCAL' && <span className="ml-2 text-yellow-300">— {currentPlayer?.nickname}</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-blue-300">⏱</span>
              <span className={`text-xl font-black ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-yellow-300'}`}>{timeLeft}</span>
            </div>
            <div className="text-sm text-blue-300">{currentPlayer?.score ?? 0} pts</div>
          </div>
          {/* Timer bar */}
          <div className="max-w-2xl mx-auto mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className={`h-full ${timerColor} transition-all duration-1000`} style={{ width: `${timerPct}%` }} />
          </div>
        </div>

        {/* Safe zone indicator */}
        {safeZoneIndices.includes(currentIdx) && (
          <div className="bg-yellow-900/30 border-b border-yellow-500/30 px-4 py-2 text-center text-xs text-yellow-300">
            🔒 Safe Zone — Your score here is guaranteed!
          </div>
        )}

        {/* Question */}
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-2xl">
            {/* Difficulty + points */}
            <div className="flex items-center justify-between mb-4">
              <Badge variant="outline" className="text-blue-300 border-blue-500/30">
                {currentQuestion.difficulty}
              </Badge>
              <span className="text-yellow-400 font-bold">{getPoints(currentQuestion.difficulty)} pts</span>
            </div>

            {/* Question box */}
            <div className="bg-[#0d1b5e] border-2 border-blue-500/50 rounded-2xl p-5 mb-6 text-center shadow-2xl">
              {currentQuestion.imageUrl && (
                <img src={currentQuestion.imageUrl} alt="" className="max-h-40 mx-auto mb-3 rounded-lg" />
              )}
              <p className="text-lg sm:text-xl font-semibold leading-relaxed">{currentQuestion.stem}</p>
            </div>

            {/* Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {options.map((option, i) => {
                const letter = ['A', 'B', 'C', 'D'][i]
                const isEliminated = eliminatedOptions.includes(option)
                return (
                  <button
                    key={option}
                    disabled={isEliminated || !!selectedAnswer}
                    onClick={() => !isEliminated && handleAnswer(option)}
                    className={`flex items-center gap-3 p-3 sm:p-4 rounded-xl border-2 text-left font-medium transition-all duration-200
                      ${isEliminated
                        ? 'opacity-20 cursor-not-allowed bg-gray-800 border-gray-700'
                        : 'bg-[#0d1b5e] border-blue-500/50 hover:bg-[#1a2f7e] hover:border-yellow-400 hover:scale-[1.02] cursor-pointer active:scale-[0.98]'
                      }`}
                  >
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-400 text-black font-black text-sm flex items-center justify-center">{letter}</span>
                    <span className="text-sm sm:text-base">{option}</span>
                  </button>
                )
              })}
            </div>

            {/* Lifelines */}
            {config?.enableLifelines && (
              <div className="flex justify-center gap-3 mt-6">
                <button
                  disabled={!hasLifeline('5050')}
                  onClick={useFiftyFifty}
                  className={`px-4 py-2 rounded-full text-sm font-bold border-2 transition-all ${
                    hasLifeline('5050')
                      ? 'border-yellow-400 text-yellow-400 hover:bg-yellow-400/20'
                      : 'border-gray-700 text-gray-600 cursor-not-allowed opacity-40'
                  }`}
                >
                  50:50
                </button>
                <button
                  disabled={!hasLifeline('phone')}
                  onClick={usePhone}
                  className={`px-4 py-2 rounded-full text-sm font-bold border-2 transition-all ${
                    hasLifeline('phone')
                      ? 'border-blue-400 text-blue-400 hover:bg-blue-400/20'
                      : 'border-gray-700 text-gray-600 cursor-not-allowed opacity-40'
                  }`}
                >
                  <Phone className="h-4 w-4" />
                </button>
                <button
                  disabled={!hasLifeline('audience')}
                  onClick={useAudience}
                  className={`px-4 py-2 rounded-full text-sm font-bold border-2 transition-all ${
                    hasLifeline('audience')
                      ? 'border-purple-400 text-purple-400 hover:bg-purple-400/20'
                      : 'border-gray-700 text-gray-600 cursor-not-allowed opacity-40'
                  }`}
                >
                  <Users className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Lifeline results */}
            {showLifelineResult && phoneAnswer && (
              <div className="mt-4 bg-blue-900/50 border border-blue-400 rounded-xl p-4 text-center">
                <Phone className="h-5 w-5 text-blue-400 mx-auto mb-1" />
                <p className="text-sm text-blue-200">Phone-a-friend says...</p>
                <p className="text-yellow-300 font-bold mt-1">"{phoneAnswer}"</p>
              </div>
            )}
            {showLifelineResult && audienceData && (
              <div className="mt-4 bg-purple-900/50 border border-purple-400 rounded-xl p-4">
                <Users className="h-5 w-5 text-purple-400 mx-auto mb-2" />
                <p className="text-sm text-center text-purple-200 mb-3">Audience Poll</p>
                {Object.entries(audienceData).map(([opt, pct]) => (
                  <div key={opt} className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-white w-24 truncate">{opt}</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
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

  // ─── PHASE: REVEAL ───────────────────────────────────────────────────────
  if (phase === 'reveal' && currentQuestion) {
    const options = parseOptions(currentQuestion)
    const corrects = getCorrectAnswers(currentQuestion)
    const isLastQ = currentIdx >= questions.length - 1

    return (
      <div className="min-h-screen bg-[#0a0a2e] text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          {/* Result banner */}
          <div className={`text-center p-6 rounded-2xl mb-6 border-2 ${
            isCorrect
              ? 'bg-green-900/40 border-green-500'
              : 'bg-red-900/40 border-red-500'
          }`}>
            {isCorrect
              ? <><CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-2" /><p className="text-2xl font-black text-green-300">CORRECT!</p></>
              : <><XCircle className="h-12 w-12 text-red-400 mx-auto mb-2" /><p className="text-2xl font-black text-red-300">WRONG!</p></>
            }
            <p className="text-yellow-300 font-bold mt-2">{currentPlayer?.score ?? 0} pts total</p>
          </div>

          {/* Options with correct highlighted */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {options.map((option, i) => {
              const letter = ['A', 'B', 'C', 'D'][i]
              const isCorr = corrects.some(c => c.toLowerCase() === option.toLowerCase())
              const isSelected = selectedAnswer?.toLowerCase() === option.toLowerCase()
              return (
                <div
                  key={option}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 ${
                    isCorr ? 'bg-green-900/40 border-green-500' :
                    isSelected ? 'bg-red-900/40 border-red-500' :
                    'bg-gray-800/50 border-gray-700'
                  }`}
                >
                  <span className={`flex-shrink-0 w-8 h-8 rounded-full font-black text-sm flex items-center justify-center ${
                    isCorr ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-400'
                  }`}>{letter}</span>
                  <span className={`text-sm ${isCorr ? 'text-green-300 font-bold' : 'text-gray-400'}`}>{option}</span>
                  {isCorr && <CheckCircle2 className="h-4 w-4 text-green-400 ml-auto" />}
                </div>
              )
            })}
          </div>

          {/* Explanation */}
          {currentQuestion.explanation && (
            <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-4 mb-6 text-sm text-blue-200">
              💡 {currentQuestion.explanation}
            </div>
          )}

          {/* Local: show all scores */}
          {config?.playMode === 'LOCAL' && players.length > 1 && (
            <div className="bg-[#0d1b5e] rounded-xl p-4 mb-6">
              <h3 className="text-yellow-300 font-bold mb-3">Scoreboard</h3>
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

          <Button
            onClick={handleNext}
            className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-lg py-6"
          >
            {isLastQ ? 'See Final Results' : 'Next Question'} <ChevronRight className="h-5 w-5 ml-1" />
          </Button>
        </div>
      </div>
    )
  }

  // ─── PHASE: GAME OVER ────────────────────────────────────────────────────
  if (phase === 'gameover') {
    const sorted = [...players].sort((a, b) => b.score - a.score)
    const totalQ = questions.length

    return (
      <div className="min-h-screen bg-[#0a0a2e] text-white flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <Trophy className="h-16 w-16 text-yellow-400 mx-auto mb-3" />
            <h1 className="text-3xl font-black text-yellow-300">Game Over!</h1>
            {config?.name && <p className="text-blue-300 text-sm mt-1">{config.name}</p>}
          </div>

          <div className="space-y-3 mb-8">
            {sorted.map((p, rank) => (
              <div
                key={p.id}
                className={`rounded-2xl p-5 border-2 ${
                  rank === 0 ? 'bg-yellow-900/30 border-yellow-400' :
                  rank === 1 ? 'bg-gray-700/30 border-gray-400' :
                  rank === 2 ? 'bg-orange-900/30 border-orange-600' :
                  'bg-[#0d1b5e] border-blue-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank+1}.`}</span>
                    <div>
                      <div className="font-bold text-white">{p.nickname}</div>
                      <div className="text-xs text-gray-400">
                        {p.correctCount}/{totalQ} correct · Accuracy {totalQ > 0 ? Math.round(p.correctCount/totalQ*100) : 0}%
                      </div>
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
            <Button
              onClick={() => { setPhase('setup'); setSetupNames([setupNames[0] || '']) }}
              variant="outline"
              className="flex-1 border-blue-500/30 text-blue-300 hover:bg-blue-900/30"
            >
              <RotateCcw className="h-4 w-4 mr-2" /> Play Again
            </Button>
            <Button
              onClick={() => window.close()}
              variant="outline"
              className="flex-1 border-blue-500/30 text-blue-300 hover:bg-blue-900/30"
            >
              <Home className="h-4 w-4 mr-2" /> Exit
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
