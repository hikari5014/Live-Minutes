import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { joinAsViewer, type ViewerRoom } from '../lib/room'
import { CaptionStream } from '../components/Captions'
import { BrandMark } from '../components/TopBar'
import { Select } from '../components/Select'
import { Users, Sun, Moon } from '../components/icons'
import { LANG_LIST } from '../lib/langs'
import { currentTheme, toggleTheme } from '../lib/theme'
import { useStore } from '../state/store'
import { t, uiLang, detectTargetLang } from '../lib/i18n'
import type { Interim, TargetLang, Utterance } from '../lib/types'

interface RoomMeta {
  title: string
  status: string
  viewers: number
}

export default function RoomView() {
  const { id = '' } = useParams()
  const settings = useStore((s) => s.settings)
  const [utterances, setUtterances] = useState<Utterance[]>([])
  const [interim, setInterim] = useState<Interim | null>(null)
  const [meta, setMeta] = useState<RoomMeta>({ title: '會議', status: 'connecting', viewers: 0 })
  const [lang, setLang] = useState<TargetLang>(() => detectTargetLang())
  const [error, setError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)
  const [dark, setDark] = useState(currentTheme() === 'dark')
  const roomRef = useRef<ViewerRoom | null>(null)

  useEffect(() => {
    const room = joinAsViewer(id, detectTargetLang(), {
      onCaption: (u) =>
        setUtterances((prev) => (prev.some((x) => x.id === u.id) ? prev.map((x) => (x.id === u.id ? u : x)) : [...prev, u])),
      onInterim: setInterim,
      onSync: (list, m) => {
        setUtterances(list)
        setMeta(m)
        setError(null)
        if (m.status === 'ended') setEnded(true)
      },
      onMeta: (m) => {
        setMeta(m)
        if (m.status === 'ended') setEnded(true)
      },
      onEnded: () => setEnded(true),
      onError: (msg) => setError(msg),
    })
    roomRef.current = room
    return () => room.close()
  }, [id])

  function changeLang(v: string) {
    const t = v as TargetLang
    setLang(t)
    roomRef.current?.setLang(t)
  }

  const showTranslation = lang !== 'none'
  const ui = uiLang(lang)

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <div
        className="safe-t sticky top-0 z-20 border-b border-line backdrop-blur"
        style={{ background: 'color-mix(in srgb, var(--paper) 85%, transparent)' }}
      >
        <div className="mx-auto flex max-w-md items-center gap-2.5 px-4 py-2.5">
          <BrandMark size={24} />
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold text-ink">{meta.title}</div>
            <div className="text-[11px] text-faint">{ended ? t(ui, 'ended') : error ? t(ui, 'connError') : t(ui, 'watching')}</div>
          </div>
          {meta.viewers > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-muted">
              <Users className="h-4 w-4" />
              {meta.viewers}
            </span>
          )}
          <button
            onClick={() => setDark(toggleTheme() === 'dark')}
            aria-label="切換主題"
            className={`grid h-8 w-8 place-items-center rounded-lg border border-line-strong bg-surface text-ink ${meta.viewers > 0 ? 'ml-2' : 'ml-auto'}`}
          >
            {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>
        <div className="mx-auto max-w-md px-4 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-faint">{t(ui, 'subtitleLang')}</span>
            <Select value={lang} onChange={changeLang} ariaLabel={t(ui, 'subtitleLang')}>
              <option value="none">{t(ui, 'original')}</option>
              {LANG_LIST.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {error && !ended && (
        <div className="mx-auto w-full max-w-md px-4 pt-3">
          <div
            className="rounded-xl border border-line px-3 py-2 text-[13px]"
            style={{ borderLeft: '4px solid var(--warn)', background: 'var(--warn-tint)', color: 'var(--warn)' }}
          >
            {t(ui, 'connError')}
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
        <CaptionStream
          utterances={utterances}
          interim={interim}
          showTranslation={showTranslation}
          order={settings.captionOrder}
          fontSource={settings.fontSource}
          fontTranslation={settings.fontTranslation}
          emptyText={t(ui, 'empty')}
        />
      </div>

      {ended && (
        <div className="safe-b mx-auto w-full max-w-md px-4 pb-6">
          <Link
            to={`/minutes/${id}`}
            className="flex items-center justify-center rounded-xl bg-brand py-3 text-sm font-extrabold text-white"
          >
            {t(ui, 'viewMinutes')}
          </Link>
        </div>
      )}
    </div>
  )
}
