// In-browser audio conversion. Decodes anything the browser can decode
// (mp3, m4a/aac, wav, ogg/opus, flac, webm, mp4/mov video soundtracks …),
// resamples to the chosen rate, and re-encodes into one self-contained file.
//
// Why this exists: our recorder stores MediaRecorder output, which is built
// for streaming, not for sharing — WebM from MediaRecorder carries no duration
// or seek index (many desktop players refuse it, iPhone can't play WebM at
// all), and a long recording is several independent 10-minute files. Gluing
// those bytes together is NOT a valid file. Decoding to PCM and re-encoding is
// the only way to hand out something every player opens.

export type OutFormat = 'mp3' | 'wav' | 'm4a'

export interface ConvertOpts {
  format: OutFormat
  sampleRate: number // 16000 | 22050 | 44100 | 48000
  channels: 1 | 2
  kbps: number // mp3/m4a bitrate
}

export const PRESETS: { key: string; label: string; hint: string; opts: Omit<ConvertOpts, 'format'> }[] = [
  { key: 'voice', label: '語音', hint: '單聲道 · 檔案最小，會議錄音建議', opts: { sampleRate: 22050, channels: 1, kbps: 64 } },
  { key: 'std', label: '標準', hint: '單聲道 · 清晰', opts: { sampleRate: 44100, channels: 1, kbps: 128 } },
  { key: 'hq', label: '高品質', hint: '立體聲 · 音樂等級', opts: { sampleRate: 44100, channels: 2, kbps: 192 } },
]

export const FORMAT_INFO: Record<OutFormat, { label: string; ext: string; mime: string; hint: string }> = {
  mp3: { label: 'MP3', ext: 'mp3', mime: 'audio/mpeg', hint: '萬用，所有裝置都能播' },
  m4a: { label: 'M4A', ext: 'm4a', mime: 'audio/mp4', hint: 'AAC，iPhone 原生，同音質更小' },
  wav: { label: 'WAV', ext: 'wav', mime: 'audio/wav', hint: '無損未壓縮，檔案很大' },
}

/** File-size estimate in bytes for a given duration. */
export function estimateBytes(sec: number, o: ConvertOpts): number {
  if (o.format === 'wav') return Math.round(sec * o.sampleRate * o.channels * 2 + 44)
  return Math.round((sec * o.kbps * 1000) / 8)
}

// ---------- capability ----------

type AudioEncoderCtor = {
  new (init: { output: (c: unknown, m?: unknown) => void; error: (e: unknown) => void }): {
    configure: (c: unknown) => void
    encode: (d: unknown) => void
    flush: () => Promise<void>
    close: () => void
  }
  isConfigSupported: (c: unknown) => Promise<{ supported?: boolean }>
}
type AudioDataCtor = new (init: {
  format: 'f32-planar'
  sampleRate: number
  numberOfFrames: number
  numberOfChannels: number
  timestamp: number
  data: Float32Array
}) => { close: () => void }

function webcodecs(): { AE: AudioEncoderCtor; AD: AudioDataCtor } | null {
  const w = window as unknown as { AudioEncoder?: AudioEncoderCtor; AudioData?: AudioDataCtor }
  return w.AudioEncoder && w.AudioData ? { AE: w.AudioEncoder, AD: w.AudioData } : null
}

const aacConfig = (o: ConvertOpts) => ({
  codec: 'mp4a.40.2',
  sampleRate: o.sampleRate,
  numberOfChannels: o.channels,
  bitrate: o.kbps * 1000,
})

/** M4A needs a platform AAC encoder via WebCodecs (Chrome on Win/Mac/Android,
 *  recent Safari). Probed, never assumed. */
export async function m4aSupported(o: Omit<ConvertOpts, 'format'> = PRESETS[1].opts): Promise<boolean> {
  const wc = webcodecs()
  if (!wc) return false
  try {
    const r = await wc.AE.isConfigSupported(aacConfig({ ...o, format: 'm4a' }))
    return !!r.supported
  } catch {
    return false
  }
}

// ---------- decode ----------

export class DecodeError extends Error {}

export async function decode(blob: Blob, sampleRate: number): Promise<AudioBuffer> {
  const buf = await blob.arrayBuffer()
  const Ctx: typeof OfflineAudioContext =
    window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext
  const ctx = new Ctx(1, 1, sampleRate)
  try {
    // callback form too, for older Safari
    return await new Promise<AudioBuffer>((resolve, reject) => {
      const p = ctx.decodeAudioData(buf, resolve, reject)
      if (p && typeof p.then === 'function') p.then(resolve, reject)
    })
  } catch {
    throw new DecodeError('瀏覽器無法解碼這個檔案（格式不支援、檔案損毀，或像 WMA／AMR 這類瀏覽器不支援的編碼）')
  }
}

/** Mix an AudioBuffer slice into `channels` output planes. */
export function mixdown(ab: { numberOfChannels: number; getChannelData: (i: number) => Float32Array }, channels: 1 | 2, from: number, to: number): Float32Array[] {
  const n = to - from
  const src = Array.from({ length: ab.numberOfChannels }, (_, i) => ab.getChannelData(i).subarray(from, to))
  if (channels === 1) {
    if (src.length === 1) return [src[0].slice()]
    const out = new Float32Array(n)
    for (const ch of src) for (let i = 0; i < n; i++) out[i] += ch[i] / src.length
    return [out]
  }
  return [src[0].slice(), (src[1] ?? src[0]).slice()]
}

