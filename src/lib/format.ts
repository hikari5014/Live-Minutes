export function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = Math.max(0, totalSec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function fromMs(ms: number): string {
  return mmss(Math.floor(ms / 1000))
}

export function shortDate(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function durationLabel(sec: number): string {
  if (sec < 60) return `${sec} 秒`
  return `${Math.round(sec / 60)} 分`
}
