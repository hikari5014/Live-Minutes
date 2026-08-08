import { useEffect, useRef } from 'react'

// Real amplitude waveform (voice-memo style): RMS per frame from the analyser,
// scrolling right-to-left. Pauses freeze the trace; rAF stops in the background,
// which is fine — the waveform only matters while the screen is visible.
export function RecordWave({ analyser, paused }: { analyser: AnalyserNode | null; paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const barsRef = useRef<number[]>([])

  useEffect(() => {
    let raf = 0
    const buf = analyser ? new Uint8Array(analyser.fftSize) : null
    const BARS = 96

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const cv = canvasRef.current
      const g = cv?.getContext('2d')
      if (!cv || !g) return
      const dpr = window.devicePixelRatio || 1
      const w = cv.clientWidth
      const h = cv.clientHeight
      if (cv.width !== Math.round(w * dpr)) {
        cv.width = Math.round(w * dpr)
        cv.height = Math.round(h * dpr)
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (analyser && buf && !paused) {
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buf.length)
        const bars = barsRef.current
        bars.push(Math.min(1, rms * 3.2))
        if (bars.length > BARS) bars.shift()
      }

      g.clearRect(0, 0, w, h)
      const css = getComputedStyle(document.documentElement)
      const brand = css.getPropertyValue('--brand').trim() || '#0C8F94'
      const live = css.getPropertyValue('--live').trim() || '#D9363E'
      const faint = css.getPropertyValue('--border-strong').trim() || '#CBD3D9'
      const bars = barsRef.current
      const bw = w / BARS

      if (!bars.length) {
        g.fillStyle = faint
        g.fillRect(0, h / 2 - 1, w, 2)
        return
      }
      for (let i = 0; i < bars.length; i++) {
        const x = w - (bars.length - i) * bw
        const bh = Math.max(3, bars[i] * h * 0.92)
        g.globalAlpha = 0.3 + 0.7 * (i / bars.length)
        g.fillStyle = i === bars.length - 1 && !paused ? live : brand
        g.fillRect(x + 1, (h - bh) / 2, Math.max(2, bw - 2), bh)
      }
      g.globalAlpha = 1
    }

    draw()
    return () => cancelAnimationFrame(raf)
  }, [analyser, paused])

  return <canvas ref={canvasRef} className="h-20 w-full" aria-hidden />
}
