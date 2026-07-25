import { useEffect, useRef } from 'react'
import type { CaptionOrder, Interim, Utterance } from '../lib/types'
import { speakerColor, speakerLabel } from '../lib/langs'
import { fromMs } from '../lib/format'
import { sourcePx, translationPx } from '../lib/display'

function SpeakerRow({ speaker, time }: { speaker: number | null; time: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white"
        style={{ background: speakerColor(speaker) }}
      >
        {speakerLabel(speaker)}
      </span>
      <span className="font-mono text-[10.5px] text-faint">{time}</span>
    </div>
  )
}

function CaptionItem({
  u,
  showTranslation,
  srcPx,
  trPx,
}: {
  u: Utterance
  showTranslation: boolean
  srcPx: number
  trPx: number
}) {
  return (
    <div className="grid gap-1.5">
      <SpeakerRow speaker={u.speaker} time={fromMs(u.ts)} />
      {showTranslation ? (
        <>
          <div className="leading-snug text-muted" style={{ fontSize: srcPx }}>
            {u.source}
          </div>
          <div className="font-semibold leading-snug text-ink" style={{ fontSize: trPx }}>
            {u.translation ?? <span className="text-faint">翻譯中…</span>}
          </div>
        </>
      ) : (
        <div className="font-semibold leading-snug text-ink" style={{ fontSize: trPx }}>
          {u.source}
        </div>
      )}
    </div>
  )
}

function InterimItem({ interim, trPx }: { interim: Interim; trPx: number }) {
  return (
    <div className="grid gap-1.5 opacity-90">
      <SpeakerRow speaker={interim.speaker} time="正在說…" />
      <div className="font-semibold leading-snug text-brand-ink" style={{ fontSize: trPx }}>
        {interim.source}
        <span
          className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-brand"
          style={{ animation: 'blink 1s steps(1) infinite' }}
        />
      </div>
    </div>
  )
}

export function CaptionStream({
  utterances,
  interim,
  showTranslation,
  order = 'newest-bottom',
  fontSource = 2,
  fontTranslation = 2,
  emptyText,
}: {
  utterances: Utterance[]
  interim: Interim | null
  showTranslation: boolean
  order?: CaptionOrder
  fontSource?: number
  fontTranslation?: number
  emptyText?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isTop = order === 'newest-top'

  // Auto-scroll to keep the newest line in view: top edge for newest-top,
  // bottom edge for newest-bottom.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTo({ top: isTop ? 0 : el.scrollHeight, behavior: 'smooth' })
  }, [utterances.length, interim?.source, isTop])

  const empty = utterances.length === 0 && !interim?.source
  const srcPx = sourcePx(fontSource)
  const trPx = translationPx(fontTranslation)
  const items = isTop ? [...utterances].reverse() : utterances

  return (
    <div
      ref={ref}
      className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
      // Leave breathing room at the leading edge so the newest line isn't jammed
      // against the header (top mode) or the control bar (bottom mode).
      style={{
        paddingTop: isTop ? 'clamp(16px,7vh,72px)' : 16,
        paddingBottom: isTop ? 16 : 'clamp(72px,18vh,180px)',
      }}
    >
      {empty && <div className="mt-16 text-center text-sm text-faint">{emptyText ?? '開始說話，字幕會即時出現在這裡…'}</div>}
      {isTop && interim?.source && <InterimItem interim={interim} trPx={trPx} />}
      {items.map((u) => (
        <CaptionItem key={u.id} u={u} showTranslation={showTranslation} srcPx={srcPx} trPx={trPx} />
      ))}
      {!isTop && interim?.source && <InterimItem interim={interim} trPx={trPx} />}
    </div>
  )
}
