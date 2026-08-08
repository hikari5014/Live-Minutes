// Background-recording keepalive. iOS suspends a page when the screen locks or
// the user switches apps — UNLESS it has an active audio session. With the mic
// open AND a (near-silent) output playing, the page enters the record+playback
// audio category and keeps running in the background on iOS; Android keeps
// capture alive regardless. One AudioContext for everything (two contexts is a
// known iOS freeze), a resume watchdog, and the analyser for the waveform all
// live here.
export interface Keepalive {
  analyser: AnalyserNode
  stop: () => void
}

export async function startKeepalive(stream: MediaStream): Promise<Keepalive> {
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  await ctx.resume().catch(() => undefined)

  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.7
  source.connect(analyser) // analyser only — never to destination (feedback)

  // Inaudible output that keeps the audio session "playing".
  const osc = ctx.createOscillator()
  osc.frequency.value = 25
  const gain = ctx.createGain()
  gain.gain.value = 0.0004
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()

  const kick = () => {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  }
  const timer = window.setInterval(kick, 1000)
  document.addEventListener('visibilitychange', kick)

  return {
    analyser,
    stop() {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', kick)
      try {
        osc.stop()
      } catch {
        /* ignore */
      }
      try {
        source.disconnect()
        gain.disconnect()
      } catch {
        /* ignore */
      }
      void ctx.close().catch(() => undefined)
    },
  }
}
