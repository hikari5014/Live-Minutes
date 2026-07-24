import { useEffect, useRef } from 'react'
import type { Interim, Utterance } from '../lib/types'
import { speakerColor, speakerLabel } from '../lib/langs'
import { fromMs } from '../lib/format'

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

function CaptionItem({ u, showTranslation }: { u: Utterance; showTranslation: boolean }) {
  return (
    <div className="grid gap-1.5">
      <SpeakerRow speaker={u.speaker} time={fromMs(u.ts)} />
      {showTranslation ? (
        <>
          <div className="text-[13px] leading-snug text-muted">{u.source}</div>
          <div className="text-[17px] font-semibold leading-snug text-ink">
            {u.translation ?? <span className="text-faint">翻譯中…</span>}
          </div>
        </>
      ) : (
        <div className="text-[17px] font-semibold leading-snug text-ink">{u.source}</div>
      )}
    </div>
  )
}

function InterimItem({ interim }: { interim: Interim }) {
  return (
    <div className="grid gap-1.5 opacity-90">
      <SpeakerRow speaker={interim.speaker} time="正在說…" />
      <div className="text-[17px] font-semibold leading-snug text-brand-ink">
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
}: {
  utterances: Utterance[]
  interim: Interim | null
  showTranslation: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [utterances.length, interim?.source])

  const empty = utterances.length === 0 && !interim?.source

  return (
    <div ref={ref} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
      {empty && (
        <div className="mt-16 text-center text-sm text-faint">
          開始說話，字幕會即時出現在這裡…
        </div>
      )}
      {utterances.map((u) => (
        <CaptionItem key={u.id} u={u} showTranslation={showTranslation} />
      ))}
      {interim?.source && <InterimItem interim={interim} />}
    </div>
  )
}
