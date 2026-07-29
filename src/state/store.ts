import { create } from 'zustand'
import type { Interim, MeetingSettings, SessionStatus, Utterance } from '../lib/types'

const SETTINGS_KEY = 'lm-settings'

const defaultSettings: MeetingSettings = {
  title: '',
  sourceLang: 'en',
  targetLang: 'zh',
  diarization: true,
  generateMinutes: true,
  asrProvider: 'auto',
  autoDetect: false,
  captionOrder: 'newest-bottom',
  fontSource: 2,
  fontTranslation: 2,
  translateChunkChars: 0,
  translateMaxWaitSec: 3,
  minutesLang: 'zh-Hant',
  recordAudio: false,
  audioRetentionDays: 30,
  participants: '',
}

function loadSettings(): MeetingSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...defaultSettings, ...(JSON.parse(raw) as Partial<MeetingSettings>) }
  } catch {
    /* ignore */
  }
  return defaultSettings
}

export interface AppState {
  settings: MeetingSettings
  status: SessionStatus
  roomId: string | null
  startedAt: number | null
  elapsedSec: number
  utterances: Utterance[]
  interim: Interim | null
  viewers: number
  error: string | null
  micReady: boolean
  isHost: boolean
  backendReady: boolean
  paused: boolean
  pausedMs: number
  recording: boolean

  setSettings: (patch: Partial<MeetingSettings>) => void
  startSession: (roomId: string, startedAt: number, isHost: boolean) => void
  resetSession: () => void
  setStatus: (s: SessionStatus) => void
  setError: (e: string | null) => void
  tick: () => void
  addFinal: (u: Utterance) => void
  updateUtterance: (id: string, patch: Partial<Utterance>) => void
  replaceUtterances: (list: Utterance[]) => void
  setInterim: (i: Interim | null) => void
  setViewers: (n: number) => void
  setMicReady: (b: boolean) => void
  setBackendReady: (b: boolean) => void
  setPaused: (b: boolean) => void
  addPausedMs: (ms: number) => void
  setRecording: (b: boolean) => void
}

export const useStore = create<AppState>((set) => ({
  settings: loadSettings(),
  status: 'idle',
  roomId: null,
  startedAt: null,
  elapsedSec: 0,
  utterances: [],
  interim: null,
  viewers: 0,
  error: null,
  micReady: false,
  isHost: true,
  backendReady: false,
  paused: false,
  pausedMs: 0,
  recording: false,

  setSettings: (patch) =>
    set((s) => {
      const settings = { ...s.settings, ...patch }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      } catch {
        /* ignore */
      }
      return { settings }
    }),

  startSession: (roomId, startedAt, isHost) =>
    set({
      roomId,
      startedAt,
      isHost,
      status: 'connecting',
      elapsedSec: 0,
      utterances: [],
      interim: null,
      viewers: 0,
      error: null,
      micReady: false,
      paused: false,
      pausedMs: 0,
    }),

  resetSession: () =>
    set({
      status: 'idle',
      roomId: null,
      startedAt: null,
      elapsedSec: 0,
      utterances: [],
      interim: null,
      viewers: 0,
      error: null,
      micReady: false,
      paused: false,
      pausedMs: 0,
    }),

  setStatus: (status) => set({ status }),
  setError: (error) => set(error ? { error, status: 'error' } : { error: null }),
  tick: () =>
    set((s) => ({ elapsedSec: s.startedAt ? Math.max(0, Math.floor((Date.now() - s.startedAt - s.pausedMs) / 1000)) : s.elapsedSec })),
  addFinal: (u) => set((s) => ({ utterances: [...s.utterances, u] })),
  updateUtterance: (id, patch) =>
    set((s) => ({ utterances: s.utterances.map((u) => (u.id === id ? { ...u, ...patch } : u)) })),
  replaceUtterances: (list) => set({ utterances: list }),
  setInterim: (interim) => set({ interim }),
  setViewers: (viewers) => set({ viewers }),
  setMicReady: (micReady) => set({ micReady }),
  setBackendReady: (backendReady) => set({ backendReady }),
  setPaused: (paused) => set({ paused }),
  addPausedMs: (ms) => set((s) => ({ pausedMs: s.pausedMs + ms })),
  setRecording: (recording) => set({ recording }),
}))
