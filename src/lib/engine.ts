// MeetingEngine orchestrates the live pipeline:
//   ASR (Deepgram if available, else Web Speech) -> finalized segment
//   -> optional translation -> store -> room broadcast -> local history.
import { useStore } from '../state/store'
import { LANGS } from './langs'
import { WebSpeechASR, type ASRCallbacks, type ASREngine } from './asr'
import { DeepgramASR } from './asr-deepgram'
import { backendAvailable, getDeepgramToken, translateText } from './api'
import { enableWakeLock, disableWakeLock } from './wakelock'
import { saveSession } from './history'
import { joinAsHost, type HostRoom } from './room'
import type { SessionMeta, Utterance } from './types'

function genRoomId(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  const arr = new Uint32Array(6)
  crypto.getRandomValues(arr)
  return Array.from(arr, (n) => chars[n % chars.length]).join('')
}

// Join two caption fragments, inserting a space only between Latin/alnum runs
// (CJK text is concatenated without spaces).
function joinText(a: string, b: string): string {
  if (!a) return b
  if (!b) return a
  const needsSpace = /[A-Za-z0-9)\]]$/.test(a) && /^[A-Za-z0-9([]/.test(b)
  return needsSpace ? `${a} ${b}` : a + b
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
  private host: HostRoom | null = null
  private timer: number | null = null
  private t0 = 0
  private backendOk = false
  private fellBack = false
  private pending: { text: string; speaker: number | null; ts: number } | null = null
  private flushTimer: number | null = null

  prepareRoomId(): string {
    const id = genRoomId()
    useStore.getState().startSession(id, Date.now(), true)
    return id
  }

  async start(): Promise<void> {
    const st = useStore.getState()
    const s = st.settings
    this.prepareRoomId() // always begin a fresh room: resets timer, utterances, id
    this.fellBack = false
    this.pending = null
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    st.setError(null)
    st.setStatus('connecting')
    this.t0 = useStore.getState().startedAt ?? Date.now()

    this.timer = window.setInterval(() => useStore.getState().tick(), 1000)
    void enableWakeLock()

    this.backendOk = await backendAvailable()
    useStore.getState().setBackendReady(this.backendOk)

    // Host room: publish captions so viewers on the share link see them live.
    if (this.backendOk) {
      const roomId = useStore.getState().roomId as string
      this.host = joinAsHost(roomId, {
        source: s.sourceLang,
        target: s.targetLang,
        title: s.title.trim() || '會議',
        onViewers: (n) => useStore.getState().setViewers(n),
      })
    }

    const cb = this.callbacks()
    const src = LANGS[s.sourceLang]

    // Prefer Deepgram when available (better quality + diarization); else Web Speech.
    let asr: ASREngine | null = null
    const wantDeepgram = this.backendOk && (s.asrProvider === 'deepgram' || (s.asrProvider === 'auto' && s.diarization))
    if (wantDeepgram) {
      const tok = await getDeepgramToken().catch(() => null)
      if (tok?.key) asr = new DeepgramASR(src.deepgram, this.withDeepgramFallback(cb, src.bcp47), tok.key)
    }
    if (!asr) asr = new WebSpeechASR(src.bcp47, cb)
    this.asr = asr
    await asr.start()
  }

  private callbacks(): ASRCallbacks {
    return {
      onInterim: (text) => {
        // While batching, show buffered finals + the live partial together.
        const p = this.pending
        const show = (p?.text ? joinText(p.text, text || '') : text || '').trim()
        useStore.getState().setInterim(show ? { speaker: p?.speaker ?? null, source: show, translation: null } : null)
        this.host?.publishInterim(p?.speaker ?? null, show)
      },
      onFinal: (text, speaker) => this.handleFinal(text, speaker),
      onError: (msg) => useStore.getState().setError(msg),
      onStart: () => {
        useStore.getState().setStatus('live')
        useStore.getState().setMicReady(true)
      },
    }
  }

  private handleFinal(text: string, speaker: number | null): void {
    const chunk = useStore.getState().settings.translateChunkChars ?? 0
    if (chunk <= 0) {
      this.emitUtterance(text, speaker) // 逐句即時：translate each finalized sentence
      return
    }
    // Batch consecutive finals into a longer segment before translating, so
    // translation is more coherent and DeepL is called less often.
    if (this.pending && speaker !== null && this.pending.speaker !== null && speaker !== this.pending.speaker) {
      this.flush() // speaker changed — close the current batch first
    }
    if (!this.pending) this.pending = { text: '', speaker, ts: Date.now() - this.t0 }
    this.pending.text = joinText(this.pending.text, text)
    if (this.pending.speaker === null && speaker !== null) this.pending.speaker = speaker
    useStore.getState().setInterim({ speaker: this.pending.speaker, source: this.pending.text, translation: null })
    this.host?.publishInterim(this.pending.speaker, this.pending.text)
    if (this.pending.text.length >= chunk) {
      this.flush()
      return
    }
    if (this.flushTimer === null) {
      const waitMs = Math.max(0, useStore.getState().settings.translateMaxWaitSec ?? 3) * 1000
      this.flushTimer = window.setTimeout(() => {
        this.flushTimer = null
        this.flush()
      }, waitMs || 1)
    }
  }

  private emitUtterance(text: string, speaker: number | null, ts?: number): void {
    const s = useStore.getState().settings
    const u: Utterance = {
      id: crypto.randomUUID(),
      speaker,
      source: text,
      translation: null,
      ts: ts ?? (Date.now() - this.t0),
      final: true,
    }
    useStore.getState().addFinal(u)
    useStore.getState().setInterim(null)
    this.host?.publishFinal(u)
    this.host?.publishInterim(null, '')

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

  private flush(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    const p = this.pending
    this.pending = null
    if (p && p.text.trim()) this.emitUtterance(p.text, p.speaker, p.ts)
    else useStore.getState().setInterim(null)
  }

  // If Deepgram fails (auth/network), transparently switch to the browser's
  // Web Speech so captions keep working instead of dead-ending on an error.
  private withDeepgramFallback(cb: ASRCallbacks, bcp47: string): ASRCallbacks {
    return {
      ...cb,
      onError: (msg) => {
        if (this.fellBack) return cb.onError(msg)
        this.fellBack = true
        try {
          this.asr?.stop()
        } catch {
          /* ignore */
        }
        useStore.getState().setError(null)
        const ws = new WebSpeechASR(bcp47, cb)
        this.asr = ws
        void ws.start()
      },
    }
  }

  async stop(): Promise<SessionMeta> {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.asr?.stop()
    this.asr = null
    this.host?.end()
    this.host?.close()
    this.host = null
    void disableWakeLock()

    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.flush() // emit any buffered (not-yet-flushed) text as a final segment

    const st = useStore.getState()
    st.setStatus('ended')
    st.setInterim(null)
    const meta = buildMeta()
    saveSession(meta, st.utterances)
    st.resetSession() // clear live state so the next recording starts fresh
    return meta
  }
}

export const engine = new MeetingEngine()
export { genRoomId }
