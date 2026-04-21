'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Trophy, CheckCircle2, XCircle, ChevronRight, RotateCcw, Home, Wifi, Volume2, VolumeX, QrCode, LogOut } from 'lucide-react'
import { useAudio } from '../../useAudio'
import QRCode from 'qrcode'

// ─── Types ───────────────────────────────────────────────────────────────────
type Question = {
  id: string; stem: string; questionType: string; options: string[] | string | null
  correctAnswer: string; explanation: string | null; difficulty: string; imageUrl?: string | null
}
type GameshowConfig = {
  id: string; shareCode: string; name: string; type: string
  playMode: 'SINGLE' | 'LOCAL' | 'ONLINE'; selectionMode: 'LINEAR' | 'FREE_CHOICE'
  scoringMode: 'SPEED_ACCURACY' | 'ACCURACY_ONLY'; questionsCount: number | null
  timeLimitSeconds: number; enableStreak: boolean; streakBonus: number
  shuffleQuestions: boolean; showLeaderboard: boolean; clickStartToCount: boolean
  maxPlayers: number; shortLink: string | null; quizSetTitle: string; questions: Question[]
}
type Player = {
  id: string; nickname: string; avatarColor: string
  score: number; correctCount: number; wrongCount: number; streak: number; bestStreak: number
  lastPointsEarned: number
}
type Phase = 'setup' | 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'gameover' | 'select'

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

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function KahootPage() {
  const params = useParams()
  const shareCode = params.shareCode as string

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

  const timerRef = useRef<NodeJS.Timeout|null>(null)
  const timeCountPlayedRef = useRef(false)
  const currentQuestion = questions[currentIdx]
  const currentPlayer = players[currentPlayerIdx]
  const isMultiple = currentQuestion?.questionType === 'MULTIPLE_RESPONSE'
  const isFillBlank = currentQuestion?.questionType === 'FILL_BLANK' || currentQuestion?.questionType === 'SHORT_ANSWER'
  const isFreeChoice = config?.selectionMode === 'FREE_CHOICE'
  const waitingForStart = config?.clickStartToCount && !timerRunning && phase === 'question'

  // Fetch config
  useEffect(() => {
    fetch(`/api/gameshow/${shareCode}`).then(r=>r.json()).then(data => {
      if (data.error){setError(data.error);return}
      if (data.type!=='KAHOOT'){setError('This gameshow is not a Kahoot game');return}
      setConfig(data); setLoading(false)
    }).catch(()=>setError('Failed to load gameshow'))
  }, [shareCode])

  // Opening music
  useEffect(() => { if (phase==='setup'&&!loading) audio.playBg('opening', 0.5) }, [phase, loading])

  // Timer
  useEffect(() => {
    if (!timerRunning || phase!=='question'||!config) return
    timeCountPlayedRef.current = false
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev<=5&&!timeCountPlayedRef.current){timeCountPlayedRef.current=true;audio.playTimeCount()}
        if (prev<=1){clearInterval(timerRef.current!);handleTimeout();return 0}
        return prev-1
      })
    }, 1000)
    return ()=>clearInterval(timerRef.current!)
  }, [timerRunning, phase, currentIdx])

  const handleTimeout = useCallback(() => {
    if (submitted) return
    audio.stopAll(); audio.stopTimeCount()
    audio.playOnce('lost', 0.9)
    setIsCorrect(false); setSubmitted(true)
    buildDistribution()
    setTimeout(()=>setPhase('reveal'), 800)
  }, [submitted])

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
    if(!correct)return 0
    if(config?.scoringMode==='ACCURACY_ONLY')return 1000
    const maxTime=config?.timeLimitSeconds??30
    return Math.round(1000*(0.3+0.7*Math.max(0,(maxTime-elapsed)/maxTime)))
  }

  const handleAnswer=(answer:string)=>{
    if(submitted||phase!=='question'||waitingForStart)return
    clearInterval(timerRef.current!)
    audio.stopAll(); audio.stopTimeCount()
    const elapsed=(Date.now()-questionStartTime)/1000
    const corrects=getCorrectAnswers(currentQuestion)
    const correct=corrects.some(c=>normalize(c)===normalize(answer))
    const streakBonus=config?.enableStreak&&correct?(currentPlayer?.streak??0)*(config?.streakBonus??50):0
    const pts=computePoints(correct,elapsed)+streakBonus
    setSelectedAnswer(answer); setIsCorrect(correct); setSubmitted(true)
    buildDistribution()
    updatePlayer(correct,pts)
    if(correct){audio.playOnce('win',0.9);if((currentPlayer?.streak??0)>=2)setShowConfetti(true);setTimeout(()=>setShowConfetti(false),1500)}
    else audio.playOnce('lost',0.9)
    setTimeout(()=>setPhase('reveal'),1200)
  }

  const handleMultipleSubmit=()=>{
    if(submitted||phase!=='question'||waitingForStart)return
    clearInterval(timerRef.current!)
    audio.stopAll(); audio.stopTimeCount()
    const elapsed=(Date.now()-questionStartTime)/1000
    const corrects=getCorrectAnswers(currentQuestion)
    const correct=corrects.length===selectedMultiple.length&&corrects.every(c=>selectedMultiple.some(s=>normalize(s)===normalize(c)))
    const pts=computePoints(correct,elapsed)
    setIsCorrect(correct); setSubmitted(true)
    buildDistribution(); updatePlayer(correct,pts)
    if(correct){audio.playOnce('win',0.9);setShowConfetti(true);setTimeout(()=>setShowConfetti(false),1500)}
    else audio.playOnce('lost',0.9)
    setTimeout(()=>setPhase('reveal'),1200)
  }

  const handleFillSubmit=()=>{
    if(submitted||phase!=='question'||!fillAnswer.trim()||waitingForStart)return
    clearInterval(timerRef.current!)
    audio.stopAll(); audio.stopTimeCount()
    const elapsed=(Date.now()-questionStartTime)/1000
    const corrects=getCorrectAnswers(currentQuestion)
    const correct=corrects.some(c=>normalize(c)===normalize(fillAnswer))
    const pts=computePoints(correct,elapsed)
    setIsCorrect(correct); setSubmitted(true)
    buildDistribution(); updatePlayer(correct,pts)
    if(correct){audio.playOnce('win',0.9);setShowConfetti(true);setTimeout(()=>setShowConfetti(false),1500)}
    else audio.playOnce('lost',0.9)
    setTimeout(()=>setPhase('reveal'),1200)
  }

  const updatePlayer=(correct:boolean,pts:number)=>{
    setPlayers(prev=>prev.map((p,i)=>{
      if(i!==currentPlayerIdx)return p
      const newStreak=correct?p.streak+1:0
      return{...p,score:p.score+pts,correctCount:correct?p.correctCount+1:p.correctCount,wrongCount:!correct?p.wrongCount+1:p.wrongCount,streak:newStreak,bestStreak:Math.max(p.bestStreak,newStreak),lastPointsEarned:pts}
    }))
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
        const res=await fetch(`/api/gameshow/${shareCode}/session`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({players:names.map(n=>({nickname:n}))})})
        const data=await res.json()
        setRoomCode(data.roomCode); setPhase('lobby'); return
      }catch{}
    }
    beginQuestion(0,qs)
  }

  const beginQuestion=(idx:number,qs?:Question[])=>{
    setCurrentIdx(idx)
    setSelectedAnswer(null); setSelectedMultiple([]); setFillAnswer('')
    setSubmitted(false); setIsCorrect(null); setDistribution({})
    setTimeLeft(config?.timeLimitSeconds??30)
    setQuestionStartTime(Date.now())
    timeCountPlayedRef.current=false
    setPhase('question')

    if(config?.clickStartToCount){
      audio.playBg('wait',0.5)
      setTimerRunning(false)
    } else {
      audio.playBg('kahoot-play',0.55)
      setTimerRunning(true)
    }
  }

  const handleStartCount=()=>{
    audio.stop('wait')
    audio.playBg('kahoot-play',0.55)
    setQuestionStartTime(Date.now())
    setTimerRunning(true)
  }

  const advanceFromLeaderboard=(isLast:boolean)=>{
    audio.stop('leaderboard')
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
    const allAnswered=answeredQuestions.size>=questions.length
    const isLast=isFreeChoice?allAnswered:currentIdx>=questions.length-1
    audio.stopAll()
    if(config?.showLeaderboard&&players.length>0){
      audio.playBg('leaderboard',0.6)
      setPhase('leaderboard')
      setTimeout(()=>advanceFromLeaderboard(isLast),5000)
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
  if(phase==='lobby'){
    return(
      <div className="relative min-h-screen bg-gradient-to-b from-[#6366f1] to-[#4f46e5] flex items-center justify-center p-4 text-white">
        <MusicBtn/>
        <div className="text-center max-w-sm w-full">
          <div className="text-6xl mb-4">🎮</div>
          <h2 className="text-2xl font-black mb-2">Room Code</h2>
          <div className="text-5xl font-black tracking-widest bg-white/20 rounded-2xl py-4 mb-6">{roomCode}</div>
          <p className="text-indigo-200 mb-2">Share to join:</p>
          <p className="text-sm opacity-70 mb-6">{typeof window!=='undefined'?window.location.href:''}</p>
          <Button onClick={()=>beginQuestion(0)}
            className="w-full bg-white text-[#6366f1] font-black text-lg py-6 rounded-2xl hover:bg-indigo-50">Start Game</Button>
        </div>
      </div>
    )
  }

  // ─── SELECT (Free Choice) ────────────────────────────────────────────────────
  if(phase==='select'||((phase==='question'||phase==='reveal')&&isFreeChoice&&!currentQuestion)){
    const allAnswered=answeredQuestions.size>=questions.length
    return(
      <div className="relative min-h-screen bg-[#1a1a2e] text-white p-4">
        <MusicBtn/>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">{currentPlayer?.nickname}'s Turn</h2>
              <p className="text-indigo-300 text-sm">{answeredQuestions.size}/{questions.length} done</p>
            </div>
            <Button size="sm" variant="outline"
              onClick={()=>{audio.stopAll();audio.playBg('leaderboard',0.6);setPhase('leaderboard');setTimeout(()=>setPhase('gameover'),5000)}}
              className="border-red-500/50 text-red-400 hover:bg-red-900/20">
              <LogOut className="h-4 w-4 mr-1"/>Exit
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
                      setAnsweredQuestions(prev=>new Set(Array.from(prev).concat(q.id)))
                      audio.stop('selecting')
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
            <div className="text-right"><div className="text-white font-bold">{currentPlayer?.score??0}</div><div className="text-xs text-indigo-400">pts</div></div>
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

        {/* Start button */}
        {waitingForStart&&(
          <div className="flex justify-center py-4 bg-[#1a1a2e]">
            <Button onClick={handleStartCount}
              className="bg-[#6366f1] hover:bg-[#4f46e5] text-white font-black text-lg px-10 py-5 rounded-2xl shadow-lg">
              ▶ Start Timer
            </Button>
          </div>
        )}

        {/* Answers */}
        <div className="flex-1 p-4">
          <div className="max-w-2xl mx-auto h-full flex flex-col justify-center">
            <div className={waitingForStart?'opacity-60 pointer-events-none':''}>
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
                    return(
                      <button key={opt} disabled={submitted} onClick={()=>handleAnswer(opt)}
                        className={`flex items-center gap-3 p-4 sm:p-5 rounded-2xl border-4 text-left font-bold transition-all active:scale-95
                          ${submitted&&isSel?'opacity-90 scale-[0.97]':''}
                          ${submitted&&!isSel?'opacity-50':''}
                          ${!submitted?'hover:scale-[1.02] cursor-pointer':'cursor-not-allowed'}
                          ${col.bg} ${col.border}`}>
                        <span className="text-2xl flex-shrink-0">{col.icon}</span>
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
          <div className={`text-center p-5 rounded-2xl mb-4 border-2 mt-4 ${isCorrect?'bg-green-900/40 border-green-500':'bg-red-900/40 border-red-500'}`}>
            {isCorrect
              ?<><CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-1"/><p className="text-xl font-black text-green-300">Correct!</p></>
              :<><XCircle className="h-10 w-10 text-red-400 mx-auto mb-1"/><p className="text-xl font-black text-red-300">Wrong!</p></>
            }
            {isCorrect&&currentPlayer&&<p className="text-yellow-300 font-bold mt-1">+{currentPlayer.lastPointsEarned} pts{config?.enableStreak&&currentPlayer.streak>=2?` · 🔥 ${currentPlayer.streak} streak!`:''}</p>}
            <p className="text-sm text-gray-300 mt-1">Answer: <span className="text-green-300 font-bold">{corrects.join(', ')}</span></p>
          </div>

          {Object.keys(distribution).length>0&&(
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

          {currentQuestion.explanation&&(
            <div className="bg-indigo-900/40 border border-indigo-500/30 rounded-xl p-3 mb-3 text-xs text-indigo-200">
              💡 {currentQuestion.explanation}
            </div>
          )}

          <div className="bg-[#16213e] rounded-2xl p-4 mb-4">
            {[...players].sort((a,b)=>b.score-a.score).slice(0,5).map((p,rank)=>(
              <div key={p.id} className={`flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0 ${p.id===currentPlayer?.id?'bg-indigo-900/30 -mx-2 px-2 rounded-lg':''}`}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{['🥇','🥈','🥉'][rank]||`${rank+1}.`}</span>
                  <span className="text-sm font-medium">{p.nickname}</span>
                  {p.streak>=2&&<span className="text-xs text-orange-400">🔥{p.streak}</span>}
                </div>
                <span className="text-yellow-300 font-bold">{p.score}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            {isFreeChoice&&(
              <Button onClick={()=>{audio.stopAll();audio.playBg('selecting',0.5);setPhase('select')}}
                variant="outline" className="flex-1 border-indigo-500/30 text-indigo-300 hover:bg-indigo-900/20">
                Board
              </Button>
            )}
            <Button onClick={handleNext}
              className={`${isFreeChoice?'flex-1':'w-full'} bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold py-5 rounded-2xl text-lg`}>
              {currentIdx>=questions.length-1?'Final Results':'Next'} <ChevronRight className="h-5 w-5 ml-1"/>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ─── LEADERBOARD ─────────────────────────────────────────────────────────────
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
          <div className="text-center space-y-3">
            <p className="text-indigo-300 text-sm">Auto-continuing in 5 seconds…</p>
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
        </div>
      </div>
    )
  }

  // ─── GAME OVER ────────────────────────────────────────────────────────────────
  if(phase==='gameover'){
    const sorted=[...players].sort((a,b)=>b.score-a.score)
    return(
      <div className="relative min-h-screen bg-gradient-to-b from-[#6366f1] to-[#4f46e5] flex items-center justify-center p-4">
        <MusicBtn/>
        <div className="w-full max-w-lg text-white">
          <div className="text-center mb-6">
            <Trophy className="h-16 w-16 text-yellow-300 mx-auto mb-3"/>
            <h1 className="text-3xl font-black">Game Over!</h1>
            <p className="text-indigo-200 mt-1">{config?.name}</p>
          </div>
          <div className="space-y-3 mb-6">
            {sorted.map((p,rank)=>(
              <div key={p.id} className={`rounded-2xl p-4 ${rank===0?'bg-yellow-400/20 border-2 border-yellow-400':rank===1?'bg-white/10':'bg-white/5'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{['🥇','🥈','🥉'][rank]||`${rank+1}.`}</span>
                    <div>
                      <div className="font-bold">{p.nickname}</div>
                      <div className="text-xs opacity-70">{p.correctCount}/{questions.length} correct · best streak {p.bestStreak}🔥</div>
                    </div>
                  </div>
                  <div className="text-right"><div className="text-2xl font-black text-yellow-300">{p.score}</div><div className="text-xs opacity-60">pts</div></div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <Button onClick={()=>{setPhase('setup');setSetupNames([setupNames[0]||''])}}
              variant="outline" className="flex-1 border-white/30 text-white hover:bg-white/10 rounded-2xl">
              <RotateCcw className="h-4 w-4 mr-2"/>Play Again
            </Button>
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
