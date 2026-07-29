// Meeting audio recorder. Writes to IndexedDB continuously (crash-safe) and
// rotates the MediaRecorder every few minutes so every segment is a standalone
// valid media file — required both for seeking and for per-segment upload.
import { putChunk, finishSegment, upsertRecording, type RecordingMeta } from './audiodb'

// Preference order: small compressed formats first; all are accepted by the
// Gemini Files API. Safari/iOS lands on mp4/aac, Chrome/Android on webm/opus.
const MIME_PREFS = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/aac',
  'audio/mpeg',
]

const TIMESLICE_MS = 5_000 // write to IndexedDB this often
const ROTATE_MS = 10 * 60_000 // start a fresh, standalone segment this often

export function supportedMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const m of MIME_PREFS) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m
    } catch {
      /* ignore */
    }
  }
  return null
}

/** All candidate types with support flags — used by the diagnostics page. */
export function mimeSupportMatrix(): { mime: string; ok: boolean }[] {
  if (typeof MediaRecorder === 'undefined') return MIME_PREFS.map((m) => ({ mime: m, ok: false }))
  return MIME_PREFS.map((m) => {
    let ok = false
    try {
      ok = MediaRecorder.isTypeSupported(m)
    } catch {
      ok = false
    }
    return { mime: m, ok }
  })
}

export interface RecorderStatus {
  recording: boolean
  bytes: number
  segments: number
}

export class MeetingRecorder {
  private stream: MediaStream | null = null
  private rec: MediaRecorder | null = null
  private rotateTimer: number | null = null
  private sessionId = ''
  private mime = ''
  private seg = 0
  private chunk = 0
  private bytes = 0
  private t0 = 0
  private segStart = 0
  private stopped = true
  private onUpdate?: (s: RecorderStatus) => void

  get active(): boolean {
    return !this.stopped
  }
  get status(): RecorderStatus {
    return { recording: !this.stopped, bytes: this.bytes, segments: this.seg + (this.stopped ? 0 : 1) }
  }

  /** Start recording. Returns false if unsupported or mic denied. */
  async start(sessionId: string, title: string, onUpdate?: (s: RecorderStatus) => void): Promise<boolean> {
    const mime = supportedMime()
    if (!mime) return false
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      })
    } catch {
      return false
    }
    this.sessionId = sessionId
    this.mime = mime
    this.seg = 0
    this.chunk = 0
    this.bytes = 0
    this.stopped = false
    this.t0 = Date.now()
    this.onUpdate = onUpdate
    await upsertRecording(this.meta(title))
    this.openSegment()
    return true
  }

  private meta(title?: string): RecordingMeta {
    return {
      sessionId: this.sessionId,
      title: title ?? '',
      createdAt: this.t0,
      mime: this.mime,
      segments: this.seg + 1,
      bytes: this.bytes,
      durationMs: Date.now() - this.t0,
    }
  }

  private openSegment(): void {
    if (!this.stream || this.stopped) return
    this.chunk = 0
    this.segStart = Date.now()
    const rec = new MediaRecorder(this.stream, { mimeType: this.mime, audioBitsPerSecond: 48_000 })
    this.rec = rec
    const seg = this.seg
    rec.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return
      this.bytes += e.data.size
      void putChunk(this.sessionId, seg, this.chunk++, e.data)
      this.onUpdate?.(this.status)
    }
    rec.onstop = () => {
      void finishSegment({
        sessionId: this.sessionId,
        seg,
        mime: this.mime,
        startMs: this.segStart - this.t0,
        durationMs: Date.now() - this.segStart,
        bytes: this.bytes,
      })
      void upsertRecording(this.meta())
    }
    rec.start(TIMESLICE_MS)
    this.rotateTimer = window.setTimeout(() => this.rotate(), ROTATE_MS)
  }

  private rotate(): void {
    if (this.stopped || !this.rec) return
    try {
      this.rec.stop()
    } catch {
      /* ignore */
    }
    this.seg++
    this.openSegment()
  }

  private clearTimer(): void {
    if (this.rotateTimer !== null) {
      clearTimeout(this.rotateTimer)
      this.rotateTimer = null
    }
  }

  pause(): void {
    this.clearTimer()
    try {
      if (this.rec && this.rec.state === 'recording') this.rec.pause()
    } catch {
      /* ignore */
    }
  }

  resume(): void {
    try {
      if (this.rec && this.rec.state === 'paused') {
        this.rec.resume()
        this.rotateTimer = window.setTimeout(() => this.rotate(), ROTATE_MS)
      }
    } catch {
      /* ignore */
    }
  }

  /** Stop and finalize. Safe to call when not recording. */
  async stop(title?: string): Promise<RecordingMeta | null> {
    if (this.stopped) return null
    this.stopped = true
    this.clearTimer()
    try {
      if (this.rec && this.rec.state !== 'inactive') this.rec.stop()
    } catch {
      /* ignore */
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.rec = null
    // Let the final ondataavailable/onstop callbacks land before writing meta.
    await new Promise((r) => setTimeout(r, 250))
    const meta = this.meta(title)
    await upsertRecording(meta)
    this.onUpdate?.(this.status)
    return meta
  }
}

export const recorder = new MeetingRecorder()
