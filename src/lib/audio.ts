// Microphone capture via AudioWorklet -> 16kHz mono PCM16 chunks.
// Used by the Deepgram streaming path (linear16 @ 16000).

export interface PCMCapture {
  stop: () => void
  stream: MediaStream
}

const TARGET_RATE = 16000

/** `shared` lets the caller inject an already-acquired stream (mic, tab audio or
 *  a mix). When provided we never stop its tracks — the owner does that. */
export async function startPCMCapture(
  onChunk: (pcm16: ArrayBuffer) => void,
  shared?: MediaStream | null,
): Promise<PCMCapture> {
  const owned = !shared
  const stream =
    shared ??
    (await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    }))

  const AudioCtx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AudioCtx()
  await ctx.resume()
  await ctx.audioWorklet.addModule('/pcm-worklet.js')

  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'pcm-processor')
  const sink = ctx.createGain()
  sink.gain.value = 0 // silent — we only need the graph pulled, no playback

  const ratio = ctx.sampleRate / TARGET_RATE

  node.port.onmessage = (e: MessageEvent) => {
    const f32 = e.data as Float32Array
    const down = ratio > 1 ? downsample(f32, ratio) : f32
    onChunk(floatToPCM16(down))
  }

  source.connect(node)
  node.connect(sink)
  sink.connect(ctx.destination)

  return {
    stream,
    stop() {
      try {
        node.port.onmessage = null
        node.disconnect()
        source.disconnect()
        sink.disconnect()
        if (owned) stream.getTracks().forEach((t) => t.stop())
        void ctx.close()
      } catch {
        /* ignore */
      }
    },
  }
}

function downsample(input: Float32Array, ratio: number): Float32Array {
  const outLen = Math.floor(input.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    // Average the window to reduce aliasing.
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    let count = 0
    for (let j = start; j < end; j++) {
      sum += input[j]
      count++
    }
    out[i] = count > 0 ? sum / count : 0
  }
  return out
}

function floatToPCM16(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out.buffer
}
