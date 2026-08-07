import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getSession,
  getMinutes,
  saveMinutes,
  updateSessionMeta,
  updateUtterances,
  saveSession,
  getBackupKey,
  exportOne,
  keepOriginalTranscript,
  getOriginalTranscript,
  hasOriginalTranscript,
  dropOriginalTranscript,
} from '../lib/history'
import { buildAuthoritativeTranscript, hasRecording, type BuildProgress } from '../lib/authoritative'
import { listSegments, getSegmentBlob, locate, type SegmentMeta } from '../lib/audiodb'
import { requestMinutesFromTranscript, fetchSession, pushBackup } from '../lib/api'
import { useStore } from '../state/store'
import { transcriptText, minutesMarkdown, downloadText } from '../lib/minutes'
import { TopBar } from '../components/TopBar'
import { ChevronLeft, Sparkles, Download, Users, Calendar } from '../components/icons'
import { shortDate, durationLabel, fromMs } from '../lib/format'
import { speakerColor, speakerLabel, targetLabel } from '../lib/langs'
import type { MinutesDoc, SessionMeta, Utterance } from '../lib/types'

function Block({ title, dot, children }: { title: string; dot: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-[13px] font-extrabold text-ink">
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
        {title}
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  )
}

function Bullet() {
  return <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full" style={{ background: 'var(--brand)' }} />
}

const MINUTES_LANGS = [
  { v: 'zh-Hant', label: '繁中' },
  { v: 'zh-Hans', label: '简中' },
  { v: 'en', label: 'EN' },
  { v: 'ja', label: '日本語' },
  { v: 'ko', label: '한국어' },
  { v: 'de', label: 'DE' },
  { v: 'fr', label: 'FR' },
  { v: 'es', label: 'ES' },
]

function LangSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="會議紀錄語言"
      className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[12px] font-bold text-ink"
    >
      {MINUTES_LANGS.map((l) => (
        <option key={l.v} value={l.v}>
          {l.label}
        </option>
      ))}
    </select>
  )
}

