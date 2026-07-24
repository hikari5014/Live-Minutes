// Deepgram streaming ASR (quality + speaker diarization). Activates when the
// backend can mint a short-lived token; otherwise the engine falls back to
// Web Speech. Streams 16kHz linear16 PCM straight to Deepgram over WebSocket.
import type { ASRCallbacks, ASREngine } from './asr'
import { startPCMCapture, type PCMCapture } from './audio'

interface DGWord {
  speaker?: number
}
interface DGMessage {
  type?: string
  is_final?: boolean
  channel?: { alternatives?: { transcript?: string; words?: DGWord[] }[] }
}

export class DeepgramASR implements ASREngine {
  private ws: WebSocket | null = null
  private cap: PCMCapture | null = null

  constructor(
    private lang: string,
    private cb: ASRCallbacks,
    private token: string,
  ) {}

  async start(): Promise<void> {
    const params = new URLSearchParams({
      model: 'nova-2',
      language: this.lang,
      punctuate: 'true',
      interim_results: 'true',
      diarize: 'true',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      endpointing: '300',
    })
    // Short-lived grant tokens authenticate over WS with the "bearer" subprotocol.
    // (The "token" subprotocol is only for long-lived Deepgram API keys.)
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, ['bearer', this.token])
    ws.binaryType = 'arraybuffer'
    this.ws = ws

    ws.onopen = async () => {
      this.cb.onStart?.()
      try {
        this.cap = await startPCMCapture((buf) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(buf)
        })
      } catch (e) {
        this.cb.onError('麥克風擷取失敗：' + String(e))
      }
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
        if (m.is_final) this.cb.onFinal(text, speaker)
        else this.cb.onInterim(text)
      } catch {
        /* ignore */
      }
    }
    ws.onerror = () => this.cb.onError('Deepgram 連線發生問題')
    ws.onclose = () => undefined
  }

  stop(): void {
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
