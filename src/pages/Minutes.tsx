import { useEffect, useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSession, getMinutes, saveMinutes, updateSessionMeta, updateUtterances, saveSession } from '../lib/history'
import { requestMinutesFromTranscript, fetchSession } from '../lib/api'
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

export default function Minutes() {
  const { id = '' } = useParams()
  const nav = useNavigate()
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
  }

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const text = transcriptText(utts, withTr)
      const doc = await requestMinutesFromTranscript(text, title || meta.title, 'zh-Hant')
      saveMinutes(id, doc)
      setMinutes(doc)
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
              <button
                onClick={generate}
                disabled={generating || utts.length === 0}
                className="no-print inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface py-2 text-[12.5px] font-bold text-brand-ink disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                {generating ? '重新生成中…' : '重新生成紀錄'}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-5 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-brand-ink" />
              <div className="mt-2 text-sm font-bold text-ink">尚未生成 AI 會議紀錄</div>
              <p className="mt-1 text-[12.5px] text-muted">用 Gemini 把逐字稿整理成摘要、決議與待辦。</p>
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

          <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4">
            {utts.length === 0 && <div className="text-center text-sm text-faint">沒有逐字稿內容</div>}
            {utts.map((u) => (
              <div key={u.id} className="grid gap-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold text-white" style={{ background: speakerColor(u.speaker) }}>
                    {label(u.speaker)}
                  </span>
                  <span className="font-mono text-[10px] text-faint">{fromMs(u.ts)}</span>
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
