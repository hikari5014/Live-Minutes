// MeetingEngine orchestrates the live pipeline:
//   ASR (Web Speech now / Deepgram via room later) -> finalized segment
//   -> optional translation -> store -> local history on stop.
import { useStore } from '../state/store'
import { LANGS } from './langs'
import { WebSpeechASR, type ASREngine } from './asr'
import { backendAvailable, translateText } from './api'
import { enableWakeLock, disableWakeLock } from './wakelock'
import { saveSession } from './history'
import type { SessionMeta, Utterance } from './types'

function genRoomId(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  const arr = new Uint32Array(6)
  crypto.getRandomValues(arr)
  return Array.from(arr, (n) => chars[n % chars.length]).join('')
}

function defaultTitle(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `會議 ${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function buildMeta(): SessionMeta {
  const s = useStore.getState()
  const speakerSet = new Set(s.utterances.map((u) => u.speaker).filter((x): x is number => x !== null))
  return {
    id: s.roomId ?? genRoomId(),
    title: s.settings.title.trim() || defaultTitle(),
    createdAt: s.startedAt ?? Date.now(),
    durationSec: s.elapsedSec,
    sourceLang: s.settings.sourceLang,
    targetLang: s.settings.targetLang,
    speakers: Math.max(speakerSet.size, s.utterances.length > 0 ? 1 : 0),
    hasMinutes: false,
  }
}

class MeetingEngine {
  private asr: ASREngine | null = null
  private timer: number | null = null
  private t0 = 0
  private backendOk = false

  /** Ensure there is a room id to start from (host flow). */
  prepareRoomId(): string {
    const id = genRoomId()
    useStore.getState().startSession(id, Date.now(), true)
    return id
  }

  async start(): Promise<void> {
    const st = useStore.getState()
    const s = st.settings
    if (!st.roomId) {
      this.prepareRoomId()
    }
    st.setError(null)
    st.setStatus('connecting')
    this.t0 = useStore.getState().startedAt ?? Date.now()

    this.timer = window.setInterval(() => useStore.getState().tick(), 1000)
    void enableWakeLock()

    // Is a backend connected? Enables translation + (later) Deepgram/rooms.
    this.backendOk = await backendAvailable()
    useStore.getState().setBackendReady(this.backendOk)

    // ASR provider. Web Speech works with zero backend; Deepgram arrives with
    // the Worker + Durable Object room (needs the backend + a key).
    const src = LANGS[s.sourceLang]
    this.asr = new WebSpeechASR(src.bcp47, {
      onInterim: (text) =>
        useStore.getState().setInterim(text ? { speaker: null, source: text, translation: null } : null),
      onFinal: (text, speaker) => this.handleFinal(text, speaker),
      onError: (msg) => useStore.getState().setError(msg),
      onStart: () => {
        useStore.getState().setStatus('live')
        useStore.getState().setMicReady(true)
      },
    })
    await this.asr.start()
  }

  private handleFinal(text: string, speaker: number | null): void {
    const st = useStore.getState()
    const s = st.settings
    const u: Utterance = {
      id: crypto.randomUUID(),
      speaker,
      source: text,
      translation: null,
      ts: Date.now() - this.t0,
      final: true,
    }
    st.addFinal(u)
    st.setInterim(null)

    if (s.targetLang !== 'none' && this.backendOk) {
      const target = LANGS[s.targetLang]
      const source = LANGS[s.sourceLang]
      translateText(text, source.deeplSource, target.deepl)
        .then((tr) => useStore.getState().updateUtterance(u.id, { translation: tr }))
        .catch(() => {
          /* backend hiccup — leave original visible */
        })
    }
  }

  async stop(): Promise<SessionMeta> {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.asr?.stop()
    this.asr = null
    void disableWakeLock()

    const st = useStore.getState()
    st.setStatus('ended')
    st.setInterim(null)
    const meta = buildMeta()
    saveSession(meta, st.utterances)
    return meta
  }
}

export const engine = new MeetingEngine()
export { genRoomId }
