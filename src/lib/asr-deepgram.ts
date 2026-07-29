// Deepgram streaming ASR (quality + speaker diarization + optional language
// detection). One mic capture streams to a reconnecting WebSocket, so brief
// network drops or token hiccups recover automatically instead of ending the
// meeting. Streams 16kHz linear16 PCM straight to Deepgram.
import type { ASRCallbacks, ASREngine } from './asr'
import { startPCMCapture, type PCMCapture } from './audio'

interface DGWord {
  speaker?: number
}
interface DGMessage {
  type?: string
  is_final?: boolean
  detected_language?: string
  channel?: { detected_language?: string; alternatives?: { transcript?: string; words?: DGWord[] }[] }
}

const MAX_RETRIES = 8

export class DeepgramASR implements ASREngine {
  private ws: WebSocket | null = null
  private cap: PCMCapture | null = null
  private stopped = false
  private retries = 0
  private reconnectTimer: number | null = null

  constructor(
    private lang: string,
    private cb: ASRCallbacks,
    private token: string,
    private opts?: { detectLanguage?: boolean; stream?: MediaStream | null },
  ) {}

  private url(): string {
    const params = new URLSearchParams({
      model: 'nova-2',
      punctuate: 'true',
      interim_results: 'true',
      diarize: 'true',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      endpointing: '300',
    })
    // detect_language lets Deepgram auto-identify each segment's language
    // (multilingual meetings); otherwise pin to the chosen source language.
    if (this.opts?.detectLanguage) params.set('detect_language', 'true')
    else params.set('language', this.lang)
    return `wss://api.deepgram.com/v1/listen?${params.toString()}`
  }

  async start(): Promise<void> {
    this.stopped = false
    this.retries = 0
    this.connect(true)
    try {
      // One mic capture for the whole session; it streams to whichever socket
      // is currently open, so it survives reconnects.
      this.cap = await startPCMCapture((buf) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(buf)
      }, this.opts?.stream)
    } catch (e) {
      this.cb.onError('麥克風擷取失敗：' + String(e))
    }
  }

  private connect(first: boolean): void {
    // Short-lived grant tokens authenticate over WS with the "bearer" subprotocol.
    // (The "token" subprotocol is only for long-lived Deepgram API keys.)
    const ws = new WebSocket(this.url(), ['bearer', this.token])
    ws.binaryType = 'arraybuffer'
    this.ws = ws

    ws.onopen = () => {
      this.retries = 0
      if (first) this.cb.onStart?.()
    }
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data as string) as DGMessage
        if (m.type && m.type !== 'Results') return
        const alt = m.channel?.alternatives?.[0]
        const text = alt?.transcript?.trim()
        if (!text) return
        const sp = alt?.words?.[0]?.speaker
        const speaker = typeof sp === 'number' ? sp : null
        if (m.is_final) this.cb.onFinal(text, speaker, m.channel?.detected_language ?? m.detected_language)
        else this.cb.onInterim(text)
      } catch {
        /* ignore */
      }
    }
    ws.onerror = () => {
      /* let onclose drive reconnection */
    }
    ws.onclose = () => {
      if (this.stopped) return
      if (this.retries >= MAX_RETRIES) {
        this.cb.onError('Deepgram 連線中斷，無法重新連線。')
        return
      }
      const delay = Math.min(8000, 500 * 2 ** this.retries)
      this.retries++
      this.reconnectTimer = window.setTimeout(() => this.connect(false), delay)
    }
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.cap?.stop()
    this.cap = null
    try {
      this.ws?.send(JSON.stringify({ type: 'CloseStream' }))
    } catch {
      /* ignore */
    }
    try {
      this.ws?.close()
    } catch {
      /* ignore */
    }
    this.ws = null
  }
}
