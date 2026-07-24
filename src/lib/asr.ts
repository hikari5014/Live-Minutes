// ASR abstraction. Two implementations share one interface so the provider
// is swappable: Web Speech API (free, no backend) and Deepgram (via room).

export interface ASRCallbacks {
  onInterim: (text: string) => void
  onFinal: (text: string, speaker: number | null) => void
  onError: (message: string) => void
  onStart?: () => void
}

export interface ASREngine {
  start: () => Promise<void>
  stop: () => void
}

// ---- Web Speech API implementation ----

type SRAlternative = { transcript: string; confidence: number }
type SRResult = { isFinal: boolean; length: number; 0: SRAlternative }
interface SRResultList {
  length: number
  [index: number]: SRResult
}
interface SREvent {
  resultIndex: number
  results: SRResultList
}
interface SRInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type SRCtor = new () => SRInstance

function getSRCtor(): SRCtor | null {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function webSpeechSupported(): boolean {
  return getSRCtor() !== null
}

export class WebSpeechASR implements ASREngine {
  private rec: SRInstance | null = null
  private running = false

  constructor(
    private lang: string,
    private cb: ASRCallbacks,
  ) {}

  async start(): Promise<void> {
    const Ctor = getSRCtor()
    if (!Ctor) {
      this.cb.onError('此瀏覽器不支援語音辨識（Web Speech API）')
      return
    }
    this.running = true
    const rec = new Ctor()
    rec.lang = this.lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (e: SREvent) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const text = r[0].transcript
        if (r.isFinal) {
          const trimmed = text.trim()
          if (trimmed) this.cb.onFinal(trimmed, null)
        } else {
          interim += text
        }
      }
      this.cb.onInterim(interim.trim())
    }
    rec.onerror = (ev: { error: string }) => {
      // 'no-speech' / 'aborted' are benign; keep going.
      if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
        this.cb.onError(mapSpeechError(ev.error))
      }
    }
    rec.onend = () => {
      // Web Speech stops on silence — restart while recording.
      if (this.running) {
        try {
          rec.start()
        } catch {
          /* will retry on next end */
        }
      }
    }

    this.rec = rec
    try {
      rec.start()
      this.cb.onStart?.()
    } catch (err) {
      this.cb.onError('無法啟動語音辨識：' + String(err))
    }
  }

  stop(): void {
    this.running = false
    if (this.rec) {
      this.rec.onend = null
      try {
        this.rec.stop()
      } catch {
        /* ignore */
      }
      this.rec = null
    }
  }
}

function mapSpeechError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '麥克風權限被拒絕，請於瀏覽器設定允許後重試。'
    case 'audio-capture':
      return '找不到麥克風，請確認裝置麥克風可用。'
    case 'network':
      return '語音辨識服務連線失敗（網路問題）。'
    default:
      return '語音辨識發生錯誤：' + code
  }
}
