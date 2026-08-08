import { useEffect, useRef, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { RecordPane } from './Record'
import { LivePane } from './Home'

// Two modes side by side, swipeable. Record-only is the default (pane 0);
// live captions are one swipe right. Uses CSS scroll-snap so the gesture is
// native-feeling and keeps working with a trackpad or keyboard.
const PANES = [
  { key: 'record', label: '純錄音', icon: 'mic' },
  { key: 'live', label: '即時字幕', icon: 'graphic_eq' },
]

export default function Shell() {
  const scroller = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [recording, setRecording] = useState(false)

  function go(i: number) {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
    setIndex(i)
  }

  // Track which pane is showing so the tabs stay in sync with a manual swipe.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const w = el.clientWidth || 1
        setIndex(Math.round(el.scrollLeft / w))
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  // Snap back to the recorder if a recording starts, and hold there: swiping
  // away mid-recording is never what the user means.
  useEffect(() => {
    if (recording) go(0)
  }, [recording])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      <TopBar />

      <div className="mx-auto w-full max-w-md flex-none px-4 pt-3">
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {PANES.map((p, i) => {
            const active = index === i
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => go(i)}
                disabled={recording && i !== 0}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-bold transition-colors disabled:opacity-40"
                style={active ? { background: 'var(--brand)', color: '#fff' } : { color: 'var(--muted)' }}
              >
                <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
                  {p.icon}
                </span>
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      <div
        ref={scroller}
        className="flex flex-1 overflow-y-hidden"
        style={{
          overflowX: recording ? 'hidden' : 'auto',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
        }}
      >
        <section className="w-full flex-none overflow-y-auto" style={{ scrollSnapAlign: 'center' }}>
          <RecordPane onRecordingChange={setRecording} />
        </section>
        <section className="w-full flex-none overflow-y-auto" style={{ scrollSnapAlign: 'center' }}>
          <LivePane />
        </section>
      </div>
    </div>
  )
}
