// Audio graph for recording: waveform analysis + a keepalive that stops the
// browser suspending us the moment we lose focus.
//
// Two hard-won details:
//  1. The AudioContext MUST be constructed inside the user gesture. Creating it
//     after `await getUserMedia(...)` loses the gesture on iOS and the context
//     comes up suspended — recording still works (MediaRecorder needs no
//     context) but the analyser only ever reads silence, i.e. a flat waveform.
//  2. The analyser branch must reach the destination. Safari does not pull a
//     graph branch that dangles, so `source -> analyser` alone yields no data.
//     Routing it through a zero gain node keeps it pulled and inaudible.

export interface Keepalive {
  analyser: AnalyserNode
  ctx: AudioContext
  suspended: () => boolean
  kick: () => void
  stop: () => void
}

/** Construct synchronously inside the click handler, before any await. */
export function createAudioContext(): AudioContext | null {
  try {
    const Ctx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    const ctx = new Ctx()
    void ctx.resume().catch(() => undefined) // still inside the gesture
    return ctx
  } catch {
    return null
  }
}

export async function attachKeepalive(ctx: AudioContext, stream: MediaStream): Promise<Keepalive> {
  await ctx.resume().catch(() => undefined)

  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.6

  // source -> analyser -> muted gain -> destination (keeps the branch pulled)
  const mute = ctx.createGain()
  mute.gain.value = 0
  source.connect(analyser)
  analyser.connect(mute)
  mute.connect(ctx.destination)

  // Near-silent tone: gives the page an active audio session, which is what
  // keeps a backgrounded tab alive where the platform allows it at all.
  const osc = ctx.createOscillator()
  osc.frequency.value = 30
  const hum = ctx.createGain()
  hum.gain.value = 0.0005
  osc.connect(hum)
  hum.connect(ctx.destination)
  try {
    osc.start()
  } catch {
    /* ignore */
  }

  const kick = () => {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  }
  const timer = window.setInterval(kick, 500)
  document.addEventListener('visibilitychange', kick)
  window.addEventListener('focus', kick)
  document.addEventListener('touchstart', kick, { passive: true })
  document.addEventListener('click', kick)

  return {
    analyser,
    ctx,
    suspended: () => ctx.state === 'suspended',
    kick,
    stop() {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', kick)
      window.removeEventListener('focus', kick)
      document.removeEventListener('touchstart', kick)
      document.removeEventListener('click', kick)
      try {
        osc.stop()
      } catch {
        /* ignore */
      }
      try {
        source.disconnect()
        analyser.disconnect()
        mute.disconnect()
        hum.disconnect()
      } catch {
        /* ignore */
      }
      void ctx.close().catch(() => undefined)
    },
  }
}

/** True where a web page cannot keep the microphone open in the background.
 *  iOS suspends page execution and mutes capture on lock/app-switch for any
 *  web content, installed PWA included — there is no web API to opt out. */
export function backgroundRecordingBlocked(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
