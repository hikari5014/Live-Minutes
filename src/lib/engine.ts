// MeetingEngine orchestrates the live pipeline:
//   ASR (Deepgram if available, else Web Speech) -> finalized segment
//   -> optional translation -> store -> room broadcast -> local history.
import { useStore } from '../state/store'
import { LANGS } from './langs'
import { WebSpeechASR, type ASRCallbacks, type ASREngine } from './asr'
import { DeepgramASR } from './asr-deepgram'
import { backendAvailable, getDeepgramToken, translateText, translateDetect, pushBackup } from './api'
import { enableWakeLock, disableWakeLock } from './wakelock'
import { recorder } from './recorder'
import { requestPersist } from './storage'
import { pruneOlderThan } from './audiodb'
import { acquireAudio, tabAudioSupported, type AcquiredAudio } from './audiosource'
import { saveSession, saveDraft, clearDraft, getBackupKey, exportOne } from './history'
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
    targetLang: s.settings.autoDetect ? 'zh' : s.settings.targetLang,
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
  private pretoken: string | null = null
  private lastDraft = 0
  private pauseStart = 0
  private audio: AcquiredAudio | null = null

  // Whether Deepgram can be used right now (backend up + token grantable).
  // Gates the multilingual auto-detect mode before a meeting can start.
  async deepgramReady(): Promise<boolean> {
    if (!(await backendAvailable())) return false
    const tok = await getDeepgramToken().catch(() => null)
    this.pretoken = tok?.key ?? null
    return !!tok?.key
  }

  private abortStart(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.asr = null
    this.host?.close()
    this.host = null
    void disableWakeLock()
    useStore.getState().setStatus('idle')
  }

  prepareRoomId(): string {
    const id = genRoomId()
    useStore.getState().startSession(id, Date.now(), true)
    return id
  }

  async start(): Promise<boolean> {
    const st = useStore.getState()
    const s = st.settings
    this.prepareRoomId() // always begin a fresh room: resets timer, utterances, id
    this.fellBack = false
    this.pending = null
    this.lastDraft = 0
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
        source: s.autoDetect ? 'auto' : s.sourceLang,
        target: s.autoDetect ? 'zh' : s.targetLang,
        title: s.title.trim() || '會議',
        onViewers: (n) => useStore.getState().setViewers(n),
      })
    }

    // Tab/system audio (online meetings): acquire ONE stream up front and share
    // it with both the recorder and live ASR, so the share picker appears once.
    const wantTab = s.audioSource !== 'mic' && tabAudioSupported()
    if (wantTab) {
      try {
        this.audio = await acquireAudio(s.audioSource, {
          echoCancel: s.echoCancel,
          onTabEnded: () => useStore.getState().setError('分頁音訊分享已停止，錄音與字幕已中斷。'),
        })
      } catch (e) {
        useStore.getState().setError(e instanceof Error ? e.message : '無法取得分頁音訊')
        this.abortStart()
        return false
      }
    }

    const ok = await this.startAsr()
    if (!ok) {
      this.releaseAudio()
      this.abortStart()
      return false
    }

    // Audio recording (opt-in): kept on-device for a later high-quality
    // transcript. Never blocks the meeting if it fails.
    if (s.recordAudio) {
      void requestPersist()
      const roomId = useStore.getState().roomId as string
      recorder
        .start(roomId, s.title.trim() || '會議', undefined, this.audio?.stream)
        .then((started) => useStore.getState().setRecording(started))
        .catch(() => useStore.getState().setRecording(false))
      void pruneOlderThan(s.audioRetentionDays).catch(() => 0)
    }
    return true
  }

  private releaseAudio(): void {
    try {
      this.audio?.cleanup()
    } catch {
      /* ignore */
    }
    this.audio = null
  }

  // Build and start the ASR engine for the current settings. Shared by start()
  // and resume(). Returns false if a required provider (Deepgram for auto-detect)
  // is unavailable.
  private async startAsr(): Promise<boolean> {
    const s = useStore.getState().settings
    const cb = this.callbacks()
    const src = LANGS[s.sourceLang]
    let asr: ASREngine | null = null
    if (s.autoDetect) {
      // Multilingual auto-detect: Deepgram only (Web Speech can't detect language).
      const tok = this.pretoken ?? (await getDeepgramToken().catch(() => null))?.key ?? null
      this.pretoken = null
      if (!tok) {
        useStore.getState().setError('多語言自動偵測需要啟用 Deepgram。')
        return false
      }
      asr = new DeepgramASR('multi', cb, tok, { detectLanguage: true, stream: this.audio?.stream })
    } else if (this.audio) {
      // Tab/mixed audio: the Web Speech API can only listen to the default
      // microphone — it cannot accept a MediaStream — so live captions here
      // require Deepgram. Without it we still record for the post-meeting
      // transcript rather than failing the meeting.
      const tok = await getDeepgramToken().catch(() => null)
      if (!tok?.key) {
        useStore.getState().setStatus('live')
        useStore.getState().setMicReady(true)
        useStore
          .getState()
          .setError('分頁音訊的即時字幕需要 Deepgram；目前未啟用，本場會照常錄音，可於會後產生逐字稿。')
        return true
      }
      asr = new DeepgramASR(src.deepgram, cb, tok.key, { stream: this.audio.stream })
    } else {
      // Prefer Deepgram when available (better quality + diarization); else Web Speech.
      // iOS Safari's Web Speech is unreliable (esp. in installed PWAs), so prefer
      // Deepgram there whenever the backend can mint a token.
      const isIOS =
        /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      const wantDeepgram =
        this.backendOk && (s.asrProvider === 'deepgram' || (s.asrProvider === 'auto' && (s.diarization || isIOS)))
      if (wantDeepgram) {
        const tok = await getDeepgramToken().catch(() => null)
        if (tok?.key) asr = new DeepgramASR(src.deepgram, this.withDeepgramFallback(cb, src.bcp47), tok.key)
      }
      if (!asr) asr = new WebSpeechASR(src.bcp47, cb)
    }
    this.asr = asr
    await asr.start()
    return true
  }

  // Pause recording: stop ASR + the clock (paused time is excluded from the
  // duration) while keeping the room and session alive. Resume restarts ASR.
  pause(): void {
    if (useStore.getState().paused) return
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.flush()
    this.asr?.stop()
    this.asr = null
    this.pauseStart = Date.now()
    recorder.pause()
    useStore.getState().setInterim(null)
    useStore.getState().setPaused(true)
  }

  async resume(): Promise<void> {
    if (!useStore.getState().paused) return
    useStore.getState().addPausedMs(Date.now() - this.pauseStart)
    this.pauseStart = 0
    this.fellBack = false
    useStore.getState().setPaused(false)
    if (!this.timer) this.timer = window.setInterval(() => useStore.getState().tick(), 1000)
    recorder.resume()
    const ok = await this.startAsr()
    if (!ok) useStore.getState().setPaused(true)
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
      onFinal: (text, speaker, lang) => this.handleFinal(text, speaker, lang),
      onError: (msg) => useStore.getState().setError(msg),
      onStart: () => {
        useStore.getState().setStatus('live')
        useStore.getState().setMicReady(true)
      },
    }
  }

  private handleFinal(text: string, speaker: number | null, lang?: string): void {
    const s = useStore.getState().settings
    const chunk = s.translateChunkChars ?? 0
    // Auto-detect keeps each segment separate so its detected language is honored.
    if (s.autoDetect || chunk <= 0) {
      this.emitUtterance(text, speaker, undefined, lang)
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

  private emitUtterance(text: string, speaker: number | null, ts?: number, lang?: string): void {
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

    // Persist an in-progress draft (throttled) so a crash/close mid-meeting
    // doesn't lose the transcript. Cleared on a normal stop().
    const now = Date.now()
    if (now - this.lastDraft > 3000) {
      this.lastDraft = now
      saveDraft(buildMeta(), useStore.getState().utterances)
    }

    if (s.autoDetect) {
      // Auto mode: Chinese stays as-is; everything else is translated to Chinese.
      if (lang && /^zh/i.test(lang)) return
      if (!this.backendOk) return
      translateDetect(text, LANGS.zh.deepl)
        .then((r) => {
          if (/^zh/i.test(r.detectedSource)) return // DeepL says it was Chinese — no translation
          useStore.getState().updateUtterance(u.id, { translation: r.translation })
        })
        .catch(() => {
          /* backend hiccup — leave original visible */
        })
      return
    }

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
    await recorder.stop(meta.title).catch(() => null)
    this.releaseAudio()
    useStore.getState().setRecording(false)
    saveSession(meta, st.utterances)
    clearDraft() // meeting ended cleanly — drop the recovery draft
    const bkey = getBackupKey()
    if (bkey) {
      const blob = exportOne(meta.id)
      if (blob) void pushBackup(bkey, [blob]) // cloud backup (if enabled), non-blocking
    }
    st.resetSession() // clear live state so the next recording starts fresh
    return meta
  }
}

export const engine = new MeetingEngine()
export { genRoomId }