export default function Minutes() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const settings = useStore((st) => st.settings)
  const setSettings = useStore((st) => st.setSettings)
  const local = getSession(id)
  const [data, setData] = useState<{ meta: SessionMeta; utterances: Utterance[] } | null>(local)
  const [minutes, setMinutes] = useState<MinutesDoc | null>(() => getMinutes(id))
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!local)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [utts, setUtts] = useState<Utterance[]>([])
  const [names, setNames] = useState<Record<number, string>>({})
  const [audioReady, setAudioReady] = useState(false)
  const [building, setBuilding] = useState<BuildProgress | null>(null)
  const [buildErr, setBuildErr] = useState<string | null>(null)
  const [hasOrig, setHasOrig] = useState(() => hasOriginalTranscript(id))

  const [segments, setSegments] = useState<SegmentMeta[]>([])
  const [clip, setClip] = useState<{ seg: number; url: string } | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    hasRecording(id).then(setAudioReady).catch(() => setAudioReady(false))
    listSegments(id).then(setSegments).catch(() => setSegments([]))
  }, [id])

  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url) }, [clip])

  // Tap a line to hear it: find the segment holding that timestamp, load it,
  // and seek to the offset within that segment.
  async function playAt(u: Utterance) {
    if (!segments.length) return
    const hit = locate(segments, u.ts)
    if (!hit) return
    setPlayingId(u.id)
    let url = clip?.seg === hit.seg.seg ? clip.url : null
    if (!url) {
      const blob = await getSegmentBlob(id, hit.seg.seg, hit.seg.mime)
      if (!blob) return
      if (clip) URL.revokeObjectURL(clip.url)
      url = URL.createObjectURL(blob)
      setClip({ seg: hit.seg.seg, url })
      await new Promise((r) => setTimeout(r, 60)) // let the <audio> pick up the new src
    }
    const el = audioRef.current
    if (!el) return
    if (el.src !== url) el.src = url
    const seek = () => {
      el.currentTime = hit.offsetSec
      void el.play().catch(() => undefined)
    }
    if (el.readyState >= 1) seek()
    else el.addEventListener('loadedmetadata', seek, { once: true })
  }

  // No local copy? Fetch it from the backend (viewer on another device).
  useEffect(() => {
    if (data) return
    let ok = true
    fetchSession(id)
      .then((d) => {
        if (!ok || !d) return
        setData({ meta: d.meta, utterances: d.utterances })
        if (d.minutes) setMinutes(d.minutes)
      })
      .finally(() => {
        if (ok) setLoading(false)
      })
    return () => {
      ok = false
    }
  }, [id, data])

  // Sync editable copies whenever the loaded session changes.
  useEffect(() => {
    if (!data) return
    setTitle(data.meta.title)
    setUtts(data.utterances)
    setNames(data.meta.speakerNames ?? {})
  }, [data])

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-paper">
        <TopBar />
        <div className="mx-auto max-w-md p-10 text-center text-muted">載入中…</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-dvh flex-col bg-paper">
        <TopBar />
        <div className="mx-auto max-w-md p-8 text-center text-muted">
          找不到這場會議的資料。
          <button onClick={() => nav('/')} className="mx-auto mt-3 block font-bold text-brand-ink">
            回首頁
          </button>
        </div>
      </div>
    )
  }

  const meta = data.meta
  const withTr = meta.targetLang !== 'none'
  const label = (sp: number | null) => (sp !== null && names[sp]?.trim() ? names[sp].trim() : speakerLabel(sp))
  const speakers = Array.from(new Set(utts.map((u) => u.speaker).filter((x): x is number => x !== null))).sort((a, b) => a - b)
  const editUtt = (uid: string, patch: Partial<Utterance>) =>
    setUtts((l) => l.map((u) => (u.id === uid ? { ...u, ...patch } : u)))

  const syncBackup = () => {
    const bkey = getBackupKey()
    if (!bkey) return
    const blob = exportOne(id)
    if (blob) void pushBackup(bkey, [blob]) // keep cloud backup current (if enabled)
  }

  function saveEdits() {
    if (!data) return
    const cleanNames: Record<number, string> = {}
    for (const [k, v] of Object.entries(names)) if (v.trim()) cleanNames[Number(k)] = v.trim()
    const newMeta: SessionMeta = { ...data.meta, title: title.trim() || data.meta.title, speakerNames: cleanNames }
    if (getSession(id)) {
      updateSessionMeta(id, { title: newMeta.title, speakerNames: cleanNames })
      updateUtterances(id, utts)
    } else {
      saveSession(newMeta, utts)
    }
    setData({ meta: newMeta, utterances: utts })
    setEditing(false)
    syncBackup()
  }

  // Re-derive the transcript from the recorded audio (higher quality than the
  // live stream: punctuation, Traditional Chinese, no filler, real names).
  async function buildFromAudio() {
    if (!data) return
    setBuilding({ done: 0, total: 1, label: '準備中' })
    setBuildErr(null)
    try {
      const res = await buildAuthoritativeTranscript(
        id,
        { lang: settings.minutesLang, participants: settings.participants, glossary: settings.glossary },
        setBuilding,
      )
      if (!res.utterances.length) throw new Error('辨識結果為空，可能這段錄音沒有語音內容')
      keepOriginalTranscript(id, data.utterances) // keep the live version once
      const merged = { ...names, ...res.speakerNames }
      const newMeta: SessionMeta = { ...data.meta, speakerNames: merged }
      if (getSession(id)) {
        updateUtterances(id, res.utterances)
        updateSessionMeta(id, { speakerNames: merged })
      } else {
        saveSession(newMeta, res.utterances)
      }
      setData({ meta: newMeta, utterances: res.utterances })
      setHasOrig(true)
      syncBackup()
    } catch (e) {
      setBuildErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBuilding(null)
    }
  }

  function revertToLive() {
    const orig = getOriginalTranscript(id)
    if (!orig || !data) return
    updateUtterances(id, orig)
    dropOriginalTranscript(id)
    setData({ meta: data.meta, utterances: orig })
    setHasOrig(false)
    syncBackup()
  }

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const text = transcriptText(utts, withTr)
      const doc = await requestMinutesFromTranscript(text, title || meta.title, settings.minutesLang, {
        participants: settings.participants,
        glossary: settings.glossary,
      })
      saveMinutes(id, doc)
      setMinutes(doc)
      syncBackup()
    } catch {
      setError('生成失敗：需要連上後端與 Gemini 金鑰。')
    } finally {
      setGenerating(false)
    }
  }

  function dl() {
    const name = title || meta.title || '會議紀錄'
    downloadText(`${name}.md`, minutesMarkdown({ ...meta, title: name }, minutes, utts))
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <TopBar />
      <main className="safe-b mx-auto w-full max-w-md flex-1 px-4 pb-10">
        <button onClick={() => nav('/')} className="no-print mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted">
          <ChevronLeft className="h-4 w-4" />
          首頁
        </button>

        <header className="mt-2">
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="會議標題"
              className="w-full rounded-lg border border-line bg-paper px-2 py-1 text-xl font-extrabold text-ink"
            />
          ) : (
            <h1 className="text-xl font-extrabold text-ink">{title || meta.title}</h1>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-faint">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {shortDate(meta.createdAt)}
            </span>
            <span>· {durationLabel(meta.durationSec)}</span>
            {meta.speakers > 0 && (
              <span className="inline-flex items-center gap-1">
                · <Users className="h-3.5 w-3.5" />
                {meta.speakers} 位
              </span>
            )}
            <span>
              · {meta.sourceLang.toUpperCase()} → {targetLabel(meta.targetLang)}
            </span>
          </div>
        </header>

        <section className="mt-5">
          {minutes ? (
            <div className="grid gap-3">
              <div className="rounded-2xl border border-line p-4" style={{ background: 'linear-gradient(130deg,var(--brand-tint),var(--zh-tint))' }}>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-brand-ink">摘要 · AI 生成</div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-body">{minutes.summary}</p>
              </div>
              {minutes.decisions.length > 0 && (
                <Block title="決議事項" dot="var(--s3)">
                  <ul className="grid gap-2">
                    {minutes.decisions.map((d, i) => (
                      <li key={i} className="flex gap-2 text-[13.5px] text-body">
                        <Bullet />
                        {d}
                      </li>
                    ))}
                  </ul>
                </Block>
              )}
              {minutes.actionItems.length > 0 && (
                <Block title="待辦事項" dot="var(--live)">
                  <ul className="grid gap-2">
                    {minutes.actionItems.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13.5px] text-body">
                        <span className="mt-0.5 h-4 w-4 flex-none rounded border-[1.5px] border-brand" />
                        <span>
                          {a.text}
                          {a.owner && (
                            <span className="ml-1 rounded-full px-1.5 text-[10.5px] font-extrabold text-zh-ink" style={{ background: 'var(--zh-tint)' }}>
                              {a.owner}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Block>
              )}
              {minutes.topics.map((t, i) => (
                <Block key={i} title={t.title} dot="var(--brand)">
                  <ul className="grid gap-1.5">
                    {t.points.map((p, j) => (
                      <li key={j} className="flex gap-2 text-[13.5px] text-body">
                        <Bullet />
                        {p}
                      </li>
                    ))}
                  </ul>
                </Block>
              ))}
              <div className="no-print flex items-center gap-2">
                <LangSelect value={settings.minutesLang} onChange={(v) => setSettings({ minutesLang: v })} />
                <button
                  onClick={generate}
                  disabled={generating || utts.length === 0}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface py-2 text-[12.5px] font-bold text-brand-ink disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  {generating ? '重新生成中…' : '重新生成紀錄'}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-5 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-brand-ink" />
              <div className="mt-2 text-sm font-bold text-ink">尚未生成 AI 會議紀錄</div>
              <p className="mt-1 text-[12.5px] text-muted">用 Gemini 把逐字稿整理成摘要、決議與待辦。</p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="text-[12px] text-muted">語言</span>
                <LangSelect value={settings.minutesLang} onChange={(v) => setSettings({ minutesLang: v })} />
              </div>
              <button
                onClick={generate}
                disabled={generating || utts.length === 0}
                className="no-print mt-3 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                {generating ? '生成中…' : '生成 AI 紀錄'}
              </button>
              {error && <p className="mt-2 text-[12px] text-live">{error}</p>}
            </div>
          )}
        </section>

        <div className="no-print mt-5 flex gap-2">
          <button onClick={dl} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface py-2.5 text-[13px] font-bold text-ink">
            <Download className="h-4 w-4" />
            Markdown
          </button>
          <button onClick={() => window.print()} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface py-2.5 text-[13px] font-bold text-ink">
            列印 / PDF
          </button>
        </div>

        {audioReady && (
          <section className="no-print mt-5 rounded-2xl border border-line p-4" style={{ background: 'var(--brand-tint)' }}>
            <div className="flex items-center gap-2">
              <span className="material-symbols-rounded text-brand-ink" style={{ fontSize: 20 }}>
                graphic_eq
              </span>
              <span className="text-[13.5px] font-extrabold text-ink">用錄音產生權威版逐字稿</span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-body">
              交給 Gemini 重聽這場會議的錄音：補標點、去口語贅字、輸出繁體、依與會者名單標出人名。品質高於現場即時字幕。
            </p>
            {building ? (
              <div className="mt-3">
                <div className="text-[12.5px] font-bold text-brand-ink">{building.label}…</div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.round((building.done / Math.max(1, building.total)) * 100)}%`, background: 'var(--brand)' }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-muted">長會議需要一點時間，請保持此頁開啟。</p>
              </div>
            ) : (
              <>
                {/* Re-run knobs: language and participants change the result the
                    most, so they are adjustable right here rather than only in settings. */}
                <div className="mt-3 grid gap-2">
                  <input
                    value={settings.participants}
                    onChange={(e) => setSettings({ participants: e.target.value })}
                    placeholder="與會者（逗號分隔）— 讓 AI 標出真實姓名"
                    className="w-full rounded-lg border border-line bg-paper px-2.5 py-2 text-[12.5px] text-ink placeholder:text-faint"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-muted">輸出語言</span>
                    <LangSelect value={settings.minutesLang} onChange={(v) => setSettings({ minutesLang: v })} />
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={buildFromAudio} className="flex-1 rounded-xl bg-brand py-2.5 text-[13px] font-extrabold text-white">
                    {hasOrig ? '重新產生' : '產生權威版'}
                  </button>
                  {hasOrig && (
                    <button onClick={revertToLive} className="rounded-xl border border-line bg-surface px-3 text-[12.5px] font-bold text-muted">
                      還原即時版
                    </button>
                  )}
                </div>
              </>
            )}
            {buildErr && <p className="mt-2 text-[12px] text-live">產生失敗：{buildErr}</p>}
            {hasOrig && !building && <p className="mt-2 text-[11px] text-faint">目前顯示的是權威版；現場即時版已保留，可隨時還原。</p>}
          </section>
        )}

        <section className="mt-6">
          <div className="no-print mb-2 flex items-center justify-between">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-faint">逐字稿</div>
            {utts.length > 0 && (
              <button
                onClick={() => (editing ? saveEdits() : setEditing(true))}
                className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-bold text-brand-ink"
              >
                {editing ? '完成' : '編輯'}
              </button>
            )}
          </div>

          {editing && speakers.length > 0 && (
            <div className="mb-2 grid gap-2 rounded-xl border border-line bg-surface p-3">
              <div className="text-[11px] font-bold text-faint">發言者名稱</div>
              {speakers.map((sp) => (
                <div key={sp} className="flex items-center gap-2">
                  <span className="h-3 w-3 flex-none rounded-full" style={{ background: speakerColor(sp) }} />
                  <span className="w-16 flex-none text-[12px] text-muted">發言者 {sp + 1}</span>
                  <input
                    value={names[sp] ?? ''}
                    onChange={(e) => setNames((n) => ({ ...n, [sp]: e.target.value }))}
                    placeholder="輸入名字"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1 text-[13px] text-ink placeholder:text-faint"
                  />
                </div>
              ))}
            </div>
          )}

          {segments.length > 0 && (
            <div className="no-print mb-2 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
              <span className="material-symbols-rounded text-brand-ink" style={{ fontSize: 16 }}>
                graphic_eq
              </span>
              <span className="text-[11.5px] text-muted">點時間可播放該段錄音</span>
              <audio ref={audioRef} controls onEnded={() => setPlayingId(null)} className="ml-auto h-8 min-w-0 flex-1" style={{ maxWidth: 190 }} />
            </div>
          )}
          <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4">
            {utts.length === 0 && <div className="text-center text-sm text-faint">沒有逐字稿內容</div>}
            {utts.map((u) => (
              <div key={u.id} className="grid gap-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold text-white" style={{ background: speakerColor(u.speaker) }}>
                    {label(u.speaker)}
                  </span>
                  {segments.length > 0 && !editing ? (
                    <button
                      onClick={() => playAt(u)}
                      className="no-print inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px]"
                      style={
                        playingId === u.id
                          ? { background: 'var(--brand-tint)', color: 'var(--brand-ink)' }
                          : { color: 'var(--faint)' }
                      }
                      aria-label="播放這一句"
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: 13 }}>
                        graphic_eq
                      </span>
                      {fromMs(u.ts)}
                    </button>
                  ) : (
                    <span className="font-mono text-[10px] text-faint">{fromMs(u.ts)}</span>
                  )}
                </div>
                {editing ? (
                  <div className="grid gap-1">
                    <textarea
                      value={u.source}
                      onChange={(e) => editUtt(u.id, { source: e.target.value })}
                      rows={2}
                      className="w-full rounded-lg border border-line bg-paper px-2 py-1 text-[13px] text-ink"
                    />
                    {withTr && (
                      <textarea
                        value={u.translation ?? ''}
                        onChange={(e) => editUtt(u.id, { translation: e.target.value })}
                        rows={2}
                        placeholder="譯文"
                        className="w-full rounded-lg border border-line bg-paper px-2 py-1 text-[13px] text-ink placeholder:text-faint"
                      />
                    )}
                  </div>
                ) : withTr ? (
                  <>
                    <div className="text-[12.5px] text-muted">{u.source}</div>
                    {u.translation && <div className="text-[14px] font-medium text-ink">{u.translation}</div>}
                  </>
                ) : (
                  <div className="text-[14px] text-ink">{u.source}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