export function floatTo16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length)
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

// ---------- encoders (streaming sinks) ----------

interface Sink {
  push(planes: Float32Array[]): Promise<void> | void
  finish(): Promise<Blob>
}

export function wavHeader(dataBytes: number, sampleRate: number, channels: number): ArrayBuffer {
  const h = new ArrayBuffer(44)
  const v = new DataView(h)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + dataBytes, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, channels, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * channels * 2, true)
  v.setUint16(32, channels * 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, dataBytes, true)
  return h
}

function wavSink(o: ConvertOpts): Sink {
  const parts: Int16Array[] = []
  let bytes = 0
  return {
    push(planes) {
      const n = planes[0].length
      const out = new Int16Array(n * o.channels)
      const p16 = planes.map(floatTo16)
      for (let i = 0; i < n; i++) for (let c = 0; c < o.channels; c++) out[i * o.channels + c] = p16[c][i]
      parts.push(out)
      bytes += out.byteLength
    },
    async finish() {
      return new Blob([wavHeader(bytes, o.sampleRate, o.channels), ...parts.map((p) => p.buffer as ArrayBuffer)], { type: 'audio/wav' })
    },
  }
}

async function mp3Sink(o: ConvertOpts): Promise<Sink> {
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const enc = new Mp3Encoder(o.channels, o.sampleRate, o.kbps)
  const out: Uint8Array[] = []
  const BLOCK = 1152 * 8
  return {
    push(planes) {
      const l = floatTo16(planes[0])
      const r = o.channels === 2 ? floatTo16(planes[1]) : undefined
      for (let i = 0; i < l.length; i += BLOCK) {
        const b = enc.encodeBuffer(l.subarray(i, i + BLOCK), r?.subarray(i, i + BLOCK))
        if (b.length) out.push(b.slice())
      }
    },
    async finish() {
      const tail = enc.flush()
      if (tail.length) out.push(tail.slice())
      return new Blob(out as BlobPart[], { type: 'audio/mpeg' })
    },
  }
}

async function m4aSink(o: ConvertOpts): Promise<Sink> {
  const wc = webcodecs()
  if (!wc || !(await m4aSupported(o))) throw new Error('此瀏覽器不支援 M4A（AAC）編碼，請改選 MP3')
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    audio: { codec: 'aac', numberOfChannels: o.channels, sampleRate: o.sampleRate },
    fastStart: 'in-memory',
  })
  let failure: unknown = null
  const enc = new wc.AE({
    output: (chunk, meta) => muxer.addAudioChunk(chunk as EncodedAudioChunk, meta as EncodedAudioChunkMetadata),
    error: (e) => {
      failure = e
    },
  })
  enc.configure(aacConfig(o))
  let frames = 0
  return {
    push(planes) {
      if (failure) throw failure
      const n = planes[0].length
      const data = new Float32Array(n * o.channels)
      planes.forEach((p, c) => data.set(p, c * n)) // planar layout
      const ad = new wc.AD({
        format: 'f32-planar',
        sampleRate: o.sampleRate,
        numberOfFrames: n,
        numberOfChannels: o.channels,
        timestamp: Math.round((frames / o.sampleRate) * 1e6),
        data,
      })
      enc.encode(ad)
      ad.close()
      frames += n
    },
    async finish() {
      await enc.flush()
      enc.close()
      if (failure) throw failure
      muxer.finalize()
      return new Blob([target.buffer], { type: 'audio/mp4' })
    },
  }
}

async function makeSink(o: ConvertOpts): Promise<Sink> {
  if (o.format === 'wav') return wavSink(o)
  if (o.format === 'm4a') return m4aSink(o)
  return mp3Sink(o)
}

const yieldUI = () => new Promise((r) => setTimeout(r, 0))

/** Convert one or more sources (played back-to-back) into a single file.
 *  Sources are decoded one at a time so a long, multi-segment recording never
 *  holds more than one segment of PCM in memory. */
export async function convert(
  sources: (() => Promise<Blob | null>)[],
  o: ConvertOpts,
  onProgress?: (fraction: number) => void,
): Promise<{ blob: Blob; durationSec: number }> {
  const sink = await makeSink(o)
  let total = 0
  for (let s = 0; s < sources.length; s++) {
    const blob = await sources[s]()
    if (!blob || blob.size === 0) continue
    const ab = await decode(blob, o.sampleRate)
    const STEP = o.sampleRate * 2 // 2 s per push
    let last = performance.now()
    for (let i = 0; i < ab.length; i += STEP) {
      await sink.push(mixdown(ab, o.channels, i, Math.min(ab.length, i + STEP)))
      if (performance.now() - last > 60) {
        onProgress?.((s + i / ab.length) / sources.length)
        await yieldUI()
        last = performance.now()
      }
    }
    total += ab.duration
    onProgress?.((s + 1) / sources.length)
  }
  if (total === 0) throw new DecodeError('沒有可轉換的音訊內容')
  return { blob: await sink.finish(), durationSec: total }
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function baseName(name: string): string {
  return name.replace(/\.[^./\\]+$/, '') || 'audio'
}
