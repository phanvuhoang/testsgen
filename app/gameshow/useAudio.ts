'use client'
import { useEffect, useRef, useCallback } from 'react'

// ─── Shared audio hook for all gameshow pages ────────────────────────────────
// Manages HTML Audio elements with clean play/stop, loop, and mute support.

export type AudioTrack =
  | 'opening'       // Opening-screen.mp3
  | 'selecting'     // Selecting-question-screen.m4a
  | 'kahoot-play'   // Kahoot-Play.mp3
  | 'game-play'     // WWTBAM-and-Jeopardy-Play.wav
  | 'wait'          // WAIT-FOR-ANSWER.wav
  | 'time-count'    // Time-Count.mp3
  | 'win'           // WIN.mp3
  | 'lost'          // LOST.mp3
  | 'leaderboard'   // LeaderBoard.wav

const TRACK_PATHS: Record<AudioTrack, string> = {
  'opening':    '/sounds/opening-screen.mp3',
  'selecting':  '/sounds/selecting-question.m4a',
  'kahoot-play':'/sounds/kahoot-play.mp3',
  'game-play':  '/sounds/wwtbam-jeopardy-play.wav',
  'wait':       '/sounds/wait-for-answer.wav',
  'time-count': '/sounds/time-count.mp3',
  'win':        '/sounds/win.mp3',
  'lost':       '/sounds/lost.mp3',
  'leaderboard':'/sounds/leaderboard.wav',
}

export function useAudio(musicEnabled: boolean) {
  // Map of track → audio element
  const audios = useRef<Partial<Record<AudioTrack, HTMLAudioElement>>>({})
  const currentTrack = useRef<AudioTrack | null>(null)
  const timeCountRef = useRef<HTMLAudioElement | null>(null)

  // Lazy-create audio element
  const getAudio = useCallback((track: AudioTrack): HTMLAudioElement => {
    if (!audios.current[track]) {
      const audio = new Audio(TRACK_PATHS[track])
      audio.preload = 'auto'
      audios.current[track] = audio
    }
    return audios.current[track]!
  }, [])

  // Stop all tracks
  const stopAll = useCallback(() => {
    Object.values(audios.current).forEach(a => {
      if (a) { a.pause(); a.currentTime = 0 }
    })
    currentTrack.current = null
  }, [])

  // Stop a specific track
  const stop = useCallback((track: AudioTrack) => {
    const a = audios.current[track]
    if (a) { a.pause(); a.currentTime = 0 }
    if (currentTrack.current === track) currentTrack.current = null
  }, [])

  // Play a looping background track (stops any currently playing background)
  const playBg = useCallback((track: AudioTrack, volume = 0.6) => {
    if (!musicEnabled) return
    // Stop current background
    if (currentTrack.current && currentTrack.current !== track) {
      const cur = audios.current[currentTrack.current]
      if (cur) { cur.pause(); cur.currentTime = 0 }
    }
    const audio = getAudio(track)
    audio.loop = true
    audio.volume = volume
    audio.currentTime = 0
    audio.play().catch(() => {})
    currentTrack.current = track
  }, [musicEnabled, getAudio])

  // Play a one-shot sound (doesn't stop background)
  const playOnce = useCallback((track: AudioTrack, volume = 0.8) => {
    if (!musicEnabled) return
    const audio = getAudio(track)
    audio.loop = false
    audio.volume = volume
    audio.currentTime = 0
    audio.play().catch(() => {})
  }, [musicEnabled, getAudio])

  // Special: play time-count only once (not looping)
  const playTimeCount = useCallback(() => {
    if (!musicEnabled) return
    const audio = getAudio('time-count')
    audio.loop = false
    audio.volume = 0.9
    audio.currentTime = 0
    audio.play().catch(() => {})
    timeCountRef.current = audio
  }, [musicEnabled, getAudio])

  const stopTimeCount = useCallback(() => {
    const audio = audios.current['time-count']
    if (audio) { audio.pause(); audio.currentTime = 0 }
  }, [])

  // Mute/unmute all when musicEnabled changes
  useEffect(() => {
    Object.values(audios.current).forEach(a => {
      if (a) a.muted = !musicEnabled
    })
    if (!musicEnabled) {
      // Don't stop — just mute; so when re-enabled they resume naturally
    }
  }, [musicEnabled])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(audios.current).forEach(a => {
        if (a) { a.pause(); a.src = '' }
      })
    }
  }, [])

  return { playBg, playOnce, stop, stopAll, playTimeCount, stopTimeCount }
}
