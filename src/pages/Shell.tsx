import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { RecordPane } from './Record'
import { LivePane } from './Home'

// Two modes side by side, swipeable. Record-only is the default (pane 0);
// live captions are one swipe right. Uses CSS scroll-snap so the gesture is
// native-feeling and keeps working with a trackpad or keyboard.
// Navigation lives in a floating capsule at the bottom, thumb-reachable.
const PANES = [
  { key: 'record', label: '錄音', icon: 'mic' },
  { key: 'live', label: '字幕', icon: 'graphic_eq' },
]

export default function Shell() {
  const nav = useNavigate()
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

      <div
        ref={scroller}
        className="flex flex-1 overflow-y-hidden"
        style={{
          overflowX: recording ? 'hidden' : 'auto',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
        }}
      >
        <section className="w-full flex-none overflow-y-auto pb-28" style={{ scrollSnapAlign: 'center' }}>
          <RecordPane onRecordingChange={setRecording} />
        </section>
        <section className="w-full flex-none overflow-y-auto pb-28" style={{ scrollSnapAlign: 'center' }}>
          <LivePane />
        </section>
      </div>

      {/* Floating capsule nav — the app's primary navigation. */}
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(14px,env(safe-area-inset-bottom))]">
        <div
          className="pointer-events-auto flex items-center gap-1 rounded-full p-1.5 backdrop-blur-xl"
          style={{
            background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {PANES.map((p, i) => {
            const active = index === i
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => go(i)}
                disabled={recording && i !== 0}
                className="flex min-w-[74px] flex-col items-center gap-0.5 rounded-full px-4 py-2 transition-colors disabled:opacity-35"
                style={active ? { background: 'var(--brand-tint)', color: 'var(--brand-ink)' } : { color: 'var(--muted)' }}
              >
                <span className="material-symbols-rounded" style={{ fontSize: 22 }}>
                  {p.icon}
                </span>
                <span className="text-[10.5px] font-bold">{p.label}</span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => nav('/import')}
            disabled={recording}
            className="flex min-w-[74px] flex-col items-center gap-0.5 rounded-full px-4 py-2 text-muted transition-colors disabled:opacity-35"
          >
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>
              upload_file
            </span>
            <span className="text-[10.5px] font-bold">匯入</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
